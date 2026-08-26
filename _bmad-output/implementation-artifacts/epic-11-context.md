# Epic 11 Context: Idea Research and Product Definition
<!-- generated comment -->

## Goal

Convert a validated idea into an evidence-backed product definition that is ready for delivery planning and an approved handoff to the Technology Department. The epic covers autonomous concept research, novelty and patentability validation, and translation of an approved concept into requirements, roadmap direction, success measures, and effort estimates.

## Stories

- **11.1 — Research the concept and compile market evidence:** Produce reviewable market, competitor, and feasibility research with provenance.
- **11.2 — Validate novelty and patentability:** Produce a referenced novelty and patentability assessment with confidence.
- **11.3 — Create product definition from validated concepts:** Produce the product definition and secure approval for the Technology handoff.

## Requirements & Constraints

- Work proceeds within a Work Item lifecycle. Epic 11 spans the `ideation` and `product_definition` phases; phase transitions must record timestamps, owning Team, and provenance, and the full lifecycle history must remain visible.
- The Idea Team owns autonomous research and decides which sources to consult and how deeply to investigate. Research must address market landscape, competitors, technical feasibility, target audience, and prior art or patent evidence.
- Research output must include a market summary, competitor list, prior-art references, and feasibility assessment. Every claim must cite a source URL or document, and execution must respect a configurable time budget.
- Access to web search, knowledge bases, and patent databases is an explicit planning assumption. Do not treat those capabilities as guaranteed without configured tools.
- Novelty validation must assess novelty claims and potential patentability. Its formal Work Item artifact must include a novelty score, prior-art references, a freedom-to-operate analysis, references, confidence, and full provenance.
- A concept may advance to product definition only after ideation validation and approval. The Product Team must then produce product requirements, user stories, a phased roadmap, effort estimates, and success metrics.
- The product requirements document must be stored as a Work Item artifact. Roadmap phases require an effort estimate per phase; estimates must include agent-hours and projected compute cost.
- The Chief of Staff must review and approve the cross-department handoff before Technology begins delivery. The approval and handoff must be logged.
- Every decision must capture agent identity, timestamp, reasoning, consulted sources, confidence, and alternatives considered in a human-readable form.
- Every artifact must carry agent attribution, source and evidence references, and a trust level of `generated`, `trusted`, `verified-tool-call`, or `fallback`. Provenance completeness is expected for all artifacts.
- Accuracy must not be traded for speed or autonomy. Key lifecycle outputs require an accuracy review and score, with verified and failed claims and human attention for low-accuracy results. The exact mix of self-review, peer review, and human review remains undecided.

## Technical Decisions

- Agent execution, state, streaming, and tool calling use LangGraph graphs and DeepAgents agents exclusively. The Ideation workflow must remain agent-driven rather than becoming a fixed rule-based state machine.
- The product retains a two-service topology: a React/Vite frontend and a FastAPI backend with LangGraph running in-process. Client updates and approval interactions use HTTP and SSE; no queue or separate orchestration service is introduced.
- Agent streaming uses `graph.astream(..., version="v2")`, with custom frontend SSE hooks.
- Ideas and research artifacts have canonical ownership in their respective Ideas and Research teams and are stored in the workspace filesystem. Agent file access must pass through `CompositeBackend` route mappings and remain inside the configured workspace root.
- Work Item and runtime relational state use the provider-agnostic PostgreSQL layer. Database access is async through SQLAlchemy interfaces and repositories; LangGraph checkpoints use `AsyncPostgresSaver`; schema changes use Alembic. SQLite is not permitted under the finalized migration architecture.
- Team and agent definitions are loaded from versioned, validated YAML configuration, including each team's agents, tools, subgraph, and routing keys. Research connectors use configured MCP tools: platform stdio or HTTP servers are configuration-controlled, while user-added servers are HTTP-only.
- Background activity runs in-process. No separate workers or schedulers are introduced.
- Filesystem mutations require a LangGraph human-approval interrupt; reads do not. Tooling that bypasses workspace permission routing is a known security gap and must not be assumed to have equivalent containment.

## UX & Interaction Patterns

- Research, novelty, and product-definition outputs must be attached to the Work Item in a reviewable form rather than exposed only as transient agent conversation.
- The Work Item detail experience should present the complete research packet—market analysis, novelty assessment, roadmap, and requirements—and make lifecycle status and the Ideation-to-Technology handoff clear.
- Provenance appears alongside each artifact, with source references users can open. Accuracy scores and low-confidence or low-accuracy warnings must be visible at key milestones.
- The Chief of Staff is the primary review and communication surface: users can inspect progress, ask why a decision was made, and approve or reject gated actions and the Technology handoff.

## Cross-Story Dependencies

- Story 11.1 starts only after Story 10.4 has established a validated, stage-assigned idea.
- Story 11.2 depends on the completed evidence packet from Story 11.1.
- Story 11.3 depends on the completed novelty and patentability assessment from Story 11.2.
- Epic 12 delivery work begins only after Story 11.3 produces an approved product definition and Chief of Staff handoff.
