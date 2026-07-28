"""Runtime context types for the DeepAgents integration."""

from pydantic import BaseModel


class DeepAgentContext(BaseModel):
    """Per-run context passed into the DeepAgents runtime."""

    user_id: str = "system"
    org_id: str = "siemens"
    idea_id: str = ""
    workflow_state: str = ""
