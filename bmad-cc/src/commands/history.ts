import { Command, Flags } from '@oclif/core';
import chalk from 'chalk';
import path from 'node:path';
import { loadConfig } from '../config/config-loader.js';
import { DecisionLedger } from '../state/decision-ledger.js';
import { fileExists } from '../utils/file-helpers.js';

export default class History extends Command {
  static override description = 'Show past session logs and decision ledger history';

  static override flags = {
    json: Flags.boolean({ description: 'Output history records in JSON format' })
  };

  public async run(): Promise<void> {
    const { flags } = await this.parse(History);
    const config = loadConfig();
    const stateDir = path.resolve(config.projectRoot, '.bmad-cc');
    const ledgerPath = path.resolve(stateDir, 'decisions.jsonl');

    if (!(await fileExists(ledgerPath))) {
      if (flags.json) {
        this.log(JSON.stringify([], null, 2));
      } else {
        this.log(chalk.gray('No history recorded yet in .bmad-cc/decisions.jsonl.'));
      }
      return;
    }

    const ledger = new DecisionLedger(ledgerPath);
    const decisions = await ledger.readAll();

    if (flags.json) {
      this.log(JSON.stringify(decisions, null, 2));
      return;
    }

    this.log(chalk.cyan.bold('\n📜 BMad Command Center History\n'));
    if (decisions.length === 0) {
      this.log(chalk.gray('No decision records found.'));
      return;
    }

    this.log(chalk.bold('Past Decision Ledger:'));
    for (const d of decisions) {
      this.log(`  [${chalk.gray(d.timestamp)}] Story: ${chalk.yellow(d.storyKey)} | Decision: ${chalk.green(d.decision)} | Retries: ${d.retryCount}`);
      if (d.escalationReason) {
        this.log(`    Reason: ${chalk.gray(d.escalationReason)}`);
      }
    }
    this.log('');
  }
}
