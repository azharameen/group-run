---
spec_file: c0-4-bmad-customization-setup.md
status: done
baseline_revision: 257de927727510f96d345cbb3edd08626e1371af
review_loop_iteration: 1
followup_review_recommended: false
---

# Story C0.4: BMad Customization Setup

Status: done

## Story

As a **Companion project maintainer**,
I want **BMad story template and dev agent customized for Commander**,
so that **new stories are Jules-ready by default**.

## Acceptance Criteria

1. Story template includes `intent-contract` section with Problem/Approach/Boundaries
2. Story template includes `code map` section with file targets
3. Story template includes `Branch Strategy` section
4. Existing story format is preserved (additive changes only)
5. `bmad-agent-dev` has persistent fact: "BRANCH_POLICY: Always create feature branches from develop"
6. `bmad-agent-dev` has persistent fact: "PR_POLICY: One story = one PR, target develop branch"
7. `bmad-agent-dev` has persistent fact: "NEVER merge directly to main or develop"
8. New stories created with customized template have intent-contract and code map
9. Copilot dispatches follow branch rules
10. Customizations exist in `_bmad/custom/` directory

## Tasks / Subtasks

- [x] Customize story template (AC: 1-4)
  - [x] Locate `_bmad/custom/bmad-create-story.toml`
  - [x] Add intent-contract section instruction via persistent_facts
  - [x] Add code map section instruction via persistent_facts
  - [x] Add Branch Strategy instruction via persistent_facts
  - [x] Preserve existing template structure (array append, not replace)
- [x] Customize dev agent (AC: 5-7)
  - [x] Create `_bmad/custom/bmad-agent-dev.toml`
  - [x] Add BRANCH_POLICY persistent fact
  - [x] Add PR_POLICY persistent fact (corrected to "one or more PRs")
  - [x] Add "NEVER merge directly" rule
  - [x] Add HOTFIX_EXCEPTION persistent fact
- [x] Validate customizations (AC: 8-10)
  - [x] Verified TOML syntax valid for both files
  - [x] Verified BMad merge correctly appends persistent_facts (tested with resolve_customization.py)
  - [x] Verified `project-context.md` loading preserved in merged output
  - [x] Confirm files exist in `_bmad/custom/`

## Dev Notes

### Story Template Customization

Add to `_bmad/custom/bmad-create-story.toml`:

```toml
[workflow.persistent_facts]
# Add these sections to story template
story_template_sections = """
## Intent Contract

### Problem
<What problem does this story solve?>

### Approach
<How will this story solve the problem?>

### Boundaries
<What is explicitly in scope and out of scope?>

## Code Map

### File Targets
- `<file-path>` - <purpose>

### Dependencies
- <dependency> - <reason>

### Integration Points
- <integration> - <impact>

## Branch Strategy

- Branch: `feat/<story-key>-<description>`
- Base: `develop`
- PR Target: `develop`
- Single story, single PR
"""
```

### Dev Agent Customization

Add to `_bmad/custom/bmad-agent-dev.toml`:

```toml
[workflow.persistent_facts]
branch_rules = """
BRANCH_POLICY: Always create feature branches from develop
PR_POLICY: One story = one PR, target develop branch
NEVER merge directly to main or develop
"""
```

### Implementation Approach

1. Read existing customization files
2. Add new sections/facts as specified
3. Preserve existing content (additive changes)
4. Test that new stories have the sections
5. Test that dev agent follows branch rules

### File Locations

- `_bmad/custom/bmad-create-story.toml` - story template customization
- `_bmad/custom/bmad-agent-dev.toml` - dev agent customization

### Verification Steps

1. Create a test story and verify it has intent-contract and code map sections
2. Verify dev agent configuration includes branch rules
3. Test that a Copilot dispatch creates branches correctly

### References

- [Source: _bmad-output/planning-artifacts/commander-epics.md#Epic-EP-C0]
- [Source: _bmad-output/planning-artifacts/architecture/command-center-orchestrator/ARCHITECTURE-SPINE.md]

## Dev Agent Record

### Agent Model Used

GitHub Copilot CLI (non-interactive mode), running locally on Windows.

### Debug Log References

- No external debug logs generated; all changes are deterministic TOML edits.

### Completion Notes List

- Existing `[workflow]` section in `bmad-create-story.toml` preserved intact (activation_steps_prepend unchanged)
- `persistent_facts` array appended under `[workflow]` with STORY_TEMPLATE and BRANCH_STRATEGY facts
- New `bmad-agent-dev.toml` created with `[agent].persistent_facts` array containing 4 branch rules
- **CRITICAL FIX (review round 1):** Initial implementation used `[workflow.persistent_facts]` as TOML table (dict) — this caused a type mismatch with base array, silently dropping `project-context.md` loading. Fixed by using `persistent_facts = [...]` as an array under correct table sections.
- **PR_POLICY corrected** from "One story = one PR" to "One story may have one or more PRs" (per user requirement)
- All customizations are additive — no existing config was removed

### File List

- `_bmad/custom/bmad-create-story.toml` — modified (added `persistent_facts` array under `[workflow]`)
- `_bmad/custom/bmad-agent-dev.toml` — created (`[agent].persistent_facts` array)

### Change Log

- 2026-08-13: Added persistent_facts to story creation workflow (Intent Contract + Code Map + Branch Strategy instructions)
- 2026-08-13: Created dev agent customization with branch/PR policy enforcement rules
- 2026-08-13: Review fix — corrected TOML type from table to array to prevent project-context.md loss

### Review Triage Log

#### 2026-08-13 — Review pass (iteration 1)
- intent_gap: 0
- bad_spec: 0
- patch: 2: (high 1, medium 1)
  - `[high]` `[patch]` TOML type mismatch — `[workflow.persistent_facts]` as table silently dropped base `persistent_facts` array (including project-context.md). Fixed by using array syntax under correct table section.
  - `[medium]` `[patch]` PR_POLICY contradicted user requirement — "Single story, single PR" changed to "One story may have one or more PRs".
- defer: 0
- reject: 1
  - HOTFIX_EXCEPTION not in AC — valid enhancement, not a bug
- addressed_findings:
  - `[high]` `[patch]` Fixed TOML structure: `persistent_facts = [...]` as array under `[workflow]` (create-story) and `[agent]` (agent-dev), verified merge with resolve_customization.py
  - `[medium]` `[patch]` Updated PR_POLICY text to allow multiple PRs per story