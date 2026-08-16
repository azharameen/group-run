"""Typed transcript event models shared by runtime, storage, and API layers."""

from __future__ import annotations

from datetime import UTC, datetime
from enum import Enum
from typing import Any
from uuid import uuid4

from pydantic import BaseModel, Field


class TranscriptEventType(str, Enum):
    thinking = "thinking"
    tool_call = "tool_call"
    tool_result = "tool_result"
    subagent = "subagent"
    handover = "handover"
    interrupt = "interrupt"
    approval = "approval"
    retry = "retry"
    failed = "failed"
    completion = "completion"
    done = "done"
    token = "token"
    tasks_update = "tasks_update"
    transition = "transition"
    user_message = "user_message"
    message = "message"


class TranscriptRole(str, Enum):
    user = "user"
    orchestrator = "orchestrator"
    subagent = "subagent"
    reviewer = "reviewer"
    tool = "tool"
    workflow = "workflow"
    system = "system"


class TranscriptEvent(BaseModel):
    id: str = ""
    idea_id: str = ""
    type: TranscriptEventType
    timestamp: str = Field(default_factory=lambda: datetime.now(UTC).isoformat())
    speaker: str = ""
    role: TranscriptRole = TranscriptRole.system
    agent: str = ""
    content: str = ""
    tool: str = ""
    params: dict[str, Any] = Field(default_factory=dict)
    output: Any = None
    action: str = ""
    from_agent: str = ""
    to_agent: str = ""
    interrupt_id: str = ""
    decision: str = ""
    reason: str = ""
    provenance: str = ""
    state: str = ""
    status: str = ""
    trust: str = ""
    metadata: dict[str, Any] = Field(default_factory=dict)


def _default_role(event_type: str, speaker: str, explicit_role: str | None) -> str:
    if explicit_role:
        return explicit_role
    if event_type == TranscriptEventType.user_message.value:
        return TranscriptRole.user.value
    if event_type == TranscriptEventType.message.value:
        return TranscriptRole.subagent.value if speaker else TranscriptRole.system.value
    if event_type in {
        TranscriptEventType.tool_call.value,
        TranscriptEventType.tool_result.value,
    }:
        return TranscriptRole.tool.value
    if event_type in {
        TranscriptEventType.interrupt.value,
        TranscriptEventType.approval.value,
        TranscriptEventType.retry.value,
        TranscriptEventType.failed.value,
    }:
        return TranscriptRole.reviewer.value if speaker else TranscriptRole.system.value
    if event_type in {
        TranscriptEventType.handover.value,
        TranscriptEventType.completion.value,
        TranscriptEventType.transition.value,
    }:
        return TranscriptRole.orchestrator.value
    return TranscriptRole.subagent.value if speaker else TranscriptRole.system.value


def _default_trust(event_type: str) -> str:
    if event_type in {
        TranscriptEventType.user_message.value,
        TranscriptEventType.tool_result.value,
        TranscriptEventType.approval.value,
        TranscriptEventType.interrupt.value,
    }:
        return "trusted"
    if event_type == TranscriptEventType.tool_call.value:
        return "verified-tool-call"
    return "generated"


def normalize_transcript_event(idea_id: str, event: dict[str, Any]) -> dict[str, Any]:
    """Fill in stable transcript metadata without mutating the original payload."""
    payload = dict(event)
    event_type = str(payload.get("type") or TranscriptEventType.thinking.value)
    speaker = str(payload.get("speaker") or payload.get("agent") or payload.get("from_agent") or payload.get("to_agent") or "")
    payload["id"] = str(payload.get("id") or f"evt_{uuid4().hex}")
    payload["idea_id"] = idea_id or str(payload.get("idea_id") or "")
    payload["type"] = event_type
    payload["timestamp"] = str(payload.get("timestamp") or datetime.now(UTC).isoformat())
    payload["speaker"] = speaker
    payload["agent"] = str(payload.get("agent") or speaker)
    payload["role"] = _default_role(event_type, speaker, payload.get("role"))
    payload["trust"] = str(payload.get("trust") or _default_trust(event_type))
    payload.setdefault("params", {})
    payload.setdefault("metadata", {})
    if not payload.get("provenance"):
        payload["provenance"] = f"transcript:{payload['idea_id']}:{event_type}:{payload['id']}"
    return payload
