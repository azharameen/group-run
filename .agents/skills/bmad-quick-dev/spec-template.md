---
title: '{title}'
type: 'feature' # feature | bugfix | refactor | chore
created: '{date}'
status: 'draft' # draft | ready-for-dev | in-progress | in-review | done
review_loop_iteration: 0 # incremented by step-04 before each review loopback
context: [] # optional: `{project-root}/`-prefixed paths to project-wide standards/docs the implementation agent should load. Keep short — only what isn't already distilled into the spec body.
---

<!-- Target: 900–1300 tokens. Above 1600 = high risk of context rot.
     Never over-specify "how" — use boundaries + examples instead.
     Cohesive cross-layer stories (DB+BE+UI) stay in ONE file.
     IMPORTANT: Remove all HTML comments when filling this template. -->

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

<!-- What is broken or missing, and why it matters. Then the high-level approach — the "what", not the "how". -->

**Problem:** ONE_TO_TWO_SENTENCES

**Approach:** ONE_TO_TWO_SENTENCES

## Boundaries & Constraints

<!-- Three tiers: Always = invariant rules. Ask First = human-gated decisions. Never = out of scope + forbidden approaches. -->

**Always:** INVARIANT_RULES

**Ask First:** DECISIONS_REQUIRING_HUMAN_APPROVAL
<!-- Agent: if any of these trigger during execution, HALT and ask the user before proceeding. -->

**Never:** NON_GOALS_AND_FORBIDDEN_APPROACHES

## I/O & Edge-Case Matrix

<!-- If no meaningful I/O scenarios exist, DELETE THIS ENTIRE SECTION. Do not write "N/A" or "None". -->

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| HAPPY_PATH | INPUT | OUTCOME | N/A |
| ERROR_CASE | INPUT | OUTCOME | ERROR_HANDLING |

</frozen-after-approval>

## Code Map

<!-- Agent-populated during planning. Annotated paths prevent blind codebase searching. -->

- `FILE` -- ROLE_OR_RELEVANCE
- `FILE` -- ROLE_OR_RELEVANCE

## Tasks & Acceptance

<!-- Tasks: backtick-quoted file path -- action -- rationale. Prefer one task per file; group tightly-coupled changes when splitting would be artificial. -->
<!-- If an I/O Matrix is present, include a task to unit-test its edge cases. -->
<!-- AC covers system-level behaviors not captured by the I/O Matrix. Do not duplicate I/O scenarios here. -->

**Execution:**
- [ ] `FILE` -- ACTION -- RATIONALE

**Acceptance Criteria:**
- Given PRECONDITION, when ACTION, then EXPECTED_RESULT

## Delivery Patterns Checklist

<!-- Pre-populated with the project's standard delivery patterns. Prune ruthlessly: keep and
     fill in only the items that apply to this story; delete the rest. Delete a whole group if
     none of its items apply. If no group applies at all, delete this entire section and state
     under Verification how the work is checked instead. -->

**CI** (`.github/workflows/ci.yml`) — which jobs this story affects or extends:
- [ ] Backend: `ruff check` clean, `scripts/forbidden_imports.py` passes, coverage stays at/above `--cov-fail-under=60`
- [ ] Frontend: `tsc -b --noEmit`, `eslint src`, `vitest run`, `npm run build` all pass
- [ ] Dependency changes: `pip-audit` / `npm audit --production` clean, lockfiles updated
- [ ] User-visible flow changed: Playwright E2E spec added/updated (runs on develop + PRs to develop)
- [ ] New CI job needed: {name + what it does} — or "none"

**Docker / Deploy** — container and deployment impact:
- [ ] Image/compose changes needed: {what} — or "none". If changed: keep slim base + `HEALTHCHECK` on `/health`; never add test-only deps to the production image
- [ ] Filesystem paths only via `ROOT_DIR`/`WORKSPACE_DIR`/`CONFIG_DIR` from `config.py`; verify under `APP_ROOT_DIR` set (Docker path depth differs from local)
- [ ] New env vars: added to `Settings`, propagated to `os.environ`, documented in `architecture.md` + `coding-guidelines.md` (4-step credential chain)

**Testing** — how this story's tests honor project rules:
- [ ] LLM/MCP boundaries mocked — no test depends on a live model or live MCP server
- [ ] Separate test DB (never the dev `checkpoints.db`); async tests use `pytest.mark.asyncio`
- [ ] New shared fixtures go in `backend/tests/conftest.py`; class-based `TestFeature` structure
- [ ] No new tests in deprecated modules (`models/`, `state/`, `scoring/`, `orchestrator/`, `storage/`)
- [ ] Playwright specs key created data by unique IDs, not names or list positions

## Spec Change Log

<!-- Append-only. Populated by step-04 during review loops. Do not modify or delete existing entries.
     Each entry records: what finding triggered the change, what was amended, what known-bad state
     the amendment avoids, and any KEEP instructions (what worked well and must survive re-derivation).
     Empty until the first bad_spec loopback. -->

## Design Notes

<!-- If the approach is straightforward, DELETE THIS ENTIRE SECTION. Do not write "N/A" or "None". -->
<!-- Design rationale and golden examples only when non-obvious. Keep examples to 5–10 lines. -->

DESIGN_RATIONALE_AND_EXAMPLES

## Verification

<!-- If no build, test, or lint commands apply, DELETE THIS ENTIRE SECTION. Do not write "N/A" or "None". -->
<!-- How the agent confirms its own work. Prefer CLI commands. When no CLI check applies, state what to inspect manually. -->

**Commands:**
- `COMMAND` -- expected: SUCCESS_CRITERIA

**Manual checks (if no CLI):**
- WHAT_TO_INSPECT_AND_EXPECTED_STATE
