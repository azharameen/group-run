import { promises as fs } from 'fs';
import * as path from 'path';

export interface SessionLogEntry {
  timestamp: string;
  phase: string;
  storyKey: string;
  event: 'phase-start' | 'phase-end' | 'agent-output' | 'test-result' | 'review-result' | 'gate-decision' | 'error' | 'retry' | 'escalation';
  data: Record<string, unknown>;
}

export class SessionLogger {
  private readonly logPath: string;
  private readonly sessionsDir: string;

  constructor(sessionsDir: string, sessionId: string) {
    this.sessionsDir = sessionsDir;
    this.logPath = path.join(sessionsDir, `${sessionId}.jsonl`);
  }

  async log(entry: Omit<SessionLogEntry, 'timestamp'>): Promise<void> {
    await fs.mkdir(this.sessionsDir, { recursive: true });
    
    const fullEntry: SessionLogEntry = {
      ...entry,
      timestamp: new Date().toISOString()
    };
    
    const line = JSON.stringify(fullEntry) + '\n';
    await fs.appendFile(this.logPath, line, 'utf8');
  }

  async readAll(): Promise<SessionLogEntry[]> {
    try {
      const data = await fs.readFile(this.logPath, 'utf8');
      return data.trim().split('\n')
        .filter(line => line.length > 0)
        .map(line => JSON.parse(line) as SessionLogEntry);
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        return [];
      }
      throw new Error(`Failed to read session logs: ${error.message}`);
    }
  }

  getLogPath(): string {
    return this.logPath;
  }
}
