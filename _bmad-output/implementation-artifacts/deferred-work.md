
## Resolved from: Epic 4 Retro — Deferred Debt Triage (2026-08-09)

- [RESOLVED] `asyncio.run()` in MCP tools hangs inside active event loop (`runtime.py:_create_mcp_tools()`) — replaced with graceful warning + empty return when inside active loop
- [RESOLVED] Empty teams/servers degrade silently (`runtime.py:_load_and_validate_teams()`) — added fail-fast validation for empty teams
- [RESOLVED] subgraph.nodes string references lack referential integrity (`runtime.py`) — loader now validates every node exists in agents list
- [RESOLVED] Duplicate routing_keys across teams cause ambiguous routing (`runtime.py`) — loader validates global uniqueness
- [RESOLVED] SQLite connection never closed in lifespan teardown (`app.py:lifespan()`) — shutdown sequence closes both sync and async connections and resets singletons
- [RESOLVED] Empty YAML registry file crashes (`registry.py:load_idea_registry()`) — added None guard for `yaml.safe_load("")`
- [RESOLVED] LANGGRAPH_STRICT_MSGPACK validator crashes on missing env (`config.py:validate_strict_msgpack()`) — reads `os.environ` directly to distinguish "not set" from "set to wrong value"
- [RESOLVED] Thread test isolation failures (18/23 fail in full suite) (`thread_manager.py:get_checkpointer()`) — added connection health check that reconnects if the existing connection was closed

## Resolved from: spec-4-7-frontend-tests-approval-ui.md (2026-08-09)

- [RESOLVED] No test coverage for approve/reject action flow at CommandCenter integration level
  - Added approve/reject buttons to mock ChatPane + 2 integration tests verifying handleApproveInterrupt/handleRejectInterrupt calls
- [RESOLVED] No test that activeInterruptIdRef is reset after approve allowing same-ID reprocessing
  - Added test in useChatStream.test.tsx verifying approve clears ref and same-ID reprocessing is accepted
- [RESOLVED] Missing negative test for interrupt.approved with non-matching ID
  - Added test verifying pendingInterrupt remains when approved event has different ID
# Deferred Work Ledger

## Deferred from: code review of EP-0 dead code cleanup (2026-08-03)

- Backend Siemens strings in agent prompts and model fields (`backend/app/agent/runtime.py`, `domain_tools.py`, `context.py`, `models/idea.py`) — structural domain data changes require product decisions for replacement names and data migration
- ~~LANGGRAPH_STRICT_MSGPACK validator breaks tests on fresh environments (`backend/app/config.py:38-43`)~~ — **RESOLVED 2026-08-09**: reads `os.environ` directly for lazy validation

## Deferred from: code review of 1-1-create-teams-yaml-and-mcp-json (2026-08-03)

- `model: "auto"` no fail-safe guarantee — loader must resolve "auto" eagerly and fail fast if no platform default is available
- No timeout/retry on MCP servers — loader must enforce timeout fields for HTTP transports or provide safe defaults
- stdio npx dependency may not exist on host — placeholder example, replace with real server config when MCP is onboarded
- localhost URL fails in Docker/K8s — placeholder example, use service names or env var substitution in production
- ~~Duplicate routing_keys across teams causes ambiguous routing~~ — **RESOLVED 2026-08-09**: loader validates global uniqueness
- ~~subgraph.nodes string references lack referential integrity~~ — **RESOLVED 2026-08-09**: loader validates every node exists in agents list
- ~~Empty teams/servers degrade silently~~ — **RESOLVED 2026-08-09**: loader treats empty collections as configuration error (fail fast)
- Open-ended options dict has no schema validation — loader must define and validate expected option keys per transport type

## Deferred from: code review of 1-2-update-config-py and 1-3-rewrite-api-app-py (2026-08-03)

- ~~Import-time config crash on missing LANGGRAPH_STRICT_MSGPACK~~ (`backend/app/config.py:37-44`) — **RESOLVED 2026-08-09**: lazy validation from os.environ
- ~~SQLite connection never closed in lifespan teardown~~ (`backend/app/services/thread_manager.py`) — **RESOLVED 2026-08-09**: lifespan shutdown closes connections and resets singletons
- Shared SQLite connection concurrency risk (`backend/app/services/thread_manager.py:41`) — `check_same_thread=False` with a single global connection is not safely concurrent under load; EP-7 story 7-4 (sqlite-concurrency-tests) planned to address

## Deferred from: code review of 2-5-thread-list-sidebar-with-create-switch-delete (2026-08-05)

- Missing import of `execute_deep_agent_workflow_streaming` in `chat.py:69` — pre-existing NameError bug, function called but never imported; not caused by this diff
- Silent UI inconsistency in pre-existing `confirmRename` and `confirmDelete` (`nav-threads.tsx:90-92,113-114`) — same listThreads-failure pattern as create but in pre-existing code
- Hardcoded "New Chat" title with no idea context (`nav-threads.tsx:126`) — every thread gets indistinguishable title until renamed; requires product decision for idea-aware defaults
- ~~Blocking `asyncio.run()` at module import can hang startup~~ (`runtime.py:63`) — **RESOLVED 2026-08-09**: replaced with graceful warning + empty return when inside active loop

## Deferred from: code review of 3-3-validate-workspace-filesystem-management (2026-08-07)

- source_spec: `spec-3-3-validate-workspace-filesystem-management.md`
  summary: External code importing removed functions will fail with ImportError
  evidence: `write_handover` and `clear_idea_runtime_state` are removed from `idea_workspace.py` and `yaml_io.py`; any consumer importing these will get ImportError

- source_spec: `spec-3-3-validate-workspace-filesystem-management.md`
  summary: String-based dispatch may reference removed function names
  evidence: Function names could appear in dynamic `getattr()`, config, tests, or scripts; repo-wide text search recommended

- source_spec: `spec-3-3-validate-workspace-filesystem-management.md`
  summary: Existing `idea.yaml` files retain stale FSM runtime fields
  evidence: `clear_idea_runtime_state()` removal means no path to reset `active_processing`, `active_agent`, `active_state`, `active_message` fields

- source_spec: `spec-3-3-validate-workspace-filesystem-management.md`
  summary: Existing `handovers/*.md` files become dead data
  evidence: `write_handover()` removal doesn't delete existing handover artifact files
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

## Deferred from: code review of 2-4-update-use-thread-manager (2026-08-11)

- `ensureThread` returns stale thread ID if active thread was deleted elsewhere — `activeThreadIdRef.current` is checked but the thread may no longer exist in the server's thread list; requires deciding whether to validate against current thread list before returning
- Concurrent mutations from multiple components cause `refreshThreads` races — multiple simultaneous `updateThread`/`deleteThread` calls trigger parallel `listThreads` fetches with no deduplication; older responses can overwrite newer state; needs in-flight request deduplication
- `refreshThreads` swallows fetch errors after mutations — errors logged to console but not surfaced to user via toast; user sees mutation succeed but UI doesn't update; needs error notification for mutation-after refresh failures

## Deferred from: code review of spec-3-1-rewrite-api-routes-ideas-py.md (2026-08-07)

- Race condition on idea ID generation allows duplicate IDs under concurrent requests — `load_idea_registry() → read next_id → increment → save_idea_registry()` is not atomic; no file lock or mutex protects the counter
- Empty registry file causes `load_idea_registry` to return None, crashing list_ideas and create_idea — `yaml.safe_load("")` returns None; no None guard when file exists but is empty
- `archive_idea_folder` copies but does not delete source folder, leaving duplicate data in workspace — `shutil.copytree` followed by return; no `shutil.rmtree(folder)` follows
- Partial failure in delete_idea leaves inconsistent state if folder deletes but registry removal fails — idea becomes zombie-listed in registry with no filesystem data

## Deferred from: code review of 3-2-update-models-idea-py.md (2026-08-07)

- `Idea` and `IdeaRegistry` Pydantic models defined but never instantiated — all CRUD code in `routes/ideas.py`, `storage/registry.py`, `storage/yaml_io.py` works with raw `dict` objects; models provide zero runtime validation benefit
- `write_handover` in `idea_workspace.py:44` — orphaned dead code that generates filenames like `"{from_state}-to-{to_state}.md"`; designed for `WorkflowState` transitions no longer in codebase
- `clear_idea_runtime_state` in `idea_workspace.py:73` — orphaned function that writes fields (`active_processing`, `active_agent`, etc.) to `idea.yaml` with no code reading them back; zero callers
- `datetime.utcnow()` deprecated in Python 3.12+ — `Idea.created_at` and `Idea.updated_at` use naive UTC timestamps; migrate to `datetime.now(timezone.utc)`

## Deferred from: code review of 3-4-backend-tests-ideas-crud-workspace-files (2026-08-07)

- source_spec: `spec-3-4-backend-tests-ideas-crud-workspace-files.md`
  summary: CRUD tests assert only status codes, not payload content
  evidence: test_create_with_title, test_delete_existing, test_archive_existing assert 200 but don't verify response body fields (idea_id, message, archive_path)

- source_spec: `spec-3-4-backend-tests-ideas-crud-workspace-files.md`
  summary: Missing idea_id format validation on POST/DELETE/archive/comment paths
  evidence: Only GET paths test malformed idea_id via parametrize; POST /ideas/{idea_id}/update, DELETE /ideas/{idea_id}, POST /ideas/{idea_id}/archive, POST /ideas/{idea_id}/comment are untested for invalid IDs

- source_spec: `spec-3-4-backend-tests-ideas-crud-workspace-files.md`
  summary: No post-CRUD registry/YAML consistency checks
  evidence: test_create_with_title doesn't verify idea appears in registry or idea.yaml; test_delete_existing doesn't verify idea removed from registry

- source_spec: `spec-3-4-backend-tests-ideas-crud-workspace-files.md`
  summary: Binary file test only checks content is truthy
  evidence: test_workspace_files_binary_files asserts `blob['content']` is truthy but doesn't verify encoding safety or that binary files produce the expected fallback string

- source_spec: `spec-3-4-backend-tests-ideas-crud-workspace-files.md`
  summary: test_list_with_data checks only count, not idea contents
  evidence: test_list_with_data asserts `count == 1` but doesn't verify idea_id, title, or timestamps in the returned list

## Deferred from: code review of 4-1-create-interrupt-management-service (2026-08-08)

- source_spec: `spec-4-1-create-interrupt-management-service.md`
  summary: Test coverage gaps for edge cases (non-serializable tool_input, concurrent approve/reject race, DB corruption)
  evidence: 6 tests cover happy paths and basic transitions but lack concurrency tests, error handling tests, and API-level integration tests

- source_spec: `spec-4-1-create-interrupt-management-service.md`
  summary: No validation on message emptiness or tool_input payload size
  evidence: CreateInterruptRequest accepts empty strings and unlimited dict payloads; SQLite and API may degrade with oversized inputs

## Deferred from: code review of 4-2-create-sse-bridge-for-interrupt-events (2026-08-08)

- source_spec: `spec-4-2-create-sse-bridge-for-interrupt-events.md`
  summary: SSE endpoint test doesn't verify stream yields SSE frames
  evidence: test_sse_endpoint_returns_streaming_response checks return type but not that _bus.subscribe() produces SSE-formatted output; StreamBus has its own tests but bridge-level integration is untested

- source_spec: `spec-4-2-create-sse-bridge-for-interrupt-events.md`
  summary: Publish failure silently drops event without DB rollback
  evidence: _bus.publish() is called after commit() succeeds; if publish fails, DB is committed but no event is emitted, leaving frontend out of sync

## Deferred from: code review of 4-3-api-route-tests-for-interrupt-endpoints (2026-08-08)

- source_spec: `spec-4-3-api-route-tests-for-interrupt-endpoints.md`
  summary: Error response bodies not verified in route tests
  evidence: Tests check status codes (404, 409) but don't assert response body content; regressions in error payloads would slip through

- source_spec: `spec-4-3-api-route-tests-for-interrupt-endpoints.md`
  summary: Pending list filtering and ordering not validated
  evidence: test_list_pending_with_data inserts one item and checks count; no test verifies resolved interrupts are excluded or ordering is correct

- source_spec: `spec-4-3-api-route-tests-for-interrupt-endpoints.md`
  summary: Cross-resolution conflicts not tested (approve then reject)
  evidence: "Already resolved" tests only re-apply the same verb; cross-action conflicts (approve→reject, reject→approve) are untested

- source_spec: `spec-4-3-api-route-tests-for-interrupt-endpoints.md`
  summary: Malformed interrupt IDs not tested
  evidence: Not-found tests use fabricated "missing" string; no test validates that malformed IDs (non-UUID format) are distinguished from valid-but-absent IDs

- source_spec: `spec-4-3-api-route-tests-for-interrupt-endpoints.md`
  summary: Route tests don't verify DB persistence after approve/reject
  evidence: Tests assert response status but don't verify the interrupt is actually persisted as resolved in the DB

- source_spec: `spec-4-3-api-route-tests-for-interrupt-endpoints.md`
  summary: Decision payload validation not tested against endpoint action
  evidence: Approve/reject endpoints accept decision field in request body but don't validate it matches the endpoint action; wrong status transition could be accepted

## Deferred from: code review (2026-08-09)

- source_spec: `spec-4-5-create-hitl-approval-ui-component.md`
  summary: HITLApprovalCard and InterruptInbox import from `@/api/threads` directly instead of `@/api/client`
  evidence: Functions are re-exported through `@/api/client`, so no behavioral issue; refactor for consistency

- source_spec: `spec-4-6-wire-approval-ui-into-chat-stream.md`
  summary: Duplicate SSE subscriptions — InterruptInbox and useChatStream create independent SSE connections for interrupt events
  evidence: Each manages its own state independently; acceptable as separate component responsibilities; architectural improvement candidate

- source_spec: `spec-4-6-wire-approval-ui-into-chat-stream.md`
  summary: SSE reconnect doesn't reload interrupt state — interrupt overlay may become stale on connection drop
  evidence: useChatStream SSE effect has no reconnect handler to reconcile interrupt state


- source_spec: spec-4-7-frontend-tests-approval-ui.md
  summary: No test coverage for approve/reject action flow at CommandCenter integration level
  evidence: CommandCenter mock ChatPane does not render approve/reject buttons, so user approval flow cannot be tested end-to-end
- source_spec: spec-4-7-frontend-tests-approval-ui.md
  summary: No test that activeInterruptIdRef is reset after approve allowing same-ID reprocessing
  evidence: Production dedup logic skips same ID; after approve ref is cleared but no test verifies new same-ID interrupt is accepted
- source_spec: spec-4-7-frontend-tests-approval-ui.md
  summary: Missing negative test for interrupt.approved with non-matching ID
  evidence: Test suite only tests matching ID clear behavior; non-matching ID no-op is not verified
- source_spec: 5-1-create-mcp-server-management-api.md
  summary: Add file locking for concurrent MCP config writes (TOCTOU race condition in add/remove)
  evidence: MCPServerManagementService loads, modifies, and saves mcp.json without file locking. Concurrent requests could cause lost updates under uvicorn async workers.
  severity: medium
  resolution: Evaluate filelock library or atomic write pattern (write to temp + os.replace()) in a dedicated story.

## Deferred from: code review of 5-2-create-config-reload-endpoint (2026-08-12)

- Unauthenticated config reload endpoint — no auth/permission check on POST /api/config/reload; pre-existing pattern (all app endpoints are unauthenticated), defer until auth infrastructure is added
- Test coverage gaps for real lifecycle integration — tests patch internals but don't verify other modules re-read config after reload; pre-existing test pattern across codebase
- Monkeypatch strategy is brittle — `runtime.py` uses `from .. import config as _config` module reference to survive `sys.modules` clearing; pre-existing workaround inherited from test_chat_endpoint.py
- Permission errors propagate as 500 — `Path.read_text()` raises `PermissionError` not caught by `except ValueError`; pre-existing pattern also affects module-level load

## Deferred from: code review of 5-3-update-mcp-tool-loading (2026-08-12)

- _validate_mcp_config() doesn't check schema_version or validate server object fields (untime.py:197-230) — reload-mcp can return 200 for configs that _load_mcp_tools() later rejects; lightweight validation is intentional, full validation deferred to dedicated config quality story
- MCP_CONFIG_PATH = None raises unhandled TypeError (untime.py:206) — Path(None) crashes instead of returning clean error; pre-existing pattern, would require config module guard
- Duplicate server names silently overwrite in connections dict (untime.py:172) — later entries override earlier ones without warning; pre-existing pattern in array-to-dict conversion

## Deferred from: code review of 5-4-create-team-subgraph-factory (2026-08-09)

- Circular import risk if runtime.py imports from team_factory.py for supervisor integration — team_factory.py imports from app.agent.runtime (_teams_config, _load_mcp_tools, _load_system_prompt); when supervisor integration adds imports from team_factory back into runtime, circular dependency will occur. Consider lazy imports or a shared config module.

- [PENDING] Duplicate import in mcp.py: rom pydantic import ValidationError appears on lines 10 and 14 — pre-existing dead code from Story 5.1 refactor (source_spec: spec-5-5-backend-tests-mcp-config-reload-team-loading.md)

- source_spec: 'spec-5-5-backend-tests-mcp-config-reload-team-loading.md'
  summary: 'Duplicate rom pydantic import ValidationError import in mcp.py lines 10 and 14 — pre-existing dead code'
  evidence: 'Grep shows two identical imports; second is dead code from ST-5.1 refactor'
