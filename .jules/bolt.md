## 2023-10-25 - [Frontend Performance: useMemo]
**Learning:** In React, expensive computations like list filtering running on every render can cause performance issues when the list or search string changes frequently. Even if it's relatively fast, wrapping it in `useMemo` avoids redundant re-computations and aligns with best practices for optimized React components.
**Action:** Always identify arrays being mapped or filtered inside the component body before return, and encapsulate that logic within `useMemo` to ensure only the necessary dependencies trigger recalculation.
