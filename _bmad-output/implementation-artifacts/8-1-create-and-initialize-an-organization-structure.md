---
baseline_commit: 7ac13491871fccc12723254c3d80a481b75e9a70
---

# Story 8.1: Create and Initialize an Organization Structure

Status: review

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a **founder**,
I want to **create an organization with the default departments and teams**,
so that **I can begin running AI work immediately**.

## Acceptance Criteria

1. **Given** an authenticated user requests a new organization with a name and description,
   **when** the system creates it,
   **then** the organization is persisted and the API returns `201` with the full default structure (Chief of Staff, all Departments, Teams, and Agents) in the response body.
2. **Given** the organization is created,
   **when** the default structure is initialized,
   **then** a Chief of Staff, the Ideation Department (Chief + Idea Team + Product Team), and the Technology Department (Chief + Development Team + Testing Team + DevOps Team) all exist, each team with a captain and its agents, exactly matching the pinned default structure in Dev Notes §2.
3. **Given** the organization is created,
   **when** its state is read back (API or dashboard),
   **then** the Chief of Staff agent status is `active` and all other departments/teams/agents carry a valid status from the vocabulary `{active, idle, overloaded}`.
4. **Given** an organization exists,
   **when** the user opens the Command Center organization dashboard,
   **then** the dashboard is populated with the new org state: org name/description, Chief of Staff, Department cards (name, chief, status), Team cards (name, captain, status, capacity `active agents / total agents`), and the agent list per team — with no manual refresh or mock data.
5. **Given** an organization with the full default structure (18 agents, 5 teams, 2 departments),
   **when** the dashboard loads it,
   **then** the org state is fetched with a single API call and renders within 2 seconds (NFR1).
6. **Given** an unknown `org_id`,
   **when** it is requested,
   **then** the API returns `404`; given a missing/blank name on create, **when** submitted, **then** the API returns `400` with a detail message.
7. **Given** the change is deployed,
   **when** the existing test suites run,
   **then** chat/threads, ideas, config, SSE, supervisor and team-factory tests all remain green (no regressions).

## Tasks / Subtasks

**Part 8.1a — Organization data model + API (backend)**

- [x] Task 1 (AC: #1, #2): Create organization domain models + pinned default structure
  - [x] 1.1 `backend/app/organization/__init__.py` — package exports
  - [x] 1.2 `backend/app/organization/models.py` — Pydantic v2 tree models (`OrgAgent`, `OrgTeam`, `OrgDepartment`, `Organization`), `CreateOrganizationRequest`, status vocabulary, and `DEFAULT_ORG_STRUCTURE` constant exactly per Dev Notes §2
- [x] Task 2 (AC: #1): Create SQLite repository
  - [x] 2.1 `backend/app/organization/repository.py` — singleton connection to `storage/organizations.sqlite` (WAL), `_init_schema()`, insert/read functions per Dev Notes §5, plus `_reset_organization_db()` test hook
- [x] Task 3 (AC: #1, #2, #3): Create organization service
  - [x] 3.1 `backend/app/organization/service.py` — `create_organization(name, description)`, `get_organization(org_id)`, `list_organizations()`; applies `DEFAULT_ORG_STRUCTURE` on create; builds the API tree with `active_agents`/`total_agents`
- [x] Task 4 (AC: #1, #4, #6): Create API routes
  - [x] 4.1 `backend/app/api/routes/organizations.py` — `POST /api/organizations`, `GET /api/organizations`, `GET /api/organizations/{org_id}` (contract in Dev Notes §4)
  - [x] 4.2 `backend/app/api/app.py` (UPDATE) — register the new router alongside existing routers
- [x] Task 5 (AC: #1, #2, #3, #6): Backend tests
  - [x] 5.1 `backend/tests/conftest.py` (UPDATE) — add `org_db` in-memory fixture following the `in_memory_db` pattern
  - [x] 5.2 `backend/tests/test_organizations.py` — class-based tests: structure completeness (2 depts / 5 teams / 18 agents), persistence round-trip, API 201/404/400, name validation

**Part 8.1b — Command Center population (frontend)**

- [x] Task 6 (AC: #4, #5): Create organization API module
  - [x] 6.1 `frontend/src/api/organizations.ts` — typed client per Dev Notes §4 (snake_case types)
  - [x] 6.2 `frontend/src/api/client.ts` (UPDATE) — barrel re-export
- [x] Task 7 (AC: #4, #5): Create organization dashboard page
  - [x] 7.1 `frontend/src/pages/Organization.tsx` — empty state with create form (name + description), org overview (CoS card, department/team cards with status badges and capacity, agent lists), loading skeleton, error toast
- [x] Task 8 (AC: #4): Wire routing + navigation
  - [x] 8.1 `frontend/src/App.tsx` (UPDATE) — lazy route `/organization`
  - [x] 8.2 `frontend/src/components/app-sidebar.tsx` (UPDATE) — `navMain` entry "Organization" (`Building2` lucide icon)
- [x] Task 9 (AC: #4, #7): Frontend tests
  - [x] 9.1 `frontend/src/__tests__/Organization.test.tsx` — empty state, create (mocked API), populated tree render (departments, teams, capacity, CoS `active` badge), 404 error state

## Dev Notes

### 1. Architecture invariants (MUST follow)

- **AD-3 — SQLite is the sole persistence backend.** Follow the *implemented* pattern in `backend/app/services/thread_manager.py`: raw `sqlite3`, `PRAGMA journal_mode=WAL`, module-level singleton connection, `CREATE TABLE IF NOT EXISTS` on first access. **Do NOT add SQLAlchemy** — it is not in `backend/requirements.txt`; the spine's "SQLAlchemy" wording was never implemented (thread metadata uses raw sqlite3 today). **Use a dedicated DB file** `STORAGE_DIR/organizations.sqlite` — do NOT write org rows into `threads.sqlite` (that file belongs to the single global `SqliteSaver` checkpointer; a second connection to the same file risks `database is locked`).
- **AD-13 — canonical entity ownership:** `organization` is not yet in the spine's ownership table. This story establishes it: owner = `backend/app/organization/` (new package), storage = `storage/organizations.sqlite`. Flag this in the PR description so the architect can add it to the spine table.
- **AD-7 / AD-14 — do NOT modify `config/teams.yaml` in this story.** The default org structure is a fixed code constant + DB rows (v1 non-goal: no custom org design). The supervisor today routes only to the `general` team; wiring org teams into LangGraph team subgraphs is a later Epic 8 story (8.2+). Modifying teams.yaml here risks `test_supervisor.py` / `test_team_factory.py` regressions for zero story value.
- **AD-12 — forbidden imports (CI runs `python scripts/forbidden_imports.py` over `backend/app`, `backend/tests`, `scripts`).** Never import: `app.state`, `app.scoring`, `app.research`, `app.scheduler`, `app.orchestrator.workflow*` / `WorkflowOrchestrator`, `app.llm.execution_support`, `app.llm.subagent_executor`, `app.application.queries.workflow_status`, `transitions`, `apscheduler`.
- **GHOST MODULE — `backend/app/work_items/` contains ONLY `__pycache__`** (compiled `models`/`repository`/`service`; sources were never committed and have no git history). Do NOT import `app.work_items.*`, do NOT "restore" those compiled artifacts, do NOT treat them as prior art. Work items are delivered fresh in story 8.3.
- `backend/app/application/queries/workflow_status.py` is a dead module — do not import it.
- **No new dependencies** (backend or frontend). Everything needed is already pinned: FastAPI 0.115.x, Pydantic 2.x, React 18.3, Vite 5.4, TS 5.5 strict, Tailwind 3.4, shadcn/ui.

### 2. Pinned default org structure (FR-1 — exact)

The PRD does not name individual agents; the following is the product assumption pinned by this story (names/roles derived from PRD glossary team functions). Implement as `DEFAULT_ORG_STRUCTURE` in `models.py`. IDs are org-scoped slugs.

- **Chief of Staff** (org-level, `team_id` NULL, status `active`) — `chief_of_staff` / "Chief of Staff" / role `chief_of_staff`
- **Department `ideation`** — "Ideation", status `active`
  - Chief: `chief_ideation` / "Chief of Ideation" / role `department_chief` (dept `ideation`, team NULL, status `idle`)
  - **Team `idea-team`** — "Idea Team", status `idle`, captain `idea_captain` / "Idea Captain" / role `team_captain` (status `idle`)
    - `market_research_analyst` / "Market Research Analyst" / role `specialist`
    - `novelty_validator` / "Novelty Validator" / role `specialist`
  - **Team `product-team`** — "Product Team", status `idle`, captain `product_captain` / "Product Captain" / role `team_captain`
    - `requirements_analyst` / "Requirements Analyst" / role `specialist`
    - `roadmap_planner` / "Roadmap Planner" / role `specialist`
- **Department `technology`** — "Technology", status `active`
  - Chief: `chief_technology` / "Chief of Technology" / role `department_chief` (dept `technology`, team NULL, status `idle`)
  - **Team `development-team`** — "Development Team", status `idle`, captain `dev_captain` / "Development Captain" / role `team_captain`
    - `frontend_engineer` / "Frontend Engineer" / role `specialist`
    - `backend_engineer` / "Backend Engineer" / role `specialist`
  - **Team `testing-team`** — "Testing Team", status `idle`, captain `qa_captain` / "QA Captain" / role `team_captain`
    - `test_engineer` / "Test Engineer" / role `specialist`
    - `quality_analyst` / "Quality Analyst" / role `specialist`
  - **Team `devops-team`** — "DevOps Team", status `idle`, captain `devops_captain` / "DevOps Captain" / role `team_captain`
    - `deployment_engineer` / "Deployment Engineer" / role `specialist`
    - `infrastructure_monitor` / "Infrastructure Monitor" / role `specialist`

Totals: **2 departments, 5 teams, 18 agents** (1 CoS + 2 chiefs + 5 captains + 10 specialists). Status vocabulary everywhere: `{active, idle, overloaded}`.

### 3. Route pattern to copy

Mirror `backend/app/api/routes/ideas.py`: `router = APIRouter(prefix="/api", tags=["organizations"])`, thin async route functions, Pydantic request models, `datetime.now(UTC).isoformat()` timestamps, `HTTPException(404/400, detail=...)`. Register in `backend/app/api/app.py` exactly like the other routers (import + `app.include_router`). Routes file must stay **< 150 lines**, service **< 200 lines** (project rule). No auth middleware exists in v1 — "authenticated user" means the single local user; match existing routes (no auth added).

### 4. API contract (snake_case — preserved 1:1 in TS types)

```
POST /api/organizations          body {"name": str(1..200, non-blank after strip), "description": str(default "")}
                                 → 201 {"organization": OrgTree}        (400 if name blank)
GET  /api/organizations          → {"organizations": [OrgSummary...], "count": int}
GET  /api/organizations/{org_id} → 200 {"organization": OrgTree}        (404 if unknown)
```

```jsonc
// OrgTree
{
  "org_id": "<uuid4>", "name": "string", "description": "string",
  "created_at": "ISO-8601", "updated_at": "ISO-8601",
  "chief_of_staff": { "agent_id": "chief_of_staff", "name": "Chief of Staff", "role": "chief_of_staff", "status": "active" },
  "departments": [
    {
      "department_id": "ideation", "name": "Ideation", "status": "active",
      "chief": { "agent_id": "chief_ideation", "name": "Chief of Ideation", "role": "department_chief", "status": "idle" },
      "teams": [
        {
          "team_id": "idea-team", "name": "Idea Team", "status": "idle",
          "captain": { "agent_id": "idea_captain", "name": "Idea Captain", "role": "team_captain", "status": "idle" },
          "agents": [ { "agent_id": "...", "name": "...", "role": "...", "status": "..." } ],
          "active_agents": 0, "total_agents": 3
        }
      ]
    }
  ]
}
// OrgSummary (list endpoint): org_id, name, description, created_at, updated_at, department_count, team_count, agent_count
```

- `active_agents` = count of team agents with status `active`; `total_agents` includes the captain (implements FR-2 "capacity (active agents / total agents)"). At creation only the CoS is `active`.
- `agents[]` in a team includes the captain as first entry.
- No DELETE/UPDATE endpoints in this story (org lifecycle management is out of scope — FR-1 is create-only).

### 5. Database schema (`storage/organizations.sqlite`)

Match codebase simplicity (thread metadata table has no FK constraints — enforce integrity in the service, not the DB):

```sql
CREATE TABLE IF NOT EXISTS organizations (
  org_id TEXT PRIMARY KEY, name TEXT NOT NULL, description TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS departments (
  org_id TEXT NOT NULL, department_id TEXT NOT NULL, name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'idle', PRIMARY KEY (org_id, department_id)
);
CREATE TABLE IF NOT EXISTS teams (
  org_id TEXT NOT NULL, department_id TEXT NOT NULL, team_id TEXT NOT NULL, name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'idle', PRIMARY KEY (org_id, department_id, team_id)
);
CREATE TABLE IF NOT EXISTS agents (
  org_id TEXT NOT NULL, department_id TEXT, team_id TEXT, agent_id TEXT NOT NULL,
  name TEXT NOT NULL, role TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'idle',
  PRIMARY KEY (org_id, agent_id)
);
```

`org_id` = `str(uuid.uuid4())` (generate with an `asyncio.Lock` guard if you add uniqueness checks, per the `_idea_id_lock` pattern in `ideas.py`). Timestamps: `datetime.now(UTC).isoformat()`.

### 6. Frontend pattern notes

- **API module**: copy the convention of `frontend/src/api/ideas.ts` — its own local `request<T>` helper with `API_BASE = '/api'`, typed interfaces with snake_case fields (`OrgAgent`, `OrgTeam`, `OrgDepartment`, `Organization`, `OrganizationSummary`), functions `createOrganization(name, description)`, `fetchOrganizations()`, `fetchOrganization(orgId)`. Re-export from `frontend/src/api/client.ts` barrel.
- **Page**: `frontend/src/pages/Organization.tsx`, lazy-loaded in `App.tsx` like `Dashboard`. Behavior: on mount `fetchOrganizations()`; zero orgs → empty state with create form (name required, description optional; inline validation + toast on error; loading state on submit); ≥1 orgs → load the most recently updated org via `fetchOrganization(orgId)` and render the tree. Loading: `Skeleton` placeholders (pattern in `App.tsx` fallback). Styling: shadcn components only (`Card`, `Button`, `Badge`, `Input`, `Skeleton`, `Label`), `cn()` for conditional classes, `@/` path alias, 100-char lines.
- **Status badges**: map `active` → `Badge` default variant, `idle` → `secondary`, `overloaded` → `destructive`.
- **Nav**: add `{ title: "Organization", url: "/organization", icon: Building2 }` to `data.navMain` in `app-sidebar.tsx` (import `Building2` from `lucide-react`).
- **Do NOT touch** `frontend/src/pages/CommandCenter.tsx` (root chat page), `frontend/src/data/mockWorkspaceData.ts`, or `CommandCenterWorkspacePane` in this story — the org dashboard is a new surface; the chat workspace mock replacement is out of scope.
- **No SSE/polling in 8.1** — one fetch on mount satisfies AC #5. Live org updates arrive with work-item SSE in 8.3.

### 7. Testing standards

- **Backend**: pytest + pytest-asyncio, class-based tests, shared fixtures in `conftest.py`, isolated test DB. Add an `org_db` fixture that resets the repository singleton and points it at an in-memory `sqlite3` connection (copy the `in_memory_db` approach: reset module globals in place — never `sys.modules`-purge, per the `_clear_thread_manager` docstring rationale). No LLM involvement in this story — no mock-LLM fixtures needed. The autouse `isolate_test_env` fixture already runs.
- **Frontend**: Vitest in `frontend/src/__tests__/Organization.test.tsx`; `vi.mock('@/api/organizations')` — no real network; assert empty state, create flow, populated tree (dept/team names, capacity `0/3`-style text, CoS badge), 404 error path.
- **Regression gate**: full `python -m pytest backend/tests` and `cd frontend && npm run test` (Vitest) must pass. CI also runs `ruff check backend/app` (line length 100) and `python scripts/forbidden_imports.py`.
- **e2e**: do NOT add new Playwright specs in this story — e2e data isolation (issue #9) is unresolved and the suite is flaky; add org e2e coverage in a follow-up once #9 lands.

### 8. Scope boundaries (do NOT build in this story)

- No work items / lifecycle (story 8.3), no Chief-of-Staff chat routing (story 8.2) — "active and responsive" is satisfied here by status `active` only; "responsive" lands with orchestration stories.
- No org update/delete, no custom org design, no multi-org switcher UI (API supports list; UI shows the most recent org), no live/SSE org updates, no teams.yaml changes, no new dependencies, no auth.

### 9. Project conventions

- Branch: `feat/8-1-organization-structure` cut fresh from latest `develop` (AD-20), PR to `develop`. Commits: `type(scope): description` (e.g., `feat(organization): ...`, `test(organization): ...`, `feat(frontend): ...`). Keep the PR diff-scoped.
- Google-style docstrings on all public functions; snake_case backend / camelCase frontend; Windows-first for any doc comments.
- Docker: `storage/` is already the mounted data dir (`STORAGE_DIR` default `ROOT_DIR/storage`) — the new `organizations.sqlite` lands in the volume automatically; no compose/Dockerfile changes.

### Project Structure Notes

- New backend package `backend/app/organization/` (models, repository, service) mirrors the layering of `app/services/` + `app/storage/` but keeps the entity self-contained per AD-13 ownership (single owner). Variance rationale: no existing org code exists (greenfield entity); placing routes in the existing `app/api/routes/` keeps the router-registration pattern intact.
- Frontend page lives in `frontend/src/pages/` like all other pages; API module in `frontend/src/api/` like `ideas.ts`/`threads.ts`.
- Detected conflict: spine AD-3 mentions SQLAlchemy but the codebase implements raw sqlite3 (verified: no SQLAlchemy in `backend/requirements.txt`; `thread_manager.py` uses `sqlite3` directly). Resolution: follow the implemented raw-sqlite pattern; flag the wording drift for the architect (PR description), do not change the spine from a story.
- Ghost `backend/app/work_items/__pycache__/` left untouched (gitignored, not code).

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Epic 8 — Story 8.1] user story, BDD AC, meta (`executor=local-agent | order=1 | priority=P0 | depends=none | note=split candidate: 8.1a org data model+API, 8.1b Command Center population`)
- [Source: _bmad-output/planning-artifacts/prds/prd-Companion-2026-08-01/prd.md#FR-1 Create Organization] default structure spec; [Source: same#FR-2 Command Center Dashboard] dashboard contents + NFR1 (<2s, 10+ items, capacity display); [Source: same#Glossary] Organization/CoS/Department/Chief/Team/Captain/Agent definitions; [Source: same#Non-Goals] no custom org design, single human user per org in v1
- [Source: _bmad-output/planning-artifacts/architecture/architecture-Companion-2026-08-02/ARCHITECTURE-SPINE.md] AD-2 (2 services, in-process), AD-3 (SQLite sole persistence, single checkpointer singleton), AD-7 (teams from teams.yaml, reloadable), AD-12 (dead modules), AD-13 (canonical entity ownership), AD-14 (config precedence), AD-18/AD-19 (GitHub sync lifecycle)
- [Source: _bmad-output/project-context.md] routes <150 lines / services <200 lines, snake_case contract, `@/` alias, `cn()`, shadcn-only, centralized API client, pytest class-based + shared conftest fixtures + separate test DB, Google docstrings, 100-char lines, branch/commit conventions, Windows-first docs
- [Source: backend/app/services/thread_manager.py] sqlite3 singleton + WAL + `CREATE TABLE IF NOT EXISTS` + metadata table pattern; [Source: backend/tests/conftest.py] `in_memory_db`, `_clear_thread_manager` (reset-in-place, no sys.modules purge)
- [Source: backend/app/api/routes/ideas.py] route/lock/404/validation pattern; [Source: backend/app/api/app.py] router registration
- [Source: backend/requirements.txt] dependency set (no SQLAlchemy — do not add)
- [Source: scripts/forbidden_imports.py] forbidden import list enforced in CI
- [Source: frontend/src/api/ideas.ts, frontend/src/App.tsx, frontend/src/components/app-sidebar.tsx, frontend/src/pages/Dashboard.tsx] frontend API/routing/nav/page patterns
- [Source: _bmad-output/implementation-artifacts/github-board.md, deferred-work.md] AD-17/18/19/20 workflow context; open issue #9 (e2e isolation) — why no new e2e specs in this story

## Dev Agent Record

### Agent Model Used

### Debug Log References

- Tasks 1–4 validated with venv in-process smoke checks: model totals (2 depts / 5 teams / 18 unique agents), repository round-trip on `:memory:`, service ordering + capacity checks, and a TestClient pass over all three `/api/organizations` endpoints (201 tree shape, 400 blank name, 404 unknown id, list shape `{"organizations", "count"}` with counts 2/5/18). This FastAPI version wraps `include_router` output in `_IncludedRouter` objects, so route registration is verified via `app.openapi()['paths']` rather than static `app.routes` introspection.

### Completion Notes List

- Task 1: new `backend/app/organization/` package — Pydantic v2 tree models (`OrgAgent`, `OrgTeam`, `OrgDepartment`, `Organization`, `OrganizationSummary`, `CreateOrganizationRequest`), `AgentStatus` literal vocabulary, and `DEFAULT_ORG_STRUCTURE` pinned exactly per Dev Notes §2 (18 agents: 1 CoS `active`, 2 department chiefs, 5 team captains, 10 specialists).
- Task 2: `repository.py` — raw `sqlite3` singleton (WAL) on `STORAGE_DIR/organizations.sqlite`, 4 tables exactly per §5 (composite PKs, no FKs — integrity enforced in the service), `get_organization_rows()` returns org/departments/teams/agents rows in deterministic `ORDER BY id`, `list_organizations()` with subquery counts ordered by `updated_at DESC`, and `_reset_organization_db(conn=None)` in-place test hook (mirrors the `_clear_thread_manager` rationale — no `sys.modules` purge; supports optional in-memory conn injection).
- Task 3: `service.py` — `create_organization` (uuid4, UTC ISO timestamps, full default structure insert), `get_organization` (CoS = dept NULL & team NULL agent; chief = team NULL agent in dept; captain = `team_captain` role; `agents[]` captain-first; `active_agents` = count of team agents with status `active`, `total_agents` includes the captain), `list_organizations` → `OrganizationSummary` list. Canonical department/team/agent order is derived from `DEFAULT_ORG_STRUCTURE` at import so API arrays always match the pinned order regardless of SQLite row order.
- Task 4: `backend/app/api/routes/organizations.py` — thin async routes over the sync service (matches `ideas.py`): POST validates name (non-blank after strip, ≤200 chars → 400) and returns 201 `{"organization": OrgTree}`; GET list returns `{"organizations": [...], "count": n}`; GET by id returns 404 for unknown ids. `app.py` registers the router (import between mcp and sse; `include_router` after mcp_router).
- Task 5: `conftest.py` gains an `org_db` fixture (in-memory `sqlite3` conn injected via `org_repo._reset_organization_db(conn)`, closed on teardown — reset-in-place, no `sys.modules` purge, per the `_clear_thread_manager` rationale). `test_organizations.py` adds 16 tests in 3 classes: `TestDefaultStructure` (pinned structure totals 2/5/18, statuses), `TestService` (persistence round-trip, unknown-id `ValueError`, list ordering), `TestOrganizationApi` (201 tree shape, 400 blank/over-long name, list envelope, 404, file-based persistence surviving connection reopen via monkeypatched `STORAGE_DIR`). Full backend suite: 277 passed, 0 failed. Side fix: `repository._reset_organization_db` now only closes the global conn when the injected conn is a *different* object (`_ORG_CONN is not conn`) — previously it closed the caller's connection even when they were the same object.
- Task 6: `frontend/src/api/organizations.ts` — snake_case types mirroring the API contract (`OrgAgent`, `OrgTeam`, `OrgDepartment`, `Organization`, `OrganizationSummary`, `OrgStatus`) plus `fetchOrganizations()` / `fetchOrganization(orgId)` / `createOrganization(name, description)` unwrapping the response envelopes; `client.ts` barrel re-exports the module.
- Task 7: `frontend/src/pages/Organization.tsx` — loads the most recent org (list → fetch by id) with loading skeleton, error state, empty state (create form: name required ≤200 chars with inline validation, description, `useToast` destructive toasts), and the populated tree: org header (name/description, CoS card with status badge), department cards (name, chief, status badge), team cards (name, captain, status badge, `Capacity active/total`), agent lists. Status badge variants: `active`→default, `idle`→secondary, `overloaded`→destructive.
- Task 8: `App.tsx` — lazy `Organization` import + `/organization` route before the `*` catch-all (tabs preserved). `app-sidebar.tsx` — `navMain` entry "Organization" with the `Building2` lucide icon.
- Task 9: `frontend/src/__tests__/Organization.test.tsx` — 5 tests: empty-state create form, inline name-required validation (no API call), create flow (trimmed name + description passed to `createOrganization`, tree renders after success), populated tree (dept names in order `['Ideation','Technology']`, 5 team names, capacity `0/3` ×5, CoS `active` badge, `fetchOrganization('org-1')` called), error state (`fetchOrganization` reject → `org-error-state` with message). Full frontend suite: 186 passed across 16 files; `tsc --noEmit` clean; `ruff check backend/app` clean; `scripts/forbidden_imports.py` PASS.

### File List

- `backend/app/organization/__init__.py` (new)
- `backend/app/organization/models.py` (new)
- `backend/app/organization/repository.py` (new)
- `backend/app/organization/service.py` (new)
- `backend/app/api/routes/organizations.py` (new)
- `backend/app/api/app.py` (modified)
- `backend/tests/conftest.py` (modified)
- `backend/tests/test_organizations.py` (new)
- `frontend/src/api/organizations.ts` (new)
- `frontend/src/api/client.ts` (modified)
- `frontend/src/pages/Organization.tsx` (new)
- `frontend/src/App.tsx` (modified)
- `frontend/src/components/app-sidebar.tsx` (modified)
- `frontend/src/__tests__/Organization.test.tsx` (new)

## Change Log

- 2026-08-17: Implemented Tasks 1–4 (backend organization package: models, repository, service, API routes + app wiring). Validated via smoke tests and ruff; full backend test suite to follow in Task 5.
- 2026-08-17: Implemented Tasks 5–9 (backend tests with `org_db` fixture — 16 new tests, full backend suite 277 passed; frontend API module + barrel, Organization dashboard page, `/organization` route + sidebar nav, 5 frontend tests — full frontend suite 186 passed, `tsc --noEmit` clean, ruff + forbidden-imports green). Story complete; status → review.
