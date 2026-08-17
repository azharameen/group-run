# Agentic Organization Platform — Documentation

> **A general-purpose, multi-agent organization platform powered by LangGraph + DeepAgents, FastAPI, and shadcn/ui.**

## Documentation Index

| Document | Purpose |
| ---------- | --------- |
| [`architecture.md`](./architecture.md) | System architecture, component design, data flow, and deployment topology |
| [`ui-design.md`](./ui-design.md) | Frontend architecture, component hierarchy, shadcn/ui usage, and design system |
| [`prd.md`](./prd.md) | Product Requirements Document — goals, scope, user stories, acceptance criteria |
| [`product-context.md`](./product-context.md) | Business context, problem statement, user personas, and strategic alignment |
| [`features.md`](./features.md) | Complete feature tree with nested capabilities, linkages, and implementation status |
| [`coding-guidelines.md`](./coding-guidelines.md) | Coding standards, best practices, and conventions for all layers |
| [`code-review-guidelines.md`](./code-review-guidelines.md) | Code review checklist, what to reject, and review process |
| [`performance-testing.md`](./performance-testing.md) | Performance test design patterns, workload selection, metric collection, and runner guide |
| [`sse-streaming.md`](./sse-streaming.md) | SSE and streaming edge cases, reconnect semantics, frame parsing, and error handling |
| [`architecture-decisions.md`](./architecture-decisions.md) | Architectural Decision Records (ADR) — context, decision, consequences |
| [`tasks.md`](./tasks.md) | Deep hierarchical task planning (3–5 levels) with implementation tracking |

## Quick Links

| Resource | Location |
| ---------- | ---------- |
| Backend source | `backend/app/` |
| Frontend source | `frontend/src/` |
| Agent skills | `skills/` |
| Agent instructions | `instructions/` |
| Configuration | `config/` |
| Knowledge base | `knowledge-base/` |
| Workspace (ideas) | `workspace/` |
| Tests | `backend/tests/` |
| Performance Baseline | `backend/tests/performance-baseline.md` |

## Current Status

- **Runtime**: DeepAgents `create_deep_agent` with middleware stack (Filesystem, Memory, Skills, SubAgent, HITL)
- **Backend**: FastAPI with REST + SSE streaming, persisted LangGraph threads, Siemens workflow legacy still present
- **Frontend**: React + Vite + TypeScript + shadcn/ui + Radix UI + Tailwind CSS
- **Persistence**: LangGraph SQLite checkpointer for threads plus idea-linked thread metadata
- **Observability**: LangSmith tracing configured
- **Tests**: 43 passing tests (pytest)

## Agent Instructions for Documentation

When planning or implementing features:

1. **Read `tasks.md` first** — understand the current task hierarchy and what's implemented vs pending
2. **Read `features.md`** — understand feature linkages and dependencies
3. **Read `architecture.md`** — understand system boundaries and contracts
4. **Read `coding-guidelines.md`** — follow established conventions
5. **Update `tasks.md`** — mark items as `[IMPLEMENTED]` or `[COMPLETED]` after verification
6. **Update `features.md`** — update implementation status after feature completion
7. **Never fabricate completion** — mark only genuinely verified work as implemented
