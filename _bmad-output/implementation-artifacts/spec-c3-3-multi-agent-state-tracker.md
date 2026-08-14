---
title: 'C3.3: Multi-Agent State Tracker'
type: 'feature'
created: '2026-08-14'
status: 'in-review'
baseline_revision: 'f9836415e92b8fb3dd81bb45f875c31990c5e085'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/_bmad-output/project-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/epic-3-context.md'
warnings:
  - multiple-goals
---

<intent-contract>

## Intent

**Problem:** The Command Center board shows BMad work items (epics, stories, tasks) but has no visibility into active Jules or Copilot sessions. `mergeAgentState()` exists but isn't wired into the board rendering or SSE broadcasts. `trackCopilotSession()` is a stub. Operators cannot see what sessions are running, their status, or links to active work.

**Approach:** Integrate multi-agent state into the board decoration pipeline, add an Active Agents section to the HTML renderer, implement `trackCopilotSession` with actual SSE polling, broadcast state updates via existing SSE infrastructure, and add JSON-based state persistence for reload recovery.

## Boundaries & Constraints

**Always:**
- Use `mergeAgentState()` for merging Jules and Copilot session data
- Store session state in a JSON file at `{artifactRoot}/implementation-artifacts/commander/agent-state.json`
- Include multi-agent state in `decorateBoardState` output
- Broadcast multi-agent state changes via SSE
- Links to Jules session URLs and Copilot session URLs must be clickable
- Follow existing code patterns: no shell/code-runner tools, use `child_process.exec` for git

**Block If:**
- Jules API unavailable for session polling
- State file cannot be written (check permissions)
- SSE connection fails repeatedly (more than 3 attempts)

**Never:**
- Block board rendering if state is unavailable
- Modify Jules session lifecycle (C2.2 ownership)
- Modify Copilot dispatch logic (C3.1 ownership)

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Both Jules and Copilot active | Multiple sessions each | Unified state with all sessions listed | No error |
| No active sessions | Empty session arrays | Active Agents section shows "No active sessions" | No error |
| State file missing on reload | No agent-state.json | Start fresh, create file on first save | Log warning |
| State file corrupted | Invalid JSON | Reset to empty state, log error | Graceful recovery |
| SSE broadcast fails | Network error | Retry with backoff, drop after 3 retries | Error logged |
| Copilot session tracking stub | trackCopilotSession called | Return stub listener with event registration | No actual polling |

</intent-contract>

## Code Map

- `.github/extensions/command-center/commander.mjs` -- Add `decorateBoardState` multi-agent integration, implement `trackCopilotSession`, add `persistAgentState`, `loadAgentState`, `broadcastAgentState` exports
- `.github/extensions/command-center/commander.mjs` -- Add Active Agents HTML section to `renderHtml` with session tables
- `.github/extensions/command-center/extension.mjs` -- Wire multi-agent state to SSE broadcasts, call `mergeAgentState` in polling loop
- `_bmad-output/implementation-artifacts/commander/agent-state.json` -- Session state persistence file

## Tasks & Acceptance

**Execution:**
- [x] `commander.mjs` -- Implement `loadAgentState(statePath)` and `persistAgentState(statePath, state)` for JSON-based state persistence
- [x] `commander.mjs` -- Add multi-agent state to `decorateBoardState` — call `mergeAgentState` with active sessions, store result in `state.agentState`
- [x] `commander.mjs` -- Implement `trackCopilotSession(sessionId)` — replace stub with actual session state tracking
- [x] `commander.mjs` -- Add `broadcastAgentState(instanceId, state)` — push merged agent state to SSE clients
- [x] `commander.mjs` -- Add Active Agents section to `renderHtml` — Jules session table, Copilot session table, real-time SSE consumer
- [x] `extension.mjs` -- Wire `mergeAgentState` into Jules polling loop; call `broadcastAgentState` on state changes
- [x] `extension.mjs` -- Load persisted agent state on canvas open, save on every state change
- [x] `commander.mjs` -- Export `loadAgentState`, `persistAgentState`, `broadcastAgentState`, `trackCopilotSession`

**Acceptance Criteria:**
- Given active Jules and Copilot sessions, when `mergeAgentState()` is called, then unified state returns all sessions with status, URLs, and story links
- Given multi-agent state exists, when Command Center board renders, then Active Agents section displays Jules and Copilot session tables
- Given a session state changes, when SSE broadcast fires, then connected clients receive updated state
- Given the canvas is reloaded, when `loadAgentState()` is called, then previously persisted sessions are restored
- Given no sessions are active, when board renders, then Active Agents section shows "No active sessions" message

## Spec Change Log

## Review Triage Log

### 2026-08-14 — Review pass
- intent_gap: 0
- bad_spec: 0
- patch: 4: (high 1, medium 2, low 1)
- defer: 4: (medium 4)
- reject: 5
- addressed_findings:
  - `[high]` `[patch]` normalizeAgentSessionList walked metadata objects as sessions — added `looksLikeSession()` guard to filter non-session objects
  - `[medium]` `[patch]` decorateBoardState dereferences null state — added null guard before agent state merge
  - `[medium]` `[patch]` syncAgentState mutated live state concurrently — replaced with spread to create new object
  - `[low]` `[patch]` loadAgentState resurrected stale state — added 24-hour staleness check

## Design Notes

### Multi-Agent State Integration Flow

```
Jules Poll Loop ──→ mergeAgentState() ──→ decorateBoardState()
Copilot Poll ────→                  │                    │
                                    ▼                    ▼
                              persistAgentState()   broadcastAgentState()
                              (JSON file)            (SSE push)
```

### Active Agents HTML Section Structure

```html
<div class="active-agents">
  <h3>Active Agents ({totalActive})</h3>
  <div class="jules-sessions">
    <h4>Jules Sessions ({julesRunning})</h4>
    <table>
      <tr><th>Status</th><th>Session</th><th>Story</th><th>Links</th></tr>
      <!-- rows from merged state -->
    </table>
  </div>
  <div class="copilot-sessions">
    <h4>Copilot Sessions ({copilotRunning})</h4>
    <table>
      <tr><th>Status</th><th>Session</th><th>Branch</th><th>Links</th></tr>
      <!-- rows from merged state -->
    </table>
  </div>
</div>
```

### State Persistence Format

```json
{
  "lastSaved": "2026-08-14T14:00:00.000Z",
  "julesSessions": [...],
  "copilotSessions": [...]
}
```

### Function Signatures

```js
/**
 * Load agent state from JSON file.
 * @param {string} statePath - Path to agent-state.json
 * @returns {Promise<object>} loaded state or empty default
 */
export async function loadAgentState(statePath);

/**
 * Persist agent state to JSON file.
 * @param {string} statePath - Path to agent-state.json
 * @param {object} state - Merged agent state from mergeAgentState()
 * @returns {Promise<void>}
 */
export async function persistAgentState(statePath, state);

/**
 * Track Copilot session state updates via polling.
 * @param {string} sessionId - Copilot session ID
 * @returns {object} session tracker with on() and disconnect()
 */
export function trackCopilotSession(sessionId);

/**
 * Broadcast agent state to SSE clients for an instance.
 * @param {string} instanceId - Canvas instance ID
 * @param {object} state - Merged agent state
 * @returns {void}
 */
export function broadcastAgentState(instanceId, state);
```

### Dependencies

- **C3.1**: `dispatchToCopilot()` creates Copilot sessions that need tracking
- **C3.2**: `resolveFeedback()` generates state changes that need broadcasting
- **C2.2**: Jules polling loop in `extension.mjs` provides session data for merging

## Verification

**Manual checks:**
- Open Command Center canvas, verify Active Agents section appears above work items
- Verify Jules sessions show status, URL, and story link
- Verify Copilot sessions show status, session ID, branch, and story link
- Refresh canvas, verify sessions persist from saved state
- Verify SSE updates reflect state changes without manual refresh
