export interface KillResult {
  pid: number;
  reason: string;
  signal: 'SIGTERM' | 'SIGKILL';
  duration: number;
}

export class ProcessKiller {
  private readonly graceMs: number;

  constructor(options: { graceMs?: number } = {}) {
    this.graceMs = options.graceMs ?? 10000;
  }

  async kill(pid: number, reason: string): Promise<KillResult> {
    const startTime = Date.now();
    
    try {
      // Send SIGTERM
      process.kill(pid, 'SIGTERM');
    } catch (error: any) {
      if (error.code === 'ESRCH') {
        // Process is already dead
        return {
          pid,
          reason: `${reason} (already dead)`,
          signal: 'SIGTERM',
          duration: Date.now() - startTime
        };
      }
      throw error;
    }

    // Wait for the process to exit up to graceMs
    const isRunning = async (): Promise<boolean> => {
      try {
        process.kill(pid, 0); // signal 0 checks for existence
        return true;
      } catch (error: any) {
        return false;
      }
    };

    const pollInterval = 100;
    let elapsed = 0;
    
    while (elapsed < this.graceMs) {
      await new Promise(resolve => setTimeout(resolve, Math.min(pollInterval, this.graceMs - elapsed)));
      elapsed += pollInterval;
      
      if (!(await isRunning())) {
        return {
          pid,
          reason,
          signal: 'SIGTERM',
          duration: Date.now() - startTime
        };
      }
    }

    // Force kill with SIGKILL if still running
    try {
      process.kill(pid, 'SIGKILL');
    } catch (error: any) {
      if (error.code !== 'ESRCH') {
        throw error;
      }
    }

    return {
      pid,
      reason,
      signal: 'SIGKILL',
      duration: Date.now() - startTime
    };
  }
}
