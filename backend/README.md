# Backend - NestJS API Server

NestJS 11 backend for data ingestion, measurements API, and AI chat with LangGraph orchestration.

![Data Flow](../diagrams/svg/data-flow.svg)

## Key Architectural Decisions

### 1. Parser Strategy Pattern (Specificity-First)

8 parsers registered in specificity order - most specific formats first, GoodWe fallback last:

```
Plexlog → LTI → Integra → MeteoControl → MBMET → Meier → SmartDog → GoodWe
```

Each parser implements `IParser` with `canHandle(filename, snippet)` for auto-detection.

```
src/ingestion/interfaces/parser.interface.ts  # Contract
src/ingestion/strategies/                      # 8 implementations
```

### 2. AsyncGenerator for Memory-Efficient Streaming

Parsers yield records via `AsyncGenerator<UnifiedMeasurementDto>` - files of any size processed without loading into memory:

```typescript
async *parse(buffer: Buffer): AsyncGenerator<UnifiedMeasurementDto>
```

Supports CSV, TXT (sectioned), XML, and SQLite formats.

### 3. Batch Insertion (1000 Records)

`IngestionService` batches records in groups of 1000 for optimal database performance. Upsert on composite key (loggerId + timestamp) ensures idempotent ingestion.

### 4. Hybrid Database Schema

Golden metrics as columns for fast queries + JSONB for flexibility:

```typescript
- activePowerWatts: float   // 10-100x faster than JSONB queries
- energyDailyKwh: float     // Billing calculations
- irradiance: float         // PR calculations
- metadata: jsonb           // All other sensors (GIN indexed)
```

### 5. LangGraph Explicit Flows + Free Chat Fallback

Deterministic workflows for common queries, LLM agent loop for exploratory questions:

![LangGraph Main Graph](../diagrams/svg/langgraph-main-graph.svg)

```
src/ai/nodes/router.node.ts   # Intent classification
src/ai/flows/                  # 5 explicit workflows
```

### 6. Stateless Tool Execution via HTTP

Tools executed via HTTP POST to Python FastMCP (not SSE session). Each call independent - retry-friendly, no session state to manage.

```
src/ai/tools-http.client.ts   # HTTP POST client
```

## Modules

```
src/
├── ingestion/        # Data ingestion with 8 parser strategies
├── measurements/     # Data query API (smart date resolution)
├── ai/               # LangGraph orchestration
│   ├── ai.controller.ts      # SSE streaming endpoint
│   ├── langgraph.service.ts  # StateGraph + provider initialization
│   ├── tools-http.client.ts  # HTTP client for Python tools
│   ├── nodes/                # Router node
│   ├── flows/                # morning-briefing, financial-report, etc.
│   ├── subgraphs/            # Recovery subgraph
│   ├── narrative/            # Template-based text generation
│   └── response/             # UIResponseBuilder with Zod validation
└── database/         # TypeORM entities
```

## Parser Strategies

![Parser Strategy](../diagrams/svg/parser-strategy.svg)

| Parser | Detection | Format | Golden Metrics |
|--------|-----------|--------|----------------|
| Plexlog | SQLite magic bytes | .s3db | acproduction → Power |
| LTI | `[header]/[data]` markers | Text | P_AC → Power |
| Integra | `.xml` + root tag | XML | P_AC → Power |
| MeteoControl | `[info]` + `Datum=` | INI-style | Pac → Power |
| MBMET | `Zeitstempel` header | CSV (German) | Einstrahlung → Irradiance |
| Meier | `serial;` prefix | CSV | Feed-In_Power → Power |
| SmartDog | `B{}_A{}_S{}` filename | CSV | pac → Power |
| GoodWe | Fallback | CSV (EAV) | Power, Energy |

## API Endpoints

![Request Sequence](../diagrams/svg/request-sequence.svg)

### Ingestion
```
POST /ingest/:loggerType    # multipart/form-data (field: "files")
```

### Measurements
```
GET /measurements                      # List loggers
GET /measurements/:loggerId            # Get data (?start=&end=)
GET /measurements/:loggerId/date-range # Date bounds
```

### AI Chat
```
POST /ai/chat    # SSE streaming (body: { messages, threadId })
GET /ai/status   # Service readiness
```

## AI Architecture

> **Full documentation**: [src/ai/README.md](src/ai/README.md)

| Flow | Triggers | Primary Tool |
|------|----------|--------------|
| `morning_briefing` | "Fleet overview", "How is the site?" | get_fleet_overview |
| `financial_report` | "How much saved?", "ROI" | calculate_financial_savings |
| `performance_audit` | "Compare inverters" | compare_loggers |
| `health_check` | "Any problems?" | analyze_inverter_health |
| `free_chat` | Fallback | LLM agent loop |

**Providers**: Gemini (default), Anthropic, OpenAI, Ollama. Set `AI_PROVIDER` env var.

## Database Schema

![Database Schema](../diagrams/svg/database-schema.svg)

```typescript
@Entity('measurements')
- timestamp: Date (PK)       // UTC
- loggerId: string (PK)      // Serial number
- loggerType: varchar(20)    // Parser identifier
- activePowerWatts: float    // Golden metric
- energyDailyKwh: float      // Golden metric
- irradiance: float          // Golden metric
- metadata: jsonb            // Flexible storage
- createdAt: timestamptz     // Audit
```

Composite PK + BRIN index on timestamp for time-series performance.

## Development

```bash
npm install
npm run start:dev     # Hot-reload (port 3000)
npm run start:prod    # Production
```

## Testing

```bash
npm test              # Unit tests
npm run test:cov      # Coverage
npm run test:e2e      # E2E tests
npm run test:ai       # AI module tests
```

## Environment

```env
# Database
DB_HOST=localhost
DB_PORT=5432
DB_USERNAME=admin
DB_PASSWORD=admin
DB_DATABASE=pv_db

# AI
AI_PROVIDER=gemini
MCP_SERVER_URL=http://localhost:4000
```

## Diagrams

| Diagram | Description |
|---------|-------------|
| [Data Flow](../diagrams/svg/data-flow.svg) | System data flow |
| [Parser Strategy](../diagrams/svg/parser-strategy.svg) | Strategy pattern |
| [Request Sequence](../diagrams/svg/request-sequence.svg) | API sequence |
| [Database Schema](../diagrams/svg/database-schema.svg) | Entity relationships |
| [LangGraph Main](../diagrams/svg/langgraph-main-graph.svg) | StateGraph structure |
| [Morning Briefing](../diagrams/svg/flow-morning-briefing.svg) | Fleet overview flow |
| [Financial Report](../diagrams/svg/flow-financial-report.svg) | Savings flow |
| [Health Check](../diagrams/svg/flow-health-check.svg) | Anomaly detection |
| [Performance Audit](../diagrams/svg/flow-performance-audit.svg) | Comparison flow |
| [Recovery Subgraph](../diagrams/svg/recovery-subgraph.svg) | Error handling |
| [Agent Behavior](../diagrams/svg/agent-behavior.svg) | Router classification |

## Related Documentation

- [src/ai/README.md](src/ai/README.md) - LangGraph orchestration details
- [../ai/README.md](../ai/README.md) - Python tools API
- [AI_UX_FLOWS.md](../AI_UX_FLOWS.md) - Complete AI architecture specs
- [CLAUDE.md](../CLAUDE.md) - Coding standards
