# Code Review Guidelines

> **Last updated: 2026-07-31**

## 1. Principles

| Principle | What It Means |
|-----------|---------------|
| **Correct before clever** | Prefer simple, obviously correct code over elegant-but-hard-to-verify solutions. |
| **Provenance is mandatory** | Every artifact, score, and decision must carry traceable metadata (source, trust level, timestamp). |
| **No silent fallback** | Never fabricate success when a step fails. Show the failure state (retry, pause, error). |
| **Fewest files changed** | A fix that touches one file is better than one that touches three. |
| **Test every claim** | Every new feature, route, and state transition must have a test. |

## 2. Review Checklist

### 2.1 Correctness

- [ ] Does the code do what the spec/issue says?
- [ ] Are edge cases handled (empty states, missing data, concurrent access)?
- [ ] Do all existing tests still pass?
- [ ] Are error states explicit instead of hidden?

### 2.2 Architecture Fit

- [ ] Does the change follow the documented architecture (architecture.md, ADRs)?
- [ ] Does it respect layer boundaries (API → domain → storage, not API → storage directly)?
- [ ] If it adds a new route, is it < 150 lines and in the correct route file?
- [ ] If it adds a new dependency, is it justified? Could stdlib or an existing package do it?

### 2.3 Over-Engineering Check

- [ ] Is there any interface with only one implementation? If yes, delete the interface.
- [ ] Is there any factory that only produces one thing? If yes, delete the factory.
- [ ] Is there config for a value that never changes? If yes, hardcode it.
- [ ] Is there any "for later" scaffolding that nothing uses yet? If yes, delete it.
- [ ] Could 50 lines be 5 lines using stdlib? If yes, rewrite.

### 2.4 Credential Security

- [ ] Are credentials loaded from `.env` via pydantic-settings, not hardcoded?
- [ ] Are new credentials propagated to `os.environ` in `config.py` for LangChain compatibility?
- [ ] Are secrets excluded from version control (`.env` in `.gitignore`)?

### 2.5 Provenance & Trust

- [ ] Does every generated artifact carry provenance metadata (`artifact:idea_id:section`)?
- [ ] Is the trust level set correctly (`trusted`, `verified-tool-call`, `generated`, `fallback`)?
- [ ] Are evidence references attached to generated sections?

### 2.6 HITL & Interrupts

- [ ] Are destructive actions (delete, archive, final submission) guarded by interrupts?
- [ ] Do interrupts persist after server restart?
- [ ] Is the approval/rejection decision recorded in the transcript?

### 2.7 Frontend Consistency

- [ ] Does the change use existing shadcn/ui components instead of custom CSS?
- [ ] Are event types rendered with the correct badge/role styling?
- [ ] Does the chat sidebar distinguish user, orchestrator, subagent, reviewer, tool events?
- [ ] Does the UI show explicit retry/paused/failed states?

### 2.8 Backend Patterns

- [ ] Does the route use the `router = APIRouter(prefix="/api")` pattern?
- [ ] Are Pydantic models used for request/response schemas?
- [ ] Are Pydantic models used for all data models (not raw dicts)?
- [ ] Are file sizes within targets (routes < 150, services < 200, agent < 200)?

## 3. Python-Specific Review Items

```python
# Good
from datetime import UTC, datetime

now = datetime.now(UTC)

# Bad (deprecated in Python 3.12+)
now = datetime.utcnow()
```

```python
# Good - explicit error states
try:
    result = await step()
except AgenticFailure as e:
    return {"status": "failed", "reason": str(e), "retry_allowed": True}

# Bad - silent fallback
try:
    result = await step()
except Exception:
    result = "Fabricated success"  # REJECT
```

```python
# Good - provenance on every artifact
provenance = f"artifact:{idea_id}:{section_name}"
trust = "generated"
evidence_refs = [...]
```

## 4. TypeScript-Specific Review Items

```typescript
// Good - typed props
interface Props {
  ideaId: string
  onUpdate?: () => void
}

// Bad - any-typed props
interface Props {
  ideaId: any  // REJECT
}
```

```typescript
// Good - use existing hooks
const { events, isConnected } = useDeepAgentStream(ideaId, { onEvent, onError })

// Bad - raw EventSource
const source = new EventSource(`/api/sse?idea_id=${ideaId}`)  // REJECT
```

## 5. What to Reject Immediately

| Pattern | Why |
|---------|-----|
| `except Exception: result = "fallback"` without logging | Masks real errors |
| Hardcoded API keys or secrets | Security risk |
| `datetime.utcnow()` in new code | Deprecated in Python 3.12 |
| Direct `os.environ` manipulation outside `config.py` | Breaks credential management |
| New route in `main.py` instead of existing route file | Violates file size targets |
| `any` type in TypeScript | Loses type safety |
| Dynamic imports (`import()` inside functions) | Prevents static analysis |
| Interface with single implementation | Unnecessary abstraction |
| Factory producing only one class | Unnecessary abstraction |
| Silent `try/except` that drops the exception context | Hides root cause |

## 6. Review Process

### 6.1 Self-Review (Before Submitting)

1. Read the diff yourself before requesting review
2. Check for leftover debug code, console.log, print statements
3. Run `pytest backend/tests` (all must pass)
4. Run `npm run build` in `frontend/` (zero errors)
5. Check that docs are updated (`architecture.md`, `tasks.md`, `features.md`)

### 6.2 Review Flow

1. **Understand intent** — Read the issue/requirement first
2. **Read the diff** — Start with the changed files list
3. **Check correctness** — Trace the logic for edge cases
4. **Check architecture** — Does it fit the layer model?
5. **Check for over-engineering** — See Section 2.3
6. **Approve or request changes** — Be specific about what to fix and why

### 6.3 Post-Review

- Reviewer approves: merge
- Reviewer requests changes: author addresses, re-requests review
- No fabricated approvals: if you cannot verify, do not approve

## 7. Related Documents

- [Architecture](./architecture.md) — System architecture
- [Coding Guidelines](./coding-guidelines.md) — Development standards
- [Architecture Decisions](./architecture-decisions.md) — ADR log
- [Features](./features.md) — Feature tree
- [Tasks](./tasks.md) — Task hierarchy
