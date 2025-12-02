# AI Agent Architecture & UX Flows

This document provides comprehensive documentation for the PV Monitoring Platform's AI assistant, including system architecture, tool integration, and explicit UX flows. It serves as the contract between the Python tools API, TypeScript backend (LangGraph), and React frontend.

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [System Components](#2-system-components)
3. [Request/Response Lifecycle](#3-requestresponse-lifecycle)
4. [LLM Configuration](#4-llm-configuration)
5. [Tool Integration](#5-tool-integration)
6. [UI Protocol Schema](#6-ui-protocol-schema)
7. [LangGraph State Schema](#7-langgraph-state-schema)
8. [Flow Definitions](#8-flow-definitions)
9. [Recovery Subgraph](#9-recovery-subgraph)
10. [Frontend UX Patterns](#10-frontend-ux-patterns)
11. [State Diagrams](#11-state-diagrams)
12. [Implementation Status](#12-implementation-status)

---

## 1. Architecture Overview

The AI assistant uses a three-tier architecture: React frontend for user interaction, NestJS backend with LangGraph for orchestration, and a Python tools API for solar analytics.

![AI Chat Flow](diagrams/svg/ai-chat-flow.svg)

### System Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                         FRONTEND                                 │
│  ┌─────────────┐   ┌──────────────┐   ┌──────────────────────┐ │
│  │ ChatInterface│──>│ SSE Stream   │──>│ Tool Renderer        │ │
│  │             │   │ Parser       │   │ (Hidden/Visible)     │ │
│  └─────────────┘   └──────────────┘   └──────────────────────┘ │
└────────────────────────────┬────────────────────────────────────┘
                             │ POST /ai/chat (SSE response)
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                         BACKEND                                  │
│  ┌─────────────┐   ┌──────────────┐   ┌──────────────────────┐ │
│  │ AiController │──>│ LangGraph    │──>│ ToolsHttpClient      │ │
│  │             │   │ Service      │   │                      │ │
│  └─────────────┘   └──────────────┘   └──────────────────────┘ │
│                           │                      │              │
│              ┌────────────┴────────────┐         │              │
│              ▼            ▼            ▼         │              │
│         ┌────────┐  ┌──────────┐  ┌────────┐    │              │
│         │ Router │  │ Explicit │  │Recovery│    │              │
│         │ Node   │  │ Flows    │  │Subgraph│    │              │
│         └────────┘  └──────────┘  └────────┘    │              │
└─────────────────────────────────────────────────┼──────────────┘
                                                  │ HTTP POST
                                                  ▼
┌─────────────────────────────────────────────────────────────────┐
│                    PYTHON TOOLS API                              │
│  ┌─────────────┐   ┌──────────────┐   ┌──────────────────────┐ │
│  │ HTTP Router │──>│ Tool Registry│──>│ Query Builders       │ │
│  │ /api/tools  │   │ (10 tools)   │   │                      │ │
│  └─────────────┘   └──────────────┘   └──────────────────────┘ │
└─────────────────────────────────────────────────┬───────────────┘
                                                  │ SQL
                                                  ▼
                                         ┌────────────────┐
                                         │   PostgreSQL   │
                                         │  measurements  │
                                         └────────────────┘
```

### Component Responsibilities

| Component | Technology | Responsibility |
|-----------|------------|----------------|
| **Frontend** | React + Vite | User interaction, SSE streaming, tool visualization |
| **Backend** | NestJS + LangGraph | LLM orchestration, intent routing, flow execution |
| **Tools API** | Python + FastAPI | Solar analytics, database queries, data processing |
| **Database** | PostgreSQL | Measurements storage with hybrid schema |

---

## 2. System Components

### 2.1 Backend: LangGraph Orchestrator

The backend uses LangGraph's StateGraph for deterministic workflow management with LLM-powered intent classification.

**Key Files:**
- `backend/src/ai/langgraph.service.ts` - Main orchestrator
- `backend/src/ai/nodes/router.node.ts` - Intent classification
- `backend/src/ai/flows/*.flow.ts` - Explicit flow implementations
- `backend/src/ai/subgraphs/recovery.subgraph.ts` - Error recovery
- `backend/src/ai/langchain-tools.ts` - Tool definitions
- `backend/src/ai/tools-http.client.ts` - HTTP tool caller

**Architecture:**
```
LanggraphService
├── StateGraph (ExplicitFlowStateAnnotation)
│   ├── Router Node (intent classification)
│   ├── Explicit Flows
│   │   ├── morning_briefing
│   │   ├── financial_report
│   │   ├── performance_audit
│   │   └── health_check
│   ├── Free Chat Loop (fallback)
│   └── Recovery Subgraph (global error handler)
├── Tool Execution (ToolsHttpClient)
└── Event Streaming (streamEvents v2)
```

### 2.2 Python Tools API

The Python service exposes 10 solar analytics tools via HTTP REST API. It uses stateless HTTP calls (not SSE sessions).

**Key Files:**
- `ai/server.py` - ASGI entry point
- `ai/http_api.py` - REST endpoints and tool registry
- `ai/tools/*.py` - Tool implementations
- `ai/queries/builders.py` - SQL query builders
- `ai/models/responses.py` - Pydantic response schemas

**HTTP Endpoints:**
```
GET  /api/health          # Service health check
GET  /api/tools           # List all tool schemas
POST /api/tools/{name}    # Execute a specific tool
```

### 2.3 Frontend: Chat Interface

The frontend uses `@assistant-ui/react` for chat primitives (ThreadList, Thread, Composer) with custom tool rendering and SSE streaming integration.

**Key Files:**
- `frontend/src/components/assistant-ui/thread.tsx` - Chat thread with auto-scroll
- `frontend/src/components/assistant-ui/thread-list.tsx` - Conversation sidebar
- `frontend/src/components/ai/chat-interface.tsx` - Main chat UI
- `frontend/src/components/ai/tool-renderer.tsx` - Tool visualization
- `frontend/src/components/ai/chat-message.tsx` - Message rendering
- `frontend/src/components/ai/selection-prompt.tsx` - User input components
- `frontend/src/providers/assistant-runtime-provider.tsx` - SSE stream adapter

---

## 3. Request/Response Lifecycle

### 3.1 Complete Flow

```
User Message
     │
     ▼
POST /ai/chat ─────────────────────────────────────────────────┐
     │                                                          │
     ▼                                                          │
┌─────────────┐                                                 │
│   Router    │─── Classify intent ──> flow: "health_check"    │
└─────────────┘                        confidence: 0.95         │
     │                                                          │
     ├─── morning_briefing ───┐                                 │
     ├─── financial_report ───┤                                 │
     ├─── performance_audit ──┼──> Execute Flow Steps           │
     ├─── health_check ───────┤                                 │
     └─── free_chat ──────────┘                                 │
                │                                               │
                ▼                                               │
         Tool Execution ─── HTTP POST /api/tools/{name}        │
                │                                               │
                ▼                                               │
         ┌─────────────┐                                        │
         │Check Results│                                        │
         └─────────────┘                                        │
                │                                               │
         ┌──────┴──────┐                                        │
         ▼             ▼                                        │
      Success       Error ──> Recovery Subgraph                 │
         │                         │                            │
         └─────────┬───────────────┘                            │
                   ▼                                            │
            SSE Events ─────────────────────────────────────────┘
            • text-delta: "Analyzing..."
            • tool-input-available: {toolName, args}
            • tool-output-available: {toolCallId, output}
            • [DONE]
```

### 3.2 SSE Event Types

The backend streams events to the frontend using Server-Sent Events:

| Event Type | Payload | Description |
|------------|---------|-------------|
| `text-delta` | `{ delta: string }` | Incremental text from LLM |
| `tool-input-available` | `{ toolCallId, toolName, input }` | Tool call initiated |
| `tool-output-available` | `{ toolCallId, output }` | Tool execution result |
| `[DONE]` | - | Stream complete signal |

**Example SSE Stream:**
```
data: {"type":"text-delta","delta":"Analyzing"}
data: {"type":"text-delta","delta":" the health"}
data: {"type":"tool-input-available","toolCallId":"tool_123","toolName":"analyze_inverter_health","input":{"logger_id":"925","days":7}}
data: {"type":"tool-output-available","toolCallId":"tool_123","output":{"status":"ok","result":{...}}}
data: {"type":"text-delta","delta":"Found 2 anomalies"}
data: [DONE]
```

### 3.3 Message Transformation

```
Frontend (ChatMessage[])
     │
     ▼ Convert to LangChain format
Backend (BaseMessage[])
     │
     ▼ Add system prompt + tools
LLM Request
     │
     ▼ Stream response
LLM Response (AIMessage with tool_calls)
     │
     ▼ Execute tools via HTTP
Tool Results (ToolMessage[])
     │
     ▼ Continue LLM loop or return
SSE Events → Frontend
```

---

## 4. LLM Configuration

### 4.1 Multi-Provider Support

The backend supports four LLM providers, configurable via environment variables:

| Provider | Model | Environment Variable |
|----------|-------|---------------------|
| **Gemini** (default) | gemini-2.0-flash | `GOOGLE_GENERATIVE_AI_API_KEY` |
| **Anthropic** | claude-3-5-sonnet | `ANTHROPIC_API_KEY` |
| **OpenAI** | gpt-4o | `OPENAI_API_KEY` |
| **Ollama** (local) | gpt-oss:20b | `OLLAMA_BASE_URL`, `OLLAMA_MODEL` |

**Configuration:**
```env
AI_PROVIDER=gemini              # Options: gemini | anthropic | openai | ollama
MCP_SERVER_URL=http://localhost:4000  # Python tools API base URL

# Ollama-specific (when AI_PROVIDER=ollama)
OLLAMA_BASE_URL=http://127.0.0.1:11434
OLLAMA_MODEL=gpt-oss:20b
```

### 4.2 System Prompt Structure

The LLM receives a detailed system prompt (~237 lines) with a 5-level rule hierarchy:

```
1. Recovery Rules (highest priority)
   └─ Handle no_data_in_window, no_data errors first

2. Tool Selection Rules
   └─ Which tool to use for which intent

3. UI Rendering Rules
   └─ How to display results (render_ui_component)

4. Narrative Rules
   └─ "Sandwich Pattern": Intro → Action → Insight

5. Conversation Flow Rules (lowest priority)
   └─ Interaction patterns, temporal word mapping
```

### 4.3 Context Sent to LLM

Each LLM call receives:
- **System prompt** with tool descriptions and rules
- **Conversation history** (full message chain)
- **Bound tools** (10 solar analytics + 2 UI pass-through)
- **Flow context** (if in explicit flow: selectedLoggerId, dateRange, etc.)

---

## 5. Tool Integration

### 5.1 HTTP API Endpoints

The Python tools API uses stateless HTTP (not SSE sessions):

```
Base URL: http://localhost:4000

GET  /api/health              # Health check
GET  /api/tools               # List tool schemas (OpenAPI format)
POST /api/tools/{tool_name}   # Execute tool with JSON body
```

### 5.2 Available Tools

| Tool | Category | Parameters | Returns |
|------|----------|------------|---------|
| `list_loggers` | Discovery | None | Logger list with date ranges |
| `get_fleet_overview` | Discovery | None | Site-wide aggregation |
| `analyze_inverter_health` | Monitoring | `logger_id`, `days` | Anomaly report |
| `get_power_curve` | Monitoring | `logger_id`, `date` | Timeseries + summaryStats |
| `compare_loggers` | Comparison | `logger_ids[]`, `metric`, `date` | Multi-logger data |
| `calculate_financial_savings` | Financial | `logger_id`, `start_date`, `end_date`, `rate` | Savings + CO2 offset |
| `calculate_performance_ratio` | Performance | `logger_id`, `date`, `capacity_kw` | Efficiency metrics |
| `forecast_production` | Forecasting | `logger_id`, `days_ahead` | Production prediction |
| `diagnose_error_codes` | Diagnostics | `logger_id`, `days` | Error interpretation |
| `health_check` | Service | None | Database connectivity |

### 5.3 Smart Recovery Status Codes

All tools return a `status` field enabling intelligent error recovery:

| Status | Meaning | Recovery Action |
|--------|---------|-----------------|
| `ok` | Success | Display results |
| `no_data_in_window` | Data exists, wrong date range | Show date picker with `availableRange` |
| `no_data` | Logger has no data | Suggest upload or alternative loggers |
| `error` | Tool execution failed | Show error with retry option |

**Example Response with Recovery Hint:**
```json
{
  "status": "no_data_in_window",
  "message": "No data available for 2025-01-15",
  "availableRange": {
    "start": "2024-12-01",
    "end": "2025-01-10"
  }
}
```

### 5.4 SummaryStats for Narrative Insights

Power curve and other tools return `summaryStats` to enable LLM-generated consultant-quality narratives:

```typescript
interface SummaryStats {
  peakValue: number;      // Maximum value in dataset
  peakTime: string;       // ISO timestamp of peak
  avgValue: number;       // Average value
  totalEnergy?: number;   // Cumulative energy (kWh)
  trend: 'increasing' | 'decreasing' | 'stable';
}
```

### 5.5 Tool Visibility Categories

Tools are categorized for frontend rendering:

**Hidden Tools** (shown only in debug panel):
- `list_loggers`, `analyze_inverter_health`, `get_power_curve`
- `compare_loggers`, `calculate_financial_savings`, `calculate_performance_ratio`
- `forecast_production`, `diagnose_error_codes`, `get_fleet_overview`

**Visible Tools** (rendered inline):
- `render_ui_component` - Charts and data visualizations
- `request_user_selection` - Dropdowns and date pickers

---

## 6. UI Protocol Schema

### 6.1 render_ui_component

The `render_ui_component` tool renders charts and data visualizations. Extended with `suggestions` for contextual follow-up actions.

```typescript
interface RenderUIComponentArgs {
  component: 'DynamicChart' | 'FleetOverview' | 'FinancialReport' | 'HealthReport' | 'ComparisonChart';
  props: ComponentProps;
  suggestions?: SuggestionItem[];
}

interface SuggestionItem {
  label: string;                        // Display text: "Check efficiency"
  action: string;                       // Natural language action: "calculate_performance_ratio for {loggerId}"
  priority: 'primary' | 'secondary';    // Visual prominence
}

// Component-specific props
interface DynamicChartProps {
  chartType: 'composed' | 'line' | 'bar' | 'pie';
  data: DataPoint[];
  xAxisKey: string;
  series: SeriesConfig[];
  summaryStats?: SummaryStats;
}

interface FleetOverviewProps {
  totalPower: number;
  totalEnergy: number;
  deviceCount: number;
  onlineCount: number;
  percentOnline: number;
  alerts?: Alert[];
}

interface FinancialReportProps {
  energyGenerated: number;
  savings: number;
  co2Offset: number;
  treesEquivalent: number;
  forecast?: ForecastData;
}

interface HealthReportProps {
  loggerId: string;
  period: string;
  anomalies: Anomaly[];
  healthScore: number;
}

interface ComparisonChartProps {
  loggers: LoggerComparison[];
  metric: 'power' | 'energy' | 'irradiance';
  period: string;
}
```

### 6.2 request_user_selection

The `request_user_selection` tool prompts users for input. Extended with `flowHint` for context-aware guidance.

```typescript
interface RequestUserSelectionArgs {
  prompt: string;
  options?: SelectionOption[];
  selectionType: 'single' | 'multiple';
  inputType: 'dropdown' | 'date' | 'date-range';
  minDate?: string;                     // ISO date for date pickers
  maxDate?: string;
  flowHint?: FlowHint;
}

interface SelectionOption {
  value: string;
  label: string;
  group?: string;                       // For grouped dropdowns (e.g., "Inverters", "Meteo")
}

interface FlowHint {
  expectedNext: string;                 // "Will compare selected loggers"
  skipOption?: {
    label: string;                      // "Use all available"
    action: string;                     // Fallback action if skipped
  };
}
```

---

## 7. LangGraph State Schema

### 7.1 ChatState Annotation

```typescript
import { Annotation, MessagesAnnotation } from '@langchain/langgraph';

// Flow type enumeration
type FlowType =
  | 'morning_briefing'
  | 'financial_report'
  | 'performance_audit'
  | 'health_check'
  | 'free_chat';

// Context accumulated during flow execution
interface FlowContext {
  selectedLoggerId?: string;
  selectedLoggerIds?: string[];
  selectedDate?: string;
  dateRange?: { start: string; end: string };
  toolResults?: Record<string, unknown>;
  extractedLoggerName?: string;
  analyzeAllLoggers?: boolean;
}

// Pending UI actions for pass-through tools
interface PendingUiAction {
  toolCallId: string;
  toolName: string;
  args: unknown;
}

// Extended state annotation
const ExplicitFlowStateAnnotation = Annotation.Root({
  // Inherit message history
  ...MessagesAnnotation.spec,

  // Recovery loop guard (max 3 attempts)
  recoveryAttempts: Annotation<number>({
    reducer: (_, next) => next,
    default: () => 0,
  }),

  // Pass-through UI tools (render_ui_component, request_user_selection)
  pendingUiActions: Annotation<PendingUiAction[]>({
    reducer: (_, next) => next,
    default: () => [],
  }),

  // Active workflow identifier
  activeFlow: Annotation<FlowType | null>({
    reducer: (_, next) => next,
    default: () => null,
  }),

  // Current step within the flow
  flowStep: Annotation<number>({
    reducer: (_, next) => next,
    default: () => 0,
  }),

  // Accumulated context (logger selections, dates, results)
  flowContext: Annotation<FlowContext>({
    reducer: (curr, next) => ({ ...curr, ...next }),
    default: () => ({}),
  }),
});
```

### 7.2 Router Classification Schema

```typescript
import { z } from 'zod';

const FlowClassificationSchema = z.object({
  flow: z.enum([
    'morning_briefing',
    'financial_report',
    'performance_audit',
    'health_check',
    'free_chat'
  ]),
  confidence: z.number().min(0).max(1),
  extractedParams: z.object({
    loggerId: z.string().optional(),
    loggerName: z.string().optional(),
    date: z.string().optional(),
  }).optional(),
});

const CLASSIFICATION_PROMPT = `Classify the user's intent into one of these workflows:

- morning_briefing: Fleet overview, site status, "how is everything", daily summary, "morning briefing"
- financial_report: Savings, ROI, money, cost, revenue, financial analysis, "how much did I save"
- performance_audit: Compare inverters, efficiency, performance ratio, audit, "compare loggers"
- health_check: Anomalies, errors, health status, diagnostics, problems, "check health"
- free_chat: General questions, specific data queries, single logger operations, anything else

Extract any mentioned logger ID/name or date if present in the message.

Return JSON: { flow: string, confidence: number, extractedParams?: { loggerId?, loggerName?, date? } }`;
```

---

## 8. Flow Definitions

### 8.1 Morning Briefing Flow

**Trigger Phrases:** "Morning briefing", "Fleet overview", "How is the site?", "Daily summary"

**Goal:** Provide site-wide status with critical alerts.

| Step | Node | Tool Call | Condition | Next |
|------|------|-----------|-----------|------|
| 1 | `fleet_overview` | `get_fleet_overview()` | - | Step 2 |
| 2 | `check_critical` | (inspect result) | `percentOnline < 100` | Step 3 |
| 2 | `check_critical` | (inspect result) | `percentOnline === 100` | Step 4 |
| 3 | `diagnose_issues` | `diagnose_error_codes(offline_loggers)` | - | Step 4 |
| 4 | `render_briefing` | `render_ui_component(FleetOverview, { suggestions })` | - | END |

**Suggestions (Step 4):**
```json
[
  { "label": "Check efficiency", "action": "Show performance ratio for the fleet", "priority": "primary" },
  { "label": "Financial summary", "action": "Show financial savings for the past month", "priority": "secondary" }
]
```

### 8.2 Financial Report Flow

**Trigger Phrases:** "Financial report", "How much did I save?", "ROI", "Savings analysis"

**Goal:** Calculate savings and forecast future production.

| Step | Node | Tool Call | Condition | Next |
|------|------|-----------|-----------|------|
| 1 | `check_context` | (check flowContext.selectedLoggerId) | Has logger | Step 3 |
| 1 | `check_context` | - | No logger | Step 2 |
| 2 | `select_logger` | `list_loggers()` → `request_user_selection()` | User selects | Step 3 |
| 3 | `calculate_savings` | `calculate_financial_savings(logger, 30d)` | Success | Step 4 |
| 3 | `calculate_savings` | - | `no_data_in_window` | Recovery |
| 4 | `forecast` | `forecast_production(logger, 7d)` | - | Step 5 |
| 5 | `render_report` | `render_ui_component(FinancialReport, { suggestions })` | - | END |

**Suggestions (Step 5):**
```json
[
  { "label": "Extend forecast", "action": "Forecast production for the next 30 days", "priority": "primary" },
  { "label": "Compare savings", "action": "Compare financial performance across all loggers", "priority": "secondary" }
]
```

### 8.3 Performance Audit Flow

**Trigger Phrases:** "Performance audit", "Compare inverters", "Efficiency check", "Compare loggers"

**Goal:** Compare multiple loggers on key metrics.

| Step | Node | Tool Call | Condition | Next |
|------|------|-----------|-----------|------|
| 1 | `discover_loggers` | `list_loggers()` | - | Step 2 |
| 2 | `select_loggers` | `request_user_selection({ selectionType: 'multiple', min: 2, max: 5 })` | User selects | Step 3 |
| 3 | `compare` | `compare_loggers(selected, 'power', latest)` | Success | Step 4 |
| 3 | `compare` | - | `no_data_in_window` | Recovery |
| 4 | `render_chart` | `render_ui_component(ComparisonChart, { suggestions })` | - | END |

**Suggestions (Step 4):**
```json
[
  { "label": "Compare energy", "action": "Compare total energy production", "priority": "primary" },
  { "label": "Health check", "action": "Check health for the lowest performer", "priority": "secondary" }
]
```

### 8.4 Health Check Flow

**Trigger Phrases:** "Health check", "Check anomalies", "Diagnose inverter", "Any problems?"

**Goal:** Analyze inverter health and detect anomalies.

| Step | Node | Tool Call | Condition | Next |
|------|------|-----------|-----------|------|
| 1 | `check_context` | (check flowContext.selectedLoggerId) | Has logger | Step 3 |
| 1 | `check_context` | - | No logger | Step 2 |
| 2 | `select_logger` | `list_loggers()` → `request_user_selection()` | User selects | Step 3 |
| 3 | `analyze_health` | `analyze_inverter_health(logger, 7d)` | Success | Step 4 |
| 3 | `analyze_health` | - | `no_data_in_window` | Recovery |
| 4 | `render_report` | Anomaly table + insights | - | END |

**Suggestions (Step 4):**
```json
[
  { "label": "Show power curve", "action": "Show power curve for the anomaly dates", "priority": "primary" },
  { "label": "Diagnose errors", "action": "Check error codes in metadata", "priority": "secondary" }
]
```

### 8.5 Free Chat Mode

**Trigger:** Any query not matching explicit flows, or confidence < 0.7

**Behavior:** Classic LLM agent loop with tool execution:
1. LLM receives message + system prompt + bound tools
2. If tool calls → execute via ToolsHttpClient → return results
3. Check results for recoverable errors
4. Loop until no tool calls or END signal

---

## 9. Recovery Subgraph

The recovery subgraph handles data availability errors globally across all flows.

### 9.1 Triggers

| Status Code | Meaning | Recovery Action |
|-------------|---------|-----------------|
| `no_data_in_window` | Data exists, but not in requested date range | Show date picker with valid range |
| `no_data` | Logger has no data at all | Suggest upload or list other loggers |
| `error` | Tool execution failed | Show error message with retry option |

### 9.2 Recovery State Machine

```
[Tool Error Detected]
        |
        v
[detect_recovery_type]
        |
        +-- no_data_in_window --> [extract_available_range] --> [prompt_date_selection] --> [retry_with_date]
        |
        +-- no_data --> [suggest_alternatives] --> END
        |
        +-- error --> [explain_error] --> END
```

### 9.3 Date Selection Recovery

When a tool returns `no_data_in_window`:

```typescript
// Tool response
{
  status: 'no_data_in_window',
  message: 'No data available for 2025-01-15',
  availableRange: {
    start: '2024-12-01',
    end: '2025-01-10'
  }
}

// Recovery action
request_user_selection({
  prompt: 'No data for January 15. Please select a date within the available range:',
  inputType: 'date',
  minDate: '2024-12-01',
  maxDate: '2025-01-10',
  flowHint: {
    expectedNext: 'Will retry the analysis with your selected date',
    skipOption: {
      label: 'Use latest available',
      action: 'Use 2025-01-10'
    }
  }
})
```

### 9.4 Recovery Loop Guard

To prevent infinite retry loops, the state tracks `recoveryAttempts` (max 3):

```typescript
if (state.recoveryAttempts >= 3) {
  return {
    messages: [new AIMessage("I'm having trouble retrieving data. Please try a different query.")],
    recoveryAttempts: 0  // Reset for next query
  };
}
```

---

## 10. Frontend UX Patterns

### 10.1 Tool Visibility Strategy

The frontend separates tools into two categories for clean UX:

**Hidden Tools** (data fetching - shown in debug panel only):
```typescript
const HIDDEN_TOOLS = [
  'list_loggers',
  'analyze_inverter_health',
  'get_power_curve',
  'compare_loggers',
  'calculate_financial_savings',
  'calculate_performance_ratio',
  'forecast_production',
  'diagnose_error_codes',
  'get_fleet_overview'
];
```

**Visible Tools** (rendered inline):
```typescript
const VISIBLE_TOOLS = [
  'render_ui_component',      // Charts, cards, reports
  'request_user_selection'    // Dropdowns, date pickers
];
```

### 10.2 Loading States

| State | Indicator | Condition |
|-------|-----------|-----------|
| Thinking | Amber sparkles + bouncing dots | No content yet |
| Analyzing | Blue wrench + bouncing dots | Hidden tools executing |
| Streaming | Text appearing | Text deltas arriving |

### 10.3 Follow-up Suggestions

After tool completion, context-aware suggestions appear:

```typescript
const FOLLOWUP_RULES = {
  analyze_inverter_health: [
    { label: "Show power curve", condition: "always" },
    { label: "Diagnose errors", condition: "anomalyCount > 0" }
  ],
  get_fleet_overview: [
    { label: "Check efficiency", condition: "always" },
    { label: "Financial summary", condition: "always" }
  ]
};
```

### 10.4 Chat History Persistence

Conversations persist in localStorage:

```typescript
interface Conversation {
  id: string;
  title: string;              // Auto-extracted from first message (50 chars)
  messages: Message[];
  createdAt: string;
  updatedAt: string;
}

// Storage key
const STORAGE_KEY = 'solar-analyst-chats';
```

### 10.5 Error Recovery UI

| Error Type | Display | Action |
|------------|---------|--------|
| Network | Red alert icon | Retry button |
| Timeout | Clock icon | Retry button |
| API | Warning icon | Retry button |
| Unknown | Alert icon | Retry button |

### 10.6 User Selection Flow

1. AI sends `request_user_selection` tool call
2. Frontend renders SelectionPrompt (dropdown or date picker)
3. User makes selection
4. Selection sent as text message: "Selected: [value]"
5. UI disables further selection
6. AI continues with selected value in context

---

## 11. State Diagrams

### 11.1 Main Graph Structure

```
                    ┌─────────────────────────────────────────────────────┐
                    │                                                     │
                    v                                                     │
┌───────┐    ┌──────────┐    ┌───────────────────┐                       │
│ START │───>│  router  │───>│ morning_briefing  │───────────────────────┼──> END
└───────┘    └──────────┘    └───────────────────┘                       │
                    │                                                     │
                    │         ┌───────────────────┐                       │
                    ├────────>│ financial_report  │───────────────────────┼──> END
                    │         └───────────────────┘                       │
                    │                                                     │
                    │         ┌───────────────────┐                       │
                    ├────────>│ performance_audit │───────────────────────┼──> END
                    │         └───────────────────┘                       │
                    │                                                     │
                    │         ┌───────────────────┐                       │
                    ├────────>│   health_check    │───────────────────────┼──> END
                    │         └───────────────────┘                       │
                    │                                                     │
                    │         ┌───────────────────┐     ┌─────────┐       │
                    └────────>│    free_chat      │────>│  tools  │───────┤
                              └───────────────────┘     └─────────┘       │
                                       ^                     │            │
                                       │              ┌──────v──────┐     │
                                       │              │check_results│     │
                                       │              └──────┬──────┘     │
                                       │                     │            │
                                       │              ┌──────v──────┐     │
                                       └──────────────│  recovery   │─────┘
                                                      └─────────────┘
```

### 11.2 Morning Briefing Flow

```
┌─────────────────┐
│  fleet_overview │
│  get_fleet_...  │
└────────┬────────┘
         │
         v
┌─────────────────┐
│  check_critical │
│  (inspect)      │
└────────┬────────┘
         │
    ┌────┴────┐
    │         │
    v         v
< 100%    = 100%
    │         │
    v         │
┌─────────┐   │
│diagnose │   │
│ issues  │   │
└────┬────┘   │
     │        │
     └────┬───┘
          │
          v
┌─────────────────┐
│ render_briefing │
│ render_ui_...   │
└────────┬────────┘
         │
         v
       [END]
```

### 11.3 Recovery Subgraph

```
┌───────────────────────┐
│ detect_recovery_type  │
└───────────┬───────────┘
            │
    ┌───────┼───────┐
    │       │       │
    v       v       v
no_data  no_data  error
in_window   │       │
    │       │       │
    v       v       v
┌───────┐ ┌─────┐ ┌───────┐
│extract│ │list │ │explain│
│ range │ │alts │ │ error │
└───┬───┘ └──┬──┘ └───┬───┘
    │        │        │
    v        v        v
┌────────┐   │      [END]
│ prompt │   │
│  date  │   │
└───┬────┘   │
    │        │
    v        │
┌────────┐   │
│ retry  │   │
│ w/date │   │
└───┬────┘   │
    │        │
    └────┬───┘
         │
         v
   [Return to flow]
```

---

## 12. Implementation Status

### Backend
- [x] Create `backend/src/ai/types/flow-state.ts`
- [x] Create `backend/src/ai/nodes/router.node.ts`
- [x] Create `backend/src/ai/flows/morning-briefing.flow.ts`
- [x] Create `backend/src/ai/flows/financial-report.flow.ts`
- [x] Create `backend/src/ai/flows/performance-audit.flow.ts`
- [x] Create `backend/src/ai/flows/health-check.flow.ts`
- [x] Create `backend/src/ai/subgraphs/recovery.subgraph.ts`
- [x] Update `backend/src/ai/langchain-tools.ts`
- [x] Update `backend/src/ai/langgraph.service.ts`

### Frontend
- [x] Update `frontend/src/components/ai/tool-renderer.tsx`
- [x] Update `frontend/src/components/ai/chat-message.tsx`
- [x] Create `frontend/src/components/ai/selection-prompt.tsx`
- [x] Create `frontend/src/components/ai/metric-card.tsx`
- [x] Create `frontend/src/components/ai/status-badge.tsx`

### Python Tools API
- [x] HTTP REST API at `/api`
- [x] All 10 tools implemented
- [x] Smart recovery status codes
- [x] SummaryStats for narrative insights

### Testing
- [ ] Create `scripts/simulate-flow.ts`
- [ ] Create unit tests for each flow
- [ ] Create E2E tests for workflow triggers

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 2.0.0 | 2025-12-02 | Added architecture overview, system components, lifecycle, LLM config, tool integration, frontend UX patterns |
| 1.0.0 | 2025-12-01 | Initial specification (flows, state schema, recovery) |
