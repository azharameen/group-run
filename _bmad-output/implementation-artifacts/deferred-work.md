# Deferred Work Ledger

## Deferred from: code review of EP-0 dead code cleanup (2026-08-03)

- Backend Siemens strings in agent prompts and model fields (`backend/app/agent/runtime.py`, `domain_tools.py`, `context.py`, `models/idea.py`) — structural domain data changes require product decisions for replacement names and data migration
- LANGGRAPH_STRICT_MSGPACK validator breaks tests on fresh environments (`backend/app/config.py:38-43`) — runs at module import time before pytest fixtures can monkeypatch; add `.env.example` or autouse conftest fixture in ST-1.2

## Deferred from: code review of 1-1-create-teams-yaml-and-mcp-json (2026-08-03)

- `model: "auto"` no fail-safe guarantee — loader must resolve "auto" eagerly and fail fast if no platform default is available
- No timeout/retry on MCP servers — loader must enforce timeout fields for HTTP transports or provide safe defaults
- stdio npx dependency may not exist on host — placeholder example, replace with real server config when MCP is onboarded
- localhost URL fails in Docker/K8s — placeholder example, use service names or env var substitution in production
- Duplicate routing_keys across teams causes ambiguous routing — loader must validate global uniqueness when multiple teams exist
- subgraph.nodes string references lack referential integrity — loader must validate every node exists in the agents list
- Empty teams/servers degrade silently — loader must treat empty collections as a configuration error (fail fast)
- Open-ended options dict has no schema validation — loader must define and validate expected option keys per transport type

## Deferred from: code review of 1-2-update-config-py and 1-3-rewrite-api-app-py (2026-08-03)

- Import-time config crash on missing LANGGRAPH_STRICT_MSGPACK (`backend/app/config.py:37-44`) — AD-11 fail-fast design decision; already tracked in EP-0 deferred entry, confirmed intentional for EP-1
- SQLite connection never closed in lifespan teardown (`backend/app/services/thread_manager.py`) — `get_checkpointer()` creates a persistent sqlite3.Connection that is never closed; file handles and locks persist across reloads, especially problematic on Windows
- Shared SQLite connection concurrency risk (`backend/app/services/thread_manager.py:41`) — `check_same_thread=False` with a single global connection is not safely concurrent under load; EP-7 story 7-4 (sqlite-concurrency-tests) planned to address
