# Command Center Orchestrator — Architecture Spine

**Project:** Companion  
**Author:** Winston (System Architect)  
**Date:** 2026-08-12  
**Status:** Proposed  

---

## Problem Statement

After completing Epics 0-7, the Companion project has:
- A working Command Center canvas with BMad board parsing and Jules dispatch
- 100 Jules sessions/day quota available for autonomous coding
- ~40+ deferred work items in `deferred-work.md` that need closure
- BMad story templates that vary in Jules-readiness

**Gap:** The Command Center cannot intelligently decide *what* to dispatch to Jules vs Copilot, cannot track Copilot-initiated sessions, and doesn't surface deferred work as actionable board items.

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
    subgraph CommandCenter["Command Center Canvas (Orchestrator)"]
        BM["BMad Work Model Parser"]
        DW["Deferred Work Parser"]
        DS["Dispatch Classifier"]
        MS["Multi-Agent State Tracker"]
        UI["Dashboard UI"]
    end

    subgraph BMadArtifacts["BMad Artifacts (Files)"]
        EP["epics.md"]
        ST["story spec files"]
        SP["sprint-status.yaml"]
        DF["deferred-work.md"]
        PC["project-context.md"]
    end

    subgraph Copilot["GitHub Copilot App"]
        SK["BMad Skills Agent"]
        CS["Story Dev / Code Review / Retro"]
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
    PC --> DS

    BM --> DS
    DW --> DS
    DS --> SK
    DS --> J1
    DS --> J2
    DS --> J3

    SK --> MS
    J1 --> MS
    J2 --> MS
    J3 --> MS
    MS --> UI

    classDef orchestrator fill:#2563eb,color:#fff
    classDef artifact fill:#15803d,color:#fff
    classDef agent fill:#b45309,color:#fff
    class CommandCenter orchestrator
    class BMadArtifacts artifact
    class Copilot agent, JulesCloud agent
```

---

## Invariant 1: BMad Hierarchy Is Immutable

**Rule:** The work hierarchy is always Epic → Story → Task → Subtask. No new levels. No renaming.

**Why:** Jules sessions receive their position in the hierarchy as context. If the hierarchy changes, all dispatch prompts break.

**Enforcement:** `parseBmadBoard()` in `extension.mjs` is the canonical parser. All other views derive from its output.

---

## Invariant 2: Dispatch Classification Is Deterministic

**Rule:** Each story/task is classified at parse time using structural heuristics — no LLM judgment needed.

| Criterion | Jules-Eligible | Copilot-Only |
|-----------|---------------|--------------|
| Has `intent-contract` block | ✅ | |
| Has `code map` section | ✅ | |
| Has `Tasks & Acceptance` or `Tasks / Subtasks` | ✅ | |
| Needs `bmad-*` skill execution | | ✅ |
| Is story creation, code review, retro, sprint planning | | ✅ |
| Is deferred debt with clear file/line target | ✅ | |
| Requires cross-file architectural decision | | ✅ |

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

## What NOT to Change

1. **BMad workflow** — no changes to epic/story creation, sprint planning, or retrospectives
2. **Jules API client** — existing `jules-client.mjs` is sufficient
3. **Story file format** — additions are additive, existing stories remain valid
4. **Sprint status YAML** — no schema changes needed

---

## Trade-offs

| Decision | Alternative | Rationale |
|----------|-------------|-----------|
| Deferred items as `deferred` kind | Inline as story children | Separation of concerns — deferred work spans stories, needs independent tracking |
| Structural Jules-readiness check | LLM-based judgment | Deterministic, auditable, no token cost |
| Brief template in canvas code | Separate brief template file | Co-located with dispatch logic; brief generation is mechanical |
| Copilot sessions tracked in canvas | Separate Copilot dashboard | Single pane of glass is the point of Command Center |

---

## Phased Implementation Plan

### Phase 1: Deferred Work Visibility
- Parse `deferred-work.md` into work items
- Inject into board state
- Show in UI with severity badges

### Phase 2: Dispatch Classification
- Implement `classifyDispatch()` logic
- Add Jules-ready badges to stories
- Enhance Jules brief with intent-contract + code map extraction

### Phase 3: Multi-Agent State
- Add Copilot session tracking
- Unified SSE events
- Active agents dashboard

### Phase 4: Story Template Customization
- Customize BMad story template
- Add intent-contract + code map sections
- Validate with new story creation

---

## Risks & Mitigations

| Risk | Mitigation |
|------|-----------|
| Jules sessions fail due to insufficient context | Brief template includes project-context.md rules + story spec |
| Deferred work parsing is fragile | Start with conservative regex; add tests for each pattern |
| Copilot session tracking adds latency | Poll asynchronously; don't block board rendering |
| Existing stories lack intent-contract | Classification gracefully falls back to task-level dispatch |
