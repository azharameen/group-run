---
title: 'Create SSE bridge for interrupt events'
type: 'feature'
created: '2026-08-08'
status: 'done'
review_loop_iteration: 1
baseline_revision: 'ade18b6'
final_revision: '5f6a9a9'
followup_review_recommended: false
context:
  - '{project-root}/_bmad-output/project-context.md'
warnings: []
---

<intent-contract>

## Intent

**Problem:** The interrupt management service (Story 4.1) creates, approves, and rejects interrupts purely as database operations with no real-time notification mechanism. The frontend has no way to know when an interrupt is created (needs to show approval prompt) or when a decision is made (needs to update UI state). The SSE endpoint `/api/sse` that the frontend expects doesn't exist, and the StreamBus infrastructure exists but is unused.

**Approach:** Create the `/api/sse` SSE endpoint backed by StreamBus, then wire the interrupt service to publish typed events (`interrupt.created`, `interrupt.approved`, `interrupt.rejected`) through the bus on every state transition. This bridges the interrupt lifecycle to real-time SSE notifications without coupling the service to HTTP layers.

## Boundaries & Constraints

**Always:**
- Use existing StreamBus singleton (`backend/app/infrastructure/events/stream_bus.py`) — do not create a new event bus
- SSE endpoint uses `StreamingResponse` with `text/event-stream` media type
- Interrupt events include the full interrupt object in the payload for frontend consumption
- Events are published after the database mutation succeeds (not before)
- API route pattern: APIRouter with prefix and tags; route file under 150 lines

**Block If:**
- StreamBus API changes require modifications to its publish method signature

**Never:**
- Modify frontend SSE consumer (out of scope — that's Story 4.5/4.6)
- Change interrupt service CRUD method signatures
- Introduce synchronous blocking calls in the SSE stream

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| SSE connection | GET /api/sse | Returns streaming `text/event-stream` response | Connection errors handled by EventSource |
| Interrupt created | agent calls create_interrupt | SSE event `interrupt.created` with full interrupt payload | Event dropped if no clients connected |
| Interrupt approved | user calls approve endpoint | SSE event `interrupt.approved` with updated interrupt payload | Event emitted only after DB commit |
| Interrupt rejected | user calls reject endpoint | SSE event `interrupt.rejected` with updated interrupt payload | Event emitted only after DB commit |
| No clients connected | interrupt created | Service completes normally, no SSE delivery | No error propagated to service |
| Client disconnects during stream | SSE client closes | StreamBus evicts dead client | No crash, other clients unaffected |

</intent-contract>

## Code Map

- `backend/app/infrastructure/events/stream_bus.py` -- StreamBus singleton with publish() and subscribe() methods
- `backend/app/services/interrupt_service.py` -- InterruptService CRUD methods that need event emission
- `backend/app/api/routes/` -- New route file for SSE endpoint needed
- `backend/app/api/app.py` -- FastAPI app where SSE router is registered
- `backend/app/api/schemas.py` -- Interrupt model already defined, used in event payloads
- `backend/tests/test_stream_bus.py` -- Existing StreamBus tests for publish/subscribe

## Tasks & Acceptance

**Execution:**
- [x] `backend/app/api/routes/sse.py` -- Create SSE route file with GET /api/sse endpoint returning StreamingResponse from StreamBus.subscribe() -- Provides the SSE connection point the frontend expects
- [x] `backend/app/api/app.py` -- Register SSE router in FastAPI app -- Makes the SSE endpoint available
- [x] `backend/app/services/interrupt_service.py` -- Import StreamBus and add publish() calls after create_interrupt, approve_interrupt, reject_interrupt -- Bridges interrupt lifecycle events to SSE consumers
- [x] `backend/tests/test_interrupt_sse_bridge.py` -- Create tests verifying interrupt events are published to SSE bus on create/approve/reject -- Validates the bridge works end-to-end

**Acceptance Criteria:**
- Given no clients connected, when interrupt is created, then service completes without error
- Given SSE client connected, when interrupt is created, then client receives `interrupt.created` event with full interrupt payload
- Given SSE client connected, when interrupt is approved, then client receives `interrupt.approved` event with updated interrupt payload
- Given SSE client connected, when interrupt is rejected, then client receives `interrupt.rejected` event with updated interrupt payload
- Given GET /api/sse, response returns StreamingResponse with media_type text/event-stream

## Spec Change Log

## Review Triage Log

### 2026-08-08 — Review pass
- intent_gap: 0
- bad_spec: 0
- patch: 0
- defer: 2: (medium 1, low 1)
- reject: 8: (low 8)
- addressed_findings:
  - none

## Auto Run Result

**Summary:** Created SSE bridge connecting the interrupt management service to real-time SSE notifications. The bridge publishes typed events (`interrupt.created`, `interrupt.approved`, `interrupt.rejected`) through the existing StreamBus singleton after every interrupt state transition, and exposes the SSE subscription endpoint at `GET /api/sse`.

**Files changed:**
- `backend/app/api/routes/sse.py` — SSE endpoint returning StreamingResponse from StreamBus (13 lines)
- `backend/app/api/app.py` — Registered SSE router (2 lines)
- `backend/app/services/interrupt_service.py` — Added `_bus.publish()` calls after create/approve/reject (17 lines added)
- `backend/tests/test_interrupt_sse_bridge.py` — 4 tests: SSE endpoint type, create/approve/reject event publishing (66 lines)

**Review findings:** 0 patches applied, 2 items deferred (SSE test coverage, publish failure semantics), 8 items rejected (false positives, out of scope)

**Verification:** `pytest backend/tests/test_interrupt_sse_bridge.py -v` → 4 passed; `pytest backend/tests/ -q` → 129 passed, 8 skipped, 0 failures

**Residual risks:** SSE test doesn't verify stream yielding (deferred); publish failure silently drops events without DB rollback (deferred)

## Design Notes

### Event Payload Format

Each interrupt event includes the full interrupt dict from `InterruptService._row_dict()` so the frontend has complete state without additional API calls:

```python
_bus.publish("interrupt.created", {
    "interrupt": interrupt_dict,
    "thread_id": thread_id,
})
```

### StreamBus Integration Pattern

Import StreamBus lazily in interrupt_service to avoid circular dependencies:

```python
from app.infrastructure.events.stream_bus import _bus

# After successful DB mutation:
_bus.publish(event_type, payload)
```

The publish call is fire-and-forget — it doesn't block the interrupt operation if no clients are connected.

### SSE Endpoint Pattern

The endpoint follows the existing SSE pattern expected by the frontend's `connectSSE` function in `frontend/src/api/threads.ts`:

```python
@router.get("/sse")
async def subscribe_sse():
    return StreamingResponse(
        _bus.subscribe(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"}
    )
```

## Verification

**Commands:**
- `pytest backend/tests/test_interrupt_sse_bridge.py -v` -- expected: all tests pass
- `pytest backend/tests/ -q` -- expected: no regressions
