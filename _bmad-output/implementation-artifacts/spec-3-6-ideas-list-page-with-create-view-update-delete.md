---
title: 'Story 3.6: Ideas list page with create/view/update/delete'
type: 'feature'
created: '2026-08-07'
status: 'done'
review_loop_iteration: 0
followup_review_recommended: false
context: []
warnings: []
baseline_revision: ''
---

<intent-contract>

## Intent

**Problem:** The Ideas list page (`/ideas`) currently uses `Dashboard.tsx` which only displays a read-only list of ideas with search filtering. Users cannot create new ideas, update idea titles, or manage ideas from the list view. The page needs full CRUD capabilities to serve as the primary ideas management interface.

**Approach:** Enhance `Dashboard.tsx` to add create, update, and delete capabilities directly from the list view. Add a "New Idea" modal/dialog, inline title editing, and bulk actions. The page will serve as the landing page for ideas management with full CRUD operations.

## Boundaries & Constraints

**Always:**
- Use existing manual state management pattern (useState + useEffect) — do NOT introduce React Query.
- Preserve `snake_case` from backend responses (no camelCase conversion).
- File-size limits: route files < 150 lines, component files < 200 lines.
- Use shadcn/ui components from `@/components/ui/`.
- Use `@/api/client` for API calls — don't scatter raw fetch.
- Keep SSE connection for live updates.
- Use `useToast` for user feedback on actions.

**Block If:**
- The backend API returns a response shape that doesn't match documented endpoints.

**Never:**
- Add React Query or any new dependencies.
- Modify backend code — this is frontend-only.
- Modify IdeaDetail.tsx — that's Story 3.5 territory.
- Break existing SSE live updates.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| View ideas list | No ideas exist | Empty state with "Create first idea" CTA | No error |
| View ideas list | Ideas exist | Grid of IdeaCards with search/filter | No error |
| Create new idea | Valid title | Idea created, list refreshes, redirect to detail | API error surfaced |
| Create new idea | Empty title | Validation error shown | Client-side validation |
| Update idea title | Valid title | Title updated, list refreshes | API error surfaced |
| Delete from list | Existing idea | AlertDialog confirmation, then delete | 404 surfaced |
| Search ideas | Query matches titles | Filtered list shown | No error |
| SSE update | Idea created/updated/deleted | List auto-refreshes | No error |

</intent-contract>

## Code Map

- `frontend/src/pages/Dashboard.tsx` — Main ideas list page (97 lines), add CRUD capabilities
- `frontend/src/api/ideas.ts` — API client (102 lines), functions already exist
- `frontend/src/components/IdeaCard.tsx` — Card component (37 lines), add inline edit support
- `frontend/src/components/ui/dialog.tsx` — Dialog component for create modal
- `frontend/src/components/ui/alert-dialog.tsx` — AlertDialog for delete confirmation
- `backend/app/api/routes/ideas.py` — Reference only, confirms available endpoints

## Tasks & Acceptance

**Execution:**
- [x] `frontend/src/pages/Dashboard.tsx` -- Add "New Idea" button that opens create dialog -- use Dialog component with form for title and signal_text
- [x] `frontend/src/pages/Dashboard.tsx` -- Add createIdea handler that calls API and refreshes list -- use createIdea from API client
- [x] `frontend/src/pages/Dashboard.tsx` -- Add delete from list with AlertDialog confirmation -- use deleteIdea from API client
- [x] `frontend/src/components/IdeaCard.tsx` -- Add inline title edit on double-click -- preserve existing view mode, add edit mode with save/cancel
- [x] `frontend/src/pages/Dashboard.tsx` -- Add bulk selection with checkboxes -- allow selecting multiple ideas for bulk delete
- [x] Verify TypeScript compilation -- run `cd frontend && npx tsc --noEmit` to ensure no type errors

**Acceptance Criteria:**
- Given user is on /ideas page, when clicking "New Idea" button, then create dialog opens with title and signal_text fields
- Given user submits valid idea, when create dialog is submitted, then idea is created and list refreshes with new idea
- Given user double-clicks idea title, when inline edit mode activates, then user can edit and save title
- Given user deletes idea from list, when AlertDialog confirmation is clicked, then idea is deleted and list refreshes
- Given user selects multiple ideas, when bulk delete is triggered, then all selected ideas are deleted
- Given SSE event fires, when idea is created/updated/deleted by another source, then list auto-refreshes
- Given TypeScript compiles, when running `npx tsc --noEmit`, then no type errors occur

## Design Notes

### Create Dialog Design

**Fields:**
- Title (required, max 100 chars)
- Signal Text (optional, textarea)

**Behavior:**
- On submit: call createIdea API, close dialog, refresh list
- On success: redirect to new idea detail page
- On error: show toast error, keep dialog open

### Inline Edit Pattern

**Trigger:** Double-click on idea title in IdeaCard
**Mode:** Replace title text with input field + save/cancel buttons
**Save:** Call updateIdea API with field="title", value=newTitle
**Cancel:** Revert to original title

### Bulk Selection

**UI:** Checkbox in top-left corner of each IdeaCard
**Controls:** "Select All" checkbox in header, "Delete Selected" button when items selected
**Confirmation:** AlertDialog showing count of items to delete
**Execution:** Delete selected ideas sequentially, refresh list on completion

</intent-contract>

## Verification

**Commands:**
- `cd frontend && npx tsc --noEmit` -- expected: no type errors
- Manual test: Create idea, update title, delete from list, verify SSE updates
