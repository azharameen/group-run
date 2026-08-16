---
stepsCompleted: ["requirements-extracted"]
inputDocuments:
  - "planning-artifacts/prds/prd-Companion-2026-08-01/prd.md"
  - "planning-artifacts/architecture/architecture-Companion-2026-08-02/ARCHITECTURE-SPINE.md"
---

# Companion - Epic Breakdown

> **Sprint 2 (current active backlog).** Epic numbering continues from Sprint 1 (EP-0..EP-7, delivered — see `sprint-1.md`).
> Rule: `epics.md` always holds the current sprint's backlog; each completed sprint is archived as `sprint-N.md` in this folder. Epic numbers never restart.

## Overview

This document decomposes the Companion product into implementable epics and stories based on the current PRD and architecture spine. The goal is to ship a quality-first orchestration foundation before expanding the full idea-to-product maturity pipeline.

## Requirements Inventory

### Functional Requirements

FR1: Create a new Organization with the default Company structure including Chief of Staff, Ideation Department, and Technology Department.
FR2: Display a Command Center dashboard showing active work items, status by department and team, agent activity, and recent highlights.
FR3: Allow a user to submit a new Work Item via chat or form and route it to the correct department and team.
FR4: Support a configurable Work Item lifecycle from new through ideation, product definition, development, testing, deployment, and monitoring.
FR5: Continuously monitor organization health, agent capacity, bottlenecks, overloaded teams, and idle resources.
FR6: Enable the Idea Team to autonomously research a concept, including market, competitors, prior art, feasibility, and target audience.
FR7: Validate novelty and patentability of a concept using prior-art review and assessment outputs.
FR8: Create a product definition from a validated concept, including requirements, roadmap, effort estimates, and success metrics.
FR9: Improve or pivot an idea over time using feedback, market signals, and competitive insight.
FR10: Enable the Development Team to autonomously build the target product with architecture, code, documentation, and provenance.
FR11: Enable the Testing Team to validate quality through functional, integration, performance, and security checks.
FR12: Enable the DevOps Team to deploy and operate the product through staging, production rollout, rollback, and monitoring.
FR13: Monitor live product health after deployment and trigger maintenance or corrective actions when needed.
FR14: Support cross-department coordination and handoff approvals led by the Chief of Staff.
FR15: Allow the user to communicate with the Chief of Staff about org status, work item progress, agent behavior, and instructions.
FR16: Detect contradictions or policy conflicts in agent and user discussions, and escalate them for resolution.
FR17: Manage agent capacity across teams and reassign idle agents or escalate overloaded teams.
FR18: Log each agent decision with timestamp, reasoning, evidence, confidence, and alternatives considered.
FR19: Record artifact provenance for research, requirements, code, tests, and deployment output.
FR20: Support accuracy review of agent outputs and flag low-confidence or risky outputs for human attention.

### NonFunctional Requirements

NFR1: The Command Center dashboard must load within 2 seconds for organizations with 10+ active work items.
NFR2: The Chief of Staff must assign a newly submitted work item to a department within 30 seconds.
NFR3: Idle agents must be reassigned to pending work within 5 minutes when capacity is available.
NFR4: User communication with the Chief of Staff must receive a response within 10 seconds under normal conditions.
NFR5: Every decision and artifact must carry provenance metadata including sources, attribution, and trust level.
NFR6: Work item history, status transitions, alert state, and approvals must be queryable and auditable.
NFR7: The platform must keep a strict separation between autonomous actions and human-controlled actions, especially for filesystem mutations and risky operations.
NFR8: The system must operate on the approved architecture model: LangGraph + DeepAgents, SQLite-backed checkpoints, route-based filesystem permissions, and structured tool access.
NFR9: Streaming and user-facing progress must be resilient and clear during partial failures, retries, or interrupted sessions.
NFR10: All critical runtime configuration must fail fast and enforce safety policies, including `LANGGRAPH_STRICT_MSGPACK=true`.

### Additional Requirements

- Use LangGraph Supervisor + DeepAgents as the sole orchestration model.
- Use a two-service split: React frontend + FastAPI backend with in-process LangGraph runtime.
- Use SQLite via `SqliteSaver` as the persistence layer for checkpoints and app state.
- Enforce route-based `CompositeBackend` filesystem access boundaries and explicit tool permissions.
- Use the approved streaming API compatible with the current runtime and keep SSE frontend hooks aligned.
- Treat workspace filesystem as the source of truth for ideas, research artifacts, and agent outputs.
- Load team and agent definitions dynamically from `config/teams.yaml` and support runtime reconfiguration.
- Support MCP tool integration through platform-level stdio definitions and user-configurable HTTP definitions.
- Do not introduce a sandboxed arbitrary code execution model in MVP.
- Require human approval for filesystem mutation actions using HITL interrupts.
- Enforce `LANGGRAPH_STRICT_MSGPACK=true` in every environment.
- Do not import or extend the dead/deprecated FSM and legacy modules.

### UX Design Requirements

No UX design contract was found in the planning artifacts for this specific scope. No UX-specific design requirements were extracted. If a UX design contract is added later, it should be treated as a first-class input and translated into UX-DR items before story generation.

### FR Coverage Map

{{requirements_coverage_map}}

## Epic List

{{epics_list}}

## Epic 8: Orchestration Core and Workflow Trust

Goal: Deliver the controllable execution backbone so a work item can move through the organization with routing, checkpoints, status visibility, and approval controls.

### Story 8.1: Create and initialize an organization structure

As a founder,
I want to create an organization with the default departments and teams,
So that I can begin running AI work immediately.

**Acceptance Criteria:**

**Given** the user is authenticated and requests a new organization
**When** the system creates the organization
**Then** the default Chief of Staff, Ideation Department, and Technology Department are initialized with their required teams and agents.
**And** the Command Center dashboard is populated with the new organization state.

### Story 8.2: Submit and route a work item to the correct department

As a user,
I want to submit a new work item and have it correctly routed,
So that the system can begin executing the right work without manual coordination.

**Acceptance Criteria:**

**Given** a work item is submitted with a goal or concept
**When** the Chief of Staff receives it
**Then** it is assigned a status, routed to a department, and visible in the Command Center.
**And** the routing decision is understandable in the org status feed or audit log.

### Story 8.3: Manage lifecycle status and handoffs for work items

As a user,
I want each work item to move through a tracked lifecycle with handoff records,
So that I can understand progress and team ownership over time.

**Acceptance Criteria:**

**Given** a work item is active in the organization
**When** it transitions between phases or departments
**Then** the lifecycle status updates with timestamps, owner, and provenance metadata.
**And** the user can view the full lifecycle history of the work item.

### Story 8.4: Enforce approval for risky filesystem changes

As a user,
I want risky file operations to require explicit approval,
So that the system does not mutate files silently or incorrectly.

**Acceptance Criteria:**

**Given** an agent attempts a filesystem write or delete that matches the risky operation list
**When** the workflow triggers a HITL interrupt
**Then** the user is shown an approval or rejection decision.
**And** the final result is persisted with provenance and visible in the audit trail.

## Epic 9: Team Health, Monitoring, and Reuse

Goal: Make the organization feel operationally stable and practical by exposing capacity, health, and reusable execution patterns.

### Story 9.1: Surface organization health and team capacity

As a founder,
I want to see team health, workload, and idle capacity,
So that I can understand whether the organization is overloaded or underutilized.

**Acceptance Criteria:**

**Given** the organization contains multiple departments and teams
**When** the Command Center loads
**Then** each team shows capacity and workload state.
**And** idle or overloaded teams are clearly highlighted.

### Story 9.2: Reassign idle agents and escalate blocked work

As a Chief of Staff,
I want the system to identify idle or blocked work,
So that the organization remains productive and does not stall on bottlenecks.

**Acceptance Criteria:**

**Given** a team has idle capacity or a work item remains blocked beyond threshold conditions
**When** the Chief of Staff evaluates the organization
**Then** the system either reassigns work or raises a visible alert.
**And** the decision and reason are logged in the audit trail.

### Story 9.3: Save and replay a workflow as a template

As a user,
I want to save a successful workflow as a reusable template,
So that similar work can be run again without recreating the same coordination pattern.

**Acceptance Criteria:**

**Given** a workflow has completed or is in a stable state
**When** the user saves it as a template
**Then** the system persists the workflow configuration and step sequence for future reuse.
**And** the template can be replayed in a new work item or project context.

## Epic 10: Provenance, Trust, and Idea Maturity

Goal: Make agent decisions inspectable, reliable, and ready for product evolution beyond the first orchestration slice.

### Story 10.1: Record decisions with provenance metadata

As a user,
I want every agent decision to include evidence and rationale,
So that I can understand why decisions were made and how trustworthy they are.

**Acceptance Criteria:**

**Given** an agent makes a decision or recommendation for a work item
**When** the decision is saved
**Then** the system records agent ID, timestamp, reasoning, evidence references, confidence, and alternatives.
**And** the decision can be inspected from the work item or team history.

### Story 10.2: Persist artifact provenance and review access

As a user,
I want artifacts to show their origin and evidence,
So that I can trace research, requirements, and deployment output back to trusted sources.

**Acceptance Criteria:**

**Given** an artifact is generated for a work item
**When** the artifact is displayed or reviewed
**Then** provenance metadata is visible alongside the artifact.
**And** source references and trust classifications are available in the UI.

### Story 10.3: Support accuracy review and confidence flagging

As a user,
I want outputs to be reviewed for accuracy and confidence,
So that I can identify weak or risky work before it is acted upon.

**Acceptance Criteria:**

**Given** an output reaches a quality milestone or review checkpoint
**When** the review process runs
**Then** an accuracy score and review summary are created for the output.
**And** low-confidence outputs are explicitly flagged for user review.

### Story 10.4: Introduce idea refinement and maturity stages

As a product team,
I want ideas to move from raw concept to refined and decision-ready status,
So that we can evaluate whether the concept should progress into planning or be rejected.

**Acceptance Criteria:**

**Given** an idea has been researched and assessed
**When** the maturity review runs
**Then** the system assigns a stage such as raw, refined, validated, or ready-for-planning.
**And** the stage has clear criteria and evidence tied to the idea artifact.

## Epic 11: Idea Research and Product Definition

Goal: Convert a validated idea into a structured product definition and preparation for delivery work.

### Story 11.1: Research the concept and compile market evidence

As an Idea Team agent,
I want to autonomously gather research on the idea,
So that we can assess demand, competition, and feasibility with evidence.

**Acceptance Criteria:**

**Given** a work item enters the ideation phase
**When** the Idea Team begins research
**Then** the system produces market, competitor, and feasibility research artifacts with provenance.
**And** the output is attached to the work item in a reviewable form.

### Story 11.2: Validate novelty and patentability

As an Idea Team agent,
I want to assess concept novelty and possible patentability,
So that the product can be prioritized based on evidence rather than intuition.

**Acceptance Criteria:**

**Given** research is complete for an idea
**When** the novelty validation runs
**Then** the system produces a novelty and patentability assessment with references and confidence.
**And** the output is stored as a formal work-item artifact.

### Story 11.3: Create product definition from validated concepts

As a Product Team agent,
I want to turn a validated concept into a product definition,
So that the Technology Department has clear requirements, effort estimates, and roadmap direction.

**Acceptance Criteria:**

**Given** a concept is approved for product definition
**When** the Product Team generates the product definition
**Then** it includes requirements, roadmap details, and effort estimates.
**And** the Chief of Staff can review and approve the handoff to Technology.

## Epic 12: Build, Test, and Deploy the Product

Goal: Deliver the final lifecycle from implementation through quality assurance and deployment.

### Story 12.1: Autonomous development under team ownership

As a Development Team agent,
I want to build the planned product within the work item lifecycle,
So that the system can create a working implementation with a clear provenance trail.

**Acceptance Criteria:**

**Given** a work item reaches the development phase
**When** the Development Team executes its build workflow
**Then** implementation artifacts, commit metadata, and design rationale are captured.
**And** build output is visible and tied to the relevant work item.

### Story 12.2: Validate product quality before release

As a Testing Team agent,
I want to run the validation workflow on the implementation,
So that quality defects and reliability risks are identified before deployment.

**Acceptance Criteria:**

**Given** development work is complete
**When** the Testing Team executes validation
**Then** test plans and results are created with failure traceability to the relevant implementation.
**And** critical issues are surfaced for review before deployment.

### Story 12.3: Deploy to environment and monitor operational health

As a DevOps Team agent,
I want to deploy the validated product and configure operational monitoring,
So that the release is safe, observable, and recoverable.

**Acceptance Criteria:**

**Given** the product passes quality gates
**When** the deployment workflow runs
**Then** deployment metadata, environment details, and monitoring setup are recorded.
**And** users can view deployment status, rollback capability, and operational health.
