import { promises as fs } from 'fs';
import * as path from 'path';

export interface DecisionRecord {
  timestamp: string;
  storyKey: string;
  escalationReason: string;
  decision: 'retry' | 'retry-with-prompt' | 'override-pass' | 'skip' | 'abort';
  customPrompt?: string;
  retryCount: number;
}

export class DecisionLedger {
  private readonly ledgerDir: string;

  constructor(private readonly ledgerPath: string) {
    this.ledgerDir = path.dirname(this.ledgerPath);
  }

  async record(entry: Omit<DecisionRecord, 'timestamp'>): Promise<void> {
    await fs.mkdir(this.ledgerDir, { recursive: true });
    
    const fullEntry: DecisionRecord = {
      ...entry,
      timestamp: new Date().toISOString()
    };
    
    const line = JSON.stringify(fullEntry) + '\n';
    await fs.appendFile(this.ledgerPath, line, 'utf8');
  }

  async readAll(): Promise<DecisionRecord[]> {
    try {
      const data = await fs.readFile(this.ledgerPath, 'utf8');
      return data.trim().split('\n')
        .filter(line => line.length > 0)
        .map(line => JSON.parse(line) as DecisionRecord);
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        return [];
      }
      throw new Error(`Failed to read decisions: ${error.message}`);
    }
  }

  async getDecisionsForStory(storyKey: string): Promise<DecisionRecord[]> {
    const all = await this.readAll();
    return all.filter(r => r.storyKey === storyKey);
  }
}
