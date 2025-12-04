"""Inverter monitoring tools.

Provides tools for analyzing inverter health and getting power curves.
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
from models.responses import (
    AnomalyReportResponse,
    AnomalyPoint,
    AvailableRange,
    PowerCurveResponse,
    PowerCurvePoint,
    SummaryStats,
)
from queries.builders import build_health_analysis_query, build_power_curve_query


def _build_power_curve_context(
    logger_id: str,
    date: str,
    stats: SummaryStats,
    record_count: int,
) -> ContextEnvelope:
    """Build user-friendly context for power curve response.

    Generates human-readable summary, insights, and next-step recommendations
    based on the power curve analysis results.
    """
    # Build summary
    energy_str = f"{stats.totalEnergy:.1f} kWh" if stats.totalEnergy else "some energy"
    peak_str = f"{stats.peakValue:.0f} W" if stats.peakValue else "peak power"
    time_str = stats.peakTime or "midday"

    summary = (
        f"Inverter {logger_id} produced {energy_str} on {date}, "
        f"peaking at {peak_str} around {time_str}."
    )

    # Build insights based on data patterns
    insights = []

    # Peak performance insight
    if stats.peakValue and stats.peakTime:
        insights.append(
            build_performance_insight(
                title="Peak performance",
                description=f"Maximum output of {stats.peakValue:.0f} W occurred at {stats.peakTime}.",
                metric=f"{stats.peakValue:.0f} W",
            )
        )

    # Trend insight
    if stats.trend:
        trend_descriptions = {
            "rising": "Output increased throughout the day, indicating improving conditions.",
            "falling": "Output decreased over the day, possibly due to afternoon clouds or shading.",
            "stable": "Consistent production throughout the day shows reliable performance.",
        }
        severity = (
            InsightSeverity.WARNING
            if stats.trend == "falling"
            else InsightSeverity.INFO
        )
        insights.append(
            build_performance_insight(
                title=f"Production was {stats.trend}",
                description=trend_descriptions.get(stats.trend, ""),
                severity=severity,
            )
        )

    # Energy production insight
    if stats.totalEnergy:
        # Rough benchmark: typical residential system produces 4-6 kWh/kWp/day
        energy_assessment = (
            "strong" if stats.totalEnergy > 20 else "moderate" if stats.totalEnergy > 10 else "light"
        )
        insights.append(
            build_performance_insight(
                title=f"{energy_assessment.capitalize()} daily output",
                description=f"Total generation of {stats.totalEnergy:.1f} kWh for this day.",
                metric=f"{stats.totalEnergy:.1f} kWh",
            )
        )

    # Build next steps
    next_steps = [
        build_next_step(
            action="Compare with other inverters on this date",
            reason="See how this unit performs relative to others",
            priority=NextStepPriority.SUGGESTED,
            tool_hint="compare_loggers",
            params={"date": date},
        ),
        build_next_step(
            action="Calculate efficiency for this date",
            reason="Check if output matches irradiance levels",
            priority=NextStepPriority.SUGGESTED,
            tool_hint="calculate_performance_ratio",
            params={"logger_id": logger_id, "date": date},
        ),
    ]

    # Add urgent next step if trend is falling
    if stats.trend == "falling":
        next_steps.insert(
            0,
            build_next_step(
                action="Check for anomalies or issues",
                reason="Declining production may indicate a problem",
                priority=NextStepPriority.RECOMMENDED,
                tool_hint="analyze_inverter_health",
                params={"logger_id": logger_id, "days": 7},
            ),
        )

    # Build UI suggestion
    color_scheme = (
        ColorScheme.SUCCESS
        if stats.trend in ["rising", "stable"]
        else ColorScheme.WARNING
    )
    ui_suggestion = UISuggestion(
        preferred_component=UIComponentHint.CHART_COMPOSED,
        display_mode=DisplayMode.STANDARD,
        highlight_metric="peakValue",
        color_scheme=color_scheme,
    )

    return ContextEnvelope(
        summary=summary,
        insights=insights[:3],  # Limit to 3 insights
        next_steps=next_steps[:3],  # Limit to 3 next steps
        ui_suggestion=ui_suggestion,
    )


def _build_anomaly_context(
    logger_id: str,
    days: int,
    anomaly_count: int,
    total_records: int,
) -> ContextEnvelope:
    """Build user-friendly context for anomaly report response."""
    # Build summary based on findings
    if anomaly_count == 0:
        summary = (
            f"Good news! Inverter {logger_id} shows no anomalies in the past {days} days. "
            f"The system appears to be operating normally."
        )
        alert = None
    elif anomaly_count <= 3:
        summary = (
            f"Inverter {logger_id} had {anomaly_count} anomaly "
            f"{'event' if anomaly_count == 1 else 'events'} in the past {days} days. "
            f"These are periods where the inverter wasn't producing power despite good sunlight."
        )
        alert = None
    else:
        summary = (
            f"Inverter {logger_id} shows {anomaly_count} anomalies in the past {days} days. "
            f"This needs attention - the system may have an issue."
        )
        alert = f"{anomaly_count} anomalies detected - investigation recommended"

    # Build insights
    insights = []
    if anomaly_count > 0:
        anomaly_rate = (anomaly_count / total_records * 100) if total_records > 0 else 0
        severity = (
            InsightSeverity.CRITICAL
            if anomaly_count > 10
            else InsightSeverity.WARNING
            if anomaly_count > 3
            else InsightSeverity.INFO
        )
        insights.append(
            build_performance_insight(
                title="Daytime outages detected",
                description=(
                    f"Found {anomaly_count} periods where power was zero despite sufficient sunlight. "
                    f"This represents {anomaly_rate:.1f}% of readings."
                ),
                metric=str(anomaly_count),
                benchmark="vs 0 expected",
                severity=severity,
            )
        )
    else:
        insights.append(
            build_performance_insight(
                title="No issues found",
                description="The inverter operated normally during all sunlight hours.",
                severity=InsightSeverity.INFO,
            )
        )

    # Build next steps
    next_steps = []
    if anomaly_count > 0:
        next_steps.append(
            build_next_step(
                action="Show power curve for affected days",
                reason="Visualize when the outages occurred",
                priority=NextStepPriority.RECOMMENDED,
                tool_hint="get_power_curve",
                params={"logger_id": logger_id},
            )
        )
        next_steps.append(
            build_next_step(
                action="Check error codes in system logs",
                reason="May reveal the cause of the outages",
                priority=NextStepPriority.RECOMMENDED,
                tool_hint="diagnose_error_codes",
                params={"logger_id": logger_id, "days": days},
            )
        )
    else:
        next_steps.append(
            build_next_step(
                action="Calculate efficiency ratio",
                reason="Verify system is performing at full capacity",
                priority=NextStepPriority.SUGGESTED,
                tool_hint="calculate_performance_ratio",
                params={"logger_id": logger_id},
            )
        )
        next_steps.append(
            build_next_step(
                action="View financial savings",
                reason="See how much money this healthy system is saving",
                priority=NextStepPriority.SUGGESTED,
                tool_hint="calculate_financial_savings",
                params={"logger_id": logger_id},
            )
        )

    # Build UI suggestion
    color_scheme = (
        ColorScheme.SUCCESS
        if anomaly_count == 0
        else ColorScheme.DANGER
        if anomaly_count > 10
        else ColorScheme.WARNING
    )
    ui_suggestion = UISuggestion(
        preferred_component=UIComponentHint.DATA_TABLE
        if anomaly_count > 0
        else UIComponentHint.STATUS_BADGE,
        display_mode=DisplayMode.DETAILED if anomaly_count > 0 else DisplayMode.SUMMARY,
        color_scheme=color_scheme,
    )

    return ContextEnvelope(
        summary=summary,
        insights=insights,
        next_steps=next_steps[:3],
        ui_suggestion=ui_suggestion,
        alert=alert,
    )


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

    # Build user-friendly context
    context = _build_anomaly_context(
        logger_id=logger_id,
        days=days,
        anomaly_count=len(points),
        total_records=len(df),
    )

    return AnomalyReportResponse(
        loggerId=logger_id,
        daysAnalyzed=days,
        totalRecords=len(df),
        anomalyCount=len(points),
        points=points[: settings.anomaly_result_limit],
        context=context,
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

    # Build user-friendly context
    context = _build_power_curve_context(
        logger_id=logger_id,
        date=date,
        stats=summary_stats,
        record_count=len(data),
    )

    return PowerCurveResponse(
        loggerId=logger_id,
        date=date,
        recordCount=len(data),
        data=data,
        summaryStats=summary_stats,
        context=context,
    ).model_dump()
