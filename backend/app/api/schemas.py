"""Shared request/response schemas for API routes."""

from typing import Any, Optional

from pydantic import BaseModel, Field, HttpUrl


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


class Interrupt(BaseModel):
    id: str
    thread_id: str
    tool_name: str
    tool_input: dict[str, Any]
    message: str
    status: str
    decision: Optional[str] = None
    reason: Optional[str] = None
    created_at: str
    updated_at: str


class CreateInterruptRequest(BaseModel):
    thread_id: str
    tool_name: str
    message: str
    tool_input: dict[str, Any] = {}


class InterruptDecisionRequest(BaseModel):
    decision: str
    reason: str = ""


class InterruptResponse(BaseModel):
    interrupt: Interrupt


class MCPServer(BaseModel):
    """MCP server configuration."""

    name: str = Field(..., min_length=1, max_length=64)
    transport: str = Field(default="http", pattern="^(http|stdio)$")
    url: Optional[str] = None
    timeout: int = Field(default=10, ge=1, le=300)
    options: dict = Field(default_factory=dict)


class AddMCPServerRequest(BaseModel):
    """Request to add a new HTTP MCP server."""

    name: str = Field(..., min_length=1, max_length=64)
    url: HttpUrl
    timeout: int = Field(default=10, ge=1, le=300)
    options: dict = Field(default_factory=dict)


class MCPServerResponse(BaseModel):
    """Response for a single MCP server."""

    name: str
    transport: str = "http"
    url: str
    timeout: int = 10
    options: dict = Field(default_factory=dict)


class ListMCPServersResponse(BaseModel):
    """Response for listing MCP servers."""

    servers: list[MCPServerResponse] = Field(default_factory=list)
    count: int = 0


# ── Config reload schemas ───────────────────────────────────────────────────


class ConfigReloadRequest(BaseModel):
    """Request to reload teams.yaml. Empty body — reload is idempotent."""


class ConfigReloadResponse(BaseModel):
    """Response for a successful teams.yaml reload."""

    teams: list[str] = Field(default_factory=list)
    count: int = 0
    message: str = "Teams config reloaded successfully"


class MCPReloadResponse(BaseModel):
    """Response for a successful mcp.json validation."""

    servers: list[str] = Field(default_factory=list)
    count: int = 0
    message: str = "MCP config validated successfully"


# ── Team Config schemas ────────────────────────────────────────────────────


class AgentDefinition(BaseModel):
    """Agent definition within a team."""

    name: str
    role: str
    description: Optional[str] = None


class TeamDefinition(BaseModel):
    """Team definition from teams.yaml."""

    name: str
    description: str
    agents: list[AgentDefinition]
    routing_keys: list[str]
    # subgraph excluded to avoid leaking internal orchestration details (AD-13)


class TeamConfigResponse(BaseModel):
    """Full team configuration response."""

    schema_version: str
    teams: dict[str, TeamDefinition]
