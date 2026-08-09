# Milestone 2 (R1 & R2 Core Refactoring) Review Report

**Reviewer**: Reviewer 2 (`reviewer_m2_2`)  
**Date**: 2026-08-09  
**Target Codebase**: `d:/Projects/POC/ideator/bmad-cc`  
**Worker Under Review**: Worker 1 (`worker_m2_1`)  

---

## Executive Summary

**Verdict**: **REQUEST_CHANGES**

Worker 1 has successfully executed the core architectural refactoring required for Milestone 2 (R1 & R2). Hardcoded status transition state machines, rigid threshold rules (e.g. 80% AC completion cutoffs), and hardcoded switch-cases in CLI entry points have been eliminated in favor of dynamic skill routing (`routeSkillsForStory`) and agentic gate decision making (`makeGateDecision`).

The test suite runs **100% clean** (11 test files passed, 45 tests passed) and the ESM build succeeds in **450ms with 0 compilation errors**.

However, adversarial code review identified **1 Major Finding** (a regex false-positive flaw in review finding evaluation that causes false gate failures when agents output phrases like `"Critical: 0"` or `"No critical issues"`), along with **2 Minor Findings** regarding test coverage gaps and edge-case status handling.

---

## 1. Integrity Violation Audit

An independent integrity audit was conducted across all modified files and test outputs:

| Check | Result | Evidence / Details |
|---|---|---|
| Hardcoded test results / expected outputs in source | **PASS** | No hardcoded return values or fake test outputs found in source files. |
| Dummy or facade implementations | **PASS** | Code implementations are fully functional and integrate with real modules (`criteria-auditor`, `test-runner`, `sprint-status-updater`). |
| Bypassing intended tasks / shortcuts | **PASS** | Refactoring of state machines and routers was executed directly in production source paths. |
| Fabricated verification outputs / self-certification | **PASS** | Verification commands (`npx vitest run` and `npx tsup`) were independently executed and output confirmed. |

---

## 2. Findings & Recommendations

### [Major] Finding 1: False Positive Parsing in `parseReviewFindings`
- **Location**: `src/supervisor/result-evaluator.ts` (lines 24–35)
- **Problem**: `parseReviewFindings` splits review text by line and checks if `line.toLowerCase()` matches `/\b(critical|blocker|severity:\s*critical)\b/i`. If an agent produces a standard clean review report containing lines such as:
  - `- Critical: 0`
  - `- High: 0`
  - `No critical issues or blockers identified.`
  The line matches the word `critical`, incrementing `findings.critical` to `1`. In `evaluateResult` and `makeGateDecision`, `findings.critical > 0` triggers an automatic gate failure (`RETRY_WITH_FEEDBACK`), causing unnecessary retries or failed story execution.
- **Why this is a problem**: Harmless or passing review summaries containing the words "critical" or "high" in a negative/zero context will false-trigger gate rejection.
- **Suggested Fix**: Refine `parseReviewFindings` regex to ignore lines indicating zero counts (e.g., `/\b(0|none|no)\s+(critical|high|blocker)/i`) or parse structured finding key-value pairs (e.g. `Critical:\s*(\d+)`).

---

### [Minor] Finding 2: Missing Test Coverage for `result-evaluator.ts` and `targetStatus` Transitions
- **Location**: `tests/supervisor/`
- **Problem**: 
  1. `src/supervisor/result-evaluator.ts` has no dedicated test file (`tests/supervisor/result-evaluator.test.ts`). `evaluateResult` and `parseReviewFindings` rely on indirect coverage.
  2. `tests/supervisor/gate-decision.test.ts` tests basic decisions (`APPROVE`, `RETRY_WITH_FEEDBACK`, `ESCALATE_TO_HUMAN`), but does not assert that `targetStatus` correctly transitions between states (`backlog` -> `ready-for-dev`, `ready-for-dev` -> `review`, `review` -> `done`, and failed `review` -> `in-progress`).
- **Why this is a problem**: Regressions in status state transitions or parsing logic might not be caught by the current test suite.
- **Suggested Fix**: Add `tests/supervisor/result-evaluator.test.ts` testing `evaluateResult` with various inputs, and add `targetStatus` assertions in `gate-decision.test.ts`.

---

### [Minor] Finding 3: Unhandled Story Status Returns Empty Skill Invocations
- **Location**: `src/supervisor/skill-router.ts` (lines 78–142)
- **Problem**: If `storyStatus` is an unrecognized status (e.g. `'blocked'`, `'draft'`, or `'unknown'`), none of the phase conditions (`requiresCreation`, `isDevelopmentPhase`, `isReviewPhase`) match. `routeSkillsForStory` returns an empty array `[]`. In `StoryExecutor`, iterating over `[]` results in an immediate loop bypass, marking `finalDecision = 'APPROVE'` with no work performed.
- **Why this is a problem**: Unhandled story statuses pass through without warning or execution.
- **Suggested Fix**: Provide an explicit fallback or log warning when `routeSkillsForStory` encounters an unknown status, or default unknown non-completed statuses to `'ready-for-dev'`.

---

## 3. Verified Claims

| Claim from Worker 1 | Verification Method | Status | Details |
|---|---|---|---|
| State machines removed in `supervisor-agent.ts` & `story-executor.ts` | Source inspection (`view_file`) | **VERIFIED** | Lines 112–128 in `supervisor-agent.ts` and 312–329 in `story-executor.ts` were replaced with `lastGateDecision?.targetStatus`. |
| 80% hardcoded threshold removed in `gate-decision.ts` | Source inspection (`view_file`) | **VERIFIED** | Hardcoded `acCompletion.percentage >= 80` was removed. `targetStatus` is calculated contextually. |
| Hardcoded CLI fallbacks removed in `run.ts`, `run-command.ts`, `tui.ts` | Source inspection (`view_file`) | **VERIFIED** | All entry points invoke `routeSkillsForStory` dynamically. |
| Test suite passes 100% clean | Ran `npx vitest run` | **VERIFIED** | 11 test files passed, 45 tests passed cleanly. |
| ESM Build succeeds | Ran `npx tsup` | **VERIFIED** | ESM build completed in 450ms with 0 errors. |

---

## 4. Adversarial Challenge & Stress-Test Summary

### Attack Scenario 1: Agent Output with Zero Counts
- **Scenario**: Agent output includes: `Critical findings: 0, High findings: 0`.
- **Expected Behavior**: Evaluated as `reviewFindings: { critical: 0, high: 0 }` -> Gate APPROVED.
- **Actual Behavior**: Matches line regex, sets `critical: 1` -> Gate REJECTED (`RETRY_WITH_FEEDBACK`).
- **Verdict**: **FAIL** (See Finding 1).

### Attack Scenario 2: High Retry Limit with Non-Zero Exit Codes
- **Scenario**: Verification tests fail 3 consecutive times with maxRetries = 3.
- **Expected Behavior**: Gate returns `ESCALATE_TO_HUMAN`, status remains unchanged.
- **Actual Behavior**: Evaluated correctly, returns `ESCALATE_TO_HUMAN` and preserves `currentStatus`.
- **Verdict**: **PASS**.

### Attack Scenario 3: Execution of UI/UX Pre-requisites
- **Scenario**: Story spec contains text `User interface component design for dashboard`.
- **Expected Behavior**: `routeSkillsForStory` returns `bmad-ux` (priority -2) before `bmad-dev-story` (priority 0).
- **Actual Behavior**: `routeSkillsForStory` matches regex `/\b(ui|user interface...)\b/i`, queues `bmad-ux` at priority -2, and sorts correctly.
- **Verdict**: **PASS**.

---

## 5. Summary Verdict & Required Actions

**Verdict**: **REQUEST_CHANGES**

Before final sign-off of Milestone 2, Worker 1 (or the implementation team) should address:
1. Fix regex parsing in `parseReviewFindings` (`src/supervisor/result-evaluator.ts`) to avoid false positives on negative count phrases.
2. Add dedicated test suite `tests/supervisor/result-evaluator.test.ts` and add assertions for `targetStatus` in `tests/supervisor/gate-decision.test.ts`.
