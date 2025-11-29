"""Inverter monitoring tools.

Provides tools for analyzing inverter health and getting power curves.
"""

from typing import Annotated

import pandas as pd
from pydantic import Field

from config import settings
from database import engine
from models.responses import (
    AnomalyReportResponse,
    AnomalyPoint,
    PowerCurveResponse,
    PowerCurvePoint,
)
from queries.builders import build_health_analysis_query, build_power_curve_query


def analyze_inverter_health(
    logger_id: Annotated[str, Field(description="Logger/inverter serial number")],
    days: Annotated[int, Field(description="Number of days to analyze", ge=1, le=365)] = 7,
) -> dict:
    """Analyze inverter health by detecting anomalies like daytime outages.

    Detects periods where power = 0 when irradiance > 50 W/m2.

    Args:
        logger_id: Logger/inverter serial number
        days: Number of days to analyze (1-365)

    Returns:
        AnomalyReportResponse with detected anomalies
    """
    query, _ = build_health_analysis_query()
    df = pd.read_sql(query, engine, params={"logger_id": logger_id, "days": days})

    if df.empty:
        return AnomalyReportResponse(
            loggerId=logger_id,
            points=[],
            message="No data found for the specified logger and time range",
        ).model_dump()

    # Detect daytime outages: power == 0 (or null) AND irradiance > threshold
    threshold = settings.anomaly_irradiance_threshold
    anomalies = df[
        ((df["activePowerWatts"] == 0) | (df["activePowerWatts"].isna()))
        & (df["irradiance"] > threshold)
    ]

    points = [
        AnomalyPoint(
            timestamp=row["timestamp"].isoformat(),
            activePowerWatts=(
                float(row["activePowerWatts"]) if pd.notna(row["activePowerWatts"]) else None
            ),
            irradiance=float(row["irradiance"]) if pd.notna(row["irradiance"]) else None,
            reason="daytime_outage",
        )
        for _, row in anomalies.iterrows()
    ]

    return AnomalyReportResponse(
        loggerId=logger_id,
        daysAnalyzed=days,
        totalRecords=len(df),
        anomalyCount=len(points),
        points=points[: settings.anomaly_result_limit],
    ).model_dump()


def get_power_curve(
    logger_id: Annotated[str, Field(description="Logger/inverter serial number")],
    date: Annotated[str, Field(description="Date in YYYY-MM-DD format")],
) -> dict:
    """Get power and irradiance timeseries for a specific date.

    Returns data suitable for charting.

    Args:
        logger_id: Logger/inverter serial number
        date: Date in YYYY-MM-DD format

    Returns:
        PowerCurveResponse with timeseries data
    """
    query = build_power_curve_query()
    df = pd.read_sql(query, engine, params={"logger_id": logger_id, "date": date})

    if df.empty:
        return PowerCurveResponse(
            loggerId=logger_id,
            date=date,
            data=[],
            message="No data found for the specified logger and date",
        ).model_dump()

    # Downsample to 15-min intervals if too many rows for performance
    if len(df) > settings.max_data_points:
        df["timestamp"] = pd.to_datetime(df["timestamp"])
        df = df.set_index("timestamp").resample(settings.resample_interval).mean().reset_index()

    data = [
        PowerCurvePoint(
            timestamp=(
                row["timestamp"].isoformat()
                if hasattr(row["timestamp"], "isoformat")
                else str(row["timestamp"])
            ),
            power=float(row["power"]) if pd.notna(row["power"]) else None,
            irradiance=float(row["irradiance"]) if pd.notna(row["irradiance"]) else None,
        )
        for _, row in df.iterrows()
    ]

    return PowerCurveResponse(
        loggerId=logger_id,
        date=date,
        recordCount=len(data),
        data=data,
    ).model_dump()
