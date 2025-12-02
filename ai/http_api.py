"""HTTP REST API for solar-analyst tools.

Exposes all MCP tools as stateless HTTP POST endpoints.
This layer runs alongside FastMCP for HTTP-based clients (like NestJS).
"""

import json
import logging
from typing import Any

from starlette.applications import Starlette
from starlette.routing import Route
from starlette.requests import Request
from starlette.responses import JSONResponse
from starlette.middleware.cors import CORSMiddleware

from tools import (
    list_loggers,
    analyze_inverter_health,
    get_power_curve,
    compare_loggers,
    calculate_financial_savings,
    calculate_performance_ratio,
    forecast_production,
    diagnose_error_codes,
    get_fleet_overview,
    health_check,
)

logger = logging.getLogger(__name__)

# Tool registry mapping tool names to functions
TOOL_REGISTRY: dict[str, Any] = {
    "list_loggers": list_loggers,
    "analyze_inverter_health": analyze_inverter_health,
    "get_power_curve": get_power_curve,
    "compare_loggers": compare_loggers,
    "calculate_financial_savings": calculate_financial_savings,
    "calculate_performance_ratio": calculate_performance_ratio,
    "forecast_production": forecast_production,
    "diagnose_error_codes": diagnose_error_codes,
    "get_fleet_overview": get_fleet_overview,
    "health_check": health_check,
}

# Tool schemas for client discovery (matching original MCP tool definitions)
TOOL_SCHEMAS: dict[str, dict] = {
    "list_loggers": {
        "description": "List all available loggers/inverters in the system. Returns logger IDs, types, and data date ranges. Use this to discover valid logger IDs before calling other tools.",
        "parameters": {},
    },
    "analyze_inverter_health": {
        "description": "Analyze inverter health by detecting anomalies like daytime outages (power = 0 when irradiance > 50 W/m2).",
        "parameters": {
            "logger_id": {
                "type": "string",
                "description": "Logger/inverter serial number",
                "required": True,
            },
            "days": {
                "type": "integer",
                "description": "Number of days to analyze (1-365)",
                "default": 7,
            },
        },
    },
    "get_power_curve": {
        "description": "Get power and irradiance timeseries for a specific date. Returns data suitable for charting.",
        "parameters": {
            "logger_id": {
                "type": "string",
                "description": "Logger/inverter serial number",
                "required": True,
            },
            "date": {
                "type": "string",
                "description": "Date in YYYY-MM-DD format",
                "required": True,
            },
        },
    },
    "compare_loggers": {
        "description": "Compare multiple loggers on a specific metric for a given date. Returns merged timeseries data suitable for multi-line charts.",
        "parameters": {
            "logger_ids": {
                "type": "array",
                "items": {"type": "string"},
                "description": "List of logger IDs to compare (2-5)",
                "required": True,
            },
            "metric": {
                "type": "string",
                "description": "Metric to compare: 'power', 'energy', or 'irradiance'",
                "default": "power",
            },
            "date": {
                "type": "string",
                "description": "Date in YYYY-MM-DD format (optional)",
            },
        },
    },
    "calculate_financial_savings": {
        "description": "Calculate financial savings from solar generation. Returns money saved, CO2 offset, and trees equivalent.",
        "parameters": {
            "logger_id": {
                "type": "string",
                "description": "Logger/inverter serial number",
                "required": True,
            },
            "start_date": {
                "type": "string",
                "description": "Start date in YYYY-MM-DD format",
                "required": True,
            },
            "end_date": {
                "type": "string",
                "description": "End date in YYYY-MM-DD format (optional, defaults to today)",
            },
            "electricity_rate": {
                "type": "number",
                "description": "Electricity rate in $/kWh (default 0.20)",
                "default": 0.20,
            },
        },
    },
    "calculate_performance_ratio": {
        "description": "Calculate the Performance Ratio (efficiency) for a system on a given date.",
        "parameters": {
            "logger_id": {
                "type": "string",
                "description": "Logger/inverter serial number",
                "required": True,
            },
            "date": {
                "type": "string",
                "description": "Date in YYYY-MM-DD format",
                "required": True,
            },
            "capacity_kw": {
                "type": "number",
                "description": "Override system capacity in kW (optional, auto-inferred if not provided)",
            },
        },
    },
    "forecast_production": {
        "description": "Forecast energy production for upcoming days using historical average.",
        "parameters": {
            "logger_id": {
                "type": "string",
                "description": "Logger/inverter serial number",
                "required": True,
            },
            "days_ahead": {
                "type": "integer",
                "description": "Number of days to forecast (1-7)",
                "default": 1,
            },
        },
    },
    "diagnose_error_codes": {
        "description": "Diagnose system errors by scanning metadata for error codes. Returns human-readable descriptions and suggested fixes.",
        "parameters": {
            "logger_id": {
                "type": "string",
                "description": "Logger/inverter serial number",
                "required": True,
            },
            "days": {
                "type": "integer",
                "description": "Number of days to scan for errors (1-30)",
                "default": 7,
            },
        },
    },
    "get_fleet_overview": {
        "description": "Get high-level status of the entire solar fleet (site-wide). Returns total current power, total daily energy, and active device counts.",
        "parameters": {},
    },
    "health_check": {
        "description": "Check service health and database connectivity.",
        "parameters": {},
    },
}


async def call_tool(request: Request) -> JSONResponse:
    """Execute a tool by name with provided arguments."""
    tool_name = request.path_params["tool_name"]

    if tool_name not in TOOL_REGISTRY:
        return JSONResponse(
            {
                "success": False,
                "error": f"Unknown tool: {tool_name}",
                "available_tools": list(TOOL_REGISTRY.keys()),
            },
            status_code=404,
        )

    try:
        body = await request.json() if request.method == "POST" else {}
    except json.JSONDecodeError:
        body = {}

    tool_fn = TOOL_REGISTRY[tool_name]

    try:
        logger.info(f"Executing tool: {tool_name} with args: {body}")
        result = tool_fn(**body)
        logger.info(f"Tool {tool_name} executed successfully")
        return JSONResponse({"success": True, "result": result})
    except TypeError as e:
        logger.warning(f"Invalid parameters for tool {tool_name}: {e}")
        return JSONResponse(
            {"success": False, "error": f"Invalid parameters: {str(e)}"},
            status_code=400,
        )
    except Exception as e:
        logger.error(f"Tool {tool_name} failed: {e}")
        return JSONResponse(
            {"success": False, "error": str(e)},
            status_code=500,
        )


async def list_tools_endpoint(request: Request) -> JSONResponse:
    """Return available tools and their schemas."""
    return JSONResponse({"tools": TOOL_SCHEMAS})


async def api_health(request: Request) -> JSONResponse:
    """Health check endpoint."""
    try:
        result = health_check()
        status = "healthy" if result.get("status") == "healthy" else "degraded"
        return JSONResponse({"status": status, "service": "solar-analyst-http", "details": result})
    except Exception as e:
        return JSONResponse(
            {"status": "unhealthy", "service": "solar-analyst-http", "error": str(e)},
            status_code=503,
        )


# Define routes
routes = [
    Route("/health", api_health, methods=["GET"]),
    Route("/tools", list_tools_endpoint, methods=["GET"]),
    Route("/tools/{tool_name}", call_tool, methods=["POST"]),
]


def create_http_app() -> Starlette:
    """Create the HTTP API application."""
    app = Starlette(routes=routes)

    # Add CORS middleware for NestJS backend and frontend access
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["http://localhost:3000", "http://localhost:5173", "*"],
        allow_methods=["GET", "POST", "OPTIONS"],
        allow_headers=["*"],
    )

    return app
