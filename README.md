# PV Monitoring Platform

High-throughput solar data ingestion and AI-powered analytics platform for photovoltaic inverters and meteo stations.

## Architecture

```mermaid
flowchart TB
    subgraph Frontend["Frontend (React 19 + Vite 7)"]
        UI[Dashboard & Charts]
        Chat[AI Chat Interface]
    end

    subgraph Backend["Backend (NestJS 11)"]
        API[REST API]
        Ingestion[Data Ingestion]
        AI[AI Module]
    end

    subgraph AIService["AI Service (Python FastMCP)"]
        MCP[MCP Tools]
        Analytics[Solar Analytics]
    end

    subgraph Database["PostgreSQL 16"]
        DB[(measurements)]
    end

    Frontend <-->|HTTP/SSE| Backend
    Backend <-->|SSE| AIService
    Backend <-->|TypeORM| Database
    AIService <-->|SQLAlchemy| Database
```

See [diagrams/markdown/architecture-overview.md](./diagrams/markdown/architecture-overview.md) for details.

## Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | React 19, Vite 7, TypeScript, shadcn/ui, Tailwind CSS 4, Recharts |
| Backend | NestJS 11, TypeORM, PostgreSQL 16 |
| AI Service | Python 3.12, FastMCP, SQLAlchemy, Vercel AI SDK |
| LLM Providers | Gemini, Claude, GPT-4 (configurable) |
| Containers | Docker Compose |

## Features

- **8 Logger Parsers**: GoodWe, LTI ReEnergy, Integra Sun, MBMET, Meier-NT, MeteoControl, Plexlog, SmartDog
- **AI-Powered Analytics**: Chat interface with 10 specialized MCP tools
- **Real-time Streaming**: SSE-based responses for AI chat
- **Adaptive Dashboard**: Different KPIs for inverters vs. meteo stations
- **Bulk Upload**: Drag-n-drop support for CSV, XML, and SQLite files

## Quick Start

### Prerequisites

- Node.js 20.x
- Docker & Docker Compose
- (Optional) Python 3.12 + uv for local AI development

### 1. Start Services

```bash
docker-compose up -d
```

Services started:
- PostgreSQL: `localhost:5432`
- Adminer: `localhost:8080`
- AI Service: `localhost:4000`

### 2. Install & Run

```bash
# Backend
cd backend && npm install && npm run start:dev

# Frontend (new terminal)
cd frontend && npm install && npm run dev
```

### 3. Access

- **Frontend**: http://localhost:5173
- **Backend API**: http://localhost:3000
- **Database UI**: http://localhost:8080 (admin/admin)

## Project Structure

```
pv-monitoring-platform/
├── backend/          # NestJS API server
├── frontend/         # React dashboard
├── ai/               # Python FastMCP service
├── diagrams/         # Architecture diagrams
└── docker-compose.yml
```

See component READMEs for details:
- [Backend README](./backend/README.md)
- [Frontend README](./frontend/README.md)
- [AI Service README](./ai/README.md)

## API Endpoints

### Data Ingestion
```
POST /ingest/:loggerType    # Upload files (multipart/form-data)
```

### Data Retrieval
```
GET /measurements           # List all loggers
GET /measurements/:id       # Get logger data
GET /measurements/:id/date-range
```

### AI Chat
```
POST /ai/chat              # Chat with AI (SSE stream)
GET /ai/status             # Service health check
```

## Diagrams

| Diagram | Description |
|---------|-------------|
| [architecture-overview](./diagrams/markdown/architecture-overview.md) | High-level system architecture |
| [request-sequence](./diagrams/markdown/request-sequence.md) | Request flow through the system |
| [data-flow](./diagrams/markdown/data-flow.md) | Data ingestion and AI query flows |
| [docker-deployment](./diagrams/markdown/docker-deployment.md) | Docker Compose topology |
| [folder-structure](./diagrams/markdown/folder-structure.md) | Project directory structure |
| [parser-strategy](./diagrams/markdown/parser-strategy.md) | 8 parser strategy pattern |
| [ai-tools](./diagrams/markdown/ai-tools.md) | MCP tools hierarchy |
| [database-schema](./diagrams/markdown/database-schema.md) | Entity relationship diagram |
| [frontend-components](./diagrams/markdown/frontend-components.md) | React component hierarchy |
| [ai-chat-flow](./diagrams/markdown/ai-chat-flow.md) | SSE streaming flow |

## Environment Variables

### Backend
```env
AI_PROVIDER=gemini                    # gemini | anthropic | openai
MCP_SERVER_URL=http://localhost:4000/sse
GOOGLE_GENERATIVE_AI_API_KEY=         # For Gemini
ANTHROPIC_API_KEY=                    # For Claude
OPENAI_API_KEY=                       # For GPT-4
```

### AI Service
```env
DATABASE_URL=postgresql://admin:admin@localhost:5432/pv_db
```

## Development

See [CLAUDE.md](./CLAUDE.md) for detailed development guidelines, coding standards, and architecture patterns.

### Testing
```bash
# Backend
cd backend && npm test          # Unit tests
cd backend && npm run test:e2e  # E2E tests

# Frontend
cd frontend && npm run build    # Type check + build
```

## License

MIT
