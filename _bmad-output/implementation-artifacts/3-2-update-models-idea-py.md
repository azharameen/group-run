---
title: 'Story 3.2: Update models/idea.py — remove Siemens fields'
type: 'refactor'
created: '2026-08-07'
status: 'done'
baseline_revision: 'b174c0845240b6569895b8f7df151638eabc2b95'
final_revision: 'f16bfcbb872b426439232a5d30bb44371f200b87'
followup_review_recommended: false
---

## Story

As a developer maintaining the Companion codebase,
I want `models/idea.py` to contain only lean CRUD data models without Siemens FSM/scoring dependencies,
so that the ideas module is self-contained and doesn't pull in deprecated Siemens-specific code.

## Acceptance Criteria

1. Given `models/idea.py` is updated, when importing the module, then no `WorkflowState`, `PHASE_GROUPS`, `ScoreBreakdown`, `ScoreRecord`, `StateTransition`, `CriterionDetail`, or `IdeaScopeDraft` classes exist
2. Given `models/idea.py` is updated, when importing `Idea` model, then it contains only: `idea_id`, `title`, `signal_text`, `created_at`, `updated_at`, `tags`, `problem_statement`, `solution_concept`
3. Given `models/idea.py` is updated, when importing `IdeaRegistry` model, then it still contains `ideas` list and `next_id` counter
4. Given `models/idea.py` is updated, when running existing tests, then no import errors occur from files that depend on `IdeaRegistry`
5. Given `models/idea.py` is lean, when counting lines, then file is under 80 lines

## Tasks / Subtasks

- [x] Task 1: Remove Siemens FSM classes (AC: #1)
  - [x] Remove `WorkflowState` enum (18 states)
  - [x] Remove `PHASE_GROUPS` dict
  - [x] Remove `phase_for_state()` function
  - [x] Remove `StateTransition` model
  - [x] Remove `IdeaScopeDraft` model
- [x] Task 2: Remove scoring classes (AC: #1)
  - [x] Remove `CriterionDetail` model
  - [x] Remove `ScoreBreakdown` model
  - [x] Remove `ScoreRecord` model
- [x] Task 3: Replace `IdeaRecord` with lean `Idea` model (AC: #2)
  - [x] Create `Idea` model with: `idea_id`, `title`, `signal_text`, `created_at`, `updated_at`, `tags`, `problem_statement`, `solution_concept`
  - [x] Remove FSM fields: `current_state`, `phase`, `state_history`, `scores`, `latest_composite`, `ideascope_draft`, `running_agent`, `paused_processing`, `priority`
  - [x] Remove Siemens fields: `siemens_domain`, `siemens_business_unit`, `source_evidence`
  - [x] Remove score-related methods: `update_phase()`, `latest_score()`, `score_history`, `score_trend`
- [x] Task 4: Preserve `IdeaRegistry` model (AC: #3, #4)
  - [x] Keep `ideas: list[dict]` and `next_id: int` fields unchanged
- [x] Task 5: Verify no breakage (AC: #4, #5)
  - [x] Verify no active backend code imports from `models/idea.py`
  - [x] Run `pytest backend/tests` to confirm no import errors (7 storage + 8 chat = 15 passed)

## Dev Notes

### Current State

`backend/app/models/idea.py` is 171 lines containing:
- `WorkflowState` enum (18 states — Siemens FSM workflow)
- `PHASE_GROUPS` dict (6 phases mapping to states)
- `phase_for_state()` helper function
- `StateTransition`, `CriterionDetail`, `ScoreBreakdown`, `ScoreRecord` — scoring/state models
- `IdeaScopeDraft` — Siemens IP/patent filing model
- `IdeaRecord` — full idea model with FSM fields, scores, Siemens domain fields
- `IdeaRegistry` — registry container with `ideas` list and `next_id` counter

### What Must Be Preserved

- `IdeaRegistry` model — used by `storage/registry.py` (`load_idea_registry`, `save_idea_registry`)
- `ideas: list[dict[str, Any]]` and `next_id: int` fields in `IdeaRegistry`

### What Can Be Safely Removed

No active backend code imports from `models/idea.py`:
- Story 3.1 (`ideas.py` route) was rewritten to NOT import from `models/idea.py`
- `storage/registry.py` imports only `IdeaRegistry` (keeping it safe)
- `storage/idea_workspace.py` does NOT import from `models/idea.py`
- No other backend code references these models

### Target State

Lean `models/idea.py` (~60 lines) with:
- `Idea` model (simple Pydantic model for idea CRUD fields)
- `IdeaRegistry` model (unchanged)

### File to Modify

- `backend/app/models/idea.py` — only file to change

### Testing

- Run `pytest backend/tests/test_storage.py` — tests use `IdeaRegistry`, should still pass
- Run `pytest backend/tests/test_chat_endpoint.py` — chat tests should still pass
- No new tests needed for this story (models are tested indirectly through storage tests)

### References

- [Source: backend/app/models/idea.py] — current file (171 lines)
- [Source: backend/app/storage/registry.py] — uses `IdeaRegistry` model
- [Source: _bmad-output/planning-artifacts/epics.md#FR-3.2] — story requirement
- [Source: _bmad-output/implementation-artifacts/spec-3-1-rewrite-api-routes-ideas-py.md] — Story 3.1 spec (confirms no models/idea.py imports)
- [Source: docs/architecture.md] — models/ is deprecated module, being phased out

## Dev Agent Record

### Agent Model Used

qwen-3.6-27b via BMad Dev Auto workflow

### Debug Log References

- `pytest tests/test_storage.py -v` — 7 passed in 0.75s
- `pytest tests/test_chat_endpoint.py -v` — 8 passed in 2.47s
- Import verification: `WorkflowState` raises `ImportError` (confirmed removed)
- Model verification: `Idea` has 8 fields, `IdeaRegistry` has 2 fields

### Completion Notes List

- Reduced `models/idea.py` from 171 lines to 27 lines (84% reduction)
- Removed 10 Siemens FSM/scoring classes: `WorkflowState`, `PHASE_GROUPS`, `phase_for_state()`, `StateTransition`, `CriterionDetail`, `ScoreBreakdown`, `ScoreRecord`, `IdeaScopeDraft`, `IdeaRecord`
- Added lean `Idea` model with 8 CRUD fields
- Preserved `IdeaRegistry` model unchanged
- Updated `models/__init__.py` to export `Idea` and `IdeaRegistry`
- Zero backend code was importing from `models/idea.py` (story 3.1 decoupled the route)
- `storage/registry.py` uses plain `dict` not the `IdeaRegistry` model

### File List

- `backend/app/models/idea.py` — rewritten (171 lines → 27 lines)
- `backend/app/models/__init__.py` — updated exports

## Review Triage Log

### 2026-08-07 — Review pass
- intent_gap: 0
- bad_spec: 0
- patch: 0
- defer: 4: (high 0, medium 2, low 2)
  - `Idea` and `IdeaRegistry` models defined but never instantiated (medium)
  - `write_handover` orphaned dead code in `idea_workspace.py` (low)
  - `clear_idea_runtime_state` orphaned function (low)
  - `datetime.utcnow()` deprecated in Python 3.12+ (medium)
- reject: 6: (high 0, medium 0, low 6)
  — `Idea` dropped `problem_statement` — false claim, fields present
  — No regression tests — spec explicitly says not needed
  — `IdeaRegistry.ideas` typed as `list[dict]` — matches spec requirement
  — `_generate_idea_id` race condition — pre-existing, already deferred
  — Test data uses magic strings — pre-existing dict-based pattern
  — `IdeaRegistry` never consumed — same as `Idea` defer
- addressed_findings:
  - none

## Auto Run Result

### Summary

Removed all Siemens FSM/scoring dead code from `backend/app/models/idea.py`, reducing the file from 171 lines to 27 lines (84% reduction). Replaced `IdeaRecord` with a lean `Idea` model containing 8 CRUD fields. Preserved `IdeaRegistry` unchanged. Updated `__init__.py` exports. All 15 existing tests pass (7 storage + 8 chat).

### Files Changed

| File | Description |
|------|-------------|
| `backend/app/models/idea.py` | Rewritten: 171 lines → 27 lines, removed 10 Siemens classes, added `Idea` model |
| `backend/app/models/__init__.py` | Updated exports from 5 removed classes to `Idea` + `IdeaRegistry` |

### Review Findings

- **4 deferred**: pre-existing architectural issues (orphaned functions, deprecated API, unused models)
- **6 rejected**: noise/false claims (6 findings were incorrect or pre-existing)
- **0 patches**: no code fixes needed
- **Follow-up review recommended**: false — localized, low-risk refactor

### Verification

- `pytest tests/test_storage.py` — 7 passed in 0.75s
- `pytest tests/test_chat_endpoint.py` — 8 passed in 2.47s
- Import verification: `WorkflowState` raises `ImportError` (confirmed removed)
- Model verification: `Idea` has 8 fields, `IdeaRegistry` has 2 fields
- Line count: 27 lines (under 80-line AC)

### Residual Risks

- `Idea` and `IdeaRegistry` models are defined but not instantiated — pure type definitions for future use
- `datetime.utcnow()` deprecated in Python 3.12+ — deferred for later cleanup
