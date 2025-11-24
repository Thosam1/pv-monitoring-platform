# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

PV Monitoring Platform - High-throughput solar data ingestion platform (MVP) for processing and visualizing photovoltaic inverter data from multiple sources (GoodWe, LTI ReEnergy, etc.).

## Architecture

- **Backend**: NestJS (port 3000) with TypeORM and PostgreSQL
- **Frontend**: React + Vite (port 5173) with Tailwind CSS and Recharts
- **Database**: PostgreSQL 16 (Docker, port 5432) with Adminer UI (port 8080)
- **Pattern**: Hybrid schema (golden metrics as columns + JSONB metadata for flexibility)

## Operating Principles & Code Standards

### Core Philosophy
- **NO PARTIAL IMPLEMENTATIONS**: Generate complete, working code. Eliminate mocks, stubs, TODOs, or placeholder functions unless explicitly requested.
- **DIRECT IMPLEMENTATION**: Do not describe what you are going to do; just do it.
- **Self-Correction**: If a file is missing imports or dependencies, fix it immediately without asking.

### Communication Guidelines
- **Eliminate Fluff**: Avoid social validation ("Great question!", "I understand"). Go straight to the solution.
- **No Hedging**: Avoid phrases like "might", "could potentially", or "consider adding." Be decisive.
- **Token Optimization**: Do not restate requirements I just gave you.

### Tool Usage Strategy
- **Batch Operations**: Always group file reads and writes. Do not read one file, think, then read another. Read all necessary context in one go.
- **Dependency Ordering**: Create utilities/types *before* the components that consume them.

### Problem Solving Workflow
1. **Exploration**: If requirements are vague, analyze the file structure and dependencies first.
2. **Implementation**: If requirements are clear, generate production-ready code with error handling immediately.
3. **Debugging**: If an error occurs, analyze the root cause based on logs, then generate the fix. Do not offer multiple theoretical solutions; pick the best one and implement it.

### Refactoring Directive
- **Extraction over Inlining**: When refactoring, always prefer extracting helper methods over inlining code.
- **Function Complexity Limits**: If a function exceeds 20 lines or has a cognitive complexity above 15, extract helper methods immediately.
- **Single Responsibility**: Each method should do exactly one thing. Complex operations must be decomposed into smaller, testable units.
- **No Premature Optimization**: Only refactor when complexity thresholds are exceeded or when adding new functionality.

### Testing Standards
- **Zero-Debt Policy**: No feature is considered "complete" without passing Unit Tests.
- **Backend**:
  - **Logic**: New Services/Strategies require isolated Unit Tests (`*.spec.ts`).
  - **API**: New Controllers require E2E Tests (`test/*.e2e-spec.ts`) using the *mocked repository* pattern.
  - **Data**: Use `backend/test/utils/csv-builder.ts` for test data. Do NOT hardcode CSV strings in test files.
- **Frontend**:
  - Ensure components build without TypeScript errors.
  - (Optional) Add Unit Tests for complex logic helpers (e.g., `calculateDateRange`).

### Strict Naming Conventions
- **Files**: Use kebab-case for all file names (e.g., `measurement.service.ts`, `kpi-grid.tsx`, `date-range-picker.tsx`)
- **Classes**: PascalCase for all class names (e.g., `MeasurementService`, `IngestionController`)
- **Interfaces**: PascalCase for all interfaces (e.g., `MeasurementChartData`, `IParser`)
- **Constants**: SCREAMING_SNAKE_CASE for all constants (e.g., `MAX_FILE_SIZE`, `DEFAULT_BATCH_SIZE`)
- **React Components**: PascalCase for component names, filename must match component name in kebab-case (e.g., `KpiGrid` in `kpi-grid.tsx`)
- **Functions/Methods**: camelCase for all functions and methods (e.g., `calculateDailyAverage`, `parseTimestamp`)
- **Variables**: camelCase for all variables (e.g., `loggerData`, `isLoading`)
- **Database Entities**: PascalCase with "Entity" suffix (e.g., `MeasurementEntity`)
- **DTOs**: PascalCase with "Dto" suffix (e.g., `CreateMeasurementDto`)

## Common Development Commands

### Initial Setup
```bash
# Start database services (PostgreSQL + Adminer)
docker-compose up -d

# Install backend dependencies
cd backend && npm install

# Install frontend dependencies
cd frontend && npm install
```

### Running the Application
```bash
# Terminal 1: Backend (hot reload enabled)
cd backend && npm run start:dev

# Terminal 2: Frontend (HMR enabled)
cd frontend && npm run dev

# Access points:
# - Frontend: http://localhost:5173
# - Backend API: http://localhost:3000
# - Database UI: http://localhost:8080 (user: admin, pass: admin, server: postgres)
```

### Testing
```bash
# Backend unit tests
cd backend && npm test

# Backend unit tests with coverage
cd backend && npm run test:cov

# Backend E2E tests
cd backend && npm run test:e2e

# Run single test file
cd backend && npm test -- ingestion.service.spec.ts

# Run tests in watch mode
cd backend && npm run test:watch
```

### Code Quality
```bash
# Backend linting
cd backend && npm run lint

# Frontend type checking and build
cd frontend && npm run build

# Frontend linting
cd frontend && npm run lint
```

## Commit Message Standard

**MANDATORY**: All commits must follow the Conventional Commits specification.

### Format
```
<type>[optional scope]: <description>

[optional body]

[optional footer(s)]
```

### Types
- **feat**: New feature or functionality
- **fix**: Bug fix
- **docs**: Documentation changes only
- **style**: Code style changes (formatting, semicolons, etc.) that don't affect logic
- **refactor**: Code refactoring without changing functionality
- **test**: Adding or modifying tests
- **chore**: Maintenance tasks, dependency updates, build changes

### Examples
```bash
feat: add CSV parser for SolarEdge inverters
fix: correct timestamp parsing in LTI strategy
docs: update API endpoint documentation
refactor: extract date validation logic to helper
test: add unit tests for batch processing
chore: upgrade TypeORM to v0.3.20
```

### Rules
- Use present tense ("add" not "added")
- Use imperative mood ("fix" not "fixes" or "fixed")
- Don't capitalize first letter after colon
- No period at the end of subject line
- Subject line max 72 characters
- Body line wrap at 80 characters

## Key Architecture Patterns

### Data Ingestion Flow (Backend)
1. **Controller** (`/ingest/:loggerType`) receives multipart CSV files
2. **Service** selects appropriate parser strategy based on logger type
3. **Parser** streams CSV via AsyncGenerator (memory-efficient)
4. **Batching** groups 1000 records for performance
5. **Upsert** into database with conflict resolution (composite key: loggerId + timestamp)

### Parser Strategy Pattern
- Interface: `IParser` with `canHandle()` and `parse()` methods
- Implementations: `GoodWeParser`, `LtiParser`
- Adding new parsers: Create new strategy in `/backend/src/ingestion/strategies/`

### Database Schema
```typescript
// Hybrid approach in measurement.entity.ts
@Entity('measurements')
- timestamp: Date (PK)
- loggerId: string (PK)
- activePowerWatts: float (golden metric)
- energyDailyKwh: float (golden metric)
- irradiance: float (golden metric)
- metadata: jsonb (flexible storage)
```

### Smart Date Resolution (Frontend)
- **Implicit mode**: Auto-detects latest data date when no filters provided
- **Explicit mode**: Uses provided start/end dates
- **Smart Sync**: On load, syncs UI to actual data date to prevent confusion

## API Endpoints

### Data Ingestion
```
POST /ingest/:loggerType
  - loggerType: "goodwe" | "lti"
  - Body: multipart/form-data (field: "files", max 10 files)
```

### Data Retrieval
```
GET /measurements                         # List all logger IDs
GET /measurements/:loggerId               # Get data (optional: ?start=&end=)
GET /measurements/:loggerId/date-range    # Get earliest/latest timestamps
```

## Project Structure

```
backend/
├── src/
│   ├── ingestion/           # Data ingestion module
│   │   ├── strategies/      # Parser implementations (GoodWe, LTI)
│   │   └── dto/            # Data transfer objects
│   ├── measurements/        # Data query module
│   └── database/entities/   # TypeORM entities
└── test/                   # E2E tests and fixtures

frontend/
├── src/
│   ├── App.tsx             # Main app with Smart Sync logic
│   └── components/
│       ├── BulkUploader.tsx    # Drag-n-drop file upload
│       └── dashboard/          # Charts and KPI components
```

## Testing Approach

- **Unit tests**: Use Jest mocks for TypeORM repositories
- **E2E tests**: Use Supertest for HTTP endpoint testing
- **Parser tests**: Test with fixture CSV files in `/backend/test/fixtures/`
- **Private method testing**: Cast to unknown type for access (see GoodWe parser tests)

## Important Implementation Details

### Memory-Efficient CSV Processing
Parsers use AsyncGenerator pattern to stream large files without loading into memory:
```typescript
async *parse(buffer: Buffer): AsyncGenerator<UnifiedMeasurementDto>
```

### Batch Processing
Ingestion service batches records in groups of 1000 for optimal database performance.

### CORS Configuration
Backend enables CORS for `http://localhost:5173` in `main.ts`.

### Date Handling
- All timestamps stored as UTC in database
- Parser-specific date format handling (GoodWe: compact format, LTI: ISO format)
- Frontend displays in local timezone

### Error Handling Strategy

#### Backend Error Handling
- **HTTP Exceptions**: Always use NestJS `HttpException` or its subclasses (`BadRequestException`, `NotFoundException`, etc.) for API errors
- **No Raw 500 Errors**: Never return raw 500 errors to clients. Catch all exceptions and wrap them with meaningful error messages
- **Logging**: Use NestJS `Logger` service for all error logging. NEVER use `console.log`, `console.error` in production code
- **Error Response Format**:
  ```typescript
  {
    statusCode: number,
    message: string | string[],
    error: string,
    timestamp: string,
    path: string
  }
  ```
- **Database Errors**: Catch TypeORM errors and translate to user-friendly messages (e.g., "Duplicate entry" → "Record already exists")
- **Validation Errors**: Use class-validator DTOs to validate input. Return detailed validation errors in the response
- **File Processing Errors**: Isolate per-file errors in bulk uploads. Return success/failure status for each file individually

#### Frontend Error Handling
- **Async Actions**: Always wrap async operations in try/catch blocks
- **UI States**: Every component must explicitly handle three states:
  - **Loading State**: Show spinner or skeleton loader
  - **Error State**: Display error message with retry option
  - **Empty State**: Show meaningful message when no data available
- **No Blank Screens**: Never leave the user with a blank screen. Always provide feedback
- **Error Boundaries**: Wrap feature components in React Error Boundaries to prevent full app crashes
- **User Notifications**: Use toast notifications for transient errors, inline errors for form validation
- **Retry Logic**: Provide manual retry buttons for failed network requests
- **Fallback Data**: When appropriate, show cached or default data with a warning indicator

#### Error Recovery Patterns
- **Graceful Degradation**: If a feature fails, disable it but keep the app functional
- **Circuit Breaker**: After 3 consecutive failures, temporarily disable the feature and notify the user
- **Exponential Backoff**: For retryable errors, implement exponential backoff (1s, 2s, 4s, 8s)
- **Data Integrity**: On partial failures, rollback entire transaction to maintain consistency

## CI/CD Pipeline

GitHub Actions workflow (`.github/workflows/ci.yml`):
1. Backend: lint → unit tests → E2E tests
2. Frontend: TypeScript check → build
3. Optional: SonarCloud analysis (if SONAR_TOKEN configured)

## Performance Considerations

### Database Queries (TypeORM)
- **N+1 Prevention**: Always use `.relations([])` or `.leftJoinAndSelect()` when fetching related entities.
- **Pagination**: Use `skip/take` (offset) for small lists, or `cursor` logic for massive datasets.
- **Indexes**: Monitor query performance; see `backend/src/database/entities/` for `@Index` definitions (e.g., BRIN for timestamps).
- **Upsert strategy**: ON CONFLICT DO UPDATE for idempotent ingestion
- **Streaming**: AsyncGenerator pattern prevents memory overflow
- **Batching**: 1000-record batches optimize database writes

### Frontend Optimization (Vite/React)
- **Bundle Splitting**: Use `React.lazy()` for heavy route components.
- **State Updates**: Batch updates; avoid unnecessary `useEffect` dependencies.
- **Memoization**: Use `useMemo` for expensive data transformations (like charting aggregations).

### Caching Strategy
- **React Query / SWR**: (Recommended for future) 5-minute stale time for dashboard data.
- **Browser**: Respect `Cache-Control` headers for static assets.

## Verification & Definition of Done

**MANDATORY**: Before declaring a task complete, you must run the following verification commands. If they fail, fix the errors immediately.

### Backend Tasks
1. **Linting**: `cd backend && npm run lint` (Must return 0 errors)
2. **Unit Tests**: `cd backend && npm run test` (Must pass)
3. **E2E Tests** (If API changed): `cd backend && npm run test:e2e`

### Frontend Tasks
1. **Linting**: `cd frontend && npm run lint`
2. **Build Check**: `cd frontend && npm run build` (Ensures no TypeScript errors)

### Full Stack Features
Run **both** sets of checks above.

## Maintenance Guidelines (Keep CLAUDE.md Living)

**Update this file when:**
- [ ] Adding new major dependencies (e.g., switching ORMs or UI libraries).
- [ ] Changing architectural patterns (e.g., moving from Strategy to Adapter pattern).
- [ ] Modifying directory structure (e.g., splitting backend into microservices).
- [ ] Adding new environment variables.
- [ ] Changing API response formats (e.g., wrapping responses in envelopes).
- [ ] Implementing new testing patterns.
- [ ] Discovering performance bottlenecks.
- [ ] Making security policy changes.