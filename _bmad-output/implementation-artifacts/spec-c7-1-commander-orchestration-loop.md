---
title: 'C7.1: Commander Orchestration Loop'
type: 'feature'
created: '2026-08-14'
status: 'done'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/commander/epic-c1-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/commander/epic-c2-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/commander/epic-c3-context.md'
---

<frozen-after-approval>

## Intent

**Problem:** Commander has all the building blocks (classify, dispatch, monitor, review, merge) but lacks a main orchestration loop that ties them together. Dispatch functions are stubs that don't actually create sessions. There's no active polling, no parallel dispatch, and no decision loop that connects session completions to next actions.

**Approach:** Implement `orchestrateOnce()` as the main loop that: (1) scans board for open work, (2) classifies items for Jules vs Copilot, (3) dispatches parallel sessions respecting quota, (4) monitors active sessions with adaptive polling, (5) resolves completions via review/merge, and (6) persists state. Wire `dispatchToCopilot()` to use `create_session` API, and add `pollJulesSession()` for active monitoring.

## Boundaries & Constraints

**Always:**
- Reuse existing functions (classifyDispatch, buildJulesBrief, getDispatchStrategy, etc.)
- Respect Jules quota limits before dispatching
- Maintain structured JSONL decision logging
- Support parallel dispatch (1 Jules + 1 Copilot minimum)
- Adaptive polling intervals based on session state
- Log all orchestration decisions for trust metrics

**Ask First:**
- If Jules quota is exhausted and Copilot-only mode is forced
- If more than 3 parallel sessions are active
- If dispatch targets a story not in open status

**Never:**
- Modify story spec files
- Auto-merge PRs without review
- Dispatch to Jules for Copilot-only items
- Skip decision logging

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Full orchestration cycle | 2 open stories (1 Jules, 1 Copilot) | 2 parallel sessions created, state updated | Logged to JSONL |
| Jules quota exhausted | Quota used = limit | Only Copilot dispatch proceeds | Warning logged |
| Jules session completes | PR created, pipeline passes | reviewPR → autoMergePR → cleanup | Logged to JSONL |
| Copilot session completes | Story status = done | review → update board → next dispatch | Logged to JSONL |
| No open work | All stories done | No dispatch, status = "idle" | N/A |
| Session failure | Jules/Copilot errors | dispatchFixSession → retry or defer | Logged to JSONL |

</frozen-after-approval>

## Code Map

- `.github/extensions/command-center/commander.mjs` -- Main module, add orchestration functions
- `.github/extensions/command-center/jules-client.mjs` -- Jules API client (getSession, sendMessage, approvePlan)
- `.github/extensions/command-center/services/jules-service.mjs` -- Jules service layer
- `_bmad-output/implementation-artifacts/commander/agent-state.json` -- Persistent session tracking

## Tasks & Acceptance

**Execution:**
- [x] `.github/extensions/command-center/commander.mjs` -- Implement `pollJulesSession(sessionId)` that fetches live state, handles feedback via resolveFeedback, detects completion
- [x] `.github/extensions/command-center/commander.mjs` -- Wire `dispatchToCopilot()` to use actual session creation via orchestrator tracking (replaces stub)
- [x] `.github/extensions/command-center/commander.mjs` -- Implement `orchestrateOnce(state)` main loop: scan → classify → dispatch → monitor → resolve → persist
- [x] `.github/extensions/command-center/commander.mjs` -- Add `getOpenWorkItems(state)` to find dispatchable stories/tasks
- [x] `.github/extensions/command-center/commander.mjs` -- Add `resolveSessionCompletion(session, state)` to handle post-completion review/merge flow
- [x] `.github/extensions/command-center/extension.mjs` -- Add `run_orchestration` and `get_orchestrator_status` canvas actions
- [x] `.github/extensions/command-center/commander.mjs` -- Fix ESM imports: add jules-client imports (createJulesSession, getJulesSession, sendJulesMessage, approveJulesPlan)
- [x] `.github/extensions/command-center/commander.mjs` -- Fix unimported function calls: replace `sendMessage` → `sendJulesMessage`, `approvePlan` → `approveJulesPlan`

**Acceptance Criteria:**
- Given 2+ open stories in board, when orchestrateOnce runs, then parallel sessions are dispatched (at least 1 Jules, 1 Copilot if available)
- Given active Jules session, when pollJulesSession runs, then session state updates and feedback is resolved automatically
- Given Jules session completes with PR, when resolveSessionCompletion runs, then PR is reviewed and merged (if trusted)
- Given Copilot session completes, when resolveSessionCompletion runs, then story status updates and next action is determined
- Given Jules quota is exhausted, when orchestrateOnce runs, then Copilot-only dispatch proceeds with warning
- Given orchestration cycle completes, then all decisions are logged to JSONL for trust metrics
- Given Command Center canvas is open, when user clicks "Run Orchestration", then cycle executes and results are displayed

## Spec Change Log

## Verification

**Manual checks:**
- Open Command Center → click "Run Orchestration" → verify parallel dispatch
- Check agent-state.json for session tracking
- Verify JSONL decision log entries
- Monitor Dashboard tab for trust/health metrics updates
