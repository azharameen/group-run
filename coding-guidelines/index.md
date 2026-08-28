# Coding Guidelines

> **Last updated: 2026-07-29**

## 1. General Principles

### 1.1 Core Rules

| Rule                          | Description                                                                                                 |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------- |
| **Single Responsibility**     | Each file has one job. Route files < 150 lines, services < 200 lines, agent runtime < 200 lines.            |
| **Explicit Over Implicit**    | No silent fallback to fabricated output. Every failure is an explicit error/retry state.                    |
| **Provenance Everywhere**     | Every artifact, event, and decision carries provenance metadata.                                            |
| **Test Coverage**             | All new features must have tests. Run `pytest backend/tests` before committing.                             |
| **No Sandbox Execution**      | Shell execution and code runners are explicitly deferred.                                                   |
| **Authentication by Default** | All non-health `/api` routes, including SSE and test-support routes, require a verified Firebase principal. |

### 1.2 File Size Targets

| Layer                           | Max Lines                 |
| ------------------------------- | ------------------------- |
| Route files                     | 150                       |
| Services and repositories       | 200                       |
| Agent runtime files             | 200                       |
| Workflow/state definition files | 250                       |
| Prompt and instruction content  | Move to skills/ directory |

## 2. Backend Guidelines

### 2.1 Python Style

- Use Python 3.13+ features (type hints, `|` union syntax, `match` statements)
- Use `pydantic` v2 for all data models
- Use `pydantic-settings` for configuration
- Use `typing` module for type annotations
- Follow PEP 8 with 100-character line limit

### 2.2 Import Order

```python
# 1. Standard library
import os
from datetime import datetime
from pathlib import Path

# 2. Third-party
from fastapi import APIRouter
from pydantic import BaseModel

# 3. Application
from ..config import settings
from ..storage.yaml_io import load_idea_yaml
```

### 2.3 Module Structure

```text
module/
├── __init__.py          # Re-exports
├── main_logic.py        # Core logic
├── helpers.py           # Helper functions
└── types.py             # Type definitions
```

### 2.4 API Route Patterns

```python
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

router = APIRouter(prefix="/api", tags=["example"])

class RequestModel(BaseModel):
    field: str

class ResponseModel(BaseModel):
    success: bool
    data: dict

@router.post("/endpoint")
async def handle_endpoint(req: RequestModel) -> ResponseModel:
    try:
        result = await do_work(req.field)
        return ResponseModel(success=True, data=result)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
```

### 2.5 Credential Management

> **⚠️ Critical**: LangChain's `init_chat_model()` (called internally by `create_deep_agent`) reads credentials from standard OS environment variables (`OPENAI_API_KEY`, `OPENAI_API_BASE`), NOT from pydantic-settings. The `config.py` module automatically propagates credentials to `os.environ` at import time. If you add new credential fields, ensure they are propagated to `os.environ` in `config.py`.

```python
# config.py pattern for credential propagation
if settings.some_api_key and not os.environ.get("SOME_API_KEY"):
    os.environ["SOME_API_KEY"] = settings.some_api_key
```

User-managed provider credentials use `PROVIDER_CREDENTIAL_ENCRYPTION_KEY`. Keep it server-only, configure it through `Settings`, propagate it to the process environment, and never return encrypted or decrypted credential payloads from an API.

### 2.6 Error Handling

```python
# Good: explicit error states
try:
    result = await agentic_step()
except AgenticFailure as e:
    return {"status": "failed", "reason": str(e), "retry_allowed": True}

# Bad: silent fallback
try:
    result = await agentic_step()
except Exception:
    result = "Fabricated success"  # NEVER do this
```

### 2.7 Provenance Metadata

Every generated artifact must carry:

```python
provenance = f"artifact:{idea_id}:{section_name}"
trust = "generated"  # or "trusted", "verified-tool-call", "fallback"
evidence_refs = [...]  # source evidence references
```

## 3. Frontend Guidelines

### 3.1 TypeScript/React Style

- Use TypeScript strict mode
- Use functional components with hooks
- Use `shadcn/ui` components from `@/components/ui/`
- Use Radix UI primitives for complex interactions
- Use Tailwind CSS for styling
- Follow the existing component patterns

### 3.2 Component Structure

```typescript
import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

interface Props {
  ideaId: string
  onUpdate?: () => void
}

export function MyComponent({ ideaId, onUpdate }: Props) {
  const [loading, setLoading] = useState(false)

  return (
    <Card>
      <CardHeader>
        <CardTitle>Component Title</CardTitle>
      </CardHeader>
      <CardContent>
        {/* Content */}
      </CardContent>
    </Card>
  )
}
```

### 3.3 API Client Usage

```typescript
// Use the centralized API client
import { fetchIdeas, createIdea } from '@/api/client'

// For streaming
import { useDeepAgentStream } from '@/hooks/useDeepAgentStream'
```

### 3.4 SSE Streaming

```typescript
const { events, isConnected } = useDeepAgentStream(ideaId, {
  onEvent: (event) => {
    // Handle runtime events
  },
  onError: (error) => {
    // Handle errors
  },
})
```

## 4. Testing Guidelines

### 4.1 Test Structure

```python
"""Tests for the module."""

import pytest

class TestFeature:
    def test_happy_path(self):
        """Should succeed when conditions are met."""
        ...

    def test_error_case(self):
        """Should fail gracefully when conditions are not met."""
        ...
```

### 4.2 Test Coverage Requirements

- All API endpoints must have integration tests
- All state machine transitions must have unit tests
- All scoring criteria must have validation tests
- All HITL flows must have end-to-end tests

### 4.3 Running Tests

```bash
# Run all tests
pytest backend/tests

# Run specific test file
pytest backend/tests/test_scoring.py -v

# Run with coverage
pytest backend/tests --cov=backend/app
```

## 5. Cross-Reference Rules

When adding or modifying code, update these documents as needed:

| Document                                                                                              | When to Update                                               |
| ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| [`architecture.md`](https://azharameen.github.io/group-run/architecture/index.md)                     | New components, changed data flow, new environment variables |
| [`features.md`](https://azharameen.github.io/group-run/features/index.md)                             | Feature added, removed, or status changed                    |
| [`architecture-decisions.md`](https://azharameen.github.io/group-run/architecture-decisions/index.md) | New architectural decision or reversal of existing ADR       |
| [`tasks.md`](https://azharameen.github.io/group-run/tasks/index.md)                                   | Task started, completed, or status changed                   |
| [`code-review-guidelines.md`](https://azharameen.github.io/group-run/code-review-guidelines/index.md) | New review patterns or reject criteria                       |

## 6. Documentation Guidelines

### 6.1 Docstrings

```python
def function_name(param1: str, param2: int) -> bool:
    """Short description of what the function does.

    Args:
        param1: Description of param1.
        param2: Description of param2.

    Returns:
        Description of return value.
    """
```

### 6.2 Inline Comments

- Use comments to explain WHY, not WHAT
- Keep comments up to date with code changes
- Use TODO comments for planned work: `# TODO: implement retry logic`

### 6.3 Windows-First Documentation

The team develops on Windows with PowerShell. Every shell command in documentation (README, `docs/`, runbooks, PR descriptions) must work on Windows, or include a Windows alternative **from the first draft** — never as an afterthought patch:

- Python: `python`, not `python3` (Windows has no `python3` by default)
- Virtualenv activation: `.venv\Scripts\activate` (PowerShell); Unix `source ...` examples need a Windows alternative
- Paths: backslash form in filesystem examples, or slash form both shells accept — never document paths that only work on one platform
- Shell HTTP: `curl.exe` (or `Invoke-RestMethod`) — bare `curl` in PowerShell is an alias for `Invoke-WebRequest` with different flag syntax
- Line endings: CRLF in text files (`core.autocrlf true`); don't mix

**Docs PR gate:** a doc PR containing shell commands fails review if any command lacks a Windows equivalent (or is not cross-platform safe). Canonical setup examples live in `docs/GETTING_STARTED.md` ("Windows-Specific Notes").

Rationale (2026-08-16, Sprint 2): Epic 7 retrospective item #2 — Windows notes were appended as afterthoughts (e.g., inline notes in `GETTING_STARTED.md`); the standard makes the expectation explicit up front.

## 7. Git Workflow

### 7.1 Commit Messages

```text
type(scope): description

- type: feat, fix, refactor, test, docs, chore
- scope: backend, frontend, agent, config, docs
- description: imperative, lowercase, no period
```

### 7.2 Branch Naming

```text
feat/description
fix/description
refactor/description
docs/description
```
