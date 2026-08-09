import type { AgentDriver, AgentSessionResult } from '../agent/driver-interface.js';
import { HeartbeatMonitor } from '../watchdog/heartbeat-monitor.js';
import type { SessionLogger } from '../state/session-logger.js';

export interface PhaseResult {
  phase: string;
  durationMs: number;
  success: boolean;
  output: string;
  errors: string[];
  timedOut: boolean;
  killedByWatchdog: boolean;
}

export class PhaseRunner {
  constructor(
    private driver: AgentDriver,
    private watchdogTimeoutMs: number,
    private logger: SessionLogger
  ) {}

  /** Execute a development phase by sending prompt to agent CLI */
  public async runDevelopmentPhase(
    prompt: string,
    workingDirectory: string,
    storyKey: string,
    model?: string
  ): Promise<PhaseResult> {
    return this.executePhase('development', prompt, workingDirectory, storyKey, model);
  }

  /** Execute a review phase */
  public async runReviewPhase(
    prompt: string,
    workingDirectory: string,
    storyKey: string,
    model?: string
  ): Promise<PhaseResult> {
    return this.executePhase('review', prompt, workingDirectory, storyKey, model);
  }

  private async executePhase(
    phaseName: string,
    prompt: string,
    workingDirectory: string,
    storyKey: string,
    model?: string
  ): Promise<PhaseResult> {
    // We assume logger exposes these methods, or similar
    this.logger.log(`Starting ${phaseName} phase for ${storyKey}`);
    
    const startTime = Date.now();
    const monitor = new HeartbeatMonitor(this.watchdogTimeoutMs);
    
    monitor.start();
    
    let result: AgentSessionResult;
    try {
      result = await this.driver.execute({
        prompt,
        workingDirectory,
        model,
        onStdout: () => monitor.pulse(),
        onStderr: () => monitor.pulse(),
      });
    } catch (err: unknown) {
      monitor.stop();
      this.logger.log(`Error during ${phaseName} phase for ${storyKey}`);
      const errorMsg = err instanceof Error ? err.message : String(err);
      return {
        phase: phaseName,
        durationMs: Date.now() - startTime,
        success: false,
        output: '',
        errors: [errorMsg],
        timedOut: false,
        killedByWatchdog: false,
      };
    }

    monitor.stop();
    // Assuming HeartbeatMonitor has this method
    const timedOut = (monitor as any).hasTimedOut ? (monitor as any).hasTimedOut() : false;
    const success = result.exitCode === 0 && !timedOut;

    this.logger.log(`Completed ${phaseName} phase for ${storyKey}. Success: ${success}`);

    return {
      phase: phaseName,
      durationMs: Date.now() - startTime,
      success,
      output: result.stdout || '',
      errors: result.stderr ? [result.stderr] : [],
      timedOut,
      killedByWatchdog: timedOut,
    };
  }
}
