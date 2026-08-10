# Epic 7 Context: Production Readiness

<!-- Generated from planning artifacts. Regenerate with compile-epic-context if planning docs change. -->

## Goal

Make the Companion application production-ready: deployable via Docker Compose, verified by an automated CI pipeline, and validated with end-to-end tests and performance benchmarks. This epic transforms the codebase from a working development artifact into something that can be reliably cloned, built, tested, and deployed by any developer or CI system.

## Stories

- Story 7.1: Set up CI pipeline — GitHub Actions with lint, test, forbidden import check, and build gates
- Story 7.2: Validate and update Dockerfiles for new dependency structure
- Story 7.3: Set up Playwright for E2E testing
- Story 7.4: SQLite concurrency tests — verify database works under concurrent SSE streams
- Story 7.5: Write E2E tests for critical flows (chat, threads, ideas, HITL)
- Story 7.6: Performance validation (API response times, SSE latency)
- Story 7.7: Update project documentation

## Requirements & Constraints

- **2-Service Deployment**: The application must deploy as exactly two services — Frontend (Next.js) and Backend (FastAPI) — via `docker-compose up` (NFR-A2).
- **File Size Limits**: Routes must be under 150 lines, services under 200 lines (NFR-A9). CI must enforce this.
- **Forbidden Import Check**: CI must fail if any dead module is imported (e.g., `state/`, `scoring/`, `research/`, `scheduler.py`, `orchestrator/`, `models/siemens.py`, `llm/execution_support.py`, `llm/subagent_executor.py`, `application/queries/workflow_status.py`, `api/routes/workflow.py`, `api/routes/approval.py`, `api/routes/config.py`, `api/routes/streaming.py`) (NFR-A12).
- **Test Database Isolation**: All tests must use in-memory SQLite, never hit the real database (NFR-A13).
- **Mock LLM Boundary**: Tests must NEVER depend on live model calls (NFR-A10).
- **SQLite Concurrency**: The system must handle concurrent SSE streams without "database is locked" errors (NFR-A14). `SqliteSaver` is a single global singleton — creating new connections causes lock failures.
- **Testing Stack**: pytest (backend) + Vitest (frontend unit) + Playwright (E2E) (NFR-A11).
- **Docker Requirements**: Docker 24.x+, Docker Compose 2.x, SQLite 3.x.
- **App Root**: `APP_ROOT_DIR` env var pins workspace root in Docker. Never use `pathlib.Path(__file__).parent` for workspace resolution.
- **MSGPACK**: `LANGGRAPH_STRICT_MSGPACK=true` must be set in production Dockerfiles.

## Technical Decisions

- **Architecture**: 2-service split (frontend + backend) sharing a SQLite database via volume mount.
- **CI Pipeline**: GitHub Actions is the preferred CI system. The pipeline must include:
  - Lint checks (ruff for Python, ESLint for TypeScript)
  - Type checking (MyPy for Python, TypeScript compiler)
  - Unit tests (pytest + Vitest)
  - Forbidden import check
  - Build verification (both services must build)
- **E2E Strategy**: Playwright for browser-based end-to-end tests covering critical user flows: chat, threads, ideas, and HITL approvals.
- **Performance Targets**: API response times and SSE latency must be measured and documented. No specific SLA yet — establish baselines.
- **Deployment Model**: Docker Compose for local and staging. No Kubernetes or cloud deployment in scope.

## Cross-Story Dependencies

- **CI Pipeline (ST-7.1) first**: The CI pipeline is the foundation — it should run the lint, test, and build gates that subsequent stories depend on.
- **Dockerfiles (ST-7.2) depend on ST-7.1**: Docker build should be a CI gate once Dockerfiles are validated.
- **E2E Setup (ST-7.3) before E2E Tests (ST-7.5)**: Playwright must be configured before writing E2E test cases.
- **Concurrency Tests (ST-7.4) independent**: Can run in parallel with other stories.
- **Performance (ST-7.6) last**: Best done after all other stories to get accurate baselines.
- **Documentation (ST-7.7) last**: Updates should reflect the final state of CI, Docker, E2E, and performance.
- **Foundation**: All stories assume the core application is functional from Epics 0-6.
