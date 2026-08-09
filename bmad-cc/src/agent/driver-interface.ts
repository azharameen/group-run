export interface AgentSessionResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  durationMs: number;
  timedOut: boolean;
  killedByWatchdog: boolean;
}

export interface AgentSpawnOptions {
  prompt: string;
  workingDirectory: string;
  model?: string;
  timeoutMs?: number;
  env?: Record<string, string>;
  onStdout?: (data: string) => void;
  onStderr?: (data: string) => void;
}

export abstract class AgentDriver {
  abstract readonly name: string;
  abstract readonly displayName: string;

  /** Spawn an agent CLI session and wait for completion */
  abstract execute(options: AgentSpawnOptions): Promise<AgentSessionResult>;

  /** Check if this driver's CLI tool is available on PATH */
  abstract isAvailable(): Promise<boolean>;

  /** Get the CLI command this driver uses */
  abstract getCommand(): string;
}
