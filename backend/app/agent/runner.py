"""DeepAgents runner module that drives workflow execution through the DeepAgents graph."""

import asyncio
import json
import logging
import warnings
from collections.abc import AsyncGenerator
from datetime import UTC, datetime
from typing import Any

_logger = logging.getLogger(__name__)

from ..models.transcript import normalize_transcript_event
from ..providers.adapters import ProviderDefinition
from ..storage.yaml_io import load_idea_yaml, save_idea_yaml
from .domain_tools import (
    draft_patent_section,
)
from .runtime import get_deep_agent_runtime, get_deep_agent_runtime_async


async def resume_agent(
    thread_id: str,
    decisions: list[dict[str, Any]],
    *,
    user_id: str,
    provider_id: str,
    model_id: str,
    provider_definition: ProviderDefinition,
) -> dict[str, Any]:
    """Resume a checkpointed agent run after a HITL decision.

    Re-invokes the DeepAgents runtime with ``Command(resume=...)`` using the
    same thread_id as the original invocation (checkpointer requirement).
    Raises if there is no resumable state — the caller must never fabricate a
    result.
    """
    from langgraph.types import Command

    # Verify a checkpoint exists for this thread before resuming. Interrupts
    # created via the API (no agent run) have no checkpointed state — resuming
    # them must fail with a clear error, never a fabricated result (Story 8.4 AC-5).
    from ..services.thread_manager import get_pg_checkpointer

    checkpointer = await get_pg_checkpointer()
    checkpoint_tuple = await checkpointer.aget_tuple(
        {"configurable": {"thread_id": thread_id}}
    )
    if checkpoint_tuple is None:
        raise RuntimeError(f"no resumable state for thread {thread_id}")

    runtime = await get_deep_agent_runtime_async(
        provider_definition=provider_definition,
        model_id=model_id,
    )
    result = await runtime.ainvoke(
        Command(resume={"decisions": decisions}),
        config={
            "configurable": {
                "thread_id": thread_id,
                "user_id": user_id,
                "provider_id": provider_id,
                "model_id": model_id,
            },
            "context": {
                "user_id": user_id,
                "provider_id": provider_id,
                "model_id": model_id,
            },
        },
    )
    if isinstance(result, dict):
        return result
    return {"output": str(result)}


def _stringify_runtime_output(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, str):
        return value.strip()
    try:
        return json.dumps(value, indent=2, default=str)
    except Exception:  # noqa: BLE001  # fall back to str() for unserializable output
        return str(value)


def _is_text_chunk(value: Any) -> bool:
    if not isinstance(value, dict):
        return False
    chunk_type = str(value.get("type") or "").lower()
    if chunk_type == "reasoning":
        return False
    if chunk_type == "text":
        return True
    return any(
        isinstance(value.get(key), str) and value.get(key).strip()
        for key in ("text", "content", "output", "message")
    )


def _extract_text_from_dict(value: dict[str, Any]) -> str:
    chunk_type = str(value.get("type") or "").lower()
    if chunk_type == "reasoning":
        return ""

    for key in ("text", "content", "output", "message"):
        text = value.get(key)
        if isinstance(text, str) and text.strip():
            return text.strip()
        if isinstance(text, list) and text:
            joined = "".join(_extract_text_from_chunk(item) for item in text)
            if joined.strip():
                return joined.strip()

    if chunk_type == "text":
        nested = value.get("data") or value.get("chunk")
        if nested is not None:
            extracted = _extract_text_from_chunk(nested)
            if extracted:
                return extracted

    return ""


def _extract_text_from_chunk(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, str):
        return value.strip()
    if isinstance(value, dict):
        extracted = _extract_text_from_dict(value)
        if extracted:
            return extracted
    if isinstance(value, list):
        parts = [
            _extract_text_from_chunk(item)
            for item in value
            if not isinstance(item, dict) or _is_text_chunk(item)
        ]
        joined = "".join(part for part in parts if part)
        if joined.strip():
            return joined.strip()
    if hasattr(value, "text"):
        return _extract_text_from_chunk(value.text)
    if hasattr(value, "content"):
        return _extract_text_from_chunk(value.content)
    return _stringify_runtime_output(value)


async def _try_await_text(value: Any) -> str:
    if hasattr(value, 'text'):
        t = value.text
        if asyncio.iscoroutine(t):
            t = await t
        if isinstance(t, list):
            extracted = "".join(
                _extract_text_from_chunk(item)
                for item in t
                if not isinstance(item, dict) or _is_text_chunk(item)
            )
            if extracted.strip():
                return extracted.strip()
        return _extract_text_from_chunk(t)
    if asyncio.iscoroutine(value):
        value = await value
    return _extract_text_from_chunk(value)


async def _iter_projection(projection: Any):
    """Yield items from a projection whether it is async or sync iterable."""
    if projection is None:
        return
    if hasattr(projection, "__aiter__"):
        async for item in projection:
            yield item
    elif hasattr(projection, "__iter__"):
        for item in projection:
            yield item


async def _iter_text_deltas(message: Any):
    """Yield text deltas from a ChatModelStream's .text projection.

    The projection is an iterable of deltas per the DeepAgents docs. We
    defensively handle a plain string, a coroutine, or a list of chunk
    frames (e.g. reasoning/text dicts) as well.
    """
    text = getattr(message, "text", None)
    if text is None:
        return
    if asyncio.iscoroutine(text):
        text = await text
    if isinstance(text, str):
        if text.strip():
            yield text
        return
    async for delta in _iter_projection(text):
        if isinstance(delta, str):
            if delta:
                yield delta
        elif isinstance(delta, dict) and not _is_text_chunk(delta):
            # Skip reasoning-only frames (e.g. {"type": "reasoning", ...}).
            continue
        else:
            extracted = _extract_text_from_chunk(delta)
            if extracted:
                yield extracted


async def _iter_reasoning_deltas(message: Any):
    """Yield reasoning deltas from a ChatModelStream's .reasoning projection."""
    reasoning = getattr(message, "reasoning", None)
    if reasoning is None:
        return
    if asyncio.iscoroutine(reasoning):
        reasoning = await reasoning
    if isinstance(reasoning, str):
        if reasoning.strip():
            yield reasoning
        return
    async for delta in _iter_projection(reasoning):
        if isinstance(delta, str):
            if delta:
                yield delta
        else:
            extracted = _extract_text_from_chunk(delta)
            if extracted:
                yield extracted


async def _consume_messages(
    stream: Any,
    agent_name: str,
    queue: asyncio.Queue,
) -> None:
    """Consume a message projection, emitting reasoning and token deltas."""
    msgs = getattr(stream, "messages", None)
    if msgs is None:
        return
    try:
        async for msg in _iter_projection(msgs):
            async for delta in _iter_reasoning_deltas(msg):
                await queue.put(("reasoning", agent_name, delta))
            async for delta in _iter_text_deltas(msg):
                await queue.put(("token", agent_name, delta))
    except (AttributeError, TypeError, StopAsyncIteration):
        return
    except Exception:
        _logger.exception("Error while consuming messages")
        return


async def _consume_tool_calls(
    stream: Any,
    agent_name: str,
    queue: asyncio.Queue,
) -> None:
    """Consume the tool-call lifecycle projection (start, deltas, result)."""
    calls = getattr(stream, "tool_calls", None)
    if calls is None:
        return
    try:
        async for call in _iter_projection(calls):
            tool_name = getattr(call, "tool_name", "") or getattr(call, "name", "")
            call_input = getattr(call, "input", {})
            completed = bool(getattr(call, "completed", False))
            error = getattr(call, "error", None)
            output = getattr(call, "output", None)

            await queue.put(("tool_call", agent_name, {
                "tool": tool_name,
                "params": call_input,
            }))

            try:
                deltas = getattr(call, "output_deltas", None)
                async for delta in _iter_projection(deltas):
                    if delta:
                        await queue.put(("tool_delta", agent_name, {
                            "tool": tool_name,
                            "delta": str(delta),
                        }))
            except (AttributeError, TypeError, StopAsyncIteration):
                return
            except Exception:
                _logger.exception("Error while consuming tool deltas")
                return

            if completed or error is not None:
                await queue.put(("tool_result", agent_name, {
                    "tool": tool_name,
                    "output": output,
                    "error": error,
                }))
    except (AttributeError, TypeError, StopAsyncIteration):
        pass
    except Exception:  # projection errors must not kill the stream pump
        _logger.debug("Error while consuming tool calls", exc_info=True)


async def _consume_subagents(
    stream: Any,
    queue: asyncio.Queue,
) -> None:
    """Consume subagent projections, recursing into nested streams."""
    subs = getattr(stream, "subagents", None)
    if subs is None:
        return
    try:
        async for sub in _iter_projection(subs):
            name = getattr(sub, "name", "subagent")
            status = getattr(sub, "status", "started")
            await queue.put(("subagent", name, {"status": status}))

            await _consume_messages(sub, name, queue)
            await _consume_tool_calls(sub, name, queue)
            await _consume_subagents(sub, queue)

            await queue.put(("subagent_complete", name, None))
    except (AttributeError, TypeError, StopAsyncIteration):
        pass
    except Exception:  # projection errors must not kill the stream pump
        _logger.debug("Error while consuming subagents", exc_info=True)


async def _extract_final_message_text(output: Any) -> str:
    """Extract the last assistant message text from a final state dict."""
    if output is None:
        return ""
    if isinstance(output, str):
        return output.strip()
    if isinstance(output, dict):
        messages = output.get("messages")
        if isinstance(messages, list) and messages:
            for msg in reversed(messages):
                if isinstance(msg, dict):
                    role = msg.get("role") or msg.get("type") or ""
                    if role in ("assistant", "ai"):
                        content = msg.get("content")
                        if isinstance(content, str) and content.strip():
                            return content.strip()
                        if isinstance(content, list):
                            parts = []
                            for block in content:
                                if isinstance(block, dict) and block.get("text"):
                                    parts.append(block["text"])
                            joined = "".join(parts).strip()
                            if joined:
                                return joined
                elif hasattr(msg, "content"):
                    content = msg.content
                    if isinstance(content, str) and content.strip():
                        return content.strip()
        for key in ("output", "content", "text"):
            value = output.get(key)
            if value:
                extracted = await _extract_final_message_text(value)
                if extracted:
                    return extracted
    if hasattr(output, "content"):
        return await _extract_final_message_text(output.content)
    if hasattr(output, "text"):
        return await _extract_final_message_text(output.text)
    return ""


async def _consume_v3_stream(
    stream: Any,
    idea_id: str,
    provenance: str,
) -> AsyncGenerator[dict[str, Any], None]:
    """Consume a v3 AsyncGraphRunStream and emit structured transcript events.

    Consumes the message, tool-call, and subagent projections concurrently
    (per the DeepAgents docs' async pattern) and routes everything through a
    shared queue for arrival-order emission. Text and reasoning are emitted
    as token-level deltas so the frontend can render incrementally.

    When the projections yield no content (e.g. a model that does not emit
    content-block deltas), falls back to the run's final state via the async
    ``output()`` method and emits the last assistant message.
    """
    queue: asyncio.Queue = asyncio.Queue(maxsize=500)
    emitted_content = False

    async def _pump():
        await asyncio.gather(
            _consume_messages(stream, "coordinator", queue),
            _consume_tool_calls(stream, "coordinator", queue),
            _consume_subagents(stream, queue),
        )
        await queue.put((None, None, None))

    pump_task = asyncio.create_task(_pump())

    try:
        while True:
            event_type, agent, data = await queue.get()
            if event_type is None:
                break
            if event_type == "token":
                emitted_content = True
                yield normalize_transcript_event(idea_id, {
                    "type": "token",
                    "speaker": agent,
                    "agent": agent,
                    "content": data,
                    "provenance": f"{provenance}|stream:v3",
                })
            elif event_type == "reasoning":
                yield normalize_transcript_event(idea_id, {
                    "type": "reasoning",
                    "speaker": agent,
                    "agent": agent,
                    "content": data,
                    "provenance": f"{provenance}|stream:v3",
                })
            elif event_type == "message":
                emitted_content = True
                yield normalize_transcript_event(idea_id, {
                    "type": "message",
                    "speaker": agent,
                    "agent": agent,
                    "content": data,
                    "provenance": f"{provenance}|stream:v3",
                })
            elif event_type == "subagent":
                yield normalize_transcript_event(idea_id, {
                    "type": "subagent",
                    "speaker": agent,
                    "agent": agent,
                    "content": f"Subagent {agent} started",
                    "status": data.get("status", "started"),
                    "provenance": f"{provenance}|stream:v3",
                })
            elif event_type == "subagent_complete":
                yield normalize_transcript_event(idea_id, {
                    "type": "subagent",
                    "speaker": agent,
                    "agent": agent,
                    "content": f"Subagent {agent} completed",
                    "status": "completed",
                    "provenance": f"{provenance}|stream:v3",
                })
            elif event_type == "tool_call":
                yield normalize_transcript_event(idea_id, {
                    "type": "tool_call",
                    "speaker": agent,
                    "agent": agent,
                    "tool": data.get("tool", ""),
                    "params": data.get("params", {}),
                    "content": f"Tool: {data.get('tool', '')}",
                    "provenance": f"{provenance}|stream:v3",
                })
            elif event_type == "tool_delta":
                yield normalize_transcript_event(idea_id, {
                    "type": "tool_result",
                    "speaker": agent,
                    "agent": agent,
                    "tool": data.get("tool", ""),
                    "content": data.get("delta", ""),
                    "provenance": f"{provenance}|stream:v3",
                })
            elif event_type == "tool_result":
                yield normalize_transcript_event(idea_id, {
                    "type": "tool_result",
                    "speaker": agent,
                    "agent": agent,
                    "tool": data.get("tool", ""),
                    "output": data.get("output"),
                    "content": str(data.get("error") or data.get("output") or ""),
                    "provenance": f"{provenance}|stream:v3",
                })

        # Fall back to the final state when no content deltas arrived.
        if not emitted_content:
            try:
                output_fn = getattr(stream, "output", None)
                final_output = await output_fn() if callable(output_fn) else None
                fallback_text = await _extract_final_message_text(final_output)
                if fallback_text:
                    yield normalize_transcript_event(idea_id, {
                        "type": "message",
                        "speaker": "assistant",
                        "agent": "assistant",
                        "content": fallback_text,
                        "provenance": f"{provenance}|stream:v3:output",
                    })
            except Exception:  # fallback text extraction is best-effort
                _logger.debug("Error extracting final message text", exc_info=True)

        # Detect a human-in-the-loop interrupt in the final state.
        try:
            interrupts_fn = getattr(stream, "interrupts", None)
            interrupts = await interrupts_fn() if callable(interrupts_fn) else None
            if interrupts:
                for intr in interrupts:
                    interrupt_id = (
                        getattr(intr, "interrupt_id", "")
                        if not isinstance(intr, dict)
                        else intr.get("interrupt_id", "")
                    )
                    value = (
                        getattr(intr, "value", None)
                        if not isinstance(intr, dict)
                        else intr.get("value", None)
                    )
                    yield normalize_transcript_event(idea_id, {
                        "type": "interrupt",
                        "speaker": "workflow-orchestrator",
                        "agent": "workflow-orchestrator",
                        "interrupt_id": str(interrupt_id),
                        "content": str(value or "Action requires approval"),
                        "provenance": f"{provenance}|stream:v3",
                    })
        except Exception:  # interrupt detection is best-effort
            _logger.debug("Error detecting interrupts", exc_info=True)
    finally:
        pump_task.cancel()
        await pump_task


def _looks_like_v3_stream(stream: Any) -> bool:
    return any(hasattr(stream, attr) for attr in ("messages", "subagents", "output"))


async def _consume_v2_stream(
    stream_iter: Any,
    idea_id: str,
    provenance: str,
) -> AsyncGenerator[dict[str, Any], None]:
    """Fallback: consume raw v2 StreamEvent dicts from astream_events."""
    emitted_done = False
    try:
        async for payload in stream_iter:
            if payload is None:
                continue
            if not isinstance(payload, dict):
                continue

            raw_type = str(payload.get("type") or payload.get("event") or "")
            event_type = raw_type
            if raw_type.startswith("on_tool"):
                event_type = "tool_call" if raw_type.endswith("start") else "tool_result"
            elif raw_type.startswith("on_chat_model_stream"):
                event_type = "token"
            elif raw_type.startswith(("on_chain_end", "on_end")):
                event_type = "completion"

            content = ""
            data = payload.get("data", {}) or {}
            if isinstance(data, dict):
                chunk = data.get("chunk", data.get("output", data.get("content", "")))
                if isinstance(chunk, dict):
                    content = str(chunk.get("content", chunk.get("text", json.dumps(chunk))))
                elif isinstance(chunk, str):
                    content = chunk
                else:
                    content = _stringify_runtime_output(chunk)
            elif isinstance(data, str):
                content = data

            if event_type == "token" and not content.strip():
                continue

            event = {
                "type": event_type,
                "speaker": "runtime",
                "agent": "runtime",
                "content": content,
                "provenance": provenance,
            }
            if raw_type == "done":
                emitted_done = True

            yield normalize_transcript_event(idea_id, event)

            if raw_type == "done":
                break
    except StopAsyncIteration:
        pass

    if not emitted_done:
        yield normalize_transcript_event(idea_id, {
            "type": "done",
            "speaker": "workflow-orchestrator",
            "role": "workflow",
            "content": "Runtime stream complete.",
            "provenance": provenance,
        })


def execute_deep_agent_workflow(
    idea_id: str = "",
    state_name: str = "ideascope_draft",
    executor_func_name: str = "draft_patent_section",
    archive_filename: str = "",
    user_feedback: str = "",
) -> dict[str, Any]:
    """Execute a workflow step using the DeepAgents runtime.

    NOTE: This function is legacy FSM-era code. The state machine
    advancement and scoring calls have been removed. The function now only
    invokes the DeepAgents graph and drafts patent sections.
    TODO: Replace with LangGraph-based workflow execution.
    """
    print(f"[DeepAgents Runner] Executing state '{state_name}' for idea {idea_id} (feedback: '{user_feedback}')")
    runtime = get_deep_agent_runtime()

    if not idea_id:
        return {
            "idea_id": "global",
            "state": "global_workspace",
            "completed": True,
            "output": f"Global agent query processed: '{user_feedback}'. System monitoring active ideas.",
            "scores": {},
            "timestamp": datetime.now(UTC).isoformat(),
        }

    idea_data = load_idea_yaml(idea_id, "idea.yaml") or {}
    title = idea_data.get("title", idea_id)
    problem = idea_data.get("problem_statement", "")
    solution = idea_data.get("solution_concept", "")
    runtime_context = {
        "idea_id": idea_id,
        "workflow_state": state_name,
        "title": title,
        "problem_statement": problem,
        "solution_concept": solution,
        "user_feedback": user_feedback,
    }

    # Execute state domain logic using subagent tools
    section_key = state_name.replace(" ", "_").lower()
    runtime_output: Any = None
    try:
        input_payload = {
            "messages": [
                {
                    "role": "user",
                    "content": json.dumps(runtime_context, indent=2),
                }
            ],
            **runtime_context,
        }
        runtime_output = runtime.invoke(input_payload)
    except Exception as exc:  # noqa: BLE001  # keep drafting with context even if invoke fails
        print(f"[DeepAgents Runner] Graph invoke warning: {exc}")

    content_summary = _stringify_runtime_output(runtime_output)
    if not content_summary:
        content_summary = json.dumps(runtime_context, indent=2)

    draft_patent_section(idea_id, section_key, content_summary)

    # Save state metadata
    updated = load_idea_yaml(idea_id, "idea.yaml") or {}
    updated["workflow_state"] = state_name
    updated["updated_at"] = datetime.now(UTC).isoformat()
    save_idea_yaml(idea_id, "idea.yaml", updated)

    return {
        "idea_id": idea_id,
        "state": state_name,
        "completed": True,
        "output": _stringify_runtime_output(runtime_output) or f"Runtime completed for {title}.",
        "scores": {},
        "timestamp": datetime.now(UTC).isoformat(),
    }


async def execute_deep_agent_workflow_streaming(
    idea_id: str,
    user_feedback: str,
    thread_id: str | None = None,
    *,
    user_id: str = "",
    provider_id: str = "",
    model_id: str = "",
    provider_definition: ProviderDefinition | None = None,
) -> AsyncGenerator[dict[str, Any], None]:
    """Stream runtime-produced events through DeepAgents.

    Every message — global chat or idea-scoped — goes through the DeepAgents
    graph. The coordinator routes to the appropriate subagent: patent-assistant
    for general conversation, or workflow specialists for pipeline execution.

    When thread_id is provided, the graph invocation is bound to that LangGraph
    thread checkpoint, enabling resume, history, and checkpoint metadata queries.
    """
    provenance = f"idea:{idea_id or 'global'}"

    # Idea-scoped workflow — use DeepAgents graph. Global threads carry an
    # empty idea_id, which has no workspace file (load_idea_yaml rejects it).
    idea_data = (load_idea_yaml(idea_id, "idea.yaml") or {}) if idea_id else {}
    title = idea_data.get("title", idea_id)
    state = idea_data.get("workflow_state", "ideascope_draft")

    provenance = f"idea:{idea_id}|state:{state}"
    runtime = await get_deep_agent_runtime_async(
        provider_definition=provider_definition,
        model_id=model_id,
    )

    # Build graph config with thread_id (bound to checkpointer)
    configurable: dict[str, Any] = {
        "idea_id": idea_id,
        "workflow_state": state,
        "user_id": user_id,
        "provider_id": provider_id,
        "model_id": model_id,
    }
    if thread_id:
        configurable["thread_id"] = thread_id

    input_payload = {
        "messages": [
            {
                "role": "user",
                "content": json.dumps(
                    {
                        "idea_id": idea_id,
                        "title": title,
                        "workflow_state": state,
                        "user_feedback": user_feedback,
                    },
                    indent=2,
                ),
            }
        ],
        "idea_id": idea_id,
        "workflow_state": state,
        "user_feedback": user_feedback,
    }

    emitted_done = False
    stream = None

    try:
        with warnings.catch_warnings():
            warnings.filterwarnings("ignore", message="The v3 streaming protocol on Pregel is experimental")
            stream = await runtime.astream_events(
                input_payload,
                version="v3",
                config={
                    "configurable": configurable,
                    "context": {
                        "user_id": user_id,
                        "idea_id": idea_id,
                        "workflow_state": state,
                        "provider_id": provider_id,
                        "model_id": model_id,
                    },
                },
            )
        if _looks_like_v3_stream(stream):
            async for event in _consume_v3_stream(stream, idea_id, provenance):
                if event.get("type") == "done":
                    emitted_done = True
                yield event
        else:
            async for event in _consume_v2_stream(stream, idea_id, provenance):
                if event.get("type") == "done":
                    emitted_done = True
                yield event
    except (TypeError, AttributeError):
        with warnings.catch_warnings():
            warnings.filterwarnings("ignore", message="The v3 streaming protocol on Pregel is experimental")
            raw_stream = await runtime.astream_events(
                input_payload,
                config={
                    "configurable": configurable,
                    "context": {
                        "user_id": user_id,
                        "idea_id": idea_id,
                        "workflow_state": state,
                        "provider_id": provider_id,
                        "model_id": model_id,
                    },
                },
            )
        if _looks_like_v3_stream(raw_stream):
            async for event in _consume_v3_stream(raw_stream, idea_id, provenance):
                if event.get("type") == "done":
                    emitted_done = True
                yield event
        else:
            async for event in _consume_v2_stream(raw_stream, idea_id, provenance):
                if event.get("type") == "done":
                    emitted_done = True
                yield event
    except Exception as exc:  # noqa: BLE001  # stream contract: always end with a failed event
        yield normalize_transcript_event(idea_id, {
            "type": "failed",
            "speaker": "workflow-orchestrator",
            "role": "orchestrator",
            "content": str(exc),
            "reason": str(exc),
            "provenance": provenance,
        })
        emitted_done = True

    if not emitted_done:
        yield normalize_transcript_event(idea_id, {
            "type": "done",
            "speaker": "workflow-orchestrator",
            "role": "workflow",
            "content": "Runtime stream complete.",
            "provenance": provenance,
        })
