# Architecture Decisions

> **Last updated: 2026-07-31**

## Format

Each decision follows: **Title**, **Context**, **Decision**, **Consequences**.

______________________________________________________________________

## ADR-001: Use DeepAgents as the Agent Runtime

**Context**: We needed an agent framework for multi-agent patent pipeline orchestration. Options were building a custom framework, using LangGraph directly, or adopting the upstream `langchain-ai/deepagents` package.

**Decision**: Adopt `langchain-ai/deepagents` as the bounded runtime layer. It provides `create_deep_agent`, middleware stack (`FilesystemMiddleware`, `MemoryMiddleware`, `SkillsMiddleware`, `SubAgentMiddleware`, `HumanInTheLoopMiddleware`), checkpointer-backed HITL, and typed event streaming out of the box.

**Consequences**:

- Positive: Avoided building a second agent runtime; upstream handles planning, delegation, HITL, memory
- Positive: Middleware composability lets us layer domain-specific behavior (permissions, skills) on top
- Negative: Credential propagation requires `os.environ` bridge because LangChain's `init_chat_model()` reads from env, not pydantic-settings
- Negative: Runtime depends on upstream release cadence for fixes

______________________________________________________________________

## ADR-002: YAML Filesystem Persistence (Deferred DB Migration)

**Context**: The application stores idea records, scores, state history, transcripts, and artifacts. Initial options were SQLite/PostgreSQL or filesystem YAML/Markdown.

**Decision**: Use YAML/Markdown filesystem persistence under `workspace/ideas/IDEA-XXXX/`. Defer database migration until YAML shows measurable scaling bottlenecks.

**Consequences**:

- Positive: Zero infrastructure; every idea folder is self-contained and human-readable
- Positive: Easy to debug, inspect, and manually repair
- Positive: Git-friendly for development; changes are plain-text diffs
- Negative: No query engine; list/filter operations require full scan
- Negative: No concurrent write safety without file locking
- Negative: Migration to DB will require schema design + data migration

______________________________________________________________________

## ADR-003: CompositeBackend with Route-Based Filesystem Access

**Context**: The DeepAgents runtime needs structured filesystem access. Different directories have different access patterns (workspace read/write, KB read-only, skills read-only).

**Decision**: Use `CompositeBackend` with `StateBackend` as default and route-based `FilesystemBackend` instances for `/workspace/`, `/kb/`, `/instructions/`, `/memories/`, `/skills/`.

**Consequences**:

- Positive: Clear access boundaries per directory; agent cannot write to KB or skills
- Positive: Virtual mode prevents agents from seeing real absolute paths
- Positive: Easy to add new routes (e.g., `/filings/`) later
- Negative: Route configuration is static; cannot add routes at runtime

______________________________________________________________________

## ADR-004: 18-State `transitions` Library State Machine

**Context**: The patent workflow has 18 sequential states across 6 phases. We needed a state machine with lifecycle hooks, gate validation, and history recording.

**Decision**: Use the `transitions` Python library for the `PatentWorkflowMachine`. Define states, transitions, gate names, and agent ownership in `state/definitions.py`; gate logic in `state/gates.py`; machine class in `state/machine.py`.

**Consequences**:

- Positive: Clear declarative state machine; easy to add/modify transitions
- Positive: Lifecycle hooks (`on_entry`, `validate`, `on_exit`) map cleanly to gate checks and event emission
- Positive: Separated from agent runtime; domain logic stays independent of agent framework
- Negative: Linear only; no branching or parallel states (acceptable for patent pipeline)
- Negative: No built-in persistence; state must be manually saved/loaded from YAML

______________________________________________________________________

## ADR-005: SSE-Based Real-Time Event Streaming

**Context**: Frontend needs live updates for workflow transitions, scoring, agent activity, and HITL interrupts. Options were WebSocket, SSE, polling.

**Decision**: Use Server-Sent Events (SSE) via FastAPI `StreamingResponse`. One `/api/sse` endpoint with event type tagging. SSE bus in `infrastructure/events/stream_bus.py`.

**Consequences**:

- Positive: Simple unidirectional server-to-client streaming; all major browsers support EventSource
- Positive: Works with HTTP/1.1; no upgrade handshake
- Positive: Autoreconnect built into EventSource API
- Negative: Unidirectional only; client-to-server messages require separate REST/POST endpoints
- Negative: Limited to ~6 concurrent connections per browser (HTTP/1.1); use HTTP/2 for scale
- Negative: No backpressure; fast producer can overwhelm slow consumer

______________________________________________________________________

## ADR-006: Typed Transcript Event Model

**Context**: The UI renders a live transcript of agent activity. We needed a structured event model that distinguishes user messages, agent thinking, tool calls, subagent handoffs, interrupts, approvals, and failures.

**Decision**: Define `TranscriptEventType` (14 types) and `TranscriptRole` (7 roles) enums in `models/transcript.py`. Persist events as `transcript.yaml` per idea. Normalize events with `normalize_transcript_event()` for metadata enrichment.

**Consequences**:

- Positive: UI can render each event type with appropriate styling (thinking animation, tool card, approval badge)
- Positive: Provenance and trust metadata per event enables audit trail
- Positive: Frontend can filter by type or role
- Negative: Event schema is custom; not directly compatible with upstream DeepAgents event model
- Negative: Storage grows linearly with event count; no compaction strategy yet

______________________________________________________________________

## ADR-007: Durable Disk-Backed HITL Interrupts

**Context**: HITL interrupts must survive server restarts. In-memory interrupt queue loses pending approvals on restart.

**Decision**: Persist pending interrupts to a JSON file on disk. Load on startup. Record approval/rejection decisions in transcript events.

**Consequences**:

- Positive: Interrupts survive container restart
- Positive: Simple JSON serialization; no DB needed
- Negative: Race condition if multiple server processes modify the file; single-process assumption
- Negative: No interrupt history cleanup; file grows with approvals over time

______________________________________________________________________

## ADR-008: InMemorySaver Checkpointer (Non-Persistent)

**Context**: The DeepAgents runtime needs a checkpointer for state persistence across interrupt/resume cycles. Options were `InMemorySaver`, `SqliteSaver`, or `PostgresSaver`.

**Decision**: Use `InMemorySaver` because the domain state machine (state/machine.py) is the source of truth for workflow state. The checkpointer only needs to hold active thread state during a user session.

**Consequences**:

- Positive: Zero infrastructure; works out of the box
- Positive: Active run state is ephemeral and session-scoped
- Negative: Active agent runs lost on server restart (acceptable since domain state is in YAML)
- Negative: Cannot resume interrupted runs across restarts; user must retrigger
- Note: Switch to `SqliteSaver` if cross-restart run resumption is needed

______________________________________________________________________

## ADR-009: Credential Propagation via `os.environ`

**Context**: LangChain's `init_chat_model()` (called by `create_deep_agent`) reads credentials from OS environment variables only. pydantic-settings reads from `.env` into a `Settings` object.

**Decision**: After loading `.env` into `Settings`, propagate `OPENAI_API_KEY`, `OPENAI_API_BASE`, and `OPENAI_MODEL_NAME` to `os.environ` at module import time in `config.py`.

**Consequences**:

- Positive: Single source of truth (`.env` file); LangChain picks up env vars automatically
- Positive: Standard approach; all LangChain/OpenAI SDKs use the same pattern
- Negative: Side effect at import time; importing config.py modifies global os.environ
- Negative: If you set credentials programmatically, you must set env vars before importing LangChain

______________________________________________________________________

## ADR-010: Google Patents XHR JSON Adapter for Prior Art

**Context**: Prior art search needed real data instead of simulated results. Options were scraping patent office HTML, using a commercial API (Google Patents API, PatSnap, etc.), or adapting the structured Google Patents XHR JSON endpoint.

**Decision**: Implement a structured adapter that queries Google Patents' internal XHR JSON API. Tag results with source provenance and trust level.

**Consequences**:

- Positive: Structured JSON responses instead of HTML scraping
- Positive: No API key required; no rate limiting beyond browser-like requests
- Negative: Unofficial/internal endpoint; may break without notice
- Negative: Limited metadata compared to commercial patent APIs

______________________________________________________________________

## ADR-011: Supervisor Agent Replaces Procedural 13-State Loop

**Context**: `run_full_pipeline()` originally looped through 13 states procedurally, calling each subagent in sequence. This was brittle and hard to extend.

**Decision**: Define a `supervisor-agent` subagent that receives the full pipeline context and coordinates delegations autonomously. `run_full_pipeline()` now delegates to `execute_deep_agent_workflow()` with pipeline_supervisor context. FSM and scoring catch up after the supervisor returns.

**Consequences**:

- Positive: Single agent invocation replaces 13-step procedural loop
- Positive: Supervisor can adapt execution order based on idea state
- Negative: Supervisor depends on LLM reasoning; could miss steps the procedural loop handled deterministically
- Negative: FSM and scoring must "catch up" after supervisor returns; potential state inconsistency

______________________________________________________________________

## ADR-012: v3 Async Streaming Protocol (`astream_events`)

**Context**: The original streaming used v2 raw events with custom parsing. v3 provides structured projections with subagent, message, and tool_call streams.

**Decision**: Use `astream_events(version="v3")` with typed keys (`stream.messages`, `stream.subagents`). Consume via `asyncio.Queue` + `asyncio.gather`. Fall back to v2 if v3 is unavailable.

**Consequences**:

- Positive: Structured event types (message, tool_call, subagent) instead of raw LangGraph events
- Positive: Queue-based concurrent consumption prevents event loss under load
- Positive: Graceful v2 fallback for backward compatibility
- Negative: v3 protocol is specific to later LangGraph releases; depends on version compatibility

______________________________________________________________________

## ADR-013: LangChain MCP Adapters for External Tool Integration

**Context**: We needed a standard way to add external tools (research sources, databases, APIs) to the agent runtime without building custom adapters for each source.

**Decision**: Install `langchain-mcp-adapters` and configure optional MCP server loading via `MCP_SERVERS` env var. Runtime loads MCP tools via `MultiServerMCPClient` when servers are configured.

**Consequences**:

- Positive: Any MCP-compatible server can be plugged in without code changes
- Positive: Graceful skip when no servers configured or adapter unavailable
- Negative: MCP protocol dependency; server compatibility depends on MCP ecosystem
- Negative: MCP tools bypass the permissions model (FilesystemBackend does not apply)

______________________________________________________________________

## ADR-014: APScheduler Disabled by Default

**Context**: APScheduler ran autonomous generation cycles on a timer. With the supervisor agent managing the pipeline, a timer-based scheduler is redundant and can cause conflicting concurrent runs.

**Decision**: Default `WORKFLOW_SCHEDULER_ENABLED=false`. `start_scheduler()` checks the flag and no-ops when disabled. The supervisor agent is the preferred scheduling mechanism.

**Consequences**:

- Positive: No conflicting scheduler/supervisor runs
- Positive: One less moving part; supervisor handles timing and coordination
- Negative: Pipeline must be triggered manually or via supervisor; no automated periodic runs without an external trigger

______________________________________________________________________

## ADR-015: No Sandbox / Code Execution

**Context**: Some agent systems execute generated code in sandboxes. This is a common feature in agent frameworks.

**Decision**: Explicitly defer sandbox execution. The agent runtime only reads/writes files, calls the LLM, and uses MCP tools. No shell execution or code runner integration.

**Consequences**:

- Positive: No security surface from arbitrary code execution
- Positive: Simpler runtime; no Docker-in-Docker or sandbox infrastructure
- Negative: Cannot run generated Python scripts or validate code-based inventions automatically
- Negative: Must add sandbox if code generation/validation becomes a requirement
