"""Logger comparison tools.

Provides tools for comparing multiple loggers on specific metrics.
"""

from typing import Annotated

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
from models.responses import ComparisonResponse, AvailableRange
from queries.builders import build_comparison_query


def compare_loggers(
    logger_ids: Annotated[list[str], Field(description="List of logger IDs to compare (2-5)")],
    metric: Annotated[
        str, Field(description="Metric to compare: 'power', 'energy', or 'irradiance'")
    ] = "power",
    date: Annotated[str | None, Field(description="Date in YYYY-MM-DD format (optional)")] = None,
) -> dict:
    """Compare multiple loggers on a specific metric for a given date.

    Returns merged timeseries data suitable for multi-line charts.

    Args:
        logger_ids: List of logger IDs to compare (2-5)
        metric: Metric to compare ('power', 'energy', 'irradiance')
        date: Optional date filter in YYYY-MM-DD format

    Returns:
        ComparisonResponse with merged timeseries data
    """
    if len(logger_ids) < 2 or len(logger_ids) > 5:
        return {"type": "error", "message": "Provide 2-5 logger IDs for comparison"}

    query = build_comparison_query(metric, include_date_filter=date is not None)
    params: dict = {"logger_ids": logger_ids}
    if date:
        params["date"] = date

    df = pd.read_sql(query, engine, params=params)

    if df.empty:
        # Smart recovery: query for actual data range across all requested loggers
        range_query = """
            SELECT MIN("timestamp")::date as min_date, MAX("timestamp")::date as max_date
            FROM measurements
            WHERE "loggerId" = ANY(:logger_ids)
        """
        range_df = pd.read_sql(range_query, engine, params={"logger_ids": logger_ids})

        if range_df.empty or pd.isna(range_df.iloc[0]["min_date"]):
            # Truly no data - still return availableRange for consistency
            return ComparisonResponse(
                metric=metric,
                loggerIds=logger_ids,
                date=date,
                data=[],
                status=DataStatus.NO_DATA,
                availableRange=AvailableRange(start=None, end=None),
                message="No data exists for these loggers. Verify the logger IDs are correct.",
            ).model_dump()

        min_date = str(range_df.iloc[0]["min_date"])
        max_date = str(range_df.iloc[0]["max_date"])

        return ComparisonResponse(
            metric=metric,
            loggerIds=logger_ids,
            date=date,
            data=[],
            status=DataStatus.NO_DATA_IN_WINDOW,
            availableRange=AvailableRange(start=min_date, end=max_date),
            message=f"No data for {date}. Data exists from {min_date} to {max_date}.",
        ).model_dump()

    # Pivot to get each logger as a column
    df["timestamp"] = pd.to_datetime(df["timestamp"])
    pivot = df.pivot_table(index="timestamp", columns="loggerId", values="value", aggfunc="mean")
    pivot = pivot.reset_index()

    # Downsample if too many points for performance
    if len(pivot) > settings.comparison_max_points:
        pivot = pivot.set_index("timestamp").resample(settings.resample_interval).mean().reset_index()

    # Convert to list of dicts with timestamp + each logger's value
    data = []
    for _, row in pivot.iterrows():
        point: dict = {"timestamp": row["timestamp"].isoformat()}
        for lid in logger_ids:
            if lid in pivot.columns:
                val = row.get(lid)
                point[lid] = float(val) if pd.notna(val) else None
        data.append(point)

    # Calculate stats for context
    logger_stats = {}
    for lid in logger_ids:
        if lid in pivot.columns:
            col = pivot[lid].dropna()
            if not col.empty:
                logger_stats[lid] = {
                    "avg": col.mean(),
                    "peak": col.max(),
                    "min": col.min(),
                }

    # Build user-friendly context
    context = _build_comparison_context(
        logger_ids=logger_ids,
        metric=metric,
        date=date,
        logger_stats=logger_stats,
        record_count=len(data),
    )

    return ComparisonResponse(
        metric=metric,
        loggerIds=logger_ids,
        date=date,
        recordCount=len(data),
        data=data,
        context=context,
    ).model_dump()


def _build_comparison_context(
    logger_ids: list[str],
    metric: str,
    date: str | None,
    logger_stats: dict,
    record_count: int,
) -> ContextEnvelope:
    """Build user-friendly context for comparison response."""
    metric_labels = {
        "power": ("power output", "W", "kW"),
        "energy": ("energy production", "kWh", "kWh"),
        "irradiance": ("sunlight levels", "W/m²", "W/m²"),
    }
    metric_name, unit, display_unit = metric_labels.get(metric, (metric, "", ""))

    # Find best and worst performers
    best_logger = None
    worst_logger = None
    best_value = float("-inf")
    worst_value = float("inf")

    for lid, stats in logger_stats.items():
        avg = stats.get("avg", 0)
        if avg > best_value:
            best_value = avg
            best_logger = lid
        if avg < worst_value:
            worst_value = avg
            worst_logger = lid

    # Calculate spread
    spread_percent = 0
    if best_value > 0 and worst_value < float("inf"):
        spread_percent = ((best_value - worst_value) / best_value) * 100

    # Build summary
    date_str = f"on {date}" if date else "over the selected period"
    if len(logger_stats) >= 2 and best_logger and worst_logger:
        if spread_percent < 10:
            summary = (
                f"Your inverters are performing consistently {date_str}! "
                f"All {len(logger_ids)} units show similar {metric_name}, with only {spread_percent:.0f}% variation."
            )
        elif spread_percent < 30:
            summary = (
                f"Comparing {len(logger_ids)} inverters {date_str}: "
                f"{best_logger} leads with the highest {metric_name}, while {worst_logger} trails at {spread_percent:.0f}% lower."
            )
        else:
            summary = (
                f"There's a significant difference between your inverters {date_str}. "
                f"{best_logger} is your best performer, outproducing {worst_logger} by {spread_percent:.0f}%."
            )
    else:
        summary = f"Comparing {metric_name} for {len(logger_ids)} inverters {date_str}."

    # Build insights
    insights = []

    # Best performer insight
    if best_logger and best_logger in logger_stats:
        best_stats = logger_stats[best_logger]
        peak_display = best_stats["peak"] / 1000 if metric == "power" and best_stats["peak"] > 1000 else best_stats["peak"]
        insights.append(
            build_performance_insight(
                title=f"Top performer: {best_logger}",
                description=f"Highest average {metric_name} with peak of {peak_display:.1f} {display_unit}.",
                metric=f"{best_stats['avg']:.1f} {unit} avg",
            )
        )

    # Worst performer insight (only if significant difference)
    if worst_logger and worst_logger != best_logger and spread_percent > 15:
        severity = InsightSeverity.WARNING if spread_percent > 30 else InsightSeverity.INFO
        insights.append(
            build_performance_insight(
                title=f"Underperformer: {worst_logger}",
                description=f"Averaging {spread_percent:.0f}% less than the best performer.",
                metric=f"{logger_stats[worst_logger]['avg']:.1f} {unit} avg",
                benchmark=f"vs {best_value:.1f} {unit}",
                severity=severity,
            )
        )

    # Consistency insight
    if spread_percent < 10 and len(logger_stats) >= 2:
        insights.append(
            build_performance_insight(
                title="Consistent fleet performance",
                description="All inverters are performing within a tight range - a sign of a healthy system.",
                metric=f"<{spread_percent:.0f}% spread",
            )
        )

    # Build next steps
    next_steps = []

    if worst_logger and spread_percent > 20:
        next_steps.append(
            build_next_step(
                action=f"Investigate {worst_logger}",
                reason=f"Performing {spread_percent:.0f}% below the top unit",
                priority=NextStepPriority.RECOMMENDED if spread_percent > 30 else NextStepPriority.SUGGESTED,
                tool_hint="analyze_inverter_health",
                params={"logger_id": worst_logger, "days": 7},
            )
        )

    if best_logger:
        next_steps.append(
            build_next_step(
                action=f"View {best_logger} power curve",
                reason="See the production pattern of your best performer",
                priority=NextStepPriority.SUGGESTED,
                tool_hint="get_power_curve",
                params={"logger_id": best_logger, "date": date} if date else {"logger_id": best_logger},
            )
        )

    next_steps.append(
        build_next_step(
            action="Compare on another metric",
            reason="See if the pattern holds for energy or irradiance",
            priority=NextStepPriority.OPTIONAL,
            tool_hint="compare_loggers",
            params={"logger_ids": logger_ids},
        )
    )

    # Build UI suggestion
    color_scheme = (
        ColorScheme.SUCCESS if spread_percent < 15
        else ColorScheme.WARNING if spread_percent < 40
        else ColorScheme.DANGER
    )

    ui_suggestion = UISuggestion(
        preferred_component=UIComponentHint.CHART_LINE,
        display_mode=DisplayMode.DETAILED,
        color_scheme=color_scheme,
    )

    return ContextEnvelope(
        summary=summary,
        insights=insights[:3],
        next_steps=next_steps[:3],
        ui_suggestion=ui_suggestion,
        alert=f"{worst_logger} is underperforming by {spread_percent:.0f}%" if spread_percent > 40 else None,
    )
