"""Solar Analytics AI Service - Dual Transport Server.

Provides MCP tools for analyzing PV monitoring data via:
- HTTP REST API at /api/* (stateless, for NestJS backend)
- FastMCP SSE at /sse (legacy, for direct MCP clients)

Tools available:
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

import logging

import uvicorn
from starlette.applications import Starlette
from starlette.routing import Mount

from config import settings
from http_api import create_http_app

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


def create_app() -> Starlette:
    """Create the combined ASGI application with HTTP API."""
    http_app = create_http_app()

    # Mount HTTP API at /api
    app = Starlette(
        routes=[
            Mount("/api", app=http_app),
        ]
    )

    logger.info("Created HTTP API server")
    return app


if __name__ == "__main__":
    logger.info(f"Starting solar-analyst HTTP server on {settings.mcp_host}:{settings.mcp_port}")

    app = create_app()
    uvicorn.run(
        app,
        host=settings.mcp_host,
        port=settings.mcp_port,
    )
