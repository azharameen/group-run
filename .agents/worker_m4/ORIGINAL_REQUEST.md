## 2026-08-10T09:36:00Z
You are Worker M4 working on Milestone 4: TUI Loop, Stream Throttling & Interactive Modals for bmad-cc refactor.

Working directory for your metadata/handoffs: `d:/Projects/POC/ideator/.agents/worker_m4/`
Target codebase directory: `d:/Projects/POC/ideator/bmad-cc`

### Detailed Milestone 4 Objectives
1. **Interactive `QueryModal` Wiring**:
   In `src/commands/tui.ts` and `src/tui/app.tsx`, wire sub-agent query events (`onSubagentQuery`) so that when a sub-agent requests clarification or input, the TUI displays `QueryModal`, pauses stream processing, captures stdin input from the user, and routes the answer back to resume execution.

2. **Interactive `EscalationModal` Wiring**:
   In `src/commands/tui.ts` and `src/tui/app.tsx`, wire `finalDecision === 'ESCALATE_TO_HUMAN'` decision gates so that the TUI presents `EscalationModal`, allowing interactive selection (`retry`, `skip`, `abort`), captures the choice, and applies it to control workflow progression.

3. **Stream Output Throttling (50ms buffer)**:
   In `src/commands/tui.ts`, implement 50ms batching/throttling for `inkInstance.rerender` on live stdout/stderr chunk streaming to ensure smooth rendering without terminal UI lag or stutter.

4. **ANSI Strip / Cleaning**:
   In `src/tui/panels/sub-session-panel.tsx` (or `sub-session-monitor-panel.tsx`), strip or cleanly handle ANSI color codes before log slicing (`slice(0, 36)`) to avoid split/corrupted ANSI control sequences.

5. **Build & Test Verification**:
   Run the following in `d:/Projects/POC/ideator/bmad-cc`:
   - `npx vitest run` (Must pass 100% across all 21+ test files with 0 failures).
   - `npx tsc --noEmit` (Must complete with 0 compilation errors).
   - `npx tsup` (Must build clean ESM artifacts in `dist/`).

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A Forensic Auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

When finished, write `d:/Projects/POC/ideator/.agents/worker_m4/handoff.md` with:
- Summary of code changes made across `tui.ts`, `app.tsx`, panels, and modals
- Exact results of `npx vitest run`, `npx tsc --noEmit`, and `npx tsup`
Send a message back to the orchestrator when complete.
