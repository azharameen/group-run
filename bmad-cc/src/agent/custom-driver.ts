import { execa } from 'execa';
import { AgentDriver, AgentSessionResult, AgentSpawnOptions } from './driver-interface.js';

export class CustomDriver extends AgentDriver {
  readonly name = 'custom';
  readonly displayName: string;
  private readonly command: string;
  private readonly args: string[];

  constructor(command: string, args: string[] = []) {
    super();
    this.command = command;
    this.args = args;
    this.displayName = `Custom (${command})`;
  }

  getCommand(): string {
    return this.command;
  }

  async isAvailable(): Promise<boolean> {
    try {
      await execa(this.command, ['--help']);
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

    let stdout = '';
    let stderr = '';
    let exitCode = -1;

    try {
      const subprocess = execa(this.command, this.args, {
        cwd: options.workingDirectory,
        env: options.env,
        signal: abortController.signal,
      });

      // Write prompt to stdin if process accepts it
      if (subprocess.stdin) {
        subprocess.stdin.write(options.prompt);
        subprocess.stdin.end();
      }

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
