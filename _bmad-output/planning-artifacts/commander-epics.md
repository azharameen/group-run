---
stepsCompleted: []
inputDocuments:
  - _bmad-output/planning-artifacts/architecture/command-center-orchestrator/ARCHITECTURE-SPINE.md
  - _bmad-output/planning-artifacts/architecture/command-center-orchestrator/JULES-SESSION-LIFECYCLE.md
  - _bmad-output/planning-artifacts/architecture/command-center-orchestrator/PR-LIFECYCLE.md
  - _bmad-output/planning-artifacts/architecture/command-center-orchestrator/IMPLEMENTATION-PLAN.md
  - _bmad-output/project-context.md
  - .github/extensions/command-center/extension.mjs
  - .github/extensions/command-center/jules-client.mjs
  - .github/extensions/command-center/services/bmad-model.mjs
approach: quality-first
approachDate: "2026-08-13"
---

# Command Center + Commander - Epic Breakdown

## Overview

This document decomposes the **Command Center + Commander Orchestrator** implementation into epics and stories. Commander is an internal orchestration tool that enables intelligent dispatch to Jules cloud sessions (100/day quota) and GitHub Copilot sessions (bmad-agent-dev), with full PR lifecycle automation and observability.

**Key Architecture Decisions:**
- Quality over speed — each phase delivers production-ready components
- Phase 1: Human approves PR merges (Ameen in loop)
- Coverage: 80% backend + 80% frontend
- E2E tests in CI: PR checks AND develop pushes
- Branch protection: GitHub enforces `main` and `develop` PR requirements
- All Copilot dispatches use `bmad-agent-dev`
- Jules dispatch at story level (not task/subtask)

## Requirements Inventory

### Functional Requirements

**FR1: GitHub Branch Protection Setup**
Configure `main` and `develop` with PR requirements, status checks, and admin enforcement.

**FR2: Legacy Jules Workflow Removal**
Remove `jules-scheduled.yml`, `jules-fix-ci.yml`, `jules-dispatch.yml` — Commander supersedes them.

**FR3: Project Context Branch Rules**
Update `project-context.md` with branch management rules (naming, PR targets, 1 story = 1+ PRs).

**FR4: BMad Story Template Enhancement**
Add `intent-contract` and `code map` sections to story template for Jules readiness.

**FR5: BMad Dev Agent Enhancement**
Add branch/PR policy persistent facts to `bmad-agent-dev` agent config.

**FR6: Commander Module Split**
Extract Commander logic from 125KB `extension.mjs` into `commander.mjs` module.

**FR7: Deferred Work Parser**
Implement `parseDeferredWork()` to parse `deferred-work.md` with severity tagging (critical/medium/low).

**FR8: Deferred Work UI**
Display deferred items on Command Center board with severity badges and epic attribution.

**FR9: Dispatch Classifier**
Implement `classifyDispatch()` — Jules-eligible vs Copilot-only using structural heuristics.

**FR10: Jules-Ready Badges**
Show classification badges on stories/tasks (🟢 Jules-ready, 🟡 Tasks-ready, 🔴 Copilot-only).

**FR11: Branch Naming Generator**
Implement `createFeatureBranch()` — generates `feat/<story-key>-<desc>` from story context.

**FR12: Jules Brief Builder**
Build self-contained Jules prompt with intent-contract, code map, acceptance criteria, coding rules.

**FR13: Adaptive Polling Engine**
Implement per-session polling: 5s for urgent states, 30s for IN_PROGRESS, stop for terminal.

**FR14: Jules Session State Machine**
Track AWAITING_PLAN_APPROVAL → IN_PROGRESS → terminal states with state change detection.

**FR15: Auto-Approval Engine**
Auto-approve Jules-ready specs (has intent-contract + code map), escalate to Copilot if not.

**FR16: Copilot Dispatch**
Dispatch to `bmad-agent-dev` with branch context, story spec, and BMad skill invocation.

**FR17: Copilot Session Tracking**
Track Copilot sessions with SSE events for state updates.

**FR18: Feedback Resolution Engine**
3-layer resolution: Auto-rules (instant) → Copilot (bmad-agent-dev) → User (2-min timeout).

**FR19: Stacked Approval Cards UI**
Batch approval cards with timer display and 2-min timeout handling.

**FR20: Multi-Agent State Tracker**
Unified Jules + Copilot state view with SSE events.

**FR21: PR Validation**
Validate PR target branch (`develop`), story refs (1 story = 1 PR), naming conventions.

**FR22: Copilot PR Review**
Trigger `bmad-agent-dev` to adversarially review PR diff against acceptance criteria.

**FR23: Pipeline Monitoring**
Poll GitHub check runs for pipeline status updates.

**FR24: Auto-Merge Logic**
On green pipelines + review pass → human approves (Phase 1) → auto-merge (Phase 2+).

**FR25: Branch Cleanup**
Delete feature branches after merge to `develop`, never delete `main`/`develop`.

**FR26: Local Sync**
`git fetch/pull develop` after merge to keep local repo current.

**FR27: JSONL Logging**
Log every dispatch, resolution, review, merge decision with reasoning and confidence.

**FR28: Trust Dashboard**
Display metrics: dispatch accuracy, auto-resolution rate, PR review pass rate, human overrides.

**FR29: Learning Loop**
Flag mismatches → update rules → show improvement trend over time.

**FR30: CI Pipeline Redesign**
Add E2E tests, Ruff/ESLint linting, 80% coverage thresholds, PR + develop triggers.

**FR31: Jules Quota Management**
Track 100 sessions/day, priority dispatch at 80%+ utilization.

**FR32: Edge Case Handling**
Cross-branch conflicts, Jules failures, Copilot escalation loops, pipeline flakiness.

### Non-Functional Requirements

**NFR1: Performance**
Polling must not block board rendering — async operations only.

**NFR2: Token Efficiency**
Copilot dispatches must minimize token usage through targeted context injection.

**NFR3: Observability**
Every Commander decision is logged, auditable, and learnable.

**NFR4: Safety**
Phase 1: Human approves PR merges — auto-merge only after trust metrics build.

**NFR5: Reliability**
Jules sessions don't stall indefinitely — 2-min user timeout with defer option.

**NFR6: Quality Gates**
80% coverage threshold, linting (Ruff/ESLint), E2E tests in CI pipeline.

**NFR7: Branch Isolation**
Feature branches isolated until merged — no direct pushes to `main`/`develop`.

### Additional Requirements

- **Commander Architecture Spine**: 7 invariants define the architecture
- **Jules Session Lifecycle**: Adaptive polling, auto-approval, feedback resolution
- **PR Lifecycle**: Creation → review → merge → cleanup with branch management
- **Trust/Observability**: JSONL logging, trust dashboard, learning loop
- **CI Pipeline**: E2E tests, Ruff/ESLint, coverage gates
- **BMad Compliance**: Epic → Story → Task → Subtask hierarchy preserved
- **Jules-Ready Stories**: Template includes intent-contract + code map

### FR Coverage Map

| FR | Epic | Story | Status |
|----|------|-------|--------|
| FR1 | EP-C0 | ST-C0.1 | Planned |
| FR2 | EP-C0 | ST-C0.2 | Planned |
| FR3 | EP-C0 | ST-C0.3 | Planned |
| FR4-5 | EP-C0 | ST-C0.4 | Planned |
| FR6-7 | EP-C1 | ST-C1.1 | Planned |
| FR8-9 | EP-C1 | ST-C1.2 | Planned |
| FR10-11 | EP-C1 | ST-C1.3 | Planned |
| FR12-13 | EP-C2 | ST-C2.1 | Planned |
| FR14-15 | EP-C2 | ST-C2.2 | Planned |
| FR16-17 | EP-C3 | ST-C3.1 | Planned |
| FR18-19 | EP-C3 | ST-C3.2 | Planned |
| FR20 | EP-C3 | ST-C3.3 | Planned |
| FR21-22 | EP-C4 | ST-C4.1 | Planned |
| FR23-24 | EP-C4 | ST-C4.2 | Planned |
| FR25-26 | EP-C4 | ST-C4.3 | Planned |
| FR27-28 | EP-C5 | ST-C5.1 | Planned |
| FR29 | EP-C5 | ST-C5.2 | Planned |
| FR30 | EP-C5 | ST-C5.3 | Planned |
| FR31 | EP-C6 | ST-C6.1 | Planned |
| FR32 | EP-C6 | ST-C6.2 | Planned |

## Epic List

```
EP-C0: Foundation & Guardrails
  ST-C0.1: GitHub Branch Protection Setup
  ST-C0.2: Legacy Jules Workflow Removal
  ST-C0.3: Project Context Branch Rules Update
  ST-C0.4: BMad Customization Setup

EP-C1: Commander Core & Deferred Work
  ST-C1.1: Commander Module Split
  ST-C1.2: Deferred Work Parser & UI
  ST-C1.3: Dispatch Classifier & Badges

EP-C2: Jules Session Lifecycle
  ST-C2.1: Branch Naming & Jules Brief Builder
  ST-C2.2: Adaptive Polling & Auto-Approval

EP-C3: Copilot Integration & Feedback Resolution
  ST-C3.1: Copilot Dispatch & Session Tracking
  ST-C3.2: Feedback Resolution Engine
  ST-C3.3: Multi-Agent State Tracker

EP-C4: PR Lifecycle Management
  ST-C4.1: PR Validation & Copilot Review
  ST-C4.2: Pipeline Monitoring & Auto-Merge
  ST-C4.3: Branch Cleanup & Local Sync

EP-C5: Trust & Observability
  ST-C5.1: JSONL Logging & Trust Dashboard
  ST-C5.2: Learning Loop Implementation
  ST-C5.3: CI Pipeline Redesign

EP-C6: Polish & Optimization
  ST-C6.1: Jules Quota Management
  ST-C6.2: Edge Case Handling & Documentation
```

---

## Epic EP-C0: Foundation & Guardrails

**Goal:** Establish the safety net before building on it — branch protection, workflow cleanup, and BMad customizations.

**Duration:** Week 1-2

### Story EP-C0.1: GitHub Branch Protection Setup

As a **Companion project maintainer**,
I want **`main` and `develop` branches protected with PR requirements**,
So that **no code can be merged without proper review and validation**.

**Acceptance Criteria:**

**Given** GitHub repository `azharameen/group-run`
**When** branch protection is configured
**Then** `main` branch has these protections:
- **And** PR required (no direct pushes)
- **And** Required status checks: all `ci.yml` jobs
- **And** Require approval from 1 reviewer
- **And** Include admins in protection rules
- **And** Dismiss stale approvals on push

**Given** `develop` branch protection
**When** PR is submitted to `develop`
**Then** PR is required (no direct pushes)
**And** Required status checks: all `ci.yml` jobs
**And** Skip approvals (speed over review)
**And** Dismiss stale approvals on push

**Given** Protection is enforced
**When** Anyone tries to push directly to `main` or `develop`
**Then** Push is rejected with appropriate error

**Validation:**
- Test: Create branch → PR → merge (should succeed)
- Test: Direct push to `main`/`develop` (should fail)
- Document: GitHub settings configured with screenshots

### Story EP-C0.2: Legacy Jules Workflow Removal

As a **Companion project maintainer**,
I want **to remove legacy Jules CI workflows**,
So that **Commander is the single source of Jules dispatch**.

**Acceptance Criteria:**

**Given** Existing workflows `jules-scheduled.yml`, `jules-fix-ci.yml`, `jules-dispatch.yml`
**When** Legacy workflows are removed
**Then** Files are deleted from `.github/workflows/`
**And** No references to these workflows remain in codebase
**And** `ci.yml` remains intact and functional
**And** `code-review.yml` remains intact and functional

**Given** Commander architecture
**When** Jules dispatch is needed
**Then** Commander handles dispatch via `createJulesSession()`
**And** No GitHub workflow triggers Jules sessions

**Validation:**
- Confirm: All three legacy workflows deleted
- Verify: No import references in codebase
- Test: Commander can create Jules session without workflow

### Story EP-C0.3: Project Context Branch Rules Update

As a **Companion project developer**,
I want **branch management rules in `project-context.md`**,
So that **agents know how to create branches and PRs**.

**Acceptance Criteria:**

**Given** `project-context.md` exists
**When** Branch management section is added
**Then** Section includes these rules:
- **And** "NEVER merge directly to `main` or `develop`"
- **And** Branch naming: `feat/<story-key>-<short-description>`
- **And** "One story = one PR" — never share PR across stories
- **And** PR target: Always `develop` (never `main`)
- **And** Commit format: `type(scope): description`
- **And** Self-review checklist before PR

**Given** Agent reads `project-context.md` before implementing
**When** Agent creates a branch
**Then** Branch follows naming convention
**And** PR targets `develop`
**And** Commit messages follow format

**Validation:**
- Verify: Rules added to `project-context.md`
- Test: Agent creates branch → PR → merge (follows rules)

### Story EP-C0.4: BMad Customization Setup

As a **Companion project maintainer**,
I want **BMad story template and dev agent customized for Commander**,
So that **new stories are Jules-ready by default**.

**Acceptance Criteria:**

**Given** BMad story template at `_bmad/custom/bmad-create-story.toml`
**When** Story template is customized
**Then** Template includes:
- **And** `intent-contract` section with Problem/Approach/Boundaries
- **And** `code map` section with file targets
- **And** `Branch Strategy` section with naming and PR target
- **And** Existing story format preserved (additive changes)

**Given** `bmad-agent-dev` customization at `_bmad/custom/bmad-agent-dev.toml`
**When** Dev agent is customized
**Then** Agent has persistent facts:
- **And** "BRANCH_POLICY: Always create feature branches from develop"
- **And** "PR_POLICY: One story = one PR, target develop branch"
- **And** "NEVER merge directly to main or develop"

**Validation:**
- Test: Create new story → verify template has intent-contract + code map
- Test: Dispatch to Copilot → agent follows branch rules
- Verify: Customizations in `_bmad/custom/` directory

---

## Epic EP-C1: Commander Core & Deferred Work

**Goal:** Commander can see all work and classify dispatch eligibility — module split, deferred work visibility, and dispatch classification.

**Duration:** Week 2-3

### Story EP-C1.1: Commander Module Split

As a **Companion project maintainer**,
I want **Commander logic extracted from `extension.mjs` into `commander.mjs`**,
So that **the 125KB monolith is maintainable and testable**.

**Acceptance Criteria:**

**Given** Current `extension.mjs` is 125KB (~3100 lines)
**When** Commander module is split
**Then** `commander.mjs` exports these functions:
- **And** `parseDeferredWork()` — parses deferred-work.md
- **And** `classifyDispatch()` — Jules vs Copilot classification
- **And** `buildJulesBrief()` — generates self-contained Jules prompt
- **And** `mergeAgentState()` — unified Jules + Copilot state
- **And** Each function has JSDoc comments
- **And** Each function has unit tests

**Given** Module split
**When** Command Center loads
**Then** `extension.mjs` imports from `commander.mjs`
**And** No functionality is broken
**And** Board parsing still works
**And** Jules dispatch still works
**And** File size reduced by at least 30%

**Validation:**
- Test: All existing tests pass
- Test: Board loads correctly
- Test: Jules dispatch works
- Verify: `commander.mjs` file created with exports
- Measure: File size reduction ≥30%

### Story EP-C1.2: Deferred Work Parser & UI

As a **Companion project maintainer**,
I want **deferred work items visible on Command Center board**,
So that **I can see and track all technical debt**.

**Acceptance Criteria:**

**Given** `deferred-work.md` with unresolved items
**When** `parseDeferredWork()` is called
**Then** Returns array of deferred items with:
- **And** `id` — slugified title
- **And** `kind: 'deferred'`
- **And** `title` — cleaned text
- **And** `severity` — critical/medium/low
- **And** `parentId` — linked epic if known
- **And** `sourcePath: 'deferred-work.md'`

**Given** Parsed deferred items
**When** Board state is built
**Then** Deferred items are injected into board
- **And** Items appear with severity badges (🔴 critical, 🟡 medium, 🟢 low)
- **And** Items show epic attribution
- **And** Items are filterable by severity

**Given** Deferred work UI
**When** User views Command Center
**Then** Deferred section is visible
- **And** Shows count of items by severity
- **And** Each item shows title, severity, epic link
- **And** Items can be dispatched to Jules/Copilot

**Validation:**
- Test: Parse existing `deferred-work.md` — all items captured
- Test: Board shows deferred items with severity badges
- Test: Filtering by severity works
- Verify: ~40+ deferred items visible

### Story EP-C1.3: Dispatch Classifier & Badges

As a **Companion project maintainer**,
I want **stories and tasks classified as Jules-eligible or Copilot-only**,
So that **I know what can be dispatched to Jules sessions**.

**Acceptance Criteria:**

**Given** A story with `intent-contract` + `code map`
**When** `classifyDispatch()` is called
**Then** Returns `{ agent: 'jules', level: 'story' }`

**Given** A story with tasks that have file targets
**When** `classifyDispatch()` is called
**Then** Returns task-level classification with `julesReady` per task

**Given** A story requiring BMad skill
**When** `classifyDispatch()` is called
**Then** Returns `{ agent: 'copilot', skill: 'bmad-*' }`

**Given** Classified stories/tasks
**When** Board renders
**Then** Shows classification badges:
- **And** 🟢 Jules-ready (has intent-contract + code map)
- **And** 🟡 Tasks-ready (tasks have file targets)
- **And** 🔴 Copilot-only (needs BMad skill)
- **And** Badge updates in real-time as specs change

**Validation:**
- Test: Classify existing stories — accurate Jules-eligible count
- Test: Classify Copilot-only stories — accurate
- Test: Badges display correctly on board
- Verify: Classification matches architecture decision table

---

## Epic EP-C2: Jules Session Lifecycle

**Goal:** Commander can dispatch to Jules and manage the full session lifecycle — branch naming, brief building, adaptive polling, auto-approval.

**Duration:** Week 3-4

### Story EP-C2.1: Branch Naming & Jules Brief Builder

As a **Companion project maintainer**,
I want **Jules sessions created with proper branch names and self-contained briefs**,
So that **Jules can execute independently without BMad skills**.

**Acceptance Criteria:**

**Given** A Jules-eligible story
**When** `createFeatureBranch(story, task)` is called
**Then** Returns `feat/<story-key>-<desc>`
- **And** Story key extracted from `story.id`
- **And** Task slug added if task exists
- **And** Branch name is unique (no duplicates)

**Given** A Jules-eligible story
**When** `buildJulesBrief(story)` is called
**Then** Brief includes:
- **And** Task title
- **And** Project context (relevant sections)
- **And** Intent contract block
- **And** Code map section
- **And** Acceptance criteria
- **And** Tasks checklist
- **And** Coding rules from `project-context.md`
- **And** Constraints: No BMad skills, commit format, PR target

**Given** Brief is self-contained
**When** Jules session starts with brief
**Then** Jules can execute without external skill invocation
- **And** All file targets are clear
- **And** Acceptance criteria are testable
- **And** Branch name is used

**Validation:**
- Test: Generate branch name for multiple stories — unique, follows format
- Test: Generate Jules brief — contains all required sections
- Test: Jules session created with brief — executes correctly
- Verify: Brief is under token limits

### Story EP-C2.2: Adaptive Polling & Auto-Approval

As a **Companion project maintainer**,
I want **adaptive polling and auto-approval for Jules sessions**,
So that **sessions are monitored efficiently and approved automatically**.

**Acceptance Criteria:**

**Given** A Jules session in `AWAITING_PLAN_APPROVAL` state
**When** Polling interval is determined
**Then** Interval is 5 seconds

**Given** A Jules session in `IN_PROGRESS` state
**When** Polling interval is determined
**Then** Interval is 30 seconds

**Given** A Jules session in terminal state
**When** Polling interval is determined
**Then** Polling stops

**Given** A Jules session awaits plan approval
**When** Story has `intent-contract` + `code map`
**Then** Plan is auto-approved
- **And** Session continues to coding
- **And** No human intervention needed

**Given** A Jules session awaits plan approval
**When** Story lacks Jules-ready markers
**Then** Feedback is escalated to Copilot (`bmad-agent-dev`)
- **And** Copilot decides whether to approve
- **And** Session waits for Copilot response

**Validation:**
- Test: Polling intervals match state machine
- Test: Auto-approval works for Jules-ready stories
- Test: Escalation to Copilot works for non-ready stories
- Verify: No sessions stuck in AWAITING states

---

## Epic EP-C3: Copilot Integration & Feedback Resolution

**Goal:** Commander dispatches to Copilot and resolves Jules feedback — dispatch, feedback resolution, approval UI, multi-agent state.

**Duration:** Week 4-5

### Story EP-C3.1: Copilot Dispatch & Session Tracking

As a **Companion project maintainer**,
I want **to dispatch stories to Copilot with `bmad-agent-dev`**,
So that **Copilot can implement stories with BMad skills**.

**Acceptance Criteria:**

**Given** A Copilot-only story
**When** `dispatch_to_copilot(story)` is called
**Then** Copilot session is created
- **And** Agent is `bmad-agent-dev`
- **And** Prompt includes branch context
- **And** Prompt includes story spec
- **And** Branch is created: `feat/<story-key>-<desc>`
- **And** BMad skill is invoked (e.g., `bmad-dev-story`)

**Given** Copilot session is running
**When** Session state changes
**Then** SSE event is emitted:
- **And** Event type: `copilot`
- **And** Includes session ID
- **And** Includes state (running/idle/completed/failed)
- **And** Board updates in real-time

**Validation:**
- Test: Dispatch story to Copilot → session created
- Test: Copilot creates branch → follows naming convention
- Test: SSE events received on state changes
- Verify: Board shows Copilot session status

### Story EP-C3.2: Feedback Resolution Engine

As a **Companion project maintainer**,
I want **Jules feedback resolved automatically or escalated**,
So that **sessions don't stall waiting for human input**.

**Acceptance Criteria:**

**Given** Jules session requests feedback
**When** Feedback matches auto-resolution rules
**Then** Response is generated instantly
- **And** Session continues without pause
- **And** No human or Copilot intervention

**Given** Jules session requests feedback
**When** Auto-resolution can't handle
**Then** Escalated to Copilot (`bmad-agent-dev`)
- **And** Copilot session receives feedback context
- **And** Copilot provides decision
- **And** Decision is sent back to Jules

**Given** Copilot can't resolve feedback
**When** Feedback is escalated to user
**Then** Approval card appears in Command Center
- **And** Card shows feedback details
- **And** Timer starts: 2 minutes
- **And** User can approve, reject, or modify
- **And** If timer expires → feedback is deferred
- **And** Jules session continues with defer

**Validation:**
- Test: Auto-resolution works for known feedback types
- Test: Copilot escalation works
- Test: User approval cards display correctly
- Test: 2-min timeout defers feedback
- Verify: No sessions stuck indefinitely

### Story EP-C3.3: Multi-Agent State Tracker

As a **Companion project maintainer**,
I want **unified view of all active Jules and Copilot sessions**,
So that **I can see all work in progress at a glance**.

**Acceptance Criteria:**

**Given** Active Jules and Copilot sessions
**When** `mergeAgentState()` is called
**Then** Returns unified state object:
- **And** Jules sessions with status, URL, PR URL
- **And** Copilot sessions with status, session ID, branch
- **And** All items linked to story/task IDs
- **And** Last polled timestamps

**Given** Multi-agent state
**When** Command Center board renders
**Then** Active agents section shows:
- **And** Table of Jules sessions with status
- **And** Table of Copilot sessions with status
- **And** Real-time updates via SSE
- **And** Links to Jules session URLs
- **And** Links to Copilot session URLs

**Validation:**
- Test: State tracks multiple concurrent sessions
- Test: Board updates when session states change
- Test: Links are clickable and correct
- Verify: State persistence across reloads

---

## Epic EP-C4: PR Lifecycle Management

**Goal:** Commander manages PR creation → review → merge → cleanup — validation, review, monitoring, merge, cleanup.

**Duration:** Week 5-6

### Story EP-C4.1: PR Validation & Copilot Review

As a **Companion project maintainer**,
I want **PRs validated and reviewed before merge**,
So that **only quality code reaches `develop`**.

**Acceptance Criteria:**

**Given** A PR created by Jules
**When** `validatePR(pr)` is called
**Then** Validates:
- **And** PR targets `develop` (not `main`)
- **And** PR references only 1 story
- **And** Branch follows naming convention
- **And** Commit messages follow format

**Given** PR passes validation
**When** `reviewPR(pr)` is called
**Then** Copilot (`bmad-agent-dev`) reviews:
- **And** Reviews diff against acceptance criteria
- **And** Checks for silent bugs
- **And** Verifies test coverage
- **And** Logs review results with reasoning

**Given** Copilot review completes
**When** Review results are available
**Then** Results show:
- **And** Pass/fail status
- **And** Blocking issues (if any)
- **And** Suggestions (non-blocking)
- **And** Audit trail in JSONL log

**Validation:**
- Test: PR to `main` is blocked
- Test: PR with multiple stories is blocked
- Test: Copilot review catches violations
- Verify: Review results logged with reasoning

### Story EP-C4.2: Pipeline Monitoring & Auto-Merge

As a **Companion project maintainer**,
I want **pipelines monitored and PRs merged on success**,
So that **code flows to `develop` automatically**.

**Acceptance Criteria:**

**Given** PR with passing Copilot review
**When** Pipeline starts
**Then** Commander polls check runs
- **And** Status updates in Command Center
- **And** Progress shown in PR card

**Given** Pipeline completes successfully
**When** All checks pass + Copilot review passes
**Then** Phase 1: Human approval required
- **And** Approval card appears
- **And** Timer: 2 minutes
- **And** If approved → auto-merge (squash)
- **And** If rejected → PR stays open
- **And** Phase 2+: Auto-merge based on trust metrics

**Given** Pipeline fails
**When** Check run fails
**Then** PR remains open
- **And** Failure details shown
- **And** Feedback sent to session that created PR
- **And** Fix session can be dispatched

**Validation:**
- Test: Pipeline monitoring updates in real-time
- Test: Human approval required in Phase 1
- Test: Auto-merge works on green pipelines + approval
- Test: PR stays open on failure

### Story EP-C4.3: Branch Cleanup & Local Sync

As a **Companion project maintainer**,
I want **feature branches deleted and local repo synced after merge**,
So that **repo stays clean and local code is current**.

**Acceptance Criteria:**

**Given** PR is merged to `develop`
**When** Post-merge cleanup runs
**Then**:
- **And** `git fetch origin develop` executed
- **And** `git checkout develop` executed
- **And** `git pull origin develop` executed
- **And** Feature branch deleted remotely
- **And** Board state updated (task → done)
- **And** JSONL log records cleanup

**Given** `main` or `develop` branches
**When** Cleanup runs
**Then** Branch is never deleted
- **And** Protection enforced by Commander code
- **And** Protection enforced by GitHub settings

**Validation:**
- Test: Feature branch deleted after merge
- Test: `main` and `develop` never deleted
- Test: Local repo synced to latest `develop`
- Verify: Board state updated correctly

---

## Epic EP-C5: Trust & Observability

**Goal:** Commander decisions are logged, auditable, and learnable — logging, dashboard, learning loop, CI redesign.

**Duration:** Week 6-7

### Story EP-C5.1: JSONL Logging & Trust Dashboard

As a **Companion project maintainer**,
I want **every Commander decision logged and visible in trust metrics**,
So that **I can audit and trust the system**.

**Acceptance Criteria:**

**Given** Commander makes a decision
**When** Decision is logged
**Then** JSONL entry includes:
- **And** Timestamp
- **And** Action type (dispatch/resolve/review/merge)
- **And** Item ID
- **And** Decision (jules/copilot/defer/merge)
- **And** Reasoning text
- **And** Confidence score
- **And** Outcome (filled after completion)
- **And** Duration in milliseconds
- **And** Session IDs (Jules/Copilot/PR)

**Given** Logged decisions
**When** Trust dashboard renders
**Then** Shows metrics:
- **And** Dispatch accuracy rate
- **And** Auto-resolution rate
- **And** PR review pass rate
- **And** Pipeline success rate
- **And** Human override count
- **And** Silent failure count
- **And** Trend over last 7 days

**Given** Trust dashboard
**When** Metrics update
**Then** Visual indicators show:
- **And** Progress bars with percentages
- **And** Color coding (green >80%, yellow 60-80%, red <60%)
- **And** Recent learning log entries
- **And** Human override details

**Validation:**
- Test: All decision types logged to JSONL
- Test: Dashboard shows real metrics
- Test: Metrics update in real-time
- Verify: Log file format is valid JSONL

### Story EP-C5.2: Learning Loop Implementation

As a **Companion project maintainer**,
I want **Commander to learn from mistakes and improve**,
So that **the system gets stronger over time**.

**Acceptance Criteria:**

**Given** Commander makes a decision
**When** Outcome is observed
**Then** System tracks:
- **And** If outcome ≠ expected → flag for review
- **And** Mismatches are aggregated
- **And** Patterns are identified

**Given** Flagged mismatches
**When** Analysis runs
**Then** Rules are updated:
- **And** New patterns detected
- **And** Classification rules refined
- **And** Confidence thresholds adjusted

**Given** Updated rules
**When** Dashboard shows learning
**Then** Displays:
- **And** Recent rule updates
- **And** Accuracy improvement trend
- **And** Top mismatch categories
- **And** Suggestions for manual review

**Validation:**
- Test: Mismatch flagged when decision wrong
- Test: Rules updated after analysis
- Test: Dashboard shows improvement trend
- Verify: System accuracy improves over time

### Story EP-C5.3: CI Pipeline Redesign

As a **Companion project maintainer**,
I want **CI pipeline redesigned with proper linting, testing, and coverage**,
So that **quality gates catch real issues**.

**Acceptance Criteria:**

**Given** CI pipeline `ci.yml`
**When** Pipeline is redesigned
**Then** Backend linting uses Ruff:
- **And** `ruff check backend/app`
- **And** Catches style + logic issues
- **And** Replaces `python -m compileall`

**Given** Frontend linting
**When** Pipeline is redesigned
**Then** Uses ESLint:
- **And** `eslint frontend/src`
- **And** Catches style + logic issues
- **And** Replaces `tsc --noEmit` only

**Given** Backend testing
**When** Pipeline runs
**Then** Coverage is 80%:
- **And** `pytest --cov=app --cov-fail-under=80`
- **And** Coverage report uploaded as artifact

**Given** Frontend testing
**When** Pipeline runs
**Then** Coverage is 80%:
- **And** `vitest run --coverage --coverage.thresholds.lines=80`
- **And** Coverage report uploaded as artifact

**Given** E2E tests
**When** Pipeline runs on PR to `develop` or push to `develop`
**Then** Playwright tests run:
- **And** `npx playwright test`
- **And** Results uploaded as artifact
- **And** Failures block merge

**Given** Pipeline triggers
**When** Events occur
**Then**:
- **And** PR to any branch: Lint, test, build
- **And** Push to `develop`: All + E2E
- **And** Push to `main`: All + E2E + security audit
- **And** Merge to `develop`: No extra (PR checks passed)

**Validation:**
- Test: Ruff catches real issues
- Test: ESLint catches real issues
- Test: Coverage gates enforce 80%
- Test: E2E tests run on develop PRs
- Verify: Pipeline completes in reasonable time

---

## Epic EP-C6: Polish & Optimization

**Goal:** Commander is production-ready with quota management, edge case handling, and documentation.

**Duration:** Week 7-8

### Story EP-C6.1: Jules Quota Management

As a **Companion project maintainer**,
I want **Jules 100 sessions/day quota tracked and managed**,
So that **dispatch is optimized when quota is high**.

**Acceptance Criteria:**

**Given** Jules session quota is 100/day
**When** Commander dispatches sessions
**Then** Quota is tracked:
- **And** Current usage shown in dashboard
- **And** Remaining sessions shown
- **And** Reset time shown (midnight UTC)

**Given** Quota usage is below 50%
**When** Commander dispatches
**Then** Standard dispatch:
- **And** All Jules-eligible stories/tasks dispatched
- **And** No priority ordering needed

**Given** Quota usage is above 80%
**When** Commander dispatches
**Then** Priority dispatch:
- **And** Critical deferred items first
- **And** Jules-ready stories next
- **And** Non-critical tasks deferred
- **And** Copilot used as fallback

**Given** Quota is exhausted
**When** Commander needs to dispatch
**Then** Copilot is used exclusively:
- **And** Jules-eligible items go to Copilot
- **And** Dashboard shows quota warning
- **And** User is notified

**Validation:**
- Test: Quota tracking accurate
- Test: Priority dispatch at 80%+
- Test: Fallback to Copilot when quota exhausted
- Verify: Dashboard shows quota correctly

### Story EP-C6.2: Edge Case Handling & Documentation

As a **Companion project maintainer**,
I want **edge cases handled and documentation complete**,
So that **Commander is production-ready**.

**Acceptance Criteria:**

**Given** Cross-branch conflicts on `develop`
**When** Multiple sessions push to `develop`
**Then** Commander handles:
- **And** Merges one at a time
- **And** Pulls after each merge
- **And** Conflicts resolved via Copilot
- **And** Sessions waiting are notified

**Given** Jules session fails
**When** Session reaches terminal error state
**Then** Commander handles:
- **And** Error is logged with reasoning
- **And** Fix session can be dispatched
- **And** Board shows error state
- **And** User is notified

**Given** Copilot escalation loops
**When** Copilot can't resolve feedback
**Then** Commander handles:
- **And** 2-min timeout enforced
- **And** Feedback is deferred
- **And** Jules session continues
- **And** Escalation logged for review

**Given** Pipeline flakiness
**When** Pipeline fails then succeeds
**Then** Commander handles:
- **And** Retry logic implemented
- **And** Transient failures retried
- **And** Persistent failures escalated
- **And** Retry count tracked

**Given** Commander is complete
**When** Documentation is written
**Then** Includes:
- **And** Architecture final doc
- **And** User guide for Command Center + Commander
- **And** BMad customization reference
- **And** CI pipeline documentation
- **And** Troubleshooting guide

**Validation:**
- Test: Cross-branch conflicts handled
- Test: Jules failures recovered
- Test: Escalation loops resolved
- Test: Pipeline retries work
- Verify: Documentation complete and accurate
