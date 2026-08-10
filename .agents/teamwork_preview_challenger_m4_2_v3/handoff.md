# Milestone 4 Empirical Challenge & Stress Test Report

**Verdict**: **FAIL**

---

## 1. Observation

### 1.1 Build & Test Verification Commands
- **Command**: `npx tsc --noEmit`
  - **Result**: PASSED (0 errors).
- **Command**: `npx vitest run`
  - **Result**: FAILED with exit code 1.
  - **Summary**: 4 test files failed | 24 passed (total 28 files). 6 tests failed | 190 passed (total 196 tests).
  - **Verbatim Error 1** (`tests/tui/m4-challenger-deep-stress.test.ts:112`):
    ```
    FAIL tests/tui/m4-challenger-deep-stress.test.ts > Empirical Challenge M4 — Deep Stress & Edge Case Harness > 2. ANSI Safe Log Slicing & Parsing Stress > strips complex 24-bit RGB, OSC hyperlinks, and multi-code ANSI sequences
    AssertionError: expected '[RGB BOLD] 8;;https://bmad.dev\u001b\…' not to contain '\u001b'
    Expected: ""
    Received: "[RGB BOLD] 8;;https://bmad.devClick Here8;; Status OK"
    ```
  - **Verbatim Errors 2-4** (`tests/state/state-manager.test.ts`):
    ```
    FAIL tests/state/state-manager.test.ts > StateManager > save and load state round-trip
    FAIL tests/state/state-manager.test.ts > StateManager > markStoryCompleted adds to completedStories
    FAIL tests/state/state-manager.test.ts > StateManager > markStorySkipped adds to skippedStories
    Error: Test timed out in 5000ms.
    ```
  - **Verbatim Error 5** (`tests/supervisor/skill-router.test.ts`):
    ```
    FAIL tests/supervisor/skill-router.test.ts > skill-router > routeSkillsForStoryAsync dynamically loads manifests and bmad-help catalog from disk
    Error: Test timed out in 5000ms.
    ```
  - **Verbatim Error 6** (`tests/session/story-executor-m3.test.ts`):
    ```
    FAIL tests/session/story-executor-m3.test.ts > StoryExecutor Milestone 3 Integrations (Heartbeat & AbortController & Query Parser) > supports active AbortController cancellation mid-execution
    Error: Test timed out in 5000ms.
    ```
- **Command**: `npx tsup`
  - **Result**: FAILED with exit code 1.
  - **Verbatim Error**:
    ```
    CLI Building entry: {"bmad-cc":"bin/bmad-cc.ts","bin/bmad-cc":"bin/bmad-cc.ts","commands/tui":"src/commands/tui.ts",...}
    CLI Using tsconfig: tsconfig.json
    CLI tsup v8.5.1
    CLI Using tsup config: D:\Projects\POC\ideator\bmad-cc\tsup.config.ts
    CLI Target: node20
    Error: ENOENT: no such file or directory, unlink 'D:\Projects\POC\ideator\bmad-cc\dist\chunk-FNJXAOZV.js'
    ```

### 1.2 ANSI Cleaning & Log Stream Stress Code Inspection
- **File**: `d:/Projects/POC/ideator/bmad-cc/src/utils/ansi-cleaner.ts`, Lines 4-10:
  ```ts
  export function stripAnsi(str: string): string {
    if (!str) return '';
    return str
      .replace(/\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])/g, '')
      .replace(/[\u001b\u009b]\[[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g, '')
      .replace(/\x1b\][0-9];.*?\x07/g, '');
  }
  ```
  - **Observation**: `replace(/\x1b\][0-9];.*?\x07/g, '')` matches `\x1b]` followed by a single digit and single semicolon (OSC 0 title set), but fails to match OSC 8 hyperlinks (`\x1b]8;;url\x07` or `\x1b]8;;url\x1b\\`), leaving `\u001b` control characters and uncleaned URL artifacts in stripped strings.

### 1.3 Modal Overlay Key Handling Code Inspection
- **File**: `d:/Projects/POC/ideator/bmad-cc/src/tui/app.tsx`, Lines 411-541:
  ```ts
  useInput((input, key) => {
    if (appMode === 'git-diff') { ... return; }
    if (appMode === 'log-inspector') { ... return; }
    if (appMode === 'help') { ... return; }
    if (appMode === 'filter') { return; }

    // Global hotkeys (workstation mode)
    if (key.ctrl && input === 'c') { exit(); return; }
    if (key.escape) { ... exit(); return; }
    if (input === '?') { setAppMode('help'); return; }
    if (input === 'g' && focusedPane !== 'console') { setAppMode('git-diff'); return; }
    if (input === 'f' && focusedPane !== 'console') { setAppMode('filter'); return; }
    ...
  });
  ```
  - **Observation**: When `appMode === 'escalation'` or `appMode === 'subagent-query'`, `useInput` in `App` does NOT return early. Global key handlers (`?`, `g`, `f`, `Escape`, `Tab`, `r`, `p`, `d`) remain active while `EscalationModal` or `QueryModal` is open.

---

## 2. Logic Chain

1. **Build Failure Logic**:
   - Observation 1.1 shows `npx tsup` crashing with `Error: ENOENT: no such file or directory, unlink '...dist/chunk-FNJXAOZV.js'`.
   - Inspection of `tsup.config.ts` shows lines 5-6 configure two distinct entry keys (`'bmad-cc'` and `'bin/bmad-cc'`) that map to the exact same source path `bin/bmad-cc.ts`.
   - When `tsup` executes with `clean: true`, concurrent bundle targets attempt to clean and overwrite the same chunk file, resulting in a filesystem race condition and build crash. Therefore, `npx tsup` fails.

2. **Test Suite Failure Logic**:
   - Observation 1.1 shows `npx vitest run` failing with 6 test failures across 4 files.
   - `stripAnsi` in `src/utils/ansi-cleaner.ts` fails to strip OSC 8 hyperlink sequences due to restrictive regex matching (Observation 1.2).
   - Async state & executor tests (`StateManager`, `skill-router`, `story-executor-m3`) time out after 5000ms due to unresolved disk/timer operations. Therefore, `npx vitest run` fails.

3. **Modal Overlay Key Handling Failure Logic**:
   - Observation 1.3 demonstrates that `App`'s top-level `useInput` hook lacks early-return conditions for `appMode === 'escalation'` and `appMode === 'subagent-query'`.
   - When `EscalationModal` or `QueryModal` is displayed over the TUI workstation, keypresses pass to both the modal overlay component and `App`'s global key listener simultaneously.
   - If a user presses `?`, `g`, or `f` while interacting with an escalation prompt, `App` switches `appMode` to `'help'`, `'git-diff'`, or `'filter'`, obscuring the active modal without resolving the underlying escalation.
   - If a user presses `Escape` while an escalation is active and execution is not running, `App` calls `exit()`, killing the CLI application. Therefore, modal overlay key handling fails isolation criteria.

---

## 3. Caveats

- `npx tsc --noEmit` passed with 0 errors. TypeScript type definitions and syntax across the codebase are valid.
- Stdin pause/resume logic (`onPause` / `onRun` callbacks, `isRunning` state toggle, and `AbortController.abort()` propagation) works as designed when triggered via workstation directives (`run`, `pause`) or `r`/`p` keys when no modal is overlaying.

---

## 4. Conclusion

Milestone 4 **FAILS** verification criteria. 

### Summary of Defects:
1. **Build Failure (`npx tsup`)**: Duplicate entry targets in `tsup.config.ts` cause file unlinking race condition crash.
2. **Test Suite Failure (`npx vitest run`)**: 6 failing tests due to ANSI cleaning regex defects and async test timeouts.
3. **ANSI Cleaning Defect (`stripAnsi`)**: Inability to strip terminal OSC 8 hyperlink sequences allows raw `\u001b` control codes to pollute logs and terminal UI render buffers.
4. **Modal Overlay Key Leakage (`App.tsx`)**: Lack of mode isolation in top-level `useInput` allows global shortcuts (`?`, `g`, `f`, `Escape`) to interrupt interactive escalation and sub-agent query modals.

---

## 5. Verification Method

To independently verify these findings:

1. **Verify Build Failure**:
   ```bash
   cd d:/Projects/POC/ideator/bmad-cc
   npx tsup
   ```
   *Expected result*: Exit code 1 with `ENOENT: no such file or directory, unlink`.

2. **Verify Vitest Test Suite Failures**:
   ```bash
   cd d:/Projects/POC/ideator/bmad-cc
   npx vitest run
   ```
   *Expected result*: 6 failing tests (including `m4-challenger-deep-stress.test.ts` ANSI cleaning failure and timeouts in `state-manager.test.ts`, `skill-router.test.ts`, and `story-executor-m3.test.ts`).

3. **Verify Modal Key Handling Bug**:
   - Inspect `d:/Projects/POC/ideator/bmad-cc/src/tui/app.tsx` lines 411-440. Note absence of `if (appMode === 'escalation' || appMode === 'subagent-query') return;`.
