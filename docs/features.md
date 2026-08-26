# Features

> **Last updated: 2026-07-29**

## Legend

| Marker | Meaning |
| -------- | --------- |
| ✅ | Implemented and verified |
| 🔄 | In progress |
| 📋 | Planned |
| ❌ | Not started / deferred |

---

## 0. Authentication and Authorization

- ✅ Google-only Firebase sign-in with persistent, automatically refreshed sessions
- ✅ Adaptive shadcn/Tailwind sign-in page with desktop image panel
- ✅ Protected frontend routes, destination restoration, user navigation, and sign-out
- ✅ FastAPI Bearer-token verification for REST and streaming APIs
- ✅ Public `/api/health` and `/api/ready`; all other APIs authenticated
- ✅ Atomic Firestore `users/{uid}` profile bootstrap from verified claims
- ✅ Owner-only Firestore Rules with immutable identity/audit fields
- ✅ Sanitized success, failure, and session-expiry toasts; no raw auth errors
- 📋 Roles, tenant isolation, App Check, and MFA are future authorization milestones

---

## 1. Agent Runtime (DeepAgents)

### 1.1 Runtime Factory

- ✅ `get_deep_agent_runtime()` — Creates compiled DeepAgents graph
  - ✅ `create_deep_agent` with model, system prompt, backend, permissions, subagents
  - ✅ `SqliteSaver` checkpointer for state persistence
  - ✅ `interrupt_on` configuration for write/edit/delete operations
  - ✅ System prompt loaded from `instructions/global-agent-instructions.md`

### 1.2 Backend Configuration

- ✅ `CompositeBackend` with route-based filesystem backends
  - ✅ `StateBackend` as default for thread-scoped scratch state
  - ✅ `/workspace/` — FilesystemBackend (virtual mode)
  - ✅ `/kb/` — FilesystemBackend (virtual mode)
  - ✅ `/instructions/` — FilesystemBackend (virtual mode)
  - ✅ `/memories/` — FilesystemBackend (virtual mode)
  - ✅ `/skills/` — FilesystemBackend (virtual mode)

### 1.3 Permissions Model

- ✅ Path-based `FilesystemPermission` rules
  - ✅ Read/write on `/workspace/**` and `/memories/**`
  - ✅ Read-only on `/kb/**`, `/instructions/**`, `/skills/**`
  - ✅ Interrupt on `/workspace/submissions/**` and `/workspace/final/**`
  - ✅ Deny write on `/kb/**`, `/instructions/**`, `/skills/**`
  - ✅ Deny all external paths

### 1.4 Middleware Stack

- ✅ TodoListMiddleware — Task planning and progress tracking
- ✅ SkillsMiddleware — Skill file loading
- ✅ FilesystemMiddleware — With permissions applied
- ✅ SubAgentMiddleware — Subagent delegation
- ✅ SummarizationMiddleware — Context window management
- ✅ PatchToolCallsMiddleware — Tool call patching
- ✅ MemoryMiddleware — Long-term memory
- ✅ HumanInTheLoopMiddleware — Approval interrupts

### 1.5 Subagent Definitions

- ✅ 11 subagents from workflow roles
  - ✅ `knowledge-curator` — Document ingestion, signal extraction
  - ✅ `idea-discoverer` — Signal to structured idea transformation
  - ✅ `problem-framer` — Problem statement refinement
  - ✅ `novelty-analyst` — Novelty claims articulation
  - ✅ `prior-art-researcher` — Prior art search and analysis
  - ✅ `detectability-analyst` — Infringement detectability assessment
  - ✅ `business-value-analyst` — Siemens business value quantification
  - ✅ `siemens-alignment` — Strategic domain alignment validation
  - ✅ `checklist-validator` — Gate checklist enforcement
  - ✅ `reviewer-summarizer` — Review packet creation
  - ✅ `patent-drafter` — IdeaScope document drafting

### 1.6 Domain Tools

- ✅ `generate_invention_ideas()` — Structured idea generation
- ✅ `query_prior_art_taxonomy()` — KB taxonomy queries
- ✅ `draft_patent_section()` — Patent disclosure drafting
- ✅ `evaluate_patentability()` — Scoring engine integration
- ✅ `record_approval_decision()` — Review decision recording

### 1.7 Credential Management

- ✅ `.env` file loading via `pydantic-settings`
- ✅ Credential propagation to `os.environ` for LangChain compatibility
- ✅ `deepagents_model` auto-derivation from `openai_model_name`

---

## 2. Thread System

- ✅ Thread metadata persistence in SQLite
  - ✅ `thread_manager.py` creates, updates, deletes, and lists threads
  - ✅ `updated_at` sort order for active thread navigation
  - ✅ `idea_id`, `tags`, and `agent_names` metadata fields
- ✅ LangGraph checkpoint-backed message history
  - ✅ `GET /api/threads/{id}/messages` reads from the saver state
  - ✅ `POST /api/threads/{id}/stream` streams events immediately as they arrive
  - ✅ Thread touch/update on every send for active sorting
- ✅ Frontend thread experience
  - ✅ Right sidebar thread list
  - ✅ New thread creation on first message
  - ✅ Thread switching reloads persisted history
  - ✅ Streaming UI renders event-bound updates

---

## 2. Workflow Engine

### 2.1 State Machine

- ✅ 18-state `PatentWorkflowMachine` using `transitions` library
  - ✅ Discovery phase (3 states): raw_signal → idea_discovery → idea_clarification
  - ✅ Research phase (3 states): novelty → prior_art → detectability
  - ✅ Analysis phase (2 states): business_value → siemens_alignment
  - ✅ Drafting phase (2 states): ideascope_draft → filing_check
  - ✅ Review phase (3 states): manager → ip_review → counsel_validation
  - ✅ Done phase (5 states): ready → submitted → feedback → revision → accepted

### 2.2 State Transitions

- ✅ Linear workflow with sequential advancement
- ✅ `advance_to_next()` — Auto-advance to next state
- ✅ `advance_to(target)` — Advance to specific next state
- ✅ Gate validation before transition
- ✅ Lifecycle hooks: `on_entry`, `validate`, `on_exit`
- ✅ State history recording

### 2.3 Gate Checklists

- ✅ 12 gate checklists defined in `config/checklist-config.yaml`
  - ✅ discovery → clarification (3 items)
  - ✅ clarification → novelty (3 items)
  - ✅ novelty → prior_art (3 items)
  - ✅ prior_art → detectability (3 items)
  - ✅ detectability → business_value (3 items)
  - ✅ business_value → alignment (3 items)
  - ✅ alignment → drafting (5 items)
  - ✅ drafting → filing_check (7 items)
  - ✅ filing_check → manager (4 items)
  - ✅ manager → ip_review (3 items)
  - ✅ ip_review → counsel (4 items)
  - ✅ counsel → ready (4 items)
- ✅ Evidence checking logic in `state/gates.py`

### 2.4 Workflow Orchestration

- ✅ `run_generation_cycle()` — Scheduler-driven cycle
- ✅ `run_full_pipeline()` — End-to-end pipeline execution
- ✅ `seed_ideas()` — Autonomous idea seeding
- ✅ Idea prioritization and focus selection
- ✅ Active processing state management
- ✅ Pause/resume idea processing

---

## 3. Scoring Engine

### 3.1 Criteria

- ✅ 7 weighted criteria (0-100 each)
  - ✅ novelty (25%) — Prior art gap analysis
  - ✅ siemens_alignment (15%) — Strategic domain match
  - ✅ technical_feasibility (15%) — Implementation viability
  - ✅ detectability (10%) — Infringement detection
  - ✅ business_value (15%) — Siemens market impact
  - ✅ originality (10%) — Non-obviousness
  - ✅ completeness (10%) — Documentation quality

### 3.2 Scoring Methods

- ✅ LLM-powered scoring (primary)
- ✅ Composite score calculation (weighted sum)
- ✅ Strength rating assignment (Very Strong / Strong / Moderate / Weak / Reject)
- ✅ Filing threshold validation (composite ≥ 70, no critical < 50%)
- ✅ Score history tracking in `scores.yaml`

### 3.3 Scoring Models

- ✅ `ScoreBreakdown` — Per-criterion scores
- ✅ `ScoreRecord` — Full score record with timestamp
- ✅ `CriterionDetail` — Score + reasoning + confidence
- ✅ `ScoringEngine` — Orchestrates scoring
- ✅ `CriterionEvaluator` — LLM-powered evaluation

---

## 4. Human-in-the-Loop

### 4.1 Interrupt Configuration

- ✅ Manager review interrupt
- ✅ IP review interrupt
- ✅ Counsel validation interrupt
- ✅ Delete/archive approval interrupt
- ✅ Durable pending interrupt persistence (disk-backed)

### 4.2 Approval Flow

- ✅ Pending interrupt listing endpoint
- ✅ Approval endpoint with reviewer identity
- ✅ Rejection endpoint with reason
- ✅ Resume workflow after decision
- ✅ Transcript event recording for decisions

### 4.3 Review Analytics

- ✅ Reviewer identity normalization
- ✅ Approval/rejection counts by role
- ✅ Pending interrupt observability

---

## 5. Transcript & Events

### 5.1 Event Types

- ✅ `TranscriptEventType` enum with 14 event types
  - ✅ thinking, tool_call, tool_result, subagent, handover
  - ✅ interrupt, approval, retry, failed, completion
  - ✅ done, token, tasks_update, transition, user_message

### 5.2 Event Roles

- ✅ `TranscriptRole` enum with 7 roles
  - ✅ user, orchestrator, subagent, reviewer, tool, workflow, system

### 5.3 Event Persistence

- ✅ Typed `TranscriptEvent` model (Pydantic)
- ✅ `normalize_transcript_event()` — Metadata enrichment
- ✅ Transcript event storage in `transcript.yaml`
- ✅ Provenance tracking per event
- ✅ Trust level assignment per event type

### 5.4 Event Streaming

- ✅ SSE-based real-time event streaming
- ✅ Runtime event coercion from DeepAgents messages
- ✅ Task update events with progress tracking

---

## 6. API Layer

### 6.1 REST Endpoints

- ✅ Health check (`GET /api/health`)
- ✅ SSE stream (`GET /api/sse`)
- ✅ Idea CRUD (`GET/POST /api/ideas`, `GET /api/ideas/{id}`)
- ✅ Workflow advancement (`POST /api/ideas/{id}/advance`)
- ✅ Scoring (`POST /api/ideas/{id}/score`)
- ✅ Gate validation (`POST /api/ideas/{id}/validate-gate`)
- ✅ Idea update (`POST /api/ideas/{id}/update`)
- ✅ Evidence addition (`POST /api/ideas/{id}/evidence`)
- ✅ Idea delete with interrupt (`DELETE /api/ideas/{id}`)
- ✅ Idea archive with interrupt (`POST /api/ideas/{id}/archive`)
- ✅ Pause/resume (`POST /api/ideas/{id}/pause`, `/resume`)
- ✅ Comments (`POST /api/ideas/{id}/comment`)
- ✅ Chat (`GET/POST /api/chat`, `/api/ideas/{id}/chat`)
- ✅ Streaming chat (`POST /api/chat/stream`, `/api/ideas/{id}/chat/stream`)
- ✅ Agent tasks (`GET /api/agent-tasks`)
- ✅ Workflow interrupts (`GET /api/workflow/interrupts`)
- ✅ Approval/rejection (`POST /api/workflow/{id}/approve`, `/reject`)
- ✅ Review analytics (`GET /api/workflow/analytics`)
- ✅ Workflow cycle/seed (`POST /api/workflow/cycle`, `/seed`)
- ✅ Pipeline execution (`POST /api/submit-pipeline`, `/auto-pipeline`)
- ✅ System stats (`GET /api/stats`)
- ✅ Knowledge base (`GET /api/knowledge-base`)
- ✅ Siemens domains (`GET /api/config/siemens-domains`)
- ✅ Idea files (`GET /api/ideas/{id}/files`)
- ✅ Artifact revisions (`GET /api/ideas/{id}/revisions`)
- ✅ Artifact diff (`GET /api/ideas/{id}/artifacts/{name}/diff`)

---

## 7. Agentic Organization Platform

- ✅ Thread persistence is the source of truth for conversations
- ✅ Active thread sorting uses `updated_at DESC`
- ✅ Threads can be associated with an `idea_id` for idea-scoped conversations
- ❌ @mention routing is intentionally deferred for this iteration
- ❌ Siemens-specific workflow generalization is pending the idea/thread cleanup

### 6.2 Route Organization

- ✅ Routes split into modular files
- ✅ Each route file < 150 lines
- ✅ Clear separation of concerns

---

## 7. Frontend

### 7.1 Pages

- ✅ Dashboard — Stats, idea grid, action buttons
- ✅ IdeaDetail — Full idea view with tabs
- ✅ KnowledgeBase — Document browser
- ✅ SiemensControls — Domain alignment view

### 7.2 Components

- ✅ shadcn/ui components (Button, Card, Dialog, Input, Select, Tabs, Badge, Sidebar, Sheet, Tooltip, Separator, ScrollArea)
- ✅ DeepAgents components
  - ✅ AgentTodoPanel — Task/progress panel
  - ✅ SubagentActivityCard — Subagent activity display
  - ✅ ToolCallTimeline — Tool call inspection
  - ✅ InterruptInbox — Approval interrupt inbox
  - ✅ ArtifactDiffPanel — Artifact diff viewer
- ✅ Idea components
  - ✅ IdeaCard — Idea summary card
  - ✅ ScoreRadar — Score radar chart
  - ✅ WorkflowTimeline — Workflow state timeline
- ✅ Layout components
  - ✅ AppSidebar — Left navigation
  - ✅ SiteHeader — Top header
  - ✅ RightChatSidebar — Live transcript sidebar
  - ✅ IdeaHistoryTimeline — Historical timeline

### 7.3 API Integration

- ✅ Centralized API client (`api/client.ts`)
- ✅ SSE streaming hook (`hooks/useDeepAgentStream.ts`)
- ✅ Interrupt polling hook (`hooks/useInterrupts.ts`)

### 7.4 Design System

- ✅ shadcn/ui configured via `components.json`
- ✅ Tailwind CSS with Zinc base color
- ✅ Radix UI primitives for accessibility
- ✅ Lucide React icons

---

## 8. Storage & Persistence

### 8.1 Filesystem Storage

- ✅ YAML/Markdown persistence in `workspace/ideas/`
- ✅ Per-idea folder structure
  - ✅ `idea.yaml` — Main record
  - ✅ `state.yaml` — State history
  - ✅ `scores.yaml` — Score history
  - ✅ `transcript.yaml` — Transcript events
  - ✅ `ideascope-draft.md` — IdeaScope document
  - ✅ `submission-summary.md` — Submission packet
  - ✅ `handovers/` — Per-transition handover packets
  - ✅ `revisions/changelog.md` — Audit trail

### 8.2 Storage Modules

- ✅ `base.py` — Read/write YAML and Markdown
- ✅ `idea_workspace.py` — Idea folder CRUD
- ✅ `registry.py` — Idea registry management
- ✅ `knowledge_base.py` — KB document loading
- ✅ `artifacts.py` — Artifact revision tracking
- ✅ `recovery.py` — Filesystem recovery

### 8.3 Artifact Management

- ✅ Artifact revision tracking with versioning
- ✅ Artifact diff generation
- ✅ Provenance metadata per artifact
- ✅ Evidence reference tracking

---

## 9. Research & Knowledge

### 9.1 Prior Art Search

- ✅ Structured Google Patents XHR JSON adapter
- ✅ Source provenance tracking
- ✅ Configurable search limits

### 9.2 Knowledge Base

- ✅ Raw document storage (`knowledge-base/raw/`)
- ✅ Processed document storage (`knowledge-base/processed/`)
- ✅ Siemens tech domains (`knowledge-base/siemens/`)
- ✅ Prior art taxonomy (`knowledge-base/prior_art_taxonomy.json`)
- ✅ Multimodal ingestion (PDFs and images)

### 9.3 Duplicate Detection

- ✅ Lexical similarity matching (SequenceMatcher)
- ✅ Token overlap scoring
- ✅ Configurable threshold
- ✅ Provenance tracking for matches

---

## 10. Observability

### 10.1 LangSmith Tracing

- ✅ Environment variable configuration
- ✅ Tracing enable/disable toggle
- ✅ Project and endpoint configuration

### 10.2 System Monitoring

- ✅ Health check endpoint
- ✅ System statistics endpoint
- ✅ Review analytics endpoint
- ✅ Active processing state tracking

---

## 11. Configuration

### 11.1 System Configuration (`config/system-config.yaml`)

- ✅ Workflow interval, retries, timeout
- ✅ Scoring weights and thresholds
- ✅ Strength rating boundaries
- ✅ State definitions

### 11.2 Gate Checklists (`config/checklist-config.yaml`)

- ✅ 12 gate definitions with checklist items
- ✅ Per-item descriptions

### 11.3 Environment Configuration

- ✅ `.env` file loading
- ✅ Pydantic Settings model
- ✅ Docker environment variable passthrough

---

## 12. Deployment

### 12.1 Docker

- ✅ Backend Dockerfile (FastAPI)
- ✅ Frontend Dockerfile (Nginx + Vite)
- ✅ Docker Compose configuration
- ✅ Volume mounts for config, workspace, KB

### 12.2 Environment

- ✅ Configurable host/port
- ✅ Configurable model and API settings
- ✅ APP_ROOT_DIR for Docker path resolution

---

## Feature Linkages

### Dependency Map

```
Agent Runtime (1)
├── Workflow Engine (2) — uses runtime for state execution
│   ├── Scoring Engine (3) — called after state transitions
│   ├── HITL (4) — interrupts at review states
│   └── Transcript & Events (5) — records all transitions
├── API Layer (6) — exposes runtime capabilities
│   └── Frontend (7) — consumes API
├── Storage & Persistence (8) — backend for all data
├── Research & Knowledge (9) — feeds idea generation
└── Observability (10) — monitors all components
```

### Cross-Cutting Concerns

| Concern | Affected Features |
| --------- | ------------------- |
| Provenance | 1.6, 3.2, 5.3, 8.3, 9.1 |
| Error Handling | 1.7, 2.2, 3.2, 5.1 |
| Configuration | 11.1, 11.2, 11.3 |
| Testing | All features have test coverage |

## Related Documents

- [Architecture](./architecture.md) — System architecture
- [PRD](./prd.md) — Product requirements
- [Coding Guidelines](./coding-guidelines.md) — Development standards
- [Architecture Decisions](./architecture-decisions.md) — ADR log
- [Tasks](./tasks.md) — Implementation task hierarchy
