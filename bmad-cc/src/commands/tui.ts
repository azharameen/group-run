import { Command, Flags } from '@oclif/core';
import React from 'react';
import { render } from 'ink';
import path from 'node:path';
import cliCursor from 'cli-cursor';
import { loadConfig } from '../config/config-loader.js';
import { parseSprintStatus, type SprintStatus } from '../sprint/sprint-status-parser.js';
import { App } from '../tui/app.js';
import type { DashboardState } from '../tui/render-dashboard.js';
import type { StoryRow } from '../tui/story-status-table.js';
import { fileExists, ensureDir } from '../utils/file-helpers.js';
import { ExecutionQueue } from '../session/execution-queue.js';
import { StateManager } from '../state/state-manager.js';
import { SessionLogger } from '../state/session-logger.js';
import { StoryExecutor } from '../session/story-executor.js';
import { createDriver, type DriverName } from '../agent/driver-factory.js';
import { AgentOutputStream } from '../tui/agent-output-stream.js';
import { routeSkillsForStory } from '../supervisor/skill-router.js';

export default class Tui extends Command {
  static override description = 'Launch full-screen interactive React Ink Command Center TUI app';

  static override flags = {
    epic: Flags.string({ char: 'e', description: 'Filter initial dashboard view by epic' }),
    driver: Flags.string({ char: 'd', description: 'Agent CLI driver (gemini, antigravity, opencode, copilot)' })
  };

  public async run(): Promise<void> {
    const { flags } = await this.parse(Tui);
    const config = loadConfig();
    const sprintStatusPath = config.paths.sprintStatus;

    if (!(await fileExists(sprintStatusPath))) {
      this.error(`Sprint status file not found at ${sprintStatusPath}`);
    }

    // Switch to Alternate Screen Buffer & clear terminal for full-screen view
    process.stdout.write('\x1b[?1049h\x1b[2J\x1b[3J\x1b[H');
    cliCursor.hide();

    const cleanupScreen = () => {
      process.stdout.write('\x1b[?1049l');
      cliCursor.show();
    };

    process.once('exit', cleanupScreen);
    process.once('SIGINT', () => {
      cleanupScreen();
      process.exit(0);
    });

    let sprintStatus: SprintStatus = await parseSprintStatus(sprintStatusPath);
    let isExecuting = false;
    let isPaused = false;

    const buildState = (
      activeStoryKey: string | null = null,
      activePhase: string = 'idle',
      activeSkill?: string,
      agentOutput: string = 'Supervisor Agent active. Native BMad Workstation loaded.',
      driverName: DriverName = (flags.driver || config.agent.driver) as DriverName
    ): DashboardState => {
      const stories: StoryRow[] = [];
      let completedCount = 0;
      let inProgressCount = 0;

      for (const [key, status] of Object.entries(sprintStatus.developmentStatus)) {
        if (key.startsWith('epic-') || key.endsWith('-retrospective')) continue;

        const epicMatch = key.match(/^(\d+)-/);
        const epicNum = epicMatch ? epicMatch[1] : '0';
        const epicKey = `EP-${epicNum}`;

        if (flags.epic && epicNum !== flags.epic.replace(/\D/g, '')) continue;

        if (status === 'done') completedCount++;
        if (status === 'in-progress' || status === 'review') inProgressCount++;

        stories.push({
          key,
          epic: epicKey,
          status,
          phase: status === 'in-progress' ? 'dev' : status === 'review' ? 'review' : status === 'done' ? 'done' : '-',
          retries: 0
        });
      }

      return {
        projectName: sprintStatus.meta.project || 'BMad Project',
        totalStories: stories.length,
        completedStories: completedCount,
        inProgressStories: inProgressCount,
        currentStoryKey: activeStoryKey,
        currentPhase: activePhase,
        activeSkill,
        epicFilter: flags.epic,
        stories,
        agentOutput,
        elapsedTime: 0,
        driverName
      };
    };

    let currentState = buildState();
    let inkInstance: any;

    const updateUIState = (newState: DashboardState) => {
      currentState = newState;
      if (inkInstance) {
        inkInstance.rerender(
          React.createElement(App, {
            initialState: currentState,
            onRun: handleRun,
            onPause: handlePause
          })
        );
      }
    };

    let activeAbortController: AbortController | null = null;

    const handlePause = () => {
      isPaused = true;
      if (activeAbortController) {
        activeAbortController.abort();
        activeAbortController = null;
      }
    };

    const handleRun = async (
      epicFilter?: string,
      statusFilter?: string,
      driverOverride?: DriverName,
      onLogUpdate?: (sessionId: string, skill: string, message: string) => void
    ) => {
      if (isExecuting) {
        isPaused = false;
        return;
      }

      isExecuting = true;
      isPaused = false;

      const activeDriverName = driverOverride || (flags.driver || config.agent.driver) as DriverName;
      const driver = createDriver(activeDriverName, config.agent.drivers?.[activeDriverName]);
      
      // Store state and sessions natively inside `_bmad/sessions/`
      const stateDir = path.resolve(config.projectRoot, '_bmad');
      await ensureDir(stateDir);
      const stateManager = new StateManager(stateDir);

      const sessionId = crypto.randomUUID();
      const sessionsDir = path.resolve(stateDir, 'sessions');
      await ensureDir(sessionsDir);
      const sessionLogger = new SessionLogger(sessionsDir, sessionId);

      const storyExecutor = new StoryExecutor(config, driver, stateManager, sessionLogger);
      const outputStream = new AgentOutputStream(10);
      const queue = new ExecutionQueue();

      queue.buildFromSprintStatus(sprintStatus, {
        epic: epicFilter,
        status: statusFilter
      });

      let nextStory = queue.next();
      while (nextStory && !isPaused) {
        const storyKey = nextStory.storyKey;
        const initialStatus = sprintStatus.developmentStatus[storyKey] || 'backlog';
        const epicMatch = storyKey.match(/^(\d+)-/);
        const epicNumber = epicMatch ? epicMatch[1] : '0';
        const epicStatus = sprintStatus.developmentStatus[`epic-${epicNumber}`] || 'in-progress';
        const routedSkills = routeSkillsForStory(storyKey, initialStatus, '', epicStatus, false);
        const activePhase = routedSkills[0]?.phase || 'develop';
        const activeSkill = routedSkills[0]?.skillName || 'bmad-dev-story';

        activeAbortController = new AbortController();

        outputStream.append(`Supervisor starting execution for ${storyKey} (status: ${initialStatus})...`);
        updateUIState(buildState(storyKey, activePhase, activeSkill, outputStream.render(), activeDriverName));

        const result = await storyExecutor.execute(storyKey, sprintStatus, {
          dryRun: false,
          skipReview: false,
          skipTests: false,
          abortController: activeAbortController,
          onProgress: (progress) => {
            if (onLogUpdate) {
              onLogUpdate(progress.sessionId, progress.skillName, progress.message);
            }
            outputStream.append(`[${progress.skillName}] ${progress.message}`);
            updateUIState(buildState(storyKey, progress.phase, progress.skillName, outputStream.render(), activeDriverName));
          },
          onSubagentQuery: (query) => {
            outputStream.append(`[SUB-AGENT QUERY] ${query.rawPrompt}`);
            updateUIState(buildState(storyKey, activePhase, activeSkill, outputStream.render(), activeDriverName));
          }
        });

        activeAbortController = null;

        // Reload sprint status natively from disk
        sprintStatus = await parseSprintStatus(sprintStatusPath);

        outputStream.append(`Decision for ${storyKey}: ${result.finalDecision} -> next: ${result.nextStatus || 'done'}`);
        updateUIState(buildState(storyKey, 'gate', activeSkill, outputStream.render(), activeDriverName));

        if (result.finalDecision === 'APPROVE') {
          queue.markCompleted(storyKey);
        } else {
          queue.markSkipped(storyKey);
        }

        nextStory = queue.next();
      }

      isExecuting = false;
      outputStream.append(isPaused ? 'Execution paused by user.' : 'All sprint stories completed!');
      updateUIState(buildState(null, 'idle', undefined, outputStream.render(), activeDriverName));
    };

    inkInstance = render(
      React.createElement(App, {
        initialState: currentState,
        onRun: handleRun,
        onPause: handlePause
      })
    );

    await inkInstance.waitUntilExit();
    cleanupScreen();
  }
}
