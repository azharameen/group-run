---
title: "8.3 Manage Lifecycle Status and Handoffs for Work Items"
type: spec
created: 2026-08-20
status: ready-for-dev
review_loop_iteration: 0
context: "Story 8.3, Epic 8 (Orchestration Core), Companion. Depends on 8.2 (done, PR #59): app/work_items package (models/repository/service/tools), work_items.sqlite (work_items + routing_decisions), /api/work-items, WorkItemsTab in Command Center, work_item_db fixture, POST /api/testing/reset already clears work_items tables."
---

<intent-contract>

## Intent

Give every work item a tracked lifecycle: the v1 phase chain `new → ideation → product_definition → development → testing → deployment → monitoring` (PRD FR-4). A work item can be advanced to a later phase via API (`POST /api/work-items/{id}/transitions`) or chat (CoS calls a `transition_work_item` tool). Every transition is persisted as a lifecycle event with timestamp, owner, department, and full provenance (decided_by, decided_at, confidence, reasoning, alternatives). Cross-department transitions are additionally recorded as handoff events approved by the Chief of Staff (PRD FR-4, epic-8-context "Lifecycle and Handoff Tracking"). The user can view the full lifecycle history of any work item via `GET /api/work-items/{id}/lifecycle` and in the Command Center Work Items tab (per-item history dialog).

## Boundaries & Constraints

### Always
- Lifecycle state machine lives in `backend/app/work_items/service.py` (deterministic, no LLM in the hot path — same rule as 8.2 routing).
- Phase → owning department mapping is pinned (contract for 9.1/9.2/9.3, epics.md contract pin #2):
  - `new` → `ideation` (intake default, matches 8.2 routing fallback)
  - `ideation`, `product_definition` → `ideation`
  - `development`, `testing`, `deployment`, `monitoring` → `technology`
- Every transition event carries provenance: `decided_by` (agent id, default `chief_of_staff`), `decided_at` (UTC ISO), `confidence` (`high`/`low`), `reasoning`, `alternatives` (the other valid target phases).
- A transition that changes the owning department is a **handoff**: the event row is flagged `event_type='handoff'` and `decided_by` is forced to `chief_of_staff` (CoS approval, PRD FR-3 consequence "Handoffs between Departments are logged with Chief of Staff approval").
- API snake_case, same envelope style as 8.2: `{"work_item": ..., "event": ...}` / `{"events": [...], "count": n}`.
- Tests: class-based pytest, in-memory DB via the existing `work_item_db` + `org_db` fixtures; `create_deep_agent` mocked in wiring tests; no live LLM, no new dependencies.
- e2e: test case(s) for the story's primary user flow (extend `frontend/e2e/work-items.spec.ts`); any deferral must be recorded in `_bmad-output/implementation-artifacts/deferred-work.md` with reason.

### Block If
- A test would need a live LLM or real network call.
- The change would modify the supervisor StateGraph, `config/teams.yaml`, or `threads.sqlite`.

### Never
- Publish or consume SSE events for work items (live updates are NOT in this story; the tab re-fetches on mount and after a transition — 8.2 spec "Never" list stands).
- Allow backward transitions or skipping to an invalid status (409).
- Add lifecycle phases beyond the pinned v1 chain (customization is PRD open question #4, v2+).
- Add a `blocked`/`escalation` status (story 9.2 scope).
- Assign work items to teams (department-level only, per 8.2 precedent).

## I/O & Edge-Case Matrix

| Case | Input | Expected |
|---|---|---|
| Advance, same department | item in `new` (ideation) → `status=ideation` | 201; item.status `ideation`, event `transition`, decided_by `chief_of_staff`, confidence `high`, department unchanged |
| Advance, cross-department handoff | item in `product_definition` (ideation) → `status=development` | 201; item.status `development`, item.department_id `technology`, event `handoff`, decided_by forced `chief_of_staff`, reasoning names both departments |
| Skip phases forward | `new` → `development` | 201; allowed (forward jump), single event, department follows target phase |
| Backward transition | `development` → `ideation` | 409, detail names current and requested status; no event written |
| Invalid status | `status=shipped` | 400, detail lists valid statuses |
| No-op transition | `ideation` → `ideation` | 409 (target must be a later phase) |
| Transition, unknown item | `POST /api/work-items/nope/transitions` | 404 |
| Transition, unknown org on item | (item always has a valid org) | n/a — org resolved from the item row |
| Lifecycle history | `GET /api/work-items/{id}/lifecycle` | 200 `{"events": [...], "count": n}` oldest first; includes the implicit `created` event (status `new`, from routing) plus all transitions/handoffs; 404 for unknown item |
| Chat transition | tool `transition_work_item(work_item_id, status, reasoning?)` | returns human-readable confirmation (new status + department + handoff note); unknown item / invalid status return an error string, never raise |
| UI history | user clicks "History" on a work item row | dialog lists every event: type, from→to status, department, decided_by, decided_at, confidence, reasoning |
| UI advance | user clicks "Advance" on a row | POST transition to the next phase in the chain; row status badge updates; history includes the new event |

</intent-contract>

## Code Map

| File | Action | ~Lines |
|---|---|---|
| `backend/app/work_items/models.py` | Edit: add `LIFECYCLE_PHASES` tuple, `PHASE_DEPARTMENT` map, `LifecycleEvent` model, `TransitionWorkItemRequest(status, reasoning?, decided_by?)`; keep `WorkItem` shape unchanged (status stays `str`) | +45 |
| `backend/app/work_items/repository.py` | Edit: add `lifecycle_events` table (`event_id PK, work_item_id, event_type, from_status, to_status, from_department, to_department, decided_by, decided_at, confidence, reasoning, alternatives JSON`) + index `lifecycle_events(work_item_id, decided_at)`; `insert_lifecycle_event`, `list_lifecycle_events(work_item_id)`, `update_work_item_status(work_item_id, status, department_id, updated_at)`; extend `_init_schema` (CREATE TABLE IF NOT EXISTS — safe for existing DBs); keep file under 200 lines (extract helpers if needed) | +70 |
| `backend/app/work_items/service.py` | Edit: `transition_work_item(work_item_id, status, reasoning="", decided_by="chief_of_staff")` — validate target (400-family `ValueError`), validate forward-only (new `InvalidTransitionError`), compute department from `PHASE_DEPARTMENT`, detect handoff, persist item update + event in one transaction; `get_lifecycle_history(work_item_id)` — synthesize the `created` event from the item + routing rows, then stored events, oldest first; `next_phase(status)` helper | +90 |
| `backend/app/work_items/tools.py` | Edit: add `transition_work_item` LangChain tool (thin wrapper, `source`-agnostic; error strings for the whole failure family, mirroring `submit_work_item`); append to `DOMAIN_TOOLS` | +35 |
| `backend/app/api/routes/work_items.py` | Edit: `POST /work-items/{id}/transitions` (400 invalid status, 404 unknown item, 409 invalid transition, 500 storage) + `GET /work-items/{id}/lifecycle` (404 unknown item, 500 storage); keep file under 150 lines — if exceeded, split lifecycle routes into `backend/app/api/routes/work_item_lifecycle.py` and register in `app.py` | +60 |
| `backend/app/api/routes/testing.py` | Edit: step 7 — also `DELETE FROM lifecycle_events` (before `work_items`) | +2 |
| `backend/tests/conftest.py` | No change needed (`work_item_db` fixture already covers the new table via `_init_schema`) | 0 |
| `backend/tests/test_work_items.py` | Edit: new `TestLifecycleTransitions` (service: forward, handoff, skip, backward 409-family, invalid status, no-op, unknown item; history: created event synthesis, ordering, provenance fields) + `TestLifecycleApi` (201/400/404/409/500 mapping, lifecycle GET) + `TestTransitionTool` (confirmation string, error strings) + wiring test asserts `transition_work_item` in runtime tools | +220 |
| `frontend/src/api/workItems.ts` | Edit: `LifecycleEvent` type, `transitionWorkItem(id, payload)`, `fetchLifecycleHistory(id)`; export `LIFECYCLE_PHASES` const mirroring the backend chain | +40 |
| `frontend/src/components/command-center/WorkItemsTab.tsx` | Edit: per-row "History" button (shadcn `Dialog`) listing events (type badge, from→to, department, decided_by, decided_at, confidence, reasoning) + "Advance" button (next phase; disabled on `monitoring`); re-fetch after advance; `data-testid`s: `work-item-history-button`, `work-item-history-dialog`, `lifecycle-event-row`, `work-item-advance-button` | +120 |
| `frontend/src/components/command-center/WorkItemsTab.test.tsx` | Edit: history dialog renders events (mocked `fetchLifecycleHistory`), advance button POSTs next phase and refreshes, advance disabled on `monitoring` | +90 |
| `frontend/e2e/work-items.spec.ts` | Edit: new test — seed org + item, advance `new → ideation → development` via REST (handoff at development), open Work Items tab, open History dialog, assert event rows (created, transition, handoff) with decided_by `chief_of_staff` and department change ideation→technology | +60 |
| `instructions/global-agent-instructions.md` | Edit: extend "Work Item Intake (Chief of Staff)" section — when the user reports a work item finished its current phase, call `transition_work_item` with the next phase and a short reasoning; confirm the new status/department (and handoff, if any) back to the user | +8 |

## Tasks & Acceptance

1. [ ] **models.py** — `LIFECYCLE_PHASES = ("new", "ideation", "product_definition", "development", "testing", "deployment", "monitoring")`; `PHASE_DEPARTMENT: dict[str, str]` per the pinned map; `LifecycleEvent(event_id, work_item_id, event_type: Literal["created","transition","handoff"], from_status, to_status, from_department, to_department, decided_by, decided_at, confidence, reasoning, alternatives)`; `TransitionWorkItemRequest(status, reasoning="", decided_by="chief_of_staff")`.
2. [ ] **repository.py** — `lifecycle_events` schema + index; `insert_lifecycle_event(event)`; `list_lifecycle_events(work_item_id)` ordered `decided_at ASC, rowid ASC`; `update_work_item_status(...)`; transactional `record_transition(item_update, event)` (single commit, rollback on error — mirrors `insert_work_item`).
3. [ ] **service.py** — `transition_work_item`: load item (None → `UnknownWorkItemError`); target not in `LIFECYCLE_PHASES` → `ValueError`; target index ≤ current index → `InvalidTransitionError` (covers backward AND no-op); department = `PHASE_DEPARTMENT[target]`; handoff iff department changes (decided_by forced `chief_of_staff`); confidence `high` when the caller's decided_by is `chief_of_staff` or a handoff, else `low`; reasoning defaults to a deterministic sentence naming from→to (and departments on handoff); alternatives = the other later phases. `get_lifecycle_history`: `created` event synthesized from item (`from_status=""`, `to_status=item.status` at creation = `new`, department from routing row, decided_by/confidence/reasoning from the routing decision) + stored events.
4. [ ] **routes** — implement both endpoints with the matrix error mapping; register the lifecycle router if split.
5. [ ] **tools.py + runtime** — `transition_work_item(work_item_id, status, reasoning="")` tool; returns e.g. `"Work item '<title>' moved to '<status>' (department: <dept>)."` + handoff note; error strings for `UnknownWorkItemError`/`ValueError`/`InvalidTransitionError`/`sqlite3.Error`/`OrganizationIntegrityError`.
6. [ ] **testing.py** — reset clears `lifecycle_events`.
7. [ ] **test_work_items.py** — one test per matrix row at service level (`org_db` + `work_item_db`), API level via TestClient, tool level by direct invocation, wiring test mocks `create_deep_agent` (pattern: `test_skills_wiring.py`) and asserts both `submit_work_item` and `transition_work_item` are registered.
8. [ ] **workItems.ts + client.ts** — types + `transitionWorkItem` + `fetchLifecycleHistory` following the existing module patterns (`?? []` guard on list keys).
9. [ ] **WorkItemsTab.tsx + tests** — History dialog + Advance button per Code Map; keep existing `data-testid`s intact (e2e `work-items.spec.ts` depends on them).
10. [ ] **e2e work-items.spec.ts** — extend with the lifecycle flow test (primary user flow per AD-21).
11. [ ] **global-agent-instructions.md** — CoS lifecycle-advance guidance (prompt-only; `teams.yaml` untouched).

**Acceptance criteria** (story + PRD FR-4):
- AC-1: Given a work item is active in the organization, when it transitions between phases via `POST /api/work-items/{id}/transitions`, then the lifecycle status updates with timestamps, owner, and provenance metadata (decided_by, decided_at, confidence, reasoning, alternatives) and the response returns the updated item plus the event.
- AC-2: Given a transition crosses departments (e.g. `product_definition` → `development`), when it is processed, then the event is recorded as a handoff with Chief of Staff approval (decided_by `chief_of_staff`) and the item's `department_id` follows the target phase's owning department.
- AC-3: Given a work item with a history, when the user queries `GET /api/work-items/{id}/lifecycle`, then the full lifecycle history is returned oldest-first, starting with the creation event and including every transition and handoff with provenance.
- AC-4: Given the user opens the Command Center Work Items tab, when they open a work item's history, then the full lifecycle is visible (status changes, departments, deciders, timestamps, reasoning); the user can advance the item to its next phase from the UI.
- AC-5: Given an invalid transition (backward, no-op, or unknown status), when submitted, then the API returns the matrix error (409/400) without writing any event.
- e2e: test case(s) for the story's primary user flow (extend `frontend/e2e/work-items.spec.ts`); any deferral must be recorded in `_bmad-output/implementation-artifacts/deferred-work.md` with reason.

## Delivery Patterns

- **CI**: `ruff check backend/app` (100-char), `python scripts/forbidden_imports.py`, full pytest + vitest green, `npx tsc --noEmit` clean.
- **Testing**: in-memory DB fixtures (`org_db` + `work_item_db`); `create_deep_agent` mocked in wiring test; tool tested by direct invocation; no live model (NFR-A10).
- **Docker**: no new runtime dependencies; `lifecycle_events` lands in the existing `work_items.sqlite` (existing `STORAGE_DIR` volume).

## Dev Notes

### Project Structure Notes

- `app/work_items/` is the canonical owner of work-item state (AD-13). All new code stays inside this package + its routes/tests/UI tab.
- Repository pattern: raw sqlite3, module-singleton connection, WAL, `threading.Lock`, `_reset_work_item_db` test hook — mirror exactly (8.2 precedent). `CREATE TABLE IF NOT EXISTS` in `_init_schema` means existing `work_items.sqlite` files gain the new table on next start; no migration script needed.
- File-size limits are hard rules: routes < 150 lines, services/repositories < 200. `service.py` is already ~176 lines — if it exceeds 200 after this story, extract the lifecycle state machine into `backend/app/work_items/lifecycle.py` (module with `LIFECYCLE_PHASES`, `PHASE_DEPARTMENT`, `next_phase`, validation) and import from both service and models consumers.
- Frontend: shadcn `Dialog`/`Badge`/`Button` from `@/components/ui/`; `cn()` for classes; `@/` alias; snake_case API fields preserved in TS (no camelCase conversion).
- `POST /api/testing/reset` already clears work_items tables (step 7) — extend it, don't add a new endpoint.
- 8.2 deferred item (deferred-work.md: `_routing_map` IN-clause limit at ~999 items) is NOT addressed here — pagination stays Epic 12.

### Previous Story Intelligence (8.2)

- Review pass patched 10 findings; the high one was tests bypassing the `work_item_db` fixture and polluting the real `storage/work_items.sqlite`. **Every new test that touches work-item storage must take both `org_db` and `work_item_db` fixtures.**
- "No organization" tests must also take `org_db` (machine-dependent real storage otherwise).
- Use `monkeypatch.delitem(sys.modules, mod, raising=False)` — never bare `del sys.modules[...]` (flake fixed in 8.2).
- List ordering tie-breaks on `rowid DESC` for equal timestamps — same trick for lifecycle events (`decided_at ASC, rowid ASC`).
- Tool error contract: catch the whole failure family and return an error string; never raise into the agent turn.
- 8.2 spec "Never" list: no SSE, no teams.yaml, no supervisor graph changes — all still binding for 8.3.

### References

- [Source: _bmad-output/planning-artifacts/prds/prd-Companion-2026-08-01/prd.md#FR-4] — lifecycle chain, transition logging, handoff provenance, full-history query.
- [Source: _bmad-output/planning-artifacts/epics.md#Story 8.3] — story statement + ACs; contract pin #2 (work-item schema pinned for 9.1/9.2/9.3).
- [Source: _bmad-output/implementation-artifacts/epic-8-context.md#Lifecycle and Handoff Tracking] — v1 fixed schema, handoffs logged as CoS approval events.
- [Source: _bmad-output/implementation-artifacts/spec-8-2-submit-and-route-work-item.md] — patterns, fixtures, error mapping, review learnings.
- [Source: _bmad-output/planning-artifacts/architecture/architecture-Companion-2026-08-02/ARCHITECTURE-SPINE.md#AD-3, AD-13, AD-21] — persistence, entity ownership, e2e strategy.

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List
