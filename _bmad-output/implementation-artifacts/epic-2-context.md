# Epic 2 Context: Conversation Threads

<!-- Generated from planning artifacts. Regenerate with compile-epic-context if planning docs change. -->

## Goal

Enable users to create multiple conversation threads, switch between them seamlessly, and have full message history restored when switching back. This builds on EP-1's agentic chat foundation by adding multi-thread management — the user can carry on parallel conversations without losing context.

## Stories

- Story 2.1: Clean up `api/routes/threads.py` — full CRUD aligned with `thread_manager.py`
- Story 2.2: Thread switching with checkpoint restoration from SQLite
- Story 2.3: Backend tests: thread CRUD, checkpoint restoration
- Story 2.4: Update `useThreadManager.ts` for new thread API
- Story 2.5: Thread list sidebar with create/switch/delete
- Story 2.6: Frontend tests: thread management UI

## Requirements & Constraints

- Thread metadata stored in SQLite `thread_metadata` table with fields: thread_id (UUID v4), title, created_at, updated_at, status, idea_id, tags (JSON), agent_names (JSON).
- Messages persisted via LangGraph `SqliteSaver` checkpoints — NOT a separate messages table.
- `get_thread_messages()` reads from LangGraph checkpoint; handles `.wrapped` attribute on checkpoint values.
- Thread CRUD API: `GET /api/threads`, `POST /api/threads`, `GET /api/threads/{id}`, `PUT /api/threads/{id}`, `PATCH /api/threads/{id}`, `DELETE /api/threads/{id}`.
- Messages endpoint: `GET /api/threads/{id}/messages` returns messages from checkpoint.
- Streaming endpoint: `POST /api/threads/{id}/stream` sends message and streams SSE events.
- Thread isolation: Messages from one thread must never leak into another thread's checkpoint.
- Checkpoint restoration: Switching to a thread restores its full message history from SQLite checkpoint.
- Test database isolation: Tests use in-memory SQLite — never modify dev `threads.sqlite`.
- Mock the LLM boundary — tests must NEVER call a live model.

## Technical Decisions

- **SqliteSaver singleton** (AD-3): Single global instance created at startup; tests isolate by patching `STORAGE_DIR` and clearing singleton references.
- **Canonical entity ownership** (AD-13): Thread entity owned by Thread API (`api/routes/threads.py` + `services/thread_manager.py`).
- **Thread metadata table**: Separate from LangGraph checkpoints — stores UI/display metadata; checkpoints store message history.
- **JSON serialization**: `tags` and `agent_names` stored as JSON strings, deserialized by `_row_dict()`.
- **Test patterns**: Use `_patch_thread_storage()` for DB isolation, `_fake_supervisor()` for agent mocking, `TestClient(create_app())` for HTTP integration.

## Cross-Story Dependencies

- EP-1 must be complete (agentic chat, streaming, supervisor graph).
- ST-2.1 (backend CRUD routes) must be stable before ST-2.2 (switching) and ST-2.3 (tests).
- ST-2.2 (checkpoint restoration) must exist before ST-2.3 can test it.
- ST-2.7 (agent error recovery) adds error handling to supervisor — tests in 2.3 should verify error event shapes.
- ST-2.5 (frontend sidebar) depends on ST-2.1 CRUD routes being functional.
- EP-3 (Ideas Management) depends on EP-2 completion.
