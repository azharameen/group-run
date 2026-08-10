## 2026-08-10T09:32:48Z
<USER_REQUEST>
You are Worker M4 for the bmad-cc refactor project.
Your metadata working directory is d:/Projects/POC/ideator/.agents/worker_m4_1.
The target codebase workspace is d:/Projects/POC/ideator/bmad-cc.

Task Objective: Implement Milestone 4 in bmad-cc (TUI Continuous Loop, Stream Throttling & Interactive Modals):

1. Stream Output Batching/Throttling:
   In `src/commands/tui.ts` and `src/tui/app.tsx`, implement a ~50ms buffer/throttling mechanism for stdout/stderr live stream updates to batch rendering and prevent UI freezes or excessive Ink rerenders during rapid sub-agent streaming output.

2. ANSI Cleaning in TUI Panels:
   In `src/tui/panels/sub-session-panel.tsx` and `src/tui/app.tsx`, strip or cleanly handle ANSI escape codes prior to line splitting and string slicing so logs display without broken ANSI color codes or corrupted layout bounds.

3. Interactive QueryModal Wiring:
   In `src/commands/tui.ts` and `src/tui/app.tsx`, wire `onSubagentQuery` events so that when a sub-agent emits a query/prompt, the TUI loop pauses sub-agent execution, opens `QueryModal` for human stdin response, captures the user input, and routes the response back to resume the sub-agent session.

4. Interactive EscalationModal Wiring:
   In `src/commands/tui.ts` and `src/tui/app.tsx`, wire `ESCALATE_TO_HUMAN` decision gates so that when a decision gate evaluates to human escalation, the TUI opens `EscalationModal` presenting options (`retry`, `skip`, `abort`). Pause execution until user makes a selection, then route the chosen action to retry, skip, or abort the story execution loop.

5. Verification Commands:
   - Run `npx tsc --noEmit` in `d:/Projects/POC/ideator/bmad-cc` and ensure 0 errors.
   - Run `npx vitest run` in `d:/Projects/POC/ideator/bmad-cc` and ensure 100% pass rate across all test files (including new unit tests for stream throttling and modal state routing).
   - Run `npx tsup` in `d:/Projects/POC/ideator/bmad-cc` and ensure clean ESM build output in `dist/`.

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A Forensic Auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

Deliverable: Write your implementation handoff report to `d:/Projects/POC/ideator/.agents/worker_m4_1/handoff.md` with build and test results, then send a completion message back to your parent orchestrator.
</USER_REQUEST>
