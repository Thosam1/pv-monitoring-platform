"""Performance ratio calculation tools.

Provides tools for calculating system efficiency and performance ratios.
"""

from typing import Annotated
import math

import pandas as pd
from pydantic import Field

from config import settings
from database import engine
from models.context import (
    build_next_step,
    build_performance_insight,
    ColorScheme,
    ContextEnvelope,
    DisplayMode,
    InsightSeverity,
    NextStepPriority,
    UIComponentHint,
    UISuggestion,
)
from models.enums import DataStatus
from models.responses import PerformanceReportResponse, PerformanceMetrics, AvailableRange
from queries.builders import build_peak_power_query, build_performance_query


def calculate_performance_ratio(
    logger_id: Annotated[str, Field(description="Logger/inverter serial number")],
    date: Annotated[str, Field(description="Date in YYYY-MM-DD format")],
    capacity_kw: Annotated[
        float | None,
        Field(description="Override system capacity in kW (optional, auto-inferred if not provided)"),
    ] = None,
) -> dict:
    """Calculate the Performance Ratio (efficiency) for a system on a given date.

    Compares actual output to theoretical maximum based on irradiance.

    Args:
        logger_id: Logger/inverter serial number
        date: Date in YYYY-MM-DD format
        capacity_kw: Optional override for system capacity in kW

    Returns:
        PerformanceReportResponse with efficiency metrics
    """
    # Step 1: Infer capacity from historical peak if not provided
    if capacity_kw is None:
        peak_query = build_peak_power_query()
        peak_df = pd.read_sql(peak_query, engine, params={"logger_id": logger_id})

        if peak_df.empty or pd.isna(peak_df["peakWatts"].iloc[0]):
            return PerformanceReportResponse(
                loggerId=logger_id,
                date=date,
                message="Cannot infer system capacity - no power data found",
            ).model_dump()

        peak_watts = peak_df["peakWatts"].iloc[0]
        # Round up to nearest 0.5 kW
        capacity_kw = math.ceil(peak_watts / 500) * 0.5

    # Step 2: Get data for the specified date
    query = build_performance_query()
    df = pd.read_sql(query, engine, params={"logger_id": logger_id, "date": date})

    if df.empty:
        # Smart recovery: query for actual data range
        range_query = """
            SELECT MIN("timestamp")::date as min_date, MAX("timestamp")::date as max_date
            FROM measurements
            WHERE "loggerId" = :logger_id
        """
        range_df = pd.read_sql(range_query, engine, params={"logger_id": logger_id})

        if range_df.empty or pd.isna(range_df.iloc[0]["min_date"]):
            # Truly no data - still return availableRange for consistency
            return PerformanceReportResponse(
                loggerId=logger_id,
                date=date,
                inferredCapacityKw=capacity_kw,
                status=DataStatus.NO_DATA,
                availableRange=AvailableRange(start=None, end=None),
                message="No data exists for this logger. Verify the logger ID is correct.",
            ).model_dump()

        min_date = str(range_df.iloc[0]["min_date"])
        max_date = str(range_df.iloc[0]["max_date"])

        return PerformanceReportResponse(
            loggerId=logger_id,
            date=date,
            inferredCapacityKw=capacity_kw,
            status=DataStatus.NO_DATA_IN_WINDOW,
            availableRange=AvailableRange(start=min_date, end=max_date),
            message=f"No data for {date}. Data exists from {min_date} to {max_date}.",
        ).model_dump()

    # Step 3: Calculate Performance Ratio
    # PR = (Actual Output) / (Irradiance * Capacity * Reference Efficiency)
    reference_efficiency = settings.reference_panel_efficiency

    # Calculate for each timestamp
    df["theoreticalWatts"] = df["activePowerWatts"] = df["activePowerWatts"].astype(float)
    df["irradiance"] = df["irradiance"].astype(float)
    df["theoreticalWatts"] = df["irradiance"] * capacity_kw * reference_efficiency * 10
    df["ratio"] = df["activePowerWatts"] / df["theoreticalWatts"]
    df["ratio"] = df["ratio"].clip(0, settings.max_performance_ratio)

    avg_power = df["activePowerWatts"].mean()
    avg_irradiance = df["irradiance"].mean()
    peak_power = df["activePowerWatts"].max()

    # Overall PR as percentage
    pr_percent = df["ratio"].mean() * 100

    # Classify status
    if pr_percent >= 80:
        status = "normal"
        interpretation = (
            f"Your system is operating at {pr_percent:.0f}% efficiency (Normal: 80-100%)"
        )
    elif pr_percent >= 60:
        status = "low"
        interpretation = f"Your system is operating at {pr_percent:.0f}% efficiency (Below optimal - consider inspection)"
    else:
        status = "critical"
        interpretation = f"Your system is operating at {pr_percent:.0f}% efficiency (Critical - immediate attention needed)"

    metrics = PerformanceMetrics(
        avgPowerWatts=round(avg_power, 1),
        peakPowerWatts=round(peak_power, 1),
        avgIrradiance=round(avg_irradiance, 1),
        dataPoints=len(df),
    )

    # Build user-friendly context
    context = _build_performance_context(
        logger_id=logger_id,
        date=date,
        pr_percent=pr_percent,
        status=status,
        avg_power=avg_power,
        peak_power=peak_power,
        avg_irradiance=avg_irradiance,
        capacity_kw=capacity_kw,
    )

    return PerformanceReportResponse(
        loggerId=logger_id,
        date=date,
        inferredCapacityKw=capacity_kw,
        performanceRatio=round(pr_percent, 1),
        status=status,
        metrics=metrics,
        interpretation=interpretation,
        context=context,
    ).model_dump()


def _build_performance_context(
    logger_id: str,
    date: str,
    pr_percent: float,
    status: str,
    avg_power: float,
    peak_power: float,
    avg_irradiance: float,
    capacity_kw: float,
) -> ContextEnvelope:
    """Build user-friendly context for performance report response."""
    # Build summary based on performance status
    if status == "normal":
        summary = (
            f"Great news! Your system is running at {pr_percent:.0f}% efficiency on {date}. "
            f"This is within the healthy range (80-100%), meaning your panels are converting "
            f"sunlight into electricity effectively."
        )
    elif status == "low":
        summary = (
            f"Your system operated at {pr_percent:.0f}% efficiency on {date}, which is below optimal. "
            f"This could be due to shading, dirty panels, or equipment issues. "
            f"A professional inspection might help identify the cause."
        )
    else:  # critical
        summary = (
            f"Attention needed: Your system only achieved {pr_percent:.0f}% efficiency on {date}. "
            f"This is significantly below normal and suggests a problem that should be investigated."
        )

    # Build insights
    insights = []

    # Efficiency insight
    severity = (
        InsightSeverity.INFO if status == "normal"
        else InsightSeverity.WARNING if status == "low"
        else InsightSeverity.CRITICAL
    )
    benchmark = "80-100% typical" if status == "normal" else "80% is healthy"
    insights.append(
        build_performance_insight(
            title=f"{'Good' if status == 'normal' else 'Low' if status == 'low' else 'Critical'} efficiency",
            description=f"Performance ratio of {pr_percent:.0f}% measures how well your system converts available sunlight.",
            metric=f"{pr_percent:.0f}%",
            benchmark=benchmark,
            severity=severity,
        )
    )

    # Power output insight
    if peak_power > 0:
        capacity_utilization = (peak_power / (capacity_kw * 1000)) * 100 if capacity_kw else 0
        insights.append(
            build_performance_insight(
                title="Peak output",
                description=f"Your system reached {peak_power:.0f}W peak, using {capacity_utilization:.0f}% of its {capacity_kw:.1f}kW capacity.",
                metric=f"{peak_power:.0f} W",
                benchmark=f"{capacity_kw:.1f} kW capacity",
            )
        )

    # Irradiance insight
    if avg_irradiance > 0:
        irr_quality = (
            "excellent" if avg_irradiance > 700
            else "good" if avg_irradiance > 400
            else "moderate" if avg_irradiance > 200
            else "limited"
        )
        insights.append(
            build_performance_insight(
                title=f"{irr_quality.capitalize()} sunlight conditions",
                description=f"Average irradiance of {avg_irradiance:.0f} W/m² throughout the day.",
                metric=f"{avg_irradiance:.0f} W/m²",
            )
        )

    # Build next steps
    next_steps = []

    if status != "normal":
        next_steps.append(
            build_next_step(
                action="Check for system issues",
                reason=f"Efficiency is {'below optimal' if status == 'low' else 'critically low'}",
                priority=NextStepPriority.URGENT if status == "critical" else NextStepPriority.RECOMMENDED,
                tool_hint="analyze_inverter_health",
                params={"logger_id": logger_id, "days": 7},
            )
        )
        next_steps.append(
            build_next_step(
                action="Look for error codes",
                reason="May explain the efficiency drop",
                priority=NextStepPriority.RECOMMENDED,
                tool_hint="diagnose_error_codes",
                params={"logger_id": logger_id, "days": 7},
            )
        )
    else:
        next_steps.append(
            build_next_step(
                action="View production patterns",
                reason="See your power curve for this day",
                priority=NextStepPriority.SUGGESTED,
                tool_hint="get_power_curve",
                params={"logger_id": logger_id, "date": date},
            )
        )
        next_steps.append(
            build_next_step(
                action="Calculate your savings",
                reason="See the financial benefit of this production",
                priority=NextStepPriority.SUGGESTED,
                tool_hint="calculate_financial_savings",
                params={"logger_id": logger_id},
            )
        )

    next_steps.append(
        build_next_step(
            action="Compare with other inverters",
            reason="See if others perform similarly",
            priority=NextStepPriority.OPTIONAL,
            tool_hint="compare_loggers",
            params={"date": date},
        )
    )

    # Build UI suggestion
    color_scheme = (
        ColorScheme.SUCCESS if status == "normal"
        else ColorScheme.DANGER if status == "critical"
        else ColorScheme.WARNING
    )

    ui_suggestion = UISuggestion(
        preferred_component=UIComponentHint.METRIC_CARD,
        display_mode=DisplayMode.DETAILED,
        highlight_metric="performanceRatio",
        color_scheme=color_scheme,
    )

    return ContextEnvelope(
        summary=summary,
        insights=insights[:3],
        next_steps=next_steps[:3],
        ui_suggestion=ui_suggestion,
        alert=f"System efficiency at {pr_percent:.0f}% - investigation needed" if status == "critical" else None,
    )
