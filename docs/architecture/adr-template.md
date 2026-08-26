# Architecture Decision Record Template

Copy this template into `docs/architecture-decisions.md` when recording a
significant architectural choice. Keep decisions short, specific, and
permanent; use the decision log for the context and the code for implementation
details.

```markdown
## ADR-NNN: Short decision title

**Status**: Proposed | Accepted | Superseded | Deprecated

**Date**: YYYY-MM-DD

**Context**: What problem or constraint led to this decision?

**Decision**: What are we going to do?

**Alternatives considered**:
- Option A — why it was rejected or deferred
- Option B — why it was rejected or deferred

**Consequences**:
- Positive:
- Negative:
- Follow-up:
```

## When to write an ADR

Write an ADR when a decision changes system boundaries, data persistence,
security, deployment, public API behavior, or a constraint that future
contributors would otherwise need to rediscover.
