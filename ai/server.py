"""
Solar Analytics AI Service - FastMCP Server

Provides MCP tools for analyzing PV monitoring data:
- list_loggers: Discover available loggers/inverters
- analyze_inverter_health: Detect anomalies like daytime outages
- get_power_curve: Get timeseries data for a single logger
- compare_loggers: Compare multiple loggers on metrics

CRITICAL: All SQL queries use double-quoted camelCase column names
to match TypeORM entity definitions in measurement.entity.ts.
"""

from typing import Annotated
from pydantic import Field
import pandas as pd
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


if __name__ == "__main__":
    mcp.run(transport="sse", host="0.0.0.0", port=4000)
