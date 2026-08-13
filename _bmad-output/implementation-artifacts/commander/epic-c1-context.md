# Epic C1 Context: Commander Core & Deferred Work

<!-- Generated from planning artifacts. Regenerate with compile-epic-context if planning docs change. -->

## Goal

Commander can discover and surface all work (backlog stories, tasks, and deferred technical-debt items) and decide what is eligible to dispatch to Jules vs handled by Copilot. This enables maintainability (by splitting the monolith), visibility into deferred work, and reliable automated dispatch decisions so humans can trust and act on the board.

## Stories

- Story C1.1: Commander Module Split
- Story C1.2: Deferred Work Parser & UI
- Story C1.3: Dispatch Classifier & Badges

## Requirements & Constraints

- Module split: extract Commander logic from extension.mjs into commander.mjs. commander.mjs must export named functions used by extension.mjs; extension.mjs should import those exports and preserve existing behavior. Target: reduce extension.mjs file size by ≥30%.
- Exposed functions (minimal surface required): parseDeferredWork(), classifyDispatch(), buildJulesBrief(), mergeAgentState(). Each function must include JSDoc and unit tests.
- Deferred-work parser (parseDeferredWork): must parse deferred-work.md and return an array of items with at least these fields: id (slug), kind: 'deferred', title (cleaned), severity (critical|medium|low), parentId (optional epic link), sourcePath: 'deferred-work.md'.
- Board UI: parsed deferred items must be injected into board state and rendered with severity badges (🔴 critical, 🟡 medium, 🟢 low), epic attribution, and filter-by-severity support. The deferred section must show counts by severity and allow dispatching items to Jules/Copilot.
- Classification (classifyDispatch): must classify stories and tasks as { agent: 'jules'|'copilot', level: 'story'|'task', ... } and, where applicable, return skill metadata (e.g. skill: 'bmad-*') or julesReady per task. Classification must fall back to task-level dispatch when intent-contract/code-map are missing.
- Badges: board must render badges for classification states: 🟢 Jules-ready, 🟡 Tasks-ready, 🔴 Copilot-only; badges must update in real-time as specs change.
- Validation criteria: existing tests and board load must continue to pass; parseDeferredWork must capture current deferred-work.md (~40+ items as a target); classifyDispatch must match the architecture decision table; badges and filters must display correctly; unit tests must cover edge cases and parser patterns.
- Operational constraint: Commander decisions must be auditable (logged) and learnable; logging format should be structured (JSONL) so decisions can be traced and metrics computed.
- Do not change user-visible behavior of existing board features beyond adding deferred items and badges.

## Technical Decisions

- Code organization: create commander.mjs as the single authoritative module that exports parseDeferredWork, classifyDispatch, buildJulesBrief, mergeAgentState. Keep extension.mjs a thin loader that imports commander.mjs to preserve backwards compatibility.
- Parser design: start with conservative, well-tested parsing rules (regex-based) that tag severity and produce stable slugs; include tests for each known deferred-work pattern. Always attach sourcePath: 'deferred-work.md' to parsed items.
- Classification rules: implement classifyDispatch to return explicit agent and level fields and include skill metadata when Copilot-only (e.g. skill: 'bmad-*'). Classification logic should prefer story-level intent-contract + code-map to mark Jules-ready; otherwise compute task-level readiness.
- Badge semantics: map classification to three badges (🟢 Jules-ready, 🟡 Tasks-ready, 🔴 Copilot-only). Severity badges for deferred items: 🔴/🟡/🟢. UI must support counts and filtering; badge state is driven from commander.mjs outputs.
- Observability & audit: log every Commander decision (dispatch, classification, parse failures, human overrides) as structured JSONL entries to enable a trust dashboard and learning loop.
- Testing & validation: include unit tests for each exported function, integration test that parses deferred-work.md and injects items into a sample board state, and UI snapshot tests for badge rendering. Measure file-size reduction and validate no regressions in board parsing and Jules dispatch behaviour.

## Cross-Story Dependencies

- C1.1 (Module Split) → must be completed first: C1.2 and C1.3 depend on commander.mjs exports and stable import surface from extension.mjs.
- C1.2 (Deferred Work Parser & UI) → provides deferred items and severity metadata injected into board state consumed by C1.3 (badging/filtering/dispatch).
- C1.3 (Dispatch Classifier & Badges) → depends on availability of intent-contract and code-map data; when absent, classification must fall back to task-level results produced by existing story/task data and parser outputs.

