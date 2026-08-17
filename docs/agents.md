# Agent Instructions for Development

> **Last updated: 2026-07-29**
>
> These instructions govern how AI agents (including GitHub Copilot) interact with this project's documentation and codebase.

---

## 1. Documentation Reading Order

When starting a new task or planning implementation, agents MUST read the following documents **in order**:

| Order | Document | Purpose |
| ------- | ---------- | --------- |
| 1 | [`tasks.md`](./tasks.md) | Understand current task hierarchy, what's implemented vs pending |
| 2 | [`features.md`](./features.md) | Understand feature linkages, dependencies, and implementation status |
| 3 | [`architecture.md`](./architecture.md) | Understand system boundaries, contracts, and data flow |
| 4 | [`architecture-decisions.md`](./architecture-decisions.md) | Understand key architectural decisions and their rationale |
| 5 | [`coding-guidelines.md`](./coding-guidelines.md) | Follow established conventions and patterns |
| 6 | [`code-review-guidelines.md`](./code-review-guidelines.md) | Self-review checklist before marking tasks as completed |
| 7 | [`prd.md`](./prd.md) | Understand product requirements and acceptance criteria |
| 8 | [`product-context.md`](./product-context.md) | Understand business context and user personas |

---

## 2. Task Management Rules

### 2.1 Task Status Markers

| Marker | Meaning | When to Use |
| -------- | --------- | ------------- |
| `[PENDING]` | Not yet started | Default for new tasks |
| `[IN PROGRESS]` | Actively being worked on | When you start implementing |
| `[IMPLEMENTED]` | Code exists and is verified | After writing code AND verifying it works |
| `[COMPLETED]` | Reviewed and confirmed done | After review confirms implementation is correct |
| `[DEFERRED]` | Explicitly postponed | When a task is intentionally delayed |

### 2.2 Task Hierarchy Levels

Tasks use a 3-5 level hierarchy:

```
Level 1: Phase (e.g., Phase 2: Real DeepAgents Runtime)
Level 2: Milestone (e.g., M2: Runtime Implementation)
Level 3: Task (e.g., M2.1 Build create_deep_agent runtime factory)
Level 4: Sub-task (e.g., M2.1.1 Wire model, system prompt, backend, permissions)
Level 5: Checklist item (e.g., specific code change or verification step)
```

### 2.3 Task Update Workflow

1. **Before starting**: Read `tasks.md` to find the next `[PENDING]` or `[IN PROGRESS]` task
2. **When starting work**: Change status to `[IN PROGRESS]`
3. **When code is written and verified**: Change status to `[IMPLEMENTED]`
4. **After review confirms correctness**: Change status to `[COMPLETED]`
5. **Never fabricate completion**: Only mark as `[IMPLEMENTED]` if you have genuinely verified the code exists and works

---

## 3. Feature Documentation Rules

### 3.1 Feature Status Markers

| Marker | Meaning |
| -------- | --------- |
| ✅ | Implemented and verified |
| 🔄 | In progress |
| 📋 | Planned |
| ❌ | Not started / deferred |

### 3.2 Feature Update Workflow

1. When a feature is implemented, update `features.md` with ✅
2. When a feature is partially implemented, use 🔄
3. When a feature is planned but not started, use 📋
4. Always update the feature linkage section if dependencies change

---

## 4. Code Change Rules

### 4.1 Before Making Changes

1. Read the relevant documentation (see Section 1)
2. Understand the existing patterns and conventions
3. Check `coding-guidelines.md` for style rules
4. Verify the change doesn't break existing tests

### 4.2 After Making Changes

1. Run `pytest backend/tests` to verify all tests pass
2. Update `tasks.md` with the appropriate status marker
3. Update `features.md` if a feature was added or modified
4. Update `architecture.md` if the architecture changed
5. Document any new environment variables or configuration

### 4.3 Prohibited Actions

- ❌ Never silently convert failed agentic output into fabricated success output
- ❌ Never mark a task as `[IMPLEMENTED]` without verifying the code
- ❌ Never delete or modify documentation without updating related cross-references
- ❌ Never add credentials directly to code — use `.env` files and `pydantic-settings`

---

## 5. Credential Management

> **⚠️ Critical**: LangChain's `init_chat_model()` (called internally by `create_deep_agent`) reads credentials from standard OS environment variables (`OPENAI_API_KEY`, `OPENAI_API_BASE`), NOT from `pydantic-settings`. The `config.py` module automatically propagates credentials to `os.environ` at import time.

When adding new credential fields:

1. Add the field to `Settings` class in `config.py`
2. Propagate it to `os.environ` in the credential propagation section of `config.py`
3. Document it in `architecture.md` (Environment Variables section)
4. Document it in `coding-guidelines.md` (Credential Management section)

---

## 6. Cross-Reference Rules

When updating any document, check and update cross-references in:

| Document | Cross-references to |
| ---------- | --------------------- |
| `README.md` | All docs |
| `architecture.md` | ui-design.md, prd.md, features.md, coding-guidelines.md, tasks.md |
| `ui-design.md` | architecture.md, prd.md, features.md |
| `prd.md` | product-context.md, architecture.md, features.md, tasks.md |
| `product-context.md` | prd.md, architecture.md, features.md, tasks.md |
| `features.md` | architecture.md, prd.md, tasks.md |
| `coding-guidelines.md` | architecture.md |
| `tasks.md` | features.md, architecture.md, prd.md, architecture-decisions.md |
| `agents.md` | All docs |

---

## 7. Review Process

### 7.1 Self-Review Checklist

Before marking a task as `[COMPLETED]`:

- [ ] Does the code compile/build without errors?
- [ ] Do all existing tests pass?
- [ ] Are new features covered by tests?
- [ ] Is the documentation updated?
- [ ] Do all shell commands in touched docs include a working Windows alternative (`docs/coding-guidelines.md` §6.3)?
- [ ] Are cross-references maintained?
- [ ] Is there any fabricated or simulated output?
- [ ] Are error states handled explicitly?

### 7.2 Review Confirmation

When a review confirms implementation is correct:

1. Change `[IMPLEMENTED]` to `[COMPLETED]` in `tasks.md`
2. Ensure all sub-tasks and checklist items are also marked `[COMPLETED]`
3. Update `features.md` with ✅ if applicable

---

## 8. Related Documents

- [Tasks](./tasks.md) — Implementation task hierarchy
- [Features](./features.md) — Complete feature tree
- [Architecture](./architecture.md) — System architecture
- [Coding Guidelines](./coding-guidelines.md) — Development standards
