---
spec_file: c1-3-dispatch-classifier-and-badges.md
status: in-progress
baseline_revision: 0405a6e
---

# Story C1.3: Dispatch Classifier & Badges

Status: in-progress

## Story

As a **Companion project maintainer**,
I want **stories and tasks classified as Jules-eligible or Copilot-only**,
so that **I know what can be dispatched to Jules sessions**.

## Acceptance Criteria

1. Stories with `intent-contract` + `code map` return `{ agent: 'jules', level: 'story' }`
2. Stories with tasks having file targets return task-level classification
3. Stories requiring BMad skill return `{ agent: 'copilot', skill: 'bmad-*' }`
4. Board shows 🟢 Jules-ready badge
5. Board shows 🟡 Tasks-ready badge
6. Board shows 🔴 Copilot-only badge
7. Badge updates in real-time as specs change

## Tasks / Subtasks

- [ ] Implement `classifyDispatch()` function (AC: 1-3)
  - [ ] Detect `intent-contract` section presence
  - [ ] Detect `code map` section presence
  - [ ] Check for BMad skill requirements
  - [ ] Return classification object
- [ ] Create badge rendering (AC: 4-6)
  - [ ] Create Jules-ready badge component
  - [ ] Create Tasks-ready badge component
  - [ ] Create Copilot-only badge component
- [ ] Implement real-time updates (AC: 7)
  - [ ] Watch for spec file changes
  - [ ] Re-classify on changes
  - [ ] Update badges automatically

## Dev Notes

### Classification Logic

```javascript
function classifyDispatch(story) {
  // Check for Jules readiness
  if (hasIntentContract(story) && hasCodeMap(story)) {
    return { agent: 'jules', level: 'story' };
  }
  
  // Check for BMad skill requirement
  if (requiresBmadSkill(story)) {
    return { agent: 'copilot', skill: 'bmad-*' };
  }
  
  // Task-level classification
  return classifyTasks(story);
}
```

### Badge Specifications

- 🟢 Jules-ready: Green badge, "Jules-Ready" text
- 🟡 Tasks-ready: Yellow badge, "Tasks-Ready" text
- 🔴 Copilot-only: Red badge, "Copilot-Only" text

### References

- [Source: _bmad-output/planning-artifacts/commander-epics.md#Epic-EP-C1]
- [Source: .github/extensions/command-center/extension.mjs]

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List
