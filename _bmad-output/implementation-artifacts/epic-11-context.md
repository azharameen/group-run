# Epic 11 Context: Idea Research and Product Definition

<!-- Generated from planning artifacts. Regenerate with compile-epic-context if planning docs change. -->

## Goal

Convert a validated idea into an evidence-backed, structured product definition that is ready for delivery. The Ideation Department should autonomously research demand, competition, prior art, feasibility, and audience; assess novelty and possible patentability; then have the Product Team produce requirements, roadmap direction, effort estimates, and success measures. The Chief of Staff must be able to review the resulting packet and approve its handoff to Technology.

## Stories

- Story 11.1: Research the concept and compile market evidence
- Story 11.2: Validate novelty and patentability
- Story 11.3: Create product definition from validated concepts

## Requirements & Constraints

- When a Work Item enters `ideation`, Idea Team agents research the market landscape, competitors, prior art/patents, technical feasibility, and target audience. Research must include a market summary, competitor list, prior-art references, and feasibility assessment.
- Research claims require provenance references, such as source URLs or documents, and the work must complete within a configurable time budget.
- Novelty validation must produce a novelty score, prior-art references, and freedom-to-operate analysis, with confidence recorded. The assessment is a formal Work Item artifact.
- After ideation approval, Product Team output must include product requirements, user stories, roadmap phases, effort estimates, and success metrics. Roadmap estimates include agent-hours and projected compute cost.
- Every decision and artifact needs auditable provenance: agent attribution, timestamp where applicable, reasoning, source/evidence references, confidence or trust classification, and alternatives when relevant. Artifacts must remain queryable and reviewable through the Work Item history.
- Agent actions remain distinguishable from human-controlled actions; Chief of Staff approval is required for the cross-department handoff. Do not introduce arbitrary code execution or bypass filesystem safety boundaries.

## Technical Decisions

- Use LangGraph Supervisor plus DeepAgents team subgraphs exclusively. The supervisor routes work; Idea and Product Team agents return structured results. Do not use deprecated FSM, transitions, scheduler, scoring, or legacy research modules.
- Relevant runtime namespaces are `backend/app/orchestrator/`, `backend/app/agent/teams/`, `backend/app/agent/tools/`, `backend/app/state/`, and `backend/app/storage/`. Team and agent definitions are loaded dynamically from `config/teams.yaml`.
- Ideas and research artifacts are canonical workspace-filesystem entities, written through `CompositeBackend` with explicit route mappings and workspace-root restrictions. Runtime state, checkpoints, approvals, and preferences belong in SQLite; LangGraph checkpoints use the global `SqliteSaver` singleton.
- External research capabilities use configured tools/MCP. Platform stdio servers come from `config/mcp.json`; user-configured MCP servers are HTTP-only. MCP permissions do not replace filesystem route enforcement.
- User-facing progress uses the approved `graph.astream(..., version="v2")` path and existing HTTP/SSE integration. Enforce `LANGGRAPH_STRICT_MSGPACK=true` in every environment.

## UX & Interaction Patterns

- The idea detail view should expose the complete research packet, including market analysis, novelty assessment, roadmap, and requirements, with provenance references available alongside artifacts.
- Research progress and results should be understandable as they stream into the Work Item. At the end of Epic 11, the Command Center should communicate ideation completion and the “handed to Technology” transition.
- Chief of Staff review and approval is the user-controlled gate before Product Team output is handed to Technology; the decision and its evidence must be visible in the audit trail.

## Cross-Story Dependencies

- Epic 11 starts after Epic 10.4 establishes idea maturity and a concept is ready for research.
- Story 11.2 requires Story 11.1’s completed research artifacts and references.
- Story 11.3 requires Story 11.2’s novelty/patentability assessment and approval state.
- Story 11.3’s approved product definition is the prerequisite handoff for Epic 12, Story 12.1 (development).
- Stories execute sequentially in order 11.1 → 11.2 → 11.3; no overlap is planned.
