Verdict: the spine is directionally strong, but it still lets multiple teams satisfy the letter of the rules while producing incompatible ownership, storage, and mutation models.

## CRITICAL

1. **Shared-data ownership is undefined across filesystem vs SQLite.**
   - Interpretation A: ideas, research artifacts, and agent outputs live canonically in the workspace filesystem, while SQLite only holds runtime state.
   - Interpretation B: thread state, team config, MCP server config, checkpoints, and preferences live canonically in SQLite, so another team can model the same concept as DB rows.
   - Result: two units can both "own" the same entity class and diverge on source of truth.
   - **Tighten AD:** define a canonical owner for every entity type (`idea`, `thread`, `team`, `agent`, `mcp_server`, `checkpoint`, `approval`) and forbid any other layer from persisting that entity’s primary fields.

2. **Filesystem mutation has two incompatible approval paths.**
   - Interpretation A: all writes/deletes go through `CompositeBackend` and hit HITL interrupts.
   - Interpretation B: MCP tools bypass `CompositeBackend` permissions, so a team can mutate workspace files through MCP without the same approval gate.
   - Result: one team’s writes are gated, another team’s writes are not.
   - **Tighten AD:** require every workspace mutation path, including MCP-backed tools, to flow through the same approval/interruption middleware; forbid any direct file-write capability outside that path.

## HIGH

3. **Config loading order is underspecified for YAML + DB-backed config.**
   - Interpretation A: `config/teams.yaml` and `config/mcp.json` are loaded at startup and are authoritative until restart.
   - Interpretation B: teams can be reloaded live, HTTP MCP servers can be added in the UI and stored in the DB, and runtime merges decide precedence ad hoc.
   - Result: two teams could load different effective configs from the same inputs.
   - **Tighten AD:** specify one ordered precedence rule (for example: platform file > DB overlay > runtime cache) and require a versioned config schema plus deterministic reload behavior.

4. **State mutation paths are split between LangGraph state and direct DB writes.**
   - Interpretation A: “No direct database writes for agent state” means all mutable agent state must be expressed in LangGraph state transitions.
   - Interpretation B: AD-3, AD-6, AD-7, and AD-8 all explicitly place threads, runtime state, preferences, and config in SQLite/DB-backed storage.
   - Result: one unit can update state through graph transitions while another writes the same state through repositories, causing split-brain behavior.
   - **Tighten AD:** define exactly which tables may be written directly, which must only be written via LangGraph reducers, and the required transactional boundary for each mutation.

5. **Background-work ownership is missing.**
   - Interpretation A: everything beyond request/response lives inside the backend process.
   - Interpretation B: a separate scheduler, worker, or poller can be added because the spine only bans extra *services* in the deployment diagram, not extra processes.
   - Result: two teams can build overlapping background execution paths for the same workflow.
   - **Tighten AD:** state whether all background work must remain in-process in the FastAPI backend, or explicitly define a worker boundary and ownership model.

## MEDIUM

6. **AD-11 is not mechanically enforceable as written.**
   - Interpretation A: `LANGGRAPH_STRICT_MSGPACK=true` is mandatory everywhere.
   - Interpretation B: `allowed_msgpack_modules` is an alternative, so different environments can drift in safety posture.
   - Result: the rule reads strong but can be satisfied inconsistently.
   - **Tighten AD:** require one startup validation path that fails fast unless exactly one approved serialization policy is active; do not allow two equivalent formulations.

7. **Deprecated-module ban is policy-only, not checked.**
   - Interpretation A: new code should not import the dead modules.
   - Interpretation B: because no mechanical gate is specified, teams can keep referencing them until runtime or review catches it.
   - Result: dead code stays reachable and the “sole orchestration” rule erodes.
   - **Tighten AD:** add a forbidden-import CI check or static rule that fails builds on any reference to the listed dead modules.

## LOW

8. **Entity and config naming/versioning conventions are incomplete.**
   - Interpretation A: YAML/JSON shapes are implicit and evolve by convention.
   - Interpretation B: each team invents its own field names for team config, MCP config, event payloads, and error details.
   - Result: schema drift and incompatible payloads across layers.
   - **Tighten AD:** version every structured config/schema, require stable field names, and define one validation source for each config file.
