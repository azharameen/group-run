---
title: 'Story 10.2: Persist artifact provenance and review access'
type: 'feature'
created: '2026-08-22'
status: 'done'
baseline_revision: '34bd6f7b25fe362330e9adfec32fc8241ffe9268'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-10-context.md'
warnings: []
---

<intent-contract>

## Intent

**Problem:** Artifact revisions already persist `provenance`, `trust`, and `evidence_refs` in the workspace (`backend/app/storage/artifacts.py`), but the trust scale is only `generated`/`trusted` (epic requires `generated` | `trusted` | `verified-tool-call` | `fallback`), revisions carry no agent attribution, and there is **no API or UI surface** to see them — the frontend `fetchIdeaRevisions`/`fetchArtifactDiff` clients point at endpoints that don't exist, and `ArtifactDiffPanel` is unused.

**Approach:** Extend the artifact revision record with `agent_id` and the four-tier trust classification, expose `GET /api/ideas/{idea_id}/revisions`, `GET /api/ideas/{idea_id}/artifacts/{artifact_name}/diff`, and `POST /api/ideas/{idea_id}/review` (wrapping the existing `record_approval_decision` tool), and add an Artifacts tab to the Idea Detail page showing provenance, trust badges, clickable evidence references, and version diffs.

## Boundaries & Constraints

**Always:**
- Never fabricate output — endpoints return real stored data; missing ideas/artifacts are explicit 404s, never empty success.
- Trust classification is exactly `Literal["generated", "trusted", "verified-tool-call", "fallback"]` — no new scale, no free-form strings.
- UUID/ISO 8601 UTC timestamps, `snake_case` API contract (no camelCase conversion in TS).
- Artifacts stay filesystem-owned: revision index in `WORKSPACE_DIR/ideas/{idea_id}/revisions/artifact-revisions.yaml` via `storage/artifacts.py` — no new SQLite table, no new storage file.
- File-size limits: route files < 150 lines, services < 200 lines.
- Frontend uses the centralized `@/api/client` (re-exports `ideas.ts`); no raw `fetch`.
- New revision records must include `agent_id`; pre-existing records without it render as `"unknown"` (no backfill migration).

**Block If:**
- The artifact store location must move out of the workspace filesystem (epic: workspace is source of truth for artifacts).
- Any requirement to backfill `agent_id`/trust for revisions created before this story.

**Never:**
- No changes to deprecated modules (`models/`, `state/`, `scoring/`, `orchestrator/` legacy FSM) or to `agent/runner.py` / `agent/runtime.py` / `orchestrator/supervisor.py`.
- No new dependencies (backend or frontend).
- No new tests inside `backend/app/storage/` itself; tests live in `backend/tests/`.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| HAPPY_PATH | Idea with 2 revisions of artifact `abstract` (v1 trust `generated`, v2 trust `verified-tool-call`, both with `agent_id` + `evidence_refs`) | `GET /api/ideas/{id}/revisions` → 200, `{"idea_id", "revisions": [...], "count": 2}`, each revision has `artifact_name`, `version`, `timestamp`, `file_name`, `content`, `diff`, `provenance`, `agent_id`, `trust`, `evidence_refs` | No error expected |
| DIFF | Same idea, `GET /api/ideas/{id}/artifacts/abstract/diff` | 200, `build_artifact_comparison` shape: `available: true`, `latest`, `previous`, `content_a`, `content_b`, `diff` | No error expected |
| DIFF_SINGLE | Artifact with only 1 revision | 200, `available: false`, `revisions` list | No error expected |
| ERROR_CASE | `GET /api/ideas/UNKNOWN-9999/revisions` | 404 with detail naming the idea | HTTPException 404 |
| ERROR_CASE | `GET /api/ideas/{id}/artifacts/missing/diff` for idea with no such artifact | 200, `available: false` (comparison of nothing is not an error) | No error expected |
| REVIEW | `POST /api/ideas/{id}/review` with `{"reviewer_role": "user", "decision": "approved", "comments": "..."}` | 200, `{"idea_id", "reviewer", "decision"}`; review persisted in `idea.yaml` `reviews` dict with `trust: "trusted"` and provenance | No error expected |
| ERROR_CASE | `POST /api/ideas/UNKNOWN-9999/review` | 404 | HTTPException 404 |
| ERROR_CASE | `POST /api/ideas/{id}/review` with empty `decision` | 422 (pydantic) | Validation error detail |
| EMPTY | Idea with no revisions | 200, `{"revisions": [], "count": 0}` | No error expected |

</intent-contract>

## Code Map

- `backend/app/storage/artifacts.py` (97 lines) -- `save_artifact_revision` (record dict at line 67: add `agent_id`), `load_artifact_revisions`, `build_artifact_comparison` (line 97) -- the canonical artifact store; `storage/` is the existing artifact owner (not in `scripts/forbidden_imports.py`), extend in place
- `backend/app/work_items/models.py` (128 lines) -- add `TrustLevel = Literal["generated", "trusted", "verified-tool-call", "fallback"]` next to `RoutingConfidence` -- single source of truth for the trust scale (Epic 10 pattern)
- `backend/app/agent/domain_tools.py` (216 lines) -- `draft_patent_section` (line 126, calls `save_artifact_revision` at 137), `record_approval_decision` (line 163), `save_workspace_item` (line 184) -- pass `agent_id` through
- `backend/app/api/routes/ideas.py` (172 lines) -- idea CRUD routes; already over the 150-line limit, so artifact/review routes go in a **new** route file
- `backend/app/api/routes/artifacts.py` (new) -- revisions/diff/review endpoints, `APIRouter(prefix="/api", tags=["artifacts"])`
- `backend/app/api/app.py` -- router registration; add the artifacts router
- `backend/tests/test_storage_artifacts.py` -- existing artifact store tests (pattern to follow)
- `backend/tests/test_artifacts.py` (96 lines) -- `build_artifact_comparison` tests
- `backend/tests/conftest.py` -- `temp_workspace` + `patch_config` fixtures (tmp workspace, patched `WORKSPACE_DIR`)
- `frontend/src/api/ideas.ts` (110 lines) -- `ArtifactRevision` interface (line 42, add `agent_id`), `fetchIdeaRevisions` (line 69), `fetchArtifactDiff` (line 74) already exist and match the new endpoints; add `recordIdeaReview`
- `frontend/src/components/deepagents/ArtifactDiffPanel.tsx` (77 lines) -- existing diff viewer, currently unused; reuse for the diff view
- `frontend/src/components/idea-detail/ArtifactsPanel.tsx` (new) -- artifacts list + provenance + trust badges + evidence links + diff dialog
- `frontend/src/pages/IdeaDetail.tsx` (207 lines) -- add an "Artifacts" tab (pattern: existing Overview/Filesystem/Comments tabs, lines 161-202)
- `frontend/src/components/idea-detail/ArtifactsPanel.test.tsx` (new) -- panel tests

## Tasks & Acceptance

**Execution:**
- [ ] `backend/app/work_items/models.py` -- add `TrustLevel = Literal["generated", "trusted", "verified-tool-call", "fallback"]` -- one canonical trust scale for Epic 10, importable by storage layer and routes
- [ ] `backend/app/storage/artifacts.py` -- `save_artifact_revision(..., agent_id: str = "unknown")` stored in the revision record and in the `idea.yaml` `artifact_revisions` meta; import `TrustLevel` for the `trust` parameter type -- every new revision carries agent attribution per epic requirement
- [ ] `backend/app/agent/domain_tools.py` -- `draft_patent_section` passes `agent_id="deepagents"` (the writing agent) to `save_artifact_revision`; `save_workspace_item` adds `agent_id` to the sidecar JSON -- agent outputs are attributed at write time
- [ ] `backend/app/api/routes/artifacts.py` (new) -- `GET /ideas/{idea_id}/revisions` (404 unknown idea via existing `_idea_exists`-style check; returns `{"idea_id", "revisions", "count"}`), `GET /ideas/{idea_id}/artifacts/{artifact_name}/diff` (404 unknown idea; `available: false` for unknown artifact), `POST /ideas/{idea_id}/review` (pydantic `RecordReviewRequest`: `reviewer_role` min_length=1, `decision` min_length=1, `comments` default ""; 404 unknown idea; delegates to `record_approval_decision`) -- inspectable via API; separate file keeps `ideas.py` from growing further
- [ ] `backend/app/api/app.py` -- register the artifacts router alongside the other routers
- [ ] `backend/tests/test_storage_artifacts.py` -- extend: `agent_id` persisted in record + `idea.yaml` meta; all four trust levels accepted; legacy records without `agent_id` load fine -- covers the persistence contract
- [ ] `backend/tests/test_artifacts.py` (or new `backend/tests/test_artifact_api.py`) -- class-based API tests via TestClient with `temp_workspace`/`patch_config`: revisions happy path + empty + 404; diff available/unavailable + 404; review happy path + 404 + 422 -- covers the I/O matrix
- [ ] `frontend/src/api/ideas.ts` -- add `agent_id: string` to `ArtifactRevision`; add `recordIdeaReview(ideaId, body)` posting to `/ideas/{ideaId}/review` -- centralized client, snake_case preserved
- [ ] `frontend/src/components/idea-detail/ArtifactsPanel.tsx` (new) -- loads `fetchIdeaRevisions`, groups by `artifact_name`, shows per artifact: latest version, `agent_id`, trust `Badge` (color per level), timestamp, `provenance`, `evidence_refs` as clickable links to the idea filesystem (evidence refs are workspace paths — link to the Filesystem tab / file view), and a "Compare" action opening a dialog with `ArtifactDiffPanel` fed by `fetchArtifactDiff`; empty state when no revisions; API errors surface (throw, don't swallow) -- provenance visible alongside the artifact per AC
- [ ] `frontend/src/pages/IdeaDetail.tsx` -- add an "Artifacts" `TabsTrigger`/`TabsContent` rendering `ArtifactsPanel` (follow the existing tab pattern) -- review access in the UI
- [ ] `frontend/src/components/idea-detail/ArtifactsPanel.test.tsx` (new) -- vitest + RTL: revisions render with trust badge + evidence links, empty state, API error surfaces, diff dialog opens with comparison -- frontend test rule

**Acceptance Criteria:**
- Given an artifact revision is saved, when it is stored, then the record includes agent attribution, source/evidence references, and a trust classification from the four-tier scale.
- Given an idea has artifact revisions, when the Artifacts tab is opened in the Idea Detail page, then each artifact shows its provenance, trust classification, and evidence references, and source references are clickable.
- Given an artifact has two or more revisions, when the user opens the comparison, then the diff between the two latest versions is displayed.
- Given a user records a review decision for an idea, when the request succeeds, then the review is persisted with `trust: "trusted"` and is visible in the idea data.

## Delivery Patterns Checklist

**CI** (`.github/workflows/ci.yml`):
- [ ] Backend: `ruff check` clean, `scripts/forbidden_imports.py` passes, coverage stays at/above `--cov-fail-under=60`
- [ ] Frontend: `tsc -b --noEmit`, `eslint src`, `vitest run`, `npm run build` all pass
- [ ] No dependency changes, no new CI job, no Docker/compose changes.

**Testing:**
- [ ] LLM/MCP boundaries mocked — no test depends on a live model or live MCP server
- [ ] Separate test workspace via existing `temp_workspace`/`patch_config` fixtures (never the dev workspace)
- [ ] Class-based `TestFeature` structure; no new shared fixtures needed (reuse existing)
- [ ] Frontend tests mock the API client; no live network

## Spec Change Log

## Review Triage Log

### 2026-08-22 — Review pass
- intent_gap: 0
- bad_spec: 0
- patch: 4: (high 1, medium 2, low 1)
- defer: 4
- reject: 6
- addressed_findings:
  - `[high]` `[patch]` ArtifactsPanel dialog dereferenced `comparison.previous`/`comparison.latest` without checking `available` — added guard with fallback message when comparison is unavailable.
  - `[medium]` `[patch]` Trust badge used the same variant for `trusted` and `verified-tool-call` — now all four trust levels map to distinct badge variants per spec.
  - `[medium]` `[patch]` `ArtifactRevision.agent_id` typed as required though legacy records omit it — made optional (`agent_id?: string`); UI already renders "unknown" fallback.
  - `[low]` `[patch]` Stale error state persisted across `ideaId` changes in ArtifactsPanel — error is now cleared at the start of each load.

## Design Notes

Artifact provenance stays in the workspace filesystem (epic: "workspace filesystem is the source of truth for ideas, research artifacts, and agent outputs; SQLite stores runtime state only"). `storage/artifacts.py` is the existing artifact owner and is **not** in the forbidden-import list — it is extended in place rather than duplicated into a new module. The trust scale lives in `work_items/models.py` as `TrustLevel` (mirroring how `RoutingConfidence` is shared) so Epic 10.3 can reuse it. Pre-existing revision records without `agent_id` are tolerated: the API returns them as-is and the UI renders `"unknown"` — no backfill migration (consistent with Story 10.1's no-backfill stance).

Example revision record:
```json
{
  "artifact_name": "abstract",
  "version": 2,
  "timestamp": "2026-08-22T10:15:00+00:00",
  "file_name": "abstract-v02.md",
  "provenance": "artifact:IDEA-0001:abstract",
  "agent_id": "deepagents",
  "trust": "verified-tool-call",
  "evidence_refs": ["knowledge-base/paper-123.md"]
}
```

## Verification

**Commands:**
- `python -m pytest backend/tests -k "artifact" -q` -- expected: all pass
- `python -m pytest backend/tests -q` -- expected: full suite green
- `python -m ruff check backend` -- expected: clean
- `python scripts/forbidden_imports.py` -- expected: PASS
- `cd frontend && npx tsc -b --noEmit && npx vitest run src/components/idea-detail/ArtifactsPanel.test.tsx && npm run build` -- expected: pass

## Auto Run Result

**Status:** done

**Summary:** Artifact revisions now carry `agent_id` attribution and the four-tier `TrustLevel` scale (`generated` | `trusted` | `verified-tool-call` | `fallback`), and are inspectable via three new API endpoints plus a new Artifacts tab on the Idea Detail page showing version, trust badge, agent, provenance, evidence references, and a version-comparison dialog.

**Files changed:**
- `backend/app/work_items/models.py` — added canonical `TrustLevel` literal.
- `backend/app/storage/artifacts.py` — `save_artifact_revision` accepts/persists `agent_id` (record + idea.yaml meta); typed `trust` as `TrustLevel`.
- `backend/app/agent/domain_tools.py` — `draft_patent_section` attributes `agent_id="deepagents"`; `save_workspace_item` sidecar includes `agent_id`.
- `backend/app/api/routes/artifacts.py` (new) — `GET /ideas/{id}/revisions`, `GET /ideas/{id}/artifacts/{name}/diff`, `POST /ideas/{id}/review` with 404/422 handling.
- `backend/app/api/app.py` — registered artifacts router.
- `backend/tests/test_artifact_api.py` (new) — class-based TestClient tests covering the full I/O matrix.
- `backend/tests/test_storage_artifacts.py` — agent_id persistence, all four trust levels, legacy-record tolerance.
- `frontend/src/api/ideas.ts` — `agent_id` on `ArtifactRevision` (optional for legacy), `recordIdeaReview` client.
- `frontend/src/components/idea-detail/ArtifactsPanel.tsx` (new) — provenance UI with trust badges, evidence refs, compare dialog.
- `frontend/src/components/idea-detail/ArtifactsPanel.test.tsx` (new) — vitest + RTL coverage.
- `frontend/src/pages/IdeaDetail.tsx` — Artifacts tab.
- `frontend/src/__tests__/IdeaDetail.test.tsx` — mocked the new artifact API.

**Review findings:** 4 patches applied (dialog `available` guard, per-level badge variants, optional `agent_id` type, stale-error clear); 4 items deferred to `deferred-work.md` (idea_id path traversal, YAML index write race, legacy `"verified"` trust test, ArtifactDiffPanel empty-content state); 6 rejected as false positives or out of scope.

**Follow-up review recommended:** false — patches were small, localized UI/type fixes with no API, security, or data impact.

**Verification:**
- `python -m pytest backend/tests -q` → 476 passed.
- `python -m ruff check` (changed files) → clean; `python scripts/forbidden_imports.py` → PASS.
- `npx tsc -b --noEmit` → clean; `npx vitest run` → 280 passed (25 files); `npm run build` → success.

**Residual risks:** Deferred items above — most notably the pre-existing `idea_id` path-traversal surface, now reachable from the new endpoints, and the unlocked YAML index rewrite under concurrent writes.
