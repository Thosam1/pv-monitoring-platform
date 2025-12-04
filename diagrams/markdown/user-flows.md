# User Flows

User journey through the AI assistant's explicit workflows, showing entry points, decision points, tool executions, and UI component rendering.

```mermaid
flowchart TB
    subgraph Entry["User Entry Points"]
        U1["'Morning briefing'<br/>'How is the site?'"]
        U2["'Financial report'<br/>'How much did I save?'"]
        U3["'Compare inverters'<br/>'Performance audit'"]
        U4["'Check health'<br/>'Any problems?'"]
        U5["'Hello'<br/>'Good morning'"]
        U6["Other queries"]
    end

    subgraph Router["Intent Classification"]
        R[/"Router Node"/]
    end

    subgraph Flows["Workflow Execution"]
        MB["Morning Briefing Flow"]
        FR["Financial Report Flow"]
        PA["Performance Audit Flow"]
        HC["Health Check Flow"]
        GR["Greeting Flow"]
        FC["Free Chat Mode"]
    end

    subgraph Selection["User Selection Points"]
        SL["Select Logger<br/>(dropdown)"]
        SM["Select Multiple Loggers<br/>(2-5 checkboxes)"]
        SD["Select Date<br/>(date picker)"]
    end

    subgraph Tools["Tool Execution"]
        T1["get_fleet_overview"]
        T2["calculate_financial_savings"]
        T3["compare_loggers"]
        T4["analyze_inverter_health"]
        T5["diagnose_error_codes"]
        T6["forecast_production"]
    end

    subgraph UI["UI Components Rendered"]
        C1["FleetOverview Card"]
        C2["FinancialReport Card"]
        C3["ComparisonChart"]
        C4["HealthReport Card"]
        C5["DynamicChart"]
    end

    subgraph Followup["Follow-up Suggestions"]
        F1["'Check efficiency'"]
        F2["'Extend forecast'"]
        F3["'Compare energy'"]
        F4["'Show power curve'"]
    end

    U1 --> R
    U2 --> R
    U3 --> R
    U4 --> R
    U5 --> R
    U6 --> R

    R -->|"morning_briefing"| MB
    R -->|"financial_report"| FR
    R -->|"performance_audit"| PA
    R -->|"health_check"| HC
    R -->|"greeting"| GR
    R -->|"free_chat"| FC

    MB --> T1
    T1 --> C1
    C1 --> F1

    FR -->|"no logger"| SL
    SL --> T2
    FR -->|"has logger"| T2
    T2 --> T6
    T6 --> C2
    C2 --> F2

    PA --> SM
    SM --> T3
    T3 --> C3
    C3 --> F3

    HC -->|"no logger"| SL
    HC -->|"has logger"| T4
    HC -->|"'all devices'"| T4
    T4 --> C4
    C4 --> F4

    GR --> C1

    FC --> T5
    T5 --> C5

    style R fill:#3b82f6,stroke:#2563eb,color:#fff
    style SL fill:#f59e0b,stroke:#d97706,color:#fff
    style SM fill:#f59e0b,stroke:#d97706,color:#fff
    style SD fill:#f59e0b,stroke:#d97706,color:#fff
```

## User Journey Details

### Morning Briefing Journey
```mermaid
journey
    title Morning Briefing User Journey
    section Start
      User asks "Morning briefing": 5: User
      Router classifies intent: 5: System
    section Execution
      Fleet overview fetched: 5: System
      Critical alerts checked: 4: System
      Diagnostics run if issues: 3: System
    section Result
      FleetOverview card displayed: 5: User
      Suggestions shown: 4: User
      User clicks follow-up: 5: User
```

### Financial Report Journey
```mermaid
journey
    title Financial Report User Journey
    section Start
      User asks "How much did I save?": 5: User
      Router classifies intent: 5: System
    section Selection
      No logger in context: 3: System
      Dropdown shown to user: 4: User
      User selects logger: 5: User
    section Execution
      Savings calculated (30 days): 5: System
      Forecast generated (7 days): 5: System
    section Result
      FinancialReport card displayed: 5: User
      Savings, CO2, trees shown: 5: User
```

## Decision Points

| Flow | Decision Point | Options | Outcome |
|------|----------------|---------|---------|
| Financial Report | Logger selected? | Yes / No | Skip selection / Show dropdown |
| Health Check | Logger selected? | Yes / No | Skip selection / Show dropdown |
| Health Check | "All devices" intent? | Yes / No | Analyze all / Analyze single |
| Performance Audit | Loggers selected? | 2-5 selected | Proceed to compare |
| Any Flow | Tool returns no_data? | Yes / No | Show recovery / Show results |
