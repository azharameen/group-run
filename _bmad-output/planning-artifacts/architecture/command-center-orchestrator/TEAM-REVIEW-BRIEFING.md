# Command Center + Commander — Team Review Briefing

**Project:** Companion  
**Date:** 2026-08-13  
**Prepared by:** Winston (System Architect)  
**Status:** Ready for Team Review  

---

## Quick Reference

| Component | What It Is | What It Does |
|-----------|-----------|--------------|
| **Command Center** | Canvas (UI surface) | Dashboard showing all work, agents, PRs, approvals |
| **Commander** | Orchestrator agent (brain) | Parses, classifies, dispatches, resolves, monitors |
| **Jules** | Cloud coding sessions | Executes pure coding tasks (100/day quota) |
| **bmad-agent-dev** | Copilot agent | Handles BMad skills, escalations, PR reviews |

---

## Problem We're Solving

After completing all 8 epics, we have:
- A working Command Center canvas (basic Jules dispatch)
- 100 Jules sessions/day sitting largely unused
- ~40 deferred work items scattered across the codebase
- No way to see which agent is working on what story
- No automation from session start → PR → merge → cleanup

---

## What Commander Does (The Brain)

```
┌─────────────────────────────────────────────────────────────────────────────────────┐
│                              Commander Capabilities                                 │
├──────────────────┬──────────────────────────────────────────────────────────────────┤
│ Capability       │ What It Does                                                     │
├──────────────────┼──────────────────────────────────────────────────────────────────┤
│ Parse            │ Reads BMad artifacts (epics, stories, deferred work, sprint)     │
│ Classify         │ Decides Jules vs Copilot for each task (structural heuristics)   │
│ Dispatch         │ Creates Jules sessions with self-contained briefs                │
│                  │ Creates Copilot sessions for BMad-skill work                     │
│ Monitor          │ Adaptive polling — 5s for urgent states, 30s for coding         │
│ Resolve          │ 3-layer feedback resolution (rules → Copilot → user)             │
│ Review           │ Triggers PR reviews via bmad-agent-dev                           │
│ Manage PRs       │ Monitors pipelines, auto-merges on green, cleans up branches     │
│ Track Quota      │ Tracks 100 sessions/day, priority dispatch when low              │
└──────────────────┴──────────────────────────────────────────────────────────────────┘
```

---

## What Command Center Shows (The UI)

```
┌───────────────────────────────────────────────────────────────────────────────────┐
│                        Companion Command Center                                    │
├───────────────────────────────────────────────────────────────────────────────────┤
│                                                                                   │
│  ┌─────────────────────────────────────────────────────────────────────────────┐  │
│  │  BMad Board (Epics → Stories → Tasks → Subtasks)                           │  │
│  │  ┌──────────────┬──────────────┬──────────────┬──────────────────────────┐  │  │
│  │  │ Epic 4       │ 🟢 Jules-ready│ 8/10 tasks  │ All stories done         │  │  │
│  │  ├──────────────┼──────────────┼──────────────┼──────────────────────────┤  │  │
│  │  │ Epic 7       │ 🟡 Tasks-ready│ 6/8 tasks   │ 2 tasks in progress      │  │  │
│  │  └──────────────┴──────────────┴──────────────┴──────────────────────────┘  │  │
│  └─────────────────────────────────────────────────────────────────────────────┘  │
│                                                                                   │
│  ┌─────────────────────────────────────────────────────────────────────────────┐  │
│  │  Live Agent Status                                                          │  │
│  │  ┌──────────────┬──────────────┬──────────────┬──────────────────────────┐  │  │
│  │  │ Item         │ Agent        │ State        │ Progress                 │  │  │
│  │  ├──────────────┼──────────────┼──────────────┼──────────────────────────┤  │  │
│  │  │ S4.1/T3      │ Jules        │ 🟠 In Progress│ Implementing SQLite     │  │  │
│  │  │ S4.1/T5      │ Jules+Copilot│ 💬 Escalated  │ Copilot resolving       │  │  │
│  │  │ DEBT-001     │ Copilot      │ 🟠 Running     │ Creating story spec     │  │  │
│  │  └──────────────┴──────────────┴──────────────┴──────────────────────────┘  │  │
│  └─────────────────────────────────────────────────────────────────────────────┘  │
│                                                                                   │
│  ┌─────────────────────────────────────────────────────────────────────────────┐  │
│  │  PR Status                                                                  │  │
│  │  ┌──────────────┬──────────────┬──────────────┬──────────────────────────┐  │  │
│  │  │ PR #42       │ ✅ Review pass│ 🟠 Pipeline  │ Auto-merge on green      │  │  │
│  │  │ PR #41       │ ✅ Merged     │ ✅ Green     │ Branch deleted           │  │  │
│  │  └──────────────┴──────────────┴──────────────┴──────────────────────────┘  │  │
│  └─────────────────────────────────────────────────────────────────────────────┘  │
│                                                                                   │
│  ┌─────────────────────────────────────────────────────────────────────────────┐  │
│  │  Deferred Work (by severity)                                                │  │
│  │  🔴 3 critical  🟡 8 medium  🟢 29 low                                     │  │
│  │  ┌────────────────────────────────────────────────────────────────────────┐ │  │
│  │  │ 🔴 SQLite concurrency risk    │ EP-07  │ ⚡ Dispatchable to Jules     │ │  │
│  │  │ 🟡 Config hot-reload gap      │ EP-05  │ ⚡ Dispatchable to Jules     │ │  │
│  │  │ 🟢 Logging format inconsistency │ EP-03 │ ⚡ Dispatchable to Jules   │ │  │
│  │  └────────────────────────────────────────────────────────────────────────┘ │  │
│  └─────────────────────────────────────────────────────────────────────────────┘  │
│                                                                                   │
│  ┌─────────────────────────────────────────────────────────────────────────────┐  │
│  │  Jules Quota: ████████████████████████░░  87/100  (13 remaining)           │  │
│  └─────────────────────────────────────────────────────────────────────────────┘  │
│                                                                                   │
└───────────────────────────────────────────────────────────────────────────────────┘
```

---

## Key Design Decisions (Up for Discussion)

### Decision 1: Always `bmad-agent-dev` for Copilot Escalations

**Decision:** All Copilot dispatches use `bmad-agent-dev`, regardless of task type.

**Pros:**
- Simplicity — single agent type, no routing logic
- Consistency — same behavior everywhere
- Dev agent handles 95% of cases

**Cons:**
- Could use `bmad-agent-architect` for architecture decisions
- Could use `bmad-agent-tech-writer` for documentation

**Alternative:** Use dispatch classifier to pick agent type

**Your call?** ✅ Approve | ⚠️ Modify | ❌ Reject

---

### Decision 2: 3-Layer Feedback Resolution

```
Auto-Rules (instant) → bmad-agent-dev (Copilot) → User (2-min timeout)
```

**Decision:** Commander tries auto-rules first, escalates to Copilot if rules fail, escalates to user if Copilot can't decide.

**Pros:**
- 60-70% resolved instantly (zero token cost)
- 25-35% resolved by Copilot (full context)
- 5-10% escalated to user (safety net)

**Cons:**
- Copilot escalations consume time
- 2-min timeout may be too short/long

**Alternative:** Skip auto-rules, go straight to Copilot

**Your call?** ✅ Approve | ⚠️ Modify | ❌ Reject

---

### Decision 3: 2-Minute Approval Timeout

**Decision:** Pending approvals auto-resolve after 2 minutes:
- Plan approvals → auto-approve (defer to Jules)
- Feedback → auto-defer (Jules continues best-effort)
- PR merges → **NEVER** auto-merge (kept open)

**Pros:**
- Prevents Jules sessions from stalling
- User can act within the window
- PR safety (no auto-merge on timeout)

**Cons:**
- 2 minutes may feel rushed
- Auto-approve may skip important reviews

**Alternative:** 5-minute timeout, or no timeout at all

**Your call?** ✅ Approve | ⚠️ Modify | ❌ Reject

---

### Decision 4: Auto-Merge on Green Pipelines

**Decision:** Commander auto-merges PRs when:
- Copilot review passes (bmad-agent-dev)
- All CI pipelines green
- Target branch is `develop`

**Pros:**
- Full automation闭环 (closed loop)
- No manual merge overhead
- Pipelines are the quality gate

**Cons:**
- Auto-merge could land broken code if pipelines are weak
- No human review of final PR

**Alternative:** Require manual merge approval always

**Your call?** ✅ Approve | ⚠️ Modify | ❌ Reject

---

### Decision 5: Branch Cleanup Strategy

**Decision:**
- Feature branches → deleted after merge to `develop`
- `develop` → NEVER auto-deleted
- `main` → NEVER auto-deleted

**Pros:**
- Repo stays clean
- Standard GitFlow convention
- Protected branches stay intact

**Cons:**
- Can't replay feature branch history after merge
- Accidental deletion risk (mitigated by allowlist)

**Alternative:** Keep feature branches, or require manual deletion

**Your call?** ✅ Approve | ⚠️ Modify | ❌ Reject

---

### Decision 6: Stacked Approval Cards

**Decision:** Multiple pending approvals shown as stacked cards in a row, each with:
- Type (plan, feedback, PR merge)
- Context (story, task, Jules message)
- Actions (approve/defer/reject)
- Countdown timer

**Pros:**
- Batch approvals reduce context switching
- Visual priority (severity colors)
- Timers create urgency

**Cons:**
- Could be overwhelming with many approvals
- Card-based UI may not fit all scenarios

**Alternative:** Sequential approval flow, or modal dialogs

**Your call?** ✅ Approve | ⚠️ Modify | ❌ Reject

---

## Architecture Documents Available for Review

| Document | Focus | Location |
|----------|-------|----------|
| **Architecture Spine** | 6 invariants, dispatch rules, trade-offs | `ARCHITECTURE-SPINE.md` |
| **Session Lifecycle** | Jules state machine, feedback resolution | `JULES-SESSION-LIFECYCLE.md` |
| **PR Lifecycle** | PR creation → review → merge → cleanup | `PR-LIFECYCLE.md` |
| **This Briefing** | Team review summary | `TEAM-REVIEW-BRIEFING.md` |

---

## Review Questions by Role

### For John (Product Manager)
1. Does the user journey match the product vision?
2. Are there any user-facing behaviors that feel wrong?
3. Is the 100-session quota management aligned with business needs?

### For Mary (Business Analyst)
1. Are all requirements from the deferred work addressed?
2. Are there any edge cases in the dispatch rules?
3. Does the approval flow match real-world workflows?

### For Winston (Architect)
1. Are the 6 invariants sufficient?
2. Is the separation of concerns clean (Command Center UI vs Commander logic)?
3. Are there any security risks in the automation?

### For Sally (UX Designer)
1. Is the Command Center dashboard layout intuitive?
2. Do the stacked approval cards feel right?
3. Are the severity colors and icons clear?

### For Amelia (Developer)
1. Is the implementation phased correctly?
2. Are the canvas action APIs well-designed?
3. Are there any technical blockers?

### For Paige (Tech Writer)
1. Is the nomenclature clear (Command Center vs Commander)?
2. Are the documentation artifacts sufficient?
3. Is the story template Jules-ready for non-expert users?

### For Murat (Test Architect)
1. Are the test boundaries clear (unit, integration, e2e)?
2. Can we mock Jules sessions for testing?
3. Are the pipeline checks sufficient?

---

## Implementation Timeline (After Approval)

| Phase | Scope | Duration | Can Start |
|-------|-------|----------|-----------|
| 1. Deferred work visibility | Parse + display | 1 day | Immediately |
| 2. Dispatch classification | Badges + rules | 1 day | After Phase 1 |
| 3. Adaptive polling | Intervals + SSE | 1 day | After Phase 1 |
| 4. Feedback resolution | 3-layer chain | 2 days | After Phase 2+3 |
| 5. PR lifecycle | Review → merge | 2 days | After Phase 4 |
| 6. Story template | Jules-ready template | 0.5 day | Anytime |

**Total: ~7.5 days (some phases can parallelize)**

---

## How to Provide Feedback

### Option 1: Party Mode Discussion
- We can activate party mode and discuss each decision
- Each persona can chime in with their perspective

### Option 2: Written Comments
- Add comments directly to the architecture documents
- Use `<!-- REVIEW: [comment] -->` for inline feedback

### Option 3: Decision-by-Decision Vote
- Go through each decision above
- Vote: Approve / Modify / Reject
- If Modify, specify the change

---

## Next Steps After Review

1. Collect all feedback
2. Address concerns / update architecture
3. Create Epics and Stories for implementation phases
4. Begin Phase 1 implementation

---

**Team, the floor is yours. What are your thoughts?**

