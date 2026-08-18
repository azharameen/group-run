# Epic 8 Context: Orchestration Core and Workflow Trust

<!-- Generated from planning artifacts. Regenerate with compile-epic-context if planning docs change. -->

## Goal

Deliver the controllable execution backbone that enables a work item to move through the organization with routing decisions, execution checkpoints, status visibility, and human-approval controls. By the end of this epic, an organization can create itself, accept new work, route it to the right team, track its progress through a configurable lifecycle, and enforce approval gates for risky operations.

## Stories

- Story 8.1: Create and initialize an organization structure
- Story 8.2: Submit and route a work item to the correct department
- Story 8.3: Manage lifecycle status and handoffs for work items
- Story 8.4: Enforce approval for risky filesystem changes

## Requirements & Constraints

**Functional Requirements**

Work item submission and routing must be seamless: when a user submits a work item via chat or form, the Chief of Staff (supervisor agent) receives it, assesses its type/priority, and assigns it to the appropriate department and team within 30 seconds. The routing decision must be deterministic and traceable.

Organizations are created with a fixed default structure: Chief of Staff at the top level, Ideation Department (with Idea and Product teams), and Technology Department (with Development, Testing, and DevOps teams). This structure is immutable in v1 and loaded from configuration.

Work items progress through a standard, configurable lifecycle: new → ideation → product_definition → development → testing → deployment → monitoring. Each phase is owned by a specific team. Transitions between phases (especially across departments) must be logged with timestamps, ownership changes, and provenance metadata. Users must be able to query the full lifecycle history of any work item.

The Chief of Staff continuously monitors organizational health: agent capacity per team (active/idle/total), work item throughput, bottlenecks, and overloaded teams. Alerts surface when a team is overloaded or an agent has been idle beyond threshold.

Filesystem mutations (write, delete, overwrite operations) must trigger human-in-the-loop approval: the system presents an approval/rejection UI, and the user's decision is persisted with full audit trail. Read operations do not require approval.

The system must maintain strict separation between autonomous actions (agents acting under LangGraph control) and human-controlled actions (user approvals, instruction changes, priority overrides). Approval state must be queryable and auditable.

**Non-Functional Requirements**

The Command Center dashboard must load within 2 seconds for organizations with 10+ active work items. Every lifecycle transition, approval decision, and work item status change must be queryable and auditable with full provenance metadata (agent ID, timestamp, reasoning, decision sources, confidence level, alternatives considered).

Provenance metadata must be attached to every decision and artifact touched by this epic: organization creation events, work item routing decisions, lifecycle transitions, approval decisions, and change history. No provenance field is optional.

LangGraph checkpoints use SQLite via SqliteSaver as the sole checkpoint storage; work item and organization runtime state (active threads, approvals, preferences) is stored via SQLAlchemy repositories, not LangGraph reducers. This separation keeps state mutation atomic and prevents dual-write complexity.

The platform must enforce route-based filesystem permissions through a CompositeBackend with explicit path mappings. Agents cannot access paths outside their configured workspace root. All agent filesystem operations are logged for audit.

## Technical Decisions

**Orchestration Architecture**

The Chief of Staff is implemented as a LangGraph Supervisor node that routes user intents and work items to domain-specialist teams. Each team is a LangGraph subgraph with DeepAgents-equipped agents. The Supervisor uses structured tool calling to route and poll team progress, and it does not bypass team boundaries — all work flows through assigned teams.

Work item and organization data flow through the Supervisor, which orchestrates checkpoints before and after team execution. The Supervisor reads from and writes to SQLAlchemy repositories (not LangGraph state reducers) to maintain clear separation between orchestration state and persistent data.

**Checkpoint and State Model**

LangGraph checkpoints are persisted to SQLite via the SqliteSaver singleton. The SqliteSaver is a global singleton — creating multiple connections raises "database is locked" errors. Runtime state for work items, approvals, preferences, and threads is stored in SQLite via SQLAlchemy ORM models, decoupled from checkpoint serialization. This prevents dual-write complexity and keeps the database layer coherent.

**Filesystem and Permissions**

Workspace filesystem is the source of truth for ideas, research artifacts, and agent outputs. Agents access filesystem operations through CompositeBackend, which enforces route-based permissions. Each team has a configured workspace root; agents cannot read or write outside their root. All filesystem operations are logged with agent attribution and timestamp.

Filesystem mutations (write, delete, overwrite) trigger LangGraph Command-based interrupts requiring human approval. The frontend presents the approval UI via SSE; the user approves or rejects; the result is persisted with full provenance and visible in the audit trail.

**Configuration and Runtime Reconfiguration**

Team and agent definitions live in `config/teams.yaml`. Teams are loaded at startup and can be reloaded without full restart. Each team definition includes: name, agents, tools, subgraph structure, and routing keys. Runtime state (active threads, work items, pending approvals) is never baked into configuration — it lives in the database and is managed by SQLAlchemy repositories.

**Lifecycle and Handoff Tracking**

Work item lifecycle is configurable but starts with a fixed v1 schema: new → ideation → product_definition → development → testing → deployment → monitoring. Each status transition is recorded as a database event with timestamp, owner, reasoning, and provenance. Handoffs between departments (e.g., ideation complete → technology begins) are logged as Chief of Staff approval events in the audit trail.

**Approval and HITL**

Human-in-the-loop (HITL) interrupts use LangGraph Command objects to pause execution and wait for user input. The frontend SSE connection receives the approval request, the user approves or rejects, and the decision is persisted as an approval record with full context (what was requested, user decision, timestamp, justification if provided). The agent runtime resumes after HITL completion.

**Provenance and Audit**

Every decision made by the Chief of Staff or any agent must be logged with: agent ID, timestamp, reasoning (LLM rationale or heuristic), evidence references (sources consulted, prior decisions cited), confidence level, and alternatives considered. Every artifact (work item metadata, lifecycle transition, approval decision) carries the same provenance structure. This information is stored in the database and queryable via audit API endpoints.

## UX & Interaction Patterns

The Command Center dashboard is the primary interface. It displays all active work items with status by department and team, agent activity feed, and team health (capacity/workload). Work items appear as cards showing: current status, owner, assignment history, and a link to full lifecycle. Alerts for overloaded teams or stalled work are highlighted prominently.

Work item submission flows through a conversational interface: the user describes the work (via chat or form), the Chief of Staff acknowledges it, assigns a status, routes it to a team, and the user sees the assignment in the feed. The routing decision is explained in the org status feed.

Lifecycle transitions are visible in the work item detail view: a timeline showing each phase, date, owner, and any handoff approval by the Chief of Staff. Users can click on transitions to see reasoning and evidence.

When a filesystem mutation triggers approval, the frontend shows a modal with: what file operation is pending, why the agent requested it, the file path, and the exact content to be written. The user clicks "Approve" or "Reject"; the decision is logged immediately.

## Cross-Story Dependencies

Story 8.2 (work item routing) depends on 8.1 (organization structure must exist before routing decisions).
Story 8.3 (lifecycle and handoffs) depends on 8.2 (work items must be routable before they can transition).
Story 8.4 (filesystem approval) is independent of 8.1–8.3 but requires the HITL interrupt infrastructure that 8.3 sets up.

Epic 9 (Team Health, Monitoring, and Reuse) depends on 8.1–8.3 to populate org state, health metrics, and work item history that monitoring queries.
Epic 10 (Provenance, Trust, and Idea Maturity) depends on 8.1–8.4 to ensure all decisions and lifecycle events are logged with full provenance.
Epics 11 and 12 (Idea Research and Product Build) depend on 8.1–8.3 to have a working organization that can route and track their respective work.
