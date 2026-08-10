## 2026-08-10T19:44:19Z
You are Worker M4 Remediation for the bmad-cc refactor project.
Your working directory is d:/Projects/POC/ideator/.agents/teamwork_preview_worker_m4_remediation.
The project workspace is d:/Projects/POC/ideator/bmad-cc.

Task Description:
Perform Milestone 4 Remediation on `bmad-cc` to address the findings from Reviewers and Challengers:

1. **Fix `stripAnsi` in `src/utils/ansi-cleaner.ts`**:
   - Update `stripAnsi` regex/parser so it handles all ANSI escape sequences, including OSC 8 hyperlink sequences (`\x1b]8;;...\x07` and `\x1b]8;;...\x1b\`) and 8-bit ST terminators.
   - Ensure `tests/tui/m4-challenger-deep-stress.test.ts` passes 100%.

2. **Wire `ProcessKiller` in `src/watchdog/process-killer.ts`**:
   - Import and wire `ProcessKiller` into watchdog timeout / sub-process termination logic (in `src/session/story-executor.ts` or watchdog runner) so stalled sub-processes are reliably terminated on timeout.

3. **Fix Race Condition in `SessionLogger.log()` & Aborted Execution Teardown**:
   - Ensure `SessionLogger.log()` handles stream writes safely when `AbortController` cancels an active session. Prevent unhandled `ENOENT` file rejections and `ENOTEMPTY` directory cleanup failures during aborted session teardown in `tests/session/story-executor-m3.test.ts`.

4. **Fix Test Suite Flakiness & Timeouts**:
   - Ensure per-test isolated temporary directories are used in `tests/state/state-manager.test.ts`, `tests/supervisor/skill-router.test.ts`, and `tests/session/story-executor-m3.test.ts` so parallel Vitest runs do not encounter path collisions or timeout flakiness.

5. **Build & Test Verification**:
   - Run `npx tsc --noEmit` to confirm 0 type errors.
   - Run `npx vitest run` to ensure 100% test pass rate across all test files with 0 failures.
   - Run `npx tsup` to ensure clean ESM build in `dist/`.

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A Forensic Auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

Write your handoff report to d:/Projects/POC/ideator/.agents/teamwork_preview_worker_m4_remediation/handoff.md and report back via send_message with test results and build status.
