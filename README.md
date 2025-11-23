# PV Monitoring Platform

High-Throughput Solar Data Ingestion Platform - MVP

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                     PV Monitoring Platform                      │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌──────────────┐        ┌──────────────┐        ┌──────────┐  │
│  │   Frontend   │  HTTP  │   Backend    │  SQL   │ Postgres │  │
│  │  (React +    │◄──────►│  (NestJS +   │◄──────►│  (Docker)│  │
│  │  Tailwind)   │        │  TypeORM)    │        │          │  │
│  │  Port: 5173  │        │  Port: 3000  │        │Port: 5432│  │
│  └──────────────┘        └──────────────┘        └──────────┘  │
│                                                                 │
│                          ┌──────────────┐                       │
│                          │   Adminer    │                       │
│                          │  Port: 8080  │                       │
│                          └──────────────┘                       │
└─────────────────────────────────────────────────────────────────┘
```

## Tech Stack

| Layer      | Technology                          |
|------------|-------------------------------------|
| Frontend   | Vite + React + TypeScript           |
| Styling    | Tailwind CSS                        |
| Charts     | Recharts                            |
| HTTP       | Axios                               |
| Backend    | NestJS                              |
| ORM        | TypeORM                             |
| Database   | PostgreSQL 16                       |
| Containers | Docker Compose                      |

## Project Structure

```
pv-monitoring-platform/
├── backend/                 # NestJS application
│   ├── src/
│   │   ├── app.module.ts    # Main module with TypeORM config
│   │   ├── app.controller.ts
│   │   ├── app.service.ts
│   │   └── main.ts
│   ├── .env                 # Environment variables (DB_HOST=localhost)
│   └── package.json
├── frontend/                # Vite + React application
│   ├── src/
│   │   ├── App.tsx
│   │   ├── main.tsx
│   │   └── index.css        # Tailwind imports
│   ├── vite.config.ts       # Vite + Tailwind config
│   └── package.json
├── docker-compose.yml       # PostgreSQL + Adminer services
└── README.md
```

## Quick Start

### Prerequisites

- Node.js 18+
- Docker & Docker Compose
- npm

### 1. Start Database Services

```bash
docker-compose up -d
```

This starts:
- PostgreSQL on `localhost:5432`
- Adminer (DB UI) on `localhost:8080`

### 2. Start Backend

```bash
cd backend
npm run start:dev
```

Backend runs on `http://localhost:3000`

### 3. Start Frontend

```bash
cd frontend
npm run dev
```

Frontend runs on `http://localhost:5173`

## Database Access

### Via Adminer (Web UI)

1. Open `http://localhost:8080`
2. Connection details:
   - System: `PostgreSQL`
   - Server: `postgres` (use `postgres` as the server name in Adminer since it's in Docker network)
   - Username: `admin`
   - Password: `admin`
   - Database: `pv_db`

### Via psql (CLI)

```bash
docker exec -it pv_db psql -U admin -d pv_db
```

## Environment Variables

### Backend (.env)

```env
DB_HOST=localhost      # Use 'localhost' for local dev, 'postgres' for Docker network
DB_PORT=5432
DB_USERNAME=admin
DB_PASSWORD=admin
DB_DATABASE=pv_db
PORT=3000
```

## Available Scripts

### Backend

```bash
npm run start:dev     # Development with hot-reload
npm run start:prod    # Production build
npm run test          # Run tests
```

### Frontend

```bash
npm run dev           # Development server
npm run build         # Production build
npm run preview       # Preview production build
```

## API Endpoints

| Method | Endpoint | Description         |
|--------|----------|---------------------|
| GET    | /        | Health check        |

*More endpoints will be added as features are implemented.*

## Development Workflow

1. Make sure Docker services are running
2. Start backend in one terminal
3. Start frontend in another terminal
4. Access the app at `http://localhost:5173`

## Troubleshooting

### Database Connection Failed

1. Ensure Docker is running: `docker-compose ps`
2. Check PostgreSQL logs: `docker-compose logs postgres`
3. Verify `.env` has `DB_HOST=localhost`

### Port Already in Use

```bash
# Find and kill process on port
lsof -i :3000  # or :5173, :5432
kill -9 <PID>
```
