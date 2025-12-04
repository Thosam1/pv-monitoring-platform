# Folder Structure

Project folder structure visualization showing backend, frontend, ai directories and their key subdirectories.

```mermaid
flowchart TB
    Root[pv-monitoring-platform]

    Root --> B[backend/]
    Root --> F[frontend/]
    Root --> A[ai/]
    Root --> D[diagrams/]

    subgraph Backend["Backend (NestJS)"]
        B --> BS[src/]
        BS --> BI[ingestion/]
        BI --> BIS[strategies/<br/>8 parsers]
        BS --> BM[measurements/]
        BS --> BA[ai/]
        BA --> BAN[nodes/<br/>router, argument-check]
        BA --> BAF[flows/<br/>4 explicit flows]
        BA --> BAS[subgraphs/<br/>recovery]
        BA --> BAR[response/<br/>UI builders]
    end

    subgraph Frontend["Frontend (React)"]
        F --> FS[src/]
        FS --> FC[components/]
        FC --> FCA[ai/<br/>chat interface]
        FC --> FCU[assistant-ui/<br/>tools, thread]
        FC --> FCUI[ui/<br/>shadcn]
        FS --> FP[providers/<br/>runtime]
        FS --> FV[views/]
    end

    subgraph Python["AI Service (Python)"]
        A --> AT[tools/<br/>10 MCP tools]
        A --> AM[models/<br/>Pydantic]
        A --> AS[server.py]
    end

    style Backend fill:#e0e7ff,stroke:#6366f1
    style Frontend fill:#d1fae5,stroke:#10b981
    style Python fill:#fef3c7,stroke:#f59e0b
```

## Directory Details

| Path | Purpose |
|------|---------|
| `backend/src/ai/nodes/` | LangGraph nodes (router, argument-check) |
| `backend/src/ai/flows/` | 4 explicit flows (morning, financial, health, performance) |
| `backend/src/ai/subgraphs/` | Recovery subgraph |
| `backend/src/ai/response/` | Zod-validated UI component builders |
| `frontend/src/components/assistant-ui/` | Tool renderers (9 tools) |
| `frontend/src/providers/` | AssistantRuntime provider |
| `ai/tools/` | 10 MCP tool implementations |
