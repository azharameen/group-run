---
title: 'C2.2: Adaptive Polling & Auto-Approval'
type: 'feature'
created: '2025-08-14'
status: 'done'
baseline_revision: '3fff7d0'
final_revision: 'd43e5f8'
context:
  - '{project-root}/_bmad-output/project-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/commander/epic-c2-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/commander/c2-1-branch-naming-jules-brief-builder.md'
---

<intent-contract>

## Intent

**Problem:** Jules sessions need to be monitored efficiently. Without adaptive polling and auto-approval, sessions either poll too frequently (wasting API calls) or get stuck waiting for manual approval.

**Approach:** Implement adaptive polling that adjusts interval based on Jules session state (5s for AWAITING_PLAN_APPROVAL, 30s for IN_PROGRESS, stop for terminal states) and auto-approve plans for Jules-ready stories (those with intent-contract + code map) to eliminate human intervention.

## Boundaries & Constraints

**Always:**
- Polling interval adjusts based on session state per state machine
- Auto-approval only for stories with intent-contract + code map
- Escalation to Copilot (bmad-agent-dev) when story lacks Jules-ready markers
- Use existing jules-client.mjs exports (getSession, approvePlan, sendMessage)
- Use classifyDispatch() from C1.3 to determine Jules-ready status
- New functions exported from commander.mjs

**Block If:**
- Jules API key not available
- Session in terminal state (no need to poll)
- Auto-approval fails (escalate to Copilot)

**Never:**
- Poll sessions in terminal states
- Auto-approve without Jules-ready markers
- Bypass classification logic from C1.3

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Plan approval ready | session.state = AWAITING_PLAN_APPROVAL, story has intent-contract + code map | Auto-approve with approvePlan() | No error |
| Plan approval needs Copilot | session.state = AWAITING_PLAN_APPROVAL, story lacks markers | Escalate to Copilot via sendMessage() | Escalation message |
| Active polling | session.state = IN_PROGRESS | Poll at 30s intervals | No error |
| Terminal state | session.state = COMPLETED or FAILED | Stop polling | No error |
| Polling failure | API call fails | Retry after backoff | Error logged |

</intent-contract>

## Code Map

- `.github/extensions/command-center/commander.mjs` -- Add `determinePollingInterval()`, `autoApprovePlan()`, `escalateToCopilot()` exports. Reuse `classifyDispatch()`, `stateLabel()`, `isTerminal()`.
- `.github/extensions/command-center/extension.mjs` -- Wire adaptive polling to SSE watcher with dynamic intervals.
- `.github/extensions/command-center/jules-client.mjs` -- Existing client with `getSession()`, `approvePlan()`, `sendMessage()`. No changes needed.
- `_bmad-output/planning-artifacts/architecture/command-center-orchestrator/JULES-SESSION-LIFECYCLE.md` -- State machine, decision matrix, feedback resolution flow.

## Tasks & Acceptance

**Execution:**
- [ ] `commander.mjs` -- Implement `determinePollingInterval(sessionState)` -- Return interval based on state machine
- [ ] `commander.mjs` -- Implement `autoApprovePlan(session, story, state)` -- Check Jules-ready status and auto-approve or escalate
- [ ] `commander.mjs` -- Implement `escalateToCopilot(session, story, message)` -- Send escalation message to Copilot via bmad-agent-dev
- [ ] `extension.mjs` -- Update Jules session watcher to use adaptive polling intervals
- [ ] `commander.mjs` -- Export `determinePollingInterval`, `autoApprovePlan`, `escalateToCopilot` from module

**Acceptance Criteria:**
- Given a Jules session in `AWAITING_PLAN_APPROVAL`, when `determinePollingInterval()` is called, then it returns 5000 (5 seconds)
- Given a Jules session in `AWAITING_USER_FEEDBACK`, when `determinePollingInterval()` is called, then it returns 15000 (15 seconds)
- Given a Jules session in `IN_PROGRESS`, when `determinePollingInterval()` is called, then it returns 30000 (30 seconds)
- Given a Jules session in `QUEUED`, when `determinePollingInterval()` is called, then it returns 10000 (10 seconds)
- Given a Jules session in terminal state (COMPLETED, FAILED, CANCELLED), when `determinePollingInterval()` is called, then it returns 0 (stop polling)
- Given a Jules session awaits plan approval and story has intent-contract + code map, when `autoApprovePlan()` is called, then `approvePlan()` is invoked and plan is auto-approved
- Given a Jules session awaits plan approval and story lacks Jules-ready markers, when `autoApprovePlan()` is called, then `escalateToCopilot()` is called and session waits for response
- Given an escalation to Copilot, when `escalateToCopilot()` is called, then `sendMessage()` is invoked with escalation payload
- Given a Jules session API call fails during polling, when retry is triggered, then exponential backoff is applied (1s, 2s, 4s, 8s max)

## Design Notes

### Dependencies

- **C1.3**: `classifyDispatch(story, state)` for Jules-ready detection
- **C2.1**: `createFeatureBranch(story, task)` for branch naming

### Polling Interval Strategy

Based on Jules session state:
- `AWAITING_PLAN_APPROVAL`: 5 seconds (quick response needed)
- `AWAITING_USER_FEEDBACK`: 15 seconds (moderate monitoring)
- `IN_PROGRESS`: 30 seconds (normal monitoring)
- `QUEUED`: 10 seconds (waiting to start)
- Terminal states (`COMPLETED`, `FAILED`, `CANCELLED`): 0 (stop polling)

### Auto-Approval Logic

Using `classifyDispatch()` from C1.3:
- If `classifyDispatch(story, state).julesReady` is true, auto-approve
- Otherwise, escalate to Copilot via `bmad-agent-dev` skill

### Escalation Flow

When auto-approval fails:
1. Build escalation message with session details and story context
2. Send message to Copilot via `sendMessage()`
3. Session enters `AWAITING_USER_FEEDBACK` state
4. Copilot reviews and decides whether to approve or escalate further

### Function Signatures

```js
/**
 * Determine polling interval based on Jules session state.
 * @param {string} sessionState - Jules session state
 * @returns {number} polling interval in milliseconds (0 = stop)
 */
export function determinePollingInterval(sessionState);

/**
 * Auto-approve plan or escalate to Copilot based on Jules-ready status.
 * @param {object} session - Jules session object with state, id, etc.
 * @param {object} story - Story work item
 * @param {object} state - Board state
 * @returns {Promise<{action: 'approved' | 'escalated', messageId?: string}>}
 */
export async function autoApprovePlan(session, story, state);

/**
 * Escalate feedback to Copilot via bmad-agent-dev.
 * @param {object} session - Jules session object
 * @param {object} story - Story work item
 * @param {string} message - Escalation message
 * @returns {Promise<string>} message ID
 */
export async function escalateToCopilot(session, story, message);
```
