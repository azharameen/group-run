"""Shared request/response schemas for API routes."""

from typing import Any

from pydantic import BaseModel, Field, HttpUrl

# ── Thread schemas ──────────────────────────────────────────────────────────


class CreateThreadRequest(BaseModel):
    title: str = "New Chat"
    idea_id: str | None = None
    tags: list[str] = []
    agent_names: list[str] = []


class UpdateThreadRequest(BaseModel):
    title: str | None = None
    status: str | None = None
    idea_id: str | None = None
    tags: list[str] | None = None
    agent_names: list[str] | None = None


class SendMessageRequest(BaseModel):
    text: str
    sender: str = "user"
    idea_id: str | None = None


class Interrupt(BaseModel):
    id: str
    thread_id: str
    tool_name: str
    tool_input: dict[str, Any]
    message: str
    status: str
    decision: str | None = None
    reason: str | None = None
    reasoning: str | None = None
    decided_by: str | None = None
    decided_at: str | None = None
    confidence: str | None = None
    alternatives: list[str] = []
    created_at: str
    updated_at: str


class CreateInterruptRequest(BaseModel):
    thread_id: str
    tool_name: str
    message: str
    tool_input: dict[str, Any] = {}
    decided_by: str = "agent"
    confidence: str = "low"
    reasoning: str | None = None
    alternatives: list[str] = []


class InterruptDecisionRequest(BaseModel):
    decision: str
    reason: str = ""
    reasoning: str | None = None


class InterruptResponse(BaseModel):
    interrupt: Interrupt


class ResumeInterruptRequest(BaseModel):
    """Empty body — resume is driven by the interrupt's stored decision."""
    pass


class MCPServer(BaseModel):
    """MCP server configuration."""

    name: str = Field(..., min_length=1, max_length=64)
    transport: str = Field(default="http", pattern="^(http|stdio)$")
    url: str | None = None
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
    description: str | None = None


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


# ── Knowledge Base schemas ─────────────────────────────────────────────────


class KnowledgeDocument(BaseModel):
    """A document in the knowledge base."""

    source: str
    path: str
    filename: str
    content: Any  # Can be dict (sidecar) or str (markdown/text)


class KnowledgeBaseResponse(BaseModel):
    """Response for listing knowledge base documents."""

    documents: list[KnowledgeDocument] = Field(default_factory=list)
    count: int = 0
    sources: dict[str, int] = Field(default_factory=dict)
