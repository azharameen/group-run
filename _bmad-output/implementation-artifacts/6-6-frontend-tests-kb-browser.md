---
baseline_commit: current

# Story 6.6: Frontend Tests — Knowledge Base Browser

| Field | Value |
|-------|-------|
| **Story ID** | 6.6 |
| **Epic** | EP-6: Knowledge & Memory 📚 |
| **Layer** | Frontend |
| **Type** | NEW — Test Infrastructure + Tests |
| **Status** | ready-for-dev |
| **Created** | 2026-08-09 |
| **Author** | Gemini CLI |

---

## User Story

**As a** developer working on the Companion frontend,  
**I want** comprehensive unit and integration tests for the Knowledge Base browser page and its components,  
**so that** I can ensure the user can browse, view, and upload knowledge documents correctly and that regressions are caught.

---

## Acceptance Criteria

### AC#1: KnowledgeBase Page Tests
**GIVEN** the `KnowledgeBase.tsx` page exists  
**WHEN** the tests are run  
**THEN**:
- The page renders correctly with the "Knowledge Base" title.
- Overview cards (Source Documents, Repository Sources, Ideas Discovered) display correct counts from `kbData` and `ideas`.
- The loading state is displayed correctly while data is being fetched.
- Data fetching (`fetchIdeas`, `fetchKnowledgeBase`) is triggered on mount.
- SSE connection (`connectSSE`) is established on mount and closed on unmount.

### AC#2: DocumentViewerCard Tests
**GIVEN** the `DocumentViewerCard` component  
**WHEN** tests are run  
**THEN**:
- Documents from `kbData` are rendered in a list.
- Toggling categories (e.g., "Local Knowledge Documents") works correctly.
- Toggling document expansion (to see pre-formatted content) works correctly.
- Clicking "View Content" opens the Dialog with full document content.
- External patent and knowledge sources are displayed as badges.

### AC#3: DocumentUploadCard Tests
**GIVEN** the `DocumentUploadCard` component  
**WHEN** tests are run  
**THEN**:
- The upload card renders with an upload icon and instructions.
- Clicking "Upload file" triggers the hidden file input.
- Selecting a file triggers the `ingestKnowledgeBaseDocument` API call with base64 encoded content.
- The `uploading` state is correctly reflected (e.g., displaying a loader).
- `onSuccess` callback is called after a successful upload.

### AC#4: Knowledge API Mocking
**GIVEN** the frontend tests  
**WHEN** interacting with KB features  
**THEN**:
- `fetchKnowledgeBase` and `ingestKnowledgeBaseDocument` from `@/api/client` are mocked.
- Different document types (string vs object content) are handled correctly in tests.

### AC#5: All Tests Pass Clean
**GIVEN** all test files are created  
**WHEN** `npm test` is run in the frontend directory  
**THEN** all tests pass with zero failures and zero errors

---

## Story Requirements

### Functional Requirements (from Epics)

| ID | Description | Source |
|----|-------------|--------|
| FR-6.6 | Frontend tests: KB browser | EP-6 |
| FR-11.1 | Vitest setup | EP-1+ (Pre-existing) |
| FR-11.2 | Frontend component tests | EP-1+ (Pre-existing) |

---

## Developer Context Section

### Critical Implementation Notes

1. **Test Infrastructure is already set up** — Vitest and React Testing Library were set up in Story 1.11. Use existing patterns from `frontend/src/__tests__/`.

2. **Mocking `@/api/client` is essential** — Use `vi.mock('@/api/client', ...)` to provide controlled data for tests.

3. **Handle Base64 encoding in Upload Tests** — The `DocumentUploadCard` performs base64 encoding. Tests should verify that the API is called with the expected structure.

4. **SSE Mocking** — `connectSSE` should be mocked to ensure it doesn't try to open a real connection during tests.

---

## Technical Requirements

### Tech Stack

| Name | Version |
|------|---------|
| Vitest | ^2.1.x |
| React Testing Library | ^16.x |
| jsdom | ^24.x |

---

## Architecture Compliance

### Must Follow

1. **Use `@/` path aliases** for all imports.
2. **Follow existing test naming conventions** (e.g., `KnowledgeBase.test.tsx`).
3. **DO NOT modify production code**.

### File Structure

```
frontend/
├── src/
│   ├── __tests__/
│   │   ├── KnowledgeBase.test.tsx      # NEW — Page-level tests
│   │   ├── DocumentViewerCard.test.tsx # NEW — Viewer component tests
│   │   └── DocumentUploadCard.test.tsx # NEW — Upload component tests
```

---

## Tasks / Subtasks

### Task 1: DocumentUploadCard Tests (AC#3)
- [x] Create `frontend/src/__tests__/DocumentUploadCard.test.tsx`
- [x] Test rendering of upload card
- [x] Test file input trigger
- [x] Test `ingestKnowledgeBaseDocument` call with file content
- [x] Test `uploading` state and `onSuccess` callback

### Task 2: DocumentViewerCard Tests (AC#2)
- [x] Create `frontend/src/__tests__/DocumentViewerCard.test.tsx`
- [x] Test rendering of document list
- [x] Test category toggling
- [x] Test document expansion (inline pre)
- [x] Test Dialog opening with full content

### Task 3: KnowledgeBase Page Tests (AC#1)
- [x] Create `frontend/src/__tests__/KnowledgeBase.test.tsx`
- [x] Test page rendering and title
- [x] Test overview card counts
- [x] Test loading state
- [x] Test data fetching on mount
- [x] Test SSE connection lifecycle

### Task 4: Final Validation (AC#5)
- [x] Run `npm test` and verify success
- [x] Run `tsc --noEmit` and verify type safety
