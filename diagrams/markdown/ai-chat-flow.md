# AI Chat Flow

Complete sequence diagram for AI chat SSE streaming flow from User through the full stack, including LangGraph router, explicit flows, tool execution, and recovery handling.

## Overview Sequence

```mermaid
sequenceDiagram
    participant U as User
    participant FE as Frontend<br/>(React + assistant-ui)
    participant API as AiController<br/>(/ai/chat)
    participant LG as LangGraph<br/>Service
    participant RT as Router<br/>Node
    participant FL as Explicit<br/>Flow
    participant TH as ToolsHttp<br/>Client
    participant PY as Python<br/>Tools API
    participant DB as PostgreSQL

    U->>FE: Type message
    FE->>API: POST /ai/chat (SSE)
    API->>LG: streamChat(messages)

    rect rgb(219, 234, 254)
        Note over LG,RT: Intent Classification
        LG->>RT: Route message
        RT->>RT: Pattern match (greeting?)
        RT->>RT: LLM classification
        RT-->>LG: { flow, confidence, params }
    end

    alt Explicit Flow
        rect rgb(220, 252, 231)
            Note over LG,FL: Flow Execution
            LG->>FL: Execute flow steps
            FL->>TH: Call MCP tools
            TH->>PY: POST /api/tools/{name}
            PY->>DB: SQL Query
            DB-->>PY: Results
            PY-->>TH: { status, result }
            TH-->>FL: ToolResponse
        end

        alt Recovery Needed
            rect rgb(254, 243, 199)
                Note over FL: Recovery Subgraph
                FL->>FE: request_user_selection
                FE-->>U: Show date picker
                U->>FE: Select date
                FE->>FL: Continue flow
            end
        end

        FL->>FE: render_ui_component
    else Free Chat
        rect rgb(233, 213, 255)
            Note over LG,PY: LLM Agent Loop
            LG->>LG: LLM with tools
            loop Tool calls
                LG->>TH: Execute tool
                TH->>PY: POST /api/tools
                PY-->>TH: Result
                TH-->>LG: Continue
            end
        end
    end

    loop SSE Streaming
        LG-->>API: Event
        API-->>FE: data: {...}
    end

    API-->>FE: data: [DONE]
    FE-->>U: Render message
```

## SSE Event Types

```mermaid
flowchart LR
    subgraph Events["Event Types"]
        E1["text-delta"]
        E2["tool-input-available"]
        E3["tool-output-available"]
        E4["error"]
        E5["[DONE]"]
    end

    subgraph Frontend["Frontend Handling"]
        F1["Append to text"]
        F2["Show tool loading"]
        F3["Render tool result"]
        F4["Show error UI"]
        F5["Close stream"]
    end

    E1 --> F1
    E2 --> F2
    E3 --> F3
    E4 --> F4
    E5 --> F5

    style E1 fill:#3b82f6,stroke:#2563eb,color:#fff
    style E2 fill:#f59e0b,stroke:#d97706,color:#fff
    style E3 fill:#22c55e,stroke:#16a34a,color:#fff
    style E4 fill:#ef4444,stroke:#dc2626,color:#fff
```

## Router Classification Flow

```mermaid
flowchart TB
    MSG["User Message"]

    subgraph Tier1["Tier 1: Pattern Match"]
        REGEX{{"Greeting pattern?"}}
        GR["Greeting Flow"]
    end

    subgraph Tier2["Tier 2: LLM"]
        LLM["LLM Classifier"]
        CONF{{"confidence >= 0.7?"}}
    end

    subgraph Flows["Explicit Flows"]
        MB["morning_briefing"]
        FR["financial_report"]
        PA["performance_audit"]
        HC["health_check"]
        FC["free_chat"]
    end

    MSG --> REGEX
    REGEX -->|"Yes"| GR
    REGEX -->|"No"| LLM
    LLM --> CONF
    CONF -->|"Yes + morning"| MB
    CONF -->|"Yes + financial"| FR
    CONF -->|"Yes + performance"| PA
    CONF -->|"Yes + health"| HC
    CONF -->|"No"| FC

    style MSG fill:#e0e7ff,stroke:#6366f1
    style GR fill:#22c55e,stroke:#16a34a,color:#fff
```

## Tool Execution Detail

```mermaid
sequenceDiagram
    participant LG as LangGraph
    participant TH as ToolsHttpClient
    participant PY as Python API
    participant DB as PostgreSQL

    LG->>TH: executeTool("get_power_curve", {logger_id, date})
    TH->>PY: POST /api/tools/get_power_curve<br/>Content-Type: application/json

    PY->>DB: SELECT timestamp, power, irradiance<br/>FROM measurements<br/>WHERE logger_id = ?

    DB-->>PY: Rows

    PY->>PY: Calculate summaryStats
    PY-->>TH: {<br/>  status: "ok",<br/>  result: { data, summaryStats }<br/>}

    TH-->>LG: ToolResponse<PowerCurveData>
```

## Recovery Flow

```mermaid
flowchart TB
    TOOL["Tool Execution"]
    STATUS{{"status?"}}

    OK["Continue Flow"]
    NDW["no_data_in_window"]
    ND["no_data"]
    ERR["error"]

    subgraph Recovery["Recovery Subgraph"]
        DATE["Date Picker"]
        ALT["Suggest Alternatives"]
        MSG["Error Message"]
    end

    RETRY["Retry Tool"]
    END_NODE["End"]

    TOOL --> STATUS
    STATUS -->|"ok"| OK
    STATUS -->|"no_data_in_window"| NDW
    STATUS -->|"no_data"| ND
    STATUS -->|"error"| ERR

    NDW --> DATE
    DATE -->|"user selects"| RETRY
    RETRY --> TOOL

    ND --> ALT
    ALT --> END_NODE

    ERR --> MSG
    MSG --> END_NODE

    style OK fill:#22c55e,stroke:#16a34a,color:#fff
    style NDW fill:#f59e0b,stroke:#d97706,color:#fff
    style ERR fill:#ef4444,stroke:#dc2626,color:#fff
```

## Related Diagrams

- [LangGraph Main Graph](./langgraph-main-graph.md) - Complete StateGraph structure
- [SSE Streaming](./sse-streaming.md) - Detailed streaming implementation
- [Recovery Subgraph](./recovery-subgraph.md) - Error recovery details
- [Frontend Tool Rendering](./frontend-tool-rendering.md) - UI component hierarchy
