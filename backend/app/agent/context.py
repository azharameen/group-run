"""Runtime context types for the DeepAgents integration."""

from pydantic import BaseModel


class DeepAgentContext(BaseModel):
    """Per-run context passed into the DeepAgents runtime."""

    user_id: str = ""
    org_id: str = "companion"
    idea_id: str = ""
    workflow_state: str = ""
    provider_id: str = ""
    model_id: str = ""
