# Backend — FastAPI + DeepAgents

FastAPI backend powering the Companion agentic platform. Built on Python 3.12+ with LangGraph for agent orchestration and SQLite for persistence.

## Prerequisites

- **Python 3.12+**
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
# From project root directory
cd backend
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

The API will be available at **http://localhost:8000**.

### Required Environment Variables

Set `OPENAI_API_KEY` and `OPENAI_MODEL_NAME` in `.env` (copy from `.env.example`) before running agent features.

```bash
cp ../.env.example ../.env  # Unix/macOS
# Copy-Item ..\.env.example ..\.env  # Windows PowerShell
# Edit ../.env — set OPENAI_API_KEY and OPENAI_MODEL_NAME
```

In Docker, ensure `APP_ROOT_DIR=/app` is set (handled by `docker-compose.yml`).

## Project Structure

```
backend/
├── app/
│   ├── agent/          # DeepAgents runtime, backends, permissions
│   ├── api/            # FastAPI routes and app setup
│   │   ├── app.py      # FastAPI app with middleware
│   │   └── routes/     # Chat, threads, ideas, interrupts, KB routes
│   ├── config.py       # pydantic-settings configuration
│   ├── infrastructure/ # SSE event bus, stream management
│   └── services/       # Thread manager, interrupt service
├── tests/              # pytest test suite
│   ├── conftest.py     # Shared fixtures
│   └── fixtures/       # Reusable test fixtures
└── requirements.txt
```

## Running Tests

```bash
# All tests
cd backend
python -m pytest -v

# With coverage (CI standard — 60% minimum)
python -m pytest -v --tb=short --cov=app --cov-fail-under=60

# Specific test file
python -m pytest tests/test_api_performance.py -v
```

### Test Configuration

- Tests use **in-memory SQLite** (NFR-A13) — no persistent test data
- Tests use **mock LLM responses** (NFR-A10) — no live model calls required
- Async tests use `pytest-asyncio`; sync `SqliteSaver` for checkpoints

## Linting and Quality

```bash
# Syntax check (runs in CI)
python -m compileall app -q

# Forbidden import check (NFR-A12)
python ../scripts/forbidden_imports.py
```

## API Endpoints

- **Health:** `GET /health`
- **Chat:** `POST /api/chat/stream` (SSE streaming)
- **Threads:** `GET /api/threads`, `POST /api/threads`, `DELETE /api/threads/{id}`
- **Ideas:** `GET /api/ideas`, `POST /api/ideas`, `PATCH /api/ideas/{id}`
- **Interrupts:** `GET /api/interrupts`, `PATCH /api/interrupts/{id}/approve`
- **Knowledge Base:** `GET /api/knowledge-base`, `POST /api/knowledge-base/ingest`
- **SSE Events:** `GET /api/sse` (EventSource streaming)

See [Architecture](../docs/architecture.md) for full API documentation.

## Key Concepts

- **Single Checkpointer:** `SqliteSaver` is created once at startup — creating new connections causes "database is locked" errors
- **SSE Streaming:** Chat uses SSE (`StreamingResponse`) for real-time agent output
- **App Root Resolution:** Use `ROOT_DIR` from `config.py`, never `pathlib.Path(__file__).parent` for workspace resolution
- **MSGPACK:** `LANGGRAPH_STRICT_MSGPACK=true` is required for checkpoint serialization