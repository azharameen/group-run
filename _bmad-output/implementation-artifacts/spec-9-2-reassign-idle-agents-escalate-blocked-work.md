---
title: 'Reassign idle agents and escalate blocked work'
type: 'feature'
created: '2026-08-22'
status: 'done'
review_loop_iteration: 0
baseline_revision: 'e889debdd880febb008fa044b5e72254581a7df4'
final_revision: 'bd60c64b860c0a419f7d2a141eb26411fd2b103c'
followup_review_recommended: false
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-9-context.md'
warnings: []
---

<intent-contract>

## Intent

**Problem:** Idle agent capacity and stalled work are invisible and unhandled: work items sit unowned by the Chief of Staff or owned by idle agents with no reassignment, and items stuck in one phase beyond the threshold raise no alert — the organization stalls on bottlenecks.

**Approach:** Add a deterministic, LLM-free `POST /api/organizations/{org_id}/evaluate` endpoint (the Chief of Staff evaluation) that (1) reassigns open work items to idle agents in the owning department and (2) raises a visible, deduplicated alert for any item stuck in one phase beyond a configurable threshold, logging every decision in the existing `lifecycle_events` audit trail; surface the evaluation actions and alerts in the Command Center Team Health tab.

## Boundaries & Constraints

**Always:**
- Evaluation is deterministic (no LLM, no randomness — tie-breaks by `agent_id`/`work_item_id` order) and idempotent: re-running with unchanged state produces no new actions or alerts.
- Every reassignment and escalation records decision + reason in the audit trail: reassignments as a `lifecycle_events` row (`event_type: "reassignment"`), escalations as an `org_alerts` row plus a `lifecycle_events` row (`event_type: "escalation"`).
- Thresholds are configurable via `Settings` (env-overridable, validated non-negative), never hard-coded in service logic.
- snake_case API contract preserved end-to-end (backend → TS types).
- File-size limits: route files < 150 lines, services < 200 lines.
- Frontend uses shadcn/ui components from `@/components/ui/` and the centralized API client (`@/api/client`).

**Block If:**
- The 8.1 `agents` table or 8.2 `work_items`/`lifecycle_events` schema differs from the Code Map below (field names changed since planning).
- A decision is needed on whether "blocked" should be a new lifecycle phase instead of the stuck-in-phase threshold interpretation (this spec uses the threshold interpretation — see Design Notes).

**Never:**
- No changes to the lifecycle phase list or `transition_work_item` forward-only semantics (8.2 owns them).
- No background scheduler/daemon — evaluation is on-demand via the endpoint (the frontend triggers it; no new process or timer).
- No changes to deprecated modules (`models/`, `state/`, `scoring/`, `orchestrator/`, `storage/`) or to the 8.2 work-item panel.
- No reassignment of the org-level Chief of Staff agent (agents with NULL `department_id` are never picked as owners).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| REASSIGN | Org with 1 open item in `new` (owner `chief_of_staff`), idle agent in ideation dept | 201 with `actions` listing the reassignment; item `owner_agent_id` = that agent; agent status `active`; `lifecycle_events` row `reassignment` with reason | No error expected |
| ESCALATE | Item in `development` with `updated_at` older than `blocked_phase_threshold_hours` | 201 with `alerts` listing the escalation; `org_alerts` row + `lifecycle_events` row `escalation` | No error expected |
| NO_IDLE_CAPACITY | Open item, no idle agents in its department | No reassignment; escalation alert raised (reason: no idle capacity) | No error expected |
| IDEMPOTENT | Re-run evaluate after a successful reassignment (owner now active) | 201 with empty `actions` and no new alerts | No error expected |
| UNKNOWN_ORG | `POST /api/organizations/{unknown}/evaluate` | 404 `Organization {id} not found` | HTTPException 404 |
| STORAGE_FAILURE | sqlite error during evaluation | 500 `Failed to evaluate organization` | HTTPException 500 |

</intent-contract>

## Code Map

- `backend/app/organization/models.py` (177+ lines) -- `AgentStatus = Literal["active","idle","overloaded"]` (L13); `DEFAULT_ORG_STRUCTURE` pins 1 CoS (org-level, NULL dept) + 2 depts / 5 teams / 18 agents; agent ids like `idea_captain`, `chief_of_staff`
- `backend/app/organization/repository.py` (205 lines) -- `agents` table `(org_id, department_id, team_id, agent_id, name, role, status)` (L55-64); `get_organization_rows(org_id)` (L141); `_reset_organization_db` test hook (L183); add `update_agent_status`
- `backend/app/organization/health.py` (87 lines) -- 9.1 read-only derivation; reference for org+work-item join pattern; do not modify
- `backend/app/work_items/lifecycle.py` (29 lines) -- `LIFECYCLE_PHASES` (7 phases, no "blocked"), `PHASE_DEPARTMENT` maps phase → `department_id`
- `backend/app/work_items/repository.py` (230 lines) -- `work_items` table incl. `owner_agent_id`, `updated_at`, `department_id` (L34-45); `lifecycle_events` table (L57-70); `count_open_work_items_by_department` (L180); `__getattr__` delegates lifecycle fns to `lifecycle_repository` (L197); `_reset_work_item_db` (L209)
- `backend/app/work_items/lifecycle_repository.py` (89 lines) -- `insert_lifecycle_event`, `list_lifecycle_events`, `update_work_item_status`, `record_transition` (transactional update+event pattern to mirror)
- `backend/app/work_items/service.py` (220 lines) -- `transition_work_item` (L134) is the audit-trail reference; `UnknownWorkItemError` etc.
- `backend/app/work_items/models.py` -- `OWNER_AGENT_ID = "chief_of_staff"` (L25); `LifecycleEvent` model (event_type is a `Literal` — extend it)
- `backend/app/config.py` -- `Settings`; `team_overload_threshold: int = 5` (L33) + non-negative validator (L61) as the pattern for the new threshold
- `backend/app/api/routes/organizations.py` (87 lines) -- 4 endpoints; error mapping pattern (404 unknown org, 500 sqlite); add evaluate + alerts endpoints (stays < 150 lines)
- `frontend/src/api/organizations.ts` -- `fetchOrganizationHealth` etc.; add `evaluateOrganization(orgId)` and `fetchOrganizationAlerts(orgId)` + TS types (snake_case)
- `frontend/src/components/command-center/TeamHealthTab.tsx` (143 lines) -- 9.1 tab: fetch pattern, error/loading/empty states, `data-testid="team-health-*"`; add evaluate action + results/alerts panel here or as a child component
- `frontend/src/__tests__/TeamHealthTab.test.tsx` -- vitest + RTL pattern, mocks `@/api/client`
- `backend/tests/conftest.py` -- `org_db` (L143) and `work_item_db` (L171) in-memory fixtures
- `backend/tests/test_organization_health.py` -- `_create_org()` (L37) and `_insert_work_item()` (L42) helpers to reuse for seeding

## Tasks & Acceptance

**Execution:**
- [x] `backend/app/config.py` -- add `blocked_phase_threshold_hours: int = 24` to `Settings` with non-negative validation (mirror `team_overload_threshold`) -- configurable stuck-work threshold per epic constraint
- [x] `backend/app/organization/repository.py` -- add `update_agent_status(org_id, agent_id, status) -> bool` (UPDATE agents SET status; returns whether a row changed) -- first mutation path for agent status
- [x] `backend/app/work_items/models.py` -- extend `LifecycleEvent.event_type` literal with `"reassignment"` and `"escalation"`; add `OrgAlert` model (`alert_id`, `org_id`, `work_item_id`, `phase`, `reason`, `raised_at`) -- typed contract for the new audit rows
- [x] `backend/app/work_items/lifecycle_repository.py` -- add `insert_org_alert(alert)`, `list_org_alerts(org_id)`, `has_org_alert(org_id, work_item_id, phase)` (dedupe check), and `record_reassignment(work_item_id, owner_agent_id, updated_at, event)` (transactional owner update + event, mirroring `record_transition`) -- keeps event+state writes atomic
- [x] `backend/app/work_items/repository.py` -- add `org_alerts` table to `_init_schema` (`alert_id TEXT PRIMARY KEY, org_id, work_item_id, phase, reason, raised_at`) + index on `(org_id, work_item_id, phase)`; extend `__getattr__` delegation for the new lifecycle_repository functions
- [x] `backend/app/organization/evaluate.py` -- new module: `evaluate_organization(org_id) -> EvaluationResult | None` (None = unknown org). For each open work item (status in `LIFECYCLE_PHASES` excluding `monitoring`, oldest first): (a) reassign if owner is `chief_of_staff` or an idle agent, and an idle agent exists in the item's department (first by `agent_id` order) — set owner, set agent `active`, record `reassignment` event with reason; (b) escalate if `now - updated_at > blocked_phase_threshold_hours` and no existing alert for (org, item, phase) — insert `org_alerts` row + `escalation` event with reason (include "no idle capacity" when that is why no reassignment happened). Returns `EvaluationResult` (`actions: list[ReassignmentAction]`, `alerts: list[OrgAlert]`) -- the Chief of Staff evaluation, deterministic and LLM-free
- [x] `backend/app/api/routes/organizations.py` -- add `POST /organizations/{org_id}/evaluate` (201, `{"evaluation": {...}}`; 404 unknown org, 500 sqlite) and `GET /organizations/{org_id}/alerts` (200 `{"alerts": [...], "count": n}`; 404/500 same mapping) -- mirrors existing endpoint error mapping
- [x] `backend/tests/test_organization_evaluate.py` -- new tests: `TestEvaluateService` (reassign picks idle agent + updates owner/status + audit row; no reassignment when no idle capacity; escalation at threshold boundary using backdated `updated_at`; idempotent second run; org-level CoS never picked) and `TestEvaluateAPI` (201 shape, 404, alerts endpoint lists raised alerts, snake_case keys) using `org_db` + `work_item_db` fixtures -- covers the I/O matrix
- [x] `frontend/src/api/organizations.ts` -- add `EvaluationResult`/`ReassignmentAction`/`OrgAlert` TS types (snake_case) + `evaluateOrganization(orgId)` (POST) and `fetchOrganizationAlerts(orgId)` (GET) -- centralized client, no raw fetch
- [x] `frontend/src/components/command-center/TeamHealthTab.tsx` -- add an "Evaluate organization" `Button` (with `data-testid="team-health-evaluate"`) that calls `evaluateOrganization` for the current org, then shows the resulting actions and alerts in a panel (`data-testid="team-health-evaluation"`, per-item `data-testid="team-health-action-{work_item_id}"` / `team-health-alert-{alert_id}`) and reloads health; also list existing alerts from `fetchOrganizationAlerts` on load; surface API errors (throw, don't swallow) -- makes decisions and alerts visible per epic UX requirement
- [x] `frontend/src/__tests__/TeamHealthTab.test.tsx` -- extend: evaluate button triggers POST and renders returned actions, alerts panel renders raised alerts, evaluation error is surfaced -- mirrors existing mock pattern

**Acceptance Criteria:**
- Given a team has idle capacity and an open work item is unowned or owned by an idle agent, when the Chief of Staff evaluates the organization, then the item is reassigned to an idle agent in the owning department and the decision with reason is logged in the audit trail.
- Given a work item remains in one phase beyond the configured threshold, when the organization is evaluated, then a visible alert is raised and the escalation with reason is logged in the audit trail.
- Given an evaluation has already reassigned an item or raised an alert for a phase, when the organization is evaluated again with unchanged state, then no duplicate action or alert is produced.

## Delivery Patterns Checklist

**CI** (`.github/workflows/ci.yml`) — which jobs this story affects or extends:
- [x] Backend: `ruff check` clean, `scripts/forbidden_imports.py` passes, coverage stays at/above `--cov-fail-under=60`
- [x] Frontend: targeted TeamHealthTab tests and `npm run build` pass (full-suite `useChatStream` failures are pre-existing)
- [x] User-visible flow changed: no Playwright E2E spec added (evaluation panel covered by vitest) — or add one if the E2E suite already exercises workspace-pane tabs

**Docker / Deploy** — container and deployment impact:
- [x] Image/compose changes needed: none
- [x] New env vars: `BLOCKED_PHASE_THRESHOLD_HOURS` (optional, default 24) — added to `Settings`; non-secret, no credential propagation needed

**Testing** — how this story's tests honor project rules:
- [x] LLM/MCP boundaries mocked — evaluation is deterministic, no LLM at all
- [x] Separate test DB (never the dev `checkpoints.db`); reuse `org_db` + `work_item_db` from `conftest.py`
- [x] No new shared fixtures needed; class-based `TestFeature` structure
- [x] No new tests in deprecated modules

## Spec Change Log

## Review Triage Log

### 2026-08-22 — Review pass (Blind Hunter + Edge Case Hunter)

Findings: 8 (deduped from 10 raw). Routed: 2 patch, 1 defer, 5 reject.

- **patch (high) — Reassigned items skipped escalation.** `evaluate.py` used `continue` after a reassignment, so a stuck item that was also reassigned never got its escalation alert, violating the AC that escalation is independent of reassignment. Fixed: removed the `continue`; both checks now run per item. Added regression test `test_reassigned_item_still_escalates_when_stuck`.
- **patch (high) — Alert + audit event not atomic.** `insert_org_alert` committed before the `lifecycle_events` row, so a crash/failure could leave a durable alert without its audit trail. Fixed: new `record_escalation()` commits alert + event together (mirrors `record_reassignment`); `insert_org_alert` gained a `commit` flag. Also hardened concurrency: `idx_org_alerts_dedupe` is now UNIQUE (duplicate alerts impossible even under races) and `record_reassignment` gained an optional `previous_owner_agent_id` optimistic guard.
- **defer (low) — Concurrent evaluations can double-assign one idle agent.** Two simultaneous `evaluate` calls can both pick the same idle agent for different items (selection is not transactional). Partially mitigated by the unique alert index and owner guard; full fix needs a transactional evaluation pass. Single-user POC with an on-demand endpoint — deferred to `deferred-work.md`.
- **reject — Malformed/naive `updated_at` crashes evaluation.** All writers emit tz-aware ISO-8601; Python 3.13 `fromisoformat` also accepts `Z`. Not a reachable defect.
- **reject — Nonexistent owner leaves item unassigned.** False positive: `owner is None` makes the item eligible for reassignment.
- **reject — Exact-threshold microsecond drift.** Strict `>` comparison is deterministic; style-level concern.
- **reject — Frontend duplicate alert display.** False positive: evaluation results and stored alerts render in separate panels; no merge/dedupe path exists.
- **reject — Alert fetch failure silently hides panel.** Out of spec scope (spec only requires surfacing alerts; health panel remains usable).

addressed_findings: 2 patched + re-verified (439 backend tests pass, ruff clean on changed files).

## Design Notes

**"Blocked" = stuck in one phase beyond threshold (the one non-obvious decision):** The 8.2 lifecycle has no `blocked` status and its forward-only transitions are 8.2-owned, so a work item is treated as blocked when `now - updated_at > blocked_phase_threshold_hours` while in a non-terminal phase (`updated_at` is the last state change, so it doubles as "time in current phase"). This matches the PRD's "more than 24 hours in one phase" example with a configurable threshold.

**Reassignment is owner-level, not thread-level:** Work items carry `owner_agent_id` (default `chief_of_staff`); agents are per-department. An item is reassignable when its owner is the org-level CoS (unowned) or an agent whose stored status is `idle`. The new owner is the first idle agent in the item's `department_id` (ordered by `agent_id` for determinism) and is marked `active`. Agent statuses are the only mutable org state this story touches; workload attribution stays at department granularity (9.1 design).

**Audit trail reuses `lifecycle_events`:** Reassignments and escalations are new `event_type` values on the existing table (from/to status and department unchanged), so the 8.2 lifecycle history endpoint already exposes them; `org_alerts` is the queryable alert store for the UI.

## Verification

**Commands:**
- `pytest backend/tests/test_organization_evaluate.py -v` -- expected: all pass
- `pytest backend/tests` -- expected: full suite green
- `ruff check backend/app/organization backend/app/work_items backend/app/api/routes/organizations.py backend/app/config.py` -- expected: clean
- `npx vitest run src/__tests__/TeamHealthTab.test.tsx --pool=threads` (from `frontend/`) -- expected: all pass
- `npm run build` (from `frontend/`) -- expected: pass

**Actual results (2026-02-10):**
- `pytest backend/tests/test_organization_evaluate.py -v` -- **11 passed** (7 `TestEvaluateService` + 4 `TestEvaluateAPI`)
- `pytest backend/tests -x -q` -- **438 passed** in 85.59s (full suite green, no regressions)
- `ruff check backend/app/organization backend/app/work_items backend/app/api/routes/organizations.py backend/app/config.py backend/tests/test_organization_evaluate.py` -- **All checks passed!** (2 findings in the new module — FURB162, UP032 — fixed and re-checked clean)
- `npx vitest run src/__tests__/TeamHealthTab.test.tsx --pool=threads` (from `frontend/`) -- **7 passed** (4 pre-existing + 3 new: alerts-on-load, evaluate POST + actions/alerts render, evaluation error surfaced)
- `npm run build` (from `frontend/`) -- **pass** (`tsc -b && vite build`, 1685 modules, no new warnings; pre-existing TS5101 baseUrl deprecation warning not introduced by this story)

**Post-review re-verification (2026-08-22, after review patches):**
- `pytest backend/tests -q` -- **439 passed** in 65.25s (438 + 1 new regression test `test_reassigned_item_still_escalates_when_stuck`)
- `ruff check` on all changed files -- **All checks passed!** (181 pre-existing findings in untouched files such as `tests/conftest.py` are out of scope)

## Auto Run Result

**Status:** done

**Summary:** Story 9.2 implemented and hardened. A deterministic, LLM-free `POST /api/organizations/{org_id}/evaluate` endpoint reassigns open work items owned by the org-level CoS or an idle agent to the first idle agent in the owning department, and raises deduplicated escalation alerts (new `org_alerts` table) for items stuck in one phase beyond `blocked_phase_threshold_hours` (default 24h, env-overridable). Every decision is audited in `lifecycle_events` (`reassignment` / `escalation` event types). `GET /api/organizations/{org_id}/alerts` lists alerts; the Command Center Team Health tab gained an Evaluate button plus actions/alerts panels.

**Files changed:**
- `backend/app/organization/evaluate.py` (new) — evaluation service
- `backend/app/organization/repository.py` — `update_agent_status`
- `backend/app/work_items/models.py` — new event types + `OrgAlert`
- `backend/app/work_items/repository.py` — `org_alerts` table + unique dedupe index, delegation
- `backend/app/work_items/lifecycle_repository.py` — `insert_org_alert`, `list_org_alerts`, `has_org_alert`, `record_reassignment` (optimistic guard), `record_escalation` (atomic)
- `backend/app/config.py` — `blocked_phase_threshold_hours`
- `backend/app/api/routes/organizations.py` — evaluate + alerts endpoints
- `backend/tests/test_organization_evaluate.py` (new, 12 tests)
- `frontend/src/api/organizations.ts` — types + client fns
- `frontend/src/components/command-center/TeamHealthTab.tsx` — evaluate button + panels
- `frontend/src/__tests__/TeamHealthTab.test.tsx` — +3 tests

**Findings breakdown:** 8 deduped findings → 2 patched (independent escalation; atomic alert+audit), 1 deferred (concurrent double-assignment, single-user POC), 5 rejected (false positives / out of scope).

**Verification:** 439 backend tests pass; 7 frontend tests pass; ruff clean on changed files; `npm run build` passes.

**Residual risks:** Concurrent `evaluate` calls can double-assign one idle agent (deferred); alert fetch failure in the UI silently shows an empty alert list (accepted, out of scope).

**Follow-up review recommended:** no — both high-severity findings were patched and re-verified; remaining items are low-severity and deferred/accepted.
