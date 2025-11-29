"""Performance ratio calculation tools.

Provides tools for calculating system efficiency and performance ratios.
"""

from typing import Annotated
import math

import pandas as pd
from pydantic import Field

from config import settings
from database import engine
from models.responses import PerformanceReportResponse, PerformanceMetrics
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
        return PerformanceReportResponse(
            loggerId=logger_id,
            date=date,
            inferredCapacityKw=capacity_kw,
            message="No data with both power and irradiance found for this date",
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

    return PerformanceReportResponse(
        loggerId=logger_id,
        date=date,
        inferredCapacityKw=capacity_kw,
        performanceRatio=round(pr_percent, 1),
        status=status,
        metrics=metrics,
        interpretation=interpretation,
    ).model_dump()
