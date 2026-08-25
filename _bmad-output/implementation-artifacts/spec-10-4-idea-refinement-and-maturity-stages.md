---
title: 'Story 10.4: Introduce idea refinement and maturity stages'
type: 'feature'
created: '2026-08-25'
status: 'done'
baseline_revision: '3d3fdb8dec7d2bf185582be3cc5f7dbf01b5afaf'
final_revision: '556f02cbdaf7e8a726c0e4f35f7d581a890beb09'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-10-context.md'
warnings:
  - oversized
---

<intent-contract>

## Intent

**Problem:** Ideas have no maturity model: a raw signal and a plan-ready idea look identical, and there is no explicit gate (criteria + evidence) an idea must pass before it moves toward planning (Epic 10 requirement: stages `raw`/`refined`/`validated`/`ready-for-planning` with criteria and evidence attached to the idea artifact).

**Approach:** Add a per-idea maturity record persisted as `maturity.yaml` in the idea's workspace folder (filesystem-owned, written through the existing `save_idea_yaml` transaction wrapper). A new `GET/POST /api/ideas/{idea_id}/maturity` API records forward-only, one-step stage transitions, each requiring non-empty attested criteria and evidence references (reusable artifact-provenance refs from story 10.2). The idea-detail UI gains a Maturity tab with a stage stepper, the next stage's required criteria, a transition form, and the full transition history.

## Boundaries & Constraints

**Always:**
- Stage order is fixed: `raw` → `refined` → `validated` → `ready-for-planning`. Transitions are forward-only, one step at a time; no skipping, no backtracking; `ready-for-planning` is terminal.
- Every transition record carries: target stage, non-empty `criteria` (list of non-blank strings), non-empty `evidence_refs` (list of non-blank strings), `recorded_by`, timezone-aware UTC ISO 8601 `recorded_at`.
- Ideas with no `maturity.yaml` read as stage `raw` with empty history — no data migration, no write on read.
- UUID-free legacy idea IDs are unchanged; API contract is `snake_case`; the current stage is derived from the last history entry (single source of truth is the file).
- File-size limits: new route file < 150 lines, new service < 200 lines.
- Tests use the existing `client` + `temp_workspace` fixtures from `backend/tests/conftest.py`; never touch the dev workspace or DB.

**Block If:**
- The owner wants stages to be jumpable/backtrackable, wants the agent (not a human) to record transitions, or wants maturity stored in idea.yaml / SQLite instead of its own `maturity.yaml`.

**Never:**
- No LLM/agent-driven stage changes — transitions are recorded by a human via API/UI (no fabricated progress).
- No changes to deprecated modules beyond reusing the existing `idea_workspace` helpers; no changes to `models/idea.py`.
- No new frontend `fetch` calls — use `@/api/ideas` client. No new dependencies.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| HAPPY_PATH | POST `{stage: "refined", criteria, evidence_refs}` on a `raw` idea | 201, response `stage: "refined"`, history length 1 | No error expected |
| SKIP | POST `{stage: "validated"}` while at `raw` | Transition rejected | 409, detail names current + requested stage |
| BACKWARD | POST `{stage: "refined"}` while at `validated` | Transition rejected | 409 |
| TERMINAL | POST any stage while at `ready-for-planning` | Transition rejected | 409 |
| VALIDATION | POST with empty `criteria`, blank `evidence_refs` entry, or unknown stage string | Request rejected | 422 (pydantic) |
| LEGACY_READ | GET on an idea with no `maturity.yaml` | 200, `stage: "raw"`, `history: []`, `next_stage: "refined"` | No error expected |
| FULL | GET on a `ready-for-planning` idea | 200, `next_stage: null` | No error expected |
| ERROR_CASE | GET/POST with unknown `idea_id` | Not found | 404 naming the idea |

</intent-contract>

## Code Map

- `backend/app/storage/idea_workspace.py` (198 lines) -- `load_idea_yaml`/`save_idea_yaml` (generic filename + `workspace_transaction` rollback); reuse, do not modify
- `backend/app/api/routes/ideas.py` (200 lines) -- existing ideas routes; `_idea_exists`/`_validate_idea_id` pattern to mirror; do not grow this file
- `backend/app/services/idea_maturity.py` (new) -- stage order, canonical per-stage criteria, `get_maturity(idea_id)`, `transition_stage(idea_id, request)`
- `backend/app/api/routes/maturity.py` (new) -- `GET/POST /api/ideas/{idea_id}/maturity`
- `backend/app/api/app.py` -- router registration; add the maturity router
- `backend/tests/test_idea_maturity.py` (new) -- class-based tests on `client` + `temp_workspace`, mirroring `test_ideas_crud.py` (create an idea via `POST /api/ideas` first)
- `frontend/src/api/ideas.ts` (123 lines) -- add `MaturityRecord`/`IdeaMaturity` interfaces + `fetchIdeaMaturity` / `recordIdeaMaturity`
- `frontend/src/components/idea-detail/MaturityPanel.tsx` (new) -- stage stepper + next-stage criteria + transition dialog + history
- `frontend/src/pages/IdeaDetail.tsx` -- Tabs: add a "Maturity" `TabsTrigger`/`TabsContent`
- `frontend/src/components/idea-detail/MaturityPanel.test.tsx` (new) -- mocks `@/api/ideas`; mirrors `ArtifactsPanel.test.tsx`

## Tasks & Acceptance

**Execution:**
- [x] `backend/app/services/idea_maturity.py` -- define `MATURITY_STAGES` tuple (`raw`, `refined`, `validated`, `ready-for-planning`), canonical `STAGE_CRITERIA: dict[str, list[str]]` (the required criteria text per non-initial stage), `UnknownIdeaError`, `InvalidTransitionError`; `get_maturity(idea_id) -> dict` (missing file ⇒ `{"stage": "raw", "history": []}`, plus `next_stage` and `current`) and `transition_stage(idea_id, request) -> dict` validating stage order (next stage only, terminal guard) and writing `maturity.yaml` as `{"stage": ..., "history": [...existing + new record]}` via `save_idea_yaml` -- keeps route thin and the idea file the source of truth
- [x] `backend/app/api/routes/maturity.py` -- `GET /api/ideas/{idea_id}/maturity` (200 `{idea_id, stage, current, history, next_stage, stage_criteria}`; 404 unknown idea) and `POST /api/ideas/{idea_id}/maturity` (201 `{idea_id, stage, record}`; 404 unknown idea; 409 `InvalidTransitionError` naming current + requested stage; 422 pydantic) -- new file keeps route files under the 150-line limit
- [x] `backend/app/api/app.py` -- import + `include_router` for the maturity router -- single registration point
- [x] `backend/tests/test_idea_maturity.py` -- class-based: legacy read (raw, empty history), happy transition (raw→refined), skip rejected (raw→validated 409), backward rejected, terminal rejected, 404 unknown idea, 422 empty criteria / blank evidence / unknown stage, full history ordering after three transitions -- covers the I/O matrix; `client` + `temp_workspace` fixtures, create idea via `POST /api/ideas`
- [x] `frontend/src/api/ideas.ts` -- `MaturityRecord {stage, criteria: string[], evidence_refs: string[], recorded_by, recorded_at}`, `IdeaMaturity {idea_id, stage, current: MaturityRecord | null, history: MaturityRecord[], next_stage: string | null, stage_criteria: Record<string, string[]>}` (snake_case preserved) + `fetchIdeaMaturity(ideaId)` / `recordIdeaMaturity(ideaId, body)` -- centralized client rule
- [x] `frontend/src/components/idea-detail/MaturityPanel.tsx` -- shadcn-based: current-stage badge, stepper of the four stages, the canonical criteria list for `next_stage`, a "Record transition" dialog (criteria textarea, evidence-refs textarea — one per line, both required and validated non-blank client-side, recorded_by default "user") calling `recordIdeaMaturity`, and the transition history (stage, recorded_by, timestamp, criteria, evidence refs); API errors thrown/surfaced, never swallowed -- makes maturity inspectable with its criteria and evidence
- [x] `frontend/src/pages/IdeaDetail.tsx` -- add "Maturity" tab rendering `<MaturityPanel ideaId={...} />` alongside the existing tabs -- one-line-per-tab pattern already established
- [x] `frontend/src/components/idea-detail/MaturityPanel.test.tsx` -- mock `@/api/ideas`: panel shows stage + next-stage criteria, submitting the dialog calls `recordIdeaMaturity` with parsed arrays and refreshes, empty criteria/evidence blocked client-side, 409 surfaces as an error, API error propagates -- frontend test rule (mock the client, no live network)

**Acceptance Criteria:**
- Given an idea with no maturity record, when its maturity is read, then it is reported as stage `raw` with empty history and `next_stage: "refined"`.
- Given an idea at stage `raw`, when a human records a `refined` transition with criteria and evidence references, then the idea reads back as `refined` and the history contains the record with attested criteria, evidence refs, recorder, and UTC timestamp.
- Given an idea at any stage, when a transition targets a non-adjacent or earlier stage (or occurs at `ready-for-planning`), then it is rejected with 409 without changing the stored record.
- Given an idea at `ready-for-planning`, when its detail page renders, then the Maturity tab shows the full stage history with the supporting criteria and evidence for every transition.

## Delivery Patterns Checklist

**CI** (`.github/workflows/ci.yml`):
- [ ] Backend: `ruff check` clean, `scripts/forbidden_imports.py` passes, coverage stays at/above `--cov-fail-under=60`
- [ ] Frontend: `tsc -b --noEmit`, `eslint src`, `vitest run`, `npm run build` all pass
- [ ] No dependency changes, no new CI job, no Docker/compose changes; no new env vars

**Testing:**
- [ ] No LLM/MCP boundaries involved — no test depends on a live model or live MCP server
- [ ] Separate test workspace via existing `temp_workspace` fixture (never the dev workspace)
- [ ] Class-based `TestFeature` structure; no new shared fixtures needed (reuse `client`/`temp_workspace`)
- [ ] Frontend tests mock the API client; no live network

## Spec Change Log

## Review Triage Log

### 2026-08-25 — Review pass 1

Reviewers: Edge Case Hunter (13 findings) + adversarial general pass (executed in-session after two subagent failures; ~14 findings). Deduplicated to 17 unique findings: **6 patch, 3 defer, 4 reject, 0 intent_gap, 0 bad_spec, 4 merged into adjacent findings.**

**Patched (applied and re-verified):**
1. **Corrupt `maturity.yaml` caused 500s** (merged 3 Edge Case Hunter findings + adversarial findings: non-dict history entries ⇒ `AttributeError`; unknown persisted stage ⇒ `ValueError` in `MATURITY_STAGES.index()`; frontend `indexOf` -1 rendering). Severity: medium (500 on both endpoints under corruption). Fix: `_load` now drops non-dict history entries; `_next_stage` returns `None` for unknown stages (transition-locked, not an exception); `transition_stage` rejects unknown current stage with 409; panel shows a "stage not recognized" message instead of falsely claiming terminal. Added tests `test_corrupt_history_does_not_500`, `test_transition_from_unknown_stage_409`.
2. **No size caps on criteria/evidence** (Edge Case Hunter). Severity: low (unbounded YAML growth). Fix: `max_length=50` list cap + 500-char per-item cap in `MaturityTransitionRequest` (422). Added tests `test_oversized_criteria_entry_422`, `test_too_many_criteria_entries_422`.
3. **Stale panel state on `ideaId` change** (Edge Case Hunter): navigating between ideas could display the previous idea's maturity and submit its `next_stage` against the new idea. Severity: medium (wrong-idea transition record). Fix: `<MaturityPanel key={ideaId} />` remounts the panel fresh per idea.
4. **Dead `recordedBy` state** (Edge Case Hunter): state never rendered, always sent "user". Fix: removed state; request hardcodes `"user"`.
5. **Label/textarea not associated** (Edge Case Hunter): a11y. Fix: `htmlFor`/`id` on both dialog textareas.
6. **Misleading router comment in `app.py`** (adversarial pass): claimed route-shadowing that cannot occur (`/ideas/{id}/maturity` is a deeper path than `/ideas/{id}`). Fix: comment corrected.

**Deferred (see `_bmad-output/implementation-artifacts/deferred-work.md`):**
1. Read-modify-write race in `transition_stage` (whole-file last-write-wins; no coordination with other idea-workspace writers) — pre-existing systemic pattern across all idea workspace writers; needs workspace-level write coordination, out of scope for this story.
2. Panel not refreshed after a 409 conflict (stale stage shown until tab switch) — minor UX; conflict is surfaced and the write is safely rejected.
3. Redundant `stage` key persisted alongside `history` (written but never read; stage is derived) — informational duplication for human-readable files; kept.

**Rejected:**
1. `recorded_by` accepted without identity binding — no auth layer exists in the product; consistent with self-attested `decided_by`/`reviewer` in stories 10.1/10.3.
2. Criteria not enforced against `STAGE_CRITERIA` — spec defines human-attested free-text criteria; `STAGE_CRITERIA` is display guidance only.
3. `maturity?.next_stage || ""` fallback — unreachable dead path (dialog only renders when the panel has loaded maturity); harmless.
4. 422-vs-409 dual path for unknown target stage — route-level 422 is the correct layering; the service guard remains as defense in depth for direct callers.

Post-patch verification: backend full suite 516 passed (+4 new), ruff clean on changed files, forbidden imports PASS; frontend tsc clean, MaturityPanel 6/6, full frontend suite re-run.

## Design Notes

**Persistence choice:** `maturity.yaml` is its own file in the idea folder (not a field in `idea.yaml`) so the story stays module-disjoint from idea CRUD writers and `save_idea_yaml(idea_id, "maturity.yaml", ...)` gives the existing transaction/rollback wrapper for free. Current stage is **derived from the last history entry**, never stored independently — the history is the audit trail, matching story 10.3's derived-flag pattern.

**Canonical criteria** (served in `stage_criteria` so the UI shows what each gate requires):
- `refined`: problem statement names the problem and who is affected; solution concept is concrete; original signal is captured.
- `validated`: claims are backed by research artifacts or KB references; artifact revisions with provenance exist (`evidence_refs` such as `artifact:research:v2` reuse story 10.2's ref convention).
- `ready-for-planning`: feasibility and business impact assessed; remaining risks and open questions documented.

Strict one-step forward movement keeps the model trivially auditable (N records ⇔ stage N) and matches "progress toward planning or stop" — stopping is simply *not recording* the next transition.

Example `maturity.yaml` (refined):
```yaml
stage: refined
history:
  - stage: refined
    criteria:
      - "problem statement names affected users"
    evidence_refs:
      - "artifact:research:v1"
    recorded_by: user
    recorded_at: "2026-08-25T12:00:00+00:00"
```

## Verification

**Commands:**
- `python -m pytest backend/tests/test_idea_maturity.py backend/tests/test_ideas_crud.py -q` -- expected: all pass
- `python -m ruff check backend` -- expected: clean
- `python scripts/forbidden_imports.py` -- expected: PASS
- `cd frontend && npx tsc -b --noEmit && npx vitest run src/components/idea-detail/MaturityPanel.test.tsx --no-file-parallelism` -- expected: pass

## Auto Run Result

**Status:** done

**Summary:** Ideas now progress through forward-only, human-attested maturity stages (`raw` → `refined` → `validated` → `ready-for-planning`). State is an auditable transition history in a per-idea `maturity.yaml` (N records ⇔ stage N; legacy ideas read as `raw` with no migration), exposed via `GET/POST /api/ideas/{id}/maturity` (404 unknown idea, 400 bad id, 409 invalid/unknown-stage transition, 422 invalid body) and a new **Maturity** tab on the Idea Detail page with a stage stepper, next-stage criteria, a transition dialog (one-per-line criteria + evidence, client-side validation), and the full transition history.

**Files changed:**
- `backend/app/services/idea_maturity.py` (new) — stage model, `get_maturity`, `transition_stage`, corrupt-file tolerance.
- `backend/app/api/routes/maturity.py` (new) — `GET/POST /api/ideas/{id}/maturity` with validated request body (known stage, non-blank, capped lists/items).
- `backend/tests/test_idea_maturity.py` (new) — 21 tests covering the full I/O matrix incl. corruption and size caps.
- `backend/app/api/app.py` — registered maturity router.
- `frontend/src/api/ideas.ts` — `MaturityRecord`/`IdeaMaturity` types + `fetchIdeaMaturity`/`recordIdeaMaturity`.
- `frontend/src/components/idea-detail/MaturityPanel.tsx` (new) — stepper, criteria, transition dialog, history.
- `frontend/src/components/idea-detail/MaturityPanel.test.tsx` (new) — 6 tests.
- `frontend/src/pages/IdeaDetail.tsx` — Maturity tab (panel keyed per idea).
- `_bmad-output/implementation-artifacts/deferred-work.md` — 3 deferred entries.

**Review findings:** 17 unique after dedup (Edge Case Hunter 13 + in-session adversarial general pass ~14; the Blind Hunter subagent failed twice on tooling and was performed in-session instead). 6 patched (corrupt-file 500 tolerance, size caps, per-idea panel remount, dead state, label a11y, misleading comment), 3 deferred to `deferred-work.md`, 4 rejected, 0 intent_gap, 0 bad_spec.

**Follow-up review recommended:** false — all patches were small, localized, and each is covered by a new or existing test; full suites re-ran green post-patch.

**Verification:**
- `python -m pytest backend -q` → 516 passed.
- `python -m ruff check` (changed files) → clean; `python scripts/forbidden_imports.py` → PASS.
- `npx tsc -b --noEmit` → clean; `npx vitest run` → 301 passed (27 files); MaturityPanel 6/6.

**Residual risks:** Deferred items — the unlocked read-modify-write of `maturity.yaml` (pre-existing pattern shared by all idea workspace writers; concurrent transitions could lose a record), no in-panel refresh after a 409, and the informational redundant `stage` key.
