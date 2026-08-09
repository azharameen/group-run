# Milestone 2 (R1 & R2 Core Refactoring) File Modifications

## Overview of Changes

This document details all source code and test modifications executed for Milestone 2 of the bmad-cc transformation project. All programmatic hardcoded switch-cases, keyword matches, hardcoded status state machines, and rigid threshold rules were removed and converted to pure agentic supervisor skill routing, agent-driven status & gate decisions.

---

## 1. Source Code Modifications

### `src/supervisor/skill-router.ts`
- **Removed**:
  - Programmatic `switch (statusLower)` switch statement (`case 'backlog'`, `case 'ready-for-dev'`, `case 'review'`, `case 'done'`).
  - Hardcoded keyword matching strings (`lowerContent.includes('ui')`, `lowerContent.includes('architecture')`).
- **Added**:
  - `SkillCatalogEntry` interface and `NATIVE_SKILL_CATALOG` definition cataloging BMad skill metadata and capabilities (`bmad-create-story`, `bmad-ux`, `bmad-architecture`, `bmad-dev-story`, `bmad-code-review`, `bmad-retrospective`).
  - Dynamic skill resolution matching story lifecycle state and spec requirement patterns using regular expressions and skill capability entries.
  - Optional `customCatalog` parameter allowing Supervisor Agent custom skill catalog lookups.

### `src/supervisor/result-evaluator.ts`
- **Removed**:
  - Hardcoded regex count matching (`/critical/gi`, `/high/gi`, `/medium/gi`, `/low/gi`).
  - Naive line-prefix split logic (`filter(l => l.trim().startsWith('- ['))`).
- **Added**:
  - Integration with `auditAcceptanceCriteria` from `src/verification/criteria-auditor.ts` for acceptance criteria parsing.
  - Contextual `parseReviewFindings` function evaluating review output text contextually.

### `src/supervisor/gate-decision.ts`
- **Removed**:
  - Hardcoded threshold rule `acCompletion.percentage >= 80`.
  - Rigid boolean gate criteria `critical === 0 && high === 0`.
- **Added**:
  - `targetStatus` property to `GateDecision` interface.
  - Contextual artifact evaluation assessing verification test outputs and review finding severities without arbitrary percentage cutoffs.
  - Agentic calculation of `targetStatus` transition (`'ready-for-dev'`, `'review'`, `'done'`, or `'in-progress'`) returned as part of gate decisions.

### `src/supervisor/supervisor-agent.ts`
- **Removed**:
  - Hardcoded status transition state machine lines 112–128 (`if (currentStatus === 'backlog') nextStatus = 'ready-for-dev' ...`).
- **Added**:
  - Passed `currentStatus` into `makeGateDecision(evaluation, attempt, maxRetries, currentStatus)`.
  - Target status transition (`nextStatus`) assigned directly from `lastGateDecision?.targetStatus`.

### `src/session/story-executor.ts`
- **Removed**:
  - Hardcoded status mutator state machine lines 312–329 (`if (currentStoryStatus === 'backlog') nextStatus = 'ready-for-dev' ...`).
- **Added**:
  - Passed `currentStoryStatus` into `makeGateDecision`.
  - Target status transition (`nextStatus`) assigned directly from `lastGateDecision?.targetStatus` and persisted to disk via `updateStoryStatus`.

### `src/commands/run.ts`
- **Removed**:
  - Hardcoded fallback assignments: `activePhase = initialStatus === 'review' ? 'review' : 'develop'` and `activeSkill = initialStatus === 'review' ? 'bmad-code-review' : 'bmad-dev-story'`.
- **Added**:
  - Dynamic skill and phase resolution via `routeSkillsForStory`.

### `src/cli/run-command.ts`
- **Removed**:
  - Hardcoded fallback assignment: `activePhase = initialStatus === 'review' ? 'review' : 'develop'`.
- **Added**:
  - Dynamic phase resolution via `routeSkillsForStory`.

### `src/commands/tui.ts`
- **Removed**:
  - Hardcoded fallback assignments: `activePhase = initialStatus === 'review' ? 'review' : 'develop'` and `activeSkill = initialStatus === 'review' ? 'bmad-code-review' : 'bmad-dev-story'`.
- **Added**:
  - Dynamic skill and phase resolution via `routeSkillsForStory`.

---

## 2. Verification Summary

- `npx vitest run`: 100% clean test pass (11/11 test files passed, 45/45 tests passed).
- `npx tsup`: 100% clean ESM build (0 compilation errors).
