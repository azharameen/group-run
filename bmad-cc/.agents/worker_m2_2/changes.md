# Remediation Changes — Milestone 2 Worker 2

## Summary of Changes

### 1. Fix Regex False-Positive Parsing in `src/supervisor/result-evaluator.ts`
- **File**: `src/supervisor/result-evaluator.ts`
- **Changes**:
  - Exported `parseReviewFindings` to allow direct unit testing.
  - Added helper `normalizeCategory` for mapping severity terms (`critical`/`blocker`, `high`/`major`, `medium`/`moderate`, `low`/`minor`/`info`).
  - Refactored `parseReviewFindings` to parse explicit key-value numeric counts (`Critical findings: 0`, `High: 2`, `0 critical findings`), ignore zero count lines/phrases (`"No critical issues identified"`, `"No blockers found"`), and correctly increment only genuine positive findings (>0 issues).

### 2. Handle Fallback Story Statuses in `src/supervisor/skill-router.ts`
- **File**: `src/supervisor/skill-router.ts`
- **Changes**:
  - Exported `routeSkillsForStory` function.
  - Refactored `fallbackSkillRouting` and `routeSkillsForStory` to handle unknown or unhandled story statuses (e.g. `'blocked'`, `'draft'`, `'unknown'`) by falling back to `bmad-create-story` (if spec content is missing) or `bmad-dev-story` (if spec content exists) instead of returning an empty array `[]`.
  - Maintained UI (`bmad-ux`) and Architecture (`bmad-architecture`) keyword detection logic during development phase routing.

### 3. Target Status Transitions in `src/supervisor/gate-decision.ts`
- **File**: `src/supervisor/gate-decision.ts`
- **Changes**:
  - Added `targetStatus: string` field to `GateDecision` interface.
  - Implemented `determineTargetStatus(currentStatus, phase, decision)` to compute target status transitions:
    - **APPROVE**: `backlog`/`create` -> `ready-for-dev`, `ready-for-dev`/`in-progress`/`develop` -> `review`, `review` -> `done`.
    - **RETRY_WITH_FEEDBACK**: `review` -> `in-progress` (to allow rework), other statuses -> preserve current status.
    - **ESCALATE_TO_HUMAN**: preserve current status.

### 4. Unit Test Enhancements
- **Files**:
  - `tests/supervisor/result-evaluator.test.ts` (NEW): Dedicated test suite testing `parseReviewFindings` with zero/negative finding strings ("Critical findings: 0", "No critical issues") and positive findings, as well as `evaluateResult`.
  - `tests/supervisor/gate-decision.test.ts`: Added explicit assertions for `targetStatus` across approval, retry, and escalation decisions.
  - `tests/supervisor/skill-router.test.ts`: Added test cases verifying fallback behavior for unknown story statuses.

## Verification Summary
- `npx vitest run`: Passed 100% clean (12 test files passed, 56 tests passed).
- `npx tsup`: ESM build succeeded with 0 compilation errors.
