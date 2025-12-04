# Slide Deck: PV Monitoring Platform

---

## Section 1: Introduction & Architecture

### Slide 1: Title & Context
* **Title:** Scalable PV Monitoring & AI Analytics
* **Subtitle:** From Messy Data to Actionable Insights
* **Context:** Internship Technical Challenge
* **Goal:** Demonstrate system design, abstraction, and AI-first UX.

### Slide 2: High-Level Architecture
* **Visual:** [Architecture Overview Diagram](./diagrams/markdown/architecture-overview.md)
* **Key Points:**
    * **Three-Tier Design:** Clear separation of concerns.
    * **Backend (NestJS):** Type safety, modularity, robust API.
    * **AI Service (Python/FastMCP):** Dedicated environment for data science tools (Pandas/NumPy).
    * **Frontend (React + Vite):** Fast, reactive UX with shadcn/ui.

### Slide 3: The Data Flow
* **Visual:** [Data Flow Diagram](./diagrams/markdown/data-flow.md)
* **Key Points:**
    * Files → Ingestion Pipeline → Normalized Storage (PostgreSQL).
    * User → Chat Interface → LangGraph Orchestrator → Tools → Database.
    * **Design Decision:** Real-time feedback via SSE (Server-Sent Events).

---

## Section 2: Handling Messy Data (Ingestion)

### Slide 4: The Parsing Strategy
* **Visual:** [Parser Strategy Diagram](./diagrams/markdown/parser-strategy.md)
* **The Challenge:** 8+ formats (XML, SQLite, CSV, Text), inconsistent headers.
* **The Solution:** Specificity-First Strategy Pattern.
    * Detects file type by content (magic bytes), not just extension.
    * Easily extensible (Open-Closed Principle).

### Slide 5: Data Abstraction & Storage
* **Visual:** [Database Schema Diagram](./diagrams/markdown/database-schema.md)
* **Design Decision:** Hybrid Schema.
    * **Columns:** "Golden Metrics" (Power, Energy) for fast SQL aggregation.
    * **JSONB:** Metadata column for vendor-specific quirks.
* **MVP Implementation:** Synchronous processing with `AsyncGenerator` (memory efficient).
* **Future Improvement:** Message Queue (RabbitMQ/BullMQ) for asynchronous bulk processing.

---

## Section 3: The AI Agent (LangGraph)

### Slide 6: Orchestration vs. Chatbot
* **Visual:** [LangGraph Main Graph](./diagrams/markdown/langgraph-main-graph.md)
* **The Concept:** Deterministic Graphs over probabilistic chaos.
* **Structure:**
    * **Explicit Flows:** Morning Briefing, Financial Report (Strict steps).
    * **Free Chat:** LLM Loop (Flexible fallback).

### Slide 7: Intelligent Routing
* **Visual:** [Agent Behavior / Router Logic](./diagrams/markdown/router-logic.md)
* **Optimization:** Two-Tier Classification.
    1.  **Regex (Tier 1):** Zero latency for greetings/patterns.
    2.  **LLM (Tier 2):** Semantic understanding for complex intents.
* **Benefit:** Reduces cost and latency; increases reliability.

### Slide 8: Resilience & Recovery
* **Visual:** [Recovery Subgraph](./diagrams/markdown/recovery-subgraph.md)
* **The Problem:** LLMs hallucinate when data is missing.
* **The Solution:** Standardized Tool Status Codes (`no_data_in_window`, `error`).
    * Agent triggers **Interactive Recovery** (e.g., rendering a Date Picker).
    * Prevents "I don't know" dead-ends.

---

## Section 4: AI-First User Experience

### Slide 9: The "Glass Box" Approach
* **Visual:** [Frontend Tool Rendering](./diagrams/markdown/frontend-tool-rendering.md)
* **Philosophy:** Don't hide the work. Show the user *what* the AI is doing.
* **Tool Categories:**
    * **Hidden:** Heavy math/data fetching (shown as status indicators).
    * **Visible:** Charts, Selection Prompts, Reports (Rendered Inline).

### Slide 10: Explicit Flows UX
* **Visual:** [Morning Briefing Flow](./diagrams/markdown/flow-morning-briefing.md)
* **Demo Preview:**
    * Narrative generation (Consultant-quality text).
    * Dynamic UI generation (Charts/KPI Cards).

---

## Section 5: Learnings & Demo

### Slide 11: Technologies & Workflow
* **Acceleration:** Used Claude Code & MCP for rapid API integration.
* **Quality:** SonarQube MCP for real-time code quality checks.
* **Flexibility:** System supports swapping providers (Gemini, OpenAI, Ollama/Local) via simple ENV vars.

### Slide 12: Live Demo & Q&A
* **Demo Checklist:**
    1.  Ingest "messy" folder.
    2.  Run "Morning Briefing" (See the graph action).
    3.  Trigger Error Recovery (Date Selection).
    4.  Perform "Performance Audit" (Multi-logger comparison).
* **Discussion:** Trade-offs, Scalability, Next Steps.