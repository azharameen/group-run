# Story 6.5: Update pages/KnowledgeBase.tsx for new API

Status: done

## Story

As a User,
I want to browse the knowledge base using the new standardized API,
so that I can see the same knowledge base content that agents are using and manage documents effectively.

## Acceptance Criteria

1. Update `frontend/src/api/knowledge.ts` to use the new standardized endpoints:
   - `fetchKnowledgeBase` should call `GET /api/kb` instead of `/api/knowledge-base`.
   - `ingestKnowledgeBaseDocument` should call `POST /api/kb` instead of `/api/knowledge-base/ingest`.
2. Update `frontend/src/api/knowledge.ts` types to match the new API response:
   - `KBDocument` should align with `KnowledgeDocument` schema from backend.
   - `KnowledgeBaseData` should align with `KnowledgeBaseResponse` schema from backend.
3. Update `frontend/src/pages/KnowledgeBase.tsx` to handle the new data structure.
4. Update `frontend/src/components/knowledge-base/DocumentUploadCard.tsx` and `DocumentViewerCard.tsx` to work with the updated API client and types.
5. Ensure the knowledge base browser correctly displays files from `knowledge-base/` directory (mapped via `/kb/` in `CompositeBackend`).
6. UI must remain responsive and handle loading/error states for the new endpoints.

## Tasks / Subtasks
- [x] Update `frontend/src/api/knowledge.ts` (AC: 1, 2)
  - [x] Change endpoints to `/api/kb`.
  - [x] Update `KBDocument`, `KnowledgeBaseData`, and `KnowledgeBaseUploadResult` types.
- [x] Update `frontend/src/pages/KnowledgeBase.tsx` (AC: 3, 6)
  - [x] Adapt `loadData` to the new response shape.
  - [x] Update state management if response structure changed significantly.
- [x] Update `frontend/src/components/knowledge-base/DocumentUploadCard.tsx` (AC: 4)
  - [x] Adapt to new `ingestKnowledgeBaseDocument` signature if needed.
- [x] Update `frontend/src/components/knowledge-base/DocumentViewerCard.tsx` (AC: 4, 5)
  - [x] Adapt to new `KBDocument` shape.
  - [x] Ensure `doc.path` and `doc.content` are handled correctly.

...

## Status: review

- **Architecture Compliance:** Follow AD-6 (Workspace Filesystem as Source of Truth). The frontend should correctly reflect the filesystem-based knowledge base.
- **API Change:** The backend story 6.1 migrates `/api/knowledge-base` to `/api/kb` and standardizes the response to `KnowledgeBaseResponse` which contains a list of `KnowledgeDocument`.
- **Types:** Ensure the `content` field in `KBDocument` is handled flexibly (string for text/md, object for JSON sidecars of binary files).
- **Regression:** Ensure the upload functionality still works with the new `POST /api/kb` endpoint.

### Project Structure Notes

- Update: `frontend/src/api/knowledge.ts`
- Update: `frontend/src/pages/KnowledgeBase.tsx`
- Update: `frontend/src/components/knowledge-base/DocumentUploadCard.tsx`
- Update: `frontend/src/components/knowledge-base/DocumentViewerCard.tsx`

### References

- [Source: _bmad-output/planning-artifacts/epics.md#EP-6: Knowledge & Memory]
- [Source: _bmad-output/implementation-artifacts/6-1-knowledge-base-api.md]
- [Source: backend/app/api/routes/knowledge.py] (Old API for reference)
- [Source: frontend/src/api/knowledge.ts]

## Dev Agent Record

### Agent Model Used

Gemini 2.0 Flash

### Debug Log References

### Completion Notes List

### File List
