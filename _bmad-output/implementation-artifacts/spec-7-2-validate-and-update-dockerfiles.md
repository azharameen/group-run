---
title: '7-2-validate-and-update-dockerfiles'
type: 'chore'
created: '2026-08-10'
status: 'done'
baseline_revision: 'c1868be5d5076537554c99aeb8c4bd610161ed64'
final_revision: 'deepagent-migration'
review_loop_iteration: 1
followup_review_recommended: false
context: ['_bmad-output/implementation-artifacts/epic-7-context.md']
warnings: []
---

<intent-contract>

## Intent

**Problem:** Dockerfiles and docker-compose.yml were created before the LangGraph/DeepAgents migration and are missing critical environment variables (`LANGGRAPH_STRICT_MSGPACK`, `APP_ROOT_DIR`), have outdated dependency versions, and may not build with the current codebase structure. Without validated Dockerfiles, the application cannot be reliably deployed via `docker-compose up`.

**Approach:** Validate and update both Dockerfiles and docker-compose.yml to reflect the current dependency structure, required environment variables, and application architecture. Verify builds succeed and containers start correctly.

## Boundaries & Constraints

**Always:**
- Backend must set `LANGGRAPH_STRICT_MSGPACK=true` (NFR-A5, config.py enforces this)
- Backend must set `APP_ROOT_DIR=/app` (NFR-A2, config.py uses this for path resolution)
- Frontend must build with `VITE_API_URL` pointing to backend service
- Docker Compose must start both services with `docker-compose up`
- Volume mounts must preserve data persistence (workspace, knowledge-base, config)
- Use multi-stage builds for frontend to minimize image size

**Block If:**
- Backend Dockerfile fails to build due to missing system dependencies
- Frontend build fails due to environment variable requirements
- Docker Compose services cannot communicate (nginx proxy misconfiguration)

**Never:**
- Change application code to work around Docker issues
- Add new services beyond frontend and backend
- Modify test configurations in this story
- Change CI pipeline (covered by ST-7.1)

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Fresh build | Clean clone, `docker-compose up --build` | Both services build and start successfully | Build fails with clear error message |
| Missing env vars | No `.env` file | Backend starts with warnings, uses defaults | Config.py warns on missing LANGGRAPH_STRICT_MSGPACK |
| Volume persistence | Data in workspace/ | Data persists across container restarts | Missing volume mount causes data loss |
| Service communication | Frontend requests /api/ | Request proxied to backend:8000 | 502 error if backend unreachable |
| Health check | GET /health | Returns 200 OK | Service fails health check |

</intent-contract>

## Code Map

- `backend/Dockerfile` -- Backend container image definition
- `frontend/Dockerfile` -- Frontend container image definition (multi-stage)
- `docker-compose.yml` -- Service orchestration, volumes, env vars
- `backend/requirements.txt` -- Python dependencies for backend image
- `backend/app/config.py` -- Environment variable validation (LANGGRAPH_STRICT_MSGPACK, APP_ROOT_DIR)
- `backend/app/main.py` -- FastAPI entry point (app.main:app)
- `backend/app/api/app.py` -- App factory with lifespan and route imports
- `frontend/nginx.conf` -- Nginx reverse proxy config for API and SPA
- `frontend/package.json` -- Node dependencies and build scripts
- `_bmad-output/implementation-artifacts/epic-7-context.md` -- Epic 7 context with NFRs

## Tasks & Acceptance

**Execution:**
- [x] `backend/Dockerfile` -- Add `ENV LANGGRAPH_STRICT_MSGPACK=true` before CMD -- Satisfy NFR-A5 requirement enforced by config.py
- [x] `backend/Dockerfile` -- Add `ENV APP_ROOT_DIR=/app` before CMD -- Satisfy config.py path resolution requirement
- [x] `backend/Dockerfile` -- Verify `requirements.txt` COPY and pip install work with current dependencies
- [x] `backend/Dockerfile` -- Add health check using `/health` endpoint
- [x] `backend/requirements.txt` -- Verify all dependencies are present for current codebase (deepagents, langgraph-checkpoint-sqlite, langchain-mcp-adapters, pytest-cov)
- [x] `frontend/Dockerfile` -- Add `VITE_API_URL` build argument for correct API endpoint
- [x] `frontend/Dockerfile` -- Verify multi-stage build works with current Vite/TypeScript setup
- [x] `frontend/nginx.conf` -- Verify API proxy points to `backend:8000` (correct for Docker network)
- [x] `frontend/nginx.conf` -- Verify WebSocket/SSE support headers for streaming
- [x] `docker-compose.yml` -- Verify `APP_ROOT_DIR=/app` is set in backend environment
- [x] `docker-compose.yml` -- Verify `VITE_API_URL` is set for frontend build
- [x] `docker-compose.yml` -- Verify volume mounts match backend expectations (workspace, knowledge-base, config, instructions)
- [x] `docker-compose.yml` -- Add health checks for both services
- [x] `docker-compose.yml` -- Verify service dependency order (frontend depends_on backend)

**Acceptance Criteria:**
- Given a fresh clone of the repository, when running `docker-compose up --build`, then both services build and start successfully within 5 minutes.
- Given the backend container is running, when accessing `/health` endpoint, then it returns 200 OK.
- Given the frontend container is running, when accessing the root path, then it serves the SPA correctly.
- Given the frontend makes an API request, when the request hits `/api/`, then it is proxied to backend:8000 and returns a response.
- Given `LANGGRAPH_STRICT_MSGPACK=true` is set in backend container, when the app starts, then config.py validation passes without errors.
- Given `APP_ROOT_DIR=/app` is set in backend container, when the app writes to workspace/, then files are persisted in the mounted volume.

## Spec Change Log

- [2026-08-10] **Review Loop #1:** 3 patches applied from adversarial review — npm ci for reproducible builds, backend start_period 5s→30s for Python startup, VITE_API_URL default in ARG
- [2026-08-10] **Deferred:** pytest in production image (multi-stage optimization), VITE_API_URL localhost limitation (SPA architecture), DB dependency health check (out of scope), healthcheck documentation (ST-7.7)

## Review Triage Log

**Review:** 2026-08-10 — Adversarial review (Blind Hunter + Edge Case Hunter) — 34 raw findings → 17 unique after dedup

### Findings Summary

| Category | Count | Severity |
|----------|-------|----------|
| patch | 3 | 2 medium, 1 low |
| bad_spec | 1 | 1 medium |
| defer | 4 | 2 medium, 2 low |
| reject | 9 | — |

### Patch Applied (3)

1. **npm install → npm ci** `[medium]` — Frontend Dockerfile was using `npm install` which allows dependency drift. Changed to `npm ci` for reproducible builds.
2. **Backend start_period 5s → 30s** `[medium]` — Python + FastAPI + LangGraph startup needs more than 5 seconds. Docker Compose healthcheck start_period increased to 30s.
3. **VITE_API_URL ARG default** `[low]` — ARG had no default, leaving VITE_API_URL empty in direct `docker build`. Added `${VITE_API_URL:-/api/}` default.

### Bad Spec (1)

4. **Frontend healthcheck verifies only nginx, not API proxy** `[medium]` — Frontend healthcheck (`wget -q --spider http://localhost:80/`) only verifies nginx serves HTML, not that API proxy to backend:8000 works. **Decision:** Accept as-is — API connectivity is validated by frontend e2e tests, not container health checks. Health check purpose is startup verification, not runtime dependency verification.

### Deferred (4)

5. **pytest packages in production image** `[medium]` — `pytest>=8.3.4` and `pytest-cov>=5.0.0` installed in production backend image. **Deferral reason:** Multi-stage build optimization is out of scope for validation story. Can be addressed in a Docker optimization epic.
6. **VITE_API_URL localhost for remote clients** `[low]` — Frontend bakes localhost URL; remote clients can't reach backend directly. **Deferral reason:** SPA architecture limitation — client-side code runs in user browser, connects to localhost. Production deployment uses different strategies (same-origin proxy, environment-aware URLs).
7. **Backend healthcheck doesn't verify DB/filesystem deps** `[low]` — `/health` endpoint returns 200 without verifying SQLite, workspace, or MCP connectivity. **Deferral reason:** Health endpoint enhancement is out of scope. Current health check validates HTTP layer, which is sufficient for container orchestration.
8. **Healthcheck documentation** `[low]` — No documentation of healthcheck behavior, start periods, or retry policies. **Deferral reason:** Will be covered in ST-7.7 (CI/CD documentation).

### Rejected (9)

9. **LANGGRAPH_STRICT_MSGPACK hardcoded in Dockerfile** — This is NFR-A5 requirement, correct behavior.
10. **APP_ROOT_DIR=/app hardcoded** — Required for Docker deployment (config.py path resolution).
11. **npm cache cleanup in builder** — Multi-stage build already discards builder layer.
12. **ENV VITE_API_URL unsafe for secrets** — VITE_ prefix is client-side by convention; secrets never go here.
13. **localhost IPv4/IPv6 healthcheck** — Docker networks use IPv4 by default.
14. **depends_on: service_healthy limitations** — Standard Docker Compose behavior; startup-only guarantee is expected.
15. **Dockerfile and compose duplicate healthchecks** — Configuration drift risk is acceptable; Dockerfile healthcheck is the source of truth, compose overrides are documentation.
16. **curl increases backend image size** — ~10MB tradeoff for health check capability is acceptable.
17. **apt-get not version-pinned** — Standard Docker practice; package versions are managed by distro releases.

## Design Notes

**Backend Dockerfile:**
- Uses `python:3.12-slim` base image (matches CI Python version)
- `APP_ROOT_DIR=/app` is critical: inside container, `app/` is at `/app/app/`, so `ROOT_DIR` resolves to `/app` instead of `/`
- `LANGGRAPH_STRICT_MSGPACK=true` is validated by config.py line 48 — without it, startup fails
- Health check uses `/health` endpoint from `routes/health.py`

**Frontend Dockerfile:**
- Multi-stage build: builder stage (Node 20) → nginx stage
- `VITE_API_URL` must be set during build as Vite bakes env vars into the bundle
- nginx.conf proxies `/api/` to `backend:8000` with WebSocket/SSE support
- nginx.conf uses `try_files` for SPA fallback

**Docker Compose:**
- 2 services only (NFR-A2): frontend + backend
- Volume mounts ensure data persistence across container restarts
- `depends_on` ensures backend starts before frontend
- Health checks provide startup verification (backend: 30s start_period for Python startup, frontend: 5s is sufficient for nginx)
- `npm ci` used in frontend Dockerfile for reproducible builds

## Verification

**Commands:**
- `docker-compose up --build` -- expected: both services build and start, logs show successful startup
- `docker-compose ps` -- expected: both services show "Up" status
- `curl http://localhost:8000/health` -- expected: 200 OK response
- `curl http://localhost:3000` -- expected: HTML response with SPA content
- `docker-compose down` -- expected: clean shutdown, no orphaned containers
