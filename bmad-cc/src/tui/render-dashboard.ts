import chalk from 'chalk';
import logUpdate from 'log-update';
import cliCursor from 'cli-cursor';
import { renderStoryTable, type StoryRow } from './story-status-table.js';
import { renderProgressBar } from './sprint-progress-bar.js';

export interface DashboardState {
  projectName: string;
  totalStories: number;
  completedStories: number;
  inProgressStories: number;
  currentStoryKey: string | null;
  currentPhase: string;
  activeSkill?: string;
  epicFilter?: string;
  statusFilter?: string;
  stories: StoryRow[];
  agentOutput: string;
  elapsedTime: number;  // ms
  driverName: string;
}

const SPINNER_FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
let spinnerIndex = 0;

function formatTime(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600).toString().padStart(2, '0');
  const minutes = Math.floor((totalSeconds % 3600) / 60).toString().padStart(2, '0');
  const seconds = (totalSeconds % 60).toString().padStart(2, '0');
  return `${hours}:${minutes}:${seconds}`;
}

export function renderDashboard(state: DashboardState): string {
  const spinner = SPINNER_FRAMES[spinnerIndex++ % SPINNER_FRAMES.length];
  const width = 72;
  const line = '═'.repeat(width);
  const borderTop = `╔${line}╗`;
  const borderMid = `╠${line}╣`;
  const borderBottom = `╚${line}╝`;

  const stripAnsi = (str: string) => str.replace(/\u001b\[\d+m/g, '');

  const padContent = (content: string, visibleLength: number) => {
    return content + ' '.repeat(Math.max(0, width - visibleLength));
  };

  const activeHeader = state.currentStoryKey
    ? `${spinner} Story: ${chalk.yellow.bold(state.currentStoryKey)} | Phase: ${chalk.cyan.bold(state.currentPhase)}${state.activeSkill ? ` | Skill: ${chalk.magenta.bold(state.activeSkill)}` : ''}`
    : `${chalk.green('✔')} System Idle / Ready for Commands`;

  const filtersStr = [
    state.epicFilter ? `Epic: ${chalk.yellow(state.epicFilter)}` : null,
    state.statusFilter ? `Status: ${chalk.cyan(state.statusFilter)}` : null
  ].filter(Boolean).join(' | ') || 'All Epics & Statuses';

  const headerLines = [
    `║ ${padContent(chalk.bold('🚀 BMad Agentic Development Command Center (oclif v0.1.0)'), 54)}║`,
    `║ ${padContent(`Project: ${chalk.bold(state.projectName)} | Driver: ${chalk.bold(state.driverName)} | Time: ${formatTime(state.elapsedTime)}`, 54)}║`,
    `║ ${padContent(`Filter Active: ${filtersStr}`, stripAnsi(`Filter Active: ${filtersStr}`).length)}║`,
    `║ ${padContent(activeHeader, stripAnsi(activeHeader).length)}║`
  ];

  const progressStr = renderProgressBar({
    total: state.totalStories,
    completed: state.completedStories,
    inProgress: state.inProgressStories,
    label: 'stories',
    width: 25
  });

  const progressLines = [
    `║ ${padContent('Sprint Completion Progress:', width - 1)}║`,
    `║ ${padContent(progressStr, stripAnsi(progressStr).length)}║`
  ];

  const tableLines = renderStoryTable(state.stories).split('\n').map(l => {
    const visibleLength = stripAnsi(l).length;
    return `║ ${padContent(l, visibleLength)}║`;
  });

  const rawOutputLines = state.agentOutput.split('\n').filter(Boolean).slice(-8);
  if (rawOutputLines.length === 0) {
    rawOutputLines.push('Initializing session log stream...');
  }

  const outputHeader = `║ ${padContent('Sub-Session Agent Stream (Live):', width - 1)}║`;
  const outputLines = rawOutputLines.map(l => {
    const truncated = l.length > width - 5 ? l.substring(0, width - 8) + '...' : l;
    const visibleLength = stripAnsi(truncated).length;
    return `║ ${padContent(`> ${truncated}`, visibleLength + 2)}║`;
  });

  return [
    borderTop,
    ...headerLines,
    borderMid,
    ...progressLines,
    borderMid,
    ...tableLines,
    borderMid,
    outputHeader,
    ...outputLines,
    borderBottom
  ].join('\n');
}

export class LiveDashboardRenderer {
  private timer?: NodeJS.Timeout;
  private isActive = false;

  public start(getStateFn: () => DashboardState): void {
    if (this.isActive) return;
    this.isActive = true;
    cliCursor.hide();

    this.timer = setInterval(() => {
      if (!this.isActive) return;
      const state = getStateFn();
      logUpdate(renderDashboard(state));
    }, 100);
  }

  public renderOnce(state: DashboardState): void {
    logUpdate(renderDashboard(state));
  }

  public stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
    if (this.isActive) {
      logUpdate.done();
      cliCursor.show();
      this.isActive = false;
    }
  }
}
