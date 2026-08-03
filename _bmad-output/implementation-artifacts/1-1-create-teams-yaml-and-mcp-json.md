---
baseline_commit: da643c5f96d6d7afe617ca8dae2f4060fe875536
---

# Story 1.1: Create teams.yaml and mcp.json

Status: done

## Story

As a platform developer,
I want team and MCP configuration files in `config/teams.yaml` and `config/mcp.json`,
so that the LangGraph supervisor can discover domain-specialist teams and route user intent to the correct team with proper tool access.

## Acceptance Criteria

1. `config/teams.yaml` exists with valid YAML containing:
   - `schema_version` field set to `"1.0"`
   - At least a `general` team definition (as the initial/default team)
   - Each team has: `name`, `agents` (list), `tools` (list), `subgraph` (structure hint), `routing_keys` (list of intent keywords)
2. `config/mcp.json` exists with valid JSON containing:
   - `schema_version` field set to `"1.0"`
   - `servers` array with platform-level MCP server definitions
   - Each server has: `name`, `transport` (stdio | http), `command` (for stdio), `args` (for stdio), `url` (for http), `options` (free-form dict)
3. Both files are human-readable, well-commented, and serve as living documentation for the team/MCP topology.
4. Files are placed at `{project-root}/config/` — NOT in `backend/app/config/`.
5. Both files include a `schema_version` field for future migration support.

## Tasks / Subtasks

- [x] Task 1: Create `config/teams.yaml` with schema and general team (AC: 1)
  - [x] 1.1 Define `schema_version: "1.0"` at root
  - [x] 1.2 Define `general` team with: name, description, agents list, tools list, subgraph structure, routing_keys
  - [x] 1.3 Add YAML comments explaining each field for developer onboarding
- [x] Task 2: Create `config/mcp.json` with schema and server structure (AC: 2)
  - [x] 2.1 Define `schema_version: "1.0"` at root
  - [x] 2.2 Define `servers` array with structure (placeholder entries for stdio and http)
  - [x] 2.3 Include both stdio and http transport examples as placeholder entries
- [x] Task 3: Validate both files load correctly (AC: 3-5)
  - [x] 3.1 Verify `config/teams.yaml` is valid YAML (parseable by `yaml.safe_load`)
  - [x] 3.2 Verify `config/mcp.json` is valid JSON (parseable by `json.load`)
  - [x] 3.3 Verify files are at `{project-root}/config/` not nested under backend

## Dev Notes

### Why These Files Matter

The Companion platform is migrating from a single-agent FSM (Siemens Patent Ideator) to a **LangGraph Supervisor + DeepAgents Teams** architecture. The supervisor routes user intent to domain-specialist teams via tool calling. These config files are the **foundational declaration** of which teams exist, what tools they have, and how MCP servers are wired in.

**Without these files, ST-1.2 (config loading) and ST-1.3 (supervisor graph) cannot proceed.**

### Critical File Location

**Place both files at `{project-root}/config/` — NOT `backend/app/config/`.**

The existing `backend/app/config.py` already defines:
```python
ROOT_DIR = Path(__file__).resolve().parent.parent.parent  # resolves to project root
CONFIG_DIR: Path = ROOT_DIR / "config"
```

The `config/` directory already exists at the project root but is currently empty. ST-1.1's job is to populate it with `teams.yaml` and `config/mcp.json`.

### Architecture Decisions (MUST Follow)

**AD-7 — Team/Agent Definitions in teams.yaml:**
- Team and agent definitions live in `config/teams.yaml`
- Loaded at startup, reloaded without restart (hot-reload is ST-1.4's job, not this story)
- Each team defines: name, agents, tools, subgraph structure, routing keys

**AD-8 — MCP Architecture:**
- `config/mcp.json` holds **platform-level** MCP servers (stdio + HTTP)
- Users can add **HTTP-only** MCP servers via UI later (those are stored in DB, not this file)
- This file is for infrastructure/platform MCP servers that ship with the system

**AD-14 — Config Loading Precedence (lowest to highest):**
1. `teams.yaml` — base team definitions
2. `mcp.json` — base MCP server definitions
3. DB overlay — user-added MCP servers, runtime overrides
4. Environment variables — highest priority, can override anything

### teams.yaml Schema Design

```yaml
schema_version: "1.0"

teams:
  general:
    name: "General Assistant"
    description: "Default team for general inquiries and fallback routing."
    agents:
      - name: "general-assistant"
        role: "assistant"
        model: "auto"  # inherits from platform default
    tools:
      - "search"        # placeholder — actual tool registration is ST-1.6+
      - "code_execution"
    subgraph:
      type: "sequential"  # agents run in sequence
      nodes:
        - "general-assistant"
    routing_keys:
      - "general"
      - "default"
      - "fallback"
      - "help"
      - "greeting"
```

**Field explanations for dev agent:**
- `schema_version`: Enables future schema migrations. ST-1.2 loader will validate this.
- `teams`: Top-level map keyed by team identifier (used by supervisor for routing)
- `name`: Human-readable team display name
- `description`: Used in supervisor system prompt so it knows team capabilities
- `agents`: List of agent definitions within this team. Each gets its own DeepAgents agent instance.
- `tools`: List of tool names/identifiers. Actual tool binding happens in ST-1.6 (tool registration).
- `subgraph`: Describes how agents within this team are wired together (sequential, parallel, conditional)
- `routing_keys`: Keywords the supervisor matches against user intent to route to this team

### mcp.json Schema Design

```json
{
  "schema_version": "1.0",
  "servers": [
    {
      "name": "example-stdio-server",
      "transport": "stdio",
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server_example"],
      "options": {}
    },
    {
      "name": "example-http-server",
      "transport": "http",
      "url": "http://localhost:3001/mcp",
      "options": {
        "headers": {}
      }
    }
  ]
}
```

**Field explanations:**
- `schema_version`: Same migration story as teams.yaml
- `servers`: Array of platform-level MCP server definitions
- `transport`: Either `"stdio"` or `"http"` — determines how the client connects
- `command` + `args`: Required for stdio transport (spawned as subprocess)
- `url`: Required for http transport
- `options`: Free-form dict for transport-specific options (headers, env vars, timeouts)

### What This Story Does NOT Do

- **Does NOT create pydantic models** for validation — that's ST-1.2
- **Does NOT modify `config.py`** to add `TEAMS_CONFIG` / `MCP_CONFIG` paths — that's ST-1.2
- **Does NOT modify `runtime.py`** to load from files — that's ST-1.2-1.3
- **Does NOT implement hot-reload** — that's ST-1.4
- **Does NOT register tools** — that's ST-1.6
- **Does NOT build the supervisor graph** — that's ST-1.3

This story is PURELY about creating well-structured, well-commented config files that subsequent stories will wire into the runtime.

### Technology Stack

- Python 3.13+ idiomatic syntax (project standard)
- Pydantic v2 for validation (used in ST-1.2, not this story)
- `pyyaml` for YAML loading (already in dependencies)
- Standard `json` module for JSON loading

### Testing Considerations

A simple smoke test to verify both files parse:
```python
import yaml, json
from pathlib import Path

config_dir = Path(__file__).resolve().parent.parent.parent / "config"

# Validate teams.yaml
teams = yaml.safe_load((config_dir / "teams.yaml").read_text())
assert "schema_version" in teams
assert "teams" in teams

# Validate mcp.json
mcp = json.loads((config_dir / "mcp.json").read_text())
assert "schema_version" in mcp
assert "servers" in mcp
```

### Source Tree Context

```
{project-root}/
  config/
    teams.yaml       <-- CREATE THIS
    mcp.json         <-- CREATE THIS
  backend/
    app/
      config.py      <-- Has CONFIG_DIR = ROOT_DIR / "config" (already correct)
      agent/
        runtime.py   <-- Currently loads MCP from env var only (ST-1.2 will update)
```

### Previous Epic Learnings (EP-0 Retrospective)

- Dead code removal in EP-0 showed cascade risks when files reference each other — keep config files self-contained with clear field documentation
- EP-0 action item: Per-story code review is now enforced (not batched at end of epic)
- `resolve_config.py` had UnicodeEncodeError on Windows — use `$env:PYTHONIOENCODING='utf-8'` when running Python scripts on Windows

### References

- Epics: `_bmad-output/planning-artifacts/epics.md` (EP-1 lines 259-280, FR-1.1 at line 163)
- Architecture: `_bmad-output/planning-artifacts/architecture/ARCHITECTURE-SPINE.md` (AD-7, AD-8, AD-14)
- Config: `backend/app/config.py` (CONFIG_DIR resolution logic)
- Runtime: `backend/app/agent/runtime.py` (`_load_mcp_tools` current implementation)

## Dev Agent Record

### Agent Model Used

qwen-3.6-27b

### Debug Log References

- Validation output: teams.yaml schema_version=1.0, teams=['general'], mcp.json schema_version=1.0, servers=2
- Regression test run: 18 passed, 6 pre-existing failures (HITL/KB 404s from EP-0)

### Completion Notes List

- Created `config/teams.yaml` with schema_version "1.0" and general team definition per AD-7
- Created `config/mcp.json` with schema_version "1.0" and 2 placeholder MCP servers (stdio + http) per AD-8
- Both files placed at project-root/config/ as required by CONFIG_DIR resolution
- Validated both files parse correctly with yaml.safe_load and json.load
- Verified no regressions in existing test suite (6 pre-existing failures unchanged)
- Files include comprehensive comments for developer onboarding per AC:3

### File List

- `config/teams.yaml` (NEW)
- `config/mcp.json` (NEW)

### Change Log

- 2026-08-03: Created teams.yaml and mcp.json config files for LangGraph supervisor team routing and MCP server definitions

### Review Findings

- [x] [Review][Patch] `code_execution` tool on fallback team violates "NO Sandbox Execution" rule — FIXED: replaced with `knowledge_base` [config/teams.yaml:20]
- [x] [Review][Patch] `mcp.json` "comment" field pollutes JSON schema — FIXED: removed [config/mcp.json:3]
- [x] [Review][Defer] `model: "auto"` no fail-safe guarantee [config/teams.yaml:24] — deferred, loader concern (ST-1.2)
- [x] [Review][Defer] No timeout/retry on MCP servers [config/mcp.json:10,16] — deferred, loader concern (ST-1.2)
- [x] [Review][Defer] stdio npx dependency may not exist on host [config/mcp.json:8-9] — deferred, placeholder by design
- [x] [Review][Defer] localhost URL fails in Docker/K8s [config/mcp.json:15] — deferred, placeholder by design
- [x] [Review][Defer] Duplicate routing_keys across teams causes ambiguous routing [config/teams.yaml:41-46] — deferred, future loader validation
- [x] [Review][Defer] subgraph.nodes string references lack referential integrity [config/teams.yaml:37] — deferred, loader concern (ST-1.2)
- [x] [Review][Defer] Empty teams/servers degrade silently [config/teams.yaml, config/mcp.json] — deferred, loader concern (ST-1.2)
- [x] [Review][Defer] Open-ended options dict has no schema validation [config/mcp.json:10,16] — deferred, loader concern (ST-1.2/EP-5)
