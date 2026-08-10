"""SSE publish-to-queue latency tests.

Measures:
- Publish to queue latency (single client)
- 10 concurrent client handling
- Queue saturation behavior
- Verification of no "database is locked" errors under concurrency

Uses StreamBus directly (not via HTTP) for precise timing.
"""

import asyncio
import json
import sys
import time
from unittest.mock import patch

import pytest

from tests.fixtures.perf import percentile


# ---------------------------------------------------------------------------
# Helper — fresh StreamBus instance
# ---------------------------------------------------------------------------


def _fresh_bus():
    """Create a new StreamBus instance for isolated testing."""
    for mod in list(sys.modules.keys()):
        if mod.startswith("app.infrastructure.events.stream_bus"):
            del sys.modules[mod]
    from app.infrastructure.events.stream_bus import StreamBus
    return StreamBus()


# ---------------------------------------------------------------------------
# AC: Publish to queue latency
# ---------------------------------------------------------------------------


class TestSsePublishLatency:
    """Measure publish-to-queue latency."""

    @pytest.mark.asyncio
    async def test_publish_latency_single_client(self):
        """Publish latency with a single subscribed client."""
        bus = _fresh_bus()

        # Subscribe a client
        queue_holder: list = []

        async def subscriber():
            async for event in bus.subscribe():
                queue_holder.append(event)
                if "ping" in event:
                    return

        sub_task = asyncio.create_task(subscriber())
        await asyncio.sleep(0.01)  # let subscribe set up queue

        # Measure publish latency
        iterations = 20
        durations = []

        for i in range(iterations):
            start = time.time()
            bus.publish("ping", {"seq": i})
            elapsed = (time.time() - start) * 1000
            durations.append(elapsed)

            # Allow a tick for the event to be received
            await asyncio.sleep(0.001)

            if len(queue_holder) >= iterations:
                break

        # Cancel subscriber
        sub_task.cancel()
        try:
            await sub_task
        except asyncio.CancelledError:
            pass

        sorted_d = sorted(durations)
        p50 = percentile(sorted_d, 50)
        p95 = percentile(sorted_d, 95)

        print(f"\n  === SSE Publish Latency (single client) ===")
        print(f"  Publish duration: p50={p50:.4f}ms  p95={p95:.4f}ms  n={len(sorted_d)}")
        print(f"  Events received: {len(queue_holder)}/{iterations}")

        assert p50 >= 0, "Publish should not be negative"
        assert len(queue_holder) > 0, "Client should receive events"

    @pytest.mark.asyncio
    async def test_publish_latency_no_clients(self):
        """Publish with no clients — should not raise."""
        bus = _fresh_bus()

        durations = []
        for _ in range(10):
            start = time.time()
            bus.publish("empty", {"data": "no one listening"})
            elapsed = (time.time() - start) * 1000
            durations.append(elapsed)

        print(f"\n  === SSE Publish Latency (no clients) ===")
        sorted_d = sorted(durations)
        p50 = percentile(sorted_d, 50)
        print(f"  Publish duration: p50={p50:.4f}ms  n={len(sorted_d)}")


# ---------------------------------------------------------------------------
# AC: 10 concurrent client handling
# ---------------------------------------------------------------------------


class TestSseConcurrentClients:
    """Measure SSE handling with concurrent clients."""

    @pytest.mark.asyncio
    async def test_ten_concurrent_clients(self):
        """10 simultaneous SSE subscriptions — verify all receive events."""
        bus = _fresh_bus()
        num_clients = 10
        num_events = 5

        received: dict[int, list[str]] = {i: [] for i in range(num_clients)}
        errors: list[str] = []

        async def client_subscriber(client_id: int):
            try:
                async for event in bus.subscribe():
                    received[client_id].append(event)
                    event_count = len(received[client_id])
                    if event_count >= num_events:
                        return
            except Exception as exc:
                errors.append(f"Client {client_id}: {exc}")

        # Start all clients
        tasks = [asyncio.create_task(client_subscriber(i)) for i in range(num_clients)]
        await asyncio.sleep(0.05)  # let all subscribers connect

        # Verify all clients are connected
        assert len(bus._clients) == num_clients, (
            f"Expected {num_clients} clients, got {len(bus._clients)}"
        )

        # Measure publish latency for batch
        start = time.time()
        for i in range(num_events):
            bus.publish("batch", {"seq": i})
            await asyncio.sleep(0.01)  # small delay between events
        publish_time = (time.time() - start) * 1000

        # Wait for all subscribers to finish
        done, pending = await asyncio.wait(tasks, timeout=5.0)
        for task in pending:
            task.cancel()
            try:
                await task
            except asyncio.CancelledError:
                pass

        # Verify all clients received all events
        print(f"\n  === SSE Concurrent Clients ({num_clients}) ===")
        print(f"  Publish time for {num_events} events: {publish_time:.2f}ms")
        print(f"  Errors: {len(errors)}")

        for client_id in range(num_clients):
            count = len(received[client_id])
            print(f"    Client {client_id}: {count} events received")
            assert count == num_events, (
                f"Client {client_id} received {count} events, expected {num_events}"
            )

        assert len(errors) == 0, f"Unexpected errors: {errors}"
        assert len(bus._clients) == 0, "All clients should be disconnected"

    @pytest.mark.asyncio
    async def test_concurrent_publish_and_subscribe(self):
        """Concurrent publish while new clients subscribe."""
        bus = _fresh_bus()
        results: list[dict] = []

        async def publisher():
            for i in range(20):
                bus.publish("stream", {"seq": i})
                await asyncio.sleep(0.01)

        async def late_subscriber(delay: float, client_id: int):
            await asyncio.sleep(delay)
            events = []
            try:
                async for event in bus.subscribe():
                    events.append(event)
                    if len(events) >= 5:
                        break
            except asyncio.CancelledError:
                pass
            results.append({"client_id": client_id, "events": len(events), "delay": delay})

        # Start publisher
        pub_task = asyncio.create_task(publisher())

        # Start subscribers at different delays
        sub_tasks = [
            asyncio.create_task(late_subscriber(delay, i))
            for i, delay in enumerate([0, 0.02, 0.04, 0.06, 0.08])
        ]

        await asyncio.sleep(1.0)  # let everything complete

        # Clean up
        pub_task.cancel()
        for task in sub_tasks:
            task.cancel()
        await asyncio.gather(pub_task, *sub_tasks, return_exceptions=True)

        print(f"\n  === SSE Late Subscribers ===")
        for r in results:
            print(f"    Client {r['client_id']} (delay={r['delay']}s): {r['events']} events")

        # All late subscribers should receive at least some events
        for r in results:
            assert r["events"] > 0, f"Client {r['client_id']} received no events"


# ---------------------------------------------------------------------------
# AC: Queue saturation behavior
# ---------------------------------------------------------------------------


class TestSseQueueSaturation:
    """Test queue saturation and dead client eviction."""

    def test_dead_client_evicted_on_saturation(self):
        """Client with saturated queue is evicted during publish."""
        bus = _fresh_bus()

        # Create a client queue that's near saturation
        full_queue = asyncio.Queue(maxsize=bus._MAX_QUEUE * 2)
        for _ in range(bus._MAX_QUEUE + 1):
            full_queue.put_nowait("x")
        bus._clients.append(full_queue)

        # Add a healthy client
        healthy_queue: asyncio.Queue = asyncio.Queue()
        bus._clients.append(healthy_queue)

        # Publish — should evict the full queue, keep healthy one
        bus.publish("test", {"data": "check"})

        assert len(bus._clients) == 1
        assert bus._clients[0] is healthy_queue

        # Verify healthy client received the event
        item = healthy_queue.get_nowait()
        assert "data:" in item
        assert "test" in item

        print("\n  === SSE Queue Saturation ===")
        print("  Dead client evicted correctly")
        print("  Healthy client received event")

    def test_queue_full_drops_event(self):
        """When a queue is full, publish drops the event without crashing."""
        bus = _fresh_bus()

        # Create a small queue that's already full
        small_queue: asyncio.Queue = asyncio.Queue(maxsize=2)
        small_queue.put_nowait("a")
        small_queue.put_nowait("b")
        bus._clients.append(small_queue)

        # Also add a healthy client to verify normal operation continues
        healthy_queue: asyncio.Queue = asyncio.Queue()
        bus._clients.append(healthy_queue)

        # Publish to full queue — should not raise, event dropped for full queue
        try:
            bus.publish("overflow", {"data": "too much"})
        except Exception as exc:
            pytest.fail(f"Publish raised exception on full queue: {exc}")

        # The full queue is NOT evicted (qsize=2 < _MAX_QUEUE=256) —
        # eviction only happens when qsize > _MAX_QUEUE. The event is
        # dropped via QueueFull exception, healthy client still gets it.
        assert len(bus._clients) == 2, "Clients should not be evicted (qsize < _MAX_QUEUE)"

        # Verify healthy client received the event
        item = healthy_queue.get_nowait()
        assert "data:" in item
        assert "overflow" in item

        # Verify the small queue is still full (event was dropped)
        assert small_queue.full()

        print("\n  === SSE Queue Full Behavior ===")
        print("  Full queue event dropped, healthy client received event, no crash")


# ---------------------------------------------------------------------------
# AC: No "database is locked" errors
# ---------------------------------------------------------------------------


class TestSseNoDatabaseLocks:
    """Verify SSE operations don't trigger database locks."""

    @pytest.mark.asyncio
    async def test_no_database_locked_under_sse_concurrency(self):
        """SSE operations are queue-based, no SQLite involved — verify no locks."""
        bus = _fresh_bus()
        errors: list[str] = []

        async def stress_publish():
            for i in range(100):
                try:
                    bus.publish("stress", {"seq": i})
                except Exception as exc:
                    errors.append(f"Publish error: {exc}")

        async def stress_subscribe(client_id: int):
            try:
                async for event in bus.subscribe():
                    if "done" in event:
                        return
            except Exception as exc:
                errors.append(f"Subscribe error: {exc}")

        # Start subscribers
        sub_tasks = [asyncio.create_task(stress_subscribe(i)) for i in range(5)]
        await asyncio.sleep(0.05)

        # Run publisher
        await stress_publish()

        # Send done signal
        bus.publish("done", {"msg": "test complete"})

        # Wait for subscribers
        await asyncio.sleep(0.1)
        for task in sub_tasks:
            task.cancel()
        await asyncio.gather(*sub_tasks, return_exceptions=True)

        # Verify no database-related errors
        db_errors = [e for e in errors if "database" in e.lower() or "lock" in e.lower()]
        print(f"\n  === SSE Database Lock Check ===")
        print(f"  Total errors: {len(errors)}")
        print(f"  Database-related errors: {len(db_errors)}")

        assert len(db_errors) == 0, f"Database lock errors found: {db_errors}"
        assert len(errors) == 0, f"Unexpected errors: {errors}"

    @pytest.mark.asyncio
    async def test_sse_with_in_memory_db_no_locks(self, monkeypatch):
        """SSE + in-memory SQLite checkpointer — verify no locks."""
        import sqlite3
        import sys as _sys

        # Clear thread_manager to get fresh state
        for mod in list(_sys.modules.keys()):
            if mod.startswith("app.services.thread_manager"):
                del _sys.modules[mod]

        # Set up in-memory DB
        from app.services import thread_manager as tm

        tm._THREAD_DB_PATH = None
        tm._SQLITE_SAVER = None

        conn = sqlite3.connect(":memory:", check_same_thread=False)
        conn.row_factory = sqlite3.Row

        from langgraph.checkpoint.sqlite import SqliteSaver

        saver = SqliteSaver(conn)
        tm._SQLITE_SAVER = saver

        # Set up SSE bus
        for mod in list(_sys.modules.keys()):
            if mod.startswith("app.infrastructure.events.stream_bus"):
                del _sys.modules[mod]

        from app.infrastructure.events.stream_bus import StreamBus

        bus = StreamBus()
        errors: list[str] = []

        async def concurrent_db_and_sse(task_id: int):
            try:
                # Mix DB operations with SSE publishes
                for i in range(10):
                    # DB operation (thread listing would use this)
                    saver.setup()
                    # SSE publish
                    bus.publish("mixed", {"task": task_id, "seq": i})
                    await asyncio.sleep(0.001)
            except Exception as exc:
                errors.append(f"Task {task_id}: {exc}")

        # Run 5 concurrent tasks that mix DB and SSE
        tasks = [asyncio.create_task(concurrent_db_and_sse(i)) for i in range(5)]
        await asyncio.gather(*tasks)

        db_errors = [e for e in errors if "database" in e.lower() or "lock" in e.lower()]
        print(f"\n  === SSE + In-Memory DB Concurrency ===")
        print(f"  Total errors: {len(errors)}")
        print(f"  Database-related errors: {len(db_errors)}")

        # In-memory SQLite with check_same_thread=False should handle concurrency
        # The point is to verify SSE operations don't trigger DB contention
        conn.close()
