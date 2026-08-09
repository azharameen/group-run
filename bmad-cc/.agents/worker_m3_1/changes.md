# Changes Summary — Milestone 3 (R3 Autonomous Continuous Loop & Interrupt/Deferral Handling)

## Overview
Milestone 3 implements the Autonomous Continuous Loop with process watchdog monitoring, active subprocess abort signal handling, native React Ink TUI modal overlays for human escalations and sub-agent query resolution, and autonomous deferred work task resolution.

## Modified & Added Files

### 1. Agent Driver Architecture & Signal Handling
- `src/agent/driver-interface.ts`:
  - Added `signal?: AbortSignal` and `onQuery?: (query: string) => Promise<string | undefined> | string | undefined` to `AgentSpawnOptions`.
- `src/agent/gemini-driver.ts`, `src/agent/antigravity-driver.ts`, `src/agent/opencode-driver.ts`, `src/agent/copilot-driver.ts`, `src/agent/custom-driver.ts`:
  - Connected external `options.signal` abort listener to internal driver `AbortController`.
  - Updated `killedByWatchdog` return value to account for `options.signal.aborted`.

### 2. Autonomous Loop & Process Watchdog
- `src/session/story-executor.ts`:
  - Refactored driver execution to wrap phase execution with `HeartbeatMonitor` and active `AbortController`.
  - Added inactivity threshold monitoring (`inactivityTimeoutMs`). On stream timeout, logs error to `SessionLogger`, aborts process cleanly, and prevents Node process / TUI crashes.
  - Added `StreamQueryParser` integration to parse `onStdout` and `onStderr` data chunks.
  - Added automatic resolution of deferred work items via `resolveDeferredTask` when story status transitions to `done`.
- `src/supervisor/supervisor-agent.ts`:
  - Wrapped `driver.executeSkill` execution with `HeartbeatMonitor` and active `AbortController`.

### 3. Stream Parser & Sub-Agent Query Detection
- `src/session/stream-parser.ts` *(New)*:
  - Implemented `StreamQueryParser` and `detectSubagentQuery` for parsing stdout/stderr stream chunks to detect interactive CLI questions/confirmation prompts (`[y/N]`, `(y/n)`, `Continue?`, `Proceed?`, `Confirm?`, `Overwrite?`).

### 4. Native React Ink TUI Modals & Non-Blocking Decision Handling
- `src/tui/modals/escalation-modal.tsx` *(New)*:
  - Created native React Ink `EscalationModal` component displaying story key, escalation reason, retry count, test output, review findings, and interactive decision choices (Retry, Retry with Prompt, Override, Skip, Abort).
- `src/tui/modals/query-modal.tsx` *(New)*:
  - Created native React Ink `QueryModal` component for displaying sub-agent interactive prompts cleanly inside TUI with quick response hotkeys `[y]`, `[n]`, and custom text input.
- `src/tui/decision-prompt.ts`:
  - Refactored `promptForDecision` to use standard Node `readline` instead of `@inquirer/prompts` CLI dialogs, ensuring no screen buffer corruption in TUI mode.
- `src/commands/tui.ts`:
  - Added `activeAbortController` reference during sprint loop execution.
  - Refactored `handlePause()` to execute `activeAbortController.abort()` immediately upon user pressing `p` key, terminating spawned driver subprocesses instantaneously.
- `src/tui/app.tsx`:
  - Integrated `EscalationModal` and `QueryModal` overlays into full-screen rendering modes (`appMode: 'escalation'` | `'subagent-query'`).

### 5. Deferred Task Resolution
- `src/sprint/deferred-work-resolver.ts` *(New)*:
  - Implemented `loadDeferredWork`, `resolveDeferredTask`, and `markDeferredTasksResolved` for managing deferred work items in `deferred-work.md`.
- `src/supervisor/directive-generator.ts`:
  - Injected `context.deferredWorkItems` into supervisor directive prompts so sub-agents receive technical debt context.

### 6. Verification & Test Suite
- `tests/session/stream-parser.test.ts` *(New)*:
  - Unit tests for stream chunk query parsing.
- `tests/sprint/deferred-work-resolver.test.ts` *(New)*:
  - Unit tests for deferred work parsing and task status resolution.
- `tests/session/story-executor-m3.test.ts` *(New)*:
  - Integration tests for `StoryExecutor` with `HeartbeatMonitor`, stalled process watchdog termination, active `AbortController` signal cancellation, and query prompt callbacks.
- `tests/tui/modals.test.ts` *(New)*:
  - Unit tests for React Ink `EscalationModal` and `QueryModal` components.
