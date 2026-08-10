---
title: '6-2-wire-memory-backend-into-deepagents-runtime'
type: 'feature'
created: '2026-08-09'
status: 'done'
review_loop_iteration: 0
followup_review_recommended: false
context: ['_bmad-output/implementation-artifacts/epic-6-context.md']
warnings: []
baseline_revision: 'HEAD~1'
final_revision: '594a370'
---

## Intent

**Problem:** The DeepAgents runtime currently does not have its memory backend wired, preventing agents from persisting long-term memories across conversation threads even though the `/memories/` route is configured in `CompositeBackend`.

**Approach:** Update the `DeepAgents` runtime factory and subagent definitions to include the `/memories/` virtual path in the `memories` parameter of `create_deep_agent`, ensuring the runtime utilizes the `MemoryMiddleware`.

## Boundaries & Constraints

**Always:** Use the `/memories/` virtual path as the memory source. Maintain consistency with the existing `skills` wiring pattern established in Story 6-3.

**Block If:** The `create_deep_agent` function does not accept a `memories` parameter or if it requires a different type than a list of strings.

**Never:** Modify the `CompositeBackend` configuration in `backends.py` or the `Permissions` configuration in `permissions.py`, as they are already correctly configured for `/memories/`.

## Code Map

- `backend/app/agent/runtime.py` -- Runtime factory where `create_deep_agent` is called.
- `backend/app/agent/subagents.py` -- Subagent definitions where `memories` should be added to each subagent.
- `backend/tests/test_memory_wiring.py` -- New test file to verify the wiring.

## Tasks & Acceptance

**Execution:**
- [x] `backend/app/agent/runtime.py` -- Add `memories=["/memories/"]` to `create_deep_agent` call -- Enable long-term memory for the main agent.
- [x] `backend/app/agent/subagents.py` -- Add `"memories": agent_entry.get("memories", ["/memories/"])` to subagent definitions -- Enable long-term memory for all subagents.
- [x] `backend/tests/test_memory_wiring.py` -- Create unit tests to verify that `memories` is correctly passed to `create_deep_agent` -- Verification of wiring.

**Acceptance Criteria:**
- Given the DeepAgents runtime is initialized, when checking the compiled graph configuration, then the `memories` parameter must be set to `["/memories/"]`.
- Given a subagent is defined in `teams.yaml`, when `build_agent_subagents` is called, then each subagent must include `memories` in its definition.

## Spec Change Log

- none

## Review Triage Log

### 2026-08-09 — Review pass
- intent_gap: 0
- bad_spec: 0
- patch: 2: (high 0, medium 1, low 1)
- defer: 1: (high 0, medium 0, low 1)
- reject: 1: (high 0, medium 0, low 1)
- addressed_findings:
  - `[medium]` `[patch]` Added null-check safety for `memories` in subagent definitions in `subagents.py`.
  - `[low]` `[patch]` Added regression test for `memories` null-handling in `test_memory_wiring.py`.

## Design Notes

The `deepagents` package uses a middleware-based approach where virtual paths provided in `memories` and `skills` are used by `MemoryMiddleware` and `SkillsMiddleware` respectively to handle persistence and tool loading. By adding `["/memories/"]` to the `create_deep_agent` call, we enable the runtime to correctly route memory-related operations to the `CompositeBackend` route established for `/memories/`.

## Verification

**Commands:**
- `pytest backend/tests/test_memory_wiring.py` -- expected: all tests pass.

## Auto Run Result

### Summary of implemented change
Successfully wired the memory backend into the DeepAgents runtime. The agent factory and subagent definitions now explicitly include the `/memories/` virtual path, enabling the `MemoryMiddleware` to handle persistent state across conversation threads. Added null-handling safety for the `memories` configuration in `teams.yaml`.

### Files changed
- `backend/app/agent/runtime.py` -- Added `memories=["/memories/"]` to `create_deep_agent`.
- `backend/app/agent/subagents.py` -- Added `memories` to subagent definitions with null-safe default.
- `backend/tests/test_memory_wiring.py` -- New tests verifying runtime/subagent wiring and null-handling.

### Review findings breakdown
- **Patches applied:** 2 (null-check safety, regression test).
- **Items deferred:** 1 (updating external schema documentation for `teams.yaml`).
- **Items rejected:** 1 (concerns regarding mock fragility in wiring tests, deemed necessary for package integration testing).

### Follow-up review recommended
`false`

### Verification performed
- Ran `pytest backend/tests/test_memory_wiring.py` -- **3 passed**.
- Manual code inspection confirmed consistency with `skills` wiring pattern.

### Residual risks
- None identified; wiring follows established patterns and is covered by unit tests.
