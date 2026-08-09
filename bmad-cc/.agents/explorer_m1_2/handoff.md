# Handoff Report: Supervisor Agent Architecture & Execution Loop Analysis

**Project:** bmad-cc Transformation Project  
**Milestone:** Milestone 1 — Supervisor Architecture & Execution Loop Analysis  
**Agent:** Explorer 2 (`explorer_m1_2`)  
**Date:** 2026-08-09  

---

## 1. Observation

Direct observations from inspecting source files in `d:/Projects/POC/ideator/bmad-cc/src/`:

1. **Synchronous Await of Driver Execution in `StoryExecutor`**:
   - File: `d:/Projects/POC/ideator/bmad-cc/src/session/story-executor.ts`
   - Lines 193-234:
     ```typescript
     const sessionResult = await activeDriver.execute({
       prompt: directive.prompt,
       workingDirectory: this.config.projectRoot,
       model: this.config.agent.model,
       onStdout: (data) => { ... },
       onStderr: (data) => { ... }
     });
     ```
   - Direct call to `activeDriver.execute(...)` without wrapping in `HeartbeatMonitor` or process watchdog.

2. **Decoupled Heartbeat Watchdog**:
   - File: `d:/Projects/POC/ideator/bmad-cc/src/session/phase-runner.ts`
   - Lines 53-65: `PhaseRunner` instantiates `HeartbeatMonitor` and calls `monitor.pulse()` on stdout/stderr data. However, `StoryExecutor` (`src/session/story-executor.ts`) does NOT import or use `PhaseRunner` or `HeartbeatMonitor`.

3. **Inquirer CLI Prompting in Escalation Handler**:
   - File: `d:/Projects/POC/ideator/bmad-cc/src/tui/decision-prompt.ts`
   - Line 1: `import { select, input } from '@inquirer/prompts';`
   - File: `d:/Projects/POC/ideator/bmad-cc/src/commands/run.ts`
   - Lines 176-184: When `result.finalDecision === 'ESCALATE_TO_HUMAN'`, `run.ts` stops the renderer and invokes `promptForDecision(...)`.
   - File: `d:/Projects/POC/ideator/bmad-cc/src/commands/tui.ts`
   - Lines 188-192: In `tui.ts`, escalation simply marks the story as skipped (`queue.markSkipped(storyKey)`), lacking interactive escalation handling within Ink React components.

4. **Pause Control Latency in TUI**:
   - File: `d:/Projects/POC/ideator/bmad-cc/src/commands/tui.ts`
   - Lines 120-122: `handlePause` sets `isPaused = true`.
   - Lines 159-195: `while (nextStory && !isPaused)` checks `isPaused` only after a story completes. Currently executing driver subprocesses are not aborted or paused when user presses `p`.

5. **Driver Spawning & Command Invocations**:
   - File: `d:/Projects/POC/ideator/bmad-cc/src/agent/gemini-driver.ts` (lines 35, 42: `execa('gemini', ['--prompt', options.prompt])`)
   - File: `d:/Projects/POC/ideator/bmad-cc/src/agent/antigravity-driver.ts` (lines 35, 45: `execa('agy', ['chat', '--prompt', options.prompt, '--cwd', options.workingDirectory])`)
   - File: `d:/Projects/POC/ideator/bmad-cc/src/agent/opencode-driver.ts` (lines 35, 42: `execa('opencode', ['--prompt', options.prompt])`)
   - File: `d:/Projects/POC/ideator/bmad-cc/src/agent/copilot-driver.ts` (lines 35, 42: `execa('gh', ['copilot', 'explain', options.prompt])`)
   - None of the drivers pass non-interactive auto-approval flags or inspect outputs for interactive sub-agent questions.

---

## 2. Logic Chain

1. **Premise 1 (Observation 1 & 2):** `StoryExecutor` directly awaits `activeDriver.execute` without wrapping execution in `HeartbeatMonitor`.
   - *Deduction:* If a sub-agent CLI tool freezes, encounters a network delay, or waits for input without writing to stdout/stderr, `activeDriver.execute` will remain pending indefinitely, causing the entire story execution loop and TUI interface to stall.

2. **Premise 2 (Observation 3):** Escalation handling uses `@inquirer/prompts` in `run.ts` and bypasses interactive prompt handling in `tui.ts`.
   - *Deduction:* Inquirer CLI prompts corrupt full-screen terminal output when called while TUI rendering is active. In `tui.ts`, omitting escalation prompts prevents users from resolving escalations in-flight. Replacing `@inquirer/prompts` with native React Ink modal components is required for continuous TUI operation.

3. **Premise 3 (Observation 4):** `isPaused` flag is evaluated only between loop iterations.
   - *Deduction:* User pause requests (`p` key or `pause` directive) are ineffective during active sub-agent execution. To make pause instantaneous, `StoryExecutor` must hold an active `AbortController` reference that `tui.ts` can signal immediately upon pause.

4. **Premise 4 (Observation 5):** Drivers do not pass non-interactive flags or parse stdout streams for interactive queries.
   - *Deduction:* CLI drivers risk blocking when sub-agents output interactive questions. Stream parsing coupled with auto-answering or React Ink query modals will prevent sub-agent deadlocks.

---

## 3. Caveats

- **External CLI Driver Implementations:** Specific CLI flags and interactive capabilities for `gemini`, `agy`, `opencode`, and `gh copilot` depend on installed CLI binary versions on the host system.
- **Process Tree Signaling on Windows:** On Windows platforms, sending `SIGTERM` to an `execa` parent process may not cleanly terminate child process trees unless `tree-kill` or process group killing is explicitly invoked.

---

## 4. Conclusion

To transform the Supervisor Agent into a continuous, non-crashing TUI system for Milestone 1:
1. `StoryExecutor` must be refactored to wrap driver execution with `HeartbeatMonitor` and expose an `AbortController` for real-time pause/abort control.
2. In-TUI interactive prompts (`EscalationModal` and `QueryModal`) must be built as React Ink components to handle escalations and sub-agent queries without exiting the TUI or corrupting terminal state.
3. Stream-based regex parsing should be added to detect interactive sub-agent queries and automatically respond or escalate.
4. Comprehensive `try...catch` error boundaries must wrap all execution phases to log errors to `SessionLogger` and safely transition state without process crashes.

---

## 5. Verification Method

### Test Commands
Run existing project test suite to verify baseline stability:
```bash
npm test
```
Or with vitest directly:
```bash
npx vitest run
```

### Inspection Target Files
- `d:/Projects/POC/ideator/bmad-cc/.agents/explorer_m1_2/analysis.md`
- `d:/Projects/POC/ideator/bmad-cc/src/supervisor/supervisor-agent.ts`
- `d:/Projects/POC/ideator/bmad-cc/src/session/story-executor.ts`
- `d:/Projects/POC/ideator/bmad-cc/src/agent/driver-interface.ts`
- `d:/Projects/POC/ideator/bmad-cc/src/tui/app.tsx`
- `d:/Projects/POC/ideator/bmad-cc/src/commands/tui.ts`

### Invalidation Conditions
- If `npm test` fails due to syntax or type errors in `src/`.
- If `analysis.md` or `handoff.md` are missing any of the required 5 components or analysis items.
