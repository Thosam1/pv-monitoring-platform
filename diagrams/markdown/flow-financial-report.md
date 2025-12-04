# Financial Report Flow

Detailed flow diagram for the financial report workflow: savings calculation with optional logger selection and production forecast.

## Flow Graph

```mermaid
flowchart TB
    START((START))

    subgraph Step1["Step 1: Check Context"]
        CC["check_context node"]
        COND{{"selectedLoggerId<br/>in flowContext?"}}
    end

    subgraph Step2["Step 2: Select Logger"]
        SL["select_logger node"]
        T1["list_loggers()"]
        UI1["request_user_selection<br/>(dropdown)"]
        WAIT["Wait for user selection"]
    end

    subgraph Step3["Step 3: Calculate Savings"]
        CS["calculate_savings node"]
        T2["calculate_financial_savings<br/>(logger, 30 days)"]
        R2["SavingsResult"]
        REC{{"status?"}}
    end

    subgraph Step4["Step 4: Forecast"]
        FC["forecast node"]
        T3["forecast_production<br/>(logger, 7 days)"]
        R3["ForecastResult"]
    end

    subgraph Step5["Step 5: Render Report"]
        RR["render_report node"]
        NAR["NarrativeEngine.generate()"]
        UI2["render_ui_component<br/>(FinancialReport)"]
        SUG["Generate suggestions"]
    end

    RECOVERY["Recovery Subgraph"]
    END_NODE((END))

    START --> CC
    CC --> COND

    COND -->|"No"| SL
    COND -->|"Yes"| CS

    SL --> T1
    T1 --> UI1
    UI1 --> WAIT
    WAIT -->|"user selects"| CS

    CS --> T2
    T2 --> R2
    R2 --> REC

    REC -->|"ok"| FC
    REC -->|"no_data_in_window"| RECOVERY
    RECOVERY -->|"date selected"| CS

    FC --> T3
    T3 --> R3
    R3 --> RR

    RR --> NAR
    NAR --> UI2
    UI2 --> SUG
    SUG --> END_NODE

    style START fill:#22c55e,stroke:#16a34a,color:#fff
    style END_NODE fill:#ef4444,stroke:#dc2626,color:#fff
    style T1 fill:#3b82f6,stroke:#2563eb,color:#fff
    style T2 fill:#3b82f6,stroke:#2563eb,color:#fff
    style T3 fill:#3b82f6,stroke:#2563eb,color:#fff
    style UI1 fill:#f59e0b,stroke:#d97706,color:#fff
    style UI2 fill:#8b5cf6,stroke:#7c3aed,color:#fff
    style RECOVERY fill:#ec4899,stroke:#db2777,color:#fff
```

## Sequence Diagram

```mermaid
sequenceDiagram
    participant U as User
    participant R as Router
    participant FRF as FinancialReportFlow
    participant T as ToolsHttpClient
    participant NE as NarrativeEngine
    participant FE as Frontend

    U->>R: "How much did I save?"
    R->>FRF: activeFlow = financial_report

    rect rgb(254, 243, 199)
        Note over FRF: Step 1: Check Context
        alt No logger selected
            rect rgb(219, 234, 254)
                Note over FRF,FE: Step 2: Select Logger
                FRF->>T: list_loggers()
                T-->>FRF: { loggers[] }
                FRF->>FE: request_user_selection(dropdown)
                FE-->>U: Show logger dropdown
                U->>FE: Select "925"
                FE->>FRF: selectedLoggerId = "925"
            end
        end
    end

    rect rgb(220, 252, 231)
        Note over FRF,T: Step 3: Calculate Savings
        FRF->>T: calculate_financial_savings("925", 30d)
        T-->>FRF: { energyGenerated, savings, co2Offset, trees }
    end

    rect rgb(233, 213, 255)
        Note over FRF,T: Step 4: Forecast
        FRF->>T: forecast_production("925", 7d)
        T-->>FRF: { dailyForecasts[], totalForecast }
    end

    rect rgb(254, 226, 226)
        Note over FRF,FE: Step 5: Render Report
        FRF->>NE: generate(context)
        NE-->>FRF: { narrative }
        FRF->>FE: render_ui_component(FinancialReport)
        FRF->>FE: suggestions: ["Extend forecast", "Compare savings"]
    end

    FE-->>U: Display FinancialReport card
```

## Data Schemas

### SavingsResult
```typescript
interface SavingsResult {
  energyGenerated: number;    // kWh generated in period
  savings: number;            // $ saved
  co2Offset: number;          // kg CO2 avoided
  treesEquivalent: number;    // Trees equivalent
  periodStart: string;        // ISO date
  periodEnd: string;          // ISO date
  electricityRate: number;    // $/kWh used
}
```

### ForecastResult
```typescript
interface ForecastResult {
  dailyForecasts: {
    date: string;
    predicted: number;        // kWh
    low: number;              // Lower bound
    high: number;             // Upper bound
    confidence: number;       // 0-1
  }[];
  totalForecast: number;      // Total kWh
  methodology: string;        // Algorithm used
}
```

## Logger Selection UI

```mermaid
flowchart LR
    subgraph SelectionPrompt["Logger Selection"]
        PROMPT["'Select a logger to analyze:'"]
        DROP["Dropdown Component"]
        OPTS["Options grouped by type"]
    end

    subgraph Options["Grouped Options"]
        INV["Inverters<br/>- 925 (GoodWe)<br/>- 1001 (LTI)"]
        MET["Meteo Stations<br/>- 501 (MBMET)"]
    end

    PROMPT --> DROP
    DROP --> OPTS
    OPTS --> INV
    OPTS --> MET
```

## Recovery Handling

If `calculate_financial_savings` returns `no_data_in_window`:

```mermaid
flowchart TB
    ERR["status: no_data_in_window<br/>availableRange: 2024-12-01 to 2025-01-10"]

    REC["Recovery Subgraph"]
    DATE["request_user_selection<br/>(date-range picker)"]
    USER["User selects:<br/>2024-12-15 to 2025-01-10"]
    RETRY["Retry calculate_financial_savings<br/>with new date range"]

    ERR --> REC
    REC --> DATE
    DATE --> USER
    USER --> RETRY

    style ERR fill:#f59e0b,stroke:#d97706,color:#fff
    style REC fill:#ec4899,stroke:#db2777,color:#fff
```

## Generated Suggestions

| Scenario | Suggestions |
|----------|-------------|
| Forecast generated | "Extend forecast to 30 days", "Compare with other loggers" |
| High savings | "View power curve", "Check performance ratio" |
| Low savings | "Diagnose issues", "Check maintenance schedule" |
