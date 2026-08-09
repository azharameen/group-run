# Original User Request

## Initial Request — 2026-08-09T17:21:00Z

Refactor `bmad-cc` so that the **Supervisor Agent** operates strictly as an orchestrator according to the BMad Method specifications. The Supervisor/TypeScript codebase MUST NOT directly edit, create, or delete any project files, story specs, or sprint status files. All file mutations, story spec generation, code editing, and status updates are performed strictly by native BMad agents and skills (`bmad-create-story`, `bmad-dev-story`, `bmad-code-review`, `bmad-help`, etc.) invoked through agent CLI drivers (`gemini`, `copilot`, `opencode`, `antigravity`). When uncertain about workflow progression, the Supervisor invokes `bmad-help` via the driver to query BMad guidance.

Working directory: `d:/Projects/POC/ideator/bmad-cc`
Integrity mode: `development`

## Requirements

### R1. Zero Direct Project File Mutations in Supervisor / TUI Code
The TypeScript codebase (`bmad-cc`) and Supervisor system MUST NOT directly modify, create, or delete project source code files, story spec Markdown files, or `sprint-status.yaml`. All file updates are executed strictly by BMad agents executing BMad skills via CLI driver sessions.

### R2. Pure BMad Skill & Agent Execution via Drivers
The Supervisor reads BMad skill definitions and configurations (`.agent/skills/`, `_bmad/`) to understand available workflows. The Supervisor spawns CLI driver sessions (`gemini`, `copilot`, `opencode`, `antigravity`) to execute BMad skills (`bmad-create-story`, `bmad-dev-story`, `bmad-code-review`, `bmad-retrospective`, etc.).

### R3. `bmad-help` Integration for Dynamic Workflow Discovery
When the Supervisor is uncertain about workflow state, missing prerequisites, or what skill to launch next, it invokes `/bmad-help` via the driver session to inspect catalog manifests and BMad module documentation (`llms.txt`) to dynamically determine the correct next step.

### R4. Continuous Supervisor Loop, Interrupt & Query Handling
The 3-column TUI (`[TREE]`, `[CONSOLE]`, `[MONITOR]`) renders real-time stdout/stderr streams. The Supervisor continuously monitors sessions, handles watchdog timeouts, parses sub-agent queries (`QueryModal`), and prompts for human decision gates (`EscalationModal`) when escalation is necessary.

---

## Acceptance Criteria

### Architectural Integrity & BMad Compliance
- [ ] Zero programmatic file mutators (`fs.writeFile`, `updateStoryStatus`) invoked by `bmad-cc` for project/story/sprint files — 100% delegated to BMad skills executing in driver sessions.
- [ ] Supervisor reads BMad skill catalog (`.agent/skills/`) and uses `bmad-help` to resolve workflow sequence when state is ambiguous.
- [ ] Continuous TUI loop monitors sub-agent driver streams and handles interrupts, queries, and stall timeouts smoothly.

### Verification & Quality Gates
- [ ] `npx vitest run` passes 100% clean across all test suites.
- [ ] `npx tsup` builds cleanly in ESM mode.
- [ ] React Ink TUI runs stably without layout crashes or terminal text overflow.

## Follow-up — 2026-08-09T19:20:33Z

You are the Generation 2 Successor Project Orchestrator for the bmad-cc refactor project.
Your metadata working directory is d:/Projects/POC/ideator/.agents/orchestrator.
The project workspace is d:/Projects/POC/ideator/bmad-cc.
Read d:/Projects/POC/ideator/.agents/orchestrator/handoff.md and d:/Projects/POC/ideator/.agents/orchestrator/progress.md to resume orchestration.

Your immediate tasks:
1. Milestone 3 Remediation: Fix catalog-parser CSV line splitting, driver fallback error handling, and TUI TypeScript compiler errors (npx tsc --noEmit).
2. Run Milestone 3 verification gate.
3. Proceed to Milestone 4 (TUI continuous loop, stream throttling, QueryModal & EscalationModal interactive handling).
4. Proceed to Milestone 5 (E2E Verification & Forensic Hardening) and declare victory when all quality gates pass.


## Follow-up — 2026-08-09T19:31:51Z

Resume work at d:/Projects/POC/ideator/.agents/orchestrator. Read handoff.md, BRIEFING.md, ORIGINAL_REQUEST.md, PROJECT.md, context.md, and progress.md for current state.
Your parent is 73d24283-f1c1-4b0e-b816-1cbee2eca1c7 — use this ID for all escalation and status reporting (send_message).
