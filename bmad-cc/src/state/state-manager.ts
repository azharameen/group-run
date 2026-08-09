import { promises as fs } from 'fs';
import * as path from 'path';

export interface ExecutionState {
  version: number;               // Schema version (1)
  startedAt: string;             // ISO timestamp
  lastUpdatedAt: string;         // ISO timestamp
  currentPhase: 'idle' | 'pre-flight' | 'directive' | 'development' | 'review' | 'verification' | 'gate-decision';
  currentStoryKey: string | null;
  currentEpicKey: string | null;
  retryCount: number;
  completedStories: string[];    // Story keys that are done
  skippedStories: string[];      // Story keys that were skipped
  activeSessionId: string | null;
  lastError: string | null;
  driverName: string;
}

export function createInitialState(driverName: string): ExecutionState {
  const now = new Date().toISOString();
  return {
    version: 1,
    startedAt: now,
    lastUpdatedAt: now,
    currentPhase: 'idle',
    currentStoryKey: null,
    currentEpicKey: null,
    retryCount: 0,
    completedStories: [],
    skippedStories: [],
    activeSessionId: null,
    lastError: null,
    driverName
  };
}

export class StateManager {
  private readonly stateFile: string;

  constructor(private readonly stateDir: string) {
    this.stateFile = path.join(this.stateDir, 'state.json');
  }

  async load(): Promise<ExecutionState | null> {
    try {
      const data = await fs.readFile(this.stateFile, 'utf8');
      return JSON.parse(data) as ExecutionState;
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        return null;
      }
      throw new Error(`Failed to load state: ${error.message}`);
    }
  }

  async save(state: ExecutionState): Promise<void> {
    state.lastUpdatedAt = new Date().toISOString();
    
    await fs.mkdir(this.stateDir, { recursive: true });
    const tmpFile = `${this.stateFile}.tmp.${Date.now()}`;
    
    try {
      await fs.writeFile(tmpFile, JSON.stringify(state, null, 2), 'utf8');
      await fs.rename(tmpFile, this.stateFile);
    } catch (error: any) {
      try {
        await fs.unlink(tmpFile);
      } catch (unlinkError) {
        // ignore
      }
      throw new Error(`Failed to save state: ${error.message}`);
    }
  }

  async updatePhase(phase: ExecutionState['currentPhase']): Promise<void> {
    const state = await this.load();
    if (!state) throw new Error('State not initialized');
    
    state.currentPhase = phase;
    await this.save(state);
  }

  async markStoryCompleted(storyKey: string): Promise<void> {
    const state = await this.load();
    if (!state) throw new Error('State not initialized');
    
    if (!state.completedStories.includes(storyKey)) {
      state.completedStories.push(storyKey);
      await this.save(state);
    }
  }

  async markStorySkipped(storyKey: string): Promise<void> {
    const state = await this.load();
    if (!state) throw new Error('State not initialized');
    
    if (!state.skippedStories.includes(storyKey)) {
      state.skippedStories.push(storyKey);
      await this.save(state);
    }
  }

  async setError(error: string): Promise<void> {
    const state = await this.load();
    if (!state) throw new Error('State not initialized');
    
    state.lastError = error;
    await this.save(state);
  }

  async clear(): Promise<void> {
    try {
      await fs.unlink(this.stateFile);
    } catch (error: any) {
      if (error.code !== 'ENOENT') {
        throw new Error(`Failed to clear state: ${error.message}`);
      }
    }
  }
}
