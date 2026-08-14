# Epic 3 Context: Copilot Integration & Feedback Resolution

<!-- Generated from planning artifacts. Regenerate with compile-epic-context if planning docs change. -->

## Goal

This epic lets Commander move the right work into GitHub Copilot, keep Jules and Copilot work visible in a single operational view, and resolve blocked feedback without leaving sessions stalled. The result is a coordinated flow where dispatch, escalation, approval, and state tracking happen in real time so the Command Center can continue orchestrating work rather than waiting on manual intervention.

## Stories

- Story 3.1: Copilot Dispatch & Session Tracking
- Story 3.2: Feedback Resolution Engine
- Story 3.3: Multi-Agent State Tracker

## Requirements & Constraints

The epic must support a deterministic dispatch model: ordinary story work can be sent to Jules when it is self-contained, while BMad-skill or orchestration-heavy work is always routed to Copilot via `bmad-agent-dev`. Copilot sessions need branch context and the full story spec in the prompt, and session creation must follow a stable branch naming pattern like `feat/<story-key>-<desc>`. Once active, Copilot work must emit live session state through SSE updates so the board can refresh without blocking the user experience.

Feedback handling is intentionally layered. Auto-rules should resolve straightforward questions such as missing file content, clarifying spec gaps, or project-rule lookups without human involvement. When rules fail, the system escalates to Copilot with the Jules feedback, story context, and project rules, and if Copilot still cannot decide, it presents a user approval card with a 2-minute timer and a default defer path if no response arrives. The system must avoid indefinite stalling: unhandled feedback should either resolve, be routed to a human decision, or safely continue with a deferred outcome.

The unified state model must represent both Jules and Copilot work as a single operating view, with session metadata, status, last poll time, and links back to the running work. All Copilot and session-tracking behavior should be consistent with the project’s BMad hierarchy rules and the Command Center’s real-time monitoring model.

## Technical Decisions

- All Copilot dispatches use `bmad-agent-dev` regardless of task type so routing stays simple and escalation logic is consistent.
- Dispatch classification is deterministic: stories with an `intent-contract` and code map are Jules-ready, while work requiring BMad skills or architectural cross-file reasoning is Copilot-only.
- Copilot session state is surfaced through a dedicated `copilot` SSE channel, while board refresh events keep the dashboard synchronized with state changes.
- The feedback engine uses a three-step resolution chain: auto-rules, Copilot agent, then user approval with a 2-minute timeout and deferred fallback.
- Unified state tracking merges Jules and Copilot session data into one object with per-item status, URLs, branch values, and polling timestamps so the dashboard can render a single active-agents view.
- Branch creation is treated as part of the dispatch workflow, with naming and traceability built into the orchestrator so each Copilot task remains linked to a story or task.

## UX & Interaction Patterns

The Command Center should present both active Jules sessions and Copilot sessions in a single Active Agents table, along with status, branch, and direct links to session work. When a Copilot task is blocked by feedback, the UI should surface a compact approval card that shows the relevant feedback, the reason a decision is needed, and the countdown timer. These cards can be stacked to handle multiple pending decisions without interrupting the main board view.

The board should also update in real time as Copilot sessions change state from running to idle, completed, or failed. This keeps the operator informed without requiring separate manual refreshes and preserves the single-monitor workflow that the architecture describes for the orchestrator.

## Cross-Story Dependencies

- ST-C3.1 is foundational: it provides the actual Copilot dispatch flow, branch creation, and session status reporting used by the rest of the epic.
- ST-C3.2 depends on the session-tracking and dispatch work from ST-C3.1 so it can attach feedback to the correct Jules/Copilot work item and escalate into the right Copilot session.
- ST-C3.3 depends on both previous stories because it must merge Jules and Copilot session state into one view and must reflect the same real-time updates used during dispatch and feedback resolution.
- Across epics, the work in EP-C3 is the operational prerequisite for PR lifecycle management in EP-C4: the same Copilot session architecture, state tracking, and approval flow are reused later for review, merge, and cleanup decisions.
