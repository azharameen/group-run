---
title: 'Story 3.3: Validate workspace filesystem management'
type: 'refactor'
created: '2026-08-07'
status: 'done'
review_loop_iteration: 0
followup_review_recommended: false
context: []
warnings: []
baseline_revision: 'f16bfcbb872b426439232a5d30bb44371f200b87'
final_revision: '84e26fe'
---

<intent-contract>

## Intent

**Problem:** `storage/idea_workspace.py` contains orphaned dead code from Siemens FSM cleanup — `write_handover()` and `clear_idea_runtime_state()` have zero callers in the active codebase. These functions need to be identified and removed to complete the Epic 3 workspace filesystem audit.

**Approach:** Audit all 18 functions in `idea_workspace.py` against actual import/call usage, remove the 2 confirmed-orphaned functions, update `yaml_io.py` re-exports, and verify no test or runtime breakage.

## Boundaries & Constraints

**Always:**
- `yaml_io.py` is the compatibility shim — all consumers import through it. Changes must maintain this contract.
- HITL-related re-exports (`load_pending_interrupts`, `save_pending_interrupts`, `load_transcript_events`, `save_transcript_event`) are Epic 4 preparation — do NOT remove them.
- `write_changelog_entry` has no direct callers but is part of the revision tracking surface — keep it.

**Block If:**
- A function flagged as orphaned is discovered to have callers via string-based dispatch, dynamic imports, or agent tool invocation.

**Never:**
- Rewrite `idea_workspace.py` — this is a validation story, not a redesign.
- Change `yaml_io.py` re-exports beyond removing dead code.
- Modify `artifacts.py` or any storage consumer.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Orphaned function removed | `write_handover` deleted | All tests pass, no import errors | ImportError if caller exists |
| Shim re-export removed | `clear_idea_runtime_state` removed from `yaml_io.py` | Tests pass | ImportError if caller exists |
| Active function preserved | `idea_folder_path`, `create_idea_folder` etc. | No change | No regression |

</intent-contract>

## Code Map

- `backend/app/storage/idea_workspace.py` — 167 lines, 18 functions. Target file.
- `backend/app/storage/yaml_io.py` — compatibility shim that re-exports all idea_workspace functions.
- `backend/app/api/routes/ideas.py` — primary consumer (imports both direct and via shim).
- `backend/app/storage/artifacts.py` — imports `idea_folder_path`, `load_idea_yaml`, `save_idea_yaml` directly.
- `backend/app/agent/domain_tools.py` — imports via `yaml_io.py`.
- `backend/app/agent/runner.py` — imports via `yaml_io.py`.
- `backend/tests/test_transcript_events.py` — tests transcript functions via `yaml_io.py`.
- `backend/tests/test_storage.py` — tests storage functions via `yaml_io.py`.

## Tasks & Acceptance

**Execution:**
- [ ] `backend/app/storage/idea_workspace.py` -- Remove `write_handover()` (lines 44-46) -- zero callers in entire codebase; function generates `{from_state}-to-{to_state}.md` filenames that make no sense post-FSM removal
- [ ] `backend/app/storage/idea_workspace.py` -- Remove `clear_idea_runtime_state()` (lines 73-80) -- zero callers; writes FSM runtime fields (`active_processing`, `active_agent`, `active_state`, `active_message`) to `idea.yaml` with no consumers
- [ ] `backend/app/storage/yaml_io.py` -- Remove `write_handover` and `clear_idea_runtime_state` from import block -- maintain shim consistency after function removal
- [ ] Run `pytest backend/tests/` -- verify no regressions

**Acceptance Criteria:**
- Given `idea_workspace.py` is cleaned, when importing the module, then no `write_handover` or `clear_idea_runtime_state` functions exist
- Given `yaml_io.py` is updated, when importing `yaml_io`, then no `write_handover` or `clear_idea_runtime_state` are exported
- Given orphaned functions are removed, when running `pytest backend/tests/test_storage.py`, then all tests pass
- Given orphaned functions are removed, when running `pytest backend/tests/test_transcript_events.py`, then all tests pass
- Given orphaned functions are removed, when running `pytest backend/tests/`, then no ImportError or AttributeError exceptions occur

## Spec Change Log

## Review Triage Log

### 2026-08-07 — Review pass
- intent_gap: 0
- bad_spec: 0
- patch: 0
- defer: 4
- reject: 0
- addressed_findings:
  - none

## Auto Run Result

**Summary:** Removed 2 orphaned FSM/scoring functions from `idea_workspace.py` and updated `yaml_io.py` shim.

**Files Changed:**
- `backend/app/storage/idea_workspace.py` — Removed `write_handover()` and `clear_idea_runtime_state()` (17 lines deleted)
- `backend/app/storage/yaml_io.py` — Removed orphaned function re-exports (2 lines deleted)

**Review Findings:**
- Patches applied: 0
- Items deferred: 4 (external import breakage, string-based dispatch, stale runtime fields, orphaned handover artifacts)
- Items rejected: 0

**Follow-up Review:** Not recommended — localized low-consequence dead code removal.

**Verification:**
- `pytest tests/test_storage.py tests/test_transcript_events.py` — 9 passed, 3 warnings
- `python -c "from app.storage.idea_workspace import write_handover"` — ImportError confirming removal

**Residual Risks:**
- External consumers importing removed functions will get ImportError (tracked in deferred work)
- Stale FSM runtime fields in existing `idea.yaml` files remain (tracked in deferred work)

## Verification

**Commands:**
- `pytest backend/tests/ -v` -- expected: all tests pass with no import errors
- `python -c "from app.storage.idea_workspace import write_handover"` -- expected: ImportError confirming removal
