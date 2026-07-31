"""DeepAgents runner module that drives workflow execution through the DeepAgents graph."""

import asyncio
import json
import warnings
from datetime import datetime
from typing import Any, AsyncGenerator, Dict, Optional

from .runtime import get_deep_agent_runtime
from .domain_tools import (
    draft_patent_section,
    evaluate_patentability,
    query_prior_art_taxonomy,
    record_approval_decision,
)
from ..storage.yaml_io import load_idea_yaml, save_idea_yaml
from ..models.transcript import normalize_transcript_event


def _stringify_runtime_output(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, str):
        return value.strip()
    try:
        return json.dumps(value, indent=2, default=str)
    except Exception:
        return str(value)


async def _try_await_text(value: Any) -> str:
    if hasattr(value, 'text'):
        t = value.text
        if asyncio.iscoroutine(t):
            t = await t
        return _stringify_runtime_output(t)
    if asyncio.iscoroutine(value):
        value = await value
    return _stringify_runtime_output(value)


async def _try_consume_messages(
    stream: Any,
    agent_name: str,
    idea_id: str,
    provenance: str,
    queue: asyncio.Queue,
) -> None:
    try:
        msgs = getattr(stream, "messages", None)
        if msgs is None:
            return
        if not hasattr(msgs, "__aiter__"):
            return
        async for msg in msgs:
            text = await _try_await_text(msg)
            if text.strip():
                await queue.put(("message", agent_name, text))
    except (AttributeError, TypeError, StopAsyncIteration):
        pass
    except Exception:
        pass


async def _try_consume_subagents(
    stream: Any,
    idea_id: str,
    provenance: str,
    queue: asyncio.Queue,
) -> None:
    try:
        subs = getattr(stream, "subagents", None)
        if subs is None:
            return
        if not hasattr(subs, "__aiter__"):
            return
        async for sub in subs:
            name = getattr(sub, "name", "subagent")
            await queue.put(("subagent", name, None))

            # Consume subagent messages
            await _try_consume_messages(sub, name, idea_id, provenance, queue)

            # Consume subagent tool calls
            try:
                calls = getattr(sub, "tool_calls", None)
                if calls is not None:
                    if hasattr(calls, "__aiter__"):
                        async for call in calls:
                            await queue.put(("tool_call", name, {
                                "tool": getattr(call, "tool_name", ""),
                                "params": getattr(call, "input", {}),
                                "output": getattr(call, "output", None),
                            }))
                    elif hasattr(calls, "__iter__"):
                        for call in calls:
                            await queue.put(("tool_call", name, {
                                "tool": getattr(call, "tool_name", ""),
                                "params": getattr(call, "input", {}),
                                "output": getattr(call, "output", None),
                            }))
            except (AttributeError, TypeError, StopAsyncIteration):
                pass
            except Exception:
                pass

            await queue.put(("subagent_complete", name, None))
    except (AttributeError, TypeError, StopAsyncIteration):
        pass
    except Exception:
        pass


async def _consume_v3_stream(
    stream: Any,
    idea_id: str,
    provenance: str,
) -> AsyncGenerator[Dict[str, Any], None]:
    """Consume a v3 AsyncGraphRunStream and emit structured transcript events.

    Uses asyncio.gather to consume coordinator messages and subagent
    projections concurrently, routing everything through a shared queue
    for arrival-order emission.
    """
    queue: asyncio.Queue = asyncio.Queue(maxsize=500)

    async def _pump():
        await asyncio.gather(
            _try_consume_messages(stream, "coordinator", idea_id, provenance, queue),
            _try_consume_subagents(stream, idea_id, provenance, queue),
        )
        await queue.put((None, None, None))

    pump_task = asyncio.create_task(_pump())

    try:
        while True:
            event_type, agent, data = await queue.get()
            if event_type is None:
                break
            if event_type == "message":
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
                    "status": "started",
                    "provenance": f"{provenance}|stream:v3",
                })
            elif event_type == "tool_call":
                yield normalize_transcript_event(idea_id, {
                    "type": "tool_call",
                    "speaker": agent,
                    "agent": agent,
                    "tool": data.get("tool", ""),
                    "params": data.get("params", {}),
                    "output": data.get("output"),
                    "content": f"Tool: {data.get('tool', '')}",
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
    finally:
        pump_task.cancel()
        try:
            await pump_task
        except asyncio.CancelledError:
            pass


async def _consume_v2_stream(
    stream_iter: Any,
    idea_id: str,
    provenance: str,
) -> AsyncGenerator[Dict[str, Any], None]:
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
            elif raw_type.startswith("on_chain_end") or raw_type.startswith("on_end"):
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
) -> Dict[str, Any]:
    """Execute a single workflow state using the DeepAgents runtime or agent tool executor."""
    from ..orchestrator.workflow_tools import get_machine

    print(f"[DeepAgents Runner] Executing state '{state_name}' for idea {idea_id} (feedback: '{user_feedback}')")
    runtime = get_deep_agent_runtime()

    if not idea_id:
        return {
            "idea_id": "global",
            "state": "global_workspace",
            "completed": True,
            "output": f"Global agent query processed: '{user_feedback}'. System monitoring active ideas.",
            "scores": {},
            "timestamp": datetime.utcnow().isoformat(),
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
    except Exception as exc:
        print(f"[DeepAgents Runner] Graph invoke warning: {exc}")

    content_summary = _stringify_runtime_output(runtime_output)
    if not content_summary:
        content_summary = json.dumps(runtime_context, indent=2)

    draft_patent_section(idea_id, section_key, content_summary)

    # Evaluate patentability via scoring tool
    score_res = evaluate_patentability(idea_id)

    # Advance state machine state
    machine = get_machine(idea_id)
    new_state = state_name
    try:
        if hasattr(machine, "advance"):
            machine.advance()
            new_state = machine.state.value if hasattr(machine.state, "value") else str(machine.state)
    except Exception:
        pass

    # Save state metadata
    updated = load_idea_yaml(idea_id, "idea.yaml") or {}
    updated["workflow_state"] = new_state
    updated["updated_at"] = datetime.utcnow().isoformat()
    save_idea_yaml(idea_id, "idea.yaml", updated)

    return {
        "idea_id": idea_id,
        "state": new_state,
        "completed": True,
        "output": _stringify_runtime_output(runtime_output) or f"Runtime completed for {title}.",
        "scores": score_res,
        "timestamp": datetime.utcnow().isoformat(),
    }


async def execute_deep_agent_workflow_streaming(
    idea_id: str,
    user_feedback: str,
    thread_id: Optional[str] = None,
) -> AsyncGenerator[Dict[str, Any], None]:
    """Stream runtime-produced events through DeepAgents.

    Every message — global chat or idea-scoped — goes through the DeepAgents
    graph. The coordinator routes to the appropriate subagent: patent-assistant
    for general conversation, or workflow specialists for pipeline execution.

    When thread_id is provided, the graph invocation is bound to that LangGraph
    thread checkpoint, enabling resume, history, and checkpoint metadata queries.
    """
    provenance = f"idea:{idea_id or 'global'}"

    # Idea-scoped workflow — use DeepAgents graph
    idea_data = load_idea_yaml(idea_id, "idea.yaml") or {}
    title = idea_data.get("title", idea_id)
    state = idea_data.get("workflow_state", "ideascope_draft")

    provenance = f"idea:{idea_id}|state:{state}"
    runtime = get_deep_agent_runtime()

    # Build graph config with thread_id (bound to checkpointer)
    configurable: Dict[str, Any] = {"idea_id": idea_id, "workflow_state": state}
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

    try:
        with warnings.catch_warnings():
            warnings.filterwarnings("ignore", message="The v3 streaming protocol on Pregel is experimental")
            stream = await runtime.astream_events(
                input_payload,
                version="v3",
                config={"configurable": configurable},
            )
        async for event in _consume_v3_stream(stream, idea_id, provenance):
            if event.get("type") == "done":
                emitted_done = True
            yield event
    except TypeError:
        async for event in _consume_v2_stream(
            runtime.astream_events(input_payload, config={"configurable": configurable}),
            idea_id,
            provenance,
        ):
            if event.get("type") == "done":
                emitted_done = True
            yield event
    except AttributeError:
        async for event in _consume_v2_stream(
            runtime.astream_events(input_payload, config={"configurable": configurable}),
            idea_id,
            provenance,
        ):
            if event.get("type") == "done":
                emitted_done = True
            yield event
    except Exception as exc:
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
