# Phased Plan

## Recommended execution order

1. **Phase 2** — establish the real DeepAgents runtime, event schema, and transcript model first.
2. **Phase 4** — add durable checkpointer-backed human interrupts before trusting sensitive actions.
3. **Phase 5** — expose the runtime events in the UI as a real transcript instead of synthetic chat.
4. **Phase 6** — add provenance, revision history, and stronger artifact quality controls.
5. **Phase 7** — integrate real prior-art and filing sources only after the runtime and UI can surface them safely.

This order keeps the system honest: runtime first, approvals second, UI third, artifact quality fourth, research integrations last.

## Solution map by issue family

### Real chat stream gap

- Solution: move from scripted chat narration to runtime-emitted event streaming.
- Mechanism: typed runtime events + transcript store + UI event renderer.
- UI outcome: user sees live thinking, tool calls, handoffs, and interrupts.

### Hardcoded and mock behavior

- Solution: remove synthetic completion paths and replace them with explicit retry / pause / failure states.
- Mechanism: error-first control flow, no fabricated agent output, audit logs for failures.
- UI outcome: user sees when a step failed and can retry or review it.

### Human approval and governance

- Solution: use checkpointer-backed human interrupts for sensitive tools and review stages.
- Mechanism: `interrupt_on` / interrupt permissions + resume decision flow.
- UI outcome: manager/IP/counsel stages pause until approved or edited.

### Conversation thread fidelity

- Solution: store conversation events as separate records for user, orchestrator, subagent, tool, and reviewer messages.
- Mechanism: event schema + transcript persistence + role-based labels.
- UI outcome: the chat surface reflects what actually happened, not a fake persona dialog.

### Research and prior-art sourcing

- Solution: choose a trusted retrieval layer before claiming full agentic research.
- Mechanism: patent-search adapter or MCP server plus citation provenance.
- UI outcome: the user can inspect source trust and research origin.

## Phase 0: Documentation And Safe Scaffolding

- [x] Audit backend structure and current runtime behavior
- [x] Audit frontend stack and current API/streaming model
- [x] Document current findings in `docs/`
- [x] Define target folder structure and architecture
- [x] Add non-breaking DeepAgents scaffold modules
- [x] Split giant backend files without changing runtime behavior

### Phase 0 milestone

- Deliverable: migration docs plus isolated agent runtime scaffold with no production behavior change

Phase 0 status: completed on 2026-07-27.

### Phase 0 note

This phase produced the documentation and safe scaffolding only. It did not make the application fully agentic.

## Phase 1: Backend Structural Cleanup

- [x] Split `backend/app/main.py` into route modules
- [x] Extract SSE event bus into infrastructure/events
- [x] Extract workflow status aggregation out of route handlers
- [x] Split `storage/yaml_io.py` into repositories or repository-like adapters
- [x] Split `state/machine.py` into transition config and validation policy
- [x] Split `llm/subagent_executor.py` into smaller domain-specific execution modules

### Phase 1 checklist

- [x] health route moved
- [x] idea routes moved
- [x] workflow routes moved
- [x] config routes moved
- [x] comments route moved
- [x] streaming route moved
- [x] tests still pass after split

### Phase 1 milestone

- Deliverable: same behavior, smaller files, clear layering boundaries

Phase 1 status: completed on 2026-07-27.

## Phase 2: Real DeepAgents Runtime Introduction

- [ ] Add DeepAgents dependency alignment
- [ ] Build `create_deep_agent` runtime factory
- [ ] Add `CompositeBackend` setup
- [ ] Add permissions model
- [ ] Add initial context schema
- [ ] Add initial subagent definitions from existing workflow roles
- [ ] Keep runtime isolated behind a feature flag or dedicated entrypoint

### Phase 2 solutioning checklist

- [ ] Decide what source types are allowed as agent inputs
  - [ ] workspace ideas and artifacts
  - [ ] knowledge-base documents
  - [ ] instructions files
  - [ ] memory files
  - [ ] external web research
  - [ ] patent search / filing data
- [ ] Decide what information is trusted by default and what must be verified
- [ ] Decide whether patents and filings need a dedicated adapter or MCP server
- [ ] Decide the canonical agent roster and which roles are reusable specialists
- [ ] Decide how conversation threads are assembled from user turns, subagent turns, tool calls, and interrupts
- [ ] Decide how the UI labels speakers so it never looks like a fake human conversation

### Phase 2 implementation checklist

- [ ] Add the real `create_deep_agent` runtime behind a feature flag
- [ ] Wire `FilesystemMiddleware`, `MemoryMiddleware`, `SkillsMiddleware`, `SubAgentMiddleware`, and `HumanInTheLoopMiddleware`
- [ ] Route backend workspace, memory, instructions, and skills through the DeepAgents backend layer
- [ ] Keep the current API stable while validating the new runtime in parallel
- [ ] Add a typed runtime event schema for thinking, tool calls, handoffs, subagent delegation, interrupts, and completion
- [ ] Separate chat transcript records from workflow state snapshots so the UI can show a real agent transcript
- [ ] Stop emitting synthetic agent messages from route handlers once the runtime event stream is available
- [ ] Add a clear fallback policy that uses retry and explicit failure only, never fabricated success output
- [ ] Extend the current `StreamEvent` type to include interrupt, approval, retry, failed, and done events
- [ ] Define a backend-to-frontend transcript envelope that can carry raw event type plus speaker, role, and provenance

### Phase 2 concrete solution path

- [ ] Make the DeepAgents runtime the only source that can produce agent reasoning events
- [ ] Use `TodoListMiddleware` + `SkillsMiddleware` + `FilesystemMiddleware` + `SubAgentMiddleware` + `MemoryMiddleware` + `HumanInTheLoopMiddleware` in the documented default order
- [ ] Define a `RuntimeEvent` contract for thinking/tool_call/tool_result/handover/subagent/interrupt/done
- [ ] Persist transcript events separately from idea YAML snapshots so UI replay is accurate
- [ ] Route failures to retry or pause, never to fabricated completion text
- [ ] Stop treating sandboxing as a roadmap item; keep only safe feature-flagged validation paths during development
- [ ] Keep the existing SSE channel but change its payloads from scripted narrations to runtime event envelopes

### Phase 2 checklist

- [ ] backend module imports cleanly
- [ ] runtime factory builds successfully
- [ ] current API still works unchanged
- [ ] no default switch to DeepAgents yet
- [ ] runtime event schema is documented and tested
- [ ] transcript records distinguish user, orchestrator, subagent, tool, and approval events

### Phase 2 milestone

- Deliverable: real DeepAgents runtime exists in repo and can be wired without breaking current app
- Trust rule: no silent fallback-to-fabrication path is allowed in this phase

## Phase 3: Skills And Memory

- [ ] Create project `skills/` directory
- [ ] Move long system instructions out of Python and into skills
- [ ] Add memory directory and file conventions
- [ ] Separate org-scoped and user-scoped memory
- [ ] Add read-only policy and instruction areas

### Phase 3 checklist

- [ ] discovery skill created
- [ ] drafting skill created
- [ ] review skill created
- [ ] Siemens strategy skill created
- [ ] memory files documented

### Phase 3 milestone

- Deliverable: prompt-heavy behavior moved into maintainable skills and memory files

## Phase 4: HITL And Approval Flow

- [ ] Add checkpointer
- [ ] Add interrupt configuration for sensitive actions
- [ ] Add approval/reject/edit workflow endpoints
- [ ] Replace simulated review states with real approval state records
- [ ] Add protected final artifact path rules

### Phase 4 solutioning checklist

- [ ] Decide which stages must be human interrupts
- [ ] Decide what gets written into the approval packet
- [ ] Decide who can approve manager, IP, and counsel stages
- [ ] Decide how approvals are resumed and recorded
- [ ] Decide which filesystem paths must be protected during approval

### Phase 4 implementation checklist

- [ ] Replace simulated review executors with interrupt-driven handlers
- [ ] Persist reviewer identity, decision, and reason
- [ ] Pause workflow instead of auto-approving when a human is required
- [ ] Expose approval / reject / revise endpoints for the UI

### Phase 4 concrete solution path

- [ ] Use a top-level checkpointer so runs can pause and resume safely
- [ ] Mark sensitive tools with `interrupt_on` or interrupt permissions
- [ ] Convert manager/IP/counsel review into explicit human review records
- [ ] Resume the workflow only after an explicit human response
- [ ] Record approvals in the audit trail and transcript

### Phase 4 checklist

- [ ] manager review interrupt works
- [ ] IP review interrupt works
- [ ] counsel validation interrupt works
- [ ] delete/archive interrupt works
- [ ] reviewer decisions are persisted

### Phase 4 milestone

- Deliverable: real human approval flow replaces simulated review in critical stages
- Trust rule: approval states must pause and wait for explicit human action

## Phase 5: Streaming And Frontend Integration

- [ ] Add DeepAgents event streaming adapter on backend
- [ ] Preserve compatibility with current SSE consumers during migration
- [ ] Add frontend subagent activity panel
- [ ] Add frontend todo/progress panel
- [ ] Add frontend tool-call event view
- [ ] Add frontend interrupt approval UI

### Phase 5 solutioning checklist

- [ ] Decide which events are surfaced in the right chat sidebar
- [ ] Decide which events are surfaced in the timeline versus the detail pane
- [ ] Decide which messages are real agent utterances and which are orchestration messages
- [ ] Decide how to show active speaker, active task, and current state
- [ ] Decide how to show paused, failed, retry, and waiting states

### Phase 5 implementation checklist

- [ ] Replace hardcoded chat personas with real event metadata
- [ ] Stream subagent tool calls and handovers into the UI
- [ ] Render per-idea threads from actual stored messages and events
- [ ] Keep the current dashboard behavior stable while adding the richer stream
- [ ] Remove synthetic thinking tokens from route handlers and use runtime-generated content only
- [ ] Add a transcript viewer that can expand each event type separately
- [ ] Show speaker chips for user, orchestrator, subagent, reviewer, and tool events
- [ ] Add explicit pause / retry / failed badges to live chat items
- [ ] Rework `RightChatSidebar` to render transcript cards from typed events instead of legacy hardcoded messages
- [ ] Rework `IdeaHistoryTimeline` to read from transcript records first, idea fields second, and comments third
- [ ] Update `chat-primitives` so execution steps can render interrupt, approval, failed, and retry states
- [ ] Keep a legacy adapter only as a temporary compatibility layer until the new transcript works end-to-end

### Phase 5 concrete solution path

- [ ] Render the transcript as a typed event stream rather than a fake chat conversation
- [ ] Show speaker labels based on runtime roles, not hardcoded personas
- [ ] Keep user comments visually separate from agent reasoning events
- [ ] Surface tool calls and delegate handoffs inline with expandable details
- [ ] Treat timeline, chat sidebar, and detail pane as three different views of the same event log
- [ ] Make the sidebar the live stream, the timeline the historical log, and the detail pane the per-idea artifact inspector

### Phase 5 UI implementation order

1. transcript data model
2. event renderer components
3. speaker badge / role labeling
4. inline tool-call and handoff cards
5. approval interrupt cards
6. retry / failed / waiting states
7. timeline synchronization

### Phase 5 transcript design checklist

- [ ] Decide whether the chat sidebar is a live transcript, a condensed summary, or both
- [ ] Decide whether tool-call logs belong inline in chat, in a side panel, or in a separate event drawer
- [ ] Decide whether approvals should appear as special interrupt cards or as transcript events with action buttons
- [ ] Decide how much raw thinking text is safe to show versus summarized reasoning
- [ ] Decide how to visually differentiate real runtime events from persisted historical comments

### Phase 5 checklist

- [ ] root coordinator stream visible in UI
- [ ] subagent status visible in UI
- [ ] tool-call state visible in UI
- [ ] interrupts visible in UI
- [ ] current dashboard pages still function
- [ ] live transcript can be filtered by event type
- [ ] user can tell at a glance which agent spoke last
- [ ] user can tell which step caused a state transition
- [ ] no synthetic agent persona message appears as if it were a real conversation speaker

### Phase 5 milestone

- Deliverable: frontend can observe and act on real DeepAgents state without losing current dashboard behavior

## Phase 6: Workflow Quality And Artifacts

- [ ] Add artifact versioning model
- [ ] Add artifact diff support
- [ ] Add evidence traceability per generated section
- [ ] Add duplicate idea detection
- [ ] Add review packet generation improvements
- [ ] Add explicit retry/error states for unsupported or failed agentic steps

### Phase 6 solutioning checklist

- [ ] Decide what provenance metadata every artifact must carry
- [ ] Decide how fallback / unverified outputs are flagged
- [ ] Decide whether duplicate detection is lexical, semantic, or hybrid
- [ ] Decide what counts as evidence for a gate versus a draft note

### Phase 6 implementation checklist

- [ ] Add provenance metadata for generated sections
- [ ] Add artifact diff and revision comparison views
- [ ] Add duplicate idea detection with a clear decision outcome
- [ ] Add explicit error states when a stage cannot complete agentically

### Phase 6 concrete solution path

- [ ] Attach provenance metadata to every generated artifact section
- [ ] Store revision diffs so the user can see what changed and why
- [ ] Flag unverified or partially generated content explicitly
- [ ] Require evidence-backed thresholds for gate decisions
- [ ] Make duplicate detection an explicit decision, not a hidden side effect

### Phase 6 milestone

- Deliverable: stronger traceability and higher quality outputs

## Phase 7: Advanced Capabilities

- [ ] Add multimodal ingestion for PDFs and images
- [ ] Add real prior-art integrations
- [ ] Add LangSmith observability
- [ ] Add RBAC and reviewer identity model
- [ ] Plan DB migration away from YAML when needed
- [ ] Record package/adaptation decision history before adopting new capabilities

### Phase 7 solutioning checklist

- [ ] Research whether an existing package or MCP server already solves patent search and filing workflows
- [ ] Decide whether to adapt external tools or implement custom adapters
- [ ] Decide whether internal Siemens filing systems need connectors later
- [ ] Decide what observability is enough for trust and auditability

### Phase 7 implementation checklist

- [ ] Integrate the chosen patent / filing source adapters
- [ ] Add observability and review analytics
- [ ] Keep the adaptation history in the milestone tracker and phase notes
- [ ] Record source trust level for every research adapter
- [ ] Record whether patent / filing research came from API, MCP tool, internal source, or web search
- [ ] Store tool provenance in the artifact history and audit log

### Phase 7 concrete solution path

- [ ] Compare existing packages and MCP options before building custom patent/filling adapters
- [ ] Prefer reuse of proven sources when the package already exposes search, citations, or filing support
- [ ] Keep every external source tagged with trust level and retrieval provenance
- [ ] Only expand to internal filing connectors after the research and transcript layers are stable

### Phase 7 notes on scope

- sandboxing is not a target capability for the agent runtime
- if validation is needed, use feature flags, staging data, and non-production threads
- the production path should remain fully agentic, not test-harness driven

### Phase 7 adaptation research checklist

- [ ] Compare existing research and patent packages before building a custom adapter
- [ ] Decide whether a patent-search MCP server is enough or whether a dedicated backend adapter is needed
- [ ] Decide whether a filing workflow adapter is required now or later
- [ ] Decide how to verify source trustworthiness and citation quality

### Phase 7 milestone

- Deliverable: production-grade research, governance, and observability stack
