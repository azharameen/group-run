---
title: 'ST-5.8 — Frontend Tests: MCP and Team UI'
type: 'test'
created: '2026-08-09T16:00:00Z'
status: 'done'
review_loop_iteration: 0
followup_review_recommended: false
context: ['_bmad-output/implementation-artifacts/epic-5-context.md', '_bmad-output/implementation-artifacts/spec-5-6-mcp-server-management-ui.md', '_bmad-output/implementation-artifacts/spec-5-7-team-agent-configuration-ui.md']
warnings: []
baseline_revision: bf15b6c
---

<intent-contract>

## Intent

**Problem:** The MCP Server Management UI and Team/Agent Configuration UI lack automated frontend tests, increasing the risk of regressions in configuration management which is critical for system stability.

**Approach:** Implement Vitest component tests for `MCPManager.tsx` and `TeamConfig.tsx`. Use MSW (Mock Service Worker) or direct Vitest mocks to simulate backend API responses, covering happy paths, error states, and user interactions (add, remove, reload).

## Boundaries & Constraints

**Always:** Use Vitest and React Testing Library. Mock all API calls to ensure test isolation. Follow existing frontend test patterns (e.g., `frontend/src/components/__tests__/`).

**Block If:** The components `MCPManager.tsx` or `TeamConfig.tsx` are not yet fully implemented or have breaking TypeScript errors.

**Never:** Use live backend services for these component tests. Do not test backend logic in these frontend tests.

## I/O & Edge-Case Matrix

| Scenario | Component | Input / Action | Expected Result |
|----------|-----------|----------------|-----------------|
| List Servers | MCPManager | Mount with mocked servers | Servers displayed in table |
| Add Server | MCPManager | Fill form and Submit | POST called, list refreshes, Toast shown |
| Add Server Error | MCPManager | Submit invalid server | Error message displayed, list not refreshed |
| Remove Server | MCPManager | Click Remove and Confirm | DELETE called, list refreshes, Toast shown |
| List Teams | TeamConfig | Mount with mocked teams | Teams and agents displayed |
| Reload Config | TeamConfig | Click Reload | POST /config/reload called, Success Toast |
| Reload Error | TeamConfig | Click Reload (fails) | Error Toast shown with backend message |

</intent-contract>

## Code Map

- `frontend/src/components/__tests__/MCPManager.test.tsx` -- New test file.
- `frontend/src/components/__tests__/TeamConfig.test.tsx` -- New test file.
- `frontend/src/api/__mocks__/mcp.ts` -- Optional mocks for MCP API.
- `frontend/src/api/__mocks__/config.ts` -- Optional mocks for Config API.

## Tasks & Acceptance

**Execution:**
- [ ] `frontend/src/components/__tests__/MCPManager.test.tsx` -- Implement tests for listing, adding, and removing MCP servers.
- [ ] `frontend/src/components/__tests__/TeamConfig.test.tsx` -- Implement tests for listing teams and triggering config reload.
- [ ] Verify error state handling in both components via mocked API failures.
- [ ] Ensure all tests pass with `npm run test`.

**Acceptance Criteria:**
- GIVEN the MCPManager component, WHEN it mounts, THEN it correctly displays the list of servers from the mocked API.
- GIVEN a user adding a new MCP server, WHEN the API returns success, THEN the server list is updated and a success toast is shown.
- GIVEN a user removing an MCP server, WHEN they confirm deletion, THEN the DELETE API is called and the server is removed from the view.
- GIVEN the TeamConfig component, WHEN it mounts, THEN it displays the team names and agent routing keys from the mocked config.
- GIVEN a user clicks "Reload Config", WHEN the API returns success, THEN a success toast is displayed.
- GIVEN an API error (400, 404, or 500), WHEN a configuration action is taken, THEN the UI displays an appropriate error message or toast.

## Verification

**Commands:**
- `npm run test frontend/src/components/__tests__/MCPManager.test.tsx`
- `npm run test frontend/src/components/__tests__/TeamConfig.test.tsx`
- `npm run test` (Full suite check)
