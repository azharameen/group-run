---
baseline_commit: da643c5f96d6d7afe617ca8dae2f4060fe875536
---

# Story 1.2: Update config.py

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As the backend initialization layer,
I want `config.py` to expose team/MCP config paths, validate LANGGRAPH_STRICT_MSGPACK, and provide schema version constants,
so that downstream stories (ST-1.3 app.py, ST-1.4 supervisor, ST-5.x MCP/teams) have deterministic config references without duplicating path logic.

## Acceptance Criteria

1. **TEAMS_CONFIG_PATH added as module-level constant** — resolves to `ROOT_DIR / "config" / "teams.yaml"` and is importable as `from app.config import TEAMS_CONFIG_PATH`
2. **MCP_CONFIG_PATH added as module-level constant** — resolves to `ROOT_DIR / "config" / "mcp.json"` and is importable as `from app.config import MCP_CONFIG_PATH`
3. **LANGGRAPH_STRICT_MSGPACK validation fails fast** — `Settings` class validates `LANGGRAPH_STRICT_MSGPACK` env var is set to `"true"` (case-insensitive); if missing or false, app raises a clear error at import time with message indicating the required env var
4. **Schema version constants added** — `TEAMS_SCHEMA_VERSION = "1.0"` and `MCP_SCHEMA_VERSION = "1.0"` as module-level string constants matching the version fields in teams.yaml and mcp.json created by ST-1.1
5. **Existing exports preserved** — `Settings`, `settings`, `ROOT_DIR`, `CONFIG_DIR`, `WORKSPACE_DIR`, `INSTRUCTIONS_DIR`, `KNOWLEDGE_BASE_DIR`, `STORAGE_DIR` all remain importable and unchanged
6. **config.py imports cleanly** — `python -c "from app.config import TEAMS_CONFIG_PATH, MCP_CONFIG_PATH, settings"` succeeds with no errors when `LANGGRAPH_STRICT_MSGPACK=true` is set
7. **Validation error is clear** — When `LANGGRAPH_STRICT_MSGPACK` is not set, the error message explicitly names the missing env var and what value it expects

## Tasks / Subtasks

- [x] Task 1: Add LANGGRAPH_STRICT_MSGPACK field and validation to Settings class (AC: 3, 7)
  - [x] 1.1 Add `langgraph_strict_msgpack: str = ""` field to Settings
  - [x] 1.2 Add `@model_validator` that checks value equals `"true"` (case-insensitive)
  - [x] 1.3 Error message: "LANGGRAPH_STRICT_MSGPACK must be set to 'true' — required for LangGraph checkpoint serialization safety"
- [x] Task 2: Add config file path constants (AC: 1, 2, 5)
  - [x] 2.1 Add `TEAMS_CONFIG_PATH = os.path.join(CONFIG_DIR, "teams.yaml")` after existing path constants
  - [x] 2.2 Add `MCP_CONFIG_PATH = os.path.join(CONFIG_DIR, "mcp.json")` after existing path constants
- [x] Task 3: Add schema version constants (AC: 4)
  - [x] 3.1 Add `TEAMS_SCHEMA_VERSION = "1.0"` and `MCP_SCHEMA_VERSION = "1.0"` as module-level constants
- [x] Task 4: Validate all changes (AC: 5, 6)
  - [x] 4.1 Verify all existing exports still import correctly
  - [x] 4.2 Test import succeeds with LANGGRAPH_STRICT_MSGPACK=true
  - [x] 4.3 Test import fails with clear error when var is missing
  - [x] 4.4 Verify TEAMS_CONFIG_PATH and MCP_CONFIG_PATH resolve correctly
  - [x] 4.5 Verify TEAMS_SCHEMA_VERSION and MCP_SCHEMA_VERSION equal "1.0"

### Review Findings

- [x] [Review][Defer] Import-time config crash on missing LANGGRAPH_STRICT_MSGPACK [backend/app/config.py:37-44] — AD-11 design decision, fail-fast is intentional

## Dev Notes

### What Must NOT Change
- **Settings class fields**: Do not remove or rename existing fields (`openai_api_key`, `deepagents_model`, etc.)
- **model_config block**: The `SettingsConfigDict` with `env_file` path resolution is critical for .env loading — preserve exactly
- **derive_defaults validator**: The existing `@model_validator` that sets `deepagents_model` from `openai_model_name` must be preserved
- **OS env propagation**: Lines 50-55 that propagate settings to `os.environ` are required by LangChain — preserve exactly
- **Path resolution logic**: ROOT_DIR through STORAGE_DIR (lines 57-79) must remain unchanged — Docker depends on APP_ROOT_DIR override
- **No new dependencies**: config.py should only use `os`, `pydantic`, `pydantic_settings` — no new imports

### File Location
- **Single file to modify:** `backend/app/config.py` (80 lines currently)
- **Add new constants after line 79** (after STORAGE_DIR definition)
- **Add validation before or alongside existing `derive_defaults` validator** (line 35-39)

### Consumer Map (what imports from config.py)
These files MUST continue to import successfully after changes:
- `backend/app/agent/runtime.py` — imports `INSTRUCTIONS_DIR, settings`
- `backend/app/agent/domain_tools.py` — imports `KNOWLEDGE_BASE_DIR, WORKSPACE_DIR`
- `backend/app/agent/backends.py` — imports `INSTRUCTIONS_DIR, KNOWLEDGE_BASE_DIR, ROOT_DIR, WORKSPACE_DIR`
- `backend/app/llm/client.py` — imports `settings`
- `backend/app/infrastructure/observability.py` — imports `settings`
- `backend/app/storage/yaml_io.py` — imports `KNOWLEDGE_BASE_DIR, WORKSPACE_DIR`
- `backend/app/storage/registry.py` — imports `WORKSPACE_DIR`
- `backend/app/storage/recovery.py` — imports `WORKSPACE_DIR`
- `backend/app/storage/knowledge_base.py` — imports `KNOWLEDGE_BASE_DIR`
- `backend/app/storage/idea_workspace.py` — imports `WORKSPACE_DIR`
- `backend/app/services/thread_manager.py` — imports `STORAGE_DIR`
- `backend/tests/test_deepagents_integration.py` — imports `settings`

### Validation Approach
- **Run with env var set:** `set LANGGRAPH_STRICT_MSGPACK=true && python -c "from app.config import settings, TEAMS_CONFIG_PATH, MCP_CONFIG_PATH"` (Windows)
- **Run without env var:** Remove the env var and verify a clear ValueError is raised with actionable message
- **Verify paths resolve:** Print TEAMS_CONFIG_PATH and MCP_CONFIG_PATH to confirm they point to existing files

### Architecture Compliance
- **AD-11 (STRICT_MSGPACK):** `LANGGRAPH_STRICT_MSGPACK=true` is mandatory in all environments — single enforced policy, no alternatives. Startup fails fast if missing. This is the mechanical enforcement of AD-11.
- **AD-14 (Config Precedence):** Teams.yaml → mcp.json → DB overlay → env vars (highest). These path constants enable the config loading chain but don't implement the loading themselves (that's ST-5.x).
- **AD-7 (teams.yaml):** Config file exists at `config/teams.yaml` — TEAMS_CONFIG_PATH must point here.
- **AD-8 (mcp.json):** Config file exists at `config/mcp.json` — MCP_CONFIG_PATH must point here.
- **NFR-A5 (Startup Validation):** Maps directly to AC-3 — validation at Settings instantiation time, not deferred.

### Previous Story Intelligence (ST-1.1)
- **teams.yaml created** at `config/teams.yaml` with `schema_version: "1.0"` — schema constant matches
- **mcp.json created** at `config/mcp.json` with `"$schema_version": "1.0"` — schema constant matches
- **Security fixes applied:** `code_execution` tool replaced with `knowledge_base` in teams.yaml, `"comment"` field removed from mcp.json
- **CONFIG_DIR already correct:** `ROOT_DIR / "config"` resolves correctly to project root's config/ directory

### Git Intelligence
- EP-0 cleanup removed FSM-related settings (workflow_interval_minutes, max_retries_per_state, etc.)
- ST-1.1 created the config files that these paths now reference
- No dangling imports to dead modules remain in config.py

### Testing Standards Summary
- Use Python's built-in assertion or a simple test script — no pytest needed for this story
- Test both success path (env var set) and failure path (env var missing)
- Verify constant values are strings that resolve to valid file paths
- Verify schema versions are strings matching the "1.0" in config files

### References

- [Source: docs/architecture.md#AD-11] — STRICT_MSGPACK mandatory rule with fail-fast requirement
- [Source: docs/architecture.md#AD-14] — Config loading precedence chain
- [Source: _bmad-output/planning-artifacts/epics.md#FR-1.2] — Original requirement: "remove FSM settings, add team/MCP paths, strict msgpack"
- [Source: _bmad-output/planning-artifacts/epics.md#NFR-A5] — Startup validation non-functional requirement
- [Source: _bmad-output/implementation-artifacts/1-1-create-teams-yaml-and-mcp-json.md] — ST-1.1 created teams.yaml and mcp.json
- [Source: backend/app/config.py] — Current file state (80 lines, single file to modify)
- [Source: _bmad-output/specs/spec-companion/SPEC.md] — SPEC constraint: LANGGRAPH_STRICT_MSGPACK=true mandatory
- [Source: _bmad-output/planning-artifacts/architecture/architecture-Companion-2026-08-02/ARCHITECTURE-SPINE.md#AD-11] — Tightened AD: single enforced policy, no alternatives

## Dev Agent Record

### Agent Model Used

qwen-3.6-27b

### Debug Log References

- Validation test 1 (success): `LANGGRAPH_STRICT_MSGPACK=true` import succeeded with all exports
- Validation test 2 (failure): Missing env var raised pydantic ValidationError with clear message
- Consumer import test: Verified backends.py, idea_workspace.py, thread_manager.py imports still work

### Completion Notes List

- Added `langgraph_strict_msgpack` field to Settings with fail-fast validator (AD-11 enforcement)
- Added TEAMS_CONFIG_PATH and MCP_CONFIG_PATH constants following existing path constant pattern
- Added TEAMS_SCHEMA_VERSION and MCP_SCHEMA_VERSION constants matching ST-1.1 config files
- All existing exports preserved — no breaking changes to 12 consumer files
- Validation confirmed: import succeeds with env var, fails clearly without it

### File List

- `backend/app/config.py` — Added strict msgpack validation, config file paths, schema versions
