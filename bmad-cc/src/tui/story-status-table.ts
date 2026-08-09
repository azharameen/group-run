import chalk from 'chalk';

export interface StoryRow {
  key: string;
  epic: string;
  status: string;
  phase: string;
  retries: number;
}

export function renderStoryTable(stories: StoryRow[]): string {
  if (stories.length === 0) {
    return 'No stories found.';
  }

  const getStatusColor = (status: string) => {
    switch (status.toLowerCase()) {
      case 'done': return chalk.green(status);
      case 'in-progress': return chalk.yellow(status);
      case 'review': return chalk.cyan(status);
      case 'backlog': return chalk.gray(status);
      case 'ready-for-dev': return chalk.blue(status);
      default: return chalk.white(status);
    }
  };

  const colWidths = {
    key: Math.max(...stories.map(s => s.key.length), 17),
    epic: Math.max(...stories.map(s => s.epic.length), 6),
    status: Math.max(...stories.map(s => s.status.length), 11),
    phase: Math.max(...stories.map(s => (s.phase || '-').length), 5),
    retries: 5
  };

  const pad = (str: string, length: number) => {
    const stringLength = str.replace(/\u001b\[\d+m/g, '').length;
    return str + ' '.repeat(Math.max(0, length - stringLength));
  };

  const header = `${pad('Story Key', colWidths.key)} │ ${pad('Epic', colWidths.epic)} │ ${pad('Status', colWidths.status)} │ ${pad('Phase', colWidths.phase)} │ Retry`;
  const separator = `${'─'.repeat(colWidths.key)} │ ${'─'.repeat(colWidths.epic)} │ ${'─'.repeat(colWidths.status)} │ ${'─'.repeat(colWidths.phase)} │ ${'─'.repeat(5)}`;

  const rows = stories.map(s => {
    const key = pad(s.key, colWidths.key);
    const epic = pad(s.epic, colWidths.epic);
    const status = pad(getStatusColor(s.status), colWidths.status);
    const phase = pad(s.phase || '-', colWidths.phase);
    const retries = pad(s.retries.toString(), colWidths.retries);
    return `${key} │ ${epic} │ ${status} │ ${phase} │ ${retries}`;
  });

  return [header, separator, ...rows].join('\n');
}
