---
title: 'Wire HITL approval UI into chat stream'
type: 'feature'
created: '2026-08-09'
status: 'review'
context:
  - '{project-root}/_bmad-output/project-context.md'
warnings: []
---

<intent-contract>

## Intent

**Problem:** Story 4.5 created the `HITLApprovalCard` component (or will, when developed), but it lives as a standalone component with no integration into the active chat stream. When an agent triggers a HITL interrupt during a live conversation (via `astream_events` or SSE), the user has no visible approval prompt in the chat UI — the interrupt is raised on the backend but silently ignored on the frontend. The `useChatStream` hook processes SSE events but only handles `agent.progress`; it does not detect `interrupt.created`, `interrupt.approved`, or `interrupt.rejected` events from StreamBus. The approval UI exists only in `IdeaDetail.tsx` (legacy interrupt inbox), not in the primary chat surface (`CommandCenter` → `CommandCenterChatPane`).

**Approach:** Extend `useChatStream` to detect interrupt SSE events and manage interrupt state. Wire the HITL approval UI as an overlay in `CommandCenter` that appears when an active interrupt is pending. Block chat input during active interrupts. After approval/rejection, clear the interrupt state and resume normal chat flow.

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
- Story 4.5 is not completed (HITLApprovalCard not available)

**Never:**
- Modify deprecated backend modules (`models/`, `state/`, `scoring/`, `orchestrator/`, `storage/`)
- Enable `noUnusedLocals`/`noUnusedParameters` in tsconfig (deliberately false)
- Convert `snake_case` API fields to `camelCase`
- Spin up raw `EventSource` per component (connection exhaustion risk)

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Interrupt arrives via SSE | `interrupt.created` event on SSE | HITLApprovalCard overlay appears in chat, input blocked | Parse error ignored |
| Interrupt arrives via stream | `type: "interrupt"` in `astream_events` | HITLApprovalCard overlay appears, message shows interrupt details | No error |
| User approves interrupt | Clicks Approve on overlay | Overlay dismissed, input unblocked, SSE emits `interrupt.approved` | 409 → "Already resolved" toast |
| User rejects interrupt | Clicks Reject on overlay | Overlay dismissed, input unblocked, SSE emits `interrupt.rejected` | 404 → "Not found" toast |
| SSE interrupt.approved event | External tab resolves interrupt | Overlay auto-dismissed, input unblocked | No error |
| Concurrent SSE + stream events | Interrupt event from both SSE and stream | Deduplicated — only one overlay shown | No error |
| Interrupt resolved while overlay open | SSE `interrupt.approved` arrives during user interaction | Overlay auto-dismissed gracefully | No error |
| Multiple interrupts queued | Second `interrupt.created` while first is pending | New interrupt replaces or stacks (based on design) | No error |
| Chat input during interrupt | User types while interrupt is active | Input disabled with "awaiting approval" message | No error |

## Previous Story Intelligence

**From Story 4.5 (HITL Approval UI Component):**
- `HITLApprovalCard` component created in `frontend/src/components/deepagents/HITLApprovalCard.tsx`
- Updated `InterruptItem` type in `types/deepagents.ts` to match backend shape
- Interrupt API functions added to `@/api/client` via `threads.ts`: `fetchPendingInterrupts()`, `approveInterrupt()`, `rejectInterrupt()`
- SSE `connectSSE` extended with 3rd parameter `onInterruptEvent` for `interrupt.*` events
- `InterruptInbox.tsx` updated to use HITLApprovalCard internally
- `deepagents.ts` deprecated, re-exports from `@/api/client`

**From Story 4.4 (Backend Lifecycle Tests):**
- Full interrupt lifecycle: create → approve/reject → resume
- SSE event sequence: `interrupt.created` on creation, `interrupt.approved`/`interrupt.rejected` on resolution
- Cross-action conflicts return 409 (already resolved)
- Pending list excludes resolved interrupts

**From Story 4.2 (SSE Bridge):**
- StreamBus `publish(event_type, payload)` produces: `data: {"type": event_type, **payload}\n\n`
- Interrupt payloads include full interrupt dict + `thread_id`
- Event types: `interrupt.created`, `interrupt.approved`, `interrupt.rejected`
- SSE endpoint: `GET /api/sse` returns `StreamingResponse(_bus.subscribe(), media_type="text/event-stream")`

**From Story 4.1 (Interrupt Service):**
- Interrupt dict shape: `{ id, thread_id, tool_name, tool_input, message, status, decision, reason, created_at, updated_at }`
- Status values: `pending`, `approved`, `rejected`
- `tool_name` indicates the action being reviewed (e.g., `write_file`, `edit_file`, `delete`)
- `message` is the human-readable prompt from the agent

</intent-contract>

## Code Map

### Files to Modify
- `frontend/src/hooks/useChatStream.ts` — Add interrupt SSE detection, interrupt state management, input blocking
- `frontend/src/pages/CommandCenter.tsx` — Wire HITLApprovalCard as overlay when interrupt is active
- `frontend/src/api/threads.ts` — Add `onInterruptEvent` callback to `connectSSE` (from Story 4.5, verify)
- `frontend/src/types/deepagents.ts` — Verify `InterruptPayload` type exports (from Story 4.5)

### Reference Files
- `frontend/src/components/deepagents/HITLApprovalCard.tsx` — Story 4.5 component to wire in
- `frontend/src/components/deepagents/InterruptInbox.tsx` — Existing container for HITLApprovalCard
- `frontend/src/types/chat.ts` — ChatMessage type for interrupt event messages
- `frontend/src/lib/chat-utils.ts` — `eventToMessage` for converting stream events

## Tasks & Acceptance

**Execution:**

- [ ] **Task 1: Extend useChatStream with interrupt state** (AC: #1, #2, #3, #4)
  - [ ] 1.1 Add `pendingInterrupt` state to hook return value
  - [ ] 1.2 Update SSE `connectSSE` call to include `onInterruptEvent` callback (3rd param)
  - [ ] 1.3 On `interrupt.created`: set `pendingInterrupt` from payload
  - [ ] 1.4 On `interrupt.approved` / `interrupt.rejected`: clear `pendingInterrupt` if ID matches
  - [ ] 1.5 Add `isInterruptActive` derived state (true when `pendingInterrupt` is set)
  - [ ] 1.6 Add `handleApproveInterrupt(id, decision, reason)` and `handleRejectInterrupt(id, reason)` to hook
  - [ ] 1.7 Add interrupt message to `rawMessages` when interrupt arrives (visual indicator in chat)

- [ ] **Task 2: Wire HITL approval overlay into CommandCenter** (AC: #1, #5, #6)
  - [ ] 2.1 Import HITLApprovalCard (or InterruptInbox) from Story 4.5
  - [ ] 2.2 Render approval overlay when `isInterruptActive` is true
  - [ ] 2.3 Overlay appears above chat input, below messages (non-modal but prominent)
  - [ ] 2.4 Disable chat input textarea when interrupt is active
  - [ ] 2.5 Show "Awaiting your approval..." disabled state on input
  - [ ] 2.6 On approval/rejection, clear overlay and re-enable input

- [ ] **Task 3: Handle interrupt events from stream (not just SSE)** (AC: #2)
  - [ ] 3.1 In `streamThreadMessage` callback, detect `evt.type === "interrupt"`
  - [ ] 3.2 On stream interrupt event, set `pendingInterrupt` state
  - [ ] 3.3 Add interrupt message to chat (agent requesting approval)

- [ ] **Task 4: Interrupt deduplication** (AC: #7)
  - [ ] 4.1 Track `activeInterruptId` to prevent duplicate overlays
  - [ ] 4.2 If `interrupt.created` arrives for same ID, skip (already showing)
  - [ ] 4.3 If `interrupt.created` arrives for new ID, replace or stack

- [ ] **Task 5: Verify TypeScript compilation** (AC: All)
  - [ ] 5.1 `cd frontend && npx tsc --noEmit` passes with no errors
  - [ ] 5.2 No raw `fetch` in CommandCenter or useChatStream (use `@/api/client`)

**Acceptance Criteria:**
- Given an agent triggers a HITL interrupt during a live chat stream, when the interrupt event arrives, then the HITLApprovalCard overlay appears above the chat input with tool name, message, and approve/reject buttons
- Given a pending interrupt is displayed, when user clicks Approve, then the interrupt is resolved via API, overlay dismisses, and chat input re-enables
- Given a pending interrupt is displayed, when user clicks Reject, then the interrupt is rejected via API, overlay dismisses, and chat input re-enables
- Given an interrupt is resolved externally (another tab), when SSE `interrupt.approved`/`interrupt.rejected` event arrives, then the overlay auto-dismisses
- Given a pending interrupt is active, when the user tries to type in chat input, then the input is disabled with "Awaiting your approval" indicator
- Given an `interrupt.created` SSE event arrives, when the UI is connected, then the approval overlay appears automatically
- Given two `interrupt.created` events for the same interrupt ID arrive, then only one overlay is shown (deduplication)
- Given an interrupt message appears in the chat, when inspected, then the message shows the agent is waiting for approval

## Spec Change Log

### Review Findings (2026-08-09)

**[HIGH] Patch** State cleared on API failure in `useChatStream.ts` — `handleApproveInterrupt`/`handleRejectInterrupt` clear `pendingInterrupt` in `catch` blocks, orphaning the backend agent when the API call fails. Fix: remove state clearing from catch, show error toast instead. `[frontend/src/hooks/useChatStream.ts:201-204, 216-218]`

**[MEDIUM] Patch** Unsafe `as InterruptPayload` cast on stream event data — `StreamEvent` lacks `tool_name`, `message` fields; display will be blank for stream-sourced interrupts. Fix: map `StreamEvent` fields to `InterruptPayload` shape. `[frontend/src/hooks/useChatStream.ts:256-262]`

**[MEDIUM] Patch** Multiple queued interrupts unsupported — `pendingInterrupt` is a singleton state; second interrupt overwrites the first. Fix: use array state. `[frontend/src/hooks/useChatStream.ts:35-36]`

**[MEDIUM] Patch** Stale `activeInterruptIdRef` across thread changes — ref never resets when switching threads, new interrupts deduplicated incorrectly. Fix: reset ref on thread change. `[frontend/src/hooks/useChatStream.ts:37]`

**[LOW] Patch** `Date.now()` fallback ID collision risk — two rapid stream interrupts in same millisecond produce duplicate IDs. Fix: use UUID for fallback. `[frontend/src/hooks/useChatStream.ts:257]`

**[LOW] Defer** Duplicate SSE subscriptions — `InterruptInbox` and `useChatStream` create independent SSE connections. Acceptable as separate component responsibilities. Architectural improvement candidate. `[frontend/src/components/deepagents/InterruptInbox.tsx:42-54]`

**[LOW] Defer** SSE reconnect doesn't reload interrupt state — interrupt overlay may become stale on connection drop. Requires reconnection handling pattern.

## Design Notes

### useChatStream Integration Pattern

The hook already has an SSE `connectSSE` effect (line 78-95). Extend it to handle interrupt events:

```typescript
// useEffect — SSE connection
useEffect(() => {
  const es = connectSSE(
    (event, data) => {
      // existing: agent.progress handler
      if (event === "agent.progress" && data) {
        setRawMessages((prev) => [...prev, eventToMessage({...})]);
      }
    },
    undefined, // onError
    (eventType, payload) => {
      // NEW: interrupt event handler
      if (eventType === 'interrupt.created') {
        const interrupt = payload.interrupt || payload;
        setPendingInterrupt(interrupt);
        // Add visual indicator message
        setRawMessages((prev) => [...prev, {
          id: `interrupt_${interrupt.id}`,
          sender: 'System',
          text: `Agent requires approval: ${interrupt.message}`,
          eventType: 'interrupt',
          details: { interrupt_id: interrupt.id, tool_name: interrupt.tool_name },
        }]);
      } else if (eventType === 'interrupt.approved' || eventType === 'interrupt.rejected') {
        const id = payload.interrupt?.id;
        if (id) setPendingInterrupt(prev => prev?.id === id ? null : prev);
      }
    }
  );
  return () => es.close();
}, []);
```

### Stream Event Detection

In `streamThreadMessage` callback, add interrupt detection:

```typescript
// Inside executeSend → streamThreadMessage callback
if (evt.type === "interrupt") {
  const interrupt = evt.extras?.interrupt || {};
  setPendingInterrupt(interrupt);
  setRawMessages((prev) => [...prev, eventToMessage(evt)]);
  return;
}
```

### CommandCenter Overlay Pattern

```typescript
// CommandCenter.tsx
const {
  // ... existing useChatStream return values
  pendingInterrupt,
  isInterruptActive,
  handleApproveInterrupt,
  handleRejectInterrupt,
} = useChatStream({...});

// Render overlay before chat input
{isInterruptActive && (
  <div className="p-4 border-t bg-amber-50/50">
    <InterruptInbox
      ideaId={activeThreadId || ''}
      interrupts={[pendingInterrupt!]}
      onActionComplete={() => {
        // overlay auto-clears via SSE
      }}
    />
  </div>
)}
```

### Input Blocking

Disable chat input when `isInterruptActive`:

```typescript
<Textarea
  disabled={isInterruptActive}
  placeholder={isInterruptActive ? "Awaiting your approval..." : "Type a message..."}
  // ...
/>
```

### Hook Return Value Changes

```typescript
return {
  // ... existing return values
  pendingInterrupt,    // InterruptPayload | null
  isInterruptActive,   // boolean (derived from pendingInterrupt)
  handleApproveInterrupt,  // (id: string, decision: string, reason: string) => Promise<void>
  handleRejectInterrupt,   // (id: string, reason: string) => Promise<void>
};
```

### Architecture Alignment

```
useChatStream (state manager)
├── SSE connectSSE with interrupt callback
├── state: pendingInterrupt (set by SSE or stream events)
├── derived: isInterruptActive
└── actions: handleApproveInterrupt, handleRejectInterrupt

CommandCenter (orchestrator)
├── reads: useChatStream.pendingInterrupt, isInterruptActive
├── renders: HITLApprovalCard overlay when active
└── passes: onApprove, onReject from hook

HITLApprovalCard (presentational — from Story 4.5)
├── props: interrupts[], onActionComplete
└── renders: Card, Badge, Textarea, Button
```

## Verification

**Commands:**
- `cd frontend && npx tsc --noEmit` — expected: no type errors
- Manual smoke test: Trigger an agent interrupt → approval overlay appears in chat
- Manual smoke test: Approve interrupt → overlay dismisses, input re-enables
- Manual smoke test: Reject interrupt → overlay dismisses, input re-enables
- Manual smoke test: Resolve interrupt in another tab → overlay auto-dismisses via SSE
- Manual smoke test: Chat input is disabled during active interrupt

</intent-contract>
