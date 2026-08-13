# Story C1.1: Commander Module Split

Status: ready-for-dev

## Story

As a **Companion project maintainer**,
I want **Commander logic extracted from `extension.mjs` into `commander.mjs`**,
so that **the 125KB monolith is maintainable and testable**.

## Acceptance Criteria

1. `commander.mjs` exports `parseDeferredWork()` function
2. `commander.mjs` exports `classifyDispatch()` function
3. `commander.mjs` exports `buildJulesBrief()` function
4. `commander.mjs` exports `mergeAgentState()` function
5. Each exported function has JSDoc comments
6. Each exported function has unit tests
7. `extension.mjs` imports from `commander.mjs`
8. No functionality is broken after split
9. Board parsing still works
10. Jules dispatch still works
11. File size reduced by at least 30%

## Tasks / Subtasks

- [ ] Analyze `extension.mjs` structure (AC: 1-4)
  - [ ] Identify Commander-related functions
  - [ ] Map function dependencies
  - [ ] Identify export boundaries
- [ ] Create `commander.mjs` module (AC: 1-5)
  - [ ] Extract `parseDeferredWork()` function
  - [ ] Extract `classifyDispatch()` function
  - [ ] Extract `buildJulesBrief()` function
  - [ ] Extract `mergeAgentState()` function
  - [ ] Add JSDoc comments to each function
- [ ] Update imports in `extension.mjs` (AC: 7)
  - [ ] Import extracted functions from `commander.mjs`
  - [ ] Remove duplicated code from `extension.mjs`
  - [ ] Verify import paths are correct
- [ ] Create unit tests (AC: 6)
  - [ ] Test `parseDeferredWork()` with sample data
  - [ ] Test `classifyDispatch()` with different inputs
  - [ ] Test `buildJulesBrief()` output format
  - [ ] Test `mergeAgentState()` state merging
- [ ] Validate functionality (AC: 8-11)
  - [ ] Run all existing tests
  - [ ] Verify board loads correctly
  - [ ] Verify Jules dispatch works
  - [ ] Measure file size reduction

## Dev Notes

### Current State

- `extension.mjs` is ~125KB (~3100 lines)
- Contains Commander logic mixed with canvas UI logic
- Functions are coupled and hard to test independently

### Target Functions to Extract

```javascript
// commander.mjs exports
export function parseDeferredWork(content) {
  // Parse deferred-work.md content
}

export function classifyDispatch(story) {
  // Classify Jules vs Copilot dispatch
}

export function buildJulesBrief(story, context) {
  // Build self-contained Jules prompt
}

export function mergeAgentState(julesState, copilotState) {
  // Merge Jules and Copilot session states
}
```

### Module Structure

```
.github/extensions/command-center/
├── extension.mjs (reduced, imports from commander.mjs)
├── commander.mjs (new, exports core logic)
└── tests/
    └── commander.test.mjs (new, unit tests)
```

### Implementation Approach

1. Read `extension.mjs` to identify Commander functions
2. Create `commander.mjs` with extracted functions
3. Add JSDoc comments
4. Update `extension.mjs` to import from `commander.mjs`
5. Create unit tests for each function
6. Verify all tests pass
7. Measure file size reduction

### Verification Steps

1. All existing tests pass
2. Board loads without errors
3. Jules dispatch functions work
4. File size reduced by ≥30%

### References

- [Source: _bmad-output/planning-artifacts/commander-epics.md#Epic-EP-C1]
- [Source: .github/extensions/command-center/extension.mjs]

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List
