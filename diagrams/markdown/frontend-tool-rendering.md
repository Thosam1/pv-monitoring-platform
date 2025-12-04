# Frontend Tool Rendering

Component hierarchy and decision tree for rendering tool results in the AI chat interface.

## Component Hierarchy

```mermaid
flowchart TB
    subgraph View["AIChatView"]
        MRP["MyRuntimeProvider"]
    end

    subgraph Runtime["AssistantRuntimeProvider"]
        TL["ThreadList"]
        TH["Thread"]
    end

    subgraph Thread["Thread Component"]
        VP["ThreadPrimitive.Viewport"]
        MSGS["Messages"]
        COMP["Composer"]
    end

    subgraph Messages["Message Types"]
        UM["UserMessage"]
        AM["AssistantMessage"]
    end

    subgraph AssistantParts["AssistantMessage Parts"]
        TXT["MarkdownText"]
        TUI["ToolUI Components"]
        TYP["TypingIndicator"]
        SUG["Suggestions"]
    end

    subgraph ToolUIs["Registered ToolUIs"]
        SEL["SelectionTool"]
        RUI["RenderUITool"]
        PC["PowerCurveTool"]
        CL["CompareLoggersTool"]
        FC["ForecastTool"]
        FO["FleetOverviewTool"]
        HT["HealthTool"]
        FT["FinancialTool"]
        PT["PerformanceTool"]
    end

    View --> Runtime
    MRP --> TL
    MRP --> TH
    TH --> VP
    VP --> MSGS
    TH --> COMP
    MSGS --> UM
    MSGS --> AM
    AM --> TXT
    AM --> TUI
    AM --> TYP
    AM --> SUG
    TUI --> ToolUIs

    style View fill:#e0e7ff,stroke:#6366f1
    style Thread fill:#dbeafe,stroke:#3b82f6
    style ToolUIs fill:#d1fae5,stroke:#10b981
```

## Tool Visibility Decision

```mermaid
flowchart TB
    TOOL["Tool Call Received"]

    CHECK{{"Tool Name?"}}

    subgraph Visible["Visible Tools (Inline Render)"]
        V1["render_ui_component"]
        V2["request_user_selection"]
        V3["get_power_curve"]
        V4["compare_loggers"]
        V5["forecast_production"]
        V6["get_fleet_overview"]
    end

    subgraph Hidden["Hidden Tools (Debug Panel Only)"]
        H1["list_loggers"]
        H2["analyze_inverter_health"]
        H3["calculate_financial_savings"]
        H4["calculate_performance_ratio"]
        H5["diagnose_error_codes"]
    end

    TOOL --> CHECK

    CHECK -->|"render_ui_component"| V1
    CHECK -->|"request_user_selection"| V2
    CHECK -->|"get_power_curve"| V3
    CHECK -->|"compare_loggers"| V4
    CHECK -->|"forecast_production"| V5
    CHECK -->|"get_fleet_overview"| V6
    CHECK -->|"list_loggers"| H1
    CHECK -->|"analyze_inverter_health"| H2
    CHECK -->|"calculate_*"| H3
    CHECK -->|"diagnose_*"| H5

    V1 --> INLINE["Render Component"]
    V2 --> INLINE
    V3 --> INLINE
    V4 --> INLINE
    V5 --> INLINE
    V6 --> INLINE

    H1 --> DEBUG["Show 'Analyzing...'"]
    H2 --> DEBUG
    H3 --> DEBUG
    H5 --> DEBUG

    style Visible fill:#22c55e,stroke:#16a34a
    style Hidden fill:#f59e0b,stroke:#d97706
```

## ToolUI Registration

```mermaid
flowchart TB
    subgraph Thread["Thread.tsx"]
        REG["makeAssistantToolUI()"]
    end

    subgraph Registration["Tool Registration"]
        R1["toolName: 'request_user_selection'<br/>render: SelectionTool"]
        R2["toolName: 'render_ui_component'<br/>render: RenderUITool"]
        R3["toolName: 'get_power_curve'<br/>render: PowerCurveTool"]
        R4["toolName: 'compare_loggers'<br/>render: CompareLoggersTool"]
        R5["toolName: 'forecast_production'<br/>render: ForecastTool"]
    end

    subgraph Props["ToolUI Props"]
        ARGS["args: tool arguments"]
        RESULT["result: tool output"]
        STATUS["status: running | complete | error"]
    end

    REG --> Registration
    Registration --> Props

    style REG fill:#3b82f6,stroke:#2563eb,color:#fff
```

## Tool Rendering States

```mermaid
stateDiagram-v2
    [*] --> Running: tool-input-available

    Running --> Complete: tool-output-available
    Running --> Error: error event

    Complete --> [*]
    Error --> [*]

    state Running {
        [*] --> Spinner
        Spinner: Show loading spinner
        Spinner: "Loading data..."
    }

    state Complete {
        [*] --> Render
        Render: Render result component
        Render: Charts, cards, etc.
    }

    state Error {
        [*] --> ErrorUI
        ErrorUI: Red error box
        ErrorUI: "Try Again" button
    }
```

## Component Mapping

```mermaid
flowchart LR
    subgraph Tools["Tool Names"]
        T1["get_power_curve"]
        T2["compare_loggers"]
        T3["forecast_production"]
        T4["get_fleet_overview"]
        T5["request_user_selection"]
    end

    subgraph Components["UI Components"]
        C1["DynamicChart<br/>(composed)"]
        C2["DynamicChart<br/>(multi-line)"]
        C3["DynamicChart<br/>(bar)"]
        C4["MetricCards<br/>(4-grid)"]
        C5["SelectionPrompt<br/>(dropdown/date)"]
    end

    T1 --> C1
    T2 --> C2
    T3 --> C3
    T4 --> C4
    T5 --> C5

    style Tools fill:#3b82f6,stroke:#2563eb,color:#fff
    style Components fill:#8b5cf6,stroke:#7c3aed,color:#fff
```

## DynamicChart Types

```mermaid
flowchart TB
    subgraph ChartTypes["DynamicChart Component"]
        TYPE{{"chartType?"}}

        COMP["composed<br/>(Area + Line)"]
        LINE["line<br/>(Multi-series)"]
        BAR["bar<br/>(Daily values)"]
    end

    subgraph Usage["Tool Usage"]
        U1["get_power_curve:<br/>Power + Irradiance"]
        U2["compare_loggers:<br/>Multi-logger lines"]
        U3["forecast_production:<br/>Daily forecasts"]
    end

    TYPE -->|"composed"| COMP
    TYPE -->|"line"| LINE
    TYPE -->|"bar"| BAR

    COMP --> U1
    LINE --> U2
    BAR --> U3
```

## Selection Tool Flow

```mermaid
flowchart TB
    subgraph Input["Tool Input"]
        ARGS["args: {<br/>  prompt,<br/>  options,<br/>  inputType,<br/>  selectionType<br/>}"]
    end

    subgraph Render["SelectionTool"]
        TYPE{{"inputType?"}}
        DROP["Dropdown<br/>(single/multiple)"]
        DATE["DatePicker<br/>(single)"]
        RANGE["DateRangePicker"]
    end

    subgraph State["Component State"]
        SEL["selectedValue"]
        SUB["hasSubmitted"]
        DIS["isDisabled"]
    end

    subgraph Output["User Action"]
        MSG["Send message:<br/>'Selected: {value}'"]
    end

    ARGS --> TYPE
    TYPE -->|"dropdown"| DROP
    TYPE -->|"date"| DATE
    TYPE -->|"date-range"| RANGE

    DROP --> SEL
    DATE --> SEL
    RANGE --> SEL

    SEL -->|"submit"| SUB
    SUB --> DIS
    SUB --> MSG

    style DROP fill:#f59e0b,stroke:#d97706
    style DATE fill:#f59e0b,stroke:#d97706
    style RANGE fill:#f59e0b,stroke:#d97706
```

## Typing Indicator

```mermaid
flowchart TB
    subgraph Conditions["Show Typing Indicator?"]
        COND1["No text content yet"]
        COND2["No visible tool results"]
        COND3["Still streaming"]
    end

    subgraph Variants["Indicator Variants"]
        DEF["default:<br/>'Thinking...'<br/>✨ sparkles icon"]
        TOOL["tools:<br/>'Analyzing...'<br/>🔧 wrench icon"]
    end

    subgraph Animation["Animation"]
        BOUNCE["Bouncing dots"]
        PULSE["Icon pulse effect"]
    end

    COND1 --> DEF
    COND2 --> TOOL
    DEF --> Animation
    TOOL --> Animation

    style DEF fill:#fbbf24,stroke:#f59e0b
    style TOOL fill:#3b82f6,stroke:#2563eb
```

## Error Boundaries

```mermaid
flowchart TB
    subgraph Boundaries["Error Boundary Hierarchy"]
        VIEW["AIChatView Boundary"]
        MSG["Per-Message Boundary"]
        TOOL["Per-Tool Boundary"]
    end

    subgraph Fallbacks["Fallback UI"]
        F1["ThreadErrorFallback<br/>'Start New Conversation'"]
        F2["Message error state<br/>'Could not render'"]
        F3["Tool error box<br/>'Try Again' button"]
    end

    VIEW --> F1
    MSG --> F2
    TOOL --> F3

    style Boundaries fill:#ef4444,stroke:#dc2626
    style Fallbacks fill:#f59e0b,stroke:#d97706
```

## MetricCards Grid (FleetOverview)

```mermaid
flowchart TB
    subgraph Grid["4-Card Grid Layout"]
        C1["Total Power<br/>⚡ 45.2 kW<br/>green"]
        C2["Today's Energy<br/>🔋 312.5 kWh<br/>blue"]
        C3["Active Devices<br/>📡 8/8 online<br/>green"]
        C4["Avg Irradiance<br/>☀️ 850 W/m²<br/>yellow"]
    end

    subgraph Colors["Color Coding"]
        GREEN["green: Good/Normal"]
        YELLOW["yellow: Warning"]
        RED["red: Critical"]
        BLUE["blue: Info"]
    end

    C1 --> GREEN
    C2 --> BLUE
    C3 --> GREEN
    C4 --> YELLOW

    style C1 fill:#22c55e,stroke:#16a34a,color:#fff
    style C2 fill:#3b82f6,stroke:#2563eb,color:#fff
    style C3 fill:#22c55e,stroke:#16a34a,color:#fff
    style C4 fill:#f59e0b,stroke:#d97706,color:#fff
```
