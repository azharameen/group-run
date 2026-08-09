# Epic 6 Context: Knowledge & Memory

<!-- Generated from planning artifacts. Regenerate with compile-epic-context if planning docs change. -->

## Goal

Enable agents to leverage long-term memory and specialized knowledge to improve the continuity and depth of patent research. This epic delivers a searchable knowledge base for technical reference and a persistence layer for agent memories and skills, ensuring that insights from one conversation can inform others and that agents can execute specialized tasks using pre-defined skill sets.

## Stories

- Story 6.1: Knowledge base API (list, read, ingest documents)
- Story 6.2: Wire memory backend into DeepAgents runtime
- Story 6.3: Wire skills loading into DeepAgents runtime
- Story 6.4: Backend tests: KB API, memory persistence
- Story 6.5: Update pages/KnowledgeBase.tsx for new API
- Story 6.6: Frontend tests: KB browser

## Requirements & Constraints

- **Knowledge Base Access**: Users must be able to browse and view documents (PDF, Image, Markdown, Text) in the Knowledge Base (KB). Agents must be able to retrieve and reference these documents during research.
- **Agent Memory Persistence**: Agents must maintain long-term memory across conversation threads. This requires state to be persisted to and loaded from the `/memories/` backend route.
- **Specialized Skills**: Agents must be able to load and execute specialized skill files from the `/skills/` directory to perform domain-specific tasks.
- **Permissions Model**:
    - **Read-Only**: Agents have read-only access to `/kb/`, `/instructions/`, and `/skills/`.
    - **Read/Write**: Agents have read/write access to `/workspace/` and `/memories/`.
- **Provenance**: All documents and memory entries must carry provenance metadata to track the source and trust level of the information.
- **Binary Support**: The KB must handle binary uploads (PDF, PNG, JPG) by extracting text via OCR or PDF parsing for agent consumption.

## Technical Decisions

- **Filesystem Source of Truth**: The workspace filesystem remains the source of truth for KB documents, agent memories, and skill files. SQLite is used for runtime state (checkpoints, threads) only (AD-6).
- **CompositeBackend Routing**: Filesystem access is governed by `CompositeBackend` with the following virtualized routes:
    - `/kb/` -> `knowledge-base/` (read-only)
    - `/memories/` -> `memories/` (read/write)
    - `/skills/` -> `skills/` (read-only)
- **Middleware Integration**: The DeepAgents runtime must utilize `MemoryMiddleware` and `SkillsMiddleware` configured to point to their respective backend routes.
- **API Architecture**: A new `api/routes/knowledge_base.py` module will handle KB operations, leveraging existing helpers in `backend/app/storage/knowledge_base.py`.
- **No Fabricated Output**: Memory and KB retrieval must be grounded; if no relevant information is found, the agent must not fabricate details.

## UX & Interaction Patterns

- **Knowledge Base Browser**: A dedicated UI page allowing users to list, search, and view technical documents and their extracted text.
- **Contextual Awareness**: Agents should demonstrate "memory" by referencing facts established in previous conversation threads when relevant to the current task.

## Cross-Story Dependencies

- **Infrastructure Prerequisite**: This epic assumes the core agent runtime and `CompositeBackend` factory are established (from Epic 1 and Epic 5).
- **API-Frontend Sequencing**: The Knowledge Base API (ST-6.1) must be implemented and tested (ST-6.4) before the frontend browser (ST-6.5) can be fully verified.
