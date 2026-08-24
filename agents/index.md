# Agent Instructions for Development

> **Last updated: 2026-07-29**
>
> These instructions govern how AI agents (including GitHub Copilot) interact with this project's documentation and codebase.

______________________________________________________________________

## 1. Documentation Reading Order

When starting a new task or planning implementation, agents MUST read the following documents **in order**:

| Order | Document                                                                                              | Purpose                                                              |
| ----- | ----------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| 1     | [`tasks.md`](https://azharameen.github.io/group-run/tasks/index.md)                                   | Understand current task hierarchy, what's implemented vs pending     |
| 2     | [`features.md`](https://azharameen.github.io/group-run/features/index.md)                             | Understand feature linkages, dependencies, and implementation status |
| 3     | [`architecture.md`](https://azharameen.github.io/group-run/architecture/index.md)                     | Understand system boundaries, contracts, and data flow               |
| 4     | [`architecture-decisions.md`](https://azharameen.github.io/group-run/architecture-decisions/index.md) | Understand key architectural decisions and their rationale           |
| 5     | [`coding-guidelines.md`](https://azharameen.github.io/group-run/coding-guidelines/index.md)           | Follow established conventions and patterns                          |
| 6     | [`code-review-guidelines.md`](https://azharameen.github.io/group-run/code-review-guidelines/index.md) | Self-review checklist before marking tasks as completed              |
| 7     | [`prd.md`](https://azharameen.github.io/group-run/prd/index.md)                                       | Understand product requirements and acceptance criteria              |
| 8     | [`product-context.md`](https://azharameen.github.io/group-run/product-context/index.md)               | Understand business context and user personas                        |

______________________________________________________________________

## 2. Task Management Rules

### 2.1 Task Status Markers

| Marker          | Meaning                     | When to Use                                     |
| --------------- | --------------------------- | ----------------------------------------------- |
| `[PENDING]`     | Not yet started             | Default for new tasks                           |
| `[IN PROGRESS]` | Actively being worked on    | When you start implementing                     |
| `[IMPLEMENTED]` | Code exists and is verified | After writing code AND verifying it works       |
| `[COMPLETED]`   | Reviewed and confirmed done | After review confirms implementation is correct |
| `[DEFERRED]`    | Explicitly postponed        | When a task is intentionally delayed            |

### 2.2 Task Hierarchy Levels

Tasks use a 3-5 level hierarchy:

```text
Level 1: Phase (e.g., Phase 2: Real DeepAgents Runtime)
Level 2: Milestone (e.g., M2: Runtime Implementation)
Level 3: Task (e.g., M2.1 Build create_deep_agent runtime factory)
Level 4: Sub-task (e.g., M2.1.1 Wire model, system prompt, backend, permissions)
Level 5: Checklist item (e.g., specific code change or verification step)
```

### 2.3 Task Update Workflow

1. **Before starting**: Read `tasks.md` to find the next `[PENDING]` or `[IN PROGRESS]` task
1. **When starting work**: Change status to `[IN PROGRESS]`
1. **When code is written and verified**: Change status to `[IMPLEMENTED]`
1. **After review confirms correctness**: Change status to `[COMPLETED]`
1. **Never fabricate completion**: Only mark as `[IMPLEMENTED]` if you have genuinely verified the code exists and works

______________________________________________________________________

## 3. Feature Documentation Rules

### 3.1 Feature Status Markers

| Marker | Meaning                  |
| ------ | ------------------------ |
| ✅     | Implemented and verified |
| 🔄     | In progress              |
| 📋     | Planned                  |
| ❌     | Not started / deferred   |

### 3.2 Feature Update Workflow

1. When a feature is implemented, update `features.md` with ✅
1. When a feature is partially implemented, use 🔄
1. When a feature is planned but not started, use 📋
1. Always update the feature linkage section if dependencies change

______________________________________________________________________

## 4. Code Change Rules

### 4.1 Before Making Changes

1. Read the relevant documentation (see Section 1)
1. Understand the existing patterns and conventions
1. Check `coding-guidelines.md` for style rules
1. Verify the change doesn't break existing tests

### 4.2 After Making Changes

1. Run `pytest backend/tests` to verify all tests pass
1. Update `tasks.md` with the appropriate status marker
1. Update `features.md` if a feature was added or modified
1. Update `architecture.md` if the architecture changed
1. Document any new environment variables or configuration

### 4.3 Prohibited Actions

- ❌ Never silently convert failed agentic output into fabricated success output
- ❌ Never mark a task as `[IMPLEMENTED]` without verifying the code
- ❌ Never delete or modify documentation without updating related cross-references
- ❌ Never add credentials directly to code — use `.env` files and `pydantic-settings`

______________________________________________________________________

## 5. Credential Management

> **⚠️ Critical**: LangChain's `init_chat_model()` (called internally by `create_deep_agent`) reads credentials from standard OS environment variables (`OPENAI_API_KEY`, `OPENAI_API_BASE`), NOT from `pydantic-settings`. The `config.py` module automatically propagates credentials to `os.environ` at import time.

When adding new credential fields:

1. Add the field to `Settings` class in `config.py`
1. Propagate it to `os.environ` in the credential propagation section of `config.py`
1. Document it in `architecture.md` (Environment Variables section)
1. Document it in `coding-guidelines.md` (Credential Management section)

______________________________________________________________________

## 6. Cross-Reference Rules

When updating any document, check and update cross-references in:

| Document               | Cross-references to                                               |
| ---------------------- | ----------------------------------------------------------------- |
| `README.md`            | All docs                                                          |
| `architecture.md`      | ui-design.md, prd.md, features.md, coding-guidelines.md, tasks.md |
| `ui-design.md`         | architecture.md, prd.md, features.md                              |
| `prd.md`               | product-context.md, architecture.md, features.md, tasks.md        |
| `product-context.md`   | prd.md, architecture.md, features.md, tasks.md                    |
| `features.md`          | architecture.md, prd.md, tasks.md                                 |
| `coding-guidelines.md` | architecture.md                                                   |
| `tasks.md`             | features.md, architecture.md, prd.md, architecture-decisions.md   |
| `agents.md`            | All docs                                                          |

______________________________________________________________________

## 7. Review Process

### 7.1 Self-Review Checklist

Before marking a task as `[COMPLETED]`:

- Does the code compile/build without errors?
- Do all existing tests pass?
- Are new features covered by tests?
- Is the documentation updated?
- Do all shell commands in touched docs include a working Windows alternative (`docs/coding-guidelines.md` §6.3)?
- Are cross-references maintained?
- Is there any fabricated or simulated output?
- Are error states handled explicitly?

### 7.2 Review Confirmation

When a review confirms implementation is correct:

1. Change `[IMPLEMENTED]` to `[COMPLETED]` in `tasks.md`
1. Ensure all sub-tasks and checklist items are also marked `[COMPLETED]`
1. Update `features.md` with ✅ if applicable

______________________________________________________________________

## 8. Related Documents

- [Tasks](https://azharameen.github.io/group-run/tasks/index.md) — Implementation task hierarchy
- [Features](https://azharameen.github.io/group-run/features/index.md) — Complete feature tree
- [Architecture](https://azharameen.github.io/group-run/architecture/index.md) — System architecture
- [Coding Guidelines](https://azharameen.github.io/group-run/coding-guidelines/index.md) — Development standards
