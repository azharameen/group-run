---
title: 'Migrate Swagger API docs to Scalar'
type: 'chore'
created: '2026-08-26'
status: 'done'
baseline_commit: '15afbf7d6190fe31a1ed50c42149fc977981ef6d'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/project-context.md'
  - '{project-root}/docs/coding-guidelines.md'
  - '{project-root}/docs/architecture.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The project currently exposes and documents Swagger/ReDoc HTML UIs,
while the desired interactive API documentation standard is Scalar. References
in MkDocs and landing-page documentation also still describe Swagger.

**Approach:** Keep FastAPI's generated `/openapi.json` contract unchanged, disable
the duplicate built-in Swagger and ReDoc HTML routes, and publish a Scalar
interactive reference through MkDocs. Remove the Swagger MkDocs plugin and update
all related links, labels, dependencies, and tests.

## Boundaries & Constraints

**Always:** Preserve every API endpoint, request/response schema, and OpenAPI JSON
URL; use the existing live backend URL in the Scalar embed; keep documentation
buildable in CI; update all repository references and relevant regression tests.

**Ask First:** Any change to API paths, OpenAPI schema generation, live service
URLs, or a switch from a CDN-hosted Scalar embed to a locally bundled asset.

**Never:** Do not remove OpenAPI JSON, change endpoint parameters, retain
Swagger/ReDoc UI routes, keep the Swagger MkDocs plugin/dependency, or add live
model/MCP requirements to tests.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| OpenAPI schema | `GET /openapi.json` | Existing JSON schema remains available for Scalar | Existing FastAPI behavior |
| Legacy Swagger UI | `GET /docs` | Route is unavailable | HTTP 404 |
| Legacy ReDoc UI | `GET /redoc` | Route is unavailable | HTTP 404 |
| MkDocs API page | Build docs with `mkdocs build` | Scalar page is included and contains the configured OpenAPI URL | Build fails explicitly |
| Repository references | Search docs/config/dependencies | No Swagger UI/plugin references remain | Fix every remaining in-scope reference |

</frozen-after-approval>

## Code Map

- `backend/app/api/app.py` -- FastAPI application factory and generated documentation route configuration.
- `backend/tests/test_api_docs.py` -- regression tests for OpenAPI availability and legacy UI removal.
- `mkdocs.yml` -- API navigation, plugin list, and llmstxt documentation references.
- `docs-requirements.txt` -- MkDocs plugin dependencies.
- `docs/api/scalar.md` -- Scalar interactive API reference page replacing Swagger.
- `docs/index.md` -- API navigation and live-service links.
- `docs/ai-agents/context-guide.md` -- API-aware agent documentation using the schema URL.

## Tasks & Acceptance

**Execution:**
- [x] `backend/app/api/app.py` -- disable FastAPI Swagger and ReDoc HTML routes while preserving `/openapi.json` -- avoid duplicate interactive UIs.
- [x] `backend/tests/test_api_docs.py` -- cover schema availability and 404 behavior for `/docs` and `/redoc` -- lock the migration contract.
- [x] `mkdocs.yml` -- replace Swagger navigation/plugin/llmstxt entries with Scalar references -- make MkDocs the supported UI.
- [x] `docs-requirements.txt` -- remove `mkdocs-swagger-ui-tag` -- eliminate the obsolete integration.
- [x] `docs/api/scalar.md` -- add Scalar embed pointed at the live OpenAPI JSON -- provide interactive API exploration.
- [x] `docs/index.md` -- rename Swagger labels and link the Scalar page/live endpoint -- keep discovery accurate.
- [x] `docs/ai-agents/context-guide.md` -- clarify that OpenAPI JSON is the schema source for Scalar/API-aware agents -- preserve machine-readable guidance.

**Acceptance Criteria:**
- Given the application is created, when `/openapi.json` is requested, then the existing OpenAPI document is returned successfully.
- Given the application is created, when `/docs` or `/redoc` is requested, then neither legacy HTML UI is served.
- Given MkDocs is built, when the API reference is rendered, then the Scalar embed points to the live backend `/openapi.json` URL and the build succeeds.
- Given a repository-wide in-scope search is run, when Swagger references are examined, then no Swagger UI/plugin/dependency or stale navigation/link wording remains.
- Given the backend documentation tests run, when the test suite executes, then the new route contract passes without live model or MCP services.

## Delivery Patterns Checklist

**CI** (`.github/workflows/ci.yml`) — which jobs this story affects or extends:
- [ ] Backend: `ruff check` clean and targeted pytest passes; no new CI job needed.
- [ ] Dependency changes: docs dependency list updated; no lockfile is maintained.

**Testing** — how this story's tests honor project rules:
- [ ] LLM/MCP boundaries mocked — no test depends on a live model or live MCP server.
- [ ] Class-based backend tests with existing fixtures and `TestClient`.

## Design Notes

Scalar is a documentation consumer, not an API replacement: FastAPI continues to
generate the schema, and MkDocs hosts the interactive HTML page. Keeping only
`/openapi.json` on the backend avoids two independently configured documentation
surfaces drifting apart.

## Verification

**Commands:**
- `pytest backend/tests/test_api_docs.py` -- expected: all API documentation route tests pass.
- `mkdocs build --strict` -- expected: documentation site builds without warnings/errors.
- `rg -n -i "swagger|swagger-ui|redoc" mkdocs.yml docs docs-requirements.txt backend` -- expected: no obsolete UI/plugin references.

## Suggested Review Order

**API documentation boundary**

- Preserve the OpenAPI schema while removing duplicate backend UI surfaces.
  [`app.py:155`](../../backend/app/api/app.py#L155)

- Allow the published documentation site to fetch the schema cross-origin.
  [`app.py:163`](../../backend/app/api/app.py#L163)

**Scalar documentation surface**

- Embed Scalar in the generated MkDocs page using the live OpenAPI contract.
  [`scalar.md:12`](../../docs/api/scalar.md#L12)

- Replace navigation and llmstxt references with the Scalar page.
  [`mkdocs.yml:79`](../../mkdocs.yml#L79)

**Regression coverage**

- Verify schema availability, legacy route removal, and published-origin CORS.
  [`test_api_docs.py:7`](../../backend/tests/test_api_docs.py#L7)
