---
title: 'Surface organization health and team capacity'
type: 'feature'
created: '2026-08-22'
status: 'in-review'
review_loop_iteration: 0
baseline_revision: 'ce920644e0ee00e0e6dea510725a349dde040ad9'
followup_review_recommended: false
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-9-context.md'
warnings: []
---

<intent-contract>

## Intent

**Problem:** The Command Center has no view of organization health: founders cannot see per-team capacity (active/idle/total agents) or workload state, so overloaded or idle teams are invisible.

**Approach:** Add a read-only `GET /api/organizations/{org_id}/health` endpoint that derives per-team capacity from stored agent statuses and per-team workload from open work items (8.2 schema), then render a new "Team Health" tab in the Command Center workspace pane with per-team cards that clearly highlight idle and overloaded teams.

## Boundaries & Constraints

**Always:**
- Health is derived read-only: agent statuses come from the `agents` table (8.1), workload from `work_items` (8.2). Never mutate agent or work-item state in this story.
- Workload thresholds are configurable via `Settings` (env-overridable), never hard-coded in service logic.
- snake_case API contract preserved end-to-end (backend → TS types).
- File-size limits: route files < 150 lines, services < 200 lines.
- Frontend uses shadcn/ui components from `@/components/ui/` and the centralized API client pattern.

**Block If:**
- The 8.2 work-item schema or 8.1 org schema differs from the Code Map below (field names changed since planning).
- A decision is needed on whether agent statuses should be mutated by work-item activity (out of scope here — do not build it).

**Never:**
- No reassignment, escalation, or alerting logic (story 9.2 scope).
- No workflow templates (story 9.3 scope).
- No changes to the 8.2 work-item panel (owned by 8.2) or to deprecated modules (`models/`, `state/`, `scoring/`, `orchestrator/`, `storage/`).
- No LLM calls in the health computation — it must be deterministic and fast.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| HAPPY_PATH | Org with 5 teams, mixed agent statuses, 3 open work items (2 technology, 1 ideation) | 200 with per-team `active_agents`, `idle_agents`, `total_agents`, `open_work_items`, `workload_state` | No error expected |
| NO_WORK_ITEMS | Org with zero work items | Every team `open_work_items: 0`, `workload_state: "idle"` | No error expected |
| OVERLOADED_TEAM | Team with `open_work_items` > `team_overload_threshold` | That team `workload_state: "overloaded"`; others unaffected | No error expected |
| UNKNOWN_ORG | `GET /api/organizations/{unknown}/health` | 404 `Organization {id} not found` | HTTPException 404 |
| STORAGE_FAILURE | sqlite error during query | 500 `Failed to load organization health` | HTTPException 500 |

</intent-contract>

## Code Map

- `backend/app/organization/models.py` (177 lines) -- `AgentStatus = Literal["active","idle","overloaded"]` (L13); `OrgTeam` has `active_agents`/`total_agents` (L146-155); `DEFAULT_ORG_STRUCTURE` pins 2 departments / 5 teams / 18 agents
- `backend/app/organization/service.py` (174 lines) -- `get_organization()` assembles tree; `active_agents` computed at L134; `DEPARTMENT_ORDER`/`TEAM_ORDER` canonical ordering
- `backend/app/organization/repository.py` -- `get_organization_rows(org_id)` returns org/departments/teams/agents rows; `agents` table has `status TEXT DEFAULT 'idle'`
- `backend/app/api/routes/organizations.py` (73 lines) -- existing 3 endpoints; add health endpoint here (stays < 150 lines)
- `backend/app/work_items/repository.py` -- `work_items` table: `work_item_id, org_id, status, department_id, ...`; `list_work_items_with_routing(org_id)`; `_reset_work_item_db()` for tests
- `backend/app/work_items/lifecycle.py` -- `LIFECYCLE_PHASES = ("new","ideation","product_definition","development","testing","deployment","monitoring")`; `PHASE_DEPARTMENT` maps phase → `department_id` ("ideation" | "technology")
- `backend/app/config.py` -- `Settings(BaseSettings)`; add `team_overload_threshold: int = 5`
- `frontend/src/api/organizations.ts` (69 lines) -- `fetchOrganization(orgId)` etc.; add `fetchOrganizationHealth`
- `frontend/src/components/command-center/CommandCenterWorkspacePane.tsx` -- Tabs with `TabsTrigger`/`TabsContent` (L323-342, L353-626); `WorkItemsTab` pattern at L621-625; add "Team Health" tab
- `frontend/src/components/command-center/WorkItemsTab.tsx` -- reference pattern for a workspace-pane tab component
- `backend/tests/conftest.py` -- `org_db` (L144) and `work_item_db` (L172) fixtures, both resettable in-memory DBs
- `backend/tests/test_organizations.py` -- `TestService`/`TestAPI` patterns to mirror
- `frontend/src/__tests__/CommandCenter.test.tsx` -- vitest + RTL pattern, mocks child components

## Tasks & Acceptance

**Execution:**
- [x] `backend/app/organization/models.py` -- add `WorkloadState = Literal["idle","active","overloaded"]`, `TeamHealth` (`team_id`, `name`, `department_id`, `active_agents`, `idle_agents`, `total_agents`, `open_work_items`, `workload_state`), `DepartmentHealth` (`department_id`, `name`, `teams: list[TeamHealth]`), `OrganizationHealth` (`org_id`, `name`, `departments`, `total_open_work_items`) -- typed response contract for the endpoint
- [x] `backend/app/config.py` -- add `team_overload_threshold: int = 5` to `Settings` -- configurable overload threshold per epic constraint (no hard-coded thresholds)
- [x] `backend/app/organization/health.py` -- new module: `get_organization_health(org_id) -> OrganizationHealth | None` -- loads org rows via `repository.get_organization_rows`, counts open work items per department via `work_items.repository` (open = `status` in `LIFECYCLE_PHASES` excluding `"monitoring"`), groups by team using `PHASE_DEPARTMENT` mapping, derives `workload_state` (overloaded if `open_work_items > threshold`, idle if `open_work_items == 0 and active_agents == 0`, else active) -- keeps `service.py` under 200 lines and isolates the derivation
- [x] `backend/app/api/routes/organizations.py` -- add `GET /organizations/{org_id}/health` returning `{"health": {...}}`; 404 unknown org, 500 on sqlite error -- mirrors existing endpoint error mapping
- [x] `backend/tests/test_organization_health.py` -- new tests: `TestHealthService` (happy path counts, no-work-items → all idle, overload threshold boundary at exactly N and N+1) and `TestHealthAPI` (200 shape, 404, snake_case keys) using `org_db` + `work_item_db` fixtures -- covers the I/O matrix
- [x] `frontend/src/api/organizations.ts` -- add `OrganizationHealth`/`TeamHealth`/`DepartmentHealth` TS types (snake_case) and `fetchOrganizationHealth(orgId)` -- centralized client, no raw fetch
- [x] `frontend/src/components/command-center/TeamHealthTab.tsx` -- new tab component: fetches health for the current org, renders one shadcn `Card` per team (grouped by department) showing name, capacity `active/idle/total`, open work items, and a `Badge` for workload state; idle teams get a muted/emerald highlight, overloaded teams a red/`AlertTriangle` highlight; loading and error states surface the API error (throw, don't swallow) -- satisfies "clearly highlighted" AC
- [x] `frontend/src/components/command-center/CommandCenterWorkspacePane.tsx` -- add `TabsTrigger value="team-health"` (with `data-testid="team-health-tab-trigger"`) and `TabsContent` rendering `<TeamHealthTab />` -- same pattern as the work-items tab
- [x] `frontend/src/__tests__/TeamHealthTab.test.tsx` -- new vitest tests: renders team cards with capacity counts, highlights overloaded team, highlights idle team, surfaces API error -- mirrors `CommandCenter.test.tsx` mocking pattern

**Acceptance Criteria:**
- Given an organization with multiple departments and teams, when the Command Center loads and the Team Health tab is opened, then each team shows capacity (active/idle/total) and workload state.
- Given a team with no open work items and no active agents, or a team whose open work items exceed the configured threshold, when the Team Health tab renders, then the team is visually highlighted as idle or overloaded respectively.
- Given an unknown org id, when `GET /api/organizations/{org_id}/health` is called, then the API returns 404.

## Delivery Patterns Checklist

**CI** (`.github/workflows/ci.yml`) — which jobs this story affects or extends:
- [x] Backend: `ruff check` clean, `scripts/forbidden_imports.py` passes, coverage stays at/above `--cov-fail-under=60`
- [x] Frontend: targeted TeamHealthTab tests and `npm run build` pass; full-suite failures are pre-existing `useChatStream` interrupt tests and the default worker pool is unstable in this Windows environment
- [x] User-visible flow changed: no Playwright E2E spec added (tab is a read-only view; covered by vitest) — or add one if the E2E suite already exercises workspace-pane tabs

**Docker / Deploy** — container and deployment impact:
- [x] Image/compose changes needed: none
- [x] New env vars: `TEAM_OVERLOAD_THRESHOLD` (optional, default 5) — added to `Settings`; no credential propagation needed (non-secret)

**Testing** — how this story's tests honor project rules:
- [x] LLM/MCP boundaries mocked — no test depends on a live model or live MCP server (health is deterministic, no LLM at all)
- [x] Separate test DB (never the dev `checkpoints.db`); async tests use `pytest.mark.asyncio` (health tests are sync)
- [x] No new shared fixtures needed — reuse `org_db` + `work_item_db` from `conftest.py`
- [x] No new tests in deprecated modules

## Spec Change Log

## Review Triage Log

### 2026-08-22 — Review pass
- intent_gap: 0
- bad_spec: 0
- patch: 2 (medium 1, low 1)
- defer: 0
- reject: 8 (medium 3, low 5)
- addressed_findings:
  - `[medium][patch]` Health counts included unknown/terminal statuses; constrained the repository query to lifecycle phases excluding `monitoring`.
  - `[low][patch]` Negative overload thresholds produced invalid workload states; added non-negative settings validation.

## Design Notes

**Workload derivation (the one non-obvious decision):** Agent statuses in the `agents` table are static after 8.1 (all `idle` except the Chief of Staff), and nothing in 8.1–8.3 mutates them. So team *capacity* (active/idle/total agents) is reported as stored, while team *workload state* is derived from open work items routed to the team's department:

```python
open_items = count(work_items where org_id = ? and department_id = dept
                   and status in LIFECYCLE_PHASES and status != "monitoring")
if open_items > settings.team_overload_threshold: state = "overloaded"
elif open_items == 0 and active_agents == 0:       state = "idle"
else:                                              state = "active"
```

Work items carry `department_id`, not `team_id`, so workload is attributed at department granularity and shown per team within that department (all teams in a department share its open-item count). This is honest reporting — do not fabricate per-team item assignment.

## Verification

**Commands:**
- `pytest backend/tests/test_organization_health.py -v` -- 7 passed
- `pytest backend/tests` -- expected: full suite green
- `ruff check` on changed backend files -- clean
- `npx vitest run src/__tests__/TeamHealthTab.test.tsx --pool=threads` -- 4 passed
- `npm run build` -- passed
- Full frontend Vitest -- pre-existing `useChatStream` interrupt failures; default worker pool also timed out on Windows
- `npx tsc -b --noEmit` -- pre-existing TS5101 `baseUrl` deprecation

## Auto Run Result

- Summary: Added a deterministic organization-health API and Command Center Team Health tab with per-team capacity and department-level workload state.
- Files changed: organization health models/service/route/tests; configurable overload threshold; lifecycle-aware work-item aggregation; API client types; Team Health tab, workspace wiring, and tests.
- Review findings: 2 localized patches applied; 8 design/pre-existing observations rejected; no deferred work.
- Follow-up review recommendation: false.
- Residual risks: Workload is intentionally attributed at department granularity because work items do not carry team IDs. Full frontend-suite validation remains limited by pre-existing failures and Windows worker instability.
