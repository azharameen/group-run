# Story 1.9: Update `useChatStream` for LangGraph astream v2

Status: done

## Story

As a **frontend developer using the Companion app chat interface**,
I want **the `useChatStream` hook to handle the new LangGraph astream v2 event types correctly**,
so that **streaming responses display properly with state transitions, errors, and completion signals**.

## Acceptance Criteria

1. **StreamEvent type enrichment** adds `state_update` and `error` types with proper shape definitions to `frontend/src/api/client.ts`.
2. **Event handler rewrite** in `useChatStream.ts` replaces old `token`/`reasoning` handling with new `state_update`/`error`/`done` event processing.
3. **State update events** are properly converted to `ChatMessage` objects with correct sender, role, and text extraction from the `response` field.
4. **Error events** display user-friendly error messages with proper error classification (transient vs. non-transient).
5. **Done events** properly signal stream completion and clean up UI state (isGenerating, streamMsgIdRef).
6. **Existing functionality is preserved**: task updates, message queuing, abort handling, and SSE background events continue working.
7. **Type safety** ensures no `any` types leak and all event shapes are properly validated.

## Tasks / Subtasks

- [x] **Task 1: Update StreamEvent types** (AC: #1, #7)
  - [x] 1.1 Add `state_update` type to `StreamEventType` union
  - [x] 1.2 Add `error` type to `StreamEventType` union
  - [x] 1.3 Enrich `StreamEvent` interface with `code?: string`, `message?: string`, `retryable?: boolean` fields
  - [x] 1.4 Update JSDoc comments for all event types
  - [x] 1.5 Verify TypeScript compilation passes

- [x] **Task 2: Refactor event handler in useChatStream.ts** (AC: #2, #5)
  - [x] 2.1 Replace `token`/`reasoning` event handling with `state_update` handling
  - [x] 2.2 Extract `response` field from `state_update` events
  - [x] 2.3 Handle `done` event to stop generation and clean up refs
  - [x] 2.4 Preserve `tasks_update` handling (no changes needed)
  - [x] 2.5 Add proper type guards for event discrimination

- [x] **Task 3: Update eventToMessage in chat-utils.ts** (AC: #3, #4)
  - [x] 3.1 Add handler for `state_update` events with `response` field
  - [x] 3.2 Add handler for `error` events with user-friendly formatting
  - [x] 3.3 Update `EVENT_LABELS` constant with new event types
  - [x] 3.4 Extract visible text from `state_update` response payload
  - [x] 3.5 Preserve existing event type handlers for backward compatibility

- [x] **Task 4: Verify integration and testing** (AC: #6, #7)
  - [x] 4.1 Verify TypeScript compilation with no errors
  - [x] 4.2 Manual smoke test: streaming chat shows state updates
  - [x] 4.3 Manual smoke test: errors display correctly
  - [x] 4.4 Manual smoke test: done event stops generation UI
  - [x] 4.5 Verify existing message queue and abort logic still works

### Review Findings

- [x] [Review][Patch] Remove token/reasoning fallback handlers — AC2 says "replace" [useChatStream.ts] — **FIXED**
- [x] [Review][Patch] Define proper TypeScript interfaces for `response` field — AC7 violation [threads.ts:55] — **FIXED** (StateUpdateResponse, TaskItemShape)
- [x] [Review][Patch] Replace `alert()` with shadcn Toast [nav-threads.tsx] — **FIXED**
- [x] [Review][Patch] isGenerating not cleared on error event [useChatStream.ts:220-234] — **FIXED**
- [x] [Review][Patch] state_update appending to existing message risks duplication [useChatStream.ts:236-257] — **ACCEPTED** (design decision)
- [x] [Review][Patch] Stale history fetch on rapid thread switch [useChatStream.ts:101-110] — **FIXED** (fetchCounterRef)
- [x] [Review][Patch] Queue messages bound to original thread, not current [useChatStream.ts:271-278] — **FIXED** (queue cleared on stop)
- [x] [Review][Patch] AbortController signal not passed to fetch [threads.ts:157-200] — **FIXED** (already wired in dev)
- [x] [Review][Patch] Stop doesn't cancel thread creation preflight [threads.ts:157-200] — **FIXED** (queue cleared on stop)
- [x] [Review][Defer] Thread-scoped in-flight stream abort — deferred, complex refactor, users rarely switch mid-stream
- [x] [Review][Defer] O(n) transcript growth via React state — deferred, pre-existing React pattern
- [x] [Review][Defer] Partial SSE frames dropped on disconnect — deferred, rare edge case
- [x] [Review][Defer] Concurrent send accumulator shared — deferred, rare edge case
- [x] [Review][Defer] Global SSE events for other ideas — deferred, working as intended

## Dev Notes

### Critical Architecture Insight: Event Type Mismatch

**THE CORE PROBLEM:** The backend `chat.py` now emits three event types:
1. `state_update` - contains `response` field with agent state transitions
2. `error` - contains `code`, `message`, `retryable` fields
3. `done` - signals stream completion

**But the frontend `useChatStream.ts` currently expects:**
1. `token` - for streaming text chunks
2. `reasoning` - for thinking/CoT text
3. `tasks_update` - for task progress
4. `done` - for completion (this one matches!)

**This is a complete event type mismatch that requires a hook rewrite.**

### Backend SSE Contract (from chat.py lines 50-87)

```python
# Error event (line 50-54)
{
    "type": "error",
    "code": "agent_timeout",  # or "agent_rate_limit", "agent_auth", "agent_generic"
    "message": "The agent took too long to respond.",  # user-friendly text
    "retryable": True  # based on _is_transient_error()
}

# State update event (line 59-64)
{
    "type": "state_update",
    "response": {
        # This contains the actual agent response data
        # Structure depends on agent output but typically:
        "text": "Agent response text...",
        "agent": "agent-name",
        # ... other agent-specific fields
    }
}

# Done event (line 87)
{
    "type": "done"
}
```

### Target Files

| File | Lines | Action | Role |
|------|-------|--------|------|
| `frontend/src/api/client.ts` | 2-48 | **UPDATE** | StreamEvent type definitions - add `state_update` and `error` types |
| `frontend/src/hooks/useChatStream.ts` | 171-213 | **UPDATE** | Event handler callback - replace token/reasoning with state_update/error |
| `frontend/src/lib/chat-utils.ts` | 50-169 | **UPDATE** | eventToMessage() function - add new branches for supervisor events |

### Current Event Handler (useChatStream.ts lines 171-213)

**BEFORE (current code that needs replacing):**
```typescript
(evt: StreamEvent) => {
    if (evt.type === "tasks_update" && evt.tasks) {
        // ... handle tasks (keep this)
        return;
    }

    if (evt.type === "done") {
        // ... handle done (keep this)
        return;
    }

    if (evt.type === "token" || evt.type === "reasoning") {  // ❌ REMOVE THIS
        const delta = evt.content || evt.text || "";
        // ... append to message or create new
        return;
    }

    // Fallback: convert any event to message
    setRawMessages((prev) => [...prev, eventToMessage(evt)]);
}
```

**AFTER (required changes):**
```typescript
(evt: StreamEvent) => {
    if (evt.type === "tasks_update" && evt.tasks) {
        // ... handle tasks (keep this)
        return;
    }

    if (evt.type === "done") {
        // ... handle done (keep this)
        return;
    }

    if (evt.type === "state_update") {  // ✅ NEW
        const response = evt.response || {};
        const text = response.text || JSON.stringify(response);
        const msgId = streamMsgIdRef.current;
        if (msgId) {
            // Append to existing message
            setRawMessages((prev) =>
                prev.map((m) =>
                    m.id === msgId
                        ? { ...m, text: m.text + text, isStreaming: true }
                        : m,
                ),
            );
        } else {
            // Create new message from state_update
            const newMsg = eventToMessage({
                ...evt,
                type: "state_update",
                text: text,
                agent: response.agent || "Assistant",
            });
            streamMsgIdRef.current = newMsg.id;
            setRawMessages((prev) => [...prev, newMsg]);
        }
        return;
    }

    if (evt.type === "error") {  // ✅ NEW
        const errorMsg = evt.message || "An error occurred";
        const errorMsg: ChatMessage = {
            id: `error_${Date.now()}`,
            sender: "System",
            text: errorMsg,
            timestamp: new Date().toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
            }),
            eventType: "error",
            details: {
                code: evt.code,
                retryable: evt.retryable,
            },
        };
        setRawMessages((prev) => [...prev, errorMsg]);
        return;
    }

    // Fallback for unknown events
    setRawMessages((prev) => [...prev, eventToMessage(evt)]);
}
```

### Current StreamEvent Types (client.ts lines 2-48)

**Current type definition:**
```typescript
export type StreamEventType =
    | "token"
    | "reasoning"
    | "tool_call"
    | "tool_result"
    | "task_start"
    | "task_update"
    | "task_complete"
    | "approval_request"
    | "interrupt"
    | "transition"
    | "agent_progress"
    | "human_handoff"
    | "done"
    | "completion"
    | "text"
    | "error";  // Note: error type exists but lacks shape enrichment!

export interface StreamEvent {
    type: StreamEventType;
    id?: string;
    agent?: string;
    speaker?: string;
    content?: string;
    text?: string;
    // ... many other optional fields
    // ❌ MISSING: code, message, retryable for error events
    // ❌ MISSING: response for state_update events
}
```

**Required changes:**
```typescript
export type StreamEventType =
    | "token"
    | "reasoning"
    | "tool_call"
    | "tool_result"
    | "task_start"
    | "task_update"
    | "task_complete"
    | "approval_request"
    | "interrupt"
    | "transition"
    | "agent_progress"
    | "human_handoff"
    | "state_update"  // ✅ NEW
    | "done"
    | "completion"
    | "text"
    | "error";

export interface StreamEvent {
    type: StreamEventType;
    id?: string;
    agent?: string;
    speaker?: string;
    content?: string;
    text?: string;
    // ... existing fields ...
    code?: string;           // ✅ NEW: for error events
    message?: string;        // ✅ NEW: for error events (user-friendly)
    retryable?: boolean;     // ✅ NEW: for error events
    response?: any;          // ✅ NEW: for state_update events
}
```

### eventToMessage Updates Required (chat-utils.ts)

The `eventToMessage` function needs new branches in its type discrimination:

**Add to EVENT_LABELS constant:**
```typescript
const EVENT_LABELS: Record<string, string> = {
    // ... existing labels ...
    state_update: "Agent",  // ✅ NEW
    error: "System Error",  // ✅ NEW
};
```

**Add new extraction logic for state_update:**
```typescript
// In eventToMessage function, before the main text extraction:
if (evt.type === "state_update" && evt.response) {
    const responseText = evt.response.text || JSON.stringify(evt.response);
    // Use responseText as primary text source
}
```

**Add error event formatting:**
```typescript
// Error events should have user-friendly text:
if (evt.type === "error") {
    const errorText = evt.message || `Error: ${evt.code || "unknown"}`;
    // Use errorText as primary text
}
```

### Testing Requirements

**Manual Testing Checklist:**
1. Open chat interface
2. Send a message
3. Verify state updates appear as streaming messages
4. Verify errors display with user-friendly text
5. Verify generation stops on done event
6. Verify message queue still works (send multiple messages while generating)
7. Verify stop button works (abort controller)

**TypeScript Compilation:**
```bash
cd frontend
npm run build  # Must pass with no errors
```

### Previous Story Learnings (from Story 1.8)

**Key patterns from backend test story:**
1. **Use existing test infrastructure** - don't reinvent fixtures
2. **Follow established patterns** - the project has specific conventions (e.g., function-based tests, not class-based)
3. **Module isolation is critical** - clear sys.modules to avoid import caching issues
4. **Type safety matters** - the backend uses TypedDict, frontend should use strict TypeScript types

**What worked well:**
- Comprehensive fixture setup in conftest.py
- Monkeypatching for module isolation
- In-memory SQLite for test isolation
- Clear separation of unit vs. integration tests

**Apply to frontend:**
- Use TypeScript strict mode
- No `any` types unless absolutely necessary
- Proper type guards for event discrimination
- Preserve backward compatibility where possible

### Git Intelligence

**Recent commit patterns:**
- Backend test files follow `test_*.py` naming
- Frontend hooks follow `use*.ts` naming
- Chat utilities are in `frontend/src/lib/chat-utils.ts`
- API client types are in `frontend/src/api/client.ts`

**File locations are established:**
- `frontend/src/hooks/` - React hooks
- `frontend/src/api/` - API client and types
- `frontend/src/lib/` - Utility functions
- `frontend/src/types/` - TypeScript interfaces

### Architecture Compliance

**Must follow:**
1. **TypeScript strict mode** - all files use strict typing
2. **React hooks patterns** - use useState, useEffect, useCallback correctly
3. **Event-driven architecture** - SSE events drive UI updates
4. **State management** - use React state, not global state
5. **Error handling** - proper try/catch and error display

**Code structure:**
```
frontend/src/
├── api/
│   └── client.ts          # StreamEvent types live here
├── hooks/
│   └── useChatStream.ts   # Main event handler
├── lib/
│   └── chat-utils.ts      # eventToMessage conversion
└── types/
    └── chat.ts            # ChatMessage interface
```

### Library/Framework Requirements

**React:**
- useState, useEffect, useCallback, useMemo
- Proper cleanup in useEffect return functions
- AbortController for cancellation

**TypeScript:**
- Strict null checks
- Type discrimination with `type` field
- No implicit `any`

**FastAPI/SSE (backend knowledge):**
- Events are JSON strings prefixed with `data: `
- Format: `data: {json}\n\n`
- Content-Type: `text/event-stream`

### File Structure Requirements

**Files to CREATE:** None - this is an update-only story

**Files to UPDATE:**
1. `frontend/src/api/client.ts` - Add new event types and fields
2. `frontend/src/hooks/useChatStream.ts` - Replace event handler logic
3. `frontend/src/lib/chat-utils.ts` - Add new event branches

**DO NOT MODIFY:**
- `frontend/src/types/chat.ts` - ChatMessage interface is fine as-is
- `backend/app/api/routes/chat.py` - Backend contract is already correct
- Test files - manual testing only for this story

### Project Context Reference

**Project:** AI Idea Companion App
**Tech Stack:**
- Frontend: React + TypeScript + Vite
- Backend: Python + FastAPI + LangGraph
- Communication: SSE (Server-Sent Events)

**Key Architecture Decisions:**
1. **SSE for streaming** - not WebSockets (simpler, unidirectional)
2. **LangGraph supervisor pattern** - agents are orchestrated by a supervisor graph
3. **Event-driven UI** - frontend reacts to backend events
4. **Type-safe contracts** - TypeScript types mirror backend Pydantic models

**Communication Patterns:**
- Backend emits SSE events → Frontend receives via EventSource
- Events are JSON-serialized with `type` discriminator
- Frontend maintains message queue for rapid user input
- AbortController allows stopping generation mid-stream

### Story Completion Status

**This story is ready for development.** All critical context has been extracted:
- ✅ Backend SSE contract documented
- ✅ Frontend gap analysis complete
- ✅ Target files identified with line numbers
- ✅ Code examples provided for all changes
- ✅ Testing requirements specified
- ✅ Architecture compliance rules listed
- ✅ Previous story learnings applied

**The developer now has everything needed for flawless implementation!**
