# Backend - NestJS API Server

NestJS 11 backend for data ingestion, measurements API, and AI chat with LangGraph orchestration.

## Data Flow

![Data Flow](../diagrams/svg/data-flow.svg)

## Modules

```
src/
├── ingestion/        # Data ingestion with 8 parser strategies
├── measurements/     # Data query and retrieval API
├── ai/               # AI chat with LangGraph orchestration
│   ├── ai.controller.ts      # SSE streaming endpoint
│   ├── langgraph.service.ts  # StateGraph orchestrator
│   ├── langchain-tools.ts    # Tool definitions
│   ├── tools-http.client.ts  # HTTP client for Python API
│   ├── nodes/                # Router and flow nodes
│   ├── flows/                # Explicit workflow implementations
│   ├── subgraphs/            # Recovery subgraph
│   └── types/                # Flow state types
└── database/         # TypeORM entities and configuration
```

## Parser Strategies

![Parser Strategy Pattern](../diagrams/svg/parser-strategy.svg)

8 parsers auto-detect file format via `canHandle()` method:

| Parser | Detection | File Format | Golden Metrics |
|--------|-----------|-------------|----------------|
| Plexlog | `.s3db` or SQLite magic | SQLite | acproduction → Power |
| LTI | `[header]/[data]` markers | Text | P_AC → Power |
| Integra | `.xml` + root tag | XML | P_AC → Power |
| MeteoControl | `[info]` + `Datum=` | INI-style | Pac → Power |
| MBMET | `Zeitstempel` header | CSV (German) | Einstrahlung → Irradiance |
| Meier | `serial;` prefix | CSV | Feed-In_Power → Power |
| SmartDog | `B{}_A{}_S{}` pattern | CSV | pac → Power |
| GoodWe | Fallback | CSV (EAV) | Power, Energy |

## API Endpoints

![Request Sequence](../diagrams/svg/request-sequence.svg)

### Ingestion
```
POST /ingest/:loggerType
  - Body: multipart/form-data (field: "files")
  - Supported: CSV, TXT, XML, SQLite (.s3db)
```

### Measurements
```
GET /measurements                      # List loggers
GET /measurements/:loggerId            # Get data (?start=&end=)
GET /measurements/:loggerId/date-range # Get date bounds
```

### AI Chat
```
POST /ai/chat                          # SSE streaming chat
GET /ai/status                         # Service readiness
```

## AI Architecture

The AI module uses LangGraph for deterministic workflow management with LLM-powered intent classification.

### LangGraph Orchestration

```
┌─────────────┐    ┌──────────────┐    ┌──────────────────┐
│ AiController │──>│ LangGraph    │──>│ ToolsHttpClient  │
│ (SSE)       │   │ Service      │   │ (HTTP POST)      │
└─────────────┘   └──────────────┘   └──────────────────┘
                         │
            ┌────────────┴────────────┐
            ▼            ▼            ▼
       ┌────────┐  ┌──────────┐  ┌────────┐
       │ Router │  │ Explicit │  │Recovery│
       │ Node   │  │ Flows    │  │Subgraph│
       └────────┘  └──────────┘  └────────┘
```

### Explicit Flows

| Flow | Trigger Phrases | Goal |
|------|-----------------|------|
| `morning_briefing` | "Fleet overview", "How is the site?" | Site-wide status |
| `financial_report` | "How much did I save?", "ROI" | Savings + forecast |
| `performance_audit` | "Compare inverters", "Efficiency" | Multi-logger comparison |
| `health_check` | "Check anomalies", "Any problems?" | Anomaly detection |
| `free_chat` | Fallback for other queries | LLM agent loop |

### Multi-Provider LLM Support

| Provider | Model | Environment Variable |
|----------|-------|---------------------|
| **Gemini** (default) | gemini-2.0-flash | `GOOGLE_GENERATIVE_AI_API_KEY` |
| **Anthropic** | claude-3-5-sonnet | `ANTHROPIC_API_KEY` |
| **OpenAI** | gpt-4o | `OPENAI_API_KEY` |
| **Ollama** (local) | llama3.1:8b-instruct | `OLLAMA_BASE_URL` (no API key) |

## Database Schema

<img src="../diagrams/svg/database-schema.svg" alt="Database Schema" height="350">

```typescript
@Entity('measurements')
- timestamp: Date (PK)
- loggerId: string (PK)
- loggerType: varchar(20)
- activePowerWatts: float
- energyDailyKwh: float
- irradiance: float
- metadata: jsonb
- createdAt: timestamptz
```

## Development

```bash
npm install
npm run start:dev     # Development with hot-reload
npm run start:prod    # Production build
```

## Testing

```bash
npm test              # Unit tests
npm run test:cov      # Coverage report
npm run test:e2e      # E2E tests
npm run test:watch    # Watch mode
```

## Environment Variables

```env
# Database
DB_HOST=localhost
DB_PORT=5432
DB_USERNAME=admin
DB_PASSWORD=admin
DB_DATABASE=pv_db

# AI Configuration
AI_PROVIDER=gemini                           # gemini | anthropic | openai | ollama
MCP_SERVER_URL=http://localhost:4000         # Python tools API

# Provider API Keys (set one based on AI_PROVIDER)
GOOGLE_GENERATIVE_AI_API_KEY=               # For Gemini
ANTHROPIC_API_KEY=                          # For Claude
OPENAI_API_KEY=                             # For GPT-4

# Ollama (local LLM - no API key required)
OLLAMA_BASE_URL=http://127.0.0.1:11434      # Local Ollama server
OLLAMA_MODEL=llama3.1:8b-instruct-q8_0      # Any Ollama model
```

## Key Dependencies

- `@nestjs/core` - NestJS framework
- `typeorm` + `pg` - PostgreSQL ORM
- `@langchain/langgraph` - StateGraph workflow orchestration
- `@langchain/google-genai` - Gemini LLM provider
- `@langchain/anthropic` - Claude LLM provider
- `@langchain/openai` - GPT-4 LLM provider
- `@langchain/ollama` - Ollama local LLM provider
- `@langchain/core` - LangChain base types and tools
- `zod` - Schema validation for tool definitions
- `multer` - File uploads
- `class-validator` - DTO validation

## Related Documentation

- [AI_UX_FLOWS.md](../AI_UX_FLOWS.md) - Complete AI architecture and flow specifications
- [CLAUDE.md](../CLAUDE.md) - Coding standards and patterns
