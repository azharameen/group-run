# Epic C2 Context: Jules Session Lifecycle

<!-- Generated from planning artifacts. Regenerate with compile-epic-context if planning docs change. -->

## Goal

Commander can dispatch to Jules and manage the full session lifecycle — branch naming, brief building, adaptive polling, auto-approval. This enables hands-off execution: a Jules-eligible story goes from dispatch to completed PR with minimal human intervention.

**Duration:** Week 3-4

## Stories

- Story C2.1: Branch Naming & Jules Brief Builder
- Story C2.2: Adaptive Polling & Auto-Approval

## Requirements & Constraints

### ST-C2.1: Branch Naming & Jules Brief Builder

**Given** A Jules-eligible story
**When** `createFeatureBranch(story, task)` is called
**Then** Returns `feat/<story-key>-<desc>`
- **And** Story key extracted from `story.id`
- **And** Task slug added if task exists
- **And** Branch name is unique (no duplicates)

**Given** A Jules-eligible story
**When** `buildJulesBrief(story)` is called
**Then** Brief includes:
- **And** Task title
- **And** Project context (relevant sections)
- **And** Intent contract block
- **And** Code map section
- **And** Acceptance criteria
- **And** Tasks checklist
- **And** Coding rules from `project-context.md`
- **And** Constraints: No BMad skills, commit format, PR target

**Given** Brief is self-contained
**When** Jules session starts with brief
**Then** Jules can execute without external skill invocation
- **And** All file targets are clear
- **And** Acceptance criteria are testable
- **And** Branch name is used

**Validation:**
- Test: Generate branch name for multiple stories — unique, follows format
- Test: Generate Jules brief — contains all required sections
- Test: Jules session created with brief — executes correctly
- Verify: Brief is under token limits

### ST-C2.2: Adaptive Polling & Auto-Approval

**Given** A Jules session in `AWAITING_PLAN_APPROVAL` state
**When** Polling interval is determined
**Then** Interval is 5 seconds

**Given** A Jules session in `IN_PROGRESS` state
**When** Polling interval is determined
**Then** Interval is 30 seconds

**Given** A Jules session in terminal state
**When** Polling interval is determined
**Then** Polling stops

**Given** A Jules session awaits plan approval
**When** Story has `intent-contract` + `code map`
**Then** Plan is auto-approved
- **And** Session continues to coding
- **And** No human intervention needed

**Given** A Jules session awaits plan approval
**When** Story lacks Jules-ready markers
**Then** Feedback is escalated to Copilot (`bmad-agent-dev`)
- **And** Copilot decides whether to approve
- **And** Session waits for Copilot response

**Validation:**
- Test: Polling intervals match state machine
- Test: Auto-approval works for Jules-ready stories
- Test: Escalation to Copilot works for non-ready stories
- Verify: No sessions stuck in AWAITING states

## Technical Decisions

### C2.1 — Branch Naming

- Use the project branch naming convention: `feat/<story-key>-<short-description>` (see project-context.md, Branch Naming Convention section). Story key derived from `story.id` (e.g., `c2-1`). Description via `slugify(title)` from existing `commander.mjs` helpers.
- Uniqueness: check existing remote branches via a lightweight `git branch -r` call; append numeric suffix (`-1`, `-2`, ...) on collision.
- `createFeatureBranch(story, task)` must both return the branch name string AND create the branch on disk (`git checkout -b <name>`) and optionally push (`git push -u origin <name>`).

### C2.1 — Brief Builder

- `buildJulesBrief(story)` replaces/enhances the existing `buildJulesTaskPrompt` (line ~917 in `commander.mjs`). The existing function produces a minimal prompt; the new brief must be self-contained:
  - Extract intent-contract: `<intent-contract>` block from story document body (regex already present in `classifyDispatch`, line ~971).
  - Extract code map: `## Code Map` or `## Dev Notes` heading snippet (existing logic at line ~972).
  - Include acceptance criteria from the story YAML front-matter (`metadata.acceptanceCriteria` or similar).
  - Include task checklist (parallel to `buildJulesTaskPrompt` line 930).
  - Inject coding rules from `project-context.md` (read once, cached — ~20KB, relevant sections only: Technology Stack, Critical Implementation Rules, Branch Management Rules).
  - Enforce token budget: total brief < 12KB (consistent with the `body.slice(0, 12000)` truncation at line 932).
- Constraints appended to every brief: "Do not use BMad skills", "Commit format: `feat(<scope>): description`", "PR target: `develop` branch".

### C2.2 — Adaptive Polling

- Polling state machine maps Jules session states (already defined in `jules-client.mjs` lines 249-283) to intervals:

  | Session State | Poll Interval |
  |---|---|
  | `AWAITING_PLAN_APPROVAL` | 5s |
  | `AWAITING_USER_FEEDBACK` | 10s |
  | `PLANNING` | 15s |
  | `IN_PROGRESS` | 30s |
  | `QUEUED` | 10s |
  | `COMPLETED`, `FAILED` | stop polling |

- Implement `pollSession(sessionName, onStateChange, maxAttempts?)` — an async generator or callback-based loop with `setTimeout` backoff. Use `getSessionSummary()` from jules-client (line 196) as the polling payload.
- Session registry: track active polls in `state.julesSessions` map keyed by session name; cancel on story completion or user abort.

### C2.2 — Auto-Approval

- When polling detects `AWAITING_PLAN_APPROVAL`, evaluate the parent story using the existing `classifyDispatch(story, state)` (line 943). If `classifyDispatch` returns `{ agent: "jules", level: "story" }` (intent-contract + code map present), call `approvePlan(sessionName, planId)` from jules-client (line 242).
- If the story is NOT Jules-ready at story-level, escalate: emit a `jules_approval_needed` event with session metadata for the Copilot dispatch handler (EP-C3) or human notification.
- Auto-approval is gated: only stories that passed `classifyDispatch` with `agent: "jules", level: "story"` qualify. Task-level Jules (`level: "task"`) stories do NOT auto-approve — they escalate.

## Cross-Story Dependencies

- **C2.1 depends on C1.3 (classifyDispatch):** Branch creation and brief building are only triggered for items classified as `agent: "jules"` by `classifyDispatch()` (commander.mjs line 943). The existing function must be imported.
- **C2.1 depends on C1.1 (module split):** `buildJulesBrief` is listed as a required export from `commander.mjs` (EP-C1 requirement line 18). It must follow the same named-export pattern.
- **C2.2 depends on C2.1:** Polling and auto-approval operate on sessions created via `createFeatureBranch` + `buildJulesBrief` + `createSession`.
- **C2.2 to C3.1 (future):** Escalation to Copilot for non-ready plan approval is an EP-C3 concern. C2.2 only needs to emit the escalation event/signal; actual Copilot dispatch is EP-C3.

## Key Dependencies from EP-C1

### `classifyDispatch(story, state)` — commander.mjs line 943
- Returns `{ agent: "jules"|"copilot", level: "story"|"task", skill? }`.
- Jules-ready at story level requires both `<intent-contract>` block AND code map with file paths (lines 971-975).
- Used by C2.2 auto-approval gate: only `agent: "jules", level: "story"` qualifies for auto-approve.

### `buildJulesTaskPrompt(state, item, prompt)` — commander.mjs line 917
- Existing minimal prompt builder. Produces a string with: task title, summary, BMad hierarchy, child subtasks, source path, story specification (truncated to 12KB).
- C2.1's `buildJulesBrief` should supplant or extend this function — reuse the hierarchy, children, and document lookup logic (lines 919-925).

### `decorateBoardState(state)` — commander.mjs line 1000
- Populates `state.workItems`, `state.workLookup`, `state.classificationIndex`, `state.classificationCounts`.
- C2.2 polling should read `state.classificationIndex` to determine auto-approval eligibility without re-running `classifyDispatch`.

### `slugify(value)` — commander.mjs line 32
- Existing utility for generating id-friendly slugs. Use for branch name description component.

### `buildNextActionSuggestion(state)` — commander.mjs ~line 900
- Returns `{ skill, agent, reason, sessionReuse, julesCanHandle, julesPrompt, targetItemId }`.
- The `julesPrompt` and `julesCanHandle` fields bridge classify to dispatch; C2.1 should integrate with this flow.

## Existing Jules Client

**File:** `.github/extensions/command-center/jules-client.mjs` (285 lines)

### Available exports (C2 can use directly):

| Export | Purpose | C2 Usage |
|---|---|---|
| `createSession(opts)` | Create new Jules session with prompt, source, branch | C2.1 — dispatch |
| `getSession(sessionName)` | Get session by name/ID | C2.2 — polling |
| `listSessions(pageSize)` | List recent sessions | Board integration |
| `listActivities(sessionName, pageSize)` | Get session activities | C2.2 — progress |
| `getSessionSummary(sessionName)` | Combined session + activities summary | C2.2 — polling payload |
| `sendMessage(sessionName, message)` | Send follow-up message | C2.2 — feedback |
| `approvePlan(sessionName, planId)` | Approve pending plan | C2.2 — auto-approval |
| `resolveApiKey()` | Resolve Jules API key | Auth |
| `findSourceId(owner, repo)` | Find GitHub source ID | C2.1 — dispatch |
| `isTerminal(state)` | Check if state is terminal | C2.2 — stop polling |
| `TERMINAL_STATES`, `ACTIVE_STATES` | State set constants | C2.2 — state machine |
| `stateLabel(state)`, `stateEmoji(state)` | UI formatting | Board display |

### New functions needed (add to jules-client.mjs or commander.mjs):
- None for the client layer itself — all needed Jules API calls are already present. New logic (branch naming, brief building, polling loop, auto-approval) belongs in `commander.mjs`.

## Code Conventions (from project-context.md)

### TypeScript/JavaScript
- **ES modules** — `.mjs` extension, `import`/`export` syntax (not CommonJS).
- **Named exports** — commander.mjs exports individual functions (`parseDeferredWork`, `classifyDispatch`, `buildJulesBrief`, `mergeAgentState`).
- **JSDoc required** — every exported function must include JSDoc with `@param` and `@returns`.
- **Stdlib only** — jules-client uses Node 18+ `fetch`; no external HTTP libraries.

### Naming
- **camelCase** for functions and variables in JavaScript.
- **PascalCase** for classes (e.g., `CanvasError`).

### Testing
- Tests go alongside modules. Unit test each exported function.
- Mock the Jules API boundary — tests must NEVER call the live Jules API.
- Class-based test structure with descriptive methods.

### Branch & PR
- Branch: `feat/c2-1-branch-naming-and-brief` or `feat/c2-2-adaptive-polling-auto-approval`
- PR target: `develop` (never `main`)
- Commit format: `feat(commander): add Jules session polling`

### File-size limits
- Route files < 150 lines, services < 200 lines (backend). Commander module (JS) — keep functions focused; `commander.mjs` is ~1050 lines currently.

## File Structure

```
.github/extensions/command-center/
  commander.mjs           # ADD: createFeatureBranch(), buildJulesBrief(), pollSession(), autoApprovePlan()
  jules-client.mjs        # NO CHANGES — all needed API methods already exist
  services/
    bmad-model.mjs        # Import source for buildCanonicalWorkModel
  extension.mjs           # Import new commander exports (thin loader)

_bmad-output/implementation-artifacts/commander/
  epic-c1-context.md      # Previous epic (reference)
  epic-c2-context.md      # THIS FILE

backend/tests/            # If backend integration tests are needed
frontend/src/             # Board UI updates for polling status (future)
```

### New exports from commander.mjs (EP-C2):

```javascript
/**
 * Create a feature branch for a Jules-eligible story.
 * @param {object} story - work item with id, title
 * @param {object} [task] - optional subtask
 * @returns {string} branch name (e.g. "feat/c2-1-implement-login")
 */
export function createFeatureBranch(story, task) { ... }

/**
 * Build a self-contained brief for Jules dispatch.
 * @param {object} story - Jules-eligible story (passed classifyDispatch)
 * @param {object} state - board state with documents, workspacePath
 * @returns {string} brief prompt string
 */
export function buildJulesBrief(story, state) { ... }

/**
 * Poll a Jules session with adaptive intervals.
 * @param {string} sessionName - "sessions/12345"
 * @param {function} onStateChange - callback(sessionSummary)
 * @param {object} [opts] - { maxAttempts?, story? }
 * @returns {Promise<{ stop: function }>} - returns controller
 */
export async function pollSession(sessionName, onStateChange, opts = {}) { ... }

/**
 * Decide whether to auto-approve a Jules plan.
 * @param {string} sessionName - "sessions/12345"
 * @param {object} story - parent story
 * @param {object} classification - result from classifyDispatch
 * @returns {Promise<{ approved: boolean, escalated?: boolean }>}
 */
export async function autoApprovePlan(sessionName, story, classification) { ... }
```

## Observability & Audit

- Follow EP-C1 convention: log every Commander decision as structured JSONL.
- New event types:
  - `jules_branch_created` — { storyId, branchName }
  - `jules_session_created` — { sessionId, storyId, branchName }
  - `jules_poll_tick` — { sessionId, currentState, interval, tickNum }
  - `jules_auto_approved` — { sessionId, planId, storyId }
  - `jules_approval_escalated` — { sessionId, storyId, reason }
  - `jules_session_terminal` — { sessionId, finalState, prUrl, durationMs }
