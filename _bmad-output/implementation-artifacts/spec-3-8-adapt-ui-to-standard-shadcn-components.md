---
title: 'Story 3.8: Adapt UI to standard shadcn/ui components with Radix primitives'
type: 'refactor'
created: '2026-08-08'
status: 'done'
review_loop_iteration: 1
followup_review_recommended: false
context: []
warnings: []
baseline_revision: ''
---

<intent-contract>

## Intent

**Problem:** The frontend codebase contained custom non-standard components (`chat-primitives.tsx`, `input-group.tsx`, `page-skeleton.tsx`) and raw HTML input/textarea/button elements that bypassed the official `shadcn/ui` Radix component design system.

**Approach:** Replace all custom UI primitives with official `shadcn/ui` Radix-backed components. Extract domain/feature-specific chat components (`live-trace.tsx`, `turn-minimap.tsx`, `message-actions.tsx`, `thinking.tsx`) into dedicated feature locations. Replace raw HTML input elements with `shadcn` `Input`, `Textarea`, `Button`, `AlertDialog`, `Tabs`, and `useToast`.

## Boundaries & Constraints

**Always:**
- Use standard `shadcn/ui` primitives from `@/components/ui/`.
- Preserve existing functionality and layout aesthetics.
- Ensure full TypeScript type safety (`tsc -b`).
- Ensure Vite production build succeeds.

**Never:**
- Leave dead custom UI component files in `@/components/ui/`.
- Use raw browser alert/confirm calls when `shadcn` `AlertDialog` or `useToast` can be used.

</intent-contract>

## Code Map

- `frontend/src/components/ui/bubble.tsx` — [NEW] shadcn-compatible chat bubble component
- `frontend/src/components/ui/marker.tsx` — [NEW] shadcn-compatible chat marker component
- `frontend/src/components/ui/message.tsx` — [NEW] shadcn-compatible chat message component
- `frontend/src/components/ui/message-scroller.tsx` — [NEW] shadcn-compatible auto-scrolling chat container
- `frontend/src/components/command-center/chat-ui/live-trace.tsx` — [NEW] Feature-specific execution trace viewer
- `frontend/src/components/command-center/chat-ui/turn-minimap.tsx` — [NEW] Feature-specific turn minimap navigation
- `frontend/src/components/command-center/chat-ui/message-actions.tsx` — [NEW] Feature-specific message action controls
- `frontend/src/components/command-center/chat-ui/thinking.tsx` — [NEW] Feature-specific thought process viewer
- `frontend/src/components/command-center/CommandCenterChatPane.tsx` — Migrated from custom chat-primitives to shadcn primitives
- `frontend/src/components/command-center/CommandCenterWorkspacePane.tsx` — Replaced raw buttons, inputs, textareas with shadcn components
- `frontend/src/pages/IdeaDetail.tsx` — Replaced window.confirm with AlertDialog, window.alert with useToast, raw textarea with Textarea
- `frontend/src/components/settings/SettingsComponents.tsx` — Migrated tab selector to shadcn Tabs and buttons to shadcn Button
- `frontend/src/components/ui/chat-primitives.tsx` — [DELETE] Removed custom primitives file
- `frontend/src/components/ui/input-group.tsx` — [DELETE] Removed unused custom file
- `frontend/src/components/ui/page-skeleton.tsx` — [DELETE] Removed custom skeleton file

## Tasks & Acceptance

**Execution:**
- [x] Create `bubble.tsx`, `marker.tsx`, `message.tsx`, `message-scroller.tsx` in `src/components/ui/`
- [x] Extract `live-trace.tsx`, `turn-minimap.tsx`, `message-actions.tsx`, `thinking.tsx` into `src/components/command-center/chat-ui/`
- [x] Delete `chat-primitives.tsx`, `input-group.tsx`, `page-skeleton.tsx`
- [x] Update imports in `CommandCenterChatPane.tsx`, `types/chat.ts`, `lib/chat-utils.ts`, `App.tsx`
- [x] Replace raw HTML inputs/textareas with `shadcn` `Input` and `Textarea`
- [x] Replace `window.confirm` with `AlertDialog` in `IdeaDetail.tsx`
- [x] Verify full TypeScript build (`tsc -b && vite build`)

**Acceptance Criteria:**
- Given shadcn component migration, when building frontend (`npm run build`), then build succeeds with 0 errors
- Given custom UI files deleted, when searching for imports, no references to deleted primitives exist
- Given chat UI loaded, when rendering chat messages, all avatars, bubbles, and markers render correctly using shadcn components

