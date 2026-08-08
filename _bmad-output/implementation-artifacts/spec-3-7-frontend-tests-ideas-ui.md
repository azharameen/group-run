---
title: 'Story 3.7: Frontend tests — ideas UI'
type: 'test'
created: '2026-08-07'
status: 'in-progress'
review_loop_iteration: 0
followup_review_recommended: false
context: []
warnings: []
baseline_revision: ''
---

<intent-contract>

## Intent

**Problem:** The ideas UI components (`Dashboard.tsx`, `IdeaDetail.tsx`, `IdeaCard.tsx`, `IdeaActionsHeader.tsx`) lack unit tests. Stories 3.5 and 3.6 introduced significant changes to these components, but there are no tests to prevent regressions or verify the CRUD operations work correctly.

**Approach:** Create comprehensive unit tests for the ideas UI components using Vitest and React Testing Library. Test CRUD operations, SSE live updates, error handling, and edge cases. Follow the existing test patterns from `CommandCenter.test.tsx` and `useChatStream.test.tsx`.

## Boundaries & Constraints

**Always:**
- Use Vitest as the test runner with `@testing-library/react` for rendering.
- Mock API calls using `vi.mock` — tests should be fast and isolated.
- Mock hooks and sub-components to test component behavior in isolation.
- Follow existing test patterns from `frontend/src/__tests__/`.
- Use `data-testid` attributes for test selectors where semantic selectors are insufficient.
- Test both happy paths and error scenarios.

**Block If:**
- The component under test has unresolvable dependencies that cannot be mocked.

**Never:**
- Test implementation details — test behavior and user interactions.
- Make real API calls — all tests must be isolated with mocks.
- Skip error handling tests — error states are critical for UX.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Dashboard renders | Empty ideas list | Empty state with CTA displayed | No error |
| Dashboard renders | Ideas list populated | IdeaCards rendered in grid | No error |
| Create idea | Valid title submitted | API called, list refreshed | API error shows toast |
| Update title | Valid title in inline edit | API called, card updates | API error shows toast |
| Delete idea | Delete confirmed | AlertDialog closes, API called | 404 shows toast |
| IdeaDetail renders | Valid idea data | 3 tabs visible (Overview, Filesystem, Comments) | No error |
| IdeaDetail error | Invalid idea ID | Error message displayed | 404 handled gracefully |
| SSE update | Event fires | List/detail refreshes | No crash on disconnect |

</intent-contract>

## Code Map

- `frontend/src/__tests__/Dashboard.test.tsx` — NEW: Tests for ideas list page
- `frontend/src/__tests__/IdeaDetail.test.tsx` — NEW: Tests for idea detail page
- `frontend/src/__tests__/IdeaCard.test.tsx` — NEW: Tests for idea card component
- `frontend/src/pages/Dashboard.tsx` — MAYBE ADD: data-testid attributes for test selectors
- `frontend/src/pages/IdeaDetail.tsx` — Reference only, understand component structure
- `frontend/src/components/IdeaCard.tsx` — Reference only, understand component structure
- `frontend/src/api/ideas.ts` — Reference only, understand API functions to mock

## Tasks & Acceptance

**Execution:**
- [ ] `frontend/src/__tests__/IdeaCard.test.tsx` -- Create tests for IdeaCard component -- test rendering, idea display, click navigation, inline edit trigger
- [ ] `frontend/src/__tests__/Dashboard.test.tsx` -- Create tests for Dashboard ideas list -- test empty state, ideas grid, search filtering, create dialog, bulk selection
- [ ] `frontend/src/__tests__/IdeaDetail.test.tsx` -- Create tests for IdeaDetail page -- test tab rendering, comment submission, delete flow, SSE reconnection
- [ ] `frontend/src/__tests__/IdeaActionsHeader.test.tsx` -- Create tests for IdeaActionsHeader -- test dropdown menu, delete confirmation trigger
- [ ] Add data-testid attributes where needed -- ensure tests have stable selectors
- [ ] Verify tests pass -- run `cd frontend && npm run test` to ensure all tests pass

**Acceptance Criteria:**
- Given IdeaCard tests exist, when rendering with idea prop, then idea_id and title are displayed
- Given Dashboard tests exist, when ideas list is empty, then empty state message is shown
- Given Dashboard tests exist, when create dialog is submitted, then createIdea API is called
- Given IdeaDetail tests exist, when viewing idea, then 3 tabs are visible
- Given IdeaDetail tests exist, when comment is submitted, then addIdeaComment API is called
- Given delete flow is tested, when delete is confirmed, then deleteIdea API is called
- Given all tests pass, when running `npm run test`, then 0 failures occur

## Design Notes

### Test Structure

Follow the pattern from `CommandCenter.test.tsx`:
1. Mock all API imports from `@/api/client`
2. Mock sub-components to isolate the component under test
3. Use `vi.fn()` for callbacks and state updates
4. Test rendering, user interactions, and API calls
5. Use `waitFor` for async operations

### Mock Strategy

```typescript
vi.mock('@/api/client', () => ({
  fetchIdeas: vi.fn(),
  createIdea: vi.fn(),
  updateIdea: vi.fn(),
  deleteIdea: vi.fn(),
  addIdeaComment: vi.fn(),
  connectSSE: vi.fn(),
}));
```

### Test Coverage Targets

- **IdeaCard:** Rendering, navigation, inline edit
- **Dashboard:** Empty state, list rendering, search, create, delete, SSE
- **IdeaDetail:** Tab navigation, comment submission, delete flow, error states
- **IdeaActionsHeader:** Dropdown menu, delete trigger

</intent-contract>

## Verification

**Commands:**
- `cd frontend && npm run test` -- expected: all tests pass
- `cd frontend && npm run test -- --coverage` -- expected: >80% coverage on ideas components
