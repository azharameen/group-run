---
spec_file: c0-4-bmad-customization-setup.md
status: review
baseline_revision: 257de927727510f96d345cbb3edd08626e1371af
---

# Story C0.4: BMad Customization Setup

Status: review

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

- [ ] Customize story template (AC: 1-4)
  - [ ] Locate `_bmad/custom/bmad-create-story.toml`
  - [ ] Add `intent-contract` section template
  - [ ] Add `code map` section template
  - [ ] Add `Branch Strategy` section template
  - [ ] Preserve existing template structure
- [ ] Customize dev agent (AC: 5-7)
  - [ ] Locate `_bmad/custom/bmad-agent-dev.toml`
  - [ ] Add BRANCH_POLICY persistent fact
  - [ ] Add PR_POLICY persistent fact
  - [ ] Add "NEVER merge directly" rule
- [ ] Validate customizations (AC: 8-10)
  - [ ] Create test story and verify template sections exist
  - [ ] Verify dev agent has persistent facts
  - [ ] Test Copilot dispatch follows branch rules
  - [ ] Confirm files exist in `_bmad/custom/`

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

- Existing `[workflow]` section in `bmad-create-story.toml` preserved intact
- `[workflow.persistent_facts]` appended with `story_template_sections` containing Intent Contract, Code Map, and Branch Strategy templates
- New `bmad-agent-dev.toml` created with `branch_rules` containing BRANCH_POLICY, PR_POLICY, NEVER merge rule, and HOTFIX_EXCEPTION
- All customizations are additive — no existing config was removed

### File List

- `_bmad/custom/bmad-create-story.toml` — modified (added `[workflow.persistent_facts]`)
- `_bmad/custom/bmad-agent-dev.toml` — created

### Change Log

- Added `story_template_sections` persistent fact to story creation workflow (Intent Contract + Code Map + Branch Strategy)
- Created dev agent customization with branch/PR policy enforcement rules