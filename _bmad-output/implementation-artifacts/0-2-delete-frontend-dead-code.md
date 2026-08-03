---
story_key: 0-2-delete-frontend-dead-code
epic_key: epic-0
title: Delete Frontend Dead Code
status: done
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

## Dev Agent Record

### Agent Model Used

qwen-3.6-27b

### Completion Notes List

- Deleted 5 frontend dead code files as specified in AC
- Removed unused imports and dead references in IdeaDetail.tsx (Globe, fetchGateConfig, fetchCriteriaConfig, GateConfig)
- Removed unused Shield import in app-sidebar.tsx
- Fixed "Companion Companion" double-text branding in 2 locations (mockWorkspaceData.ts, CommandCenterWorkspacePane.tsx)
- Replaced residual Siemens branding in WorkspacePane (git URL, browser URL)
- Removed Siemens color palette from Tailwind config

### File List

- `frontend/src/pages/SiemensControls.tsx` (DELETED)
- `frontend/src/components/SiemensGateStatus.tsx` (DELETED)
- `frontend/src/components/ScoreRadar.tsx` (DELETED)
- `frontend/src/constants/gates.ts` (DELETED)
- `frontend/src/components/IdeaHistoryTimeline.tsx` (DELETED)
- `frontend/src/pages/IdeaDetail.tsx` (MODIFIED - removed dead imports)
- `frontend/src/components/app-sidebar.tsx` (MODIFIED - removed Shield import)
- `frontend/src/data/mockWorkspaceData.ts` (MODIFIED - branding fix)
- `frontend/src/components/command-center/CommandCenterWorkspacePane.tsx` (MODIFIED - branding fixes)
- `frontend/tailwind.config.js` (MODIFIED - removed Siemens palette)

### Review Findings

- [x] [Review][Patch] "Companion Companion" double-text branding in 2 locations — FIXED: replaced with "Companion" [mockWorkspaceData.ts:143, CommandCenterWorkspacePane.tsx:173]
- [x] [Review][Patch] Dead imports in IdeaDetail.tsx (Globe, fetchGateConfig, fetchCriteriaConfig, GateConfig) — FIXED: removed [IdeaDetail.tsx:21,41-42,46]
- [x] [Review][Patch] Unused Shield import in app-sidebar.tsx — FIXED: removed [app-sidebar.tsx:2]
- [x] [Review][Patch] Residual Siemens branding in WorkspacePane git URL and browser URL — FIXED: replaced with generic branding [CommandCenterWorkspacePane.tsx:126,194]
- [x] [Review][Patch] Siemens color palette in Tailwind config (zero usage) — FIXED: removed [tailwind.config.js:58-63]
- [x] [Review][Defer] Backend Siemens strings in models/prompts (structural model changes) — deferred, requires product decisions
- [x] [Review][Defer] LANGGRAPH_STRICT_MSGPACK validator breaks tests on fresh env — deferred, ST-1.2 loader concern
