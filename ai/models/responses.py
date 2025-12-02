"""Pydantic models for MCP tool responses.

Type-safe response envelopes for all 9 solar-analyst tools.
Each tool returns a specific response model that can be serialized with .model_dump().

All response models include an optional `context` field for user-friendly
summaries, insights, and next-step recommendations.
"""

from typing import Optional

from pydantic import BaseModel

from models.context import ContextEnvelope


# ============================================================
# TOOL 1: list_loggers - Discovery
# ============================================================
class LoggerInfo(BaseModel):
    """Single logger entry in the logger list."""

    loggerId: str
    loggerType: str
    earliestData: Optional[str] = None
    latestData: Optional[str] = None
    recordCount: int


class LoggerListResponse(BaseModel):
    """Response for list_loggers tool."""

    type: str = "logger_list"
    count: int
    loggers: list[LoggerInfo]
    context: Optional[ContextEnvelope] = None


# ============================================================
# Shared: Available Data Range (for smart recovery)
# ============================================================
class AvailableRange(BaseModel):
    """Available data range for smart recovery when no data in requested window.

    For NO_DATA status, both start and end will be None.
    For NO_DATA_IN_WINDOW status, both will contain valid dates.
    """

    start: Optional[str] = None
    end: Optional[str] = None


# ============================================================
# Shared: Summary Statistics (for narrative insights)
# ============================================================
class SummaryStats(BaseModel):
    """Lightweight stats for AI narrative generation.

    Enables the LLM to provide consultant-quality insights
    without computing statistics from raw timeseries data.
    """

    peakValue: Optional[float] = None  # Maximum value (W)
    peakTime: Optional[str] = None  # HH:MM format
    avgValue: Optional[float] = None  # Average over period
    totalEnergy: Optional[float] = None  # kWh (for power curves)
    trend: Optional[str] = None  # "rising" | "falling" | "stable"


# ============================================================
# TOOL 2: analyze_inverter_health - Anomaly Detection
# ============================================================
class AnomalyPoint(BaseModel):
    """Single anomaly data point."""

    timestamp: str
    activePowerWatts: Optional[float] = None
    irradiance: Optional[float] = None
    reason: str


class AnomalyReportResponse(BaseModel):
    """Response for analyze_inverter_health tool."""

    type: str = "anomaly_report"
    loggerId: str
    status: Optional[str] = None  # "ok", "no_data", "no_data_in_window"
    availableRange: Optional[AvailableRange] = None  # For smart recovery
    daysAnalyzed: Optional[int] = None
    totalRecords: Optional[int] = None
    anomalyCount: Optional[int] = None
    points: list[AnomalyPoint]
    message: Optional[str] = None
    context: Optional[ContextEnvelope] = None


# ============================================================
# TOOL 3: get_power_curve - Timeseries
# ============================================================
class PowerCurvePoint(BaseModel):
    """Single power curve data point."""

    timestamp: str
    power: Optional[float] = None
    irradiance: Optional[float] = None


class PowerCurveResponse(BaseModel):
    """Response for get_power_curve tool."""

    type: str = "timeseries"
    loggerId: str
    date: str
    status: Optional[str] = None  # "ok", "no_data", "no_data_in_window"
    availableRange: Optional[AvailableRange] = None  # For smart recovery
    recordCount: Optional[int] = None
    data: list[PowerCurvePoint]
    summaryStats: Optional[SummaryStats] = None  # For narrative insights
    message: Optional[str] = None
    context: Optional[ContextEnvelope] = None


# ============================================================
# TOOL 4: compare_loggers - Comparison
# ============================================================
class ComparisonResponse(BaseModel):
    """Response for compare_loggers tool.

    Note: data is a list of dicts because columns are dynamic (logger IDs).
    """

    type: str = "comparison"
    metric: str
    loggerIds: list[str]
    date: Optional[str] = None
    status: Optional[str] = None  # "ok", "no_data", "no_data_in_window"
    availableRange: Optional[AvailableRange] = None  # For smart recovery
    recordCount: Optional[int] = None
    data: list[dict]
    message: Optional[str] = None
    context: Optional[ContextEnvelope] = None


# ============================================================
# TOOL 5: calculate_financial_savings - Financial
# ============================================================
class FinancialPeriod(BaseModel):
    """Period range for financial calculation."""

    start: str
    end: str


class FinancialReportResponse(BaseModel):
    """Response for calculate_financial_savings tool."""

    type: str = "financial_report"
    loggerId: str
    period: FinancialPeriod
    daysWithData: Optional[int] = None
    totalEnergyKwh: Optional[float] = None
    electricityRateUsd: Optional[float] = None
    savingsUsd: Optional[float] = None
    co2OffsetKg: Optional[float] = None
    treesEquivalent: Optional[float] = None
    summary: Optional[str] = None
    message: Optional[str] = None
    context: Optional[ContextEnvelope] = None


# ============================================================
# TOOL 6: calculate_performance_ratio - Performance
# ============================================================
class PerformanceMetrics(BaseModel):
    """Detailed performance metrics."""

    avgPowerWatts: float
    peakPowerWatts: float
    avgIrradiance: float
    dataPoints: int


class PerformanceReportResponse(BaseModel):
    """Response for calculate_performance_ratio tool."""

    type: str = "performance_report"
    loggerId: str
    date: str
    inferredCapacityKw: Optional[float] = None
    performanceRatio: Optional[float] = None
    status: Optional[str] = None
    availableRange: Optional[AvailableRange] = None  # For smart recovery
    metrics: Optional[PerformanceMetrics] = None
    interpretation: Optional[str] = None
    message: Optional[str] = None
    context: Optional[ContextEnvelope] = None


# ============================================================
# TOOL 7: forecast_production - Forecasting
# ============================================================
class ForecastHistoricalStats(BaseModel):
    """Historical statistics used for forecasting."""

    averageKwh: float
    stdDevKwh: float
    minKwh: float
    maxKwh: float


class ForecastDay(BaseModel):
    """Single day forecast."""

    date: str
    expectedKwh: float
    rangeMin: float
    rangeMax: float
    confidence: str


class ProductionForecastResponse(BaseModel):
    """Response for forecast_production tool."""

    type: str = "production_forecast"
    loggerId: str
    method: Optional[str] = None
    basedOnDays: Optional[int] = None
    historicalStats: Optional[ForecastHistoricalStats] = None
    forecasts: Optional[list[ForecastDay]] = None
    summary: Optional[str] = None
    message: Optional[str] = None
    context: Optional[ContextEnvelope] = None


# ============================================================
# TOOL 8: diagnose_error_codes - Diagnostics
# ============================================================
class DiagnosticIssue(BaseModel):
    """Single diagnostic issue entry."""

    code: str
    description: str
    severity: str
    occurrences: int
    firstSeen: str
    lastSeen: str
    suggestedFix: str


class DiagnosticsReportResponse(BaseModel):
    """Response for diagnose_error_codes tool."""

    type: str = "diagnostics_report"
    loggerId: str
    loggerType: Optional[str] = None
    period: Optional[str] = None
    overallHealth: Optional[str] = None
    issueCount: Optional[int] = None
    issues: Optional[list[DiagnosticIssue]] = None
    summary: Optional[str] = None
    message: Optional[str] = None
    context: Optional[ContextEnvelope] = None


# ============================================================
# TOOL 9: get_fleet_overview - Fleet Status
# ============================================================
class FleetStatus(BaseModel):
    """Fleet status summary."""

    totalLoggers: int
    activeLoggers: int
    percentOnline: float
    fleetHealth: str


class FleetProduction(BaseModel):
    """Fleet production metrics."""

    currentTotalPowerWatts: float
    todayTotalEnergyKwh: float
    siteAvgIrradiance: float


class FleetOverviewResponse(BaseModel):
    """Response for get_fleet_overview tool."""

    type: str = "fleet_overview"
    timestamp: str
    status: FleetStatus
    production: FleetProduction
    summary: str
    context: Optional[ContextEnvelope] = None


# ============================================================
# TOOL 10: health_check - Service Health
# ============================================================
class DatabasePoolStats(BaseModel):
    """Database connection pool statistics."""

    pool_size: int
    checked_in: int
    checked_out: int
    overflow: int


class HealthCheckResponse(BaseModel):
    """Response for health_check tool."""

    type: str = "health_check"
    status: str  # "healthy" or "degraded"
    database: str  # "healthy" or error message
    pool_stats: Optional[DatabasePoolStats] = None
