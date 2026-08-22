"""LangGraph supervisor graph — routes user intent to domain-specialist teams.

The supervisor is the top-level orchestration graph.  It receives user
messages, classifies intent, and dispatches to team subgraphs.  For the
initial EP-1 delivery there is a single "general" team acting as both the
default and fallback route.

Dependencies flow downward only:

    API Routes -> Supervisor (this module) -> Agent Runtime -> Tools & Backends

See architecture spine AD-1 (LangGraph sole orchestration), AD-3
(SqliteSaver singleton), and AD-5 (astream v2).
"""

from __future__ import annotations

import asyncio
import logging
import time
from typing import Annotated, Any, TypedDict

from langchain_core.messages import AIMessage, HumanMessage
from langgraph.graph import StateGraph
from langgraph.graph.message import add_messages

# NOTE: LangGraph 0.6.x compile() returns CompiledStateGraph internally.
# We use Any here for version resilience — the consumer contract is astream().
from ..agent.runtime import get_deep_agent_runtime
from ..config import settings
from ..services.thread_manager import get_async_checkpointer

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Error classification  (AC-2: retry only transient failures)
# ---------------------------------------------------------------------------

_MAX_RETRIES = 2  # total attempts = 3 (initial + 2 retries)


def _is_transient_error(exc: Exception) -> bool:
    """Classify if an error is worth retrying.

    Transient errors include timeouts, rate limits (429), and server errors
    (5xx). Non-transient errors like auth failures (401/403) or bad requests
    (400) are NOT retried.
    """
    if isinstance(exc, (asyncio.TimeoutError, TimeoutError, ConnectionError)):
        return True

    error_str = str(exc).lower()
    # Rate limit indicators
    if any(indicator in error_str for indicator in ("rate limit", "429", "too many requests")):
        return True
    # Server error indicators
    return any(indicator in error_str for indicator in ("500", "502", "503", "504", "internal server"))


def _error_code(exc: Exception) -> str:
    """Map exception to a structured error code."""
    if isinstance(exc, (asyncio.TimeoutError, TimeoutError)):
        return "agent_timeout"

    error_str = str(exc).lower()
    if any(indicator in error_str for indicator in ("rate limit", "429")):
        return "agent_rate_limited"
    if any(indicator in error_str for indicator in ("401", "403", "auth", "unauthorized", "forbidden")):
        return "agent_auth_failed"
    return "agent_failure"


def _user_friendly_error(exc: Exception) -> str:
    """Convert exception to a user-friendly message."""
    if isinstance(exc, (asyncio.TimeoutError, TimeoutError)):
        return "Agent response timed out. Please try again."

    error_str = str(exc).lower()
    if any(indicator in error_str for indicator in ("rate limit", "429")):
        return "Service temporarily busy. Please try again in a moment."
    if any(indicator in error_str for indicator in ("500", "502", "503", "504")):
        return "Service temporarily unavailable. Please try again."

    # Generic fallback — never leak internal details.
    return "An error occurred while processing your request. Please try again."


# ---------------------------------------------------------------------------
# State  (AC-1: TypedDict per spec)
# ---------------------------------------------------------------------------

class SupervisorState(TypedDict, total=False):
    """Top-level state carried through the supervisor graph.

    Fields
    ------
    messages : list[BaseMessage]
        Conversation history; reduced with ``add_messages`` so the graph
        appends / bumps rather than overwrites.
    response : str
        Final text response from whichever team handled the request.
    error : str
        Populated when team invocation fails (never fabricated).
    routing_key : str
        Team key that handled the message ("general" for now).
    """

    messages: Annotated[list[Any], add_messages]
    response: str
    error: str
    routing_key: str


# ---------------------------------------------------------------------------
# Singleton cache  (ECH-3: avoid rebuilding per invocation)
# ---------------------------------------------------------------------------

_agent: Any = None
_graph: Any = None


def _get_agent() -> Any:
    """Return a cached DeepAgents runtime instance."""
    global _agent
    if _agent is None:
        _agent = get_deep_agent_runtime()
    return _agent


# ---------------------------------------------------------------------------
# Nodes
# ---------------------------------------------------------------------------

async def _persist_interrupts(interrupts: Any, thread_id: str, result: dict[str, Any]) -> dict[str, Any]:
    """Persist a HITL interrupt and return a waiting-for-approval state.

    Extracts the action requests from the interrupt value and stores each as a pending
    interrupt with provenance. Returns a state that signals the supervisor to stop and
    wait for the user's decision (resume happens via the resume endpoint).
    """
    from ..services.interrupt_service import InterruptService

    interrupt_value = None
    if isinstance(interrupts, list) and interrupts:
        first = interrupts[0]
        interrupt_value = getattr(first, "value", None) if not isinstance(first, dict) else first.get("value")
    elif isinstance(interrupts, dict):
        interrupt_value = interrupts.get("value")

    action_requests = []
    if isinstance(interrupt_value, dict):
        action_requests = interrupt_value.get("action_requests", []) or []

    for action in action_requests:
        name = action.get("name", "unknown") if isinstance(action, dict) else "unknown"
        args = action.get("args", {}) if isinstance(action, dict) else {}
        message = f"Agent requires approval for '{name}'."
        InterruptService.instance().create_interrupt(
            thread_id=thread_id,
            tool_name=name,
            message=message,
            tool_input=args,
            decided_by="agent",
            confidence="low",
            alternatives=["approve", "reject"],
        )

    return {"waiting_for_approval": True, "routing_key": "general"}


async def supervisor_general(state: SupervisorState) -> dict[str, Any]:
    """Route to the general team via the DeepAgents runtime.

    Invokes the compiled DeepAgents graph with the latest user message and
    returns the response text.  On failure the ``error`` field is populated
    with a structured error shape — we never silently convert failures to
    fabricated success.

    Implements timeout enforcement (AC-1) with configurable timeout via
    ``AGENT_TIMEOUT_SEC`` (default 120s). Transient failures trigger
    exponential backoff retries (AC-2) up to 2 times (3 total attempts).
    """
    # LangGraph passes state as a dict — use .get() for safe access.
    messages: list[Any] = state.get("messages", [])
    user_messages = [m for m in messages if isinstance(m, HumanMessage)]
    if not user_messages:
        return {"response": "", "routing_key": "general"}

    # Build the input the agent expects — a single text string.
    input_text = getattr(user_messages[-1], "content", str(user_messages[-1]))
    if not input_text or not str(input_text).strip():
        return {"response": "", "routing_key": "general"}

    # Extract thread_id for structured logging (AC-7).
    # Thread ID is passed in the configurable config by the chat endpoint.
    thread_id = "unknown"
    try:
        configurable = state.get("configurable", {}) or {}
        thread_id = str(configurable.get("thread_id", "unknown"))
    except Exception:  # thread_id extraction is non-critical
        logger.debug("Failed to extract thread_id from state", exc_info=True)

    agent = _get_agent()
    timeout = settings.agent_timeout_sec
    last_exc: Exception | None = None

    for attempt in range(_MAX_RETRIES + 1):
        start_time = time.monotonic()
        try:
            # The deep agent graph is compiled with the shared checkpointer,
            # which requires a thread_id in the configurable config. Reuse the
            # same thread_id as the supervisor so both graphs checkpoint the
            # same conversation; the supervisor's own checkpoint is written
            # last (after this node returns) and therefore wins for history.
            result = await asyncio.wait_for(
                agent.ainvoke(
                    {"messages": input_text},
                    config={"recursion_limit": 50, "configurable": {"thread_id": thread_id}},
                ),
                timeout=timeout,
            )
            elapsed = time.monotonic() - start_time
            # Safely extract response text — guard against None / unexpected shape.
            if not isinstance(result, dict):
                logger.error("Agent returned unexpected type: %s", type(result))
                return {"error": "agent returned unexpected result type", "routing_key": "general"}

            # Detect a human-in-the-loop interrupt and persist it (Story 8.4).
            interrupts = result.get("__interrupt__")
            if interrupts:
                return await _persist_interrupts(interrupts, thread_id, result)

            response = result.get("output", result.get("messages"))
            if isinstance(response, list) and response:
                last = response[-1]
                # Extract text from AIMessage - handle both string and list content
                content = getattr(last, "content", None)
                if isinstance(content, str):
                    response = content
                elif isinstance(content, list):
                    # Content is a list of content blocks - extract text parts only
                    text_parts = []
                    for block in content:
                        if isinstance(block, dict) and block.get("type") == "text":
                            text_parts.append(block.get("text", ""))
                        elif isinstance(block, str):
                            text_parts.append(block)
                    response = "\n".join(text_parts).strip() if text_parts else str(content)
                else:
                    response = str(content) if content else str(last)
            if response is None or response == "":
                return {"error": "agent returned no output", "routing_key": "general"}
            # Append AI response to messages for persistence in checkpoint
            ai_message = AIMessage(content=response, name="Assistant")
            updated_messages = list(messages) + [ai_message]
            return {"response": response, "routing_key": "general", "messages": updated_messages}

        except TimeoutError as exc:
            elapsed = time.monotonic() - start_time
            last_exc = exc
            logger.error(
                "Agent invocation timed out: thread_id=%s, attempt=%d/%d, elapsed=%.1fs, timeout=%ds",
                thread_id,
                attempt + 1,
                _MAX_RETRIES + 1,
                elapsed,
                timeout,
            )
            if attempt < _MAX_RETRIES:
                delay = 2 ** attempt  # 1s, 2s exponential backoff
                logger.debug("Retrying after timeout: thread_id=%s, delay=%ds", thread_id, delay)
                await asyncio.sleep(delay)
                continue

        except Exception as exc:  # retry loop must classify and handle every agent error
            elapsed = time.monotonic() - start_time
            last_exc = exc
            error_code = _error_code(exc)
            is_transient = _is_transient_error(exc)
            logger.exception(
                "Agent invocation failed: thread_id=%s, attempt=%d/%d, error_type=%s, retryable=%s, elapsed=%.1fs",
                thread_id,
                attempt + 1,
                _MAX_RETRIES + 1,
                error_code,
                is_transient,
                elapsed,
            )
            # Only retry transient errors (AC-2).
            if is_transient and attempt < _MAX_RETRIES:
                delay = 2 ** attempt  # 1s, 2s exponential backoff
                logger.debug("Retrying after transient error: thread_id=%s, delay=%ds", thread_id, delay)
                await asyncio.sleep(delay)
                continue
            # Non-transient errors fail immediately without retry.
            break

    # All retries exhausted or non-transient error — return structured error (AC-3).
    if last_exc is not None:
        return {
            "error": {
                "code": _error_code(last_exc),
                "message": _user_friendly_error(last_exc),
                "retryable": _is_transient_error(last_exc),
            },
            "routing_key": "general",
        }
    return {"error": "agent invocation failed", "routing_key": "general"}


# ---------------------------------------------------------------------------
# Graph builder
# ---------------------------------------------------------------------------

def get_supervisor_graph():
    """Build and return the compiled supervisor graph (cached singleton).

    Uses the global SqliteSaver singleton checkpointer — never creates a
    new one (AD-3).  The compiled graph is cached after first build so
    repeated requests don't reconstruct the StateGraph.

    Returns
    -------
    Compiled graph supporting ``ainvoke`` / ``astream(version="v2")``.
    (Return type is ``Any`` for LangGraph version resilience — 0.6.x
    internals use ``CompiledStateGraph`` rather than ``CompiledGraph``.)
    """
    global _graph
    if _graph is None:
        graph = StateGraph(SupervisorState)
        graph.add_node("general", supervisor_general)
        graph.set_entry_point("general")
        _graph = graph.compile(checkpointer=get_async_checkpointer())
    return _graph
