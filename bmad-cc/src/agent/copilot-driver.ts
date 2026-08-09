import { execa } from 'execa';
import { AgentDriver, AgentSessionResult, AgentSpawnOptions } from './driver-interface.js';

export class CopilotDriver extends AgentDriver {
  readonly name = 'copilot';
  readonly displayName = 'GitHub Copilot';

  getCommand(): string {
    return 'gh';
  }

  async isAvailable(): Promise<boolean> {
    try {
      await execa('gh', ['copilot', '--help']);
      return true;
    } catch {
      return false;
    }
  }

  async execute(options: AgentSpawnOptions): Promise<AgentSessionResult> {
    const startTime = Date.now();
    const abortController = new AbortController();
    
    let timedOut = false;
    let timeoutId: NodeJS.Timeout | undefined;

    if (options.timeoutMs) {
      timeoutId = setTimeout(() => {
        timedOut = true;
        abortController.abort();
      }, options.timeoutMs);
    }

    if (options.signal) {
      if (options.signal.aborted) {
        abortController.abort();
      } else {
        options.signal.addEventListener('abort', () => {
          abortController.abort();
        }, { once: true });
      }
    }

    const args = ['copilot', 'explain', options.prompt];

    let stdout = '';
    let stderr = '';
    let exitCode = -1;

    try {
      const subprocess = execa('gh', args, {
        cwd: options.workingDirectory,
        env: options.env,
        signal: abortController.signal,
      });

      subprocess.stdout?.on('data', (chunk) => {
        const str = chunk.toString();
        stdout += str;
        options.onStdout?.(str);
      });

      subprocess.stderr?.on('data', (chunk) => {
        const str = chunk.toString();
        stderr += str;
        options.onStderr?.(str);
      });

      const result = await subprocess;
      exitCode = result.exitCode;
    } catch (error: any) {
      if (error.isCanceled || error.name === 'AbortError') {
        exitCode = 143;
      } else {
        exitCode = error.exitCode ?? 1;
      }
    } finally {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    }

    return {
      exitCode,
      stdout,
      stderr,
      durationMs: Date.now() - startTime,
      timedOut,
      killedByWatchdog: timedOut || (options.signal?.aborted ?? false),
    };
  }
}
