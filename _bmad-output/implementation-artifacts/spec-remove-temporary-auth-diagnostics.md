---
title: 'Remove temporary authentication diagnostics'
type: 'chore'
created: '2026-08-26'
status: 'done'
baseline_commit: '51f4402'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/project-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Temporary troubleshooting output added while stabilizing Firebase-authenticated
Playwright setup now adds noisy CI logs and duplicates failure evidence already captured by
Playwright traces, screenshots, and videos.

**Approach:** Remove only the targeted warm-up response, page-error, console-error, URL/body, and
completion-timing diagnostics from the global setup. Preserve all setup behavior, actionable
cleanup warnings, and standard Playwright failure artifacts.

## Boundaries & Constraints

**Always:** Keep Firebase emulator authentication, backend/frontend warm-up requests, warm-up
timeouts, cleanup/reset behavior, and Playwright's configured failure artifacts unchanged. Do not
log tokens, response bodies, or raw authentication errors.

**Ask First:** Any change to warm-up sequencing, test data, emulator configuration, deployment
workflow diagnostics, or Playwright timeout/artifact settings requires a separate decision.

**Never:** Do not remove the warm-up itself, authenticated fixtures, emulator helpers, Firestore
rules tests, token refresh logic, or the enabled-Firestore API deployment guard. Do not broaden
the cleanup into unrelated logging or refactoring.

</frozen-after-approval>

## Code Map

- `frontend/e2e/global-setup.ts` -- Playwright global setup containing temporary diagnostics around
  Firebase sign-in and route warm-up.
- `frontend/playwright.config.ts` -- Existing failure-only trace, screenshot, and video settings
  that remain the supported diagnostic mechanism.

## Tasks & Acceptance

**Execution:**
- [x] `frontend/e2e/global-setup.ts` -- remove temporary auth bootstrap response logging, page
  error/console error listeners, locator-timeout URL/body dumps, and routine completion timing
  output -- reduce CI noise while preserving setup control flow and actionable warnings.

**Acceptance Criteria:**
- Given Playwright global setup runs successfully, when the warm-up completes, then it performs
  the same authentication, backend stream warm-up, frontend route warm-up, cleanup, and reset
  operations without the removed diagnostic output.
- Given a warm-up route fails, when Playwright reports the failure, then configured
  failure-only trace, screenshot, and video artifacts remain available and the original error is
  still thrown.
- Given warm-up idea deletion or post-warm-up reset fails, when setup handles the failure, then
  the existing warning remains visible so test-state contamination is not silently ignored.

## Delivery Patterns Checklist

**CI** (`.github/workflows/ci.yml`) -- this cleanup changes no CI jobs; the existing Playwright
job continues to run the global setup.

**Testing**
- [ ] Playwright specs continue using emulator-backed authenticated fixtures and unique test data.

## Verification

**Commands:**
- `npm run lint --prefix frontend` -- expected: success.
- `npm run test --prefix frontend -- --run` -- expected: success.
- `npm run build --prefix frontend` -- expected: success.
- `git diff --check` -- expected: no whitespace errors.

**Manual checks:**
- Inspect the diff to confirm only temporary diagnostics were removed and the warm-up control flow,
  cleanup warnings, and Playwright failure-artifact configuration remain.

## Suggested Review Order

- Confirm the warm-up flow remains intact while temporary browser diagnostics are removed.
  [`global-setup.ts:122`](../../frontend/e2e/global-setup.ts#L122)

- Verify cleanup and reset warnings remain the only setup warnings after diagnostic cleanup.
  [`global-setup.ts:173`](../../frontend/e2e/global-setup.ts#L173)
