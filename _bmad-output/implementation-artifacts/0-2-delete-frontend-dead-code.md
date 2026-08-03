---
story_key: 0-2-delete-frontend-dead-code
epic_key: epic-0
title: Delete Frontend Dead Code
status: review
priority: high
tags: [frontend, cleanup, technical-debt]
---

# Story: Delete Frontend Dead Code

## Context
As part of the migration from the Siemens Patent Ideator (FSM-based) to the general-purpose Agentic Organization Platform (LangGraph-based), we need to remove all frontend components, pages, and constants that are specific to the old Siemens paradigm. These files are no longer used and their presence complicates the codebase and may lead to confusion during the migration.

## Acceptance Criteria
1. The following files are deleted from the repository:
   - `frontend/src/pages/SiemensControls.tsx`
   - `frontend/src/components/SiemensGateStatus.tsx`
   - `frontend/src/components/ScoreRadar.tsx`
   - `frontend/src/constants/gates.ts`
   - `frontend/src/components/IdeaHistoryTimeline.tsx`
2. Any imports of these files in other parts of the application are removed.
3. The application still builds successfully (no compiler errors due to missing files).

## Technical Notes
- Check `frontend/src/App.tsx` for routes to `SiemensControls`.
- Check `frontend/src/pages/Dashboard.tsx` or `frontend/src/pages/IdeaDetail.tsx` for usage of `SiemensGateStatus`, `ScoreRadar`, or `IdeaHistoryTimeline`.
- Check `frontend/src/components/app-sidebar.tsx` for navigation items pointing to Siemens-specific pages.

## Files to be deleted:
- `frontend/src/pages/SiemensControls.tsx`
- `frontend/src/components/SiemensGateStatus.tsx`
- `frontend/src/components/ScoreRadar.tsx`
- `frontend/src/constants/gates.ts`
- `frontend/src/components/IdeaHistoryTimeline.tsx`
