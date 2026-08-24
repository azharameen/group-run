# Performance Test Design Patterns

This document describes the design patterns, architectural principles, metrics, and execution procedures for performance testing across the Agentic Organization Platform.

______________________________________________________________________

## Overview

Performance validation in this platform is designed to establish reproducible latency and throughput baselines without external dependencies or live LLM network calls. The design prioritizes **deterministic execution**, **isolation**, and **non-blocking baseline tracking** over rigid gate thresholds.

Key objectives:

1. Measure system overhead (FastAPI routing, LangGraph state serialization, SQLite persistence, SSE event delivery).
1. Quantify endpoint response latencies (p50 and p95 distributions).
1. Validate concurrent event processing and queue stability.
1. Detect regressions early across backend API and frontend E2E layers.

______________________________________________________________________

## 1. Workload Selection

Workload design focuses on critical path operations in the platform while removing nondeterministic external dependencies.

### Synthetic & Deterministic Isolation

- **Mock LLM Responses (NFR-A10):** All API and E2E performance tests substitute live model calls with deterministic, low-overhead mock generators or stubbed LangGraph graphs (`_fake_supervisor_graph`). This isolates backend framework overhead from model API network latency and provider rate limits.
- **In-Memory SQLite Checkpointer (NFR-A13):** Storage overhead is measured using `sqlite3.connect(":memory:", check_same_thread=False)` with standard thread-manager initialization. This minimizes disk I/O noise while testing true SQLite serialization, state restoration, and concurrent lock behavior.
- **Isolated Workspace Operations:** Idea workspace and filesystem I/O performance tests utilize isolated temporary directories (`tmp_path`) for registry and YAML persistence.

### Targeted API Workloads

- **Chat Streaming (`POST /api/chat/stream`):** Evaluates time-to-first-byte (TTFB) and full stream duration across warm iterations.
- **Thread CRUD (`GET /api/threads`, `POST /api/threads`):** Measures thread creation and pre-seeded listing performance.
- **Interrupt Management (`PATCH /api/interrupts/{id}/approve`):** Evaluates human-in-the-loop (HITL) approval lifecycle latency under load.
- **Ideas Workspace (`GET /api/ideas`, `POST /api/ideas`):** Measures workspace registry listing (with pre-seeded items) and folder creation.

### Targeted SSE Workloads

- **Publish Latency:** Direct `StreamBus.publish()` delivery latency to single and multiple active subscriber queues.
- **Concurrent Subscribers:** 10 simultaneous subscriber connections receiving event batches to verify delivery consistency and queue eviction logic.
- **Queue Saturation:** Push behavior when subscriber queues reach capacity (>256 events) to verify dead client eviction and graceful event dropping.
- **Database + SSE Concurrency:** Mixed SQLite checkpointer writes and concurrent SSE event publishing to confirm zero `database is locked` errors under load.

### Targeted Frontend E2E Workloads (Playwright)

- **Chat Response Time:** Time from user message submission to first response token visibility and stream completion.
- **Thread List Render Time:** Initial render time when loading the thread sidebar with 10 pre-seeded threads.
- **Thread Switch Latency:** Latency when switching active threads back and forth.
- **Interrupt Approval UI Time:** Time taken to trigger and resolve human approval via UI/API.
- **Page Metrics Baseline:** Browser navigation timing, `DOMContentLoaded`, and page load completion.

______________________________________________________________________

## 2. Metric Collection

Performance metrics are captured using lightweight, built-in timing infrastructure across the backend and frontend.

### FastAPI Timing Middleware (`X-Process-Time`)

The FastAPI application includes a custom `TimingMiddleware` (`backend/app/api/app.py`) that attaches the processing duration in milliseconds to non-streaming HTTP response headers:

- **Header Name:** `X-Process-Time` (formatted as float milliseconds to 2 decimal places, e.g., `12.45`).
- **Streaming Exclusions:** Streaming paths (`/api/sse`, `/api/chat/stream`) are skipped by the middleware so event-stream generators do not keep the middleware dispatch loop open.
- **Observability:** Durations are logged at `DEBUG` level (`Request METHOD PATH completed in X.XXms`).

### Pytest Performance Fixtures & Percentiles

Backend tests use custom fixtures defined in `backend/tests/fixtures/perf.py`:

- **`perf_timer`:** A context manager that records execution duration per iteration into a `durations` list.
- **`percentile(sorted_data, p)`:** Calculates p-th percentiles (such as p50 median and p95 95th percentile) using standard linear interpolation on sorted duration lists.
- **`load_test_generator`:** An async fixture that launches `num_tasks` concurrent tasks with timeout control and individual task execution timing.

### StreamBus Timing

SSE publish latency is measured directly against `StreamBus` instances using high-resolution wall-clock timing (`time.time()`), measuring publish duration independently from network socket transport.

### Playwright E2E Metrics

Frontend performance specs (`frontend/e2e/performance.spec.ts`) capture:

- Client-side latency using `Date.now()`.
- Browser performance timing via `window.performance.getEntriesByType('navigation')` (`domContentLoadedEventEnd`, `loadEventEnd`).

______________________________________________________________________

## 3. Thresholds & Pass Criteria

### Informational Baseline Model

Performance tests in this repository act as **baseline measurements rather than hard CI gate blocks**.

- **No Rigid SLAs:** Because hardware specs vary across local developer environments and shared CI runners, performance assertions do not fail tests on latency variance alone.
- **Functional Assertions:** Tests enforce functional correctness under load (e.g., status code `200`, presence of `X-Process-Time` headers, full delivery of expected SSE events, zero SQLite lock exceptions).
- **Baseline Documenting:** Measured p50 and p95 metrics are documented in `backend/tests/performance-baseline.md`. When architectural changes affect latency profiles, the baseline document is updated.

______________________________________________________________________

## 4. How to Run the Performance Suite

### Prerequisites

Ensure Python dependencies are installed:

```bash
pip install -r requirements.txt
```

### Running Backend Performance Tests

Execute the pytest performance suites with verbose output:

```bash
# Run API endpoint performance tests (Chat, Threads, Interrupts, Ideas)
cd backend
python -m pytest tests/test_api_performance.py -v

# Run SSE publish & concurrency tests
python -m pytest tests/test_sse_latency.py -v

# Run all backend performance tests together
python -m pytest tests/test_api_performance.py tests/test_sse_latency.py -v
```

### Running Frontend E2E Performance Tests

Ensure the backend server and Vite frontend dev server are running, then run Playwright:

```bash
cd frontend
npx playwright test performance.spec.ts --project=dev
```

### Updating the Baseline Document

When establishing new benchmarks:

1. Run the test suite and observe the console outputs for `p50` and `p95` metrics.
1. Update `backend/tests/performance-baseline.md` with the new environment details, Python/Node versions, and recorded latencies.

______________________________________________________________________

## 5. Concrete, Runnable Examples

### Example 1: `perf_timer` Context Manager and Percentile Helper (`backend/tests/fixtures/perf.py`)

```python
import time
from typing import Generator, List
import pytest

def percentile(sorted_data: List[float], p: float) -> float:
    """Calculate p-th percentile from sorted data."""
    if not sorted_data:
        return 0.0
    k = (len(sorted_data) - 1) * (p / 100)
    floor_k = int(k)
    ceil_k = min(floor_k + 1, len(sorted_data) - 1)
    if floor_k == ceil_k:
        return sorted_data[floor_k]
    return sorted_data[floor_k] + (sorted_data[ceil_k] - sorted_data[floor_k]) * (k - floor_k)

@pytest.fixture
def perf_timer() -> Generator["PerfTimer", None, None]:
    """Context manager that records durations for percentile calculations."""
    class PerfTimer:
        def __init__(self):
            self.durations: List[float] = []
            self.start: float = 0.0
            self.duration_ms: float = 0.0

        def __enter__(self):
            self.start = time.time()
            return self

        def __exit__(self, *args):
            self.duration_ms = (time.time() - self.start) * 1000
            self.durations.append(self.duration_ms)

    timer = PerfTimer()
    yield timer
```

### Example 2: Endpoint Performance Test Iteration (`backend/tests/test_api_performance.py`)

```python
class TestThreadCrudPerformance:
    """Measure thread CRUD endpoint latency."""

    def test_thread_list_latency(self, monkeypatch, tmp_path, patch_config):
        """GET /api/threads — measure list response time across multiple iterations."""
        _clear_modules()
        _stub_deepagents(monkeypatch)
        _patch_thread_storage(monkeypatch, tmp_path)

        with TestClient(create_app()) as client:
            # Pre-seed test data
            for i in range(5):
                client.post("/api/threads", json={"title": f"Thread {i}"})

            durations = []
            _ITERATIONS = 5
            for _ in range(_ITERATIONS):
                start = time.time()
                resp = client.get("/api/threads")
                elapsed = (time.time() - start) * 1000

                assert resp.status_code == 200
                assert "X-Process-Time" in resp.headers
                durations.append(elapsed)

            sorted_d = sorted(durations)
            p50 = percentile(sorted_d, 50)
            p95 = percentile(sorted_d, 95)
            print(f"GET /api/threads: p50={p50:.2f}ms p95={p95:.2f}ms")
```

### Example 3: SSE Concurrency & Queue Saturation Test (`backend/tests/test_sse_latency.py`)

```python
class TestSseConcurrentClients:
    """Measure SSE handling with concurrent clients."""

    @pytest.mark.asyncio
    async def test_ten_concurrent_clients(self):
        """10 simultaneous SSE subscriptions — verify all receive events."""
        bus = StreamBus()
        num_clients = 10
        num_events = 5
        received: dict[int, list[str]] = {i: [] for i in range(num_clients)}

        async def client_subscriber(client_id: int):
            async for event in bus.subscribe():
                received[client_id].append(event)
                if len(received[client_id]) >= num_events:
                    return

        tasks = [asyncio.create_task(client_subscriber(i)) for i in range(num_clients)]
        await asyncio.sleep(0.05)  # wait for subscriber queue registration

        start = time.time()
        for i in range(num_events):
            bus.publish("batch", {"seq": i})
            await asyncio.sleep(0.01)
        publish_time = (time.time() - start) * 1000

        await asyncio.wait(tasks, timeout=5.0)

        for client_id in range(num_clients):
            assert len(received[client_id]) == num_events
```

### Example 4: Playwright E2E Performance Timing (`frontend/e2e/performance.spec.ts`)

```typescript
test('page metrics baseline', async ({ page }) => {
  const startTime = Date.now();
  const commandCenter = new CommandCenterPage(page);
  await commandCenter.goto();
  const navTime = Date.now() - startTime;

  await expect(commandCenter.chatInput).toBeEditable();

  const navTiming = await page.evaluate(() => {
    const nav = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined;
    if (!nav) return { domReady: 0, load: 0 };
    return {
      domReady: nav.domContentLoadedEventEnd - nav.startTime,
      load: nav.loadEventEnd - nav.startTime,
    };
  });

  console.log(`Navigation time: ${navTime}ms`);
  console.log(`DOMContentLoaded: ${navTiming.domReady.toFixed(2)}ms`);
});
```

______________________________________________________________________

## Related Documentation

- [`backend/tests/performance-baseline.md`](https://azharameen.github.io/group-run/backend/tests/performance-baseline.md) — Captured baseline measurements and metrics.
- [`docs/architecture.md`](https://azharameen.github.io/group-run/architecture/index.md) — System architecture, event bus design, and persistence.
- [`docs/coding-guidelines.md`](https://azharameen.github.io/group-run/coding-guidelines/index.md) — General testing and coding conventions.
