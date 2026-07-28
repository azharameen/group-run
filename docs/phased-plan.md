# Phased Plan

## Phase 0: Documentation And Safe Scaffolding

- [x] Audit backend structure and current runtime behavior
- [x] Audit frontend stack and current API/streaming model
- [x] Document current findings in `docs/`
- [x] Define target folder structure and architecture
- [x] Add non-breaking DeepAgents scaffold modules
- [x] Split giant backend files without changing runtime behavior

### Phase 0 milestone

- Deliverable: migration docs plus isolated agent runtime scaffold with no production behavior change

Phase 0 status: completed on 2026-07-27.

## Phase 1: Backend Structural Cleanup

- [x] Split `backend/app/main.py` into route modules
- [x] Extract SSE event bus into infrastructure/events
- [x] Extract workflow status aggregation out of route handlers
- [x] Split `storage/yaml_io.py` into repositories or repository-like adapters
- [x] Split `state/machine.py` into transition config and validation policy
- [x] Split `llm/subagent_executor.py` into smaller domain-specific execution modules

### Phase 1 checklist

- [x] health route moved
- [x] idea routes moved
- [x] workflow routes moved
- [x] config routes moved
- [x] comments route moved
- [x] streaming route moved
- [x] tests still pass after split

### Phase 1 milestone

- Deliverable: same behavior, smaller files, clear layering boundaries

Phase 1 status: completed on 2026-07-27.

## Phase 2: Real DeepAgents Runtime Introduction

- [ ] Add DeepAgents dependency alignment
- [ ] Build `create_deep_agent` runtime factory
- [ ] Add `CompositeBackend` setup
- [ ] Add permissions model
- [ ] Add initial context schema
- [ ] Add initial subagent definitions from existing workflow roles
- [ ] Keep runtime isolated behind a feature flag or dedicated entrypoint

### Phase 2 checklist

- [ ] backend module imports cleanly
- [ ] runtime factory builds successfully
- [ ] current API still works unchanged
- [ ] no default switch to DeepAgents yet

### Phase 2 milestone

- Deliverable: real DeepAgents runtime exists in repo and can be wired without breaking current app

## Phase 3: Skills And Memory

- [ ] Create project `skills/` directory
- [ ] Move long system instructions out of Python and into skills
- [ ] Add memory directory and file conventions
- [ ] Separate org-scoped and user-scoped memory
- [ ] Add read-only policy and instruction areas

### Phase 3 checklist

- [ ] discovery skill created
- [ ] drafting skill created
- [ ] review skill created
- [ ] Siemens strategy skill created
- [ ] memory files documented

### Phase 3 milestone

- Deliverable: prompt-heavy behavior moved into maintainable skills and memory files

## Phase 4: HITL And Approval Flow

- [ ] Add checkpointer
- [ ] Add interrupt configuration for sensitive actions
- [ ] Add approval/reject/edit workflow endpoints
- [ ] Replace simulated review states with real approval state records
- [ ] Add protected final artifact path rules

### Phase 4 checklist

- [ ] manager review interrupt works
- [ ] IP review interrupt works
- [ ] counsel validation interrupt works
- [ ] delete/archive interrupt works
- [ ] reviewer decisions are persisted

### Phase 4 milestone

- Deliverable: real human approval flow replaces simulated review in critical stages

## Phase 5: Streaming And Frontend Integration

- [ ] Add DeepAgents event streaming adapter on backend
- [ ] Preserve compatibility with current SSE consumers during migration
- [ ] Add frontend subagent activity panel
- [ ] Add frontend todo/progress panel
- [ ] Add frontend tool-call event view
- [ ] Add frontend interrupt approval UI

### Phase 5 checklist

- [ ] root coordinator stream visible in UI
- [ ] subagent status visible in UI
- [ ] tool-call state visible in UI
- [ ] interrupts visible in UI
- [ ] current dashboard pages still function

### Phase 5 milestone

- Deliverable: frontend can observe and act on real DeepAgents state without losing current dashboard behavior

## Phase 6: Workflow Quality And Artifacts

- [ ] Add artifact versioning model
- [ ] Add artifact diff support
- [ ] Add evidence traceability per generated section
- [ ] Add duplicate idea detection
- [ ] Add review packet generation improvements

### Phase 6 milestone

- Deliverable: stronger traceability and higher quality outputs

## Phase 7: Advanced Capabilities

- [ ] Add multimodal ingestion for PDFs and images
- [ ] Add real prior-art integrations
- [ ] Add LangSmith observability
- [ ] Add RBAC and reviewer identity model
- [ ] Plan DB migration away from YAML when needed

### Phase 7 milestone

- Deliverable: production-grade research, governance, and observability stack
