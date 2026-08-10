## 2026-08-10T14:07:04Z
You are Worker M4 Remediation fixing an ANSI cleaner defect in `bmad-cc`.

Working directory for your metadata/handoffs: `d:/Projects/POC/ideator/.agents/worker_m4_remediation/`
Target codebase directory: `d:/Projects/POC/ideator/bmad-cc`

### Task
In `src/utils/ansi-cleaner.ts`:
Update the `stripAnsi` function to strip ALL Operating System Command (OSC) escape sequences (including OSC 8 hyperlinks like `\u001b]8;;url\u001b\\` or `\x1b]8;;url\x07`) as well as standard ANSI color/cursor SGR sequences.

Specifically:
Ensure `stripAnsi` handles string terminators `\x1b\\` and bell `\x07` for two-digit OSC codes (like `OSC 8`), e.g., regex `/\u001B\][0-9]*;.*?(?:\u0007|\u001B\\)/g` or similar comprehensive ANSI/OSC regex patterns.

### Verification
Run the following in `d:/Projects/POC/ideator/bmad-cc`:
1. `npx vitest run` (Must pass 100% clean across all 28 test files, including `tests/tui/m4-challenger-deep-stress.test.ts` with 0 failures).
2. `npx tsc --noEmit` (Must complete with 0 compilation errors).
3. `npx tsup` (Must build clean ESM artifacts in `dist/`).

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A Forensic Auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

When finished, write `d:/Projects/POC/ideator/.agents/worker_m4_remediation/handoff.md` with:
- Summary of code changes in `src/utils/ansi-cleaner.ts`
- Exact results of `npx vitest run`, `npx tsc --noEmit`, and `npx tsup`
Send a message back to the orchestrator when complete.
