# Master Plan — bmad-cc Refactor

## Objective
Refactor `bmad-cc` so that the **Supervisor Agent** operates strictly as an orchestrator according to the BMad Method specifications:
1. Zero programmatic file mutators in TypeScript (`fs.writeFile`, `updateStoryStatus`, etc.) for project/story/sprint files — 100% delegated to BMad skills executing in CLI driver sessions.
2. Pure BMad skill & agent execution via CLI drivers (`gemini`, `copilot`, `opencode`, `antigravity`).
3. `bmad-help` integration for dynamic workflow discovery when workflow state is ambiguous.
4. Continuous Supervisor TUI loop (`[TREE]`, `[CONSOLE]`, `[MONITOR]`) with real-time stdout/stderr streams, watchdog timeouts, `QueryModal` parsing, and `EscalationModal` prompts.
5. All verification gates passing (`npx vitest run` 100% clean, `npx tsup` ESM build clean, React Ink TUI stability).

## Milestones & Phasing

### Phase 1: Exploration & Architectural Audit
- Dispatch 3 parallel Explorer agents to audit current codebase (`bmad-cc/src`):
  - Explorer 1: Identify all direct file mutations (`fs`, story status updates, project file writes).
  - Explorer 2: Analyze skill runner, CLI driver integration, and `bmad-help` discovery mechanism.
  - Explorer 3: Analyze TUI continuous loop, session monitoring, watchdog timeouts, and modal dialogs.
- Synthesize findings into `context.md` and `PROJECT.md`.

### Phase 2: Milestone Decomposition & Execution
- **Milestone 1: File Mutator Removal & Delegation Adapter**
  - Remove all direct file mutation logic from Supervisor & TUI code.
  - Delegate file operations to CLI driver executions of BMad skills (`bmad-create-story`, `bmad-dev-story`, etc.).
- **Milestone 2: BMad Skill & Driver Execution Pipeline**
  - Standardize CLI driver session management (`gemini`, `copilot`, `opencode`, `antigravity`).
  - Read BMad skill manifests (`.agent/skills/`, `_bmad/`) for workflow execution.
- **Milestone 3: Dynamic Workflow Discovery (`bmad-help`)**
  - Implement dynamic fallback using `/bmad-help` when state or next skill is ambiguous.
  - Integrate catalog manifests & `llms.txt` inspection.
- **Milestone 4: TUI Loop, Watchdogs & Escalation Modals**
  - Ensure 3-column TUI renders live stdout/stderr streams cleanly.
  - Robust watchdog timeout, sub-agent query modal, and escalation modal workflow.
- **Milestone 5: Verification & Hardening**
  - Run full vitest suite (`npx vitest run`), tsup ESM build (`npx tsup`), and TUI validation.
  - Forensic Auditor integrity verification (clean verdict required).

### Phase 3: Final Acceptance & Victory Report
- Synthesize test results, verification logs, and audit report.
- Report victory to Sentinel.
