"""Solar Analytics AI Service - FastMCP Server.

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

All SQL queries use double-quoted camelCase column names
to match TypeORM entity definitions in measurement.entity.ts.
"""

from fastmcp import FastMCP

from config import settings
from tools import register_tools

mcp = FastMCP(
    "solar-analyst",
    instructions="MCP tools for analyzing PV monitoring data",
)

# Register all tools from modular structure
register_tools(mcp)

if __name__ == "__main__":
    mcp.run(
        transport=settings.mcp_transport,
        host=settings.mcp_host,
        port=settings.mcp_port,
    )
