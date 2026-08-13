# Commander Implementation Plan

**Project:** Companion — Command Center + Commander Orchestrator
**Author:** Winston (System Architect)
**Date:** 2026-08-13
**Status:** Proposed — Ready for Epic/Story Creation
**Philosophy:** Quality over speed. Each phase delivers production-ready, validated components.

---

## Implementation Order & Dependencies

```mermaid
graph LR
    subgraph Phase0["Phase 0: Foundation"]
        A["GitHub branch protection"]
        B["Remove legacy workflows"]
        C["Update project-context.md"]
        D["BMad customizations"]
    end

    subgraph Phase1["Phase 1: Commander Core"]
        E["Module split"]
        F["Deferred work parser"]
        G["Deferred work UI"]
        H["Dispatch classifier"]
    end

    subgraph Phase2["Phase 2: Jules Lifecycle"]
        I["Branch naming generator"]
        J["Jules brief builder"]
        K["Adaptive polling"]
        L["Auto-approval engine"]
    end

    subgraph Phase3["Phase 3: Copilot Integration"]
        M["Copilot dispatch"]
        N["Feedback resolution"]
        O["Stacked approval UI"]
        P["Multi-agent state tracker"]
    end

    subgraph Phase4["Phase 4: PR Lifecycle"]
        Q["PR validation"]
        R["Copilot review"]
        S["Pipeline monitoring"]
        T["Auto-merge logic"]
        U["Branch cleanup"]
    end

    subgraph Phase5["Phase 5: Trust"]
        V["JSONL logging"]
        W["Trust dashboard"]
        X["Learning loop"]
        Y["CI pipeline redesign"]
    end

    subgraph Phase6["Phase 6: Polish"]
        Z["Quota management"]
        AA["Edge case handling"]
        BB["Performance optimization"]
        CC["Documentation"]
    end

    A --> E --> I --> M --> Q --> V --> Z
    E --> F --> G
    G --> H
    H --> J --> K --> L --> N --> O --> P --> R --> S --> T --> U --> W --> X --> Y --> AA --> BB --> CC