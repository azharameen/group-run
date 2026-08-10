## 2026-08-10T14:22:41Z
Your working directory for metadata is: d:/Projects/POC/ideator/.agents/teamwork_preview_worker_m4_gen2.
Your target project workspace is: d:/Projects/POC/ideator/bmad-cc.
Refer to exploration handoff reference at:
- d:/Projects/POC/ideator/.agents/teamwork_preview_explorer_init_3/handoff.md
- d:/Projects/POC/ideator/.agents/orchestrator/context.md

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A Forensic Auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

Objective:
Implement Milestone 4: TUI Continuous Loop, Stream Throttling & Interactive Modals in `bmad-cc`.

Tasks:
1. Interactive Modal Wiring in `src/commands/tui.ts` & `src/tui/app.tsx`:
   - Wire `QueryModal` via `onSubagentQuery` so sub-agent prompts pause execution, switch `appMode` to `'subagent-query'`, render `QueryModal`, and route user stdin input back to driver sub-agent processes.
   - Wire `EscalationModal` when `storyExecutor` returns `finalDecision === 'ESCALATE_TO_HUMAN'`, switching `appMode` to `'escalation'`, rendering `EscalationModal`, and awaiting user decision (`retry`, `retry-with-prompt`, `override-pass`, `skip`, `abort`).
2. Stream Throttling, ANSI Cleaning & History Caps:
   - Add microtask/interval buffering (~50ms threshold) to stdout/stderr stream rerenders (`inkInstance.rerender`) in `src/commands/tui.ts` to eliminate CPU spikes and screen flickering.
   - Sanitize/strip ANSI escape codes before line slicing in `src/tui/panels/sub-session-panel.tsx` to fix broken terminal color sequences.
   - Cap `session.logs` history buffer size (e.g. max 500 lines per session) in `src/tui/app.tsx`.
3. Test & Build Verification:
   - Add/update unit tests under `tests/tui/` (`app-tui.test.ts`, `modals.test.ts`).
   - Run `npx vitest run` in `d:/Projects/POC/ideator/bmad-cc` and verify 100% test pass rate.
   - Run `npx tsc --noEmit` in `d:/Projects/POC/ideator/bmad-cc` and verify 0 type errors.
   - Run `npx tsup` in `d:/Projects/POC/ideator/bmad-cc` and verify clean ESM build.
4. Write your detailed completion report to `d:/Projects/POC/ideator/.agents/teamwork_preview_worker_m4_gen2/handoff.md` and update `progress.md`.
