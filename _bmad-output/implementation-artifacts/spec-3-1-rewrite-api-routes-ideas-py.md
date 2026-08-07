---
title: 'Rewrite api/routes/ideas.py — pure CRUD without FSM dependencies'
type: 'refactor'
created: '2026-08-07'
status: 'done'
review_loop_iteration: 1
baseline_revision: '7788f24305df432153be9b8f4bd03107fe72a10c'
followup_review_recommended: false
context: []
warnings: []
---

<intent-contract>

## Intent

**Problem:** `api/routes/ideas.py` mixes pure CRUD operations with FSM-dependent concepts (phase/state/score filtering, pause/resume, interrupts, artifact revisions). This couples ideas management to the legacy Siemens FSM and Epic 4 HITL workflow, preventing clean separation of concerns and making the ideas API unusable without the FSM infrastructure.

**Approach:** Strip out all FSM-dependent endpoints and fields, leaving only pure CRUD operations (list, get, create, update, delete, archive), workspace file listing, and comments. Replace raw `dict` payloads with Pydantic request/response models following the established route pattern from `chat.py`.

## Boundaries & Constraints

**Always:**
- Use `APIRouter(prefix="/api", tags=["ideas"])` pattern consistent with `chat.py`
- Define Pydantic `RequestModel`/`ResponseModel` for all endpoints
- Return `snake_case` field names (no camelCase conversion)
- Keep route file under 150 lines
- Idea existence check returns 404 HTTPException before any mutation
- All file access goes through `storage/idea_workspace.py` and `storage/registry.py`
- Validate `idea_id` against `^[A-Z0-9-]+$` before any filesystem operation to prevent path traversal
- `update_idea` must restrict writable fields to an allowlist: `{"title", "signal_text"}`; reject structural fields (`idea_id`, `created_at`, `updated_at`)
- Guard against non-dict YAML returns in `list_ideas` with `isinstance(idea, dict)` check
- `archive_idea` must verify `archive_path` is non-None before removing from registry; raise 500 on archive failure

**Block If:**
- `storage/idea_workspace.py` functions are missing or broken (depends on ST-3.3 validation)
- Frontend `ideas.ts` client has no compatible endpoints after our changes

**Never:**
- Import from `models/idea.py` `WorkflowState`, `PHASE_GROUPS`, scoring classes
- Import from `state/`, `scoring/`, `orchestrator/` modules
- Touch `storage/artifacts.py` (out of scope — owned by ST-3.2/ST-3.3)
- Modify `frontend/src/api/ideas.ts` (owned by ST-3.5/ST-3.6)
- Introduce new dependencies

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| List ideas (no filters) | Empty registry | `{"ideas": [], "count": 0}` | No error |
| List ideas (with results) | Registry has 3 ideas | Returns all 3 with idea_id, title, created_at, updated_at | No error |
| Get idea (exists) | Valid idea_id | Returns idea data + comments + files metadata | No error |
| Get idea (not found) | Nonexistent idea_id | 404 with "Idea {idea_id} not found" | HTTPException 404 |
| Create idea (with title) | `{title: "X", signal_text: "Y"}` | Returns idea_id and message | No error |
| Create idea (no signal_text) | `{title: "X"}` | Uses "Autonomous discovery" default | No error |
| Update idea (exists) | Valid idea_id, field, value | Updates field, returns success | No error |
| Update idea (not found) | Nonexistent idea_id | 404 with "Idea not found" | HTTPException 404 |
| Delete idea (exists) | Valid idea_id | Removes folder + registry entry | No error |
| Delete idea (not found) | Nonexistent idea_id | 404 with "Idea not found" | HTTPException 404 |
| Archive idea (exists) | Valid idea_id | Copies to archive, removes from registry | No error |
| Archive idea (not found) | Nonexistent idea_id | 404 | HTTPException 404 |
| Get files (no files) | Empty idea folder | `{"idea_id": X, "files": [], "count": 0}` | No error |
| Add comment (empty text) | `{text: ""}` | 400 with "Comment text is required" | HTTPException 400 |
| Add comment (valid) | `{author: "User", text: "hello"}` | Returns comment with timestamp | No error |

</intent-contract>

## Code Map

- `backend/app/api/routes/ideas.py` -- Target file to rewrite (328 lines → pure CRUD)
- `backend/app/storage/idea_workspace.py` -- Workspace filesystem helpers (create, delete, archive, load/save YAML, comments, files)
- `backend/app/storage/registry.py` -- Idea registry persistence (load, save, remove)
- `backend/app/storage/yaml_io.py` -- Compat shim that re-exports from idea_workspace and registry
- `backend/app/storage/base.py` -- Base YAML/markdown I/O (read_yaml, write_yaml)
- `backend/app/storage/artifacts.py` -- Artifact revisions (REMOVED from ideas route)
- `backend/app/models/idea.py` -- Legacy Pydantic models with WorkflowState, scoring (NOT imported after rewrite)
- `backend/app/api/routes/chat.py` -- Reference for route pattern: `APIRouter(prefix="/api", tags=[...])` with Pydantic models
- `frontend/src/api/ideas.ts` -- Frontend client (NOT modified here, but informs API contract)

## Tasks & Acceptance

**Execution:**
- [x] `backend/app/api/routes/ideas.py` -- Remove FSM-dependent endpoints: `min_score` filter, `state`/`phase` filters from list; `state.yaml` and `scores.yaml` from get; `/evidence`, `/revisions`, `/artifacts/{name}/diff`, `/interrupts`, `/pause`, `/resume` endpoints -- these belong to FSM/HITL workflows, not pure CRUD
- [x] `backend/app/api/routes/ideas.py` -- Remove imports from `storage.artifacts` and interrupt-related storage functions -- no longer needed after endpoint removal
- [x] `backend/app/api/routes/ideas.py` -- Add Pydantic request/response models for all endpoints following `chat.py` pattern: `CreateIdeaRequest`, `ListIdeasResponse`, `GetIdeaResponse`, `UpdateIdeaRequest`, `UpdateIdeaResponse`, `DeleteIdeaResponse`, `ArchiveIdeaResponse`, `IdeaFilesResponse`, `AddCommentRequest`, `AddCommentResponse`
- [x] `backend/app/api/routes/ideas.py` -- Change router prefix to `prefix="/api"` with route paths `/ideas`, `/ideas/{idea_id}`, etc. to match `chat.py` convention
- [x] `backend/app/api/routes/ideas.py` -- Simplify `get_idea` to return only idea data and comments (no state, scores, transcript_events) -- transcript is chat-domain, not idea CRUD
- [x] `backend/app/api/routes/ideas.py` -- Simplify `create_idea` to not set `current_state` or `phase` fields -- these are FSM concepts
- [x] `backend/app/api/routes/ideas.py` -- Update `list_ideas` to return lean idea entries without `phase` or `state` fields
- [x] `backend/app/api/routes/ideas.py` -- Add `idea_id` validation against `^[A-Z0-9-]+$` in `_idea_exists` to prevent path traversal attacks
- [x] `backend/app/api/routes/ideas.py` -- Add field allowlist `{"title", "signal_text"}` in `update_idea`; reject structural fields with 400 error
- [x] `backend/app/api/routes/ideas.py` -- Add `isinstance(idea, dict)` guard in `list_ideas` against corrupted YAML
- [x] `backend/app/api/routes/ideas.py` -- Verify `archive_path` is non-None before `remove_from_registry` in `archive_idea`; raise 500 on failure

**Acceptance Criteria:**
- Given ideas route is rewritten, when listing ideas, then response contains only idea_id, title, created_at, updated_at per idea (no phase, state, score fields)
- Given ideas route is rewritten, when getting an idea, then response contains idea data and comments (no state.yaml, scores.yaml, transcript_events)
- Given ideas route is rewritten, when creating an idea, then idea is created with idea_id, title, signal_text, created_at, updated_at (no current_state or phase)
- Given ideas route is rewritten, when accessing removed endpoints (evidence, revisions, artifacts, interrupts, pause, resume), then 404 is returned by FastAPI (route not found)
- Given ideas route is rewritten, when deleting an idea, then idea folder is removed and registry entry is cleaned up
- Given ideas route is rewritten, when archiving an idea, then idea folder is copied to archive and removed from registry
- Given all endpoints use Pydantic models, when sending invalid payload, then FastAPI returns 422 validation error automatically
- Given route file is under 150 lines, when counting lines, then file has fewer than 150 lines

## Spec Change Log

### 2026-08-07 — Review pass findings
- **Trigger:** Code review identified path traversal via unsanitized `idea_id` and unrestricted field mutation in `update_idea`
- **Amended:** Added `idea_id` validation, field allowlist for `update_idea`, non-dict YAML guard, and archive failure check to Always constraints and Tasks
- **Known-bad state avoided:** Without `idea_id` validation, attacker can traverse filesystem paths; without field allowlist, attacker can overwrite `idea_id` or `created_at`
- **KEEP:** Clean router structure, Pydantic models, `_idea_exists` helper, `_now()` helper with timezone-aware timestamps, removal of FSM dependencies

## Review Triage Log

### 2026-08-07 — Review pass 1
- intent_gap: 0
- bad_spec: 2: (high 1, medium 1)
- patch: 2: (medium 2)
- defer: 4: (medium 2, low 2)
- reject: 0
- addressed_findings:
  - `[high]` `[bad_spec]` Path traversal via `idea_id` — added `^[A-Z0-9-]+$` validation to Always constraints and Tasks; code reverted for re-derivation
  - `[medium]` `[bad_spec]` Unrestricted field mutation in `update_idea` — added field allowlist `{"title", "signal_text"}` to Always constraints and Tasks; code reverted for re-derivation
  - `[medium]` `[patch]` Non-dict YAML crashes `list_ideas` — applied `isinstance()` guard inline before revert (survives loopback)
  - `[medium]` `[patch]` Archive loses idea on failure — added `archive_path` verification inline before revert (survives loopback)

## Verification

**Commands:**
- `python -c "from backend.app.api.routes.ideas import router; print([r.path for r in router.routes])"` -- expected: lists only CRUD routes
- `grep -c "def " backend/app/api/routes/ideas.py` -- expected: route function count reflects stripped endpoints
- `wc -l backend/app/api/routes/ideas.py` -- expected: fewer than 150 lines
