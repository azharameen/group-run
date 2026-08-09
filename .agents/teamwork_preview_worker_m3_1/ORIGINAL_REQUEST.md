## 2026-08-09T19:04:24Z

Your working directory for metadata is: d:/Projects/POC/ideator/.agents/teamwork_preview_worker_m3_1.
Your target project workspace is: d:/Projects/POC/ideator/bmad-cc.
Refer to handoff reference at:
- d:/Projects/POC/ideator/.agents/teamwork_preview_explorer_init_2/handoff.md
- d:/Projects/POC/ideator/.agents/orchestrator/context.md
- d:/Projects/POC/ideator/.agent/skills/bmad-help/SKILL.md
- d:/Projects/POC/ideator/_bmad/_config/bmad-help.csv

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A Forensic Auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

Objective:
Implement Milestone 3: Dynamic Skill Manifest & `bmad-help` Discovery Harness in `bmad-cc`.

Tasks:
1. Dynamic Skill Manifest & Catalog Scanner:
   - Implement dynamic scanning of installed BMad skills under `.agent/skills/*/SKILL.md` (parsing name, description, prerequisites from YAML frontmatter).
   - Implement dynamic reading and parsing of `_bmad/_config/bmad-help.csv` (mapping BMad module skills, required gates, phases, and skill transitions).
   - Enhance `bmad-cc/src/supervisor/skill-router.ts` so `routeSkillsForStory` dynamically utilizes scanned skill manifests and `bmad-help.csv` catalog data instead of relying strictly on hardcoded fallback routing.
2. `bmad-help` Integration for Dynamic Workflow Discovery:
   - Implement `bmad-help` integration in `bmad-cc/src/supervisor/supervisor-agent.ts` and `skill-router.ts` / `story-executor.ts`.
   - When supervisor state is ambiguous, missing prerequisites, or skill sequence is uncertain, spawn CLI driver session executing `/bmad-help` to inspect catalog manifests and BMad module documentation (`llms.txt`) to dynamically determine the correct next step.
3. Test & Build Verification:
   - Add/update unit tests under `bmad-cc/tests/supervisor/` to test dynamic skill manifest scanning and `bmad-help` resolution.
   - Execute `npx vitest run` in `d:/Projects/POC/ideator/bmad-cc` and verify 100% test pass rate.
   - Execute `npx tsup` in `d:/Projects/POC/ideator/bmad-cc` and verify clean ESM build.
4. Write your detailed completion report to `d:/Projects/POC/ideator/.agents/teamwork_preview_worker_m3_1/handoff.md` and update `progress.md`.
