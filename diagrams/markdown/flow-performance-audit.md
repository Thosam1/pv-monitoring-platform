# Performance Audit Flow

Detailed flow diagram for the performance audit workflow: multi-logger comparison with metric selection and best/worst performer analysis.

## Flow Graph

```mermaid
flowchart TB
    START((START))

    subgraph Step1["Step 1: Discover Loggers"]
        DL["discover_loggers node"]
        T1["list_loggers()"]
        R1["Available loggers list"]
    end

    subgraph Step2["Step 2: Select Loggers"]
        SL["select_loggers node"]
        UI1["request_user_selection<br/>(multiple, 2-5)"]
        WAIT["Wait for user selection"]
        VAL{{"2-5 loggers<br/>selected?"}}
    end

    subgraph Step3["Step 3: Compare"]
        CMP["compare node"]
        T2["compare_loggers<br/>(selected, 'power', latest)"]
        R2["ComparisonResult"]
        REC{{"status?"}}
    end

    subgraph Step4["Step 4: Analyze & Render"]
        AN["analyze node"]
        BEST["computeBestPerformer()"]
        WORST["computeWorstPerformer()"]
        SPREAD["computeSpreadPercent()"]
        SEV["computeComparisonSeverity()"]
        UI2["render_ui_component<br/>(ComparisonChart)"]
        SUG["Generate suggestions"]
    end

    RECOVERY["Recovery Subgraph"]
    END_NODE((END))

    START --> DL
    DL --> T1
    T1 --> R1
    R1 --> SL

    SL --> UI1
    UI1 --> WAIT
    WAIT --> VAL

    VAL -->|"Yes"| CMP
    VAL -->|"No (< 2)"| UI1

    CMP --> T2
    T2 --> R2
    R2 --> REC

    REC -->|"ok"| AN
    REC -->|"no_data_in_window"| RECOVERY
    RECOVERY -->|"date selected"| CMP

    AN --> BEST
    AN --> WORST
    AN --> SPREAD
    AN --> SEV
    BEST --> UI2
    WORST --> UI2
    SPREAD --> UI2
    SEV --> UI2
    UI2 --> SUG
    SUG --> END_NODE

    style START fill:#22c55e,stroke:#16a34a,color:#fff
    style END_NODE fill:#ef4444,stroke:#dc2626,color:#fff
    style T1 fill:#3b82f6,stroke:#2563eb,color:#fff
    style T2 fill:#3b82f6,stroke:#2563eb,color:#fff
    style UI1 fill:#f59e0b,stroke:#d97706,color:#fff
    style UI2 fill:#8b5cf6,stroke:#7c3aed,color:#fff
    style RECOVERY fill:#ec4899,stroke:#db2777,color:#fff
```

## Sequence Diagram

```mermaid
sequenceDiagram
    participant U as User
    participant R as Router
    participant PAF as PerformanceAuditFlow
    participant T as ToolsHttpClient
    participant FE as Frontend

    U->>R: "Compare my inverters"
    R->>PAF: activeFlow = performance_audit

    rect rgb(219, 234, 254)
        Note over PAF,T: Step 1: Discover Loggers
        PAF->>T: list_loggers()
        T-->>PAF: { loggers: [{id, type, range}...] }
    end

    rect rgb(254, 243, 199)
        Note over PAF,FE: Step 2: Select Loggers
        PAF->>FE: request_user_selection(multiple, 2-5)
        FE-->>U: Show multi-select checkboxes
        U->>FE: Select "925", "1001", "1002"
        FE->>PAF: selectedLoggerIds = ["925", "1001", "1002"]
    end

    rect rgb(220, 252, 231)
        Note over PAF,T: Step 3: Compare
        PAF->>T: compare_loggers(["925","1001","1002"], "power", latest)
        T-->>PAF: { loggers: [{id, data[]}...] }
    end

    rect rgb(233, 213, 255)
        Note over PAF,PAF: Step 4: Analyze
        PAF->>PAF: computeBestPerformer()
        PAF->>PAF: computeWorstPerformer()
        PAF->>PAF: computeSpreadPercent()
        PAF->>PAF: computeComparisonSeverity()
    end

    rect rgb(254, 226, 226)
        Note over PAF,FE: Render
        PAF->>FE: render_ui_component(ComparisonChart)
        PAF->>FE: suggestions based on severity
    end

    FE-->>U: Display ComparisonChart with analysis
```

## Multi-Select UI

```mermaid
flowchart TB
    subgraph Selection["Logger Multi-Select"]
        PROMPT["Select 2-5 loggers to compare:"]

        subgraph Checkboxes["Checkbox List"]
            CB1["☑ 925 (GoodWe) - Dec 1-15"]
            CB2["☑ 1001 (LTI) - Dec 1-15"]
            CB3["☑ 1002 (Meier) - Dec 1-15"]
            CB4["☐ 501 (MBMET) - Dec 1-15"]
        end

        VALIDATE["Validation: 2-5 required"]
        SUBMIT["Submit Selection"]
    end

    PROMPT --> Checkboxes
    Checkboxes --> VALIDATE
    VALIDATE -->|"valid"| SUBMIT

    style CB1 fill:#d1fae5,stroke:#10b981
    style CB2 fill:#d1fae5,stroke:#10b981
    style CB3 fill:#d1fae5,stroke:#10b981
```

## Analysis Helpers

### computeBestPerformer()
```mermaid
flowchart LR
    DATA["Comparison Data"]
    CALC["Calculate avg power<br/>per logger"]
    MAX["Find maximum"]
    BEST["Best: Logger 925<br/>Avg: 4,520W"]

    DATA --> CALC --> MAX --> BEST

    style BEST fill:#22c55e,stroke:#16a34a,color:#fff
```

### computeSpreadPercent()
```mermaid
flowchart LR
    BEST["Best: 4,520W"]
    WORST["Worst: 3,200W"]
    CALC["(4520 - 3200) / 4520<br/>= 29.2%"]
    SPREAD["Spread: 29.2%"]

    BEST --> CALC
    WORST --> CALC
    CALC --> SPREAD

    style SPREAD fill:#f59e0b,stroke:#d97706,color:#fff
```

### computeComparisonSeverity()
```mermaid
flowchart TB
    SPREAD["Spread Percent"]

    SPREAD -->|"< 10%"| SIM["similar<br/>(green)"]
    SPREAD -->|"10-30%"| MOD["moderate_difference<br/>(yellow)"]
    SPREAD -->|"> 30%"| LARGE["large_difference<br/>(red)"]

    style SIM fill:#22c55e,stroke:#16a34a,color:#fff
    style MOD fill:#f59e0b,stroke:#d97706,color:#fff
    style LARGE fill:#ef4444,stroke:#dc2626,color:#fff
```

## Data Schemas

### ComparisonResult
```typescript
interface ComparisonResult {
  metric: 'power' | 'energy' | 'irradiance';
  period: { start: string; end: string };
  loggers: LoggerComparison[];
}

interface LoggerComparison {
  loggerId: string;
  loggerType: string;
  data: DataPoint[];
  avgValue: number;
  peakValue: number;
  totalEnergy?: number;
}

interface DataPoint {
  timestamp: string;
  value: number;
}
```

### Analysis Output
```typescript
interface ComparisonAnalysis {
  bestPerformer: {
    loggerId: string;
    avgValue: number;
  };
  worstPerformer: {
    loggerId: string;
    avgValue: number;
  };
  spreadPercent: number;
  severity: 'similar' | 'moderate_difference' | 'large_difference';
}
```

## ComparisonChart UI

```mermaid
flowchart TB
    subgraph Chart["ComparisonChart Component"]
        HEADER["Performance Comparison<br/>December 15, 2024"]

        subgraph Lines["Multi-Line Chart"]
            L1["--- 925 (blue)"]
            L2["--- 1001 (green)"]
            L3["--- 1002 (orange)"]
        end

        subgraph Analysis["Analysis Panel"]
            BEST["🏆 Best: 925 (4,520W avg)"]
            WORST["⚠️ Worst: 1002 (3,200W avg)"]
            SPREAD["Spread: 29.2% (moderate)"]
        end
    end

    style BEST fill:#22c55e,stroke:#16a34a
    style WORST fill:#f59e0b,stroke:#d97706
```

## Generated Suggestions

| Severity | Suggestions |
|----------|-------------|
| `similar` (<10%) | "All loggers performing well", "Check efficiency details" |
| `moderate_difference` (10-30%) | "Investigate worst performer", "Check for shading issues" |
| `large_difference` (>30%) | "Urgent: Check worst performer health", "Schedule maintenance" |
