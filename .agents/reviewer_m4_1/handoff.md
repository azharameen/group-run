# Milestone 4 Code Review Report (Handoff Report)

## Review Summary

**Verdict**: **REQUEST_CHANGES**

**Reviewer Identity**: Reviewer M4-1 (reviewer, critic)  
**Target Codebase**: `d:/Projects/POC/ideator/bmad-cc`  
**Target Scope**: Milestone 4 (TUI Loop, Stream Throttling & Interactive Modals)

---

## 1. Observation

Directly observed state of the codebase, files, and command execution:

1. **`src/utils/ansi-cleaner.ts` (lines 4-10)**:
   ```typescript
   export function stripAnsi(str: string): string {
     if (!str) return '';
     return str
       .replace(/\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])/g, '')
       .replace(/[\u001b\u009b]\[[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g, '')
       .replace(/\x1b\][0-9];.*?\x07/g, '');
   }
   ```
   The regex in the first replacement step `/\x1B(?:[@-Z\\-_]|...)/g` matches `\x1B]` (since ASCII character `]` [93] falls in the range `\\-_` [92-95]). This strips the leading `\x1B]` from OSC 8 escape sequences (such as `\u001b]8;;https://bmad.dev\u001b\x07`), separating `\x1B` from `]`. As a result, the third regex `/\x1b\][0-9];.*?\x07/g` fails to match the OSC sequence, leaving raw unstripped URL strings (e.g. `8;;https://bmad.dev`) and trailing control codes (`\u001b\x07`) inside stripped output.

2. **`npx vitest run` output**:
   ```
   FAIL tests/tui/m4-challenger-deep-stress.test.ts > Empirical Challenge M4 — Deep Stress & Edge Case Harness > 2. ANSI Safe Log Slicing & Parsing Stress > strips complex 24-bit RGB, OSC hyperlinks, and multi-code ANSI sequences
   AssertionError: expected '[RGB BOLD] 8;;https://bmad.dev\u001b\…' not to contain '\u001b'
   Expected: ""
   Received: "[RGB BOLD] 8;;https://bmad.devClick Here8;; Status OK"
   
   Test Files  4 failed | 24 passed (28)
   Tests       10 failed | 186 passed (196)
   ```

3. **`npx tsc --noEmit` output**:
   Completed with exit code 0 (zero TypeScript errors).

4. **`npx tsup` output**:
   Completed with exit code 0 (`⚡️ Build success in 16522ms`).

5. **`src/commands/tui.ts` & `src/tui/app.tsx` & `src/tui/modals/query-modal.tsx`**:
   - `onSubagentQuery` in `tui.ts` (lines 252-274) returns a Promise that updates UI state with `activeQuery: query` and `onQueryAnswer` callback.
   - `app.tsx` (lines 227-240, 593-605) detects `activeQuery` and switches `appMode` to `'subagent-query'`, rendering `<QueryModal />`.
   - `QueryModal` uses `useInput` to capture stdin (`y`, `n`, `c` for custom typing mode + Enter key).
   - Answer resolves the Promise, clears `activeQuery`, restores `appMode` to `'workstation'`, and resumes sub-agent execution.

6. **`src/commands/tui.ts` & `src/tui/app.tsx` & `src/tui/modals/escalation-modal.tsx`**:
   - When a story gate decision returns `ESCALATE_TO_HUMAN`, `tui.ts` (lines 324-370) populates `EscalationContextInfo` (`storyKey`, `reason`, `retryCount`, `maxRetries`, `testOutput`) and updates state with `escalationContext`.
   - `app.tsx` renders `<EscalationModal />` offering options 1-5 (1. Retry, 2. Retry with custom instructions, 3. Override and pass, 4. Skip, 5. Abort).
   - Selection maps to `EscalationDecisionResult` (`action` and optional `customPrompt`):
     - `'override-pass'`: marks story completed in queue.
     - `'retry'` / `'retry-with-prompt'`: re-queues story and continues execution loop.
     - `'skip'`: marks story skipped in queue.
     - `'abort'`: pauses execution and breaks out of loop.

7. **Throttling Verification**:
   - `tui.ts` uses `StreamThrottler` (lines 193-205) with 50ms interval to buffer stream updates.
   - `tui.ts` `updateUIState` (lines 127-147) uses a 50ms setTimeout buffer for non-immediate renders.
   - `app.tsx` (lines 265-305) uses `StreamThrottler` (50ms interval) in `logThrottlerRef`.

8. **`src/tui/panels/sub-session-panel.tsx`**:
   - Line 48: `const allStreamLines: string[] = rawLogs.flatMap(line => cleanAndSplitLines(line));`
   - Line 146: `const clean = stripAnsi(log);`
   - Line 148: `const displayLog = clean.length > 38 ? clean.slice(0, 36) + '..' : clean;`
   - ANSI stripping is executed before line splitting and string length/slicing calculations.

9. **Zero Direct File Mutator Invariants**:
   - Programmatic file modifications to `sprint-status.yaml` are deprecated/no-op in `src/sprint/sprint-status-updater.ts`.
   - State checkpoints use `StateManager` (`src/state/state-manager.ts`).
   - File writes in `src/` are restricted to `state-manager.ts` and `file-helpers.ts`.

---

## 2. Logic Chain

1. **Observation 1 & 2** demonstrate that `stripAnsi` in `src/utils/ansi-cleaner.ts` contains a flawed regex sequence. The first pattern `/\x1B(?:[@-Z\\-_]|...)/g` matches `\x1B]`, which dismantles OSC escape sequences before step 3 can parse them (`/\x1b\][0-9];.*?\x07/g`). This leaves unstripped OSC 8 link targets and raw `\u001b` control codes in cleaned output, causing assertion failures in `tests/tui/m4-challenger-deep-stress.test.ts`.
2. **Observation 2** shows that `npx vitest run` across the entire project fails with 4 failed test files out of 28. In addition to the `stripAnsi` regex bug, running all 28 test suites in parallel triggers worker timeouts (`skill-manifest-scanner.test.ts`) and temporary directory removal errors (`ENOTEMPTY` in `story-executor-m3.test.ts`).
3. **Observations 3 & 4** confirm that static type checking (`npx tsc --noEmit`) and bundling (`npx tsup`) succeed with 0 errors.
4. **Observations 5, 6, 7, 8, & 9** confirm that interactive modal wiring (`QueryModal`, `EscalationModal`), stream output throttling (50ms buffer), ANSI stripping order in `sub-session-panel.tsx`, and zero direct file mutator invariants are correctly implemented per specification.
5. **Conclusion**: Because test execution (`npx vitest run`) fails due to a critical bug in `stripAnsi`, the verdict must be **REQUEST_CHANGES**.

---

## 3. Findings

### [Critical] Finding 1: ANSI Stripper Regex Bug Breaks OSC Escape Code Stripping (`stripAnsi`)

- **What**: `stripAnsi` fails to strip OSC 8 hyperlink sequences (and potentially other OSC control codes), leaving raw ANSI control characters (`\u001b`) and unstripped hyperlink parameters (`8;;https://...`) in cleaned strings.
- **Where**: `src/utils/ansi-cleaner.ts`, lines 4–10.
- **Why**: The first regex `/\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])/g` includes `]` inside `\\-_` (since ASCII 93 `]` is in `\\-_`). It matches `\x1B]` and strips `\x1B]`, separating `\x1B` from `]`. Subsequent regexes expecting `\x1b\]` fail to match, corrupting the text output.
- **Suggestion**: Replace `stripAnsi` regexes with a robust, standard ANSI stripping regular expression, such as:
  ```typescript
  const ansiRegex = /[\u001b\u009b](?:[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]|\][0-9;]*;.*?(?:\x07|\x1b\\))/g;
  ```
  Or use a well-tested package like `strip-ansi` / `ansi-regex` or adjust regex order so OSC sequences (`\x1b]...(?:\x07|\x1b\\)`) are stripped BEFORE single-character sequence matching.

### [Major] Finding 2: Full Test Suite Execution (`npx vitest run`) Fails

- **What**: Running `npx vitest run` produces 4 failed test files (10 failed tests out of 196).
- **Where**: Test runner execution across `tests/tui/m4-challenger-deep-stress.test.ts`, `tests/supervisor/skill-manifest-scanner.test.ts`, `tests/state/state-manager.test.ts`, `tests/session/story-executor-m3.test.ts`.
- **Why**: 
  1. `m4-challenger-deep-stress.test.ts` fails due to Finding 1 (OSC ANSI stripping bug).
  2. Heavy concurrent directory scanning (`skill-manifest-scanner`) and temporary state dir cleanups (`story-executor-m3`) encounter 5000ms timeouts and Windows directory lock errors (`ENOTEMPTY`) when running concurrently in a single unisolated worker pool.
- **Suggestion**: Fix Finding 1 in `ansi-cleaner.ts`, and configure Vitest pool/timeout settings or add file cleanup retry logic in test hooks so `npx vitest run` passes cleanly end-to-end.

---

## 4. Verified Claims

| Claim / Component | Status | Verification Method |
|---|---|---|
| `QueryModal` interactive prompt wiring (`onSubagentQuery`, stdin capture, answer return, resume execution) | **PASS** | Source code inspection of `tui.ts`, `app.tsx`, `query-modal.tsx` + `npx vitest run tests/tui/m4-interactive-modals.test.ts` |
| `EscalationModal` interactive choice wiring (`ESCALATE_TO_HUMAN`, choices 1-5, execution of retry/skip/abort/override) | **PASS** | Source code inspection of `tui.ts`, `app.tsx`, `escalation-modal.tsx` + `npx vitest run tests/tui/m4-interactive-modals.test.ts` |
| Stream output rerender throttling (50ms buffer window) | **PASS** | Source code inspection of `StreamThrottler` in `tui.ts` & `app.tsx` + `npx vitest run tests/tui/stream-throttling.test.ts` |
| ANSI stripping prior to line slicing in `sub-session-panel.tsx` | **PASS** | Source code inspection of `sub-session-panel.tsx` lines 48 & 146-148 |
| TypeScript Compilation (`npx tsc --noEmit`) | **PASS** | `npx tsc --noEmit` returned exit code 0 |
| TSUP Bundling (`npx tsup`) | **PASS** | `npx tsup` returned exit code 0 |
| Zero Direct File Mutator Invariants | **PASS** | Source inspection of `sprint-status-updater.ts`, `state-manager.ts` |
| Full Test Suite (`npx vitest run`) | **FAIL** | Executed `npx vitest run`; 4 failed test files |

---

## 5. Coverage Gaps

- **Unexplored Area**: High-frequency simultaneous key press handling during high-speed stream output in Ink TUI.
  - **Risk Level**: Low.
  - **Recommendation**: Accept risk; unit tests cover rapid stream batching and modal input separately.

---

## 6. Unverified Items

- None. All review items and task requirements were inspected and tested.

---

## 7. Caveats

- Individual test files (`m4-interactive-modals.test.ts`, `m4-continuous-supervisor-loop.test.ts`, `stream-throttling.test.ts`, `state-manager.test.ts`, `skill-manifest-scanner.test.ts`, `story-executor-m3.test.ts`) pass when executed in isolation. However, the full `npx vitest run` suite fails due to Finding 1 (the ANSI stripping bug in `stripAnsi`) and test runner concurrency contention.

---

## 8. Conclusion

Milestone 4 implementation in `bmad-cc` demonstrates excellent structural compliance, clean modal wiring (`QueryModal`, `EscalationModal`), accurate 50ms stream output throttling, and strict adherence to zero direct file mutator invariants.

However, because `src/utils/ansi-cleaner.ts` contains a regex bug that breaks OSC ANSI escape code stripping and causes `npx vitest run` to fail, the final verdict is **REQUEST_CHANGES**.

---

## 9. Verification Method

To independently verify this review:

1. **Verify static build & typecheck**:
   ```bash
   cd d:/Projects/POC/ideator/bmad-cc
   npx tsc --noEmit
   npx tsup
   ```
2. **Verify test suite failure (Finding 1 & 2)**:
   ```bash
   cd d:/Projects/POC/ideator/bmad-cc
   npx vitest run
   ```
   Observe the failure in `tests/tui/m4-challenger-deep-stress.test.ts` (ANSI stripping assertion error).

3. **Verify ANSI regex bug in `src/utils/ansi-cleaner.ts`**:
   Inspect lines 4-10 in `src/utils/ansi-cleaner.ts`. Test `stripAnsi('\u001b]8;;https://bmad.dev\u001b\x07Click Here\u001b]8;;\u001b\x07')` in Node REPL; observe that raw `8;;https://bmad.dev` and `\u001b` remain in the output string.

4. **Verify modal wiring & throttling**:
   Inspect `src/commands/tui.ts` (lines 127-147, 193-205, 252-274, 324-370) and `src/tui/app.tsx` (lines 186-224, 265-305, 579-605).
