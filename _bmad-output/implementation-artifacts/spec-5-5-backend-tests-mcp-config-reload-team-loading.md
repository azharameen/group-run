---
title: 'Story 5.5: Backend Tests - MCP Config Reload & Team Loading Edge Cases'
type: 'chore'
created: '2026-08-09'
status: 'done'
baseline_revision: '3e653e65a25f1b572fdea37eee47afa1f28c6e88'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-5-context.md'
warnings: []
---

<intent-contract>

## Intent

**Problem:** Epic 5 has 56 existing tests covering happy paths and basic error handling, but critical edge cases are untested: timeout validation boundaries, concurrent config reload race conditions, empty/invalid team configurations, and end-to-end integration between MCP server add → config reload → runtime tool verification. These gaps mean regressions in config reload semantics, tool loading precedence, and team subgraph construction can go undetected.

**Approach:** Add targeted tests covering the highest-risk gaps: timeout edge cases, malformed server entries, empty agents lists, duplicate node detection, missing model configuration, and the full pipeline integration (add MCP server → reload → verify in runtime). All tests use mocks to avoid live model calls.

## Boundaries & Constraints

**Always:**
- Use pytest with in-memory mocking — no live HTTP, model, or database calls
- Follow existing test patterns: three-location monkeypatch for `MCP_CONFIG_PATH`, in-place `_teams_config` patching
- Tests that require real async execution use `asyncio.run()` (Python 3.13 compatible)
- Each test is self-contained with module clearing for fresh imports
- New tests go into existing test files where they logically fit, or a new file for integration tests

**Block If:**
- Existing test infrastructure (conftest, fixtures) prevents mock-based testing of a gap
- `deepagents` package API changes break monkeypatching assumptions

**Never:**
- Modify existing test files' passing tests
- Add integration tests that require running servers or real HTTP connections
- Change application code to fix test failures — tests must match existing behavior

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Zero timeout server | MCP server with `timeout: 0` | Server added with 0-second timeout | No crash |
| Negative timeout server | MCP server with `timeout: -1` | Server added or rejected per existing behavior | No crash |
| Empty agents list | Team with `agents: []` | ValueError from factory | Fail fast |
| Duplicate node names | `subgraph.nodes: [agent-a, agent-a]` | ValueError with duplicate details | Fail fast |
| Missing deepagents_model | Agent model="auto", settings empty | RuntimeError from node creation | Fail fast |
| Full pipeline | POST server → reload-mcp → verify | Added server appears in runtime tools | Integration flow |
| Concurrent reloads | Two simultaneous reload calls | Both succeed or one fails gracefully | No data corruption |

</intent-contract>

## Code Map

- `backend/tests/test_mcp_api.py` -- **EXTEND**: MCP management API edge cases (11 existing tests)
- `backend/tests/test_mcp_tool_loading.py` -- **EXTEND**: MCP config loading edge cases (23 existing tests)
- `backend/tests/test_config_reload.py` -- **EXTEND**: Teams config reload edge cases (8 existing tests)
- `backend/tests/test_team_factory.py` -- **EXTEND**: Team factory edge cases (8 existing tests)
- `backend/tests/test_mcp_integration.py` -- **NEW**: Integration tests for full MCP pipeline
- `backend/app/api/routes/mcp.py` -- **REFERENCE**: MCP service implementation
- `backend/app/agent/runtime.py` -- **REFERENCE**: MCP tool loading, teams config
- `backend/app/orchestrator/team_factory.py` -- **REFERENCE**: Team subgraph factory

## Tasks & Acceptance

### Execution:

1. [x] `backend/tests/test_mcp_api.py` -- Add 5 edge case tests (11 existing, now 16 total):
   - Timeout validation: 0 and negative values (2 tests)
   - Empty server name or URL validation (2 tests)
   - Duplicate name with case-insensitive comparison (1 test)

2. [x] `backend/tests/test_mcp_tool_loading.py` -- Add 4 edge case tests (23 existing, now 27 total):
   - Malformed server entry missing `url` or `transport` (2 tests)
   - Extremely large config file (1200 server entries) (1 test)
   - Schema version warning behavior (1 test)

3. [x] `backend/tests/test_config_reload.py` -- Add 2 edge case tests (8 existing, now 10 total):
   - Empty teams dict validation (1 test)
   - Agent subgraph.nodes referencing non-existent agents (1 test)

4. [x] `backend/tests/test_team_factory.py` -- Add 3 edge case tests (8 existing, now 11 total):
   - Empty agents list raises ValueError (1 test)
   - Duplicate node names in subgraph.nodes raises ValueError (1 test)
   - Agent model="auto" with missing `deepagents_model` raises RuntimeError (1 test)

5. [x] `backend/tests/test_mcp_integration.py` -- Create new file with 4 integration tests:
   - Full pipeline: POST add server → GET list → reload-mcp → verify server count
   - Add server → remove server → reload-mcp → verify removal
   - Invalid server addition rejected → list unchanged
   - Config reload with invalid teams.yaml preserves existing config

**Acceptance Criteria:**
- Given MCP server with timeout=0, when added via API, then server is accepted or rejected consistently without crashing
- Given team with empty agents list, when factory creates subgraph, then ValueError is raised
- Given subgraph.nodes contains duplicates, when factory validates, then ValueError is raised
- Given agent model="auto" with no deepagents_model configured, when node function is called, then RuntimeError is raised
- Given a new HTTP MCP server is added, when config is reloaded, then server appears in runtime tool count
- All new tests pass with mocked boundaries (no live calls)
- Full regression suite passes with zero regressions

## Spec Change Log

## Review Triage Log

### 2026-08-09 — Review pass
- intent_gap: 0
- bad_spec: 0
- patch: 4: (medium 2, low 2)
- defer: 1: (low 1)
- reject: 0
- addressed_findings:
  - `[medium] [patch]` test_schema_version_mismatch_warns_not_errors can hang when langchain_mcp_adapters is installed — added `monkeypatch.setattr(runtime, "_create_mcp_tools", lambda c: [])` to prevent real network calls
  - `[medium] [patch]` test_config_reload.py fixture teardown stores `_teams_config` by reference instead of copy — changed to `.copy()` + in-place `clear()`/`update()` restore pattern matching `integration_client` fixture
  - `[low] [patch]` unused `sys` import in test_mcp_tool_loading.py — removed
  - `[low] [patch]` dead code `_reset_mcp_config` in test_mcp_integration.py — removed

## Design Notes

**Test Organization:** New tests are appended to existing test files to maintain test locality with the behavior they validate. Only integration tests get a new file (`test_mcp_integration.py`) because they span multiple modules.

**Three-Location Monkeypatch:** Tests that touch MCP config must patch `app.config.MCP_CONFIG_PATH`, `app.agent.runtime.MCP_CONFIG_PATH`, and `runtime._config` module reference. See existing patterns in `test_mcp_tool_loading.py` and `test_config_reload.py`.

**Module Clearing Pattern:** Tests must clear relevant modules from `sys.modules` before importing to get fresh state. See `test_team_factory.py` `_clear_modules()` pattern.

## Verification

**Commands:**
- `pytest backend/tests/ -v -k "mcp or config_reload or team_factory"` -- expected: all tests pass (56 existing + 18 new = 74 total)
- `pytest backend/tests/ -v -k "not slow"` -- expected: zero regressions (210 passed, 8 skipped)
