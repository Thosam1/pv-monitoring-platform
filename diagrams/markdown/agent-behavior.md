# Agent Behavior

How the AI agent makes decisions: two-tier router classification, intent detection logic, parameter extraction, and recovery decision tree.

## Two-Tier Router Classification

```mermaid
flowchart TB
    subgraph Tier1["Tier 1: Pattern Matching (Zero Latency)"]
        MSG["User Message"]
        REGEX{{"Regex Patterns"}}
        GREET["Greeting Detected"]

        MSG --> REGEX
        REGEX -->|"hi|hello|hey|good morning<br/>what's up|howdy"| GREET
    end

    subgraph Tier2["Tier 2: LLM Classification"]
        LLM["LLM Classifier"]
        SCHEMA["Zod Schema Validation"]
        RESULT["Classification Result"]

        REGEX -->|"no match"| LLM
        LLM --> SCHEMA
        SCHEMA --> RESULT
    end

    subgraph Output["Router Output"]
        FLOW["activeFlow"]
        CONF["confidence"]
        PARAMS["extractedParams"]

        RESULT --> FLOW
        RESULT --> CONF
        RESULT --> PARAMS
    end

    GREET -->|"flow: greeting<br/>confidence: 1.0"| FLOW

    style MSG fill:#e0e7ff,stroke:#6366f1
    style REGEX fill:#fef3c7,stroke:#f59e0b
    style LLM fill:#dbeafe,stroke:#3b82f6
    style GREET fill:#d1fae5,stroke:#10b981
```

## Intent Detection Logic

```mermaid
flowchart LR
    subgraph Keywords["Keyword Detection"]
        K1["fleet, site, overview,<br/>morning, daily"]
        K2["save, savings, cost,<br/>money, ROI, financial"]
        K3["compare, audit,<br/>performance, efficiency"]
        K4["health, anomaly, error,<br/>problem, diagnose"]
    end

    subgraph Flows["Detected Flow"]
        F1["morning_briefing"]
        F2["financial_report"]
        F3["performance_audit"]
        F4["health_check"]
    end

    K1 --> F1
    K2 --> F2
    K3 --> F3
    K4 --> F4

    style F1 fill:#8b5cf6,stroke:#7c3aed,color:#fff
    style F2 fill:#8b5cf6,stroke:#7c3aed,color:#fff
    style F3 fill:#8b5cf6,stroke:#7c3aed,color:#fff
    style F4 fill:#8b5cf6,stroke:#7c3aed,color:#fff
```

## Parameter Extraction

The router extracts parameters during classification to avoid redundant queries:

```mermaid
flowchart TB
    MSG["'Check health of inverter 925'"]

    subgraph Extraction["Parameter Extraction"]
        LOGGER["loggerId: '925'"]
        DATE["date: null"]
        NAME["loggerName: 'inverter 925'"]
    end

    subgraph Context["flowContext Updated"]
        CTX["selectedLoggerId: '925'<br/>extractedLoggerName: 'inverter 925'"]
    end

    MSG --> Extraction
    Extraction --> Context

    style MSG fill:#e0e7ff,stroke:#6366f1
    style CTX fill:#d1fae5,stroke:#10b981
```

## Recovery Decision Tree

```mermaid
flowchart TB
    TOOL["Tool Execution"]
    STATUS{{"Check status"}}

    TOOL --> STATUS

    STATUS -->|"status: ok"| OK["Continue Flow"]
    STATUS -->|"status: no_data_in_window"| NDW["Recovery: Date Selection"]
    STATUS -->|"status: no_data"| ND["Recovery: Suggest Alternatives"]
    STATUS -->|"status: error"| ERR["Recovery: Explain Error"]

    subgraph RecoveryCheck["Recovery Guard"]
        ATTEMPTS{{"recoveryAttempts < 3?"}}
        NDW --> ATTEMPTS
        ND --> ATTEMPTS
        ERR --> ATTEMPTS

        ATTEMPTS -->|"yes"| RETRY["Increment attempts<br/>Enter recovery subgraph"]
        ATTEMPTS -->|"no (>= 3)"| FAIL["Exit with error message"]
    end

    RETRY --> RECOVER["Recovery Subgraph"]
    RECOVER -->|"user selects date"| TOOL
    RECOVER -->|"user picks alternative"| TOOL

    style OK fill:#22c55e,stroke:#16a34a,color:#fff
    style NDW fill:#f59e0b,stroke:#d97706,color:#fff
    style ND fill:#f59e0b,stroke:#d97706,color:#fff
    style ERR fill:#ef4444,stroke:#dc2626,color:#fff
    style FAIL fill:#ef4444,stroke:#dc2626,color:#fff
```

## Selection Response Detection

When user responds to a selection prompt:

```mermaid
flowchart LR
    MSG["'Selected: 925'<br/>or '925'"]

    subgraph Detection["Selection Detection"]
        PATTERN["Detect 'Selected:' prefix<br/>or logger ID pattern"]
        CONTEXT["Check active flow"]
    end

    subgraph Action["Action Taken"]
        UPDATE["Update flowContext<br/>selectedLoggerId: '925'"]
        CONTINUE["Resume flow<br/>from next step"]
    end

    MSG --> Detection
    Detection --> Action
    UPDATE --> CONTINUE

    style MSG fill:#e0e7ff,stroke:#6366f1
    style UPDATE fill:#d1fae5,stroke:#10b981
```

## Confidence Thresholds

| Confidence | Action |
|------------|--------|
| `>= 0.9` | High confidence, proceed directly to flow |
| `0.7 - 0.9` | Medium confidence, proceed but watch for corrections |
| `< 0.7` | Low confidence, fall back to free_chat |
| `1.0` (regex) | Greeting pattern matched, bypass LLM |
