# Original User Request

## 2026-08-09T07:31:11Z

<USER_REQUEST>
Transform `bmad-cc` so that the **Supervisor Agent** is the Supreme Commander for all BMad execution, skill routing, status transitions, interrupt handling, and deferred task resolution. Remove hardcoded/programmatic status updates, skill routing rules, and gate decision logic from `bmad-cc` TypeScript code, letting BMad agents and the Supervisor LLM natively handle all sprint orchestration and status updating.

Working directory: `d:/Projects/POC/ideator/bmad-cc`

Integrity mode: `development`

## Requirements

### R1. Pure Agentic Supervisor & Skill Routing
Remove programmatic hardcoded skill-routing rules (e.g. hardcoded `routeSkillsForStory` switch-cases) from `bmad-cc`. The Supervisor Agent directly decides which BMad agent/skill to launch (`bmad-create-story`, `bmad-dev-story`, `bmad-code-review`, `bmad-ux`, etc.), when to launch it, and how to prompt it based on BMad's native skill specs (`.agent/skills/`).

### R2. Agent-Driven Status & File Updates (No Programmatic Mutators)
Remove hardcoded programmatic status mutation functions (`updateStoryStatus`, hardcoded status transitions) from `bmad-cc` execution loops. Story status updates (`sprint-status.yaml`), story spec creation, and story task transitions are driven natively by BMad agents (`bmad-dev-story`, `bmad-code-review`, `bmad-create-story`) executing via the driver sessions, monitored and verified by the Supervisor.

### R3. Autonomous Continuous Loop & Interrupt/Deferral Handling
The Supervisor Agent runs a continuous execution loop in the TUI:
- Spawns BMad agent CLI sessions (`gemini`, `copilot`, `opencode`, `antigravity`).
- Monitors stdout/stderr streams, exit codes, and test results.
- Handles interrupts, agent questions, stalled sessions, and deferred tasks automatically without stopping or breaking the TUI.
- If a sub-agent session halts or requires guidance, the Supervisor autonomously resolves the issue or prompts the human in chat only when escalation is necessary.

### R4. Responsive Full-Screen TUI Engine & Sub-Session Monitor
Retain and polish the 3-column React Ink TUI (`[TREE]`, `[CONSOLE]`, `[MONITOR]`), full-screen log inspector (`[v]`), live git diff inspector (`[g]`), and persistent status bar (`StatusBar`) to render real-time sub-session streams, driver events, and Supervisor chat directives cleanly without terminal text overflow.

---

## Acceptance Criteria

### Supervisor Sovereignty & Clean Architecture
- [ ] No hardcoded status mutation logic inside `story-executor.ts` or JS control flow — BMad skill execution and Supervisor directives dictate all file & status updates natively.
- [ ] No hardcoded `switch(status)` skill router rules — Supervisor agent dynamically evaluates sprint state, story spec, and BMad skill catalog to route skills.
- [ ] Interrupts, stalled processes, and sub-agent queries are handled by the continuous Supervisor execution loop.

### Verification & Stability
- [ ] `npx vitest run` passes 100% clean across all test suites.
- [ ] `npx tsup` builds cleanly in ESM mode.
- [ ] TUI runs seamlessly in Alternate Screen Buffer (`process.stdout.write('\x1b[?1049h')`) with full keyboard navigation (`Tab`, `Up/Down`, `Space`, `Enter`, `r`, `p`, `g`, `v`, `f`, `?`, `Esc`, `Ctrl+C`).

</USER_REQUEST>
