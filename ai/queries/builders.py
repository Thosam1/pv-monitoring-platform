"""SQL query builders with proper column quoting.

All column names use double quotes and camelCase to match TypeORM entity definitions.
Queries use parameterized values (%(name)s) to prevent SQL injection.
"""

from typing import Any

# Column name mapping (camelCase for TypeORM compatibility)
COLUMNS = {
    "logger_id": '"loggerId"',
    "logger_type": '"loggerType"',
    "timestamp": '"timestamp"',
    "power": '"activePowerWatts"',
    "energy": '"energyDailyKwh"',
    "irradiance": '"irradiance"',
    "metadata": '"metadata"',
}


def col(name: str) -> str:
    """Get properly quoted column name.

    Args:
        name: Column alias (snake_case)

    Returns:
        Quoted column name for PostgreSQL
    """
    return COLUMNS.get(name, f'"{name}"')


# ============================================================
# TOOL 1: list_loggers
# ============================================================
def build_logger_list_query() -> str:
    """Query for listing all loggers with date ranges."""
    return f"""
        SELECT
            {col("logger_id")},
            {col("logger_type")},
            MIN({col("timestamp")}) as "earliestData",
            MAX({col("timestamp")}) as "latestData",
            COUNT(*) as "recordCount"
        FROM measurements
        GROUP BY {col("logger_id")}, {col("logger_type")}
        ORDER BY {col("logger_id")}
    """


# ============================================================
# TOOL 2: analyze_inverter_health
# ============================================================
def build_health_analysis_query() -> tuple[str, dict[str, Any]]:
    """Query for health analysis with anomaly detection.

    Returns:
        Tuple of (query_string, params_dict)
        Note: Caller must add 'logger_id' and 'days' to params
    """
    query = f"""
        SELECT
            {col("timestamp")},
            {col("logger_id")},
            {col("power")},
            {col("irradiance")}
        FROM measurements
        WHERE {col("logger_id")} = %(logger_id)s
          AND {col("timestamp")} >= NOW() - make_interval(days => %(days)s)
        ORDER BY {col("timestamp")} ASC
    """
    return query, {}


# ============================================================
# TOOL 3: get_power_curve
# ============================================================
def build_power_curve_query() -> str:
    """Query for power curve timeseries."""
    return f"""
        SELECT
            {col("timestamp")},
            {col("power")} as "power",
            {col("irradiance")}
        FROM measurements
        WHERE {col("logger_id")} = %(logger_id)s
          AND DATE({col("timestamp")}) = %(date)s
        ORDER BY {col("timestamp")} ASC
    """


# ============================================================
# TOOL 4: compare_loggers
# ============================================================
def build_comparison_query(metric: str, include_date_filter: bool = False) -> str:
    """Query for multi-logger comparison.

    Args:
        metric: Column to compare ('power', 'energy', 'irradiance')
        include_date_filter: Whether to include date filtering

    Returns:
        SQL query string
    """
    metric_column_map = {
        "power": col("power"),
        "energy": col("energy"),
        "irradiance": col("irradiance"),
    }
    metric_column = metric_column_map.get(metric, col("power"))

    date_filter = f'AND DATE({col("timestamp")}) = %(date)s' if include_date_filter else ""

    return f"""
        SELECT
            {col("timestamp")},
            {col("logger_id")},
            {metric_column} as "value"
        FROM measurements
        WHERE {col("logger_id")} = ANY(%(logger_ids)s)
          {date_filter}
        ORDER BY {col("timestamp")} ASC
    """


# ============================================================
# TOOL 5: calculate_financial_savings
# ============================================================
def build_financial_query() -> str:
    """Query for financial savings calculation."""
    return f"""
        SELECT
            DATE({col("timestamp")}) as "date",
            MAX({col("energy")}) as "dailyKwh"
        FROM measurements
        WHERE {col("logger_id")} = %(logger_id)s
          AND DATE({col("timestamp")}) >= %(start_date)s
          AND DATE({col("timestamp")}) <= %(end_date)s
          AND {col("energy")} IS NOT NULL
        GROUP BY DATE({col("timestamp")})
        ORDER BY "date"
    """


# ============================================================
# TOOL 6: calculate_performance_ratio
# ============================================================
def build_peak_power_query() -> str:
    """Query for inferring system capacity from historical peak."""
    return f"""
        SELECT MAX({col("power")}) as "peakWatts"
        FROM measurements
        WHERE {col("logger_id")} = %(logger_id)s
          AND {col("power")} IS NOT NULL
    """


def build_performance_query() -> str:
    """Query for performance ratio calculation."""
    return f"""
        SELECT
            {col("timestamp")},
            {col("power")},
            {col("irradiance")}
        FROM measurements
        WHERE {col("logger_id")} = %(logger_id)s
          AND DATE({col("timestamp")}) = %(date)s
          AND {col("power")} IS NOT NULL
          AND {col("irradiance")} IS NOT NULL
          AND {col("irradiance")} > 0
        ORDER BY {col("timestamp")}
    """


# ============================================================
# TOOL 7: forecast_production
# ============================================================
def build_forecast_query() -> str:
    """Query for forecast historical data."""
    return f"""
        SELECT
            DATE({col("timestamp")}) as "date",
            MAX({col("energy")}) as "dailyKwh"
        FROM measurements
        WHERE {col("logger_id")} = %(logger_id)s
          AND {col("timestamp")} >= NOW() - INTERVAL '14 days'
          AND {col("energy")} IS NOT NULL
        GROUP BY DATE({col("timestamp")})
        ORDER BY "date" DESC
    """


# ============================================================
# TOOL 8: diagnose_error_codes
# ============================================================
def build_logger_type_query() -> str:
    """Query for getting logger type."""
    return f"""
        SELECT DISTINCT {col("logger_type")}
        FROM measurements
        WHERE {col("logger_id")} = %(logger_id)s
        LIMIT 1
    """


def build_error_scan_query() -> tuple[str, dict[str, Any]]:
    """Query for scanning error codes in metadata.

    Returns:
        Tuple of (query_string, params_dict)
        Note: Caller must add 'logger_id' and 'days' to params
    """
    query = f"""
        SELECT
            {col("timestamp")},
            {col("metadata")}
        FROM measurements
        WHERE {col("logger_id")} = %(logger_id)s
          AND {col("timestamp")} >= NOW() - make_interval(days => %(days)s)
          AND {col("metadata")} IS NOT NULL
          AND {col("metadata")}::text LIKE '%%error%%'
        ORDER BY {col("timestamp")} DESC
    """
    return query, {}


# ============================================================
# TOOL 9: get_fleet_overview
# ============================================================
def build_fleet_power_query() -> str:
    """Query for fleet real-time power status."""
    return f"""
        SELECT
            COUNT(DISTINCT {col("logger_id")}) as "activeLoggers",
            SUM({col("power")}) as "totalPowerWatts",
            AVG({col("irradiance")}) as "avgIrradiance"
        FROM measurements
        WHERE {col("timestamp")} >= NOW() - INTERVAL '15 minutes'
    """


def build_fleet_energy_query() -> str:
    """Query for fleet daily energy total."""
    return f"""
        SELECT
            SUM("dailyKwh") as "totalDailyKwh"
        FROM (
            SELECT MAX({col("energy")}) as "dailyKwh"
            FROM measurements
            WHERE DATE({col("timestamp")}) = CURRENT_DATE
            GROUP BY {col("logger_id")}
        ) as daily_maxes
    """


def build_fleet_count_query() -> str:
    """Query for total registered device count."""
    return f'SELECT COUNT(DISTINCT {col("logger_id")}) as "totalCount" FROM measurements'
