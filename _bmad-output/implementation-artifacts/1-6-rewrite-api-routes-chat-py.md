---
baseline_commit: 13e4b9566b4b94426038c37f143603d51db05d26
---

# Story 1.6: Rewrite API Routes chat.py

Status: review

## Story

As a backend developer,
I want `api/routes/chat.py` to invoke the LangGraph supervisor graph with `astream(version="v2")`,
so that user messages are routed through the agentic orchestration pipeline and streamed responses return via SSE.

## Acceptance Criteria

1. **Remove dead imports** — `from ...storage.yaml_io import load_idea_yaml` and any reference to `orchestrator.workflow.get_active_idea` are removed. `grep -r "yaml_io\|orchestrator.workflow" backend/app/api/routes/chat.py` returns zero matches.

2. **Supervisor graph invocation** — `/api/chat/stream` endpoint calls `get_supervisor_graph().astream()` with `stream_mode="values"` and `version="v2"` per AD-5.

3. **HumanMessage wrapping** — User text from the request body is wrapped in `HumanMessage(content=text)` before passing to the supervisor graph.

4. **Thread ID passthrough** — The endpoint generates a `thread_id` (UUID) for each request and passes it via `config={"configurable": {"thread_id": thread_id}}` for LangGraph checkpoint isolation (AD-3).

5. **SSE event format** — Streamed events follow the supervisor state shape: `{"type": "state_update", "response": str, "error": dict|None, "routing_key": str}`. Final event: `{"type": "done"}`.

6. **Structured error propagation** — When supervisor returns an `error` dict in state, the SSE stream emits `{"type": "error", "error": {"code": str, "message": str, "retryable": bool}}` without fabricating success.

7. **/agent-tasks endpoint removed** — The Siemens-specific `GET /api/agent-tasks` endpoint (hardcoded to IDEA-0006, depends on dead modules) is deleted entirely.

8. **File size under 150 lines** — `chat.py` stays within the project-context.md hard limit for route files.

9. **Import order compliance** — stdlib → third-party → application imports, separated by blank lines.

10. **Stream always closes with done** — Even on unexpected exceptions, the generator emits a `{"type": "done"}` event as the final SSE line.

## Tasks / Subtasks

### Task 1: Remove dead imports and endpoints (AC: 1, 7)
- [x] Delete `from ...storage.yaml_io import load_idea_yaml`
- [x] Delete `GET /api/agent-tasks` endpoint entirely (lines 22-57)
- [x] Delete the `StreamChatMessage` model's `sender` field (unused in new flow)

### Task 2: Add supervisor imports and models (AC: 2, 3, 9)
- [x] Import `get_supervisor_graph` from `...orchestrator.supervisor`
- [x] Import `HumanMessage` from `langchain_core.messages`
- [x] Import `uuid` for thread ID generation
- [x] Define `StreamChatRequest` model: `text: str`

### Task 3: Rewrite _chat_stream_generator (AC: 2-6, 10)
- [x] Accept `text: str` parameter
- [x] Generate `HumanMessage(content=text)` and pass as `{"messages": [...]}`
- [x] Call `supervisor.astream(input, config, stream_mode="values", version="v2")`
- [x] Convert each `SupervisorState` snapshot to SSE event dict
- [x] Emit `type: "state_update"` events with response, error, routing_key
- [x] Detect final state (response or error populated) and emit `type: "done"`
- [x] Wrap in try/except/finally to guarantee `done` event

### Task 4: Update stream_chat endpoint (AC: 4)
- [x] Generate `thread_id = str(uuid.uuid4())` per request
- [x] Pass thread_id to `_chat_stream_generator`
- [x] Return `StreamingResponse` with SSE headers

## Dev Notes

### What Changes vs. Current chat.py

| Aspect | Current | New |
|--------|---------|-----|
| Imports | json, logging, typing, fastapi, pydantic, yaml_io | json, logging, typing, uuid, fastapi, pydantic, langchain_core, supervisor |
| Endpoints | GET /agent-tasks, POST /chat/stream | POST /chat/stream only |
| Stream source | `execute_deep_agent_workflow_streaming("", text)` (undefined import) | `supervisor.astream(input, config, stream_mode="values", version="v2")` |
| Event format | Passthrough from runner | SupervisorState shaped: type, response, error, routing_key |
| Thread binding | None | UUID per request, passed in configurable |
| Lines | 111 | Target: < 100 |

### Supervisor Graph Invocation Pattern

```python
from uuid import uuid4
from langchain_core.messages import HumanMessage
from ...orchestrator.supervisor import get_supervisor_graph

async def _chat_stream_generator(text: str) -> AsyncGenerator[str, None]:
    thread_id = str(uuid4())
    emitted_done = False
    try:
        supervisor = get_supervisor_graph()
        async for state in supervisor.astream(
            input={"messages": [HumanMessage(content=text)]},
            config={"configurable": {"thread_id": thread_id}},
            stream_mode="values",
            version="v2",
        ):
            event = {
                "type": "state_update",
                "response": state.get("response", ""),
                "error": state.get("error"),
                "routing_key": state.get("routing_key", "general"),
            }
            yield f"data: {json.dumps(event)}\n\n"
            # Terminal state: response or error is set
            if state.get("response") or state.get("error"):
                emitted_done = True
                break
    except Exception as exc:
        logger.error("Chat stream failed: %s", exc)
        error_event = {
            "type": "error",
            "error": {"code": "streaming_failure", "message": "An error occurred", "retryable": True},
        }
        yield f"data: {json.dumps(error_event)}\n\n"
    finally:
        if not emitted_done:
            yield f"data: {json.dumps({'type': 'done'})}\n\n"
```

### SupervisorState Shape (from supervisor.py)

```python
class SupervisorState(TypedDict, total=False):
    messages: Annotated[list[Any], add_messages]
    response: str       # Final text on success
    error: str          # Structured error dict on failure (code, message, retryable)
    routing_key: str    # "general" for EP-1
```

**Key insight:** The supervisor node `supervisor_general` returns EITHER `{"response": str, "routing_key": str}` on success OR `{"error": {"code": ..., "message": ..., "retryable": bool}, "routing_key": str}` on failure. The astream v2 stream will emit state snapshots, so the final snapshot will have `response` or `error` populated.

### Error Handling Requirements (from project-context.md)

**CRITICAL RULE:** NEVER fabricate output. When the supervisor returns an error dict, pass it through to the SSE stream. Do not convert errors to fake success responses.

Error codes defined in `supervisor.py`:
- `agent_timeout` — Timeout exceeded (120s default)
- `agent_rate_limited` — Rate limit (429) hit
- `agent_auth_failed` — Auth failure (401/403)
- `agent_failure` — Other exceptions

### Critical Don't Miss Rules

1. **File size < 150 lines** — Hard limit for route files per project-context.md.
2. **Import order:** stdlib → third-party → application (enforced in review).
3. **One checkpointer connection** — `get_supervisor_graph()` uses the SqliteSaver singleton. Never create a new connection.
4. **astream v2 only** — AD-5 mandates `version="v2"`. v3 is experimental for LangGraph 0.6.x.
5. **Never leak internal errors** — Use structured error codes, not raw exception messages.
6. **Stream lifecycle:** Always emit `type: "done"` as final event, even on error.

### File Structure

**Modified files:**
- `backend/app/api/routes/chat.py` — Complete rewrite (111 lines → target < 100 lines)

**Files imported by chat.py (no changes needed):**
- `backend/app/orchestrator/supervisor.py` — `get_supervisor_graph()`
- `backend/app/services/thread_manager.py` — `get_checkpointer()` (via supervisor)

### Dependencies

- **ST-1.4 DONE:** `orchestrator/supervisor.py` exists with `get_supervisor_graph()`, `SupervisorState`, and `supervisor_general()` node.
- **ST-1.5 DONE:** `agent/runtime.py` and `agent/subagents.py` wired with team-aware runtime factory.
- **ST-1.3 DONE:** `api/app.py` mounts chat router at `/api`.
- **ST-1.1 DONE:** `config/teams.yaml` and `config/mcp.json` exist.
- **ST-1.2 DONE:** `config.py` has `TEAMS_CONFIG_PATH`, `MCP_CONFIG_PATH`, `agent_timeout_sec`.

### Testing Notes (deferred to ST-1.8)

- Mock `get_supervisor_graph()` to return a fake graph that yields known states
- Verify SSE event shapes match supervisor state
- Verify error propagation without fabrication
- Verify stream always closes with done event

### Previous Story Intelligence

**From ST-1.5 Review:**
- MCP `_load_mcp_tools()` uses `asyncio.run()` which fails inside running event loop — deferred. Chat.py doesn't call MCP directly, but the supervisor does via the runtime.
- Import order compliance is strictly enforced (stdlib → third-party → application).
- Empty `servers: []` in mcp.json is authoritative — no env var fallback.

**From ST-1.4 Review:**
- `HumanMessage` from langchain_core.messages is the correct type (not string "user").
- `SupervisorState` is `TypedDict` — access via `.get()` not attribute access.
- Agent result can be None or non-dict — guard against all shapes (handled in supervisor_general).
- `result["output"]` is the primary key from DeepAgents runtime, fallback to `result["messages"]`.

### References

- [Source: _bmad-output/project-context.md#Critical Rules] — 41 rules including file-size limits, import order, no fabrication
- [Source: _bmad-output/planning-artifacts/epics.md#EP-1] — Epic objective and story table
- [Source: backend/app/orchestrator/supervisor.py] — SupervisorState, get_supervisor_graph(), supervisor_general()
- [Source: backend/app/agent/runtime.py] — get_deep_agent_runtime(), team config loading
- [Source: backend/app/api/routes/chat.py] — Current implementation being rewritten
- [Source: _bmad-output/planning-artifacts/architecture/ARCHITECTURE-SPINE.md] — AD-1, AD-3, AD-5

## Dev Agent Record

### Agent Model Used

qwen-3.6-27b

### Debug Log References

- Fixed `_load_and_validate_teams` NameError in `runtime.py` — function was called at module level (line 31) before being defined (line 34). Moved definition before the call.

### Completion Notes List

- **Complete rewrite of chat.py:** Replaced 111-line file with dead imports (`yaml_io`, `execute_deep_agent_workflow_streaming`) and Siemens-specific `/api/agent-tasks` endpoint with a clean 93-line supervisor-backed streaming endpoint.
- **Supervisor graph integration:** `/api/chat/stream` now calls `get_supervisor_graph().astream()` with `stream_mode="values"` and `version="v2"` per AD-5.
- **SSE event format:** Emits `state_update` events with `response`, `error`, and `routing_key` fields. Final `done` event guaranteed via try/except/finally.
- **Structured error propagation:** Supervisor error dict (`code`, `message`, `retryable`) flows through to SSE without fabrication.
- **Thread isolation:** Each request gets a unique `thread_id` (UUID) passed via `config={"configurable": {"thread_id": thread_id}}` for LangGraph checkpoint isolation (AD-3).
- **Import order compliance:** stdlib → third-party → application imports properly separated.
- **File size:** 93 lines total (well under 150-line limit).
- **Bonus fix:** Resolved `_load_and_validate_teams` NameError in `runtime.py` that was blocking all test collection.

### File List

- `backend/app/api/routes/chat.py` — Complete rewrite (111 → 93 lines)
- `backend/app/agent/runtime.py` — Fixed function definition order (_load_and_validate_teams)

### Change Log

- Rewrote chat.py to use LangGraph supervisor graph with astream v2 and SSE streaming (2025-01-24)
- Fixed runtime.py module-level NameError: moved _load_and_validate_teams definition before call
