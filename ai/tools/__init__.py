"""Tool registry for FastMCP server.

Exports all tool functions and provides a registration helper.
"""

from fastmcp import FastMCP

from .discovery import list_loggers
from .monitoring import analyze_inverter_health, get_power_curve
from .comparison import compare_loggers
from .financial import calculate_financial_savings
from .performance import calculate_performance_ratio
from .forecasting import forecast_production
from .diagnostics import diagnose_error_codes
from .fleet import get_fleet_overview
from .health import health_check


def register_tools(mcp: FastMCP) -> None:
    """Register all tools with the MCP server.

    Args:
        mcp: FastMCP server instance
    """
    mcp.tool(list_loggers)
    mcp.tool(analyze_inverter_health)
    mcp.tool(get_power_curve)
    mcp.tool(compare_loggers)
    mcp.tool(calculate_financial_savings)
    mcp.tool(calculate_performance_ratio)
    mcp.tool(forecast_production)
    mcp.tool(diagnose_error_codes)
    mcp.tool(get_fleet_overview)
    mcp.tool(health_check)


__all__ = [
    "register_tools",
    "list_loggers",
    "analyze_inverter_health",
    "get_power_curve",
    "compare_loggers",
    "calculate_financial_savings",
    "calculate_performance_ratio",
    "forecast_production",
    "diagnose_error_codes",
    "get_fleet_overview",
    "health_check",
]
