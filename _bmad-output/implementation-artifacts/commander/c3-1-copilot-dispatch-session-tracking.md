---
title: 'C3.1: Copilot Dispatch & Session Tracking'
type: 'feature'
created: '2025-08-14'
status: 'done'
baseline_revision: 'd43e5f8'
final_revision: '1b03482'
context:
  - '{project-root}/_bmad-output/project-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/commander/c1-3-dispatch-classifier-and-badges.md'
  - '{project-root}/_bmad-output/implementation-artifacts/commander/c2-1-branch-naming-jules-brief-builder.md'
---

<intent-contract>

## Intent

**Problem:** Stories that are Copilot-only (not Jules-ready) need to be dispatched to Copilot with bmad-agent-dev, which has BMad skills available. Without proper dispatch, these stories cannot be implemented.

**Approach:** Implement `dispatchToCopilot()` that creates Copilot sessions with proper branch context, story spec, and BMad skill invocation, plus `trackCopilotSession()` for SSE-based session state updates.

## Boundaries & Constraints

**Always:**
- Copilot sessions use bmad-agent-dev agent type
- Branch created before dispatch using createFeatureBranch()
- Story spec included in prompt
- BMad skill invocation included (bmad-dev-story)
- SSE events emitted for state changes
- Use classifyDispatch() to detect Copilot-only stories

**Block If:**
- Branch creation fails
- Story spec missing
- Copilot agent unavailable

**Never:**
- Dispatch Jules-ready stories to Copilot
- Modify story spec files
- Skip branch creation

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Standard Copilot dispatch | Copilot-only story | Copilot session created with branch | No error |
| Branch creation fails | Git error | Dispatch blocked | Error logged |
| Missing story spec | No spec file | Dispatch blocked | Error logged |
| SSE connection lost | WebSocket error | Reconnect and resend | Retry with backoff |

</intent-contract>

## Code Map

- `.github/extensions/command-center/commander.mjs` -- Add `dispatchToCopilot()`, `trackCopilotSession()`, `buildCopilotPrompt()` exports. Reuse `createFeatureBranch()`, `classifyDispatch()`.
- `.github/extensions/command-center/extension.mjs` -- Wire Copilot dispatch button and SSE session tracking.
- `_bmad-output/implementation-artifacts/commander/c2-1-branch-naming-jules-brief-builder.md` -- C2.1 createFeatureBranch used for branch naming.
- `_bmad-output/implementation-artifacts/commander/c1-3-dispatch-classifier-and-badges.md` -- C1.3 classifyDispatch used to detect Copilot-only.

## Tasks & Acceptance

**Execution:**
- [ ] `commander.mjs` -- Implement `buildCopilotPrompt(story, state)` -- Assemble prompt with story spec, branch context, BMad skill invocation
- [ ] `commander.mjs` -- Implement `dispatchToCopilot(story, state, options)` -- Create branch and Copilot session
- [ ] `commander.mjs` -- Implement `trackCopilotSession(sessionId)` -- Set up SSE listener for Copilot session state
- [ ] `extension.mjs` -- Add Copilot dispatch button for Copilot-only stories
- [ ] `commander.mjs` -- Export `buildCopilotPrompt`, `dispatchToCopilot`, `trackCopilotSession` from module

**Acceptance Criteria:**
- Given a Copilot-only story, when `buildCopilotPrompt()` is called, then prompt includes story spec, branch name, and BMad skill invocation
- Given a Copilot-only story, when `dispatchToCopilot()` is called, then branch is created with createFeatureBranch() and Copilot session is started
- Given a Copilot session is created, when `trackCopilotSession()` is called, then SSE events are emitted for state changes
- Given a Copilot session changes state, when SSE event is received, then board updates with new state
- Given branch creation fails, when `dispatchToCopilot()` is called, then dispatch is blocked and error is logged

## Design Notes

### Dependencies

- **C1.3**: `classifyDispatch(story, state)` for Copilot-only detection
- **C2.1**: `createFeatureBranch(story, task)` for branch naming

### Copilot Prompt Structure

```
# Task: {story.title}

## Story Specification
{story body}

## Branch
{branch name}

## Instructions
- Use bmad-dev-story skill
- Execute story tasks
- Commit and push changes
- Create PR to develop

## Project Rules
{from project-context.md}
```

### Session Tracking

SSE events:
- `copilot.created` - Session started
- `copilot.running` - Session executing
- `copilot.idle` - Session waiting
- `copilot.completed` - Session finished
- `copilot.failed` - Session errored

### Function Signatures

```js
/**
 * Build Copilot prompt with story spec and branch context.
 * @param {object} story - Story work item
 * @param {object} state - Board state
 * @returns {string} Copilot prompt
 */
export function buildCopilotPrompt(story, state);

/**
 * Dispatch story to Copilot with bmad-agent-dev.
 * @param {object} story - Story work item
 * @param {object} state - Board state
 * @param {object} [options] - Optional dispatch options
 * @returns {Promise<{sessionId: string, branch: string}>}
 */
export async function dispatchToCopilot(story, state, options);

/**
 * Track Copilot session state via SSE.
 * @param {string} sessionId - Copilot session ID
 * @returns {object} SSE listener
 */
export function trackCopilotSession(sessionId);
```
