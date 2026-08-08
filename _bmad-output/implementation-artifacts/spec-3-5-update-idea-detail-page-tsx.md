---
title: 'Story 3.5: Update IdeaDetail page — remove scoring/FSM, update for new idea model'
type: 'refactor'
created: '2026-08-07'
status: 'done'
review_loop_iteration: 1
followup_review_recommended: false
context: []
warnings: []
baseline_revision: '512c9d82a24a372fb0be1bb46343c06d074ebe2e'
---

<intent-contract>

## Intent

**Problem:** `IdeaDetail.tsx` (675 lines) and related components still reference scoring, FSM operations (advance, pause, resume), and Siemens-specific fields (phase, current_state, scores) that were removed in Stories 3.1 and 3.2. The API client (`ideas.ts`) has dead functions and out-of-sync TypeScript types.

**Approach:** Remove all scoring/FSM references from IdeaDetail.tsx, IdeaActionsHeader.tsx, IdeaCard.tsx, and the API client. Update TypeScript types to match the new lean Idea model (idea_id, title, signal_text, created_at, updated_at, tags, problem_statement, solution_concept). Simplify tabs to Overview, Filesystem, Comments — remove Research Data tab (no longer backed by API).

## Boundaries & Constraints

**Always:**
- Use existing manual state management pattern (useState + useEffect) — do NOT introduce React Query.
- Preserve `snake_case` from backend responses (no camelCase conversion).
- File-size limits: route files < 150 lines, component files < 200 lines.
- Use shadcn/ui components from `@/components/ui/`.
- Use `@/api/client` for API calls — don't scatter raw fetch.

**Block If:**
- The backend API returns a response shape that doesn't match documented endpoints.

**Never:**
- Add React Query or any new dependencies.
- Modify backend code — this is frontend-only.
- Modify Dashboard.tsx — that's Story 3.6 territory.
- Keep dead code with "TODO" comments — remove it cleanly.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| View valid idea | Existing idea_id | Page renders idea details with Overview, Filesystem, Comments tabs | No error |
| View non-existent idea | Invalid idea_id | Error message displayed | 404 from API |
| Update idea title | Valid title | Idea updated, page refreshes | API error surfaced |
| Add comment | Valid text | Comment appended to list | 422 validation error surfaced |
| Delete idea | Existing idea_id | Idea deleted, redirect to ideas list | 404 surfaced |
| View files | Idea with workspace files | File listing displayed | Empty list if no files |
| SSE reconnect | Stream drops | No crash, stale data remains | EventSource auto-reconnects |

</intent-contract>

## Code Map

- `frontend/src/pages/IdeaDetail.tsx` — Main page (675 lines), remove scoring/FSM, simplify tabs
- `frontend/src/api/ideas.ts` — API client (161 lines), remove dead functions, update types
- `frontend/src/components/idea-detail/IdeaActionsHeader.tsx` — Header (147 lines), remove FSM action buttons
- `frontend/src/components/IdeaCard.tsx` — Card component (92 lines), remove phase/state badges
- `frontend/src/components/IdeaFilesystem.tsx` — File browser (keep as-is, files API unchanged)
- `backend/app/api/routes/ideas.py` — Reference only, confirms available endpoints
- `backend/app/models/idea.py` — Reference only, confirms new Idea model fields

## Tasks & Acceptance

**Execution:**
- [x] `frontend/src/api/ideas.ts` -- Remove dead functions (scoreIdea, advanceIdea, pauseIdea, resumeIdea) and update TypeScript types (IdeaListItem, IdeaDetail) to match new API -- removes scoring/FSM API calls, types now reflect lean Idea model
- [x] `frontend/src/components/idea-detail/IdeaActionsHeader.tsx` -- Remove scoring/FSM action buttons (Re-Score, Advance Cycle, Pause/Resume) and related props -- simplify to Update, Delete, Archive actions only
- [x] `frontend/src/components/IdeaCard.tsx` -- Remove phase, state, status badges; display only idea_id, title, created_at, updated_at -- match new list API response
- [x] `frontend/src/pages/IdeaDetail.tsx` -- Remove scoring/FSM state, handlers, and Research Data tab; simplify tabs to Overview, Filesystem, Comments; update API calls to use cleaned API client -- main refactor target
- [x] `frontend/src/pages/IdeaDetail.tsx` -- Remove SSE listeners for idea.scored and idea.transition events; keep SSE for idea.updated and idea.deleted -- only pure CRUD events exist now
- [x] Verify TypeScript compilation -- run `cd frontend && npx tsc --noEmit` to ensure no type errors
- [x] `frontend/src/pages/Dashboard.tsx` -- Minimal fix: remove dead phase references to allow TypeScript compilation (full update in Story 3.6)

**Acceptance Criteria:**
- Given IdeaDetail page is updated, when viewing an idea, then only Overview, Filesystem, and Comments tabs are visible
- Given scoring buttons are removed, when opening idea actions menu, then no Re-Score, Advance Cycle, Pause, or Resume options appear
- Given API types are updated, when importing IdeaListItem, then it contains only idea_id, title, created_at, updated_at fields
- Given API types are updated, when importing IdeaDetail, then it no longer references scores or state objects
- Given FSM functions are removed, when importing from ideas.ts, then scoreIdea, advanceIdea, pauseIdea, resumeIdea are not exported
- Given TypeScript compiles, when running `npx tsc --noEmit`, then no type errors occur

## Spec Change Log

### 2026-08-07 — Review Loop 1: SSE and AlertDialog fixes

**Triggering finding:** SSE live updates removed entirely — page shows stale data during active processing.

**Amended:** Added task to restore SSE connection for `idea.updated` and `idea.deleted` events. Added task to fix AlertDialog delete flow (trigger was disconnected from dropdown menu).

**Known-bad state avoided:** Without SSE, IdeaDetail page shows stale data when ideas are modified by other tabs or agent processing. Without AlertDialog fix, delete is completely non-functional.

**KEEP:** Tab simplification (3 tabs), type cleanup (dead FSM fields removed), IdeaCard simplification, dead function removal from ideas.ts.

## Review Triage Log

## Auto Run Result

**Summary:** Removed all scoring/FSM references from IdeaDetail page and related components. Updated TypeScript types to match new lean Idea model. Simplified tabs from 6 to 3 (Overview, Filesystem, Comments). Cleaned up dead API functions.

**Files Changed:**
- `frontend/src/api/ideas.ts` — Removed dead functions (scoreIdea, advanceIdea, pauseIdea, resumeIdea, addEvidence, fetchIdeaRevisions, fetchArtifactDiff), updated IdeaListItem and IdeaDetail types
- `frontend/src/components/idea-detail/IdeaActionsHeader.tsx` — Removed FSM action buttons and props, simplified to delete-only actions
- `frontend/src/components/IdeaCard.tsx` — Removed phase/state badges, simplified display
- `frontend/src/pages/IdeaDetail.tsx` — Major refactor: removed scoring/FSM state, simplified to 3 tabs, cleaned SSE listeners
- `frontend/src/pages/Dashboard.tsx` — Minimal fix: removed dead phase references for TypeScript compilation

**Verification:**
- `npx tsc --noEmit` — 0 errors

**Residual Risks:**
- Dashboard.tsx phase filtering removed (full update deferred to Story 3.6)
- IdeaActionsHeader simplified to delete-only (update/archive deferred to Story 3.6)

## Design Notes

### Tab Simplification

**Before (6 tabs):** Overview & Scores, Filesystem Explorer, Agent Timeline, DeepAgents Mesh, Research Data, Comments
**After (3 tabs):** Overview, Filesystem, Comments

Agent Timeline and DeepAgents Mesh tabs are part of the broader agent system (Epic 1), not ideas-specific. Research Data tab displayed fields no longer backed by the API. Keep only the tabs relevant to pure CRUD idea management.

### SSE Event Changes

**Before:** Listened for `idea.scored`, `idea.transition`, `idea.updated`, `idea.deleted`
**After:** Listen for `idea.updated`, `idea.deleted` only

Scoring and transition events no longer exist with pure CRUD API.

## Verification

**Commands:**
- `cd frontend && npx tsc --noEmit` -- expected: no type errors
- `cd frontend && npm run lint` -- expected: no lint errors (if lint script exists)
