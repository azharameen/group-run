---
title: 'Per-user LLM provider configurations and dynamic model selection'
type: 'feature'
created: '2026-08-26T20:32:26.275+05:30'
status: 'done'
baseline_commit: '4ce019fa78a5929fe6627dc0b816537ac306dc1d'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/project-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Provider configurations are global, OpenAI-centric, and expose hardcoded frontend model choices. Users cannot securely manage multiple enabled OpenAI, Google, Ollama, or Anthropic configurations or select a valid model per chat.

**Approach:** Add user-owned provider configurations with provider-aware fields, server-side model discovery, enabled-state management, connection testing, and a default model. Make LangGraph/DeepAgents resolve the selected configuration for each chat rather than process-global settings.

## Boundaries & Constraints

**Always:** Support OpenAI, Google Gemini Developer API, Ollama, and Anthropic chat models; permit multiple configurations of any provider and multiple enabled configurations per user; encrypt credentials at rest, never return or log secrets, and invoke provider APIs only from the backend. Use existing shadcn/ui wrappers and Radix primitives exclusively. Model and provider capability choices are API-derived, while the supported provider integration set is server-enforced. Preserve Firebase UID ownership and LangGraph checkpoint/thread behavior.

**Ask First:** Adding providers beyond the four named integrations, Google Vertex/service-account authentication, a third-party secret manager, or cross-user/shared provider configurations.

**Never:** Persist plaintext credentials, retain the global active-provider snapshot as a request-resolution fallback, expose a raw provider credential to the browser, hardcode a model catalog in frontend constants, silently fall back to another provider/model, or construct DeepAgents outside the runtime factory.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Save cloud provider | Valid name, API key, optional supported base URL, model selection | User-scoped encrypted configuration is saved; secret is represented only by `has_credentials` | Reject duplicate name per user, invalid URL, missing key, or unsupported field with field errors |
| Save Ollama provider | Valid name and reachable HTTP(S) endpoint | Configuration saves without API key; model list comes from endpoint tags | Reject absent/invalid endpoint and surface unreachable-server detail without leaking request secrets |
| Discover models | Enabled config with valid credentials or endpoint | Backend returns live chat-capable models grouped by saved provider configuration | Return explicit unavailable/auth/network status; preserve no stale fabricated success |
| Choose chat model | Selected enabled configuration/model or user default | Chat request persists selection in thread metadata and runtime builds that provider model | Reject disabled/deleted configuration, unknown model, or no configured default before execution |
| Provider lifecycle | Test, enable/disable, or delete a user-owned config | State changes affect only caller; delete clears any matching default | Return 404 for another user's ID; prevent delete while explicitly selected chat request is executing |

</frozen-after-approval>

## Code Map

- `backend/alembic/versions/002_provider_configs.py` and a new migration -- evolve provider storage from global active row to user-scoped configurations and defaults.
- `backend/app/db/models.py`, `backend/app/providers/repository.py`, `backend/app/providers/service.py`, `backend/app/providers/runtime.py` -- own encrypted credentials, UID-scoped persistence, validation, enablement, catalog lookup, and remove global snapshot resolution.
- `backend/app/providers/adapters.py` and new provider adapter modules -- normalize OpenAI, Google Gemini, Ollama, and Anthropic model-list/test/chat construction.
- `backend/app/api/schemas.py`, `backend/app/api/routes/providers.py`, and chat request route/schema -- expose scoped provider, catalog, default, and explicit chat-model contracts.
- `backend/app/agent/runtime.py`, `backend/app/agent/context.py`, `backend/app/agent/subagents.py` -- propagate authenticated user/model choice to LangGraph/DeepAgents and construct the matching adapter without changing checkpointer ownership.
- `frontend/src/api/providers.ts`, `frontend/src/api/client.ts`, `frontend/src/components/settings/SettingsComponents.tsx`, `frontend/src/constants/settings.ts` -- replace hardcoded model data with typed APIs and provider-aware settings controls.
- `frontend/src/components/settings/SettingsDialog.tsx` and the chat composer/model-selection component -- present provider-grouped enabled models and set/use the default model with shadcn/Radix Select, Tabs, Switch, Alert, and Dialog components.

## Tasks & Acceptance

**Execution:**
- [x] `backend/alembic/versions/` and `backend/app/db/models.py` -- migrate provider records to Firebase-UID ownership, provider/configuration identity, encrypted credential payload, enabled state, and UID-scoped default model reference; replace global-active uniqueness with correct user/configuration constraints.
- [x] `backend/app/providers/{repository,service,runtime,adapters}.py` -- implement provider capability validation and OpenAI, Google Gemini API, Ollama, and Anthropic adapters for live model discovery, connection testing, and `BaseChatModel` construction; cache catalog metadata only per safe configuration boundary and never credentials.
- [x] `backend/app/api/{schemas.py,routes/providers.py}` and chat API schema/routes -- add authenticated CRUD, test, enable toggle, model-catalog, aggregate grouped-model, and default-selection contracts; require an enabled saved configuration and discovered model for each chat start/resume.
- [x] `backend/app/agent/{context.py,runtime.py,subagents.py}` -- carry caller UID and chosen provider configuration/model through request and thread metadata, resolve it inside the single runtime factory, and keep all LangGraph supervisor/subagent `auto` behavior scoped to the chosen model.
- [x] `frontend/src/api/providers.ts` and `frontend/src/constants/settings.ts` -- define typed catalog/default/configuration calls through `request()` and remove static `OPENAI_MODELS`.
- [x] `frontend/src/components/settings/SettingsComponents.tsx` and `frontend/src/components/settings/SettingsDialog.tsx` -- add provider-aware configuration forms with conditional API-key/endpoint fields, endpoint URL validation, test, enabled switch, delete confirmation, live model loading, and accessible loading/error/status states.
- [x] `frontend/src/components/` chat model selector and related chat API client -- render enabled configurations' live models in provider groups, select/store the user's default, submit the selected configuration/model in chat requests, and block submit with an actionable message when none is available.
- [x] `backend/tests/` and `frontend/src/__tests__/` -- add provider matrix, user-isolation, validation, runtime, API-client, component, and chat-selection tests with all external provider calls mocked; add a focused Playwright path for save/test/enable/default/select/delete.

**Acceptance Criteria:**
- Given two authenticated users, when either creates, lists, edits, enables, tests, or deletes a provider configuration, then only that user's records and defaults are observable or mutable.
- Given valid OpenAI, Google Gemini, Anthropic, or Ollama configuration details, when a user requests models, then the backend calls that provider's model API and returns normalized live chat models without exposing credentials.
- Given a cloud provider, when its API key is omitted or an unsupported endpoint/field is submitted, then the UI and API provide provider-specific validation; given Ollama, then an endpoint is required and API key fields are hidden and not persisted.
- Given multiple enabled configurations, including multiple from one provider, when the chat selector opens, then it lists fetched models grouped by provider configuration and has no hardcoded model options.
- Given a default model or explicit selector choice, when a chat runs, then LangGraph/DeepAgents use that exact enabled configuration/model and persist the selection for the thread; when it is unavailable, then execution fails explicitly without fallback.
- Given a configuration is tested, enabled/disabled, or deleted, when the operation completes, then the settings UI reflects the persisted result with accessible feedback and removes invalid defaults/selections.

## Delivery Patterns Checklist

**CI** (`.github/workflows/ci.yml`):
- [x] Backend: `ruff check` clean, `scripts/forbidden_imports.py` passes, coverage stays at/above `--cov-fail-under=60`
- [x] Frontend: `tsc -b --noEmit`, `eslint src`, `vitest run`, `npm run build` all pass
- [x] Dependency changes: provider integration packages and lockfiles updated; production dependency audit clean
- [x] User-visible flow changed: Playwright E2E provider lifecycle and chat model-selection spec updated

**Docker / Deploy**:
- [x] Image/compose changes needed only for required LangChain provider integrations and the credential-encryption key; preserve `HEALTHCHECK`
- [x] New credential-encryption setting follows the four-step chain and is never copied to browser-facing configuration
- [x] Filesystem paths only via configured path helpers

**Testing**:
- [x] Mock all provider SDK/HTTP and LangGraph model boundaries; no test uses a live provider
- [x] Add config cleanup to the separate test database and retain class-based pytest coverage
- [x] Cover invalid/missing keys, endpoint validation, auth/authorization isolation, duplicate names, encrypted secret non-disclosure, provider API failures/timeouts, empty catalogs, disabled/deleted defaults, stale chat choices, all four adapter constructors, and no fallback behavior
- [x] Cover frontend loading/error/status, conditional fields, form validation, model grouping/default persistence, lifecycle controls, and keyboard-accessible shadcn/Radix interaction

## Design Notes

The backend owns a provider capability registry, but each user configuration receives an opaque ID. The aggregate catalog response supplies display grouping and selectable model IDs; a chat submits the opaque configuration ID plus a discovered model ID. Thread metadata records that resolved pair so retries and subagents cannot accidentally read mutable global settings.

## Verification

**Commands:**
- `pytest backend/tests/test_provider_config.py backend/tests/test_runtime.py backend/tests/test_deepagents_integration.py` -- expected: scoped provider, adapter, and runtime tests pass without network access
- `npm --prefix frontend run test -- --run src/__tests__/providers.test.ts src/__tests__/request.test.ts` -- expected: provider contract and UI tests pass
- `npm --prefix frontend run build` -- expected: strict TypeScript production build succeeds

## Suggested Review Order

**Data & encryption foundation**
- `../../backend/alembic/versions/003_user_provider_configurations.py#L81` -- migration: user-scoped tables, legacy credential re-encryption
- `../../backend/app/db/models.py#L276` -- user-owned provider model and default
- `../../backend/app/providers/crypto.py` -- credential encrypt/decrypt at rest

**Provider core**
- `../../backend/app/providers/adapters.py#L104` -- OpenAI, Google, Ollama, Anthropic adapters
- `../../backend/app/providers/validation.py#L53` -- per-provider field and endpoint validation
- `../../backend/app/providers/service.py#L21` -- CRUD, test, catalog, default, resolve_model
- `../../backend/app/providers/runtime.py#L11` -- chat model construction from a saved configuration

**API contract**
- `../../backend/app/api/schemas.py#L182` -- scoped provider request/response schemas
- `../../backend/app/api/routes/providers.py` -- UID-scoped provider routes
- `../../backend/app/api/routes/thread_stream.py` -- chat streaming on the resolved provider pair

**LangGraph / DeepAgents wiring**
- `../../backend/app/agent/runtime.py#L442` -- async runtime factory taking provider_definition
- `../../backend/app/agent/runner.py#L694` -- empty idea_id guard for global threads
- `../../backend/app/agent/subagents.py` -- subagents inherit the resolved model

**Frontend (shadcn/Radix)**
- `../../frontend/src/api/providers.ts#L63` -- typed provider API calls
- `../../frontend/src/components/settings/SettingsComponents.tsx` -- provider-aware settings forms
- `../../frontend/src/components/command-center/ModelSelector.tsx` -- provider-grouped model selector

**Tests (last)**
- `../../backend/tests/test_provider_config.py` -- provider matrix, isolation, non-disclosure
- `../../backend/tests/test_runtime.py` and `../../backend/tests/test_deepagents_integration.py` -- runtime resolution, no fallback
- `../../backend/tests/test_threads.py` -- streaming and checkpoint persistence
- `../../frontend/src/__tests__/providers.test.ts`, `../../frontend/src/components/settings/ProviderSettings.test.tsx`, `../../frontend/src/components/command-center/ModelSelector.test.tsx`
- `../../frontend/e2e/providers.spec.ts` -- provider lifecycle Playwright path
