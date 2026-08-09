# Architectural Context — bmad-cc Refactor

## Project Overview
`bmad-cc` is a TypeScript-based Command Center & TUI Supervisor for BMad methodology execution.
The goal of this refactor is to ensure that `bmad-cc` acts purely as an orchestrator, delegating ALL file modifications to native BMad agents executing BMad skills via CLI drivers (`gemini`, `copilot`, `opencode`, `antigravity`).

## Comprehensive Exploration Findings (Synthesized from 3 Explorers)

### 1. Direct Project & Sprint Status File Mutators (R1 Violations)
- `bmad-cc/src/sprint/sprint-status-updater.ts` (lines 11, 38): Uses `fs/promises.writeFile` in `updateYamlKey()` and `updateLastUpdated()` to programmatically mutate `sprint-status.yaml`.
- `bmad-cc/src/sprint/deferred-work-resolver.ts` (line 56): Uses `fs.writeFile` in `resolveDeferredTask()` to mutate `deferred-work.md` in project root.
- `bmad-cc/src/session/story-executor.ts` (line 386): Programmatically calls `await resolveDeferredTask(...)` upon story completion (`nextStatus === 'done'`).

### 2. BMad Skill Manifest & `bmad-help` Integration Gaps (R2 & R3)
- Drivers (`antigravity`, `gemini`, `opencode`, `copilot`, `custom`) in `src/agent/` wrap CLI binaries using `execa` with stdout/stderr callbacks.
- `bmad-cc/src/supervisor/skill-router.ts` (lines 32-75 and line 303) uses a static hardcoded array `NATIVE_SKILL_CATALOG` and fallback routing. It does NOT dynamically parse `.agent/skills/*/SKILL.md` frontmatter, `_bmad/_config/bmad-help.csv`, or `llms.txt`.
- Zero references to `bmad-help` in `bmad-cc/src`. `_bmad/_config/bmad-help.csv` contains 72 catalog rows with prerequisite gates, phases, and next skills. Supervisor needs driver execution for `/bmad-help` when workflow state or next skills are ambiguous.

### 3. TUI Loop, Stream Buffering & Modal Wiring Disconnects (R4)
- 3-column React Ink layout (`[TREE]`, `[CONSOLE]`, `[MONITOR]`) in `src/tui/app.tsx` renders cleanly.
- `src/commands/tui.ts` line 107 invokes `inkInstance.rerender` synchronously on every single stdout/stderr chunk without batching/throttling.
- `SubSessionPanel` line 144 performs string `slice(0, 36)` on raw strings containing ANSI escape codes, leading to broken ANSI color formatting.
- `QueryModal` and `EscalationModal` exist but are bypassed in `src/commands/tui.ts`: `onSubagentQuery` logs text without pausing for user input; `finalDecision === 'ESCALATE_TO_HUMAN'` auto-skips stories instead of opening `EscalationModal`.

### 4. Codebase Baseline Verification
- `npx vitest run`: 109/109 tests passing cleanly across 17 test files.
- `npx tsup`: Clean ESM build output in `dist/`.

## Key Invariants
1. **Zero Direct File Mutations**: No `fs.writeFile`, `fs.writeFileSync`, `fs.mkdir`, `fs.rm`, `updateStoryStatus`, or file edits in `bmad-cc` source files for project/story/sprint files.
2. **Skill & Agent Delegation**: All file creation, story writing, code development, and status tracking must be performed by BMad skills (`bmad-dev-story`, `bmad-create-story`, `bmad-code-review`, etc.).
3. **Dynamic Discovery (`bmad-help`)**: When supervisor workflow state is uncertain, invoke `/bmad-help` via CLI driver to inspect `llms.txt` and skill manifests.
4. **TUI Integrity**: React Ink 3-column TUI (`[TREE]`, `[CONSOLE]`, `[MONITOR]`) must process live output streams with throttled rendering, interactive modal pausing, and ANSI cleaning.
5. **Quality Gates**:
   - `npx vitest run` (100% passing)
   - `npx tsup` (clean ESM build)
   - Forensic Auditor CLEAN verdict (Zero cheating / dummy implementations).
