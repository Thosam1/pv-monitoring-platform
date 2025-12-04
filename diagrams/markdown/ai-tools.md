# AI Tools

MCP tools hierarchy diagram showing the Python FastMCP server with tool categories, pass-through tools for UI rendering, and tool-to-component mapping.

## Tool Categories

```mermaid
flowchart TB
    subgraph Backend["Python Tools API (port 4000)"]
        API["/api/tools"]
    end

    subgraph Discovery["Discovery Tools"]
        T1["list_loggers<br/>Get all logger IDs with date ranges"]
        T2["get_fleet_overview<br/>Site-wide aggregation"]
    end

    subgraph Monitoring["Monitoring Tools"]
        T3["analyze_inverter_health<br/>Anomaly detection (N days)"]
        T4["get_power_curve<br/>Timeseries for specific date"]
        T5["compare_loggers<br/>Multi-logger comparison"]
    end

    subgraph Financial["Financial Tools"]
        T6["calculate_financial_savings<br/>Savings, CO2, trees"]
        T7["calculate_performance_ratio<br/>System efficiency"]
        T8["forecast_production<br/>Future energy prediction"]
    end

    subgraph Diagnostics["Diagnostic Tools"]
        T9["diagnose_error_codes<br/>Error interpretation"]
        T10["health_check<br/>Database connectivity"]
    end

    subgraph PassThrough["Pass-Through Tools (No Backend Execution)"]
        T11["render_ui_component<br/>Charts, cards, reports"]
        T12["request_user_selection<br/>Dropdowns, date pickers"]
    end

    API --> Discovery
    API --> Monitoring
    API --> Financial
    API --> Diagnostics

    style PassThrough fill:#f59e0b,stroke:#d97706
    style Discovery fill:#3b82f6,stroke:#2563eb
    style Monitoring fill:#22c55e,stroke:#16a34a
    style Financial fill:#8b5cf6,stroke:#7c3aed
    style Diagnostics fill:#ef4444,stroke:#dc2626
```

## Tool Visibility

```mermaid
flowchart LR
    subgraph Hidden["Hidden Tools (Data Fetching)"]
        H1["list_loggers"]
        H2["analyze_inverter_health"]
        H3["calculate_financial_savings"]
        H4["calculate_performance_ratio"]
        H5["diagnose_error_codes"]
    end

    subgraph Visible["Visible Tools (Inline Render)"]
        V1["render_ui_component"]
        V2["request_user_selection"]
        V3["get_power_curve"]
        V4["compare_loggers"]
        V5["forecast_production"]
        V6["get_fleet_overview"]
    end

    subgraph UI["Frontend Display"]
        DEBUG["'Analyzing...'<br/>indicator only"]
        RENDER["Full component<br/>rendering"]
    end

    Hidden --> DEBUG
    Visible --> RENDER

    style Hidden fill:#6b7280,stroke:#4b5563,color:#fff
    style Visible fill:#22c55e,stroke:#16a34a,color:#fff
```

## Tool to Component Mapping

```mermaid
flowchart TB
    subgraph Tools["Tool Outputs"]
        T1["get_power_curve"]
        T2["compare_loggers"]
        T3["forecast_production"]
        T4["get_fleet_overview"]
        T5["analyze_inverter_health"]
        T6["calculate_financial_savings"]
        T7["request_user_selection"]
    end

    subgraph Components["UI Components"]
        C1["DynamicChart<br/>(composed: Area + Line)"]
        C2["DynamicChart<br/>(line: Multi-series)"]
        C3["DynamicChart<br/>(bar: Daily values)"]
        C4["MetricCards<br/>(4-card grid)"]
        C5["HealthReport<br/>(Anomaly table)"]
        C6["FinancialReport<br/>(Savings + forecast)"]
        C7["SelectionPrompt<br/>(Dropdown/DatePicker)"]
    end

    T1 --> C1
    T2 --> C2
    T3 --> C3
    T4 --> C4
    T5 --> C5
    T6 --> C6
    T7 --> C7

    style Tools fill:#3b82f6,stroke:#2563eb,color:#fff
    style Components fill:#8b5cf6,stroke:#7c3aed,color:#fff
```

## Pass-Through Tool Flow

```mermaid
sequenceDiagram
    participant LG as LangGraph
    participant API as Controller
    participant FE as Frontend

    Note over LG,FE: Pass-through tools skip backend execution

    LG->>API: pendingUiActions: [{<br/>  toolName: "render_ui_component",<br/>  args: { component: "FleetOverview", props: {...} }<br/>}]

    API->>FE: SSE: tool-input-available
    Note over API: Args ARE the result
    API->>FE: SSE: tool-output-available

    FE->>FE: Render FleetOverview component
```

## Tool Response Schema

```mermaid
flowchart TB
    subgraph Response["ToolResponse<T>"]
        STATUS["status: 'ok' | 'no_data_in_window' | 'no_data' | 'error'"]
        RESULT["result: T (typed data)"]
        RANGE["availableRange?: { start, end }"]
        MSG["message?: string"]
    end

    subgraph StatusActions["Status-Based Actions"]
        OK["Display result"]
        NDW["Show date picker"]
        ND["Suggest alternatives"]
        ERR["Show error message"]
    end

    STATUS -->|"ok"| OK
    STATUS -->|"no_data_in_window"| NDW
    STATUS -->|"no_data"| ND
    STATUS -->|"error"| ERR

    style OK fill:#22c55e,stroke:#16a34a,color:#fff
    style NDW fill:#f59e0b,stroke:#d97706,color:#fff
    style ERR fill:#ef4444,stroke:#dc2626,color:#fff
```

## Tool Parameters Summary

| Tool | Required Params | Optional Params | Returns |
|------|-----------------|-----------------|---------|
| `list_loggers` | - | - | Logger[] with date ranges |
| `get_fleet_overview` | - | - | Power, energy, % online |
| `analyze_inverter_health` | `logger_id` | `days` (default: 7) | Anomalies, health score |
| `get_power_curve` | `logger_id`, `date` | - | Timeseries + summaryStats |
| `compare_loggers` | `logger_ids[]`, `metric` | `date` | Multi-logger data |
| `calculate_financial_savings` | `logger_id` | `start_date`, `end_date`, `rate` | Savings, CO2, trees |
| `calculate_performance_ratio` | `logger_id`, `date` | `capacity_kw` | Efficiency metrics |
| `forecast_production` | `logger_id` | `days_ahead` (default: 7) | Daily forecasts |
| `diagnose_error_codes` | `logger_id` | `days` (default: 7) | Error interpretations |
| `render_ui_component` | `component`, `props` | `suggestions` | (pass-through) |
| `request_user_selection` | `prompt`, `inputType` | `options`, `flowHint` | (pass-through) |

## Related Diagrams

- [LangGraph Main Graph](./langgraph-main-graph.md) - How tools integrate with flows
- [Frontend Tool Rendering](./frontend-tool-rendering.md) - UI component hierarchy
- [Recovery Subgraph](./recovery-subgraph.md) - Error handling with status codes
