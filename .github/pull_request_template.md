## What changed
<!-- 1-3 lines: what and why -->

## Link issues
<!-- REQUIRED for fix PRs — this is how defects get into the release notes -->
Closes #

## Merge policy (non-negotiable)

| From | To | Method |
|---|---|---|
| feature / fix / docs / test / chore branch | `develop` | **Squash** — title MUST be a conventional commit (`feat:`, `fix:`, `docs:`, …) |
| `develop` | `main` | **Merge commit** — never squash, never rebase (squash erases the changelog) |
| `hotfix` (cut from `main`) | `main` | **Squash** with a `fix:` title, then back-merge to `develop` as a merge commit |

## Checklist
- [ ] Title is a conventional commit (release tooling reads it)
- [ ] `Closes #N` present for fix PRs
- [ ] CI green
