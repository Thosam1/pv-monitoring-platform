# Morning Briefing Flow

Detailed flow diagram for the morning briefing workflow: fleet overview with automatic critical alert detection and diagnostics.

## Flow Graph

```mermaid
flowchart TB
    START((START))

    subgraph Step1["Step 1: Fleet Overview"]
        FO["fleet_overview node"]
        T1["get_fleet_overview()"]
        R1["FleetStatusSnapshot"]
    end

    subgraph Step2["Step 2: Check Critical"]
        CC["check_critical node"]
        COND{{"percentOnline < 100%?"}}
    end

    subgraph Step3["Step 3: Diagnose Issues"]
        DI["diagnose_issues node"]
        T2["diagnose_error_codes()"]
        R2["Error interpretations"]
    end

    subgraph Step4["Step 4: Render Briefing"]
        RB["render_briefing node"]
        NAR["NarrativeEngine.generate()"]
        UI["render_ui_component<br/>(FleetOverview)"]
        SUG["Generate suggestions"]
    end

    END_NODE((END))

    START --> FO
    FO --> T1
    T1 --> R1
    R1 --> CC
    CC --> COND

    COND -->|"Yes (issues)"| DI
    COND -->|"No (all online)"| RB

    DI --> T2
    T2 --> R2
    R2 --> RB

    RB --> NAR
    NAR --> UI
    UI --> SUG
    SUG --> END_NODE

    style START fill:#22c55e,stroke:#16a34a,color:#fff
    style END_NODE fill:#ef4444,stroke:#dc2626,color:#fff
    style T1 fill:#3b82f6,stroke:#2563eb,color:#fff
    style T2 fill:#3b82f6,stroke:#2563eb,color:#fff
    style UI fill:#8b5cf6,stroke:#7c3aed,color:#fff
```

## Sequence Diagram

```mermaid
sequenceDiagram
    participant U as User
    participant R as Router
    participant MBF as MorningBriefingFlow
    participant T as ToolsHttpClient
    participant NE as NarrativeEngine
    participant FE as Frontend

    U->>R: "Morning briefing"
    R->>MBF: activeFlow = morning_briefing

    rect rgb(219, 234, 254)
        Note over MBF,T: Step 1: Fleet Overview
        MBF->>T: get_fleet_overview()
        T-->>MBF: { totalPower, totalEnergy, percentOnline }
    end

    rect rgb(254, 243, 199)
        Note over MBF: Step 2: Check Critical
        alt percentOnline < 100%
            rect rgb(254, 226, 226)
                Note over MBF,T: Step 3: Diagnose Issues
                MBF->>T: diagnose_error_codes(offline_loggers)
                T-->>MBF: { errorInterpretations }
            end
        end
    end

    rect rgb(220, 252, 231)
        Note over MBF,FE: Step 4: Render Briefing
        MBF->>NE: generate(context)
        NE-->>MBF: { narrative, metadata }
        MBF->>FE: render_ui_component(FleetOverview, props)
        MBF->>FE: suggestions: ["Check efficiency", "Financial summary"]
    end

    FE-->>U: Display FleetOverview card
```

## Data Flow

```mermaid
flowchart LR
    subgraph Input["Input"]
        MSG["User: 'Morning briefing'"]
    end

    subgraph Processing["Processing"]
        FO["Fleet Overview Tool"]
        SNAP["FleetStatusSnapshot"]
        DIAG["Diagnostics (if needed)"]
        NAR["Narrative Generation"]
    end

    subgraph Output["Output"]
        CARD["FleetOverview Card"]
        TEXT["Narrative Text"]
        SUGG["Suggestions"]
    end

    MSG --> FO
    FO --> SNAP
    SNAP --> DIAG
    DIAG --> NAR
    NAR --> CARD
    NAR --> TEXT
    NAR --> SUGG
```

## FleetStatusSnapshot Schema

```typescript
interface FleetStatusSnapshot {
  timestamp: string;          // When snapshot was taken
  totalPower: number;         // Current total power (W)
  totalEnergy: number;        // Today's energy (kWh)
  deviceCount: number;        // Total devices
  onlineCount: number;        // Online devices
  percentOnline: number;      // % online
  avgIrradiance?: number;     // Average irradiance (W/m²)
  alerts?: Alert[];           // Critical alerts
}
```

## Generated Suggestions

| Condition | Suggestions |
|-----------|-------------|
| All devices online | "Check efficiency", "Financial summary" |
| Some devices offline | "Diagnose offline devices", "Show error details" |
| Low power output | "Check weather conditions", "Compare to yesterday" |

## Narrative Context

The NarrativeEngine receives context for generating consultant-quality text:

```typescript
{
  flowType: 'morning_briefing',
  subject: 'fleet',
  data: FleetStatusSnapshot,
  dataQuality: {
    completeness: 1.0,
    expectedWindow: 'today',
    actualWindow: 'today'
  },
  isFleetAnalysis: true,
  previousFleetStatus?: FleetStatusSnapshot  // For temporal comparison
}
```
