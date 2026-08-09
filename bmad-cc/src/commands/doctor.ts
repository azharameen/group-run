import { Command } from '@oclif/core';
import chalk from 'chalk';
import path from 'node:path';
import { loadConfig } from '../config/config-loader.js';
import { fileExists } from '../utils/file-helpers.js';
import { createDriver } from '../agent/driver-factory.js';

export default class Doctor extends Command {
  static override description = 'Diagnose BMad environment compatibility, output paths, and CLI drivers';

  public async run(): Promise<void> {
    this.log(chalk.cyan.bold('\n🏥 BMad Command Center Doctor Diagnosis\n'));
    
    const config = loadConfig();
    let overallPass = true;

    const runCheck = async (name: string, checkFn: () => Promise<boolean>, detail?: string) => {
      try {
        const pass = await checkFn();
        if (pass) {
          this.log(`  ${chalk.green('✔')} ${chalk.bold(name)}${detail ? chalk.gray(` (${detail})`) : ''}`);
        } else {
          overallPass = false;
          this.log(`  ${chalk.red('✘')} ${chalk.bold(name)}${detail ? chalk.yellow(` - ${detail}`) : ''}`);
        }
      } catch (err: any) {
        overallPass = false;
        this.log(`  ${chalk.red('✘')} ${chalk.bold(name)}${chalk.red(` - Error: ${err.message}`)}`);
      }
    };

    await runCheck('Node.js Version >= 20', async () => {
      const major = parseInt(process.versions.node.split('.')[0], 10);
      return major >= 20;
    }, `Current: v${process.versions.node}`);

    await runCheck('Project Root Detected', async () => {
      return await fileExists(path.join(config.projectRoot, '_bmad-output'));
    }, config.projectRoot);

    await runCheck('Sprint Status File', async () => {
      return await fileExists(config.paths.sprintStatus);
    }, config.paths.sprintStatus);

    await runCheck('BMad Engine Directory', async () => {
      return await fileExists(path.join(config.projectRoot, '_bmad'));
    }, path.join(config.projectRoot, '_bmad'));

    await runCheck('BMad Skills Directory', async () => {
      return await fileExists(path.join(config.projectRoot, '.agent', 'skills'));
    }, path.join(config.projectRoot, '.agent', 'skills'));

    await runCheck('Default Agent Driver CLI', async () => {
      const driver = createDriver(config.agent.driver);
      return await driver.isAvailable();
    }, `Driver: ${config.agent.driver}`);

    if (overallPass) {
      this.log(chalk.green.bold('\n✨ All compatibility checks passed! BMad Command Center is ready to run.\n'));
    } else {
      this.log(chalk.yellow.bold('\n⚠️ Some checks failed or warned. Review the issues above.\n'));
    }
  }
}
