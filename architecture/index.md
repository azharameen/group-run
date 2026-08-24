# Architecture

> **Last updated: 2026-08-04**
>
> **⚠️ MAJOR PIVOT**: This document supersedes the previous Siemens Patent Ideator architecture. The system is now the **Agentic Organization Platform** — a general-purpose, multi-agent organizational framework. See [Architecture Decisions](https://azharameen.github.io/group-run/architecture-decisions/index.md) for pivot rationale.

## 1. System Overview

The **Agentic Organization Platform** is a general-purpose multi-agent orchestration system built on LangGraph + DeepAgents. It models an autonomous software company where:

- Users interact with a **Supervisor Agent** via a right-sidebar chat
- **@mentions** route messages to specific agents or teams
- **Threads** are native LangGraph checkpoints (persisted, resumable, streaming)
- **Teams of AI agents** work on work items in parallel
- **Work Items** (ideas, tasks, projects, documents) map 1:1 or 1:N to threads
- **True event streaming** — UI binds to `astream_events()` output

> **Origin**: This platform evolved from the Siemens Patent Ideator (an 18-state FSM patent pipeline). The FSM, patent-specific subagents, scoring engine, and YAML-based storage are being phased out in favor of a general-purpose, graph-based orchestration layer.

### 1.1 Architecture Principles

| Principle                          | Description                                                                                                                                                             |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **LangGraph-native orchestration** | Threads, checkpoints, and streaming use native LangGraph primitives — not custom APIs. `SQLiteSaver`/`PostgresSaver` for persistence, `astream_events()` for streaming. |
| **Supervisor + teams hierarchy**   | A supervisor agent routes user intents to the correct team/agent. Direct @mention routing is deferred for this iteration. Teams are DeepAgents sub-graphs.              |
| **Thread = source of truth**       | Every conversation is a LangGraph thread with checkpoint metadata (`updated_at`, `title`, `status`, `work_item_id`). Thread list is sorted by `updated_at`.             |
| **True streaming**                 | Events are pushed to the frontend as they arrive from `astream_events()`. No collect-then-deliver pattern.                                                              |
| **Domain-agnostic core**           | The platform core (threads, teams, @mentions, work items) has no domain-specific logic. Domains are configured via YAML team/agent definitions.                         |
| **Decoupled work items**           | Work items are domain objects (persisted separately) that link to threads. Multiple threads can map to one work item.                                                   |

### 1.2 High-Level Architecture

```
graph TB
    subgraph Frontend["Frontend (React + shadcn/ui)"]
        ThreadList["Thread List (Left Pane)"]
        ChatView["Chat View (Right Pane)"]
        WorkItemDetail["Work Item Detail (Main Area)"]
        StreamHandler["Stream Event Handler"]
    end

    subgraph API["Backend (FastAPI)"]
        ThreadAPI["Thread Manager API"]
        WorkItemAPI["Work Item API"]
        AgentTeamAPI["Agent/Team Manager"]
        SSE["SSE Streaming"]
    end

    subgraph Graph["LangGraph + DeepAgents Runtime"]
        Supervisor["Supervisor Agent (graph node)"]
        TeamAlpha["Team Alpha (subgraph)"]
        TeamBeta["Team Beta (subgraph)"]
        Checkpointer["Checkpointer (SQLiteSaver)"]
        Middleware["Middleware Stack"]
    end

    subgraph Domain["Domain Layer"]
        WorkItems["Work Items (SQLite)"]
        Config["Team Config (YAML)"]
        Teams["Team/Agent Registry"]
        Memories["Long-term Memories"]
    end

    subgraph LLM["LLM Layer"]
        LC["LangChain Chat Models"]
    end

    Frontend -->|HTTP/REST| API
    Frontend -->|SSE Stream| SSE
    API --> ThreadAPI
    ThreadAPI --> Graph
    Graph --> Supervisor
    Supervisor --> TeamAlpha
    Supervisor --> TeamBeta
    Graph -->|persist| Checkpointer
    API --> Domain
    Domain --> WorkItems
    Domain --> Config
    Domain --> Teams
    Graph -->|prompt| LLM
    Graph --> Memories
```

## 2. Backend Architecture

### 2.1 Directory Structure (Target)

```text
backend/app/
├── main.py                          # FastAPI entry point → create_app()
├── config.py                        # Settings, directory paths (Pydantic Settings)
│
├── api/
│   ├── app.py                       # FastAPI app factory
│   ├── deps.py                      # Dependency injection
│   └── routes/
│       ├── health.py                # Health check endpoint
│       ├── threads.py               # Thread CRUD + streaming endpoints
│       ├── work_items.py            # Work item endpoints
│       ├── teams.py                 # Agent/team configuration endpoints
│       └── chat.py                  # Chat + @mention endpoints
│
├── thread/                          # (NEW) Thread system
│   ├── manager.py                   # ThreadManager service
│   ├── saver.py                     # Checkpointer configuration
│   └── models.py                    # Thread metadata models
│
├── agent/
│   ├── __init__.py
│   ├── runtime.py                   # get_deep_agent_runtime() factory
│   ├── supervisor.py                # (NEW) Supervisor agent wiring
│   ├── teams.py                     # (NEW) Team definitions from YAML config
│   ├── router.py                    # (NEW) @mention routing logic
│   └── backends.py                  # CompositeBackend configuration
│
├── work_items/                      # (NEW) Work item domain
│   ├── models.py                    # WorkItem, WorkItemStatus, Artifact models
│   ├── service.py                   # Work item CRUD + thread linking
│   └── repository.py                # SQLite persistence
│
├── models/                          # (DEPRECATED) Siemens-specific models
│   ├── idea.py                      # Will be replaced by WorkItem
│   ├── transcript.py                # Will be replaced by LangGraph events
│   └── siemens.py                   # Siemens-specific (removed in Phase 4)
│
├── state/                           # (DEPRECATED) transitions FSM
│   ├── machine.py                   # To be removed in Phase 4
│   ├── definitions.py               # To be removed in Phase 4
│   └── gates.py                     # To be removed in Phase 4
│
├── scoring/                         # (DEPRECATED) Patent scoring
│   ├── engine.py                    # To be removed in Phase 4
│   └── criteria.py                  # To be removed in Phase 4
│
├── orchestrator/                    # (DEPRECATED) Pipeline orchestrator
│   └── workflow.py                  # To be removed in Phase 4
│
├── llm/
│   ├── client.py                    # ChatOpenAI wrapper
│   └── subagent_executor.py         # Will be replaced by DeepAgents native
│
├── storage/                         # (DEPRECATED) YAML storage
│   └── ...                          # To be replaced by SQLite
│
├── infrastructure/
│   └── events/                      # Will be replaced by LangGraph events
│
└── application/
    └── queries/                     # Will be replaced by work item queries
```

### 2.2 DeepAgents Runtime Configuration

#### Runtime Factory (`agent/runtime.py`)

```python
def get_deep_agent_runtime():
    from deepagents import create_deep_agent
    from langgraph.checkpoint.sqlite import SqliteSaver

    return create_deep_agent(
        model=settings.deepagents_model,
        system_prompt=_load_system_prompt(),
        backend=build_agent_backend(),
        permissions=build_agent_permissions(),
        subagents=build_agent_subagents(),
        context_schema=DeepAgentContext,
        interrupt_on={...},
        checkpointer=SqliteSaver.from_conn_string("checkpoints.db"),
        name="agentic-organization",
    )
```

> **Note:** `InMemorySaver` was replaced with `SqliteSaver` in Phase 1 to persist threads across restarts. The async `AsyncSqliteSaver` was tried but reverted due to `RuntimeError: no running event loop` — the sync `SqliteSaver` is used instead.

#### Thread Checkpointer Configuration

```python
# thread/saver.py
import sqlite3
from langgraph.checkpoint.sqlite import SqliteSaver

conn = sqlite3.connect("checkpoints.db", check_same_thread=False)
conn.row_factory = sqlite3.Row
checkpointer = SqliteSaver(conn)
```

### 2.3 LangGraph Thread Model

The system uses native LangGraph threads as the core conversation primitive:

```text
Thread (LangGraph checkpoint)
├── thread_id: UUID
├── checkpoint metadata:
│   ├── title: str
│   ├── updated_at: datetime (indexed, for sorted listing)
│   ├── created_at: datetime
│   ├── status: active | paused | completed | archived
│   ├── work_item_id: UUID | null
│   └── tags: list[str]
├── messages: list[ChatMessage]
└── checkpoints: list[Checkpoint]
```

#### Thread API

| Endpoint                        | Purpose                                   | LangGraph Primitive         |
| ------------------------------- | ----------------------------------------- | --------------------------- |
| `GET /api/threads`              | List threads, sorted by `updated_at` DESC | Checkpoint metadata query   |
| `POST /api/threads`             | Create new thread                         | `graph.create_checkpoint()` |
| `GET /api/threads/{id}`         | Get thread messages                       | `graph.get_state()`         |
| `POST /api/threads/{id}/stream` | Send message + stream response            | `graph.astream_events()`    |
| `PUT /api/threads/{id}`         | Update thread metadata                    | Checkpoint metadata update  |
| `DELETE /api/threads/{id}`      | Delete thread                             | Checkpoint removal          |

### 2.4 Supervisor Agent + Routing

```text
┌─────────────────────────────────────────────┐
│              Supervisor Agent                 │
│  - Routes user intent to correct team/agent   │
│  - Parses @mentions → direct delegation       │
│  - No @mention → LLM decides routing          │
└─────────────────────────────────────────────┘
         │                    │
         ▼                    ▼
┌─────────────────┐  ┌─────────────────┐
│   Team Alpha    │  │   Team Beta     │
│  ┌───────────┐  │  │  ┌───────────┐  │
│  │ Lead Agent│  │  │  │ Lead Agent│  │
│  │ ┌───────┐ │  │  │  │ ┌───────┐ │  │
│  │ │Special-│ │  │  │  │ │Special-│ │  │
│  │ │ist     │ │  │  │  │ │ist     │ │  │
│  │ └───────┘ │  │  │  │ └───────┘ │  │
│  └───────────┘  │  │  └───────────┘  │
└─────────────────┘  └─────────────────┘
```

**Routing model:**

- Supervisor is a DeepAgents sub-agent with `delegate_to_team()` and `delegate_to_agent()` tools
- Team definitions are loaded from configuration rather than hard-coded into the workflow layer
- Message routing is server-authoritative so the UI can stay thin and event-driven
- @mention parsing is intentionally deferred until the domain model and team registry are stable

### 2.5 Thread ↔ Work Item Mapping

```text
Work Item (persistent domain object)
├── work_item_id: UUID
├── type: task | project | document | idea | ...
├── threads: list[thread_id]  # one-to-many mapping
├── status: open | in_progress | review | done | archived
├── artifacts: list[Artifact]
├── owner: agent_id | team_id | user
├── assignee: agent_id | team_id | null
├── metadata: dict
└── created_at / updated_at
```

- One work item can have multiple threads (user can switch context within a work item)
- Threads are persisted in LangGraph checkpointer (SQLiteSaver)
- Work items are persisted in domain SQLite tables
- Thread list joined with work item data for display

### 2.6 True Streaming Protocol

**Target:** Bind directly to DeepAgents' native event streaming:

```python
# Backend: FastAPI SSE endpoint using astream_events
async def stream_chat(thread_id: str, message: str):
    graph = get_deep_agent_runtime()

    async for event in graph.astream_events(
        {"messages": [HumanMessage(content=message)]},
        config={"configurable": {"thread_id": thread_id}},
        version="v2",
    ):
        # Map LangGraph event types to frontend event types
        yield {
            "event": map_event_type(event["event"]),
            "data": extract_event_data(event),
        }
```

**Frontend:** Native EventSource consumption — no buffering:

```typescript
const eventSource = new EventSource(`/api/threads/${threadId}/stream`);
eventSource.onmessage = (event) => {
    renderEvent(JSON.parse(event.data));
};
```

### 2.7 API Endpoints (Target State)

| Method | Endpoint                   | Purpose                             |
| ------ | -------------------------- | ----------------------------------- |
| GET    | `/api/threads`             | List threads (sorted by updated_at) |
| POST   | `/api/threads`             | Create thread                       |
| GET    | `/api/threads/{id}`        | Get thread messages                 |
| POST   | `/api/threads/{id}/stream` | Send message + SSE stream           |
| PUT    | `/api/threads/{id}`        | Update thread metadata              |
| DELETE | `/api/threads/{id}`        | Delete thread                       |
| GET    | `/api/work-items`          | List work items                     |
| POST   | `/api/work-items`          | Create work item                    |
| GET    | `/api/work-items/{id}`     | Get work item detail                |
| PUT    | `/api/work-items/{id}`     | Update work item                    |
| DELETE | `/api/work-items/{id}`     | Delete work item                    |
| GET    | `/api/teams`               | List teams/agents                   |
| POST   | `/api/teams/{name}/config` | Update team config                  |
| GET    | `/api/health`              | Health check                        |

## 3. Frontend Architecture

### 3.1 Directory Structure (Target)

```text
frontend/src/
├── main.tsx                         # Entry point
├── App.tsx                          # Router, layout
├── index.css                        # Tailwind + shadcn/ui styles
│
├── api/
│   ├── client.ts                    # REST API client
│   ├── threads.ts                   # Thread API client
│   └── work_items.ts                # Work item API client
│
├── components/
│   ├── ui/                          # shadcn/ui components
│   ├── threads/
│   │   ├── ThreadList.tsx           # Left pane thread list (sorted, searchable)
│   │   ├── ThreadItem.tsx           # Single thread item
│   │   └── ThreadCreateButton.tsx   # New thread button
│   ├── chat/
│   │   ├── ChatView.tsx             # Main chat view with message list
│   │   ├── ChatInput.tsx            # Message input with @mention support
│   │   ├── MessageBubble.tsx        # Individual message bubble
│   │   ├── MentionAutocomplete.tsx  # @mention autocomplete dropdown
│   │   └── StreamEventHandler.tsx   # Binds to SSE events
│   ├── work-items/
│   │   ├── WorkItemDetail.tsx       # Work item detail view
│   │   └── WorkItemCard.tsx         # Work item summary card
│   ├── teams/
│   │   └── TeamStatus.tsx           # Team/agent status indicators
│   └── deepagents/                  # (Existing, will be migrated)
│       ├── AgentTodoPanel.tsx
│       ├── SubagentActivityCard.tsx
│       ├── ToolCallTimeline.tsx
│       └── InterruptInbox.tsx
│
├── hooks/
│   ├── useThreads.ts               # Thread CRUD + list management
│   ├── useThreadStream.ts          # SSE streaming hook
│   └── useMentions.ts              # @mention parsing hook
│
├── lib/
│   └── utils.ts
│
├── pages/
│   ├── Dashboard.tsx                # (REDESIGN) Thread-centric dashboard
│   ├── WorkItemPage.tsx             # (NEW) Work item detail page
│   └── Settings.tsx                 # (NEW) Team/agent configuration
│
└── types/
    ├── thread.ts                    # Thread types
    ├── work-item.ts                 # Work item types
    └── agent.ts                     # Agent/team types
```

### 3.2 Component Hierarchy (Target)

```text
App
├── SidebarProvider
│   ├── AppSidebar (left nav)
│   │   ├── ThreadList
│   │   │   ├── ThreadCreateButton
│   │   │   └── ThreadItem[] (sorted by updated_at DESC, active highlighted)
│   │   └── TeamStatus
│   ├── SidebarInset
│   │   ├── SiteHeader
│   │   └── main (Routes)
│   │       ├── Dashboard → ThreadList + ChatView (split pane)
│   │       │   ├── ThreadList (left)
│   │       │   └── ChatView (right)
│   │       │       ├── MessageBubble[]
│   │       │       ├── ChatInput (with @mention autocomplete)
│   │       │       └── StreamEventHandler (binds to SSE)
│   │       └── WorkItemPage
│   │           └── WorkItemDetail
│   └── RightChatSidebar (for deepagents integration)
│       ├── AgentTodoPanel
│       ├── SubagentActivityCard[]
│       ├── ToolCallTimeline
│       └── InterruptInbox
```

### 3.3 Data Flow

```
sequenceDiagram
    participant UI as Frontend UI
    participant API as API Client
    participant SSE as SSE Stream
    participant BE as Backend
    participant G as LangGraph Runtime
    participant DB as SQLite (Checkpoints)

    Note over UI,BE: Thread list (sorted by updated_at)
    UI->>API: GET /api/threads
    API->>BE: query thread metadata
    BE->>DB: SELECT * FROM checkpoints ORDER BY updated_at DESC
    DB-->>BE: thread list
    BE-->>API: JSON threads
    API-->>UI: Render sorted thread list

    Note over UI,BE: Send message + stream response
    UI->>API: POST /api/threads/{id}/stream (message)
    API->>BE: stream_chat(thread_id, message)
    BE->>G: graph.astream_events()
    loop For each event
        G-->>BE: on_chain_start, on_chat_model_stream, on_tool_start, ...
        BE-->>SSE: push SSE event
        SSE-->>UI: renderEvent(event)
    end
    G-->>BE: completion
    BE-->>SSE: done event
    SSE-->>UI: stream complete
```

## 4. Data Model

### 4.1 Thread + Work Item Persistence

```text
checkpoints.db (LangGraph SQLiteSaver)
├── checkpoints table
│   ├── thread_id
│   ├── checkpoint_ns
│   ├── checkpoint_id
│   ├── parent_checkpoint_id
│   ├── type
│   └── checkpoint (JSON blob)
├── checkpoint_blobs table
├── checkpoint_writes table
└── writes table

app.db (Domain SQLite database)
├── work_items
│   ├── id (UUID, PK)
│   ├── type (task | project | document | idea)
│   ├── title
│   ├── description
│   ├── status (open | in_progress | review | done | archived)
│   ├── owner_type (agent | team | user)
│   ├── owner_id
│   ├── assignee_type (agent | team | null)
│   ├── assignee_id
│   └── created_at / updated_at
│
├── thread_metadata (mirrors checkpoints metadata for fast querying)
│   ├── thread_id (UUID, PK)
│   ├── title
│   ├── created_at
│   ├── updated_at (INDEXED)
│   ├── status
│   ├── work_item_id (FK → work_items, nullable)
│   └── tags (JSON)
│
├── teams
│   ├── id (UUID, PK)
│   ├── name
│   ├── description
│   ├── config (JSON — agent definitions, tools, permissions)
│   └── enabled
│
├── agents
│   ├── id (UUID, PK)
│   ├── team_id (FK → teams)
│   ├── name
│   ├── role (team_lead | specialist)
│   ├── description
│   └── config (JSON — model, tools, permissions)
│
└── artifacts
    ├── id (UUID, PK)
    ├── work_item_id (FK → work_items)
    ├── name
    ├── type (document | image | code | data)
    ├── content
    ├── version
    ├── provenance (JSON)
    └── created_at
```

### 4.2 Key Models

**ThreadMetadata** (`api/models/thread.py`):

```python
class ThreadMetadata(BaseModel):
    thread_id: str
    title: str
    created_at: datetime
    updated_at: datetime
    status: ThreadStatus = ThreadStatus.ACTIVE
    work_item_id: Optional[str] = None
    tags: list[str] = []
    last_message_preview: Optional[str] = None
```

**WorkItem** (`work_items/models.py`):

```python
class WorkItem(BaseModel):
    id: str
    type: WorkItemType
    title: str
    description: str
    status: WorkItemStatus = WorkItemStatus.OPEN
    owner_type: OwnerType
    owner_id: str
    assignee_type: Optional[OwnerType] = None
    assignee_id: Optional[str] = None
    thread_ids: list[str] = []
    created_at: datetime
    updated_at: datetime
```

**TeamConfig** (YAML config file, `config/teams/`):

```yaml
name: team-alpha
description: "Frontend development team"
agents:
  - name: lead
    role: team_lead
    description: "Coordinator for frontend tasks"
    tools: [delegate, code_review]
  - name: researcher
    role: specialist
    description: "UX research and design systems"
    tools: [web_search, design_lookup]
  - name: developer
    role: specialist
    description: "React/TypeScript implementation"
    tools: [write_file, edit_file, npm]
```

## 5. Team/Agent Configuration (YAML)

Teams are defined in `config/teams/*.yaml` files, loaded at startup:

```yaml
# config/teams/default.yaml
teams:
  - name: research
    description: "Research and analysis team"
    agents:
      - name: lead
        role: team_lead
        description: "Coordinates research tasks"
        tools: [delegate, summarize]
      - name: analyst
        role: specialist
        description: "Deep analysis and reporting"
        tools: [web_search, data_analysis]

  - name: engineering
    description: "Software development team"
    agents:
      - name: lead
        role: team_lead
        description: "Coordinates engineering tasks"
        tools: [delegate, code_review]
      - name: architect
        role: specialist
        description: "System architecture design"
        tools: [design, document]
      - name: developer
        role: specialist
        description: "Implementation"
        tools: [write_file, edit_file, test]
```

## 6. Deprecated Modules (From Siemens Patent Ideator)

The following modules are being phased out:

| Module                                | Replacement                         | Target Phase |
| ------------------------------------- | ----------------------------------- | ------------ |
| `state/machine.py` (transitions FSM)  | DeepAgents graph orchestration      | Phase 4      |
| `state/definitions.py`                | Agent/team routing config           | Phase 4      |
| `state/gates.py`                      | Work item validation rules          | Phase 4      |
| `scoring/engine.py`                   | Domain-specific scoring (if needed) | Phase 4      |
| `scoring/criteria.py`                 | Domain-specific criteria            | Phase 4      |
| `storage/*` (YAML)                    | SQLite + work item repository       | Phase 4      |
| `models/idea.py`                      | `work_items/models.py`              | Phase 4      |
| `models/siemens.py`                   | Remove                              | Phase 4      |
| `orchestrator/workflow.py`            | Thread-based agent orchestration    | Phase 4      |
| `research/adapters.py`                | Plugin-based research tools         | Phase 4      |
| `scheduler.py`                        | Optional (revisit if needed)        | Phase 4      |
| `infrastructure/events/stream_bus.py` | LangGraph astream_events            | Phase 4      |

## 7. Deployment

### 7.1 Services

| Service  | Port | Purpose                        |
| -------- | ---- | ------------------------------ |
| backend  | 8000 | FastAPI with LangGraph runtime |
| frontend | 3000 | React + Vite (Nginx)           |

### 7.2 Environment Variables

| Variable            | Default                     | Purpose                   |
| ------------------- | --------------------------- | ------------------------- |
| `OPENAI_API_KEY`    | —                           | OpenAI-compatible API key |
| `OPENAI_API_BASE`   | `https://api.openai.com/v1` | LLM API base URL          |
| `OPENAI_MODEL_NAME` | `gpt-4o`                    | LLM model name            |
| `DEEPAGENTS_MODEL`  | `openai:{model}`            | DeepAgents model spec     |

## 8. Related Documents

- [Product Context](https://azharameen.github.io/group-run/product-context/index.md) — Business context and vision
- [PRD](https://azharameen.github.io/group-run/prd/index.md) — Product requirements and user stories
- [Features](https://azharameen.github.io/group-run/features/index.md) — Complete feature tree
- [Tasks](https://azharameen.github.io/group-run/tasks/index.md) — Implementation task hierarchy
- [UI Design](https://azharameen.github.io/group-run/ui-design/index.md) — Frontend component design
- [Coding Guidelines](https://azharameen.github.io/group-run/coding-guidelines/index.md) — Development standards
- [Architecture Decisions](https://azharameen.github.io/group-run/architecture-decisions/index.md) — ADR log
