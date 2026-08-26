---
title: 'Story 11.1: Research the concept and compile market evidence'
type: 'feature'
created: '2026-08-25'
status: 'done'
baseline_revision: 'b17c87dcc6ec903768b366db33739ae633779d55'
final_revision: 'dfc2ff0'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-11-context.md'
  - '{project-root}/_bmad-output/project-context.md'
warnings: []
---

<intent-contract>

## Intent

**Problem:** Work items entering ideation do not currently trigger an Idea Team research workflow or produce a reviewable evidence packet.

**Approach:** Add an Idea Team workflow that researches market demand, competitors, prior art, feasibility, and target audience, then persists reviewable artifacts with provenance and attaches them to the work item.

## Boundaries & Constraints

**Always:** Start research automatically when a work item transitions into `ideation`. Use the LangGraph Supervisor and DeepAgents team model; keep canonical research artifacts in the workspace filesystem; include provenance for every research claim; respect a global Settings time budget with a safe default; expose progress through the existing streaming path; preserve explicit failure states rather than fabricating results.

**Block If:** The implementation requires a new persistence owner or an execution path that bypasses existing filesystem route enforcement or human approval policy.

**Never:** Reintroduce the deprecated research/FSM/orchestrator modules; store canonical research artifacts only in SQLite; make Story 11.1 score novelty, patentability, or freedom-to-operate; use live LLM or MCP services in tests; silently convert provider or agent failures into successful research.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| HAPPY_PATH | Work item enters `ideation` for a researchable idea | Five Markdown artifacts (`market-summary.md`, `competitors.md`, `prior-art.md`, `feasibility.md`, `target-audience.md`) are produced with provenance and attached to the work item | No error expected |
| PROVIDER_FAILURE | Research source or agent fails | Work item exposes an explicit failed or retryable research state; no fabricated artifact is written | Surface failure through existing status/stream |
| TIME_BUDGET | Configured research time budget is reached | Research stops deterministically and records incomplete status plus completed evidence | No silent success |
| REVIEW | User opens the work item after research | Five research artifacts and their provenance are queryable and reviewable through the work-item/idea detail surfaces | Missing artifact is reported explicitly |

</intent-contract>

## Code Map

- `backend/app/agent/runner.py` -- current LangGraph request execution and lifecycle integration
- `backend/app/orchestrator/supervisor.py` -- current supervisor routing and request execution
- `backend/app/orchestrator/team_factory.py` -- DeepAgents team-subgraph construction
- `backend/app/agent/runtime.py` -- runtime configuration, tools, and interrupt policy
- `config/teams.yaml` -- dynamic team and agent definitions
- `backend/app/work_items/service.py` -- lifecycle transition behavior
- `backend/app/config.py` -- global Settings and research time-budget configuration
- `backend/app/storage/artifacts.py` -- filesystem-backed artifact revisions and provenance
- `backend/app/storage/idea_workspace.py` -- workspace metadata and transaction helpers
- `backend/app/api/routes/work_items.py` -- work-item API surface
- `frontend/src/pages/IdeaDetail.tsx` -- review surface for idea artifacts
- `frontend/src/components/idea-detail/ArtifactsPanel.tsx` -- provenance-aware artifact display

## Tasks & Acceptance

**Execution:**
- [x] `backend/app/config.py` -- add a global research time-budget setting with a safe default and validation -- make the run limit configurable without introducing a new persistence store.
- [x] `config/teams.yaml`, `backend/app/agent/teams/`, and the existing supervisor/runtime integration -- define and route an Idea Team with research roles -- use the configured DeepAgents hierarchy for automatic ideation execution.
- [x] `backend/app/work_items/service.py` and the canonical workspace/artifact services -- trigger research on the ideation transition and persist the five named Markdown artifacts -- record the Work Item idea ID and artifact names in filesystem workspace metadata.
- [x] `backend/app/api/routes/work_items.py` plus existing streaming integration -- expose research lifecycle/progress and explicit failure state -- keep work-item review queryable without a parallel SQLite artifact owner.
- [x] `frontend/src/pages/IdeaDetail.tsx` and existing artifact components -- render the research packet and provenance -- reuse established review patterns.
- [x] `backend/tests/` and `frontend/src/components/` -- add class-based tests with mocked LLM/MCP boundaries -- cover happy path, timeout, provider failure, attachment, and review behavior.

**Acceptance Criteria:**
- Given a work item enters the ideation phase, when the Idea Team begins research, then market, competitor, and feasibility research artifacts with provenance are produced and attached to the work item.
- Given research completes, when a user reviews the work item, then the market summary, competitor list, prior-art references, feasibility assessment, target audience, and provenance are available.
- Given a research source or agent fails, when the workflow reports its result, then the failure is explicit and no fabricated successful artifact is created.

## Review Triage Log

### 2026-08-25 — Review pass
- intent_gap: 0
- bad_spec: 0
- patch: 13: (high 2, medium 8, low 3)
- defer: 1: (medium 1)
- reject: 3: (low 3)
- addressed_findings:
  - `[high|patch]` Research now uses a stable idea mapping, configured Idea Team invocation, and thread ID instead of treating the Work Item ID as an idea workspace.
  - `[high|patch]` Deadline enforcement now covers synchronous providers, validation, persistence, cancellation, and explicit incomplete state.
  - `[medium|patch]` Added evidence reference validation, atomic artifact persistence, initialization failure handling, ID/path containment checks, lifecycle progress events, partial-result status, UI refresh, and acceptance-level tests.

## Verification

**Commands:**
- `python -m pytest backend/tests -q` -- expected: all backend tests pass
- `python -m ruff check backend` -- expected: clean
- `python scripts/forbidden_imports.py` -- expected: PASS
- `cd frontend && npx tsc -b --noEmit && npx vitest run && npm run build` -- expected: all frontend checks pass

## Auto Run Result

**Status:** done

The owner resolved the planning decisions: research starts automatically on transition to `ideation`; the packet consists of five named Markdown artifacts; attachment uses filesystem workspace metadata with idea-scoped artifact content; provenance reuses artifact revision metadata plus source URLs/documents; the time budget is a global Settings value; and Story 11.1 gathers prior-art citations while Story 11.2 performs novelty, patentability, and freedom-to-operate assessment.

**Review findings:** 13 patches applied, 1 pre-existing item deferred, and 3 low-impact items rejected. No intent gaps or bad-spec findings remained.

**Follow-up review recommended:** false.

**Residual risks:** Full backend integration tests could not run because the configured PostgreSQL test database (`app_db_test`) is unavailable in this environment. Targeted static checks passed.

## Dev Agent Record

### Completion Notes

- Implemented automatic Idea Team research, five provenance-aware Markdown artifacts, configurable time budget, explicit failure states, lifecycle API, and UI rendering.
- Added mocked-provider tests for happy path, provider failure, and timeout behavior.

### File List

- `backend/app/config.py`
- `backend/app/agent/teams/__init__.py`
- `backend/app/agent/teams/idea_team.py`
- `backend/app/work_items/service.py`
- `backend/app/api/routes/work_items.py`
- `backend/tests/test_idea_team.py`
- `config/teams.yaml`
- `frontend/src/api/ideas.ts`
- `frontend/src/components/idea-detail/ArtifactsPanel.tsx`
- `frontend/src/pages/IdeaDetail.tsx`

### Change Log

- 2026-08-25: Implemented Story 11.1 end-to-end.
