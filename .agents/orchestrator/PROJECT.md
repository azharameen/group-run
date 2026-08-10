# Project: bmad-cc Refactor

## Architecture
`bmad-cc` is a CLI tool and TUI Supervisor written in TypeScript using React Ink.
Workspace: `d:/Projects/POC/ideator/bmad-cc`

### Core Modules
- `src/sprint/`: Sprint status parsing, story spec parsing, epic parsing.
- `src/agent/`: CLI driver abstractions (`gemini`, `copilot`, `opencode`, `antigravity`, `custom`).
- `src/supervisor/`: Supervisor agent, context assembler, skill router, decision gates.
- `src/session/`: Story executor, sub-session runner, stream parser.
- `src/tui/`: React Ink TUI components (`App`, `EpicTreePanel`, `SupervisorChatPanel`, `SubSessionPanel`, `QueryModal`, `EscalationModal`).
- `src/commands/`: CLI command handlers (`run.ts`, `tui.ts`, `config.ts`, `doctor.ts`).

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| 1 | Exploration & Audit | Deep codebase inspection & file mutator mapping | None | DONE |
| 2 | Zero Direct File Mutators | Refactor `sprint-status-updater.ts` & `deferred-work-resolver.ts` to remove programmatic writes | M1 | DONE |
| 3 | Skill Manifests & `bmad-help` | Dynamic skill discovery via `.agent/skills/`, `bmad-help.csv` & `/bmad-help` driver calls | M1 | DONE |
| 4 | TUI Loop & Interactive Modals | Stream throttling, ANSI safety, `QueryModal` & `EscalationModal` interactive pause/resume | M1 | IN_PROGRESS |
| 5 | E2E Verification & Forensic Audit | `vitest` suite (100%), `tsup` ESM build, and Forensic Auditor integrity check | M2, M3, M4 | PLANNED |

## Interface Contracts
- **Supervisor ↔ CLI Drivers**: Driver interface spawns sub-agent sessions, passing skill execution prompts and streaming stdout/stderr back to the TUI.
- **Supervisor ↔ BMad Help**: When skill or step is ambiguous, Supervisor executes `/bmad-help` via driver and parses recommendations.
- **Supervisor ↔ TUI**: State updates are emitted to React Ink components; user inputs from modals (`QueryModal`, `EscalationModal`) are captured and routed back to suspend/resume the execution loop.

## Code Layout
- `bmad-cc/src/`
  - `agent/` (`driver-interface.ts`, `driver-factory.ts`, driver implementations)
  - `sprint/` (`sprint-status-parser.ts`, `story-spec-parser.ts`, `epic-parser.ts`)
  - `supervisor/` (`supervisor-agent.ts`, `skill-router.ts`, `context-assembler.ts`, `gate-decision.ts`)
  - `session/` (`story-executor.ts`, `sub-session-runner.ts`, `stream-parser.ts`)
  - `tui/` (`app.tsx`, `panels/`, `modals/`)
  - `commands/` (`run.ts`, `tui.ts`, `config.ts`, `doctor.ts`)
- `bmad-cc/tests/` (Vitest test files)
