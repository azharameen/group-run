# For AI Agents: How to Consume This Documentation

This page explains how external AI agents (Custom GPTs, Claude Workspaces, LangChain agents, and other cloud AI systems) can consume the Group Run documentation programmatically.

## Machine-Readable Context Files

The docs site auto-generates two files on every build:

| File | URL | Best For |
|---|---|---|
| `llms.txt` | `https://azharameen.github.io/group-run/llms.txt` | Fast ingestion — titles and descriptions only |
| `llms-full.txt` | `https://azharameen.github.io/group-run/llms-full.txt` | Deep context — full page content |

## How to Use

### Option 1: Fetch `llms.txt` (Recommended for most agents)

```python
import httpx

context = httpx.get("https://azharameen.github.io/group-run/llms.txt").text
# Pass `context` as system prompt or tool result to your agent
```

### Option 2: Fetch `openapi.json` for API-aware agents

```python
schema = httpx.get(
    "https://backend-service-601546984807.asia-south1.run.app/openapi.json"
).json()
# Use schema to auto-discover API routes, request/response schemas
```

### Option 3: Direct page fetch for targeted context

```python
architecture = httpx.get(
    "https://azharameen.github.io/group-run/architecture/"
).text
```

## Key Architectural Facts

- **Supervisor pattern**: All agent calls route through a LangGraph supervisor graph
- **Config files**: `config/teams.yaml` and `config/mcp.json` are hot-reloadable without restart
- **Storage**: SQLite for checkpointing + YAML workspaces for idea/artifact storage
- **Port**: Container binds to `${PORT}` env var (Cloud Run requirement), defaults to `8080`
- **Health route**: `GET /api/health` → `{"status": "ok"}`
