"""Shared request/response schemas for API routes."""
from typing import Optional

from pydantic import BaseModel


# ── Thread schemas ──────────────────────────────────────────────────────────


class CreateThreadRequest(BaseModel):
    title: str = "New Chat"
    idea_id: Optional[str] = None
    tags: list[str] = []
    agent_names: list[str] = []


class UpdateThreadRequest(BaseModel):
    title: Optional[str] = None
    status: Optional[str] = None
    idea_id: Optional[str] = None
    tags: Optional[list[str]] = None
    agent_names: Optional[list[str]] = None


class SendMessageRequest(BaseModel):
    text: str
    sender: str = "user"
    idea_id: Optional[str] = None
