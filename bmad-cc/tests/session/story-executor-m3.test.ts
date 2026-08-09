import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { StoryExecutor } from '../../src/session/story-executor.js';
import { AgentDriver, AgentSessionResult, AgentSpawnOptions } from '../../src/agent/driver-interface.js';
import { StateManager } from '../../src/state/state-manager.js';
import { SessionLogger } from '../../src/state/session-logger.js';
import type { BmadCcConfig } from '../../src/config/config-schema.js';
import type { SprintStatus } from '../../src/sprint/sprint-status-parser.js';

class MockDriver extends AgentDriver {
  readonly name = 'mock';
  readonly displayName = 'Mock Driver';

  constructor(private behavior: 'normal' | 'stall' | 'query' = 'normal') {
    super();
  }

  getCommand(): string {
    return 'mock';
  }

  async isAvailable(): Promise<boolean> {
    return true;
  }

  async execute(options: AgentSpawnOptions): Promise<AgentSessionResult> {
    if (this.behavior === 'stall') {
      // Simulate stall by doing nothing until aborted
      await new Promise<void>((resolve) => {
        if (options.signal) {
          if (options.signal.aborted) {
            resolve();
            return;
          }
          options.signal.addEventListener('abort', () => resolve(), { once: true });
        } else {
          setTimeout(resolve, 200);
        }
      });
      return {
        exitCode: 143,
        stdout: '',
        stderr: 'Process terminated due to inactivity',
        durationMs: 100,
        timedOut: true,
        killedByWatchdog: true
      };
    }

    if (this.behavior === 'query') {
      options.onStdout?.('Do you want to continue? [y/N]');
      return {
        exitCode: 0,
        stdout: 'Do you want to continue? [y/N]',
        stderr: '',
        durationMs: 50,
        timedOut: false,
        killedByWatchdog: false
      };
    }

    options.onStdout?.('Driver execution completed successfully.');
    return {
      exitCode: 0,
      stdout: 'Driver execution completed successfully.',
      stderr: '',
      durationMs: 50,
      timedOut: false,
      killedByWatchdog: false
    };
  }
}

describe('StoryExecutor Milestone 3 Integrations (Heartbeat & AbortController & Query Parser)', () => {
  let tempDir: string;
  let mockConfig: BmadCcConfig;
  let mockSprintStatus: SprintStatus;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'bmad-test-executor-m3-'));
    const stateDir = path.join(tempDir, '_bmad');
    const storyLocation = path.join(tempDir, '_bmad-output', 'implementation-artifacts');
    await fs.mkdir(stateDir, { recursive: true });
    await fs.mkdir(storyLocation, { recursive: true });
    const sprintStatusFile = path.join(storyLocation, 'sprint-status.yaml');
    await fs.writeFile(sprintStatusFile, 'meta:\n  project: Test\ndevelopmentStatus:\n  1-1-test-story: ready-for-dev');

    mockConfig = {
      projectRoot: tempDir,
      agent: { driver: 'gemini', model: 'default' },
      paths: { sprintStatus: sprintStatusFile, storyLocation },
      limits: { maxRetries: 1, inactivityTimeoutMs: 100 },
      verification: { commands: [] }
    } as any;

    mockSprintStatus = {
      meta: { project: 'Test' },
      epicStatus: 'in-progress',
      allStoriesInEpicDone: false,
      developmentStatus: { '1-1-test-story': 'ready-for-dev' }
    };
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it('triggers HeartbeatMonitor and AbortController on stalled subprocess without crashing', async () => {
    const driver = new MockDriver('stall');
    const stateManager = new StateManager(path.join(tempDir, '_bmad'));
    const sessionLogger = new SessionLogger(path.join(tempDir, '_bmad', 'sessions'), 'test-session');
    const executor = new StoryExecutor(mockConfig, driver, stateManager, sessionLogger);

    const result = await executor.execute('1-1-test-story', mockSprintStatus, {
      dryRun: false,
      skipReview: true,
      skipTests: true,
      inactivityTimeoutMs: 50
    });

    expect(result.finalDecision).toBe('ESCALATE_TO_HUMAN');
    const state = await stateManager.load();
    expect(state?.lastError).toContain('stalled');
  });

  it('detects sub-agent queries and fires onSubagentQuery callback', async () => {
    const driver = new MockDriver('query');
    const stateManager = new StateManager(path.join(tempDir, '_bmad'));
    const sessionLogger = new SessionLogger(path.join(tempDir, '_bmad', 'sessions'), 'test-session');
    const executor = new StoryExecutor(mockConfig, driver, stateManager, sessionLogger);

    let capturedQueryPrompt: string | null = null;
    const result = await executor.execute('1-1-test-story', mockSprintStatus, {
      dryRun: false,
      skipReview: true,
      skipTests: true,
      onSubagentQuery: (queryInfo) => {
        capturedQueryPrompt = queryInfo.rawPrompt;
      }
    });

    expect(capturedQueryPrompt).not.toBeNull();
    expect(capturedQueryPrompt).toContain('[y/N]');
  });

  it('supports active AbortController cancellation mid-execution', async () => {
    const driver = new MockDriver('stall');
    const stateManager = new StateManager(path.join(tempDir, '_bmad'));
    const sessionLogger = new SessionLogger(path.join(tempDir, '_bmad', 'sessions'), 'test-session');
    const executor = new StoryExecutor(mockConfig, driver, stateManager, sessionLogger);

    const abortController = new AbortController();
    setTimeout(() => abortController.abort(), 20);

    const result = await executor.execute('1-1-test-story', mockSprintStatus, {
      dryRun: false,
      skipReview: true,
      skipTests: true,
      abortController
    });

    expect(result.finalDecision).toBe('ESCALATE_TO_HUMAN');
  });
});
