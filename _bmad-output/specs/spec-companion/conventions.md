---
type: spec-companion
topic: working-conventions
derived_from: spec-run-decisions
---

# Working Conventions

These conventions govern how BMad skills produce artifacts for this project. They are load-bearing — downstream agents that violate them produce unusable output.

## Requirements Extraction

1. **Code-ground every requirement.** Each FR must be tagged against actual code:
   - `DELETE` — dead code with exact file paths to remove
   - `KEEP` — works as-is, no changes needed
   - `MIGRATE` — exists but needs rewriting, with exact file and line references
   - `NEW` — does not exist, must be created
2. **No mechanical extraction.** Do not lift requirements from docs without verifying against the codebase. A requirement that says "FSM state transitions" is wrong if the code uses `transitions` lib and the architecture says LangGraph.
3. **Cross-reference dead imports.** When marking code as DELETE, trace which files import it. All importers must also be deleted or rewritten in the same epic.
4. **List exact files.** Never say "delete old code." Say "delete `backend/app/state/machine.py`, `backend/app/scoring/engine.py`" with a table.

## Epic Design

5. **Vertical slices over layered phases.** Each epic (after the initial cleanup) must deliver a complete user-visible feature: backend API + frontend UI + tests together. The user can click and use it at the end of every sprint.
6. **One technical epic max.** The only pure-technical epic allowed is the initial dead-code cleanup (Sprint 0). If the import graph isn't poisoned, there should be no technical epic at all.
7. **Tests embedded in feature epics.** Testing is not a separate phase. Each feature epic includes its own backend tests, frontend tests, and validation stories.
8. **Incremental agent core is fine.** A basic supervisor routing to a single "general" team is a valid starting point. Specialized teams can be added later without breaking the flow.
9. **Dependency graph required.** Every epic set must include a Mermaid dependency graph showing build order. Agents use this to know execution sequence.

## Story Design

10. **Each story has an acceptance criterion.** "User does X → sees Y → system does Z." No story is complete without a testable acceptance criterion.
11. **Stories reference actual files.** Story specs must list the exact files to create, modify, or delete — not abstract descriptions.
12. **Layer-tagged stories.** Each story in a vertical-slice epic is tagged: Backend, Frontend, or Infra. This helps agents understand the slice composition.

## Code Audit

13. **Audit before requirements.** Before extracting requirements, run a code audit:
    - Find all imports of deprecated/old modules
    - Identify what's actually reusable vs. what needs rewriting
    - Check what config files exist vs. what the architecture requires
    - Verify test coverage (or lack thereof)
14. **Report reusable code.** List files that work correctly for the new architecture with "changes needed" notes. Don't assume everything needs rewriting.
15. **Check frontend testing infrastructure.** A codebase with 45+ components and zero test files is a material fact that affects epic design.

## Anti-Patterns (Never Do)

- **Layered epics** (foundation → core → API → UI → test) — delays user feedback until the last possible moment
- **Bolt-on testing** (testing as a separate phase at the end) — produces untested code that's expensive to retrofit
- **Assumption-based requirements** (lifting FRs from docs without checking code) — produces epics that don't match reality
- **Abstract cleanup** ("delete old code" without file paths) — agents delete the wrong things or miss dangling imports
- **Over-engineered testing** for solo projects — load testing, contract testing, and security scanning are nice-to-have, not must-have

## Testing Priorities (Solo Project)

**Must have:**
- Forbidden import checks (CI fails if dead modules are imported)
- Test database isolation (in-memory SQLite for tests)
- SSE event contract tests (frontend/backend event shape alignment)

**Should have:**
- Basic CI pipeline (tests on PR, deploy on main)
- SQLite concurrency tests (single point of failure)

**Nice to have (later):**
- Load testing (only with real users)
- Security scanning (only with sensitive data)
- Contract testing (overkill for 2 owned services)
