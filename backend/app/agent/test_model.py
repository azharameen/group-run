"""Deterministic mock LLM for the ``openai:test-model`` sentinel (NFR-A10).

CI (E2E job + backend test job) and local E2E runs configure
``DEEPAGENTS_MODEL=openai:test-model``. That value is a *sentinel*, not a
real model: instead of instantiating ``ChatOpenAI`` (which would make live
network calls with a throwaway API key and fail with auth errors), the
agent runtime substitutes :class:`DeterministicTestChatModel` — a local
:class:`~langchain_core.language_models.chat_models.BaseChatModel` that

- returns a fixed, deterministic response (no network, no randomness),
- simulates a short streaming/generation delay (``~2s``) so the frontend
  streaming state (stop button) is observable for E2E assertions, and
- never emits tool calls (``bind_tools`` is a no-op returning ``self``),
  which keeps deepagents' agent loop to a single deterministic turn.

No test or CI flow that uses the sentinel ever reaches an LLM provider.
"""

from __future__ import annotations

import asyncio
from collections.abc import AsyncIterator, Iterator, Sequence
from typing import Any

from langchain_core.callbacks import AsyncCallbackManagerForLLMRun, CallbackManagerForLLMRun
from langchain_core.language_models.chat_models import BaseChatModel
from langchain_core.messages import AIMessage, AIMessageChunk, BaseMessage
from langchain_core.outputs import ChatGeneration, ChatGenerationChunk, ChatResult

# Sentinel value expected in ``settings.deepagents_model`` (and in
# ``teams.yaml`` ``model: auto`` resolution) to activate the mock model.
TEST_MODEL_SENTINEL = "openai:test-model"

# Deterministic reply body — stable across runs so E2E assertions can rely
# on exact content.
DEFAULT_RESPONSE = (
    "This is a deterministic mock response generated for automated E2E testing. "
    "No live model was called."
)

# Streaming shape: split the response into N chunks with a delay between
# each. Total async generation delay is ``CHUNK_COUNT * CHUNK_DELAY``
# (5 * 0.45s ~= 2.25s) — long enough for Playwright polling to observe the
# streaming state, short enough to keep the E2E suite fast.
CHUNK_COUNT = 5
CHUNK_DELAY = 0.45


def _split_chunks(text: str, count: int = CHUNK_COUNT) -> list[str]:
    """Split text into ``count`` roughly-equal non-empty chunks."""
    if count <= 1 or not text:
        return [text]
    size = (len(text) + count - 1) // count
    return [text[i * size : (i + 1) * size] for i in range(count) if text[i * size : (i + 1) * size]]


class DeterministicTestChatModel(BaseChatModel):
    """A local, deterministic chat model used in place of a real LLM.

    It implements the standard ``BaseChatModel`` surface (sync/async
    generate + stream) so it can be passed to ``create_deep_agent`` in
    place of a model string. Tool binding is intentionally a no-op: the
    mock never produces tool calls, so the agent graph always terminates
    in a single model turn with a text response.
    """

    llm_type: str = "deterministic-test-model"
    response: str = DEFAULT_RESPONSE

    @property
    def _llm_type(self) -> str:  # pragma: no cover - trivial
        return self.llm_type

    # ── Sync ────────────────────────────────────────────────────────────

    def _generate(
        self,
        messages: list[BaseMessage],
        stop: list[str] | None = None,
        run_manager: CallbackManagerForLLMRun | None = None,
        **kwargs: Any,
    ) -> ChatResult:
        return ChatResult(generations=[ChatGeneration(message=AIMessage(content=self.response))])

    def _stream(
        self,
        messages: list[BaseMessage],
        stop: list[str] | None = None,
        run_manager: CallbackManagerForLLMRun | None = None,
        **kwargs: Any,
    ) -> Iterator[ChatGenerationChunk]:
        for chunk in _split_chunks(self.response):
            yield ChatGenerationChunk(message=AIMessageChunk(content=chunk))

    # ── Async ───────────────────────────────────────────────────────────

    async def _agenerate(
        self,
        messages: list[BaseMessage],
        stop: list[str] | None = None,
        run_manager: AsyncCallbackManagerForLLMRun | None = None,
        **kwargs: Any,
    ) -> ChatResult:
        # Simulate generation latency so the client's streaming state
        # (isGenerating / stop button) is observable for a bounded window.
        await asyncio.sleep(CHUNK_COUNT * CHUNK_DELAY)
        return ChatResult(generations=[ChatGeneration(message=AIMessage(content=self.response))])

    async def _astream(
        self,
        messages: list[BaseMessage],
        stop: list[str] | None = None,
        run_manager: AsyncCallbackManagerForLLMRun | None = None,
        **kwargs: Any,
    ) -> AsyncIterator[ChatGenerationChunk]:
        for chunk in _split_chunks(self.response):
            yield ChatGenerationChunk(message=AIMessageChunk(content=chunk))
            await asyncio.sleep(CHUNK_DELAY)

    # ── Tooling: the mock never calls tools ─────────────────────────────

    def bind_tools(
        self,
        tools: Sequence[dict[str, Any] | type | Any],
        **kwargs: Any,
    ) -> DeterministicTestChatModel:
        """No-op tool binding — the deterministic model never emits tool calls."""
        return self


def resolve_chat_model(model: str) -> str | DeterministicTestChatModel:
    """Resolve a configured model string to the concrete model to use.

    Returns :class:`DeterministicTestChatModel` when ``model`` equals the
    :data:`TEST_MODEL_SENTINEL`; otherwise returns the string unchanged so
    ``create_deep_agent`` instantiates the real provider client.
    """
    if model == TEST_MODEL_SENTINEL:
        return DeterministicTestChatModel()
    return model
