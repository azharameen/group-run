## 2026-08-10T04:00:29Z
You are Worker M3 Rem-3 fixing a test race condition / teardown issue in `bmad-cc`.

Working directory for your metadata/handoffs: `d:/Projects/POC/ideator/.agents/worker_m3_rem_3/`
Target codebase directory: `d:/Projects/POC/ideator/bmad-cc`

### Task
In `tests/state/state-manager.test.ts`:
Fix the test setup and teardown issue where shared path `tests/.tmp/bmad-cc-state-test` is cleaned up in `afterEach` while tests run, causing `ENOENT` directory missing errors and `undefined` state assertion failures during full suite execution (`npx vitest run`).

Ensure:
1. Each test uses a unique per-test directory (e.g. using `crypto.randomUUID()` or timestamped test folder name) or `beforeEach` properly recreates the directory with `fs.mkdir(testDir, { recursive: true })` and `afterAll` performs final cleanup.
2. Run `npx vitest run` in `d:/Projects/POC/ideator/bmad-cc` and verify 100% pass rate across ALL 21 test files (0 failed tests).
3. Run `npx tsc --noEmit` (0 errors).
4. Run `npx tsup` (Clean ESM build).

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A Forensic Auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

When finished, write `d:/Projects/POC/ideator/.agents/worker_m3_rem_3/handoff.md` with:
- Summary of changes made to `tests/state/state-manager.test.ts`
- Verification evidence (`npx vitest run` output showing 100% pass rate, `npx tsc --noEmit`, `npx tsup`)
Send a message back to the orchestrator when complete.
