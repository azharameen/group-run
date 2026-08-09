import chalk from 'chalk';
import path from 'node:path';
import { loadConfig } from '../config/config-loader.js';
import { StateManager } from '../state/state-manager.js';
import { runCommand } from './run-command.js';

export async function resumeCommand(): Promise<void> {
  const config = loadConfig();
  const stateDir = path.resolve(config.projectRoot, '_bmad');
  const stateManager = new StateManager(stateDir);

  const state = await stateManager.load();
  if (!state) {
    console.log(chalk.yellow('No crash checkpoint state found. Starting fresh execution...'));
    await runCommand({});
    return;
  }

  console.log(chalk.cyan(`Resuming sprint execution from state checkpoint:`));
  console.log(`  Phase: ${chalk.yellow(state.currentPhase)}`);
  console.log(`  Story Key: ${chalk.yellow(state.currentStoryKey || 'None')}`);
  console.log(`  Driver: ${chalk.yellow(state.driverName)}`);

  await runCommand({
    driver: state.driverName,
    story: state.currentStoryKey || undefined
  });
}
