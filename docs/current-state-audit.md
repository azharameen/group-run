# Current State Audit

## Summary

This repository currently mixes three different modes:

1. **Real agent plumbing** — FastAPI, SSE, YAML persistence, a state machine, and a working LLM client.
2. **Partial agentic behavior** — some workflows call the LLM and write artifacts, but many paths still fall back to heuristics or simulated outputs.
3. **Non-agentic / mocked behavior** — hardcoded templates, simulated review decisions, and mock task/progress displays.

That means the app is **not yet safe to claim as fully agentic AI**.

The backend currently consists of:

- FastAPI REST + SSE transport
- YAML/Markdown filesystem persistence
- A custom `transitions` state machine
- Direct LangChain/OpenAI calls
- Custom scheduler and workflow orchestration

The frontend currently consists of:

- React + Vite
- shadcn/ui components
- Radix UI primitives
- Custom API client and SSE updates

## Research update: what DeepAgents already supports upstream

The upstream `langchain-ai/deepagents` package already provides the primitives this app needs:

- `create_deep_agent`
- `FilesystemMiddleware`
- `MemoryMiddleware`
- `SkillsMiddleware`
- `SubAgentMiddleware`
- `HumanInTheLoopMiddleware`
- checkpointer-backed approval / interrupt flows
- subagent-specific middleware stacks

That means the right direction is **adaptation**, not inventing a second agent runtime from scratch.

## Source map: where information comes from

### Current in-repo sources

- `workspace/ideas/**/idea.yaml` and `scores.yaml` — source-of-truth workflow artifacts
- `workspace/ideas.yaml` — idea registry
- `workspace/ideas/**/state.yaml` — state history and transition metadata
- `workspace/ideas/**/handovers/**` and `revisions/**` — human-readable handoff and revision artifacts
- `knowledge-base/raw/**` and `knowledge-base/processed/**` — local research corpus
- `instructions/global-agent-instructions.md` and `instructions/siemens-validator-instructions.md` — operating guidance

### What is trusted today versus what is not

- **Trusted enough as inputs:** the workspace files, knowledge-base documents, and instruction files above
- **Not trusted enough as final truth:** heuristic scoring output, simulated review decisions, mock task lists, and hardcoded agent personas

### Missing research sources that should be added before a full agentic claim

- patent database search source
- citation-backed web research source
- filing-status or approval system source, if the org has one
- optional internal Siemens source connectors if available

### Patents and filings tooling status

The repository does not yet have a real patent-search or patent-filing tool chain wired in as a production source of truth.

No repo-local MCP configuration for patent search / filing was found in the workspace during this audit.

DeepAgents now hosts the tools, memory, skills, and HITL interruptions, and the patent-specific retrieval adapters are integrated through the research path.

Recommended tool categories to evaluate:

- patent search APIs or adapters
- citation extraction / normalization tools
- web-research tools that can be delegated to subagents
- internal filing workflow connectors, if available

## Main Finding

The backend now has a DeepAgents runtime entrypoint and transcript-driven event model, but the surrounding workflow still blends custom orchestration with runtime-shaped events.

Instead, the repo contains a mix of:

- custom orchestration layers
- hardcoded idea templates
- heuristic fallback scoring
- simulated reviews
- mock progress/task data
- permissive gate checks

These are the biggest trust risks because they can present fabricated output as if it were agent-produced reasoning.

## Backend Findings

### Architecture findings

- `backend/app/main.py` mixes app startup, SSE bus, API routes, status aggregation, and config endpoints in one file.
- `backend/app/llm/subagent_executor.py` mixes prompt templates, agent execution, fallback logic, artifact writing, and workflow dispatch in one large file.
- `backend/app/state/machine.py` mixes state transitions, gate logic, persistence, event emission, and workflow metadata.
- `backend/app/orchestrator/workflow.py` mixes scheduling behavior, pipeline orchestration, state progression, scoring coordination, and UI activity flags.

### File-size hotspots

- `backend/app/llm/subagent_executor.py`: about 1180 lines
- `backend/app/main.py`: about 640 lines
- `backend/app/state/machine.py`: about 605 lines
- `backend/app/orchestrator/workflow.py`: about 503 lines

These files are beyond a comfortable maintenance size and violate single responsibility.

### Persistence findings

- Current persistence is custom and filesystem-based via `backend/app/storage/yaml_io.py`.
- The app stores source-of-truth data in YAML files under `workspace/ideas/...`.
- This is acceptable as a temporary persistence layer, but it is not the same as DeepAgents runtime state or memory.

### Review and governance findings

- Prior-art review is still partially simulated in the current implementation.
- Manager/IP/counsel review decisions now pause in blocking interrupts, but the surrounding drafting workflow still needs more runtime grounding.

These are acceptable only as placeholders for research/prototyping, not as trustworthy approval flows.

## Chat / conversation-thread findings

- The current chat UI now shows transcript-driven runtime events, but the backend runtime is still custom rather than upstream DeepAgents.
- `backend/app/api/routes/chat.py` currently merges:
  - user comments,
  - saved idea chat history,
  - and runtime transcript events.
- `frontend/src/components/RightChatSidebar.tsx` now renders transcript events directly and no longer bootstraps with fake persona messages.
- `frontend/src/components/IdeaHistoryTimeline.tsx` shows richer activity and state history, but it still relies on stored idea data rather than a live DeepAgents thread model.
- The backend now emits transcript-backed progress and workflow events through SSE and workflow state changes, and the UI renders them with explicit runtime roles.
- The current UI shows state progression, task summaries, and collapsed trace snippets, and it exposes transcript-backed thinking, subagent delegation, and tool-call traces as a first-class live conversation.
- In practice, the visible chat surface now combines:
  - real user comments,
  - stored idea chat history,
  - transcript-backed runtime events,
  - and scheduler-driven workflow updates.

### Current gap versus desired behavior

The user wants to see:

- agent thinking in near real time
- every tool call with parameters and results
- delegation from one agent to another subagent
- approval interrupts and resume actions
- the actual sequence of steps that caused a workflow transition

The runtime transcript is now present in the UI, but the system still needs the upstream DeepAgents runtime before it can claim full parity with the intended agent model.

### What is happening today in code

- `backend/app/agent/runner.py` emits runtime-shaped "thinking", "tool_call", "subagent", "handover", "retry", and "failed" events.
- `backend/app/api/routes/chat.py` transforms transcript records into chat messages and persists user/runtime events in idea history.
- The frontend renders those events as transcript cards with explicit role and provenance labels.

### Why this is a trust problem

- It can still blur the line between custom runtime plumbing and upstream DeepAgents semantics.
- It can hide whether a subagent truly ran or whether a step was simulated.
- It can make the UI appear more agentic than the runtime architecture actually is.

### What the conversation thread should become

Each idea thread should combine:

- user messages
- orchestrator progress events
- subagent messages
- tool-call events
- approval / interrupt events
- final artifact revisions

The UI should label the speaker as the actual agent role or human reviewer, not as a generic fake chat persona.

### Open issue checklist from this audit

- [x] remove hardcoded persona bootstrap messages from the sidebar
- [x] remove synthetic agent replies from chat history persistence
- [x] replace scripted streaming steps with real runtime event streaming
- [x] add explicit UI separation for user / orchestrator / subagent / tool / approval events
- [x] show real agent thinking only when it originates from the runtime, not from a template
- [x] preserve a transcript of tool calls and delegate handoffs as first-class events
- [x] make paused / failed / retry states visible instead of smoothing them over
- [x] add typed transcript event persistence and render it in the live chat surface

### Solution directions recorded

- use the upstream DeepAgents runtime as the execution source of truth
- map runtime events directly into a typed event stream for the UI
- keep comments and idea notes separate from agent transcripts
- store approvals, handoffs, tool calls, and subagent delegations as distinct records
- if an agentic step fails, show the failure and retry affordance instead of fabricating a conversational completion
- render the live sidebar from transcript events rather than fake bootstrap messages

### Hardcoded / mock / partial-agentic inventory

#### Must remove for a truthful agentic claim

- hardcoded idea-generation templates
- mock scoring fallbacks that fabricate scores
- simulated manager/IP/counsel approvals
- mock agent-task cards and fake progress statuses
- workflow auto-advance when no real agent work happened

#### Acceptable only as retry/error handling

- LLM retries
- explicit error states
- explicit user-visible retry prompts
- audit log entries describing failures

#### Acceptable as static config or documentation

- workflow state enum
- scoring weights and thresholds
- gate checklist definitions
- agent role definitions
- sample ideas and knowledge-base content when clearly marked as demo/reference data

## Dependency findings

- Repo root `requirements.txt` includes `deepagents==0.1.0`.
- `backend/requirements.txt` should be kept aligned with runtime needs if the app is expected to use DeepAgents directly.
- The current backend runtime dependencies and the documented DeepAgents feature set are not yet fully aligned.

## Frontend Findings

### Current stack

- shadcn/ui is already configured via `frontend/components.json`.
- Radix UI primitives are already installed and used.
- Tailwind is already configured.
- The frontend is not blocked on a UI replatform.

### Current integration model

- REST API calls are centralized in `frontend/src/api/client.ts`.
- Live updates are based on a custom SSE endpoint.
- The app already has pages and reusable cards for ideas, timelines, filesystems, and progress views.

### Frontend migration implication

The frontend does not need a visual rewrite first.

The main future frontend change is to add views for:

- DeepAgents task/todo state
- subagent lifecycle
- tool-call state
- human approval interrupts
- richer artifact and revision streams

## Immediate Risks

- Confusing naming: files describe DeepAgents integration that is not yet the source of truth everywhere.
- Runtime responsibilities are too collapsed into a few large Python files.
- Human review states are modeled as AI simulation.
- No proper permissions layer exists for agent-controlled filesystem access.
- DeepAgents checkpointer-backed interrupt flows are now wired through the runtime entrypoint and approval path.
- Frontend and backend streaming contracts are custom and shallow compared to DeepAgents event streaming.

## Recommendation

Do not silently promote the current app to a fully agentic claim.

Recommended path:

1. Keep the current app stable.
2. Replace fabricated outputs with retry/error states and explicit logs.
3. Adopt the upstream DeepAgents primitives for runtime, memory, skills, subagents, permissions, and HITL.
4. Move review stages from simulated LLM outputs to actual human interrupts.
5. Preserve an audit/history trail in the existing docs and milestone tracker so the decision path stays transparent.

## Selected path after research

The best fit for this repository is to **adapt the upstream DeepAgents package** rather than building a separate custom agent runtime.

Why this path wins:

- the package already provides `create_deep_agent`
- the package already supports `MemoryMiddleware`, `SkillsMiddleware`, `SubAgentMiddleware`, `FilesystemMiddleware`, and `HumanInTheLoopMiddleware`
- the package already treats HITL as a first-class interrupt concept
- the package already supports middleware layering, checkpointer-based state, and skill/memory loading

This means the repo should keep the current workflow data model, but stop pretending that hardcoded templates or heuristic fallbacks are equivalent to agentic reasoning.

## How to document decisions over time

Use the existing docs folder as the research history:

- keep the current audit updated when findings change
- keep the phased plan as the living implementation sequence
- keep the milestone tracker as the state of truth for progress
- record package/adaptation decisions in the milestone tracker rather than creating new duplicate history files

## Implementation checklist anchors

Use the existing docs as the single checklist system instead of adding duplicate planning files:

- `docs/phased-plan.md` — implementation milestones and tasks
- `docs/milestone-tracker.md` — completed work and pending work
- `docs/target-architecture.md` — the chosen architecture and trust boundaries
- `docs/feature-roadmap.md` — what is current, next, and later
