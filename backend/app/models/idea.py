"""Lean Pydantic models for ideas."""

from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field


class Idea(BaseModel):
    """Simple CRUD data model for an idea."""

    idea_id: str = ""
    title: str = ""
    signal_text: str = ""
    problem_statement: str = ""
    solution_concept: str = ""
    tags: list[str] = Field(default_factory=list)
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)


class IdeaRegistry(BaseModel):
    """Registry container for idea persistence."""

    ideas: list[dict[str, Any]] = Field(default_factory=list)
    next_id: int = 1
