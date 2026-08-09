import chalk from 'chalk';
import path from 'path';
import { loadConfig } from '../config/config-loader.js';
import { parseSprintStatus, type SprintStatus } from '../sprint/sprint-status-parser.js';
import { ExecutionQueue } from '../session/execution-queue.js';
import { createDriver, type DriverName } from '../agent/driver-factory.js';
import { StateManager } from '../state/state-manager.js';
import { SessionLogger } from '../state/session-logger.js';
import { StoryExecutor } from '../session/story-executor.js';
import { LiveDashboardRenderer, type DashboardState } from '../tui/render-dashboard.js';
import type { StoryRow } from '../tui/story-status-table.js';
import { AgentOutputStream } from '../tui/agent-output-stream.js';
import { fileExists, ensureDir } from '../utils/file-helpers.js';
import { promptForDecision } from '../tui/decision-prompt.js';
import { DecisionLedger } from '../state/decision-ledger.js';
import { routeSkillsForStory } from '../supervisor/skill-router.js';

export interface RunOptions {
  driver?: string;
  story?: string;
  dryRun?: boolean;
  skipReview?: boolean;
  skipTests?: boolean;
}

export async function runCommand(options: RunOptions): Promise<void> {
  const config = loadConfig();
  const driverName = (options.driver || config.agent.driver) as DriverName;

  const sprintStatusPath = config.paths.sprintStatus;
  if (!(await fileExists(sprintStatusPath))) {
    console.error(chalk.red(`Error: Sprint status file not found at ${sprintStatusPath}`));
    process.exit(1);
  }

  let sprintStatus: SprintStatus = await parseSprintStatus(sprintStatusPath);
  const queue = new ExecutionQueue();
  queue.buildFromSprintStatus(sprintStatus);

  const stateDir = path.resolve(config.projectRoot, '_bmad');
  await ensureDir(stateDir);
  const stateManager = new StateManager(stateDir);

  const sessionId = crypto.randomUUID();
  const sessionsDir = path.resolve(stateDir, 'sessions');
  await ensureDir(sessionsDir);
  const sessionLogger = new SessionLogger(sessionsDir, sessionId);

  const ledgerPath = path.resolve(stateDir, 'decisions.jsonl');
  const decisionLedger = new DecisionLedger(ledgerPath);

  const driver = createDriver(driverName, config.agent.drivers?.[driverName]);
  const isAvailable = await driver.isAvailable();
  
  if (!isAvailable && !options.dryRun) {
    console.error(chalk.red(`Error: Agent CLI tool '${driver.getCommand()}' for driver '${driverName}' is not available on PATH.`));
    process.exit(1);
  }

  const storyExecutor = new StoryExecutor(config, driver, stateManager, sessionLogger);
  const outputStream = new AgentOutputStream(10);
  const startTime = Date.now();

  let activeStoryKey: string | null = null;
  let activePhase: string = 'idle';

  const getDashboardState = (): DashboardState => {
    const stories: StoryRow[] = [];
    let completedCount = 0;
    let inProgressCount = 0;

    for (const [key, status] of Object.entries(sprintStatus.developmentStatus)) {
      if (key.startsWith('epic-')) continue;
      if (status === 'done') completedCount++;
      if (status === 'in-progress' || status === 'review') inProgressCount++;

      const epicMatch = key.match(/^(\d+)-/);
      const epicKey = epicMatch ? `EP-${epicMatch[1]}` : 'UNKNOWN';

      const isCurrent = (key === activeStoryKey);
      const displayStatus = isCurrent ? status : status;
      const displayPhase = isCurrent ? activePhase : status === 'done' ? 'done' : '-';

      stories.push({
        key,
        epic: epicKey,
        status: displayStatus,
        phase: displayPhase,
        retries: 0
      });
    }

    return {
      projectName: sprintStatus.meta.project || 'BMad Project',
      totalStories: queue.total(),
      completedStories: completedCount,
      inProgressStories: inProgressCount,
      currentStoryKey: activeStoryKey,
      currentPhase: activePhase,
      stories,
      agentOutput: outputStream.render(),
      elapsedTime: Date.now() - startTime,
      driverName
    };
  };

  const renderer = new LiveDashboardRenderer();
  renderer.start(getDashboardState);

  // Determine story queue to execute
  let storiesToRun: string[] = [];
  if (options.story) {
    storiesToRun = [options.story];
  } else {
    let item = queue.next();
    while (item) {
      storiesToRun.push(item.storyKey);
      item = queue.next();
    }
  }

  if (storiesToRun.length === 0) {
    renderer.stop();
    renderer.renderOnce(getDashboardState());
    console.log(chalk.green(`\n🎉 All stories in sprint are already completed!`));
    return;
  }

  try {
    for (const storyKey of storiesToRun) {
      activeStoryKey = storyKey;
      const initialStatus = sprintStatus.developmentStatus[storyKey] || 'backlog';
      const epicMatch = storyKey.match(/^(\d+)-/);
      const epicNumber = epicMatch ? epicMatch[1] : '0';
      const epicStatus = sprintStatus.developmentStatus[`epic-${epicNumber}`] || 'in-progress';
      const routedSkills = routeSkillsForStory(storyKey, initialStatus, '', epicStatus, false);
      activePhase = routedSkills[0]?.phase || 'develop';

      outputStream.append(`Starting execution for story ${storyKey} (status: ${initialStatus})...`);

      const result = await storyExecutor.execute(storyKey, sprintStatus, {
        dryRun: options.dryRun || false,
        skipReview: options.skipReview || false,
        skipTests: options.skipTests || false
      });

      // Reload sprint status to reflect updated disk state
      sprintStatus = await parseSprintStatus(sprintStatusPath);
      activePhase = 'gate';

      outputStream.append(`Story ${storyKey} decision: ${result.finalDecision} (next status: ${result.nextStatus || 'done'})`);

      if (result.finalDecision === 'APPROVE') {
        queue.markCompleted(storyKey);
      } else if (result.finalDecision === 'ESCALATE_TO_HUMAN') {
        renderer.stop(); // Stop live rendering during interactive HITL prompt

        const decision = await promptForDecision({
          storyKey,
          reason: `Execution failed after ${result.totalRetries} attempts. Escalating to human decision gate.`,
          retryCount: result.totalRetries,
          maxRetries: config.limits.maxRetries
        });

        await decisionLedger.record({
          storyKey,
          escalationReason: 'Max retries exceeded',
          decision: decision.action,
          customPrompt: decision.customPrompt,
          retryCount: result.totalRetries
        });

        if (decision.action === 'override-pass') {
          queue.markCompleted(storyKey);
        } else if (decision.action === 'skip') {
          queue.markSkipped(storyKey);
        } else if (decision.action === 'abort') {
          break;
        }

        renderer.start(getDashboardState);
      }
    }
  } finally {
    renderer.stop();
    renderer.renderOnce(getDashboardState());
    console.log(chalk.bold.green(`\n✨ Sprint session finished!`));
  }
}
