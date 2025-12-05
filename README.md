<div align="center">

# PV Monitoring Platform

High-throughput solar data ingestion and AI-powered analytics platform for photovoltaic inverters and meteo stations.

[![Quality Gate Status](https://sonarcloud.io/api/project_badges/measure?project=Thosam1_pv-monitoring-platform&metric=alert_status)](https://sonarcloud.io/summary/new_code?id=Thosam1_pv-monitoring-platform)
[![Coverage](https://sonarcloud.io/api/project_badges/measure?project=Thosam1_pv-monitoring-platform&metric=coverage)](https://sonarcloud.io/summary/new_code?id=Thosam1_pv-monitoring-platform)
[![Maintainability Rating](https://sonarcloud.io/api/project_badges/measure?project=Thosam1_pv-monitoring-platform&metric=sqale_rating)](https://sonarcloud.io/summary/new_code?id=Thosam1_pv-monitoring-platform)
[![Reliability Rating](https://sonarcloud.io/api/project_badges/measure?project=Thosam1_pv-monitoring-platform&metric=reliability_rating)](https://sonarcloud.io/summary/new_code?id=Thosam1_pv-monitoring-platform)
[![Security Rating](https://sonarcloud.io/api/project_badges/measure?project=Thosam1_pv-monitoring-platform&metric=security_rating)](https://sonarcloud.io/summary/new_code?id=Thosam1_pv-monitoring-platform)
</div>

## Architecture

<img src="./diagrams/svg/architecture-overview.svg" alt="Architecture Overview" height="400">

See [diagrams/markdown/architecture-overview.md](./diagrams/markdown/architecture-overview.md) for the Mermaid source.

## Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | React 19, Vite 7, TypeScript, shadcn/ui, Tailwind CSS 4, Recharts, @assistant-ui/react |
| Backend | NestJS 11, TypeORM, PostgreSQL 16, LangGraph |
| AI Tools | Python 3.12, FastMCP, SQLAlchemy |
| LLM Providers | Gemini, Claude, GPT-4, Ollama (configurable) |
| Containers | Docker Compose |

## Features

- **8 Logger Parsers**: GoodWe, LTI ReEnergy, Integra Sun, MBMET, Meier-NT, MeteoControl, Plexlog, SmartDog
- **AI-Powered Analytics**: Chat interface with 10 specialized MCP tools
- **Real-time Streaming**: SSE-based responses for AI chat
- **Adaptive Dashboard**: Different KPIs for inverters vs. meteo stations
- **Bulk Upload**: Drag-n-drop support for CSV, XML, and SQLite files

## AI Agent Flows

The AI assistant uses LangGraph for deterministic workflow management with 5 explicit flows:

| Flow | Trigger Phrases | Description |
|------|-----------------|-------------|
| **Morning Briefing** | "Morning briefing", "How is the site?" | Fleet overview with critical alerts |
| **Financial Report** | "How much did I save?", "ROI" | Savings calculation + production forecast |
| **Performance Audit** | "Compare inverters", "Efficiency check" | Multi-logger comparison with best/worst analysis |
| **Health Check** | "Check health", "Any problems?" | Anomaly detection (single or all devices) |
| **Free Chat** | General queries | Classic LLM agent with tool execution |

See [AI_UX_FLOWS.md](./AI_UX_FLOWS.md) for the complete AI architecture documentation.

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

# AI Service (for local development - optional, runs in Docker by default)
cd ai && uv sync && uv run python server.py
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
- [Backend README](backend/README.md)
- [Frontend README](frontend/README.md)
- [AI Service README](ai/README.md)

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

### Core Architecture

| Diagram | SVG | Mermaid Source |
|---------|-----|----------------|
| Architecture Overview | [SVG](./diagrams/svg/architecture-overview.svg) | [Mermaid](./diagrams/markdown/architecture-overview.md) |
| Request Sequence | [SVG](./diagrams/svg/request-sequence.svg) | [Mermaid](./diagrams/markdown/request-sequence.md) |
| Data Flow | [SVG](./diagrams/svg/data-flow.svg) | [Mermaid](./diagrams/markdown/data-flow.md) |
| Docker Deployment | [SVG](./diagrams/svg/docker-deployment.svg) | [Mermaid](./diagrams/markdown/docker-deployment.md) |
| Folder Structure | [SVG](./diagrams/svg/folder-structure.svg) | [Mermaid](./diagrams/markdown/folder-structure.md) |
| Parser Strategy | [SVG](./diagrams/svg/parser-strategy.svg) | [Mermaid](./diagrams/markdown/parser-strategy.md) |
| Database Schema | [SVG](./diagrams/svg/database-schema.svg) | [Mermaid](./diagrams/markdown/database-schema.md) |
| Frontend Components | [SVG](./diagrams/svg/frontend-components.svg) | [Mermaid](./diagrams/markdown/frontend-components.md) |

### AI Agent & LangGraph

| Diagram | Description | Mermaid Source |
|---------|-------------|----------------|
| LangGraph Main Graph | Complete StateGraph structure | [Mermaid](./diagrams/markdown/langgraph-main-graph.md) |
| AI Chat Flow | SSE streaming sequence | [Mermaid](./diagrams/markdown/ai-chat-flow.md) |
| AI Tools | MCP tools hierarchy | [Mermaid](./diagrams/markdown/ai-tools.md) |
| Agent Behavior | Router classification logic | [Mermaid](./diagrams/markdown/agent-behavior.md) |
| **Router Logic** | Selection handling & ToolMessage injection | [Mermaid](./diagrams/markdown/router-logic.md) |
| **Tool Execution** | Virtual vs real tool handling | [Mermaid](./diagrams/markdown/tool-execution.md) |
| User Flows | User journey through flows | [Mermaid](./diagrams/markdown/user-flows.md) |
| SSE Streaming | Event streaming details | [Mermaid](./diagrams/markdown/sse-streaming.md) |
| Frontend Tool Rendering | Tool UI component hierarchy | [Mermaid](./diagrams/markdown/frontend-tool-rendering.md) |

### Explicit Flow Diagrams

| Flow | Description | Mermaid Source |
|------|-------------|----------------|
| Morning Briefing | Fleet overview with alerts | [Mermaid](./diagrams/markdown/flow-morning-briefing.md) |
| Financial Report | Savings + forecast | [Mermaid](./diagrams/markdown/flow-financial-report.md) |
| Health Check | Anomaly detection | [Mermaid](./diagrams/markdown/flow-health-check.md) |
| Performance Audit | Multi-logger comparison | [Mermaid](./diagrams/markdown/flow-performance-audit.md) |
| Recovery Subgraph | Error handling | [Mermaid](./diagrams/markdown/recovery-subgraph.md) |

## Environment Variables

### Backend
```env
AI_PROVIDER=gemini                    # gemini | anthropic | openai | ollama
MCP_SERVER_URL=http://localhost:4000  # Python tools API

# Provider API Keys (set one based on AI_PROVIDER)
GOOGLE_GENERATIVE_AI_API_KEY=         # For Gemini
ANTHROPIC_API_KEY=                    # For Claude
OPENAI_API_KEY=                       # For GPT-4

# Ollama (local LLM - no API key required)
OLLAMA_BASE_URL=http://127.0.0.1:11434
OLLAMA_MODEL=gpt-oss:20b
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
