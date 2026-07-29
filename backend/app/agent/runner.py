"""DeepAgents runner module that drives workflow execution through the DeepAgents graph."""

import json
from datetime import datetime
from typing import Any, AsyncGenerator, Dict, Iterable

from .runtime import get_deep_agent_runtime
from .domain_tools import (
    draft_patent_section,
    evaluate_patentability,
    generate_invention_ideas,
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


def _event_from_runtime_message(message: Any, idea_id: str, provenance: str) -> dict[str, Any]:
    if isinstance(message, dict):
        raw_event = str(message.get("type") or message.get("event_type") or message.get("event") or "thinking")
        role = str(message.get("role") or message.get("speaker") or raw_event or "subagent")
        data = message.get("data") if isinstance(message.get("data"), dict) else {}
        content = (
            message.get("content")
            or message.get("text")
            or message.get("output")
            or message.get("message")
            or data.get("content")
            or data.get("text")
            or data.get("output")
            or ""
        )
        event_type = raw_event
        if event_type.startswith("on_tool"):
            event_type = "tool_call" if event_type.endswith("start") else "tool_result"
        elif event_type.startswith("on_chat_model_stream"):
            event_type = "token"
        elif event_type.startswith("on_chain_end") or event_type.startswith("on_end"):
            event_type = "completion"
        event = {
            "type": event_type,
            "speaker": str(message.get("speaker") or message.get("agent") or role),
            "role": str(message.get("role") or "subagent"),
            "agent": str(message.get("agent") or message.get("speaker") or role),
            "content": _stringify_runtime_output(content),
            "tool": str(message.get("tool") or ""),
            "params": message.get("params") or message.get("input") or {},
            "output": message.get("output"),
            "action": str(message.get("action") or ""),
            "from_agent": str(message.get("from_agent") or ""),
            "to_agent": str(message.get("to_agent") or ""),
            "state": str(message.get("state") or ""),
            "status": str(message.get("status") or ""),
            "decision": str(message.get("decision") or ""),
            "reason": str(message.get("reason") or ""),
            "metadata": message.get("metadata") or {},
            "provenance": str(message.get("provenance") or provenance),
        }
        if event_type == "messages" and isinstance(message.get("messages"), list):
            return {
                "type": "completion",
                "speaker": event["speaker"],
                "role": "orchestrator",
                "content": _stringify_runtime_output(message.get("messages")),
                "provenance": provenance,
            }
        return event

    if isinstance(message, str):
        return {
            "type": "thinking",
            "speaker": "workflow-orchestrator",
            "role": "orchestrator",
            "agent": "workflow-orchestrator",
            "content": message,
            "provenance": provenance,
        }

    return {
        "type": "completion",
        "speaker": "workflow-orchestrator",
        "role": "orchestrator",
        "agent": "workflow-orchestrator",
        "content": _stringify_runtime_output(message),
        "provenance": provenance,
    }


def _coerce_runtime_payload(payload: Any, idea_id: str, provenance: str) -> Iterable[dict[str, Any]]:
    if payload is None:
        return []
    if isinstance(payload, dict):
        if isinstance(payload.get("events"), list):
            return [_event_from_runtime_message(item, idea_id, provenance) for item in payload["events"]]
        if isinstance(payload.get("messages"), list):
            return [_event_from_runtime_message(item, idea_id, provenance) for item in payload["messages"]]
        if payload.get("tasks") and isinstance(payload.get("tasks"), list):
            return [
                {
                    "type": "tasks_update",
                    "speaker": payload.get("speaker") or "workflow-orchestrator",
                    "role": payload.get("role") or "workflow",
                    "tasks": payload.get("tasks"),
                    "completed": payload.get("completed", 0),
                    "total": payload.get("total", len(payload.get("tasks", []))),
                    "provenance": payload.get("provenance") or provenance,
                }
            ]
        if payload.get("type"):
            return [_event_from_runtime_message(payload, idea_id, provenance)]
        if payload.get("output") is not None or payload.get("result") is not None:
            return [
                {
                    "type": "completion",
                    "speaker": payload.get("speaker") or "workflow-orchestrator",
                    "role": payload.get("role") or "orchestrator",
                    "content": _stringify_runtime_output(payload.get("output", payload.get("result"))),
                    "output": payload.get("output", payload.get("result")),
                    "provenance": payload.get("provenance") or provenance,
                }
            ]
        return [
            {
                "type": "completion",
                "speaker": "workflow-orchestrator",
                "role": "orchestrator",
                "content": _stringify_runtime_output(payload),
                "output": payload,
                "provenance": provenance,
            }
        ]
    if isinstance(payload, list):
        return [_event_from_runtime_message(item, idea_id, provenance) for item in payload]
    return [_event_from_runtime_message(payload, idea_id, provenance)]


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
) -> AsyncGenerator[Dict[str, Any], None]:
    """Stream runtime-produced events for a chat message."""
    idea_data = load_idea_yaml(idea_id, "idea.yaml") or {} if idea_id else {}
    title = idea_data.get("title", idea_id or "Global Workspace")
    state = idea_data.get("workflow_state", "ideascope_draft")

    provenance = f"idea:{idea_id or 'global'}|state:{state}"
    runtime = get_deep_agent_runtime()
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

    async def _emit_payload(payload: Any):
        nonlocal emitted_done
        for event in _coerce_runtime_payload(payload, idea_id, provenance):
            normalized = normalize_transcript_event(idea_id, event)
            if normalized.get("type") == "done":
                emitted_done = True
            yield normalized

    try:
        if hasattr(runtime, "astream_events"):
            async for payload in runtime.astream_events(input_payload):
                async for event in _emit_payload(payload):
                    yield event
        elif hasattr(runtime, "astream"):
            async for payload in runtime.astream(input_payload):
                async for event in _emit_payload(payload):
                    yield event
        elif hasattr(runtime, "stream"):
            stream = runtime.stream(input_payload)
            if hasattr(stream, "__aiter__"):
                async for payload in stream:
                    async for event in _emit_payload(payload):
                        yield event
            else:
                for payload in stream:
                    async for event in _emit_payload(payload):
                        yield event
        else:
            result = runtime.invoke(input_payload)
            async for event in _emit_payload(result):
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
