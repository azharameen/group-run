# Jules Task Queue — Sprint 2

> **Purpose:** Self-contained, copy-paste-ready tasks for the [Google Jules agent](https://jules.google/docs).
> Jules has **no BMAD skills and no project memory** — every block below is written to be understood
> in isolation. Copy ONE block, paste it into a Jules task, and it produces ONE pull request.

## How to use this file

1. Pick a task by priority (P0 → P3).
2. Copy the entire `## JQ-NN` block (from the header to its "Out of scope" line).
3. Paste it as the prompt for a new Jules task on this repository.
4. Jules opens a branch and a PR targeting `develop`. **You review and merge — never auto-merge.**
5. After merge, mark the block `[DONE]` here and tick the matching item in `deferred-work.md`.

## Ground rules baked into every task

- **Branch naming:** `fix/jq-NN-<slug>` or `chore/jq-NN-<slug>` → PR to `develop`.
- **Commit format:** `type(scope): description` (scope required: `backend`, `frontend`, `agent`, `config`, `docs`).
- **Never commit directly to `main` or `develop`.**
- **Verify before acting:** the ledger may contain stale items. If the defect no longer exists,
  close the PR as "already resolved" with a one-line note — do NOT invent a change.
- **One task = one PR = one concern.** Do not bundle unrelated fixes.
- **Do not touch deprecated modules:** `models/`, `state/`, `scoring/`, `orchestrator/`, `storage/`.
- **Do not add credentials, shell/code-runner tools, or a sandboxed execution model.**

---

## P0 — Correctness (do first)

## JQ-01 [P0] Verify/fix missing import in chat route (NameError)
**Source:** `deferred-work.md` — code review of 1.x (chat stream)
**Branch:** `fix/jq-01-chat-import` → PR to `develop`
**Context:** A prior review flagged a possible undefined name (NameError) around line 69 of the chat
stream route. The file is `backend/app/api/routes/chat.py`. The codebase has changed since the review,
so this may already be fixed.
**First verify:**
1. Open `backend/app/api/routes/chat.py`.
2. Run `python -c "import backend.app.api.routes.chat"` from the `backend/` directory.
3. If it imports cleanly and no undefined name is referenced, the item is already resolved.
**Do (only if a real NameError exists):**
1. Identify the undefined name and the module that defines it.
2. Add the single missing import.
3. Change nothing else.
**Pass when:**
- `python -c "import backend.app.api.routes.chat"` succeeds.
- `pytest backend/tests -k chat` passes.
- No other files modified.
**Out of scope:** Refactoring the stream generator, changing SSE event shape, touching the supervisor.

---

## P1 — Test gaps (CI is the gate; all additive, no production-code changes)

## JQ-02 [P1] CRUD tests: assert response payload, not just status codes
**Source:** `deferred-work.md` — code review of 3-4-backend-tests-ideas-crud-workspace-files
**Branch:** `fix/jq-02-crud-payload-tests` → PR to `develop`
**Context:** The ideas CRUD tests assert HTTP status codes (200) but do not verify response body
fields. A regression that returns an empty or wrong body would slip through.
**First verify:** Confirm the tests exist under `backend/tests/` (search for `test_create_with_title`,
`test_delete_existing`, `test_archive_existing`, `test_list_with_data`). If they already assert body
fields, close as resolved.
**Do:**
1. In `test_create_with_title`, assert the response body contains the expected `idea_id` and `title`.
2. In `test_delete_existing` / `test_archive_existing`, assert the body carries the expected
   confirmation fields (e.g. `message`, `archive_path`).
3. In `test_list_with_data`, assert the returned list contains the created idea's `idea_id` and `title`,
   not just `count == 1`.
4. Add a post-CRUD consistency check: after create, the idea appears in the registry/`idea.yaml`;
   after delete, it is removed.
**Pass when:**
- New/updated assertions pass.
- Full `pytest backend/tests` is green.
- No production (non-test) code changed.
**Out of scope:** Adding new endpoints, changing API response shapes.

## JQ-03 [P1] Malformed idea_id validation tests on mutating paths
**Source:** `deferred-work.md` — code review of 3-4-backend-tests-ideas-crud-workspace-files
**Branch:** `fix/jq-03-malformed-idea-id-tests` → PR to `develop`
**Context:** Only GET paths test malformed `idea_id`. The mutating paths
(`POST /ideas/{idea_id}/update`, `DELETE /ideas/{idea_id}`, `POST /ideas/{idea_id}/archive`,
`POST /ideas/{idea_id}/comment`) are untested for invalid IDs.
**First verify:** Confirm these routes exist and that no malformed-ID test already covers them.
**Do:**
1. Add parametrized tests sending malformed `idea_id` values (empty, non-UUID, path-traversal-like)
   to each mutating path.
2. Assert the API returns a clean 4xx (not 500) with a sensible error body.
**Pass when:**
- New tests pass and the full backend suite is green.
- No production code changed unless a route currently 500s on a malformed ID — if so, fix the
  validation and note it in the PR description.
**Out of scope:** Changing valid-ID behavior, adding auth.

## JQ-04 [P1] Interrupt edge-case tests (concurrency, non-serializable input)
**Source:** `deferred-work.md` — code review of 4-1-create-interrupt-management-service
**Branch:** `fix/jq-04-interrupt-edge-tests` → PR to `develop`
**Context:** Interrupt tests cover happy paths but lack concurrency (approve/reject race),
non-serializable `tool_input`, and empty-message / oversized-payload validation.
**First verify:** Locate the interrupt service tests (search `test_interrupt`). Confirm the gaps.
**Do:**
1. Add a test that a non-serializable `tool_input` is rejected cleanly (4xx, not 500).
2. Add a test that an empty message is rejected.
3. Add a concurrency test: two simultaneous approve/reject on the same interrupt — exactly one wins,
   the other gets a clean conflict (409).
**Pass when:**
- New tests pass; full backend suite green.
- No production code changed unless a case currently 500s — if so, fix and note it.
**Out of scope:** Changing the interrupt state machine, DB schema changes.

## JQ-05 [P1] SSE bridge integration test (verify real SSE frames)
**Source:** `deferred-work.md` — code review of 4-2-create-sse-bridge-for-interrupt-events
**Branch:** `fix/jq-05-sse-bridge-test` → PR to `develop`
**Context:** The SSE endpoint test checks the return type but not that the bridge actually yields
SSE-formatted frames. `StreamBus` has its own tests, but the bridge-level integration is untested.
**First verify:** Find the SSE bridge test (search `test_sse_endpoint`). Confirm it does not assert frame content.
**Do:**
1. Add a test that subscribes through the bridge and asserts the emitted strings are valid SSE frames
   (`data: {...}\n\n`) with the expected event payload.
**Pass when:**
- New test passes; full backend suite green.
- No production code changed.
**Out of scope:** Changing the SSE frame format, StreamBus internals.

## JQ-06 [P1] Interrupt route tests: error bodies, cross-resolution, DB persistence
**Source:** `deferred-work.md` — code review of 4-3-api-route-tests-for-interrupt-endpoints
**Branch:** `fix/jq-06-interrupt-route-tests` → PR to `develop`
**Context:** Route tests check status codes but not error bodies; cross-resolution conflicts
(approve→reject, reject→approve) are untested; persistence after approve/reject is not verified;
malformed (non-UUID) interrupt IDs are not distinguished from valid-but-absent IDs.
**First verify:** Locate interrupt route tests (search `test_interrupt_routes`). Confirm the gaps.
**Do:**
1. Assert error response bodies (404/409) contain the expected fields, not just the status code.
2. Add cross-resolution tests: approve then reject (and the reverse) — second call returns 409.
3. Add a test that after approve/reject the interrupt is persisted as resolved in the DB.
4. Add a malformed-ID test distinguishing non-UUID from valid-but-absent.
**Pass when:**
- New tests pass; full backend suite green.
- No production code changed unless a case currently misbehaves — if so, fix and note it.
**Out of scope:** Changing endpoint contracts, adding auth.

## JQ-07 [P1] Partial SSE frame retry/backoff on disconnect (frontend)
**Source:** `deferred-work.md` — Epic 5 kickoff triage (Story 1.9)
**Branch:** `fix/jq-07-sse-retry-backoff` → PR to `develop`
**Context:** When the SSE connection drops mid-stream, partial frames are dropped with no retry/backoff.
`EventSource` auto-reconnects, but the app should not assume a stream is complete on drop.
**First verify:** Inspect `frontend/src` for the SSE/EventSource consumer (search `EventSource`,
`useChatStream`). Confirm there is no explicit retry/backoff or partial-frame handling.
**Do:**
1. Add bounded retry with exponential backoff + jitter on SSE connection loss.
2. On reconnect, reconcile state (do not duplicate already-received messages).
3. Keep it minimal — do not rewrite the streaming hook.
**Pass when:**
- A new/updated frontend test simulates a mid-stream disconnect and asserts reconnection + no duplicates.
- `npm test` (frontend) is green.
**Out of scope:** Rewriting `useChatStream`, changing the message data model.

---

## P2 — Refactors (bounded, guarded by existing tests)

## JQ-08 [P2] SQLite shared-connection concurrency safety
**Source:** `deferred-work.md` — Post-Epic 6 audit (backend)
**Branch:** `refactor/jq-08-sqlite-connection` → PR to `develop`
**Context:** A single global SQLite connection is opened with `check_same_thread=False`
(see `backend/app/services/thread_manager.py` and `backend/app/services/interrupt_service.py`).
This is not safely concurrent under load and can cause `database is locked`.
**First verify:** Confirm the shared-connection pattern still exists (search `check_same_thread`).
**Do:**
1. Introduce a connection-per-operation or a properly guarded connection pool with a busy timeout.
2. Keep the existing public API of the services unchanged.
3. Ensure WAL mode remains enabled.
**Pass when:**
- `pytest backend/tests -k "concurrency or thread or interrupt"` is green.
- Full backend suite green.
- No public API signature changes.
**Out of scope:** Migrating off SQLite, changing the checkpointer (see project rule: one checkpointer
connection created at startup — do NOT reintroduce `AsyncSqliteSaver`).

## JQ-09 [P2] Frontend testid coupling → role/label selectors
**Source:** `deferred-work.md` — CI pipeline hardening
**Branch:** `refactor/jq-09-testid-selectors` → PR to `develop`
**Context:** `frontend/src/__tests__/IdeaDetail.test.tsx` and `DocumentUploadCard.test.tsx` rely on
mock `data-testid` attributes; when real components change testids, tests break silently.
**First verify:** Confirm the tests still select by `data-testid` on mocked components.
**Do:**
1. Replace `data-testid` selectors with role/label/text selectors where the real component exposes them.
2. Where a stable hook is genuinely needed, keep a single documented `data-testid` on the real component.
**Pass when:**
- Affected tests pass using the new selectors.
- `npm test` (frontend) green.
**Out of scope:** Changing component behavior, adding snapshot testing framework.

## JQ-10 [P2] MCP config validation: schema_version + server fields
**Source:** `deferred-work.md` — code review of 5-3-update-mcp-tool-loading
**Branch:** `fix/jq-10-mcp-config-validation` → PR to `develop`
**Context:** `_validate_mcp_config()` now calls a schema validator but still does not check
`schema_version` or individual server object fields, so `reload-mcp` can return 200 for a config that
`_load_mcp_tools()` later rejects.
**First verify:** Locate `_validate_mcp_config` (search in `backend/app/agent/`). Confirm the gap.
**Do:**
1. Extend validation to check `schema_version` and required server object fields.
2. Return a clean 4xx with a specific message on invalid config.
3. Add tests for each invalid case.
**Pass when:**
- New validation tests pass; full backend suite green.
- Valid configs still load unchanged.
**Out of scope:** Changing the MCP transport, adding new server types.

---

## P3 — Docs / dead code (zero-risk, trivially verifiable)

## JQ-11 [P3] Remove/document dead VITE_API_URL env var
**Source:** `deferred-work.md` — spec-7-7-update-project-documentation
**Branch:** `chore/jq-11-vite-api-url` → PR to `develop`
**Context:** `VITE_API_URL` is documented and set in `frontend/Dockerfile` but has no runtime consumer
(the frontend uses the Vite dev proxy and nginx for Docker). It is dead configuration.
**First verify:** Confirm no `import.meta.env.VITE_API_URL` consumer exists in `frontend/src`.
**Do:**
1. Either remove `VITE_API_URL` from `frontend/Dockerfile` and the README, OR add a one-line note in the
   README that it is reserved/unused. Prefer removal if truly unused.
**Pass when:**
- `npm run build` (frontend) succeeds.
- No runtime behavior change.
**Out of scope:** Changing the proxy/nginx config.

## JQ-12 [P3] Define or remove undefined NFR-A10/A12/A13 references
**Source:** `deferred-work.md` — spec-7-7-update-project-documentation
**Branch:** `chore/jq-12-nfr-refs` → PR to `develop`
**Context:** `backend/README.md` references NFR-A10, NFR-A12, NFR-A13 but no document defines these
identifiers.
**First verify:** Confirm the references exist and are undefined.
**Do:**
1. Either add the definitions to the appropriate architecture/NFR doc, or remove the dangling references.
**Pass when:**
- Every NFR identifier referenced in `backend/README.md` resolves to a definition.
**Out of scope:** Rewriting the architecture doc.

## JQ-13 [P3] Document AsyncSqliteSaver status
**Source:** `deferred-work.md` — spec-7-7-update-project-documentation
**Branch:** `chore/jq-13-async-sqlite-docs` → PR to `develop`
**Context:** Docs describe the checkpointer as a sync-only `SqliteSaver` singleton, but the codebase
history includes `AsyncSqliteSaver`. Project rule: `AsyncSqliteSaver` was reverted and must NOT be
reintroduced.
**First verify:** Confirm `AsyncSqliteSaver` is not actively used (search the backend).
**Do:**
1. Add a one-line note in the checkpointer docs stating the sync `SqliteSaver` is the only supported
   checkpointer and `AsyncSqliteSaver` is intentionally not used.
**Pass when:**
- The doc statement matches the code (no active `AsyncSqliteSaver` usage).
**Out of scope:** Any code change.

---

## Explicitly NOT in the Jules queue (local-agent / blocked)

| Item | Executor | Reason |
|---|---|---|
| Runner.py LangGraph migration (`runner.py:552` TODO) | Local agent | Architectural — needs a dedicated BMAD story |
| Recharts 2.x → v3 migration | Local agent | Breaking changes, coordinated frontend update |
| Unauthenticated `POST /api/config/reload` | Blocked | Needs auth infrastructure (Epic 8 scope) first |
| Duplicate SSE subscriptions (InterruptInbox + useChatStream) | Local agent | Architectural decision, not a cleanup |
| 18 thread tests failing in full suite (aiosqlite event-loop isolation) | Local agent | Known framework limitation; needs test-infra design |
