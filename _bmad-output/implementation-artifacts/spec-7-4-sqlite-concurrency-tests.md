---
title: '7-4-sqlite-concurrency-tests'
type: 'chore'
created: '2026-08-10'
status: 'done'
baseline_revision: '31491f1'
review_loop_iteration: 0
followup_review_recommended: false
context: ['_bmad-output/implementation-artifacts/epic-7-context.md']
warnings: []
---

<intent-contract>

## Intent

**Problem:** The application uses two separate SQLite connections to the same `threads.sqlite` file — a sync `SqliteSaver` connection (via `sqlite3` in `thread_manager.py`) for CRUD operations and an async `AsyncSqliteSaver` connection (via `aiosqlite` in `supervisor.py`) for graph checkpointing. Neither connection uses WAL mode, so concurrent writes from multiple SSE streams can cause "database is locked" errors. No tests currently validate concurrent stream behavior against a shared file-backed database.

**Approach:** Write backend tests that exercise concurrent SSE streams against a shared SQLite database to verify the application handles concurrent checkpoint writes without lock failures. Tests use in-memory SQLite with `check_same_thread=False` to simulate the file-backed concurrency pattern, plus targeted file-based tests for WAL mode validation.

## Boundaries & Constraints

**Always:**
- Tests use in-memory SQLite (`:memory:`) with `check_same_thread=False` per NFR-A13
- Tests mock the LLM boundary per NFR-A10 — no live model calls
- Tests verify concurrent `astream` calls through the same `AsyncSqliteSaver` singleton
- Tests measure "database is locked" error rate, not just pass/fail
- Existing test patterns in `conftest.py` are reused (not replaced)
- Tests are structured as pytest classes with `pytest.mark.asyncio` for async tests
- Tests run with `pytest backend/tests/test_sqlite_concurrency.py`

**Block If:**
- SQLite version on target platform doesn't support concurrent connections
- LangGraph checkpointer API changes break test assumptions
- WAL mode cannot be enabled on the test connection

**Never:**
- Modify production code to pass tests
- Use file-backed SQLite in tests (NFR-A13 requires in-memory)
- Hit live LLM or MCP servers
- Add tests to deprecated modules
- Change existing test fixtures in conftest.py

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Single stream checkpoint | 1 concurrent `astream` call | Checkpoints written successfully | No lock error |
| Two concurrent streams | 2 concurrent `astream` calls | Both complete, checkpoints persisted | No lock error |
| Five concurrent streams | 5 concurrent `astream` calls | All complete within timeout | No lock error or max 1 retry |
| Sync CRUD during streaming | `get_checkpoints()` called during `astream` | Both operations complete | No lock error |
| WAL mode enabled | `PRAGMA journal_mode=WAL` before test | Concurrent writes succeed with less locking | WAL mode confirmed |
| Lock contention detected | Concurrent writes hit `database is locked` | Test reports lock rate with actionable metrics | Error logged with context |

</intent-contract>

## Code Map

- `backend/app/services/thread_manager.py` — SqliteSaver singleton (sync L21, async L22), get_checkpointer() L45-63, get_async_checkpointer() L66-73
- `backend/app/agent/supervisor.py` — Graph compilation with async checkpointer (L290), astream calls during streaming
- `backend/tests/conftest.py` — `in_memory_db` fixture (L65-100+), `mock_agent` fixture, test patterns to follow
- `backend/app/api/routes/chat.py` — `/api/chat/stream` endpoint, creates thread_id, calls supervisor.astream (L90-100)
- `backend/tests/test_sqlite_concurrency.py` — **New file** for concurrency tests
- `_bmad-output/implementation-artifacts/epic-7-context.md` — Epic 7 context with NFRs
- `backend/tests/test_thread_isolation.py` — Existing isolation tests (pattern reference, not modified)

## Tasks & Acceptance

**Execution:**
- [ ] `backend/tests/test_sqlite_concurrency.py` -- Create test file with `pytest.mark.asyncio` class-based structure — Establishes test module following project patterns
- [ ] `backend/tests/test_sqlite_concurrency.py` -- Implement `TestSingleStream` class with `test_single_astream_checkpoints` — Baseline: verify single stream writes checkpoints without lock errors
- [ ] `backend/tests/test_sqlite_concurrency.py` -- Implement `TestConcurrentStreams` class with `test_two_concurrent_streams`, `test_five_concurrent_streams` — Core concurrency: verify multiple streams share AsyncSqliteSaver without lock errors
- [ ] `backend/tests/test_sqlite_concurrency.py` -- Implement `TestSyncAsyncConflict` class with `test_sync_crud_during_stream` — Cross-connection: verify sync SqliteSaver CRUD doesn't lock async operations
- [ ] `backend/tests/test_sqlite_concurrency.py` -- Implement `TestWALMode` class with `test_wal_mode_enabled` — Verify WAL mode reduces lock contention under concurrent writes
- [ ] `backend/tests/test_sqlite_concurrency.py` -- Implement `TestLockDetection` class with `test_lock_error_rate` — Measure and report "database is locked" frequency with metrics
- [ ] `backend/tests/test_sqlite_concurrency.py` -- Add shared fixture `concurrent_in_memory_db` for concurrent test scenarios — Reusable fixture that sets up in-memory DB with concurrency-friendly settings

**Acceptance Criteria:**
- Given a single `astream` call with mock agent, when the stream completes, then no "database is locked" errors occur.
- Given two concurrent `astream` calls with separate thread_ids, when both streams complete, then all checkpoints are persisted without lock errors.
- Given five concurrent `astream` calls with separate thread_ids, when all streams complete within 30s, then lock errors are 0 or max 1 retry per stream.
- Given a sync `get_checkpoints()` call running during an `astream` call, when both operations complete, then no lock errors occur on either connection.
- Given WAL mode is enabled before concurrent streams, when concurrent writes execute, then lock contention is reduced compared to default journal mode.
- Given concurrent streams are run 10 times in a loop, when lock errors are tracked, then test reports lock rate with pass/fail threshold.

## Spec Change Log

## Review Triage Log

## Design Notes

**In-Memory SQLite Concurrency Pattern:**
In-memory SQLite (`:memory:`) creates a private database per connection by default. To share it across connections for concurrency testing, use URI format: `sqlite:///file::memory:?cache=shared`. This allows multiple connections to the same in-memory database, simulating file-backed concurrency.

```python
# Shared in-memory DB for concurrency tests
conn = sqlite3.connect('file::memory:?cache=shared', uri=True, check_same_thread=False)
saver = SqliteSaver(conn)
```

**Concurrent Test Structure:**
Use `asyncio.gather` to run multiple `astream` calls concurrently within a single test, measuring outcomes:

```python
@pytest.mark.asyncio
async def test_two_concurrent_streams():
    results = await asyncio.gather(
        run_stream("thread-1"),
        run_stream("thread-2"),
        return_exceptions=True
    )
    lock_errors = [r for r in results if isinstance(r, OperationalError) and "locked" in str(r)]
    assert len(lock_errors) == 0, f"Got {len(lock_errors)} lock errors"
```

**WAL Mode Testing:**
WAL (Write-Ahead Logging) allows readers and writers to operate concurrently. Test compares default vs WAL mode:

```python
conn.execute("PRAGMA journal_mode=WAL")
# Now concurrent writes should have less contention
```

**Lock Detection:**
SQLite raises `sqlite3.OperationalError: database is locked` on lock contention. Tests catch these, count them, and report metrics rather than just failing.

## Verification

**Commands:**
- `pytest backend/tests/test_sqlite_concurrency.py -v` -- expected: all tests pass, lock errors reported as 0
- `pytest backend/tests/test_sqlite_concurrency.py -v --tb=short` -- expected: clean test output with concurrency metrics
- `pytest backend/tests/test_sqlite_concurrency.py::TestConcurrentStreams -v` -- expected: concurrent stream tests pass without lock errors
