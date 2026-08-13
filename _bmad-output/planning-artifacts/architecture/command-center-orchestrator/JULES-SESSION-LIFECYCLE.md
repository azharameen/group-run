# Jules Session Lifecycle Management

## State Machine

```
                    ┌─────────────────────────────────────────────────────┐
                    │                  Session Lifecycle                   │
                    └─────────────────────────────────────────────────────┘

┌──────────┐    ┌──────────┐    ┌──────────────────────┐    ┌──────────────────┐
│  QUEUED  │───▶│ PLANNING │───▶│ AWAITING_PLAN_APPROVAL│───▶│   IN_PROGRESS    │
└──────────┘    └──────────┘    └──────────────────────┘    └──────────────────┘
                                                    │                    │
                                                    │                    ▼
                                                    │            ┌──────────────────┐
                                                    │            │ AWAITING_USER    │
                                                    │            │    FEEDBACK      │
                                                    │            └──────────────────┘
                                                    │                    │
                                                    ▼                    ▼
                                             ┌──────────┐         ┌──────────┐
                                             │COMPLETED │         │  PAUSED   │
                                             └──────────┘         └──────────┘
                                                    │
                                             ┌──────────┐
                                             │  FAILED   │
                                             └──────────┘
```

---

## Orchestrator Decision Matrix

| Jules State | Action | Decision Logic |
|-------------|--------|----------------|
| `QUEUED` | Monitor | Auto-advance, no action needed |
| `PLANNING` | Monitor | Auto-advance, no action needed |
| `AWAITING_PLAN_APPROVAL` | **Auto-approve** OR **Escalate** | If task is Jules-ready (has intent-contract), auto-approve. Otherwise escalate to Command Center for human review |
| `IN_PROGRESS` | Monitor | Poll every 30s, update SSE |
| `AWAITING_USER_FEEDBACK` | **Decision Engine** | See feedback resolution matrix below |
| `PAUSED` | **Escalate** | Notify Copilot orchestrator session |
| `COMPLETED` | **Close & Verify** | Extract PR, update board, check deferred items |
| `FAILED` | **Triage** | Analyze error, classify as retryable or blocking |

---

## Feedback Resolution Matrix

When Jules enters `AWAITING_USER_FEEDBACK`, the orchestrator decides:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│              AWAITING_USER_FEEDBACK Resolution Flow                         │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  1. Extract Jules' feedback message (lastMessage)                           │
│                                                                             │
│  2. Classify feedback type:                                                 │
│    ┌────────────────────┬──────────────────────────────────────────────┐    │
│    │ Type               │ Resolution Strategy                          │    │
│    ├────────────────────┼──────────────────────────────────────────────┤    │
│    │ Missing file       │ Read file locally, send to Jules via         │    │
│    │                    │ sendMessage() with content                    │    │
│    │ Ambiguous spec     │ Re-read story spec, extract clarification,   │    │
│    │                    │ send to Jules                                 │    │
│    │ Technical decision │ Check project-context.md rules,              │    │
│    │                    │ send decision to Jules                        │    │
│    │ Error in code      │ Read error, attempt fix, send correction     │    │
│    │ Out of scope       │ Confirm boundary, send scope clarification   │    │
│    │ CRITICAL ambiguity │ ESCALATE to Copilot orchestrator             │    │
│    └────────────────────┴──────────────────────────────────────────────┘    │
│                                                                             │
│  3. If auto-resolution succeeds → Jules returns to IN_PROGRESS              │
│                                                                             │
│  4. If auto-resolution fails → escalate to Copilot orchestrator session     │
│                                                                             │
│  5. If escalation needed → create Copilot session with:                     │
│    - Jules session URL                                                      │
│    - Jules' feedback message                                                │
│    - Story context                                                          │
│    - Requested action: "Resolve Jules feedback"                             │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Feedback Resolution Engine Design

### Architecture

```
┌─────────────────────────────────────────────────────────────────────────────────────┐
│                   Feedback Resolution Engine (Decision Chain)                        │
├─────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                     │
│  Input:  { julesSessionId, feedbackMessage, storySpec, projectContext }              │
│  Output: { resolved: boolean, resolvedBy: string }                                   │
│                                                                                     │
│  Decision Chain (in order):                                                          │
│                                                                                     │
│  ┌──────────────────┐    ┌──────────────────┐    ┌──────────────────┐              │
│  │ 1. Auto-Rules    │───▶│ 2. Copilot Agent  │───▶│ 3. User Approval │              │
│  │ (instant)        │    │ (bmad-agent-dev)  │    │ (2-min timeout)  │              │
│  │                  │    │                  │    │                  │              │
│  │ - File content   │    │ - Analyzes       │    │ - Stacked cards  │              │
│  │ - Spec lookup    │    │   feedback       │    │ - Approve/Defer  │              │
│  │ - Project rules  │    │ - Generates      │    │   /Reject        │              │
│  │ - Error fixes    │    │   resolution     │    │ - Timeout →      │              │
│  └──────────────────┘    └──────────────────┘    │   defer + continue│              │
│           │                        │             └──────────────────┘              │
│           ▼                        ▼                        │                       │
│      Resolved ✅          Resolved ✅               Resolved ✅                    │
│                                                                                     │
│  Note: Copilot escalation ALWAYS uses bmad-agent-dev                                 │
│                                                                                     │
└─────────────────────────────────────────────────────────────────────────────────────┘
```

### Implementation Approach

**Layer 1: Auto-Rules (Instant, No Token Cost)**

```javascript
// Pseudocode for extension.mjs — auto-resolution rules

async function tryAutoResolve(julesSessionName, feedbackMessage, storyItem) {
    const question = extractQuestion(feedbackMessage);

    // Rule 1: Missing file content
    if (isMissingFileQuestion(question)) {
        const filePath = extractFilePath(question);
        const content = await readLocalFile(filePath);
        if (content) {
            await jules.sendMessage(julesSessionName, 
                `Here's the content of ${filePath}:\n\`\`\`\n${content}\n\`\`\``);
            return { resolved: true, resolvedBy: "auto_rule", method: "file_content" };
        }
    }

    // Rule 2: Spec clarification
    if (isSpecClarification(question)) {
        const clarification = extractFromSpec(storyItem, question);
        if (clarification) {
            await jules.sendMessage(julesSessionName, clarification);
            return { resolved: true, resolvedBy: "auto_rule", method: "spec_clarification" };
        }
    }

    // Rule 3: Technical decision from project-context.md
    if (isTechnicalDecision(question)) {
        const rule = findRuleInProjectContext(question);
        if (rule) {
            await jules.sendMessage(julesSessionName, `Per project rules: ${rule}`);
            return { resolved: true, resolvedBy: "auto_rule", method: "project_rule" };
        }
    }

    // Rule 4: Error recovery
    if (isErrorRecovery(question)) {
        const fix = generateFix(question, storyItem);
        if (fix) {
            await jules.sendMessage(julesSessionName, fix);
            return { resolved: true, resolvedBy: "auto_rule", method: "error_fix" };
        }
    }

    return { resolved: false };
}
```

**Layer 2: Copilot Agent Decision (bmad-agent-dev)**

```
When auto-rules can't resolve:

1. Package: { jules_feedback, story_spec, project_context }
2. Create Copilot session with bmad-agent-dev:
   "Jules session [ID] is blocked with feedback: [message].
    Here's the story spec and project context. Decide:
    a) What response should Jules receive?
    b) Or should this be deferred (Jules continues best-effort)?
    c) Or does this require human input?"
3. Parse Copilot's decision
4. If Copilot provides resolution → send to Jules via sendMessage()
5. If Copilot says human needed → escalate to Layer 3 (user approval)

Note: Always uses bmad-agent-dev regardless of task type.
```

**Layer 3: User Approval with 2-Minute Timeout**

```
When Copilot can't decide:

1. Show approval card in Command Center:
   - Jules session URL
   - Jules' feedback message
   - Copilot's analysis (why it couldn't decide)
   - Actions: Reply / Defer (continue) / Block

2. Start 2-minute countdown timer

3. If user acts within 2 min:
   - Reply → send user message to Jules
   - Defer → tell Jules to continue best-effort
   - Block → pause Jules session

4. If 2 min expires (no user action):
   - Default: DEFER — tell Jules to continue best-effort
   - Log: "Auto-deferred due to timeout — Jules continuing"
   - Jules session resumes

5. Multiple pending approvals → stacked cards in row
```

---

## Polling Strategy Optimization

### Current: Fixed 30-Second Interval

```
Pro: Simple, predictable
Con: Wastes API calls on idle sessions, slow on urgent changes
```

### Proposed: Adaptive Polling

```javascript
// Polling intervals by state
const POLL_INTERVALS = {
    QUEUED:                    30000,  // 30s — waiting for Jules to start
    PLANNING:                  15000,  // 15s — planning moves fast
    AWAITING_PLAN_APPROVAL:    5000,   // 5s  — needs quick response
    AWAITING_USER_FEEDBACK:    5000,   // 5s  — needs quick resolution
    IN_PROGRESS:               30000,  // 30s — coding takes time
    PAUSED:                    60000,  // 60s — low priority, waiting for human
    COMPLETED:                 null,   // stop polling
    FAILED:                    null,   // stop polling
};
```

### Per-Session Polling (Not Batch)

**Current:** All sessions polled together every 30s.

**Proposed:** Each session has its own interval based on state.

```javascript
class JulesSessionManager {
    constructor() {
        this.sessions = new Map(); // sessionId → { config, timers }
    }

    addSession(sessionId, initialState) {
        const interval = POLL_INTERVALS[initialState] || 30000;
        const timer = setInterval(() => this.pollAndAct(sessionId), interval);
        this.sessions.set(sessionId, { timer, interval, state: initialState });
        
        // Start first poll immediately
        this.pollAndAct(sessionId);
    }

    async pollAndAct(sessionId) {
        const oldState = this.sessions.get(sessionId).state;
        const summary = await jules.getSessionSummary(sessionId);
        const newState = summary.state;

        // State changed? Adjust polling
        if (newState !== oldState) {
            this.updatePolling(sessionId, newState);
        }

        // Terminal state?
        if (isTerminal(newState)) {
            this.handleTerminalState(sessionId, newState, summary);
            return;
        }

        // Needs action?
        if (newState === 'AWAITING_PLAN_APPROVAL') {
            await this.handlePlanApproval(sessionId, summary);
        } else if (newState === 'AWAITING_USER_FEEDBACK') {
            await this.handleFeedback(sessionId, summary);
        }

        // Emit SSE event
        this.emitStateChange(sessionId, newState, summary);
    }

    updatePolling(sessionId, newState) {
        const session = this.sessions.get(sessionId);
        clearInterval(session.timer);
        
        const newInterval = POLL_INTERVALS[newState];
        if (!newInterval) {
            // Terminal — stop polling
            this.sessions.delete(sessionId);
            return;
        }
        
        session.timer = setInterval(() => this.pollAndAct(sessionId), newInterval);
        session.interval = newInterval;
        session.state = newState;
    }

    handleTerminalState(sessionId, state, summary) {
        clearInterval(this.sessions.get(sessionId).timer);
        this.sessions.delete(sessionId);
        
        if (state === 'COMPLETED') {
            // Extract PR, update board, notify
            this.notifyCompletion(sessionId, summary);
        } else if (state === 'FAILED') {
            // Triage failure
            this.triageFailure(sessionId, summary);
        }
    }

    async handlePlanApproval(sessionId, summary) {
        // Auto-approve if Jules-ready (has intent-contract)
        const storyItem = this.findStoryForSession(sessionId);
        const isJulesReady = storyItem?.hasIntentContract && storyItem?.hasCodeMap;
        
        if (isJulesReady) {
            // Auto-approve
            await jules.approvePlan(sessionId, summary.planId);
            this.log(`Auto-approved plan for ${sessionId} (Jules-ready spec)`);
        } else {
            // Escalate — needs human review
            this.emitEscalation(sessionId, 'plan_approval_needed', summary);
        }
    }

    async handleFeedback(sessionId, summary) {
        const storyItem = this.findStoryForSession(sessionId);
        const resolution = await resolveJulesFeedback(
            sessionId,
            summary.lastMessage,
            storyItem
        );

        if (resolution.resolved) {
            this.log(`Auto-resolved feedback: ${resolution.method}`);
        } else if (resolution.escalated) {
            // Trigger Copilot session
            await this.escalateToCopilot(sessionId, summary, storyItem);
        }
    }

    async escalateToCopilot(julesSessionId, julesSummary, storyItem) {
        // This is where the orchestrator creates a Copilot session
        // to handle the Jules feedback that auto-resolution couldn't solve
        const escalationBrief = `
## Jules Session Escalation

**Jules Session:** ${julesSessionId}
**Jules URL:** ${julesSummary.url}
**Feedback:** ${julesSummary.lastMessage}
**Story:** ${storyItem?.title}
**Task:** ${storyItem?.taskId}

**Action Required:** Resolve Jules feedback and send response via sendMessage()

**Context:**
- Story spec: ${storyItem?.sourcePath}
- Project context: ${projectContext}
        `;

        // Create Copilot session with bmad-agent-dev to handle escalation
        // This runs as a separate session that can use BMad skills if needed
        const copilotSession = await createCopilotSession({
            prompt: escalationBrief,
            agent: 'bmad-agent-dev',
            mode: 'autopilot',
        });

        // Track in Command Center
        this.trackCopilotSession(julesSessionId, copilotSession);
        
        return { copilotSessionId: copilotSession.id };
    }
}
```

---

## Multi-Agent State Tracking

### Unified Session State

```javascript
// Command Center tracks both Jules and Copilot sessions
const orchestratorState = {
    // Jules sessions
    jules: {
        [itemId]: {
            sessionName: "sessions/123",
            state: "IN_PROGRESS",
            url: "https://jules.ai/...",
            prUrl: null,
            startedAt: "...",
            lastMessage: "Implementing SQLite migration...",
            pollingInterval: 30000,
            linkedCopilot: null,  // Copilot session handling escalations
        }
    },

    // Copilot sessions (for escalations, skill-required tasks)
    copilot: {
        [itemId]: {
            sessionId: "abc-123",
            state: "running",
            branch: "fix/sqlite-concurrency",
            prUrl: null,
            startedAt: "...",
            lastMessage: "Analyzing deferred debt...",
            linkedJules: null,     // Original Jules session that escalated
            reason: "escalation",  // "escalation" | "skill_required"
        }
    },

    // Deferred work items
    deferred: {
        [itemId]: {
            severity: "critical",
            source: "EP-05",
            summary: "SQLite concurrency risk",
            dispatchable: true,    // Can this be dispatched to Jules?
            targetAgent: "jules",  // "jules" | "copilot"
        }
    }
};
```

### Command Center Dashboard View

```
┌─────────────────────────────────────────────────────────────────────┐
│                        LIVE AGENT STATUS                            │
├──────────────┬──────────────┬──────────────┬───────────────────────┤
│ Item         │ Agent        │ State        │ Progress              │
├──────────────┼──────────────┼──────────────┼───────────────────────┤
│ S4.1/T3      │ Jules        │ 🟠 In Progress│ Implementing SQLite   │
│              │              │              │ migration (85%)       │
│              │              │              │ PR: pending           │
├──────────────┼──────────────┼──────────────┼───────────────────────┤
│ S4.1/T5      │ Jules        │ 💬 Feedback    │ Waiting for response  │
│              │ +Copilot     │ ⏸️ Escalated   │ Copilot resolving     │
│              │              │              │ technical decision    │
├──────────────┼──────────────┼──────────────┼───────────────────────┤
│ S7.1/T2      │ Jules        │ ✅ Completed   │ PR: #42 (merged)     │
├──────────────┼──────────────┼──────────────┼───────────────────────┤
│ DEBT-001     │ Copilot      │ 🟠 Running     │ Creating story spec   │
│ (critical)   │              │              │ for auth migration    │
├──────────────┼──────────────┼──────────────┼───────────────────────┤
│ S4.1/T4      │ Jules        │ ⏸️ Plan Ready  │ Auto-approving...     │
└──────────────┴──────────────┴──────────────┴───────────────────────┘
```

---

## Implementation Phases

### Phase 1: Enhanced Polling (Week 1)
- [ ] Per-session adaptive polling intervals
- [ ] State change detection and SSE events
- [ ] Completion/failure notifications
- [ ] Board state updates on terminal states

### Phase 2: Auto-Plan-Approval (Week 1)
- [ ] Jules readiness detection (intent-contract + code map)
- [ ] Auto-approve when Jules-ready
- [ ] Escalate to UI when not Jules-ready

### Phase 3: Feedback Auto-Resolution (Week 2)
- [ ] Rule-based classifier (4 rules)
- [ ] `sendMessage()` integration for auto-responses
- [ ] Escalation logging

### Phase 4: Copilot Escalation (Week 2)
- [ ] `createCopilotSession()` for escalations
- [ ] Multi-agent state tracking
- [ ] Copilot session polling

### Phase 5: LLM-Assisted Resolution (Week 3)
- [ ] LLM classifier for feedback types
- [ ] Context-aware response generation
- [ ] Confidence thresholds for auto vs escalate

---

## API Surface Changes

### New Canvas Actions

```javascript
{
    name: "resolve_jules_feedback",
    description: "Attempt to auto-resolve Jules feedback using story spec and project context.",
    inputSchema: {
        properties: {
            itemId: { type: "string" },
            resolutionMethod: { 
                type: "string", 
                enum: ["auto", "manual", "copilot_escalation"] 
            }
        }
    }
},
{
    name: "dispatch_to_copilot",
    description: "Dispatch a task to a Copilot session (for BMad skill-required work).",
    inputSchema: {
        properties: {
            itemId: { type: "string" },
            agent: { type: "string", enum: ["bmad-agent-dev", "bmad-agent-architect"] },
            prompt: { type: "string" }
        }
    }
},
{
    name: "approve_jules_plan",
    description: "Approve a pending Jules plan (manual override).",
    inputSchema: {
        properties: {
            itemId: { type: "string" },
            planId: { type: "string" }
        }
    }
},
{
    name: "send_jules_message",
    description: "Send a follow-up message to a Jules session (manual feedback).",
    inputSchema: {
        properties: {
            itemId: { type: "string" },
            message: { type: "string" }
        }
    }
}
```

### New SSE Events

```javascript
// State changes
{ event: "jules_state_change", data: { itemId, oldState, newState, summary } }

// Escalations needed
{ event: "jules_escalation", data: { itemId, type, feedback, storyContext } }

// Copilot session events
{ event: "copilot_state_change", data: { itemId, state, message } }

// Auto-resolution results
{ event: "feedback_resolved", data: { itemId, method, success } }

// Completion notifications
{ event: "session_completed", data: { itemId, agent, prUrl, summary } }
```

---

## Jules Session Quota Management

### 100 Sessions/Day Tracking

```javascript
class JulesQuotaManager {
    constructor(dailyLimit = 100) {
        this.limit = dailyLimit;
        this.usageFile = path.join(os.homedir(), ".copilot", "extensions", 
                                   "command-center", "jules-quota.json");
    }

    async recordSession() {
        const usage = await this.loadUsage();
        const today = new Date().toISOString().split('T')[0];
        
        if (usage.date !== today) {
            usage.date = today;
            usage.count = 0;
        }
        
        usage.count++;
        await this.saveUsage(usage);
        
        return {
            used: usage.count,
            remaining: this.limit - usage.count,
            percentUsed: (usage.count / this.limit) * 100
        };
    }

    async canDispatch() {
        const quota = await this.recordSession();
        return {
            allowed: quota.remaining > 0,
            remaining: quota.remaining,
            warning: quota.percentUsed > 80  // Warn at 80%
        };
    }

    // Priority dispatch — if quota low, only dispatch critical/high-priority
    async priorityDispatch(priority) {
        const quota = await this.canDispatch();
        if (!quota.allowed) return false;
        
        // If >90% used, only allow critical
        if (quota.percentUsed > 90 && priority !== 'critical') {
            return false;
        }
        
        // If >80% used, only allow high/critical
        if (quota.percentUsed > 80 && !['high', 'critical'].includes(priority)) {
            return false;
        }
        
        return true;
    }
}
```

### Quota Display in Command Center

```
┌─────────────────────────────────────────┐
│  Jules Daily Quota                      │
│  ████████████████████████░░  87/100     │
│  13 remaining (13%)                     │
│                                         │
│  ⚠️ Low quota — priority dispatch only  │
└─────────────────────────────────────────┘
```

---

## Summary: What Happens After Jules Starts

```
1. dispatch_to_jules creates session
   └─► Session enters QUEUED state
   └─► Adaptive polling starts (30s interval)

2. Jules transitions to PLANNING
   └─► Polling interval shortens to 15s
   └─► SSE event: jules_state_change

3. Jules finishes planning → AWAITING_PLAN_APPROVAL
   └─► If Jules-ready (has intent-contract):
       └─► Auto-approve → Jules continues to IN_PROGRESS
   └─► If NOT Jules-ready:
       └─► Escalation event → Command Center UI shows "Plan ready, needs approval"
       └─► User clicks "Approve" or "Reject"

4. Jules enters IN_PROGRESS
   └─► Polling interval: 30s
   └─► SSE updates with progress messages
   └─► Command Center shows real-time progress

5. Jules enters AWAITING_USER_FEEDBACK (if blocked)
   └─► Auto-resolution engine attempts fix
   └─► If resolved → Jules returns to IN_PROGRESS
   └─► If not resolved → Copilot session created for escalation
   └─► Command Center shows linked Jules + Copilot state

6. Jules completes (COMPLETED/FAILED)
   └─► Polling stops
   └─► If COMPLETED:
       ├─► Extract PR URL
       ├─► Update board item status
       ├─► Check for linked deferred items
       └─► SSE event: session_completed
   └─► If FAILED:
       ├─► Triage failure
       ├─► If retryable → re-dispatch
       └─► If blocking → escalate to Command Center

7. Quota tracking
   └─► Each dispatch increments daily counter
   └─► Priority dispatch when quota >80%
   └─► Block dispatch when quota = 100%
```

---

## Key Design Decisions

### Why Three-Layer Resolution?

1. **Auto-rules first:** Instant, zero token cost, handles 60-70% of feedback
2. **Copilot agent second:** Has full context, handles 25-35% of cases
3. **Human third:** Safety net for truly ambiguous cases

### Why Always `bmad-agent-dev`?

1. **Simplicity:** Single agent type reduces routing complexity
2. **Capability:** Dev agent can handle coding decisions, file analysis, and spec interpretation
3. **Consistency:** Same agent behavior across all escalations
4. **BMad skills:** Dev agent has access to BMad skills if needed

### Why Per-Session Polling?

1. **Responsiveness:** Urgent states (AWAITING_PLAN_APPROVAL) get 5s polls
2. **Efficiency:** Idle sessions (COMPLETED) stop polling entirely
3. **Scalability:** 50 concurrent sessions × adaptive intervals ≈ 15 API calls/min

### Why 2-Minute Timeout?

1. **Prevents stalls:** Jules sessions don't wait indefinitely
2. **Defers, not blocks:** Timeout defaults to "continue best-effort"
3. **Human available:** User can still act within the window
4. **PR safety:** PR merge timeouts keep PR open (no auto-merge)

