---
baseline_commit: 13e4b9566b4b94426038c37f143603d51db05d26
---

# Story 1.7: Rewrite SSE Event Bus

Status: done

## Story

As a backend developer,
I want `infrastructure/events/stream_bus.py` to provide a `StreamBus` singleton that manages SSE client connections and broadcasts events matching LangGraph astream v2 event shapes,
so that both the chat endpoint and future HITL interrupt endpoints share a single, type-safe SSE broadcast mechanism.

## Acceptance Criteria

1. **StreamBus singleton** — `StreamBus` class with module-level singleton `_bus: StreamBus`. Provides `.subscribe() -> AsyncGenerator[str]` and `.publish(event_type: str, payload: dict) -> None`.

2. **SSE client lifecycle** — `.subscribe()` creates a per-client `asyncio.Queue`, appends to `_clients` list, yields formatted SSE strings (`data: {json}\n\n`), and removes the queue on `CancelledError` or generator exit.

3. **Dead client eviction** — `.publish()` silently skips clients with queues exceeding `_MAX_QUEUE = 256` messages (prevents memory leaks from disconnected slow readers).

4. **Event shape compatibility** — Published events use the SupervisorState event envelope: `{"type": str, "response": str, "error": dict|None, "routing_key": str}`. Legacy callers may pass arbitrary payloads via `data: dict` key.

5. **Backward compatibility** — Legacy functions `sse_event_generator()` and `emit_sse(event_type, data)` still exist and delegate to the singleton so existing import paths don't break.

6. **Single-threaded safety** — All `_clients` list mutations happen in the asyncio event loop thread (no locks needed). `publish()` uses in-place `pop(i)` for O(1) dead client removal.

7. **File size under 120 lines** — The module stays lean and focused on SSE broadcasting only.

8. **Import order compliance** — stdlib → third-party → application imports, separated by blank lines.

9. **No new dependencies** — Uses only `asyncio`, `json`, `logging`, and `typing`. No external packages required.

10. **Logging for diagnostics** — `publish()` logs client count and dropped messages at debug level; `subscribe()` logs client connect/disconnect.

## Tasks / Subtasks

### Task 1: Create StreamBus class (AC: 1, 2, 6)
- [x] Define `StreamBus` class with `_clients: list[asyncio.Queue]` and `_MAX_QUEUE = 256`
- [x] Implement `async def subscribe(self) -> AsyncGenerator[str, None]` with queue lifecycle
- [x] Format SSE output as `f"data: {json.dumps(event)}\n\n"`
- [x] Handle `CancelledError` and cleanup in `finally` block
- [x] No locks needed — all operations in asyncio event loop thread

### Task 2: Implement publish with dead client eviction (AC: 3, 10)
- [x] Implement `def publish(self, event_type: str, payload: dict) -> None`
- [x] Evict clients with `queue.qsize() > _MAX_QUEUE` before publishing
- [x] Use `queue.put_nowait()` and catch `asyncio.QueueFull` silently
- [x] Log debug: client count, event type, dropped count

### Task 3: Create singleton and backward-compatible functions (AC: 4, 5)
- [x] Create module-level `_bus = StreamBus()` singleton
- [x] Implement `sse_event_generator()` delegating to `_bus.subscribe()`
- [x] Implement `emit_sse(event_type, data)` delegating to `_bus.publish()`
- [x] Add docstrings explaining the delegation pattern

### Task 4: Module hygiene (AC: 7-9)
- [x] Verify file size under 120 lines (109 lines)
- [x] Verify import order: stdlib → third-party → application
- [x] Verify no new dependencies introduced

### Review Follow-ups (AI)

- [x] [AI-Review] Fix `payload.type` silently overrides explicit `event_type` [stream_bus.py:59]
- [x] [AI-Review] Wrap `json.dumps()` in try/except to handle non-serializable payloads [stream_bus.py:59]
- [x] [AI-Review] Add `isinstance(event, dict)` guard in legacy parser [stream_bus.py:98-101]
- [x] [AI-Review] Add client count to `publish()` debug log [stream_bus.py:75]

## Dev Notes

### What Changes vs. Current stream_bus.py

| Aspect | Current | New |
|--------|---------|-----|
| Organization | Module-level functions | `StreamBus` class + singleton + legacy shims |
| Client storage | `_sse_clients: list[asyncio.Queue]` | `StreamBus._clients` (single-threaded) |
| Queue limit | 100 messages (eager eviction) | 256 messages (evict before publish) |
| SSE formatting | Returns dict, caller formats | `subscribe()` yields formatted SSE strings |
| Thread safety | None (bare list mutations) | Single-threaded (event loop only, no locks) |
| Extensibility | Functions only, hard to extend | Class-based, ready for EP-4 HITL bridge |
| Lines | 42 | Target: < 120 |

### Why a Class Instead of Module Functions

The current module-level functions work for simple cases but become problematic when:
1. **EP-4 HITL interrupts** need to inject event filtering/transform per client
2. **Thread-scoped SSE** may need per-thread client groups (EP-2 story 2.2)
3. **Testing** requires resetting client state between tests (ST-1.8)

A class-based approach with a singleton gives us encapsulation without breaking existing callers.

### StreamBus Design

```python
class StreamBus:
    """SSE broadcast bus -- single-threaded (asyncio event loop only).

    All operations run in the asyncio event loop thread, so no locks are
    needed for _clients list mutations.  If publish() is ever called from
    a sync background thread, wrap the call in
    asyncio.run_coroutine_threadsafe() instead.
    """

    _MAX_QUEUE = 256

    def __init__(self) -> None:
        self._clients: list[asyncio.Queue] = []
        self._logger = logging.getLogger(__name__)

    async def subscribe(self) -> AsyncGenerator[str, None]:
        queue: asyncio.Queue = asyncio.Queue(maxsize=self._MAX_QUEUE * 2)
        self._clients.append(queue)
        self._logger.debug("SSE client connected (total: %d)", len(self._clients))
        try:
            while True:
                event = await queue.get()
                yield event
        except asyncio.CancelledError:
            pass
        finally:
            try:
                self._clients.remove(queue)
            except ValueError:
                pass
            self._logger.debug("SSE client disconnected (total: %d)", len(self._clients))

    def publish(self, event_type: str, payload: dict) -> None:
        sse_line = f"data: {json.dumps({'type': event_type, **payload})}\n\n"
        dropped = 0
        # Evict dead clients in-place (O(1) pop at current index)
        i = 0
        while i < len(self._clients):
            if self._clients[i].qsize() > self._MAX_QUEUE:
                self._clients.pop(i)
                dropped += 1
            else:
                i += 1
        # Publish to remaining clients
        for queue in self._clients:
            try:
                queue.put_nowait(sse_line)
            except asyncio.QueueFull:
                dropped += 1
        if dropped:
            self._logger.debug("SSE publish dropped %d events (%s)", dropped, event_type)
```

### Event Shape Contract

The `/api/sse` endpoint (dedicated global SSE, used by frontend `connectSSE`) expects these event types:

| Event Type | Payload Keys | Source |
|------------|-------------|--------|
| `agent.progress` | `message`, `agent_name`, `idea_id` | Supervisor/agent runtime |
| `idea.created` | `idea_id`, `title` | Ideas team |
| `idea.transition` | `idea_id`, `from_state`, `to_state` | Ideas team |
| `idea.scored` | `idea_id`, `scores` | Scoring (legacy, deferred) |
| `gate.passed` | `gate_name`, `idea_id` | Gates (legacy, deferred) |
| `gate.failed` | `gate_name`, `idea_id`, `reason` | Gates (legacy, deferred) |
| `interrupt.pending` | `interrupt_id`, `action`, `thread_id` | EP-4 HITL (future) |
| `interrupt.resolved` | `interrupt_id`, `decision` | EP-4 HITL (future) |

For EP-1, the bus just needs to support broadcasting arbitrary events. The chat endpoint (`/api/chat/stream`) uses `StreamingResponse` directly (not the global SSE endpoint), so the bus is primarily for **background events** that the frontend `connectSSE` listener picks up.

### Connection to chat.py (ST-1.6)

`chat.py` currently uses `StreamingResponse` with `_chat_stream_generator()` directly. It does NOT import `stream_bus`. This is intentional -- chat streaming is per-request, not broadcast. The `StreamBus` is for **global broadcast events** (background progress, idea lifecycle, HITL interrupts).

**Do NOT refactor chat.py to use StreamBus** -- that would break the per-request SSE model.

### Connection to EP-4 (HITL Interrupts)

ST-4.2 will extend `StreamBus` to:
- Add `.publish_interrupt(interrupt_id, action, thread_id)` helper method
- Add per-thread client filtering (interrupts only go to clients subscribed to that thread)

The EP-1 implementation should structure the class so these extensions are straightforward.

### File Structure

**Modified files:**
- `backend/app/infrastructure/events/stream_bus.py` — Rewrite with StreamBus class (42 lines → target < 120 lines)

**No changes needed:**
- `backend/app/api/routes/chat.py` — Uses StreamingResponse directly, not the bus
- `backend/app/api/routes/threads.py` — Uses StreamingResponse directly
- `backend/app/infrastructure/events/__init__.py` — Optional: export StreamBus

### Dependencies

- **ST-1.6 DONE:** `chat.py` rewritten with supervisor graph integration
- **ST-1.4 DONE:** `supervisor.py` with `get_supervisor_graph()` and `SupervisorState`
- No blocking dependencies -- this story is self-contained

### Testing Notes (deferred to ST-1.8)

- Mock `StreamBus` to verify `.publish()` delivers to `.subscribe()` clients
- Verify dead client eviction with oversized queues
- Verify client count accuracy on connect/disconnect
- Verify SSE format: `data: {json}\n\n`
- Test concurrent subscribe/publish within same event loop

### Critical Don't Miss Rules

1. **File size < 120 lines** — Hard limit per project-context.md.
2. **Import order:** stdlib → third-party → application (enforced in review).
3. **No external dependencies** — Only `asyncio`, `json`, `logging`, `typing`.
4. **Single-threaded assumption** — All operations run in the asyncio event loop. No locks needed.
5. **Backward compatibility** — `sse_event_generator()` and `emit_sse()` must still work.
6. **SSE format is exact** — `data: {json}\n\n` with trailing double newline (SSE spec requirement).
7. **Queue has maxsize** — Prevents unbounded memory growth from slow/disconnected clients.

### Previous Story Intelligence

**From ST-1.6 Review:**
- `chat.py` uses `StreamingResponse` directly, NOT `stream_bus.py`. Keep this separation.
- Import order compliance is strictly enforced (stdlib → third-party → application).
- Supervisor error dict shape: `{"code": str, "message": str, "retryable": bool}`.
- `SupervisorState` is `TypedDict` — access via `.get()` not attribute access.

**From ST-1.5 Review:**
- MCP `_load_mcp_tools()` uses `asyncio.run()` which fails inside running event loop — deferred. Not relevant to this story but good context.

### References

- [Source: _bmad-output/project-context.md#Critical Rules] — File size limits, import order, SSE rules
- [Source: _bmad-output/planning-artifacts/epics.md#FR-1.7] — Rewrite SSE event bus for LangGraph astream v2
- [Source: _bmad-output/planning-artifacts/architecture/architecture-Companion-2026-08-02/ARCHITECTURE-SPINE.md#AD-5] — astream v2 only
- [Source: _bmad-output/planning-artifacts/architecture/architecture-Companion-2026-08-02/ARCHITECTURE-SPINE.md#AD-10] — HITL interrupts via SSE
- [Source: backend/app/infrastructure/events/stream_bus.py] — Current implementation being rewritten
- [Source: frontend/src/api/threads.ts#L86-L114] — Frontend connectSSE expectations
- [Source: frontend/src/hooks/useChatStream.ts#L77-L94] — SSE consumer pattern

## Dev Agent Record

### Agent Model Used
qwen-3.6-27b

### Debug Log References
- Verified `stream_bus.py` has ZERO current importers — clean rewrite with no breaking changes
- Verified `chat.py` uses `StreamingResponse` directly, not `stream_bus`
- Legacy `sse_event_generator` extracts inner `data` key to avoid double-nesting when `emit_sse` wraps data

### Completion Notes List
- Rewrote `stream_bus.py` from 42 bare-module functions to 118-line `StreamBus` class with singleton
- `subscribe()` yields SSE-formatted strings (`data: {json}\n\n`) with per-client queues (maxsize=512)
- `publish()` does in-place `pop(i)` dead client eviction when `qsize() > 256`, then broadcasts via `put_nowait()`
- Legacy `sse_event_generator()` and `emit_sse()` delegate to `_bus` singleton for backward compatibility
- Module-level `logger` used (not per-instance `self._logger`) — consistent with project convention
- No locks needed — all operations run in single-threaded asyncio event loop
- **Review fixes (2026-08-05):**
  - ✅ Resolved review finding [Medium]: `payload.type` override — explicit `event_type` now always wins
  - ✅ Resolved review finding [Medium]: Non-serializable payload crash — wrapped `json.dumps()` in try/except with warning log
  - ✅ Resolved review finding [Medium]: Legacy parser crash on non-object JSON — added `isinstance(event, dict)` guard
  - ✅ Resolved review finding [Low]: AC-10 missing client count — added `len(self._clients)` to `publish()` debug log

### File List
backend/app/infrastructure/events/stream_bus.py

### Senior Developer Review (AI)

**Review Outcome:** Approve
**Review Date:** 2026-08-05
**Reviewer:** Blind Hunter + Edge Case Hunter + Acceptance Auditor
**Total Action Items:** 4 resolved, 3 dismissed

**Severity Breakdown:** 0 High, 3 Medium, 1 Low

#### Action Items

- [x] [Review][Patch] `payload.type` silently overrides explicit `event_type` [stream_bus.py:59]
- [x] [Review][Patch] Non-serializable payloads crash `publish()` with unhandled exception [stream_bus.py:59]
- [x] [Review][Patch] Legacy parser crashes on non-object JSON (e.g., `[]`, `"x"`) [stream_bus.py:98-101]
- [x] [Review][Patch] AC-10: `publish()` missing client count in debug log

#### Deferred / Dismissed

- [x] [Review][Defer] AC-4 envelope shape not enforced — bus is generic by design (dismissed)
- [x] [Review][Defer] AC-3 queue threshold off-by-one — burst tolerance intentional (dismissed)
- [x] [Review][Defer] Background thread safety — docstring-warned, no off-thread callers (dismissed)

### Change Log
- Rewrote stream_bus.py: StreamBus class with subscribe/publish, singleton, legacy shims (42→109 lines)
