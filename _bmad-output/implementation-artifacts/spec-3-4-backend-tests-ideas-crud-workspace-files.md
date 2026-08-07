---
title: 'Story 3.4: Backend tests for ideas CRUD and workspace files'
type: 'chore'
created: '2026-08-07'
status: 'done'
review_loop_iteration: 0
followup_review_recommended: false
context: []
warnings: []
baseline_revision: '84e26febb403ffc732bcc7e2c8e643a826b9cde5'
final_revision: '77a1006'
---

<intent-contract>

## Intent

**Problem:** The ideas CRUD API routes (`/api/ideas`, `/api/ideas/{idea_id}`, `/api/ideas/{idea_id}/files`, `/api/ideas/{idea_id}/update`, `/api/ideas/{idea_id}/comment`, `/api/ideas/{idea_id}/archive`, `DELETE /api/ideas/{idea_id}`) have no dedicated test coverage. Existing integration tests in `test_deepagents_integration.py` exercise HITL workflows but not pure CRUD operations.

**Approach:** Create `test_ideas_crud.py` with FastAPI TestClient tests covering all ideas CRUD endpoints, workspace file listing, input validation, and error handling. Create `test_workspace_files.py` with unit tests for `get_all_idea_files` in `idea_workspace.py`.

## Boundaries & Constraints

**Always:**
- Use `patch_config` fixture for temp workspace isolation.
- Use FastAPI `TestClient` for route-level tests.
- Follow existing test patterns: class-based organization, descriptive docstrings.
- Each test is isolated — create its own idea data.

**Block If:**
- A route depends on a module that cannot be imported without side effects.

**Never:**
- Modify `ideas.py` or `idea_workspace.py` — this is a test-only story.
- Test HITL/workflow endpoints — those are Epic 4 territory.
- Modify existing test files.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| List empty ideas | No ideas in registry | `{"ideas": [], "count": 0}` | 200 |
| List ideas with data | 2+ ideas created | `{"ideas": [...], "count": N}` | 200 |
| Get valid idea | Existing idea_id | `{"idea": {...}, "comments": [...]}` | 200 |
| Get non-existent idea | IDEA-9999 | 404 | `{"detail": "..."}` |
| Get invalid idea_id | "invalid" | 400 | `{"detail": "..."}` |
| Create idea | Valid payload | `{"idea_id": "IDEA-XXXX", "message": "..."}` | 200 |
| Create idea auto title | No title | Title defaults to "Untitled" | 200 |
| Update valid field | title or signal_text | `{"updated": true}` | 200 |
| Update invalid field | "nonexistent" | 400 | `{"detail": "..."}` |
| Delete idea | Existing idea_id | `{"deleted": true}` | 200 |
| Delete non-existent idea | IDEA-9999 | 404 | `{"detail": "..."}` |
| Archive idea | Existing idea_id | `{"archived": true, "archive_path": "..."}` | 200 |
| Get workspace files | Idea with files | `{"files": [...], "count": N}` | 200 |
| Get workspace files empty | Idea with no extra files | `{"files": [...], "count": N}` (idea.yaml exists) | 200 |
| Add comment | Valid text | `{"comment": {...}}` | 200 |
| Add empty comment | Empty text | 422 validation error | Pydantic |
| idea_id format validation | lowercase/invalid chars | 400 | `{"detail": "..."}` |

</intent-contract>

## Code Map

- `backend/app/api/routes/ideas.py` — Ideas CRUD routes (target for testing)
- `backend/app/storage/idea_workspace.py` — Workspace filesystem functions (target for testing)
- `backend/app/storage/registry.py` — Registry load/save functions
- `backend/app/storage/yaml_io.py` — Compatibility shim for storage imports
- `backend/app/api/app.py` — FastAPI app factory (`create_app()`)
- `backend/tests/conftest.py` — Shared fixtures (`patch_config`, `temp_workspace`)
- `backend/tests/test_storage.py` — Existing storage test patterns to follow
- `backend/tests/test_deepagents_integration.py` — Existing integration test patterns to follow

## Tasks & Acceptance

**Execution:**
- [x] `backend/tests/test_ideas_crud.py` -- Create test file with FastAPI TestClient tests for all ideas CRUD endpoints -- covers GET /api/ideas, GET /api/ideas/{idea_id}, POST /api/ideas, POST /api/ideas/{idea_id}/update, DELETE /api/ideas/{idea_id}, POST /api/ideas/{idea_id}/archive, POST /api/ideas/{idea_id}/comment
- [x] `backend/tests/test_ideas_crud.py` -- Add idea_id validation tests -- covers format regex, non-existent IDs, 400/404 responses
- [x] `backend/tests/test_workspace_files.py` -- Create test file for `get_all_idea_files` unit tests -- covers empty folder, folder with files, binary files, nested directories
- [x] Run `pytest backend/tests/test_ideas_crud.py backend/tests/test_workspace_files.py -v` -- verify all tests pass (26 passed)

**Acceptance Criteria:**
- Given `test_ideas_crud.py` exists, when running the tests, then all CRUD endpoint tests pass
- Given `test_workspace_files.py` exists, when running the tests, then all workspace file tests pass
- Given ideas CRUD is tested, when running `pytest backend/tests/test_storage.py`, then existing storage tests still pass (no regression)
- Given idea_id validation is tested, when submitting invalid idea_id, then 400 response is returned
- Given workspace file listing is tested, when idea folder has files, then file listing returns correct structure

## Spec Change Log

## Review Triage Log

### 2026-08-07 — Review pass
- intent_gap: 0
- bad_spec: 0
- patch: 1
  - 1: (low 1) Removed duplicate workspace file tests from test_ideas_crud.py and cleaned up unused imports
- defer: 5
  - 5: (low 5) — status-code-only assertions, binary test weak assertion, missing idea_id validation on POST/DELETE paths, no registry consistency checks, weak empty folder assertion
- reject: 4
  - 4: (low 4) — misnamed "empty folder" test (idea.yaml exists by design), auto_untitled assumption (endpoint contract is stable), client fixture isolation (patch_config handles it), cross-test leakage (pytest tmp_path isolates)
- addressed_findings:
  - `[low]` `[patch]` Removed 4 duplicate workspace file tests from test_ideas_crud.py; cleaned unused `get_all_idea_files` and `Path` imports

## Auto Run Result

**Summary:** Created 2 new test files covering ideas CRUD endpoints and workspace file listing.

**Files Changed:**
- `backend/tests/test_ideas_crud.py` — 18 tests for all ideas CRUD endpoints (list, get, create, update, delete, archive, comment, idea_id validation)
- `backend/tests/test_workspace_files.py` — 4 tests for `get_all_idea_files` (empty folder, with files, binary files, nested directories)

**Review Findings:**
- Patches applied: 1 (removed duplicate workspace file tests from test_ideas_crud.py)
- Items deferred: 5 (status-code-only assertions, missing ID validation on POST/DELETE, no registry consistency checks, weak binary assertion, weak list assertion)
- Items rejected: 4

**Follow-up Review:** Not recommended — test additions are localized additions with no production code changes.

**Verification:**
- `pytest tests/test_ideas_crud.py tests/test_workspace_files.py tests/test_storage.py tests/test_transcript_events.py` — 31 passed, 9 warnings

**Residual Risks:**
- Status-code-only assertions miss payload regressions (tracked in deferred work)
- No registry/YAML consistency verification after CRUD operations (tracked in deferred work)

## Verification

**Commands:**
- `pytest backend/tests/test_ideas_crud.py -v` -- expected: all CRUD tests pass
- `pytest backend/tests/test_workspace_files.py -v` -- expected: all workspace file tests pass
- `pytest backend/tests/test_storage.py -v` -- expected: no regressions in existing tests
