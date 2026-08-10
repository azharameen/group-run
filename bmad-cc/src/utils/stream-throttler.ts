/**
 * StreamThrottler batches rapid live output stream updates over a buffer window (~50ms)
 * to prevent Ink UI re-render freezes during high-volume sub-agent output.
 */
export class StreamThrottler<T = any> {
  private buffer: T[] = [];
  private timer: NodeJS.Timeout | null = null;

  constructor(
    private flushCallback: (items: T[]) => void,
    private intervalMs: number = 50
  ) {}

  public push(item: T): void {
    this.buffer.push(item);
    if (!this.timer) {
      this.timer = setTimeout(() => {
        this.flush();
      }, this.intervalMs);
    }
  }

  public flush(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    if (this.buffer.length > 0) {
      const itemsToFlush = [...this.buffer];
      this.buffer = [];
      this.flushCallback(itemsToFlush);
    }
  }

  public clear(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.buffer = [];
  }

  public get pendingCount(): number {
    return this.buffer.length;
  }
}
