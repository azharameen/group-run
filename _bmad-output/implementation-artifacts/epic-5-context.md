# Epic 5 Context: MCP & Team Config

## Epic overview
- **User value:** User can add HTTP MCP servers through the UI and see/configure teams and agents.
- **Dependencies:** EP-4
- **Capabilities covered:** CAP-8 (MCP Servers), CAP-9 (Team Configuration)

## Epic objectives
- Deliver user-managed HTTP MCP server configuration.
- Enable team/agent configuration from `teams.yaml`.
- Support config reload without restarting the app.
- Keep MCP loading aligned with architecture precedence and runtime overlays.

## Business value
- Lets users extend agent tools through user-added MCP servers.
- Makes team composition editable and reloadable, reducing deployment friction.
- Establishes the configuration foundation for later Knowledge & Memory work.

## Architecture / constraints
- LangGraph 0.6.x + DeepAgents 0.6.8 remain the sole orchestration stack.
- Config precedence is strict: `teams.yaml` → `mcp.json` → DB overlay → env vars.
- All background work stays in-process; no Celery/RQ/external scheduler.
- Config schemas must include `schema_version` and fail fast on invalid load.
- File changes require explicit reload trigger (API endpoint or SIGHUP).
- Platform MCP server definitions live in `config/mcp.json`; user HTTP MCP servers are persisted in the DB overlay.

## Relevant architecture decisions
- **AD-13:** Entity ownership — team definitions in `config/teams.yaml`; platform MCP servers in `config/mcp.json`; user MCP servers in SQLite via the MCP API.
- **AD-14:** Config loading precedence — file base, DB overlay, env vars.
- **AD-15:** In-process background work only.
- Capability map: MCP Integration lives in `backend/app/agent/tools/mcp.py` + `config/mcp.json`; Dynamic Teams lives in `config/teams.yaml` + `backend/app/agent/runtime.py`.

## FR coverage for Epic 5
- **FR-4.1** Team subgraph factory
- **FR-9.1** MCP management API
- **FR-9.2** Config reload endpoint
- **FR-9.3** MCP tool loading from file
- **FR-11.1 / FR-11.2** Frontend test infrastructure coverage for UI work
- **FR-12.1 / FR-12.2 / FR-12.3** Backend test coverage for runtime/config behavior

## Story map

### ST-5.1 — MCP server management API
**Layer:** Backend
**What it does:** Create MCP server management API (add/remove HTTP servers)
**Files:** `api/routes/mcp.py`

**Requirements**
- CRUD-style management for user HTTP MCP servers.
- Persist user-added servers in the DB overlay.
- Expose list/add/remove operations for the frontend.
- Validate MCP server payloads and reject invalid config.

**Acceptance criteria**
- User can add an HTTP MCP server.
- Added server is returned by the management API.
- User can remove a server.
- Invalid server definitions are rejected clearly.

**Technical details**
- New route module under `api/routes/mcp.py`.
- Must align with config precedence and AD-13/AD-14.
- Keep route surface small; service/repository logic should stay out of the route file when possible.
- This is the focal story for Epic 5: it supplies the user-controlled MCP overlay consumed by runtime loading.

### ST-5.2 — Config reload endpoint for teams.yaml
**Layer:** Backend
**What it does:** Create config reload endpoint for teams.yaml
**Files:** New endpoint in config route

**Requirements**
- Reload team configuration without app restart.
- Re-read file base config and reapply DB overlay.
- Fail fast on invalid config.

**Acceptance criteria**
- User edits `teams.yaml`.
- Calling reload refreshes teams in memory.
- Existing runtime keeps working after reload when config is valid.

**Technical details**
- Must honor explicit reload trigger requirement.
- Should be safe under in-process background work only.

### ST-5.3 — MCP tool loading from `config/mcp.json`
**Layer:** Backend
**What it does:** Update MCP tool loading to read from `config/mcp.json`
**Files:** `agent/runtime.py`

**Requirements**
- Load platform MCP server definitions from the file.
- Merge with DB overlay user servers at runtime.
- Preserve strict precedence order.

**Acceptance criteria**
- Runtime sees file-defined MCP tools.
- User-added HTTP MCP servers appear in agent tools.
- Invalid config prevents startup/load rather than silently degrading.

**Technical details**
- Update existing DeepAgents runtime factory.
- Keep MCP adapter consistent with the architecture spine.

### ST-5.4 — Team subgraph factory from `teams.yaml`
**Layer:** Backend
**What it does:** Create team subgraph factory from `teams.yaml`
**Files:** `orchestrator/team_factory.py`

**Requirements**
- Build team subgraphs dynamically from YAML config.
- Support team/agent definitions as the authoritative base.
- Provide a clean factory interface for supervisor/runtime use.

**Acceptance criteria**
- Teams defined in `teams.yaml` are loadable.
- Runtime can construct team subgraphs from config.
- Factory behavior is deterministic for a given config.

**Technical details**
- New factory module.
- Directly maps to FR-4.1 and Dynamic Teams architecture.

### ST-5.5 — Backend tests: MCP, config reload, team loading
**Layer:** Backend
**What it does:** Backend tests: MCP management, config reload, team loading
**Files:** New test files

**Requirements**
- Cover MCP add/remove behavior.
- Cover config reload behavior.
- Cover team loading and subgraph factory behavior.
- Keep tests isolated from live model calls.

**Acceptance criteria**
- Tests validate happy path and invalid config handling.
- Tests pass with mocked boundaries only.

**Technical details**
- Use pytest.
- Validate precedence and reload semantics.
- Include in-memory SQLite isolation where needed.

### ST-5.6 — MCP server management UI
**Layer:** Frontend
**What it does:** MCP server management UI
**Files:** `components/MCPManager.tsx`

**Requirements**
- UI for listing, adding, and removing MCP servers.
- Surface validation feedback from backend.
- Make user-added servers visible immediately after save.

**Acceptance criteria**
- User can manage MCP servers from UI.
- UI reflects backend state after changes.
- Errors are shown clearly.

**Technical details**
- New component: `components/MCPManager.tsx`.
- Must integrate cleanly with existing app layout.

### ST-5.7 — Team/agent configuration UI
**Layer:** Frontend
**What it does:** Team/agent configuration UI
**Files:** `components/TeamConfig.tsx`

**Requirements**
- Display team and agent configuration.
- Support editing/reloading-oriented workflows.
- Surface config status/validation issues.

**Acceptance criteria**
- User can inspect team/agent config.
- Reloaded config is visible in UI.
- Invalid config state is communicated.

**Technical details**
- New component: `components/TeamConfig.tsx`.
- Should follow existing naming and component conventions.

### ST-5.8 — Frontend tests: MCP and team UI
**Layer:** Frontend
**What it does:** Frontend tests: MCP and team UI
**Files:** New test files

**Requirements**
- Cover MCP manager behavior.
- Cover team config UI behavior.
- Cover error states and refresh behavior.

**Acceptance criteria**
- UI tests pass with mocked API responses.
- Core interactions are covered.

**Technical details**
- Use Vitest/component test setup from the platform test stack.

## Cross-story notes
- ST-5.1 is the primary backend foundation; ST-5.3 consumes its persisted overlay.
- ST-5.2 and ST-5.4 both depend on the same config schema/versioning rules.
- UI stories should not bypass backend validation.
- Epic 5 completes the configuration surface needed before Knowledge & Memory work in EP-6.

## Relevant planning-artifact context
- Epic order is strict: EP-4 must be complete before EP-5.
- EP-5 is part of the vertical-slice plan: backend API + frontend UI + tests.
- Config files are intentionally not created until the earlier foundation stories are in place.
- The architecture spine lists `backend/app/agent/tools/mcp.py`, `config/mcp.json`, `config/teams.yaml`, and `backend/app/agent/runtime.py` as the key homes for this epic.
