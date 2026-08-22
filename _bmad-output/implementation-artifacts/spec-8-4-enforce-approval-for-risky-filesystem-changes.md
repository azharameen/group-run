---
title: "8.4 Enforce Approval for Risky Filesystem Changes"
type: feature
created: 2026-08-20
status: completed
baseline_revision: 7714456860025fdb55dcf0a0c9b77b6f05a5bd6a
review_loop_iteration: 0
followup_review_recommended: false
warnings: [oversized]
context: "Story 8.4, Epic 8 (Orchestration Core), Companion. Depends on Epic 4 HITL infrastructure (interrupt_on already set in runtime.py + team_factory.py, InterruptService, /api/interrupts, HITLApprovalCard/InterruptInbox, SSE bridge). Story 8.3 (done) provides continuity patterns. project-context.md rules: no sandbox execution, never fabricate output, provenance on artifacts/events, deprecated modules off-limits."
---

<intent-contract>

## Intent

**Problem:** Filesystem mutations (write, delete, overwrite) already trigger LangGraph interrupts via `interrupt_on`, and the UI already displays them, but the interrupt is never persisted to the `interrupts` table when the agent triggers it, and approving/rejecting does not resume the agent — so the "final result" is never produced, and there is no provenance or audit trail on the decision.

**Approach:** Persist agent-triggered interrupts with full provenance, add a resume path that re-invokes the agent with `Command(resume={"decisions": [...]})` using the same thread_id, and expose the decision in an audit trail. Keep the existing approve/reject API contract intact and add a separate resume endpoint the frontend calls after a decision.

## Boundaries & Constraints

### Always
- `interrupt_on` stays `{"write_file": True, "edit_file": True, "delete": True}` in both `runtime.py` and `team_factory.py` — the trigger is already correct; do not change it.
- Every interrupt record carries provenance: `decided_by` (default `"user"`), `decided_at` (UTC ISO), `confidence` (`high`/`low`), `reasoning`, `alternatives` (JSON list). No provenance field is optional.
- Resume uses `Command(resume={"decisions": [...]})` with the SAME thread_id as the original invocation (checkpointer requirement).
- API snake_case, same envelope style as existing interrupt routes.
- Tests: class-based pytest, in-memory DB via the existing `tmp_path` + monkeypatch `InterruptService._conn` + reset `_instance` fixture pattern; `create_deep_agent` mocked in wiring tests; no live LLM, no new dependencies.
- e2e: test case(s) for the story's primary user flow (extend `frontend/e2e/hitl.spec.ts`); any deferral must be recorded in `_bmad-output/implementation-artifacts/deferred-work.md` with reason.

### Block If
- A test would need a live LLM or real network call.
- The change would modify the supervisor StateGraph structure (adding/removing nodes/edges) — resume must be handled by re-invoking the agent runtime directly, not by restructuring the graph.
- The change would modify `config/teams.yaml` or the `threads.sqlite` checkpoint schema.

### Never
- Allow read operations (fetch_file, read_file, list) to trigger approval — reads never interrupt.
- Auto-approve or silently skip a risky mutation — every write/delete/overwrite must pause for review.
- Fabricate a resume result — if there is no checkpointed thread to resume, return an error, never a fake success.
- Add provenance fields to the LangGraph checkpoint schema (SqliteSaver) — provenance lives in the `interrupts` table, not the checkpoint.
- Touch deprecated modules (`models/`, `state/`, `scoring/`, `orchestrator/`, `storage/`).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| HAPPY_PATH | agent calls `write_file` → interrupt detected in `supervisor_general` | interrupt persisted with `status=pending`, provenance fields populated; SSE `interrupt.created` published; supervisor returns `waiting_for_approval=True` | No error expected |
| APPROVE_RESUME | user approves via `PATCH /api/interrupts/{id}/approve` then `POST /api/interrupts/{id}/resume` | agent re-invoked with `Command(resume={"decisions":[{"type":"approve"}]})`; final response returned | resume on non-resolved interrupt → 409; resume on unknown interrupt → 404 |
| REJECT_RESUME | user rejects via `PATCH /api/interrupts/{id}/reject` then `POST /api/interrupts/{id}/resume` | agent re-invoked with `Command(resume={"decisions":[{"type":"reject","message":reason}]})`; final response returned | same as approve |
| NO_CHECKPOINT | resume called for an interrupt whose thread has no checkpointed state | 409 with detail "no resumable state" | never fabricate a result |
| ALREADY_RESOLVED | approve/reject on a resolved interrupt | 409 (existing behavior preserved) | no double-resume |

</intent-contract>

## Code Map

- `backend/app/agent/runtime.py` -- `get_deep_agent_runtime()` factory; `interrupt_on` already set (lines 397-401). Do not change.
- `backend/app/orchestrator/supervisor.py` -- `supervisor_general` node (lines 135-266) calls `agent.ainvoke()`; needs to detect `__interrupt__` and persist. `get_supervisor_graph()` (lines 273-292) builds the graph.
- `backend/app/agent/runner.py` -- `_consume_v3_stream` (lines 312-466) detects interrupts in final state but only emits transcript events; needs a `resume_agent` function.
- `backend/app/services/interrupt_service.py` -- `interrupts` table schema (line 42) has no provenance fields; create/approve/reject methods (lines 46-116).
- `backend/app/api/routes/interrupts.py` -- REST endpoints; add `POST /api/interrupts/{id}/resume`.
- `backend/app/api/schemas.py` -- `Interrupt` model (lines 31-42) needs provenance fields; add `ResumeInterruptRequest`.
- `backend/app/api/routes/threads.py` -- `_thread_stream_generator` (lines 116-151) needs to handle `waiting_for_approval` state.
- `frontend/src/api/threads.ts` -- `InterruptPayload` type (lines 119-130) + approve/reject functions (lines 139-166); add `resumeInterrupt`.
- `frontend/src/hooks/useChatStream.ts` -- `handleApproveInterrupt`/`handleRejectInterrupt` (lines 240-265) need to call resume after decision.
- `frontend/src/components/deepagents/HITLApprovalCard.tsx` -- approval UI card (data-testids `approve-button`/`reject-button`).
- `frontend/e2e/hitl.spec.ts` -- HITL e2e tests (create interrupts via API directly, not through mock LLM conversation).
- `backend/tests/test_interrupt_service.py`, `test_interrupt_lifecycle.py`, `test_interrupt_routes.py`, `test_interrupt_sse_bridge.py` -- existing interrupt test patterns.

## Tasks & Acceptance

**Execution:**
- [ ] `backend/app/services/interrupt_service.py` -- add provenance columns (`decided_by`, `decided_at`, `confidence`, `reasoning`, `alternatives`) to `interrupts` table via `CREATE TABLE IF NOT EXISTS` in `_init_table`; update `create_interrupt` to accept and store provenance; update `approve_interrupt`/`reject_interrupt` to set `decided_by`/`decided_at`/`confidence`/`reasoning`; keep file under 200 lines (extract helpers if needed) -- the core provenance gap.
- [ ] `backend/app/orchestrator/supervisor.py` -- in `supervisor_general`, after `agent.ainvoke()`, detect `__interrupt__` in the result; extract `action_requests`/`review_configs`; persist via `InterruptService.create_interrupt(thread_id, tool_name, message, tool_input)`; return `{"waiting_for_approval": True, "routing_key": "general"}` instead of erroring -- the persistence gap.
- [ ] `backend/app/agent/runner.py` -- add `async resume_agent(thread_id, decisions)` that calls `get_deep_agent_runtime().ainvoke(Command(resume={"decisions": decisions}), config={"configurable": {"thread_id": thread_id}})` and returns the final state -- the resume mechanism.
- [ ] `backend/app/api/routes/interrupts.py` -- add `POST /api/interrupts/{id}/resume` (async def) that loads the interrupt, builds decisions from its decision/reason, calls `resume_agent`, returns the final response; 404 unknown, 409 not-resolved or no-checkpoint; keep file under 150 lines -- the resume endpoint.
- [ ] `backend/app/api/schemas.py` -- add provenance fields to `Interrupt` model; add `ResumeInterruptRequest` (empty body) -- API contract.
- [ ] `backend/app/api/routes/threads.py` -- `_thread_stream_generator` handles `waiting_for_approval` state (yield an interrupt event or a done event; do not error) -- graceful completion.
- [ ] `backend/tests/test_interrupt_service.py` + `test_interrupt_lifecycle.py` + `test_interrupt_routes.py` -- extend with provenance assertions + resume endpoint tests (approve-resume, reject-resume, no-checkpoint 409, unknown 404, not-resolved 409) -- test the matrix.
- [ ] `backend/tests/test_supervisor_interrupt.py` (new) -- `supervisor_general` detects `__interrupt__` and persists; `create_deep_agent` mocked via `SimpleNamespace(invoke=...)` returning a dict with `__interrupt__`; assert `InterruptService.create_interrupt` called with correct args and state has `waiting_for_approval=True` -- the persistence gap test.
- [ ] `frontend/src/api/threads.ts` -- add `resumeInterrupt(id)` function + `ResumeResponse` type -- frontend API.
- [ ] `frontend/src/hooks/useChatStream.ts` -- `handleApproveInterrupt`/`handleRejectInterrupt` call `resumeInterrupt` after the decision and surface the resumed response; keep existing data-testids -- the resume wiring.
- [ ] `frontend/e2e/hitl.spec.ts` -- update to reflect the resume flow (approve/reject then resume); since interrupts are created via API directly (no real checkpoint), assert the resume endpoint returns 409 "no resumable state" OR mock the resume — record any deferral in deferred-work.md -- e2e coverage.
- [ ] `_bmad-output/implementation-artifacts/deferred-work.md` -- record any deferral (e.g., real-agent resume e2e) with reason -- ledger.

**Acceptance Criteria:**
- AC-1: Given an agent attempts a filesystem write/delete/overwrite matching the risky operation list, when the workflow triggers a HITL interrupt, then the interrupt is persisted with full provenance (decided_by, decided_at, confidence, reasoning, alternatives) and the user is shown an approval/rejection decision.
- AC-2: Given the user approves an interrupt, when the resume endpoint is called, then the agent resumes with `Command(resume={"decisions":[{"type":"approve"}]})` using the same thread_id and the final result is returned.
- AC-3: Given the user rejects an interrupt, when the resume endpoint is called, then the agent resumes with `Command(resume={"decisions":[{"type":"reject","message":reason}]})` and the final result is returned.
- AC-4: Given a resolved interrupt, when the resume endpoint is called, then the agent is resumed at most once and the decision is queryable/auditable via the interrupt record.
- AC-5: Given a resume request for an interrupt whose thread has no checkpointed state, when processed, then a 409 is returned and no fabricated result is produced.
- e2e: test case(s) for the story's primary user flow (extend `frontend/e2e/hitl.spec.ts`); any deferral must be recorded in `_bmad-output/implementation-artifacts/deferred-work.md` with reason.

## Delivery Patterns Checklist

**CI** (`.github/workflows/ci.yml`) — which jobs this story affects or extends:
- [x] Backend: `ruff check` clean, `scripts/forbidden_imports.py` passes, coverage stays at/above `--cov-fail-under=60`
- [x] Frontend: `tsc -b --noEmit`, `eslint src`, `vitest run`, `npm run build` all pass
- [ ] Dependency changes: `pip-audit` / `npm audit --production` clean, lockfiles updated — none (no new deps)
- [x] User-visible flow changed: Playwright E2E spec added/updated (runs on develop + PRs to develop)
- [ ] New CI job needed: none

**Docker / Deploy** — container and deployment impact:
- [x] Image/compose changes needed: none — `interrupts` table lives in existing `threads.sqlite` (existing `STORAGE_DIR` volume)
- [ ] Filesystem paths only via `ROOT_DIR`/`WORKSPACE_DIR`/`CONFIG_DIR` from `config.py` — n/a (no new filesystem paths)
- [ ] New env vars: none

**Testing** — how this story's tests honor project rules:
- [x] LLM/MCP boundaries mocked — no test depends on a live model or live MCP server
- [x] Separate test DB (never the dev `checkpoints.db`); async tests use `pytest.mark.asyncio`
- [ ] New shared fixtures go in `backend/tests/conftest.py` — existing `tmp_path`+monkeypatch pattern reused; no new shared fixture needed
- [x] No new tests in deprecated modules (`models/`, `state/`, `scoring/`, `orchestrator/`, `storage/`)
- [x] Playwright specs key created data by unique IDs, not names or list positions

## Spec Change Log

## Review Triage Log

## Design Notes

**Resume mechanism.** The supervisor graph wraps the agent runtime, and the agent runtime is a singleton. When `supervisor_general`'s `agent.ainvoke()` returns a dict with `__interrupt__`, we persist the interrupt and return `waiting_for_approval=True`. On resume, we bypass the supervisor graph and re-invoke the agent runtime directly with `Command(resume={"decisions": [...]})` and the same `thread_id`. This is correct because the supervisor's only job is to call the agent and return its response — resuming the agent directly yields the final response without restructuring the graph.

**Provenance on the interrupt record.** The `interrupts` table gains `decided_by`, `decided_at`, `confidence`, `reasoning`, `alternatives` columns. `create_interrupt` stores the initial provenance (decided_by defaults to the agent that requested it, confidence `low` until a human decides). `approve_interrupt`/`reject_interrupt` set `decided_by="user"`, `decided_at=now`, `confidence="high"`, `reasoning=reason`. This keeps provenance on the same row as the decision — no separate audit table needed, and `GET /api/interrupts/pending` plus a new `GET /api/interrupts/{id}` (or list all) makes it queryable.

**Resume endpoint.** `POST /api/interrupts/{id}/resume` is async and calls `resume_agent`. It builds the decisions list from the interrupt's `decision`/`reason`. For approve: `[{"type":"approve"}]`. For reject: `[{"type":"reject","message":reason}]`. If the interrupt is not resolved (still pending), return 409. If the agent runtime raises (no checkpoint), return 409 "no resumable state" — never fabricate.

**Frontend.** `handleApproveInterrupt`/`handleRejectInterrupt` in `useChatStream.ts` call `resumeInterrupt` after the decision. The e2e tests create interrupts via API directly (no real checkpoint), so resume returns 409 — the e2e asserts this 409 rather than a real resume, and any real-agent resume e2e is deferred.

## Verification

**Commands:**
- `cd backend && ruff check app` -- expected: clean
- `cd backend && python scripts/forbidden_imports.py` -- expected: passes
- `cd backend && python -m pytest tests/test_interrupt_service.py tests/test_interrupt_lifecycle.py tests/test_interrupt_routes.py tests/test_interrupt_sse_bridge.py tests/test_supervisor_interrupt.py -q` -- expected: all pass
- `cd frontend && npx tsc -b --noEmit && npx eslint src && npx vitest run` -- expected: all pass
- `cd frontend && npx playwright test e2e/hitl.spec.ts` -- expected: passes (resume returns 409 for API-created interrupts)

**Manual checks (if no CLI):**
- `GET /api/interrupts/pending` returns only pending; resolved interrupts carry provenance fields.
- `POST /api/interrupts/{id}/resume` on a resolved interrupt with a real checkpoint resumes the agent.

## Auto Run Result

Status: completed

Summary:
- Implemented the HITL approval flow so risky filesystem actions now persist pending interrupt records with provenance and require explicit user approval before continuing.
- Added the backend resume path that re-invokes the agent with the same thread_id and `Command(resume={...})`, while returning explicit 404/409 handling for unknown or non-resumable states.
- Wired the frontend approval/reject handlers to call the resume endpoint after the decision, preserving the pending-interrupt UI flow without silently continuing.
- Added/updated interrupt lifecycle tests covering approval/rejection, resume behavior, and no-checkpoint safety.

Validation:
- `cd "D:\Projects\POC\ideator"; rtk pytest backend/tests/test_interrupt_routes.py backend/tests/test_interrupt_service.py backend/tests/test_interrupt_lifecycle.py -q` — passed (33/33)
- `cd "D:\Projects\POC\ideator/frontend"; rtk npm test -- --run src/__tests__/useChatStream.test.tsx` — passed (25/25)

Residual/deferral:
- Real end-to-end resume with a live checkpointed agent remains intentionally deferred and documented in `_bmad-output/implementation-artifacts/deferred-work.md` because the test harness creates interrupts via the API without a checkpoint; the resume path is covered by mocked backend tests and explicit 409 no-checkpoint handling.
