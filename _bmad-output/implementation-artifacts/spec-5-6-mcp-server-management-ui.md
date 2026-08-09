---
story_id: "5.6"
title: "MCP Server Management UI"
status: done
layer: Frontend
epic: "5"
description: "UI for listing, adding, and removing MCP servers with backend API integration"
files:
  - frontend/src/components/MCPManager.tsx
  - frontend/src/api/mcp.ts
depends_on: []
created: 2025-07-22T16:50:00Z
updated: 2025-07-22T16:50:00Z
baseline_revision: d3a2321
final_revision: 0648a74
followup_review_recommended: false
---

# Story 5.6: MCP Server Management UI

## Story Map

**Layer:** Frontend

**What it does:** Provides a settings panel for managing MCP servers — listing configured servers, adding new servers with validation, and removing existing servers.

**Files:** `components/MCPManager.tsx`, `api/mcp.ts`

---

## Requirements

1. UI for listing, adding, and removing MCP servers.
2. Surface validation feedback from backend (duplicate names, invalid URLs).
3. Make user-added servers visible immediately after save.
4. Integrate cleanly with existing SettingsDialog pattern.

---

## Acceptance Criteria (Given/When/Then)

### AC-1: List MCP Servers
- **GIVEN** the user opens the MCP Servers settings panel
- **WHEN** the component mounts
- **THEN** it fetches configured MCP servers from `GET /api/mcp/servers/`
- **AND** displays them in a table with columns: Name, URL, Timeout
- **AND** shows a loading state while fetching
- **AND** shows an empty state message if no servers are configured

### AC-2: Add MCP Server
- **GIVEN** the user fills in the add server form (name, URL, timeout)
- **WHEN** the user submits the form
- **THEN** the client POSTs to `/api/mcp/servers/` with the server configuration
- **AND** on success, the server list refreshes to include the new server
- **AND** the form resets to empty
- **AND** a success toast is shown

### AC-3: Add Server Validation Errors
- **GIVEN** the user submits an invalid server configuration
- **WHEN** the backend returns a 400 or 409 error
- **THEN** the error message is displayed inline below the relevant form field
- **AND** the server is not added to the list

### AC-4: Remove MCP Server
- **GIVEN** the server list contains one or more servers
- **WHEN** the user clicks the remove button for a server
- **AND** confirms the deletion in an alert dialog
- **THEN** the client DELETEs `/api/mcp/servers/{name}`
- **AND** on success, the server is removed from the list
- **AND** a success toast is shown

### AC-5: Remove Server Not Found
- **GIVEN** a server no longer exists (e.g., removed via another session)
- **WHEN** the user attempts to remove it
- **THEN** a 404 error is handled gracefully with an inline error message
- **AND** the list refreshes

---

## Tasks Completed

- [x] Task 1: Create MCP API Client (`frontend/src/api/mcp.ts`)
- [x] Task 2: Create MCPManager Component (`frontend/src/components/MCPManager.tsx`)
- [x] Task 3: Wire MCPManager into SettingsDialog (`frontend/src/components/settings/SettingsDialog.tsx`)
- [x] Task 4: Export MCPManager from SettingsComponents (`frontend/src/components/settings/SettingsComponents.tsx`)

---

## Technical Details

### Backend API Contracts
- `GET /api/mcp/servers/` → `{ servers: MCPServerResponse[], count: number }`
- `POST /api/mcp/servers/` → `{ name: string, transport: string, url: string, timeout: number }` (201)
- `DELETE /api/mcp/servers/{name}` → `{ name: string, ... }` (200)
- Error responses: 400 (bad request), 404 (not found), 409 (conflict/duplicate)

### Component Pattern
- Follow `SettingsComponents.tsx` pattern: standalone functional component with shadcn UI primitives
- Use `useToast` for success/error feedback
- Use `AlertDialog` for deletion confirmation
- Use `Table` component for server list display
- Use `Input`, `Button` for add form

### Data Flow
```
MCPManager mounts
  → fetchMCPServers()
  → GET /api/mcp/servers/
  → render server list

User submits add form
  → addMCPServer(name, url, timeout)
  → POST /api/mcp/servers/
  → on success: fetchMCPServers() + toast

User clicks remove
  → AlertDialog opens
  → User confirms
  → removeMCPServer(name)
  → DELETE /api/mcp/servers/{name}
  → on success: fetchMCPServers() + toast
```

### UI Components Used
- `Table`, `TableHeader`, `TableRow`, `TableHead`, `TableCell`, `TableBody` — server list
- `Input` — form fields
- `Button` — add/remove actions
- `AlertDialog` — deletion confirmation
- `useToast`, `ToastAction` — notifications
- `Badge` — transport type indicator
- `Skeleton` — loading state
- `Server` icon from `lucide-react`

---

## Testing Strategy

### Manual Verification
1. Open Settings → MCP Servers tab
2. Verify server list loads (empty state if none configured)
3. Add a valid server (e.g., name: "test", url: "http://localhost:8080/mcp", timeout: 10)
4. Verify server appears in list
5. Try adding duplicate name → verify 409 error shown
6. Remove server → confirm dialog → verify removal
7. Verify changes persist across Settings dialog close/reopen

### Edge Cases
- Empty server list → "No MCP servers configured" message
- Network errors → inline error message
- Duplicate name → 409 error shown
- Invalid URL format → backend validation error shown
- Server removed externally → list refresh handles 404 gracefully

---

## Dependencies
- **Backend:** MCP API routes already implemented in `backend/app/api/routes/mcp.py`
- **UI Library:** shadcn/ui components (Table, Input, Button, AlertDialog, Toast)
- **Icons:** lucide-react (Server icon)

---

## Review Criteria
- No TypeScript errors
- Component follows existing SettingsDialog pattern
- All API calls handle errors gracefully
- User feedback (toasts, inline errors) for all operations
- Loading and empty states implemented
- Deletion requires confirmation

## Review Triage Log

### 2025-07-22 — Review pass
- intent_gap: 0
- bad_spec: 0
- patch: 7: (medium 2, low 5)
- defer: 1
- reject: 0
- addressed_findings:
  - `[medium]` `[patch]` Replaced `animate-textured` with `animate-spin` on both Loader2 components
  - `[medium]` `[patch]` Changed form clear order: form now clears AFTER loadServers() completes on success
  - `[medium]` `[patch]` Changed delete dialog: setDeleteTarget(null) only on success, not in finally block
  - `[low]` `[patch]` Added JSON error handling to fetchMCPServers and addMCPServer success paths
  - `[low]` `[patch]` Added empty name validation in removeMCPServer API function
  - `[low]` `[patch]` Fixed timeout input handler to guard against NaN values
  - `[low]` `[patch]` Captured addedName before async ops for stable toast message
- deferred_findings:
  - `[low]` AlertDialog open state driven by deleteTarget truthiness — minor edge case

