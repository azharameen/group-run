# Milestone 3 Challenge Report — Empirical Stress & Vulnerability Testing

## Challenge Summary

**Overall risk assessment**: **MEDIUM-HIGH**

While the core functionality of Milestone 3 (R3 Autonomous Continuous Loop, React Ink Modals, Interrupt/Deferral Handling) builds successfully and passes baseline tests (80 total tests passed across 17 test files), empirical stress testing exposed critical vulnerabilities and edge-case failure modes in `HeartbeatMonitor`, `StreamQueryParser`, and `DeferredWorkResolver`.

---

## Detailed Challenges

### [High Risk] Challenge 1: HeartbeatMonitor Timer Resurrection Post-Stop
- **Assumption challenged**: Calling `heartbeat.stop()` in `StoryExecutor` / `SupervisorAgent`'s `finally` block completely disables watchdog timeouts for completed or aborted tasks.
- **Attack scenario**: When an agent subprocess exits, asynchronous `stdout`/`stderr` events may still be dispatched during process stream tear-down. If a late stdout/stderr chunk calls `heartbeat.pulse()` *after* `heartbeat.stop()` was called, `HeartbeatMonitor.pulse()` does not check if the monitor is in a stopped state (`stopped: true`). `pulse()` sees `timedOut: false` and calls `scheduleTimeout()`, which creates a **new dangling `setTimeout` timer** after the monitor was explicitly stopped! When this timer expires `inactivityTimeoutMs` later, `onTimeout()` fires, calling `activeAbortController.abort()` and logging a spurious `stalled-process-timeout` on a task that has already finished or on a subsequent task sharing the context.
- **Empirical evidence**: `tests/m3-challenger-stress.test.ts` test `"BUG: calling pulse() after stop() restarts timer and triggers timeout"` empirically demonstrated that invoking `pulse()` after `stop()` causes `onTimeout` to fire.
- **Blast radius**: Spurious process aborts in continuous loop execution, false watchdog timeout logs, race conditions, and unhandled async timer callbacks.
- **Mitigation**: Add a `private stopped: boolean = false;` flag to `HeartbeatMonitor`. In `stop()`, set `stopped = true`. In `pulse()`, return early if `this.stopped || this.timedOut`. In `start()`, reset `stopped = false`.

---

### [Medium Risk] Challenge 2: StreamQueryParser Buffer Reset Wiping Trailing Chunk Content
- **Assumption challenged**: Streaming stdout/stderr chunks process interactive prompts sequentially without losing trailing chunk data or dropping subsequent prompts.
- **Attack scenario**: A single stdout or stderr stream chunk contains a prompt pattern followed by additional output or a second prompt (e.g. `"Delete file? [y/N]\nProceeding with build step...\nConfirm overwrite? [y/N]"`). When `parseChunk` matches the first pattern `[y/N]`, `this.buffer = ''` completely wipes the buffer. This destroys all trailing log output in that chunk and drops any subsequent interactive prompt in the same stream chunk.
- **Empirical evidence**: `tests/m3-challenger-stress.test.ts` test `"BUG/BEHAVIOR: buffer reset destroys trailing content in same chunk"` proved that `Prompt 2` in the same chunk was dropped completely.
- **Blast radius**: Missed subagent query events in fast output streams, truncated prompt text, subagents hanging on unparsed interactive prompts.
- **Mitigation**: Slice `this.buffer` from the index immediately following the matched prompt pattern rather than setting `this.buffer = ''`.

---

### [Medium Risk] Challenge 3: StreamQueryParser ANSI Escape Sequence Blindspot & False Positives
- **Assumption challenged**: Subagent stdout/stderr output contains plain ASCII prompt strings without ANSI color codes or code string literals.
- **Attack scenario**:
  1. Interactive CLI tools (e.g., inquirer, prompts) emit ANSI escape codes. If prompt brackets are styled (e.g. `Delete file? [\u001b[32my\u001b[0m/\u001b[31mN\u001b[0m]`), regex `/\[y\/N\]/` fails to match because ANSI escape sequences are embedded inside the brackets.
  2. Non-interactive source code comments or string literals (e.g. `// TODO: confirm? whether this works` or `const s = "Do you want to proceed?"`) match `/confirm\?/i` and trigger false-positive subagent query callbacks, popping query modal overlays unnecessarily.
- **Empirical evidence**: `tests/m3-challenger-stress.test.ts` test `"ANSI ESCAPE CODES: handling formatted terminal output"` verified that embedded color codes cause bracket pattern matches to return `null`.
- **Blast radius**: Unhandled sub-agent interactive prompts hanging the process tree; unnecessary prompt overlays popping up during normal code execution/logging.
- **Mitigation**: Strip ANSI escape codes (`chunk.replace(/\u001b\[[0-9;]*m/g, '')`) before pattern matching, and refine regex patterns to require whitespace/line boundaries.

---

### [Low-Medium Risk] Challenge 4: DeferredWorkResolver Format Limitations & Substring Over-Matching
- **Assumption challenged**: `deferred-work.md` tasks are strictly formatted with hyphen bullets (`- [ ]`) and task identifiers are unique non-overlapping strings.
- **Attack scenario**:
  1. If a developer or sub-agent marks a task complete using uppercase `- [X] Task`, `loadDeferredWork`'s check `!line.includes('[x]')` evaluates to `true`, causing completed tasks with `[X]` to be loaded as unresolved.
  2. Tasks using asterisk bullet syntax (`* [ ] Task`) or numbered list syntax (`1. [ ] Task`) are ignored because `loadDeferredWork` requires `line.startsWith('-')`.
  3. `resolveDeferredTask` uses `line.includes(taskIdentifier)`. Short or generic task identifiers (e.g. `Task 1`) match any line containing the substring, including section headers or other task titles.
- **Empirical evidence**: `tests/m3-challenger-stress.test.ts` test `"EDGE CASE: ignores asterisk bullet points and uppercase [X]"` confirmed case sensitivity and bullet formatting limitations.
- **Blast radius**: Incomplete task status resolution, duplicate task execution in sprint loops, accidental status overwrite.
- **Mitigation**: Use case-insensitive regex for completed status (`/\[[xX]\]/`), normalize bullet point prefixes (`-`, `*`, `1.`), and match task identifiers precisely.

---

## Stress Test Suite Results

- `npx vitest run`: **17 passed / 17 test files (80 passed / 80 tests total)**
  - Baseline tests: 68 passed
  - Empirical Challenger Stress Suite (`tests/m3-challenger-stress.test.ts`): 12 passed
- `npx tsup`: **0 build errors (ESM bundles successfully compiled in `dist/`)**

### Breakdown of Empirical Stress Tests (`tests/m3-challenger-stress.test.ts`):
1. `detects prompts split across chunk boundaries` — **PASS**
2. `handles buffer slicing when text exceeds 4096 chars` — **PASS**
3. `prompt truncated at 4096 buffer boundary slice` — **PASS**
4. `BUG/BEHAVIOR: buffer reset destroys trailing content in same chunk` — **PASS (Reproduced Vulnerability)**
5. `FALSE POSITIVE: matches code comments and strings containing prompt patterns` — **PASS (Reproduced False Positive)**
6. `ANSI ESCAPE CODES: handling formatted terminal output` — **PASS (Reproduced Limitation)**
7. `BUG: calling pulse() after stop() restarts timer and triggers timeout` — **PASS (Reproduced Bug)**
8. `handles rapid pulse calls without memory or timer leak` — **PASS**
9. `multiple start() calls cleanly reset timeout` — **PASS**
10. `EDGE CASE: ignores asterisk bullet points and uppercase [X]` — **PASS (Reproduced Limitation)**
11. `BUG/EDGE CASE: resolveDeferredTask matches partial substrings in section headers and titles` — **PASS (Reproduced Risk)**
12. `handles missing deferred-work.md gracefully` — **PASS**

---

## Unchallenged Areas

- High-frequency full-screen React Ink layout redrawing during real terminal window resize events (requires interactive PTY terminal session).
