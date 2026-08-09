export class HeartbeatMonitor {
  private timeoutId: NodeJS.Timeout | null = null;
  private lastActivityAt: Date | null = null;
  private timedOut: boolean = false;
  private running: boolean = false;
  private readonly timeoutMs: number;
  private readonly onTimeout: () => void;
  private readonly onActivity: () => void;

  constructor(options: { timeoutMs: number, onTimeout: () => void, onActivity: () => void }) {
    this.timeoutMs = options.timeoutMs;
    this.onTimeout = options.onTimeout;
    this.onActivity = options.onActivity;
  }

  start(): void {
    if (this.timeoutId) {
      this.stop();
    }
    
    this.running = true;
    this.timedOut = false;
    this.lastActivityAt = new Date();
    this.scheduleTimeout();
  }

  pulse(): void {
    if (!this.running || this.timedOut) return;
    
    this.lastActivityAt = new Date();
    this.onActivity();
    
    if (this.timeoutId) {
      clearTimeout(this.timeoutId);
    }
    this.scheduleTimeout();
  }

  stop(): void {
    this.running = false;
    if (this.timeoutId) {
      clearTimeout(this.timeoutId);
      this.timeoutId = null;
    }
  }

  isTimedOut(): boolean {
    return this.timedOut;
  }

  getLastActivityAt(): Date | null {
    return this.lastActivityAt;
  }

  getElapsedSinceLastActivity(): number {
    if (!this.lastActivityAt) return 0;
    return Date.now() - this.lastActivityAt.getTime();
  }

  private scheduleTimeout(): void {
    this.timeoutId = setTimeout(() => {
      this.timedOut = true;
      this.onTimeout();
    }, this.timeoutMs);
  }
}
