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
- [x] M7: Advanced capabilities completed

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

### 2026-07-29

- [x] Replaced the remaining scripted runtime narration with runtime-driven transcript event coercion.
- [x] Removed the last hardcoded idea-generation and heuristic scoring fallback paths.
- [x] Made pending HITL interrupts durable on disk instead of in-memory.
- [x] Replaced public patent scraping with a structured Google Patents XHR JSON adapter.
- [x] Revalidated the backend and frontend after the final adapter change.
- [x] Renamed generic backend modules to descriptive names (`tools.py` -> `domain_tools.py` / `workflow_tools.py`, `ideas.py` -> `idea_workspace.py`).
- [x] Consolidated dependency maintenance so the repo root `requirements.txt` now wraps `backend/requirements.txt`.

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
- [x] Agent roster and state transition ownership finalized.
- [x] The fully agentic runtime has replaced scripted chat narration in the transcript path.
- [x] The live transcript UI renders richer approval / retry / failed states.
- [x] The chat surface shows explicit cards/badges for interrupt, approval, retry, and failed events.
- [x] The live transcript UI includes dedicated event cards for approval / interrupt workflows.
- [x] Multimodal ingestion for PDFs and images is implemented.
- [x] LangSmith observability is configured through runtime env propagation.
- [x] Delete/archive requests now route through approval interrupts before destructive action.
- [x] Review analytics expose reviewer identity and pending-interrupt observability.
- [x] The streamed transcript is runtime-driven in `backend/app/agent/runner.py`.
- [x] Idea generation now uses runtime-driven prior-art and taxonomy inputs instead of hardcoded seed ideas.
- [x] Scoring now uses the LLM-backed JSON scoring path end to end.
- [x] Pending HITL interrupts are durable and survive restart.
- [x] Public patent search now uses a structured JSON adapter instead of HTML scraping.
- [x] Review timestamps now use durable real timestamps.
- [x] Repository cleanup renamed the most confusing generic backend modules to descriptive names.
- [x] Dependency entrypoint cleanup removed the duplicate root dependency list.

### HITL blocking slice

- [x] Made HITL interrupts pause ideas until approval or rejection.
- [x] Fixed approval handling to use the correct workflow-state field and resume ideas after decisions.
- [x] Recorded interrupt/approval decisions in the transcript while preserving the pending interrupt queue.

### Phase 7 hardening slice

- [x] Added reviewer identity normalization and approval analytics.
- [x] Recorded package/adaptation decision history in the living docs.
- [x] Documented the DB-migration planning decision to keep YAML until migration is warranted.
- [x] Completed the remaining Phase 7 capability checklist and closed M7.
  - Optional internal filing connector work remains a future enhancement, not a blocker.

## Validation Notes

- `npm run build` in `frontend/` passed with 0 TypeScript/Vite compilation errors.
- `pytest backend/tests` passed 43 out of 43 tests cleanly in the latest verified run.
