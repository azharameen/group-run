# Contributing to Group Run

Thank you for contributing! This guide covers branching strategy, commit conventions, and the PR process.

## Branching Strategy

```text
main          ← Production releases only (release-please tags)
  └── develop ← Integration branch (beta deployments trigger here)
        ├── feature/your-feature-name
        ├── fix/bug-description
        ├── docs/what-you-documented
        └── chore/housekeeping-task
```

**Rule**: Never push directly to `main` or `develop`. Always open a PR.

## Commit Message Convention

We use [Conventional Commits](https://www.conventionalcommits.org/). The CI `commit-lint` job enforces this.

```text
type(scope): short description

Optional longer body.
```

| Type       | When to use                                |
| ---------- | ------------------------------------------ |
| `feat`     | New feature or capability                  |
| `fix`      | Bug fix                                    |
| `chore`    | Maintenance, dependency updates            |
| `docs`     | Documentation only changes                 |
| `refactor` | Code restructuring without behavior change |
| `perf`     | Performance improvement                    |
| `test`     | Adding or fixing tests                     |
| `ci`       | CI/CD pipeline changes                     |

**Examples**:

```text
feat(agents): add memory persistence to supervisor graph
fix(docker): bind uvicorn to ${PORT} for Cloud Run compatibility
docs(api): update Swagger page with authentication notes
ci(workflows): add Playwright browser binary caching
```

## Pull Request Checklist

Before opening a PR, verify:

- Branch is up to date with `develop` (`git pull origin develop`)
- All CI checks pass locally (`pytest`, `ruff check`, `npm run build`)
- Commit messages follow Conventional Commits format
- New features have tests
- Relevant documentation in `docs/` is updated
- No secrets, credentials, or API keys committed

## Running Tests Locally

```bash
# Backend
cd backend && pytest -v --tb=short

# Frontend
cd frontend && npm run test

# Lint
ruff check backend/app
npx eslint frontend/src

# E2E (requires backend running)
cd frontend && npx playwright test --project=dev
```
