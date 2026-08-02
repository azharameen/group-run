---
title: Agentic Organization Platform
created: 2026-08-01
updated: 2026-08-01
status: draft
---

# PRD: Agentic Organization Platform

*Working title — confirm.*

## 0. Document Purpose

This PRD defines the **Agentic Organization Platform** — a SaaS that lets anyone form a virtual company of AI agents that work autonomously on real goals. It is written for the product team, engineering, and downstream workflow owners (architecture, UX, epics/stories).

This document builds on the existing codebase (thread system, DeepAgents runtime, idea-generation subagents) and defines the new **organization layer** that wraps it into a multi-agent SaaS product. The existing `docs/prd.md` described the legacy Siemens Patent Ideator; this PRD supersedes it.

**Structure:** Glossary-anchored vocabulary, features grouped by department/team, FRs nested with stable IDs. Assumptions tagged inline as `[ASSUMPTION]`.

---

## 1. Vision

**Build and manage a virtual organization of AI Agents.**

The **Agentic Organization Platform** is a SaaS that lets anyone — from a solo founder to a large team — form a company of AI agents. You create an organization, and it comes alive with departments and teams of specialized agents that work autonomously on your goals — guided by a **Chief of Staff** agent that plans the work, assigns idle agents, and keeps everything structured, provable, and aligned.

The platform is **domain-agnostic**: it starts with a software-development company and expands to any industry — medical, farming, and beyond. Agents earn autonomy **step-by-step** under guardrails you control, so the organization grows more capable and more independent over time — while you stay in command.

The **wow moment**: you watch your org take a raw idea and run it through a complete lifecycle — validate it's novel and patentable, research the market, build a roadmap, brainstorm it into something highly profitable, hand it to the Development team to build, Test it, deploy it, and analyze the results. All autonomously, all provable, all yours.

---

## 2. Target User

### 2.1 Jobs To Be Done

- **JTBD-1:** "I want to turn a raw idea into a built, tested, and deployed product without hiring a team."
- **JTBD-2:** "I want my AI organization to continuously improve ideas and products without me micromanaging."
- **JTBD-3:** "I want to see exactly what my agents are doing, why they made decisions, and how accurate their work is."
- **JTBD-4:** "I want to scale my organization's output by adding more agent capabilities, not more headcount."
- **JTBD-5:** "I want to run multiple products through my organization's lifecycle in parallel."

### 2.2 Non-Users (v1)

- **Non-technical users** who cannot articulate a product concept — the platform requires a seed idea or signal to start.
- **Enterprises requiring on-premise deployment** — v1 is cloud SaaS only. [ASSUMPTION: on-prem may come later.]

### 2.3 Key User Journeys

- **UJ-1. Alex launches his first AI organization.**
  - **Persona + context:** Alex, a solo founder with a product idea but no engineering team. Just signed up for the platform.
  - **Entry state:** Authenticated, empty dashboard. First-time user.
  - **Path:**
    1. Alex clicks "Create Organization" and names it.
    2. The platform spins up the default org: Chief of Staff, Ideation Department (Idea Team + Product Team), Technology Department (Dev Team + Test Team + DevOps Team).
    3. Alex sees the Command Center dashboard — his org is alive, agents are initialized, idle.
    4. A welcome walkthrough explains the departments, teams, and how to give the org a goal.
  - **Climax:** Alex types his first product idea into the chat. The Chief of Staff acknowledges it and assigns it to the Idea Team. Alex watches the Idea Team's agents begin researching in real-time.
  - **Resolution:** Alex sees the first research results streaming in. His org is working.

- **UJ-2. Maria watches an idea become a product.**
  - **Persona + context:** Maria, a product manager at a small startup. She's used the platform for a week.
  - **Entry state:** An idea has been fully researched and validated by the Ideation Department. The Chief of Staff has handed it off to the Technology Department.
  - **Path:**
    1. Maria opens the Command Center and sees the idea's status: "Ideation Complete → Handed to Technology."
    2. She opens the idea detail view and sees the full research packet: market analysis, novelty assessment, roadmap, requirements.
    3. She watches the Development Team begin building — agents are writing code, committing with full provenance.
    4. The Testing Team picks up completed features and runs tests, reporting results back.
    5. The DevOps Team deploys to staging, then to production.
  - **Climax:** Maria sees the product go live — a "Deployed" badge appears on the idea card.
  - **Resolution:** Maria reviews the deployment report: test coverage, performance metrics, cost breakdown. She shares the link with her team.

- **UJ-3. David checks his organization's health.**
  - **Persona + context:** David, a founder running multiple products through his AI org.
  - **Entry state:** Logged in, Command Center dashboard.
  - **Path:**
    1. David sees the dashboard: 3 products in progress, 2 in ideation, 1 in development, 1 live.
    2. He drills into the Technology Department to see what each team is working on.
    3. He sees the Dev Captain's report: "Team is at 80% capacity. Idle agent available."
    4. He assigns the idle agent to a new feature request.
  - **Climax:** David sees the agent pick up the task and start working within seconds.
  - **Resolution:** David closes the dashboard, confident his org is running efficiently.

---

## 3. Glossary

*Downstream workflows and readers must use these terms exactly. FRs, UJs, and SMs use Glossary terms verbatim.*

- **Organization** — A virtual company of AI agents. The top-level entity in the platform. Has one Chief of Staff, one or more Departments, and associated Teams and Agents.
- **Chief of Staff** — The top-level supervisor agent overseeing the entire Organization. Knows who does what, when, why, and how. Assigns work, resolves cross-department conflicts, and monitors org health.
- **Department** — A major functional area of the Organization (e.g., Ideation, Technology). Led by a **Chief**. Has its own scope, goals, and Teams.
- **Chief** — The supervisor agent leading a Department. Monitors all Teams within the Department, assigns work, and reports to the Chief of Staff.
- **Team** — A working group within a Department focused on a specific capability (e.g., Idea Team, Development Team). Led by a **Captain**.
- **Captain** — The supervisor agent leading a Team. Monitors agent activity, assigns tasks, and reports to the Department Chief.
- **Agent** — An individual AI worker with a defined role, tools, permissions, and capabilities. Belongs to exactly one Team.
- **Command Center** — The primary user interface: a single dashboard showing all work in progress, progress highlights, team/department status, and agent activity across the Organization.
- **Work Item** — A unit of work assigned to a Team or Agent. Can be an idea, a task, a feature, a bug fix, a research question, etc. Has status, owner, assignee, and provenance metadata.
- **Provenance** — The audit trail for every decision and artifact: references (where agents sourced information), reasoning (why a decision was made), and accuracy metadata.
- **Autonomy Ladder** — The step-wise progression of agent autonomy: human-in-the-loop → human-on-the-loop → autonomous. Each rung adds more decision authority to agents under guardrails.
- **Ideation Department** — The Department responsible for generating, researching, validating, and refining product ideas. Contains the Idea Team and Product Team.
- **Technology Department** — The Department responsible for building, testing, and deploying products. Contains the Development Team, Testing Team, and DevOps Team.
- **Idea Team** — A Team within the Ideation Department. Agents research markets, validate novelty, brainstorm features, and produce validated concepts.
- **Product Team** — A Team within the Ideation Department. Agents create requirements, user stories, roadmaps, and specifications from validated concepts.
- **Development Team** — A Team within the Technology Department. Agents build software (frontend, backend, infrastructure) with full provenance.
- **Testing Team** — A Team within the Technology Department. Agents validate functionality, performance, security, and quality.
- **DevOps Team** — A Team within the Technology Department. Agents deploy, monitor, and maintain infrastructure and production systems.

---

## 4. Features

### 4.1 Organization Lifecycle

**Description:** The core capability — creating, managing, and operating a virtual organization of AI agents. The user creates an Organization, and the platform instantiates the default structure (Chief of Staff, Departments, Teams, Agents). The Organization is always running; agents work autonomously on assigned Work Items. Realizes UJ-1, UJ-2, UJ-3.

**Functional Requirements:**

#### FR-1: Create Organization

A user can create a new Organization with a name and description. The platform instantiates the default org structure: Chief of Staff, Ideation Department (Chief + Idea Team + Product Team), Technology Department (Chief + Development Team + Testing Team + DevOps Team). Realizes UJ-1.

**Consequences (testable):**

- Organization is created with all default Departments, Teams, and Agents initialized.
- Chief of Staff agent is active and responsive.
- Command Center dashboard is populated with org structure.

#### FR-2: Command Center Dashboard

The user sees a single dashboard showing: all Work Items in progress, progress per Work Item, Department/Team status (active/idle/overloaded), agent activity feed, and highlights (recent completions, blockers, handoffs). Realizes UJ-1, UJ-3.

**Consequences (testable):**

- Dashboard loads within 2 seconds for an org with 10+ active Work Items.
- Each Work Item shows status, owning Team, and last activity timestamp.
- Department/Team cards show capacity (active agents / total agents).

#### FR-3: Submit Work Item

A user can submit a new Work Item (product idea, feature request, task) via chat or a form. The Chief of Staff receives it, assesses it, and assigns it to the appropriate Department and Team. Realizes UJ-1, UJ-2.

**Consequences (testable):**

- Work Item is created with status `new` and assigned to Chief of Staff.
- Chief of Staff assigns it to a Department within 30 seconds.
- User sees the assignment in the Command Center feed.

#### FR-4: Work Item Lifecycle

Each Work Item progresses through a configurable lifecycle. The default v1 lifecycle is: `new → ideation → product_definition → development → testing → deployment → monitoring`. Each phase is owned by the appropriate Team. Realizes UJ-2.

**Consequences (testable):**

- Work Item status transitions are logged with timestamps and owning Team.
- Handoffs between Teams are recorded with provenance.
- User can view the full lifecycle history of any Work Item.

#### FR-5: Organization Health Monitoring

The Chief of Staff continuously monitors org health: agent capacity, Work Item throughput, bottlenecks, idle agents. Surfaces alerts when a Team is overloaded or an agent has been idle too long. Realizes UJ-3.

**Consequences (testable):**

- Dashboard shows capacity per Team (active/idle/total agents).
- Chief of Staff reassigns idle agents to pending Work Items.
- Alert is raised when a Work Item is stuck in one phase for >24 hours. [ASSUMPTION: threshold configurable.]

### 4.2 Ideation Department

**Description:** The Ideation Department generates, researches, validates, and refines product ideas. The Idea Team researches markets and validates novelty; the Product Team creates requirements and roadmaps. This is **agent-driven** — agents decide how to research, what sources to consult, and how to structure their output. It is NOT a rule-based pipeline. Realizes UJ-1, UJ-2.

**Functional Requirements:**

#### FR-6: Autonomous Idea Research

When a Work Item enters the `ideation` phase, the Idea Team's agents autonomously research the concept: market landscape, competitor analysis, prior art / patent search, technical feasibility, and target audience. Agents decide which sources to consult and how deep to go. [ASSUMPTION: agents have access to web search, knowledge base, and patent databases.]

**Consequences (testable):**

- Research output includes: market summary, competitor list, prior art references, feasibility assessment.
- Every claim in the research output has a provenance reference (source URL or document).
- Research is completed within a configurable time budget.

#### FR-7: Novelty and Patentability Validation

The Idea Team validates whether the concept is novel and potentially patentable. Agents search prior art, assess novelty claims, and produce a patentability assessment. Realizes UJ-2.

**Consequences (testable):**

- Patentability assessment includes: novelty score, prior art references, freedom-to-operate analysis.
- Assessment is stored as a Work Item artifact with full provenance.

#### FR-8: Product Definition

When a concept passes ideation, the Product Team creates: product requirements, user stories, roadmap, effort estimates, and success metrics. The Chief of Staff reviews and approves before handing to Technology. Realizes UJ-2.

**Consequences (testable):**

- Product requirements document is created as a Work Item artifact.
- Roadmap includes phases with estimated effort per phase.
- Effort estimates include agent-hours and compute cost projections.

#### FR-9: Continuous Idea Improvement

The Ideation Department does not stop after handoff. Agents continuously monitor the market, user feedback, and competitive landscape for existing Work Items, and suggest improvements, pivots, or deprecations. [ASSUMPTION: this is a background process, not blocking the main lifecycle.]

**Consequences (testable):**

- Improvement suggestions appear in the Command Center as notifications.
- Each suggestion includes rationale and expected impact.

### 4.3 Technology Department

**Description:** The Technology Department builds, tests, and deploys products. The Development Team writes code, the Testing Team validates quality, and the DevOps Team deploys and monitors. All work is done with full provenance — every commit, test run, and deployment is logged with agent attribution. Realizes UJ-2.

**Functional Requirements:**

#### FR-10: Autonomous Development

When a Work Item enters the `development` phase, the Development Team's agents autonomously build the product: architecture design, code implementation, documentation, and version control. Agents decide the tech stack, implementation order, and testing strategy within the project's constraints. [ASSUMPTION: agents have access to a sandboxed development environment.]

**Consequences (testable):**

- Code is committed with full provenance: agent attribution, timestamp, reasoning for design decisions.
- Each commit references the Work Item and specific requirement being implemented.
- Build artifacts are produced and stored.

#### FR-11: Quality Assurance

The Testing Team autonomously validates the built product: functional testing, integration testing, performance testing, security scanning. Agents design test plans, execute tests, and report results. Realizes UJ-2.

**Consequences (testable):**

- Test plan is created and reviewed before execution.
- Test results include: pass/fail counts, coverage metrics, performance benchmarks.
- Failed tests are linked to specific code commits for traceability.

#### FR-12: Deployment and Operations

The DevOps Team autonomously deploys the built and tested product to the target environment (staging → production). Agents configure infrastructure, manage deployments, and set up monitoring. Realizes UJ-2.

**Consequences (testable):**

- Deployment is logged with: environment, version, timestamp, agent attribution.
- Monitoring dashboards are configured for the deployed product.
- Rollback capability exists and is tested.

#### FR-13: Continuous Monitoring and Maintenance

After deployment, the Technology Department monitors the product: uptime, performance, error rates, resource usage. Agents proactively address issues and suggest improvements. [ASSUMPTION: monitoring infrastructure is provided by the platform.]

**Consequences (testable):**

- Monitoring alerts are surfaced in the Command Center.
- Agents respond to incidents within a configurable SLA.
- Maintenance tasks (updates, patches) are scheduled and executed.

### 4.4 Chief of Staff

**Description:** The Chief of Staff is the top-level supervisor agent. Oversees all Departments, knows the state of every Work Item and agent, resolves cross-department conflicts, assigns priorities, and ensures the Organization runs efficiently. The Chief of Staff is the user's primary interface to the Organization. Realizes UJ-1, UJ-2, UJ-3.

**Functional Requirements:**

#### FR-14: Cross-Department Orchestration

The Chief of Staff monitors all Departments and Teams, tracks Work Item progress, and orchestrates handoffs between Departments. When a Work Item completes ideation, the Chief of Staff reviews and hands it to the Technology Chief. Realizes UJ-2.

**Consequences (testable):**

- Handoffs between Departments are logged with Chief of Staff approval.
- Chief of Staff can reassign Work Items between Teams if capacity requires.

#### FR-15: User Communication

The user can communicate with the Chief of Staff via chat. The Chief of Staff responds to questions about org status, Work Item progress, agent activity, and can accept new Work Items or instructions from the user. Realizes UJ-1, UJ-3.

**Consequences (testable):**

- User messages to Chief of Staff receive a response within 10 seconds.
- Chief of Staff can accept new Work Items from chat and route them appropriately.
- Chief of Staff can explain why a decision was made, with references.

#### FR-16: Contradiction Detection

The Chief of Staff monitors user-agent and agent-agent discussions. If a discussion contradicts a prior agreement, decision, or org policy, the Chief of Staff intervenes with a correction or clarification. [ASSUMPTION: contradiction detection is heuristic-based in v1, not exhaustive.]

**Consequences (testable):**

- Contradictions are flagged in the Command Center with explanation.
- Chief of Staff logs the contradiction and resolution.

#### FR-17: Capacity Management

The Chief of Staff continuously monitors agent capacity across all Teams. When agents are idle, the Chief of Staff assigns them to pending Work Items or suggests tasks. When a Team is overloaded, the Chief of Staff reprioritizes or escalates. Realizes UJ-3.

**Consequences (testable):**

- Idle agents are reassigned within 5 minutes.
- Overloaded Teams trigger a notification to the user with options (reprioritize, add capacity, defer).

### 4.5 Provenance and Audit

**Description:** Every decision, artifact, and action across the Organization carries full provenance metadata. Users can trace any output back to its sources, understand why decisions were made, and verify accuracy. Realizes UJ-2, UJ-3.

**Functional Requirements:**

#### FR-18: Decision Logging

Every agent decision is logged with: agent ID, timestamp, reasoning, references (sources consulted), confidence level, and alternatives considered. Realizes UJ-3.

**Consequences (testable):**

- Decision log is queryable by Work Item, Team, Agent, and time range.
- Each log entry includes a human-readable explanation.

#### FR-19: Artifact Provenance

Every artifact (research report, requirements doc, code commit, test report, deployment record) carries provenance metadata: agent attribution, source references, trust level (`generated`, `trusted`, `verified-tool-call`, `fallback`), and evidence references. Realizes UJ-2.

**Consequences (testable):**

- Artifact provenance is displayed alongside the artifact in the UI.
- Users can click through provenance references to source materials.

#### FR-20: Accuracy Review

The platform supports accuracy review of agent outputs. Review can be self-review (agent validates its own output), peer review (another agent audits), or human review. The review produces an accuracy score and a list of verified/failed claims. [ASSUMPTION: the specific review mechanism will be decided in a dedicated brainstorming session.]

**Consequences (testable):**

- Each Work Item has an accuracy score at key lifecycle milestones.
- Accuracy scores are displayed in the Command Center.
- Low-accuracy outputs are flagged for human attention.

---

## 5. Non-Goals (Explicit)

| Non-Goal | Rationale |
| ---------- | ----------- |
| Custom org design (user-defined departments/teams/agents) | v1 uses a fixed, best-practice org structure for software development |
| Human employees joining the org | Deferred to v2+; architecture must allow it |
| Finance/Legal/HR/Marketing departments | Deferred to v2+; v1 focuses on Ideation + Technology |
| Multi-industry support (medical, farming, etc.) | v1 is software-development only; domain-agnostic architecture planned |
| On-premise deployment | v1 is cloud SaaS only |
| Subscription billing and payments | Deferred; architecture must not preclude tiering |
| Custom agent creation by users | v1 uses predefined agents with fixed roles |
| Real-time collaboration between multiple human users | v1 is single-user per organization |

---

## 6. MVP Scope

### 6.1 In Scope

- Organization creation with default structure (Chief of Staff, Ideation Dept, Technology Dept)
- Command Center dashboard
- Work Item submission and lifecycle (ideation → product → dev → test → deploy)
- Autonomous idea research and validation (Idea Team)
- Product definition (Product Team)
- Autonomous development (Development Team)
- Quality assurance (Testing Team)
- Deployment and operations (DevOps Team)
- Chief of Staff orchestration and user communication
- Provenance and audit logging
- Accuracy review framework (mechanism TBD)

### 6.2 Out of Scope for MVP

| Item | Reason | Future |
| ------ | -------- | -------- |
| Finance/Legal/HR/Marketing departments | v1 focuses on core product lifecycle | v2+ |
| Human employees | Requires multi-user, RBAC, org chart | v2+ |
| Custom org design | Requires org builder UI and agent catalog | v2+ |
| Subscription billing | Requires payment integration | v2+ |
| Multi-industry templates | Requires domain modeling per industry | v3+ |
| Mobile app | Desktop-first web application | TBD |

---

## 7. Success Metrics

### Primary

- **SM-1**: Time from Work Item submission to deployment — target: < 48 hours for a standard feature. Validates FR-3, FR-4, FR-10, FR-11, FR-12.
- **SM-2**: Percentage of Work Items that complete the full lifecycle without human intervention — target: > 80%. Validates FR-6, FR-7, FR-8, FR-10, FR-11, FR-12.
- **SM-3**: User satisfaction score (post-lifecycle survey) — target: > 4.0 / 5.0. Validates overall product.

### Secondary

- **SM-4**: Average agent idle time — target: < 10% of total agent time. Validates FR-17.
- **SM-5**: Provenance completeness — target: 100% of artifacts have provenance metadata. Validates FR-18, FR-19.

### Counter-metrics (do not optimize)

- **SM-C1**: Agent autonomy without accuracy — do not optimize for speed if accuracy drops below 90%. Counterbalances SM-1.
- **SM-C2**: Full automation without user visibility — do not optimize for zero human intervention if users feel out of control. Counterbalances SM-2.

---

## 8. Open Questions

1. **Accuracy review mechanism** — What is the right approach? Self-review, peer review, scoring engine, or combination? Needs dedicated brainstorming session.
2. **Agent development environment** — How do Development Team agents write and test code? Sandboxed container? Cloud IDE? API-based?
3. **Chief of Staff contradiction detection** — How sophisticated should this be in v1? Keyword-based? Semantic? LLM-judged?
4. **Work Item lifecycle customization** — Should users be able to add/remove lifecycle phases in v1, or is fixed acceptable?
5. **Multi-user organizations** — When do we add the ability for multiple humans to belong to one org? v2?

---

## 9. Assumptions Index

- `[ASSUMPTION]` from §2.2: On-prem deployment may come later.
- `[ASSUMPTION]` from §4.1 (FR-5): Idle-agent threshold is configurable.
- `[ASSUMPTION]` from §4.2 (FR-6): Agents have access to web search, knowledge base, and patent databases.
- `[ASSUMPTION]` from §4.2 (FR-9): Continuous improvement is a background process, not blocking.
- `[ASSUMPTION]` from §4.3 (FR-10): Agents have access to a sandboxed development environment.
- `[ASSUMPTION]` from §4.3 (FR-13): Monitoring infrastructure is provided by the platform.
- `[ASSUMPTION]` from §4.4 (FR-16): Contradiction detection is heuristic-based in v1.
- `[ASSUMPTION]` from §4.5 (FR-20): Accuracy review mechanism will be decided in a dedicated session.
