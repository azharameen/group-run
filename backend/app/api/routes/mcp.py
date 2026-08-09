"""MCP server management endpoints."""

from __future__ import annotations

import json
import logging
from pathlib import Path

from fastapi import APIRouter, HTTPException, status
from pydantic import ValidationError

from ...config import MCP_CONFIG_PATH, MCP_SCHEMA_VERSION
from ..schemas import AddMCPServerRequest, ListMCPServersResponse, MCPServerResponse

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/mcp/servers", tags=["mcp"])


class MCPServerManagementService:
    """Manage MCP server configurations in mcp.json."""

    def _load_config(self) -> dict:
        path = Path(MCP_CONFIG_PATH)
        if not path.exists():
            return {"schema_version": MCP_SCHEMA_VERSION, "servers": []}
        content = path.read_text(encoding="utf-8")
        if not content.strip():
            return {"schema_version": MCP_SCHEMA_VERSION, "servers": []}
        try:
            data = json.loads(content)
        except json.JSONDecodeError as exc:
            logger.error("Invalid JSON in %s: %s", MCP_CONFIG_PATH, exc)
            raise ValueError(f"Invalid JSON in {MCP_CONFIG_PATH}: {exc}") from exc
        if not isinstance(data, dict):
            raise ValueError(f"Invalid MCP config structure in {MCP_CONFIG_PATH}")
        if data.get("schema_version") not in (None, MCP_SCHEMA_VERSION):
            logger.warning(
                "MCP schema version mismatch: expected %s, got %s",
                MCP_SCHEMA_VERSION,
                data.get("schema_version"),
            )
        data.setdefault("schema_version", MCP_SCHEMA_VERSION)
        data.setdefault("servers", [])
        return data

    def _save_config(self, data: dict) -> None:
        path = Path(MCP_CONFIG_PATH)
        path.parent.mkdir(parents=True, exist_ok=True)
        data["schema_version"] = MCP_SCHEMA_VERSION
        path.write_text(json.dumps(data, indent=2), encoding="utf-8")
        logger.info("MCP config updated: %s", MCP_CONFIG_PATH)

    def list_servers(self) -> list[dict]:
        return self._load_config().get("servers", [])

    def add_server(self, server_config: dict) -> dict:
        config = self._load_config()
        servers = config.get("servers", [])
        name = server_config["name"]
        if any(existing.get("name") == name for existing in servers):
            raise ValueError(f"Server '{name}' already exists")
        servers.append(server_config)
        config["servers"] = servers
        self._save_config(config)
        logger.info("MCP server added: %s", name)
        return server_config

    def remove_server(self, name: str) -> dict:
        config = self._load_config()
        servers = config.get("servers", [])
        for index, server in enumerate(servers):
            if server.get("name") == name:
                removed = servers.pop(index)
                config["servers"] = servers
                self._save_config(config)
                logger.info("MCP server removed: %s", name)
                return removed
        raise ValueError(f"Server '{name}' not found")

    def get_server(self, name: str) -> dict:
        for server in self.list_servers():
            if server.get("name") == name:
                return server
        raise ValueError(f"Server '{name}' not found")


_service = MCPServerManagementService()


@router.get("/", response_model=ListMCPServersResponse)
def list_servers() -> ListMCPServersResponse:
    servers = _service.list_servers()
    http_servers = [s for s in servers if s.get("transport", "http") == "http"]
    try:
        return ListMCPServersResponse(
            servers=[MCPServerResponse(**s) for s in http_servers],
            count=len(http_servers),
        )
    except ValidationError as exc:
        logger.error("Malformed server entry in mcp.json: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Malformed server entry in configuration",
        ) from exc


@router.post("/", status_code=status.HTTP_201_CREATED, response_model=MCPServerResponse)
def add_server(payload: AddMCPServerRequest) -> MCPServerResponse:
    server = {
        "name": payload.name,
        "transport": "http",
        "url": str(payload.url),
        "timeout": payload.timeout,
        "options": payload.options,
    }
    try:
        return MCPServerResponse(**_service.add_server(server))
    except ValueError as exc:
        message = str(exc)
        if "already exists" in message:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=message) from exc
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=message) from exc


@router.delete("/{name}", response_model=MCPServerResponse)
def remove_server(name: str) -> MCPServerResponse:
    try:
        return MCPServerResponse(**_service.remove_server(name))
    except ValueError as exc:
        message = str(exc)
        if "not found" in message:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=message) from exc
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=message) from exc


@router.get("/{name}", response_model=MCPServerResponse)
def get_server(name: str) -> MCPServerResponse:
    try:
        return MCPServerResponse(**_service.get_server(name))
    except (ValueError, ValidationError) as exc:
        message = str(exc)
        if "not found" in message:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=message) from exc
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=message) from exc
