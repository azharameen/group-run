---
title: 'Story 10.3: Support accuracy review and confidence flagging'
type: 'feature'
created: '2026-08-22'
status: 'done'
baseline_revision: '34bd6f7b25fe362330e9adfec32fc8241ffe9268'
review_loop_iteration: 0
followup_review_recommended: false
final_revision: '59ba08ecde26061dc2a0672723de4f64af629a5c'
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-10-context.md'
warnings: []
---

<intent-contract>

## Intent

**Problem:** Work-item outputs have no accuracy review: nothing records whether an output was checked for accuracy, no accuracy score exists at lifecycle milestones, and low-confidence work is never surfaced for human attention (PRD FR-20, counter-metric SM-C1: 90% accuracy floor).

**Approach:** Add a first-class `AccuracyReview` (work item, reviewer, 0–100 accuracy score, summary, reviewed_at) persisted in the existing work-items SQLite DB, recorded via a new `POST/GET /api/work-items/{id}/reviews` API (human review — the mechanism chosen by the owner; LLM self/peer review modes are out of scope). Each review also writes a `DecisionRecord` of type `review` so the accuracy review itself carries full provenance. Reviews scoring below 90 flag the work item for human review, shown as a badge in the Command Center work-items UI.

## Boundaries & Constraints

**Always:**
- Never fabricate output — a review record must reflect a real human review submitted via the API; no auto-generated scores.
- Accuracy score is an integer 0–100; the flag threshold is 90 (score < 90 ⇒ flagged), matching the PRD's 90% accuracy counter-metric.
- UUID v4 IDs, timezone-aware UTC ISO 8601 timestamps, `snake_case` API contract (no camelCase in TS).
- Each review insert and its `DecisionRecord` insert happen in the same transaction (same pattern as `insert_work_item`).
- File-size limits: route files < 150 lines, services/repositories < 200 lines (new modules stay well under; pre-existing over-limit files may grow modestly).
- Tests use the existing `work_item_db` in-memory fixture; never touch the dev DB.

**Block If:**
- The owner wants the flag to be a stored, mutable work-item field (e.g. clearable) instead of a derived property of the latest review — this spec derives it.
- Any requirement to auto-trigger reviews at lifecycle transitions (this story is manual/on-demand review only).

**Never:**
- No LLM-based review modes (self-review/peer-review) — deferred; no new dependencies.
- No changes to deprecated modules (`models/`, `state/`, `scoring/`, `orchestrator/` legacy FSM, `storage/`) or to `agent/` runtime files.
- No new frontend `fetch` calls — use `@/api/workItems` client.
- No changes to story 10.2's territory (artifact provenance) — module-disjoint.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| HAPPY_PATH | `POST /api/work-items/{id}/reviews` with score 95, summary, existing item | 201, `review` returned with `review_id`, `accuracy_score`, `flagged_for_review: false`; a `DecisionRecord` (type `review`) exists for the item | No error expected |
| FLAG | Same POST with score 70 | 201, `flagged_for_review: true` | No error expected |
| LIST | `GET /api/work-items/{id}/reviews` with 2 reviews | 200, `reviews` array oldest-first + `count` | No error expected |
| ERROR_CASE | POST/GET with unknown `work_item_id` | 404 naming the work item | HTTPException 404 |
| ERROR_CASE | POST with score 101, -1, or blank summary | 422 (pydantic) | Validation error detail |
| LATEST | Item with reviews 95 then 70 | Latest review (70) drives the flag: UI shows flagged | No error expected |
| EMPTY | Item with no reviews | 200, empty `reviews` array, `count: 0`; UI shows no flag | No error expected |

</intent-contract>

## Code Map

- `backend/app/work_items/models.py` (96 lines) -- `WorkItem`, `DecisionRecord`, `RecordDecisionRequest`; add `AccuracyReview` + `AccuracyReviewRequest`
- `backend/app/work_items/repository.py` (279 lines) -- `_init_schema` (add `accuracy_reviews` table), `insert_decision`; add `insert_review` (transactional with decision) + `list_reviews`
- `backend/app/work_items/mapping.py` (44 lines) -- `row_to_decision`; add `row_to_review`
- `backend/app/work_items/reviews.py` (new) -- review service: `record_review`, `list_reviews`, `latest_review`
- `backend/app/api/routes/reviews.py` (new) -- `POST/GET /api/work-items/{work_item_id}/reviews`
- `backend/app/api/app.py` -- router registration; add the reviews router
- `backend/tests/test_reviews.py` (new) -- class-based tests following `test_decisions.py`
- `frontend/src/api/workItems.ts` -- add `AccuracyReview` interface + `createReview` / `listReviews`
- `frontend/src/components/command-center/WorkItemsTab.tsx` (244 lines) -- review dialog + flag badge per `WorkItemRow`
- `frontend/src/components/command-center/WorkItemsTab.test.tsx` -- extend tests for review dialog + flag

## Tasks & Acceptance

**Execution:**
- [x] `backend/app/work_items/models.py` -- add `AccuracyReview` (review_id, work_item_id, reviewer, accuracy_score: int, summary, flagged_for_review: bool, reviewed_at) and `AccuracyReviewRequest` (reviewer default "user", accuracy_score `Field(ge=0, le=100)`, summary min_length=1 + non-blank validator like `RecordDecisionRequest`) -- single source of truth for the review shape
- [x] `backend/app/work_items/repository.py` -- add `accuracy_reviews` table to `_init_schema` (review_id PK, work_item_id indexed, all fields NOT NULL) + `insert_review(review: dict, decision: dict)` (one transaction: review row + `decisions` row) and `list_reviews(work_item_id)` ordered by reviewed_at ASC -- review and its provenance decision are atomic
- [x] `backend/app/work_items/mapping.py` -- add `row_to_review(row) -> AccuracyReview` -- keep row→model mapping in one place
- [x] `backend/app/work_items/reviews.py` (new module) -- `record_review(request, work_item_id) -> AccuracyReview` (raises `UnknownWorkItemError` when item missing; computes `flagged_for_review = accuracy_score < 90`; builds the companion `DecisionRecord` with `decision_type="review"`, `agent_id=reviewer`, `reasoning=summary`, `confidence="high" if score >= 90 else "low"`, `evidence=["accuracy_review:<review_id>"]`), `list_reviews(work_item_id) -> list[AccuracyReview]`, `latest_review(work_item_id) -> AccuracyReview | None` -- separate module keeps `service.py` under the line limit
- [x] `backend/app/api/routes/reviews.py` (new route file, registered in `backend/app/api/app.py`) -- `POST /api/work-items/{work_item_id}/reviews` (201; 404 unknown item; 422 validation; 500 on sqlite3.Error) and `GET /api/work-items/{work_item_id}/reviews` (200 `{"reviews": [...], "count": n}`; 404 unknown item) -- inspectable via API; separate file keeps route files under 150 lines
- [x] `backend/tests/test_reviews.py` (new) -- class-based tests: record happy path (score ≥ 90 not flagged), flag boundary (89 flagged, 90 not), decision record written with type `review` and matching confidence, list ordering oldest-first, 404 unknown item, 422 invalid score/blank summary, empty list -- mirrors `test_decisions.py` patterns with the `work_item_db` fixture
- [x] `frontend/src/api/workItems.ts` -- add `AccuracyReview` TS interface (snake_case) + `createReview(workItemId, body)` / `listReviews(workItemId)` via the existing client -- centralized API client rule
- [x] `frontend/src/components/command-center/WorkItemsTab.tsx` -- per `WorkItemRow`: a "Review" button opening a dialog (shadcn `Dialog`) that lists existing reviews (score, summary, reviewer, timestamp, flagged badge) and a form (score input 0–100, summary textarea, reviewer default "user") to submit a new review; a `Badge` on the row when the latest review has `flagged_for_review` (e.g. "Needs review") -- low-confidence outputs explicitly flagged for user review
- [x] `frontend/src/components/command-center/WorkItemsTab.test.tsx` -- extend: review dialog renders existing reviews, submitting a review calls `createReview` and refreshes, flagged badge shows for low latest score, API error surfaces (throw, don't swallow) -- frontend test rule

**Acceptance Criteria:**
- Given a work item exists, when a human submits an accuracy review via the API, then an `AccuracyReview` with accuracy score and summary is persisted and a `DecisionRecord` of type `review` with the same provenance fields is persisted in the same transaction.
- Given a review scores below 90, when it is saved, then it is flagged for user review (`flagged_for_review: true`).
- Given a work item has multiple reviews, when its reviews are listed, then they are returned oldest-first and the latest review determines the current flag state.
- Given a work item with a flagged latest review, when the Command Center work-items UI renders it, then the row is visibly flagged for human review and the review dialog shows the score and summary.

## Delivery Patterns Checklist

**CI** (`.github/workflows/ci.yml`):
- [ ] Backend: `ruff check` clean, `scripts/forbidden_imports.py` passes, coverage stays at/above `--cov-fail-under=60`
- [ ] Frontend: `tsc -b --noEmit`, `eslint src`, `vitest run`, `npm run build` all pass
- [ ] No dependency changes, no new CI job, no Docker/compose changes.

**Testing:**
- [ ] LLM/MCP boundaries mocked — no test depends on a live model or live MCP server
- [ ] Separate test DB via existing `work_item_db` fixture (never the dev `work_items.sqlite`)
- [ ] Class-based `TestFeature` structure; no new shared fixtures needed (reuse `work_item_db`)
- [ ] No new tests in deprecated modules
- [ ] Frontend tests mock the API client; no live network

## Spec Change Log

## Review Triage Log

### 2026-08-22 — Review pass
- intent_gap: 0
- bad_spec: 0
- patch: 1: (medium 1)
- defer: 1: (low 1)
- reject: 8: (low 8)
- addressed_findings:
  - `[medium]` `[patch]` `submitReview` sent `Number(reviewScore)` which could be `NaN` for non-numeric input, producing a malformed request body (opaque backend 422). Added an explicit `Number.isInteger(score) && score >= 0 && score <= 100` guard in `submitReview` with a clear client-side error message, plus a test verifying out-of-range scores are rejected without calling `createReview`.

Rejected (noise / pre-existing patterns, dropped silently): no FK constraint on `accuracy_reviews.work_item_id` (pre-existing pattern across all work_items tables; no delete endpoint exists); unbounded `list_reviews` (pre-existing pattern — `list_decisions`/`list_history`/`list_events` identical); free-text `reviewer` (no auth layer exists; consistent with `decided_by`); no rate limiting (no rate limiting anywhere in the API); unused `latest_review` service helper (intentional public API for future consumers); derived flag not persisted on work item (intended design, see Design Notes); manual transaction handling in `insert_review` (required for the two-write transaction; consistent with `insert_decision`); oldest-first ordering assumption in UI (contract is documented and tested).

Deferred: no fault-injection test for mid-transaction crash atomicity of review + DecisionRecord insert (success and rollback paths are tested; fault-injection infrastructure does not exist in this codebase).

## Design Notes

The flag is **derived, not stored state**: `flagged_for_review` is computed at write time (`accuracy_score < 90`) and persisted on the review row, and the UI flags the work item based on the *latest* review. This avoids a mutable work-item field that could drift from the review history, and keeps the flag auditable — every flag has a review record behind it. The 90 threshold mirrors the PRD counter-metric SM-C1 (do not optimize autonomy if accuracy drops below 90%).

Each review also writes a `DecisionRecord` (`decision_type="review"`, already in the existing Literal) so the accuracy review itself is inspectable in the story 10.1 decision history with full provenance — `confidence` maps from the score (≥ 90 ⇒ `high`, else `low`), reusing the existing two-tier scale.

Example `AccuracyReview`:
```json
{
  "review_id": "9a1c…",
  "work_item_id": "a1b2…",
  "reviewer": "user",
  "accuracy_score": 72,
  "summary": "Two claims lack source references; confidence in market sizing is weak.",
  "flagged_for_review": true,
  "reviewed_at": "2026-08-22T14:05:00+00:00"
}
```

## Verification

**Commands:**
- `python -m pytest backend/tests -k "reviews or decisions or work_items" -q` -- expected: all pass
- `python -m ruff check backend` -- expected: clean
- `python scripts/forbidden_imports.py` -- expected: PASS
- `cd frontend && npx tsc -b --noEmit && npx vitest run src/components/command-center/WorkItemsTab.test.tsx` -- expected: pass

## Auto Run Result

**Status:** done

**Summary:** Implemented story 10.3 (Support accuracy review and confidence flagging). Added a first-class `AccuracyReview` (work item, reviewer, 0-100 integer accuracy score, summary, reviewed_at) persisted in the existing work-items SQLite DB, recorded via `POST/GET /api/work-items/{id}/reviews`. Each review also writes a `DecisionRecord` of type `review` in the same transaction for full provenance. Reviews scoring below 90 flag the work item for human review, surfaced as a "Needs review" badge in the Command Center work-items UI with a review dialog (list + submit form).

**Files changed:**
- `backend/app/work_items/models.py` — added `AccuracyReview` and `AccuracyReviewRequest` (score 0-100, non-blank summary)
- `backend/app/work_items/repository.py` — `accuracy_reviews` table, transactional `insert_review` (review + DecisionRecord), `list_reviews`
- `backend/app/work_items/mapping.py` — `row_to_review`
- `backend/app/work_items/reviews.py` (new) — `record_review` / `list_reviews` / `latest_review`; `FLAG_THRESHOLD = 90`
- `backend/app/api/routes/reviews.py` (new) — POST/GET review endpoints with 404/422/500 handling
- `backend/app/api/app.py` — registered reviews router
- `backend/tests/test_reviews.py` (new) — 19 tests (service, repository, API)
- `frontend/src/api/workItems.ts` — `AccuracyReview` interface, `createReview`, `listReviews`
- `frontend/src/components/command-center/WorkItemsTab.tsx` — review dialog (list + form), ""Needs review"" flag badge, client-side score validation
- `frontend/src/components/command-center/WorkItemsTab.test.tsx` — 6 new tests

**Review findings breakdown:** 1 patch applied (client-side NaN/out-of-range score guard), 1 deferred (fault-injection atomicity test), 8 rejected (pre-existing patterns / noise). No intent gaps, no bad-spec loopbacks.

**Follow-up review recommendation:** false — the single review-driven change was a small, localized, low-consequence client-side validation guard with a dedicated test.

**Verification:**
- `python -m pytest backend/tests -q` — 476 passed
- `python -m ruff check backend` — clean
- `python scripts/forbidden_imports.py` — PASS
- `cd frontend && npx tsc --noEmit` — clean
- `cd frontend && npx eslint src/components/command-center/WorkItemsTab.tsx src/components/command-center/WorkItemsTab.test.tsx` — clean
- `cd frontend && npx vitest run src/components/command-center/WorkItemsTab.test.tsx --no-file-parallelism` — 15 passed
- Full frontend suite: 275 passed; the only errors are pre-existing/environmental (React `act()` warning in KnowledgeBase.test.tsx; vitest worker-pool startup timeouts on DocumentViewerCard/Dashboard that pass in isolation)

**Residual risks:** None material. The deferred fault-injection test leaves mid-transaction crash atomicity covered only by the rollback-path test.
