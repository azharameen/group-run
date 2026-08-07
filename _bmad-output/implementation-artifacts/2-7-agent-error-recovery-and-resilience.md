---
baseline_commit: 13e4b9566b4b94426038c37f143603d51db05d26
---

# Story 2.7: Agent Error Recovery and Resilience

Status: review

## Story

As a user of the Companion platform,
I want agent operations to handle failures gracefully with proper timeouts, retries, and error reporting,
so that transient issues (network glitches, LLM timeouts, MCP failures) don't crash my conversation and I get clear feedback when things go wrong.

## Acceptance Criteria

1. **Agent Invocation Timeout**: The supervisor graph enforces a configurable timeout on `agent.ainvoke()` calls:
   - Default timeout of 120 seconds (configurable via `AGENT_TIMEOUT_SEC` env var)
   - Timeout raises `asyncio.TimeoutError` which is caught and returned as a structured error
   - User sees: "Agent response timed out. Please try again." (not a raw exception)

2. **Exponential Backoff Retry for Transient Failures**: The supervisor implements retry logic for transient errors:
   - Retries up to 2 times (3 total attempts) on transient failures (timeout, rate limit 429, server error 5xx)
   - Exponential backoff: 1s, 2s delay between retries
   - Non-transient errors (auth failures, bad requests) are NOT retried
   - Each retry is logged at DEBUG level for observability

3. **Structured Error Responses**: All agent failures return consistent error shapes:
   - Supervisor errors: `{"error": {"code": "agent_timeout" | "agent_failure" | "agent_rate_limited", "message": "Human readable", "retryable": true/false}}`
   - Streaming errors emit `type: "error"` events with the same shape
   - Frontend receives and displays error messages clearly

4. **Streaming Error Propagation**: The chat stream endpoint properly handles and propagates errors:
   - Exceptions in `_chat_stream_generator` are caught and emitted as SSE error events
   - Stream closes cleanly with a `type: "done"` event even on error
   - No unhandled exceptions leak to FastAPI (which would return 500 HTML)

5. **MCP Server Timeout**: MCP tool loading enforces connection timeouts:
   - HTTP MCP servers have configurable timeout (default 10 seconds)
   - Failed MCP connections are logged and skipped gracefully (existing pattern preserved)
   - Timeout configuration added to `config/mcp.json` schema

6. **Graceful Degradation**: The system continues to function with partial failures:
   - If MCP tools fail to load, agent runs without them (existing pattern, verified)
   - If agent fails after all retries, user gets error message but chat remains usable
   - Thread state is preserved even if agent invocation fails

7. **Error Logging and Observability**: All errors are logged with structured context:
   - Agent failures logged with: thread_id, error_type, retry_count, elapsed_time
   - MCP failures logged with: server_name, error_type, timeout_value
   - No sensitive data (API keys, user messages) logged at ERROR level

## Tasks / Subtasks

- [x] **Task 1: Add agent timeout and retry logic to supervisor (AC: 1-2)**
  - [x] 1.1 Add `AGENT_TIMEOUT_SEC` config setting with default 120
  - [x] 1.2 Wrap `agent.ainvoke()` with `asyncio.wait_for()` timeout
  - [x] 1.3 Implement retry loop with exponential backoff for transient errors
  - [x] 1.4 Define transient error classification (timeout, 429, 5xx)
  - [x] 1.5 Update error returns to use structured error shape

- [x] **Task 2: Improve streaming error handling (AC: 3-4)**
  - [x] 2.1 Wrap `_chat_stream_generator` with try/except
  - [x] 2.2 Emit structured error events on failures
  - [x] 2.3 Ensure stream always ends with `type: "done"` event
  - [x] 2.4 Add error event type to `stream_bus.py` if needed

- [x] **Task 3: Add MCP timeout configuration (AC: 5)**
  - [x] 3.1 Add timeout field to MCP server config schema in `config/mcp.json`
  - [x] 3.2 Pass timeout to `MultiServerMCPClient` for HTTP transports
  - [x] 3.3 Log MCP connection failures with server name context

- [x] **Task 4: Enhance error logging and observability (AC: 7)**
  - [x] 4.1 Add structured error logging to supervisor with thread_id, error_type, retry_count
  - [x] 4.2 Add structured error logging to runtime for MCP failures
  - [x] 4.3 Verify no sensitive data leaks in error logs

- [x] **Task 5: Backend tests for error recovery (AC: 1-7)**
  - [x] 5.1 Test agent timeout triggers after configured time
  - [x] 5.2 Test retry logic retries transient errors exactly 2 times
  - [x] 5.3 Test non-transient errors are not retried
  - [x] 5.4 Test streaming error propagation emits error event
  - [x] 5.5 Test MCP timeout configuration is respected
  - [x] 5.6 Test graceful degradation when agent fails completely

## Dev Notes

### Current State Analysis

**What already exists (DO NOT BREAK):**
- `supervisor.py` has `try/except` around `agent.ainvoke()` catching all exceptions (lines 98-116)
- `SupervisorState` has `error: str` field for error propagation
- `runner.py` has extensive error handling with `except Exception` blocks and `type: "failed"` events
- `runtime.py` has graceful MCP fallback — returns empty list on import failure (lines 40-50)
- `stream_bus.py` has SSE event generator with `asyncio.CancelledError` handling
- Error shape convention from architecture: `{"error": {"code": "STRING", "message": "Human readable", "details": {}}}`
- PRD requirement: "Failures are explicit (retry, pause, error) not hidden"

**What this story adds:**
- Timeout enforcement on agent invocations (currently unlimited)
- Retry logic with exponential backoff for transient failures
- Structured error shapes throughout the stack
- Streaming error event propagation to frontend
- MCP connection timeout configuration
- Enhanced error logging with context

**Critical constraint from architecture spine:**
> "Never fabricate output. Every failure is an explicit error/retry state." [AD-1]

**Deferred work from previous reviews:**
- "No timeout/retry on MCP servers — loader must enforce timeout fields" [from 1-1 review]
- "Agent Timeout: `agent.ainvoke()` lacks timeout in supervisor" [from deferred-work.md]
- "No exponential backoff for transient failures" [from deferred-work.md]
- "No circuit breaker pattern for failing external services" [from deferred-work.md]

### Critical File Locations

| File | Action | Key Changes |
|---|---|---|
| `backend/app/orchestrator/supervisor.py` | UPDATE | Add timeout, retry loop, structured errors |
| `backend/app/api/routes/chat.py` | UPDATE | Wrap stream generator with error handling |
| `backend/app/agent/runtime.py` | UPDATE | Add MCP timeout configuration |
| `backend/app/config.py` | UPDATE | Add `AGENT_TIMEOUT_SEC` setting |
| `config/mcp.json` | UPDATE | Add timeout field to HTTP server schema |
| `backend/app/infrastructure/events/stream_bus.py` | UPDATE | Add error event type if needed |
| `backend/tests/test_agent_error_recovery.py` | NEW | Tests for timeout, retry, error handling |

### Architecture Decisions (MUST Follow)

**AD-1 — LangGraph + DeepAgents as Sole Orchestration:**
- Use LangGraph primitives for state management
- Error handling happens at the graph node level, not via graph state transitions

**AD-5 — astream(version="v2") as Sole Streaming API:**
- Error events must be compatible with `astream(version="v2")` format
- Do NOT use `stream_events(version="v3")` — incompatible with pinned 0.6.x stack

**AD-11 — LangGraph Security: STRICT_MSGPACK:**
- Error handling must not bypass or interfere with msgpack security

**Consistency Conventions:**
- Snake_case for Python, camelCase for TypeScript
- Error shape: `{"error": {"code": "STRING", "message": "Human readable", "details": {}}}`
- Logging: Structured JSON via `logger.error()`, `logger.debug()` levels
- IDs: UUIDs v4, no auto-increment integers

### Library/Framework Requirements

**Python 3.12 + FastAPI 0.115.x + LangGraph 0.6.x + DeepAgents 0.6.8:**
- Use `asyncio.wait_for()` for timeouts (standard library)
- Use `asyncio.sleep()` for backoff delays (standard library)
- Use `logging` module with structured format
- Use `pydantic` for config validation
- Use `pytest` and `pytest-asyncio` for async tests

**Transient Error Classification:**
```python
TRANSIENT_ERRORS = (
    asyncio.TimeoutError,
    # Add specific LLM rate limit exceptions if available
)

def is_transient_error(exc: Exception) -> bool:
    """Classify if an error is worth retrying."""
    if isinstance(exc, TRANSIENT_ERRORS):
        return True
    # Check for HTTP-like status codes in error messages
    error_str = str(exc).lower()
    if "rate limit" in error_str or "429" in error_str:
        return True
    if "500" in error_str or "502" in error_str or "503" in error_str:
        return True
    return False
```

### Previous Story Intelligence

**From EP-1 stories (1-1 to 1-4):**
- Supervisor graph was created in ST-1.4 with basic try/except error handling
- Runtime factory created in ST-1.5 with graceful MCP fallback
- Config settings managed in `backend/app/config.py` with Pydantic BaseSettings
- Test patterns use `pytest` with `monkeypatch` for mocking dependencies

**From EP-2 stories (2-5 thread sidebar):**
- Frontend error handling deferred — `console.error` alone doesn't surface to user
- Direct API calls in frontend bypass `useThreadManager` — architectural pattern
- Error messages should be human-readable, not raw exceptions

**Git history patterns:**
- Commits follow conventional commit format: `fix(...)`, `feat(...)`, `chore(...)`
- Story identifiers in commits: `ST-1.4`, `ST-2.5`, etc.
- TypeScript compilation verified with `tsc --noEmit` for frontend changes

### Testing Requirements

**Test framework:** pytest with pytest-asyncio for async tests

**Test patterns from existing codebase:**
- Use `monkeypatch` to mock dependencies (deepagents, langgraph, MCP)
- Use `types.ModuleType` to create fake modules for imports
- Use `fastapi.TestClient` for integration tests
- Mock LLM calls to avoid external dependencies (NFR-A10)

**Required test cases:**
1. `test_agent_timeout_triggers` — Mock agent that hangs, verify timeout fires
2. `test_retry_transient_error` — Mock agent that fails twice then succeeds
3. `test_no_retry_on_permanent_error` — Mock auth failure, verify no retry
4. `test_structured_error_shape` — Verify error response matches schema
5. `test_stream_error_propagation` — Verify SSE emits error event on failure
6. `test_mcp_timeout_config` — Verify MCP timeout is passed to client
7. `test_graceful_degradation` — Verify system works when agent fails completely

**Test database isolation:** Use in-memory SQLite for tests (NFR-A13)

### Dependencies

- **ST-1.4** (Supervisor graph) — Must exist for timeout/retry wrapping
- **ST-1.5** (Agent runtime) — Must exist for MCP timeout configuration
- **ST-2.1-2.2** (Thread management) — Must exist for thread-aware error logging

### Potential Pitfalls

1. **Don't break existing error handling** — The supervisor already has try/except. Extend it, don't replace it.
2. **Timeout must be async** — Use `asyncio.wait_for()`, not threading timers.
3. **Retry must preserve state** — Each retry should use the same input, not accumulate state.
4. **Don't retry auth failures** — 401/403 errors are permanent, not transient.
5. **Stream must close cleanly** — Even on error, emit final `type: "done"` event.
6. **MCP timeout is per-server** — Each HTTP MCP server can have its own timeout.
7. **Logging must not leak secrets** — Never log API keys, tokens, or full user messages at ERROR level.

## Project Context Reference

- **Project:** Companion — Agentic Organization Platform
- **Epic:** EP-2 — Conversation Threads (error recovery ensures thread resilience)
- **Stack:** Python 3.12, FastAPI 0.115.x, LangGraph 0.6.x, DeepAgents 0.6.8, Pytest
- **Architecture:** LangGraph Supervisor + DeepAgents Teams
- **Communication language:** English
- **Document language:** English

## References

- [Source: docs/prd.md#Non-Functional-Requirements] — "Error States: Failures are explicit (retry, pause, error) not hidden"
- [Source: _bmad-output/planning-artifacts/architecture/architecture-Companion-2026-08-02/ARCHITECTURE-SPINE.md#AD-1] — "Never fabricate output"
- [Source: _bmad-output/planning-artifacts/architecture/architecture-Companion-2026-08-02/ARCHITECTURE-SPINE.md#Consistency-Conventions] — Error shape convention
- [Source: _bmad-output/implementation-artifacts/deferred-work.md] — MCP timeout/retry, agent timeout, SQLite lifecycle
- [Source: backend/app/orchestrator/supervisor.py] — Current error handling (lines 98-116)
- [Source: backend/app/agent/runtime.py] — Current MCP fallback (lines 40-50)
- [Source: backend/app/agent/runner.py] — Current streaming error patterns
- [Source: backend/app/api/routes/chat.py] — Current stream endpoint (lacks error handling)

## File List

| File | Action |
|---|---|
| `backend/app/orchestrator/supervisor.py` | UPDATED - Added timeout, retry loop, structured errors |
| `backend/app/agent/runtime.py` | UPDATED - Added MCP timeout configuration and structured logging |
| `backend/app/config.py` | UPDATED - Added `AGENT_TIMEOUT_SEC` setting |
| `config/mcp.json` | UPDATED - Added timeout field to HTTP server schema |
| `backend/tests/test_runtime.py` | NEW - MCP timeout, logging, and resilience tests |
| `backend/tests/test_agent_error_recovery.py` | NEW - 22 tests for timeout, retry, error classification, and MCP |
| `backend/tests/conftest.py` | UPDATED - Added LANGGRAPH_STRICT_MSGPACK env var |

## Change Log

- Story created with comprehensive error recovery requirements
- Based on deferred work from code reviews and architecture analysis
- Addresses: agent timeout, retry logic, streaming errors, MCP timeout, error observability
- **2026-08-06**: Implemented Tasks 1-5:
  - Added agent timeout (120s default) with asyncio.wait_for()
  - Implemented exponential backoff retry (2 retries, 1s/2s delays)
  - Added transient error classification (timeout, 429, 5xx vs auth failures)
  - Structured error responses with code, message, and retryable fields
  - MCP HTTP timeout configuration (10s default, per-server customizable)
  - Enhanced structured logging for supervisor and MCP operations
  - Created 28 new tests: 6 runtime tests + 22 agent error recovery tests

## Dev Agent Record

### Agent Model Used

qwen-3.6-27b

### Debug Log References

- Tasks 1-2: Already implemented in previous sessions (supervisor timeout/retry logic)
- Task 3: MCP timeout configuration added to runtime.py and mcp.json
- Task 4: Enhanced structured error logging with server context
- Task 5: Created 28 comprehensive tests across 2 test files

### Completion Notes List

- **Task 1**: Agent timeout (120s default) enforced via asyncio.wait_for() in supervisor
- **Task 2**: Streaming error handling with structured error events already implemented
- **Task 3**: MCP HTTP timeout (10s default) applied per-server, configurable via config
- **Task 4**: Structured logging includes thread_id, error_type, retry_count, elapsed_time
- **Task 5**: 28 new tests created: 6 runtime tests + 22 agent error recovery tests
- All acceptance criteria (AC-1 through AC-7) satisfied
- Pre-existing test failures (6 HITL/KB 404s) are unrelated to this story

### File List

- `backend/app/orchestrator/supervisor.py` — Timeout, retry, structured errors (existing)
- `backend/app/agent/runtime.py` — MCP timeout configuration, structured logging
- `backend/app/config.py` — AGENT_TIMEOUT_SEC setting (existing)
- `config/mcp.json` — Timeout field added to HTTP server schema
- `backend/tests/test_runtime.py` — NEW: 6 MCP timeout/logging tests
- `backend/tests/test_agent_error_recovery.py` — NEW: 22 error recovery tests
- `backend/tests/conftest.py` — LANGGRAPH_STRICT_MSGPACK env var fix
