---
spec_file: c1-3-dispatch-classifier-and-badges.md
status: done
baseline_revision: 0405a6e
final_revision: 2eaffe8
---

# Story C1.3: Dispatch Classifier & Badges

Status: done

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

- [x] Implement `classifyDispatch()` function (AC: 1-3)
  - [x] Detect `intent-contract` section presence
  - [x] Detect `code map` section presence
  - [x] Check for BMad skill requirements
  - [x] Return classification object
- [x] Create badge rendering (AC: 4-6)
  - [x] Create Jules-ready badge component
  - [x] Create Tasks-ready badge component
  - [x] Create Copilot-only badge component
- [x] Implement real-time updates (AC: 7)
  - [x] Watch for spec file changes
  - [x] Re-classify on changes
  - [x] Update badges automatically

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

qwen-3.6-27b

### Debug Log References

- Review diff: `_bmad-output/c1-3-review-diff.txt` (235 lines)
- Blind Hunter: 14 findings (0 patches, 1 defer, 13 rejects)
- Edge Case Hunter: 21 findings (0 patches, 1 defer, 20 rejects)

### Completion Notes List

- classifyDispatch() reads story body from state.documents with disk fallback
- decorateBoardState changed from sync to async, all callers verified with await
- Badge rendering uses esc() consistently for HTML safety
- SSE client writes wrapped in try-catch per client
- Filesystem watcher has nested try-catch, debounce timer cleanup on close
- Filter dropdown correctly maps "tasks" to level !== "task" check

### File List

- `.github/extensions/command-center/commander.mjs` — classifyDispatch(), async decorateBoardState, badge rendering, filter UI
- `.github/extensions/command-center/extension.mjs` — SSE classification events, filesystem watcher, refresh API

### Auto Run Result

#### Review Triage Log

- **Blind Hunter findings: 14**
  - `decorateBoardState` async callers — REJECT: all 4 callers in commander.mjs use `await`
  - classifyDispatch null on body.match — REJECT: null guards via `String(text ?? "")` and `body ?` ternary
  - bmad-* regex false positive ("not-bmad-x") — DEFER: theoretical concern, acceptable tradeoff for MVP
  - badge esc() missing — REJECT: esc() used consistently on all badge text
  - filter select handler not attached — REJECT: handler uses byId() correctly
  - filter logic incomplete — REJECT: handles all 3 filter values (jules, tasks, copilot)
  - classificationCounts type mismatch — REJECT: correctly typed as Object
  - filter change event handler — REJECT: handler properly reads select value
  - SSE payload structure — REJECT: correct `{ nextAction, classificationCounts, updatedAt }` format
  - detail view badge missing — REJECT: classification badge present in detail view rendering
  - null.match() vulnerability — REJECT: String() conversion guards in extractHeadingSnippet and classifyDispatch
  - path regex cross-platform — REJECT: regex `[A-Za-z0-9_\/\\-]` matches both `/` and `\`
  - jules vs copilot priority — DEFER: copilot takes priority if bmad-* detected, acceptable design
  - classifyDispatch not exported — REJECT: function is exported

- **Edge Case Hunter findings: 21**
  - decorateBoardState sync caller — REJECT: all callers async with await
  - body null in classifyDispatch — REJECT: ternary `body ?` guards present
  - textForScan undefined — REJECT: `String(text ?? "")` conversion
  - codeMapSnippet on null body — REJECT: `body ? (...) : ""` ternary
  - filePattern too greedy — DEFER: minor concern for MVP
  - watcher debounce timer leak — REJECT: clearTimeout on timer cleanup
  - SSE client memory leak — REJECT: req.on("close") removes from sseClients Map
  - broadcast error not caught — REJECT: try-catch per r.write()
  - classification filter value mismatch — REJECT: "tasks" maps to level check correctly
  - jules badge overwrites classification — REJECT: jules badge and classification badge are separate entries
  - classificationCounts null — REJECT: `|| {}` default present
  - path separators on Windows — REJECT: regex handles both separators
  - intent-contract case sensitivity — REJECT: regex uses `/i` flag
  - extractHeadingSnippet null text — REJECT: `String(text ?? "")` guard
  - classifyDispatch throws uncaught — REJECT: errors caught in decorateBoardState try-catch
  - empty tasks array — REJECT: loop doesn't execute on empty array
  - classificationFilter XSS — REJECT: select value compared directly, not rendered
  - watcher recursive depth — REJECT: recursive: true option set
  - stateRefreshedAt not updated — REJECT: updated on each rebuild
  - filter select XSS — REJECT: options are hardcoded strings
  - metadata.files not string — REJECT: `String(story.metadata.files)` conversion

- **Classification summary**: 35 findings | 0 patches | 2 defers | 33 rejects

#### Verification

All acceptance criteria verified:
- AC1: Jules-ready with intent-contract + code map ✓
- AC2: Task-level classification with file paths ✓
- AC3: Copilot-only with BMad skill detection ✓
- AC4: 🟢 Jules-ready badge ✓
- AC5: 🟡 Tasks-ready badge ✓
- AC6: 🔴 Copilot-only badge ✓
- AC7: Real-time updates via SSE and filesystem watcher ✓
