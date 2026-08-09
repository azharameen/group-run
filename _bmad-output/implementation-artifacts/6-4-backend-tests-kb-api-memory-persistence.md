---
title: 'Story 6.4: Backend tests: KB API, memory persistence'
type: 'test'
created: '2026-08-09'
status: 'done'
review_loop_iteration: 0
baseline_revision: 'c6b8520'
context:
  - '{project-root}/_bmad-output/project-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/6-1-knowledge-base-api.md'
warnings: []
---

## Intent

**Problem:** While the Knowledge Base API is implemented, we need to ensure it is robust against various edge cases and correctly handles different file types. Furthermore, we need to verify "Memory Persistence" — ensuring that agents can store and retrieve data from the `/memories/` virtual path, and that this data persists across agent instances.

**Approach:**
1. Expand `backend/tests/test_knowledge_api.py` to include:
   - Large file upload tests.
   - Unsupported file type handling (verify 400).
   - Search with special characters.
   - Concurrent list/search (optional but good).
2. Create `backend/tests/test_memory_persistence.py`:
   - Verify agent can write to `/memories/` using standard DeepAgents filesystem tools.
   - Verify file is persisted in the physical `memories/` directory.
   - Verify a new agent instance can read the persisted file.
   - Verify memory isolation (agent can't write outside its allowed routes).

---

## Boundaries & Constraints

**Always:**
- Use `pytest` with `TestClient`.
- Use `tmp_path` for all filesystem operations in tests to ensure isolation.
- Mock `ROOT_DIR` or relevant paths in `config.py` to point to `tmp_path`.
- Verify behavior via both API responses AND physical file checks.

**Block If:**
- `deepagents` package is not available (tests should skip or fail gracefully).

**Never:**
- Use the real `memories/` or `knowledge-base/` directories during testing.
- Hardcode absolute paths.

---

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Large Upload | 10MB file | 201 Created | Verify no memory leaks or timeouts |
| Invalid Upload | .exe file | 400 Bad Request | Error msg: "Unsupported file type" |
| Memory Write | Agent writes to `/memories/test.txt` | File exists at `{ROOT_DIR}/memories/test.txt` | — |
| Memory Read | Agent reads from `/memories/test.txt` | Returns content written previously | — |
| Memory Escape | Agent tries to write to `/etc/passwd` | 403 Forbidden or Permission Error | Handled by FilesystemPermission |

---

## Code Map

- `backend/tests/test_knowledge_api.py` — **UPDATE**: Add edge-case tests.
- `backend/tests/test_memory_persistence.py` — **NEW**: Integration tests for agent memory.
- `backend/app/agent/backends.py` — **REFERENCE**: Check `/memories/` route.

---

## Tasks & Acceptance

**Execution:**
1. [x] Update `test_knowledge_api.py`:
   - [x] Add `test_upload_unsupported_type` (e.g., .exe).
   - [x] Add `test_search_special_characters`.
   - [x] Add `test_upload_large_file` (mocked or small enough for CI).

2. [x] Create `test_memory_persistence.py`:
   - [x] Setup fixture for `memories` dir isolation.
   - [x] Test that `CompositeBackend` correctly routes `/memories/`.
   - [x] Test agent `write_file` to `/memories/`.
   - [x] Test agent `read_file` from `/memories/`.
   - [x] Test persistence: instantiate runtime → write → delete runtime → instantiate new runtime → read.

3. [x] Run all backend tests to ensure no regressions.

**Acceptance Criteria:**
- [x] KB API tests cover all edge cases defined in I/O matrix.
- [x] Memory persistence tests prove that `/memories/` is writable and persistent.
- [x] Agents are restricted to their configured routes (no path traversal).
- [x] All tests pass in the local environment.

---

## Dev Agent Guardrails

### Technical Requirements
Use `monkeypatch` to redirect `KNOWLEDGE_BASE_DIR` and `ROOT_DIR` (or specifically the `memories` path construction in `backends.py`).

### Architecture Compliance
Ensure tests follow the "Mock LLM boundary" NFR. Use a mock model for the memory persistence tests if they involve agent execution.

### Testing Requirements
Use `pytest`. Ensure `conftest.py` doesn't have Siemens-specific logic that interferes.

---

## Completion Status

**Status:** done
