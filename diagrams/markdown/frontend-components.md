# Frontend Components

React frontend component hierarchy showing App, Layout, Views, Dashboard, Charts, and AI Chat components with @assistant-ui integration.

```mermaid
flowchart TB
    App[App.tsx]

    App --> Layout
    App --> Views

    subgraph Layout["Layout"]
        Sidebar[AppSidebar]
        Header[SiteHeader]
    end

    subgraph Views["Views"]
        Dashboard[DashboardContent]
        Upload[BulkUploader]
        AIChat[AIChatView]
    end

    Dashboard --> Charts
    Dashboard --> KPI[KPIGrid]

    subgraph Charts["Charts"]
        Perf[PerformanceChart]
        Tech[TechnicalChart]
        Gen[GeneratorPowerChart]
    end

    AIChat --> Runtime
    subgraph Runtime["AssistantRuntime Provider"]
        MRP[MyRuntimeProvider]
        Adapter[SolarAnalystModelAdapter]
    end

    MRP --> Thread
    subgraph Thread["Thread Components"]
        ThreadList[ThreadList]
        ThreadComp[Thread]
        Composer[ThreadComposer]
    end

    ThreadComp --> Messages
    subgraph Messages["Message Parts"]
        UserMsg[UserMessage]
        AssistantMsg[AssistantMessage]
    end

    AssistantMsg --> ToolUIs
    subgraph ToolUIs["Tool Renderers (9)"]
        TU1[SelectionTool]
        TU2[RenderUITool]
        TU3[HealthTool]
        TU4[PowerCurveTool]
        TU5[ForecastTool]
        TU6[FinancialTool]
        TU7[PerformanceTool]
        TU8[FleetOverviewTool]
        TU9[CompareLoggersTool]
    end

    style Runtime fill:#e0e7ff,stroke:#6366f1
    style ToolUIs fill:#d1fae5,stroke:#10b981
```

## Tool Renderer Details

| Tool | Component | Renders |
|------|-----------|---------|
| `request_user_selection` | SelectionTool | Dropdown, DatePicker |
| `render_ui_component` | RenderUITool | Dynamic component dispatch |
| `analyze_inverter_health` | HealthTool | HealthReport card |
| `get_power_curve` | PowerCurveTool | Composed chart |
| `forecast_production` | ForecastTool | Bar chart |
| `calculate_financial_savings` | FinancialTool | Savings card |
| `calculate_performance_ratio` | PerformanceTool | Metrics card |
| `get_fleet_overview` | FleetOverviewTool | 4-card grid |
| `compare_loggers` | CompareLoggersTool | Multi-line chart |

## Runtime Architecture

```mermaid
flowchart LR
    subgraph Provider["MyRuntimeProvider"]
        Adapter[SolarAnalystModelAdapter]
        Storage[localStorage persistence]
    end

    subgraph Adapter["Model Adapter"]
        SSE[SSE Stream Handler]
        Parse[parseSSEStream()]
        State[StreamState]
    end

    subgraph Events["SSE Events"]
        E1[text-delta]
        E2[tool-input-available]
        E3[tool-output-available]
    end

    Events --> Parse
    Parse --> State
    State --> Adapter

    style Provider fill:#e0e7ff,stroke:#6366f1
```
