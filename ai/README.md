# AI Service - Python FastMCP Server

Python 3.12 FastMCP server providing 10 MCP tools for solar analytics.

## Architecture

```
ai/
├── server.py           # FastMCP server entry point
├── config.py           # Pydantic settings configuration
├── database.py         # SQLAlchemy connection with pooling
├── tools/              # MCP tool implementations
│   ├── discovery.py    # list_loggers
│   ├── monitoring.py   # analyze_inverter_health, get_power_curve
│   ├── comparison.py   # compare_loggers
│   ├── financial.py    # calculate_financial_savings
│   ├── performance.py  # calculate_performance_ratio
│   ├── forecasting.py  # forecast_production
│   ├── diagnostics.py  # diagnose_error_codes
│   ├── fleet.py        # get_fleet_overview
│   └── health.py       # health_check
├── models/             # Pydantic request/response models
├── queries/            # SQL query builders
└── Dockerfile          # Python 3.12 container
```

## MCP Tools

| Tool | Category | Description |
|------|----------|-------------|
| `list_loggers` | Discovery | Find all available loggers |
| `get_fleet_overview` | Discovery | Site-wide aggregation |
| `analyze_inverter_health` | Monitoring | Detect daytime outages |
| `get_power_curve` | Monitoring | Timeseries data extraction |
| `compare_loggers` | Comparison | Multi-logger comparison |
| `calculate_financial_savings` | Financial | ROI and CO2 offset |
| `calculate_performance_ratio` | Performance | System efficiency check |
| `forecast_production` | Forecasting | 1-7 day prediction |
| `diagnose_error_codes` | Diagnostics | Error interpretation |
| `health_check` | Service | Database connectivity |

## Development

### Prerequisites
- Python 3.12+
- uv (package manager)

### Setup
```bash
cd ai
uv sync                   # Install dependencies
uv run python server.py   # Start server
```

### Docker
```bash
docker-compose up ai-service
```

Server runs on `http://localhost:4000/sse`

## Configuration

Environment variables (`.env`):

```env
DATABASE_URL=postgresql://admin:admin@localhost:5432/pv_db

# Analysis thresholds
ANOMALY_IRRADIANCE_THRESHOLD=50.0    # W/m²
RESAMPLE_INTERVAL=15min
MAX_DATA_POINTS=1000

# Financial calculations
CO2_PER_KWH=0.85                     # kg CO2 per kWh
DEFAULT_ELECTRICITY_RATE=0.20        # USD/kWh

# Performance ratio
REFERENCE_PANEL_EFFICIENCY=0.15
MAX_PERFORMANCE_RATIO=1.5

# Forecasting
FORECAST_MAX_DAYS=7
FORECAST_HISTORY_DAYS=14
```

## Key Dependencies

- `fastmcp` - MCP server framework
- `sqlalchemy` - Database ORM
- `pandas` - Data manipulation
- `numpy` - Numerical computations
- `pydantic-settings` - Configuration
- `tenacity` - Retry logic
- `structlog` - Structured logging

## Testing

```bash
uv run pytest                 # Run tests
uv run pytest --cov           # Coverage report
```

## SSE Transport

The server uses SSE (Server-Sent Events) transport at `/sse` endpoint.

Backend connects via `McpClient` in NestJS:
```typescript
const transport = new SSEClientTransport(new URL('http://localhost:4000/sse'));
```

See [CLAUDE.md](../CLAUDE.md) for architecture patterns and coding standards.
