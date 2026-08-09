---
title: 'Story 5.1: Create MCP Server Management API'
type: 'feature'
created: '2026-08-09'
status: 'in-review'
review_loop_iteration: 0
baseline_revision: 'e36aeb7'
final_revision: ''
followup_review_recommended: false
context:
  - '{project-root}/_bmad-output/project-context.md'
warnings: []
---

## Intent

**Problem:** MCP server configuration is currently file-only (`config/mcp.json`). Users cannot dynamically add, remove, or list MCP servers through the API. Any configuration change requires manual file editing and application restart.

**Approach:** Create a REST API at `/api/mcp/servers` that allows:
- GET list of configured MCP servers
- POST to add a new HTTP MCP server (validates, persists to mcp.json)
- DELETE to remove an MCP server by name
- GET {name} to retrieve a specific server config

The API reads/writes `config/mcp.json` directly, maintaining schema version "1.0" compatibility.

---

## Boundaries & Constraints

**Always:**
- Read `config/mcp.json` fresh on each request (no caching)
- Validate server name is unique before adding
- Validate JSON writes produce valid mcp.json format
- Return HTTP 409 Conflict when adding duplicate server name
- Return HTTP 404 Not Found when removing/listing non-existent server
- Use Pydantic models for request/response validation
- Follow existing API route patterns (router prefix, tags, error handling)

**Block If:**
- `config/mcp.json` contains invalid JSON that cannot be parsed
- Schema version mismatch prevents safe writes

**Never:**
- Modify mcp.json schema structure or schema_version
- Change stdio server format (only HTTP servers are managed)
- Invalidate existing file-first precedence (AD-14 pattern)

---

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| List servers (has servers) | mcp.json with 2 servers | 200 with server list | — |
| List servers (empty) | mcp.json with `servers: []` | 200 with empty list | — |
| Add valid HTTP server | Valid AddMCPServerRequest | 201, server in mcp.json | — |
| Add duplicate name | mcp.json has server with same name | 409 Conflict | Error message includes name |
| Add invalid URL | URL doesn't start with http:// or https:// | 422 Validation Error | Pydantic validates URL field |
| Remove existing server | mcp.json has server with name | 200, server removed | — |
| Remove non-existent server | mcp.json has no server with name | 404 Not Found | Error message includes name |
| Get existing server | mcp.json has server with name | 200 with server config | — |
| Get non-existent server | mcp.json has no server with name | 404 Not Found | Error message includes name |
| mcp.json doesn't exist | File missing | 200 with empty list (CREATE on first add) | — |
| mcp.json has invalid JSON | Corrupted file | 500 Internal Server Error | Log error, don't crash app |
| mcp.json schema version mismatch | schema_version != "1.0" | 500 with version warning | Log warning, allow reads |

---

## Code Map

- `backend/app/api/routes/mcp.py` — **NEW**: MCP management router with all endpoints
- `backend/app/api/schemas.py` — **ADD**: MCP-related Pydantic models
- `backend/app/api/app.py` — **ADD**: Import and register MCP router
- `backend/tests/test_mcp_api.py` — **NEW**: API endpoint tests
- `config/mcp.json` — **REFERENCE**: Target file being managed

---

## Tasks & Acceptance

**Execution:**
1. [x] Create Pydantic models in `schemas.py`:
   - [x] `MCPServer` — server representation (name, transport, url, timeout, options)
   - [x] `AddMCPServerRequest` — POST body (name, url, timeout, options)
   - [x] `MCPServerResponse` — single server response
   - [x] `ListMCPServersResponse` — list response with count

2. [x] Create `MCPServerManagementService` in `mcp.py`:
   - [x] `load_servers()` — read and parse mcp.json
   - [x] `add_server()` — validate uniqueness, append, write
   - [x] `remove_server()` — find and remove, write
   - [x] `get_server()` — find and return

3. [x] Create FastAPI router in `mcp.py`:
   - [x] `GET /api/mcp/servers` — list all servers
   - [x] `POST /api/mcp/servers` — add HTTP server (201)
   - [x] `DELETE /api/mcp/servers/{name}` — remove server
   - [x] `GET /api/mcp/servers/{name}` — get specific server

4. [x] Register router in `app.py`

5. [x] Write tests in `test_mcp_api.py`:
   - [x] Test list empty servers
   - [x] Test list servers with data
   - [x] Test add server success
   - [x] Test add duplicate server (409)
   - [x] Test add server with invalid URL (422)
   - [x] Test remove server success
   - [x] Test remove non-existent server (404)
   - [x] Test get server success
   - [x] Test get non-existent server (404)
   - [x] Test mcp.json doesn't exists handling

**Acceptance Criteria:**
- [x] Given mcp.json exists with servers, when GET /api/mcp/servers, then return 200 with server list
- [x] Given mcp.json exists, when POST with valid server config, then return 201 and server is persisted
- [x] Given mcp.json has a server, when POST with same name, then return 409 Conflict
- [x] Given mcp.json has a server, when DELETE with server name, then return 200 and server is removed
- [x] Given mcp.json doesn't have a server, when DELETE with name, then return 404 Not Found
- [x] Given mcp.json has a server, when GET /api/mcp/servers/{name}, then return 200 with server config
- [x] All tests pass (pytest backend/tests/test_mcp_api.py — 10/10 passed)

---

## Auto Run Result

**Status:** Implementation complete — 10/10 tests passing, 157/157 backend tests passing (0 regressions)

**Artifacts Created:**
- `backend/app/api/routes/mcp.py` (134 lines) — MCPServerManagementService + FastAPI router (4 endpoints)
- `backend/app/api/schemas.py` — 4 MCP Pydantic models added (MCPServer, AddMCPServerRequest, MCPServerResponse, ListMCPServersResponse)
- `backend/app/api/app.py` — mcp_router import and registration added
- `backend/tests/test_mcp_api.py` (104 lines) — 10 API tests with tmp_path isolation

**Test Results:**
- `test_mcp_api.py`: 10/10 passed (list empty/list with data, add success/duplicate/invalid URL, remove success/not found, get success/not found, config missing)
- Full backend suite: 157 passed, 8 skipped, 0 failures, 0 errors

**Deferred Work:** None

---

## Dev Agent Guardrails

### Technical Requirements

**File Format:** mcp.json uses array-of-objects format:
```json
{
  "schema_version": "1.0",
  "servers": [
    {
      "name": "server-name",
      "transport": "http",
      "url": "http://localhost:3001/mcp",
      "timeout": 10,
      "options": {
        "headers": {}
      }
    }
  ]
}
```

**Schema Constants** (from `backend/app/config.py`):
- `MCP_CONFIG_PATH = os.path.join(CONFIG_DIR, "mcp.json")` — use this path, don't hardcode
- `MCP_SCHEMA_VERSION = "1.0"` — must match when writing
- `DEFAULT_MCP_TIMEOUT = 10` — default timeout in seconds (from runtime.py line 27)

**API Pattern** (follow interrupts.py as reference):
```python
from fastapi import APIRouter, HTTPException, status
router = APIRouter(prefix="/api/mcp/servers", tags=["mcp"])
```

**Error Response Pattern:**
```python
raise HTTPException(
    status_code=status.HTTP_409_CONFLICT,
    detail=f"Server '{name}' already exists"
)
```

### Architecture Compliance

**Service Pattern:** Follow `InterruptService` singleton pattern — but since MCP management is stateless file I/O, inline service calls in route handlers are acceptable (no shared state needed).

**File I/O Safety:**
- Always read fresh from disk (no caching)
- Use `try/except json.JSONDecodeError` for corrupted files
- Write atomically: parse → modify → serialize → write
- Guard against `yaml.safe_load()` returning None (empty file pattern from ST-4.1)

**Config Precedence (AD-14):** File-first pattern is preserved. API only modifies mcp.json. The env var fallback (`MCP_SERVERS`) is untouched — it's used only when file doesn't exist.

### Library/Framework Requirements

**Use existing dependencies only:**
- `fastapi` (for APIRouter, HTTPException, status codes)
- `json` (standard library, for file I/O)
- `pydantic` (BaseModel for schemas)
- `pathlib.Path` (for file operations, use mcp.json path from config.py)

**Do NOT install new packages.** MCP client libraries (`langchain_mcp_adapters`) are in `runtime.py`, not this story.

### File Structure Requirements

```
backend/
  app/
    api/
      routes/
        mcp.py (NEW — main implementation)
      schemas.py (ADD — MCP models section)
      app.py (ADD — router registration)
  tests/
    test_mcp_api.py (NEW — comprehensive tests)
```

### Testing Requirements

**Test Pattern** (follow `test_interrupt_service.py` and `test_interrupt_endpoints.py`):
```python
import pytest
from fastapi.testclient import TestClient
from ..app.api.app import create_app

def test_list_empty_servers():
    client = TestClient(create_app())
    response = client.get("/api/mcp/servers")
    assert response.status_code == 200
```

**Test Scope:**
- API endpoint tests with TestClient (integration level)
- File manipulation tests (verify mcp.json is modified correctly)
- Error handling tests (404, 409, 422, 500)
- Edge cases: empty file, missing file, invalid JSON

**Use TempFile fixture** for isolated mcp.json testing — don't pollute shared config!

---

## Previous Story Intelligence

**From Epic 4 (HITL Approvals):**
- API route pattern: FastAPI routers with prefix/tags, HTTPException for errors
- Test pattern: pytest with TestClient, mock services for isolation
- File I/O pattern: Use pathlib.Path, handle exceptions, log errors
- Schema pattern: Pydantic BaseModel with field validators

**From Epic 3 (Ideas Management):**
- CRUD API pattern: ideas.py shows create/list/update/delete operations
- File registry pattern: registry.py shows YAML read/write with error handling

**From Epic 1 (Agentic Chat):**
- MCP loading in runtime.py already converts array format to dict for client
- Config precedence: file-first, env var fallback only when missing
- Schema versioning is checked but non-blocking (warnings only)

### Key Learnings for This Story:
1. **File I/O isolation is critical** — tests must use temp files, not shared config
2. **Empty file handling** — `yaml.safe_load("")` returns None, add None guards
3. **Error responses need bodies** — tests should assert error message content, not just status codes
4. **Schema validation at boundaries** — validate input before file writes

---

## Git Intelligence Summary

**Recent commits show patterns:**
- `e36aeb7` — Deferred debt fixes (asyncio.run(), teams validation, SQLite connections)
- `a6710c8` — Epic 4 retrospective completion
- `eb6f6c2` — Story 4.7 deferred items (frontend tests)

**Implementation patterns from recent work:**
- Backend routes: FastAPI routers with error handling
- Tests: pytest with TempFile for config isolation (learned from 4.1)
- File changes: Small, focused commits per story

---

## Design Notes

### Service Class Design

```python
import json
from pathlib import Path
from typing import Optional
from ...config import MCP_CONFIG_PATH, MCP_SCHEMA_VERSION

class MCPServerManagementService:
    """Manage MCP server configurations in mcp.json."""
    
    def _load_config(self) -> dict:
        """Load and parse mcp.json. Returns empty structure if missing."""
        path = Path(MCP_CONFIG_PATH)
        if not path.exists():
            return {"schema_version": MCP_SCHEMA_VERSION, "servers": []}
        
        content = path.read_text(encoding="utf-8")
        if not content.strip():
            return {"schema_version": MCP_SCHEMA_VERSION, "servers": []}
        
        try:
            data = json.loads(content)
        except json.JSONDecodeError as e:
            raise ValueError(f"Invalid JSON in {MCP_CONFIG_PATH}: {e}")
        
        version = data.get("schema_version", MCP_SCHEMA_VERSION)
        if version and version != MCP_SCHEMA_VERSION:
            logger.warning(
                "MCP schema version mismatch: expected %s, got %s",
                MCP_SCHEMA_VERSION, version
            )
        
        return data
    
    def _save_config(self, data: dict) -> None:
        """Write config to mcp.json atomically."""
        path = Path(MCP_CONFIG_PATH)
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(data, indent=2), encoding="utf-8")
        logger.info("MCP config updated: %s", MCP_CONFIG_PATH)
    
    def list_servers(self) -> list[dict]:
        """Return list of configured MCP servers."""
        config = self._load_config()
        return config.get("servers", [])
    
    def add_server(self, server_config: dict) -> dict:
        """Add a new MCP server. Raises ValueError if name exists."""
        config = self._load_config()
        servers = config.get("servers", [])
        
        for existing in servers:
            if existing.get("name") == server_config["name"]:
                raise ValueError(f"Server '{server_config['name']}' already exists")
        
        servers.append(server_config)
        config["servers"] = servers
        self._save_config(config)
        
        logger.info("MCP server added: %s", server_config["name"])
        return server_config
    
    def remove_server(self, name: str) -> dict:
        """Remove server by name. Raises ValueError if not found."""
        config = self._load_config()
        servers = config.get("servers", [])
        
        for i, server in enumerate(servers):
            if server.get("name") == name:
                removed = servers.pop(i)
                config["servers"] = servers
                self._save_config(config)
                logger.info("MCP server removed: %s", name)
                return removed
        
        raise ValueError(f"Server '{name}' not found")
    
    def get_server(self, name: str) -> dict:
        """Get server by name. Raises ValueError if not found."""
        servers = self.list_servers()
        for server in servers:
            if server.get("name") == name:
                return server
        raise ValueError(f"Server '{name}' not found")
```

### Pydantic Models for schemas.py

```python
from pydantic import BaseModel, Field, HttpUrl
from typing import Optional

class MCPServer(BaseModel):
    """MCP server configuration."""
    name: str = Field(..., min_length=1, max_length=64)
    transport: str = Field(default="http", pattern="^(http|stdio)$")
    url: Optional[HttpUrl] = None  # Required for HTTP transport
    timeout: int = Field(default=10, ge=1, le=300)
    options: dict = Field(default_factory=dict)

class AddMCPServerRequest(BaseModel):
    """Request to add a new MCP server."""
    name: str = Field(..., min_length=1, max_length=64)
    url: HttpUrl  # Enforces HTTP/HTTPS URL format
    timeout: int = Field(default=10, ge=1, le=300)
    options: dict = Field(default_factory=dict)

class MCPServerResponse(BaseModel):
    """Response for a single MCP server."""
    name: str
    transport: str
    url: str
    timeout: int
    options: dict = {}

class ListMCPServersResponse(BaseModel):
    """Response for listing MCP servers."""
    servers: list[MCPServerResponse] = []
    count: int = 0
```

### Router Pattern

```python
from fastapi import APIRouter, HTTPException, status
from ..schemas import AddMCPServerRequest, MCPServerResponse, ListMCPServersResponse

router = APIRouter(prefix="/api/mcp/servers", tags=["mcp"])

@router.get("/")
def list_servers() -> ListMCPServersResponse:
    servers = MCPServerManagementService.list_servers()
    return ListMCPServersResponse(
        servers=[MCPServerResponse(**s) for s in servers],
        count=len(servers)
    )

@router.post("/", status_code=status.HTTP_201_CREATED)
def add_server(request: AddMCPServerRequest) -> MCPServerResponse:
    try:
        server_config = {
            "name": request.name,
            "transport": "http",
            "url": str(request.url),
            "timeout": request.timeout,
            "options": request.options,
        }
        result = MCPServerManagementService.add_server(server_config)
        return MCPServerResponse(**result)
    except ValueError as e:
        error_msg = str(e)
        if "already exists" in error_msg:
            raise HTTPException(status_code=409, detail=error_msg)
        raise HTTPException(status_code=400, detail=error_msg)

@router.delete("/{name}")
def remove_server(name: str) -> MCPServerResponse:
    try:
        result = MCPServerManagementService.remove_server(name)
        return MCPServerResponse(**result)
    except ValueError as e:
        error_msg = str(e)
        if "not found" in error_msg:
            raise HTTPException(status_code=404, detail=error_msg)
        raise HTTPException(status_code=400, detail=error_msg)

@router.get("/{name}")
def get_server(name: str) -> MCPServerResponse:
    try:
        result = MCPServerManagementService.get_server(name)
        return MCPServerResponse(**result)
    except ValueError as e:
        error_msg = str(e)
        if "not found" in error_msg:
            raise HTTPException(status_code=404, detail=error_msg)
        raise HTTPException(status_code=400, detail=error_msg)
```

---

## Verification

**Commands:**
```bash
# Run MCP API tests
cd backend && pytest tests/test_mcp_api.py -v

# Verify all backend tests still pass
cd backend && pytest -v

# Manual API testing
curl http://localhost:8000/api/mcp/servers
curl -X POST http://localhost:8000/api/mcp/servers \
  -H "Content-Type: application/json" \
  -d '{"name": "test-server", "url": "http://localhost:3001/mcp", "timeout": 15}'
curl -X DELETE http://localhost:8000/api/mcp/servers/test-server
```

---

## Spec Change Log

## Review Triage Log

## Auto Run Result

## Project Context Reference

**Project:** Companion AI Ideation Platform
**Epic:** EP-5: MCP & Team Config
**Story Position:** 1 of 8 (first backend story)
**Dependencies:** EP-4 (HITL Approvals) — completed
**Next Stories:** ST-5.2 (config reload endpoint), ST-5.3 (MCP tool loading update)

**Related Stories:**
- ST-5.2 (config reload) — will call MCP service to trigger config reload
- ST-5.3 (MCP tool loading) — will read from same mcp.json format
- ST-5.6 (MCP UI) — will consume this API directly

---

## Completion Status

**Status:** ready-for-dev
**Context Engine Analysis:** Complete — comprehensive developer guide created with:
- ✅ Full API endpoint specifications
- ✅ Pydantic model definitions
- ✅ Service class implementation design
- ✅ Test requirements with patterns
- ✅ Edge case handling matrix
- ✅ File structure requirements
- ✅ Previous story intelligence
- ✅ Architecture compliance rules
- ✅ Code examples for all components

---

## Review Triage Log

### 2026-08-09 — Review pass
- intent_gap: 0
- bad_spec: 0
- patch: 2: (high 1, medium 1)
- defer: 1: (medium 1)
- reject: 1
- addressed_findings:
  - [high] [patch] Filter stdio servers from list/GET responses (spec says "only HTTP servers are managed") — added HTTP-only transport filter to list endpoint
  - [medium] [patch] Wrap Pydantic construction in try/except for malformed config entries — added ValidationError handling in list and GET endpoints
  - defer: Race condition on concurrent file writes (pre-existing file I/O pattern, not caused by this story)
  - reject: "Save failure silently drops data" — incorrect claim; _save_config raises before return

## Spec Change Log
(No spec changes needed — patches applied directly)
