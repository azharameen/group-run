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
- [x] Keep runtime isolated behind a dedicated entrypoint

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

- [x] Add the real `create_deep_agent` runtime
- [ ] Wire `FilesystemMiddleware`, `MemoryMiddleware`, `SkillsMiddleware`, `SubAgentMiddleware`, and `HumanInTheLoopMiddleware`
- [ ] Route backend workspace, memory, instructions, and skills through the DeepAgents backend layer
- [ ] Keep the current API stable while validating the new runtime in parallel
- [x] Add a typed runtime event schema for thinking, tool calls, handoffs, subagent delegation, interrupts, and completion
- [x] Separate chat transcript records from workflow state snapshots so the UI can show a real agent transcript
- [x] Stop emitting synthetic agent messages from route handlers once the runtime event stream is available
- [x] Add a clear fallback policy that uses retry and explicit failure only, never fabricated success output
- [x] Extend the current `StreamEvent` type to include interrupt, approval, retry, failed, and done events
- [x] Define a backend-to-frontend transcript envelope that can carry raw event type plus speaker, role, and provenance

### Phase 2 concrete solution path

- [x] Make the DeepAgents runtime the only source that can produce agent reasoning events
- [x] Use `TodoListMiddleware` + `SkillsMiddleware` + `FilesystemMiddleware` + `SubAgentMiddleware` + `MemoryMiddleware` + `HumanInTheLoopMiddleware` in the documented default order
- [x] Define a `RuntimeEvent` contract for thinking/tool_call/tool_result/handover/subagent/interrupt/done
- [x] Persist transcript events separately from idea YAML snapshots so UI replay is accurate
- [x] Route failures to retry or pause, never to fabricated completion text
- [x] Stop treating sandboxing as a roadmap item; keep only safe validation paths during development
- [x] Keep the existing SSE channel but change its payloads from scripted narrations to runtime event envelopes

### Phase 2 checklist

- [x] backend module imports cleanly
- [x] runtime factory builds successfully
- [x] current API still works unchanged
- [x] no default switch to DeepAgents yet
- [x] runtime event schema is documented and tested
- [x] transcript records distinguish user, orchestrator, subagent, tool, and approval events

### Phase 2 milestone

- Deliverable: real DeepAgents runtime exists in repo and can be wired without breaking current app
- Trust rule: no silent fallback-to-fabrication path is allowed in this phase

## Phase 3: Skills And Memory

- [x] Create project `skills/` directory
- [x] Move long system instructions out of Python and into skills
- [x] Add memory directory and file conventions
- [x] Separate org-scoped and user-scoped memory
- [x] Add read-only policy and instruction areas

### Phase 3 checklist

- [x] discovery skill created
- [x] drafting skill created
- [x] review skill created
- [x] Siemens strategy skill created
- [x] memory files documented

### Phase 3 milestone

- Deliverable: prompt-heavy behavior moved into maintainable skills and memory files

## Phase 4: HITL And Approval Flow

- [x] Add checkpointer
- [x] Add interrupt configuration for sensitive actions
- [x] Add approval/reject/edit workflow endpoints
- [x] Replace simulated review states with real approval state records
- [x] Add protected final artifact path rules

### Phase 4 solutioning checklist

- [x] Decide which stages must be human interrupts
- [x] Decide what gets written into the approval packet
- [x] Decide who can approve manager, IP, and counsel stages
- [x] Decide how approvals are resumed and recorded
- [x] Decide which filesystem paths must be protected during approval

### Phase 4 implementation checklist

- [x] Replace simulated review executors with interrupt-driven handlers
- [x] Persist reviewer identity, decision, and reason
- [x] Pause workflow instead of auto-approving when a human is required
- [x] Expose approval / reject / revise endpoints for the UI

### Phase 4 concrete solution path

- [x] Use a top-level checkpointer so runs can pause and resume safely
- [x] Mark sensitive tools with `interrupt_on` or interrupt permissions
- [x] Convert manager/IP/counsel review into explicit human review records
- [x] Resume the workflow only after an explicit human response
- [x] Record approvals in the audit trail and transcript

### Phase 4 checklist

- [x] manager review interrupt works
- [x] IP review interrupt works
- [x] counsel validation interrupt works
- [x] delete/archive interrupt works
- [x] reviewer decisions are persisted

### Phase 4 milestone

- Deliverable: real human approval flow replaces simulated review in critical stages
- Trust rule: approval states must pause and wait for explicit human action

## Phase 5: Streaming And Frontend Integration

- [x] Add DeepAgents event streaming adapter on backend
- [x] Preserve compatibility with current SSE consumers during migration
- [x] Add frontend subagent activity panel
- [x] Add frontend todo/progress panel
- [x] Add frontend tool-call event view
- [x] Add frontend interrupt approval UI

### Phase 5 solutioning checklist

- [x] Decide which events are surfaced in the right chat sidebar
- [x] Decide which events are surfaced in the timeline versus the detail pane
- [x] Decide which messages are real agent utterances and which are orchestration messages
- [x] Decide how to show active speaker, active task, and current state
- [x] Decide how to show paused, failed, retry, and waiting states

### Phase 5 implementation checklist

- [x] Replace hardcoded chat personas with real event metadata
- [x] Stream subagent tool calls and handovers into the UI
- [x] Render per-idea threads from actual stored messages and events
- [x] Keep the current dashboard behavior stable while adding the richer stream
- [x] Remove synthetic thinking tokens from route handlers and use runtime-generated content only
- [x] Add a transcript viewer that can expand each event type separately
- [x] Show speaker chips for user, orchestrator, subagent, reviewer, and tool events
- [x] Add explicit pause / retry / failed badges to live chat items
- [x] Rework `RightChatSidebar` to render transcript cards from typed events instead of legacy hardcoded messages
- [x] Rework `IdeaHistoryTimeline` to read from transcript records first, idea fields second, and comments third
- [x] Update `chat-primitives` so execution steps can render interrupt, approval, failed, and retry states
- [x] Keep a legacy adapter only as a temporary compatibility layer until the new transcript works end-to-end

### Phase 5 concrete solution path

- [x] Render the transcript as a typed event stream rather than a fake chat conversation
- [x] Show speaker labels based on runtime roles, not hardcoded personas
- [x] Keep user comments visually separate from agent reasoning events
- [x] Surface tool calls and delegate handoffs inline with expandable details
- [x] Treat timeline, chat sidebar, and detail pane as three different views of the same event log
- [x] Make the sidebar the live stream, the timeline the historical log, and the detail pane the per-idea artifact inspector

### Phase 5 UI implementation order

1. transcript data model
2. event renderer components
3. speaker badge / role labeling
4. inline tool-call and handoff cards
5. approval interrupt cards
6. retry / failed / waiting states
7. timeline synchronization

### Phase 5 transcript design checklist

- [x] Decide whether the chat sidebar is a live transcript, a condensed summary, or both
- [x] Decide whether tool-call logs belong inline in chat, in a side panel, or in a separate event drawer
- [x] Decide whether approvals should appear as special interrupt cards or as transcript events with action buttons
- [x] Decide how much raw thinking text is safe to show versus summarized reasoning
- [x] Decide how to visually differentiate real runtime events from persisted historical comments

### Phase 5 checklist

- [x] root coordinator stream visible in UI
- [x] subagent status visible in UI
- [x] tool-call state visible in UI
- [x] interrupts visible in UI
- [x] current dashboard pages still function
- [x] live transcript can be filtered by event type
- [x] user can tell at a glance which agent spoke last
- [x] user can tell which step caused a state transition
- [x] no synthetic agent persona message appears as if it were a real conversation speaker

### Phase 5 milestone

- Deliverable: frontend can observe and act on real DeepAgents state without losing current dashboard behavior

## Phase 6: Workflow Quality And Artifacts

- [x] Add artifact versioning model
- [x] Add artifact diff support
- [x] Add evidence traceability per generated section
- [x] Add duplicate idea detection
- [x] Add review packet generation improvements
- [x] Add explicit retry/error states for unsupported or failed agentic steps

### Phase 6 solutioning checklist

- [x] Decide what provenance metadata every artifact must carry
- [x] Decide how fallback / unverified outputs are flagged
- [x] Decide whether duplicate detection is lexical, semantic, or hybrid
- [x] Decide what counts as evidence for a gate versus a draft note

### Phase 6 implementation checklist

- [x] Add provenance metadata for generated sections
- [x] Add artifact diff and revision comparison views
- [x] Add duplicate idea detection with a clear decision outcome
- [x] Add explicit error states when a stage cannot complete agentically

### Phase 6 concrete solution path

- [x] Attach provenance metadata to every generated artifact section
- [x] Store revision diffs so the user can see what changed and why
- [x] Flag unverified or partially generated content explicitly
- [x] Require evidence-backed thresholds for gate decisions
- [x] Make duplicate detection an explicit decision, not a hidden side effect

### Phase 6 milestone

- Deliverable: stronger traceability and higher quality outputs

## Phase 7: Advanced Capabilities

- [ ] Add multimodal ingestion for PDFs and images
- [x] Add real prior-art integrations
- [ ] Add LangSmith observability
- [x] Add RBAC and reviewer identity model
- [x] Plan DB migration away from YAML when needed
- [x] Record package/adaptation decision history before adopting new capabilities

### Phase 7 solutioning checklist

- [ ] Research whether an existing package or MCP server already solves patent search and filing workflows
- [x] Decide whether to adapt external tools or implement custom adapters
- [ ] Decide whether internal Siemens filing systems need connectors later
- [ ] Decide what observability is enough for trust and auditability

### Phase 7 implementation checklist

- [x] Integrate the chosen patent / filing source adapters
- [x] Add observability and review analytics
- [x] Keep the adaptation history in the milestone tracker and phase notes
- [x] Record source trust level for every research adapter
- [x] Record whether patent / filing research came from API, MCP tool, internal source, or web search
- [x] Store tool provenance in the artifact history and audit log

### Phase 7 concrete solution path

- [ ] Compare existing packages and MCP options before building custom patent/filling adapters
- [ ] Prefer reuse of proven sources when the package already exposes search, citations, or filing support
- [ ] Keep every external source tagged with trust level and retrieval provenance
- [ ] Only expand to internal filing connectors after the research and transcript layers are stable

### Phase 7 notes on scope

- sandboxing is not a target capability for the agent runtime
- if validation is needed, use staging data and non-production threads
- the production path should remain fully agentic, not test-harness driven

### Phase 7 adaptation research checklist

- [x] Compare existing research and patent packages before building a custom adapter
- [ ] Decide whether a patent-search MCP server is enough or whether a dedicated backend adapter is needed
- [ ] Decide whether a filing workflow adapter is required now or later
- [ ] Decide how to verify source trustworthiness and citation quality

### Phase 7 milestone

- Deliverable: production-grade research, governance, and observability stack
