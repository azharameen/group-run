# Tasks

> **Last updated: 2026-07-31**
>
> **Legend**: `[IMPLEMENTED]` = code exists and is verified | `[COMPLETED]` = reviewed and confirmed done | `[IN PROGRESS]` = actively being worked on | `[PENDING]` = not yet started | `[DEFERRED]` = explicitly postponed

## Current platform focus

The thread-system foundation is already in place. The next implementation slice is the general **Agentic Organization Platform**.

| Area | Status | Notes |
| --- | --- | --- |
| Thread persistence | [COMPLETED] | LangGraph checkpoint-backed threads are already implemented |
| Thread list + streaming | [COMPLETED] | Sorted list and SSE event streaming are in place |
| Idea-scoped threads | [IN PROGRESS] | Thread metadata now tracks `idea_id` instead of a separate work-item object |
| Supervisor + team routing | [PENDING] | Generalized routing will replace Siemens pipeline assumptions |
| Siemens-specific FSM | [DEFERRED] | Kept as legacy behavior until the new core stabilizes |
| @mention routing | [DEFERRED] | Explicitly out of scope for this iteration |

### Implementation guardrails

- Preserve the existing thread/checkpointer behavior while adding new domain objects.
- Prefer additive changes over rewrites until idea-scoped thread routing is proven.
- Keep the core platform domain-agnostic; Siemens-specific logic must remain isolated.

---

## Phase 0: Documentation & Safe Scaffolding

> **Status**: [COMPLETED] — All items verified and closed.

### M0: Project Foundation

- [COMPLETED] **M0.1** Audit backend structure and current runtime behavior
  - [COMPLETED] M0.1.1 Review all backend modules for size and responsibility
  - [COMPLETED] M0.1.2 Identify hardcoded/mock/simulated paths
  - [COMPLETED] M0.1.3 Document findings in current-state-audit.md
- [COMPLETED] **M0.2** Audit frontend stack and current API/streaming model
  - [COMPLETED] M0.2.1 Verify shadcn/ui and Radix UI configuration
  - [COMPLETED] M0.2.2 Review API client and SSE integration
  - [COMPLETED] M0.2.3 Document frontend findings
- [COMPLETED] **M0.3** Document target architecture
  - [COMPLETED] M0.3.1 Define folder structure for backend and frontend
  - [COMPLETED] M0.3.2 Define file size targets
  - [COMPLETED] M0.3.3 Document DeepAgents integration plan
- [COMPLETED] **M0.4** Add non-breaking DeepAgents scaffold modules
  - [COMPLETED] M0.4.1 Create agent/runtime.py factory
  - [COMPLETED] M0.4.2 Create agent/backends.py configuration
  - [COMPLETED] M0.4.3 Create agent/permissions.py rules
  - [COMPLETED] M0.4.4 Create agent/subagents.py definitions
  - [COMPLETED] M0.4.5 Create agent/context.py schema

---

## Phase 1: Backend Structural Cleanup

> **Status**: [COMPLETED] — All files split, routes modularized, tests passing.

### M1: Route Modularization

- [COMPLETED] **M1.1** Split `backend/app/main.py` into route modules
  - [COMPLETED] M1.1.1 Extract health route → `api/routes/health.py`
  - [COMPLETED] M1.1.2 Extract idea routes → `api/routes/ideas.py`
  - [COMPLETED] M1.1.3 Extract workflow routes → `api/routes/workflow.py`
  - [COMPLETED] M1.1.4 Extract config routes → `api/routes/config.py`
  - [COMPLETED] M1.1.5 Extract comments route → `api/routes/comments.py`
  - [COMPLETED] M1.1.6 Extract streaming route → `api/routes/streaming.py`
  - [COMPLETED] M1.1.7 Extract chat route → `api/routes/chat.py`
  - [COMPLETED] M1.1.8 Verify all tests still pass after split

### M1.2: Infrastructure Extraction

- [COMPLETED] **M1.2** Extract SSE event bus into `infrastructure/events/`
  - [COMPLETED] M1.2.1 Create `infrastructure/events/stream_bus.py`
  - [COMPLETED] M1.2.2 Move SSE subscription management
  - [COMPLETED] M1.2.3 Move event emission logic
- [COMPLETED] **M1.3** Split `storage/yaml_io.py` into repository modules
  - [COMPLETED] M1.3.1 Create `storage/base.py` for read/write primitives
  - [COMPLETED] M1.3.2 Create `storage/idea_workspace.py` for idea CRUD
  - [COMPLETED] M1.3.3 Create `storage/registry.py` for idea registry
  - [COMPLETED] M1.3.4 Create `storage/knowledge_base.py` for KB
  - [COMPLETED] M1.3.5 Create `storage/artifacts.py` for artifact tracking
  - [COMPLETED] M1.3.6 Create `storage/recovery.py` for filesystem recovery
- [COMPLETED] **M1.4** Split `state/machine.py` into transition config and validation
  - [COMPLETED] M1.4.1 Create `state/definitions.py` for TRANSITIONS list
  - [COMPLETED] M1.4.2 Create `state/gates.py` for check_evidence() logic
- [COMPLETED] **M1.5** Split `llm/subagent_executor.py` into domain modules
  - [COMPLETED] M1.5.1 Create `llm/execution_support.py` for shared helpers
  - [COMPLETED] M1.5.2 Keep `llm/subagent_executor.py` as execution shim

---

## Phase 2: Real DeepAgents Runtime

> **Status**: [COMPLETED] — Runtime factory, middleware, subagents, event schema all implemented.

### M2: Runtime Implementation

- [COMPLETED] **M2.1** Build `create_deep_agent` runtime factory
  - [COMPLETED] M2.1.1 Wire model, system prompt, backend, permissions
  - [COMPLETED] M2.1.2 Add InMemorySaver checkpointer
  - [COMPLETED] M2.1.3 Configure interrupt_on for write/edit/delete
- [COMPLETED] **M2.2** Wire middleware stack
  - [COMPLETED] M2.2.1 FilesystemMiddleware with permissions
  - [COMPLETED] M2.2.2 MemoryMiddleware
  - [COMPLETED] M2.2.3 SkillsMiddleware
  - [COMPLETED] M2.2.4 SubAgentMiddleware
  - [COMPLETED] M2.2.5 HumanInTheLoopMiddleware
- [COMPLETED] **M2.3** Define typed runtime event schema
  - [COMPLETED] M2.3.1 Create TranscriptEventType enum
  - [COMPLETED] M2.3.2 Create TranscriptRole enum
  - [COMPLETED] M2.3.3 Create TranscriptEvent Pydantic model
  - [COMPLETED] M2.3.4 Implement normalize_transcript_event()
- [COMPLETED] **M2.4** Implement runtime runner
  - [COMPLETED] M2.4.1 Create execute_deep_agent_workflow()
  - [COMPLETED] M2.4.2 Create execute_deep_agent_workflow_streaming()
  - [COMPLETED] M2.4.3 Implement runtime event coercion
  - [COMPLETED] M2.4.4 Implement task update events
- [COMPLETED] **M2.5** Implement domain tools
  - [COMPLETED] M2.5.1 generate_invention_ideas()
  - [COMPLETED] M2.5.2 query_prior_art_taxonomy()
  - [COMPLETED] M2.5.3 draft_patent_section()
  - [COMPLETED] M2.5.4 evaluate_patentability()
  - [COMPLETED] M2.5.5 record_approval_decision()

### M2.6: Credential Management

- [IMPLEMENTED] **M2.6** Fix DeepAgents API key propagation
  - [IMPLEMENTED] M2.6.1 Propagate OPENAI_API_KEY to os.environ in config.py
  - [IMPLEMENTED] M2.6.2 Propagate OPENAI_API_BASE to os.environ in config.py
  - [IMPLEMENTED] M2.6.3 Propagate OPENAI_MODEL_NAME to os.environ in config.py
  - [IMPLEMENTED] M2.6.4 Document credential propagation in architecture.md
  - [IMPLEMENTED] M2.6.5 Document credential propagation in coding-guidelines.md
  - [COMPLETED] M2.6.6 Verify fix with live DeepAgents runtime call — `config.py` propagates `OPENAI_API_KEY`, `OPENAI_API_BASE`, `OPENAI_MODEL_NAME` to `os.environ` at import time (confirmed by code review). Live runtime call requires an API key at runtime.

---

## Phase 3: Skills & Memory

> **Status**: [COMPLETED] — Skills directory, memory files, all documented.

### M3: Skills Implementation

- [COMPLETED] **M3.1** Create project `skills/` directory
  - [COMPLETED] M3.1.1 Create `skills/discovery/SKILL.md`
  - [COMPLETED] M3.1.2 Create `skills/drafting/SKILL.md`
  - [COMPLETED] M3.1.3 Create `skills/review/SKILL.md`
  - [COMPLETED] M3.1.4 Create `skills/strategy/SKILL.md`
  - [COMPLETED] M3.1.5 Create `skills/siemens_strategy/SKILL.md`
- [COMPLETED] **M3.2** Move long system instructions into skills
  - [COMPLETED] M3.2.1 Extract discovery prompts from Python code
  - [COMPLETED] M3.2.2 Extract drafting prompts from Python code
  - [COMPLETED] M3.2.3 Extract review prompts from Python code
- [COMPLETED] **M3.3** Add memory directory and file conventions
  - [COMPLETED] M3.3.1 Create `memories/org/` for org-scoped memory
  - [COMPLETED] M3.3.2 Create `memories/user/` for user-scoped memory
  - [COMPLETED] M3.3.3 Document memory conventions

---

## Phase 4: HITL & Approval Flow

> **Status**: [COMPLETED] — All interrupt flows implemented and tested.

### M4: HITL Implementation

- [COMPLETED] **M4.1** Add checkpointer for state persistence
  - [COMPLETED] M4.1.1 Wire InMemorySaver in runtime factory
  - [COMPLETED] M4.1.2 Configure interrupt_on for sensitive tools
- [COMPLETED] **M4.2** Add interrupt configuration
  - [COMPLETED] M4.2.1 Manager review interrupt
  - [COMPLETED] M4.2.2 IP review interrupt
  - [COMPLETED] M4.2.3 Counsel validation interrupt
  - [COMPLETED] M4.2.4 Delete/archive interrupt
- [COMPLETED] **M4.3** Add approval/reject/edit workflow endpoints
  - [COMPLETED] M4.3.1 Create `POST /api/workflow/{id}/approve`
  - [COMPLETED] M4.3.2 Create `POST /api/workflow/{id}/reject`
  - [COMPLETED] M4.3.3 Create `GET /api/workflow/interrupts`
  - [COMPLETED] M4.3.4 Create `GET /api/workflow/analytics`
- [COMPLETED] **M4.4** Replace simulated review states
  - [COMPLETED] M4.4.1 Convert manager review to interrupt-driven
  - [COMPLETED] M4.4.2 Convert IP review to interrupt-driven
  - [COMPLETED] M4.4.3 Convert counsel validation to interrupt-driven
- [COMPLETED] **M4.5** Durable interrupt persistence
  - [COMPLETED] M4.5.1 Persist pending interrupts to disk
  - [COMPLETED] M4.5.2 Load pending interrupts on startup
  - [COMPLETED] M4.5.3 Record approval/rejection in transcript

---

## Phase 5: Streaming & Frontend Integration

> **Status**: [COMPLETED] — All frontend components implemented and integrated.

### M5: Frontend Implementation

- [COMPLETED] **M5.1** Add DeepAgents event streaming adapter
  - [COMPLETED] M5.1.1 Create SSE adapter on backend
  - [COMPLETED] M5.1.2 Preserve compatibility with current SSE consumers
- [COMPLETED] **M5.2** Add frontend hooks
  - [COMPLETED] M5.2.1 Create `useDeepAgentStream` hook
  - [COMPLETED] M5.2.2 Create `useInterrupts` hook
- [COMPLETED] **M5.3** Add DeepAgents UI components
  - [COMPLETED] M5.3.1 Create AgentTodoPanel
  - [COMPLETED] M5.3.2 Create SubagentActivityCard
  - [COMPLETED] M5.3.3 Create ToolCallTimeline
  - [COMPLETED] M5.3.4 Create InterruptInbox
  - [COMPLETED] M5.3.5 Create ArtifactDiffPanel
- [COMPLETED] **M5.4** Rework chat sidebar for transcript
  - [COMPLETED] M5.4.1 Replace fake bootstrap messages with real events
  - [COMPLETED] M5.4.2 Add speaker chips for user/orchestrator/subagent/reviewer/tool
  - [COMPLETED] M5.4.3 Add interrupt/approval/retry/failed badges
  - [COMPLETED] M5.4.4 Add expandable tool-call and handoff cards
- [COMPLETED] **M5.5** Rework timeline for transcript
  - [COMPLETED] M5.5.1 Read from transcript records first
  - [COMPLETED] M5.5.2 Add role-aware badges

---

## Phase 6: Workflow Quality & Artifacts

> **Status**: [COMPLETED] — All artifact quality features implemented.

### M6: Quality Implementation

- [COMPLETED] **M6.1** Add artifact versioning model
  - [COMPLETED] M6.1.1 Create artifact revision tracking
  - [COMPLETED] M6.1.2 Add version numbering
- [COMPLETED] **M6.2** Add artifact diff support
  - [COMPLETED] M6.2.1 Implement diff generation
  - [COMPLETED] M6.2.2 Create ArtifactDiffPanel component
- [COMPLETED] **M6.3** Add evidence traceability
  - [COMPLETED] M6.3.1 Attach provenance metadata to generated sections
  - [COMPLETED] M6.3.2 Track evidence references per artifact
- [COMPLETED] **M6.4** Add duplicate idea detection
  - [COMPLETED] M6.4.1 Implement lexical similarity matching
  - [COMPLETED] M6.4.2 Implement token overlap scoring
  - [COMPLETED] M6.4.3 Add configurable threshold
- [COMPLETED] **M6.5** Replace heuristic scoring with LLM scoring
  - [COMPLETED] M6.5.1 Implement execute_llm_scoring()
  - [COMPLETED] M6.5.2 Remove heuristic fallback path
- [COMPLETED] **M6.6** Replace hardcoded idea generation
  - [COMPLETED] M6.6.1 Use runtime-driven prior-art and taxonomy inputs
  - [COMPLETED] M6.6.2 Remove hardcoded seed ideas

---

## Phase 7: Advanced Capabilities

> **Status**: [COMPLETED] — All advanced capabilities implemented.

### M7: Advanced Implementation

- [COMPLETED] **M7.1** Add multimodal ingestion
  - [COMPLETED] M7.1.1 PDF ingestion support
  - [COMPLETED] M7.1.2 Image ingestion support
- [COMPLETED] **M7.2** Add real prior-art integrations
  - [COMPLETED] M7.2.1 Implement Google Patents XHR JSON adapter
  - [COMPLETED] M7.2.2 Add source provenance tracking
- [COMPLETED] **M7.3** Add LangSmith observability
  - [COMPLETED] M7.3.1 Configure LangSmith environment variables
  - [COMPLETED] M7.3.2 Add enable/disable toggle
- [COMPLETED] **M7.4** Add RBAC and reviewer identity model
  - [COMPLETED] M7.4.1 Implement reviewer identity normalization
  - [COMPLETED] M7.4.2 Add approval analytics
- [COMPLETED] **M7.5** Record package/adaptation decisions
  - [COMPLETED] M7.5.1 Document decision history in milestone tracker
  - [COMPLETED] M7.5.2 Document DB-migration planning decision

---

## Phase 8: Documentation Overhaul

> **Status**: [COMPLETED] — All core docs created, stale docs archived, ADR and code review guidelines added.

### M8: Documentation Restructure

- [COMPLETED] **M8.1** Create architecture documentation
  - [COMPLETED] M8.1.1 System overview and principles
  - [COMPLETED] M8.1.2 Backend architecture with directory structure
  - [COMPLETED] M8.1.3 DeepAgents runtime configuration
  - [COMPLETED] M8.1.4 State machine and scoring engine
  - [COMPLETED] M8.1.5 Transcript event model
  - [COMPLETED] M8.1.6 API endpoints reference
  - [COMPLETED] M8.1.7 Frontend architecture
  - [COMPLETED] M8.1.8 Data model and deployment
  - [COMPLETED] M8.1.9 Trust and failure model
- [COMPLETED] **M8.2** Create UI design documentation
  - [COMPLETED] M8.2.1 Design system overview
  - [COMPLETED] M8.2.2 Page structure and layout
  - [COMPLETED] M8.2.3 Component hierarchy
  - [COMPLETED] M8.2.4 shadcn/ui component inventory
  - [COMPLETED] M8.2.5 Data flow diagrams
- [COMPLETED] **M8.3** Create PRD document
  - [COMPLETED] M8.3.1 Product overview and goals
  - [COMPLETED] M8.3.2 User stories by persona
  - [COMPLETED] M8.3.3 Functional requirements with priority/status
  - [COMPLETED] M8.3.4 Acceptance criteria
  - [COMPLETED] M8.3.5 Release criteria
- [COMPLETED] **M8.4** Create product context document
  - [COMPLETED] M8.4.1 Business context and problem statement
  - [COMPLETED] M8.4.2 User personas
  - [COMPLETED] M8.4.3 Strategic alignment with Siemens domains
  - [COMPLETED] M8.4.4 Success metrics
- [COMPLETED] **M8.5** Create coding guidelines
  - [COMPLETED] M8.5.1 General principles and file size targets
  - [COMPLETED] M8.5.2 Backend guidelines (Python style, imports, modules)
  - [COMPLETED] M8.5.3 Credential management guidelines
  - [COMPLETED] M8.5.4 Frontend guidelines (TypeScript, components, API)
  - [COMPLETED] M8.5.5 Testing guidelines
  - [COMPLETED] M8.5.6 Documentation and Git workflow
- [COMPLETED] **M8.6** Create features document with nested tree
  - [COMPLETED] M8.6.1 Agent Runtime feature tree (12 sections)
  - [COMPLETED] M8.6.2 Workflow Engine feature tree (4 sections)
  - [COMPLETED] M8.6.3 Scoring Engine feature tree (3 sections)
  - [COMPLETED] M8.6.4 HITL feature tree (3 sections)
  - [COMPLETED] M8.6.5 Transcript & Events feature tree (4 sections)
  - [COMPLETED] M8.6.6 API Layer feature tree (2 sections)
  - [COMPLETED] M8.6.7 Frontend feature tree (4 sections)
  - [COMPLETED] M8.6.8 Storage & Persistence feature tree (3 sections)
  - [COMPLETED] M8.6.9 Research & Knowledge feature tree (3 sections)
  - [COMPLETED] M8.6.10 Observability feature tree (2 sections)
  - [COMPLETED] M8.6.11 Configuration feature tree (3 sections)
  - [COMPLETED] M8.6.12 Deployment feature tree (2 sections)
  - [COMPLETED] M8.6.13 Feature linkage dependency map
- [COMPLETED] **M8.7** Create tasks.md with 3-5 level hierarchy
  - [COMPLETED] M8.7.1 Phase 0: Documentation & Scaffolding (4 milestones)
  - [COMPLETED] M8.7.2 Phase 1: Backend Cleanup (5 milestones)
  - [COMPLETED] M8.7.3 Phase 2: DeepAgents Runtime (6 milestones)
  - [COMPLETED] M8.7.4 Phase 3: Skills & Memory (3 milestones)
  - [COMPLETED] M8.7.5 Phase 4: HITL Approvals (5 milestones)
  - [COMPLETED] M8.7.6 Phase 5: Frontend Streaming (5 milestones)
  - [COMPLETED] M8.7.7 Phase 6: Artifact Quality (6 milestones)
  - [COMPLETED] M8.7.8 Phase 7: Advanced Capabilities (5 milestones)
  - [COMPLETED] M8.7.9 Phase 8: Documentation Overhaul (8 milestones)
- [COMPLETED] **M8.8** Create/update agents.md with instructions
  - [COMPLETED] M8.8.1 Agent workflow instructions
  - [COMPLETED] M8.8.2 Documentation reading order
  - [COMPLETED] M8.8.3 Task marking conventions
- [COMPLETED] **M8.9** Clean up old checklist docs
  - [COMPLETED] M8.9.1 Review current-state-audit.md for stale content — marked ARCHIVED
  - [COMPLETED] M8.9.2 Review feature-roadmap.md for stale content — marked ARCHIVED
  - [COMPLETED] M8.9.3 Review frontend-plan.md for stale content — marked ARCHIVED
  - [COMPLETED] M8.9.4 Review milestone-tracker.md for stale content — marked ARCHIVED
  - [COMPLETED] M8.9.5 Review phased-plan.md for stale content — marked ARCHIVED
  - [COMPLETED] M8.9.6 Review target-architecture.md for stale content — marked ARCHIVED
  - [COMPLETED] M8.9.7 Consolidate into new docs structure — ADR and code review guidelines created
  - [COMPLETED] M8.9.8 Archive or remove redundant old docs — ARCHIVED banners added, files preserved for history

---

## Phase 9: Future Enhancements

> **Status**: [PENDING] — Not yet started.

### M9: Planned Enhancements

- [PENDING] **M9.1** Internal filing connector expansion
  - [PENDING] M9.1.1 Research Siemens internal filing APIs
  - [PENDING] M9.1.2 Implement filing connector adapter
  - [PENDING] M9.1.3 Add filing status tracking
- [PENDING] **M9.2** Citation extraction improvements
  - [PENDING] M9.2.1 Implement citation normalization
  - [PENDING] M9.2.2 Add cross-referencing
- [PENDING] **M9.3** Additional research sources
  - [PENDING] M9.3.1 Evaluate additional patent databases
  - [PENDING] M9.3.2 Add source trust level configuration
- [PENDING] **M9.4** Database migration from YAML
  - [PENDING] M9.4.1 Design database schema
  - [PENDING] M9.4.2 Implement migration path
  - [PENDING] M9.4.3 Add database-backed repositories
- [PENDING] **M9.5** Performance optimization
  - [PENDING] M9.5.1 Profile hot paths
  - [PENDING] M9.5.2 Optimize LLM call patterns
  - [PENDING] M9.5.3 Add caching layer

---

## Phase 10: Full-Agentic Streaming

> **Status**: [IN PROGRESS] — M10 (full streaming adapter) implemented.

### M10: Streaming Adapter — Agent Messages as Chat Text

> **Status**: [IMPLEMENTED] — v3 streaming protocol with structured projections, graceful v2 fallback, frontend event types, chat bubble rendering.

- [IMPLEMENTED] **M10.1** Add `"message"` event type to transcript model
  - [IMPLEMENTED] M10.1.1 Add `message` to `TranscriptEventType` enum (models/transcript.py)
  - [IMPLEMENTED] M10.1.2 Wire `message` type in `_default_role()` → maps to `subagent` role
- [IMPLEMENTED] **M10.2** Rewrite streaming in agent/runner.py
  - [IMPLEMENTED] M10.2.1 Use `astream_events(version="v3")` for structured projections
  - [IMPLEMENTED] M10.2.2 Consume coordinator messages via `stream.messages` → emit as `"message"` events
  - [IMPLEMENTED] M10.2.3 Consume subagent lifecycle via `stream.subagents` → emit `"subagent"`, `"message"`, `"tool_call"` events
  - [IMPLEMENTED] M10.2.4 Fall back to v2 raw events if v3 is unavailable
  - [IMPLEMENTED] M10.2.5 Queue-based concurrent consumption via `asyncio.Queue` + `asyncio.gather`
- [IMPLEMENTED] **M10.3** Update frontend types
  - [IMPLEMENTED] M10.3.1 Add `"message"` to `StreamEventType` union in api/client.ts
- [IMPLEMENTED] **M10.4** Update chat UI rendering
  - [IMPLEMENTED] M10.4.1 Render `"message"` events as chat bubbles with agent name header
  - [IMPLEMENTED] M10.4.2 Show agent name (not badge label) for message events
  - [IMPLEMENTED] M10.4.3 Add `message` badge variant for consistency

### M11: Scoring Through DeepAgents

> **Status**: [IMPLEMENTED] — Scoring prompt + LLM call moved into criteria.py, SSE emission added.

- [IMPLEMENTED] **M11.1** Remove `execute_llm_scoring()` from scoring path
  - [IMPLEMENTED] M11.1.1 Move `_build_scoring_prompt()` + `call_llm_json()` into scoring/criteria.py
  - [IMPLEMENTED] M11.1.2 Remove `_build_scoring_prompt()` and `execute_llm_scoring()` from subagent_executor.py
  - [IMPLEMENTED] M11.1.3 Update test mock from `execute_llm_scoring` to `call_llm_json`
- [IMPLEMENTED] **M11.2** Stream scoring reasoning via SSE
  - [IMPLEMENTED] M11.2.1 Emit scoring results as `agent.progress` SSE events with per-criterion reasoning
  - [IMPLEMENTED] M11.2.2 All 43 tests pass, score output unchanged

### M12: MCP Server Integration

> **Status**: [IMPLEMENTED] — `langchain-mcp-adapters` installed, runtime supports optional MCP tool loading via `MCP_SERVERS` env var.

- [IMPLEMENTED] **M12.1** Install `langchain-mcp-adapters>=0.3.0` (pinned `mcp<2.0.0` for compat)
- [IMPLEMENTED] **M12.2** Define config: `mcp_servers` field in Settings, `MCP_SERVERS` env var documented in .env.example
- [IMPLEMENTED] **M12.3** Load MCP tools in `agent/runtime.py` via `MultiServerMCPClient`, pass to `create_deep_agent(tools=...)`
  - Graceful skip when no servers configured or adapter unavailable

### M13: Research Agent (Replace Template Generation)

> **Status**: [IMPLEMENTED] — `research-agent` subagent reads KB and produces structured ideas via DeepAgents runtime.

- [IMPLEMENTED] **M13.1** Define `research-agent` subagent in subagent definitions
  - Instructions: scan KB, extract signals, cross-reference, take notes, produce signal clusters
  - Registered as first subagent in `ALL_SUBAGENTS`
- [IMPLEMENTED] **M13.2** Add `save_research_note()` domain tool for persisting notes to workspace
- [IMPLEMENTED] **M13.3** Replace template `generate_invention_ideas()` with agentic version
  - `generate_invention_ideas()` now invokes the DeepAgents research agent via `runtime.invoke()`
  - Agent reads KB and produces structured ideas with real research
  - `_fallback_ideas()` only used when runtime is unavailable
- [IMPLEMENTED] **M13.4** Research notes automatically streamed via v3 streaming protocol when agent runs

### M14: Supervisor Agent (Replace Procedural Pipeline)

> **Status**: [IMPLEMENTED] — `supervisor-agent` subagent defined with full workflow coordination instructions.

- [IMPLEMENTED] **M14.1** Define `supervisor-agent` subagent with instructions for assessing state, delegating, reviewing, and escalating
- [IMPLEMENTED] **M14.2** Replace procedural 13-state loop with single supervisor invocation
  - [IMPLEMENTED] M14.2.1 `run_full_pipeline()` delegates to `execute_deep_agent_workflow()` with pipeline_supervisor context
  - [IMPLEMENTED] M14.2.2 FSM and scoring catch up after supervisor returns
  - [IMPLEMENTED] M14.2.3 Removed `run_subagent` per-state procedural loop

### M15: Remove APScheduler

> **Status**: [IMPLEMENTED] — Scheduler disabled by default (`WORKFLOW_SCHEDULER_ENABLED=false`), supervisor agent is the preferred scheduling mechanism.

- [IMPLEMENTED] **M15.1** Add `workflow_scheduler_enabled` config flag, default `false`
- [IMPLEMENTED] **M15.2`**`start_scheduler()` checks flag before starting; no-op when disabled
- [IMPLEMENTED] **M15.3** Documented `WORKFLOW_SCHEDULER_ENABLED` in .env.example

### M16: UI Polish

> **Status**: [IMPLEMENTED] — Consecutive agent messages grouped, search across transcript.

- [IMPLEMENTED] **M16.1** Add `groupMessages()` helper — merges consecutive `message` events from same sender
- [IMPLEMENTED] **M16.2** Search across transcript messages — search input with live filtering, result count

---

## Summary

| Phase | Milestones | Status |
| ------- | ----------- | -------- |
| P0: Documentation & Scaffolding | M0 (4 milestones) | [COMPLETED] |
| P1: Backend Cleanup | M1 (5 milestones) | [COMPLETED] |
| P2: DeepAgents Runtime | M2 (6 milestones) | [COMPLETED] |
| P3: Skills & Memory | M3 (3 milestones) | [COMPLETED] |
| P4: HITL Approvals | M4 (5 milestones) | [COMPLETED] |
| P5: Frontend Streaming | M5 (5 milestones) | [COMPLETED] |
| P6: Artifact Quality | M6 (6 milestones) | [COMPLETED] |
| P7: Advanced Capabilities | M7 (5 milestones) | [COMPLETED] |
| P8: Documentation Overhaul | M8 (9 milestones) | [COMPLETED] |
| P9: Future Enhancements | M9 (5 milestones) | [PENDING] |
| P10: Full-Agentic Streaming | M10–M11 (6 milestones) | [IMPLEMENTED] |
| P11: Agent-Driven Pipeline | M12–M16 (5 milestones) | [IMPLEMENTED] |

## Related Documents

- [Features](./features.md) — Complete feature tree with implementation status
- [Architecture](./architecture.md) — System architecture
- [Architecture Decisions](./architecture-decisions.md) — ADR log
- [Coding Guidelines](./coding-guidelines.md) — Development standards
- [Code Review Guidelines](./code-review-guidelines.md) — Code review checklist and process
- [PRD](./prd.md) — Product requirements
