# Story 6.1: Knowledge Base API

Status: review

## Story

As a User,
I want to browse knowledge base documents and ingest new ones via API,
so that the agent has access to shared knowledge across conversations and I can manage this knowledge.

## Acceptance Criteria

1. API endpoint `GET /api/kb` lists all documents in the knowledge base.
2. API endpoint `GET /api/kb/{path:path}` returns the content of a specific document.
3. API endpoint `POST /api/kb` ingests a new document (upload/write).
4. All operations are routed through `CompositeBackend` to `/kb/`.
5. Files are stored in the `knowledge-base/` directory relative to project root.
6. New API endpoints follow project naming conventions and pydantic model standards.

## Tasks / Subtasks

- [x] Create `backend/app/api/routes/kb.py` (AC: 1, 2, 3, 6)
  - [x] Implement router with `/api/kb` prefix and `Knowledge Base` tag.
  - [x] Implement `GET /` to list files in `/kb/`.
  - [x] Implement `GET /{path:path}` to read file content from `/kb/`.
  - [x] Implement `POST /` to write file to `/kb/`.
- [x] Register `kb_router` in `backend/app/api/app.py` (AC: 1, 2, 3)
  - [x] Import and include the new router.
- [x] Ensure `CompositeBackend` is correctly utilized for `/kb/` route (AC: 4, 5)
  - [x] Verify `KNOWLEDGE_BASE_DIR` in `config.py` points to the correct repo root path.

## Dev Notes

- **Architecture Compliance:** Followed AD-6 and AD-13. Used `CompositeBackend` for all filesystem operations.
- **Backend:** Used FastAPI `APIRouter`. Renamed route file to `kb.py` to avoid potential auto-revert conflicts observed during development.
- **Verification:** Created and ran a `TestClient` script that successfully verified all endpoints including subfolder operations.

### Project Structure Notes

- New file: `backend/app/api/routes/kb.py`
- Update: `backend/app/api/app.py`

### References

- [Source: _bmad-output/planning-artifacts/epics.md#EP-6: Knowledge & Memory]
- [Source: backend/app/agent/backends.py]

## Dev Agent Record

### Agent Model Used

Gemini 2.0 Flash

### Debug Log References

- Verified endpoints manually via `TestClient`.

### Completion Notes List

- Implemented standard CRUD-like API for KB.
- Enforced virtual path mapping via `CompositeBackend`.
- Handled subfolder ingestion and reading.

### File List

- `backend/app/api/routes/kb.py`
- `backend/app/api/app.py`
