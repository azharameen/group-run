"""Reusable timing infrastructure for performance tests.

Fixtures
--------
perf_timer : Context manager that records durations for percentile calculations.
percentile : Helper function for p50/p95 calculations.
load_test_generator : Fixture for generating concurrent request loads.
"""

import asyncio
import time
from typing import Generator, List

import pytest


def percentile(sorted_data: List[float], p: float) -> float:
    """Calculate p-th percentile from sorted data.

    Args:
        sorted_data: List of durations, must be sorted.
        p: Percentile to calculate (0-100), e.g. 50 for p50, 95 for p95.

    Returns:
        The interpolated value at the given percentile.
    """
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
    """Context manager that records durations for percentile calculations.

    Usage:
        def test_endpoint(perf_timer):
            with perf_timer:
                client.get("/api/threads")
            p50 = percentile(sorted(perf_timer.durations), 50)
            p95 = percentile(sorted(perf_timer.durations), 95)
    """

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


@pytest.fixture
async def load_test_generator():
    """Generate concurrent async tasks for load testing.

    Usage:
        async def test_concurrent(load_test_generator):
            results = await load_test_generator(
                task_factory=lambda i: some_async_fn(i),
                num_tasks=10,
            )
            assert len(results) == 10
    """

    async def run_concurrent(task_factory, num_tasks: int = 10, timeout: float = 30.0):
        """Run num_tasks concurrent tasks and collect results.

        Args:
            task_factory: Callable taking an int index, returning an awaitable.
            num_tasks: Number of concurrent tasks to launch.
            timeout: Maximum time in seconds to wait for all tasks.

        Returns:
            List of (index, result, duration_ms) tuples.
        """
        results = []

        async def _run_with_timing(index: int):
            start = time.time()
            try:
                result = await task_factory(index)
            except Exception as exc:
                result = exc
            elapsed = (time.time() - start) * 1000
            return (index, result, elapsed)

        tasks = [_run_with_timing(i) for i in range(num_tasks)]
        completed = await asyncio.wait_for(
            asyncio.gather(*tasks, return_exceptions=True),
            timeout=timeout,
        )

        for item in completed:
            if isinstance(item, Exception):
                results.append((-1, item, 0))
            else:
                results.append(item)

        return results

    return run_concurrent
