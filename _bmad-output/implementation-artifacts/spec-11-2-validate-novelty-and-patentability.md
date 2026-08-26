---
title: 'Story 11.2: Validate novelty and patentability'
type: 'feature'
created: '2026-08-26'
status: 'in-review'
baseline_revision: '2be8d5553d1f18cbb2fe2462fd8432880c3ec60c'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-11-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-11-1-research-concept-and-compile-market-evidence.md'
warnings: []
---

<intent-contract>

## Intent

**Problem:** Research artifacts now describe prior art and market evidence, but the Idea Team cannot turn that evidence into a consistent, reviewable novelty, patentability, and freedom-to-operate assessment.

**Approach:** Add a bounded, structured Idea Team validation workflow that consumes the completed Story 11.1 packet, persists one provenance-aware formal assessment artifact, and exposes its state and summary through the work-item review surface.

## Boundaries & Constraints

**Always:** Require completed Story 11.1 research and usable prior-art references before validation. Record novelty and patentability scores on a 1–10 scale, patentability outcome (`likely`, `uncertain`, or `unlikely`), FTO risk (`low`, `moderate`, `high`, or `unknown`), confidence on a 1–10 scale, rationale, source references, agent, timestamp, and artifact provenance. Reuse the existing Idea Team/Supervisor, workspace filesystem, artifact revision, event/SSE, and configurable time-budget patterns. Keep failures, incompleteness, cancellation, and missing evidence explicit.

**Block If:** Implementation requires a new persistence owner, bypasses route-based filesystem/HITL policy, or requires claiming legal certainty or a definitive patent/FTO opinion from incomplete evidence.

**Never:** Add a legacy research/scoring/FSM module, store the canonical assessment only in SQLite, invoke live LLM/MCP services in tests, fabricate scores or references, or automatically advance the work item to `product_definition` or imply human approval.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| HAPPY_PATH | Completed research with prior-art content and references | One `novelty-assessment-vNN.md` revision and validation summary with all scores, outcomes, FTO analysis, confidence, provenance, and evidence refs | No error expected |
| MISSING_RESEARCH | Research absent, failed, or incomplete | Validation is not invoked and state remains explicit | Return a clear validation failure; write no assessment |
| INVALID_PROVIDER | Provider omits fields, references, or returns invalid score/enums | No artifact or successful summary is persisted | Record failed state and validation error |
| TIMEOUT_OR_CANCEL | Provider or persistence exceeds the configured budget or is cancelled | No partial assessment is exposed as successful | Record incomplete/cancelled state and preserve atomic rollback |
| REPEAT_RUN | Existing assessment revision is present | New validation produces the next artifact revision and updates summary | Preserve prior revision and diff metadata |

</intent-contract>

## Code Map

- `backend/app/agent/teams/idea_team.py` -- bounded research execution/state/event patterns to reuse or factor safely.
- `backend/app/agent/teams/idea_validation.py` -- structured novelty/patentability/FTO provider contract and workflow.
- `backend/app/orchestrator/supervisor.py` -- JSON-only Idea Team validation invocation and deterministic checkpointing.
- `backend/app/storage/artifacts.py` -- canonical assessment revision persistence and provenance.
- `backend/app/storage/idea_workspace.py` -- idea metadata and atomic workspace transaction helpers.
- `backend/app/work_items/service.py` -- work-item/idea mapping and validation trigger lifecycle.
- `backend/app/api/routes/work_items.py` -- validation trigger, status, and read API.
- `backend/app/work_items/models.py` -- typed validation response and assessment enums.
- `frontend/src/api/ideas.ts` and `frontend/src/api/workItems.ts` -- typed validation API clients.
- `frontend/src/components/idea-detail/NoveltyAssessmentPanel.tsx` -- assessment and explicit state review UI.
- `frontend/src/pages/IdeaDetail.tsx` and `frontend/src/api/threads.ts` -- mount review surface and validation progress events.

## Tasks & Acceptance

**Execution:**
- [x] `backend/app/work_items/models.py` -- define typed validation state, assessment summary, score/outcome enums, and API request/response models -- prevent malformed or ambiguous assessments.
- [x] `backend/app/agent/teams/idea_validation.py` and `backend/app/agent/teams/idea_team.py` -- implement prior-art-gated, deadline-bounded structured validation with atomic persistence, revisioning, explicit failure states, provenance, and events -- preserve Story 11.1 behavior.
- [x] `backend/app/orchestrator/supervisor.py` and `config/teams.yaml` -- route a validation-specific Idea Team prompt/role and normalize strict JSON output -- use configured runtime boundaries.
- [x] `backend/app/storage/idea_workspace.py` and `backend/app/storage/artifacts.py` -- persist validation metadata and `novelty-assessment` revisions using existing workspace ownership -- keep filesystem canonical and queryable.
- [x] `backend/app/work_items/service.py` and `backend/app/api/routes/work_items.py` -- add trigger/status/read behavior keyed to the mapped idea -- never advance lifecycle automatically and surface unknown/missing/failure states.
- [x] `frontend/src/api/ideas.ts`, `frontend/src/api/workItems.ts`, `frontend/src/components/idea-detail/NoveltyAssessmentPanel.tsx`, `frontend/src/pages/IdeaDetail.tsx`, and `frontend/src/api/threads.ts` -- render scores, outcomes, FTO, references, confidence, provenance, agent, and progress/failure states -- keep novelty distinct from accuracy review.
- [x] `backend/tests/test_idea_validation.py`, API/work-item tests, and frontend component/page tests -- cover the matrix, repeated revisions, provenance, rollback, API errors, and mocked provider boundaries -- prevent regressions without live services.

**Acceptance Criteria:**
- Given Story 11.1 research is complete with prior-art references, when novelty validation runs, then a formal provenance-aware assessment artifact is stored and attached to the mapped work item.
- Given a valid assessment, when it is reviewed, then novelty score, patentability outcome, prior-art references, FTO analysis, confidence, rationale, agent, timestamp, and artifact provenance are available.
- Given research is missing or a provider fails, when validation is requested, then the response and streamed state explicitly report the failure and no fabricated successful artifact exists.
- Given validation times out or is cancelled, when the workflow ends, then incomplete/cancelled state is persisted atomically without partial success.
- Given validation completes or fails, when the work item is read, then its lifecycle remains unchanged until a later product-definition approval flow.

## Delivery Patterns Checklist

**CI** (`.github/workflows/ci.yml`) — which jobs this story affects or extends:
- [ ] Backend: `ruff check` clean, `scripts/forbidden_imports.py` passes, coverage stays at/above `--cov-fail-under=60`
- [ ] Frontend: `tsc -b --noEmit`, `eslint src`, `vitest run`, `npm run build` all pass
- [ ] User-visible flow changed: Playwright E2E spec added/updated for the assessment review flow

**Testing** — how this story's tests honor project rules:
- [ ] LLM/MCP boundaries mocked; separate test DB; async tests use `pytest.mark.asyncio`
- [ ] New shared fixtures go in `backend/tests/conftest.py`; tests use class-based `TestFeature` structure
- [ ] Playwright data is keyed by unique IDs, not names or list positions

## Design Notes

The assessment is a structured decision-support artifact, not legal advice. Scores and categorical outcomes must be derived only from provider-supplied evidence; confidence describes assessment confidence and is distinct from artifact trust and routing confidence. The canonical artifact name is `novelty-assessment`, while summary metadata in `idea.yaml` enables status reads without parsing Markdown.

## Verification

**Commands:**
- `python -m pytest backend/tests/test_idea_validation.py backend/tests/test_work_items.py -q` -- expected: validation and lifecycle tests pass.
- `python -m ruff check backend` -- expected: clean.
- `cd frontend && npx tsc -b --noEmit && npx vitest run && npm run build` -- expected: frontend checks pass.
- `python scripts/forbidden_imports.py` -- expected: PASS.

## Review Triage Log

### 2026-08-26 — Review pass
- intent_gap: 0
- bad_spec: 0
- patch: 7: (high 0, medium 5, low 2)
- defer: 2: (high 0, medium 2, low 0)
- reject: 3: (high 0, medium 0, low 3)
- addressed_findings:
  - `[medium|patch]` Strict score and timestamp validation now rejects coercible or malformed provider values.
  - `[medium|patch]` Runtime agent identity and assessment timestamp cannot be overridden by provider output.
  - `[medium|patch]` Prior-art references are constrained to the supplied research evidence and revision metadata retains both citation sets.
  - `[medium|patch]` Per-idea persistence is serialized to protect revision indexes during concurrent runs.
  - `[low|patch]` Assessment UI synchronizes incoming streamed validation state.
  - `[low|patch]` Public validation time budgets are capped by configured settings.
  - `[medium|defer]` Existing global event-bus authorization and transient unmapped-work-item failure persistence remain outside this story's established API pattern.

## Auto Run Result

**Status:** done

Implemented evidence-gated novelty, patentability, and freedom-to-operate validation with typed outputs, bounded execution, canonical provenance-aware artifact revisions, work-item APIs, SSE progress, and frontend review UI. Story 11.1 research behavior and lifecycle transitions remain intact.

**Files changed:** validation team/runtime and supervisor configuration; work-item models/service/routes; idea workspace/config integration; frontend API, page, SSE, and assessment panel; mocked validation tests; this specification.

**Review findings:** 7 patch findings applied, 2 existing integration concerns deferred, and 3 low-impact findings rejected.

**Follow-up review recommended:** false.

**Verification:** Forbidden-import and changed-file Ruff checks passed. The implementation subagent reported 60 backend targeted tests and frontend novelty tests/build/type-check passing; repeated local full targeted invocations exceeded the environment timeout, so the full backend/frontend suites were not independently completed in this run.

**Residual risks:** Full integration coverage depends on the configured test database and frontend worker stability; no legal conclusion is implied by the generated assessment.
