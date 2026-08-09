## 2026-08-09T13:06:17Z
You are Worker 1 for Milestone 2 (R1 & R2 Core Refactoring) of the bmad-cc transformation project.

Working Directory: d:/Projects/POC/ideator/bmad-cc/.agents/worker_m2_1/
Project Root: d:/Projects/POC/ideator/bmad-cc

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A Forensic Auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

Refer to Explorer analysis reports:
- d:/Projects/POC/ideator/bmad-cc/.agents/explorer_m1_1/analysis.md
- d:/Projects/POC/ideator/bmad-cc/.agents/explorer_m1_2/analysis.md
- d:/Projects/POC/ideator/bmad-cc/.agents/explorer_m1_3/analysis.md

Detailed Requirements:

1. R1. Pure Agentic Supervisor & Skill Routing:
   - Refactor `src/supervisor/skill-router.ts`: Remove programmatic hardcoded switch-cases and keyword matching in `routeSkillsForStory`. Convert skill routing so that the Supervisor Agent (`ConversationalSupervisor` / `SupervisorAgent`) directly decides which BMad agent/skill to launch (`bmad-create-story`, `bmad-dev-story`, `bmad-code-review`, `bmad-ux`, etc.), when to launch it, and how to prompt it based on BMad's native skill specs (`.agent/skills/`) and sprint/story context.
   - Update callers in `src/session/story-executor.ts`, `src/supervisor/supervisor-agent.ts`, `src/commands/run.ts`, `src/cli/run-command.ts`, and `src/commands/tui.ts` to remove hardcoded `switch(status)` skill router rules or hardcoded fallback assignments (`initialStatus === 'review' ? 'bmad-code-review' : 'bmad-dev-story'`).

2. R2. Agent-Driven Status & File Updates:
   - Remove hardcoded status mutator functions and programmatic state machine transitions from execution control flow (`src/session/story-executor.ts` lines 312–333, `src/supervisor/supervisor-agent.ts` lines 112–128).
   - Ensure story status updates (`sprint-status.yaml`), story specs, and task transitions are driven natively by BMad agents (`bmad-dev-story`, `bmad-code-review`, `bmad-create-story`) executing via driver sessions, monitored and verified by the Supervisor Agent LLM, rather than hardcoded TS control flow.
   - Refactor `src/supervisor/gate-decision.ts` and `src/supervisor/result-evaluator.ts` to remove hardcoded threshold rules (e.g. 80% completion check, boolean condition gates), allowing the Supervisor Agent LLM to evaluate execution artifacts and make gate decisions agentically.
   - Update any unit test files in `tests/` affected by these refactorings so that tests accurately verify the pure agentic behavior without relying on deleted hardcoded functions or rules.

3. Verification:
   - Run `npx vitest run` in project root and verify 100% clean test pass.
   - Run `npx tsup` in project root and verify ESM build succeeds with 0 compilation errors.
   - Document all file modifications in `d:/Projects/POC/ideator/bmad-cc/.agents/worker_m2_1/changes.md`.
   - Write handoff report with passing build/test output to `d:/Projects/POC/ideator/bmad-cc/.agents/worker_m2_1/handoff.md`.
   - Send message to parent upon completion.
