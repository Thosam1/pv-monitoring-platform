# Frontend - React Dashboard

React 19 + Vite 7 frontend with shadcn/ui components and AI chat interface.

## Tech Stack

- **Framework**: React 19, TypeScript
- **Build**: Vite 7
- **Styling**: Tailwind CSS 4, shadcn/ui
- **Charts**: Recharts 3.x
- **Animation**: Framer Motion 12.x
- **AI Chat**: @ai-sdk/react with SSE streaming

## Component Structure

![Frontend Components](../diagrams/svg/frontend-components.svg)

```
src/
├── components/
│   ├── layout/           # AppSidebar, SiteHeader, NavMain
│   ├── dashboard/        # Charts, KPIGrid, DashboardControls
│   ├── ai/               # ChatInterface, ChatMessage, ToolRenderer
│   └── ui/               # shadcn/ui components
├── views/                # Page views (ai-chat-view.tsx)
├── hooks/                # Custom hooks (use-ai-chat.ts)
├── lib/                  # Utilities (date-utils, cn)
└── types/                # TypeScript types
```

## Views

| View | Description |
|------|-------------|
| Dashboard | Logger data visualization with adaptive KPIs |
| Upload | Bulk file uploader with drag-n-drop |
| AI Chat | Chat interface with MCP tool results |
| Reports | Data export and reporting |

## AI Chat Features

![AI Chat Flow](../diagrams/svg/ai-chat-flow.svg)

- **SSE Streaming**: Real-time response streaming
- **Tool Rendering**: Visualizes MCP tool results
- **Chat History**: Persisted in localStorage
- **Suggestions**: Pre-defined quick prompts

## Charts

- **PerformanceChart**: Power and irradiance over time
- **TechnicalChart**: Secondary metrics (temperature, etc.)
- **GeneratorPowerChart**: Power generation visualization
- **DynamicChart**: AI-generated charts via MCP tools

## Development

```bash
npm install
npm run dev       # Development server (HMR)
npm run build     # Production build
npm run preview   # Preview production build
npm run lint      # ESLint check
```

## Key Dependencies

- `react` 19.x - UI framework
- `vite` 7.x - Build tool
- `@ai-sdk/react` - Vercel AI SDK React hooks
- `recharts` - Charting library
- `framer-motion` - Animations
- `date-fns` - Date utilities
- `lucide-react` - Icons

## Environment

Frontend connects to:
- Backend API: `http://localhost:3000`
- Vite dev server: `http://localhost:5173`

API proxy configured in `vite.config.ts` for `/api` routes.

See [CLAUDE.md](../CLAUDE.md) for coding standards and architecture patterns.
