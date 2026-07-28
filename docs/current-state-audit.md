# Current State Audit

## Summary

The current application is a working custom workflow system, not a real DeepAgents application.

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

## Main Finding

The code uses the names `DeepAgents` and `SubAgent`, but the backend does not currently use:

- `create_deep_agent`
- DeepAgents backends
- DeepAgents permissions
- DeepAgents middleware stack
- DeepAgents event streaming
- DeepAgents memory or skills as first-class runtime features
- DeepAgents checkpointers for durable HITL flows

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

- Prior-art review is simulated by the LLM.
- Manager review is simulated by the LLM.
- IP review is simulated by the LLM.
- Counsel validation is simulated by the LLM.

These are acceptable placeholders for internal prototyping, but not for a production approval flow.

### Dependency findings

- Repo root `requirements.txt` includes `deepagents==0.1.0`.
- `backend/requirements.txt` did not previously include `deepagents`.
- The current backend runtime dependencies are not aligned with the documented DeepAgents feature set.

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

- Confusing naming: files describe DeepAgents integration that is not really there yet.
- Runtime responsibilities are too collapsed into a few large Python files.
- Human review states are modeled as AI simulation.
- No proper permissions layer exists for agent-controlled filesystem access.
- No DeepAgents checkpointer or interrupt flow exists yet.
- Frontend and backend streaming contracts are custom and shallow compared to DeepAgents event streaming.

## Recommendation

Do not rewrite the product in one step.

Recommended path:

1. Cleanly separate transport, domain, storage, and agent runtime.
2. Add an isolated DeepAgents runtime module.
3. Keep the existing workflow behavior stable while wiring new pieces in phases.
4. Replace simulated review stages with real HITL later in the plan.
