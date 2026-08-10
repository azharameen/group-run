## 2026-08-10T04:04:46Z
<USER_REQUEST>
You are Worker M4 for the bmad-cc refactor project.
Your working directory is d:/Projects/POC/ideator/.agents/teamwork_preview_worker_m4.
The project workspace is d:/Projects/POC/ideator/bmad-cc.

Task Description:
Implement Milestone 4 (TUI Continuous Loop, Stream Throttling & Interactive Modals):

1. **Continuous TUI Supervisor Loop**:
   - Refactor `src/commands/tui.ts` and `src/tui/app.tsx` so the Supervisor agent runs in a continuous loop, monitoring sub-agent session streams, watchdog timeouts, and state transitions without premature exit or crashes.

2. **Stream Throttling & ANSI Stripping**:
   - Add stream throttling to stdout/stderr log handlers (e.g. 50ms batching buffer) before emitting state updates to React Ink components (`App`, `SubSessionPanel`, `SupervisorConsolePanel`) so high-frequency stream output does not freeze or overflow terminal rendering.
   - Ensure ANSI escape codes are stripped/cleaned from log buffer text rendered in TUI panels.

3. **Interactive Modals (`QueryModal` & `EscalationModal`)**:
   - Wire `QueryModal` in `src/tui/app.tsx` and `src/tui/modals/query-modal.tsx`: When a sub-agent emits a query/question, pause session execution, display the modal, capture user input from stdin, and pass the response back to resume sub-agent session execution.
   - Wire `EscalationModal` in `src/tui/app.tsx` and `src/tui/modals/escalation-modal.tsx`: When an `ESCALATE_TO_HUMAN` decision gate is triggered, present interactive options (`retry`, `skip`, `abort`), capture user selection, and pass the decision back to the Supervisor agent loop.

4. **Tests & Build Verification**:
   - Write comprehensive Vitest test suites for Milestone 4 (e.g., stream throttling unit tests, modal input handlers, TUI loop state transitions).
   - Ensure `npx tsc --noEmit` passes with 0 type errors.
   - Ensure `npx vitest run` passes 100% clean across all test files.
   - Ensure `npx tsup` generates clean ESM build artifacts in `dist/`.

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A Forensic Auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

Write your handoff report to d:/Projects/POC/ideator/.agents/teamwork_preview_worker_m4/handoff.md and report back via send_message with test results and build status.
</USER_REQUEST>
