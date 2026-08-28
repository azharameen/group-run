"""Shared request/response schemas for API routes."""

from typing import Any

from pydantic import BaseModel, ConfigDict, Field, HttpUrl

# ── Thread schemas ──────────────────────────────────────────────────────────


class CreateThreadRequest(BaseModel):
    title: str = Field(default="New Chat", max_length=200)
    idea_id: str | None = Field(default=None, max_length=64)
    tags: list[str] = Field(default_factory=list, max_length=50)
    agent_names: list[str] = Field(default_factory=list, max_length=50)


class UpdateThreadRequest(BaseModel):
    title: str | None = Field(default=None, max_length=200)
    status: str | None = Field(default=None, max_length=50)
    idea_id: str | None = Field(default=None, max_length=64)
    tags: list[str] | None = Field(default=None, max_length=50)
    agent_names: list[str] | None = Field(default=None, max_length=50)


class SendMessageRequest(BaseModel):
    text: str = Field(..., min_length=1, max_length=10000)
    sender: str = Field(default="user", max_length=100)
    idea_id: str | None = Field(default=None, max_length=64)
    provider_id: str | None = Field(default=None, max_length=64)
    model_id: str | None = Field(default=None, max_length=200)


class UserProfile(BaseModel):
    uid: str
    email: str | None = None
    display_name: str | None = None
    photo_url: str | None = None
    provider: str
    created_at: str
    updated_at: str
    last_sign_in_at: str


class AuthBootstrapResponse(BaseModel):
    user: UserProfile
    is_new_user: bool


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
    thread_id: str = Field(..., min_length=1, max_length=64)
    tool_name: str = Field(..., min_length=1, max_length=128)
    message: str = Field(..., min_length=1, max_length=2000)
    tool_input: dict[str, Any] = Field(default_factory=dict)
    decided_by: str = "agent"
    confidence: str = "low"
    reasoning: str | None = None
    alternatives: list[str] = []


class InterruptDecisionRequest(BaseModel):
    decision: str = Field(..., min_length=1, max_length=50)
    reason: str = Field(default="", max_length=2000)
    reasoning: str | None = None


class InterruptResponse(BaseModel):
    interrupt: Interrupt


class ResumeInterruptRequest(BaseModel):
    """Empty body — resume is driven by the interrupt's stored decision."""


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


# ── Provider configuration schemas ──────────────────────────────────────────


class ProviderConfigRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    provider: str = Field(..., min_length=1, max_length=32)
    name: str = Field(..., min_length=1, max_length=120)
    endpoint: str | None = Field(default=None, max_length=500)
    credentials: dict[str, Any] | None = None
    is_enabled: bool = False


class ProviderEnabledRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    is_enabled: bool


class ProviderConfigResponse(BaseModel):
    provider_id: str
    provider: str
    name: str
    endpoint: str
    is_enabled: bool
    has_credentials: bool = False
    created_at: str
    updated_at: str


class ProviderListResponse(BaseModel):
    providers: list[ProviderConfigResponse] = Field(default_factory=list)
    count: int = 0


class ProviderTestResponse(BaseModel):
    provider_id: str
    provider: str
    success: bool
    message: str


class ProviderModel(BaseModel):
    model_id: str
    display_name: str


class ProviderCatalogGroup(BaseModel):
    provider_id: str
    provider: str
    name: str
    endpoint: str
    is_enabled: bool
    available: bool
    message: str
    models: list[ProviderModel] = Field(default_factory=list)


class ProviderCatalogResponse(BaseModel):
    groups: list[ProviderCatalogGroup] = Field(default_factory=list)


class ProviderDefaultRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    provider_id: str = Field(..., min_length=1, max_length=64)
    model_id: str = Field(..., min_length=1, max_length=200)


class ProviderDefaultResponse(BaseModel):
    provider_id: str
    model_id: str
    provider: str
    name: str
    updated_at: str


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
