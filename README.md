# Companion — Agentic Organization Platform

A general-purpose multi-agent orchestration system built on LangGraph and DeepAgents. Model an autonomous software organization where AI agents collaborate on work items through threaded conversations with true event streaming.

## Quick Start

Prerequisites: **Python 3.12+**, **Node.js 20+**, **Docker & Docker Compose**.

```bash
# 1. Clone and enter the repository
git clone <repo-url> && cd <repo-directory>

# 2. Configure environment
cp .env.example .env  # Unix/macOS
# Copy-Item .env.example .env  # Windows PowerShell
# Edit .env — at minimum set OPENAI_API_KEY and OPENAI_MODEL_NAME

# 3. Start both services with Docker Compose
docker compose up --build
```

The frontend is available at **http://localhost:3000** and the backend API at **http://localhost:8000**.

For a step-by-step local development setup (without Docker), see [Getting Started](docs/GETTING_STARTED.md).

## Documentation

| Guide | Description |
|-------|-------------|
| [Getting Started](docs/GETTING_STARTED.md) | 15-minute developer onboarding |
| [Deployment](docs/DEPLOYMENT.md) | Docker Compose deployment guide |
| [Architecture](docs/architecture.md) | System architecture and design |
| [Features](docs/features.md) | Feature inventory and status |
| [Architecture Decisions](docs/architecture-decisions.md) | ADR log |
| [Coding Guidelines](docs/coding-guidelines.md) | Code style and conventions |

## Project Structure

```
companion/
├── backend/            # FastAPI backend (Python)
│   ├── app/            # Application package
│   │   ├── agent/      # DeepAgents runtime, backends, permissions
│   │   ├── api/        # FastAPI routes and schemas
│   │   ├── services/   # Thread manager, interrupt service
│   │   ├── storage/    # Persistence layers
│   │   └── config.py   # Environment configuration (pydantic-settings)
│   ├── tests/          # pytest test suite
│   └── requirements.txt
├── frontend/           # React + Vite frontend (TypeScript)
│   ├── src/
│   │   ├── api/        # Centralized API clients
│   │   ├── components/ # shadcn/ui components and feature components
│   │   ├── hooks/      # Custom React hooks (SSE streaming, threads)
│   │   ├── pages/      # Route pages
│   │   └── types/      # TypeScript type definitions
│   ├── e2e/            # Playwright E2E tests
│   └── package.json
├── config/             # Runtime configuration (teams.yaml, mcp.json)
├── docs/               # Project documentation
├── instructions/       # Agent system prompts
├── knowledge-base/     # Knowledge base documents
├── workspace/          # Agent work artifacts
└── storage/            # Persistent data
```

## Tech Stack

- **Backend:** Python 3.12+, FastAPI, Uvicorn
- **Agent Runtime:** DeepAgents, LangGraph (SQLite checkpoints)
- **Frontend:** React 18, Vite, TypeScript (strict mode)
- **UI:** shadcn/ui, Radix UI, Tailwind CSS
- **Testing:** pytest (backend), Vitest + Playwright (frontend)
- **Deployment:** Docker Compose (2 services)

## License

This project is provided as-is for internal use.