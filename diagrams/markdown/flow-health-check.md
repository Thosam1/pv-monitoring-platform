# Health Check Flow

Detailed flow diagram for the health check workflow: anomaly detection with support for single logger or all-devices analysis.

## Flow Graph

```mermaid
flowchart TB
    START((START))

    subgraph Step1["Step 1: Check Context"]
        CC["check_context node"]
        COND1{{"selectedLoggerId<br/>in flowContext?"}}
        COND2{{"'all devices'<br/>intent detected?"}}
    end

    subgraph Step2["Step 2: Select Logger"]
        SL["select_logger node"]
        T1["list_loggers()"]
        UI1["request_user_selection<br/>(dropdown)"]
        WAIT["Wait for user selection"]
    end

    subgraph Step3["Step 3: Analyze Health"]
        AH["analyze_health node"]
        SINGLE["Single Logger Analysis"]
        ALL["All Devices Analysis<br/>(parallel)"]
        T2["analyze_inverter_health<br/>(logger, 7 days)"]
        R2["AnomalyReport"]
        REC{{"status?"}}
    end

    subgraph Step4["Step 4: Render Report"]
        RR["render_report node"]
        SINGLE_UI["HealthReport Card"]
        FLEET_UI["FleetHealthReport Card"]
        SUG["Generate suggestions"]
    end

    RECOVERY["Recovery Subgraph"]
    END_NODE((END))

    START --> CC
    CC --> COND1

    COND1 -->|"No"| COND2
    COND1 -->|"Yes"| AH

    COND2 -->|"Yes (all devices)"| ALL
    COND2 -->|"No"| SL

    SL --> T1
    T1 --> UI1
    UI1 --> WAIT
    WAIT -->|"user selects"| SINGLE

    SINGLE --> T2
    T2 --> R2
    R2 --> REC

    REC -->|"ok"| RR
    REC -->|"no_data_in_window"| RECOVERY
    RECOVERY -->|"date selected"| SINGLE

    ALL -->|"parallel calls"| T2
    ALL --> RR

    RR -->|"single logger"| SINGLE_UI
    RR -->|"all devices"| FLEET_UI
    SINGLE_UI --> SUG
    FLEET_UI --> SUG
    SUG --> END_NODE

    style START fill:#22c55e,stroke:#16a34a,color:#fff
    style END_NODE fill:#ef4444,stroke:#dc2626,color:#fff
    style T1 fill:#3b82f6,stroke:#2563eb,color:#fff
    style T2 fill:#3b82f6,stroke:#2563eb,color:#fff
    style UI1 fill:#f59e0b,stroke:#d97706,color:#fff
    style SINGLE_UI fill:#8b5cf6,stroke:#7c3aed,color:#fff
    style FLEET_UI fill:#8b5cf6,stroke:#7c3aed,color:#fff
    style RECOVERY fill:#ec4899,stroke:#db2777,color:#fff
    style ALL fill:#10b981,stroke:#059669,color:#fff
```

## All-Devices Mode Detection

```mermaid
flowchart LR
    MSG["User Message"]

    subgraph Detection["Pattern Matching"]
        PAT["ALL_DEVICES_PATTERN regex:<br/>'all (devices|loggers|inverters)'<br/>'every (device|logger|inverter)'<br/>'fleet health'<br/>'check everything'"]
    end

    subgraph Result["Detection Result"]
        YES["analyzeAllLoggers: true"]
        NO["analyzeAllLoggers: false"]
    end

    MSG --> PAT
    PAT -->|"match"| YES
    PAT -->|"no match"| NO

    style YES fill:#10b981,stroke:#059669,color:#fff
```

## Sequence Diagram - Single Logger

```mermaid
sequenceDiagram
    participant U as User
    participant R as Router
    participant HCF as HealthCheckFlow
    participant T as ToolsHttpClient
    participant FE as Frontend

    U->>R: "Check health of 925"
    R->>HCF: activeFlow = health_check<br/>extractedParams: {loggerId: "925"}

    rect rgb(220, 252, 231)
        Note over HCF,T: Step 3: Analyze Health
        HCF->>T: analyze_inverter_health("925", 7)
        T-->>HCF: { anomalies[], healthScore, period }
    end

    rect rgb(233, 213, 255)
        Note over HCF,FE: Step 4: Render Report
        HCF->>FE: render_ui_component(HealthReport)
        HCF->>FE: suggestions: ["Show power curve", "Diagnose errors"]
    end

    FE-->>U: Display HealthReport card
```

## Sequence Diagram - All Devices

```mermaid
sequenceDiagram
    participant U as User
    participant R as Router
    participant HCF as HealthCheckFlow
    participant T as ToolsHttpClient
    participant FE as Frontend

    U->>R: "Check health of all devices"
    R->>HCF: activeFlow = health_check<br/>analyzeAllLoggers: true

    rect rgb(219, 234, 254)
        Note over HCF,T: Fetch Logger List
        HCF->>T: list_loggers()
        T-->>HCF: { loggers: ["925", "1001", "501"] }
    end

    rect rgb(220, 252, 231)
        Note over HCF,T: Parallel Health Analysis
        par Analyze 925
            HCF->>T: analyze_inverter_health("925", 7)
            T-->>HCF: { anomalies[], healthScore }
        and Analyze 1001
            HCF->>T: analyze_inverter_health("1001", 7)
            T-->>HCF: { anomalies[], healthScore }
        and Analyze 501
            HCF->>T: analyze_inverter_health("501", 7)
            T-->>HCF: { anomalies[], healthScore }
        end
    end

    rect rgb(233, 213, 255)
        Note over HCF,FE: Aggregate & Render
        HCF->>HCF: Aggregate results
        HCF->>FE: render_ui_component(FleetHealthReport)
    end

    FE-->>U: Display FleetHealthReport with summary
```

## Data Schemas

### AnomalyReport (Single Logger)
```typescript
interface AnomalyReport {
  loggerId: string;
  period: { start: string; end: string };
  anomalies: Anomaly[];
  healthScore: number;        // 0-100
  avgPower: number;
  expectedPower: number;
  deviationPercent: number;
}

interface Anomaly {
  timestamp: string;
  type: 'low_power' | 'zero_output' | 'erratic' | 'overcurrent';
  severity: 'warning' | 'critical';
  value: number;
  expected: number;
  description: string;
}
```

### FleetHealthReport
```typescript
interface FleetHealthReport {
  analyzedAt: string;
  totalDevices: number;
  healthyDevices: number;
  devicesWithIssues: number;
  totalAnomalies: number;
  avgHealthScore: number;
  deviceReports: AnomalyReport[];
  worstPerformer?: {
    loggerId: string;
    healthScore: number;
    anomalyCount: number;
  };
}
```

## UI Components

### Single Logger: HealthReport Card
```mermaid
flowchart TB
    subgraph Card["HealthReport Card"]
        HEADER["Logger: 925<br/>Health Score: 87/100"]
        PERIOD["Period: Dec 1-7, 2024"]

        subgraph Anomalies["Anomaly List"]
            A1["Dec 3 10:15 - Low power<br/>Expected: 4500W, Actual: 2100W"]
            A2["Dec 5 14:30 - Zero output<br/>Duration: 45 minutes"]
        end

        SUMMARY["2 anomalies detected<br/>Average power: 3,450W"]
    end

    style HEADER fill:#f59e0b,stroke:#d97706
```

### All Devices: FleetHealthReport Card
```mermaid
flowchart TB
    subgraph Card["FleetHealthReport Card"]
        HEADER["Fleet Health Overview"]

        subgraph Summary["Summary"]
            S1["Devices: 8 total"]
            S2["Healthy: 6 (75%)"]
            S3["Issues: 2 (25%)"]
            S4["Total Anomalies: 5"]
        end

        subgraph Worst["Worst Performer"]
            W1["Logger 1001"]
            W2["Health: 62/100"]
            W3["3 anomalies"]
        end
    end

    style Worst fill:#ef4444,stroke:#dc2626
```

## Generated Suggestions

| Scenario | Suggestions |
|----------|-------------|
| Anomalies found | "Show power curve for anomaly dates", "Diagnose error codes" |
| No anomalies | "Compare with other loggers", "View historical trends" |
| Fleet analysis | "Check worst performer", "Export health report" |
| Critical anomalies | "Schedule maintenance", "Contact support" |
