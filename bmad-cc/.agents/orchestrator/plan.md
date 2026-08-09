# Project Plan: Transforming `bmad-cc` into a Pure Agentic Supervisor System

## Objective
Transform `bmad-cc` so that the Supervisor Agent is the Supreme Commander for all BMad execution, skill routing, status transitions, interrupt handling, and deferred task resolution. Remove hardcoded/programmatic status updates, skill routing rules, and gate decision logic from `bmad-cc` TypeScript code, letting BMad agents and the Supervisor LLM natively handle all sprint orchestration and status updating.

## Requirements Breakdown
- **R1. Pure Agentic Supervisor & Skill Routing**: Remove programmatic hardcoded skill-routing rules (e.g. `routeSkillsForStory` switch-cases). Supervisor directly decides agent/skill launch, timing, prompt based on BMad skill specs.
- **R2. Agent-Driven Status & File Updates**: Remove hardcoded status mutator functions (`updateStoryStatus`, hardcoded status transitions). Status and specs updated natively by BMad agents executing via driver sessions.
- **R3. Autonomous Continuous Loop & Interrupt/Deferral Handling**: Continuous Supervisor execution loop in TUI spawning CLI sessions, monitoring streams/exit codes, and handling interrupts/questions/stalled sessions automatically.
- **R4. Responsive Full-Screen TUI Engine & Sub-Session Monitor**: Polish 3-column React Ink TUI, log inspector (`[v]`), git diff inspector (`[g]`), status bar.
- **Acceptance Criteria**:
  - `npx vitest run` passes 100% clean across all test suites.
  - `npx tsup` builds cleanly in ESM mode.
  - Alternate Screen Buffer and keyboard navigation work seamlessly in TUI.

## Milestones & Strategy

### Milestone 1: Exploration & Codebase Analysis
- **Goal**: Thoroughly analyze `bmad-cc` codebase, locate all hardcoded status mutation logic (e.g., `story-executor.ts`, `updateStoryStatus`), skill routing rules (e.g. `routeSkillsForStory`), supervisor control loop, TUI components, and existing test suites.
- **Outputs**: Detailed analysis report from 3 parallel Explorer subagents.

### Milestone 2: Core Refactoring - Pure Agentic Supervisor & Skill Routing + Agent-Driven Status (R1 & R2)
- **Goal**: Refactor `bmad-cc` engine to remove hardcoded status mutation functions (`updateStoryStatus`) and hardcoded `switch(status)` skill routing rules (`routeSkillsForStory`). Pass full dynamic control of skill invocation, prompt selection, and status updates to the Supervisor Agent and BMad driver sessions.
- **Verification**: Explorer analysis → Worker implementation → 2 Reviewers → 2 Challengers → Forensic Auditor gate.

### Milestone 3: Continuous Supervisor Execution Loop & Interrupt/Deferral Handling (R3)
- **Goal**: Ensure the Supervisor Agent's execution loop continuously monitors streams, handles interrupts, sub-agent queries, stalled sessions, and deferred task resolution autonomously without stopping or crashing the TUI.
- **Verification**: Explorer analysis → Worker implementation → 2 Reviewers → 2 Challengers → Forensic Auditor gate.

### Milestone 4: TUI Polish, Alternate Screen Buffer & Keyboard Navigation (R4)
- **Goal**: Verify and polish 3-column React Ink TUI, full-screen log inspector (`[v]`), live git diff inspector (`[g]`), persistent status bar (`StatusBar`), Alternate Screen Buffer initialization (`process.stdout.write('\x1b[?1049h')`), and keyboard navigation (`Tab`, `Up/Down`, `Space`, `Enter`, `r`, `p`, `g`, `v`, `f`, `?`, `Esc`, `Ctrl+C`).
- **Verification**: Explorer analysis → Worker implementation → 2 Reviewers → 2 Challengers → Forensic Auditor gate.

### Milestone 5: Full E2E & Suite Verification
- **Goal**: Verify that all test suites pass 100% clean with `npx vitest run`, ESM build succeeds with `npx tsup`, and all acceptance criteria are completely satisfied.
- **Verification**: Final verification sweep and reporting.
