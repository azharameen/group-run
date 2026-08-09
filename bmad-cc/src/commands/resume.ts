import { Command, Flags } from '@oclif/core';
import chalk from 'chalk';
import path from 'node:path';
import { loadConfig } from '../config/config-loader.js';
import { StateManager } from '../state/state-manager.js';
import Run from './run.js';

export default class Resume extends Command {
  static override description = 'Resume sprint execution from last saved crash checkpoint';

  public async run(): Promise<void> {
    const config = loadConfig();
    const stateDir = path.resolve(config.projectRoot, '_bmad');
    const stateManager = new StateManager(stateDir);

    const state = await stateManager.load();
    if (!state) {
      this.log(chalk.yellow('No crash checkpoint state found. Starting fresh execution...'));
      await Run.run([]);
      return;
    }

    this.log(chalk.cyan(`Resuming sprint execution from state checkpoint:`));
    this.log(`  Phase: ${chalk.yellow(state.currentPhase)}`);
    this.log(`  Story Key: ${chalk.yellow(state.currentStoryKey || 'None')}`);
    this.log(`  Driver: ${chalk.yellow(state.driverName)}`);

    const argv: string[] = ['--driver', state.driverName];
    if (state.currentStoryKey) {
      argv.push('--story', state.currentStoryKey);
    }
    await Run.run(argv);
  }
}
