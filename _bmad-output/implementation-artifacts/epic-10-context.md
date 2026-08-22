# Epic 10 Context: Provenance, Trust, and Idea Maturity

<!-- Generated from planning artifacts. Regenerate with compile-epic-context if planning docs change. -->

## Goal

Make agent decisions and generated outputs inspectable and trustworthy, so users can trace evidence and rationale, identify low-confidence work before acting on it, and move ideas through explicit maturity stages toward planning or rejection.

## Stories

- Story 10.1: Record decisions with provenance metadata
- Story 10.2: Persist artifact provenance and review access
- Story 10.3: Support accuracy review and confidence flagging
- Story 10.4: Introduce idea refinement and maturity stages

## Requirements & Constraints

- Every agent decision must retain agent identity, timestamp, human-readable reasoning, evidence/source references, confidence, and alternatives considered.
- Decision records must be queryable by work item, team, agent, and time range, and inspectable from work-item or team history.
- Every generated artifact—including research, requirements, code, tests, and deployment records—must carry agent attribution, source/evidence references, and a trust classification: `generated`, `trusted`, `verified-tool-call`, or `fallback`.
- Provenance must be visible with the artifact and allow users to reach referenced source material. The target is 100% provenance completeness.
- Accuracy review occurs at key lifecycle milestones and produces an accuracy score, review summary, and verified/failed claims where applicable. The exact mechanism is not yet fixed; self-review, peer review, and human review are supported candidate modes.
- Low-confidence or low-accuracy outputs must be explicitly flagged for human attention. Do not optimize autonomy or speed at the expense of accuracy (the product counter-metric is 90% accuracy).
- A researched idea must receive a maturity stage such as `raw`, `refined`, `validated`, or `ready-for-planning`; each stage requires clear criteria and evidence attached to the idea artifact.

## Technical Decisions

- Use LangGraph Supervisor + DeepAgents as the sole orchestration model; do not use deprecated FSM, scoring, or legacy research modules.
- The workspace filesystem is the source of truth for ideas, research artifacts, and agent outputs. Route all agent file access through `CompositeBackend` with explicit workspace boundaries; SQLite stores runtime state only.
- Preserve the canonical ownership model: `idea` and `research_artifact` are filesystem-owned and written through `CompositeBackend`. Runtime records such as threads, checkpoints, and approvals use SQLAlchemy repositories in SQLite.
- Use UUID v4 public entity IDs, timezone-aware ISO 8601 timestamps, direct API response data, and the standard structured error shape. Agent state changes use typed LangGraph state/reducers; runtime persistence is transactional around graph execution.
- Record provenance as structured metadata rather than embedding source-document copies. Keep configuration and schemas versioned and fail fast on invalid configuration; enforce `LANGGRAPH_STRICT_MSGPACK=true`.
- Expose progress and review results through the existing FastAPI backend and React frontend over HTTP/SSE, using `astream(version="v2")` and existing frontend stream hooks.

## UX & Interaction Patterns

- Users should be able to inspect decision rationale, evidence, confidence, and alternatives from the relevant work item or team history.
- Artifact views show provenance and trust classification alongside the artifact, with clickable source references.
- Accuracy scores and review summaries appear at lifecycle milestones; low-confidence results are visually flagged for human review.
- Idea maturity is presented as a stage with its supporting criteria and evidence, enabling a decision to progress toward planning or stop.

## Cross-Story Dependencies

- Epic 10 depends on Epic 8 Story 8.3's lifecycle status and handoff records.
- Story 10.1 lands first. Stories 10.2 and 10.3 depend on its decision/provenance model; Story 10.4 depends on 10.2's artifact provenance.
- Sprint execution is sequential for this epic (10.1 → 10.2 → 10.3 → 10.4), although 10.1 is module-disjoint with 8.4/9.2 and 10.2/10.3 are module-disjoint with 9.3 when scheduling permits.
