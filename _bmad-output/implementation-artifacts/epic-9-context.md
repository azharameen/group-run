# Epic 9 Context: Team Health, Monitoring, and Reuse

<!-- Generated from planning artifacts. Regenerate with compile-epic-context if planning docs change. -->

## Goal

Make the organization feel operationally stable and practical by exposing real-time team capacity, health metrics, and idle agent bottlenecks. Enable the Chief of Staff to dynamically reassign resources, and empower users to save successful workflow patterns as reusable templates for future work.

## Stories

- Story 9.1: Surface organization health and team capacity
- Story 9.2: Reassign idle agents and escalate blocked work
- Story 9.3: Save and replay a workflow as a template

## Requirements & Constraints

**Health and Capacity Visibility**
- Command Center must display per-team capacity state: active agents, idle agents, total agents, and workload percentage.
- Health metrics include active work item count per team, agent idle time, and work item throughput.
- Overloaded teams (>80% capacity threshold or similar heuristic) and idle agents must be visually distinguished in the dashboard.

**Agent Reassignment and Escalation**
- Idle agents must be reassigned to pending work items within 5 minutes when capacity is available.
- When a team is overloaded, the Chief of Staff must escalate or trigger an alert visible to the user with options: reprioritize, add capacity, or defer.
- Blocked work items (those waiting on another team or dependency) must be surfaced in the Chief of Staff's attention queue.

**Workflow Templates**
- Users must be able to capture a completed or stable workflow as a template, preserving its step sequence, team assignments, and coordination patterns.
- Templates can be replayed on new work items or projects, allowing the system to reuse coordination logic without manual setup.
- Template metadata (created date, usage count, last used, success rate) supports discoverability and decision-making.

**Provenance and Auditability**
- Every reassignment decision and escalation must be logged with timestamp, reasoning, and evidence (why was this agent chosen, what was the trigger).
- Health metric snapshots and baseline changes must be timestamped and queryable for historical analysis.

## Technical Decisions

**LangGraph Supervisor Routing**
- The Chief of Staff is implemented as the top-level LangGraph Supervisor agent, routing work items between department and team agents.
- Team definitions (name, agents, tools, subgraph structure) are loaded from config/teams.yaml and available to the Supervisor for capacity and routing decisions.
- Idle agent detection and reassignment logic runs within the Supervisor's state update cycle; no separate polling service.

**State and Persistence**
- Work item state (status, assigned team, owner, creation time, phase-transition timestamps) lives in SQLite via SQLAlchemy.
- Agent availability state (active assignments, idle duration, assigned work items) is tracked in the checkpoint system (SQLiteSaver).
- Dashboard queries aggregate both work-item state and agent checkpoint state to compute per-team metrics.

**Workflow Capture**
- Workflow templates store the sequence of team assignments, handoff conditions, and tool invocations (a serialized LangGraph state subgraph or equivalent DAG).
- Templates are persisted in the workspace filesystem (parallel to idea and research artifacts) with metadata in SQLite (usage log, owner, tags).
- Template replay initializes a new work item using the saved template configuration and follows the pinned sequence.

**Chief of Staff Decision Logging**
- Every reassignment, escalation, and health-check decision produces a structured log entry in SQLite with: agent ID, decision timestamp, reasoning, evidence references (which metrics triggered the decision), confidence, and alternatives considered.
- The log is queryable and visible to users via an audit trail or activity feed.

## Cross-Story Dependencies

**Data Contract: Work-Item Schema**
- Epic 8 Story 8.2 owns the work-item schema (fields, status enum, routing fields). Stories 9.1, 9.2, and 9.3 depend on this schema being merged and stable.
- Contract pin: Extract work-item fields (status enum, team assignment, owner, timestamps) from 8.2's design and document them in 9.1's story spec before kickoff.

**Command Center Section Ownership**
- Epic 8 Story 8.2 owns the work-item panel (active items, status, routing view).
- Story 9.1 owns the health/capacity panel (team metrics, idle alerts, bottleneck highlights).
- These are separate mounted components; no shared component edits between stories.

**Dependency Ordering**
- Story 9.1 (health visibility) must land before 9.2 (reassignment) — the health metrics feed the reassignment logic.
- Story 9.2 depends on 9.1 for capacity data and Chief of Staff routing.
- Story 9.3 (templates) is parallel-safe with 9.2; no data dependencies.