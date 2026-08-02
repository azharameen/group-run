"""Tests for idea-scoped threads and SSE streaming."""

from fastapi.testclient import TestClient

from app.api.app import create_app


def _patch_thread_storage(monkeypatch, tmp_path):
    storage_dir = tmp_path / "storage"
    storage_dir.mkdir()

    monkeypatch.setattr("app.config.STORAGE_DIR", str(storage_dir))
    monkeypatch.setattr("app.services.thread_manager.STORAGE_DIR", str(storage_dir))
    monkeypatch.setattr("app.services.thread_manager._THREAD_DB_PATH", None)
    monkeypatch.setattr("app.services.thread_manager._SQLITE_SAVER", None)


class _FakeMessage:
    def __init__(self, text: str):
        # .text is an iterable of deltas, per the DeepAgents docs.
        self.text = [text]


class _FakeStream:
    def __init__(self):
        self.messages = [_FakeMessage("Hello from the agent stream.")]
        self.subagents = []
        self.tool_calls = []

    async def output(self):
        return None

    async def interrupts(self):
        return []


class _FakeChunkMessage:
    def __init__(self):
        self.text = [
            {"id": "ad226d1afdbedae1", "type": "reasoning", "extras": {"status": "in_progress"}},
            {"type": "text", "text": "Hello! How can I help you today?", "id": "8ad2e931812d22f4"},
        ]


class _FakeRuntime:
    async def astream_events(self, *args, **kwargs):
        return _FakeStream()


class _FakeEmptyStream:
    def __init__(self):
        self.messages = []
        self.subagents = []
        self.tool_calls = []

    async def output(self):
        return {
            "messages": [
                {"role": "assistant", "content": "Final answer from fallback output."},
            ]
        }

    async def interrupts(self):
        return []


class _FakeFallbackRuntime:
    async def astream_events(self, *args, **kwargs):
        return _FakeEmptyStream()


class _FakeChunkRuntime:
    async def astream_events(self, *args, **kwargs):
        stream = _FakeStream()
        stream.messages = [_FakeChunkMessage()]
        return stream


class _FakeTokenMessage:
    def __init__(self, deltas):
        self.text = deltas


class _FakeTokenStream:
    def __init__(self):
        self.messages = [_FakeTokenMessage(["Hel", "lo ", "world"])]
        self.subagents = []
        self.tool_calls = []

    async def output(self):
        return None

    async def interrupts(self):
        return []


class _FakeTokenRuntime:
    async def astream_events(self, *args, **kwargs):
        return _FakeTokenStream()


class _FakeToolCall:
    def __init__(self, tool_name, call_input, completed=True, output="done", error=None):
        self.tool_name = tool_name
        self.input = call_input
        self.completed = completed
        self.output = output
        self.error = error
        self.output_deltas = ["out", "put"]


class _FakeToolStream:
    def __init__(self):
        self.messages = []
        self.subagents = []
        self.tool_calls = [_FakeToolCall("search", {"q": "patents"})]

    async def output(self):
        return None

    async def interrupts(self):
        return []


class _FakeToolRuntime:
    async def astream_events(self, *args, **kwargs):
        return _FakeToolStream()


class _FakeSubagent:
    def __init__(self, name):
        self.name = name
        self.status = "started"
        self.messages = [_FakeMessage("subagent result")]
        self.tool_calls = []
        self.subagents = []


class _FakeSubagentStream:
    def __init__(self):
        self.messages = []
        self.subagents = [_FakeSubagent("patent-assistant")]
        self.tool_calls = []

    async def output(self):
        return None

    async def interrupts(self):
        return []


class _FakeSubagentRuntime:
    async def astream_events(self, *args, **kwargs):
        return _FakeSubagentStream()


class _FakeInterruptStream:
    def __init__(self):
        self.messages = []
        self.subagents = []
        self.tool_calls = []

    async def output(self):
        return None

    async def interrupts(self):
        return [
            {"interrupt_id": "intr-123", "value": "Approve edit_file?"}
        ]


class _FakeInterruptRuntime:
    async def astream_events(self, *args, **kwargs):
        return _FakeInterruptStream()


def test_thread_create_uses_idea_id_and_streams(monkeypatch, tmp_path, patch_config):
    _patch_thread_storage(monkeypatch, tmp_path)
    monkeypatch.setattr("app.agent.runner.get_deep_agent_runtime", lambda: _FakeRuntime())

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
        assert '"type": "token"' in body
        assert '"type": "done"' in body


def test_thread_stream_falls_back_to_final_output(monkeypatch, tmp_path, patch_config):
    _patch_thread_storage(monkeypatch, tmp_path)
    monkeypatch.setattr("app.agent.runner.get_deep_agent_runtime", lambda: _FakeFallbackRuntime())

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
    _patch_thread_storage(monkeypatch, tmp_path)
    monkeypatch.setattr("app.agent.runner.get_deep_agent_runtime", lambda: _FakeChunkRuntime())

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
        assert "ad226d1afdbedae1" not in body
        assert '"type": "reasoning"' not in body


def test_thread_stream_emits_token_deltas(monkeypatch, tmp_path, patch_config):
    _patch_thread_storage(monkeypatch, tmp_path)
    monkeypatch.setattr("app.agent.runner.get_deep_agent_runtime", lambda: _FakeTokenRuntime())

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
        body = res.text
        # Each delta should be its own token event, not one big message.
        assert body.count('"type": "token"') >= 3
        assert '"Hel"' in body
        assert '"lo "' in body
        assert '"world"' in body


def test_thread_stream_emits_tool_calls(monkeypatch, tmp_path, patch_config):
    _patch_thread_storage(monkeypatch, tmp_path)
    monkeypatch.setattr("app.agent.runner.get_deep_agent_runtime", lambda: _FakeToolRuntime())

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
        assert '"type": "tool_call"' in body
        assert '"tool": "search"' in body
        assert '"type": "tool_result"' in body


def test_thread_stream_emits_subagents(monkeypatch, tmp_path, patch_config):
    _patch_thread_storage(monkeypatch, tmp_path)
    monkeypatch.setattr("app.agent.runner.get_deep_agent_runtime", lambda: _FakeSubagentRuntime())

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
        assert '"type": "subagent"' in body
        assert "patent-assistant" in body
        assert "subagent result" in body


def test_thread_stream_emits_interrupt(monkeypatch, tmp_path, patch_config):
    _patch_thread_storage(monkeypatch, tmp_path)
    monkeypatch.setattr("app.agent.runner.get_deep_agent_runtime", lambda: _FakeInterruptRuntime())

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
