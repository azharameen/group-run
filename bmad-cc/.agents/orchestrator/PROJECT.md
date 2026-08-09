# Project: bmad-cc Agentic Transformation

## Architecture
`bmad-cc` is a TypeScript/React-Ink CLI application for orchestrating BMad agile/sprint workflows using BMad CLI drivers (`gemini`, `copilot`, `opencode`, `antigravity`).

Target architecture:
- **Supervisor Agent**: Supreme commander making dynamic decisions on agent/skill selection, prompt construction, timing, interrupt resolution, and status verification.
- **BMad CLI Drivers**: Executing driver sessions natively. Status changes in files (`sprint-status.yaml`, story specs, deferred task ledgers) are written directly by BMad skills/agents or ordered by Supervisor LLM.
- **TUI**: Full-screen 3-column React Ink TUI with Alternate Screen Buffer, status bar, log inspector, git diff inspector, and real-time sub-session stream rendering.

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| 1 | Exploration | Codebase, tests, routing & mutator audit | None | DONE |
| 2 | R1 & R2 Refactoring | Remove routeSkillsForStory & updateStoryStatus mutators | M1 | DONE |
| 3 | R3 Autonomous Loop | Continuous Supervisor loop & interrupt handling | M2 | DONE |
| 4 | R4 TUI Polish | 3-column TUI, alt screen buffer, keyboard navigation | M3 | DONE |
| 5 | Full Verification | Vitest 100%, Tsup ESM build, end-to-end check | M4 | DONE |

## Interface Contracts
- **Supervisor Engine ↔ BMad Skills**: Supervisor reads BMad skill specs in `.agent/skills/` or project config dynamically. No hardcoded `switch(status)` routing.
- **Supervisor Engine ↔ Sprint Status**: File updates (`sprint-status.yaml`) driven natively by agent session execution or Supervisor directives; no hardcoded JS mutators.
- **TUI Engine ↔ Sub-Sessions**: Real-time streaming via event listeners/callbacks, alternate screen buffer, full key bindings.
