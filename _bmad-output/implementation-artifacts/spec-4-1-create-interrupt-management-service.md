---
title: 'Create interrupt management service for HITL approvals'
type: 'feature'
created: '2026-08-08'
status: 'done'
review_loop_iteration: 1
baseline_revision: 'ff8fd96'
followup_review_recommended: false
context:
  - '{project-root}/_bmad-output/project-context.md'
warnings: []
---

<intent-contract>

## Intent

**Problem:** DeepAgents runtime has `interrupt_on` configured for filesystem-mutating tools (`write_file`, `edit_file`, `delete`), but there is no service to track, query, approve, or reject pending interrupts. The supervisor graph catches interrupt errors as generic failures, so interrupts surface as unstructured error messages with no lifecycle management. This blocks the HITL approval UI (Stories 4.5-4.7) from functioning.

**Approach:** Create an `InterruptService` that manages interrupt lifecycle through a dedicated SQLite table in the threads database. The service provides CRUD operations on interrupt records: creating from agent error signals, listing pending interrupts, approving, and rejecting. API endpoints expose these operations through `/api/interrupts` with proper pydantic request/response models.

## Boundaries & Constraints

**Always:**
- Use the existing `storage/threads.sqlite` database via `thread_manager.py` patterns (singleton connection)
- Follow file-size limits: service < 200 lines, route file < 150 lines
- Backend returns `snake_case`; preserve in API schemas
- Use `APIRouter(prefix="/api/interrupts", tags=["interrupts"])` pattern
- Every interrupt has a UUID `id`, `thread_id`, status, and timestamps
- Never fabricate interrupt state — interrupts exist only when the agent signals them

**Block If:**
- `InterruptedExecution` exception type differs from LangGraph's actual import path
- The checkpointer SQLite schema prevents adding a new table

**Never:**
- Modify deprecated modules (`models/`, `state/`, `scoring/`, `orchestrator/`, `storage/`)
- Add shell/code-runner tools
- Hardcode filesystem paths — use `STORAGE_DIR` from config
- Modify the supervisor graph error handling in this story (deferred to Story 4.2 SSE bridge)
- Implement SSE streaming (Story 4.2)
- Build frontend UI components (Story 4.5)

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| List empty pending | No interrupts in table | `{"interrupts": []}` | No error |
| List with pending interrupts | 2 pending interrupts | Returns array with full interrupt objects | No error |
| Approve existing interrupt | Valid interrupt_id, decision="approve" | Interrupt status → "approved", decision stored | No error |
| Approve already resolved | Interrupt status = "approved" or "rejected" | 409 Conflict with meaningful message | HTTP 409 |
| Approve non-existent | Invalid interrupt_id | 404 Not Found | HTTP 404 |
| Reject with reason | Valid interrupt_id, decision="reject", reason text | Interrupt status → "rejected", reason stored | No error |
| Create from agent error | thread_id, error string from agent | New interrupt record with "pending" status | No error |

</intent-contract>

## Code Map

- `backend/app/services/interrupt_service.py` — NEW: InterruptService class with SQLite CRUD operations
- `backend/app/api/schemas.py` — ADD: pydantic models for interrupt request/response
- `backend/app/api/routes/interrupts.py` — NEW: REST endpoints for interrupt management
- `backend/app/api/app.py` — ADD: Register interrupt router
- `backend/app/services/thread_manager.py` — REFERENCE: SQLite connection patterns, `STORAGE_DIR`, `get_checkpointer()`
- `backend/app/agent/runtime.py` — REFERENCE: `interrupt_on` config, tool names that trigger interrupts
- `backend/app/orchestrator/supervisor.py` — REFERENCE: error handling shape from agent invocations
- `backend/tests/test_interrupt_service.py` — NEW: Unit tests for interrupt service
- `backend/app/config.py` — REFERENCE: `STORAGE_DIR` constant for database path

## Tasks & Acceptance

**Execution:**
1. [x] `backend/app/services/interrupt_service.py` — Created InterruptService class with SQLite table creation and CRUD methods (singleton pattern, lazy table init)
2. [x] `backend/app/api/schemas.py` — Added pydantic models (Interrupt, CreateInterruptRequest, InterruptDecisionRequest, InterruptResponse)
3. [x] `backend/app/api/routes/interrupts.py` — Created REST endpoints (GET /pending, POST /, PATCH /{id}/approve, PATCH /{id}/reject)
4. [x] `backend/app/api/app.py` — Registered interrupt router in FastAPI app
5. [x] `backend/tests/test_interrupt_service.py` — Wrote 6 tests covering create, list_pending, approve, reject, non-existent, and resolved-state transitions

**Acceptance Criteria:**
- Given no pending interrupts exist, when GET `/api/interrupts/pending` is called, then response returns `{"interrupts": []}` with HTTP 200
- Given a pending interrupt exists, when PATCH `/api/interrupts/{id}/approve` is called with decision, then interrupt status becomes "approved" and response includes the updated interrupt
- Given a pending interrupt exists, when PATCH `/api/interrupts/{id}/reject` is called with reason, then interrupt status becomes "rejected" and response includes the updated interrupt
- Given a non-existent interrupt id, when approve or reject is called, then HTTP 404 is returned
- Given an already-resolved interrupt, when approve or reject is called, then HTTP 409 Conflict is returned
- Given a thread_id and tool_name, when POST `/api/interrupts` is called, then a new pending interrupt record is created and returned
- Given all tests pass, when `pytest backend/tests/test_interrupt_service.py -v` runs, then all tests pass with 0 failures

## Spec Change Log

## Review Triage Log

### 2026-08-08 — Review pass
- intent_gap: 0
- bad_spec: 0
- patch: 1: (medium 1)
- defer: 2: (medium 1, low 1)
- reject: 3: (low 3)
- addressed_findings:
  - `[medium]` `[patch]` Made approve_interrupt/reject_interrupt atomic with `WHERE status='pending'` to prevent TOCTOU race on concurrent decisions

## Auto Run Result

**Summary:** Created interrupt management service for HITL approvals with SQLite CRUD, pydantic schemas, REST API endpoints, and unit tests. Service tracks pending interrupts from DeepAgents' `interrupt_on` filesystem tool configuration, supports approve/reject lifecycle with atomic state transitions, and provides a queryable API for the pending interrupt list.

**Files changed:**
- `backend/app/services/interrupt_service.py` — InterruptService singleton with atomic SQLite CRUD (81 lines)
- `backend/app/api/schemas.py` — Added Interrupt, CreateInterruptRequest, InterruptDecisionRequest, InterruptResponse models (32 lines)
- `backend/app/api/routes/interrupts.py` — REST endpoints: GET /pending, POST create, PATCH approve/reject (42 lines)
- `backend/app/api/app.py` — Registered interrupt router (2 lines)
- `backend/tests/test_interrupt_service.py` — 6 unit tests covering all CRUD paths and edge cases (64 lines)

**Review findings:** 1 patch applied (TOCTOU race fix), 2 items deferred (test gaps, validation), 3 items rejected (false positives)

**Verification:** `pytest backend/tests/test_interrupt_service.py -v` → 6 passed; `pytest backend/tests/ -q` → 125 passed, 8 skipped, 0 failures

**Residual risks:** Test coverage gaps for concurrent access and DB corruption (deferred); no message/tool_input validation (deferred)

## Design Notes

### Interrupt Table Schema

The `interrupts` table lives in `storage/threads.sqlite` alongside `thread_metadata`. Using the same database keeps interrupt state co-located with thread state (both are LangGraph checkpoint-adjacent). Table initialized lazily on first service access:

```sql
CREATE TABLE IF NOT EXISTS interrupts (
    id TEXT PRIMARY KEY,
    thread_id TEXT NOT NULL,
    tool_name TEXT NOT NULL DEFAULT 'unknown',
    tool_input TEXT DEFAULT '{}',
    message TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    decision TEXT,
    reason TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
)
```

### Interrupt State Machine

```
pending → approved (via approve endpoint)
pending → rejected (via reject endpoint)
```

No transitions from approved/rejected — those are terminal states. Attempting to transition a resolved interrupt returns HTTP 409.

### Error Signal Parsing

The supervisor graph returns interrupt errors as structured shapes in the `error` field. The test at `test_threads.py:230` shows the format: `"interrupt:intr-123:Approve edit_file?"`. The service's `create_interrupt()` accepts the raw error signal and extracts tool name from the message or the `interrupt_on` tool list (`write_file`, `edit_file`, `delete`). This keeps the service decoupled from DeepAgents internals while still capturing useful metadata.

## Verification

**Commands:**
- `python -m pytest backend/tests/test_interrupt_service.py -v` — expected: all tests pass, 0 failures
- `python -m pytest backend/tests/ -q` — expected: full suite passes (no regressions from prior stories)
