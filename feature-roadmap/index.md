# Feature Roadmap

> **⚠️ ARCHIVED — 2026-07-31**
>
> This roadmap was the planning document for Phases 0–7. All features listed are now implemented:
>
> - Agent runtime: DeepAgents with middleware, subagents, permissions
> - Governance: HITL interrupts for manager/IP/counsel; approval endpoints
> - Artifact quality: versioning, diffs, evidence traceability, duplicate detection
> - Frontend: subagent cards, todo panel, tool-call inspection, approval inbox, diff views
> - Research: Google Patents adapter, source provenance, multimodal ingestion
> - Operations: LangSmith tracing, RBAC, review analytics
>
> **Superseded by**: [`features.md`](https://azharameen.github.io/group-run/features/index.md) (complete feature tree), [`tasks.md`](https://azharameen.github.io/group-run/tasks/index.md) (current status).
>
> ______________________________________________________________________

## Current Features

- idea creation from manual signal text
- autonomous idea seeding from knowledge-base content
- custom workflow state progression
- heuristic and LLM-assisted scoring, with some paths still requiring cleanup before the app can be called fully agentic
- gate validation from checklist config
- filesystem artifact storage per idea
- comments on ideas
- workflow status and progress views
- SSE-based live dashboard updates
- knowledge-base listing

## Trust Constraints

- No silent fallback to fabricated agent output
- No simulated human approval for production-trust stages
- Explicit retry/error states are preferred over hidden heuristics

## Features To Build Next

### Agent runtime and orchestration

- real DeepAgents runtime using `create_deep_agent`
- structured subagent delegation
- task/todo state surfaced to UI
- event-stream based tool and subagent updates
- real DeepAgents memory and skills loading

The existing upstream DeepAgents package already supports these primitives, so the roadmap should adapt the package rather than reimplementing them.

### Governance and review

- human-in-the-loop approvals for manager, IP, and counsel stages
- approval and rejection endpoints
- reviewer assignment and queues
- audit log of approval decisions
- protected final artifact writes

If the review cannot be completed by a real human, the workflow should pause instead of auto-approving.

### Workflow and artifact quality

- split research, drafting, and review skills into maintainable packs
- better structured artifact generation
- artifact versioning and revision comparisons
- evidence traceability per draft section
- duplicate idea detection against existing ideas

### Frontend

- subagent activity cards
- live todo list
- tool-call inspection
- approval inbox
- artifact diff views
- richer workflow event timeline

## Later Features

### Knowledge and research

- real prior-art search integrations
- evidence normalization and citation extraction
- cross-idea clustering and deduplication
- multimodal input support for PDFs, slides, and images

### Operations

- LangSmith tracing and run analytics
- role-based access control
- reviewer identity and audit export
- background job and queue processing
- database-backed repositories

### Quality systems

- rubric-driven iterative drafting
- domain-specific evaluation suites
- acceptance/rejection analytics
- memory consolidation and policy updates

## Explicitly Deferred For Now

- sandbox execution
- shell command execution by the agent
- remote code runner integration
