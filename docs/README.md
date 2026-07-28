# DeepAgents Migration Docs

This folder tracks the backend and frontend migration from the current custom workflow system to a real LangGraph + DeepAgents architecture.

## Docs Index

- `current-state-audit.md`: findings from the current repo audit
- `target-architecture.md`: target backend and frontend architecture
- `feature-roadmap.md`: current, next, and later product capabilities
- `phased-plan.md`: phase-by-phase implementation plan with checklists
- `milestone-tracker.md`: live progress tracker for completed and pending work
- `frontend-plan.md`: frontend-specific migration notes for shadcn/radix and streaming

## Current Status

- Backend audit complete
- Target architecture documented
- Initial DeepAgents backend scaffold added without changing runtime behavior
- Frontend audit complete: shadcn/ui and Radix UI are already in place

## Rules For Ongoing Work

- Update `milestone-tracker.md` whenever a task or milestone is completed
- Prefer non-breaking phases over big-bang rewrites
- Keep backend and frontend contracts aligned before switching runtime behavior
- Do not enable sandbox execution in the first migration phases
