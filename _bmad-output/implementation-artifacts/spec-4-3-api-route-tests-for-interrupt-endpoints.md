---
title: 'Create API route tests for interrupt endpoints'
type: 'feature'
created: '2026-08-08'
status: 'done'
review_loop_iteration: 1
baseline_revision: '7554d0b'
final_revision: 'e5e2b1e'
followup_review_recommended: false
context:
  - '{project-root}/_bmad-output/project-context.md'
warnings: []
---

<intent-contract>

## Intent

**Problem:** The interrupt API endpoints (created in Story 4.1) have no HTTP-level route tests. The existing `test_interrupt_service.py` covers the service layer, and `test_interrupt_sse_bridge.py` covers SSE publishing, but nothing validates the REST contract: status codes, request validation, error responses, and payload structure at the API boundary.

**Approach:** Create API route integration tests using FastAPI's `TestClient` to exercise all four interrupt endpoints (GET /pending, POST /, PATCH /approve, PATCH /reject), verifying status codes, JSON payloads, error cases (404, 409), and pydantic validation.

## Boundaries & Constraints

**Always:**
- Use `TestClient(create_app())` pattern consistent with existing API tests
- Mock the interrupt service or use isolated DB fixtures (tmp_path) to avoid polluting production DB
- Test all HTTP methods and paths defined in `routes/interrupts.py`
- Test both happy paths and error responses (404, 409, 422)
- Route file under 150 lines

**Block If:**
- `create_app()` raises at test time due to missing dependencies

**Never:**
- Modify the interrupt service or routes under test
- Test SSE behavior (covered by test_interrupt_sse_bridge.py)
- Test service-level CRUD logic (covered by test_interrupt_service.py)

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| List pending empty | No interrupts created | 200 with `{"interrupts": []}` | No error |
| List pending with data | Interrupts in pending state | 200 with `{"interrupts": [...]}` | No error |
| Create interrupt | Valid CreateInterruptRequest | 201 with InterruptResponse | No error |
| Create interrupt missing fields | Missing thread_id | 422 validation error | Pydantic error response |
| Approve existing | Valid decision payload | 200 with approved InterruptResponse | No error |
| Approve nonexistent | Nonexistent interrupt_id | 404 "Interrupt not found" | HTTPException |
| Approve already resolved | Previously approved interrupt | 409 "Interrupt already resolved" | HTTPException |
| Reject existing | Valid decision payload | 200 with rejected InterruptResponse | No error |
| Reject nonexistent | Nonexistent interrupt_id | 404 "Interrupt not found" | HTTPException |
| Reject already resolved | Previously rejected interrupt | 409 "Interrupt already resolved" | HTTPException |

</intent-contract>

## Code Map

- `backend/app/api/routes/interrupts.py` -- Target routes under test (4 endpoints)
- `backend/app/api/schemas.py` -- Request/response schemas (CreateInterruptRequest, InterruptDecisionRequest, InterruptResponse)
- `backend/app/api/app.py` -- FastAPI app factory (create_app)
- `backend/tests/test_ideas_crud.py` -- Reference pattern for TestClient API tests
- `backend/tests/test_interrupt_service.py` -- Service-level tests (complementary, not duplicating)

## Tasks & Acceptance

**Execution:**
- [x] `backend/tests/test_interrupt_routes.py` -- Create API route tests covering all 4 endpoints with happy paths, error codes (404, 409), and validation errors (422) -- Validates the REST contract at the HTTP boundary

**Acceptance Criteria:**
- Given no interrupts exist, when GET /api/interrupts/pending is called, then response is 200 with empty interrupts list
- Given a valid CreateInterruptRequest body, when POST /api/interrupts/ is called, then response is 201 with InterruptResponse containing the new interrupt
- Given a request missing required fields, when POST /api/interrupts/ is called, then response is 422 with validation error
- Given a valid interrupt exists, when PATCH /api/interrupts/{id}/approve is called with valid payload, then response is 200 with approved interrupt
- Given a nonexistent interrupt_id, when PATCH /api/interrupts/{id}/approve is called, then response is 404
- Given an already-approved interrupt, when PATCH /api/interrupts/{id}/approve is called again, then response is 409
- Given a valid interrupt exists, when PATCH /api/interrupts/{id}/reject is called with valid payload, then response is 200 with rejected interrupt
- Given a nonexistent interrupt_id, when PATCH /api/interrupts/{id}/reject is called, then response is 404
- Given an already-rejected interrupt, when PATCH /api/interrupts/{id}/reject is called again, then response is 409

## Spec Change Log

## Review Triage Log

### 2026-08-08 — Review pass
- intent_gap: 0
- bad_spec: 0
- patch: 1: (low 1)
- defer: 6: (medium 2, low 4)
- reject: 5: (low 5)
- addressed_findings:
  - `[low]` `[patch]` Added full field validation to create response test (tool_name, message, status)

## Auto Run Result

**Summary:** Created comprehensive API route integration tests for all 4 interrupt endpoints (GET /pending, POST create, PATCH approve, PATCH reject) covering happy paths, error codes (404, 409), and pydantic validation errors (422). Tests use isolated SQLite DB via monkeypatched checkpointer to avoid polluting production DB.

**Files changed:**
- `backend/tests/test_interrupt_routes.py` — 10 API route tests with tmp_path DB isolation (90 lines)

**Review findings:** 1 patch applied (create response field validation), 6 items deferred (error body verification, filtering/ordering, cross-resolution, malformed IDs, persistence verification, decision validation), 5 items rejected (false positives, out of scope)

**Verification:** `pytest backend/tests/test_interrupt_routes.py -v` → 10 passed; `pytest backend/tests/ -q` → 139 passed, 8 skipped, 0 failures

**Residual risks:** Error response bodies unverified (deferred); cross-resolution conflicts untested (deferred); decision payload validation gap (deferred)

## Design Notes

### Test Fixtures Pattern

Following the existing `test_interrupt_service.py` pattern with tmp_path DB isolation. The test file uses `TestClient(create_app())` to get a full app instance, then calls the HTTP endpoints directly. Since `create_app()` wires real services, the tests exercise the full request lifecycle through FastAPI middleware and pydantic validation.

### Scope Boundary

This story tests the *API layer* — HTTP methods, status codes, pydantic validation, and response wrapping. The underlying service CRUD logic is tested by `test_interrupt_service.py`, and the SSE bridge is tested by `test_interrupt_sse_bridge.py`. This file fills the gap between HTTP and service layers.

## Verification

**Commands:**
- `pytest backend/tests/test_interrupt_routes.py -v` -- expected: all tests pass
- `pytest backend/tests/ -q` -- expected: no regressions
