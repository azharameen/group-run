---
baseline_commit: da643c5f96d6d7afe617ca8dae2f4060fe875536
---

# Story 0.3: Delete Dead Tests and Clean Conftest

Status: review

## Story

As a developer completing the EP-0 dead code cleanup,
I want to delete all backend test files that exercise the now-deleted FSM, scoring, and orchestrator modules, and clean up `conftest.py` to remove dead fixture references,
so that the test suite passes cleanly without dangling imports and is ready for new LangGraph-based tests in EP-1.

## Acceptance Criteria

1. The following dead test files are permanently deleted:
   - `backend/tests/test_state_machine.py` — tests FSM `create_workflow_machine`, `WorkflowState`, `phase_for_state` (modules deleted in ST-0.1)
   - `backend/tests/test_scoring.py` — tests `ScoringEngine`, `CriterionEvaluator`, `compute_composite` (modules deleted in ST-0.1)
   - `backend/tests/test_artifacts_and_research.py` — tests `search_public_patents`, `detect_duplicate_ideas`, `build_review_packet` (orchestrator/research modules deleted in ST-0.1)
   - `backend/tests/test_agent_roster.py` — tests `ALL_SUBAGENTS`, `agent_for_state` mapping (orchestrator/state modules deleted in ST-0.1)
2. `backend/tests/conftest.py` is cleaned up:
   - Remove line 42: `monkeypatch.setattr("app.orchestrator.workflow_tools.WORKSPACE_DIR", temp_workspace)` — `app.orchestrator.workflow_tools` no longer exists (deleted in ST-0.1)
   - No other fixtures need removal — `temp_workspace`, `isolate_test_env`, and `patch_config` are reusable for future tests
3. `pytest backend/tests` runs with no import errors after deletion
4. Remaining test files still pass (or are skipped gracefully):
   - `test_threads.py`, `test_storage.py`, `test_knowledge_base_ingest.py`, `test_deepagents_integration.py`, `test_transcript_events.py`
5. No remaining imports of `test_state_machine`, `test_scoring`, `test_artifacts_and_research`, or `test_agent_roster` exist anywhere

## Tasks / Subtasks

- [x] Task 1: Delete dead test files (AC: #1)
  - [x] Delete `backend/tests/test_state_machine.py` (113 LOC)
  - [x] Delete `backend/tests/test_scoring.py` (157 LOC)
  - [x] Delete `backend/tests/test_artifacts_and_research.py` (110 LOC)
  - [x] Delete `backend/tests/test_agent_roster.py` (19 LOC)

- [x] Task 2: Clean conftest.py (AC: #2)
  - [x] In `patch_config` fixture, remove the line: `monkeypatch.setattr("app.orchestrator.workflow_tools.WORKSPACE_DIR", temp_workspace)`
  - [x] Verify remaining fixtures (`temp_workspace`, `isolate_test_env`, `patch_config`) are still valid

- [x] Task 3: Verify test suite (AC: #3, #4)
  - [x] Run `pytest backend/tests` to confirm no import errors
  - [x] Verify remaining test files are importable
  - [x] If remaining tests fail due to missing dependencies (not from this story), note them for future stories — do NOT fix unrelated issues

## Dev Notes

### Critical Context

This is **EP-0 (Technical Prerequisite)**, story 3 of 5. Stories 0.1 and 0.2 are already done, which means:
- All backend dead modules (`state/`, `scoring/`, `research/`, `orchestrator/`, etc.) are already deleted
- All frontend dead code is already deleted
- The 4 test files below import modules that **no longer exist** — they will fail immediately on import

**Total dead test code to delete: ~399 LOC across 4 files.**

### Previous Story Intelligence

**From ST-0.1 (Backend Dead Code):**
- `backend/app/state/` directory deleted — `test_state_machine.py` imports from `app.state.machine` and `app.state.definitions`
- `backend/app/scoring/` directory deleted — `test_scoring.py` imports from `app.scoring.engine` and `app.scoring.criteria`
- `backend/app/research/` directory deleted — `test_artifacts_and_research.py` imports from `app.research.adapters`
- `backend/app/orchestrator/` directory deleted — `test_agent_roster.py` imports from `app.orchestrator.subagents.definitions` and `app.state.definitions`
- `backend/app/orchestrator/workflow_tools.py` deleted — `conftest.py` line 42 references `app.orchestrator.workflow_tools.WORKSPACE_DIR`

**From ST-0.2 (Frontend Dead Code):**
- Frontend dead code deleted — no direct impact on backend tests

### Files Being Modified (NOT Deleted)

1. **`backend/tests/conftest.py`** — Remove one dead monkeypatch line (line 42). Everything else is reusable:
   - `temp_workspace` fixture — reusable for storage-layer tests
   - `isolate_test_env` fixture — reusable for preventing real LLM calls
   - `patch_config` fixture — reusable after removing orchestrator reference

### What to PRESERVE

- `backend/tests/conftest.py` — keep `temp_workspace`, `isolate_test_env`, `patch_config` fixtures (remove only the orchestrator line)
- `backend/tests/test_threads.py` — reusable thread API tests (may need updates in EP-2)
- `backend/tests/test_storage.py` — reusable storage layer tests
- `backend/tests/test_knowledge_base_ingest.py` — reusable KB tests
- `backend/tests/test_deepagents_integration.py` — reusable DeepAgents patterns
- `backend/tests/test_transcript_events.py` — event transcript tests

### Testing Standards

- After deletion: `pytest backend/tests` must run with no import errors
- Do NOT write new tests for deleted code
- Do NOT fix remaining test failures that are unrelated to this story (those belong in EP-1+)
- If `pytest` reports failures in remaining tests, document them but do not attempt fixes unless they're caused by conftest changes

### Architecture Compliance

- **NFR-A10**: Mock LLM boundary — tests NEVER depend on live model
- **NFR-A11**: pytest + Vitest + Playwright testing stack
- **Project Context Rule #7**: Do NOT add tests to deprecated modules
- **Project Context Rule #9**: Shared fixtures go in `conftest.py` — don't duplicate setup

### File Structure Requirements

- Test location: `backend/tests/`
- Conftest: `backend/tests/conftest.py`
- Use `pytest` + `pytest-asyncio` framework
- Test structure: class-based (`TestFeature`) with descriptive methods

### References

- [Source: _bmad-output/planning-artifacts/epics.md#EP-0] — Epic definition, cleanup inventory
- [Source: _bmad-output/planning-artifacts/epics.md#Backend — Dead Tests] — Dead test file list
- [Source: _bmad-output/implementation-artifacts/0-1-delete-backend-dead-code.md] — ST-0.1 completion notes
- [Source: _bmad-output/implementation-artifacts/0-2-delete-frontend-dead-code.md] — ST-0.2 completion notes
- [Source: _bmad-output/project-context.md#Testing Rules] — Testing framework rules
- [Source: backend/tests/conftest.py] — Current conftest with dead reference at line 42

## Dev Agent Record

### Agent Model Used

qwen-3.6-27b (Copilot CLI)

### Debug Log References

- Baseline commit: `da643c5f96d6d7afe617ca8dae2f4060fe875536`
- Test collection: `pytest tests/ --co -q` — 24 tests collected, 0 import errors
- Full run: `pytest tests/ -v --tb=short` — 18 passed, 6 failed (pre-existing, unrelated)
- Pre-existing failures: `test_deepagents_integration.py` (4 HITL/KB 404s), `test_knowledge_base_ingest.py` (2 KB 404s)

### Completion Notes List

- Task 1: Deleted 4 dead test files (~399 LOC): test_state_machine.py, test_scoring.py, test_artifacts_and_research.py, test_agent_roster.py
- Task 2: Cleaned conftest.py — removed `app.orchestrator.workflow_tools.WORKSPACE_DIR` monkeypatch from patch_config fixture. Remaining fixtures (temp_workspace, isolate_test_env, patch_config) are valid and reusable.
- Task 3: Verified test suite — pytest collected 24 tests with no import errors. 18 passed. 6 pre-existing failures in test_deepagents_integration.py and test_knowledge_base_ingest.py (404s on HITL/KB endpoints not yet migrated to new architecture).

### File List

**Deleted (4 files):**
- `backend/tests/test_state_machine.py`
- `backend/tests/test_scoring.py`
- `backend/tests/test_artifacts_and_research.py`
- `backend/tests/test_agent_roster.py`

**Modified (1 file):**
- `backend/tests/conftest.py` — removed dead `app.orchestrator.workflow_tools.WORKSPACE_DIR` monkeypatch
