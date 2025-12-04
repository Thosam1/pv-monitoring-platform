# PV Monitoring Platform: Architecture & Engineering Strategy
**Candidate:** [Your Name]
**Role:** Engineering Intern
**Context:** MVP delivery for Ingestion, Normalization, and AI-First UX

---

## 1. Executive Summary
This project addresses the challenge of ingesting heterogeneous solar data and providing an intelligent, accessible interface for monitoring. The solution is a three-tier architecture utilizing NestJS for robust data processing, Python FastMCP for specialized solar analytics, and a LangGraph-orchestrated AI agent that moves beyond simple chatbots to deterministic, reliable workflows.

## 2. System Architecture & Tech Stack

### High-Level Design
The system decouples the **Application Logic** (NestJS), **User Interface** (React/Vite), and **AI Analytics** (Python). This separation allows us to use the best tool for the job: Python for data science libraries (Pandas/NumPy) and Node.js for high-concurrency API handling.

* **Diagram Reference:** [Architecture Overview](./diagrams/markdown/architecture-overview.md)
* **Diagram Reference:** [Docker Deployment](./diagrams/markdown/docker-deployment.md)

### Key Technology Decisions
* **Backend (NestJS 11):** Chosen for its strict modularity and TypeScript support, ensuring type safety from the database to the API response.
* **AI Service (FastMCP):** A dedicated Python microservice exposing tools via the Model Context Protocol (MCP). This stateless design is horizontally scalable.
* **Frontend (React 19 + @assistant-ui):** Uses Server-Sent Events (SSE) for real-time AI streaming, ensuring the user sees "thinking" steps and tool outputs immediately.

---

## 3. Data Ingestion: Handling "Messy" Data

The core challenge was normalizing data from 8 different logger types (GoodWe, LTI, MeteoControl, etc.) with varying formats (CSV, XML, SQLite, TXT).

### The Strategy Pattern
I implemented a **Specificity-First Strategy Pattern**. The system attempts to match parsers based on file signatures (magic bytes, headers) rather than relying solely on filenames.

* **Diagram Reference:** [Parser Strategy](./diagrams/markdown/parser-strategy.md)
* **Why this approach?** It makes the system extensible. Adding a 9th logger type requires writing one strategy class and registering it, without touching the core ingestion logic.

### Memory Management & Storage
* **Streaming:** Used `AsyncGenerator` to process files. This allows ingestion of massive datasets without loading the entire file into RAM.
* **Hybrid Schema:** The PostgreSQL schema uses strict columns for "Golden Metrics" (Power, Energy, Irradiance) to ensure fast SQL aggregation, while using a `JSONB` column for metadata. This balances query performance with the flexibility to store vendor-specific quirks.

---

## 4. AI Orchestration: LangGraph
Instead of a simple "prompt-response" loop, I built a directed graph architecture using **LangGraph**. This prevents hallucinations by forcing the AI into specific "Explicit Flows" for complex tasks.

* **Diagram Reference:** [LangGraph Main Graph](./diagrams/markdown/langgraph-main-graph.md)

### The Two-Tier Router
To optimize for latency and cost, I implemented a two-tier classification system:
1.  **Tier 1 (Regex):** Zero-latency detection for simple patterns (e.g., Greetings).
2.  **Tier 2 (LLM):** Zod-validated classification for complex intents (e.g., "Analyze the ROI of inverter 925").

* **Diagram Reference:** [Agent Behavior](./diagrams/markdown/agent-behavior.md)

### Resilience: The Recovery Subgraph
Real-world data is often missing or gaps exist. The agent features a "Recovery Subgraph". If a tool returns `no_data` or `no_data_in_window`, the agent doesn't crash or hallucinate. Instead, it enters a recovery flow, prompting the user for a valid date range or suggesting alternative loggers.

* **Diagram Reference:** [Recovery Subgraph](./diagrams/markdown/recovery-subgraph.md)

---

## 5. Learnings & Tooling
This project was accelerated by utilizing modern AI-assisted workflows:
* **Claude Code & MCP:** leveraged for rapid iteration and context-aware coding.
* **Local LLMs (Ollama):** Implemented support for local inference to test without API costs.
* **SonarQube MCP:** Used for static analysis to ensure code quality standards were met during rapid development.

## 6. Demo Plan
In the live session, I will demonstrate:
1.  **Ingestion:** Drag-and-drop upload of a heterogeneous folder (XML, CSV, SQLite).
2.  **Monitoring:** The "Morning Briefing" flow detecting critical anomalies.
3.  **Resilience:** Asking for data on a missing date to trigger the Recovery Subgraph (UI Date Picker).
4.  **Analysis:** A "Performance Audit" comparing multiple inverters.