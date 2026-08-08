# Epic 4 Context: HITL Approvals

<!-- Generated from planning artifacts. Regenerate with compile-epic-context if planning docs change. -->

## Goal

Implement human-in-the-loop approvals for destructive agent actions so file write, delete, and overwrite operations pause for user review, stream an approval prompt to the frontend in real time, and resume or reject safely without breaking the agent flow.

## Stories

- Story 4.0: Fix 6 pre-existing test failures (prep story before Epic 4 feature stories)
- Story 4.1: Create interrupt management service (approve/reject/resume)
- Story 4.2: Create SSE bridge for interrupt events
- Story 4.3: Create interrupt API endpoints (approve, reject, list pending)
- Story 4.4: Backend tests: interrupt lifecycle
- Story 4.5: Create HITL approval UI component (approve/reject prompts)
- Story 4.6: Wire approval UI into chat stream
- Story 4.7: Frontend tests: approval UI

## Requirements & Constraints

- Any filesystem-mutating tool must be added to interrupt_on in agent/runtime.py
- MCP tools bypass permissions model (ADR-013) — treat as untrusted
- SSE streaming for interrupt events via useDeepAgentStream hook
- Backend returns snake_case; frontend must preserve
- File-size limits: route files under 150 lines, services under 200 lines
- API route pattern: APIRouter with prefix and tags
- Never fabricate output — core project principle

## Technical Decisions

- Interrupt management service handles approve/reject/resume lifecycle
- SSE bridge connects interrupt events from backend to frontend
- HITL approval UI component shows approve/reject prompts in chat stream
- Dependencies on Epic 3: clean CRUD routes, lean idea model, stable thread hooks
- Checkpointer uses sync SqliteSaver created at startup

## Cross-Story Dependencies

- ST-4.0 must complete before ST-4.1 through ST-4.7 begin
- ST-4.1 (interrupt service) is prerequisite for ST-4.2 (SSE bridge) and ST-4.3 (API endpoints)
- ST-4.4 (backend tests) depends on ST-4.1, ST-4.2, ST-4.3
- ST-4.5 (HITL UI) depends on ST-4.2 (SSE bridge) being ready
- ST-4.6 (wire UI into chat) depends on ST-4.5
- ST-4.7 (frontend tests) depends on ST-4.5, ST-4.6
- Epic 3 must be complete (clean CRUD routes, idea model)
