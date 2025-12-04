# SSE Streaming

Sequence diagram for Server-Sent Events streaming from user input through the full stack to database and back.

## Full Stack Flow

```mermaid
sequenceDiagram
    participant U as User
    participant FE as Frontend<br/>(React)
    participant API as /ai/chat<br/>(NestJS)
    participant LG as LangGraph<br/>Service
    participant LLM as LLM Provider<br/>(Gemini/Claude/GPT)
    participant TH as ToolsHttpClient
    participant PY as Python API<br/>(FastMCP)
    participant DB as PostgreSQL

    U->>FE: Type message & send

    rect rgb(219, 234, 254)
        Note over FE,API: HTTP Request
        FE->>API: POST /ai/chat<br/>{ messages: [...] }
        API->>API: Set SSE headers<br/>Content-Type: text/event-stream
    end

    rect rgb(220, 252, 231)
        Note over API,LG: LangGraph Execution
        API->>LG: streamChat(messages)
        LG->>LG: Build StateGraph
        LG->>LG: Router classification
    end

    rect rgb(254, 243, 199)
        Note over LG,LLM: LLM Streaming
        LG->>LLM: stream with bound tools
        loop Text chunks
            LLM-->>LG: on_chat_model_stream
            LG-->>API: text-delta event
            API-->>FE: data: {"type":"text-delta","delta":"..."}
        end
        LLM-->>LG: on_chat_model_end (tool_calls)
    end

    rect rgb(233, 213, 255)
        Note over LG,DB: Tool Execution
        LG-->>API: tool-input-available event
        API-->>FE: data: {"type":"tool-input-available",...}
        LG->>TH: executeTool(name, args)
        TH->>PY: POST /api/tools/{name}
        PY->>DB: SQL Query
        DB-->>PY: Results
        PY-->>TH: { status, result }
        TH-->>LG: ToolResponse
        LG-->>API: tool-output-available event
        API-->>FE: data: {"type":"tool-output-available",...}
    end

    rect rgb(254, 226, 226)
        Note over API,FE: Stream Complete
        API-->>FE: data: [DONE]
        FE->>FE: Close EventSource
    end

    FE-->>U: Render complete message
```

## SSE Event Types

```mermaid
flowchart TB
    subgraph Events["SSE Event Types"]
        TD["text-delta"]
        TIA["tool-input-available"]
        TOA["tool-output-available"]
        ERR["error"]
        DONE["[DONE]"]
    end

    subgraph Payloads["Event Payloads"]
        TD_P["{ type, delta: string }"]
        TIA_P["{ type, toolCallId,<br/>toolName, input }"]
        TOA_P["{ type, toolCallId,<br/>output }"]
        ERR_P["{ type, error: string }"]
        DONE_P["(no payload)"]
    end

    TD --> TD_P
    TIA --> TIA_P
    TOA --> TOA_P
    ERR --> ERR_P
    DONE --> DONE_P

    style TD fill:#3b82f6,stroke:#2563eb,color:#fff
    style TIA fill:#f59e0b,stroke:#d97706,color:#fff
    style TOA fill:#22c55e,stroke:#16a34a,color:#fff
    style ERR fill:#ef4444,stroke:#dc2626,color:#fff
    style DONE fill:#6b7280,stroke:#4b5563,color:#fff
```

## Example SSE Stream

```
data: {"type":"text-delta","delta":"Let me "}

data: {"type":"text-delta","delta":"check the "}

data: {"type":"text-delta","delta":"health of "}

data: {"type":"text-delta","delta":"logger 925."}

data: {"type":"tool-input-available","toolCallId":"call_abc123","toolName":"analyze_inverter_health","input":{"logger_id":"925","days":7}}

data: {"type":"tool-output-available","toolCallId":"call_abc123","output":{"status":"ok","result":{"anomalies":[],"healthScore":95}}}

data: {"type":"text-delta","delta":"Great news! "}

data: {"type":"text-delta","delta":"Logger 925 is healthy."}

data: [DONE]
```

## Frontend Stream Processing

```mermaid
flowchart TB
    subgraph Fetch["fetch() with SSE"]
        REQ["POST /ai/chat"]
        STREAM["response.body<br/>(ReadableStream)"]
    end

    subgraph Parse["parseSSEStream()"]
        READER["getReader()"]
        DECODE["TextDecoder"]
        SPLIT["Split by 'data: '"]
        JSON["JSON.parse()"]
    end

    subgraph Process["processSSEEvent()"]
        STATE["StreamState"]
        TEXT["Accumulate text"]
        TOOLS["Store tool calls"]
    end

    subgraph Render["stateToContentParts()"]
        PARTS["ThreadAssistantMessagePart[]"]
        MSG["Display in Thread"]
    end

    REQ --> STREAM
    STREAM --> READER
    READER --> DECODE
    DECODE --> SPLIT
    SPLIT --> JSON
    JSON --> STATE
    STATE --> TEXT
    STATE --> TOOLS
    TEXT --> PARTS
    TOOLS --> PARTS
    PARTS --> MSG

    style STREAM fill:#3b82f6,stroke:#2563eb,color:#fff
    style STATE fill:#f59e0b,stroke:#d97706,color:#fff
    style MSG fill:#22c55e,stroke:#16a34a,color:#fff
```

## LangGraph Event Filtering

Internal nodes are filtered from stream output:

```mermaid
flowchart LR
    subgraph All["All Graph Events"]
        R["router"]
        CC["check_context"]
        CR["check_results"]
        FC["free_chat"]
        FO["fleet_overview"]
        RUI["render_ui"]
    end

    subgraph Filter["INTERNAL_NODES Filter"]
        SKIP["Skip internal"]
        EMIT["Emit to stream"]
    end

    R -->|"internal"| SKIP
    CC -->|"internal"| SKIP
    CR -->|"internal"| SKIP
    FC -->|"user-facing"| EMIT
    FO -->|"user-facing"| EMIT
    RUI -->|"user-facing"| EMIT

    style SKIP fill:#ef4444,stroke:#dc2626
    style EMIT fill:#22c55e,stroke:#16a34a
```

## Pass-Through Tools

UI tools emit both input and output immediately:

```mermaid
sequenceDiagram
    participant LG as LangGraph
    participant API as Controller
    participant FE as Frontend

    Note over LG,FE: render_ui_component is pass-through

    LG->>API: tool-input-available<br/>{toolName: "render_ui_component",<br/>args: {component: "FleetOverview",...}}
    API->>FE: SSE: tool-input-available
    API->>FE: SSE: tool-output-available<br/>(args ARE the result)

    Note over FE: Frontend renders immediately<br/>No backend execution needed
```

## Error Handling

```mermaid
flowchart TB
    subgraph Stream["During Stream"]
        ERR1["Network error"]
        ERR2["Parse error"]
        ERR3["Tool error"]
    end

    subgraph Handle["Error Handling"]
        CLOSE["Close stream"]
        EVENT["error event"]
        MSG["Error message to user"]
    end

    subgraph UI["UI Response"]
        ICON["⚠️ Warning icon"]
        RETRY["Retry button"]
    end

    ERR1 --> CLOSE
    ERR2 --> CLOSE
    ERR3 --> EVENT
    CLOSE --> MSG
    EVENT --> MSG
    MSG --> ICON
    MSG --> RETRY

    style ERR1 fill:#ef4444,stroke:#dc2626
    style ERR2 fill:#ef4444,stroke:#dc2626
    style ERR3 fill:#ef4444,stroke:#dc2626
```

## Text Sanitization

Frontend removes LLM artifacts:

```mermaid
flowchart LR
    subgraph Raw["Raw LLM Output"]
        R1["<|python_tag|>"]
        R2["<|eom_id|>"]
        R3["render_ui_component(...)"]
        R4["[Chart: Power Curve]"]
        R5["Let me visualize..."]
    end

    subgraph Clean["sanitizeTextContent()"]
        REGEX["Regex patterns"]
        FILTER["Filter artifacts"]
    end

    subgraph Output["Clean Output"]
        O1["Actual narrative text"]
    end

    Raw --> Clean --> Output

    style Raw fill:#f59e0b,stroke:#d97706
    style Output fill:#22c55e,stroke:#16a34a
```
