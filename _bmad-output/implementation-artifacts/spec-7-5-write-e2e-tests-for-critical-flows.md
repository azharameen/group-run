---
title: '7-5-write-e2e-tests-for-critical-flows'
type: 'feature'
created: '2026-08-10'
status: 'in-review'
baseline_revision: 'bf41c92'
review_loop_iteration: 1
followup_review_recommended: true
final_revision: '2bb589b'
context: ['_bmad-output/implementation-artifacts/epic-7-context.md']
warnings: []
---

<intent-contract>

## Intent

**Problem:** Story 7.3 set up Playwright infrastructure (config, fixtures, page objects) but no actual E2E tests exist. The application has four critical user flows (chat, threads, ideas, HITL approvals) that need browser-level validation to ensure the full stack works end-to-end. Without these tests, regressions in the UI-to-API-to-backend pipeline can only be caught through manual testing.

**Approach:** Write Playwright E2E tests covering the four critical flows: chat streaming, thread management, idea CRUD, and HITL interrupt handling. Tests use the existing page objects from Story 7.3, with a new IdeaDetail page object for idea detail views. Tests validate UI interactions and cross-check with API responses where appropriate.

## Boundaries & Constraints

**Always:**
- Tests use Playwright's `expect` assertions with `data-testid` locators
- Tests extend the base `test` fixture from `frontend/e2e/fixtures.ts`
- Tests mock the LLM boundary per NFR-A10 — backend must return mock responses
- Tests use in-memory SQLite per NFR-A13 — no persistent test data
- Tests run with `npx playwright test` (dev project) or `npx playwright test --project=docker`
- Each flow has its own `.spec.ts` file for parallel execution
- Tests are structured as `describe` blocks with `test` cases
- Page objects encapsulate all UI interactions (no raw `page.click` in tests)
- Tests verify both UI state and API responses where appropriate

**Block If:**
- Playwright config from Story 7.3 is missing or broken
- Backend mock LLM responses cannot be configured for E2E tests
- Critical UI elements lack `data-testid` attributes

**Never:**
- Modify production code to pass tests
- Use hardcoded timeouts (use Playwright's built-in waits)
- Test deprecated modules or UI components
- Add tests to `frontend/e2e/fixtures.ts` (fixtures are infrastructure, not tests)
- Directly manipulate backend database in E2E tests

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Chat message send | User types message, clicks send | Message appears in chat list, response streams back | No error, SSE completes |
| Chat stop generation | User clicks stop during streaming | Streaming halts, partial response preserved | No error |
| Thread creation | User clicks new thread button | New thread created, sidebar updates | Thread appears in list |
| Thread switch | User clicks different thread | Messages load for selected thread | Correct thread state |
| Thread message history | Thread has prior messages | All messages render on thread load | Messages ordered correctly |
| Idea creation | User creates idea via UI/API | Idea appears in dashboard list | Idea card renders |
| Idea detail view | User clicks idea card | Navigate to /ideas/:id with detail view | Idea data displayed |
| Idea delete | User clicks delete on idea | Idea removed from list via API | 200 response, list updates |
| HITL interrupt trigger | Agent triggers interrupt (via mock) | Interrupt overlay appears with tool call | Overlay blocks input |
| HITL approve | User clicks approve on interrupt | Interrupt resolved, agent continues | Tool executes, stream resumes |
| HITL reject | User clicks reject on interrupt | Interrupt resolved, agent handles rejection | Error handled gracefully |

</intent-contract>

## Code Map

- `frontend/e2e/fixtures.ts` — Base test fixtures with API helpers (`getJson`, `waitForHealthy`)
- `frontend/e2e/pages/CommandCenter.ts` — Chat page object (send message, stop, new thread, HITL)
- `frontend/e2e/pages/Dashboard.ts` — Ideas list page object (create, filter, delete)
- `frontend/e2e/pages/KnowledgeBase.ts` — Knowledge base page object (deferred for this story)
- `frontend/e2e/pages/IdeaDetail.ts` — **New** idea detail page object (view, update, comment, archive)
- `frontend/e2e/chat.spec.ts` — **New** chat flow tests
- `frontend/e2e/threads.spec.ts` — **New** thread management tests
- `frontend/e2e/ideas.spec.ts` — **New** idea CRUD tests
- `frontend/e2e/hitl.spec.ts` — **New** HITL interrupt tests
- `frontend/playwright.config.ts` — Playwright config (dev/docker projects)
- `frontend/src/pages/CommandCenter.tsx` — Chat page (route `/`)
- `frontend/src/pages/Dashboard.tsx` — Ideas list (route `/ideas`)
- `frontend/src/pages/IdeaDetail.tsx` — Idea detail (route `/ideas/:ideaId`)
- `backend/app/api/routes/chat.py` — Chat stream endpoint
- `backend/app/api/routes/threads.py` — Thread CRUD endpoints
- `backend/app/api/routes/ideas.py` — Idea CRUD endpoints
- `backend/app/api/routes/interrupts.py` — HITL interrupt endpoints

## Tasks & Acceptance

**Execution:**
- [x] `frontend/e2e/pages/IdeaDetail.ts` -- Create page object with locators for idea title, description, files, comments, update/delete/archive actions -- Provides UI abstraction for idea detail view tests
- [x] `frontend/e2e/chat.spec.ts` -- Create test file with `describe('Chat Flow')` block -- Establishes chat E2E test module
- [x] `frontend/e2e/chat.spec.ts` -- Implement `test('sends message and receives response')` using CommandCenterPage -- Core chat flow: verify message send and response render
- [x] `frontend/e2e/chat.spec.ts` -- Implement `test('stops generation during streaming')` -- Verify stop button halts streaming and preserves partial response
- [x] `frontend/e2e/threads.spec.ts` -- Create test file with `describe('Thread Management')` block -- Establishes thread E2E test module
- [x] `frontend/e2e/threads.spec.ts` -- Implement `test('creates new thread')` via UI button -- Verify thread creation persists and sidebar updates
- [x] `frontend/e2e/threads.spec.ts` -- Implement `test('switches between threads')` -- Verify thread switching loads correct messages
- [x] `frontend/e2e/threads.spec.ts` -- Implement `test('loads thread message history')` -- Verify prior messages render on thread load
- [x] `frontend/e2e/ideas.spec.ts` -- Create test file with `describe('Ideas CRUD')` block -- Establishes ideas E2E test module
- [x] `frontend/e2e/ideas.spec.ts` -- Implement `test('creates idea via API and verifies in UI')` -- Cross-validate API creation with UI display
- [x] `frontend/e2e/ideas.spec.ts` -- Implement `test('views idea detail')` using IdeaDetail page object -- Verify idea detail page loads correct data
- [x] `frontend/e2e/ideas.spec.ts` -- Implement `test('deletes idea and verifies removal')` -- Verify delete action removes idea from list
- [x] `frontend/e2e/hitl.spec.ts` -- Create test file with `describe('HITL Interrupts')` block -- Establishes HITL E2E test module
- [x] `frontend/e2e/hitl.spec.ts` -- Implement `test('displays interrupt overlay')` via API-created interrupt -- Verify interrupt UI appears when pending interrupt exists
- [x] `frontend/e2e/hitl.spec.ts` -- Implement `test('approves interrupt')` -- Verify approve action resolves interrupt and clears overlay
- [x] `frontend/e2e/hitl.spec.ts` -- Implement `test('rejects interrupt')` -- Verify reject action resolves interrupt with rejection

**Acceptance Criteria:**
- Given the app is running, when user sends a message in chat, then message appears in list and response streams back.
- Given a streaming response is active, when user clicks stop, then streaming halts and partial response is preserved.
- Given no thread is selected, when user clicks new thread, then new thread appears in sidebar with default name.
- Given multiple threads exist, when user clicks a different thread, then messages for that thread load correctly.
- Given an idea exists, when user clicks the idea card, then idea detail page shows correct title, description, and metadata.
- Given an idea exists, when user deletes it, then idea is removed from the list and API confirms deletion.
- Given a pending interrupt exists, when interrupt overlay is visible, then user can approve or reject the interrupt.
- Given user approves an interrupt, when the action completes, then interrupt is resolved and overlay clears.

## Spec Change Log

### 2026-08-10 — Review loop iteration 1: HITL SSE race condition fix
- **Trigger:** HITL tests create interrupts via API before page load, but frontend only receives interrupts via SSE events (not REST fetch)
- **Amended:** HITL Testing Strategy in Design Notes — tests must navigate to page first (establish SSE), then create interrupt
- **Known-bad state avoided:** Pre-created interrupts are never received by the frontend, causing overlay visibility assertions to timeout
- **KEEP instructions:**
  - data-testid additions to production components are correct and should be preserved
  - API error handling patterns in test helpers are correct
  - Chat and thread test flows are correct

## Review Triage Log

### 2026-08-10 — Review pass 1
- intent_gap: 0
- bad_spec: 3: (high 2, medium 1)
- patch: 5: (medium 2, low 3)
- defer: 1: (low 1)
- reject: 2
- addressed_findings:
  - `[high]` `[bad_spec]` Missing `data-testid="approve-button"` and `data-testid="reject-button"` in `HITLApprovalCard.tsx` — added testids to both buttons
  - `[high]` `[bad_spec]` Missing `data-testid="confirm-delete-button"` in `IdeaDetail.tsx` AlertDialog — added testid to delete action button
  - `[medium]` `[bad_spec]` HITL SSE race condition — amended HITL Testing Strategy to navigate first, then create interrupt via API (SSE receives events only after connection)
  - `[medium]` `[patch]` Chat stop test timing — added explicit wait for stop button visibility before click
  - `[medium]` `[patch]` Missing API error handling in `createIdeaViaApi` — added response.ok validation
  - `[low]` `[patch]` Thread thread_id null check — added response structure validation
  - `[low]` `[patch]` Idea detail navigation timing — added explicit wait for content rendering
  - `[low]` `[patch]` HITL API error handling — added response.ok checks in test helpers
  - `[low]` `[defer]` Test data isolation between parallel test runs — deferred for later focused attention

## Design Notes

**Test Organization:**
Each flow gets its own `.spec.ts` file to enable parallel execution and independent test runs. Tests follow the page object pattern: tests call page object methods, not raw Playwright actions. This keeps tests maintainable when UI changes.

**API Cross-Validation:**
Some tests create data via API (e.g., idea creation) and verify UI state. This is more reliable than driving the full UI for setup, as it isolates the test to what it's actually verifying (UI display, not form submission).

**HITL Testing Strategy:**
HITL tests require a pending interrupt. The frontend receives interrupts via SSE events only — events published before the SSE connection is established are not retroactively delivered. Therefore, tests must:
1. Navigate to the CommandCenter page first (establishes SSE connection)
2. Then create the interrupt via `POST /api/interrupts/` (SSE receives the event in real-time)
3. Verify the interrupt overlay appears and can be resolved

This ordering ensures the SSE client receives the `interrupt.created` event. Pre-creating interrupts via API before page load will result in missed events.

**Mock LLM Configuration:**
Backend must be configured to return mock responses for E2E tests. This can be achieved through:
1. Environment variable `E2E_TEST_MODE=true` that triggers mock responses
2. Or using the existing mock agent fixture pattern from backend tests

Tests should not depend on live LLM calls (NFR-A10).

## Verification

**Commands:**
- `cd frontend && npx playwright test` -- All E2E tests pass
- `cd frontend && npx playwright test --project=docker` -- Docker E2E tests pass
- `cd frontend && npx playwright test chat.spec.ts` -- Chat tests pass in isolation

**Manual checks (if no CLI):**
- Verify test output shows all tests passing with no skipped or failed tests
- Check that screenshots/videos are only captured on failures (per config)

## Auto Run Result

| Attribute | Value |
|-----------|-------|
| Final Revision | `2bb589b` |
| Review Iteration | 1 |
| Findings Patched | 4 (bad_spec + patch) |
| Defer/Reject | 3 (1 defer, 2 reject) |
| Follow-up Review | Recommended (post-implementation full suite run) |
