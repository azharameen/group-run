"""Config reload endpoints for teams.yaml and mcp.json."""

from __future__ import annotations

import logging

from fastapi import APIRouter, HTTPException, status

from ...agent import runtime
from ..schemas import ConfigReloadResponse, MCPReloadResponse

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/config", tags=["config"])


@router.post("/reload", response_model=ConfigReloadResponse)
def reload_config() -> ConfigReloadResponse:
    """Reload and re-validate teams.yaml, updating in-memory config.

    Returns 200 with the reloaded teams list on success, 400 with the
    validation failure detail otherwise. The original config is preserved
    if validation fails.
    """
    try:
        new_config = runtime._reload_teams_config()
    except ValueError as exc:
        logger.warning("Teams config reload failed: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        ) from exc

    teams = list(new_config.get("teams", {}).keys())
    return ConfigReloadResponse(
        teams=teams,
        count=len(teams),
        message="Teams config reloaded successfully",
    )


@router.post("/reload-mcp", response_model=MCPReloadResponse)
def reload_mcp_config() -> MCPReloadResponse:
    """Validate mcp.json and return the current server list.

    Reads ``config/mcp.json`` fresh from disk and validates its structure.
    New agent instances will pick up any server changes automatically.

    Returns 200 with the server list on success, 400 with validation error.
    """
    try:
        servers = runtime._validate_mcp_config()
    except ValueError as exc:
        logger.warning("MCP config validation failed: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        ) from exc

    names = [s["name"] for s in servers if s.get("name")]
    return MCPReloadResponse(
        servers=names,
        count=len(names),
        message="MCP config validated successfully",
    )
