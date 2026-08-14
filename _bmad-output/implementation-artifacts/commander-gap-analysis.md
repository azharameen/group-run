# Commander Gap Analysis

> Generated: 2026-08-14
> Status: Post-implementation audit — identifies runtime crashes, stubs, and missing UI

---

## Critical Runtime Crashes

| Function | Story | Missing Dependency | Crash Location | Impact |
|---|---|---|---|---|
| `autoMergePR` | EP-C4.2 | `executeCommand` not defined | commander.mjs:L1459 | Phase 2 auto-merge fails |
| `cleanupAfterMerge` | EP-C4.3 | `executeCommand` not defined | commander.mjs:L1509 (x4 calls) | Post-merge git ops fail |
| `julesQuota.init` | EP-C6.1 | `loadBoardState` not defined | commander.mjs:L1572 | Quota always reads 0 (caught silently) |

**Fix needed:** Define `executeCommand` (shell command runner via `child_process`) and export `loadBoardState` from existing buildBoardState logic.

---

## Story-by-Story Status

### EP-C4.1: PR Validation & Copilot Review — PARTIAL

| Acceptance Criterion | Status | Notes |
|---|---|---|
| validatePR: targets develop | ✅ Done | Branch ref check works |
| validatePR: 1 story ref | ✅ Done | Added story count validation |
| validatePR: branch naming | ✅ Done | Regex check works |
| validatePR: commit format | ✅ Done | Conventional commit regex |
| reviewPR: Copilot reviews diff | ❌ Stub | Prompt built but never sent to `bmad-agent-dev` |
| reviewPR: silent bug check | ❌ Missing | No actual bug detection |
| reviewPR: test coverage check | ⚠️ Partial | Checks for .test/.spec files only |
| reviewPR: JSONL logging | ✅ Done | `logEvent("pr_review", ...)` works |

### EP-C4.2: Pipeline Monitoring & Auto-Merge — PARTIAL

| Acceptance Criterion | Status | Notes |
|---|---|---|
| monitorPipeline: polls check runs | ✅ Done | Synchronous evaluation |
| monitorPipeline: status updates in Command Center | ❌ Missing | No UI integration |
| autoMergePR: Phase 1 human approval | ✅ Done | Returns `requiresApproval: true` |
| autoMergePR: Phase 1 approval card + timer | ❌ Missing | No approval UI or timer |
| autoMergePR: Phase 2+ auto-merge on trust | ❌ Crash | `executeCommand` undefined |
| autoMergePR: squash merge via gh CLI | ❌ Crash | Same missing dependency |
| Pipeline failure → fix session dispatch | ❌ Missing | Entirely absent |

### EP-C4.3: Branch Cleanup & Local Sync — PARTIAL

| Acceptance Criterion | Status | Notes |
|---|---|---|
| git fetch origin develop | ❌ Crash | `executeCommand` undefined |
| git checkout develop | ❌ Crash | Same |
| git pull origin develop | ❌ Crash | Same |
| Feature branch deleted remotely | ❌ Crash | Same |
| Board state updated (task → done) | ❌ Missing | No board state update logic |
| Protected branch safety | ✅ Done | main/develop/master guards work |
| JSONL log records cleanup | ✅ Done | `logEvent` called (but unreachable due to crash) |

### EP-C5.1: JSONL Logging & Trust Dashboard — PARTIAL

| Acceptance Criterion | Status | Notes |
|---|---|---|
| logDecision: all JSONL fields | ✅ Done | All 9 fields captured |
| logEvent: generic event logging | ✅ Done | New function added |
| getTrustMetrics: accuracy rates | ✅ Done | All metrics computed |
| getHealthMetrics: system metrics | ✅ Done | Sessions, stories, system |
| Trust dashboard UI | ❌ Missing | No tab in renderHtml |
| 7-day trend visualization | ❌ Missing | Not implemented |

### EP-C5.2: Learning Loop Implementation — PARTIAL

| Acceptance Criterion | Status | Notes |
|---|---|---|
| analyzeMismatches: detect decision ≠ outcome | ✅ Done | Groups by action:decision |
| analyzeMismatches: top-5 patterns | ✅ Done | Sorted suggestions |
| Rule refinement | ❌ Missing | No auto-adjustment logic |
| Confidence threshold adjustment | ❌ Missing | Not implemented |
| Dashboard: learning display | ❌ Missing | No UI tab |

### EP-C5.3: CI Pipeline Redesign — DONE ✅

| Acceptance Criterion | Status | Notes |
|---|---|---|
| Ruff backend lint | ✅ Done | ci.yml uses `ruff check` |
| ESLint frontend lint | ✅ Done | ci.yml uses `npx eslint` |
| Backend 80% coverage | ✅ Done | pytest with cov-fail-under=80 |
| Frontend 80% coverage | ✅ Done | vitest with coverage.thresholds |
| E2E Playwright on develop | ✅ Done | Conditional job |
| Security audit on main | ✅ Done | Separate job |

### EP-C6.1: Jules Quota Management — PARTIAL

| Acceptance Criterion | Status | Notes |
|---|---|---|
| 100 sessions/day quota tracked | ✅ Done | Object with dailyLimit |
| Quota shown in dashboard | ❌ Missing | No UI display |
| Standard dispatch (< 50%) | ✅ Done | getDispatchStrategy works |
| Priority dispatch (> 80%) | ✅ Done | Sorts by priority |
| Exhausted → Copilot fallback | ✅ Done | Returns copilot_only |
| Quota init from state | ❌ Crash | `loadBoardState` undefined, quota always 0 |

### EP-C6.2: Edge Case Handling & Documentation — PARTIAL

| Acceptance Criterion | Status | Notes |
|---|---|---|
| Merge queue serialization | ✅ Done | mergeQueue + serializeMerge |
| Pull after each merge | ✅ Done | Uses `runGitCommand` (defined) |
| Copilot conflict resolution | ❌ Missing | Returns error only |
| Jules session failure handling | ⚠️ Partial | handleSessionFailure exists |
| dispatchFixSession | ❌ Stub | Returns `dispatched: false` |
| Copilot escalation timeout | ❌ Missing | Not implemented |
| Documentation | ❌ Missing | No README or inline docs |

---

## Summary

| Epic | Stories | Done | Partial | Missing |
|---|---|---|---|---|
| EP-C4: PR Lifecycle | 3 | 0 | 3 | 0 |
| EP-C5: Trust & Observability | 3 | 1 | 2 | 0 |
| EP-C6: Polish | 2 | 0 | 2 | 0 |

**Overall completion: ~35%**

### Priority Fixes
1. **P0:** Define `executeCommand` — unblocks C4.2, C4.3
2. **P0:** Export `loadBoardState` — unblocks C6.1 quota init
3. **P1:** Wire trust/quota/health to canvas UI — C5.1, C6.1
4. **P2:** Integrate `reviewPR` with actual Copilot review — C4.1
5. **P3:** Add approval timer/card UI — C4.2
6. **P3:** Add board state update after merge — C4.3
