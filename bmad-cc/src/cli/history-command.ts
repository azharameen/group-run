import chalk from 'chalk';
import path from 'node:path';
import { loadConfig } from '../config/config-loader.js';
import { DecisionLedger } from '../state/decision-ledger.js';
import { fileExists } from '../utils/file-helpers.js';

export interface HistoryOptions {
  sessions?: boolean;
  decisions?: boolean;
}

export async function historyCommand(options: HistoryOptions): Promise<void> {
  const config = loadConfig();
  const stateDir = path.resolve(config.projectRoot, '.bmad-cc');
  const ledgerPath = path.resolve(stateDir, 'decisions.jsonl');

  console.log(chalk.cyan.bold('\n📜 BMad Command Center History\n'));

  if (!(await fileExists(ledgerPath))) {
    console.log(chalk.gray('No history recorded yet in .bmad-cc/decisions.jsonl.'));
    return;
  }

  const ledger = new DecisionLedger(ledgerPath);
  const decisions = await ledger.readAll();

  if (decisions.length === 0) {
    console.log(chalk.gray('No decision records found.'));
    return;
  }

  console.log(chalk.bold('Past Decision Ledger:'));
  for (const d of decisions) {
    console.log(`  [${chalk.gray(d.timestamp)}] Story: ${chalk.yellow(d.storyKey)} | Decision: ${chalk.green(d.decision)} | Retries: ${d.retryCount}`);
    if (d.escalationReason) {
      console.log(`    Reason: ${chalk.gray(d.escalationReason)}`);
    }
  }
  console.log('');
}
