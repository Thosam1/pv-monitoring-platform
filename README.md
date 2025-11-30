# PV Monitoring Platform

High-throughput solar data ingestion and AI-powered analytics platform for photovoltaic inverters and meteo stations.

## Architecture

<img src="./diagrams/svg/architecture-overview.svg" alt="Architecture Overview" width="600">

See [diagrams/markdown/architecture-overview.md](./diagrams/markdown/architecture-overview.md) for the Mermaid source.

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

![Folder Structure](./diagrams/svg/folder-structure.svg)

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

All diagrams are available as pre-rendered SVGs in [`diagrams/svg/`](./diagrams/svg/) and as Mermaid source in [`diagrams/markdown/`](./diagrams/markdown/).

| Diagram | SVG | Mermaid Source |
|---------|-----|----------------|
| Architecture Overview | [SVG](./diagrams/svg/architecture-overview.svg) | [Mermaid](./diagrams/markdown/architecture-overview.md) |
| Request Sequence | [SVG](./diagrams/svg/request-sequence.svg) | [Mermaid](./diagrams/markdown/request-sequence.md) |
| Data Flow | [SVG](./diagrams/svg/data-flow.svg) | [Mermaid](./diagrams/markdown/data-flow.md) |
| Docker Deployment | [SVG](./diagrams/svg/docker-deployment.svg) | [Mermaid](./diagrams/markdown/docker-deployment.md) |
| Folder Structure | [SVG](./diagrams/svg/folder-structure.svg) | [Mermaid](./diagrams/markdown/folder-structure.md) |
| Parser Strategy | [SVG](./diagrams/svg/parser-strategy.svg) | [Mermaid](./diagrams/markdown/parser-strategy.md) |
| AI Tools | [SVG](./diagrams/svg/ai-tools.svg) | [Mermaid](./diagrams/markdown/ai-tools.md) |
| Database Schema | [SVG](./diagrams/svg/database-schema.svg) | [Mermaid](./diagrams/markdown/database-schema.md) |
| Frontend Components | [SVG](./diagrams/svg/frontend-components.svg) | [Mermaid](./diagrams/markdown/frontend-components.md) |
| AI Chat Flow | [SVG](./diagrams/svg/ai-chat-flow.svg) | [Mermaid](./diagrams/markdown/ai-chat-flow.md) |

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
