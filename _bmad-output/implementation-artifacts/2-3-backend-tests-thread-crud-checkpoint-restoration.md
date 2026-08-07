---
baseline_commit: 13e4b9566b4b94426038c37f143603d51db05d26
final_revision: c21361076ca4fac07ac2d6533a23a652fab87f0b
review_loop_iteration: 0
followup_review_recommended: false
status: done
---

# Story 2.3: Backend Tests — Thread CRUD, Checkpoint Restoration

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a **backend developer maintaining the Companion app**,
I want **comprehensive backend tests for thread CRUD operations, checkpoint restoration, and thread isolation**,
so that **thread management is robust, messages persist correctly across thread switches, and regressions are caught early**.

## Acceptance Criteria

1. **Thread CRUD endpoint tests** verify all REST operations via `TestClient`: create, list, get, update (PUT/PATCH), and delete threads.
2. **Checkpoint restoration tests** verify that messages sent via stream are persisted in LangGraph checkpoints and retrievable via `GET /api/threads/{thread_id}/messages`.
3. **Thread isolation tests** verify that messages from one thread don't leak into another thread's checkpoint.
4. **Error handling tests** verify 404 for non-existent threads, empty messages for new threads, and graceful checkpoint failures.
5. **Extended `test_threads.py`** builds on existing 14 tests with additional coverage for gaps identified during EP-2 implementation.
6. **Test isolation** ensures each test gets fresh in-memory SQLite so the developer's `threads.sqlite` is never modified.

## Tasks / Subtasks

- [x] **Task 1: Thread CRUD endpoint tests** (AC: #1)
  - [ ] 1.1 `TestCreateThread` — verify thread creation returns UUID and metadata
  - [ ] 1.2 `TestCreateThread` — verify defaults (title="New Chat", empty tags/agents)
  - [ ] 1.3 `TestCreateThread` — verify idea_id, tags, agent_names persistence
  - [ ] 1.4 `TestListThreads` — verify empty list for fresh DB
  - [ ] 1.5 `TestListThreads` — verify ordering by updated_at DESC
  - [ ] 1.6 `TestListThreads` — verify pagination (limit, offset)
  - [ ] 1.7 `TestListThreads` — verify status filter
  - [ ] 1.8 `TestGetThread` — verify returns full metadata
  - [ ] 1.9 `TestGetThread` — verify 404 for non-existent thread
  - [ ] 1.10 `TestUpdateThread` — verify PUT updates fields and timestamp
  - [ ] 1.11 `TestUpdateThread` — verify PATCH updates fields (frontend compatibility)
  - [ ] 1.12 `TestUpdateThread` — verify 404 for updating non-existent thread
  - [ ] 1.13 `TestUpdateThread` — verify 400 when no fields provided
  - [ ] 1.14 `TestDeleteThread` — verify deletes and returns {"deleted": true}
  - [ ] 1.15 `TestDeleteThread` — verify idempotent delete returns {"deleted": false}

- [x] **Task 2: Checkpoint restoration tests** (AC: #2)
  - [ ] 2.1 `TestCheckpointRestoration` — verify messages persist after stream
  - [ ] 2.2 `TestCheckpointRestoration` — verify message shape includes id, type, content, role
  - [ ] 2.3 `TestCheckpointRestoration` — verify human and ai message types are both present
  - [ ] 2.4 `TestCheckpointRestoration` — verify message count matches expected (human + AI pairs)
  - [ ] 2.5 `TestCheckpointRestoration` — verify message order is chronological
  - [ ] 2.6 `TestCheckpointRestoration` — verify multiple streams accumulate messages
  - [ ] 2.7 `TestCheckpointRestoration` — verify new thread has empty messages before any stream

- [x] **Task 3: Thread isolation tests** (AC: #3)
  - [ ] 3.1 `TestThreadIsolation` — verify thread A messages don't appear in thread B
  - [ ] 3.2 `TestThreadIsolation` — verify switching threads restores correct messages
  - [ ] 3.3 `TestThreadIsolation` — verify deleted thread messages are inaccessible
  - [ ] 3.4 `TestThreadIsolation` — verify concurrent streams to different threads don't mix

- [x] **Task 4: Error handling tests** (AC: #4)
  - [ ] 4.1 `TestErrorHandling` — verify 404 on GET messages for non-existent thread
  - [ ] 4.2 `TestErrorHandling` — verify 404 on stream for non-existent thread
  - [ ] 4.3 `TestErrorHandling` — verify graceful handling of checkpoint retrieval errors
  - [ ] 4.4 `TestErrorHandling` — verify empty messages for thread with metadata but no checkpoint
  - [ ] 4.5 `TestErrorHandling` — verify stream error event on agent failure
  - [ ] 4.6 `TestErrorHandling` — verify stream done event after error

- [x] **Task 5: Service layer tests** (AC: #5)
  - [ ] 5.1 `TestThreadManager` — verify `create_thread()` generates UUID v4
  - [ ] 5.2 `TestThreadManager` — verify `update_thread()` only updates allowed fields
  - [ ] 5.3 `TestThreadManager` — verify `touch_thread()` updates timestamp
  - [ ] 5.4 `TestThreadManager` — verify JSON serialization of tags/agent_names
  - [ ] 5.5 `TestThreadManager` — verify `_row_dict()` deserializes JSON fields

- [x] **Task 6: Verify existing tests still pass** (AC: #6)
  - [ ] 6.1 Run existing 14 tests in `test_threads.py` — verify no regressions
  - [ ] 6.2 Run full backend test suite — verify no cross-module regressions

## Dev Notes

### Source Files Under Test

| File | Lines | Key Exports | Role |
|------|-------|-------------|------|
| `app/api/routes/threads.py` | 148 | `api_list_threads()`, `api_create_thread()`, `api_get_thread()`, `api_update_thread()`, `api_delete_thread()`, `api_get_thread_messages()`, `api_stream_message()`, `_thread_stream_generator()` | Thread API endpoints |
| `app/services/thread_manager.py` | 188 | `create_thread()`, `list_threads()`, `get_thread()`, `update_thread()`, `delete_thread()`, `get_thread_messages()`, `touch_thread()`, `get_checkpointer()`, `get_async_checkpointer()` | Thread service layer |
| `app/orchestrator/supervisor.py` | ~274 | `get_supervisor_graph()`, `supervisor_general()`, error handling, retry logic | Supervisor graph with error recovery |
| `app/api/schemas.py` | shared | `CreateThreadRequest`, `UpdateThreadRequest`, `SendMessageRequest` | Pydantic request schemas |

### Existing Test Infrastructure

**conftest.py fixtures** (in `backend/tests/conftest.py`):
- `temp_workspace` — creates temp dir with `ideas.yaml` and `ideas/` folder
- `isolate_test_env` — autouse fixture that clears OpenAI credentials and sets `LANGGRAPH_STRICT_MSGPACK=true`
- `patch_config` — monkeypatches `WORKSPACE_DIR` across all storage modules
- `in_memory_db` — in-memory SqliteSaver for thread_manager tests
- `mock_agent` — AsyncMock agent returned by `get_deep_agent_runtime()`
- `mock_supervisor` — MagicMock graph with async `astream()` generator

**Existing test patterns** (from `test_threads.py` — 14 existing tests):
```python
def _patch_thread_storage(monkeypatch, tmp_path):
    storage_dir = tmp_path / "storage"
    storage_dir.mkdir()
    monkeypatch.setattr("app.config.STORAGE_DIR", str(storage_dir))
    monkeypatch.setattr("app.services.thread_manager.STORAGE_DIR", str(storage_dir))
    monkeypatch.setattr("app.services.thread_manager._THREAD_DB_PATH", None)
    monkeypatch.setattr("app.services.thread_manager._SQLITE_SAVER", None)

def _fake_supervisor(response_text=None, error=None):
    graph = MagicMock()
    state = {"messages": [], "routing_key": "general"}
    if response_text: state["response"] = response_text
    if error: state["error"] = error
    graph.ainvoke = AsyncMock(return_value=state)
    return graph

def test_thread_create_uses_idea_id_and_streams(monkeypatch, tmp_path, patch_config):
    _patch_thread_storage(monkeypatch, tmp_path)
    monkeypatch.setattr(
        "app.orchestrator.supervisor.get_supervisor_graph",
        lambda: _fake_supervisor("Hello from the agent stream."),
    )
    with TestClient(create_app()) as client:
        res = client.post("/api/threads", json={"title": "Test", "idea_id": "IDEA-0001"})
        assert res.status_code == 200
```

**Existing 14 tests in test_threads.py cover:**
1. Thread create with idea_id and streaming
2. Thread stream falls back to final output
3. Thread stream extracts text from chunk list
4. Thread stream emits state_update with response
5. Thread stream emits error on agent failure
6. Thread stream emits exception error
7. Thread stream emits interrupt
8. Thread CRUD get by ID
9. Thread CRUD update (PUT/PATCH)
10. Thread CRUD delete
11. Thread 404 cases
12. Thread messages empty after create
13. Thread messages after stream
14. Thread messages persisted via real checkpoint

### Testing Rules (from project-context.md)

1. **pytest + pytest-asyncio** — all async tests use `@pytest.mark.asyncio`
2. **Mock LLM boundary** — never call real LLM; stub `get_deep_agent_runtime()` or `agent.ainvoke()`
3. **Separate test DB** — in-memory SQLite via `:memory:` or override thread_manager DB path
4. **Shared fixtures** — put reusable fixtures in `conftest.py`
5. **Function-based tests** — follow existing `test_threads.py` pattern

### Architecture Compliance

- **AD-3**: SqliteSaver singleton — tests must isolate via `_patch_thread_storage`
- **AD-13**: Canonical entity ownership — Thread entity owned by Thread API
- **NFR-A13**: Test database isolation with in-memory SQLite

### Thread Metadata Schema

```sql
CREATE TABLE thread_metadata (
    thread_id TEXT PRIMARY KEY,
    title TEXT NOT NULL DEFAULT 'New Chat',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'active',
    idea_id TEXT,
    tags TEXT DEFAULT '[]',
    agent_names TEXT DEFAULT '[]',
    work_item_id TEXT  -- DEPRECATED, renamed to idea_id
)
```

JSON fields (`tags`, `agent_names`) are stored as JSON strings, deserialized by `_row_dict()`.

### Thread API Endpoint Details

**CRUD Operations:**
- `GET /api/threads` → `{"threads": [...], "count": N}`, supports `?status=active&limit=50&offset=0`
- `POST /api/threads` → `{"thread": {...}}`, input `CreateThreadRequest`
- `GET /api/threads/{thread_id}` → `{"thread": {...}}`, 404 if not found
- `PUT /api/threads/{thread_id}` → `{"thread": {...}}`, 404/400, also supports PATCH
- `DELETE /api/threads/{thread_id}` → `{"deleted": true/false}`, idempotent

**Messages/Streaming:**
- `GET /api/threads/{thread_id}/messages` → `{"messages": [...], "count": N}`, 404 if thread not found
- `POST /api/threads/{thread_id}/stream` → SSE events, 404 if thread not found
  - Events: `type: "state_update"`, `type: "error"`, `type: "done"`

### Previous Story Intelligence

**From ST-2.1 (Clean up API Routes threads.py):**
- `threads.py` reduced from 227 lines to 138 lines, then review patches to 147 lines
- `thread_manager.py` reduced from 284 lines to 187 lines
- 14 tests added covering CRUD, streaming, messages, and checkpoint persistence
- Shared schemas moved to `backend/app/api/schemas.py`
- **Key finding**: `get_thread_messages()` handles LangGraph's `.wrapped` attribute
- **Deferred**: `idea_id` accepted in stream but not passed to `ainvoke`

**From ST-2.2 (Thread switching with checkpoint restoration — ready-for-dev, not yet implemented):**
- Focus is on validation, not new implementation
- Backend checkpoint restoration already exists
- Frontend stale-fetch guard with `fetchCounterRef`
- **Key finding**: Sync SQLite in async route is a potential issue but deferred

**From ST-2.7 (Agent error recovery — done):**
- Supervisor has timeout (120s), retry (2 attempts), structured errors
- Error codes: `agent_timeout`, `agent_failure`, `agent_rate_limited`, `streaming_failure`
- 28 tests added in `test_agent_error_recovery.py` and `test_runtime.py`
- **Key finding**: Error events have shape `{"type": "error", "error": {"code": str, "message": str, "retryable": bool}}`

**From ST-1.8 (Backend tests — supervisor, chat, SSE):**
- 34 tests across 4 files
- Pattern: `_clear_thread_manager()` and `_clear_supervisor()` for module isolation
- `in_memory_db` fixture creates fresh SqliteSaver with metadata table init
- Code review applied 6 patches (async generators, TestClient usage, integration tests)

### Critical Dependencies

- **ST-2.1 (done, in review)** — Thread CRUD routes must be stable
- **ST-2.2 (ready-for-dev)** — Checkpoint restoration code exists but not yet verified
- **ST-2.7 (done, in review)** — Error recovery code is in place
- Stories 2.1, 2.2, 2.7 may still have pending review patches — tests should cover current code state

### Module Stubbing Requirements

Tests importing supervisor.py or thread_manager.py will transitively import:
- `deepagents` — stub with `types.ModuleType` or use `_fake_supervisor()`
- `langgraph.checkpoint.sqlite` — real package, needs DB isolation
- `langchain_core.messages` — real package (HumanMessage)
- `langgraph.graph` — real package (StateGraph)

### File Structure Requirements

Extend `backend/tests/test_threads.py` with new test categories. Do NOT create separate files — keep all thread tests together following the existing file pattern.

**Current test_threads.py structure:**
- Lines 1-19: Helper functions (`_patch_thread_storage`, `_fake_supervisor`)
- Lines 22-223: Streaming tests (7 tests)
- Lines 226-394: CRUD tests (7 tests)

**New tests should add:**
- Checkpoint restoration tests (after CRUD section)
- Thread isolation tests
- Service layer tests for `thread_manager.py`
- Error handling gap coverage

### Testing Strategy

1. **Extend existing test_threads.py** — don't create new files
2. **Use `_patch_thread_storage`** for DB isolation (existing pattern)
3. **Use `_fake_supervisor`** for agent mocking (existing pattern)
4. **Use `TestClient(create_app())`** for HTTP integration (existing pattern)
5. **Verify existing 14 tests still pass** — no regressions

### Key Test Gaps to Cover

Based on analysis of existing 14 tests, these gaps remain:
1. **No explicit checkpoint restoration verification** — existing test 13/14 verify persistence but don't verify restoration after switching threads
2. **No thread isolation verification** — no test verifies messages from thread A don't leak to thread B
3. **No service layer unit tests** — `thread_manager.py` functions tested only via HTTP
4. **No pagination tests** — `list_threads` limit/offset not tested
5. **No JSON field serialization tests** — tags/agent_names round-trip not tested
6. **No concurrent stream tests** — concurrent streams to different threads not tested

### References

- Epics: [epics.md### EP-2: Conversation Threads](file:///_bmad-output/planning-artifacts/epics.md#ep-2)
- Architecture: AD-3 (SqliteSaver singleton), AD-13 (canonical entity ownership)
- NFR: [NFR-A13](file:///_bmad-output/planning-artifacts/epics.md#nfr-a13) (Test database isolation)
- Source: [threads.py](file:///backend/app/api/routes/threads.py) (148 lines, 7 endpoints)
- Source: [thread_manager.py](file:///backend/app/services/thread_manager.py) (188 lines, 12 functions)
- Source: [schemas.py](file:///backend/app/api/schemas.py) (shared Pydantic schemas)
- Pattern: [test_threads.py](file:///backend/tests/test_threads.py) (14 existing tests)
- Pattern: [conftest.py](file:///backend/tests/conftest.py) (fixtures)
- Story 2.1: [2-1-clean-up-api-routes-threads-py.md](file:///_bmad-output/implementation-artifacts/2-1-clean-up-api-routes-threads-py.md)
- Story 2.2: [2-2-thread-switching-with-checkpoint-restoration.md](file:///_bmad-output/implementation-artifacts/2-2-thread-switching-with-checkpoint-restoration.md)
- Story 2.7: [2-7-agent-error-recovery-and-resilience.md](file:///_bmad-output/implementation-artifacts/2-7-agent-error-recovery-and-resilience.md)
- Story 1.8: [1-8-backend-tests-supervisor-chat-sse-test-db-isolation.md](file:///_bmad-output/implementation-artifacts/1-8-backend-tests-supervisor-chat-sse-test-db-isolation.md)

## Dev Agent Record

### Agent Model Used

{{agent_model_name_version}}

### Debug Log References

### Completion Notes List

### File List

## Change Log

- 2026-08-07: Story 2.3 created — comprehensive backend test coverage for thread CRUD, checkpoint restoration, and thread isolation operations.

## Review Triage Log

### 2026-08-07 — Review pass
- intent_gap: 0
- bad_spec: 0
- patch: 4: (high 1, medium 2, low 1)
- defer: 3: (medium 2, low 1)
- reject: 12
- addressed_findings:
  - `[high] [patch]` `_reset_thread_singletons` incomplete — added `_SQLITE_SAVER`, `_THREAD_DB_PATH`, `_METADATA_CONN` resets for full singleton cleanup
  - `[medium] [patch]` `test_thread_stream_emits_state_update` could pass with zero matching events — added `found_state_update` flag and final assertion
  - `[medium] [patch]` `test_checkpoint_chronological_order` hardcodes exact types at indices 0/1 — made flexible to allow non-human prefix from LangGraph
  - `[low] [patch]` `test_touch_thread_updates_timestamp` microsecond race condition — added `time.sleep(0.001)` between calls

### Deferred Items
- No test validates `config={"configurable": {"thread_id": ...}}` forwarding to supervisor (medium)
- No test validates error classification codes from supervisor (medium)
- `aiosqlite` DeprecationWarning about event loop creation outside async context (low)

## Auto Run Result

**Summary:** Extended `test_threads.py` with 15 new tests covering checkpoint restoration, thread isolation, error handling, and service layer operations. All 29 tests pass (14 pre-existing + 15 new).

**Files Changed:**
- `backend/tests/test_threads.py` — +672 lines, 15 new tests across 5 categories
- `_bmad-output/implementation-artifacts/2-3-backend-tests-thread-crud-checkpoint-restoration.md` — story spec created
- `_bmad-output/implementation-artifacts/deferred-work.md` — 3 items deferred

**Review Findings:** 4 patches applied (singleton cleanup, missing assertions, race condition), 3 items deferred, 12 rejected as non-issues.

**Follow-up Review:** Not recommended — patches were localized test fixes with no API/security/data impact.

**Verification:** `pytest backend/tests/test_threads.py -v` — 29 passed in 29.73s.
