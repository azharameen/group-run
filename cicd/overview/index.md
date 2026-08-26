# CI/CD Overview

All automation runs on **GitHub Actions**. There are 6 active workflows, 1 reusable workflow, and 1 security scanner.

## Workflow Map

| Workflow              | File                          | Trigger                                     | Purpose                                              |
| --------------------- | ----------------------------- | ------------------------------------------- | ---------------------------------------------------- |
| CI Pipeline           | `ci.yml`                      | Push / PR to any branch                     | Lint, test, build, E2E                               |
| Release - Beta        | `release-beta.yml`            | Push to `develop`                           | Deploy to Cloud Run + Firebase                       |
| Release - Preview     | `release-preview.yml`         | PR targeting `main`                         | Preview deploy for review                            |
| Release - Production  | `release-prod.yml`            | PR merged into `main`                       | `release-please` tag + changelog                     |
| Heartbeat             | `heartbeat.yml`               | Scheduled (weekdays 02:00 PKT) + manual     | Nightly E2E smoke test + full dependency audit sweep |
| DB Migrate (reusable) | `db-migrate.yml`              | Called by `release-beta`/`release-prod`     | Alembic migration gate before deploy                 |
| Deploy Docs           | `docs.yml`                    | Push to `develop`/`main` touching `docs/**` | Build & publish this MkDocs site to GitHub Pages     |
| CodeQL                | GitHub default (Security tab) | Push to `develop`/`main`                    | Security vulnerability scan                          |

## CI Pipeline Jobs

```
graph TD
    A[Detect Changes] --> B[Backend Lint]
    A --> C[Backend Tests]
    A --> D[Frontend Lint]
    A --> E[Frontend Tests]
    A --> F[Frontend Build]
    B & C & D & E & F --> G[E2E Tests - Playwright]
    A --> H[Security Audit]
    A --> I[Commit Lint]
```

## Cost Optimizations

- **Concurrency groups** cancel obsolete in-flight runs on new commits
- **Path filtering** skips backend jobs if only frontend changed (and vice versa)
- **`paths-ignore`** on `release-beta.yml` skips deployment for doc-only commits
- **pip caching** via `setup-python` built-in cache — saves ~20s per Python job
- **Playwright binary caching** — saves ~40s per E2E run after first cache hit

## Required Secrets

| Secret           | Used By                                           | Purpose                                                   |
| ---------------- | ------------------------------------------------- | --------------------------------------------------------- |
| `GCP_SA_KEY`     | `release-beta`, `release-preview`, `release-prod` | GCP service account JSON for Cloud Run + Firebase deploys |
| `GCP_PROJECT_ID` | `release-beta`, `release-preview`                 | Target GCP project for Firebase Hosting                   |
| `GCP_REGION`     | `release-beta`, `release-preview`                 | Cloud Run region (e.g. `asia-south1`)                     |
| `GITHUB_TOKEN`   | All workflows                                     | Auto-provided by GitHub Actions                           |
