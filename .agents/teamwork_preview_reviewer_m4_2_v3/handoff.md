# Milestone 4 Code Review Handoff Report

**Workspace**: `d:/Projects/POC/ideator/bmad-cc`  
**Reviewer**: Teamwork Preview Reviewer (`teamwork_preview_reviewer_m4_2_v3`)  
**Date**: 2026-08-10  
**Overall Verdict**: **FAIL** (REQUEST_CHANGES)

---

## 1. Observation

### 1.1 Command Verification Output
- **`npx tsc --noEmit`**: **PASS**
  - Result: 0 errors. TypeScript compilation check completed cleanly.
- **`npx tsup`**: **PASS**
  - Result: Built ESM distribution bundles in `dist/` successfully (`Build success in 8122ms`).
- **`npx vitest run`**: **FAIL**
  - Result: 4 test failures during full suite run; 1 deterministic logic failure in `m4-challenger-deep-stress.test.ts` (the 3 other failures were timeout contention artifacts that pass when executed in isolation).
  - **Deterministic Failure**: `tests/tui/m4-challenger-deep-stress.test.ts > 2. ANSI Safe Log Slicing & Parsing Stress > strips complex 24-bit RGB, OSC hyperlinks, and multi-code ANSI sequences`
    ```
    AssertionError: expected '[RGB BOLD] 8;;https://bmad.dev\u001b\…' not to contain '\u001b'
    Expected: "
    Received: "[RGB BOLD] 8;;https://bmad.devClick Here8;; Status OK"
    ```

### 1.2 Inspection of Specific Milestone 4 Components

1. **TUI Continuous Loop State Machine & Watchdog Handling**
   - **Continuous Loop State Machine**: Implemented in `src/commands/tui.ts` (`handleRun` lines 218–375). The `while (nextStory && !isPaused)` loop correctly pulls stories from `ExecutionQueue`, routes skills (`routeSkillsForStory`), executes via `StoryExecutor`, streams progress updates via `StreamThrottler`, re-parses sprint status from disk on each loop iteration, and handles decisions (`APPROVE`, `ESCALATE_TO_HUMAN`, skip, abort).
   - **Watchdog Handling**: `HeartbeatMonitor` (`src/watchdog/heartbeat-monitor.ts`) is integrated into `StoryExecutor` (`src/session/story-executor.ts:205`), `PhaseRunner`, and `SupervisorAgent`. On inactivity timeout, it calls `activeAbortController.abort()` and emits a watchdog progress message.
   - **Unwired Watchdog Utility (`ProcessKiller`)**: `ProcessKiller` (`src/watchdog/process-killer.ts`) provides process tree killing (SIGTERM -> grace period -> SIGKILL). However, `ProcessKiller` is **never imported or called anywhere in `src/`**. Watchdog process termination relies solely on Node's `AbortController.abort()` without process tree SIGKILL fallback.

2. **Log Buffer Throttling & ANSI Cleaning Helpers**
   - **StreamThrottler**: `src/utils/stream-throttler.ts` correctly buffers stream updates within a configurable window (50ms) to prevent Ink UI re-render freezes during rapid output streaming.
   - **Log Buffer Capping**: `MAX_SESSION_LOGS = 500` is implemented in `src/tui/app.tsx` (`combinedLogs.slice(-MAX_SESSION_LOGS)`).
   - **ANSI Cleaner Bug**: `stripAnsi` in `src/utils/ansi-cleaner.ts` lines 4–10:
     ```typescript
     export function stripAnsi(str: string): string {
       if (!str) return '';
       return str
         .replace(/\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])/g, '')
         .replace(/[\u001b\u009b]\[[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g, '')
         .replace(/\x1b\][0-9];.*?\x07/g, '');
     }
     ```
     `\x1b\][0-9];.*?\x07` expects a single digit and a single semicolon. It fails to match OSC 8 hyperlinks (which use `\x1b]8;;url\x1b\` or `\x1b]8;;url\x07`), leaving raw `\u001b` escape characters intact in stream logs.

3. **`QueryModal` Input Capture & Stdin Routing**
   - Implemented in `src/tui/modals/query-modal.tsx`.
   - Captures input via Ink's `useInput`. Supports quick keys `y` (Confirm), `n` (Cancel), `c` (Custom answer typing mode), and Enter (default `y`).
   - In custom answer mode, captures raw keypresses, handles backspace/delete, and submits string on Enter.
   - Stdin routing in `src/tui/app.tsx` and `src/commands/tui.ts` successfully passes response string back via `onQueryAnswer` callback to unblock the sub-agent query promise.

4. **`EscalationModal` Decision Options & State Transitions**
   - Implemented in `src/tui/modals/escalation-modal.tsx`.
   - Offers all 5 resolution options:
     1. `1. Retry (same prompt)` (`action: 'retry'`)
     2. `2. Retry with custom instructions` (`action: 'retry-with-prompt'`)
     3. `3. Override and pass` (`action: 'override-pass'`)
     4. `4. Skip this story` (`action: 'skip'`)
     5. `5. Abort entire sprint execution` (`action: 'abort'`)
   - Direct option selection via number keys `1`–`5` or Up/Down arrow navigation.
   - `retry-with-prompt` displays custom instruction text field with full backspace & Enter input capture.
   - Decision returned via `onDecision` callback correctly triggers state transitions in `tui.ts` (`override-pass` -> `queue.markCompleted`, `retry`/`retry-with-prompt` -> `continue`, `abort` -> `isPaused = true; break`, `skip` -> `queue.markSkipped`).

---

## 2. Logic Chain

1. **Observation**: `npx vitest run` fails with a deterministic test failure in `m4-challenger-deep-stress.test.ts`.
2. **Logic Step**: Test failure in `m4-challenger-deep-stress.test.ts` proves that `stripAnsi` in `src/utils/ansi-cleaner.ts` fails to strip complex ANSI sequences (specifically OSC 8 hyperlink sequences).
3. **Logic Step**: Unstripped ANSI codes in live stream logs pollute log displays, corrupt string length calculations, and violate the ANSI safe slicing contract.
4. **Observation**: `ProcessKiller` is defined in `src/watchdog/process-killer.ts` but is not referenced or imported anywhere in `src/session/story-executor.ts` or `src/commands/tui.ts`.
5. **Logic Step**: The watchdog implementation is incomplete — while `HeartbeatMonitor` fires `AbortController.abort()`, non-responsive sub-processes that ignore SIGINT/SIGTERM will not be forcibly killed via SIGKILL because `ProcessKiller` is unwired.
6. **Conclusion**: The codebase fails the automated test suite and contains an ANSI cleaner bug and unwired watchdog component. Therefore, the review verdict is **FAIL**.

---

## 3. Caveats

- `npx tsc --noEmit` and `npx tsup` pass cleanly without compilation or bundle errors.
- TUI interactive UI components (`QueryModal`, `EscalationModal`, 3-column workstation layout, stream throttler) are feature-complete and well-designed in terms of React Ink state management and stdin routing.

---

## 4. Conclusion & Findings

**Verdict**: **FAIL** (REQUEST_CHANGES)

### Detailed Findings

#### Finding 1 [Major]: Incomplete ANSI Stripping Helper
- **Location**: `src/utils/ansi-cleaner.ts:4-10`
- **Problem**: `stripAnsi()` regex `\x1b\][0-9];.*?\x07` fails to strip OSC 8 hyperlink sequences (`\x1b]8;;url\x1b\x07`), causing raw `\u001b` escape sequences to remain in cleaned strings.
- **Impact**: Fails `m4-challenger-deep-stress.test.ts`. Causes ANSI bleed into TUI log viewers and corrupts character count slicing.
- **Suggested Fix**: Update `stripAnsi` to handle OSC 8 sequences and ST terminators (e.g. `\x1b\]8;;.*?(?:\x1b\\|\x07)`).

#### Finding 2 [Minor]: Unwired `ProcessKiller` Watchdog Utility
- **Location**: `src/watchdog/process-killer.ts` vs `src/session/story-executor.ts`
- **Problem**: `ProcessKiller` is defined but never imported or invoked by `HeartbeatMonitor` or `StoryExecutor`.
- **Impact**: If a sub-process hangs and ignores `AbortController` cancellation signals, it will continue running in the background without SIGKILL escalation.
- **Suggested Fix**: Wire `ProcessKiller.kill(pid, reason)` into `StoryExecutor` / `PhaseRunner` when an inactivity timeout is triggered and process fails to exit within grace period.

#### Finding 3 [Minor]: Test Suite Timeout Contention during Parallel Execution
- **Location**: `tests/session/story-executor-m3.test.ts`, `tests/state/state-manager.test.ts`, `tests/supervisor/skill-router.test.ts`
- **Problem**: 3 unit tests timed out at 5000ms when all 28 test files were executed simultaneously, though they pass when run individually.
- **Impact**: Full test suite run reports intermittent timeouts under heavy concurrency.
- **Suggested Fix**: Increase vitest test timeouts or reduce concurrency for heavy disk/subprocess tests.

---

## 5. Verification Method

To independently verify these findings:

1. **Run TypeScript Check**:
   ```bash
   npx tsc --noEmit
   ```
   (Expect: 0 errors)

2. **Run TSUP Build**:
   ```bash
   npx tsup
   ```
   (Expect: Successful build in `dist/`)

3. **Run Vitest Suite**:
   ```bash
   npx vitest run
   ```
   (Expect: Test failure in `m4-challenger-deep-stress.test.ts`)

4. **Verify ANSI Cleaner Bug**:
   Inspect `src/utils/ansi-cleaner.ts` and test with string `'\u001b]8;;https://bmad.dev\u001b\x07Click Here\u001b]8;;\u001b\x07'`. `stripAnsi` returns a string containing `\u001b`.

5. **Verify Unwired ProcessKiller**:
   Grep `ProcessKiller` across `src/`:
   ```bash
   grep -rn "ProcessKiller" src/
   ```
   (Expect: Only defined in `src/watchdog/process-killer.ts`, 0 references in session/executor logic).
