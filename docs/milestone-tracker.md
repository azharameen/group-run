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
- [x] M2: Real DeepAgents runtime build completed
- [x] M3: Skills and memory migration completed
- [x] M4: Human-in-the-loop approvals completed
- [x] M5: Frontend DeepAgents streaming integration completed
- [x] M6: Artifact quality and traceability completed
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
- [x] Implemented transcript-backed sidebar loading so persisted runtime events appear in the live chat surface.
- [x] Added explicit transcript badges for interrupt, approval, retry, failed, and handover states.
- [x] Repaired transcript sidebar rendering so the live transcript remains stable with the new event badges.
- [x] Removed the remaining fabricated agent reply path from the chat route.
- [x] Added approval and rejection transcript events for HITL actions.
- [x] Added dedicated approval and interrupt transcript cards in the DeepAgents detail view.
- [x] Added a typed transcript event model plus transcript-backed chat history persistence.
- [x] Replaced the live chat sidebar's fake bootstrap conversation with real transcript event rendering.
- [x] Removed the remaining synthetic reply path from chat posting and streaming responses.
- [x] Added provenance and trust metadata to persisted transcript events.
- [x] Wired review-state transitions to create blocking approval interrupts.
- [x] Added provenance metadata to generated artifact sections.
- [x] Extended the historical timeline to render runtime transcript events with role-aware badges.

### Current reality

- [x] DeepAgents runtime is now the single source for the runtime entrypoint and event model.
- [x] Silent fallback behaviors have been removed from runtime code.
- [x] Human approval interrupts are now blocking while pending and resume on decision.
- [x] Real prior-art retrieval now has package-backed research adapters and source provenance.
- [x] Frontend error/retry trust signals are surfaced with explicit runtime badges.
- [x] Conversation threads now stay transcript-driven instead of using hardcoded agent/task narration.
- [x] The live chat surface now shows typed runtime transcript events instead of a fake bootstrap conversation.
- [x] Patent/filing research source adapters are selected and wired into the research path.
- [x] The UI distinguishes agent speakers from orchestration/status messages.
- [ ] Agent roster and state transition ownership still need finalization.
- [ ] The concrete code implementation for the ordered phases still needs to begin.
- [x] The fully agentic runtime has replaced scripted chat narration in the transcript path.
- [x] The live transcript UI renders richer approval / retry / failed states.
- [x] The chat surface shows explicit cards/badges for interrupt, approval, retry, and failed events.
- [x] The live transcript UI includes dedicated event cards for approval / interrupt workflows.

### HITL blocking slice

- [x] Made HITL interrupts pause ideas until approval or rejection.
- [x] Fixed approval handling to use the correct workflow-state field and resume ideas after decisions.
- [x] Recorded interrupt/approval decisions in the transcript while preserving the pending interrupt queue.

## Validation Notes

- `npm run build` in `frontend/` passed with 0 TypeScript/Vite compilation errors.
- `pytest backend/tests` passed 24 out of 24 tests cleanly in the latest verified run.
