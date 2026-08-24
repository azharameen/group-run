# Backend — FastAPI + DeepAgents

FastAPI backend powering the Companion agentic platform. Built on Python 3.12+ with LangGraph for agent orchestration, SQLAlchemy 2.0 + PostgreSQL for persistence, and Alembic for schema migrations.

## Prerequisites

- **Python 3.12+**
- **PostgreSQL 16+** (via Docker Compose for local development)
- **Virtual environment** recommended (`.venv`)

## Setup

```bash
# From project root
python -m venv .venv

# Activate (Windows)
.venv\Scripts\activate

# Install dependencies
cd backend
pip install -r requirements.txt
```

## Running Locally

```bash
# 1. Start local PostgreSQL container
docker-compose up -d postgres

# 2. Run API server (Alembic auto-migrates in dev mode)
cd backend
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

The API will be available at **http://localhost:8000**.

### Required Environment Variables

Set `DATABASE_URL` and `OPENAI_API_KEY` in `.env` (copy from `.env.example`) before running.

```bash
cp ../.env.example ../.env  # Unix/macOS
# Copy-Item ..\.env.example ..\.env  # Windows PowerShell
```

In Docker, ensure `APP_ROOT_DIR=/app` is set (handled by `docker-compose.yml`).

## Project Structure

```
backend/
├── alembic/            # Alembic schema migrations
├── app/
│   ├── agent/          # DeepAgents runtime, backends, permissions
│   ├── api/            # FastAPI routes and app setup
│   │   ├── app.py      # FastAPI app with middleware
│   │   └── routes/     # Chat, threads, ideas, interrupts, org, work items routes
│   ├── config.py       # pydantic-settings configuration
│   ├── db/             # SQLAlchemy AsyncEngine, session factory, ORM models
│   ├── repositories/   # Abstract ABCs and concrete PostgreSQL repositories
│   ├── infrastructure/ # SSE event bus, stream management
│   └── services/       # Thread manager (AsyncPostgresSaver), interrupt service
├── tests/              # pytest test suite
│   ├── conftest.py     # Shared fixtures (savepoint rollback DB isolation)
│   └── fixtures/       # Reusable test fixtures
├── alembic.ini
└── requirements.txt
```

## Running Tests

```bash
# All tests (uses per-test PostgreSQL savepoint isolation)
cd backend
python -m pytest -v

# With coverage (CI standard — 60% minimum)
python -m pytest -v --tb=short --cov=app --cov-fail-under=60
```

### Test Configuration

- Tests use **per-test PostgreSQL savepoint rollbacks** (`db_session` fixture) — no persistent test data pollution
- Tests use **mock LLM responses** (NFR-A10) — no live model calls required
- Async tests use `pytest-asyncio`

## Linting and Quality

```bash
# Syntax check (runs in CI)
python -m compileall app -q

# Forbidden import check (NFR-A12)
python ../scripts/forbidden_imports.py
```

## Key Concepts

- **PostgreSQL Async Engine:** Shared `AsyncEngine` singleton managing connection pooling (`asyncpg`)
- **LangGraph Checkpointer:** `AsyncPostgresSaver` backed by the shared PostgreSQL connection pool
- **Alembic Schema Migrations:** Declarative schema migrations enforced in CI/CD pipeline via `db-migrate.yml`
- **MSGPACK:** `LANGGRAPH_STRICT_MSGPACK=true` is required for checkpoint serialization