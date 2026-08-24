# SSE and Streaming Edge Cases

This document describes the design, mechanics, and edge-case handling of the Server-Sent Events (SSE) and HTTP streaming infrastructure in Companion.

______________________________________________________________________

## Architecture Overview

Companion uses two distinct streaming channels between the FastAPI backend and React frontend:

```text
┌─────────────────────────────────────────────────────────────────────────────┐
│                             BACKEND SERVICES                                │
│                                                                             │
│  astream v2 / ainvoke        StreamBus (_bus singleton)                      │
│  (Supervisor Graph)          (Application-wide SSE Broadcaster)             │
└──────────┬─────────────────────────────────────┬────────────────────────────┘
           │                                     │
    POST /api/chat/stream                 GET /api/sse
    POST /api/threads/{id}/stream         (EventSource)
           │                                     │
┌──────────┴─────────────────────────────────────┴────────────────────────────┐
│                             FRONTEND LAYER                                  │
│                                                                             │
│  streamThreadMessage()              connectSSE()                            │
│  (Fetch + ReadableStream Reader)    (EventSource Connection)                │
│                                  │                                          │
│                                  ▼                                          │
│                         useChatStream Hook                                  │
│                   (State, Queue & Interrupt Sync)                           │
└─────────────────────────────────────────────────────────────────────────────┘
```

1. **Request-Scoped Streaming (`POST /api/chat/stream`, `POST /api/threads/{thread_id}/stream`)**:
1. Transports agent reasoning, state updates, errors, and task updates for a specific user prompt.
1. Powered by FastAPI `StreamingResponse` wrapping `astream` v2 or `ainvoke`.
1. Consumed via `fetch` with `ReadableStream` reader in [`frontend/src/api/threads.ts`](https://azharameen.github.io/frontend/src/api/threads.ts).
1. **Global Event Bus Streaming (`GET /api/sse`)**:
1. Transports asynchronous system-wide events (`agent.progress`, `idea.created`, `idea.scored`, `interrupt.created`, `interrupt.approved`, `interrupt.rejected`).
1. Powered by `StreamBus` broadcast bus in [`backend/app/infrastructure/events/stream_bus.py`](https://azharameen.github.io/backend/app/infrastructure/events/stream_bus.py).
1. Consumed via browser native `EventSource` in [`frontend/src/api/threads.ts`](https://azharameen.github.io/frontend/src/api/threads.ts).

______________________________________________________________________

## Edge Cases and Behavior Specifications

### 1. Connection Loss and Reconnect Semantics

#### Backend: Client Queue Management and Eviction

- **Implementation**: [`backend/app/infrastructure/events/stream_bus.py`](https://azharameen.github.io/backend/app/infrastructure/events/stream_bus.py) (`StreamBus.subscribe`, `StreamBus.publish`)
- **Behavior**:
- Each connected `EventSource` client is allocated an `asyncio.Queue` with a maximum capacity (`_MAX_QUEUE = 256`).
- When a client disconnects or falls behind, its queue fills up. Before publishing an event, `StreamBus.publish` inspects all queues and evicts dead clients whose queue depth exceeds `_MAX_QUEUE`.
- If a client queue is full at the moment of publishing, `asyncio.QueueFull` is caught, the event is dropped for that specific client, and other healthy clients continue receiving events without blocking.
- Disconnected clients raise `asyncio.CancelledError` inside `StreamBus.subscribe()`, which triggers cleanup removing the queue from the client list.

#### Frontend: SSE Reconnection and State Reconciliation

- **Implementation**: [`frontend/src/api/threads.ts`](https://azharameen.github.io/frontend/src/api/threads.ts) (`connectSSE`), [`frontend/src/hooks/useChatStream.ts`](https://azharameen.github.io/frontend/src/hooks/useChatStream.ts) (`useEffect` hook)
- **Behavior**:
- Browser `EventSource` automatically attempts reconnection upon network loss or server restart.
- When `EventSource` triggers the `onerror` event, `connectSSE` delegates to the `onError` callback provided by `useChatStream`.
- `useChatStream` invokes a state recovery handler that fetches pending Human-In-The-Loop (HITL) interrupts from `GET /api/interrupts/pending`.
- If pending interrupts exist on the server, the frontend state (`pendingInterrupt`) is re-hydrated with the latest pending interrupt; otherwise, stale pending interrupts are cleared.

#### Frontend: Stream Cancellation and Abort Handling

- **Implementation**: [`frontend/src/hooks/useChatStream.ts`](https://azharameen.github.io/frontend/src/hooks/useChatStream.ts) (`handleStopGeneration`, `useEffect` on `activeThreadId`)
- **Behavior**:
- An `AbortController` (`abortRef`) controls active fetch streams.
- **Manual Cancellation**: User clicking stop calls `handleStopGeneration()`, which invokes `abortRef.current.abort()`, sets `isGenerating` to `false`, and clears the pending `messageQueue`.
- **Thread Switch Cancellation**: Switching `activeThreadId` automatically aborts any in-flight stream for the previous thread before loading checkpoint messages for the new thread.
- Abort errors (`AbortError`) are caught silently in `executeSend` to prevent error alerts or false system messages when stream cancellation is intentional.

______________________________________________________________________

### 2. Partial Frame and Buffer Handling

- **Implementation**: [`frontend/src/api/threads.ts`](https://azharameen.github.io/frontend/src/api/threads.ts) (`streamChat`, `streamThreadMessage`)
- **Behavior**:
- SSE frames sent over HTTP chunked transfer encoding may be fragmented across multiple TCP packets or buffer boundaries.
- Frontend stream readers process incoming bytes using a `TextDecoder` stream reader (`decoder.decode(value, { stream: true })`).
- Read chunks are appended to a persistent string `buffer`.
- The buffer is split by newline `\n` characters: `const lines = buffer.split('\n')`.
- **Incomplete Line Preservation**: The trailing item `buffer = lines.pop() ?? ''` retains any incomplete trailing frame line in the buffer until the next read chunk supplies the remaining line content.
- Lines starting with `data:` are extracted and parsed via `JSON.parse()`. Malformed or incomplete JSON syntax errors are swallowed silently (`catch {}`) until complete lines arrive.

______________________________________________________________________

### 3. Event Ordering and Stream Lifecycle

- **Implementation**: [`backend/app/api/routes/chat.py`](https://azharameen.github.io/backend/app/api/routes/chat.py) (`_chat_stream_generator`), [`backend/app/api/routes/threads.py`](https://azharameen.github.io/backend/app/api/routes/threads.py) (`_thread_stream_generator`), [`frontend/src/hooks/useChatStream.ts`](https://azharameen.github.io/frontend/src/hooks/useChatStream.ts) (`executeSend`)

#### Stream Event Lifecycle Sequence

1. **`state_update`**: Emitted as the agent reasoning or output progresses. Frontend appends stream chunks incrementally to the message response (`streamMsgIdRef`).
1. **`tasks_update`**: Emitted when agent execution updates task execution progress or status counts.
1. **`interrupt`**: Emitted when an agent requires human approval before proceeding with tool execution.
1. **`error`**: Emitted when processing fails or graph execution raises an exception.
1. **`done`**: **Guaranteed Terminal Event**. Always emitted as the final frame.

#### Terminal Frame Guarantee

- Both `_chat_stream_generator` and `_thread_stream_generator` track whether a terminal event (`state_update` with response/error or explicit `error`) was emitted (`emitted_done` flag).
- In a `finally:` block, if `emitted_done` is `False`, the backend explicitly yields `data: {"type": "done"}\n\n`.
- This ensures the frontend `executeSend` handler receives completion notification even when empty responses or unhandled edge cases occur, resetting `isGenerating` to `false`.

______________________________________________________________________

### 4. Error Propagation and Normalization

- **Implementation**: [`backend/app/api/routes/chat.py`](https://azharameen.github.io/backend/app/api/routes/chat.py) (`_error_shape`, `_chat_stream_generator`), [`backend/app/api/routes/threads.py`](https://azharameen.github.io/backend/app/api/routes/threads.py) (`_thread_stream_generator`), [`frontend/src/hooks/useChatStream.ts`](https://azharameen.github.io/frontend/src/hooks/useChatStream.ts) (`executeSend`)

#### Error Payload Structure

Backend stream errors are normalized into a standardized error object:

```json
{
  "type": "error",
  "error": {
    "code": "streaming_failure",
    "message": "An error occurred while processing your request. Please try again.",
    "retryable": true
  },
  "routing_key": "general"
}
```

#### Exception Guarding

- **Never Crash SSE**: The backend stream generators wrap execution in `try ... except Exception as exc`. Unhandled exceptions do not break the HTTP connection abruptly; instead, an error event payload is serialized and yielded over SSE.
- **Frontend Presentation**: When an `error` event is received, `useChatStream` stops streaming, resets `streamMsgIdRef = null`, sets `isGenerating = false`, and appends a `System` error message to the transcript containing error details and retryability metadata.

______________________________________________________________________

### 5. Interrupt State Reload on Reconnect

- **Implementation**: [`backend/app/api/routes/interrupts.py`](https://azharameen.github.io/backend/app/api/routes/interrupts.py), [`backend/app/services/interrupt_service.py`](https://azharameen.github.io/backend/app/services/interrupt_service.py), [`frontend/src/hooks/useChatStream.ts`](https://azharameen.github.io/frontend/src/hooks/useChatStream.ts)

#### Interrupt Flow and Deduplication

1. **Creation**: When an agent triggers an interrupt, an `interrupt.created` event is published over `StreamBus` and stored in SQLite via `InterruptService`.
1. **Stream Interception**: The active chat stream yields an `interrupt` stream event. `useChatStream` sets `pendingInterrupt` and appends a visual system approval notification to `rawMessages`.
1. **Deduplication (`activeInterruptIdRef`)**:
1. To prevent duplicate approval notifications when both the stream reader and `StreamBus` deliver the same interrupt event, `useChatStream` maintains `activeInterruptIdRef`.
1. If an incoming interrupt event ID matches `activeInterruptIdRef.current`, it is skipped.
1. **Reconnection Sync**:
1. If the network drops while an interrupt is active, the frontend `EventSource` reconnect handler calls `GET /api/interrupts/pending`.
1. The latest pending interrupt is re-restored to `pendingInterrupt` and `activeInterruptIdRef`, ensuring the user approval dialog remains visible and actionable.
1. **Resolution**: When approved (`PATCH /api/interrupts/{id}/approve`) or rejected (`PATCH /api/interrupts/{id}/reject`), `interrupt.approved` or `interrupt.rejected` events clear `pendingInterrupt` and reset `activeInterruptIdRef` to `null`.

______________________________________________________________________

## File Reference Summary

| Layer                   | File Path                                         | Responsible Function / Logic                                                  |
| ----------------------- | ------------------------------------------------- | ----------------------------------------------------------------------------- |
| **Backend Stream API**  | `backend/app/api/routes/chat.py`                  | `_chat_stream_generator`, `_error_shape`, `stream_chat`                       |
| **Backend Thread API**  | `backend/app/api/routes/threads.py`               | `_thread_stream_generator`, `api_stream_message`                              |
| **Backend Event Bus**   | `backend/app/infrastructure/events/stream_bus.py` | `StreamBus.subscribe`, `StreamBus.publish`                                    |
| **Backend SSE Route**   | `backend/app/api/routes/sse.py`                   | `sse` endpoint (`_bus.subscribe`)                                             |
| **Backend Interrupts**  | `backend/app/api/routes/interrupts.py`            | `list_pending`, `approve_interrupt`, `reject_interrupt`                       |
| **Frontend API Client** | `frontend/src/api/threads.ts`                     | `connectSSE`, `streamChat`, `streamThreadMessage`, `fetchPendingInterrupts`   |
| **Frontend Hook**       | `frontend/src/hooks/useChatStream.ts`             | `useChatStream` (stream consuming, queueing, interrupt reload, abort control) |
