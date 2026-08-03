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
