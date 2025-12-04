# AI Service - Python Tools API

Python 3.12 service providing 10 solar analytics tools via HTTP REST API.

## Architecture

![AI Tools](../diagrams/svg/ai-tools.svg)

![AI Chat Flow](../diagrams/svg/ai-chat-flow.svg)

```
ai/
├── server.py           # ASGI server entry point (Uvicorn)
├── http_api.py         # HTTP REST endpoints and tool registry
├── config.py           # Pydantic settings configuration
├── database.py         # SQLAlchemy connection with pooling
├── tools/              # Tool implementations by domain
├── models/             # Pydantic request/response models
├── queries/            # SQL query builders
└── Dockerfile          # Python 3.12 container
```

## Architectural Decisions

### 1. Stateless HTTP REST
Tools exposed via simple HTTP POST (not SSE/WebSocket).
- Lower complexity than streaming protocols
- Stateless = horizontally scalable
- NestJS backend calls tools via `ToolsHttpClient`

### 2. Time-Agnostic Design
Uses **anchor date** pattern instead of `NOW()` for all date range queries:
```python
anchor_date = get_anchor_date()  # MAX(timestamp) from measurements
```
- Historical demo data works without modification
- "Last 7 days" computes from latest data, not current time

### 3. Smart Recovery Status Codes
All tools return a `status` field enabling intelligent error recovery:

| Status | Meaning | Response Includes |
|--------|---------|-------------------|
| `ok` | Success | Full result data |
| `no_data_in_window` | Data exists, but not in range | `availableRange: { start, end }` |
| `no_data` | Logger has no data | `availableRange: { start: null, end: null }` |
| `error` | Execution failed | `message` with details |

The AI agent uses `availableRange` to constrain date pickers to valid dates.

### 4. SummaryStats for Narrative Insights
Tools return pre-computed statistics for LLM-generated narratives:
```json
{
  "summaryStats": {
    "peakValue": 5200,
    "peakTime": "2025-01-10T12:30:00Z",
    "avgValue": 3150,
    "trend": "increasing"
  }
}
```
LLM generates: "Production peaked at 5.2 kW around 12:30 PM, with an upward trend."

### 5. Context Envelope
Responses include UX guidance for frontend rendering:
- `uiHints`: Suggested component types (line_chart, kpi_card)
- `insights`: Domain-specific observations with severity
- `nextSteps`: Recommended follow-up actions with priorities

## HTTP API

Tools exposed via stateless HTTP REST.

### Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/health` | Service health check |
| `GET` | `/api/tools` | List all tool schemas (OpenAPI format) |
| `POST` | `/api/tools/{tool_name}` | Execute a specific tool |

### Example: Execute Tool

```bash
# List available loggers
curl -X POST http://localhost:4000/api/tools/list_loggers

# Analyze inverter health
curl -X POST http://localhost:4000/api/tools/analyze_inverter_health \
  -H "Content-Type: application/json" \
  -d '{"logger_id": "925", "days": 7}'

# Get power curve for a specific date
curl -X POST http://localhost:4000/api/tools/get_power_curve \
  -H "Content-Type: application/json" \
  -d '{"logger_id": "925", "date": "2025-01-10"}'
```

## MCP Tools

| Tool | Category | Description |
|------|----------|-------------|
| `list_loggers` | Discovery | Find all available loggers with date ranges |
| `get_fleet_overview` | Discovery | Site-wide aggregation (power, energy, device status) |
| `analyze_inverter_health` | Monitoring | Detect daytime outages and anomalies |
| `get_power_curve` | Monitoring | Timeseries data extraction with summaryStats |
| `compare_loggers` | Comparison | Multi-logger comparison (2-5 loggers) |
| `calculate_financial_savings` | Financial | ROI, savings, and CO2 offset calculation |
| `calculate_performance_ratio` | Performance | System efficiency check |
| `forecast_production` | Forecasting | 1-7 day production prediction |
| `diagnose_error_codes` | Diagnostics | Error code interpretation by logger type |
| `health_check` | Service | Database connectivity and pool stats |

## Development

### Prerequisites
- Python 3.12+
- uv (package manager)

### Setup
```bash
cd ai
uv sync                   # Install dependencies
uv run python server.py   # Start server (port 4000)
```

### Docker
```bash
docker-compose up ai-service
```

Server runs on `http://localhost:4000`

## Configuration

Environment variables (`.env` or `SOLAR_` prefix):

```env
# Database
DATABASE_URL=postgresql://admin:admin@localhost:5432/pv_db

# Analysis thresholds
SOLAR_ANOMALY_IRRADIANCE_THRESHOLD=50.0    # W/m² (below = no sunlight expected)
SOLAR_RESAMPLE_INTERVAL=15min
SOLAR_MAX_DATA_POINTS=1000

# Financial calculations
SOLAR_CO2_PER_KWH=0.85                     # kg CO2 per kWh avoided
SOLAR_DEFAULT_ELECTRICITY_RATE=0.20        # USD/kWh

# Performance ratio
SOLAR_REFERENCE_PANEL_EFFICIENCY=0.15      # 15% typical
SOLAR_MAX_PERFORMANCE_RATIO=1.5            # Cap at 150%

# Forecasting
SOLAR_FORECAST_MAX_DAYS=7
SOLAR_FORECAST_HISTORY_DAYS=14

# Fleet monitoring
SOLAR_FLEET_ACTIVE_THRESHOLD_MINUTES=15    # Devices active in last 15 min

# Server
SOLAR_MCP_HOST=0.0.0.0
SOLAR_MCP_PORT=4000
```

## Key Dependencies

- `starlette` - ASGI framework for HTTP routing
- `uvicorn` - ASGI server
- `sqlalchemy` - Database ORM
- `pandas` - Data manipulation and analysis
- `numpy` - Numerical computations
- `pydantic-settings` - Configuration management
- `tenacity` - Retry logic with exponential backoff
- `structlog` - Structured JSON logging

## Testing

```bash
uv run pytest                 # Run tests
uv run pytest --cov           # Coverage report
```

## Backend Integration

The NestJS backend connects via `ToolsHttpClient`:

```typescript
// backend/src/ai/tools-http.client.ts
const response = await fetch(`${MCP_SERVER_URL}/api/tools/${toolName}`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(params)
});
```

## Related Documentation

- [Backend AI Orchestration](../backend/src/ai/README.md) - LangGraph flow orchestration
- [Recovery Subgraph](../diagrams/svg/recovery-subgraph.svg) - Error handling flow
- [AI_UX_FLOWS.md](../AI_UX_FLOWS.md) - Complete architecture documentation
- [CLAUDE.md](../CLAUDE.md) - Coding standards and patterns
