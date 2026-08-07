---
status: in-progress
baseline_revision: ccad54c04e5363a4f615196916124562f6c35f12
---

# Story 2.6: Frontend Tests — Thread Management UI

Status: in-progress

## Story

As a **frontend developer maintaining the Companion app**,
I want **comprehensive tests for thread management UI components and hooks**,
so that **regressions in thread creation, switching, deletion, and state management are caught before reaching production**.

## Acceptance Criteria

1. **useThreadManager Hook Tests (AC: Hook Coverage)**:
   - Given the hook is rendered with mocked API functions
   - When threads are returned from the initial fetch
   - Then `activeThread` derives correctly, `ensureThread` creates when needed, and `onThreadsUpdate` is called
   - And `updateThread` and `deleteThread` call correct API functions and refresh state

2. **NavThreads Component Tests (AC: Component Coverage)**:
   - Given the component is rendered with mocked sidebar, API, and dialog dependencies
   - When thread list is populated
   - Then threads display with correct titles, active state, and empty state messages
   - And search filters threads correctly

3. **Thread CRUD Interaction Tests (AC: Integration Coverage)**:
   - Given mocked API responses
   - When user clicks "New Thread" button
   - Then `createThread` is called and `onSelectThread` receives the new thread ID
   - And when user confirms rename or delete, the correct API function is called

4. **Test Infrastructure (AC: Quality)**:
   - Tests use Vitest + React Testing Library patterns consistent with existing test suite
   - API functions are mocked via `vi.mock('@/api/client')`
   - Sidebar dependencies are mocked to avoid complex rendering
   - No `any` types in test code
   - All tests pass with `vitest run`

5. **No Breaking Changes (AC: Regression Prevention)**:
   - All existing tests continue to pass
   - No modifications to production code

## Tasks / Subtasks

- [ ] **Task 1: Create useThreadManager hook tests** (AC: 1)
  - [ ] 1.1 Create `frontend/src/__tests__/useThreadManager.test.tsx`
  - [ ] 1.2 Mock `@/api/client` functions
  - [ ] 1.3 Test initial thread fetch on mount
  - [ ] 1.4 Test `activeThread` derivation from threads list
  - [ ] 1.5 Test `ensureThread` returns existing thread ID
  - [ ] 1.6 Test `ensureThread` creates new thread when no active thread
  - [ ] 1.7 Test `updateThread` calls API and refreshes
  - [ ] 1.8 Test `deleteThread` calls API, clears active thread, and refreshes

- [ ] **Task 2: Create NavThreads component tests** (AC: 2, 3)
  - [ ] 2.1 Mock sidebar, dialog, tooltip, and API dependencies
  - [ ] 2.2 Test thread list rendering with thread data
  - [ ] 2.3 Test active thread highlighting
  - [ ] 2.4 Test empty state messages
  - [ ] 2.5 Test search filtering
  - [ ] 2.6 Test "New Thread" button triggers createThread
  - [ ] 2.7 Test thread selection callback
  - [ ] 2.8 Test collapsed rail mode returns null

- [ ] **Task 3: Validate test suite** (AC: 4, 5)
  - [ ] 3.1 Run `vitest run` and verify all tests pass
  - [ ] 3.2 Verify no TypeScript errors in test files
  - [ ] 3.3 Verify existing tests still pass

## Dev Notes

### Testing Patterns (from existing tests)

**Mock API client:** `vi.mock('@/api/client', () => ({ ... }))` with individual function mocks
**Mock sub-components:** Use `vi.mock()` to replace shadcn/ui components with simple JSX
**renderHook:** Use `@testing-library/react`'s `renderHook` for hook tests
**act wrapping:** Wrap async state updates in `act()` to avoid warnings
**beforeEach/afterEach:** Reset mocks and state between tests

### Critical File Locations

| File | Action |
|---|---|
| `frontend/src/__tests__/useThreadManager.test.tsx` | CREATE — Hook tests |
| `frontend/src/__tests__/NavThreads.test.tsx` | CREATE — Component tests |
| `frontend/src/hooks/useThreadManager.ts` | UNDER TEST |
| `frontend/src/components/nav-threads.tsx` | UNDER TEST |
| `frontend/src/__tests__/useChatStream.test.tsx` | REFERENCE — Mock patterns |
| `frontend/src/__tests__/CommandCenter.test.tsx` | REFERENCE — Component mock patterns |

### Dependencies

- **ST-2.4** (useThreadManager hook) — provides the hook under test, done
- **ST-2.5** (thread sidebar) — provides the component under test, done
- **ST-1.11** (frontend tests) — established test infrastructure, done

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List
