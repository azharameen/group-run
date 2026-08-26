---
title: 'Story 11.3: Create product definition from validated concepts'
story_key: '11-3-create-product-definition-from-validated-concepts'
type: 'feature'
created: '2026-08-26'
status: 'in-review'
baseline_revision: '15afbf7d6190fe31a1ed50c42149fc977981ef6d'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-11-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-11-2-validate-novelty-and-patentability.md'
warnings: []
---

<intent-contract>

## Intent

**Problem:** A validated concept has evidence and a novelty assessment, but the Product Team cannot yet turn it into a reviewable definition that Technology can execute.

**Approach:** Add a bounded Product Team workflow that creates one revisioned, provenance-aware product-definition artifact containing requirements, user stories, roadmap phases, effort and compute-cost estimates, and success metrics, then expose an explicit Chief of Staff approval gate for the Technology handoff.

## Boundaries & Constraints

**Always:** Require the work item to be in `product_definition` with a completed Story 11.2 assessment before generation. Validate structured provider output before atomically persisting `product-definition-vNN.md` and summary metadata. Every roadmap phase must include agent-hours, projected compute cost, and an estimate basis; generated estimates must remain visibly `generated`. Record agent, timestamp, evidence, confidence, reasoning, alternatives, artifact revision, approval decision, and lifecycle handoff events. Keep rejection, failure, timeout, cancellation, and missing prerequisites explicit.

**Block If:** The implementation requires inventing a new identity/authentication system, a new persistence owner, a fixed compute-pricing policy not present in project configuration, or a lifecycle transition outside the existing work-item approval contract.

**Never:** Auto-approve or auto-handoff to Technology; fabricate requirements, estimates, costs, evidence, or successful artifacts; treat the product definition as approved merely because generation completed; bypass workspace routing or filesystem approval controls; introduce a legacy FSM, scheduler, queue, or deprecated module.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|---------------|----------------------------|----------------|
| HAPPY_PATH | Work item in `product_definition` with completed assessment | New product-definition revision and review summary contain all required sections and provenance | No error expected |
| MISSING_PREREQUISITE | Wrong phase or assessment absent/incomplete | Generation is refused and lifecycle is unchanged | Explicit validation error; write no artifact |
| INVALID_PROVIDER | Missing requirements, stories, roadmap, metrics, estimates, basis, or provenance | No successful revision or summary is published | Persist explicit failed state and validation detail |
| TIMEOUT_OR_CANCEL | Generation exceeds budget or is cancelled | No partial definition is exposed as complete | Persist incomplete/cancelled state atomically |
| REPEAT_GENERATION | Prior product-definition revision exists | Next revision is created and prior revisions remain queryable | Preserve revision/diff metadata |
| APPROVE_HANDOFF | Complete definition receives explicit Chief of Staff approval | Decision is audited and work item transitions to Technology/development | Reject stale or invalid transitions |
| REJECT_OR_UNAUTHORIZED | Definition is rejected or actor cannot use the existing approval contract | Work item remains in product definition for revision | Record rejection; reject invalid actor/action explicitly |

</intent-contract>

## Code Map

- `backend/app/work_items/models.py` -- typed product-definition, roadmap estimate, status, and approval API contracts.
- `backend/app/agent/teams/product_team.py` -- new bounded structured generation workflow and persistence coordination.
- `backend/app/orchestrator/supervisor.py` and `config/teams.yaml` -- Product Team roles, routing, and strict structured output.
- `backend/app/storage/artifacts.py` and `backend/app/storage/idea_workspace.py` -- existing revision and atomic workspace patterns.
- `backend/app/work_items/service.py` and `backend/app/api/routes/work_items.py` -- prerequisite gate, generation/read APIs, approval, and lifecycle handoff.
- `frontend/src/api/workItems.ts` and `frontend/src/api/ideas.ts` -- typed product-definition and approval clients.
- `frontend/src/components/idea-detail/ProductDefinitionPanel.tsx` and `frontend/src/pages/IdeaDetail.tsx` -- review, provenance, estimate, progress, rejection, and approval UI.
- `frontend/src/api/threads.ts` -- product-definition progress/failure SSE handling.

## Tasks & Acceptance

**Execution:**
- [x] `backend/app/work_items/models.py` -- define strict product requirements, user story, roadmap phase, estimate-basis, success-metric, status, and approval models -- reject incomplete definitions before persistence.
- [x] `backend/app/agent/teams/product_team.py` -- implement prerequisite-gated, deadline-bounded structured generation with atomic revision persistence and explicit terminal states -- preserve prior revisions and never fabricate output.
- [x] `backend/app/orchestrator/supervisor.py` and `config/teams.yaml` -- register Product Team routing and roles with JSON-only output -- reuse the configured agent runtime.
- [x] `backend/app/work_items/service.py`, `backend/app/api/routes/work_items.py`, `backend/app/storage/artifacts.py`, and `backend/app/storage/idea_workspace.py` -- add generation, status/read, revision metadata, rejection, and explicit handoff approval behavior -- keep lifecycle and provenance auditable.
- [x] `frontend/src/api/workItems.ts`, `frontend/src/api/ideas.ts`, `frontend/src/api/threads.ts`, `frontend/src/components/idea-detail/ProductDefinitionPanel.tsx`, and `frontend/src/pages/IdeaDetail.tsx` -- expose definition sections, estimates and basis, provenance, progress/errors, and the Chief of Staff decision gate -- do not imply approval before the audited action.
- [x] `backend/tests/test_product_definition.py`, related work-item API tests, and frontend panel/page tests -- cover every matrix row, revisions, rollback, SSE state, lifecycle invariants, and mocked provider boundaries -- prevent partial success and unauthorized handoff regressions.

**Acceptance Criteria:**
- Given an approved concept is in product definition with a completed novelty assessment, when Product Team generation succeeds, then a formal revisioned artifact contains requirements, user stories, phased roadmap, agent-hour and projected compute-cost estimates with basis, success metrics, and provenance.
- Given a generated definition, when the Chief of Staff reviews it, then the complete artifact, evidence, confidence, estimates, assumptions, alternatives, agent, timestamp, and revision are available.
- Given an explicit valid approval, when handoff is confirmed, then the decision and Ideation-to-Technology transition are audited and the work item enters development.
- Given rejection or any failed/incomplete generation, when the work item is read, then it remains in product definition and no approved handoff is implied.

## Delivery Patterns Checklist

**CI** (`.github/workflows/ci.yml`):
- [ ] Backend Ruff, forbidden-import, targeted tests, and coverage gates pass.
- [x] Frontend type-check, lint, Vitest, and build pass.
- [ ] Playwright covers the visible product-definition review and handoff gate.

**Testing:**
- [x] LLM/MCP boundaries are mocked; tests use the configured isolated database and correct async boundaries.
- [x] Shared fixtures live in `backend/tests/conftest.py`; no tests are added to deprecated modules.
- [ ] Playwright data is keyed by unique IDs.

## Spec Change Log

## Review Triage Log

- **2026-08-26 follow-up fixes:** guarded async lock release on cancelled
  acquisition, validated lifecycle and approval before generation state writes,
  protected completed/approved revisions from late cleanup or regeneration,
  gated generic `product_definition → development` transitions behind the
  audited Chief of Staff handoff, serialized same-process generation/decision
  interaction, disabled domain and MCP tools for Product Team generation,
  rejected non-finite estimates and blank decision strings/lists, and added
  focused regression coverage.
- **2026-08-26 high-severity follow-up:** gated every generic
  `product_definition → {development, testing, deployment, monitoring}`
  transition on completed-definition metadata plus an exact audited Chief of
  Staff handoff decision. Approval/rejection now perform the database CAS and
  audit writes before the workspace callback inside one open database
  transaction, with workspace rollback on failure and database row locking
  for competing workers. Template replay now returns a clear validation error
  for persisted templates that would synthesize this handoff; valid
  non-Technology template replay remains unchanged.

## Design Notes

Use one canonical product-definition artifact with structured sections rather than independently successful partial artifacts. Roadmap phase labels are provider-defined but non-empty; estimate basis is mandatory, while no global pricing formula is invented. Rejection records reasoning and leaves the item ready for a later revision.

## Verification

**Commands:**
- `python -m pytest backend/tests/test_product_definition.py backend/tests/test_work_items.py -q` -- expected: generation, revision, approval, and lifecycle tests pass.
- `python -m ruff check backend` and `python scripts/forbidden_imports.py` -- expected: clean.
- `cd frontend && npx tsc -b --noEmit && npx vitest run && npm run build` -- expected: product-definition UI and frontend build pass.

## Auto Run Result

**Status:** review

Implemented the bounded Product Team workflow, strict provenance-aware product-definition revisions, configured Product Team runtime routing, lifecycle/read/generation APIs, explicit Chief of Staff approval or rejection, product-definition SSE event handling, review/provenance/estimate UI, and focused mocked tests. Generation never auto-approves or auto-handoffs; rejected, failed, incomplete, cancelled, and missing-prerequisite states remain explicit.

**Exact checks:**
- `python -m pytest backend/tests/test_product_definition.py -q` — **18 passed**.
- `python -m pytest backend/tests/test_product_definition.py backend/tests/test_work_items.py -q` — **72 passed, 2 warnings**.
- `python -m pytest backend/tests -q` — **548 passed, 1 pre-existing failure** in `tests/test_mcp_integration.py::TestMCPServerAddRemoveReload::test_add_then_remove_server` (`WinError 5` replacing `mcp.json`).
- `python -m ruff check backend/app backend/tests/test_product_definition.py` — **passed**.
- `python -m ruff check backend` — **blocked by 177 pre-existing findings**, primarily legacy tests and Alembic files outside this story.
- `python scripts/forbidden_imports.py` — **passed**.
- `cd frontend && npx tsc -b --noEmit` — **passed**.
- `cd frontend && npm run lint` — **passed**.
- `cd frontend && npx vitest run --pool=threads --maxWorkers=1 --fileParallelism=false` — **30 files, 310 tests passed**.
- `cd frontend && npm run build` — **passed**.
- Product-definition and novelty panel Vitest run — **5 tests passed** on the successful invocation; a later rerun hit the environment's worker-start timeout.
- Follow-up `python -m pytest backend/tests/test_product_definition.py -q` — **38 passed**.
- Follow-up `python -m pytest backend/tests/test_product_definition.py backend/tests/test_work_items.py -q` — **92 passed, 2 warnings**.
- Follow-up focused Ruff check for changed backend modules/tests — **passed**.
- Follow-up `python -m compileall -q backend/app backend/tests/test_product_definition.py backend/tests/test_work_items.py` — **passed**.
- Follow-up `python scripts/forbidden_imports.py` — **passed**.
- Follow-up focused frontend Vitest (`ProductDefinitionPanel` and `IdeaDetail`) — **15 passed**.
- Follow-up `cd frontend && npx tsc -b --noEmit` — **passed**.
- Follow-up `cd frontend && npm run build` — **passed**.
- Full frontend Vitest was started with the single-worker settings but did not complete in the environment and was stopped after repeated no-progress output.
- Full backend `python -m pytest backend/tests -q` — **7 failures**: four environment-level Windows `WinError 5` filesystem replacement failures and three legacy template tests that still assume the now-protected direct product-definition handoff; the focused Story 11.3/work-item suites pass.
- High-severity follow-up `python -m pytest backend/tests/test_product_definition.py backend/tests/test_work_items.py backend/tests/test_work_item_templates.py -q` — **118 passed, 2 warnings**.
- High-severity follow-up `python -m pytest backend/tests -q` — **576 passed, 2 warnings**.
- High-severity follow-up `python -m ruff check backend/app/work_items backend/app/api/routes/work_item_templates.py backend/tests/test_product_definition.py backend/tests/test_work_item_templates.py` — **passed**.
- High-severity follow-up `python -m compileall -q backend/app backend/tests` — **passed**.
- High-severity follow-up `python scripts/forbidden_imports.py` — **passed**.

**Remaining blocker:** Full backend Ruff is not clean due to pre-existing findings outside this follow-up scope. Playwright was not run in this environment, so its checklist item remains open.
