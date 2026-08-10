# Handoff Report — Milestone 4 (TUI Loop & Modals) Code Review

## Observation

### 1. Verification Commands & Execution Results
- **`npx vitest run`**:
  - **Result**: FAILED (Exit Code 1)
  - **Summary**: 27 test files passed, 1 test file failed (195 tests passed, 1 test failed out of 196).
  - **Verbatim Error Output**:
    ```
    FAIL  tests/tui/m4-challenger-deep-stress.test.ts > Empirical Challenge M4 — Deep Stress & Edge Case Harness > 2. ANSI Safe Log Slicing & Parsing Stress > strips complex 24-bit RGB, OSC hyperlinks, and multi-code ANSI sequences
    AssertionError: expected '[RGB BOLD] 8;;https://bmad.dev\u001b\…' not to contain '\u001b'

    Expected: ""
    Received: "[RGB BOLD] 8;;https://bmad.devClick Here8;; Status OK"

     ❯ tests/tui/m4-challenger-deep-stress.test.ts:112:27
        110|       const cleaned = stripAnsi(complexAnsi);
        111| 
        112|       expect(cleaned).not.toContain('\u001b');
           |                           ^
        113|       expect(cleaned).not.toContain('\x07');
        114|       expect(cleaned).toBe('[RGB BOLD] Click Here Status OK');
    ```
- **`npx tsc --noEmit`**:
  - **Result**: PASSED (Exit Code 0, zero type errors).
- **`npx tsup`**:
  - **Result**: PASSED (Exit Code 0, `ESM ⚡️ Build success in 15308ms`).

### 2. Implementation Code Inspection
- **ANSI Cleaning Logic (`src/utils/ansi-cleaner.ts`)**:
  ```ts
  4: export function stripAnsi(str: string): string {
  5:   if (!str) return '';
  6:   return str
  7:     .replace(/\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])/g, '')
  8:     .replace(/[\u001b\u009b]\[[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g, '')
  9:     .replace(/\x1b\][0-9];.*?\x07/g, '');
  10: }
  ```
  Line 9 uses `/\x1b\][0-9];.*?\x07/g`, which requires a single semicolon immediately following the OSC digit. OSC 8 hyperlink sequences use `\x1b]8;;url\x07` (with two semicolons or parameters), causing the regex to fail matching and leave raw escape code `\x1b` in the string.

- **Query & Escalation Modals (`src/tui/modals/query-modal.tsx` & `src/tui/modals/escalation-modal.tsx`)**:
  - `QueryModal`: Correctly handles quick response options (`y`/`n`/Enter) and custom typing mode (`c`). Reactive state promises are resolved properly in `storyExecutor.execute`'s `onSubagentQuery` handler in `src/commands/tui.ts`.
  - `EscalationModal`: Correctly handles action selection (Up/Down arrows, numbers 1–5) and custom instructions prompt for action 2 (`retry-with-prompt`). Integrates properly with `onEscalation` and human escalation decision handling in `src/commands/tui.ts`.
  - *Minor UX Caveat*: Neither modal handles the `Escape` key while in active text-entry mode (`isTyping` or `isPrompting`) to cancel back to option selection.

- **Stream Output Throttling (`src/utils/stream-throttler.ts` & `src/tui/agent-output-stream.ts`)**:
  - `StreamThrottler` buffers incoming logs over a 50ms window before flushing to UI.
  - `AgentOutputStream` maintains a line-capped rolling output buffer (default 20 lines) and strips ANSI sequences on append.

- **Direct File Mutator Inspection (`src/supervisor/*` & `src/tui/*`)**:
  - Searched all Supervisor and TUI modules for `fs.writeFileSync`, `fs.promises.writeFile`, `fs.mkdir`, `fs.unlink`, `fs.rm`, `fs.appendFile`, etc.
  - **Result**: Zero direct file mutators found in Supervisor or TUI components. All filesystem calls are strictly read-only (`readFile`, `readdir`, `access`).

- **Integrity Violation Check**:
  - Verified no hardcoded test outputs, facade/dummy implementations, or self-certifying workarounds exist in `src/commands/tui.ts`, `src/tui/app.tsx`, or TUI components.

---

## Logic Chain

1. **Observations → ANSI Cleaning Failure**:
   - `stripAnsi` in `src/utils/ansi-cleaner.ts` uses regex `/\x1b\][0-9];.*?\x07/g` for Operating System Command (OSC) escape sequences.
   - OSC 8 hyperlinks have the format `\x1b]8;;<URL>\x07`.
   - `[0-9];` matches `8;` but does NOT match the second semicolon `;`.
   - Therefore, `stripAnsi` fails to strip OSC 8 escape sequences, leaving `\u001b` in strings.
   - This directly breaks `tests/tui/m4-challenger-deep-stress.test.ts`, causing `npx vitest run` to fail.

2. **Observations → Modals Input & Reactive State**:
   - Both `QueryModal` and `EscalationModal` receive props (`rawPrompt`, `onAnswer`, `context`, `onDecision`) and invoke callbacks on user interaction.
   - `src/commands/tui.ts` constructs Promises around `updateUIState` that resolve when the user submits modal answers, unblocking `storyExecutor.execute`.
   - State reactive flow is sound and leak-free.

3. **Observations → Zero File Mutators**:
   - `src/supervisor` components only parse catalogs, scan manifests, and route skills via read-only file reads.
   - `src/tui` components read story specs (`fs.readFile`) and render React Ink UI.
   - All state modifications are delegated to `StateManager`, `SessionLogger`, and `ExecutionQueue`.

---

## Caveats

- **Terminal Environment Dependency**: ANSI escape cleaning behavior was tested with standard 24-bit RGB and OSC 8 sequences. Exotic non-standard ANSI sequences beyond common xterm/VT100 standards were not evaluated.
- **Escape Key Handling in Modals**: While functional, modal text entry modes (`isTyping` / `isPrompting`) do not currently trap `Escape` to revert to menu selection. This does not break execution but is a minor UX usability caveat.

---

## Conclusion & Verdict

**Verdict**: **REQUEST_CHANGES**

### Findings

#### [Major] Finding 1: ANSI Cleaning Failure on OSC 8 Hyperlink Escape Sequences
- **Location**: `src/utils/ansi-cleaner.ts` (Line 9)
- **Problem**: `stripAnsi` uses regex `/\x1b\][0-9];.*?\x07/g` which fails to match OSC 8 hyperlink escape sequences containing multiple semicolons (e.g., `\x1b]8;;https://... \x07`). This leaves raw escape code `\x1b` in strings, causing test failure in `tests/tui/m4-challenger-deep-stress.test.ts`.
- **Suggested Fix**: Update line 9 in `src/utils/ansi-cleaner.ts` to support OSC escape sequences with multiple parameters/semicolons:
  ```ts
  .replace(/\x1b\][0-9]+;.*?\x07/g, '')
  // or a general OSC stripper:
  .replace(/\x1b\][^\x07]*\x07/g, '')
  ```

#### [Minor] Finding 2: Missing Escape Key Cancel in Modal Text Input Modes
- **Location**: `src/tui/modals/query-modal.tsx` (Line 15) and `src/tui/modals/escalation-modal.tsx` (Line 40)
- **Problem**: When user switches to text typing mode (`isTyping` in `QueryModal` or `isPrompting` in `EscalationModal`), pressing `Escape` does not return to option menu selection mode.
- **Suggested Fix**: Add `if (key.escape) { setIsTyping(false); return; }` and `if (key.escape) { setIsPrompting(false); return; }` to the respective `useInput` hooks.

---

## Verified Claims

| Claim | Verification Method | Result |
|---|---|---|
| Zero direct file mutators in Supervisor / TUI | Grep for `fs.writeFile`, `mkdir`, `unlink`, etc. in `src/supervisor` and `src/tui` | PASS |
| `npx tsc --noEmit` clean compilation | Executed `npx tsc --noEmit` | PASS |
| `npx tsup` build success | Executed `npx tsup` | PASS |
| `npx vitest run` test suite | Executed `npx vitest run` | FAIL (1 failed test in ANSI cleaner stress) |
| Throttling & Output stream log slicing | Inspected `StreamThrottler` (50ms buffer) and `AgentOutputStream` (20 line max) | PASS |
| QueryModal & EscalationModal reactive wiring | Trace `onSubagentQuery` & `onEscalation` Promise handlers in `src/commands/tui.ts` | PASS |

---

## Verification Method

To independently verify these findings:
1. Run `npx vitest run` in `d:/Projects/POC/ideator/bmad-cc`.
   - Observe failure in `tests/tui/m4-challenger-deep-stress.test.ts`.
2. Inspect `src/utils/ansi-cleaner.ts` line 9 and compare against `complexAnsi` input string in `tests/tui/m4-challenger-deep-stress.test.ts:110`.
3. Run `npx tsc --noEmit` and `npx tsup` in `d:/Projects/POC/ideator/bmad-cc` to verify clean build.
