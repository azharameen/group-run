# Deferred Work Ledger

## Deferred from: code review of EP-0 dead code cleanup (2026-08-03)

- Backend Siemens strings in agent prompts and model fields (`backend/app/agent/runtime.py`, `domain_tools.py`, `context.py`, `models/idea.py`) — structural domain data changes require product decisions for replacement names and data migration
- LANGGRAPH_STRICT_MSGPACK validator breaks tests on fresh environments (`backend/app/config.py:38-43`) — runs at module import time before pytest fixtures can monkeypatch; add `.env.example` or autouse conftest fixture in ST-1.2

## Deferred from: code review of 1-1-create-teams-yaml-and-mcp-json (2026-08-03)

- `model: "auto"` no fail-safe guarantee — loader must resolve "auto" eagerly and fail fast if no platform default is available
- No timeout/retry on MCP servers — loader must enforce timeout fields for HTTP transports or provide safe defaults
- stdio npx dependency may not exist on host — placeholder example, replace with real server config when MCP is onboarded
- localhost URL fails in Docker/K8s — placeholder example, use service names or env var substitution in production
- Duplicate routing_keys across teams causes ambiguous routing — loader must validate global uniqueness when multiple teams exist
- subgraph.nodes string references lack referential integrity — loader must validate every node exists in the agents list
- Empty teams/servers degrade silently — loader must treat empty collections as a configuration error (fail fast)
- Open-ended options dict has no schema validation — loader must define and validate expected option keys per transport type

## Deferred from: code review of 1-2-update-config-py and 1-3-rewrite-api-app-py (2026-08-03)

- Import-time config crash on missing LANGGRAPH_STRICT_MSGPACK (`backend/app/config.py:37-44`) — AD-11 fail-fast design decision; already tracked in EP-0 deferred entry, confirmed intentional for EP-1
- SQLite connection never closed in lifespan teardown (`backend/app/services/thread_manager.py`) — `get_checkpointer()` creates a persistent sqlite3.Connection that is never closed; file handles and locks persist across reloads, especially problematic on Windows
- Shared SQLite connection concurrency risk (`backend/app/services/thread_manager.py:41`) — `check_same_thread=False` with a single global connection is not safely concurrent under load; EP-7 story 7-4 (sqlite-concurrency-tests) planned to address

## Deferred from: code review of 2-5-thread-list-sidebar-with-create-switch-delete (2026-08-05)

- Missing import of `execute_deep_agent_workflow_streaming` in `chat.py:69` — pre-existing NameError bug, function called but never imported; not caused by this diff
- Silent UI inconsistency in pre-existing `confirmRename` and `confirmDelete` (`nav-threads.tsx:90-92,113-114`) — same listThreads-failure pattern as create but in pre-existing code
- Hardcoded "New Chat" title with no idea context (`nav-threads.tsx:126`) — every thread gets indistinguishable title until renamed; requires product decision for idea-aware defaults
- Blocking `asyncio.run()` at module import can hang startup (`runtime.py:63`) — pre-existing pattern, diff adds MCP timeout but doesn't fix blocking behavior
- `agent_timeout_sec` config defined but never consumed (`config.py:28`) — forward planning for story 2.7 AC 1-2, not wired to any streaming call yet

## Deferred from: code review of 1-5-wire-deepagents-runtime-into-supervisor (2026-08-05)

- `asyncio.run()` in `_create_mcp_tools()` crashes inside active event loop (`runtime.py:126`) — pre-existing pattern from ST-1.4, flagged in ST-1.4 review as out-of-scope; any async host/notebook/ASGI context raises `RuntimeError`; requires async MCP loading redesign

## Deferred from: code review of 1-8-backend-tests-supervisor-chat-sse-test-db-isolation (2026-08-09)

- Incomplete module cleanup edge cases — tests use `sys.modules` clearing patterns that may not fully isolate all dependencies; acceptable risk for current test scope, address if flaky tests emerge
- LangGraph `ensure_valid_checkpointer()` rejects MagicMock — real `SqliteSaver` required for graph compilation tests; addressed by using actual in-memory SqliteSaver, but mocking checkpointer directly remains unsupported

## Deferred from: code review of 1.9 and 1.10 (2026-08-10)

- O(n) transcript growth via React state (`useChatStream.ts`) — React message state appends grow linearly; virtualization needed only at scale, acceptable for current usage
- Partial SSE frames dropped on disconnect (`threads.ts`) — server restart or proxy timeout mid-chunk may cause partial JSON; requires retry/backoff logic, rare edge case
- Concurrent send accumulator shared (`useChatStream.ts`) — rapid double-submit during one stream merges chunks into single message; requires per-message accumulator, rare edge case
- Global SSE events for other ideas pollute active chat (`useChatStream.ts`) — `agent.progress` events fire for all ideas; intentional design to surface background work, filter by idea ID would require backend changes
- Thread-scoped in-flight stream abort (`useChatStream.ts:96-125`) — switching threads during active stream doesn't cancel in-flight request; requires refactoring stream lifecycle, users rarely switch mid-stream

## Deferred from: code review of 1.11 frontend tests (2026-08-11)

- Queue drain test bypasses real 200ms setTimeout (`useChatStream.test.tsx:222-244`) — intentional test design; queue empties immediately when message is popped, direct executeSend call tests send logic without waiting 200ms; real drain behavior tested indirectly through queue emptying assertion

## Deferred from: code review of 2-1-clean-up-api-routes-threads-py (2026-08-07)

- `idea_id` accepted in stream endpoint but never passed to `ainvoke` (`threads.py:122`) — pre-existing pattern; `execute_deep_agent_workflow_streaming` doesn't accept idea_id parameter; supervisor doesn't use idea_id for routing

## Deferred from: code review of 2-3-backend-tests-thread-crud-checkpoint-restoration (2026-08-07)

- No test validates `config={"configurable": {"thread_id": ...}}` forwarding to supervisor (`threads.py:128`) — ainvoke receives config but no test asserts it was passed correctly; requires mock ainvoke that captures and verifies config argument
- No test validates error classification codes from supervisor (`supervisor.py:65-90`) — `_error_code()` and `_user_friendly_error()` classify errors into agent_timeout, agent_rate_limited, agent_auth_failed; none of the error handling tests verify these codes propagate through the stream
- `aiosqlite` DeprecationWarning "There is no current event loop" (`aiosqlite/core.py:127`) — `AsyncSqliteSaver` created outside async context during synchronous graph compilation; will break when `get_event_loop()` is deprecated; requires creating async checkpointer within an async context
