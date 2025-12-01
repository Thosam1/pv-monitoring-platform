"""Inverter monitoring tools.

Provides tools for analyzing inverter health and getting power curves.
"""

from typing import Annotated

import pandas as pd
from pydantic import Field

from config import settings
from database import engine
from models.enums import DataStatus
from models.responses import (
    AnomalyReportResponse,
    AnomalyPoint,
    AvailableRange,
    PowerCurveResponse,
    PowerCurvePoint,
    SummaryStats,
)
from queries.builders import build_health_analysis_query, build_power_curve_query


def _calculate_power_curve_stats(df: pd.DataFrame) -> SummaryStats:
    """Calculate basic stats for AI narrative generation.

    Keep it simple - no special handling for night periods, incomplete hours,
    or resampling. Just basic pandas operations.

    Args:
        df: DataFrame with 'timestamp' and 'power' columns

    Returns:
        SummaryStats with computed metrics, or empty SummaryStats if no data
    """
    # Ensure timestamp is datetime for calculations
    if not df.empty and "timestamp" in df.columns:
        df = df.copy()
        df["timestamp"] = pd.to_datetime(df["timestamp"])

    power = df["power"].dropna() if "power" in df.columns else pd.Series()

    if power.empty:
        return SummaryStats()

    # Peak
    peak_value = float(power.max())
    peak_idx = power.idxmax()
    peak_ts = df.loc[peak_idx, "timestamp"]
    peak_time = peak_ts.strftime("%H:%M") if hasattr(peak_ts, "strftime") else None

    # Average
    avg_value = float(power.mean())

    # Energy (W to kWh) - infer sampling interval from timestamps
    # Known limitation: assumes uniform sampling
    total_energy = None
    if len(df) >= 2:
        interval = df["timestamp"].diff().median()
        if pd.notna(interval):
            interval_seconds = interval.total_seconds()
            hours = (len(power) * interval_seconds) / 3600
            total_energy = round((avg_value * hours) / 1000, 2)

    # Trend - simple first-half vs second-half comparison
    mid = len(power) // 2
    if mid > 0:
        first_half = power.iloc[:mid].mean()
        second_half = power.iloc[mid:].mean()

        if second_half > first_half * 1.1:
            trend = "rising"
        elif second_half < first_half * 0.9:
            trend = "falling"
        else:
            trend = "stable"
    else:
        trend = "stable"

    return SummaryStats(
        peakValue=round(peak_value, 1),
        peakTime=peak_time,
        avgValue=round(avg_value, 1),
        totalEnergy=total_energy,
        trend=trend,
    )


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
        # Smart recovery: query for actual data range
        range_query = """
            SELECT MIN("timestamp") as min_ts, MAX("timestamp") as max_ts
            FROM measurements
            WHERE "loggerId" = :logger_id
        """
        range_df = pd.read_sql(range_query, engine, params={"logger_id": logger_id})

        if range_df.empty or pd.isna(range_df.iloc[0]["min_ts"]):
            # Truly no data for this logger - still return availableRange for consistency
            return AnomalyReportResponse(
                loggerId=logger_id,
                points=[],
                status=DataStatus.NO_DATA,
                availableRange=AvailableRange(start=None, end=None),
                message="No data exists for this logger. Verify the logger ID is correct.",
            ).model_dump()

        # Data exists but not in requested window
        min_date = range_df.iloc[0]["min_ts"].strftime("%Y-%m-%d")
        max_date = range_df.iloc[0]["max_ts"].strftime("%Y-%m-%d")

        return AnomalyReportResponse(
            loggerId=logger_id,
            points=[],
            status=DataStatus.NO_DATA_IN_WINDOW,
            availableRange=AvailableRange(start=min_date, end=max_date),
            message=f"No data in the last {days} days. Data exists from {min_date} to {max_date}.",
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
        # Smart recovery: query for actual data range
        range_query = """
            SELECT MIN("timestamp")::date as min_date, MAX("timestamp")::date as max_date
            FROM measurements
            WHERE "loggerId" = :logger_id
        """
        range_df = pd.read_sql(range_query, engine, params={"logger_id": logger_id})

        if range_df.empty or pd.isna(range_df.iloc[0]["min_date"]):
            # Truly no data for this logger - still return availableRange for consistency
            return PowerCurveResponse(
                loggerId=logger_id,
                date=date,
                data=[],
                status=DataStatus.NO_DATA,
                availableRange=AvailableRange(start=None, end=None),
                message="No data exists for this logger. Verify the logger ID is correct.",
            ).model_dump()

        # Data exists but not for requested date
        min_date = str(range_df.iloc[0]["min_date"])
        max_date = str(range_df.iloc[0]["max_date"])

        return PowerCurveResponse(
            loggerId=logger_id,
            date=date,
            data=[],
            status=DataStatus.NO_DATA_IN_WINDOW,
            availableRange=AvailableRange(start=min_date, end=max_date),
            message=f"No data for {date}. Data exists from {min_date} to {max_date}.",
        ).model_dump()

    # Downsample to 15-min intervals if too many rows for performance
    if len(df) > settings.max_data_points:
        df["timestamp"] = pd.to_datetime(df["timestamp"])
        df = df.set_index("timestamp").resample(settings.resample_interval).mean().reset_index()

    # Calculate summary stats for narrative insights
    summary_stats = _calculate_power_curve_stats(df)

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
        summaryStats=summary_stats,
    ).model_dump()
