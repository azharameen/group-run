import { execa } from 'execa';

export interface TestRunResult {
  command: string;
  exitCode: number;
  stdout: string;
  stderr: string;
  passed: boolean;
  durationMs: number;
}

export async function runTestCommands(
  commands: string[],
  workingDirectory: string
): Promise<TestRunResult[]> {
  const results: TestRunResult[] = [];

  for (const command of commands) {
    const startTime = Date.now();
    try {
      const { exitCode, stdout, stderr } = await execa(command, {
        shell: true,
        cwd: workingDirectory,
        reject: false,
      });

      const passed = exitCode === 0;
      results.push({
        command,
        exitCode: typeof exitCode === 'number' ? exitCode : 1,
        stdout,
        stderr,
        passed,
        durationMs: Date.now() - startTime,
      });
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      results.push({
        command,
        exitCode: 1,
        stdout: '',
        stderr: errorMsg,
        passed: false,
        durationMs: Date.now() - startTime,
      });
    }
  }

  return results;
}

export function summarizeTestResults(results: TestRunResult[]): {
  allPassed: boolean;
  totalCommands: number;
  passedCommands: number;
  failedCommands: number;
  totalDurationMs: number;
  failureDetails: string;
} {
  const totalCommands = results.length;
  let passedCommands = 0;
  let failedCommands = 0;
  let totalDurationMs = 0;
  let failureDetails = '';

  for (const result of results) {
    totalDurationMs += result.durationMs;
    if (result.passed) {
      passedCommands++;
    } else {
      failedCommands++;
      failureDetails += `Command failed: ${result.command}\nStderr:\n${result.stderr}\n\n`;
    }
  }

  return {
    allPassed: failedCommands === 0,
    totalCommands,
    passedCommands,
    failedCommands,
    totalDurationMs,
    failureDetails: failureDetails.trim(),
  };
}
