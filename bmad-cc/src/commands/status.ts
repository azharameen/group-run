import { Command, Flags } from '@oclif/core';
import chalk from 'chalk';
import { loadConfig } from '../config/config-loader.js';
import { parseSprintStatus } from '../sprint/sprint-status-parser.js';
import { renderDashboard, type DashboardState } from '../tui/render-dashboard.js';
import type { StoryRow } from '../tui/story-status-table.js';
import { fileExists } from '../utils/file-helpers.js';

export default class Status extends Command {
  static override description = 'Display sprint progress overview & story status dashboard with optional filtering';

  static override flags = {
    epic: Flags.string({ char: 'e', description: 'Filter stories by epic (e.g. EP-4, 4)' }),
    status: Flags.string({ char: 's', description: 'Filter stories by status (e.g. backlog, review, in-progress, done)' }),
    json: Flags.boolean({ description: 'Output status in raw JSON format' })
  };

  public async run(): Promise<void> {
    const { flags } = await this.parse(Status);
    const config = loadConfig();
    const sprintStatusPath = config.paths.sprintStatus;

    if (!(await fileExists(sprintStatusPath))) {
      this.error(`Sprint status file not found at ${sprintStatusPath}`);
    }

    const sprintStatus = await parseSprintStatus(sprintStatusPath);

    if (flags.json) {
      this.log(JSON.stringify(sprintStatus, null, 2));
      return;
    }
    
    const stories: StoryRow[] = [];
    let totalStories = 0;
    let completedStories = 0;
    let inProgressStories = 0;

    let targetEpicNum: string | null = null;
    if (flags.epic) {
      const match = flags.epic.match(/(\d+)/);
      if (match) targetEpicNum = match[1];
    }
    const targetStatus = flags.status?.toLowerCase();

    for (const [key, status] of Object.entries(sprintStatus.developmentStatus)) {
      if (key.startsWith('epic-') || key.endsWith('-retrospective')) continue;

      const epicMatch = key.match(/^(\d+)-/);
      const epicNum = epicMatch ? epicMatch[1] : '0';
      const epicKey = `EP-${epicNum}`;

      // Filtering
      if (targetEpicNum && epicNum !== targetEpicNum) continue;
      if (targetStatus && status.toLowerCase() !== targetStatus) continue;

      totalStories++;
      if (status === 'done') completedStories++;
      if (status === 'in-progress' || status === 'review') inProgressStories++;

      stories.push({
        key,
        epic: epicKey,
        status,
        phase: status === 'in-progress' ? 'dev' : status === 'review' ? 'review' : status === 'done' ? 'done' : '-',
        retries: 0
      });
    }

    const dashboardState: DashboardState = {
      projectName: sprintStatus.meta.project || 'BMad Project',
      totalStories,
      completedStories,
      inProgressStories,
      currentStoryKey: null,
      currentPhase: 'idle',
      epicFilter: flags.epic,
      statusFilter: flags.status,
      stories,
      agentOutput: 'System ready. Run `bmad-cc run` to start autonomous sprint execution.',
      elapsedTime: 0,
      driverName: config.agent.driver
    };

    this.log(renderDashboard(dashboardState));
  }
}
