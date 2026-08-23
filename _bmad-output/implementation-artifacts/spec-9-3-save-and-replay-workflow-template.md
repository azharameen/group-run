---
title: 'Save and replay a workflow as a template'
type: 'feature'
created: '2026-08-22'
status: 'done'
review_loop_iteration: 0
baseline_revision: '34bd6f7b25fe362330e9adfec32fc8241ffe9268'
followup_review_recommended: false
final_revision: 'f8dcd0f'
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-9-context.md'
warnings: []
---

<intent-contract>

## Intent

**Problem:** Successful coordination patterns (the phase sequence a work item walked through, with department handoffs) are lost when the item completes — every new work item starts from scratch with default routing, so users must re-drive the same workflow manually.

**Approach:** Add a deterministic, LLM-free workflow-template feature on the work-items module: capture a work item's current phase + department sequence as a named template (SQLite, per-org), and replay a template by creating a new work item and auto-advancing it through the saved phase sequence via the existing `transition_work_item` path (so every step lands in the audit trail); surface save/list/replay in the Command Center Work Items tab.

## Boundaries & Constraints

**Always:**
- Capture and replay are deterministic (no LLM, no randomness); replay reuses `service.transition_work_item` so each step records a `lifecycle_events` + `decisions` row — never write lifecycle state directly.
- Templates are per-organization; a replayed item's `source` is `template:{template_id}` and its new `template_id` column records the origin.
- Template metadata supports discoverability: `usage_count` (incremented per replay) and `last_used_at` (set per replay).
- snake_case API contract preserved end-to-end (backend → TS types).
- File-size limits: route files < 150 lines, services < 200 lines.
- Frontend uses shadcn/ui components from `@/components/ui/` and the centralized API client (`@/api/client`).

**Block If:**
- The 8.2 `work_items`/`lifecycle_events` schema or `LIFECYCLE_PHASES` differs from the Code Map below.
- A decision is needed on whether replay should also reassign agents per phase (this spec does NOT touch agent assignment — 9.2 owns reassignment).

**Never:**
- No changes to `LIFECYCLE_PHASES`, `PHASE_DEPARTMENT`, or `transition_work_item` forward-only semantics (8.2 owns them).
- No template editing, deletion, or cross-org sharing in this story.
- No changes to deprecated modules (`models/`, `state/`, `scoring/`, `orchestrator/`, `storage/`) or to the 9.1 health panel / 9.2 evaluate flow.
- No background scheduler — replay is on-demand via the endpoint.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| SAVE | Item in `development` (technology), org exists | 201 with template: `phases: ["new","ideation","product_definition","development"]`, `departments` aligned per phase, `source_work_item_id` set | No error expected |
| SAVE_NEW | Item in `new` | 400 — a `new` item has no captured workflow yet | HTTPException 400 |
| REPLAY | Template ending at `development`, new title | 201 with `work_item` (status `development`, `template_id` set, `source` `template:{id}`) + `events` (one per transition); `usage_count` +1, `last_used_at` set | No error expected |
| REPLAY_TERMINAL | Template ending at `monitoring` | 201 with item at `monitoring`, 6 transition events | No error expected |
| UNKNOWN_ITEM | `POST /work-items/{unknown}/template` | 404 `Work item {id} not found` | HTTPException 404 |
| UNKNOWN_TEMPLATE | `POST /work-items/templates/{unknown}/replay` | 404 `Template {id} not found` | HTTPException 404 |
| UNKNOWN_ORG | `GET /work-items/templates?org_id={unknown}` | 404 `Organization {id} not found` | HTTPException 404 |
| BLANK_TITLE | Replay with blank title | 400 (same rule as submit) | HTTPException 400 |
| STORAGE_FAILURE | sqlite error | 500 `Failed to ...` | HTTPException 500 |

</intent-contract>

## Code Map

- `backend/app/work_items/lifecycle.py` (30 lines) -- `LIFECYCLE_PHASES` (7 phases), `PHASE_DEPARTMENT` (new/ideation/product_definition→ideation; development/testing/deployment/monitoring→technology), `next_phase`
- `backend/app/work_items/repository.py` (230+ lines) -- `_init_schema` (L29-94: `work_items`, `routing_decisions`, `lifecycle_events`, `decisions`, `org_alerts`); `department_id` ALTER-migration pattern (L96-98) to mirror for the new column; module-singleton conn + `_reset_work_item_db` test hook
- `backend/app/work_items/service.py` (222 lines) -- `submit_work_item` (L81, item dict + `repository.insert_work_item`), `transition_work_item` (L134, forward-only, records event+decision transactionally), `get_work_item`, `get_lifecycle_history` (L199)
- `backend/app/work_items/models.py` -- `WorkItem` (add `template_id`), `LifecycleEvent`, `SubmitWorkItemRequest`, `TransitionWorkItemRequest`; add `WorkflowTemplate`, `SaveTemplateRequest`, `ReplayTemplateRequest`
- `backend/app/work_items/mapping.py` -- `row_to_work_item` (add `template_id` passthrough)
- `backend/app/api/routes/work_items.py` (130 lines) -- 5 endpoints; error mapping pattern (400/404/409/500) to mirror; do NOT add template endpoints here (would breach the <150-line route limit)
- `backend/app/api/routes/work_item_templates.py` -- new route file (3 endpoints, < 150 lines); register in `backend/app/api/app.py` (import at L28 pattern, `app.include_router` at L135)
- `backend/app/api/routes/testing.py` (L83-85) -- test-only reset loop deletes `lifecycle_events`/`routing_decisions`/`work_items` rows; add `workflow_templates` to that table list
- `frontend/src/api/workItems.ts` -- `submitWorkItem`, `transitionWorkItem`, `fetchLifecycleHistory` etc.; add template types + `saveWorkItemTemplate`, `fetchTemplates`, `replayTemplate`
- `frontend/src/components/command-center/WorkItemsTab.tsx` (~250 lines) -- `WorkItemRow` (L25, per-row action buttons `work-item-advance-button` pattern), main tab (L165, fetch/error/loading/empty states, `data-testid="work-items-*"`); add save-as-template button + templates section
- `frontend/src/__tests__/WorkItemsTab.test.tsx` -- vitest + RTL, mocks `@/api/client`
- `backend/tests/conftest.py` -- `org_db` + `work_item_db` in-memory fixtures
- `backend/tests/test_work_items.py` -- existing seeding helpers to reuse

## Tasks & Acceptance

**Execution:**
- [x] `backend/app/work_items/repository.py` -- add `workflow_templates` table to `_init_schema` (`template_id TEXT PRIMARY KEY, org_id TEXT NOT NULL, name TEXT NOT NULL, source_work_item_id TEXT NOT NULL, phases TEXT NOT NULL, departments TEXT NOT NULL, usage_count INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL, last_used_at TEXT`) + index on `org_id`; add `template_id TEXT` column to `work_items` with the same ALTER-migration pattern as `department_id`; add `insert_template`, `list_templates(org_id)`, `get_template(template_id)`, `record_template_usage(template_id, now)` -- storage for templates + replay provenance
- [x] `backend/app/work_items/models.py` -- add `WorkflowTemplate` (`template_id`, `org_id`, `name`, `source_work_item_id`, `phases: list[str]`, `departments: list[str]`, `usage_count: int`, `created_at`, `last_used_at: str | None`), `SaveTemplateRequest` (`name`), `ReplayTemplateRequest` (`title`, `description`); add `template_id: str | None` to `WorkItem` -- typed contract
- [x] `backend/app/work_items/mapping.py` -- include `template_id` in `row_to_work_item` -- keeps API shape complete
- [x] `backend/app/work_items/templates.py` -- new module (< 200 lines): `save_template(work_item_id, name) -> WorkflowTemplate` (404-raise unknown item; reject `status == "new"`; `phases` = `LIFECYCLE_PHASES[:index(current)+1]`, `departments` = `[PHASE_DEPARTMENT[p] for p in phases]`); `list_templates(org_id)`; `replay_template(template_id, title, description) -> tuple[WorkItem, list[LifecycleEvent]]` (create via `submit_work_item` with `source=f"template:{template_id}"` and `template_id`, then `transition_work_item` through each remaining phase with reasoning `Replayed template '{name}' ({template_id}): {from} → {to}.`; collect events; `record_template_usage` last) -- deterministic capture/replay
- [x] `backend/app/work_items/service.py` -- extend `submit_work_item` with optional `template_id: str | None = None` (persisted on the item; no other behavior change) -- minimal 8.2 surface extension
- [x] `backend/app/api/routes/work_item_templates.py` -- new route file: `POST /work-items/{work_item_id}/template` (201 `{"template": {...}}`; 400 blank name / `new`-phase item, 404 unknown item, 500 sqlite), `GET /work-items/templates` (200 `{"templates": [...], "count": n}`; 404 unknown org, 500), `POST /work-items/templates/{template_id}/replay` (201 `{"work_item": {...}, "events": [...]}`; 400 blank title, 404 unknown template/org, 500) -- mirrors existing error mapping
- [x] `backend/app/api/app.py` -- import + `app.include_router` for the new template router (L28/L135 pattern) -- wires the endpoints
- [x] `backend/app/api/routes/testing.py` -- add `workflow_templates` to the reset table list (L85) -- keeps the test reset endpoint consistent
- [x] `backend/tests/test_work_item_templates.py` -- new tests: `TestTemplateService` (save captures phases+departments for a mid-lifecycle item; save rejects `new` item; replay creates item at template's end phase with `template_id`/`source` set and one lifecycle event per transition; replay of terminal template; `usage_count`/`last_used_at` update; unknown item/template raise) and `TestTemplateAPI` (201 shapes, 404s, 400 blank name/title, snake_case keys) using `org_db` + `work_item_db` fixtures -- covers the I/O matrix
- [x] `frontend/src/api/workItems.ts` -- add `WorkflowTemplate` TS type (snake_case) + `saveWorkItemTemplate(workItemId, name)`, `fetchTemplates(orgId)`, `replayTemplate(templateId, title, description)` -- centralized client, no raw fetch
- [x] `frontend/src/components/command-center/WorkItemsTab.tsx` -- add per-row "Save as template" `Button` (`data-testid="work-item-template-button"`) opening a name dialog (`data-testid="template-name-dialog"`); add a Templates section at top of the tab listing org templates (`data-testid="template-row-{template_id}"`, showing name, end phase, usage count) with a "Replay" button (`data-testid="template-replay-{template_id}"`) opening a title dialog (`data-testid="template-replay-dialog"`) that shows the created item id + replayed phases on success; surface API errors (throw, don't swallow) -- makes capture/replay usable per epic UX requirement
- [x] `frontend/src/__tests__/WorkItemsTab.test.tsx` -- extend: save button opens dialog and POSTs on confirm; templates list renders fetched templates; replay dialog creates item and shows result; API errors surfaced -- mirrors existing mock pattern

**Acceptance Criteria:**
- Given a work item has completed or is in a stable state (any phase beyond `new`), when the user saves it as a template, then the system persists the workflow configuration and step sequence (phases + department per phase) for future reuse.
- Given a saved template, when the user replays it in a new work item context, then a new work item is created and advanced through the saved phase sequence with each step recorded in the lifecycle audit trail, and the template's usage metadata is updated.

## Delivery Patterns Checklist

**CI** (`.github/workflows/ci.yml`) — which jobs this story affects or extends:
- [x] Backend: `ruff check` clean, `scripts/forbidden_imports.py` passes, coverage stays at/above `--cov-fail-under=60`
- [x] Frontend: targeted WorkItemsTab tests and `npm run build` pass (full-suite `useChatStream` failures are pre-existing)
- [x] User-visible flow changed: no Playwright E2E spec added (template panel covered by vitest) — or add one if the E2E suite already exercises the Work Items tab

**Docker / Deploy** — container and deployment impact:
- [x] Image/compose changes needed: none
- [x] New env vars: none

**Testing** — how this story's tests honor project rules:
- [x] LLM/MCP boundaries mocked — capture/replay are deterministic, no LLM at all
- [x] Separate test DB (never the dev `checkpoints.db`); reuse `org_db` + `work_item_db` from `conftest.py`
- [x] No new shared fixtures needed; class-based `TestFeature` structure
- [x] No new tests in deprecated modules

## Spec Change Log

## Review Triage Log

### 2026-08-22 — Review pass
- intent_gap: 0
- bad_spec: 0
- patch: 0
- defer: 1: (medium 1)
- reject: 18
- addressed_findings:
  - none

Deferred: no authorization/org-membership check on the template endpoints (or any API route) — pre-existing app-wide pattern, not introduced by this story.

Rejected (verified against code): partial-replay inconsistency (replay sequence is a prefix of `LIFECYCLE_PHASES`, so every transition is valid by construction; a failure raises and the item remains in a valid earlier phase); JSON deserialization crashes (phases/departments are only ever written by our own `json.dumps`); `usage_count` race (cosmetic counter; transitions already serialized by `_TRANSITION_LOCK`); off-by-one wrap in replay reasoning (loop iterates `phases[1:]`, so `phases.index(phase) - 1` is always ≥ 0); missing owner/tags/pagination/delete (explicitly out of scope per spec); `new`-phase/single-phase templates (rejected at save time, so replay always has ≥ 1 transition); empty-string `org_id` (fails the org existence check → 404); structured audit provenance (the `work_items.template_id` column is the queryable field); template_id UUID format / source-string encoding (uuid4-generated, no parsing downstream); frontend input validation (backend enforces; mirrors existing client pattern); whitespace-only description (allowed by design, ≤5000 chars).

## Design Notes

**Template = phase prefix, not event log:** A work item's workflow is fully described by its current phase — the sequence is always the prefix of `LIFECYCLE_PHASES` up to that phase, and the department per phase is `PHASE_DEPARTMENT`. Storing `phases` + `departments` (JSON lists) keeps the template self-describing and stable even if the lifecycle grows later; no need to serialize raw events.

**Replay rides the 8.2 transition path:** Replay = `submit_work_item` (item lands in `new`) + one `transition_work_item` call per remaining phase. This reuses forward-only validation, handoff detection, and the transactional event+decision recording for free — the replayed item's lifecycle history is indistinguishable from a manually driven one except for the reasoning text and `source: template:{id}`.

**`new`-phase items are not savable:** An item in `new` has no coordination pattern yet (only default routing), so saving is rejected with 400 — "stable state" in the AC means at least one transition has happened.

## Verification

**Commands:**
- `python -m pytest backend/tests/test_work_item_templates.py backend/tests/test_work_items.py -q` -- expected: all pass
- `python -m pytest backend/tests -q` -- expected: full suite green (no regressions in 8.2/9.1/9.2 tests)
- `python -m ruff check backend/app/work_items backend/app/api/routes/work_items.py` -- expected: clean
- `cd frontend && npx vitest run src/__tests__/WorkItemsTab.test.tsx` -- expected: pass
- `cd frontend && npm run build` -- expected: pass

## Auto Run Result

Status: done

### Summary

Implemented Story 9.3: deterministic, LLM-free workflow-template capture and replay on the work-items module. A work item's phase sequence (prefix of LIFECYCLE_PHASES up to its current phase, with PHASE_DEPARTMENT per phase) can be saved as a named per-org template; replaying a template creates a new work item (source=	emplate:{id}, template_id provenance) and auto-advances it through the saved phases via the existing transition_work_item path, so every step lands in the audit trail. Save/list/replay are surfaced in the Command Center Work Items tab.

### Files changed

- backend/app/work_items/templates.py (new) — save_template / list_templates / replay_template service logic
- backend/app/api/routes/work_item_templates.py (new) — POST /work-items/{id}/template, GET /work-items/templates, POST /work-items/templates/{id}/replay
- backend/tests/test_work_item_templates.py (new) — 20 tests covering service + API I/O matrix
- backend/app/work_items/models.py — WorkflowTemplate, SaveTemplateRequest, ReplayTemplateRequest; WorkItem.template_id
- backend/app/work_items/repository.py — workflow_templates table + index, work_items.template_id migration, template CRUD + usage recording
- backend/app/work_items/mapping.py — template_id passthrough in row_to_work_item
- backend/app/work_items/service.py — submit_work_item accepts optional template_id
- backend/app/api/app.py — registers template router before work_items router (route precedence)
- backend/app/api/routes/testing.py — reset loop includes workflow_templates
- frontend/src/api/workItems.ts — WorkflowTemplate type + saveWorkItemTemplate / fetchTemplates / replayTemplate
- frontend/src/components/command-center/WorkItemsTab.tsx — save-as-template button + dialog, templates section, replay dialog
- frontend/src/components/command-center/WorkItemsTab.test.tsx — 14 tests (incl. new template coverage)
- _bmad-output/implementation-artifacts/epic-9-context.md — regenerated (stale cache)

### Review findings breakdown

- Patches applied: 0
- Deferred: 1 (no auth layer on template endpoints — pre-existing app-wide pattern)
- Rejected: 18 (verified false positives or explicitly out of scope per spec)

### Verification performed

- pytest backend/tests/test_work_item_templates.py + test_work_items.py: 73 passed
- Full backend suite: 477 passed (coverage gate held)
- ruff check on all changed backend files: clean
- npx vitest run src/components/command-center/WorkItemsTab.test.tsx: 14 passed (after restoring the work-items-empty testid the refactor had dropped)
- npm run build: succeeded

### Residual risks

- No authorization on the new endpoints (deferred; app-wide pre-existing gap).
- usage_count is a best-effort counter (no lock); cosmetic only.
- Templates have no delete/edit/share in this story (out of scope by design).