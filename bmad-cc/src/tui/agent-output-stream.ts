import { stripAnsi } from '../utils/ansi-cleaner.js';

export class AgentOutputStream {
  private lines: string[] = [];
  private maxLines: number;

  constructor(maxLines: number = 20) {
    this.maxLines = maxLines;
  }

  /** Append new output */
  append(data: string): void {
    const cleaned = stripAnsi(data);
    const newLines = cleaned.split('\n');
    for (const line of newLines) {
      if (line.trim().length > 0) {
        this.lines.push(line);
      }
    }
    
    if (this.lines.length > this.maxLines) {
      this.lines = this.lines.slice(this.lines.length - this.maxLines);
    }
  }

  /** Get the display-ready output */
  render(): string {
    return this.lines.join('\n');
  }

  /** Clear all captured output */
  clear(): void {
    this.lines = [];
  }

  /** Get total line count */
  totalLines(): number {
    return this.lines.length;
  }
}
