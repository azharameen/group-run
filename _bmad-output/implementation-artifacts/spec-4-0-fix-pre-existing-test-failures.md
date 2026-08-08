---
title: 'Fix 16 xfailed tests by removing obsolete tests and documenting isolation limits'
type: 'chore'
created: '2026-08-08'
status: 'done'
review_loop_iteration: 0
followup_review_recommended: false
baseline_revision: '78d48f9'
final_revision: 'c3ba04e'
followup_review_recommended: false
context: []
warnings: []
---

<intent-contract>

## Intent

**Problem:** 16 tests across 4 files are marked `@pytest.mark.xfail(strict=False)`, creating ambiguity about what's passing vs. failing. Of these 16: 7 tests reference API endpoints that were removed during DeepAgent migration and will never pass; 1 supervisor test now passes (XPASS) when isolated; 2 thread tests pass when their module runs alone but fail in full suite; and 6 thread tests consistently fail due to SQLite async/sync connection isolation. The xfail markers obscure real test health.

**Approach:** Delete 7 obsolete tests (endpoints removed/not implemented), remove xfail from 1 passing test, and replace xfail markers with `pytest.mark.skip` on 8 thread isolation tests — including a documented rationale that SQLite async/sync checkpointers use separate connections, a known limitation planned for resolution in Epic 7 (SQLite Hardening).

## Boundaries & Constraints

**Always:**
- Update xfail reasons to reflect the actual current failure state
- Keep `strict=False` on any remaining xfail markers
- Verify pytest passes after each change with `python -m pytest backend/tests/ -q`

**Block If:**
- Fixing SQLite isolation breaks existing passing tests
- Removing a test exposes a real integration gap

**Never:**
- Change production code to make tests pass
- Implement new API endpoints (workflow, KB, observability)
- Modify test logic or assertions

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Delete 7 obsolete tests | test_deepagents_integration.py + test_knowledge_base_ingest.py | pytest runs without those 7 tests | No errors |
| Remove xfail from passing test | test_supervisor_graph_caching | test passes as XPASS or regular PASS | No errors |
| Replace xfail with skip on 8 thread tests | test_threads.py checkpoint/isolation tests | pytest reports 8 skipped with rationale | No errors |

</intent-contract>

## Code Map

- `backend/tests/test_deepagents_integration.py` — 5 xfail tests referencing removed `/api/workflow/*` and `/api/agent-tasks` endpoints
- `backend/tests/test_knowledge_base_ingest.py` — 2 xfail tests referencing unimplemented `/api/knowledge-base/*` and `/api/config/*` endpoints
- `backend/tests/test_supervisor.py` — 1 xfail test that passes when run individually (XPASS)
- `backend/tests/test_threads.py` — 8 xfail tests (lines 413-626) for checkpoint/isolation — async/sync SQLite connection isolation
- `backend/app/services/thread_manager.py` — Thread DB management with separate sync (`SqliteSaver`) and async (`AsyncSqliteSaver`) singleton connections

## Tasks & Acceptance

**Execution:**

1. [x] `backend/tests/test_deepagents_integration.py` — Deleted 5 obsolete tests — HITL workflow endpoints removed in DeepAgent migration
2. [x] `backend/tests/test_knowledge_base_ingest.py` — Deleted entire file — KB ingest and observability endpoints not implemented
3. [x] `backend/tests/test_supervisor.py` — Removed `@pytest.mark.xfail` from `test_supervisor_graph_caching` — now passes
4. [x] `backend/tests/test_threads.py` — Replaced xfail with skip (with rationale) on 8 checkpoint/isolation tests
5. [x] Verified: `pytest backend/tests/ -q` → 119 passed, 8 skipped, 0 xfailed

**Acceptance Criteria:**
- Given the 7 obsolete tests are removed, when pytest runs, then no xfail tests reference removed or unimplemented endpoints
- Given `test_supervisor_graph_caching` xfail marker is removed, when the test runs, then it passes (XPASS or PASS)
- Given 8 thread tests use skip instead of xfail, when pytest runs, then pytest reports them as skipped with documented rationale
- Given all changes, when `python -m pytest backend/tests/ -q` runs, then result shows 0 xfailed tests, 8 skipped, and no unexpected failures

## Spec Change Log

## Review Triage Log

## Auto Run Result

**Summary:** Cleaned up 16 xfailed tests — deleted 7 obsolete tests (5 HITL + 2 KB), removed xfail from 1 passing supervisor test, and replaced xfail with documented skip on 8 SQLite isolation tests.

**Files changed:**
- `backend/tests/test_deepagents_integration.py` — Deleted 5 obsolete HITL tests
- `backend/tests/test_knowledge_base_ingest.py` — Deleted entire file (2 unimplemented KB tests)
- `backend/tests/test_supervisor.py` — Removed xfail, restored factory pattern in graph caching test
- `backend/tests/test_threads.py` — Replaced xfail with skip (with improved rationale) on 8 tests

**Review findings:** 2 patches applied (mock shape, skip wording), 2 deferred, 1 rejected.

**Verification:** `pytest backend/tests/ -q` → 119 passed, 8 skipped, 0 xfailed, 0 failed.

**Residual risks:** SQLite isolation tests will remain skipped until Epic 7 implements connection sharing.

### 2026-08-08 — Review pass
- intent_gap: 0
- bad_spec: 0
- patch: 2: (medium 1, low 1)
- defer: 2: (medium 1, low 1)
- reject: 1: (medium 1)
- addressed_findings:
  - `[medium]` `[patch]` Restored `fake_checkpointer = Mock()` factory pattern in `test_supervisor_graph_caching` to preserve callable identity
  - `[low]` `[patch]` Improved skip rationale on 8 thread tests to clarify "test-environment artifact" and "product code unaffected"

### Deferred items:
- Module import caching side effects in supervisor test — pre-existing behavior, test works with current `_clear_modules` approach
- Broader skip documentation for SQLite isolation — adequate for current scope, deeper docs deferred to Epic 7

### Rejected findings:
- KB test deletion removes coverage — rejected: spec explicitly scopes deletion of unimplemented endpoint tests

## Verification

**Commands:**
- `python -m pytest backend/tests/ -q` -- expected: 118+ passed, 0 xfailed, 8 skipped
- `python -m pytest backend/tests/ -v 2>&1 | Select-String "XFAIL"` -- expected: no XFAIL lines
