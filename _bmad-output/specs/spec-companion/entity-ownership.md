# Entity Ownership

Each entity type has exactly one canonical owner and storage backend. No other layer may persist that entity's primary fields. Cross-layer reads are allowed; cross-layer writes are forbidden.

| Entity | Canonical Owner | Storage | Written Via |
|---|---|---|---|
| `idea` | Ideas team | Workspace filesystem | CompositeBackend |
| `research_artifact` | Research team | Workspace filesystem | CompositeBackend |
| `thread` | Thread API | SQLite | SQLAlchemy repository |
| `checkpoint` | LangGraph runtime | SQLite | SqliteSaver singleton |
| `team_definition` | Config loader | `config/teams.yaml` | File read at startup/reload |
| `mcp_server` (platform) | Config loader | `config/mcp.json` | File read at startup |
| `mcp_server` (user) | MCP API | SQLite | SQLAlchemy repository |
| `user_profile` | Auth API | Firestore `users/{uid}` | Firebase Admin SDK bootstrap; owner-only allowlisted client updates |
| `firebase_identity` | Firebase Authentication | Firebase Auth | Google provider and Firebase SDK/Admin SDK |
| `approval_request` | HITL middleware | SQLite | SQLAlchemy repository |
