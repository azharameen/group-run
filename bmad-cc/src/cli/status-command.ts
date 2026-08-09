import chalk from 'chalk';
import { loadConfig } from '../config/config-loader.js';
import { parseSprintStatus } from '../sprint/sprint-status-parser.js';
import { renderDashboard, type DashboardState } from '../tui/render-dashboard.js';
import type { StoryRow } from '../tui/story-status-table.js';
import { fileExists } from '../utils/file-helpers.js';

export async function statusCommand(): Promise<void> {
  const config = loadConfig();
  const sprintStatusPath = config.paths.sprintStatus;

  if (!(await fileExists(sprintStatusPath))) {
    console.error(chalk.red(`Error: Sprint status file not found at ${sprintStatusPath}`));
    process.exit(1);
  }

  const sprintStatus = await parseSprintStatus(sprintStatusPath);
  
  const stories: StoryRow[] = [];
  let totalStories = 0;
  let completedStories = 0;
  let inProgressStories = 0;

  for (const [key, status] of Object.entries(sprintStatus.developmentStatus)) {
    if (key.startsWith('epic-')) continue;

    totalStories++;
    if (status === 'done') completedStories++;
    if (status === 'in-progress' || status === 'review') inProgressStories++;

    const epicMatch = key.match(/^(\d+)-/);
    const epicKey = epicMatch ? `EP-${epicMatch[1]}` : 'UNKNOWN';

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
    stories,
    agentOutput: 'System ready. Run `bmad-cc run` to start autonomous sprint execution.',
    elapsedTime: 0,
    driverName: config.agent.driver
  };

  console.log(renderDashboard(dashboardState));
}
