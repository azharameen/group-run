---
title: 'Frontend tests: approval UI'
type: 'feature'
created: '2026-08-09'
status: 'in-review'
review_loop_iteration: 1
followup_review_recommended: false
baseline_revision: 'ce446e8fa3c4a6aedf4eb5258f2be05fdc2fe7c5'
context:
  - '{project-root}/frontend/src/__tests__/useChatStream.test.tsx'
  - '{project-root}/frontend/src/__tests__/CommandCenter.test.tsx'
warnings: []
---

<intent-contract>

## Intent

**Problem:** Stories 4.5 and 4.6 implemented the HITL approval UI component and wired it into the chat stream, but there are no frontend tests covering the interrupt lifecycle. The existing `useChatStream.test.tsx` tests cover message streaming, SSE, and search but have no interrupt-related test cases. The `CommandCenter.test.tsx` mocks include `pendingInterrupt`, `isInterruptActive`, `handleApproveInterrupt`, and `handleRejectInterrupt` but never exercises them. The `HITLApprovalCard` component and `InterruptInbox` component have zero test coverage, meaning regressions in approval/reject behavior, overlay rendering, input blocking, and SSE interrupt event handling would go undetected.

**Approach:** Create comprehensive test suites for `HITLApprovalCard` (presentational component), extend `useChatStream.test.tsx` with interrupt state management tests, and add CommandCenter integration tests for the approval overlay and input blocking. Follow the existing vitest + @testing-library/react patterns established in stories 1.11, 2.6, and 3.7.

## Boundaries & Constraints

**Always:**
- Use vitest + @testing-library/react (project test stack)
- Mock `@/api/client` module-level functions — no real fetch calls
- Mock `EventSource` globally with `MockEventSource` class pattern (see existing tests)
- Wrap async state updates in `act(async () => { ... })`
- Use `waitFor` from @testing-library/react for async assertions
- Follow the existing test file naming convention: `{component}.test.tsx`
- Each test file stays under 200 lines; split if needed
- `beforeEach` restores mocks and resets state; `afterEach` cleans up

**Block If:**
- `@testing-library/user-event` is not installed (needed for textarea interaction)

**Never:**
- Import unmocked `@/api/client` in tests (would trigger real API calls)
- Test shadcn component internals (test behavior, not rendering details)
- Modify existing passing tests without clear regression justification

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| HITLApprovalCard with empty interrupts | `interrupts: []` | Renders empty state card with "No pending approvals" | No error |
| HITLApprovalCard with single interrupt | `interrupts: [payload]` | Renders card with tool name badge, message, textarea, approve/reject buttons | No error |
| HITLApprovalCard approve success | Click Approve on valid interrupt | Calls `approveInterrupt`, fires `onApproved` callback | No error |
| HITLApprovalCard reject success | Click Reject on valid interrupt | Calls `rejectInterrupt`, fires `onRejected` callback | No error |
| HITLApprovalCard approve with 409 error | API throws error with "409" in message | Shows "Already resolved" error toast, does NOT fire `onApproved` | Error toast displayed |
| HITLApprovalCard reject with 404 error | API throws error with "404" in message | Shows "Not found" error toast, does NOT fire `onRejected` | Error toast displayed |
| HITLApprovalCard button loading state | API call in flight | Buttons show Loader2 spinner and are disabled | No error |
| useChatStream SSE interrupt.created | SSE emits `interrupt.created` event | `pendingInterrupt` set, `isInterruptActive` becomes true, interrupt message added to chat | No error |
| useChatStream SSE interrupt.approved | SSE emits `interrupt.approved` for matching ID | `pendingInterrupt` cleared, `isInterruptActive` becomes false | No error |
| useChatStream SSE interrupt.rejected | SSE emits `interrupt.rejected` for matching ID | `pendingInterrupt` cleared, `isInterruptActive` becomes false | No error |
| useChatStream SSE interrupt dedup | Two `interrupt.created` with same ID | `pendingInterrupt` set only once, only one interrupt message in chat | No error |
| useChatStream SSE interrupt replace | Two `interrupt.created` with different IDs | `pendingInterrupt` replaced with second interrupt, two messages in chat | No error |
| useChatStream stream interrupt event | `streamThreadMessage` fires `type: "interrupt"` event with interrupt data | `pendingInterrupt` set from stream event data with deduplication | No error |
| CommandCenter overlay renders | `isInterruptActive: true`, `pendingInterrupt` set | HITLApprovalCard visible in chat pane overlay | No error |
| CommandCenter input blocked | `isInterruptActive: true` | Chat input disabled with "Awaiting your approval..." placeholder | No error |
| CommandCenter overlay dismissed | `isInterruptActive: false`, `pendingInterrupt: null` | No overlay visible, input enabled | No error |

</intent-contract>

## Code Map

### Files to Create
- `frontend/src/__tests__/HITLApprovalCard.test.tsx` — Presentational component tests
- `frontend/src/__tests__/InterruptInbox.test.tsx` — Container component tests (optional if InterruptInbox is thin wrapper)

### Files to Modify
- `frontend/src/__tests__/useChatStream.test.tsx` — Add interrupt SSE/dedup/stream tests (6-8 new tests)
- `frontend/src/__tests__/CommandCenter.test.tsx` — Add overlay and input blocking tests (3-4 new tests)

### Reference Files
- `frontend/src/components/deepagents/HITLApprovalCard.tsx` — Component under test (135 lines)
- `frontend/src/components/deepagents/InterruptInbox.tsx` — Container component (81 lines)
- `frontend/src/hooks/useChatStream.ts` — Hook with interrupt state
- `frontend/src/api/threads.ts` — API functions `approveInterrupt`, `rejectInterrupt`, `connectSSE`
- `frontend/src/api/threads.ts` — `InterruptPayload` type definition
- `frontend/src/pages/CommandCenter.tsx` — Page wiring interrupt overlay

## Tasks & Acceptance

**Execution:**

- [x] **Task 1: Create HITLApprovalCard.test.tsx** (AC: #1-#7) — 11 tests, all pass
  - [x] 1.1 Set up test file with vitest imports, mock `@/api/threads`, mock `useToast` hook
  - [x] 1.2 Test: renders empty state with no interrupts
  - [x] 1.3 Test: renders interrupt card with tool name badge and message
  - [x] 1.4 Test: renders tool_input JSON preview when present
  - [x] 1.5 Test: approve button calls approveInterrupt with correct params and fires onApproved
  - [x] 1.6 Test: reject button calls rejectInterrupt with correct params and fires onRejected
  - [x] 1.7 Test: textarea input updates comment state before approve/reject
  - [x] 1.8 Test: approve button shows loading spinner during API call
  - [x] 1.9 Test: 409 error on approve shows "Already resolved" toast
  - [x] 1.10 Test: 404 error on reject shows "Not found" toast
  - [x] 1.11 Test: multiple interrupts render multiple cards

- [x] **Task 2: Extend useChatStream.test.tsx with interrupt tests** (AC: #8-#12) — 7 new tests, all pass (re-implemented after spec fix)
  - [x] 2.1 Updated `connectSSE` mock to capture 3rd callback parameter (interrupt handler)
  - [x] 2.2 Test: SSE `interrupt.created` event sets `pendingInterrupt` and `isInterruptActive` (with act/waitFor)
  - [x] 2.3 Test: SSE `interrupt.approved` event clears `pendingInterrupt` when ID matches (with act/waitFor)
  - [x] 2.4 Test: SSE `interrupt.rejected` event clears `pendingInterrupt` when ID matches (with act/waitFor)
  - [x] 2.5 Test: SSE `interrupt.created` event adds interrupt message to rawMessages
  - [x] 2.6 Test: duplicate `interrupt.created` events for same ID are deduplicated (with act/waitFor)
  - [x] 2.7 Test: `interrupt.created` with different ID replaces pending interrupt (with act/waitFor)
  - [x] 2.8 Test: stream `type: "interrupt"` event sets `pendingInterrupt` (fixed assertion + added interrupt data)

- [x] **Task 3: Extend CommandCenter.test.tsx with overlay tests** (AC: #13-#15) — 4 new tests, all pass
  - [x] 3.1 Test: when `isInterruptActive` is true, HITLApprovalCard overlay is rendered
  - [x] 3.2 Test: when `isInterruptActive` is true, chat input is disabled
  - [x] 3.3 Test: when `isInterruptActive` is false, no overlay and input is enabled
  - [x] 3.4 Test: overlay renders with correct interrupt data

- [x] **Task 4: Verify all tests pass** (AC: All)
  - [x] 4.1 All targeted tests pass with 0 failures (49 total: 11 HITLApprovalCard + 25 useChatStream + 13 CommandCenter)
  - [x] 4.2 No new test warnings (existing act() warnings are pre-existing)
  - [x] 4.3 22 new test cases added (11 + 7 + 4)

**Acceptance Criteria:**
- Given HITLApprovalCard receives an empty interrupts array, when rendered, then it displays an empty state card with "No pending approvals" text and a checkmark icon
- Given HITLApprovalCard receives a single interrupt, when rendered, then it displays the tool name as a badge, the interrupt message, tool_input JSON preview, a textarea for comments, and approve/reject buttons
- Given HITLApprovalCard is displayed with an interrupt, when the user clicks Approve, then `approveInterrupt` is called with the interrupt ID and "approved" decision, and `onApproved` callback fires
- Given HITLApprovalCard is displayed with an interrupt, when the user clicks Reject, then `rejectInterrupt` is called with the interrupt ID and reason, and `onRejected` callback fires
- Given the user enters a comment before approving, when approve is called, then the comment text is passed as the reason parameter
- Given `approveInterrupt` throws an error containing "409", when the user clicks Approve, then an "Already resolved" error toast is shown and `onApproved` is not called
- Given `rejectInterrupt` throws an error containing "404", when the user clicks Reject, then a "Not found" error toast is shown and `onRejected` is not called
- Given an SSE `interrupt.created` event arrives, when useChatStream is mounted, then `pendingInterrupt` is set from the event payload and `isInterruptActive` is true
- Given a pending interrupt is active, when an SSE `interrupt.approved` or `interrupt.rejected` event arrives with a matching ID, then `pendingInterrupt` is cleared and `isInterruptActive` is false
- Given two identical `interrupt.created` SSE events arrive, when the hook processes them, then only one interrupt message appears in chat (deduplication works)
- Given a `streamThreadMessage` callback fires a `type: "interrupt"` event, when useChatStream processes it, then `pendingInterrupt` is set from the stream event data
- Given CommandCenter renders with `isInterruptActive: true` and `pendingInterrupt` set, when rendered, then the HITLApprovalCard overlay is visible and the chat input is disabled
- Given CommandCenter renders with `isInterruptActive: false`, when rendered, then no overlay is visible and the chat input is enabled

## Spec Change Log

### 2026-08-09 — Review-driven spec amendment (bad_spec loopback)

**Triggering findings:**
1. I/O matrix row 56 claimed "interrupt.created with non-matching ID does not clear existing pending interrupt" — production code actually replaces `pendingInterrupt` with the new interrupt (dedup only skips same ID)
2. I/O matrix row 59 claimed "streamThreadMessage fires type: interrupt → pendingInterrupt set" without requiring interrupt data — test asserted `toBeNull()` contradicting test name and production behavior

**Amendments:**
- Row 56: Added new row "SSE interrupt replace" — two interrupt.created with different IDs replaces pendingInterrupt and adds two messages
- Row 59: Updated to require "interrupt data" in stream event for pendingInterrupt to be set
- Task 2.7: Renamed from "does not clear" to "replaces pending interrupt"
- Task 2.2-2.4, 2.6: Added note to wrap async state in act/waitFor

**Known-bad state:** Tests passed for wrong reasons — synchronous tests asserted against stale initial React state (state updates not yet flushed), making broken assertions appear to pass.

**KEEP instructions:**
- Task 1 (HITLApprovalCard.test.tsx): All 11 tests correct, proper async patterns with waitFor
- Task 2.1: connectSSE mock capturing 3rd callback parameter is correct
- Task 2.5: SSE interrupt.created adds System message test is correct with waitFor
- Task 3 (CommandCenter overlay tests): All 4 tests correct
- Mock patterns for `@/api/threads` and `useToast` are correct

## Review Triage Log

### 2026-08-09 — Review pass (bad_spec loopback + patch)
- intent_gap: 0
- bad_spec: 2: (high 2)
  - I/O matrix row 56: "non-matching ID does not clear" → production replaces pendingInterrupt; spec amended
  - I/O matrix row 59: stream interrupt test asserted `toBeNull()` contradicting production behavior; spec amended
- patch: 4: (medium 4)
  - Tests 2.2-2.4, 2.6: Missing act/waitFor wrapping on async React state → re-implemented with proper patterns
  - Test 2.7: Wrong assertion matching incorrect spec → fixed to `toBe('int-2')`
  - Test 2.8: Wrong assertion `toBeNull()` → fixed to `toBeTruthy()` with proper interrupt data
  - connectSSE mock: Not capturing 3rd callback param → added interruptCallback variable
- defer: 5: (low 5)
  - streamThreadMessage mock param naming mismatch (pre-existing, not this story's issue)
  - No test for approve/reject action flow at CommandCenter integration level (beyond current scope)
  - No test for activeInterruptIdRef reset after approve allowing same-ID reprocessing (edge case)
  - Duplicate vi.restoreAllMocks in beforeEach + afterEach (pre-existing pattern)
  - Missing negative test for interrupt.approved with non-matching ID (future enhancement)
- reject: 3
  - Mock parameter naming confusion flagged but not impactful (pre-existing)
  - Massive duplication in CommandCenter mocks flagged but existing tests pre-date this story
  - Double restore overhead flagged but is correct behavior
- addressed_findings:
  - `[high] [bad_spec]` I/O matrix corrected: interrupt.created with different ID replaces pendingInterrupt (not clears)
  - `[high] [bad_spec]` Stream interrupt test corrected: pendingInterrupt set from stream event with data
  - `[medium] [patch]` All 4 sync tests wrapped with act/waitFor for proper React state flushing
  - `[medium] [patch]` Test assertions corrected to match actual production behavior
  - `[medium] [patch]` connectSSE mock updated to capture 3rd interrupt callback parameter

## Design Notes

### Test Pattern for HITLApprovalCard

The component uses `@/api/threads` directly (not `@/api/client`), so the mock targets that module:

```tsx
import * as threads from '@/api/threads';

vi.mock('@/api/threads', () => ({
  approveInterrupt: vi.fn().mockResolvedValue({}),
  rejectInterrupt: vi.fn().mockResolvedValue({}),
  type: 'mock', // dummy for type-only imports
}));
```

### Test Pattern for useChatStream Interrupt SSE

The existing `connectSSE` mock needs to capture the 3rd callback parameter:

```tsx
// In beforeEach, update connectSSE mock:
let interruptCallback: ((eventType: string, payload: any) => void) | undefined;
vi.mocked(apiClient.connectSSE).mockImplementation((onEvent, _onError, onInterrupt) => {
  interruptCallback = onInterrupt;
  // ... existing logic ...
  return mockSSE as unknown as EventSource;
});

// In test:
await act(async () => {
  interruptCallback?.('interrupt.created', {
    interrupt: { id: 'int-1', tool_name: 'write_file', message: 'Test', status: 'pending' },
  });
});
expect(result.current.isInterruptActive).toBe(true);
```

### Stream Interrupt Event Test

```tsx
// Simulate streamThreadMessage firing an interrupt event
vi.mocked(apiClient.streamThreadMessage).mockImplementation(
  async (_tid, _text, _ideaId, onEvent) => {
    onEvent?.({ type: 'interrupt', extras: { interrupt: { id: 'int-1', tool_name: 'write_file', message: 'needs approval' } } });
  }
);
```

## Verification

**Commands:**
- `cd frontend && npx vitest run --pool=threads --reporter=verbose` — expected: all tests pass, no failures
- `cd frontend && npx tsc --noEmit` — expected: no type errors
- `cd frontend && npx vitest run --pool=threads src/__tests__/HITLApprovalCard.test.tsx` — expected: all HITLApprovalCard tests pass
- `cd frontend && npx vitest run --pool=threads src/__tests__/useChatStream.test.tsx` — expected: all useChatStream tests pass including new interrupt tests
