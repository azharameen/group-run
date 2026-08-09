import { execa } from 'execa';

export interface HygieneResult {
  command: string;
  passed: boolean;
  output: string;
  durationMs: number;
}

export async function runHygieneChecks(
  commands: string[],
  workingDirectory: string
): Promise<HygieneResult[]> {
  const results: HygieneResult[] = [];

  for (const command of commands) {
    const startTime = Date.now();
    try {
      const { exitCode, stdout, stderr } = await execa(command, {
        shell: true,
        cwd: workingDirectory,
        reject: false,
      });

      results.push({
        command,
        passed: exitCode === 0,
        output: [stdout, stderr].filter(Boolean).join('\n'),
        durationMs: Date.now() - startTime,
      });
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      results.push({
        command,
        passed: false,
        output: errorMsg,
        durationMs: Date.now() - startTime,
      });
    }
  }

  return results;
}
