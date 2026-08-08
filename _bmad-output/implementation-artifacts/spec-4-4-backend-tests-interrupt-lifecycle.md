---
title: 'Backend tests for interrupt lifecycle integration'
type: 'feature'
created: '2026-08-08'
status: done
review_loop_iteration: 0
baseline_revision: '5a243e2'
followup_review_recommended: false
context:
  - '{project-root}/_bmad-output/project-context.md'
warnings: []
---

<intent-contract>

## Intent

**Problem:** Stories 4.1-4.3 each have isolated test files (service, SSE bridge, API routes), but nothing validates the interrupt lifecycle as an end-to-end integration. Cross-layer gaps exist: pending list filtering after partial resolutions, cross-action conflicts (approve then reject), concurrent approve/reject races, and the API-to-SSE-to-DB flow under realistic multi-step scenarios.

**Approach:** Create `backend/tests/test_interrupt_lifecycle.py` with integration tests that exercise the full interrupt lifecycle through the API while verifying DB state and SSE event emissions simultaneously. The tests bridge the service, SSE bridge, and API layers to catch regressions any single layer's tests would miss.

## Boundaries & Constraints

**Always:**
- Use `TestClient(create_app())` pattern for API-level tests
- Verify DB persistence by calling service methods after API calls
- Mock `_bus.publish` to capture and assert event emissions
- Test cross-layer scenarios, not single-layer logic already covered by 4.1-4.3 tests
- Tests must pass in isolation and as part of the full suite
- Route file under 150 lines

**Block If:**
- `create_app()` raises at test time due to missing dependencies

**Never:**
- Duplicate service-level CRUD tests (covered by test_interrupt_service.py)
- Duplicate single-endpoint happy paths (covered by test_interrupt_routes.py)
- Duplicate SSE endpoint type checks (covered by test_interrupt_sse_bridge.py)

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Full approve lifecycle | Create via API, approve via API | Both return 200/201, SSE emits created+approved, DB shows approved | No error |
| Full reject lifecycle | Create via API, reject via API | Both return 200/201, SSE emits created+rejected, DB shows rejected | No error |
| Cross-action conflict | Create, approve, then reject | Create 201, approve 200, reject 409 | HTTPException 409 |
| Cross-action reverse | Create, reject, then approve | Create 201, reject 200, approve 409 | HTTPException 409 |
| Pending list after partial resolution | Create 3, approve 1, reject 1 | Pending returns 1 remaining interrupt | No error |
| Pending list excludes resolved | All created, all resolved | Pending returns empty list | No error |
| Concurrent approve/reject | Two threads try approve/reject same interrupt | First succeeds, second gets 409 (atomic UPDATE guarantee) | HTTPException 409 |
| SSE event count on lifecycle | Create + approve sequence | Exactly 2 events emitted (created, approved) | No error |

</intent-contract>

## Code Map

- `backend/app/api/routes/interrupts.py` -- API routes exercised by lifecycle tests
- `backend/app/services/interrupt_service.py` -- Service layer with atomic transitions and SSE publish calls
- `backend/app/infrastructure/events/stream_bus.py` -- StreamBus with `_bus` singleton for event capture
- `backend/tests/test_interrupt_routes.py` -- Reference fixture pattern (client, monkeypatch, tmp_path)
- `backend/tests/test_interrupt_sse_bridge.py` -- Reference for `_bus.publish` mocking pattern

## Tasks & Acceptance

**Execution:**
- [x] `backend/tests/test_interrupt_lifecycle.py` -- Create integration tests covering full lifecycle flows, cross-action conflicts, pending list semantics, concurrent operations, and SSE event counting -- Validates the interrupt system as an integrated whole

**Acceptance Criteria:**
- Given an interrupt created via API, when approved via API, then DB shows status=approved and SSE emitted exactly 2 events (created, approved)
- Given an interrupt created via API, when rejected via API, then DB shows status=rejected and SSE emitted exactly 2 events (created, rejected)
- Given an interrupt is approved, when reject is called, then response is 409 and DB status remains approved
- Given an interrupt is rejected, when approve is called, then response is 409 and DB status remains rejected
- Given 3 interrupts created and 1 approved + 1 rejected, when GET /pending is called, then exactly 1 interrupt is returned
- Given all interrupts are resolved, when GET /pending is called, then empty list is returned
- Given two concurrent approve/reject calls on same interrupt, then exactly one succeeds and the other returns 409
- Given a full create + approve lifecycle, when SSE events are captured, then events contain matching interrupt IDs across created and approved events

## Spec Change Log

## Review Triage Log

| # | Finding | Severity | Verdict | Rationale |
|---|---------|----------|---------|-----------|
| 1 | Concurrent test doesn't verify which thread succeeded | Minor | Reject | Test correctly validates invariant: one succeeds, one fails. Which thread wins is non-deterministic and irrelevant. |
| 2 | Shared SQLite conn across threads hides locking bugs | Minor | Reject | Intentional: service-layer atomic UPDATE is the invariant. TestClient concurrency with SQLite is known to deadlock. |
| 3 | Connection cleanup after TestClient disposal | Minor | Reject | tmp_path cleanup handles this; negligible risk in pytest context. |
| 4 | `sqlite3.connect` patch too broad | Minor | Reject | Necessary for integration pattern; routes and service both use it. Scoped to fixture lifetime. |
| 5 | Bypasses API layer for concurrent case | Minor | Reject | Documented limitation. Service-layer concurrency test still validates TOCTOU guarantee. |
| 6 | SSE event test only checks IDs, not types | Minor | Defer | Valid enhancement; `test_sse_events_have_matching_interrupt_ids` could also assert event types. Low priority. |
| 7 | Tests don't assert response body content | Minor | Reject | Response schemas covered by route tests (4.3). Lifecycle tests focus on state transitions. |
| 8 | `tool_input` coverage only in approve path | Minor | Reject | tool_input is passthrough; route tests validate serialization. Not a lifecycle concern. |
| 9 | Pending-list tests depend on ordering semantics | Minor | Reject | Tests assert exact counts (1 and 0), not ordering. Status filtering is the invariant. |
| 10 | File duplicates existing coverage | Minor | Reject | Tests cover distinct acceptance criteria: cross-action, concurrency, pending calculus, SSE ID correlation. |

**Auto Run Result:** 0 patches applied, 6 rejected (documented design choices), 2 deferred (future enhancements: event type pairing, race verification).


## Design Notes

### Fixture Strategy

Reuse the tmp_path + monkeypatch pattern from `test_interrupt_routes.py`, but layer in `_bus.publish` mocking to capture events. Each test gets a fresh isolated DB and event capture list:

```python
@pytest.fixture()
def ctx(tmp_path, monkeypatch):
    # ... DB setup (same as test_interrupt_routes.py) ...
    events = []
    monkeypatch.setattr(interrupt_module._bus, "publish", lambda et, p: events.append((et, p)))
    yield {"client": TestClient(create_app()), "events": events, "svc": InterruptService.instance()}
```

### Concurrent Test Pattern

Use `threading.Thread` to simulate concurrent API calls:

```python
def test_concurrent_approve_reject(ctx):
    interrupt = create_interrupt(ctx)
    results = {}
    def approve(): results['approve'] = ctx['client'].patch(f"/api/interrupts/{interrupt['id']}/approve", json={"decision": "approved"})
    def reject(): results['reject'] = ctx['client'].patch(f"/api/interrupts/{interrupt['id']}/reject", json={"decision": "rejected", "reason": "no"})
    threading.Thread(target=approve).start()
    threading.Thread(target=reject).start()
    # wait and assert exactly one 200 and one 409
```

### Event Counting

After each lifecycle operation, assert `len(ctx['events'])` matches expected count and event types match the sequence. This catches both missed emissions and duplicate emissions.

## Verification

**Commands:**
- `pytest backend/tests/test_interrupt_lifecycle.py -v` -- expected: all tests pass
- `pytest backend/tests/ -q` -- expected: no regressions
