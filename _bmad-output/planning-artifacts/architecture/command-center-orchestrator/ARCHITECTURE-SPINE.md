# Command Center + Commander Orchestrator — Architecture Spine

**Project:** Companion  
**Author:** Winston (System Architect)  
**Date:** 2026-08-13  
**Status:** Proposed — Ready for Team Review  

**Nomenclature:**
- **Command Center** — the canvas (visual dashboard and control surface)
- **Commander** — the orchestrator agent (intelligence behind the canvas)

---

## Problem Statement

After completing Epics 0-7, the Companion project has:
- A working Command Center canvas with BMad board parsing and Jules dispatch
- 100 Jules sessions/day quota available for autonomous coding
- ~40+ deferred work items in `deferred-work.md` that need closure
- BMad story templates that vary in Jules-readiness

**Gap:** The Command Center (canvas) cannot intelligently decide *what* to dispatch to Jules vs Copilot, cannot track Copilot-initiated sessions, and doesn't surface deferred work as actionable board items. **Commander** (the orchestrator agent behind the canvas) does not yet exist.

---

## Goals

1. **Intelligent Dispatch** — Command Center classifies each story/task as Jules-eligible or Copilot-only
2. **Unified Agent View** — See all active work (Jules sessions + Copilot sessions) in one dashboard
3. **Deferred Work Visibility** — Deferred items appear as tracked, severable work items on the board
4. **Jules-Ready Story Template** — New stories include `intent-contract` + `code map` by default
5. **BMad Compliance** — Hierarchy (Epic → Story → Task → Subtask) preserved; no deviation from BMad workflow

---

## Architecture Spine

```mermaid
graph TB
    subgraph CC["Command Center (Canvas)"]
        UI["Dashboard UI"]
        AP["Approval Cards"]
        QU["Quota Monitor"]
    end

    subgraph CMDR["Commander (Orchestrator Agent)"]
        BM["BMad Work Model Parser"]
        DW["Deferred Work Parser"]
        DC["Dispatch Classifier"]
        FE["Feedback Resolution Engine"]
        PM["PR Lifecycle Manager"]
        PS["Multi-Agent State Tracker"]
    end

    subgraph BMadArtifacts["BMad Artifacts (Files)"]
        EP["epics.md"]
        ST["story spec files"]
        SP["sprint-status.yaml"]
        DF["deferred-work.md"]
        PC["project-context.md"]
    end

    subgraph Copilot["GitHub Copilot App"]
        DEV["bmad-agent-dev (always)"]
    end

    subgraph JulesCloud["Jules Cloud (100 sessions/day)"]
        J1["Jules Session 1"]
        J2["Jules Session 2"]
        J3["Jules Session N"]
    end

    EP --> BM
    ST --> BM
    SP --> BM
    DF --> DW
    PC --> DC

    BM --> DC
    DW --> DC
    DC --> DEV
    DC --> J1
    DC --> J2
    DC --> J3

    DEV --> PS
    J1 --> PS
    J2 --> PS
    J3 --> PS

    PS --> FE
    FE --> DEV
    PS --> PM
    PM --> DEV

    PS --> UI
    FE --> AP
    DC --> QU

    classDef canvas fill:#2563eb,color:#fff
    classDef orchestrator fill:#7c3aed,color:#fff
    classDef artifact fill:#15803d,color:#fff
    classDef agent fill:#b45309,color:#fff
    class CC canvas
    class CMDR orchestrator
    class BMadArtifacts artifact
    class Copilot agent, JulesCloud agent
```

**Key distinction:**
- **Command Center** = the canvas UI you interact with (dashboard, approvals, status)
- **Commander** = the orchestrator brain behind the canvas (parsing, dispatching, resolving, managing)

---

## Invariant 1: BMad Hierarchy Is Immutable

**Rule:** The work hierarchy is always Epic → Story → Task → Subtask. No new levels. No renaming.

**Why:** Jules sessions receive their position in the hierarchy as context. If the hierarchy changes, all dispatch prompts break.

**Enforcement:** `parseBmadBoard()` in `extension.mjs` is the canonical parser. All other views derive from its output.

---

## Invariant 2: Dispatch Classification Is Deterministic

**Rule:** Each story/task is classified at parse time using structural heuristics — no LLM judgment needed.

| Criterion | Jules-Eligible | Copilot-Only (`bmad-agent-dev`) |
|-----------|---------------|----------------------------------|
| Has `intent-contract` block | ✅ | |
| Has `code map` section | ✅ | |
| Has `Tasks & Acceptance` or `Tasks / Subtasks` | ✅ | |
| Needs `bmad-*` skill execution | | ✅ |
| Is story creation, code review, retro, sprint planning | | ✅ |
| Is deferred debt with clear file/line target | ✅ | |
| Requires cross-file architectural decision | | ✅ |
| **Jules feedback that auto-resolution can't handle** | | ✅ (always `bmad-agent-dev`) |
| **PR review before merge** | | ✅ (always `bmad-agent-dev`) |

**Note: All Copilot dispatches use `bmad-agent-dev` regardless of task type. Single agent simplifies escalation routing.**

**Classification algorithm (pseudo-code):**

```javascript
function classifyDispatch(story, tasks) {
    // Copilot-only categories (BMad skill required)
    const copilotOnly = [
        'bmad-create-story', 'bmad-code-review', 'bmad-dev-story',
        'bmad-retrospective', 'bmad-sprint-planning'
    ];
    
    // If story explicitly requires a BMad skill → Copilot
    if (story.metadata?.requiredSkill && copilotOnly.includes(story.metadata.requiredSkill))
        return { agent: 'copilot', skill: story.metadata.requiredSkill };
    
    // If story has intent-contract + code map → Jules-eligible at story level
    const hasIntentContract = story.body.includes('<intent-contract>');
    const hasCodeMap = /## Code Map/.test(story.body);
    
    if (hasIntentContract && hasCodeMap)
        return { agent: 'jules', level: 'story' };
    
    // Individual tasks with clear file targets → Jules-eligible
    return {
        agent: 'tasks',
        tasks: tasks.map(task => ({
            id: task.id,
            agent: task.metadata?.files ? 'jules' : 'copilot',
            julesReady: !!task.metadata?.files
        }))
    };
}
```

---

## Invariant 3: Jules Brief Is Self-Contained

**Rule:** A Jules implementation brief must contain everything needed to execute — no external BMad skill invocation.

**Brief template (what Command Center feeds Jules):**

```
You are implementing a task from the Companion project.

## Task
<title from story/task>

## Context
<project-context.md relevant sections>

## Intent Contract
<intent-contract block from story spec>

## Code Map
<files to create/modify/reference>

## Acceptance Criteria
<from story spec>

## Tasks Checklist
<tasks and subtasks from story>

## Coding Rules
<from project-context.md Critical Implementation Rules>

## Constraints
- Do NOT modify _bmad-output/ BMad artifact files
- Do NOT invoke BMad skills — you are a direct coding agent
- Commit format: type(scope): description
- Create PR when complete
- Run existing tests to verify no regressions
```

---

## Invariant 4: Deferred Work Is First-Class

**Rule:** Deferred items are not invisible technical debt — they appear on the board with severity tags.

**New work item kind: `deferred`**

```javascript
{
    id: 'deferred-sqlite-concurrency',
    kind: 'deferred',
    title: 'Shared SQLite connection concurrency risk',
    status: 'open',
    severity: 'critical',       // critical | medium | low
    parentId: 'epic-7',         // linked to originating epic
    phase: 'Deferred from Epic 7',
    sourcePath: 'deferred-work.md',
    metadata: {
        deferredFrom: 'code review of 1-2-update-config-py',
        evidence: 'check_same_thread=False with single global connection',
        resolution: 'EP-7 story 7-4 (sqlite-concurrency-tests) planned to address'
    }
}
```

**Parsing deferred-work.md:**

```javascript
function parseDeferredWork(text) {
    const items = [];
    const lines = text.split(/\r?\n/);
    let currentSection = null;
    
    for (const line of lines) {
        // Track section headers for epic attribution
        if (/^## Deferred from:/.test(line)) {
            currentSection = line;
        }
        
        // Skip resolved items
        if (/^\s*- ~~/.test(line)) continue;
        
        // Parse unresolved items
        const match = line.match(/^\s*-\s+(\*\*|\[CRITICAL\]\s+|\[PENDING\]\s+)?(.+)$/);
        if (!match) continue;
        
        // Determine severity
        let severity = 'low';
        if (/\*\*.*\*\*/.test(match[2]) || /\[CRITICAL\]/.test(line)) severity = 'critical';
        else if (/medium/i.test(line)) severity = 'medium';
        
        // Extract epic from section context
        const epicMatch = currentSection?.match(/Epic (\d+)/i);
        const epicNum = epicMatch ? Number(epicMatch[1]) : null;
        
        items.push({
            id: `deferred-${slugify(match[2])}`,
            kind: 'deferred',
            title: match[2].replace(/\*\*/g, '').trim(),
            status: 'open',
            severity,
            parentId: epicNum !== null ? `epic-${epicNum}` : null,
            phase: `Deferred work`,
            sourcePath: 'deferred-work.md',
            metadata: { deferredFrom: currentSection?.trim() }
        });
    }
    
    return items;
}
```

---

## Invariant 5: Multi-Agent State Is Unified

**Rule:** Command Center tracks all active work — Jules sessions AND Copilot-initiated sessions — in a single state object.

**State shape:**

```javascript
{
    jules: {
        'story-4-1-task-1': {
            sessionName: 'sessions/abc123',
            state: 'IN_PROGRESS',
            url: 'https://...',
            prUrl: null,
            lastPolledAt: '2026-08-12T12:00:00Z'
        }
    },
    copilot: {
        'story-4-1': {
            sessionId: '9d75df73-...',     // Copilot project session ID
            skill: 'bmad-dev-story',
            state: 'running',
            startedAt: '2026-08-12T11:30:00Z'
        }
    }
}
```

**SSE event types:**
```
event: jules        → Jules session state updates (existing)
event: copilot      → Copilot session state updates (NEW)
event: board        → Board state refresh (NEW — triggered on state change)
```

---

## Invariant 6: Story Template Is Jules-Ready by Default

**Rule:** The BMad story template must include `intent-contract` and `code map` sections.

**Current template gaps:**
- No `intent-contract` block
- No `code map` section
- `Dev Notes` is unstructured — doesn't translate to Jules brief

**Proposed additions to `template.md`:**

```markdown
## Intent Contract

**Problem:** [What problem does this story solve?]

**Approach:** [How will we solve it?]

### Boundaries & Constraints

**Always:**
- [Rules that must be followed]

**Block If:**
- [Conditions that should stop execution]

**Never:**
- [Things that must not be done]

## Code Map

- `path/to/file.py` — NEW/ADD/MODIFY: [what to do]
- `path/to/reference.py` — REFERENCE: [context file]

## Tasks / Subtasks
```

**Customization location:** `_bmad/custom/bmad-create-story.toml` (team override) or via BMad's `customize` skill.

---

## Invariant 7: Observability Builds Trust

**Rule:** Every Commander decision is logged, auditable, and learnable. The system improves by learning from its own mistakes.

**Why:** The Companion project IS an Agentic Organization. Commander can't just be functional — it must BE trustworthy. Trust is earned through transparent behavior, not assumed.

**Logging Schema (every dispatch decision):**

```javascript
{
    timestamp: "2026-08-13T08:30:00Z",
    action: "dispatch",              // dispatch | resolve | review | merge | escalate
    itemId: "story-4-1-task-3",
    decision: "jules",              // jules | copilot | defer | escalate | merge | block
    agent: "jules",                 // jules | bmad-agent-dev | human
    reasoning: "has intent-contract + code map, Jules-ready",
    outcome: null,                  // filled after completion: success | failure | blocked
    confidence: 0.95,               // how confident was the classification
    feedbackResolution: null,       // if feedback occurred: auto_rule | copilot | human | timeout
    prReview: null,                 // if PR created: pass | fail | blocked
    prMerge: null,                  // if PR merged: auto | human | blocked | skipped
    durationMs: null,               // total time from dispatch to outcome
    julesSessionId: "sessions/123",
    copilotSessionId: null,
    prNumber: null,
    branch: "feat/s4-1-sqlite-tests",
    humanOverrides: [],             // track when human changes Commander's decision
}
```

**Trust Dashboard (Command Center UI section):**

```
┌─────────────────────────────────────────────────────────────────────┐
│  Trust Metrics (Last 7 Days)                                        │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  Dispatch Accuracy:     █████████░  92% (23/25 correct)            │
│  Auto-Resolution Rate:  ████████░░  76% (19/25 resolved without human)│
│  PR Review Pass Rate:   ██████████  100% (4/4 passed review)       │
│  Pipeline Success:      █████████░  90% (9/10 green)               │
│  Human Overrides:       3 (12% of decisions)                       │
│  Silent Failures:       0 ✅                                        │
│                                                                     │
│  Recent Learning:                                                   │
│  ⚠️ "Config hot-reload" misclassified as Jules-ready, needed       │
│     Copilot escalation → Rule updated: check for env dependency    │
└─────────────────────────────────────────────────────────────────────┘
```

**Learning Loop:**

```
1. Commander makes decision (dispatch, resolve, review, merge)
2. Decision logged with reasoning and confidence
3. Outcome observed (success, failure, human override)
4. If outcome ≠ expected → flag for rule review
5. Periodic analysis: which decisions had low accuracy?
6. Rules updated to improve accuracy
7. Dashboard shows improvement trend over time
```

**Phase 1 PR Merge Policy:**

- ✅ Automated review via `bmad-agent-dev` — **mandatory**
- ✅ Pipeline status monitoring — **mandatory**
- ⏸️ PR merge — **human approves** (Ameen sits in the loop)
- 📝 Every merge logged with reasoning
- 🔄 After Phase 1 validation → evaluate auto-merge based on trust metrics

**Storage:**
- Log file: `~/.copilot/extensions/command-center/commander-log.jsonl` (one JSON per line)
- Trust metrics: computed on-demand from log
- Retention: 90 days rolling

---

## Component Changes

### 1. Command Center Canvas (`extension.mjs`)

**New functions:**
- `parseDeferredWork(text)` — parses `deferred-work.md`
- `classifyDispatch(story, tasks)` — classifies Jules vs Copilot eligibility
- `buildJulesBrief(state, item)` — generates self-contained Jules prompt
- `mergeAgentState(julesState, copilotState)` — unified state view

**New data flows:**
- `parseBmadBoard()` also reads `deferred-work.md`, injects `deferred` items
- `decorateBoardState()` adds `dispatchClassification` to each story
- SSE events include `copilot` channel

**New canvas actions:**
- `dispatch_to_copilot` — delegate to Copilot with BMad skill
- `poll_copilot_status` — poll Copilot session state
- `set_story_jules_ready` — mark story with intent-contract + code map

### 2. BMad Model Service (`bmad-model.mjs`)

**Enhancements:**
- `parseChecklistTasks()` already handles `Tasks / Subtasks` ✅
- Add `parseDeferredItems()` — extracts deferred work with severity
- Add `classifyStoryJulesReadiness(story)` — structural check

### 3. BMad Story Template (`template.md`)

**Customize via `_bmad/custom/bmad-create-story.toml`:**
- Add `intent-contract` section template
- Add `code map` section template
- Structure `Dev Notes` as Jules-readable context

### 4. Canvas UI

**New dashboard sections:**
- **Active Agents** — table showing Jules + Copilot sessions with status
- **Deferred Work** — filterable list of deferred items by severity
- **Dispatch Queue** — stories/tasks ready for dispatch with classification badges

**Visual indicators:**
- 🟢 Jules-ready story (has intent-contract + code map)
- 🟡 Tasks-ready (tasks have file targets)
- 🔴 Copilot-only (needs BMad skill)
- ⏳ Deferred item with severity color (🔴 critical, 🟡 medium, 🟢 low)

---

## Decision Log

### Core Architecture Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Feedback resolution agent | Always `bmad-agent-dev` | Single agent reduces complexity; dev agent handles all coding decisions |
| Auto-approval threshold | Canvas delegates to Copilot (`bmad-agent-dev`) | Canvas is a UI orchestrator, not a decision engine; Copilot has full context |
| Unresolvable feedback | Defer OR ask user (2-min timeout) | Balance between autonomy and human oversight |
| PR creation | Jules auto-creates OR canvas triggers | Flexibility per dispatch |
| PR review | Command Center triggers Copilot review | Adversarial review before merge |
| PR merge | Command Center auto-merges on green pipelines | Full automation闭环 (closed loop) |
| Branch strategy | feature → develop, develop → main | Standard GitFlow; develop is integration branch |
| Branch deletion | Delete feature branches after merge to develop | Keep repo clean; never delete main/develop |
| Adaptive polling | Per-session intervals by state | Responsiveness + API efficiency |
| Multiple approval UI | Stacked cards in row | Batch approval for throughput |

### Branch Management Decisions (2026-08-13)

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Branch creation | Commander generates names at dispatch | Deterministic, traceable, story-linked |
| GitHub protection | `main` and `develop` PR required + status checks | Hard guardrail, no agent can bypass |
| PR validation | Commander validates target + story refs | Catches violations before merge |
| 1 story = 1+ PRs | Enforced by branch naming + Commander validation | Each branch carries story key |
| BMad customization | Lightweight — story template + dev agent facts | Agents read context before acting |
| Copilot dispatch | Always `bmad-agent-dev` with branch context | Single agent simplifies routing |

### CI/CD Pipeline Decisions (2026-08-13)

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Coverage threshold | Backend 80%, Frontend 80% | Higher quality bar than initial 60% |
| E2E tests | PR checks AND develop pushes | Catch failures early, fix in same PR |
| Linting | Ruff (Python), ESLint (TypeScript) | Real issue detection, not just syntax |
| PR trigger jobs | Lint, test, build (all) | Full validation before merge |
| Push to develop | All PR jobs + E2E tests | Integration branch gets full validation |
| Push to main | All jobs + security audit | Production branch, maximum validation |
| Phase 1 merge | Human approves (Ameen in loop) | Trust building before full automation |
| Legacy Jules workflows | Remove all three | Commander supersedes scheduled/dispatch/fix |

### Quality Philosophy (2026-08-13)

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Implementation pace | **Quality over speed** | Companion project IS about trustworthy AI |
| Test coverage | 80% minimum, both back/front | No blind spots in validation |
| Silent bug detection | Learning loop + trust metrics | System gets stronger over time |
| Human in loop | Phase 1: mandatory, Phase 2+: based on metrics | Trust earned through validation |

---

## What NOT to Change

1. **BMad workflow** — no changes to epic/story creation, sprint planning, or retrospectives
2. **Jules API client** — existing `jules-client.mjs` is sufficient for core operations
3. **Story file format** — additions are additive, existing stories remain valid
4. **Sprint status YAML** — no schema changes needed
5. **main branch** — never auto-deleted, never force-pushed

---

## Trade-offs

| Decision | Alternative | Rationale |
|----------|-------------|-----------|
| `bmad-agent-dev` for all escalations | Dispatch classifier picks agent | Consistency over specialization; dev agent handles 95% of cases |
| Canvas delegates decisions to Copilot | Canvas decides via rules | Rules can't handle nuanced coding decisions; Copilot has full context |
| 2-min user timeout | No timeout / longer timeout | Prevents Jules sessions from stalling indefinitely |
| Stacked approval cards | Sequential approval flow | Batch approvals reduce context switching |
| Auto-merge on green pipelines | Manual merge required | Full automation闭环; pipelines are the quality gate |
| Delete feature branches after merge | Keep all branches | Repo hygiene; main/develop are protected |

---

## Phased Implementation Plan (Quality-First)

**Philosophy: Quality over speed. Each phase delivers production-ready, validated components. No shortcuts.**

### Phase 0: Foundation & Guardrails (Week 1-2)

**Goal: Establish the safety net before building on it.**

- [ ] **GitHub branch protection setup**
  - `main`: PR required, status checks required, 1 reviewer required
  - `develop`: PR required, status checks required, skip approvals for speed
  - Both: Dismiss stale approvals on push
- [ ] **Remove legacy Jules workflows** (`jules-scheduled.yml`, `jules-fix-ci.yml`, `jules-dispatch.yml`)
- [ ] **Update `project-context.md`** with branch management rules
- [ ] **Create BMad customizations**
  - Story template: Add `intent-contract` and `code map` sections
  - Dev agent: Add branch/PR policy persistent facts
- [ ] **Validate setup**
  - Test: Agent creates branch → PR → merge → cleanup
  - Test: Direct push to `main`/`develop` is blocked

### Phase 1: Commander Core & Deferred Work (Week 2-3)

**Goal: Commander can see all work and classify dispatch eligibility.**

- [ ] **Module split** — Extract Commander logic from 125KB `extension.mjs` into `commander.mjs`
- [ ] **Deferred work parser** — `parseDeferredWork()` with severity tagging
- [ ] **Deferred work UI** — Show on board with severity badges
- [ ] **Dispatch classifier** — `classifyDispatch()` Jules vs Copilot eligibility
- [ ] **Jules-ready badges** — Stories/tasks show classification
- [ ] **Validation**
  - Parse existing `deferred-work.md` — all items visible
  - Classify existing stories — Jules-eligible vs Copilot-only accurate
  - No breaking changes to existing Command Center functionality

### Phase 2: Jules Session Lifecycle (Week 3-4)

**Goal: Commander can dispatch to Jules and manage the full session lifecycle.**

- [ ] **Branch naming generator** — `createFeatureBranch()` from story key
- [ ] **Jules brief builder** — Self-contained prompt with intent-contract + code map
- [ ] **Adaptive polling engine** — Per-session intervals by state
- [ ] **Jules session state machine** — Track AWAITING_PLAN_APPROVAL → IN_PROGRESS → terminal
- [ ] **Auto-approval engine** — Approve Jules-ready specs, escalate to Copilot
- [ ] **Validation**
  - Dispatch a Jules-ready story → Jules completes → PR created
  - Branch naming follows `feat/<story-key>-<desc>` format
  - PR targets `develop`, not `main`

### Phase 3: Copilot Integration & Feedback Resolution (Week 4-5)

**Goal: Commander dispatches to Copilot and resolves Jules feedback.**

- [ ] **Copilot dispatch** — Always `bmad-agent-dev` with branch context
- [ ] **Copilot session tracking** — SSE events for Copilot sessions
- [ ] **Feedback resolution engine** — 3-layer: auto-rules → Copilot → User (2-min timeout)
- [ ] **Stacked approval cards UI** — Batch approvals with timer
- [ ] **Multi-agent state tracker** — Unified Jules + Copilot state view
- [ ] **Validation**
  - Dispatch to Copilot → creates branch → completes story
  - Jules feedback resolved via auto-rules without human intervention
  - Stale feedback escalated to user with 2-min timeout

### Phase 4: PR Lifecycle Management (Week 5-6)

**Goal: Commander manages PR creation → review → merge → cleanup.**

- [ ] **PR validation** — Target branch, story refs, naming enforcement
- [ ] **Copilot review** — `bmad-agent-dev` adversarial review of PR diff
- [ ] **Pipeline monitoring** — Poll check runs, status updates to Command Center
- [ ] **Auto-merge logic** — On green pipelines + review pass, human approves (Phase 1)
- [ ] **Branch cleanup** — Delete feature branches after merge to `develop`
- [ ] **Local sync** — `git fetch/pull develop` after merge
- [ ] **Validation**
  - End-to-end: Jules dispatch → PR → review → pipeline → merge → cleanup
  - PR review catches acceptance criteria violations
  - Feature branch deleted, `develop` pulled locally

### Phase 5: Trust & Observability (Week 6-7)

**Goal: Commander decisions are logged, auditable, and learnable.**

- [ ] **JSONL logging** — Every dispatch, resolution, review, merge decision with reasoning
- [ ] **Trust dashboard** — Metrics in Command Center UI
  - Dispatch accuracy rate
  - Auto-resolution rate
  - PR review pass rate
  - Pipeline success rate
  - Human override rate
  - Silent failure detection
- [ ] **Learning loop** — Flag mismatches → update rules → show improvement trend
- [ ] **CI pipeline redesign**
  - E2E tests added to PR checks AND develop pushes
  - Ruff for Python linting
  - ESLint for TypeScript linting
  - Frontend coverage flag enabled (80% threshold)
  - Backend coverage increased to 80%
- [ ] **Validation**
  - Trust dashboard shows real metrics from Commander decisions
  - Learning loop improves dispatch accuracy over time
  - CI pipeline catches real issues that weren't caught before

### Phase 6: Polish & Optimization (Week 7-8)

**Goal: Commander is production-ready with all edge cases handled.**

- [ ] **Quota management** — Track 100 Jules sessions/day, priority dispatch at 80%+
- [ ] **Story template finalization** — Validate with multiple story creations
- [ ] **Edge case handling**
  - Cross-branch conflicts
  - Jules session failures
  - Copilot escalation loops
  - Pipeline flakiness
- [ ] **Performance optimization**
  - Reduce extension.mjs size (commander.mjs split validated)
  - Optimize polling intervals
  - Reduce token usage in Copilot dispatches
- [ ] **Documentation**
  - Commander architecture final doc
  - User guide for Command Center + Commander
  - BMad customization reference
- [ ] **Validation**
  - Full end-to-end test with multiple concurrent sessions
  - Jules quota management works at 80%+ utilization
  - Edge cases handled gracefully without data loss

---

## Risks & Mitigations

| Risk | Mitigation |
|------|-----------|
| Jules sessions fail due to insufficient context | Brief template includes project-context.md rules + story spec |
| Deferred work parsing is fragile | Start with conservative regex; add tests for each pattern |
| Copilot session tracking adds latency | Poll asynchronously; don't block board rendering |
| Existing stories lack intent-contract | Classification gracefully falls back to task-level dispatch |
| Copilot escalations consume sessions | 2-min timeout; defer if unresolved; quota-aware dispatch |
| Auto-merge merges broken code | Pipeline status is the gate; Copilot review precedes merge decision |
| Branch conflicts on develop | Feature branches merged one-at-a-time; pulls after each merge |
