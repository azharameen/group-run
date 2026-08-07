---
status: in-review
baseline_revision: b6f651937600c77137873b669efc769cee917f04
---

# Story 2.4: Update `useThreadManager.ts` for New Thread API

Status: ready-for-dev

## Story

As a **frontend developer working on the Companion app**,
I want **`useThreadManager.ts` updated and aligned with the new thread API**,
so that **thread CRUD operations are properly exposed, stale state is avoided, and the hook integrates cleanly with the rest of the app**.

## Acceptance Criteria

1. **ensureThread Uses Fresh Thread State (AC: Bug Fix)**:
   - Given `ensureThread` is called after threads have been updated by another component
   - When the hook checks `activeThreadId`
   - Then it should see the latest thread list (not a stale closure value)
   - And avoid creating unnecessary duplicate threads

2. **updateThread and deleteThread Exposed (AC: New Functionality)**:
   - The hook exposes `updateThread(threadId, updates)` and `deleteThread(threadId)` functions
   - Both refresh the thread list after mutation so UI stays in sync
   - `deleteThread` switches away from the deleted thread

3. **refreshThreads Called After Mutations (AC: Consistency)**:
   - After `ensureThread` creates a new thread, `refreshThreads` is called to sync state
   - Sidebar and chat view both reflect the new thread immediately

4. **TypeScript Strict Compliance (AC: Quality)**:
   - No `any` types in the hook
   - All functions properly typed
   - `snake_case` API contract preserved

5. **No Breaking Changes (AC: Regression Prevention)**:
   - Existing consumers of `useThreadManager` (CommandCenter, useChatStream) continue to work
   - `activeThread`, `ensureThread`, `refreshThreads` remain exported with same signatures

## Tasks / Subtasks

- [ ] **Task 1: Fix ensureThread Stale Closure (AC: 1)**
  - [ ] 1.1 Use `useRef` or `useCallback` dependencies to avoid stale `threads` array
  - [ ] 1.2 Call `refreshThreads` after creating a new thread to sync state
  - [ ] 1.3 Ensure `ensureThread` returns the newly created thread's ID

- [ ] **Task 2: Add updateThread and deleteThread (AC: 2)**
  - [ ] 2.1 Import `updateThread` and `deleteThread` from `@/api/client`
  - [ ] 2.2 Implement `updateThread(threadId, updates)` — calls API, then `refreshThreads()`
  - [ ] 2.3 Implement `deleteThread(threadId)` — calls API, switches away from deleted thread, then `refreshThreads()`
  - [ ] 2.4 Export both functions from the hook return

- [ ] **Task 3: Fix refreshThreads Stability (AC: 3)**
  - [ ] 3.1 Ensure `refreshThreads` doesn't cause infinite re-render loop
  - [ ] 3.2 Verify `useEffect` that fetches threads only runs on mount

- [ ] **Task 4: Code Quality and Integration (AC: 4, 5)**
  - [ ] 4.1 Verify no `any` types in the hook
  - [ ] 4.2 Verify existing consumers still compile and work
  - [ ] 4.3 Verify `snake_case` API types preserved

## Dev Notes

### Current State Analysis

**useThreadManager.ts (67 lines) — Current exports:**
- `activeThread` — derived from `threads` list + `activeThreadId`
- `ensureThread()` — returns active thread ID or creates a new one
- `refreshThreads()` — re-fetches thread list

**Known Issues:**
1. `ensureThread` captures `threads` in its closure via `useCallback` — stale after sidebar updates
2. `updateThread` and `deleteThread` from API layer exist but aren't exposed through the hook
3. After creating a thread, `ensureThread` appends to local state (`[...threads, thread]`) instead of refreshing — can diverge from server

**Consumer Components:**
- `CommandCenter.tsx` — passes `activeThreadId`, `setActiveThreadId`, `onThreadsUpdate`, `onActiveThreadTitleChange`, `threads`
- `useChatStream.ts` — calls `ensureThread()`, `listThreads()` (on stream complete)
- `nav-threads.tsx` — calls `createThread()`, `deleteThread()`, `updateThread()` directly from API layer

**Critical Gap:** `nav-threads.tsx` calls `deleteThread` and `updateThread` directly from `@/api/client` instead of going through `useThreadManager`. This means `useThreadManager` doesn't know about these mutations, leading to stale state. The hook should be the single source of truth for thread mutations.

### Critical File Locations

| File | Action | Key Changes |
|---|---|---|
| `frontend/src/hooks/useThreadManager.ts` | UPDATE | Fix stale closure, add updateThread/deleteThread, call refreshThreads |
| `frontend/src/components/nav-threads.tsx` | VERIFY | Check if it uses the hook or direct API calls |
| `frontend/src/hooks/useChatStream.ts` | VERIFY | Check ensureThread usage |
| `frontend/src/api/threads.ts` | VERIFY | API functions already exist |
| `frontend/src/api/client.ts` | VERIFY | Re-exports from threads.ts |

### Architecture Decisions

**useThreadManager Ownership (AD-13):**
- `useThreadManager` is the canonical consumer-facing hook for thread operations
- Components should call through the hook, not bypass it with direct API calls
- The hook is responsible for keeping thread state consistent

### Consistency Conventions

**TypeScript Patterns:**
- Use `@/api/client` for REST calls
- Preserve `snake_case` from backend
- Use `useCallback` with stable dependencies
- Use `useRef` for mutable state that doesn't need re-renders

### Previous Story Intelligence

**From ST-2.1 (Clean up API Routes threads.py):**
- Thread CRUD API is stable and functional
- `updateThread` uses PUT, supports PATCH
- `deleteThread` is idempotent

**From ST-2.5 (Thread List Sidebar):**
- `nav-threads.tsx` already has thread create, switch, delete UI
- Calls API functions directly — hook doesn't know about mutations
- `onSelectThread` callback changes `activeThreadId`

### Potential Pitfalls

1. **Stale closure in `ensureThread`** — `threads` in `useCallback` deps means it's called when threads change, but the callback captures the old array. Use `useRef` for the threads array.
2. **Infinite re-render loop** — If `refreshThreads` is called inside a `useEffect` that depends on `threads`, it may loop. Keep refresh as a manual trigger.
3. **Delete thread switch** — When deleting the active thread, switch to another thread to avoid null state.
4. **Don't break consumers** — `CommandCenter.tsx` depends on current hook interface.

### Library/Framework Requirements

- React 18, TypeScript strict mode
- `@/api/client` re-exports: `listThreads`, `createThread`, `updateThread`, `deleteThread`
- `ThreadMetadata`, `UpdateThreadRequest` types from `@/api/client`

### Dependencies

- **ST-2.1** (API routes cleanup) — PREREQUISITE, done
- **ST-2.5** (Thread sidebar) — Provides UI consumers, done

### References

- [Source: _bmad-output/planning-artifacts/epics.md#EP-2] — "ST-2.4 Frontend: Update useThreadManager.ts for new thread API"
- [Source: frontend/src/hooks/useThreadManager.ts] — Current hook implementation
- [Source: frontend/src/components/nav-threads.tsx] — Thread sidebar (consumer)
- [Source: frontend/src/api/threads.ts] — API layer with thread functions

## Dev Agent Record

### Agent Model Used

{{agent_model_name_version}}

### Debug Log References

### Completion Notes List

### File List

- `frontend/src/hooks/useThreadManager.ts`

## Review Triage Log

### 2025-07-11 — Review pass
- intent_gap: 0
- bad_spec: 0
- patch: 1: (low 1)
- defer: 3: (medium 2, low 1)
- reject: 7
- addressed_findings:
  - `[low][patch]` Removed unused `threadsRef` — useRef imported but never actually used for lookup
  - `[medium][defer]` ensureThread returns stale ID if active thread was deleted elsewhere — requires broader design decision
  - `[medium][defer]` Concurrent mutations can race on refreshThreads — needs deduplication/in-flight protection
  - `[low][defer]` refreshThreads swallows fetch errors silently — toast notification needed for user visibility

## Spec Change Log

(none)

## Auto Run Result

### Summary

Updated `useThreadManager.ts` to align with the new thread API:
- Fixed stale closure in `ensureThread` using `useRef` for `activeThreadId`
- Added `updateThread(threadId, updates)` and `deleteThread(threadId)` to the hook API
- After mutations, `refreshThreads()` is called to sync with server state
- Initial mount fetch now uses one-time guard to prevent duplicate fetches
- `deleteThread` auto-switches away from deleted thread

### Files Changed

| File | Description |
|---|---|
| `frontend/src/hooks/useThreadManager.ts` | Stale closure fix, updateThread/deleteThread added, refreshThreads after mutations |

### Review Findings

- **1 patch applied:** Removed unused `threadsRef`
- **3 items deferred:** Stale ID handling, concurrent mutation races, silent error swallowing
- **7 items rejected:** Noise, by-design behavior, diff artifacts

### Follow-up Review Recommendation

`false` — Changes are localized to one hook file with straightforward logic

### Verification

- TypeScript: `tsc --noEmit` — passed (0 errors)
- Frontend tests: `vitest run` — 66 passed (3 test files)

### Residual Risks

- `deleteThread` sets active thread to `null` when last thread is deleted — UI handles this by showing "Agent Team Chat"
- Concurrent mutations from multiple components may cause refresh races — deferred for future hardening
