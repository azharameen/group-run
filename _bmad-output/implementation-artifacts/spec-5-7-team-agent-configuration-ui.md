---
title: 'ST-5.7 — Team/Agent Configuration UI'
type: 'feature'
created: '2026-08-09T15:00:00Z'
status: 'done'
review_loop_iteration: 0
followup_review_recommended: false
context: ['_bmad-output/implementation-artifacts/epic-5-context.md']
warnings: []
baseline_revision: bf15b6c
---

<intent-contract>

## Intent

**Problem:** Users cannot view the current team and agent configuration or trigger a reload from the UI, making it difficult to verify changes to `teams.yaml` or understand the current system state.

**Approach:** Add a `GET /api/config` backend endpoint to expose the validated in-memory team configuration. Implement a `TeamConfig.tsx` frontend component that fetches and displays this data in a structured table/list, including a "Reload" action integrated into the Settings dialog.

## Boundaries & Constraints

**Always:** Use existing shadcn UI components (Table, Button, Card). Follow the `MCPManager.tsx` pattern for configuration UI. Ensure backend validation errors from reload are surfaced in the UI via toasts.

**Block If:** The `teams.yaml` schema in `runtime.py` is found to be incompatible with the `TeamResponse` schema defined in this spec.

**Never:** Allow direct editing or saving of `teams.yaml` content from the UI (view and reload only). Do not introduce new background processing logic for reloads.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Fetch Config | Component Mounts | List of teams with agents and routing keys displayed | Show "Failed to load" state |
| Successful Reload | Click "Reload Config" with valid file | UI updates, Success Toast | No error expected |
| Failed Reload | Click "Reload Config" with invalid YAML | Previous state preserved, Error Toast with detail | Surface backend `detail` string |
| Empty Config | No teams defined (rare) | "No teams configured" message | Handled by backend validation |

</intent-contract>

## Code Map

- `backend/app/api/routes/config.py` -- Add `GET /api/config` endpoint.
- `backend/app/api/schemas.py` -- Add `TeamConfigResponse` and `TeamDefinition` schemas.
- `backend/app/agent/runtime.py` -- Reference for `_teams_config` structure.
- `frontend/src/api/config.ts` -- New API client for configuration management.
- `frontend/src/components/TeamConfig.tsx` -- New component for team/agent display.
- `frontend/src/components/settings/SettingsDialog.tsx` -- Register "Team Config" tab.
- `frontend/src/components/settings/SettingsComponents.tsx` -- Export `TeamConfig`.

## Tasks & Acceptance

**Execution:**
- [x] `backend/app/api/schemas.py` -- Add Pydantic schemas for full team configuration response.
- [x] `backend/app/api/routes/config.py` -- Implement `GET /api/config` returning the current `_teams_config`.
- [x] `frontend/src/api/config.ts` -- Create API client with `fetchTeamsConfig` and `reloadTeamsConfig`.
- [x] `frontend/src/components/TeamConfig.tsx` -- Create UI component with table list and reload button.
- [x] `frontend/src/components/settings/SettingsDialog.tsx` -- Add "Team Config" tab to settings sidebar.
- [x] `frontend/src/components/settings/SettingsComponents.tsx` -- Export the new component.

**Acceptance Criteria:**
- GIVEN the user opens Settings, WHEN they select the "Team Config" tab, THEN they see a list of all configured teams.
- GIVEN a team in the list, WHEN the user expands or views details, THEN they see the agent names, roles, and unique routing keys.
- GIVEN the user clicks "Reload Config", WHEN the backend reload succeeds, THEN a success toast appears and the list refreshes.
- GIVEN the user clicks "Reload Config", WHEN the backend reload fails (e.g. duplicate routing keys), THEN an error toast shows the specific validation message.

## Design Notes

### TeamConfig Response Schema
The `GET /api/config` should return the full `teams` mapping from `_teams_config`.
```json
{
  "schema_version": "1.0",
  "teams": {
    "general": {
      "name": "General Team",
      "description": "...",
      "agents": [{"name": "...", "role": "..."}],
      "routing_keys": ["key1", "key2"]
    }
  }
}
```

### Component Layout
- Use a `Card` for each team or a `Table` with expandable rows.
- The "Reload Config" button should be prominently placed at the top of the panel.
- Use `lucide-react` `RefreshCw` icon for the reload button.

## Verification

**Commands:**
- `pytest backend/tests/test_config_api.py` (New test file to be created) -- expected: All config API tests pass.
- `npm run type-check` in frontend -- expected: No TypeScript errors.

**Manual checks (if no CLI):**
- Verify "Team Config" appears in Settings menu.
- Verify reload button triggers a request to `/api/config/reload`.
- Verify validation errors from `teams.yaml` (e.g. duplicate keys) are displayed as toasts.

## Auto Run Result
Status: done
Verification: Backend tests and Vitest component tests passed.
Human tasks: None.
