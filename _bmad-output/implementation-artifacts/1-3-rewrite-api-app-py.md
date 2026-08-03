# Story 1.3: Rewrite api/app.py — Clean Lifespan and Router Mounting

baseline_commit: 2bc1c0bf9750885d4d3e3bd5a84101c86b2a9025

## Story

As a backend developer,
I want the FastAPI app factory (`api/app.py`) to have a clean lifespan that initializes the LangGraph checkpointer and removes legacy storage calls,
so that the app starts cleanly with proper dependency initialization and no references to deprecated modules.

## Acceptance Criteria

1. **Lifespan initializes SqliteSaver checkpointer** — The `lifespan` context manager calls `get_checkpointer()` at startup to eagerly initialize the SQLite connection and create checkpoint tables before any requests arrive.

2. **Legacy storage calls removed** — `recover_from_filesystem()` and `load_idea_registry()` calls are removed from lifespan (these are from the deprecated Siemens FSM workflow, AD-12 dead code).

3. **Deprecated imports eliminated** — No imports from `..storage.yaml_io` (the recovery and registry functions are legacy; yaml_io.py itself is a shim that re-exports from submodules, but we don't need those in app.py).

4. **All router imports at module level** — The `threads_router` import is moved from inside `create_app()` to the top-level import section alongside other routers.

5. **LangSmith tracing preserved** — `configure_langsmith_tracing()` remains in lifespan as-is.

6. **Startup logging updated** — Lifespan logs checkpointer initialization instead of idea recovery/registry counts.

7. **Existing routers mount unchanged** — health, ideas, chat, and threads routers are all still mounted; the app factory contract (`create_app() -> FastAPI`) is preserved.

8. **CORS middleware preserved** — CORS configuration remains unchanged.

## Tasks / Subtasks

- [x] Task 1: Clean up imports (AC: 3, 4)
  - [x] Remove `from ..storage.yaml_io import load_idea_registry, recover_from_filesystem`
  - [x] Move `from .routes.threads import router as threads_router` to top-level imports
  - [x] Add `from ..services.thread_manager import get_checkpointer` for checkpointer initialization
  - [x] Ensure import order follows: stdlib → third-party → application

- [x] Task 2: Rewrite lifespan (AC: 1, 2, 5, 6)
  - [x] Remove `recover_from_filesystem()` call and associated logging
  - [x] Remove `load_idea_registry()` call and associated logging
  - [x] Keep `configure_langsmith_tracing()` call
  - [x] Add `get_checkpointer()` call to eagerly initialize SqliteSaver
  - [x] Add startup log: `[Startup] Checkpointer initialized at {db_path}`
  - [x] Keep lifespan as `@asynccontextmanager async def lifespan(_app: FastAPI)`

- [x] Task 3: Verify create_app unchanged contract (AC: 7, 8)
  - [x] All 4 routers mounted: health, ideas, chat, threads
  - [x] CORS middleware with same configuration
  - [x] App title and version unchanged
  - [x] Function signature: `def create_app() -> FastAPI`

- [x] Task 4: Validate (AC: all)
  - [x] `python -c "from app.api.app import create_app; app = create_app(); print('OK')"` succeeds
  - [x] No imports of deprecated modules (verify with grep)
  - [x] App starts via uvicorn without errors (when .env is configured)
  - [x] Health endpoint responds: `curl http://localhost:8000/api/health`

### Review Findings

- [x] [Review][Defer] Import-time config crash on missing LANGGRAPH_STRICT_MSGPACK — AD-11 design decision, fail-fast is intentional
- [x] [Review][Patch] Remove private `_get_db_path()` import from API layer [backend/app/api/app.py:9] — replaced with `checkpointer.conn` in log message
- [x] [Review][Defer] SQLite connection never closed in lifespan teardown — pre-existing in thread_manager.py
- [x] [Review][Defer] Shared SQLite connection concurrency risk — pre-existing AD-3 singleton design, EP-7 story 7-4 planned

## Dev Notes

### File Being Modified

**`backend/app/api/app.py`** (51 lines currently) — surgical rewrite, not a full replacement.

**Current state:**
```python
from ..storage.yaml_io import load_idea_registry, recover_from_filesystem  # REMOVE
from .routes.chat import router as chat_router
from .routes.health import router as health_router
from .routes.ideas import router as ideas_router
# threads_router imported INSIDE create_app() — MOVE to top level

async def lifespan(_app: FastAPI):
    configure_langsmith_tracing()
    recovered = recover_from_filesystem()       # REMOVE
    if recovered > 0:
        print(f"[Startup] Recovered {recovered} idea(s)")  # REMOVE
    registry = load_idea_registry()             # REMOVE
    print(f"[Startup] Loaded {len(...)} ideas")  # REMOVE
    yield

def create_app() -> FastAPI:
    # ... CORS setup ...
    app.include_router(health_router)
    app.include_router(ideas_router)
    app.include_router(chat_router)
    from .routes.threads import router as threads_router  # MOVE to top
    app.include_router(threads_router)
    return app
```

**Target state:**
```python
from ..infrastructure.observability import configure_langsmith_tracing
from ..services.thread_manager import get_checkpointer
from .routes.chat import router as chat_router
from .routes.health import router as health_router
from .routes.ideas import router as ideas_router
from .routes.threads import router as threads_router

async def lifespan(_app: FastAPI):
    configure_langsmith_tracing()
    checkpointer = get_checkpointer()
    print(f"[Startup] Checkpointer initialized at {checkpointer.conn}")
    yield

def create_app() -> FastAPI:
    # ... same CORS and app setup ...
    app.include_router(health_router)
    app.include_router(ideas_router)
    app.include_router(chat_router)
    app.include_router(threads_router)
    return app
```

### What Must Be Preserved

- `configure_langsmith_tracing()` — sets LangSmith env vars, called by observability.py
- CORS middleware with `allow_origins=["*"]` — required for frontend dev server
- App title "Agentic Organization Platform" and version "1.0.0"
- All 4 router mounts (health, ideas, chat, threads)
- The `@asynccontextmanager` decorator on lifespan
- The `create_app() -> FastAPI` factory pattern

### Dependencies

- **ST-1.2 (done):** `config.py` already has `TEAMS_CONFIG_PATH`, `MCP_CONFIG_PATH`, schema versions, and `LANGGRAPH_STRICT_MSGPACK` validation. Don't modify config.py.
- **ST-1.4 (backlog):** Will create `orchestrator/supervisor.py` — not needed for this story.

### Consumer Map

Who imports from `api/app.py`:
- `backend/app/main.py` — calls `create_app()` to create the FastAPI instance
- Test files may import `create_app` for testing

Who imports the things being removed:
- `recover_from_filesystem` — only used in app.py lifespan (being removed). Still exported by `storage/yaml_io.py` shim but not imported elsewhere after this change.
- `load_idea_registry` — only used in app.py lifespan (being removed).

### Architecture Compliance

| Requirement | Architecture Decision |
|---|---|
| No deprecated module imports | AD-12: `storage/yaml_io.py` recovery functions are legacy |
| SqliteSaver eager init at startup | AD-3: Single global singleton checkpointer, created at startup |
| No new dead code references | AD-1: LangGraph is sole orchestration, old FSM workflow is dead |
| File size < 150 lines | project-context.md §Framework-Specific Rules |
| Import order: stdlib → third-party → app | project-context.md §Language-Specific Rules |

### Testing Standards

- No new test file required for this story (tests are in ST-1.8)
- Manual validation: app must start without errors
- The `get_checkpointer()` call inside lifespan will create `storage/threads.sqlite` with checkpoint tables — verify the file exists after startup

### Project Structure Notes

- File: `backend/app/api/app.py` (UPDATE)
- No new files created
- Path follows project convention: `backend/app/api/` for FastAPI routes

### References

- [Source: _bmad-output/planning-artifacts/epics.md#EP-1] — Epic 1 story table, ST-1.3
- [Source: _bmad-output/planning-artifacts/architecture/ARCHITECTURE-SPINE.md#AD-3] — SqliteSaver singleton
- [Source: _bmad-output/planning-artifacts/architecture/ARCHITECTURE-SPINE.md#AD-12] — Deprecated modules
- [Source: _bmad-output/project-context.md] — Import order, file size limits, testing rules
- [Source: backend/app/services/thread_manager.py] — `get_checkpointer()` singleton pattern
- [Source: backend/app/infrastructure/observability.py] — `configure_langsmith_tracing()`
- [Source: backend/app/storage/yaml_io.py] — Legacy shim (imports being removed)

## Dev Agent Record

### Agent Model Used

qwen-3.6-27b

### Debug Log References

- Import validation confirmed `create_app()` succeeds with 8 routers mounted
- No deprecated imports found (grep confirmed zero matches for yaml_io, recover_from_filesystem, load_idea_registry)
- File reduced from 51 lines to 47 lines

### Completion Notes List

- Removed legacy `recover_from_filesystem()` and `load_idea_registry()` imports and calls from `yaml_io.py`
- Moved `threads_router` import from inside `create_app()` to top-level imports
- Added `get_checkpointer()` call in lifespan to eagerly initialize SqliteSaver singleton (AD-3)
- Added `_get_db_path()` import for startup logging of checkpointer DB path
- LangSmith tracing, CORS middleware, app title/version, and all 4 router mounts preserved unchanged
- Import order follows: stdlib → third-party → application (project-context.md compliance)

### File List

- backend/app/api/app.py (modified)

### Change Log

- Rewritten api/app.py: removed legacy storage calls, added checkpointer eager initialization, moved threads_router to top-level imports (Date: 2026-08-05)

Status: done
