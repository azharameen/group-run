# Epic 3 Context: Ideas Management 💡

<!-- Generated from planning artifacts. Regenerate with compile-epic-context if planning docs change. -->

## Goal

Enable users to create, view, update, and delete ideas. Each idea has a workspace folder with attached files. This epic migrates the legacy ideas CRUD from Siemens FSM dependencies to pure REST operations backed by the new LangGraph/DeepAgents runtime.

## Stories

- Story 3.1: Rewrite `api/routes/ideas.py` — pure CRUD without FSM dependencies
- Story 3.2: Update `models/idea.py` — remove Siemens fields (score, state, gates)
- Story 3.3: Validate workspace filesystem management
- Story 3.4: Backend tests: ideas CRUD, workspace files
- Story 3.5: Update `pages/IdeaDetail.tsx` — remove scoring, update for new idea model
- Story 3.6: Ideas list page with create/view/update/delete
- Story 3.7: Frontend tests: ideas UI

## Requirements & Constraints

- Ideas CRUD must work without the Siemens FSM (`transitions` library, `state/`, `scoring/` modules).
- Each idea has a workspace folder — files attached to the idea live in that folder.
- Backend returns `snake_case` (e.g., `idea_id`); frontend must preserve this (no `camelCase` conversion).
- File-size limits: route files < 150 lines, services/repositories < 200.
- API route pattern: `APIRouter(prefix="/api", tags=[...])` with pydantic `RequestModel`/`ResponseModel`.
- Workspace filesystem: `storage/idea_workspace.py` manages idea workspace folders.
- Deprecated modules are off-limits for new code: `models/`, `state/`, `scoring/`, `orchestrator/`, `storage/` are being phased out — ST-3.3 validates `storage/idea_workspace.py` but does not rewrite it.
- Route all file access through `CompositeBackend` — never write to hardcoded absolute paths.

## Technical Decisions

- **idea_id wiring to ainvoke**: ST-2.1 discovered `idea_id` is accepted in the stream endpoint but never passed to `ainvoke()`. Epic 3 depends on this being wired up for proper idea-scoped agent routing.
- **Workspace filesystem**: `storage/idea_workspace.py` is the workspace manager. It's part of the deprecated `storage/` module but needs to be validated, not rewritten.
- **Filesystem routes**: `/workspace/` is read/write via `CompositeBackend` (ADR-003). `/kb/` and `/skills/` are read-only.
- **API client**: Frontend uses `@/api/client` for REST calls. `@/api/ideas.ts` is the ideas-specific client — existing file needs review.
- **Thread integration**: Epic 2 thread management hooks (`useThreadManager`) are stable and may be used by idea pages for idea-scoped threads.

## Cross-Story Dependencies

- **ST-3.1 → ST-3.2**: Ideas route depends on updated idea model without Siemens fields.
- **ST-3.1 → ST-3.3**: Ideas route depends on workspace filesystem being validated.
- **ST-3.4 → ST-3.1, 3.2, 3.3**: Backend tests cover all backend stories.
- **ST-3.5 → ST-3.1, 3.2**: Frontend idea detail depends on new API route and model.
- **ST-3.6 → ST-3.5**: Ideas list page depends on idea detail page.
- **ST-3.7 → ST-3.5, 3.6**: Frontend tests cover all frontend stories.
- **Epic 2 dependency**: `idea_id` wiring to `ainvoke()` (ST-2.1 deferred item) should be addressed early.
