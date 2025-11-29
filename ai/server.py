"""
Solar Analytics AI Service - FastMCP Server

Provides MCP tools for analyzing PV monitoring data:
- list_loggers: Discover available loggers/inverters
- analyze_inverter_health: Detect anomalies like daytime outages
- get_power_curve: Get timeseries data for a single logger
- compare_loggers: Compare multiple loggers on metrics
- calculate_financial_savings: Calculate money saved and CO2 offset
- calculate_performance_ratio: Check system efficiency
- forecast_production: Predict future energy generation
- diagnose_error_codes: Identify and explain system errors
- get_fleet_overview: Site-wide aggregation for management view

CRITICAL: All SQL queries use double-quoted camelCase column names
to match TypeORM entity definitions in measurement.entity.ts.
"""

from typing import Annotated
from datetime import datetime, timedelta
import math
from pydantic import Field
import pandas as pd
import numpy as np
from fastmcp import FastMCP
from database import engine

mcp = FastMCP("solar-analyst")


# ============================================================
# TOOL 1: list_loggers - Discovery tool for AI to find devices
# ============================================================
@mcp.tool
def list_loggers() -> dict:
    """
    List all available loggers/inverters in the system.
    Returns logger IDs, types, and data date ranges.
    Use this to discover valid logger IDs before calling other tools.
    """
    query = '''
        SELECT
            "loggerId",
            "loggerType",
            MIN("timestamp") as "earliestData",
            MAX("timestamp") as "latestData",
            COUNT(*) as "recordCount"
        FROM measurements
        GROUP BY "loggerId", "loggerType"
        ORDER BY "loggerId"
    '''

    df = pd.read_sql(query, engine)

    loggers = [
        {
            "loggerId": row["loggerId"],
            "loggerType": row["loggerType"],
            "earliestData": row["earliestData"].isoformat() if pd.notna(row["earliestData"]) else None,
            "latestData": row["latestData"].isoformat() if pd.notna(row["latestData"]) else None,
            "recordCount": int(row["recordCount"])
        }
        for _, row in df.iterrows()
    ]

    return {
        "type": "logger_list",
        "count": len(loggers),
        "loggers": loggers
    }


# ============================================================
# TOOL 2: analyze_inverter_health - Anomaly detection
# ============================================================
@mcp.tool
def analyze_inverter_health(
    logger_id: Annotated[str, Field(description="Logger/inverter serial number")],
    days: Annotated[int, Field(description="Number of days to analyze", ge=1, le=365)] = 7
) -> dict:
    """
    Analyze inverter health by detecting anomalies like daytime outages
    (power = 0 when irradiance > 50 W/m²).
    """
    # Use text substitution for INTERVAL since parameterized queries
    # don't work well with PostgreSQL INTERVAL syntax
    query = f'''
        SELECT
            "timestamp",
            "loggerId",
            "activePowerWatts",
            "irradiance"
        FROM measurements
        WHERE "loggerId" = %(logger_id)s
          AND "timestamp" >= NOW() - INTERVAL '{days} days'
        ORDER BY "timestamp" ASC
    '''

    df = pd.read_sql(query, engine, params={"logger_id": logger_id})

    if df.empty:
        return {
            "type": "anomaly_report",
            "loggerId": logger_id,
            "points": [],
            "message": "No data found for the specified logger and time range"
        }

    # Detect daytime outages: power == 0 (or null) AND irradiance > 50
    anomalies = df[
        ((df["activePowerWatts"] == 0) | (df["activePowerWatts"].isna())) &
        (df["irradiance"] > 50)
    ]

    points = [
        {
            "timestamp": row["timestamp"].isoformat(),
            "activePowerWatts": float(row["activePowerWatts"]) if pd.notna(row["activePowerWatts"]) else None,
            "irradiance": float(row["irradiance"]) if pd.notna(row["irradiance"]) else None,
            "reason": "daytime_outage"
        }
        for _, row in anomalies.iterrows()
    ]

    return {
        "type": "anomaly_report",
        "loggerId": logger_id,
        "daysAnalyzed": days,
        "totalRecords": len(df),
        "anomalyCount": len(points),
        "points": points[:100]  # Limit to 100 anomalies to avoid huge responses
    }


# ============================================================
# TOOL 3: get_power_curve - Timeseries for single logger
# ============================================================
@mcp.tool
def get_power_curve(
    logger_id: Annotated[str, Field(description="Logger/inverter serial number")],
    date: Annotated[str, Field(description="Date in YYYY-MM-DD format")]
) -> dict:
    """
    Get power and irradiance timeseries for a specific date.
    Returns data suitable for charting.
    """
    query = '''
        SELECT
            "timestamp",
            "activePowerWatts" as "power",
            "irradiance"
        FROM measurements
        WHERE "loggerId" = %(logger_id)s
          AND DATE("timestamp") = %(date)s
        ORDER BY "timestamp" ASC
    '''

    df = pd.read_sql(query, engine, params={"logger_id": logger_id, "date": date})

    if df.empty:
        return {
            "type": "timeseries",
            "loggerId": logger_id,
            "date": date,
            "data": [],
            "message": "No data found for the specified logger and date"
        }

    # Downsample to 15-min intervals if > 1000 rows for performance
    if len(df) > 1000:
        df["timestamp"] = pd.to_datetime(df["timestamp"])
        df = df.set_index("timestamp").resample("15min").mean().reset_index()

    data = [
        {
            "timestamp": row["timestamp"].isoformat() if hasattr(row["timestamp"], "isoformat") else str(row["timestamp"]),
            "power": float(row["power"]) if pd.notna(row["power"]) else None,
            "irradiance": float(row["irradiance"]) if pd.notna(row["irradiance"]) else None
        }
        for _, row in df.iterrows()
    ]

    return {
        "type": "timeseries",
        "loggerId": logger_id,
        "date": date,
        "recordCount": len(data),
        "data": data
    }


# ============================================================
# TOOL 4: compare_loggers - Multi-logger comparison
# ============================================================
@mcp.tool
def compare_loggers(
    logger_ids: Annotated[list[str], Field(description="List of logger IDs to compare (2-5)")],
    metric: Annotated[str, Field(description="Metric to compare: 'power', 'energy', or 'irradiance'")] = "power",
    date: Annotated[str | None, Field(description="Date in YYYY-MM-DD format (optional)")] = None
) -> dict:
    """
    Compare multiple loggers on a specific metric for a given date.
    Returns merged timeseries data suitable for multi-line charts.
    """
    if len(logger_ids) < 2 or len(logger_ids) > 5:
        return {
            "type": "error",
            "message": "Provide 2-5 logger IDs for comparison"
        }

    # Map metric names to column names with proper quoting
    metric_column_map = {
        "power": '"activePowerWatts"',
        "energy": '"energyDailyKwh"',
        "irradiance": '"irradiance"'
    }
    metric_column = metric_column_map.get(metric, '"activePowerWatts"')

    # Build date filter if provided
    date_filter = ""
    params = {"logger_ids": logger_ids}
    if date:
        date_filter = 'AND DATE("timestamp") = %(date)s'
        params["date"] = date

    query = f'''
        SELECT
            "timestamp",
            "loggerId",
            {metric_column} as "value"
        FROM measurements
        WHERE "loggerId" = ANY(%(logger_ids)s)
          {date_filter}
        ORDER BY "timestamp" ASC
    '''

    df = pd.read_sql(query, engine, params=params)

    if df.empty:
        return {
            "type": "comparison",
            "metric": metric,
            "loggerIds": logger_ids,
            "date": date,
            "data": [],
            "message": "No data found for the specified loggers"
        }

    # Pivot to get each logger as a column
    df["timestamp"] = pd.to_datetime(df["timestamp"])
    pivot = df.pivot_table(
        index="timestamp",
        columns="loggerId",
        values="value",
        aggfunc="mean"
    )
    pivot = pivot.reset_index()

    # Downsample if too many points for performance
    if len(pivot) > 500:
        pivot = pivot.set_index("timestamp").resample("15min").mean().reset_index()

    # Convert to list of dicts with timestamp + each logger's value
    data = []
    for _, row in pivot.iterrows():
        point = {"timestamp": row["timestamp"].isoformat()}
        for lid in logger_ids:
            if lid in pivot.columns:
                val = row.get(lid)
                point[lid] = float(val) if pd.notna(val) else None
        data.append(point)

    return {
        "type": "comparison",
        "metric": metric,
        "loggerIds": logger_ids,
        "date": date,
        "recordCount": len(data),
        "data": data
    }


# ============================================================
# TOOL 5: calculate_financial_savings - Money saved & CO2 offset
# ============================================================
@mcp.tool
def calculate_financial_savings(
    logger_id: Annotated[str, Field(description="Logger/inverter serial number")],
    start_date: Annotated[str, Field(description="Start date in YYYY-MM-DD format")],
    end_date: Annotated[str | None, Field(description="End date in YYYY-MM-DD format (optional, defaults to today)")] = None,
    electricity_rate: Annotated[float, Field(description="Electricity rate in $/kWh (default 0.20)", ge=0.01, le=1.0)] = 0.20
) -> dict:
    """
    Calculate financial savings from solar generation.
    Returns money saved, CO2 offset, and equivalent trees planted.
    """
    # Default end_date to today
    if end_date is None:
        end_date = datetime.now().strftime("%Y-%m-%d")

    query = '''
        SELECT
            DATE("timestamp") as "date",
            MAX("energyDailyKwh") as "dailyKwh"
        FROM measurements
        WHERE "loggerId" = %(logger_id)s
          AND DATE("timestamp") >= %(start_date)s
          AND DATE("timestamp") <= %(end_date)s
          AND "energyDailyKwh" IS NOT NULL
        GROUP BY DATE("timestamp")
        ORDER BY "date"
    '''

    df = pd.read_sql(query, engine, params={
        "logger_id": logger_id,
        "start_date": start_date,
        "end_date": end_date
    })

    if df.empty:
        return {
            "type": "financial_report",
            "loggerId": logger_id,
            "period": {"start": start_date, "end": end_date},
            "message": "No energy data found for the specified period"
        }

    total_kwh = df["dailyKwh"].sum()
    savings_usd = total_kwh * electricity_rate
    co2_offset_kg = total_kwh * 0.85  # Average kg CO2 per kWh avoided
    trees_equivalent = co2_offset_kg / 21  # ~21 kg CO2 absorbed per tree per year

    return {
        "type": "financial_report",
        "loggerId": logger_id,
        "period": {"start": start_date, "end": end_date},
        "daysWithData": len(df),
        "totalEnergyKwh": round(total_kwh, 2),
        "electricityRateUsd": electricity_rate,
        "savingsUsd": round(savings_usd, 2),
        "co2OffsetKg": round(co2_offset_kg, 2),
        "treesEquivalent": round(trees_equivalent, 1),
        "summary": f"Generated {total_kwh:.1f} kWh, saving ${savings_usd:.2f} and offsetting {co2_offset_kg:.1f} kg of CO2"
    }


# ============================================================
# TOOL 6: calculate_performance_ratio - System efficiency check
# ============================================================
@mcp.tool
def calculate_performance_ratio(
    logger_id: Annotated[str, Field(description="Logger/inverter serial number")],
    date: Annotated[str, Field(description="Date in YYYY-MM-DD format")],
    capacity_kw: Annotated[float | None, Field(description="Override system capacity in kW (optional, auto-inferred if not provided)")] = None
) -> dict:
    """
    Calculate the Performance Ratio (efficiency) for a system on a given date.
    Compares actual output to theoretical maximum based on irradiance.
    """
    # Step 1: Infer capacity from historical peak if not provided
    if capacity_kw is None:
        peak_query = '''
            SELECT MAX("activePowerWatts") as "peakWatts"
            FROM measurements
            WHERE "loggerId" = %(logger_id)s
              AND "activePowerWatts" IS NOT NULL
        '''
        peak_df = pd.read_sql(peak_query, engine, params={"logger_id": logger_id})

        if peak_df.empty or pd.isna(peak_df["peakWatts"].iloc[0]):
            return {
                "type": "performance_report",
                "loggerId": logger_id,
                "date": date,
                "message": "Cannot infer system capacity - no power data found"
            }

        peak_watts = peak_df["peakWatts"].iloc[0]
        # Round up to nearest 0.5 kW
        capacity_kw = math.ceil(peak_watts / 500) * 0.5

    # Step 2: Get data for the specified date
    query = '''
        SELECT
            "timestamp",
            "activePowerWatts",
            "irradiance"
        FROM measurements
        WHERE "loggerId" = %(logger_id)s
          AND DATE("timestamp") = %(date)s
          AND "activePowerWatts" IS NOT NULL
          AND "irradiance" IS NOT NULL
          AND "irradiance" > 0
        ORDER BY "timestamp"
    '''

    df = pd.read_sql(query, engine, params={"logger_id": logger_id, "date": date})

    if df.empty:
        return {
            "type": "performance_report",
            "loggerId": logger_id,
            "date": date,
            "inferredCapacityKw": capacity_kw,
            "message": "No data with both power and irradiance found for this date"
        }

    # Step 3: Calculate Performance Ratio
    # PR = (Actual Output) / (Irradiance × Capacity × Reference Efficiency)
    # Reference efficiency ~15% for typical panels
    reference_efficiency = 0.15

    # Calculate for each timestamp
    df["theoreticalWatts"] = df["irradiance"] * capacity_kw * reference_efficiency * 10  # Scale factor
    df["ratio"] = df["activePowerWatts"] / df["theoreticalWatts"]
    df["ratio"] = df["ratio"].clip(0, 1.5)  # Cap at 150% to handle edge cases

    avg_power = df["activePowerWatts"].mean()
    avg_irradiance = df["irradiance"].mean()
    peak_power = df["activePowerWatts"].max()

    # Overall PR as percentage
    pr_percent = df["ratio"].mean() * 100

    # Classify status
    if pr_percent >= 80:
        status = "normal"
        interpretation = f"Your system is operating at {pr_percent:.0f}% efficiency (Normal: 80-100%)"
    elif pr_percent >= 60:
        status = "low"
        interpretation = f"Your system is operating at {pr_percent:.0f}% efficiency (Below optimal - consider inspection)"
    else:
        status = "critical"
        interpretation = f"Your system is operating at {pr_percent:.0f}% efficiency (Critical - immediate attention needed)"

    return {
        "type": "performance_report",
        "loggerId": logger_id,
        "date": date,
        "inferredCapacityKw": capacity_kw,
        "performanceRatio": round(pr_percent, 1),
        "status": status,
        "metrics": {
            "avgPowerWatts": round(avg_power, 1),
            "peakPowerWatts": round(peak_power, 1),
            "avgIrradiance": round(avg_irradiance, 1),
            "dataPoints": len(df)
        },
        "interpretation": interpretation
    }


# ============================================================
# TOOL 7: forecast_production - Predict future generation
# ============================================================
@mcp.tool
def forecast_production(
    logger_id: Annotated[str, Field(description="Logger/inverter serial number")],
    days_ahead: Annotated[int, Field(description="Number of days to forecast (1-7)", ge=1, le=7)] = 1
) -> dict:
    """
    Forecast energy production for upcoming days.
    Uses historical average as a simple persistence model.
    """
    # Get historical daily production for last 14 days
    query = '''
        SELECT
            DATE("timestamp") as "date",
            MAX("energyDailyKwh") as "dailyKwh"
        FROM measurements
        WHERE "loggerId" = %(logger_id)s
          AND "timestamp" >= NOW() - INTERVAL '14 days'
          AND "energyDailyKwh" IS NOT NULL
        GROUP BY DATE("timestamp")
        ORDER BY "date" DESC
    '''

    df = pd.read_sql(query, engine, params={"logger_id": logger_id})

    if df.empty or len(df) < 3:
        return {
            "type": "production_forecast",
            "loggerId": logger_id,
            "message": "Insufficient historical data for forecasting (need at least 3 days)"
        }

    # Calculate statistics
    avg_daily = df["dailyKwh"].mean()
    std_daily = df["dailyKwh"].std()
    min_daily = df["dailyKwh"].min()
    max_daily = df["dailyKwh"].max()

    # Determine confidence based on variance
    cv = std_daily / avg_daily if avg_daily > 0 else 1  # Coefficient of variation
    if cv < 0.15:
        confidence = "high"
    elif cv < 0.30:
        confidence = "medium"
    else:
        confidence = "low"

    # Generate forecasts
    forecasts = []
    base_date = datetime.now()
    for i in range(1, days_ahead + 1):
        forecast_date = (base_date + timedelta(days=i)).strftime("%Y-%m-%d")
        forecasts.append({
            "date": forecast_date,
            "expectedKwh": round(avg_daily, 2),
            "rangeMin": round(max(0, avg_daily - std_daily), 2),
            "rangeMax": round(avg_daily + std_daily, 2),
            "confidence": confidence
        })

    return {
        "type": "production_forecast",
        "loggerId": logger_id,
        "method": "historical_average",
        "basedOnDays": len(df),
        "historicalStats": {
            "averageKwh": round(avg_daily, 2),
            "stdDevKwh": round(std_daily, 2),
            "minKwh": round(min_daily, 2),
            "maxKwh": round(max_daily, 2)
        },
        "forecasts": forecasts,
        "summary": f"Expected ~{avg_daily:.1f} kWh/day based on last {len(df)} days ({confidence} confidence)"
    }


# ============================================================
# TOOL 8: diagnose_error_codes - System diagnostics
# ============================================================
# Error code definitions (expandable per logger type)
ERROR_CODE_DEFINITIONS = {
    "goodwe": {
        "E001": {"description": "Grid Voltage Out of Range", "severity": "warning", "fix": "Check grid connection and voltage stability"},
        "E002": {"description": "Grid Frequency Out of Range", "severity": "warning", "fix": "Contact utility if persistent"},
        "E003": {"description": "DC Voltage Too High", "severity": "critical", "fix": "Check PV string configuration"},
        "E004": {"description": "Inverter Overtemperature", "severity": "critical", "fix": "Check ventilation and ambient temperature"},
        "E005": {"description": "Isolation Fault", "severity": "critical", "fix": "Check cable insulation and connections"},
    },
    "lti": {
        "F01": {"description": "Communication Timeout", "severity": "warning", "fix": "Check network connection"},
        "F02": {"description": "Sensor Fault", "severity": "warning", "fix": "Inspect temperature/irradiance sensors"},
    },
    "smartdog": {
        "ERR_COMM": {"description": "Communication Error", "severity": "warning", "fix": "Check RS485/Modbus connection"},
        "ERR_TEMP": {"description": "Temperature Sensor Fault", "severity": "warning", "fix": "Replace temperature sensor"},
    },
    "meier": {
        "W100": {"description": "Low Production Warning", "severity": "info", "fix": "May be due to weather - monitor"},
        "E100": {"description": "Inverter Offline", "severity": "critical", "fix": "Check inverter power supply"},
    }
}

@mcp.tool
def diagnose_error_codes(
    logger_id: Annotated[str, Field(description="Logger/inverter serial number")],
    days: Annotated[int, Field(description="Number of days to scan for errors", ge=1, le=30)] = 7
) -> dict:
    """
    Diagnose system errors by scanning metadata for error codes.
    Returns human-readable descriptions and suggested fixes.
    """
    # First get the logger type
    type_query = '''
        SELECT DISTINCT "loggerType"
        FROM measurements
        WHERE "loggerId" = %(logger_id)s
        LIMIT 1
    '''
    type_df = pd.read_sql(type_query, engine, params={"logger_id": logger_id})

    if type_df.empty:
        return {
            "type": "diagnostics_report",
            "loggerId": logger_id,
            "message": "Logger not found"
        }

    logger_type = type_df["loggerType"].iloc[0]

    # Query metadata for error codes
    query = f'''
        SELECT
            "timestamp",
            "metadata"
        FROM measurements
        WHERE "loggerId" = %(logger_id)s
          AND "timestamp" >= NOW() - INTERVAL '{days} days'
          AND "metadata" IS NOT NULL
          AND "metadata"::text LIKE '%%error%%'
        ORDER BY "timestamp" DESC
    '''

    df = pd.read_sql(query, engine, params={"logger_id": logger_id})

    # Get error definitions for this logger type
    error_defs = ERROR_CODE_DEFINITIONS.get(logger_type, {})

    # Parse errors from metadata
    issues = []
    error_counts = {}

    for _, row in df.iterrows():
        metadata = row["metadata"]
        if isinstance(metadata, dict) and "errorCode" in metadata:
            code = metadata["errorCode"]
            if code not in error_counts:
                error_counts[code] = {
                    "count": 0,
                    "firstSeen": row["timestamp"],
                    "lastSeen": row["timestamp"]
                }
            error_counts[code]["count"] += 1
            error_counts[code]["lastSeen"] = row["timestamp"]

    # Build issues list
    for code, stats in error_counts.items():
        definition = error_defs.get(code, {
            "description": f"Unknown error code: {code}",
            "severity": "warning",
            "fix": "Consult manufacturer documentation"
        })

        issues.append({
            "code": code,
            "description": definition["description"],
            "severity": definition["severity"],
            "occurrences": stats["count"],
            "firstSeen": stats["firstSeen"].isoformat() if hasattr(stats["firstSeen"], "isoformat") else str(stats["firstSeen"]),
            "lastSeen": stats["lastSeen"].isoformat() if hasattr(stats["lastSeen"], "isoformat") else str(stats["lastSeen"]),
            "suggestedFix": definition["fix"]
        })

    # Sort by severity (critical first) then by count
    severity_order = {"critical": 0, "warning": 1, "info": 2}
    issues.sort(key=lambda x: (severity_order.get(x["severity"], 3), -x["occurrences"]))

    # Determine overall health
    if any(i["severity"] == "critical" for i in issues):
        overall_health = "critical"
    elif any(i["severity"] == "warning" for i in issues):
        overall_health = "warning"
    elif issues:
        overall_health = "info"
    else:
        overall_health = "good"

    return {
        "type": "diagnostics_report",
        "loggerId": logger_id,
        "loggerType": logger_type,
        "period": f"Last {days} days",
        "overallHealth": overall_health,
        "issueCount": len(issues),
        "issues": issues[:20],  # Limit to top 20 issues
        "summary": f"Found {len(issues)} issue(s) - System health: {overall_health.upper()}" if issues else "No errors detected - System health: GOOD"
    }


# ============================================================
# TOOL 9: get_fleet_overview - Site-wide aggregation
# ============================================================
@mcp.tool
def get_fleet_overview() -> dict:
    """
    Get high-level status of the entire solar fleet (site-wide).
    Returns total current power, total daily energy, and active device counts.
    Use this for questions like "How is the site performing right now?"
    """
    # 1. Get real-time total power (sum of latest reading per logger)
    # We look at data from the last 15 minutes to consider a logger "active"
    power_query = '''
        SELECT
            COUNT(DISTINCT "loggerId") as "activeLoggers",
            SUM("activePowerWatts") as "totalPowerWatts",
            AVG("irradiance") as "avgIrradiance"
        FROM measurements
        WHERE "timestamp" >= NOW() - INTERVAL '15 minutes'
    '''

    power_df = pd.read_sql(power_query, engine)

    # 2. Get total energy generated today
    energy_query = '''
        SELECT
            SUM("dailyKwh") as "totalDailyKwh"
        FROM (
            SELECT MAX("energyDailyKwh") as "dailyKwh"
            FROM measurements
            WHERE DATE("timestamp") = CURRENT_DATE
            GROUP BY "loggerId"
        ) as daily_maxes
    '''

    energy_df = pd.read_sql(energy_query, engine)

    # 3. Get total registered devices count
    count_query = 'SELECT COUNT(DISTINCT "loggerId") as "totalCount" FROM measurements'
    count_df = pd.read_sql(count_query, engine)

    total_loggers = int(count_df["totalCount"].iloc[0]) if not count_df.empty else 0
    active_loggers = int(power_df["activeLoggers"].iloc[0]) if not power_df.empty and pd.notna(power_df["activeLoggers"].iloc[0]) else 0
    total_power = float(power_df["totalPowerWatts"].iloc[0]) if not power_df.empty and pd.notna(power_df["totalPowerWatts"].iloc[0]) else 0.0
    total_energy = float(energy_df["totalDailyKwh"].iloc[0]) if not energy_df.empty and pd.notna(energy_df["totalDailyKwh"].iloc[0]) else 0.0
    avg_irradiance = float(power_df["avgIrradiance"].iloc[0]) if not power_df.empty and pd.notna(power_df["avgIrradiance"].iloc[0]) else 0.0

    # Simple health check
    percent_online = (active_loggers / total_loggers * 100) if total_loggers > 0 else 0

    return {
        "type": "fleet_overview",
        "timestamp": datetime.now().isoformat(),
        "status": {
            "totalLoggers": total_loggers,
            "activeLoggers": active_loggers,
            "percentOnline": round(percent_online, 1),
            "fleetHealth": "Healthy" if percent_online > 90 else "Degraded" if percent_online > 50 else "Critical"
        },
        "production": {
            "currentTotalPowerWatts": round(total_power, 2),
            "todayTotalEnergyKwh": round(total_energy, 2),
            "siteAvgIrradiance": round(avg_irradiance, 2)
        },
        "summary": f"Site generating {total_power/1000:.1f} kW total. {active_loggers}/{total_loggers} devices active."
    }


if __name__ == "__main__":
    mcp.run(transport="sse", host="0.0.0.0", port=4000)
