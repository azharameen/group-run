# Target Architecture

## Principles

- Keep business workflow state in the application domain, not hidden inside prompts.
- Use DeepAgents as the agent runtime, not as a replacement for all domain logic.
- Keep current behavior stable while changing internals.
- Prefer small files with one job.
- Treat filesystem, memory, and review approvals as explicit architectural concerns.

## Recommended Folder Structure

```text
backend/app/
  api/
    app.py
    deps.py
    routes/
      health.py
      ideas.py
      workflow.py
      config.py
      comments.py
      streaming.py

  agent/
    __init__.py
    context.py
    backends.py
    permissions.py
    subagents.py
    runtime.py
    skills/
      discovery/
      drafting/
      review/
      strategy/

  domain/
    models/
      idea.py
      score.py
      workflow.py
      review.py
      artifact.py
    services/
      idea_service.py
      workflow_service.py
      scoring_service.py
      review_service.py
      artifact_service.py
      kb_service.py
    policies/
      gates.py
      scoring_policy.py
      review_policy.py

  infrastructure/
    config/
      settings.py
    storage/
      idea_repo.py
      registry_repo.py
      artifact_repo.py
      comment_repo.py
      kb_repo.py
    events/
      stream_bus.py
    llm/
      model_factory.py

  application/
    commands/
      create_idea.py
      advance_idea.py
      run_pipeline.py
      approve_review.py
    queries/
      get_idea.py
      list_ideas.py
      get_stats.py

frontend/src/
  app/
  api/
  components/
    ui/
    deepagents/
    ideas/
    workflow/
  hooks/
  lib/
  pages/
  types/
```

## File Size Targets

- route files: under 150 lines
- services and repositories: under 200 lines
- agent runtime files: under 200 lines
- workflow/state definition files: under 250 lines
- prompt and instruction content: move to skills, not giant Python files

## Backend Runtime Design

### DeepAgents role

DeepAgents should be a bounded runtime layer that performs:

- planning
- delegation
- structured research and drafting
- stateful task execution
- memory access
- HITL pauses
- event streaming

The domain layer should still own:

- idea lifecycle state
- gate policies
- approval records
- source-of-truth artifacts
- scoring thresholds
- business rules

### Backend configuration

Recommended runtime backend:

```python
CompositeBackend(
    default=StateBackend(),
    routes={
        "/workspace/": FilesystemBackend(root_dir=WORKSPACE_DIR, virtual_mode=True),
        "/kb/": FilesystemBackend(root_dir=KNOWLEDGE_BASE_DIR, virtual_mode=True),
        "/instructions/": FilesystemBackend(root_dir=INSTRUCTIONS_DIR, virtual_mode=True),
        "/memories/": FilesystemBackend(root_dir=MEMORIES_DIR, virtual_mode=True),
        "/skills/": FilesystemBackend(root_dir=SKILLS_DIR, virtual_mode=True),
    },
)
```

Why this split:

- `StateBackend`: thread-scoped scratch state, conversation history, large tool result offloading
- `/workspace/`: current product artifacts and drafts
- `/kb/`: uploaded knowledge and curated source material
- `/instructions/`: read-only operating guidance
- `/memories/`: long-term memory files
- `/skills/`: reusable procedural capabilities

### Permissions model

Recommended rules:

- allow read on `/workspace/**`, `/kb/**`, `/instructions/**`, `/skills/**`, `/memories/**`
- allow write on `/workspace/**` and `/memories/**`
- interrupt writes under `/workspace/submissions/**` and `/workspace/final/**`
- deny writes on `/kb/**`, `/instructions/**`, and `/skills/**`
- deny all other external paths

### Middleware model

Expected DeepAgents middleware stack:

- TodoListMiddleware
- SkillsMiddleware
- FilesystemMiddleware with permissions
- SubAgentMiddleware
- SummarizationMiddleware
- PatchToolCallsMiddleware
- custom audit middleware
- MemoryMiddleware
- HumanInTheLoopMiddleware

### Subagent model

Keep a smaller set of real specialists:

- `signal-curator`
- `idea-discoverer`
- `problem-framer`
- `novelty-analyst`
- `prior-art-researcher`
- `detectability-analyst`
- `business-value-analyst`
- `siemens-alignment`
- `patent-drafter`
- `review-packager`

Avoid creating a one-to-one subagent per workflow state when the responsibilities are nearly identical.

### Skills model

Move prompt-heavy instructions into skills:

- `siemens-domain-taxonomy`
- `patentability-rubric`
- `prior-art-research-method`
- `ideascope-template`
- `claim-drafting-guidelines`
- `manager-review-checklist`
- `ip-counsel-readiness`
- `detectability-evaluation-method`
- `business-value-estimation-method`

### Memory model

Use two scopes:

- org-scoped memory for strategy and policy
- user-scoped memory for preferences and reviewer behavior

Do not use memory as a replacement for the domain repository.

### Human-in-the-loop model

Interrupts should replace simulated approvals for:

- manager review
- IP review
- final counsel validation
- final submission packaging
- destructive archive or delete actions

## Frontend Design Target

The frontend already uses shadcn/ui and Radix UI. Keep them.

Target frontend additions:

- agent todo/progress panel
- subagent cards with status and scoped messages
- tool-call activity timeline
- approval queue and reviewer actions
- artifact diff and revision panels
- richer stream-backed status views

## Non-Goals For Early Phases

- sandbox shell execution
- code execution through agent `execute`
- full DB migration before runtime cleanup
- replacing the existing UI with a new design system
