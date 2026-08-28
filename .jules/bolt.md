## BOLT'S JOURNAL

## 2026-08-28 - Unnecessary Filtering in React Renders
**Learning:** Discovered a frontend performance bottleneck where array  computations are re-evaluated on every render because they depend on search queries and data state, causing unnecessary processing whenever unrelated UI state updates (like modals toggling).
**Action:** Use `useMemo` in React components to wrap expensive computations, depending only on the actual parameters that dictate the outcome (e.g. `[ideas, searchQuery]`).

## 2026-08-28 - Unnecessary Filtering in React Renders
**Learning:** Discovered a frontend performance bottleneck where array filter computations are re-evaluated on every render because they depend on search queries and data state, causing unnecessary processing whenever unrelated UI state updates (like modals toggling).
**Action:** Use useMemo in React components to wrap expensive computations, depending only on the actual parameters that dictate the outcome.
