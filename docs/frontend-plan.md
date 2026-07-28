# Frontend Plan

## Current State

The frontend already uses the correct UI foundation for the long-term plan:

- React
- shadcn/ui
- Radix UI
- Tailwind CSS

That means the frontend does not need a design-system migration before we add DeepAgents-aware behavior.

## Current Integration Model

- API requests live in `frontend/src/api/client.ts`
- live updates use custom SSE through `/api/sse`
- dashboard page already shows status-heavy information
- timeline, files, and score components already exist

## Migration Strategy

### Keep first

- current routes
- current idea detail flows
- current dashboard cards
- existing shadcn/ui components

### Add next

- `components/deepagents/` for runtime-specific UI
- typed event models for DeepAgents stream state
- interrupt approval components
- subagent cards and scoped message views
- tool-call timeline and result cards

## Planned Frontend Structure

```text
frontend/src/
  api/
    client.ts
    deepagents.ts
  components/
    deepagents/
      AgentTodoPanel.tsx
      SubagentActivityCard.tsx
      ToolCallTimeline.tsx
      InterruptInbox.tsx
      ArtifactDiffPanel.tsx
    ideas/
    workflow/
    ui/
  hooks/
    useDeepAgentStream.ts
    useInterrupts.ts
  types/
    deepagents.ts
```

## Frontend Phases

### Phase A

- keep current SSE contract
- add typed wrapper for current events
- avoid UI regressions

### Phase B

- add DeepAgents event adapter on backend
- add frontend hook for richer stream state
- keep current pages working while new widgets are introduced

### Phase C

- add interrupt approval flow
- add subagent and todo views
- add artifact diff and review packet views

## Frontend Acceptance Rules

- dashboard must keep loading on desktop and mobile
- current idea list/detail flows must not break during backend migration
- new runtime views must degrade cleanly when DeepAgents runtime is not yet active
- do not duplicate component systems; keep using shadcn/ui and Radix UI
