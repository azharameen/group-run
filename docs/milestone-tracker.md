# Milestone Tracker

Update this file whenever work is completed.

## Milestone Summary

- [x] M0: Current-state audit completed
- [x] M0: Target architecture documented
- [x] M0: Feature roadmap documented
- [x] M0: Phased plan documented
- [x] M0: Initial DeepAgents scaffold added
- [x] M0: Phase 0 completed
- [x] M1: FastAPI route split completed
- [x] M1: Backend structural cleanup completed
- [ ] M2: Real DeepAgents runtime build completed
- [ ] M3: Skills and memory migration completed
- [ ] M4: Human-in-the-loop approvals completed
- [ ] M5: Frontend DeepAgents streaming integration completed
- [ ] M6: Artifact quality and traceability completed
- [ ] M7: Advanced capabilities completed

## Completed Tasks

### 2026-07-28

- [x] Updated the docs to distinguish real agentic primitives from hardcoded, partial-agentic, and simulated paths.
- [x] Added upstream DeepAgents research notes to the architecture docs.
- [x] Reframed the roadmap around explicit retry/error states instead of silent fallback fabrication.
- [x] Replaced overstated completion claims with a realistic milestone tracker.
- [x] Documented the gap between workflow progress updates and a true live agent transcript.
- [x] Added implementation checklist items for typed runtime events, transcript separation, and explicit speaker labeling.
- [x] Added solution research checklist items for chat layout, transcript design, and patent/file adapter selection.
- [x] Added an explicit execution order for the complete agentic implementation path.
- [x] Captured phase-by-phase concrete solution paths in the phased plan.
- [x] Mapped each major issue family to a concrete agentic solution mechanism.
- [x] Removed sandboxing from the active roadmap and kept only safe validation notes.
- [x] Identified the next implementation slice: typed runtime events plus transcript-driven UI.
- [x] Implemented the first transcript/runtime slice: expanded event types, backend provenance metadata, and UI transcript compatibility.

### Current reality

- [ ] DeepAgents runtime is still not the single source of truth everywhere.
- [ ] Silent fallback behaviors still need to be removed from runtime code.
- [ ] Human approval interrupts still need to be made truly blocking where required.
- [ ] Real prior-art retrieval still needs package/tool integration research before implementation.
- [ ] Frontend error/retry trust signals still need to be finalized.
- [ ] Conversation threads still mix real comments with hardcoded agent/task narration.
- [ ] The live chat surface still does not show true agent thinking, tool calls, and delegate handoffs as first-class transcript events.
- [ ] Patent/filing research source adapters still need to be selected and wired.
- [ ] The UI still needs to distinguish real agent speakers from orchestration/status messages.
- [ ] Agent roster and state transition ownership still need finalization.
- [ ] The concrete code implementation for the ordered phases still needs to begin.
- [ ] The fully agentic runtime still needs to replace scripted chat narration.
- [ ] The live transcript UI still needs richer rendering for approval / retry / failed states.

## Validation Notes

- `npm run build` in `frontend/` passed with 0 TypeScript/Vite compilation errors.
- `pytest backend/tests` passed 24 out of 24 tests cleanly in the latest verified run.
