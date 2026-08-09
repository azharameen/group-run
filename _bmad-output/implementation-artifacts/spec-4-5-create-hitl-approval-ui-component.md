---
title: 'Create HITL approval UI component (approve/reject prompts)'
type: 'feature'
created: '2026-08-08'
status: review
baseline_revision: '8587672'
context:
  - '{project-root}/_bmad-output/project-context.md'
warnings: []
---

<intent-contract>

## Intent

**Problem:** The existing `InterruptInbox` component (`frontend/src/components/deepagents/InterruptInbox.tsx`) and its API layer (`frontend/src/api/deepagents.ts`) talk to deprecated `/api/workflow/interrupts` endpoints that no longer exist. The new interrupt API (Stories 4.1-4.4) exposes `GET /api/interrupts/pending`, `PATCH /api/interrupts/{id}/approve`, `PATCH /api/interrupts/{id}/reject`. The frontend cannot display, approve, or reject interrupts — the HITL approval flow is completely broken on the client side. Additionally, the SSE connection (`connectSSE`) ignores interrupt events from StreamBus because it only listens for named events (`agent.progress`, `idea.created`) but StreamBus emits generic `message` events with `data: {"type": "interrupt.created", ...}`.

**Approach:** Replace the legacy `InterruptInbox` with a new `HITLApprovalCard` component that uses the correct API endpoints. Update the centralized API client (`@/api/client`) with interrupt-specific functions. Add SSE event detection for `interrupt.created`/`interrupt.approved`/`interrupt.rejected` events so the UI refreshes in real-time without polling.

## Boundaries & Constraints

**Always:**
- Use `@/api/client` as the centralized API client — do NOT scatter raw `fetch` calls
- Use shadcn/ui components (`Card`, `Button`, `Badge`, `Textarea`) — no hand-rolled equivalents
- Backend returns `snake_case`; frontend must preserve (project-context rule)
- Component file under 150 lines
- TypeScript strict mode (no `any` unless wrapping backend JSON)
- Path alias `@/*` → `./src/*`
- Frontend error handling mirrors backend — surface API errors (throw), don't swallow
- Use `cn()` utility from `@/lib/utils` for conditional class merging

**Block If:**
- Required shadcn components are not installed

**Never:**
- Modify deprecated backend modules (`models/`, `state/`, `scoring/`, `orchestrator/`, `storage/`)
- Enable `noUnusedLocals`/`noUnusedParameters` in tsconfig (deliberately false)
- Convert `snake_case` API fields to `camelCase`
- Spin up raw `EventSource` per component (connection exhaustion risk)

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Fetch pending interrupts | GET /api/interrupts/pending returns 200 | Component displays interrupt cards | API error shown in toast |
| Approve interrupt | User clicks Approve, sends PATCH | Card removed from list, SSE emits `interrupt.approved` | 409 → "Already resolved" toast |
| Reject interrupt | User clicks Reject, sends PATCH | Card removed from list, SSE emits `interrupt.rejected` | 404 → "Not found" toast |
| Empty pending list | No pending interrupts | Shows "No pending approvals" empty state | No error |
| SSE interrupt.created event | New interrupt published | UI refreshes pending list automatically | Parse error ignored |
| SSE interrupt.approved event | Interrupt resolved via another tab | Card removed from local list | No error |
| Concurrent approve + reject | Two users act on same interrupt | First succeeds, second gets 409 | 409 handled gracefully |
| Button loading state | User clicks Approve during network delay | Button disabled, spinner shown | Timeout handled by fetch |

## Previous Story Intelligence

**From Story 4.2 (SSE Bridge):**
- StreamBus `publish(event_type, payload)` produces: `data: {"type": event_type, **payload}\n\n`
- Interrupt payloads include full interrupt dict + `thread_id`
- Event types: `interrupt.created`, `interrupt.approved`, `interrupt.rejected`
- SSE endpoint: `GET /api/sse` returns `StreamingResponse(_bus.subscribe(), media_type="text/event-stream")`

**From Story 4.3 (API Route Tests):**
- API response shape: `{ "interrupt": { id, thread_id, tool_name, tool_input, message, status, decision, reason, created_at, updated_at } }`
- Pending list response: `{ "interrupts": [interrupt, ...] }`
- Error responses: 404 (not found), 409 (already resolved), 422 (validation)
- Request bodies: `{ "decision": "approved", "reason": "ok" }` for approve, `{ "decision": "rejected", "reason": "no" }` for reject

**From Story 4.1 (Interrupt Service):**
- Interrupt dict shape: `{ id, thread_id, tool_name, tool_input, message, status, decision, reason, created_at, updated_at }`
- Status values: `pending`, `approved`, `rejected`
- `tool_name` indicates the action being reviewed (e.g., `write_file`, `edit_file`, `delete`)
- `message` is the human-readable prompt from the agent

</intent-contract>

## Code Map

### Files to Create
- `frontend/src/components/deepagents/HITLApprovalCard.tsx` — New approval card component (replaces InterruptInbox)

### Files to Modify
- `frontend/src/api/threads.ts` — Add interrupt API functions + SSE event detection
- `frontend/src/types/deepagents.ts` — Update `InterruptItem` type to match new API shape
- `frontend/src/components/deepagents/InterruptInbox.tsx` — Replace with re-export from HITLApprovalCard (backward compat)
- `frontend/src/api/deepagents.ts` — Deprecate old functions, re-export from `@/api/client`

## Tasks & Acceptance

**Execution:**

- [x] **Task 1: Update TypeScript types** (AC: #1)
  - [x] 1.1 Update `InterruptItem` in `types/deepagents.ts` to match backend interrupt shape
  - [x] 1.2 Add `InterruptListResponse` and `InterruptDecisionRequest` types
  - [x] 1.3 Keep `InterruptItem` backward compatible with `idea_id` field (optional)

- [x] **Task 2: Add interrupt API functions to `@/api/client`** (AC: #2, #3, #4)
  - [x] 2.1 `fetchPendingInterrupts()` → `GET /api/interrupts/pending`
  - [x] 2.2 `approveInterrupt(id, decision, reason)` → `PATCH /api/interrupts/{id}/approve`
  - [x] 2.3 `rejectInterrupt(id, reason)` → `PATCH /api/interrupts/{id}/reject`
  - [x] 2.4 All functions throw on non-2xx responses (frontend error handling rule)

- [x] **Task 3: Add SSE interrupt event detection** (AC: #5, #6)
  - [x] 3.1 Update `connectSSE` in `threads.ts` to handle generic `message` events
  - [x] 3.2 Parse `data.type` for `interrupt.created`, `interrupt.approved`, `interrupt.rejected`
  - [x] 3.3 Call refresh callback on interrupt events
  - [x] 3.4 Do not break existing named-event listeners

- [x] **Task 4: Create HITLApprovalCard component** (AC: #1, #2, #3, #4, #7, #8)
  - [x] 4.1 Component displays tool name, agent message, and tool input preview
  - [x] 4.2 Approve button with loading state and reason input
  - [x] 4.3 Reject button with loading state and reason input
  - [x] 4.4 Empty state when no pending interrupts
  - [x] 4.5 Uses shadcn/ui Card, Button, Badge, Textarea components
  - [x] 4.6 Card removed from list after successful action (optimistic + SSE confirm)
  - [x] 4.7 Error toast on 409/404 responses
  - [x] 4.8 Component file under 150 lines

- [x] **Task 5: Wire component into existing interrupt inbox** (AC: All)
  - [x] 5.1 Update `InterruptInbox.tsx` to use HITLApprovalCard internally
  - [x] 5.2 Update `deepagents.ts` to re-export from `@/api/client`
  - [x] 5.3 Verify TypeScript compilation with no errors

**Acceptance Criteria:**
- Given pending interrupts exist, when HITLApprovalCard renders, then each interrupt shows tool name, agent message, and approve/reject buttons
- Given user clicks Approve on a pending interrupt, when PATCH succeeds, then card is removed from list and SSE emits `interrupt.approved`
- Given user clicks Reject on a pending interrupt, when PATCH succeeds, then card is removed from list and SSE emits `interrupt.rejected`
- Given an interrupt is already resolved, when user clicks Approve/Reject, then 409 error is shown gracefully
- Given an `interrupt.created` SSE event arrives, when UI is connected, then pending list refreshes automatically
- Given an `interrupt.approved`/`interrupt.rejected` SSE event arrives, when UI is connected, then the resolved card is removed
- Given no pending interrupts, when component renders, then empty state message is displayed
- Given component renders, when inspected, then all API calls go through `@/api/client` (no raw `fetch` in component)

## Spec Change Log

### Review Findings (2026-08-09)

**[HIGH] Patch** State cleared on API failure in `useChatStream.ts` — `handleApproveInterrupt`/`handleRejectInterrupt` clear `pendingInterrupt` in `catch` blocks, orphaning the backend agent when the API call fails. Fix: remove state clearing from catch, show error toast instead. `[frontend/src/components/deepagents/HITLApprovalCard.tsx]`

**[MEDIUM] Patch** Error handling swallows API errors — `catch (err: any)` shows toast but does not rethrow. Project context rule requires surfacing API errors. Fix: rethrow after toast so caller knows the action failed. `[frontend/src/components/deepagents/HITLApprovalCard.tsx:36-45, 55-66]`

**[LOW] Defer** Bypass of `@/api/client` — component imports from `@/api/threads` directly. Functions are re-exported through `@/api/client`, so no behavioral issue. Refactor only. `[frontend/src/components/deepagents/HITLApprovalCard.tsx:7]`

## Design Notes

### Component Architecture

```
HITLApprovalCard (presentational)
├── props: interrupts[], onApproved(id), onRejected(id)
├── state: comments{[id]: string}, loading{[id]: boolean}
└── renders: Card, Badge (tool_name), Textarea (reason), Button (approve/reject)

InterruptInbox (container — wraps HITLApprovalCard)
├── props: onActionComplete?()
├── state: interrupts[] (fetched + SSE-updated)
├── effect: fetchPendingInterrupts() on mount
├── effect: connectSSE() for real-time updates
└── renders: HITLApprovalCard or empty state
```

### API Function Signatures

```typescript
// frontend/src/api/threads.ts

export interface InterruptPayload {
  id: string;
  thread_id: string;
  tool_name: string;
  tool_input: Record<string, unknown>;
  message: string;
  status: 'pending' | 'approved' | 'rejected';
  decision?: string;
  reason?: string;
  created_at: string;
  updated_at: string;
}

export async function fetchPendingInterrupts(): Promise<InterruptPayload[]> {
  const res = await fetch('/api/interrupts/pending');
  if (!res.ok) throw new Error(`fetchPendingInterrupts ${res.status}`);
  const data = await res.json();
  return data.interrupts || [];
}

export async function approveInterrupt(
  id: string,
  decision: string,
  reason: string,
): Promise<InterruptPayload> {
  const res = await fetch(`/api/interrupts/${id}/approve`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ decision, reason }),
  });
  if (!res.ok) throw new Error(`approveInterrupt ${res.status}`);
  const data = await res.json();
  return data.interrupt;
}

export async function rejectInterrupt(
  id: string,
  reason: string,
): Promise<InterruptPayload> {
  const res = await fetch(`/api/interrupts/${id}/reject`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ decision: 'rejected', reason }),
  });
  if (!res.ok) throw new Error(`rejectInterrupt ${res.status}`);
  const data = await res.json();
  return data.interrupt;
}
```

### SSE Event Detection Pattern

StreamBus publishes generic SSE `message` events (no `event:` name). The `connectSSE` function registers named listeners but misses interrupt events. Fix: add an `onmessage` handler that parses the JSON payload and dispatches interrupt events.

**IMPORTANT:** The current `connectSSE` signature is:
```typescript
export function connectSSE(
  onEvent: (event: string, data: any) => void,
  onError?: (err: Event) => void,
): EventSource
```

Add a third parameter for interrupt callbacks:
```typescript
export function connectSSE(
  onEvent: (event: string, data: any) => void,
  onError?: (err: Event) => void,
  onInterruptEvent?: (eventType: string, payload: any) => void,
): EventSource
```

Implementation inside `connectSSE` (add after named event listeners):
```typescript
es.onmessage = (e: MessageEvent) => {
  try {
    const data = JSON.parse(e.data);
    const type = data?.type;
    if (type?.startsWith('interrupt.')) {
      onInterruptEvent?.(type, data);
    }
  } catch {
    // ignore parse errors
  }
};
```

**Existing callers of `connectSSE`** (must not break):
- `useChatStream.ts` line 79: `connectSSE((event, data) => { ... })` — 2 args, no interrupt handler
- `IdeaDetail.tsx`: `connectSSE(() => loadData())` — 1 arg, no interrupt handler

Both existing callers pass 1-2 arguments. Adding a 3rd optional parameter is backward compatible.

### InterruptInbox SSE Integration

```typescript
// InterruptInbox.tsx — SSE effect for real-time updates

useEffect(() => {
  const es = connectSSE(
    (_event, _data) => {
      // legacy named events — no-op for interrupts
    },
    undefined, // onError
    (eventType, payload) => {
      // interrupt event handler
      if (eventType === 'interrupt.created') {
        loadInterrupts(); // refresh list
      } else if (eventType === 'interrupt.approved' || eventType === 'interrupt.rejected') {
        setInterrupts(prev => prev.filter(i => i.id !== payload.interrupt?.id));
      }
    }
  );
  return () => es.close();
}, []);
```

## Verification

**Commands:**
- `cd frontend && npx tsc --noEmit` — expected: no type errors
- Manual smoke test: interrupt card renders with tool name, message, approve/reject buttons
- Manual smoke test: clicking Approve removes card from list
- Manual smoke test: clicking Reject removes card from list
- Manual smoke test: SSE event triggers UI refresh
