# Getting Started

Get the Companion application running on your local machine in 15 minutes.

## Prerequisites

Install these before starting:

- **Python 3.12+** — [python.org](https://www.python.org/downloads/)
- **Node.js 24 LTS** — [nodejs.org](https://nodejs.org/)
- **Git** — [git-scm.com](https://git-scm.com/)

### Windows-Specific Notes

On Windows, use PowerShell for all commands. Python commands use `python` (not `python3`).

## Step 1: Clone the Repository

```bash
git clone <repo-url>
cd ideator
```

## Step 2: Configure Environment

```bash
# Copy the environment template
cp .env.example .env  # Unix/macOS
# Copy-Item .env.example .env  # Windows PowerShell
```

Edit `.env` and set at minimum:

```text
OPENAI_API_KEY=sk-your-key-here
OPENAI_MODEL_NAME=gpt-4o
LANGGRAPH_STRICT_MSGPACK=true
```

See [`.env.example`](https://azharameen.github.io/group-run/.env.example) for all available options.

## Step 3: Set Up the Backend

```bash
# Create virtual environment
python -m venv .venv

# Activate it
.venv\Scripts\activate  # Windows
# source .venv/bin/activate  # macOS/Linux

# Install dependencies
cd backend
pip install -r requirements.txt
cd ..
```

## Step 4: Start the Backend

From the project root, in one terminal:

```bash
.venv\Scripts\activate  # If not already activated
cd backend
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

You should see: `INFO: Uvicorn running on http://0.0.0.0:8000`

Verify the health endpoint:

```bash
curl http://localhost:8000/health
# Windows alternative: Invoke-RestMethod http://localhost:8000/health
```

## Step 5: Set Up the Frontend

In a second terminal:

```bash
cd frontend
npm install
```

## Step 6: Start the Frontend

In the second terminal (with backend still running):

```bash
# Set the API proxy
$env:VITE_API_PROXY="http://localhost:8000"

# Start the dev server
npm run dev
```

You should see: `Local: http://localhost:3000/`

## Step 7: Verify Everything Works

1. Open **http://localhost:3000** in your browser
1. You should see the Companion chat interface
1. Send a test message — you should see streaming agent responses

## Running Tests

### Backend Tests

```bash
cd backend
python -m pytest -v
```

All backend tests use in-memory SQLite and mock LLM — no API key needed.

### Frontend Tests

```bash
cd frontend

# Unit tests
npm test

# E2E tests (backend must be running)
npm run test:e2e
```

## Troubleshooting

### Backend won't start

- **Port 8000 in use:** Stop any process on port 8000 or use `--port 8001`
- **Missing API key:** Set `OPENAI_API_KEY` in `.env` — agent features need it
- **`LANGGRAPH_STRICT_MSGPACK` error:** Add `LANGGRAPH_STRICT_MSGPACK=true` to `.env`

### Frontend can't connect to backend

- **CORS errors:** The Vite dev proxy handles this — ensure `VITE_API_PROXY` points to your backend
- **Backend not running:** Start the backend first (port 8000), then the frontend

### "Database is locked" errors

This indicates multiple `SqliteSaver` connections. The checkpointer is a singleton — restart the backend to clear any stale connections.

### E2E tests fail

- **Backend must be running:** Playwright dev tests assume the backend is on port 8000
- **Browser installation:** Run `npx playwright install` once to install test browsers

## Next Steps

- [Architecture](https://azharameen.github.io/group-run/architecture/index.md) — Understand how the system works
- [Features](https://azharameen.github.io/group-run/features/index.md) — Explore available features
- [Coding Guidelines](https://azharameen.github.io/group-run/coding-guidelines/index.md) — Contribution standards
- [Deployment](https://azharameen.github.io/group-run/DEPLOYMENT/index.md) — Docker Compose deployment
