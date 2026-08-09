import chalk from 'chalk';

export interface ProgressBarOptions {
  total: number;
  completed: number;
  inProgress: number;
  label: string;
  width?: number;  // default 40
}

export function renderProgressBar(options: ProgressBarOptions): string {
  const { total, completed, inProgress, label, width = 40 } = options;
  const safeTotal = total > 0 ? total : 1;
  const completedRatio = completed / safeTotal;
  const inProgressRatio = inProgress / safeTotal;
  
  const completedChars = Math.round(completedRatio * width);
  const inProgressChars = Math.round(inProgressRatio * width);
  const remainingChars = Math.max(0, width - completedChars - inProgressChars);

  const completedBar = chalk.green('█'.repeat(completedChars));
  const inProgressBar = chalk.yellow('█'.repeat(inProgressChars));
  const remainingBar = chalk.gray('░'.repeat(remainingChars));

  const percentage = Math.round((completed / safeTotal) * 100);

  return `[${completedBar}${inProgressBar}${remainingBar}] ${percentage}% (${completed}/${total} ${label})`;
}
