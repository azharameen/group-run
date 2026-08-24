# Product Requirements Document (PRD)

> **Last updated: 2026-07-29**

## 1. Product Overview

### 1.1 Vision

An autonomous, multi-agent patent idea generation and validation system that discovers patentable ideas from a knowledge base, processes them through rigorous validation workflows, and produces submission-ready patent packets — all powered by the LangChain DeepAgents runtime.

### 1.2 Goals

| Goal   | Description                                                        |
| ------ | ------------------------------------------------------------------ |
| **G1** | Automate patent idea discovery from knowledge base content         |
| **G2** | Provide rigorous multi-stage validation through 18 workflow states |
| **G3** | Enable human-in-the-loop approval for critical review stages       |
| **G4** | Produce submission-ready patent disclosure documents               |
| **G5** | Maintain full audit trail with provenance metadata                 |

### 1.3 Non-Goals

| Non-Goal                        | Rationale                                 |
| ------------------------------- | ----------------------------------------- |
| External patent API integration | Deferred; uses LLM knowledge + curated KB |
| Sandboxed code execution        | Security risk; explicitly deferred        |
| Database migration from YAML    | Not warranted until scale requires it     |
| Mobile app                      | Desktop-first web application             |

## 2. User Stories

### 2.1 Patent Analyst

```text
US-01: As a patent analyst, I want to submit a technical signal
       so that the system can generate patentable ideas from it.

US-02: As a patent analyst, I want to see the workflow progress
       of each idea in real time so that I can monitor processing.

US-03: As a patent analyst, I want to review agent reasoning and
       tool calls so that I can trust the generated output.

US-04: As a patent analyst, I want to add comments to ideas so that
       I can provide feedback during the workflow.
```

### 2.2 Manager/Reviewer

```text
US-05: As a manager, I want to review and approve/reject ideas at
       key workflow stages so that I can control quality.

US-06: As a manager, I want to see a review packet with scores and
       evidence so that I can make informed decisions.

US-07: As a manager, I want to see pending approval requests so that
       I don't block the workflow.
```

### 2.3 IP Counsel

```text
US-08: As IP counsel, I want to validate patentability before
       submission so that only viable patents are filed.

US-09: As IP counsel, I want to see prior art analysis and novelty
       assessment so that I can evaluate filing strategy.
```

### 2.4 System Administrator

```text
US-10: As an admin, I want to configure scoring weights and gate
       checklists so that the system adapts to business needs.

US-11: As an admin, I want to see system statistics and analytics
       so that I can monitor performance.
```

## 3. Functional Requirements

### 3.1 Idea Management

| ID    | Requirement                                   | Priority | Status      |
| ----- | --------------------------------------------- | -------- | ----------- |
| FR-01 | Create idea from manual signal text           | P0       | Implemented |
| FR-02 | Autonomous idea seeding from KB               | P0       | Implemented |
| FR-03 | List ideas with filters (phase, state, score) | P0       | Implemented |
| FR-04 | View full idea detail with all artifacts      | P0       | Implemented |
| FR-05 | Update idea fields                            | P1       | Implemented |
| FR-06 | Delete idea (with approval interrupt)         | P1       | Implemented |
| FR-07 | Archive idea (with approval interrupt)        | P1       | Implemented |
| FR-08 | Duplicate idea detection                      | P2       | Implemented |

### 3.2 Workflow Engine

| ID    | Requirement                              | Priority | Status      |
| ----- | ---------------------------------------- | -------- | ----------- |
| FR-09 | 18-state workflow machine                | P0       | Implemented |
| FR-10 | Gate checklist validation per transition | P0       | Implemented |
| FR-11 | State transition with lifecycle hooks    | P0       | Implemented |
| FR-12 | Advance to next state                    | P0       | Implemented |
| FR-13 | Advance to specific state                | P1       | Implemented |
| FR-14 | Scheduler-driven autonomous cycles       | P1       | Implemented |
| FR-15 | Full pipeline execution                  | P1       | Implemented |

### 3.3 Scoring

| ID    | Requirement                          | Priority | Status      |
| ----- | ------------------------------------ | -------- | ----------- |
| FR-16 | 7-criterion weighted scoring         | P0       | Implemented |
| FR-17 | LLM-powered scoring                  | P0       | Implemented |
| FR-18 | Score history tracking               | P0       | Implemented |
| FR-19 | Composite score with strength rating | P0       | Implemented |
| FR-20 | Filing threshold validation          | P1       | Implemented |

### 3.4 Agent Runtime

| ID    | Requirement                              | Priority | Status      |
| ----- | ---------------------------------------- | -------- | ----------- |
| FR-21 | DeepAgents runtime with middleware stack | P0       | Implemented |
| FR-22 | Subagent definitions from workflow roles | P0       | Implemented |
| FR-23 | Filesystem backend with permissions      | P0       | Implemented |
| FR-24 | Skills and memory middleware             | P0       | Implemented |
| FR-25 | HITL interrupt configuration             | P0       | Implemented |
| FR-26 | Typed transcript event model             | P0       | Implemented |
| FR-27 | Runtime event streaming                  | P0       | Implemented |

### 3.5 Human-in-the-Loop

| ID    | Requirement                           | Priority | Status      |
| ----- | ------------------------------------- | -------- | ----------- |
| FR-28 | Manager review interrupt              | P0       | Implemented |
| FR-29 | IP review interrupt                   | P0       | Implemented |
| FR-30 | Counsel validation interrupt          | P0       | Implemented |
| FR-31 | Delete/archive approval interrupt     | P1       | Implemented |
| FR-32 | Approval/rejection endpoints          | P0       | Implemented |
| FR-33 | Durable pending interrupt persistence | P0       | Implemented |
| FR-34 | Review analytics                      | P2       | Implemented |

### 3.6 Frontend

| ID    | Requirement                        | Priority | Status      |
| ----- | ---------------------------------- | -------- | ----------- |
| FR-35 | Dashboard with stats and idea list | P0       | Implemented |
| FR-36 | Idea detail view with tabs         | P0       | Implemented |
| FR-37 | Live SSE updates                   | P0       | Implemented |
| FR-38 | Transcript-driven chat sidebar     | P0       | Implemented |
| FR-39 | Agent todo/progress panel          | P1       | Implemented |
| FR-40 | Subagent activity cards            | P1       | Implemented |
| FR-41 | Tool call inspection               | P1       | Implemented |
| FR-42 | Interrupt approval UI              | P1       | Implemented |
| FR-43 | Artifact diff viewer               | P2       | Implemented |
| FR-44 | Knowledge base browser             | P1       | Implemented |
| FR-45 | Siemens controls page              | P2       | Implemented |

### 3.7 Observability

| ID    | Requirement                             | Priority | Status      |
| ----- | --------------------------------------- | -------- | ----------- |
| FR-46 | LangSmith tracing                       | P1       | Implemented |
| FR-47 | Review analytics with reviewer identity | P2       | Implemented |
| FR-48 | Audit log via transcript events         | P0       | Implemented |

## 4. Acceptance Criteria

### 4.1 Quality Gates

| Gate               | Criteria                                               |
| ------------------ | ------------------------------------------------------ |
| **Tests**          | All existing tests must pass (`pytest backend/tests`)  |
| **No Fabrication** | No silent fallback to fabricated agent output          |
| **Provenance**     | Every artifact carries provenance metadata             |
| **Error States**   | Failures are explicit (retry, pause, error) not hidden |
| **Frontend Build** | `npm run build` must pass with 0 errors                |

### 4.2 Performance Targets

| Metric                            | Target  |
| --------------------------------- | ------- |
| API response time (non-streaming) | < 500ms |
| SSE event latency                 | < 200ms |
| State transition time             | < 2s    |
| Scoring time                      | < 5s    |
| Full pipeline (3 ideas)           | < 5 min |

## 5. Release Criteria

### 5.1 Phase Completion

| Phase                           | Criteria                               | Status    |
| ------------------------------- | -------------------------------------- | --------- |
| P0: Documentation + Scaffolding | Audit complete, docs written           | Completed |
| P1: Backend Cleanup             | Files split, routes modularized        | Completed |
| P2: DeepAgents Runtime          | Runtime factory, middleware, subagents | Completed |
| P3: Skills + Memory             | Skills directory, memory files         | Completed |
| P4: HITL Approvals              | Checkpointer, interrupt endpoints      | Completed |
| P5: Frontend Streaming          | SSE adapter, transcript UI             | Completed |
| P6: Artifact Quality            | Versioning, diffs, provenance          | Completed |
| P7: Advanced Capabilities       | Multimodal, LangSmith, analytics       | Completed |

## 6. Related Documents

- [Product Context](https://azharameen.github.io/group-run/product-context/index.md) — Business context and personas
- [Architecture](https://azharameen.github.io/group-run/architecture/index.md) — System architecture
- [Features](https://azharameen.github.io/group-run/features/index.md) — Complete feature tree
- [Architecture Decisions](https://azharameen.github.io/group-run/architecture-decisions/index.md) — ADR log
- [Coding Guidelines](https://azharameen.github.io/group-run/coding-guidelines/index.md) — Development standards
- [Code Review Guidelines](https://azharameen.github.io/group-run/code-review-guidelines/index.md) — Code review process
- [Tasks](https://azharameen.github.io/group-run/tasks/index.md) — Implementation task hierarchy
