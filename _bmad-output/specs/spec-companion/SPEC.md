---
id: SPEC-companion
companions:
  - entity-ownership.md
  - stack.md
  - deferred-decisions.md
  - ../planning-artifacts/architecture/architecture-Companion-2026-08-02/ARCHITECTURE-SPINE.md
sources:
  - docs/prd.md
  - docs/features.md
  - docs/architecture-decisions.md
  - _bmad-output/project-context.md
---

> **Canonical contract.** This SPEC and the files in `companions:` are the complete, preservation-validated contract for what to build, test, and validate. Source documents listed in frontmatter are for traceability only — consult them only if you need narrative rationale or prose color this contract intentionally omits.

# Companion — Agentic Organization Platform

## Why

Solo developer Ameen is pivoting the "Companion" project from a Siemens Patent Ideator (18-state FSM, YAML persistence, custom SSE) to a general-purpose Agentic Organization Platform. The current codebase mixes dead FSM code with partial LangGraph adoption, creating dual-paradigm drift that makes every change risky. The goal is a clean migration to LangGraph + DeepAgents as the sole orchestration paradigm, with all dead code removed, a 2-service architecture (frontend + backend), and an AI-agent-friendly codebase where BMad skills can autonomously build, review, and correct code without drift.

## Capabilities

- **CAP-1** — Agentic AI Chat
  - **intent:** User can converse with AI agents via a chat interface that routes intent to specialist teams.
  - **success:** User sends a message, supervisor routes to the correct team, team executes and returns a structured response visible in the chat UI within 500ms initial response.

- **CAP-2** — Tool Calling
  - **intent:** Agents can invoke tools (filesystem read/write, MCP adapters, memory operations) during conversation.
  - **success:** Agent calls a tool, the tool executes within CompositeBackend boundaries, and the result is streamed back to the user via SSE.

- **CAP-3** — Agent Memory
  - **intent:** Agents maintain long-term memory across conversations using memory middleware.
  - **success:** Agent recalls information from a previous conversation thread when prompted, verified by memory middleware loading from `/memories/` backend.

- **CAP-4** — Agent Skills
  - **intent:** Agents load and execute skill files from a configured skills directory.
  - **success:** Agent loads a skill file from `/skills/` and uses it to perform a specialized task, verified by transcript showing skill invocation.

- **CAP-5** — HITL Approval
  - **intent:** Destructive filesystem operations (write, delete, overwrite) require human approval before execution.
  - **success:** Agent attempts a write operation, frontend shows an approval prompt, user approves or rejects, and the operation completes or is cancelled accordingly.

- **CAP-6** — Ideas Management
  - **intent:** User can create, list, view, update, delete, and archive ideas. This covers the data lifecycle (CRUD, filtering, scoring display) — not the AI research itself.
  - **success:** Full CRUD lifecycle completes for an idea, including creating from a signal, viewing detail with artifacts, updating fields, and archiving with HITL approval.

- **CAP-7** — Agentic Research
  - **intent:** Agents perform autonomous research on ideas including prior art search, novelty analysis, and artifact generation. This is the AI-driven research layer that feeds into ideas (CAP-6 manages the results).
  - **success:** Agent researches an idea, produces research artifacts in the workspace filesystem, and the user can view results in the Ideas detail page.

- **CAP-8** — MCP Integration
  - **intent:** Platform loads MCP servers from config (stdio + HTTP) and user can add HTTP-only MCP servers via UI.
  - **success:** Platform starts with MCP servers from `config/mcp.json`, user adds an HTTP MCP server via UI, and agents can invoke tools from that server.

- **CAP-9** — Workspace Filesystem
  - **intent:** Agents read and write workspace files through CompositeBackend with route-based permissions.
  - **success:** Agent reads from `/kb/` (read-only), writes to `/workspace/` (read/write), and is denied writes to `/kb/`, `/instructions/`, `/skills/`.

- **CAP-10** — Dynamic Teams
  - **intent:** Teams and agents are defined in YAML configuration files, loaded at startup, reloadable without restart.
  - **success:** Platform loads teams from `config/teams.yaml` at startup, config reload endpoint refreshes team definitions without process restart.

- **CAP-11** — Real-Time Streaming
  - **intent:** Agent activity streams to frontend in real-time via SSE with structured event types.
  - **success:** Frontend receives SSE events for thinking, tool calls, subagent activity, and interrupts, rendering them in the chat sidebar with < 200ms latency.

- **CAP-12** — Thread Management
  - **intent:** Conversations are organized into persistent threads with full message history.
  - **success:** User creates a thread, sends messages, switches to another thread, and returns to find full message history restored from SQLite checkpoints.

- **CAP-13** — Knowledge Base
  - **intent:** User can browse and search knowledge base documents that feed agent research.
  - **success:** User browses KB documents in the UI, agents can read from `/kb/` backend during research, and documents are tagged with source provenance.

- **CAP-14** — Ideas Dashboard
  - **intent:** Ideas page displays all ideas with filtering, scoring, and detail views.
  - **success:** Ideas page lists all ideas, user can filter by status, view scoring breakdown, and navigate to idea detail with full artifacts.

- **CAP-15** — Observability
  - **intent:** System provides health checks, statistics, and observability endpoints.
  - **success:** `GET /api/health` returns system status, `GET /api/stats` returns usage statistics, and LangSmith tracing is configurable via environment variables.

## Constraints

- **LangGraph 0.6.x + DeepAgents 0.6.8** are the sole orchestration paradigm. The `transitions` library, FSM state machines, YAML-based state persistence, and custom SSE event bus are dead code — do not import, extend, or reference.
- **2-service split only:** Frontend (React/Vite SPA served by Nginx) and Backend (FastAPI with LangGraph running in-process). No third microservice, no message queues, no service mesh.
- **SQLite via SqliteSaver** is the sole database. `SqliteSaver` is a single global singleton — creating new connections causes `database is locked`.
- **`graph.astream(input, version="v2")`** is the only streaming API. `stream_events(version="v3")` exists only in LangGraph 1.2+ and is incompatible.
- **No sandbox or code execution.** Agents cannot execute arbitrary code. DeepAgents file tools operate within CompositeBackend boundaries only.
- **Workspace filesystem** is the source of truth for ideas, research artifacts, and agent outputs. Database stores runtime state only (active threads, checkpoints, user preferences).
- **`LANGGRAPH_STRICT_MSGPACK=true`** is mandatory in all environments. Application startup validates and fails fast if missing.
- **All agent filesystem access** goes through `CompositeBackend` with explicit route mappings. Agents cannot access paths outside their configured workspace root.
- **MCP tools bypass the CompositeBackend permissions model** — this is a known security gap tracked for future hardening.
- **`config/mcp.json`** holds platform-level MCP server definitions (stdio + HTTP). Users can add HTTP-only MCP servers via the UI (stored in database).
- **Teams and agents** are defined in `config/teams.yaml`, loaded at startup, reloadable without full restart.
- **Config loading precedence:** `config/teams.yaml` → `config/mcp.json` → database overlay → environment variables (highest).
- **All background work** runs in-process within the FastAPI backend. No separate worker processes, no Celery/RQ, no external schedulers.
- **Docker-based deployment** with `docker-compose`. `APP_ROOT_DIR` env var pins workspace root in Docker.
- **Frontend uses custom SSE hooks** (`useChatStream`). No `langchain-react` or AI SDK.
- **Version pins:** Python 3.12, FastAPI 0.115.x, LangGraph 0.6.x, DeepAgents 0.6.8, React 18.3.x, Vite 5.4.x, TypeScript 5.5.x, Tailwind 3.4.x.
- **Naming conventions:** UUIDs v4 for all entities, ISO 8601 with timezone for dates, `snake_case` for Python/backend, `camelCase` for TypeScript/frontend.
- **File size limits:** route files < 150 lines, services/repositories < 200 lines, agent runtime < 200 lines.
- **Performance targets:** API response < 500ms, SSE event latency < 200ms, state transition < 2s.
- **Never fabricate output.** No silent fallback to fabricated agent success. Every failure is an explicit error/retry state.

## Non-goals

- **Postgres migration** — SQLite is sufficient for solo developer + small team. Migration happens only when measurable bottlenecks are hit.
- **Code execution sandbox** — high complexity (container runtime, seccomp, resource limits) not justified for core chat/ideas flow.
- **JWT authentication** — session-based auth sufficient for current scope.
- **Database-backed persistent data** — workspace filesystem works. Dual-write adds migration complexity.
- **Connector framework** (Slack, Gmail, Azure DevOps, etc.) — MCP covers the integration pattern. Specific connectors are future feature work.
- **Multi-tenant support** — solo dev + small team doesn't need tenant isolation.
- **Observability stack** (OpenTelemetry, Grafana) — console logging + FastAPI docs sufficient for now.
- **CI/CD pipeline** — Docker Compose works for local + staging. Deferred until team grows.
- **`@mention` routing** — supervisor handles intent routing; hard-coded mention parser is not needed.
- **Siemens-specific workflow** — the platform is general-purpose; patent-specific flows are team configurations, not core architecture.

## Success signal

The system runs as two Docker services (frontend + backend). A user opens the chat, sends a message, the supervisor routes it to a specialist team, the team executes with tool calls and memory, streams activity back via SSE in real-time, and the user sees a complete conversation thread with full history. All old FSM code is deleted, all imports resolve to LangGraph/DeepAgents primitives, and the test suite passes with no references to deprecated modules.

## Assumptions

- Solo developer context — architecture optimized for maintainability over operational simplicity.
- Postgres migration deferred until measurable bottlenecks (connection contention, WAL lock waits > 100ms p99).
- JWT authentication deferred — session-based auth sufficient for current scope.
- Major version upgrades reviewed quarterly, applied every 6 months at minimum.

## Open Questions

- **Connector framework scope and approach:** Slack, Gmail, Drive, Calendar, Azure DevOps, Firebase, GitHub, Perplexity — need dedicated brainstorming session to decide which connectors are priority, how they integrate (MCP vs custom), and the rollout timeline. Deferring until a `bmad-brainstorming` or `bmad-party-mode` session explores the design space.
