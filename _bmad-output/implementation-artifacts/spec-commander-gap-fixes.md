---
title: 'Fix Commander runtime crashes and add Dashboard UI'
type: 'bugfix'
created: '2026-08-14'
status: 'done'
review_loop_iteration: 1
context:
  - '{project-root}/.github/extensions/command-center/commander.mjs'
  - '{project-root}/.github/extensions/command-center/extension.mjs'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Commander module has 3 critical runtime crashes (`executeCommand` undefined, `loadBoardState` undefined) that cause auto-merge, branch cleanup, and quota init to fail. Additionally, trust metrics, quota status, and health metrics functions exist but have no UI tab in the Command Center canvas, making observability data inaccessible.

**Approach:** Define the missing `executeCommand` and `loadBoardState` functions, export them, and add a Dashboard tab to the Command Center canvas that displays trust metrics, Jules quota, and health metrics with 7-day trend visualization.

## Boundaries & Constraints

**Always:**
- Use `child_process` with `timeout: 30000` for shell execution (follow existing `runGitCommand` pattern)
- `executeCommand` returns `{stdout, stderr, exitCode}` Promise
- `loadBoardState` reuses `buildBoardState` logic, returns the current board state object
- Dashboard tab uses existing CSS variables and tab pattern in `renderHtml`
- Functions are exported for use in extension.mjs

**Ask First:**
- If `executeCommand` needs to support non-git commands (gh CLI), confirm error handling strategy

**Never:**
- Modify `runGitCommand` (it's used correctly in C6.2 merge queue)
- Change `buildBoardState` signature
- Add P2/P3 features (PR review wiring, approval UI) — those are separate goals

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| executeCommand success | valid gh CLI command | returns stdout, exitCode 0 | N/A |
| executeCommand failure | command exits non-zero | returns stderr, exitCode > 0 | Caught by caller |
| executeCommand timeout | command runs > 30s | rejects with timeout error | Caught by caller |
| loadBoardState no artifacts | no sprint-status.yaml | returns generic empty state | No crash |
| loadBoardState success | valid BMad artifacts | returns populated board state | N/A |
| Dashboard no JSONL log | commander.log missing | trust metrics show 0/empty | Graceful display |
| Dashboard no quota init | julesQuota.init not called | quota shows "not initialized" | Graceful display |

</frozen-after-approval>

## Code Map

- `.github/extensions/command-center/commander.mjs` -- main Commander module, needs `executeCommand`, `loadBoardState`, and Dashboard tab HTML/JS
- `.github/extensions/command-center/extension.mjs` -- canvas extension, may need to import `loadBoardState`
- `commander.mjs:L1459` -- `executeCommand` call in `autoMergePR`
- `commander.mjs:L1509-1521` -- `executeCommand` calls in `cleanupAfterMerge`
- `commander.mjs:L1572` -- `loadBoardState` call in `julesQuota.init`
- `commander.mjs:L1782` -- `runGitCommand` reference implementation for `executeCommand`
- `commander.mjs:L867` -- `buildBoardState` reference for `loadBoardState`
- `commander.mjs:L1963` -- `getTrustMetrics` existing function for Dashboard
- `commander.mjs:L1996` -- `getHealthMetrics` existing function for Dashboard
- `commander.mjs:L1556` -- `julesQuota` object with `getStatus()` for Dashboard
- `commander.mjs:L2024` -- `analyzeMismatches` for learning loop display
- `commander.mjs:L3453-3457` -- existing tab list where Dashboard tab is added
- `commander.mjs:L3507+` -- tab view sections where Dashboard view is added

## Tasks & Acceptance

**Execution:**
- [x] `.github/extensions/command-center/commander.mjs` -- Define `executeCommand(cmd, options)` function using `child_process.exec` with timeout, returning `{stdout, stderr, exitCode}` -- fixes P0 crash in autoMergePR and cleanupAfterMerge
- [x] `.github/extensions/command-center/commander.mjs` -- Define and export `loadBoardState(context)` that wraps `buildBoardState` with default context from process.cwd() and known artifact paths -- fixes P0 crash in julesQuota.init
- [x] `.github/extensions/command-center/commander.mjs` -- Add Dashboard tab button to tab-list nav (line ~3456) with id="tabDashboard"
- [x] `.github/extensions/command-center/commander.mjs` -- Add Dashboard tab view section with trust metrics cards (accuracy, dispatch accuracy, review pass rate, merge count), quota card (used/remaining/percentage/reset), health card (active sessions, story completion, memory), and learning loop card (top mismatches)
- [x] `.github/extensions/command-center/commander.mjs` -- Add JavaScript for Dashboard tab: switch logic, data rendering from `getTrustMetrics`, `getHealthMetrics`, `julesQuota.getStatus()`, and `analyzeMismatches`
- [x] `.github/extensions/command-center/commander.mjs` -- Add `decorateBoardState` metrics computation (trust, health, quota, mismatches)
- [x] Review fix: Replace `require("child_process")` in `executeCommand` with ESM `import` + `promisify`
- [x] Test Command Center canvas opens with Dashboard tab visible and functional via browser canvas

**Acceptance Criteria:**
- Given commander.mjs is loaded, when `autoMergePR` is called with trustScore >= 0.7, then `executeCommand` resolves without ReferenceError
- Given commander.mjs is loaded, when `cleanupAfterMerge` is called, then git commands execute without ReferenceError
- Given commander.mjs is loaded, when `julesQuota.init()` is called, then quota is populated from board state without ReferenceError
- Given Command Center canvas is opened, when user clicks Dashboard tab, then trust metrics, quota, and health sections are displayed
- Given no commander.log exists, when Dashboard tab is viewed, then trust metrics display gracefully with 0 values instead of crashing
- Given Command Center canvas is refreshed, when Dashboard tab is active, then metrics reload from current state

## Spec Change Log

### Review Findings (Iteration 1)

**High Severity — Fixed:**
1. **`require("child_process")` in ESM module** — `executeCommand` used `require()` inside `.mjs`, causing `ReferenceError: require is not defined`. Fixed by adding `import { exec as rawExec } from "node:child_process"` + `promisify()` at module top.
2. **Shell injection risk** — `executeCommand` passes raw shell strings to `exec()`. Mitigation: all current callers use hardcoded git/gh commands with validated parameters (PR numbers, branch names). Security review recommended for future untrusted input.

**Medium Severity — Deferred:**
- Dashboard quota uses hardcoded `dailyLimit: 100` instead of reading from config. Acceptable for MVP.

## Verification

**Manual checks:**
- Open Command Center canvas, verify Dashboard tab appears between Jules and Docs tabs
- Click Dashboard tab, verify trust metrics, quota, and health sections render
- Verify no console errors in canvas when commander.log is missing
- Verify `executeCommand` and `loadBoardState` are exported from commander.mjs
