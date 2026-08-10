# Performance Baseline

> **Story 7.6** — Performance validation tests and baseline documentation.
> These measurements use **mock LLM responses** (NFR-A10) and **in-memory SQLite** (NFR-A13).
> They are informational baselines — no hard SLAs are enforced.

## Test Environment

- **Date:** 2026-08-10
- **Python version:** 3.13.5
- **Node version:** v22.17.1
- **SQLite version:** 3.49.1
- **Mock LLM enabled:** yes
- **Database:** In-memory SQLite (`:memory:` with `check_same_thread=False`)
- **Test framework:** pytest 8.x + pytest-asyncio
- **E2E framework:** Playwright (dev project, Vite dev server)

## How to Reproduce

```powershell
# Backend API performance tests
cd backend
python -m pytest tests/test_api_performance.py -v --tb=short

# Backend SSE latency tests
python -m pytest tests/test_sse_latency.py -v --tb=short

# Frontend E2E performance tests (requires dev server + backend running)
cd frontend
npx playwright test performance.spec.ts --project=dev
```

## API Response Times (mock LLM, in-memory SQLite)

### Chat Stream (`POST /api/chat/stream`)

| Metric | p50 | p95 |
|--------|-----|-----|
| Time to first byte | — ms | — ms |
| Full stream duration | — ms | — ms |
| Server process time (X-Process-Time header) | — ms | — ms |

**Notes:**
- Uses mock supervisor graph that yields one `state_update` event
- First-byte timing approximated via `X-Process-Time` response header
- Full stream includes generator completion and response buffering

### Thread CRUD

| Endpoint | p50 | p95 |
|----------|-----|-----|
| `GET /api/threads` (5 threads) | — ms | — ms |
| `POST /api/threads` | — ms | — ms |

**Notes:**
- Thread list tested with pre-seeded threads (5-10 items)
- Thread create includes in-memory SQLite write

### Interrupt Approval

| Endpoint | p50 | p95 |
|----------|-----|-----|
| `PATCH /api/interrupts/{id}/approve` | — ms | — ms |

**Notes:**
- Each iteration creates a new interrupt then approves it
- Uses in-memory SQLite for interrupt persistence

### Ideas List

| Endpoint | p50 | p95 |
|----------|-----|-----|
| `GET /api/ideas` (10 items) | — ms | — ms |
| `POST /api/ideas` | — ms | — ms |

**Notes:**
- Ideas list tested with 10 pre-seeded ideas
- Filesystem-backed (temp directory in tests)

## SSE Performance

| Metric | Value |
|--------|-------|
| Publish to queue latency (p50) | — ms |
| Publish to queue latency (p95) | — ms |
| Concurrent clients (10): all delivered | yes |
| Dead client eviction | verified |
| Queue saturation handling | verified |
| Database lock errors under concurrency | 0 |

**Notes:**
- SSE uses `asyncio.Queue` — no SQLite involved in publish path
- 10 concurrent clients tested with 5 events each
- Queue saturation triggers dead client eviction (>256 messages)
- Mixed DB+SSE concurrency test confirms no lock contention

## Timing Middleware

- **Header:** `X-Process-Time` (millisecond duration, 2 decimal places)
- **Skipped endpoints:** `/api/sse` (streaming — middleware would block)
- **Log level:** DEBUG (`Request METHOD PATH completed in Xms`)
- **Verified on all non-SSE endpoints:** yes

## E2E Performance (Playwright)

| Scenario | Measured |
|----------|----------|
| Chat first response time | — ms |
| Thread list page load (10 threads) | — ms |
| Thread switch latency (avg) | — ms |
| Interrupt approval API time | — ms |
| Ideas list API time (avg) | — ms |

**Notes:**
- E2E tests use `Date.now()` for client-side timing
- Includes page.metrics() baseline capture (TBT, JS heap)
- Results vary based on machine load; run multiple times for stability

## Methodology

1. **Iterations:** Each endpoint is called 5 times to capture distribution
2. **Percentiles:** p50 (median) and p95 (95th percentile) reported
3. **Warm-up:** First iteration serves as warm-up (Python imports, JIT)
4. **Mock LLM:** All tests use `AsyncMock` supervisor graph — no network calls
5. **In-memory DB:** `sqlite3.connect(":memory:")` — no disk I/O
6. **Isolation:** Module cache cleared between test groups

## Future Improvements

- [ ] Add load testing with concurrent requests (e.g., `httpx.AsyncClient` + `asyncio.gather`)
- [ ] Track metrics over time in CI (store baseline in artifact)
- [ ] Add frontend bundle size tracking
- [ ] Measure database query counts per endpoint
- [ ] Add CPU/memory profiling for long-running operations

## Appendix: Test File Locations

| Test Suite | File |
|-----------|------|
| API performance | `backend/tests/test_api_performance.py` |
| SSE latency | `backend/tests/test_sse_latency.py` |
| E2E performance | `frontend/e2e/performance.spec.ts` |
| Perf fixtures | `backend/tests/fixtures/perf.py` |
| Timing middleware | `backend/app/api/app.py` (TimingMiddleware class) |
