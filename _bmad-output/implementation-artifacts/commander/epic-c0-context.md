# Epic C0 Context: Foundation & Guardrails

<!-- Generated from planning artifacts. Regenerate with compile-epic-context if planning docs change. -->

## Goal

Establish the operational safety net for Commander: enforce branch protections and PR rules, remove legacy Jules CI triggers so Commander is the single dispatch path, and make BMad story templates and the dev agent configuration produce "Jules-ready" stories by default. This prevents accidental merges, gives agents a single source of truth for branching and PR behavior, and enables safe automated dispatch and review workflows.

## Stories

- Story C0.1: GitHub Branch Protection Setup
- Story C0.2: Legacy Jules Workflow Removal
- Story C0.3: Project Context Branch Rules Update
- Story C0.4: BMad Customization Setup

## Requirements & Constraints

- Branch protection: `main` and `develop` are PR-only. `main` must require CI status checks and at least one reviewer; protections include admin enforcement and dismiss-stale-approvals behaviour. `develop` must be PR-targeted (CI checks required); project may allow faster review semantics on `develop` per team decision.
- Branch and PR conventions (must be enforced and documented in project context): one-story→one-PR; PR target = `develop` (except hotfixes); branch naming `feat/<story-key>-<short-desc>`; commit format `type(scope): description`.
- Remove legacy Jules workflows (jules-scheduled.yml, jules-fix-ci.yml, jules-dispatch.yml) from .github/workflows only after Commander dispatch API (createJulesSession) is available and validated. `ci.yml` and `code-review.yml` must remain functional and authoritative for required checks.
- BMad template and agent customizations live under `_bmad/custom/` and must add `intent-contract` and `code map` fields to the story template; `bmad-agent-dev` must persist BRANCH_POLICY/PR_POLICY facts so automated agents follow rules.
- Never bypass protective rules in code or CI (no direct pushes to protected branches); validate by automated tests and repository settings.
- Validation acceptance: branch protection tests (direct push rejected + PR flow succeeds); removal validated by verifying no workflow references and Commander can create Jules sessions on demand.

## Technical Decisions

- Enforce conventions in two places: (1) repository-level GitHub branch protection settings and (2) `project-context.md` consumed by agents. Both must match exactly — agents read `project-context.md` to generate branch names and PR targets.
- Commander is the single source for Jules dispatch; legacy workflow files must be removed only after Commander dispatch is proven. Implement an integration test that exercises Commander.createJulesSession() before deleting workflows.
- BMad customizations are additive: preserve existing story format; append `intent-contract`, `code map`, and `Branch Strategy` sections to templates in `_bmad/custom/`.
- Agent runtime facts: persist simple, human-readable facts in `bmad-agent-dev` config (BRANCH_POLICY, PR_POLICY) rather than hardcoding behavior in multiple places.
- Branch cleanup policy: feature branches deleted after merge to `develop`; `develop` and `main` are never auto-deleted. Ensure tooling respects allowlist and prevents accidental deletion.

## Cross-Story Dependencies

- C0.1 (branch protection) must be applied before final PR-based validation and before enabling any auto-merge or cleanup tooling that assumes protected branches.
- C0.3 (project-context rules) must be published and reachable by agents before C0.4 (BMad customization) dispatches; agents use the published rules to generate branch names and PR targets.
- C0.2 (legacy workflow removal) depends on Commander dispatch capability (EP-C1 deliverable: createJulesSession / commander module) — remove workflows only after Commander passing integration tests that show it can create and manage Jules sessions.
- C0.4 (BMad customization) updates `_bmad/custom/` and `bmad-agent-dev` config; downstream stories in EP-C2 (branch naming, brief builder) and EP-C3 (Copilot dispatch) rely on these template fields being present.
