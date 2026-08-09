# Comprehensive Analysis Report: Supervisor Agent Architecture & Continuous Execution Loop

**Project:** bmad-cc Transformation Project  
**Milestone:** Milestone 1 — Supervisor Architecture & Execution Loop Analysis  
**Explorer:** Explorer 2  
**Date:** 2026-08-09  

---

## 1. Executive Summary

This report provides a deep technical analysis of the Supervisor Agent architecture, driver management, session execution loops, and error/interrupt handling within `bmad-cc`. The investigation focused on evaluating how BMad CLI drivers (`gemini`, `copilot`, `opencode`, `antigravity`, `custom`) are spawned, monitored, and controlled, and identifying architectural bottlenecks that currently prevent continuous, non-crashing TUI operation.

Key findings include:
1. **Synchronous Execution Coupling:** Both CLI execution (`run.ts`) and TUI execution (`tui.ts`) run story execution sequentially and synchronously. Long-running driver executions block the outer loop and do not permit instantaneous mid-session user interrupts (e.g. pressing `p` to pause does not signal running subprocesses).
2. **Missing Heartbeat Monitoring in Runtime Executor:** While `HeartbeatMonitor` exists in `src/watchdog/heartbeat-monitor.ts` and `PhaseRunner` uses it, `StoryExecutor` (`src/session/story-executor.ts`) invokes `activeDriver.execute(...)` directly without wrapping it in a heartbeat monitor or process killer watchdog. Consequently, sub-agent hangs or interactive prompt stalls cause infinite blocking.
3. **CLI Prompt Incompatibilities in TUI:** In `run.ts`, escalation relies on `@inquirer/prompts` (`promptForDecision`), which corrupts terminal output if run inside a TUI session. In `tui.ts`, escalations are skipped without presenting an interactive React Ink modal.
4. **Lack of Non-Interactive Driver Flags & Stdin Control:** Drivers spawn sub-agents without non-interactive flags (e.g., `--yes` or `--non-interactive`) and do not pipe stdin or parse output for sub-agent questions, leading to potential stalls when CLI sub-agents wait for human input.

---

## 2. Supervisor Agent Architecture & Session Execution Loops

### 2.1 Core Components Overview

| Component | Path | Responsibility |
|---|---|---|
| `SupervisorAgent` | `src/supervisor/supervisor-agent.ts` | High-level supervisor logic. Routes skills, assembles context, executes phases in a retry loop, and computes target status transitions. |
| `StoryExecutor` | `src/session/story-executor.ts` | Concrete execution engine bridging project configuration, driver instantiation, progress event streaming (`onProgress`), verification testing (`runTestCommands`), and status persistence to `sprint-status.yaml`. |
| `PhaseRunner` | `src/session/phase-runner.ts` | Isolated phase runner integrating `HeartbeatMonitor`. Currently uncoupled from `StoryExecutor`. |
| `ExecutionQueue` | `src/session/execution-queue.ts` | Priority queue sorting stories by `epicNum * 1000 + storyNum`. Filters stories based on epic, status, or completion. |
| `ConversationalSupervisor` | `src/supervisor/conversational-supervisor.ts` | Handles ad-hoc user directives/questions entered in the TUI console, building a prompt with dashboard state and executing the driver. |
| `SkillRouter` | `src/supervisor/skill-router.ts` | Maps story status (`backlog`, `ready-for-dev`, `in-progress`, `review`, `done`) to BMad skills (`bmad-create-story`, `bmad-ux`, `bmad-architecture`, `bmad-dev-story`, `bmad-code-review`, `bmad-retrospective`). |
| `ResultEvaluator` & `GateDecision` | `src/supervisor/result-evaluator.ts`, `gate-decision.ts` | Evaluates test exit codes, git diff line counts, AC completion percentages, and review findings to return `APPROVE`, `RETRY_WITH_FEEDBACK`, or `ESCALATE_TO_HUMAN`. |

### 2.2 Session Execution Lifecycle

```
      ┌────────────────────────────────────────────────────────┐
      │                      ExecutionQueue                    │
      └──────────────────────────┬─────────────────────────────┘
                                 │ next()
                                 ▼
      ┌────────────────────────────────────────────────────────┐
      │                    StoryExecutor                       │
      │  1. Checkpoint state in StateManager                   │
      │  2. Read story spec (`<storyKey>.md`)                  │
      │  3. routeSkillsForStory()                              │
      │  4. assembleContext()                                  │
      └──────────────────────────┬─────────────────────────────┘
                                 │
                 ┌───────────────┴───────────────┐
                 │ Skill Loop (Phase Iteration)  │
                 └───────────────┬───────────────┘
                                 │
                                 ▼
    ┌──────────────────────────────────────────────────────────────┐
    │ Retry Loop (attempt <= maxRetries)                            │
    │  1. generateDirective()                                      │
    │  2. activeDriver.execute()  <--- Awaited synchronously       │
    │  3. runTestCommands()       <--- If verification enabled     │
    │  4. evaluateResult() & makeGateDecision()                    │
    └────────────────────────────┬─────────────────────────────────┘
                                 │
            ┌────────────────────┴────────────────────┐
            ▼                                         ▼
   [Gate = APPROVE]                         [Gate = ESCALATE]
   - Update `sprint-status.yaml`            - Log error & record decision
   - Mark completed in StateManager         - Return `ESCALATE_TO_HUMAN`
```

### 2.3 Critical Architectural Deficiencies in Execution Loops

1. **Direct Subprocess Awaiting in Retry Loop (`story-executor.ts:193-234`)**:
   ```typescript
   const sessionResult = await activeDriver.execute({
     prompt: directive.prompt,
     workingDirectory: this.config.projectRoot,
     model: this.config.agent.model,
     onStdout: (data) => { ... },
     onStderr: (data) => { ... }
   });
   ```
   The execution loop awaits `activeDriver.execute` inside a standard JavaScript `for...of` and `while` loop. Because `execute` blocks until the underlying `execa` child process terminates, control returns to the caller only when the process exits.

2. **Decoupling of `PhaseRunner` and `StoryExecutor`**:
   `PhaseRunner` (`src/session/phase-runner.ts`) was designed with `HeartbeatMonitor` integration to monitor stream activity. However, `StoryExecutor` (`src/session/story-executor.ts`) bypasses `PhaseRunner` entirely and calls `activeDriver.execute(...)` directly.

3. **Status Persistence Side-Effects (`story-executor.ts:319-329`)**:
   Status transitions write directly to `sprint-status.yaml` on disk during execution. If an execution crash occurs halfway through a multi-phase story (e.g. after dev but before review), disk state may be out of sync with memory state unless recovered via `StateManager`.

---

## 3. Examination of BMad CLI Drivers

### 3.1 Spawning & Driver Implementations

All drivers extend `AgentDriver` (`src/agent/driver-interface.ts`) and use `execa` for subprocess management.

| Driver | File | Command / Args | Stdin Piped? | Signal Handling |
|---|---|---|---|---|
| `GeminiDriver` | `src/agent/gemini-driver.ts` | `gemini --prompt <prompt>` | No | `AbortController.signal` |
| `AntigravityDriver` | `src/agent/antigravity-driver.ts` | `agy chat --prompt <prompt> --cwd <dir> [--model <model>]` | No | `AbortController.signal` |
| `OpenCodeDriver` | `src/agent/opencode-driver.ts` | `opencode --prompt <prompt>` | No | `AbortController.signal` |
| `CopilotDriver` | `src/agent/copilot-driver.ts` | `gh copilot explain <prompt>` | No | `AbortController.signal` |
| `CustomDriver` | `src/agent/custom-driver.ts` | `<command> <args...>` | Yes (`stdin.write(prompt)`) | `AbortController.signal` |

### 3.2 Subprocess Monitoring & Lifecycle

- **Streaming Output:** Subprocess `stdout` and `stderr` streams are listened to via `.on('data', chunk => ...)` and passed directly to `onStdout` and `onStderr` callbacks. In `StoryExecutor`, stdout/stderr chunks are emitted to `options.onProgress` without artificial length truncation.
- **Timeout Management:** Each driver accepts `timeoutMs`. If `timeoutMs` is reached, `setTimeout` triggers `abortController.abort()`. `execa` catches the abort signal and returns exit code `143` (SIGTERM).
- **Process Cleanup Risks:** When `execa` kills a subprocess via `AbortController`, nested child processes spawned by the CLI tool (e.g. build commands, test runners, or sub-shells) may not receive SIGTERM and can become orphaned background processes.

---

## 4. Interrupts, Sub-Agent Queries, Stalls, and Deferred Tasks

### 4.1 Handling of Stalls & Deadlocks

- **Current Vulnerability:** If a sub-agent CLI tool hangs (e.g. network stall, infinite loop) or blocks waiting for user input, `activeDriver.execute` does not receive data chunks. Because `StoryExecutor` does not employ `HeartbeatMonitor`, execution will stall indefinitely unless a global `timeoutMs` was configured in `AgentSpawnOptions`.
- **Watchdog Utility Available:** `HeartbeatMonitor` (`src/watchdog/heartbeat-monitor.ts`) and `ProcessKiller` (`src/watchdog/process-killer.ts`) provide the requisite capabilities (pulse checking, grace period SIGTERM -> SIGKILL escalation), but must be wired into `StoryExecutor`.

### 4.2 Handling of Sub-Agent Queries & Interactive Prompts

- **Uncaught Prompts:** Drivers currently do not append non-interactive CLI flags (such as `--yes`, `--non-interactive`, `--auto-approve`).
- **Missing Query Parser:** Output streams are not scanned for interactive prompt patterns (e.g. `[y/N]`, `Confirm?`, `Overwrite?`). If a CLI tool prompts for input, stdin is closed/unhandled (except in `CustomDriver`), causing the CLI tool to hang until timeout.

### 4.3 Handling of Interrupts & Pause Controls

- **TUI Interrupt (`src/tui/app.tsx` & `src/commands/tui.ts`):**
  - Pressing `p` sets `isPaused = true` in `tui.ts`.
  - However, `isPaused` is evaluated only in the outer loop between story executions (`while (nextStory && !isPaused)`).
  - Pressing `p` while a 3-minute story development session is running has **no immediate effect** on the spawned sub-process; it waits for the current story phase to finish before pausing.

### 4.4 Deferred Task Resolution

- `assembleContext` (`src/supervisor/context-assembler.ts`) reads `deferred-work.md` and passes line items into `SupervisorContext.deferredWorkItems`.
- However, `generateDirective` (`src/supervisor/directive-generator.ts`) currently does not include `deferredWorkItems` in the generated prompt constraints, nor is there a post-execution handler to reconcile resolved items back into `deferred-work.md`.

---

## 5. Proposed Architecture for Continuous TUI Supervisor Loop

To enable the Supervisor loop to run continuously in the TUI without stopping, freezing, or crashing, the following architecture modifications are proposed for implementation:

```
 ┌────────────────────────────────────────────────────────────────────────┐
 │                         React Ink TUI App                              │
 │  ┌──────────────────────┐ ┌────────────────────┐ ┌──────────────────┐ │
 │  │ EpicTreePanel        │ │ SupervisorChat     │ │ SubSessionPanel  │ │
 │  └──────────────────────┘ └────────────────────┘ └──────────────────┘ │
 └───────────────────────────────────┬────────────────────────────────────┘
                                     │ User Inputs (Directives / Hotkeys)
                                     ▼
 ┌────────────────────────────────────────────────────────────────────────┐
 │                    Supervisor Controller (Worker)                      │
 │                                                                        │
 │   ┌───────────────────────┐             ┌──────────────────────────┐   │
 │   │ Non-Blocking State    │ ◄────────── │ Heartbeat Watchdog       │   │
 │   │ Machine               │             │ (Stream Inactivity Monitor│   │
 │   └───────────┬───────────┘             └──────────────────────────┘   │
 │               │                                                        │
 │               ▼                                                        │
 │   ┌───────────────────────┐             ┌──────────────────────────┐   │
 │   │ Background Subprocess │ ──────────► │ Sub-Agent Query & Output │   │
 │   │ Runner (Execa)        │             │ Stream Parser            │   │
 │   └───────────────────────┘             └────────────┬─────────────┘   │
 └──────────────────────────────────────────────────────┼─────────────────┘
                                                        │
                                    ┌───────────────────┴───────────────────┐
                                    ▼                                       ▼
                       [Interactive Prompt Detected]            [Unrecoverable Failure]
                        Render React Ink Modal                   Trigger Autonomous Retry
                        (Escalation / Query)                     with Failure Feedback
```

### Key Technical Modifications Required:

1. **Async Non-Blocking Task Controller**:
   - Refactor story execution in `tui.ts` into an event-driven background controller (`SupervisorSessionRunner`).
   - The TUI re-renders state changes continuously without awaiting subprocess promises on the UI main thread.

2. **Stream-Based Heartbeat & Query Detector**:
   - Wrap `activeDriver.execute()` in `StoryExecutor` with `HeartbeatMonitor`.
   - On stdout/stderr data, pulse `HeartbeatMonitor`.
   - Pass chunks through a regex stream parser to detect sub-agent questions (`/\?\s*$/, /\[Y\/n\]/i, /confirm/i`).
   - If a prompt is detected, emit a `subagent-query` event to the TUI to prompt the user via an Ink overlay modal, or auto-answer if configured.

3. **Active Subprocess Abort & Pause Control**:
   - Pass an `AbortController` reference from `StoryExecutor` to `Tui`.
   - When the user presses `p` or triggers `pause`, immediately execute `abortController.abort()` to terminate the active sub-agent gracefully, save checkpoint state, and transition TUI status to `PAUSED`.

4. **React Ink Escalation & Query Modals**:
   - Remove `@inquirer/prompts` calls from TUI execution paths.
   - Implement `EscalationModal` and `QueryModal` as React Ink components that render directly inside `app.tsx`.

5. **Fault-Tolerant Supervisor Guard**:
   - Wrap phase executions in structured `try...catch` handlers.
   - If an unhandled exception or crash occurs in a driver or test runner, log the failure to `SessionLogger`, update `StateManager.lastError`, transition the story to `ESCALATE_TO_HUMAN`, and return to `IDLE`/`WAITING_FOR_DIRECTIVE` state without crashing the Node/TUI process.

---

## 6. Summary Findings & Recommendations Matrix

| Component | Current Deficiencies | Recommended Fix |
|---|---|---|
| `StoryExecutor` | Awaits `driver.execute` synchronously; no heartbeat watchdog. | Integrate `HeartbeatMonitor` and process abort controllers; emit stream events. |
| `tui.ts` / `app.tsx` | Pause action only takes effect between stories; no escalation modal. | Add immediate subprocess abort on pause; implement React Ink `EscalationModal`. |
| Driver Spawning | No non-interactive flags; child processes can orphan on kill. | Pass non-interactive flags (`--yes`, `--non-interactive`); kill entire process tree on abort. |
| Sub-agent Stalls | Inactivity hangs process indefinitely if no global timeout. | Integrate `HeartbeatMonitor` inactivity detection (e.g. 120s timeout) with auto-retry. |
| Sub-agent Queries | Queries in stdout/stderr are unparsed and unanswered. | Add stream parser for query patterns; trigger auto-answer or in-TUI modal prompt. |
| Deferred Tasks | `deferredWorkItems` loaded in context but omitted from directive prompts. | Inject deferred work constraints into `directive-generator.ts` and auto-reconcile on completion. |

