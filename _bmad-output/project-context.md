---
project_name: 'Companion'
user_name: 'Ameen'
date: '2026-08-13'
sections_completed:
  ['technology_stack', 'language_specific', 'framework_specific', 'testing', 'code_quality', 'development_workflow', 'branch_management', 'critical_dont_miss']
status: 'complete'
rule_count: 47
optimized_for_llm: true
---

# Project Context for AI Agents

_This file contains critical rules and patterns that AI agents must follow when implementing code in this project. Focus on unobvious details that agents might otherwise miss._

---

## Technology Stack & Versions

### Core Technologies

- **Backend:** Python 3.13+, FastAPI `>=0.115.6`, Uvicorn `>=0.34.0`
- **Agent Runtime:** DeepAgents `>=0.6.8` (`create_deep_agent`), LangGraph checkpoint-sqlite `>=3.1.1`
- **Frontend:** React `^18.3.1`, Vite `^5.4.0`, TypeScript `^5.5.3` (strict mode)
- **UI:** shadcn/ui (zinc base, lucide icons), Radix UI, Tailwind CSS `^3.4.7`

### Key Dependencies

- `pydantic>=2.10.0` + `pydantic-settings>=2.7.0` — all data models & config
- `langchain-mcp-adapters>=0.3.0` — optional MCP tool loading
- `sse-starlette>=2.2.0` — SSE streaming
- `transitions>=0.9.0` — legacy FSM (being phased out)
- `pytest>=8.0.0`, `pytest-asyncio>=0.24.0`

### Critical Version & Compatibility Invariants

1. **MCP tools bypass the permissions model** (ADR-013) — tools loaded via `MCP_SERVERS` do NOT get `FilesystemBackend` route enforcement. Treat them as untrusted.
2. **Any filesystem-mutating tool must be added to `interrupt_on`** in `agent/runtime.py` — otherwise it bypasses HITL review.
3. **Checkpointer: sync `SqliteSaver`, created once at startup** (not inside request/async context) — avoids both the `RuntimeError: no running event loop` and blocking the event loop. `AsyncSqliteSaver` was reverted; do not reintroduce it.
4. **Deprecated modules are off-limits for new code:** `models/`, `state/`, `scoring/`, `orchestrator/`, `storage/` (Siemens FSM being phased out in Phase 4).
5. **`astream_events(version="v3")`** is the streaming contract (ADR-012) — don't write v2-only consumers; graceful v2 fallback only.
6. **Never hardcode paths** — use `ROOT_DIR`/`WORKSPACE_DIR`/`CONFIG_DIR` from `config.py`. `APP_ROOT_DIR` pins the root in Docker (path-depth differs from local; wrong resolution writes outside mounted volumes and data vanishes on restart).

---

## Critical Implementation Rules

### Language-Specific Rules

#### Python (Backend)

1. **🚫 NEVER fabricate output.** Never silently convert failed agentic output into fabricated success. Every failure is an explicit error/retry state. This is the project's core principle — the reason it exists.
2. **Python 3.13+ idiomatic syntax** — type hints, `|` union syntax, `match` statements. No backports or `from __future__` workarounds.
3. **Set credentials in `os.environ` BEFORE importing LangChain** — `init_chat_model()` reads from env, not pydantic-settings. Import order is a security boundary, not just style. New credential fields go in `Settings` (config.py) AND are propagated to `os.environ`.
4. **Import order:** standard library → third-party → application (see `coding-guidelines.md` §2.2).
5. **PEP 8 with 100-character line limit.**
6. **pydantic v2** for all data models; `pydantic-settings` for configuration.

#### TypeScript (Frontend)

1. **TypeScript strict mode** (enforced in `tsconfig.json`), BUT `noUnusedLocals`/`noUnusedParameters` are deliberately `false` — do NOT "fix" by enabling them.
2. **Path alias `@/*` → `./src/*`** — use `@/components/...`, `@/lib/utils`, etc.
3. **Functional components with hooks** — no class components.
4. **Centralized API client** — use `@/api/client` for REST, `@/api/deepagents` for agent/interrupt calls. Don't scatter raw `fetch` calls.
5. **Frontend error handling mirrors backend** — surface API errors (throw), don't swallow or convert to `null`.
6. **`cn()` utility** from `@/lib/utils` for conditional class merging.

### Framework-Specific Rules

#### React (Frontend)

1. **shadcn/ui components** from `@/components/ui/` — use these, not hand-rolled equivalents.
2. **Radix UI primitives** for complex interactions (dialog, dropdown, tabs, tooltip, etc.).
3. **Tailwind CSS** for styling — no inline styles or CSS modules.
4. **Component structure:** functional components with typed `Props` interface, following the shadcn pattern (see `coding-guidelines.md` §3.2).
5. **SSE streaming via `useDeepAgentStream` hook** — binds to backend `astream_events` output. Don't spin up raw `EventSource` per component (SSE is unidirectional, ~6 concurrent connections/browser on HTTP/1.1 — connection exhaustion risk).

#### FastAPI (Backend)

1. **File-size limits are hard rules:** route files < 150 lines, services/repositories < 200, agent runtime < 200.
2. **API route pattern:** `APIRouter(prefix="/api", tags=[...])` with pydantic `RequestModel`/`ResponseModel` (see `coding-guidelines.md` §2.4).
3. **SSE via `StreamingResponse`** — one `/api/sse` endpoint with event type tagging (ADR-005).
4. **Always use `get_deep_agent_runtime()` factory** in `agent/runtime.py` — never construct `create_deep_agent` ad-hoc (divergent configs).

#### LangGraph / DeepAgents

1. **Threads are the single source of truth** — native LangGraph checkpoints persisted via `SqliteSaver`. Don't invent a parallel thread store; metadata goes in checkpoint metadata.
2. **Supervisor + teams hierarchy** — supervisor routes intents via LLM; teams are DeepAgents sub-graphs.
3. **@mention routing is DEFERRED** — don't build a hard-coded @mention parser; the supervisor handles routing.
4. **New filesystem routes need explicit access mode** — don't default to read/write. `/kb/` and `/skills/` are read-only; `/workspace/` is read/write (CompositeBackend, ADR-003).
5. **`astream_events(version="v3")`** for streaming (see Technology Stack).

### Testing Rules

1. **Framework:** `pytest` + `pytest-asyncio`. Test location: `backend/tests/`, one file per module (e.g., `test_scoring.py`, `test_threads.py`).
2. **Run before commit:** `pytest backend/tests` — all tests must pass.
3. **Mock the LLM/runtime boundary** — tests must NEVER depend on a live model or live MCP server (flaky, slow, costly).
4. **Test the interrupt/resume contract, not the human** — HITL "E2E" means verifying an interrupt is raised, persisted, and resumable.
5. **Use a separate test DB** — don't clobber the dev `checkpoints.db`; the sync `SqliteSaver` connection is created once at startup.
6. **Know your async/sync boundary** — async tests use `pytest.mark.asyncio`; don't mix with the sync checkpointer.
7. **Don't add tests to deprecated modules** (`scoring/`, `state/` FSM, etc.) — new tests go to the LangGraph/thread layer.
8. **Shared fixtures go in `conftest.py`** — don't duplicate setup across test files.
9. **Test structure:** class-based (`TestFeature`) with descriptive methods (`test_happy_path`, `test_error_case`).

### Code Quality & Style Rules

1. **🚫 NO Sandbox Execution (headline rule)** — no shell/code-runner tools, period, until a real sandbox exists. Arbitrary code execution bypasses `FilesystemBackend` route enforcement and is a fabrication vector. File mutation is gated by `interrupt_on`; arbitrary code execution is not allowed at all.
2. **Single Responsibility** — each file has one job (see file-size limits in Framework section).
3. **Provenance on artifacts/events, not every helper** — keep it lean. Trust levels: `generated`, `trusted`, `verified-tool-call`, `fallback`. Tag honestly; the trust tag is an audit trail, not a license to fabricate.
4. **Preserve `snake_case` API contract on the frontend** — backend returns `snake_case` (e.g., `idea_id`, `composite_score`); don't "helpfully" convert to `camelCase` in TS.
5. **Docstrings:** Google-style with `Args:`/`Returns:`; inline comments explain WHY, not WHAT; `# TODO:` for planned work.
6. **Naming:** Python `snake_case`/`PascalCase`; TS `camelCase`/`PascalCase`; test files `test_<module>.py`.

### Development Workflow Rules

1. **Read docs in order before implementing** (`tasks.md` → `features.md` → `architecture.md` → `architecture-decisions.md` → `coding-guidelines.md` → `code-review-guidelines.md` → `prd.md` → `product-context.md`) — not optional.
2. **`[IMPLEMENTED]` requires the code to actually run and pass tests** — not just exist. Never fabricate completion.
3. **Credential documentation chain (4 steps):** add field to `Settings` → propagate to `os.environ` → document in `architecture.md` → document in `coding-guidelines.md`.
4. **Commit format:** `type(scope): description` — scope required (`backend`, `frontend`, `agent`, `config`, `docs`); description imperative, lowercase, no period.
5. **Self-review checklist gate** (`agents.md` §7.1) — never mark `[COMPLETED]` without running it.
6. **Branch-based workflow** — don't commit directly to main; use `feat/`, `fix/`, `refactor/`, `docs/` branches.
7. **Task status markers:** `[PENDING]`, `[IN PROGRESS]`, `[IMPLEMENTED]`, `[COMPLETED]`, `[DEFERRED]`.
8. **Cross-reference rules** — when updating docs, update related cross-references (see `agents.md` §6).
9. **Sprint numbering rule (decision 2026-07-21):** `planning-artifacts/epics.md` always holds the **current sprint's** backlog. When a sprint is delivered, its epic breakdown is archived as `planning-artifacts/sprint-N.md` (e.g., Sprint 1 = EP-0..EP-7 → `sprint-1.md`). **Epic numbers continue across sprints and never restart at 1** (Sprint 2 = EP-8..EP-12). Story IDs follow the epic number (`8-1`, `8-2`, ...). Never overwrite `epics.md` with a renumbered backlog — archive first, then continue the sequence.
10. **Jules delegation rule (decision 2026-07-21, updated to GitHub-issue flow):** User stories (user-visible, multi-file, need product context) are executed by **local agents** via the BMAD story workflow. Small self-contained, verifiable items are delegated to the **Google Jules agent** and tracked as **GitHub issues** (label `jules` + priority label `P0`–`P3` + topic label `tech-debt`/`test-gap`/`refactor`/`docs`, milestone = current sprint). Flow: `deferred-work.md` is the raw **capture ledger** (unchanged) → triage creates a GitHub issue (self-contained body: Context / First verify / Do / Pass when / Out of scope / Branch line — Jules has no BMAD skills or project memory) → copy the issue body as the Jules task prompt → one PR to `develop` → **human review gate, never auto-merge** → merge auto-closes the issue (`Closes #N`) → ledger entry marked RESOLVED. Issues are generated **at triage time, never pre-generated in bulk** beyond known items. Every issue body includes a mandatory "First verify (ledger may be stale)" step. **Jules-eligible topics** (all must hold): self-contained (one concern, one PR, ≤~5 files), objectively verifiable pass/fail, no architectural decisions, not blocked on missing infra, doesn't touch deprecated modules (`models/`, `state/`, `scoring/`, `orchestrator/`, `storage/`). Architectural work (Runner.py LangGraph migration, Recharts v3, SSE subscription consolidation) and auth-blocked items stay out of the Jules queue.
11. **Windows-First Documentation (decision 2026-08-16, Sprint 2):** all documentation ships with Windows alternatives from the first draft; docs PRs are gated on it. Standard lives in `docs/coding-guidelines.md` §6.3 (Epic 7 retrospective item #2).

---

## Branch Management Rules

**CRITICAL: NEVER commit or push directly to `main` or `develop` branches**

All changes MUST go through pull requests. Feature PRs target `develop` only.

### Branch Naming Convention

- **Format:** `feat/<story-key>-<short-description>`
- **Example:** `feat/1-2-update-config-py`
- **Story keys** use the story identifier (e.g., `1-2`, `2-5`)
- For fixes: `fix/<story-key>-<short-description>`
- For refactoring: `refactor/<story-key>-<short-description>`
- For docs: `docs/<story-key>-<short-description>`
- For production emergencies: `hotfix/<issue-description>` — can merge to both `main` and `develop`

### PR Rules

- **One story = one PR** (never share a PR across multiple stories)
- **PR target:** Always `develop` branch (never `main`)
- **Exception:** `hotfix/` branches may target `main` directly, then sync to `develop`
- **PR title format:** `<story-key>: <description>`
- **PR body:** Reference story file and acceptance criteria
- **Main branch is production** — only `develop` or `hotfix/` can merge into `main`

### Commit Message Format

- **Format:** `type(scope): description`
- **Types:** `feat`, `fix`, `chore`, `docs`, `style`, `refactor`, `perf`, `test`
- **Scope examples:** `ci`, `backend`, `frontend`, `e2e`
- **Examples:**
  - `feat(backend): add thread archive endpoint`
  - `fix(ci): correct workflow trigger`
  - `test(e2e): add login flow tests`

### Self-Review Checklist (Before Creating PR)

- [ ] All acceptance criteria met
- [ ] Tests pass locally
- [ ] No console errors or warnings
- [ ] Code follows project conventions
- [ ] Documentation updated if needed
- [ ] No debugging code left behind
- [ ] Branch naming convention followed
- [ ] PR targets `develop` branch

### Critical Don't-Miss Rules

1. **🚫 Never fabricate output** — no silent fallback to fabricated success. The #1 rule of this project.
2. **🚫 Never add credentials directly to code** — use `.env` files and `pydantic-settings`.
3. **🚫 Never build on deprecated modules** — `models/`, `state/`, `scoring/`, `orchestrator/`, `storage/` are being phased out.
4. **🚫 Never add shell/code-runner tools** — sandbox execution is deferred.
5. **Any new filesystem-mutating tool MUST be added to `interrupt_on`** — otherwise it bypasses HITL review (the most likely silent failure).
6. **LangSmith tracing ships prompts/tool calls to an external service** — don't enable `langsmith_enabled` without knowing what's traced; never put secrets in prompts.
7. **One checkpointer connection, created at startup, reused everywhere** — don't create new `SqliteSaver` connections (shared `check_same_thread=False` connection; new ones cause `database is locked`).
8. **`MCP_SERVERS` failures are silently skipped** — invalid JSON or unavailable adapter means tools silently don't load; verify they're actually loaded.
9. **Route all file access through the `CompositeBackend`** — never write to hardcoded absolute paths outside configured routes (containment boundary).
10. **Handle SSE reconnect/partial streams** — EventSource auto-reconnects, but don't assume a stream is complete on connection drop.

---

## Usage Guidelines

**For AI Agents:**

- Read this file before implementing any code
- Follow ALL rules exactly as documented
- When in doubt, prefer the more restrictive option
- Update this file if new patterns emerge

**For Humans:**

- Keep this file lean and focused on agent needs
- Update when technology stack changes
- Review quarterly for outdated rules
- Remove rules that become obvious over time

Last Updated: 2026-08-01
