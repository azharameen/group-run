# Deferred Decisions

| Decision | Why It Can Wait | Revisit Condition |
|---|---|---|
| **Postgres migration** | SQLite sufficient for solo dev + small team. No measurable bottleneck yet. | Connection contention, WAL lock waits > 100ms p99, or multi-instance deployment need |
| **Code execution sandbox** | High complexity (container runtime, seccomp, resource limits). Not needed for core chat/ideas flow. | User requests agent code execution feature |
| **Major version upgrades** (React 19, Tailwind 4, Vite 8, DeepAgents 0.7, LangGraph 1.2) | Current versions work. Breaking changes add migration risk. | Quarterly review — upgrade if security patches or critical bugs |
| **JWT authentication** | Session-based auth sufficient for now. | Multi-tenant deployment or mobile API consumers |
| **Database-backed persistent data** | Workspace filesystem works. Dual-write adds complexity. | After LangGraph migration is stable and tested |
| **Connector framework** (Slack, Gmail, Azure DevOps, etc.) | MCP covers the integration pattern. Specific connectors are feature work, not architecture. | User requests specific connector |
| **Multi-tenant support** | Solo dev + small team doesn't need it. | Product requires tenant isolation |
| **Observability stack** (OpenTelemetry, Grafana) | Console logging + FastAPI docs sufficient for now. | Production deployment with SLA requirements |
| **CI/CD pipeline** | Docker Compose works for local + staging. | Team grows beyond 2 developers or deployment frequency increases |
