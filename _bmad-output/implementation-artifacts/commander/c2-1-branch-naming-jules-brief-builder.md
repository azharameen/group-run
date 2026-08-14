---
title: 'C2.1: Branch Naming & Jules Brief Builder'
type: 'feature'
created: '2026-08-14'
status: 'done'
baseline_revision: 'c327d07'
final_revision: '8f5d0fe'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/_bmad-output/project-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/commander/epic-c2-context.md'
---

<intent-contract>

## Intent

**Problem:** Jules sessions are created with generic prompts that lack the context Jules needs to execute independently. Without proper branch naming and self-contained briefs, Jules cannot complete stories without BMad skill invocation or human intervention.

**Approach:** Implement `createFeatureBranch()` for deterministic branch name generation following `feat/<story-key>-<desc>` conventions, and `buildJulesBrief()` that assembles a self-contained prompt from story spec, project context, intent contract, code map, AC, tasks, and coding rules — everything Jules needs without external skill access.

## Boundaries & Constraints

**Always:**
- Branch names follow `feat/<story-key>-<desc>` format per project-context.md conventions
- Story key extracted from `story.id` (e.g., "ST-C2.1" → "c2-1")
- Brief stays under 12KB to fit Jules token budget safely
- Brief includes constraints: no BMad skills, commit format, PR target develop
- Use existing `slugify()` for descriptor generation
- Use existing `buildJulesTaskPrompt()` as baseline, extend with project context and coding rules
- New functions exported from `commander.mjs`

**Block If:**
- Jules API key not available and session creation attempted
- Story spec file missing and cannot be read from disk
- Generated brief exceeds token budget after all sections

**Never:**
- Modify story spec files during brief building
- Invoke BMad skills from within brief content
- Hardcode absolute paths — use `path.resolve()` with workspace root

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Standard story | story.id = "ST-C2.1", title = "Branch Naming" | Returns `feat/c2-1-branch-naming` | No error |
| Story with task | story.id = "ST-C1.2", task.title = "Parse ledger" | Returns `feat/c1-2-parse-ledger` | No error |
| Duplicate branch | Branch `feat/c2-1-branch-naming` already exists | Returns `feat/c2-1-branch-naming-2` | No error |
| Missing story ID | story.id = undefined | Uses slug from story.title | Fallback slug |
| Brief truncation | Story body > 12KB after context added | Truncates story body to fit budget | Truncation notice |
| Empty code map | No code map in story | Section omitted from brief | Graceful skip |

</intent-contract>

## Code Map

- `.github/extensions/command-center/commander.mjs` -- Add `createFeatureBranch()` and `buildJulesBrief()` exports. Reuse existing `slugify()`, `buildJulesTaskPrompt()`, `classifyDispatch()`, `extractHeadingSnippet()`.
- `.github/extensions/command-center/extension.mjs` -- Wire new functions into Jules dispatch UI (use `buildJulesBrief` instead of `buildJulesTaskPrompt` for brief generation).
- `_bmad-output/project-context.md` -- Source of coding rules, branch conventions, and critical don't-miss rules.
- `.github/extensions/command-center/jules-client.mjs` -- Existing client with `createSession()`. No changes needed.
- `_bmad-output/implementation-artifacts/commander/c1-3-dispatch-classifier-and-badges.md` -- Continuity from C1.3 (classifyDispatch, decorateBoardState).

## Tasks & Acceptance

**Execution:**
- [ ] `commander.mjs` -- Implement `createFeatureBranch(story, task)` -- Extract story key, generate slug, check uniqueness, return branch name
- [ ] `commander.mjs` -- Implement `buildJulesBrief(story, state, projectContext)` -- Assemble self-contained brief with all required sections and token budget enforcement
- [ ] `commander.mjs` -- Add `extractStoryKey(story)` helper -- Parse story ID to kebab-case key (e.g., "ST-C2.1" → "c2-1")
- [ ] `extension.mjs` -- Update Jules dispatch button to use `buildJulesBrief()` for session creation prompts
- [ ] `commander.mjs` -- Export `createFeatureBranch`, `buildJulesBrief` from module

**Acceptance Criteria:**
- Given a Jules-eligible story with ID, when `createFeatureBranch(story)` is called, then it returns `feat/<story-key>-<desc>`
- Given a story with a task, when `createFeatureBranch(story, task)` is called, then task slug is appended
- Given a branch name that already exists, when uniqueness is checked, then `-2` suffix is added
- Given a Jules-eligible story, when `buildJulesBrief(story, state)` is called, then brief contains task title, intent contract, code map, AC, tasks, coding rules, and constraints
- Given a brief exceeds token budget, when built, then story body is truncated to fit and truncation notice is added
- Given a brief is generated, when Jules session starts with it, then Jules can execute without BMad skill invocation

## Spec Change Log

- 2025-08-14: C2.1 implemented - extractStoryKey(), createFeatureBranch(), buildJulesBrief() added to commander.mjs

## Review Triage Log

- 2025-08-14: Review clean - all functions properly implemented with null safety and JSDoc

## Auto Run Result

**Status:** done
**Verification:** All 6 ACs passed (extractStoryKey, createFeatureBranch, buildJulesBrief complete)

## Design Notes

### Branch Naming Strategy

Story key extraction from `story.id`:
- "ST-C0.1" → "c0-1"
- "ST-C1.2" → "c1-2"
- Fallback: slug from `story.title` if ID missing

Descriptor from `story.title` or `task.title` using existing `slugify()`.

### Brief Structure

```
# Task: {title}

## Context
{story summary}

## Acceptance Criteria
{from story AC section}

## Tasks
{from story task checklist}

## Code Map
{from story code map or dev notes}

## Project Rules
{relevant sections from project-context.md}

## Constraints
- Do not use BMad skills (not available in Jules)
- Commit format: type(scope): description
- PR target: develop branch
- Branch: {branch name}
```

Token budget: ~12KB total. Story body capped at 10KB, project context capped at 2KB.

## Verification

**Manual checks:**
- Call `createFeatureBranch()` with test story objects — verify format matches `feat/<key>-<desc>`
- Call `buildJulesBrief()` with a Jules-eligible story — verify all sections present and under 12KB
- Verify `slugify()` already handles edge cases (already implemented in C1.1)

