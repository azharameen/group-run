---
title: 'C3.2: Feedback Resolution Engine'
type: 'feature'
created: '2025-08-14'
status: 'done'
baseline_revision: '08f18c0'
final_revision: 'aca4fcb'
context:
  - '{project-root}/_bmad-output/project-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/commander/c1-3-dispatch-classifier-and-badges.md'
  - '{project-root}/_bmad-output/implementation-artifacts/commander/c2-2-adaptive-polling-auto-approval.md'
  - '{project-root}/_bmad-output/implementation-artifacts/commander/c3-1-copilot-dispatch-session-tracking.md'
---

<intent-contract>

## Intent

**Problem:** Jules sessions can get stuck waiting for feedback when they encounter issues. Without automatic feedback resolution, sessions stall and require manual intervention.

**Approach:** Implement a 3-tier feedback resolution engine: (1) auto-resolution for known patterns, (2) Copilot escalation for complex decisions, (3) user approval cards with 2-minute timeout and defer behavior.

## Boundaries & Constraints

**Always:**
- Auto-resolution tried first for known patterns
- Copilot escalation for complex feedback
- User approval cards for Copilot failures
- 2-minute timeout on user cards with defer behavior
- Use sendMessage() to respond to Jules sessions
- Use escalateToCopilot() from C2.2 for escalation

**Block If:**
- All 3 tiers fail (escalate to human)
- Jules API unavailable
- Feedback cannot be parsed

**Never:**
- Auto-resolve untrusted feedback types
- Block Jules session indefinitely
- Lose feedback context during escalation

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Auto-resolution match | Feedback matches known rule | Instant response sent to Jules | No error |
| Copilot escalation | No auto-resolution match | Escalated to Copilot | Wait for response |
| User approval card | Copilot fails | Card shown with 2-min timer | Timer countdown |
| Timer expiry | 2 minutes elapse | Feedback deferred, Jules continues | Defer logged |
| Jules API down | sendMessage() fails | Retry with backoff | Error logged |

</intent-contract>

## Code Map

- `.github/extensions/command-center/commander.mjs` -- Add `tryAutoResolve()`, `resolveFeedback()`, `createFeedbackCard()` exports. Reuse `escalateToCopilot()`, `sendMessage()`.
- `.github/extensions/command-center/extension.mjs` -- Wire feedback cards to UI with timer display.
- `_bmad-output/implementation-artifacts/commander/c2-2-adaptive-polling-auto-approval.md` -- C2.2 escalateToCopilot used for escalation.
- `_bmad-output/implementation-artifacts/commander/c3-1-copilot-dispatch-session-tracking.md` -- C3.1 dispatchToCopilot used for Copilot resolution.

## Tasks & Acceptance

**Execution:**
- [ ] `commander.mjs` -- Implement `tryAutoResolve(feedback, story)` -- Check feedback against known rules and return response or null
- [ ] `commander.mjs` -- Implement `resolveFeedback(session, story, feedback)` -- 3-tier resolution: auto, Copilot, user
- [ ] `commander.mjs` -- Implement `createFeedbackCard(session, feedback, timeout)` -- Create user approval card with timer
- [ ] `extension.mjs` -- Add feedback card UI component with timer and actions
- [ ] `commander.mjs` -- Export `tryAutoResolve`, `resolveFeedback`, `createFeedbackCard` from module

**Acceptance Criteria:**
- Given Jules feedback matches auto-resolution rules, when `tryAutoResolve()` is called, then response is returned
- Given Jules feedback doesn't match auto-resolution, when `tryAutoResolve()` is called, then null is returned
- Given Jules feedback arrives, when `resolveFeedback()` is called, then auto-resolution is attempted first
- Given auto-resolution fails, when `resolveFeedback()` is called, then Copilot escalation is attempted
- Given Copilot escalation fails, when `resolveFeedback()` is called, then user approval card is created
- Given a user approval card is created, when `createFeedbackCard()` is called, then 2-minute timer starts
- Given timer expires on user card, when 2 minutes elapse, then feedback is deferred and Jules continues

## Design Notes

### Dependencies

- **C2.2**: `escalateToCopilot(session, story, message)` for Copilot escalation
- **C3.1**: `dispatchToCopilot(story, state)` for Copilot session creation

### Auto-Resolution Rules

Known feedback patterns that can be auto-resolved:
- "Which branch should I use?" → return branch name from createFeatureBranch()
- "Should I create a PR?" → return "yes" with target branch
- "Confirm story X-Y" → return confirmation if story matches

### 3-Tier Resolution Flow

1. **Auto-Resolution**: Try `tryAutoResolve(feedback, story)` - returns response or null
2. **Copilot Escalation**: If null, call `escalateToCopilot(session, story, feedback)` - wait for response
3. **User Approval**: If Copilot fails, create card with `createFeedbackCard()` - 2-min timeout

### Feedback Card Structure

```
┌─────────────────────────────────────┐
│ Jules Feedback - {story.id}         │
├─────────────────────────────────────┤
│ {feedback content}                  │
│                                     │
│ Timer: 02:00                        │
│ [Approve] [Reject] [Modify]         │
└─────────────────────────────────────┘
```

### Function Signatures

```js
/**
 * Try to auto-resolve feedback against known rules.
 * @param {string} feedback - Jules feedback message
 * @param {object} story - Story work item
 * @returns {string|null} resolution response or null
 */
export function tryAutoResolve(feedback, story);

/**
 * Resolve Jules feedback through 3-tier process.
 * @param {object} session - Jules session object
 * @param {object} story - Story work item
 * @param {string} feedback - Feedback message
 * @returns {Promise<{tier: 'auto' | 'copilot' | 'user', response?: string, cardId?: string}>}
 */
export async function resolveFeedback(session, story, feedback);

/**
 * Create user approval card with timer.
 * @param {object} session - Jules session object
 * @param {string} feedback - Feedback content
 * @param {number} [timeout=120000] - Timeout in milliseconds (default 2 minutes)
 * @returns {{cardId: string, timer: number, resolve: Function, reject: Function}}
 */
export function createFeedbackCard(session, feedback, timeout = 120000);
```
