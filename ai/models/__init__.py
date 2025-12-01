"""Pydantic models for solar-analyst MCP tools.

Contains request validation and response envelope models.
"""

from .enums import DataStatus
from .requests import (
    DateParam,
    LoggerIdParam,
    CompareLoggersParams,
    DateRangeParams,
)
from .responses import (
    # Shared
    AvailableRange,
    SummaryStats,
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
    # Enums
    "DataStatus",
    # Requests
    "DateParam",
    "LoggerIdParam",
    "CompareLoggersParams",
    "DateRangeParams",
    # Shared
    "AvailableRange",
    "SummaryStats",
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
