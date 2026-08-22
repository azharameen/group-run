# Epic 9 Context: Team Health, Monitoring, and Reuse

<!-- Generated from planning artifacts. Regenerate with compile-epic-context if planning docs change. -->

## Goal

Make the organization operationally stable and practical by giving founders visibility into team capacity and workload, automatically handling idle or blocked work, and preserving successful coordination patterns for reuse.

## Stories

- Story 9.1: Surface organization health and team capacity
- Story 9.2: Reassign idle agents and escalate blocked work
- Story 9.3: Save and replay a workflow as a template

## Requirements & Constraints

- The Command Center must show each Department/Team's active, idle, and total agent counts, workload state, and relevant work-item activity. Clearly distinguish active, idle, and overloaded teams.
- Organization health monitoring covers agent capacity, work-item throughput, bottlenecks, idle agents, and teams that remain overloaded or underutilized.
- Idle agents should be reassigned to pending work within 5 minutes when capacity is available. When a team is overloaded, the Chief of Staff may reprioritize or escalate; user-visible options include reprioritize, add capacity, or defer.
- Raise a visible alert when a work item remains in one phase beyond the configured threshold (the PRD's initial example is more than 24 hours). Thresholds must be configurable rather than hard-coded.
- Every reassignment or escalation records the decision and reason in the audit trail. Work-item history, status, alerts, and approvals must remain queryable and auditable.
- Saving a stable or completed workflow persists its configuration and step sequence. A saved template must be replayable against a new work item or project context.
- Dashboard performance target: load within 2 seconds for organizations with 10 or more active work items.

## Technical Decisions

- Use LangGraph Supervisor + DeepAgents as the only orchestration model. Do not add or revive the deprecated FSM, scheduler, or legacy orchestration modules.
- Keep the approved two-service topology: React/Vite frontend and FastAPI backend with LangGraph running in-process; communicate through HTTP and SSE.
- Use SQLite for application/runtime state and `SqliteSaver` for checkpoints. The `SqliteSaver` instance is a single global singleton to avoid database locks.
- Team and agent definitions are authoritative in `config/teams.yaml`, loaded at startup and reloadable without a full restart. Runtime state such as active threads and work items belongs in SQLite.
- Respect the dependency direction API routes → orchestrator → agent runtime → tools/backends → storage. Team health/reassignment orchestration should not bypass these layers.
- Use the workspace filesystem as the source of truth for ideas, research artifacts, and agent outputs; database persistence is for runtime state. Any template representation must follow the owning storage model and preserve its workflow identity/configuration.
- Agent filesystem access must use route-based `CompositeBackend` boundaries. No arbitrary code-execution sandbox is introduced for this epic.

## UX & Interaction Patterns

- The Command Center is the primary operational view. Provide team/departments cards or panels with capacity (active/idle/total), workload/health state, and clear overloaded or idle highlighting.
- Surface blocked-work and capacity alerts in the Command Center so users can understand the bottleneck and available response options.
- Make reassignment/escalation outcomes and reasons visible in the organization status feed or audit history.
- Let users save a completed or stable workflow as a named reusable pattern, then start a new work item/project using that template and its preserved step sequence.

## Cross-Story Dependencies

- Story 9.1 depends on organization initialization (8.1) and must use the work-item schema, fields, and status enum established by 8.2. Story 9.1 owns the Command Center health/capacity panel; 8.2 owns the separate work-item panel.
- Story 9.2 depends on 9.1's health/capacity signals and operates on the 8.2 work-item schema. Its reassignment/escalation decisions should integrate with the audit/provenance capability delivered by 10.1.
- Story 9.3 depends on lifecycle and handoff data from 8.3. It must preserve enough workflow configuration and step sequencing to replay in a new context.
