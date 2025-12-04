# Router Logic Flow

Shows the two-tier classification system and ToolMessage injection for selection handling.

## Diagram

```mermaid
flowchart TD
    subgraph Router["Router Node (router.node.ts)"]
        A[User Message] --> B{isGreeting?<br/>regex check}
        B -->|Yes| C[greeting flow<br/>zero latency]
        B -->|No| D[LLM Classification]
        D --> E{Zod Validation}
        E -->|Invalid JSON| F[free_chat fallback<br/>confidence: 0.5]
        E -->|Valid| G{isSelectionResponse?}
        G -->|No| H[Extract params<br/>Route to Flow]
        G -->|Yes| I[handleSelectionResponse]
    end

    subgraph Selection["Selection Response Handler"]
        I --> J{Pending<br/>request_user_selection<br/>tool_call exists?}
        J -->|Yes| K[Create ToolMessage<br/>with tool_call_id]
        J -->|No| L[Skip ToolMessage<br/>log warning]
        K --> M[Map selection to<br/>flowContext field]
        L --> M
        M --> N[Generate acknowledgment<br/>via NarrativeEngine]
        N --> O[Resume flow<br/>at step 1]
    end

    subgraph Contract["LLM Tool Call Contract"]
        P[Previous AIMessage with<br/>request_user_selection] -.->|tool_call_id| K
        K -.->|satisfies| Q[ToolMessage response<br/>completes contract]
    end

    H --> R{Flow Type}
    R --> S[morning_briefing]
    R --> T[financial_report]
    R --> U[performance_audit]
    R --> V[health_check]
    R --> W[free_chat]

    style K fill:#90EE90,stroke:#228B22
    style L fill:#FFB6C1,stroke:#DC143C
    style C fill:#E6E6FA,stroke:#9370DB
    style F fill:#FFE4B5,stroke:#FFA500
```

## Key Components

### Two-Tier Classification

1. **Tier 1: Regex Greeting Detection** (`isGreeting()`)
   - 7 regex patterns for common greetings
   - Anchored patterns prevent false positives
   - Zero LLM latency for simple greetings

2. **Tier 2: LLM Classification**
   - Full intent analysis with parameter extraction
   - Zod schema validation for type safety
   - Context-aware prompting when waiting for selection

### Selection Response Handling

When `isSelectionResponse=true` and user provides valid selection:

1. Find pending `request_user_selection` tool call in message history
2. **STRICT ID MATCHING**: Only create ToolMessage if valid `tool_call_id` exists
3. Map selection to appropriate `flowContext` field:
   - `loggerId` → `selectedLoggerId`
   - `loggerIds` → `selectedLoggerIds`
   - `date` → `selectedDate`
   - `dateRange` → `dateRange`
4. Generate acknowledgment message
5. Resume flow at step 1 (past argument check)

### Tool Call Contract

LLM providers (OpenAI, Anthropic, Gemini) expect every `tool_call` in an AIMessage to have a corresponding ToolMessage response. The router satisfies this contract by:

- Finding the pending tool call with matching ID
- Creating a properly formatted ToolMessage
- Including selection data in the content

## Code Reference

- Router node: `backend/src/ai/nodes/router.node.ts`
- Key function: `handleSelectionResponse()` (lines 396-488)
- Classification schema: `FlowClassificationSchema` in `types/flow-state.ts`
