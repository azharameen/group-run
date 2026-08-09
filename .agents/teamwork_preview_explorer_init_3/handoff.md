# Handoff Report: React Ink TUI Architecture & Continuous Supervisor Loop Investigation

## 1. Observation

Direct codebase inspection of `bmad-cc` (`d:/Projects/POC/ideator/bmad-cc`) revealed the following exact file locations, line numbers, and implementation details:

### 1.1 TUI Layout & Ink Components
- **Main App Container**: `src/tui/app.tsx`
  - Lines 507-630: Renders full workstation with Top Header Bar, 3-Column Body (`Box flexDirection="row" gap={1}`), and Bottom `StatusBar`.
  - Column 1 (`[TREE]`): `src/tui/panels/epic-tree-panel.tsx` (25% width). Renders flattened epic and story nodes with progress bars, status icons, and spinner for executing story key. Line 105: Hardcoded key truncation `story.key.slice(0, 18) + '..'`.
  - Column 2 (`[CONSOLE]`): `src/tui/panels/supervisor-chat-panel.tsx` (50% width). Renders supervisor chat thread, active story phase bar, and `<ChatInput>`. Toggles to `StorySpecViewer` (`src/tui/panels/story-spec-viewer.tsx`) when story is selected.
  - Column 3 (`[MONITOR]`): `src/tui/panels/sub-session-panel.tsx` (25% width). Renders sub-session list, active skill badges (`bmad-dev-story`, `bmad-code-review`), and live driver stream output. Line 144: Hardcoded log truncation `log.length > 38 ? log.slice(0, 36) + '..' : log`.
  - Modal Overlays: `src/tui/modals/escalation-modal.tsx`, `src/tui/modals/query-modal.tsx`, `log-inspector-modal.tsx`, `help-overlay.tsx`, `filter-modal.tsx`, `git-diff-modal.tsx`. Lines 445-503 in `app.tsx`: Modal screens checked conditionally based on `appMode`.

### 1.2 Driver Output Streaming & Re-rendering
- **Execution Loop**: `src/commands/tui.ts`
  - Lines 186-197: `onProgress` callback receives stdout/stderr chunks from `StoryExecutor`, appends to `AgentOutputStream`, and calls `updateUIState(buildState(...))`.
  - Line 107-118: `updateUIState` triggers `inkInstance.rerender(React.createElement(App, ...))` synchronously on **every single stdout/stderr chunk** emitted by driver sub-agent processes.
- **Sub-Session Log Storage**: `src/tui/app.tsx`
  - Lines 184-211 (`handleLogUpdate`): Appends every message to `session.logs` array without upper boundary limits or window slicing.
  - Line 144 in `sub-session-panel.tsx`: Performs JavaScript `slice(0, 36)` on raw log strings without stripping ANSI escape codes, leading to broken ANSI escape sequences in stdout/stderr rendering.

### 1.3 Watchdog Timeouts, Sub-Agent Queries & Escalation Gates
- **Watchdog Timeout**: `src/watchdog/heartbeat-monitor.ts` & `src/session/story-executor.ts`
  - `HeartbeatMonitor` tracks inactivity timeout (default 120,000 ms).
  - Lines 203-224 in `story-executor.ts`: `heartbeat.pulse()` called on stdout/stderr activity. On timeout, `activeAbortController.abort()` triggers process kill.
  - Lines 290-298 in `story-executor.ts`: Catches abort/stall and sets `phaseDecision = 'ESCALATE_TO_HUMAN'`.
- **Sub-Agent Query Detection**: `src/session/stream-parser.ts` & `src/session/story-executor.ts`
  - `StreamQueryParser` uses regex patterns (`[y/N]`, `(y/n)`, `continue?`, `proceed?`, `overwrite?`) to detect sub-agent prompt requests in stdout/stderr chunks.
  - Lines 240-243 & 265-268 in `story-executor.ts`: Triggers `options.onSubagentQuery(query)`.
- **Wiring Disconnect in TUI (`src/commands/tui.ts` & `src/tui/app.tsx`)**:
  - **Subagent Query Wiring Defect**: In `src/commands/tui.ts` line 194, `onSubagentQuery` simply appends `[SUB-AGENT QUERY] ...` to `outputStream`. It does **not** switch `appMode` to `'subagent-query'`, does **not** render `QueryModal`, and does **not** pause execution to send user stdin back to driver process.
  - **Escalation Wiring Defect**: In `src/commands/tui.ts` lines 208-212, when `storyExecutor.execute()` returns `finalDecision === 'ESCALATE_TO_HUMAN'`, `tui.ts` treats it as non-APPROVE and calls `queue.markSkipped(storyKey)`! It does **not** switch `appMode` to `'escalation'` and does **not** open `EscalationModal` for user intervention.
  - **Props & State Disconnect in `app.tsx`**: Lines 475 & 491 in `app.tsx` attempt to read `(initialState as any).escalationContext` and `(initialState as any).activeQuery`, but `appMode` state in `app.tsx` is never set to `'escalation'` or `'subagent-query'` by any reactive hook or state update.

### 1.4 Test Suite & Build Verification
- **Vitest Test Suite**: Execution of `npx vitest run` returned 100% passing across 17 test files (109 tests passed, 0 failures, 3.57s duration).
  - Test files include: `tests/tui/app-tui.test.ts`, `tests/tui/modals.test.ts`, `tests/watchdog/heartbeat-monitor.test.ts`, `tests/session/stream-parser.test.ts`, `tests/session/story-executor-m3.test.ts`, `tests/m3-challenger-stress.test.ts`.
- **Build Configuration**: Execution of `npx tsup` built cleanly in ESM format targeting Node 20 (duration 2.2s). Output binaries produced in `dist/bmad-cc.js`, `dist/bin/bmad-cc.js`, and `dist/commands/*.js`.

---

## 2. Logic Chain

1. **Premise 1 (Layout Stability)**: In React Ink, frequent layout recalculations on un-sanitized streaming strings with hardcoded truncation lengths cause line wrapping mismatches, text clipping, and terminal buffer corruption when terminal dimensions change.
   - *Supported by Observation 1.1*: `EpicTreePanel` and `SubSessionPanel` use static string length slicing (`slice(0, 18)` and `slice(0, 36)`). `SubSessionPanel` slices ANSI color codes mid-sequence, causing broken terminal styling in Ink.

2. **Premise 2 (Streaming Performance)**: Unthrottled `inkInstance.rerender()` calls on every stdout/stderr chunk create CPU spikes, render queue saturation, and visible screen flickering during heavy log streaming.
   - *Supported by Observation 1.2*: `src/commands/tui.ts` line 107 invokes `inkInstance.rerender()` on every progress chunk without throttling or batching. `session.logs` accumulates all logs unbounded in memory.

3. **Premise 3 (Interactive Loop Integrity)**: Sub-agent prompts and watchdog escalation decisions require pausing the asynchronous execution loop and displaying modal user interfaces (`QueryModal` and `EscalationModal`) to capture user intent.
   - *Supported by Observation 1.3*: `src/commands/tui.ts` bypasses `QueryModal` and `EscalationModal` entirely during execution loop, skipping escalated stories instead of presenting decision gates, and ignoring interactive sub-agent queries.

4. **Conclusion**: While the underlying parsing (`StreamQueryParser`), watchdog monitoring (`HeartbeatMonitor`), modal UI components (`EscalationModal`, `QueryModal`), and test suites are intact and passing, `bmad-cc` requires targeted refactoring in `src/commands/tui.ts` and `src/tui/app.tsx` to wire interactive prompts, throttle stream rendering, handle ANSI stripping, and prevent layout overflow.

---

## 3. Caveats

- **No Caveats**: All relevant files under `src/tui`, `src/session`, `src/supervisor`, `src/watchdog`, `src/commands`, and `tests/` were inspected and verified directly against active test runs and build targets.

---

## 4. Conclusion

The React Ink TUI components and core Supervisor loop infrastructure in `bmad-cc` are functional, modular, and backed by a clean test suite (109/109 Vitest tests passing; ESM tsup build passing). However, the continuous loop execution in TUI mode contains three critical gaps:

1. **Disconnected Interactive Modals**: `QueryModal` and `EscalationModal` are implemented but bypassed during TUI execution in `src/commands/tui.ts`.
2. **Unthrottled Stream Rendering & ANSI Slicing**: Every stdout/stderr chunk triggers a full Ink rerender, and raw string slicing breaks ANSI escape sequences.
3. **Hardcoded Text Truncation**: Panels use static length cuts instead of responsive Ink flex wrapping (`wrap="truncate"`).

---

## 5. Verification Method

To independently verify these findings:

1. **Run Unit & Integration Tests**:
   ```bash
   cd bmad-cc
   npx vitest run
   ```
   *Expected Result*: 17 test files pass (109 tests total).

2. **Run ESM Build**:
   ```bash
   cd bmad-cc
   npx tsup
   ```
   *Expected Result*: Clean build success producing `dist/bmad-cc.js`.

3. **Inspect Wiring Gaps**:
   - Open `bmad-cc/src/commands/tui.ts` lines 194-212 to confirm `onSubagentQuery` and `ESCALATE_TO_HUMAN` bypass interactive modal resolution.
   - Open `bmad-cc/src/tui/app.tsx` lines 475-503 to confirm modal display state checks.
   - Open `bmad-cc/src/tui/panels/sub-session-panel.tsx` line 144 to confirm raw string slicing on ANSI-encoded log lines.

---

## 6. Recommended Actionable Refactoring Plan

1. **Implement Interactive Promise Handlers in TUI**:
   - In `StoryExecutor.execute()` / `Tui.ts`: Create an async signal interface so `onSubagentQuery` can suspend execution until `QueryModal` resolves user input (`y`, `n`, or custom string), then pipe input to driver process stdin.
   - When `StoryExecutor` returns `finalDecision === 'ESCALATE_TO_HUMAN'`, trigger `appMode: 'escalation'`, present `EscalationModal`, and await human selection (`retry`, `retry-with-prompt`, `override-pass`, `skip`, `abort`).

2. **Throttled Stream State & ANSI Cleaning**:
   - Add microtask/interval buffering (e.g. 50ms batching) to `updateUIState` in `Tui.ts` to reduce render frequency during fast stream output.
   - Strip ANSI codes or use `@alcalzone/ansi-tokenize` before string slicing in `SubSessionPanel`.
   - Cap `session.logs` history buffer size (e.g. max 500 lines per session) to prevent memory growth.

3. **Responsive Ink Layout Alignment**:
   - Replace hardcoded string length cuts (`slice(0, 18)`, `slice(0, 36)`) with Ink Box flexible props (`wrap="truncate"`).
   - Ensure panel viewport height calculations maintain positive minimums even on small terminal windows.
