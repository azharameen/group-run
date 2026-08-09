import { Command, Flags } from '@oclif/core';
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

export default class Run extends Command {
  static override description = 'Start autonomous sprint execution with Supervisor Agent & sub-session tracking';

  static override flags = {
    driver: Flags.string({ char: 'd', description: 'Override agent driver (agy, gemini, opencode, copilot, custom)' }),
    epic: Flags.string({ char: 'e', description: 'Filter execution to a specific epic (e.g. EP-4, 4)' }),
    status: Flags.string({ char: 's', description: 'Filter execution to stories matching status (e.g. review, backlog)' }),
    story: Flags.string({ description: 'Execute only a specific story key' }),
    'dry-run': Flags.boolean({ description: 'Simulate execution without invoking agent LLM sessions' }),
    'skip-review': Flags.boolean({ description: 'Skip code review phase' }),
    'skip-tests': Flags.boolean({ description: 'Skip verification tests phase' })
  };

  public async run(): Promise<void> {
    const { flags } = await this.parse(Run);
    const config = loadConfig();
    const driverName = (flags.driver || config.agent.driver) as DriverName;

    const sprintStatusPath = config.paths.sprintStatus;
    if (!(await fileExists(sprintStatusPath))) {
      this.error(`Sprint status file not found at ${sprintStatusPath}`);
    }

    let sprintStatus: SprintStatus = await parseSprintStatus(sprintStatusPath);
    const queue = new ExecutionQueue();
    queue.buildFromSprintStatus(sprintStatus, {
      epic: flags.epic,
      status: flags.status
    });

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
    
    if (!isAvailable && !flags['dry-run']) {
      this.error(`Agent CLI tool '${driver.getCommand()}' for driver '${driverName}' is not available on PATH.`);
    }

    const storyExecutor = new StoryExecutor(config, driver, stateManager, sessionLogger);
    const outputStream = new AgentOutputStream(10);
    const startTime = Date.now();

    let activeStoryKey: string | null = null;
    let activePhase: string = 'idle';
    let activeSkill: string | undefined = undefined;

    const getDashboardState = (): DashboardState => {
      const stories: StoryRow[] = [];
      let completedCount = 0;
      let inProgressCount = 0;

      for (const [key, status] of Object.entries(sprintStatus.developmentStatus)) {
        if (key.startsWith('epic-') || key.endsWith('-retrospective')) continue;

        const epicMatch = key.match(/^(\d+)-/);
        const epicNum = epicMatch ? epicMatch[1] : '0';
        const epicKey = `EP-${epicNum}`;

        if (flags.epic) {
          const filterMatch = flags.epic.match(/(\d+)/);
          if (filterMatch && epicNum !== filterMatch[1]) continue;
        }

        if (flags.status && status.toLowerCase() !== flags.status.toLowerCase()) continue;

        if (status === 'done') completedCount++;
        if (status === 'in-progress' || status === 'review') inProgressCount++;

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
        activeSkill,
        epicFilter: flags.epic,
        statusFilter: flags.status,
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
    if (flags.story) {
      storiesToRun = [flags.story];
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
      this.log(chalk.green(`\n🎉 All matching stories in sprint are already completed!`));
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
        activeSkill = routedSkills[0]?.skillName || 'bmad-dev-story';

        outputStream.append(`Supervisor starting execution for ${storyKey} (status: ${initialStatus})...`);

        const result = await storyExecutor.execute(storyKey, sprintStatus, {
          dryRun: flags['dry-run'] || false,
          skipReview: flags['skip-review'] || false,
          skipTests: flags['skip-tests'] || false,
          onProgress: (progress) => {
            outputStream.append(`[${progress.skillName}] ${progress.message}`);
          }
        });

        // Reload sprint status to reflect updated disk state
        sprintStatus = await parseSprintStatus(sprintStatusPath);
        activePhase = 'gate';

        outputStream.append(`Supervisor Decision for ${storyKey}: ${result.finalDecision} -> next: ${result.nextStatus || 'done'}`);

        if (result.finalDecision === 'APPROVE') {
          queue.markCompleted(storyKey);
        } else if (result.finalDecision === 'ESCALATE_TO_HUMAN') {
          renderer.stop();

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
      this.log(chalk.bold.green(`\n✨ Sprint execution session completed!`));
    }
  }
}
