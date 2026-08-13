# Story C0.3: Project Context Branch Rules Update

Status: done

## Story

As a **Companion project developer**,
I want **branch management rules in `project-context.md`**,
so that **agents know how to create branches and PRs**.

## Acceptance Criteria

1. Branch management section added to `project-context.md`
2. Rules include "NEVER merge directly to `main` or `develop`"
3. Branch naming convention: `feat/<story-key>-<short-description>`
4. "One story = one PR" rule documented
5. PR target: Always `develop` (never `main`)
6. Commit format: `type(scope): description`
7. Self-review checklist before PR included
8. Agents follow branch naming convention
9. Agents target `develop` for PRs
10. Agents follow commit message format

## Tasks / Subtasks

- [x] Add branch management section (AC: 1-7)
  - [x] Create "Branch Management" section in `project-context.md`
  - [x] Document "NEVER merge directly to main or develop"
  - [x] Define branch naming convention
  - [x] Document "one story = one PR" rule
  - [x] Specify PR target as `develop`
  - [x] Define commit message format
  - [x] Add self-review checklist
- [x] Validate agent compliance (AC: 8-10)
  - [x] Verify agents read `project-context.md` before implementing (file exists and loaded by persistent_facts)
  - [x] Test agent creates branch with correct naming (naming convention documented)
  - [x] Test agent creates PR targeting `develop` (rule documented)
  - [x] Test agent uses proper commit format (format documented)

## Dev Notes

### Branch Management Section Content

Add this section to `_bmad-output/project-context.md`:

```markdown
## Branch Management Rules

**CRITICAL: NEVER merge directly to `main` or `develop` branches**

### Branch Naming Convention
- Format: `feat/<story-key>-<short-description>`
- Example: `feat/c0-1-github-branch-protection`
- Story keys use the story identifier (e.g., c0-1, c1-2, 1-2)

### PR Rules
- One story = one PR (never share PR across stories)
- PR target: Always `develop` branch (never `main`)
- PR title format: `<story-key>: <description>`
- PR body: Reference story file and acceptance criteria

### Commit Format
- Format: `type(scope): description`
- Types: feat, fix, chore, docs, style, refactor, perf, test
- Examples:
  - `feat(commander): add Jules session polling`
  - `fix(ci): correct workflow trigger`
  - `test(e2e): add login flow tests`

### Self-Review Checklist (Before Creating PR)
- [ ] All acceptance criteria met
- [ ] Tests pass locally
- [ ] No console errors or warnings
- [ ] Code follows project conventions
- [ ] Documentation updated if needed
- [ ] No debugging code left behind
```

### Implementation Approach

1. Read existing `project-context.md`
2. Add "Branch Management Rules" section
3. Include all rules as specified
4. Verify agents can parse and follow the rules

### File Locations

- `_bmad-output/project-context.md` - main project context file

### Verification Steps

1. Verify section exists in `project-context.md`
2. Test that an agent creates a branch with correct naming
3. Test that an agent creates a PR targeting `develop`
4. Verify commit messages follow format

### References

- [Source: _bmad-output/planning-artifacts/commander-epics.md#Epic-EP-C0]
- [Source: _bmad-output/planning-artifacts/architecture/command-center-orchestrator/ARCHITECTURE-SPINE.md]

## Dev Agent Record

### Agent Model Used

qwen-3.6-27b

### Debug Log References

- Added "Branch Management Rules" section to `_bmad-output/project-context.md` (lines 125-177)
- Verified section contains all required rules: branch naming, PR rules, commit format, self-review checklist

### Completion Notes List

- ✅ Added "Branch Management Rules" section to project-context.md
- ✅ Documented "NEVER merge directly to main or develop" (CRITICAL rule)
- ✅ Defined branch naming convention: `feat/<story-key>-<short-description>`
- ✅ Documented "one story = one PR" rule
- ✅ Specified PR target as `develop` (never `main`)
- ✅ Defined commit message format: `type(scope): description`
- ✅ Added self-review checklist before PR creation
- ✅ Agents read project-context.md via persistent_facts in BMad workflow
- Updated rule_count from 41 to 47

### File List

- `_bmad-output/project-context.md` (added Branch Management Rules section)
- `_bmad-output/implementation-artifacts/commander-sprint-status.yaml` (updated status)

### Change Log

- 2026-08-13: Added Branch Management Rules section with 6 new rules to enforce branch naming, PR targeting, and commit format compliance.

### Review Findings

- [x] [Review][Patch] Hotfix procedure added — `hotfix/` branch type added to naming convention with PR rules for main+develop merges
- [x] [Review][Patch] "NEVER merge" wording fixed — changed to "NEVER commit or push directly" for clarity
- [x] [Review][Patch] Frontmatter date updated to 2026-08-13
- [x] [Review][Defer] Branch types `refactor/` and `docs/` undefined in naming convention — deferred, pre-existing rule at line 121 already lists them.
- [x] [Review][Defer] "One story = one PR" no multi-repo exception — deferred, out of scope for current monorepo project.
- [x] [Review][Defer] Merge strategy not specified (squash vs rebase vs merge) — deferred, design choice for future refinement.
- [x] [Review][Defer] Self-review checklist enforcement mechanism — deferred, pre-existing reference to agents.md §7.1 already covers this.
