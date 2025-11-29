"""Pydantic models for solar-analyst MCP tools.

Contains request validation and response envelope models.
"""

from .requests import (
    DateParam,
    LoggerIdParam,
    CompareLoggersParams,
    DateRangeParams,
)
from .responses import (
    # Discovery
    LoggerInfo,
    LoggerListResponse,
    # Monitoring
    AnomalyPoint,
    AnomalyReportResponse,
    PowerCurvePoint,
    PowerCurveResponse,
    # Comparison
    ComparisonResponse,
    # Financial
    FinancialPeriod,
    FinancialReportResponse,
    # Performance
    PerformanceMetrics,
    PerformanceReportResponse,
    # Forecasting
    ForecastHistoricalStats,
    ForecastDay,
    ProductionForecastResponse,
    # Diagnostics
    DiagnosticIssue,
    DiagnosticsReportResponse,
    # Fleet
    FleetStatus,
    FleetProduction,
    FleetOverviewResponse,
)

__all__ = [
    # Requests
    "DateParam",
    "LoggerIdParam",
    "CompareLoggersParams",
    "DateRangeParams",
    # Discovery
    "LoggerInfo",
    "LoggerListResponse",
    # Monitoring
    "AnomalyPoint",
    "AnomalyReportResponse",
    "PowerCurvePoint",
    "PowerCurveResponse",
    # Comparison
    "ComparisonResponse",
    # Financial
    "FinancialPeriod",
    "FinancialReportResponse",
    # Performance
    "PerformanceMetrics",
    "PerformanceReportResponse",
    # Forecasting
    "ForecastHistoricalStats",
    "ForecastDay",
    "ProductionForecastResponse",
    # Diagnostics
    "DiagnosticIssue",
    "DiagnosticsReportResponse",
    # Fleet
    "FleetStatus",
    "FleetProduction",
    "FleetOverviewResponse",
]
