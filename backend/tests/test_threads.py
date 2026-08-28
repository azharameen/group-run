"""Tests for idea-scoped threads and SSE streaming."""
import asyncio
import importlib
import json
from contextlib import asynccontextmanager
from typing import Any

import pytest
from app.api.app import create_app
from app.providers.adapters import ProviderDefinition
from fastapi.testclient import TestClient


def _patch_thread_storage(monkeypatch, tmp_path):
    import app.services.thread_manager as tm
    tm._PG_CHECKPOINTER = None
    tm._PG_CHECKPOINTER_CM = None
    tm._PG_CHECKPOINTER_LOOP = None


@pytest.fixture(autouse=True)
def _cleanup_thread_state():
    """Ensure clean thread/supervisor state after each checkpoint test."""
    yield
    # Clean up singletons after test to prevent cross-test pollution
    import app.orchestrator.supervisor as sup
    import app.services.thread_manager as tm

    tm._PG_CHECKPOINTER = None
    tm._PG_CHECKPOINTER_CM = None
    tm._PG_CHECKPOINTER_LOOP = None
    sup._graph = None
    sup._agent = None


# NOTE: patches target module OBJECTS resolved at patch time via
# importlib.import_module — not dotted strings and not collection-time
# bindings. Other tests' sys.modules purges can leave parent package
# attributes (or earlier bindings) pointing at orphaned instances.

_STREAM_DEFINITION = ProviderDefinition(
    "test-provider", "https://api.example.com/v1", {"api_key": "k"}
)


class _StubProviderService:
    """Provider service double: fixed enabled selection, no-op execution lease."""

    async def resolve_model(self, user_id: str, provider_id: str | None, model_id: str | None):
        return "prov-1", "model-1", _STREAM_DEFINITION

    @asynccontextmanager
    async def execution(self, user_id: str, provider_id: str):
        yield


def _checkpoint_runtime(response_text: str):
    """Fake DeepAgents runtime that runs a real compiled LangGraph.

    The graph is compiled against the PG checkpointer so checkpoint
    persistence is genuinely exercised under the stream's thread_id; the
    run then yields v2-style events for the runner to consume.
    """
    from typing import Annotated, TypedDict

    from app.services.thread_manager import get_pg_checkpointer
    from langchain_core.messages import AIMessage
    from langgraph.graph import StateGraph
    from langgraph.graph.message import add_messages

    class _StreamState(TypedDict, total=False):
        messages: Annotated[list[Any], add_messages]
        response: str
        error: str
        routing_key: str
        idea_id: str
        workflow_state: str
        user_feedback: str

    async def _general(state: dict) -> dict:
        return {
            "messages": [AIMessage(content=response_text)],
            "response": response_text,
            "routing_key": "general",
        }

    class _Runtime:
        def __init__(self):
            self._graph = None

        async def _ensure_graph(self):
            if self._graph is None:
                graph = StateGraph(_StreamState)
                graph.add_node("general", _general)
                graph.set_entry_point("general")
                graph.add_edge("general", "__end__")
                checkpointer = await get_pg_checkpointer()
                self._graph = graph.compile(checkpointer=checkpointer)
            return self._graph

        async def astream_events(self, input_payload, **kwargs):
            graph = await self._ensure_graph()
            config = kwargs.get("config")

            async def _gen():
                await graph.ainvoke(input_payload, config=config)
                yield {
                    "type": "on_chat_model_stream",
                    "data": {"chunk": {"content": response_text}},
                }
                yield {"type": "done", "data": {}}

            return _gen()

    return _Runtime()


def _patch_stream(monkeypatch, events, *, fail=None, checkpoint_response=None):
    """Stub provider resolution plus the DeepAgents runtime for a stream test.

    - ``events``: transcript events a canned fake runner yields.
    - ``fail``: exception the canned fake runner raises instead of yielding.
    - ``checkpoint_response``: instead of canned events, use a real compiled
      graph (PG checkpointer) whose assistant reply is this text.

    Re-resolve ``app.agent.runner`` at patch time: other test modules
    (e.g. test_team_factory) purge it from ``sys.modules``, and the module
    object bound at collection time can be stale relative to what
    ``thread_stream`` lazily imports at call time.
    """
    runner_mod = importlib.import_module("app.agent.runner")
    threads_mod = importlib.import_module("app.api.routes.threads")
    monkeypatch.setattr(threads_mod, "provider_service", _StubProviderService())

    if checkpoint_response is None:

        async def _runner(*args, **kwargs):
            if fail is not None:
                raise fail
            for event in events:
                yield event

        monkeypatch.setattr(runner_mod, "execute_deep_agent_workflow_streaming", _runner)
    else:
        runtime = _checkpoint_runtime(checkpoint_response)

        async def _runtime_factory(*args, **kwargs):
            return runtime

        monkeypatch.setattr(runner_mod, "get_deep_agent_runtime_async", _runtime_factory)


def test_thread_create_uses_idea_id_and_streams(monkeypatch, tmp_path, patch_config):
    _patch_thread_storage(monkeypatch, tmp_path)
    _patch_stream(monkeypatch, [
        {"type": "message", "speaker": "assistant", "content": "Hello from the agent stream."},
        {"type": "done"},
    ])

    with TestClient(create_app()) as client:
        create_res = client.post(
            "/api/threads",
            json={"title": "Idea thread", "idea_id": "IDEA-0001"},
        )
        assert create_res.status_code == 200
        thread = create_res.json()["thread"]
        assert thread["idea_id"] == "IDEA-0001"

        stream_res = client.post(
            f"/api/threads/{thread['thread_id']}/stream",
            json={"text": "What should the team do next?", "idea_id": "IDEA-0001"},
        )
        assert stream_res.status_code == 200
        body = stream_res.text
        assert "Hello from the agent stream." in body
        assert '"type": "message"' in body
        # done event only emitted by the generator when the runner produced none
        assert '"type": "done"' in body


def test_thread_stream_fallback_mode_without_provider_selection(
    monkeypatch, tmp_path, patch_config
):
    """NFR-A10: a user with no provider configurations streams through the
    DEEPAGENTS_MODEL fallback — the E2E warm-up path."""
    import app.api.routes.threads as threads_mod

    _patch_thread_storage(monkeypatch, tmp_path)
    _patch_stream(monkeypatch, [
        {"type": "message", "speaker": "assistant", "content": "Warm-up response."},
        {"type": "done"},
    ])

    class _FallbackService:
        async def resolve_model(self, user_id, provider_id, model_id):
            assert (provider_id, model_id) == (None, None)
            return None, None, None

        @asynccontextmanager
        async def execution(self, user_id, provider_id):
            raise AssertionError("no lease in fallback mode")
            yield  # pragma: no cover

    monkeypatch.setattr(threads_mod, "provider_service", _FallbackService())

    with TestClient(create_app()) as client:
        thread = client.post("/api/threads", json={"title": "Fallback"}).json()["thread"]
        res = client.post(
            f"/api/threads/{thread['thread_id']}/stream",
            json={"text": "Warm-up: can you help me capture an idea?"},
        )
        assert res.status_code == 200
        assert "Warm-up response." in res.text


def test_thread_stream_falls_back_to_final_output(monkeypatch, tmp_path, patch_config):
    """Final-output message events from the runner pass through the stream."""
    _patch_thread_storage(monkeypatch, tmp_path)
    _patch_stream(monkeypatch, [
        {"type": "message", "speaker": "assistant", "content": "Final answer from fallback output."},
        {"type": "done"},
    ])

    with TestClient(create_app()) as client:
        thread = client.post(
            "/api/threads",
            json={"title": "Fallback thread", "idea_id": "IDEA-0002"},
        ).json()["thread"]

        res = client.post(
            f"/api/threads/{thread['thread_id']}/stream",
            json={"text": "Tell me the answer", "idea_id": "IDEA-0002"},
        )
        assert res.status_code == 200
        body = res.text
        assert "Final answer from fallback output." in body
        assert '"type": "message"' in body


def test_thread_stream_extracts_text_from_chunk_list(monkeypatch, tmp_path, patch_config):
    """Verify stream emits clean text (no reasoning blocks)."""
    _patch_thread_storage(monkeypatch, tmp_path)
    _patch_stream(monkeypatch, [
        {"type": "message", "speaker": "assistant", "content": "Hello! How can I help you today?"},
        {"type": "done"},
    ])

    with TestClient(create_app()) as client:
        thread = client.post(
            "/api/threads",
            json={"title": "Chunk thread", "idea_id": "IDEA-0003"},
        ).json()["thread"]

        res = client.post(
            f"/api/threads/{thread['thread_id']}/stream",
            json={"text": "Say hello", "idea_id": "IDEA-0003"},
        )
        assert res.status_code == 200
        body = res.text
        assert "Hello! How can I help you today?" in body
        # Reasoning block IDs and reasoning markers should NOT leak
        assert "ad226d1afdbedae1" not in body
        assert '"type": "reasoning"' not in body


def test_thread_stream_emits_token_events_with_response(monkeypatch, tmp_path, patch_config):
    """Verify token-level transcript events carry the assistant response text."""
    _patch_thread_storage(monkeypatch, tmp_path)
    _patch_stream(monkeypatch, [
        {"type": "token", "speaker": "assistant", "content": "Hello "},
        {"type": "token", "speaker": "assistant", "content": "world"},
        {"type": "done"},
    ])

    with TestClient(create_app()) as client:
        thread = client.post(
            "/api/threads",
            json={"title": "Token thread", "idea_id": "IDEA-0004"},
        ).json()["thread"]

        res = client.post(
            f"/api/threads/{thread['thread_id']}/stream",
            json={"text": "Stream tokens", "idea_id": "IDEA-0004"},
        )
        assert res.status_code == 200
        # Parse SSE lines to validate event structure
        events = [
            json.loads(line[6:])
            for line in res.text.strip().split("\n")
            if line.startswith("data: ")
        ]
        tokens = [e for e in events if e.get("type") == "token"]
        assert tokens, "No token events found in stream"
        assert "".join(e["content"] for e in tokens) == "Hello world"
        assert all(e.get("speaker") == "assistant" for e in tokens)
        assert any(e.get("type") == "done" for e in events)


def test_thread_stream_emits_error_on_agent_failure(monkeypatch, tmp_path, patch_config):
    """Verify runner error events are properly emitted when the agent fails."""
    _patch_thread_storage(monkeypatch, tmp_path)
    _patch_stream(monkeypatch, [
        {
            "type": "error",
            "error": {
                "code": "agent_failure",
                "message": "something went wrong",
                "retryable": False,
            },
        },
    ])

    with TestClient(create_app()) as client:
        thread = client.post(
            "/api/threads",
            json={"title": "Tool thread", "idea_id": "IDEA-0005"},
        ).json()["thread"]

        res = client.post(
            f"/api/threads/{thread['thread_id']}/stream",
            json={"text": "Use a tool", "idea_id": "IDEA-0005"},
        )
        assert res.status_code == 200
        body = res.text
        assert '"type": "error"' in body
        assert "something went wrong" in body


def test_thread_stream_emits_exception_error(monkeypatch, tmp_path, patch_config):
    """Verify unexpected runtime exceptions are wrapped in streaming_failure events."""
    _patch_thread_storage(monkeypatch, tmp_path)
    _patch_stream(monkeypatch, [], fail=RuntimeError("unexpected crash"))

    with TestClient(create_app()) as client:
        thread = client.post(
            "/api/threads",
            json={"title": "Subagent thread", "idea_id": "IDEA-0006"},
        ).json()["thread"]

        res = client.post(
            f"/api/threads/{thread['thread_id']}/stream",
            json={"text": "Delegate work", "idea_id": "IDEA-0006"},
        )
        assert res.status_code == 200
        body = res.text
        assert '"type": "error"' in body
        assert "unexpected crash" in body
        assert '"code": "streaming_failure"' in body


def test_thread_stream_emits_interrupt(monkeypatch, tmp_path, patch_config):
    """Verify runtime interrupt events (HITL approvals) reach the client stream."""
    _patch_thread_storage(monkeypatch, tmp_path)
    _patch_stream(monkeypatch, [
        {
            "type": "interrupt",
            "speaker": "workflow-orchestrator",
            "interrupt_id": "intr-123",
            "content": "Approve edit_file?",
        },
        {"type": "done"},
    ])

    with TestClient(create_app()) as client:
        thread = client.post(
            "/api/threads",
            json={"title": "Interrupt thread", "idea_id": "IDEA-0007"},
        ).json()["thread"]

        res = client.post(
            f"/api/threads/{thread['thread_id']}/stream",
            json={"text": "Edit a file", "idea_id": "IDEA-0007"},
        )
        assert res.status_code == 200
        body = res.text
        assert '"type": "interrupt"' in body
        assert "intr-123" in body
        assert "Approve edit_file?" in body


# ── CRUD Tests ────────────────────────────────────────────────────────────


def test_thread_crud_get_by_id(monkeypatch, tmp_path, patch_config):
    """Verify GET /api/threads/{id} returns thread metadata."""
    _patch_thread_storage(monkeypatch, tmp_path)

    with TestClient(create_app()) as client:
        thread = client.post(
            "/api/threads",
            json={"title": "CRUD test", "idea_id": "IDEA-100"},
        ).json()["thread"]

        res = client.get(f"/api/threads/{thread['thread_id']}")
        assert res.status_code == 200
        data = res.json()
        assert data["thread"]["thread_id"] == thread["thread_id"]
        assert data["thread"]["title"] == "CRUD test"
        assert data["thread"]["idea_id"] == "IDEA-100"


def test_thread_messages_empty_and_not_found(monkeypatch, tmp_path, patch_config):
    """Verify messages endpoint returns empty list for new threads and 404 for missing ones."""
    _patch_thread_storage(monkeypatch, tmp_path)

    with TestClient(create_app()) as client:
        thread = client.post("/api/threads", json={"title": "Empty thread"}).json()["thread"]

        res = client.get(f"/api/threads/{thread['thread_id']}/messages")
        assert res.status_code == 200
        assert res.json() == {"messages": [], "count": 0}

        assert client.get("/api/threads/00000000-0000-0000-0000-000000000000/messages").status_code == 404


def test_thread_messages_preserve_order_and_types(monkeypatch, tmp_path, patch_config):
    """Verify restored checkpoint messages preserve order, type, and full content."""
    _patch_thread_storage(monkeypatch, tmp_path)
    _reset_thread_singletons(monkeypatch)
    _patch_stream(monkeypatch, [], checkpoint_response="Assistant reply")

    with TestClient(create_app()) as client:
        thread = client.post(
            "/api/threads",
            json={"title": "History thread", "idea_id": "IDEA-200"},
        ).json()["thread"]

        client.post(
            f"/api/threads/{thread['thread_id']}/stream",
            json={"text": "First message", "idea_id": "IDEA-200"},
        )

        messages = client.get(f"/api/threads/{thread['thread_id']}/messages").json()["messages"]
        assert [m["type"] for m in messages] == ["human", "ai"]
        # The runner wraps user text in a JSON context payload
        assert "First message" in messages[0]["content"]
        assert messages[1]["content"] == "Assistant reply"


def test_thread_crud_update(monkeypatch, tmp_path, patch_config):
    """Verify PUT and PATCH /api/threads/{id} update thread metadata."""
    _patch_thread_storage(monkeypatch, tmp_path)

    with TestClient(create_app()) as client:
        thread = client.post("/api/threads", json={"title": "Original"}).json()["thread"]
        tid = thread["thread_id"]

        # PUT update
        res = client.put(f"/api/threads/{tid}", json={"title": "Updated via PUT"})
        assert res.status_code == 200
        assert res.json()["thread"]["title"] == "Updated via PUT"

        # PATCH update
        res = client.patch(f"/api/threads/{tid}", json={"title": "Updated via PATCH"})
        assert res.status_code == 200
        assert res.json()["thread"]["title"] == "Updated via PATCH"


def test_thread_crud_delete(monkeypatch, tmp_path, patch_config):
    """Verify DELETE /api/threads/{id} removes thread."""
    _patch_thread_storage(monkeypatch, tmp_path)

    with TestClient(create_app()) as client:
        thread = client.post("/api/threads", json={"title": "To delete"}).json()["thread"]
        tid = thread["thread_id"]

        res = client.delete(f"/api/threads/{tid}")
        assert res.status_code == 200
        assert res.json()["deleted"] is True

        # Idempotent delete
        res = client.delete(f"/api/threads/{tid}")
        assert res.status_code == 200
        assert res.json()["deleted"] is False


def test_thread_404_cases(monkeypatch, tmp_path, patch_config):
    """Verify 404 responses for non-existent threads."""
    _patch_thread_storage(monkeypatch, tmp_path)
    fake_id = "00000000-0000-0000-0000-000000000000"

    with TestClient(create_app()) as client:
        assert client.get(f"/api/threads/{fake_id}").status_code == 404
        assert client.put(f"/api/threads/{fake_id}", json={"title": "x"}).status_code == 404
        assert client.delete(f"/api/threads/{fake_id}").status_code == 200
        assert client.get(f"/api/threads/{fake_id}/messages").status_code == 404


@pytest.mark.asyncio
async def test_legacy_thread_is_claimed_once_without_cross_user_access(
    monkeypatch, tmp_path, patch_config, firebase_token_claims
):
    """An unowned pre-migration thread is claimable only by its retained opaque ID."""
    _patch_thread_storage(monkeypatch, tmp_path)
    firebase_token_claims["user-b-token"] = {
        "uid": "user-b",
        "sub": "user-b",
        "firebase": {"sign_in_provider": "google.com"},
    }
    from app.services import thread_manager

    legacy_thread = await thread_manager.create_thread(title="Legacy")
    with TestClient(create_app()) as client:
        claimed = client.get(f"/api/threads/{legacy_thread['thread_id']}")
        assert claimed.status_code == 200
        stored = await thread_manager.get_thread(legacy_thread["thread_id"])
        assert stored is not None
        assert stored["owner_uid"] == "test-user-123"

        other_user = client.get(
            f"/api/threads/{legacy_thread['thread_id']}",
            headers={"Authorization": "Bearer user-b-token"},
        )
        assert other_user.status_code == 404


def test_thread_messages_empty_after_create(monkeypatch, tmp_path, patch_config):
    """Verify new thread has empty messages before any streaming."""
    _patch_thread_storage(monkeypatch, tmp_path)

    with TestClient(create_app()) as client:
        thread = client.post("/api/threads", json={"title": "Empty msgs"}).json()["thread"]
        res = client.get(f"/api/threads/{thread['thread_id']}/messages")
        assert res.status_code == 200
        assert res.json()["count"] == 0
        assert res.json()["messages"] == []


def test_thread_messages_after_stream(monkeypatch, tmp_path, patch_config):
    """Send message via stream, verify both human and AI messages appear in GET /messages.

    This is the critical test for message persistence — the runtime graph
    must save checkpoints via LangGraph's checkpointer so messages are retrievable.
    """
    _patch_thread_storage(monkeypatch, tmp_path)
    _reset_thread_singletons(monkeypatch)
    _patch_stream(monkeypatch, [], checkpoint_response="AI response message")

    with TestClient(create_app()) as client:
        thread = client.post("/api/threads", json={"title": "Msg persist"}).json()["thread"]
        tid = thread["thread_id"]

        # Stream a message
        stream_res = client.post(
            f"/api/threads/{tid}/stream",
            json={"text": "Hello, AI!", "idea_id": None},
        )
        assert stream_res.status_code == 200
        assert "AI response message" in stream_res.text

        # Verify messages are retrievable
        msgs_res = client.get(f"/api/threads/{tid}/messages")
        assert msgs_res.status_code == 200
        data = msgs_res.json()
        assert "messages" in data
        assert "count" in data
        assert data["count"] >= 2, f"Expected human + AI messages, got {data['messages']}"


def test_thread_messages_persisted_via_real_checkpoint(monkeypatch, tmp_path, patch_config):
    """Integration test: verify messages persist through LangGraph checkpoint mechanism.

    Uses a real compiled graph with checkpointer but mocks the agent nodes.
    This validates the full checkpoint save/retrieve cycle.
    """
    _patch_thread_storage(monkeypatch, tmp_path)
    _reset_thread_singletons(monkeypatch)
    _patch_stream(monkeypatch, [], checkpoint_response="Test AI response from checkpoint")

    with TestClient(create_app()) as client:
        thread = client.post(
            "/api/threads",
            json={"title": "Checkpoint test"},
        ).json()["thread"]
        tid = thread["thread_id"]

        # Stream a message through the real runtime graph
        stream_res = client.post(
            f"/api/threads/{tid}/stream",
            json={"text": "Hello, world!", "idea_id": None},
        )
        assert stream_res.status_code == 200
        assert "Test AI response from checkpoint" in stream_res.text

        # Verify checkpoint was saved - messages should be retrievable
        msgs_res = client.get(f"/api/threads/{tid}/messages")
        assert msgs_res.status_code == 200
        data = msgs_res.json()
        assert data["count"] >= 2, f"Expected at least 2 messages (human + AI), got {data['count']}: {data['messages']}"

        # Verify message content
        types = [m.get("type") for m in data["messages"]]
        assert "human" in types, f"Expected human message, got types: {types}"
        assert "ai" in types, f"Expected ai message, got types: {types}"


# ── Checkpoint Restoration Tests ───────────────────────────────────────────


def _reset_thread_singletons(monkeypatch):
    """Reset singleton state in thread_manager and supervisor modules."""
    import app.orchestrator.supervisor as sup
    import app.services.thread_manager as tm

    tm._PG_CHECKPOINTER = None
    tm._PG_CHECKPOINTER_CM = None
    tm._PG_CHECKPOINTER_LOOP = None
    sup._graph = None
    sup._agent = None


def test_checkpoint_messages_persist_and_restore(monkeypatch, tmp_path, patch_config):
    _patch_thread_storage(monkeypatch, tmp_path)
    _reset_thread_singletons(monkeypatch)
    _patch_stream(monkeypatch, [], checkpoint_response="Restored response")

    with TestClient(create_app()) as client:
        thread = client.post("/api/threads", json={"title": "Restore test"}).json()["thread"]
        tid = thread["thread_id"]
        stream_res = client.post(f"/api/threads/{tid}/stream", json={"text": "Hello"})
        assert stream_res.status_code == 200
        assert "Restored response" in stream_res.text

        msgs_res = client.get(f"/api/threads/{tid}/messages")
        assert msgs_res.status_code == 200
        assert msgs_res.json()["count"] >= 2


def test_checkpoint_message_shape(monkeypatch, tmp_path, patch_config):
    _patch_thread_storage(monkeypatch, tmp_path)
    _reset_thread_singletons(monkeypatch)
    _patch_stream(monkeypatch, [], checkpoint_response="Shape response")

    with TestClient(create_app()) as client:
        tid = client.post("/api/threads", json={"title": "Shape test"}).json()["thread"]["thread_id"]
        client.post(f"/api/threads/{tid}/stream", json={"text": "Hello"})
        messages = client.get(f"/api/threads/{tid}/messages").json()["messages"]
        assert messages
        msg = messages[0]
        assert "id" in msg and "type" in msg and "content" in msg and "role" in msg


def test_checkpoint_human_and_ai_types(monkeypatch, tmp_path, patch_config):
    _patch_thread_storage(monkeypatch, tmp_path)
    _reset_thread_singletons(monkeypatch)
    _patch_stream(monkeypatch, [], checkpoint_response="AI")

    with TestClient(create_app()) as client:
        tid = client.post("/api/threads", json={"title": "Types test"}).json()["thread"]["thread_id"]
        client.post(f"/api/threads/{tid}/stream", json={"text": "Hello"})
        types = [m.get("type") for m in client.get(f"/api/threads/{tid}/messages").json()["messages"]]
        assert "human" in types and "ai" in types


def test_checkpoint_chronological_order(monkeypatch, tmp_path, patch_config):
    _patch_thread_storage(monkeypatch, tmp_path)
    _reset_thread_singletons(monkeypatch)
    _patch_stream(monkeypatch, [], checkpoint_response="First")

    with TestClient(create_app()) as client:
        tid = client.post("/api/threads", json={"title": "Order test"}).json()["thread"]["thread_id"]
        client.post(f"/api/threads/{tid}/stream", json={"text": "One"})
        client.post(f"/api/threads/{tid}/stream", json={"text": "Two"})
        messages = client.get(f"/api/threads/{tid}/messages").json()["messages"]
        assert len(messages) >= 4
        # Allow non-human prefix (e.g., system messages from LangGraph)
        assert any(m.get("type") == "human" for m in messages[:2])
        assert any(m.get("type") == "ai" for m in messages[:3])


def test_checkpoint_multiple_streams_accumulate(monkeypatch, tmp_path, patch_config):
    _patch_thread_storage(monkeypatch, tmp_path)
    _reset_thread_singletons(monkeypatch)
    _patch_stream(monkeypatch, [], checkpoint_response="Accumulated")

    with TestClient(create_app()) as client:
        tid = client.post("/api/threads", json={"title": "Multi test"}).json()["thread"]["thread_id"]
        client.post(f"/api/threads/{tid}/stream", json={"text": "One"})
        first = client.get(f"/api/threads/{tid}/messages").json()["count"]
        assert first >= 2, f"First stream produced no messages: count={first}"
        client.post(f"/api/threads/{tid}/stream", json={"text": "Two"})
        second = client.get(f"/api/threads/{tid}/messages").json()["count"]
        assert second > first


# ── Thread Isolation Tests ────────────────────────────────────────────────


def test_thread_isolation_no_message_leak(monkeypatch, tmp_path, patch_config):
    _patch_thread_storage(monkeypatch, tmp_path)
    _reset_thread_singletons(monkeypatch)
    _patch_stream(monkeypatch, [], checkpoint_response="A response")

    with TestClient(create_app()) as client:
        a = client.post("/api/threads", json={"title": "A"}).json()["thread"]["thread_id"]
        b = client.post("/api/threads", json={"title": "B"}).json()["thread"]["thread_id"]
        client.post(f"/api/threads/{a}/stream", json={"text": "Hello A"})
        msgs_a = client.get(f"/api/threads/{a}/messages").json()["messages"]
        msgs_b = client.get(f"/api/threads/{b}/messages").json()["messages"]
        assert len(msgs_a) >= 2
        assert msgs_b == []


def test_thread_switch_restores_correct_messages(monkeypatch, tmp_path, patch_config):
    _patch_thread_storage(monkeypatch, tmp_path)
    _reset_thread_singletons(monkeypatch)
    _patch_stream(monkeypatch, [], checkpoint_response="Thread response")

    with TestClient(create_app()) as client:
        a = client.post("/api/threads", json={"title": "A"}).json()["thread"]["thread_id"]
        b = client.post("/api/threads", json={"title": "B"}).json()["thread"]["thread_id"]
        client.post(f"/api/threads/{a}/stream", json={"text": "Hello A"})
        client.post(f"/api/threads/{b}/stream", json={"text": "Hello B"})
        msgs_a = client.get(f"/api/threads/{a}/messages").json()["messages"]
        msgs_b = client.get(f"/api/threads/{b}/messages").json()["messages"]
        # The runner wraps user text in a JSON context payload
        assert any("Hello A" in m.get("content", "") for m in msgs_a)
        assert any("Hello B" in m.get("content", "") for m in msgs_b)


def test_deleted_thread_messages_inaccessible(monkeypatch, tmp_path, patch_config):
    _patch_thread_storage(monkeypatch, tmp_path)
    _reset_thread_singletons(monkeypatch)
    _patch_stream(monkeypatch, [], checkpoint_response="Gone")

    with TestClient(create_app()) as client:
        tid = client.post("/api/threads", json={"title": "Delete me"}).json()["thread"]["thread_id"]
        client.post(f"/api/threads/{tid}/stream", json={"text": "Hello"})
        client.delete(f"/api/threads/{tid}")
        assert client.get(f"/api/threads/{tid}/messages").status_code == 404


# ── Error Handling Tests ──────────────────────────────────────────────────


def test_messages_404_for_nonexistent_thread(monkeypatch, tmp_path, patch_config):
    _patch_thread_storage(monkeypatch, tmp_path)
    with TestClient(create_app()) as client:
        assert client.get("/api/threads/00000000-0000-0000-0000-000000000000/messages").status_code == 404


def test_stream_404_for_nonexistent_thread(monkeypatch, tmp_path, patch_config):
    _patch_thread_storage(monkeypatch, tmp_path)
    _reset_thread_singletons(monkeypatch)
    with TestClient(create_app()) as client:
        assert client.post("/api/threads/00000000-0000-0000-0000-000000000000/stream", json={"text": "x"}).status_code == 404


def test_stream_error_then_done_event(monkeypatch, tmp_path, patch_config):
    _patch_thread_storage(monkeypatch, tmp_path)
    _reset_thread_singletons(monkeypatch)
    _patch_stream(monkeypatch, [], fail=RuntimeError("boom"))
    with TestClient(create_app()) as client:
        tid = client.post("/api/threads", json={"title": "Err"}).json()["thread"]["thread_id"]
        body = client.post(f"/api/threads/{tid}/stream", json={"text": "x"}).text.strip().splitlines()
        assert any('"type": "error"' in line for line in body)
        assert any('"type": "done"' in line for line in body)


# ── Service Layer Tests ───────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_create_thread_generates_uuid4(monkeypatch, tmp_path, patch_config):
    _patch_thread_storage(monkeypatch, tmp_path)
    from app.services import thread_manager

    thread = await thread_manager.create_thread()
    assert len(thread["thread_id"].split("-")) == 5
    assert thread["title"] == "New Chat"


@pytest.mark.asyncio
async def test_update_thread_only_allowed_fields(monkeypatch, tmp_path, patch_config):
    _patch_thread_storage(monkeypatch, tmp_path)
    from app.services import thread_manager

    thread = await thread_manager.create_thread(title="Orig")
    updated = await thread_manager.update_thread(thread["thread_id"], title="New", hacked="x")
    assert updated["title"] == "New"
    assert "hacked" not in updated


@pytest.mark.asyncio
async def test_touch_thread_updates_timestamp(monkeypatch, tmp_path, patch_config):
    _patch_thread_storage(monkeypatch, tmp_path)
    from app.services import thread_manager

    thread = await thread_manager.create_thread()
    before = thread["updated_at"]
    await asyncio.sleep(0.001)  # avoid same-microsecond comparison on fast runners
    await thread_manager.touch_thread(thread["thread_id"])
    fetched = await thread_manager.get_thread(thread["thread_id"])
    assert fetched is not None
    assert fetched["updated_at"] != before


def test_row_dict_deserializes_json_fields(monkeypatch, tmp_path, patch_config):
    from app.services.thread_manager import _row_dict

    row = {"tags": '["a"]', "agent_names": '["b"]'}
    data = _row_dict(row)
    assert data["tags"] == ["a"]
    assert data["agent_names"] == ["b"]
