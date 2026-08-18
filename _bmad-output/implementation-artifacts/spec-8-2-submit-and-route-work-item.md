---
title: "8.2 Submit and Route a Work Item to the Correct Department"
type: spec
created: 2026-08-18
status: done
review_loop_iteration: 0
baseline_revision: 6434557dd465d6c6378f316e0cd54c3df8518fe0
final_revision: '18b4ddf'
followup_review_recommended: true
context: "Story 8.2, Epic 8 (Orchestration Core), Companion. Depends on 8.1 (done): app/organization package (pinned departments ideation/technology, CoS agent_id chief_of_staff), dedicated-DB-file sqlite3 pattern, /api/organizations."
warnings: ["oversized: ~1700 tokens (target 900-1600); I/O matrix and Code Map kept for actionability"]
---

<intent-contract>

## Intent

Submit a Work Item (idea/task/feature) via chat (Chief of Staff calls a `submit_work_item` tool) or via form (`POST /api/work-items`); the CoS receives it, the item is created with status `new`, owned by `chief_of_staff`, routed to a department with a persisted, explainable routing decision, and the item + decision are visible in the Command Center (Work Items tab) and retrievable via the work-items API.

## Boundaries & Constraints

### Always
- Work Item entity owned by a fresh `backend/app/work_items/` package (AD-13); persisted in a dedicated `STORAGE_DIR/work_items.sqlite` via raw sqlite3 + WAL + `threading.Lock` (AD-3, mirrors `app/organization/repository.py`).
- Routing is deterministic in the service (never in the supervisor graph): valid explicit department hint → that department, confidence `high`; missing/invalid hint → `ideation` (first lifecycle phase per PRD FR-4), confidence `low`. Routing is total — it never fails.
- Every routing decision persisted with provenance: `decided_by="chief_of_staff"`, `decided_at` (UTC ISO), `reasoning`, `confidence`, `alternatives` (other department ids).
- API snake_case, same envelope style as 8.1: `{"work_item": ...}` / `{"work_items": [...], "count": n}`.
- Tests: class-based pytest, in-memory DB via a `work_item_db` fixture mirroring `org_db`; `create_deep_agent` mocked in wiring tests; no live LLM, no Playwright specs, no new dependencies.

### Block If
- A test would need a live LLM or real network call.
- The change would modify the supervisor StateGraph, `config/teams.yaml`, or `threads.sqlite`.

### Never
- Import or restore anything from the ghost `backend/app/work_items/__pycache__` (8.1 warning); the package is authored fresh.
- Add lifecycle/status transitions beyond `new` (story 8.3 scope).
- Publish or consume SSE events for work items (live updates arrive in 8.3 per 8.1 Dev Notes §6).
- Assign work items to teams (8.3 scope — story AC says department only).

## I/O & Edge-Case Matrix

| Case | Input | Expected |
|---|---|---|
| Submit, no hint | title+description, org exists | 201; status `new`, owner `chief_of_staff`, department `ideation`, confidence `low`, reasoning names the default |
| Submit, valid hint | `department=technology` | 201; department `technology`, confidence `high`, `alternatives=["ideation"]` |
| Submit, invalid hint | `department=legal` | 201; fallback `ideation`, confidence `low`, reasoning quotes the invalid hint |
| Submit, unknown `org_id` | `org_id=xyz` | 404 `unknown organization` |
| Submit, no org exists | `org_id` omitted, 0 orgs | 404 `no organization exists` |
| Submit, blank title | `title="  "` | 400 |
| Chat submit | tool `submit_work_item(title, description, department?)` | org auto-resolved (single org, else most recently updated); returns human-readable confirmation string incl. status + department; no-org case returns an error string, never raises |
| List | `GET /api/work-items?org_id=` | newest first; 404 if `org_id` unknown |
| Get | `GET /api/work-items/{id}` | 200 with routing decision; 404 when missing |

</intent-contract>

## Code Map

| File | Action | ~Lines |
|---|---|---|
| `backend/app/work_items/models.py` | New: `RoutingDecision`, `WorkItem`, `SubmitWorkItemRequest` (Pydantic v2) | 90 |
| `backend/app/work_items/repository.py` | New: singleton conn, `work_items` + `routing_decisions` tables, insert/get/list, `_reset_work_item_db(conn=None)` hook | 150 |
| `backend/app/work_items/service.py` | New: `submit_work_item`, `list_work_items`, `get_work_item`, routing + provenance, `UnknownOrganizationError`/`NoOrganizationError`; depends on `app.organization.service` | 140 |
| `backend/app/work_items/tools.py` | New: LangChain tool `submit_work_item`, `DOMAIN_TOOLS` list | 45 |
| `backend/app/api/routes/work_items.py` | New: POST / GET list / GET by id; register in `backend/app/api/app.py` | 90 |
| `backend/app/agent/runtime.py` | Edit: `tools = (mcp_tools or []) + DOMAIN_TOOLS` in `get_deep_agent_runtime` | +3 |
| `instructions/global-agent-instructions.md` | Append "Work Item Intake (Chief of Staff)" section: call the tool when the user describes a new idea/task/feature; department guidance (ideation = concepts, technology = build/test/deploy); confirm assignment to the user | +12 |
| `backend/tests/conftest.py` | Edit: add `work_item_db` fixture (mirror `org_db`) | +20 |
| `backend/tests/test_work_items.py` | New: service, repository, API, tool, wiring tests | 200 |
| `frontend/src/api/workItems.ts` | New: types + `fetchWorkItems`, `fetchWorkItem`, `submitWorkItem`; re-export from `api/client.ts` | 70 |
| `frontend/src/components/command-center/WorkItemsTab.tsx` | New: fetch latest org's items on mount; list with status badge, department, routing decision (decided_by, confidence, reasoning, decided_at); no-org / no-items / error states | 150 |
| `frontend/src/components/command-center/CommandCenterWorkspacePane.tsx` | Edit: add "Work Items" `TabsTrigger` + `TabsContent` (~6 lines) | +6 |
| `frontend/src/components/command-center/WorkItemsTab.test.tsx` | New: vitest — renders item fields, no-org empty state, error state | 90 |

## Tasks & Acceptance

1. [x] **models.py** — create the three Pydantic models: `RoutingDecision(department_id, decided_by, decided_at, confidence, reasoning, alternatives)`; `WorkItem(work_item_id, org_id, title, description, status, owner_agent_id, source, department_id, routing, created_at, updated_at)`; `SubmitWorkItemRequest(title, description, org_id?, department?, source?)`. `WorkItem.status` is `str` (created as `"new"`); `confidence` is `Literal["high","low"]`.
2. [x] **repository.py** — schema: `work_items(work_item_id PK, org_id, title, description, status, owner_agent_id, source, created_at, updated_at)` + `routing_decisions(work_item_id PK, department_id, decided_by, decided_at, confidence, reasoning, alternatives JSON)`; index `work_items(org_id, created_at DESC)`; single-transaction insert.
3. [x] **service.py** — org resolution (explicit id → must exist; omitted → most recently updated; none → `NoOrganizationError`); deterministic routing per matrix; persist item + decision together.
4. [x] **routes/work_items.py + app.py** — implement and register the three endpoints with the 400/404 mapping from the matrix.
5. [x] **tools.py + runtime.py** — define the tool (thin wrapper over `submit_work_item`, `source="chat"`; returns confirmation string, swallows `NoOrganizationError` into an error string) and append `DOMAIN_TOOLS` to the runtime tools list.
6. [x] **global-agent-instructions.md** — append the CoS intake section (prompt-only change; `teams.yaml` untouched).
7. [x] **conftest.py** — `work_item_db` fixture: `:memory:` conn injected via `_reset_work_item_db`, reset singleton on teardown.
8. [x] **test_work_items.py** — one test per matrix row (service level with `org_db` + `work_item_db`; API level via TestClient with both fixtures; tool level calls the tool function directly; wiring test mocks `create_deep_agent` like `test_skills_wiring.py` and asserts `tools` includes a tool named `submit_work_item`).
9. [x] **workItems.ts + client.ts** — API client following `api/organizations.ts` patterns.
10. [x] **WorkItemsTab.tsx + CommandCenterWorkspacePane.tsx** — build the tab; resolve the org with the same rule as `pages/Organization.tsx` (most recently updated); `data-testid`s: `work-items-tab`, `work-item-row`, `work-item-status`, `work-item-routing`, `work-items-empty`, `work-items-error`.
11. [x] **WorkItemsTab.test.tsx** — vitest with mocked `fetch`.

**Acceptance criteria** (story + PRD FR-3):
- AC-1: Given a work item is submitted via `POST /api/work-items` with a goal and an existing org, when the request is processed, then it is created with status `new`, owner `chief_of_staff`, routed to a department, and 201 returns the item including the routing decision.
- AC-2: Given a submitted work item, when the user opens the Command Center Work Items tab, then the item is visible with its status and owning department.
- AC-3: Given a routing decision (any of the matrix rows), when it is inspected in the Work Items feed or `GET /api/work-items/{id}`, then it shows `decided_by`, `decided_at`, `confidence`, `reasoning`, and `alternatives` — the decision is explainable.
- AC-4: Given the user describes a new work item in chat, when the CoS agent (general team) receives it, then the `submit_work_item` tool is registered on the agent and calling it creates and routes the item, returning a confirmation; the CoS intake instructions are present in `global-agent-instructions.md`.
- AC-5: Given invalid submissions (unknown org, no org, blank title), when submitted, then the API returns the matrix errors without creating data.

## Delivery Patterns

- **CI**: `ruff check backend/app` (100-char), `python scripts/forbidden_imports.py` (no new forbidden imports — `app.work_items` is clean), full pytest + vitest green.
- **Testing**: in-memory DB fixtures; `create_deep_agent` mocked in wiring test; tool tested by direct invocation; no live model (NFR-A10); no Playwright specs in this story — e2e follow-up tracked in issue #60 (org dashboard e2e: #54; shared prerequisite: extend `POST /api/testing/reset` to clear organizations/work_items storage).
- **Docker**: no new runtime dependencies (`langchain_core.tools` ships with the existing deepagents/langgraph stack); new storage file `work_items.sqlite` lands in the existing `STORAGE_DIR` volume.

## Spec Change Log
- 2026-08-18: initial draft from step-02 investigation.
- 2026-08-18: story closed — PR #59 merged to develop (merge commit `032ddc1`); all gates green at merge (303 backend / 190 frontend tests, ruff, tsc). E2E follow-up (Playwright spec for submit & route) tracked as issue #60; org dashboard e2e as #54; shared prerequisite: extend `POST /api/testing/reset` to clear organizations/work_items storage.
- Implementation deviation: the mandated `general-purpose` implementation subagent failed twice on this machine ("Unable to access the repository tooling in this session" — systematic environment failure), so the parent session implemented the spec directly instead.
- Out-of-scope fix (required for a fully green `python -m pytest backend/tests`): pre-existing test-isolation flake fixed in `backend/tests/test_chat_endpoint.py`, `backend/tests/test_api_performance.py`, and `backend/tests/test_runtime.py` — bare `del sys.modules[mod]` purges replaced with `monkeypatch.delitem(sys.modules, mod, raising=False)` so `app.config` and cached `app.agent.runtime` references are restored after each test.

## Review Triage Log
### 2026-08-18 — Review pass
- intent_gap: 0
- bad_spec: 0
- patch: 10: (high 1high, medium 2medium, low 7low)
- defer: 2
- reject: 4
- addressed_findings:
  - `[high]` `[patch]` 7 service/tool tests bypassed the `work_item_db` fixture and wrote to the real `storage/work_items.sqlite` (reviewer confirmed 7 junk rows). Added the fixture to all 7 tests and deleted the polluted storage file.
  - `[medium]` `[patch]` "no organization" tests isolated only the work-item DB, so they read real organization storage (machine-dependent results). Added the `org_db` fixture.
  - `[medium]` `[patch]` WorkItemsTab row omitted the spec-required `decided_by` and `decided_at` fields (spec task 10 lists all four routing fields). Row now renders both.
  - `[low]` `[patch]` New runtime-wiring test used bare `del sys.modules` — the same anti-pattern this story fixes elsewhere. Switched to `monkeypatch.delitem(sys.modules, mod, raising=False)`.
  - `[low]` `[patch]` Service accepted blank/whitespace titles (chat path could persist an empty-title item). `submit_work_item` now raises `ValueError`; tool returns an error string; added service and tool tests.
  - `[low]` `[patch]` List ordering tie-broke on random UUID4, making equal-timestamp order nondeterministic. Both `ORDER BY` clauses now tie-break on `rowid DESC`.
  - `[low]` `[patch]` Tool caught only `NoOrganizationError`, so ValueError/RuntimeError/sqlite3.Error/OrganizationIntegrityError crashed the agent turn. Broadened the except clause to return an error string for the whole failure family.
  - `[low]` `[patch]` List route resolved the organization outside the try, so `OrganizationIntegrityError` escaped as a raw 500. Moved inside the try and added it to the caught exceptions.
  - `[low]` `[patch]` POST description was unbounded. Added a 5000-character cap mapped to 400, consistent with the existing title cap.
  - `[low]` `[patch]` `fetchWorkItems` assumed the `work_items` key exists and could throw a TypeError on a missing key. Now returns `data.work_items ?? []`.

## Verification

```bash
python -m pytest backend/tests            # all green (279 baseline + new)
ruff check backend/app
python scripts/forbidden_imports.py
cd frontend && npm run test               # 186 baseline + new
cd frontend && npx tsc --noEmit
```

## Auto Run Result

**Status: done**

### Summary
Story 8.2 implemented end to end: a work-item domain where every submitted item (API or chat) is received by the Chief of Staff, created with status `new` and `chief_of_staff` ownership, and routed deterministically — an explicit department hint that matches a real department wins with high confidence; anything else falls back to the first lifecycle-phase department (ideation) with low confidence. The decision is persisted with full provenance (decided_by, decided_at, confidence, reasoning, alternatives) in a dedicated `storage/work_items.sqlite` file, and the Command Center pane exposes a Work Items tab showing each item's routing decision.

### Files changed
- `backend/app/work_items/models.py` (new) — WorkItem, RoutingDecision, SubmitWorkItemRequest pydantic models + status/owner constants
- `backend/app/work_items/repository.py` (new) — dedicated work_items.sqlite repository mirroring the organization pattern (single-transaction insert, routing map, deterministic `rowid` tie-break)
- `backend/app/work_items/service.py` (new) — deterministic routing service; rejects blank titles; org resolution (explicit id 404, none 404)
- `backend/app/work_items/tools.py` (new) — `submit_work_item` LangChain tool in `DOMAIN_TOOLS`; returns error strings for the whole failure family, never raises into the agent turn
- `backend/app/api/routes/work_items.py` (new) — POST /api/work-items, GET list, GET by id; 400 (blank/over-long title, over-long description), 404 (unknown org, missing item), 500 (storage)
- `backend/tests/test_work_items.py` (new) — 25 tests: service, routing, listing, API, tool, runtime wiring (all storage-isolated)
- `frontend/src/api/workItems.ts` (new) — typed API client: submitWorkItem, fetchWorkItems (`?? []` guarded), fetchWorkItem
- `frontend/src/components/command-center/WorkItemsTab.tsx` (new) — Work Items tab UI with error/loading/no-org/no-items/list states
- `frontend/src/components/command-center/WorkItemsTab.test.tsx` (new) — 4 component tests (no org, loading→list, routing fields, error state)
- `_bmad-output/implementation-artifacts/epic-8-context.md` (new) — Epic 8 context document
- `backend/app/api/app.py` — register the work-items router
- `backend/app/agent/runtime.py` — append `DOMAIN_TOOLS` to the runtime tool list
- `backend/tests/conftest.py` — `work_item_db` in-memory isolation fixture (mirrors `org_db`)
- `backend/tests/test_chat_endpoint.py`, `backend/tests/test_api_performance.py`, `backend/tests/test_runtime.py` — fix pre-existing test-isolation flake (bare `del sys.modules` → `monkeypatch.delitem`)
- `frontend/src/api/client.ts` — export the workItems module
- `frontend/src/components/command-center/CommandCenterWorkspacePane.tsx` — Work Items tab trigger + content pane
- `instructions/global-agent-instructions.md` — CoS work-item intake section

### Review findings breakdown
- **Patched: 10** (1 high, 2 medium, 7 low) — high: 7 tests bypassed storage isolation and polluted the real `storage/work_items.sqlite` (file deleted, fixtures added); medium: no-org tests reading real org storage (fixture added) and WorkItemsTab omitting the spec-required `decided_by`/`decided_at` (rendered); low: bare `del sys.modules` in the new wiring test, blank-title acceptance in the service (now ValueError, tested at service and tool level), nondeterministic equal-timestamp ordering (`rowid DESC`), tool catching only `NoOrganizationError` (broadened), list-route org resolution outside the try (moved in), unbounded POST description (5000-char cap → 400), and `fetchWorkItems` TypeError risk (`?? []`).
- **Deferred: 2** — DOMAIN_TOOLS + CoS intake instructions are not team-scoped (latent until a second team exists; spec Block-If forbids teams.yaml changes); `_routing_map` `IN (...)` placeholder list exceeds the SQLite variable limit at ~999 items per org (fix with pagination in Epic 12).
- **Rejected: 4** — empty-department org IndexError (unreachable in v1; org creation always seeds 2 departments), out-of-order in-flight loads (not constructible — Retry only follows a completed failure), missing fetch timeout (mandated mirror of the organizations.ts pattern; whole-frontend concern), shared-connection lock granularity (exact mandated mirror of the organization repository pattern; verified identical).

### Follow-up review recommendation
`true` — the single review pass produced 10 patched findings including a high-severity storage-pollution defect and two medium spec-conformance gaps, touching API contracts (new 400 validations), the agent tool error contract, and test infrastructure.

### Verification performed
- `python -m pytest backend/tests` → 303 passed (278 baseline + 25 new)
- `python -m ruff check backend/app` → All checks passed
- `python scripts/forbidden_imports.py` → PASS
- `cd frontend && npm run test` → 17 files / 190 tests passed (186 baseline + 4 new). First post-patch full run had 4 pre-existing test files drop to "Failed to start forks worker" timeouts under machine load (zero test failures); those 4 files were re-run and passed 28/28, and WorkItemsTab.test.tsx passed 4/4 in isolation.
- `cd frontend && npx tsc --noEmit` → clean

### Residual risks
- DOMAIN_TOOLS and the CoS intake instruction section apply to every future agent team, not just the CoS/general team; latent today (single team) — deferred with a ledger entry.
- `GET /api/work-items` will 500 for a single org exceeding ~999 work items (SQLite variable limit in the routing `IN` clause) — deferred; chunk or JOIN when list pagination ships.
- The polluted `storage/work_items.sqlite` created by pre-review tests was deleted; all 25 work-item tests now use in-memory isolation, so the file will not be recreated by the test suite.
