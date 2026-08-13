# Story C0.1: GitHub Branch Protection Setup

Status: ready-for-dev

## Story

As a **Companion project maintainer**,
I want **`main` and `develop` branches protected with PR requirements**,
so that **no code can be merged without proper review and validation**.

## Acceptance Criteria

1. `main` branch has PR required (no direct pushes)
2. `main` branch requires all `ci.yml` jobs to pass
3. `main` branch requires approval from 1 reviewer
4. `main` branch includes admins in protection rules
5. `main` branch dismisses stale approvals on push
6. `develop` branch has PR required (no direct pushes)
7. `develop` branch requires all `ci.yml` jobs to pass
8. `develop` branch skips approvals (speed over review)
9. `develop` branch dismisses stale approvals on push
10. Direct pushes to `main` or `develop` are rejected

## Tasks / Subtasks

- [x] Configure `main` branch protection (AC: 1-5)
  - [x] Enable PR requirement
  - [x] Set required status checks for `ci.yml` jobs
  - [x] Require 1 reviewer approval
  - [x] Include admins in protection
  - [x] Enable stale approval dismissal
- [x] Configure `develop` branch protection (AC: 6-9)
  - [x] Enable PR requirement
  - [x] Set required status checks for `ci.yml` jobs
  - [x] Skip approval requirement
  - [x] Enable stale approval dismissal
- [x] Validate branch protection (AC: 10)
  - [x] Test direct push to `main` fails
  - [x] Test direct push to `develop` fails
  - [x] Test PR merge works correctly

## Dev Notes

### Branch Protection Rules

**`main` branch:**
- PR required: Yes
- Status checks: All `ci.yml` jobs
- Required approvals: 1
- Include admins: Yes
- Dismiss stale approvals: Yes

**`develop` branch:**
- PR required: Yes
- Status checks: All `ci.yml` jobs
- Required approvals: 0 (skip for speed)
- Include admins: Yes
- Dismiss stale approvals: Yes

### Implementation Approach

Use GitHub CLI to configure branch protection:

```bash
# For main branch
gh api repos/azharameen/group-run/branches/main/protection \
  --method PUT \
  --field required_status_checks='{"strict":true,"contexts":["ci.yml"]}' \
  --field enforce_admins='{"enabled":true}' \
  --field required_pull_request_reviews='{"required_approving_review_count":1,"dismiss_stale_reviews":true}' \
  --field restrictions=null

# For develop branch
gh api repos/azharameen/group-run/branches/develop/protection \
  --method PUT \
  --field required_status_checks='{"strict":true,"contexts":["ci.yml"]}' \
  --field enforce_admins='{"enabled":true}' \
  --field required_pull_request_reviews='{"required_approving_review_count":0,"dismiss_stale_reviews":true}' \
  --field restrictions=null
```

### Verification Steps

1. Verify settings via GitHub UI
2. Test push to protected branches
3. Document configuration for team reference

### References

- [Source: _bmad-output/planning-artifacts/commander-epics.md#Epic-EP-C0]
- [Source: _bmad-output/planning-artifacts/architecture/command-center-orchestrator/ARCHITECTURE-SPINE.md]

## Dev Agent Record

### Agent Model Used

- qwen-3.6-27b (model ID: qwen-3.6-27b)

### Debug Log References

- GitHub API calls for branch protection configuration
- Verified via `gh api` commands

### Completion Notes List

- ✅ Configured `main` branch protection:
  - PR required (no direct pushes)
  - Status checks: All 5 CI jobs (Backend Lint, Backend Tests, Frontend Lint, Frontend Tests, Frontend Build)
  - Required approvals: 1
  - Admin enforcement: Enabled
  - Stale review dismissal: Enabled
- ✅ Configured `develop` branch protection:
  - PR required (no direct pushes)
  - Status checks: All 5 CI jobs (same as main)
  - Required approvals: 0 (speed over review)
  - Admin enforcement: Enabled
  - Stale review dismissal: Enabled
- ✅ Verified both branches via GitHub API

### File List

- `.github/workflows/ci.yml` - Referenced for status check contexts
- `_bmad-output/implementation-artifacts/commander-sprint-status.yaml` - Updated status

### Change Log

- 2026-08-13: Configured `main` and `develop` branch protection rules via GitHub API
