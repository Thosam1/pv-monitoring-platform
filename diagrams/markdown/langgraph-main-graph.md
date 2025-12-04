# LangGraph Main Graph

Complete StateGraph structure showing the AI agent's main orchestration flow with router-based intent classification, explicit flows, free chat fallback, and recovery subgraph integration.

```mermaid
flowchart TB
    subgraph Main["LangGraph StateGraph"]
        START((START))
        ROUTER[/"router<br/>(intent classification)"/]
        END_NODE((END))

        subgraph ExplicitFlows["Explicit Flows"]
            MB["morning_briefing"]
            FR["financial_report"]
            PA["performance_audit"]
            HC["health_check"]
            GR["greeting"]
        end

        subgraph FreeChatLoop["Free Chat Loop"]
            FC["free_chat<br/>(LLM agent)"]
            TOOLS["tools<br/>(execute MCP tools)"]
            CHECK["check_results<br/>(inspect status)"]
        end

        subgraph RecoverySub["Recovery Subgraph"]
            REC["recovery<br/>(handle errors)"]
        end

        START --> ROUTER

        ROUTER -->|"morning_briefing"| MB
        ROUTER -->|"financial_report"| FR
        ROUTER -->|"performance_audit"| PA
        ROUTER -->|"health_check"| HC
        ROUTER -->|"greeting"| GR
        ROUTER -->|"free_chat"| FC

        MB --> END_NODE
        FR --> END_NODE
        PA --> END_NODE
        HC --> END_NODE
        GR --> END_NODE

        FC -->|"tool_calls"| TOOLS
        TOOLS --> CHECK
        CHECK -->|"success"| FC
        CHECK -->|"needs_recovery"| REC
        CHECK -->|"no_tool_calls"| END_NODE

        REC -->|"retry"| FC
        REC -->|"done"| END_NODE
    end

    style START fill:#22c55e,stroke:#16a34a,color:#fff
    style END_NODE fill:#ef4444,stroke:#dc2626,color:#fff
    style ROUTER fill:#3b82f6,stroke:#2563eb,color:#fff
    style MB fill:#8b5cf6,stroke:#7c3aed,color:#fff
    style FR fill:#8b5cf6,stroke:#7c3aed,color:#fff
    style PA fill:#8b5cf6,stroke:#7c3aed,color:#fff
    style HC fill:#8b5cf6,stroke:#7c3aed,color:#fff
    style GR fill:#8b5cf6,stroke:#7c3aed,color:#fff
    style FC fill:#f59e0b,stroke:#d97706,color:#fff
    style TOOLS fill:#f59e0b,stroke:#d97706,color:#fff
    style CHECK fill:#f59e0b,stroke:#d97706,color:#fff
    style REC fill:#ec4899,stroke:#db2777,color:#fff
```

## Node Descriptions

| Node | Type | Purpose |
|------|------|---------|
| **router** | Classification | Two-tier intent detection (regex + LLM) |
| **morning_briefing** | Explicit Flow | Fleet overview with critical alerts |
| **financial_report** | Explicit Flow | Savings calculation + forecast |
| **performance_audit** | Explicit Flow | Multi-logger comparison |
| **health_check** | Explicit Flow | Anomaly detection |
| **greeting** | Explicit Flow | Time-aware welcome (no LLM) |
| **free_chat** | Agent Loop | Classic LLM + tools for ad-hoc queries |
| **tools** | Tool Executor | Execute MCP tools via HTTP |
| **check_results** | Guard | Inspect tool status for recovery needs |
| **recovery** | Subgraph | Handle no_data, date selection, errors |

## Conditional Routing

```mermaid
flowchart LR
    R["Router Output"]

    R -->|"confidence >= 0.7<br/>flow = morning_briefing"| MB["Morning Briefing"]
    R -->|"confidence >= 0.7<br/>flow = financial_report"| FR["Financial Report"]
    R -->|"confidence >= 0.7<br/>flow = performance_audit"| PA["Performance Audit"]
    R -->|"confidence >= 0.7<br/>flow = health_check"| HC["Health Check"]
    R -->|"regex match<br/>greeting pattern"| GR["Greeting"]
    R -->|"confidence < 0.7<br/>or unrecognized"| FC["Free Chat"]

    style R fill:#3b82f6,stroke:#2563eb,color:#fff
```

## State Schema

The graph uses `ExplicitFlowStateAnnotation` with these key fields:

- **messages**: Full conversation history (LangChain BaseMessage[])
- **recoveryAttempts**: Counter for retry loop guard (max 3)
- **pendingUiActions**: Pass-through tool calls for frontend
- **activeFlow**: Current workflow identifier
- **flowStep**: Position within a flow
- **flowContext**: Accumulated selections, tool results, preferences
