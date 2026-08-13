# Story C1.2: Deferred Work Parser & UI

Status: ready-for-dev

## Story

As a **Companion project maintainer**,
I want **deferred work items visible on Command Center board**,
so that **I can see and track all technical debt**.

## Acceptance Criteria

1. `parseDeferredWork()` returns array with `id`, `kind`, `title`, `severity`, `parentId`, `sourcePath`
2. Deferred items are injected into board state
3. Items appear with severity badges (🔴 critical, 🟡 medium, 🟢 low)
4. Items show epic attribution
5. Items are filterable by severity
6. Deferred section is visible on Command Center
7. Shows count of items by severity
8. Each item shows title, severity, epic link
9. Items can be dispatched to Jules/Copilot

## Tasks / Subtasks

- [ ] Implement `parseDeferredWork()` function (AC: 1)
  - [ ] Parse `deferred-work.md` content
  - [ ] Extract item details
  - [ ] Assign severity levels
  - [ ] Link to epic if possible
- [ ] Integrate with board state (AC: 2-5)
  - [ ] Inject deferred items into board
  - [ ] Add severity badge rendering
  - [ ] Add epic attribution display
  - [ ] Implement severity filtering
- [ ] Create deferred work UI section (AC: 6-9)
  - [ ] Create deferred items panel
  - [ ] Display severity counts
  - [ ] Show item details with epic links
  - [ ] Add dispatch actions

## Dev Notes

### Parser Output Format

```javascript
{
  id: 'sse-streaming-edge-case-docs',
  kind: 'deferred',
  title: 'SSE and Streaming Edge Case Documentation',
  severity: 'critical', // critical, medium, low
  parentId: 'epic-7',
  sourcePath: 'deferred-work.md'
}
```

### Severity Classification Rules

- **Critical**: Blocks production readiness, security risks
- **Medium**: Technical debt, performance issues
- **Low**: Nice to have, documentation gaps

### UI Components

- Deferred work panel
- Severity badges
- Filter controls
- Dispatch buttons

### References

- [Source: _bmad-output/planning-artifacts/commander-epics.md#Epic-EP-C1]
- [Source: _bmad-output/planning-artifacts/deferred-work.md]

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List
