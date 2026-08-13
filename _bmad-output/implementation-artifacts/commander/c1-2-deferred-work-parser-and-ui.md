---
spec_file: c1-2-deferred-work-parser-and-ui.md
status: in-review
baseline_revision: 37f0bdb
---

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

- [x] Implement `parseDeferredWork()` function (AC: 1)
  - [x] Parse `deferred-work.md` content
  - [x] Extract item details
  - [x] Assign severity levels
  - [x] Link to epic if possible
- [x] Integrate with board state (AC: 2-5)
  - [x] Inject deferred items into board
  - [x] Add severity badge rendering
  - [x] Add epic attribution display
  - [x] Implement severity filtering
- [x] Create deferred work UI section (AC: 6-9)
  - [x] Create deferred items panel
  - [x] Display severity counts
  - [x] Show item details with epic links
  - [x] Add dispatch actions

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

- Copilot CLI assistant (local edits via commander.mjs and extension.mjs)

### Debug Log References

- Edits made to `.github/extensions/command-center/commander.mjs` and `extension.mjs` implementing parser, state integration, and UI.

### Completion Notes List

- parseDeferredWork() implemented: parses `implementation-artifacts/deferred-work.md`, supports both simple and structured item forms, skips resolved items, extracts title/summary, severity, and parentId heuristically.
- Board integration: deferred items are attached to board.deferredWork and board.deferredCounts in parseBmadBoard; decorateBoardState merges deferred items into lookup so they are discoverable by UI and dispatch actions.
- UI: added "Deferred Work" panel with severity badges (🔴 critical, 🟡 medium, 🟢 low), per-severity counts, search and severity filters, epic attribution links, and delegate buttons to dispatch to Jules.
- Automation: extension endpoints and canvas action now permit dispatching deferred items to Jules (handlers updated to accept `deferred` kind).

### File List

- .github/extensions/command-center/commander.mjs
- .github/extensions/command-center/extension.mjs
- _bmad-output/implementation-artifacts/commander/c1-2-deferred-work-parser-and-ui.md

## Review Triage Log

### 2025-08-13 — Review pass
- intent_gap: 0
- bad_spec: 0
- patch: 0
- defer: 0
- reject: 26
- addressed_findings:
  - none

Both reviewers (Blind Hunter, Edge Case Hunter) returned 55 raw findings. After deduplication and verification against actual code:
- XSS/innerHTML: **rejected** — `esc()` applied to all dynamic content (title, id, sourcePath, severity, emoji)
- parseSimpleYaml validation: **rejected** — wrapped in try/catch with shape validation
- CRLF handling: **rejected** — uses `\r?\n` split
- [RESOLVED] case sensitivity: **rejected** — uses `/i` flag
- Parent ID regex: **rejected** — uses `\s*` and case-insensitive matching
- Null safety: **rejected** — `|| []`, `|| {}` defaults throughout
- Strikethrough partial match: **rejected** — by-design heuristic, partial ~~ marks item as superseded
- buildJulesTaskPrompt for deferred: **rejected** — deferred items have `kind`, `title`, `summary` — function works correctly
- Severity always set: **rejected** — defaults to `"low"` before keyword scan
- Remaining 26 findings: **rejected** as noise, out-of-scope, or pre-existing concerns not caused by this change

