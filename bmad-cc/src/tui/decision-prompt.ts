import { select, input } from '@inquirer/prompts';
import chalk from 'chalk';

export interface EscalationContext {
  storyKey: string;
  reason: string;
  retryCount: number;
  maxRetries: number;
  testOutput?: string;
  reviewFindings?: string;
}

export type EscalationDecision = {
  action: 'retry' | 'retry-with-prompt' | 'override-pass' | 'skip' | 'abort';
  customPrompt?: string;
};

export async function promptForDecision(context: EscalationContext): Promise<EscalationDecision> {
  process.stdout.write('\x07');

  console.log(chalk.red(`\nEscalation required for story ${context.storyKey}:`));
  console.log(chalk.yellow(`Reason: ${context.reason}`));
  console.log(chalk.gray(`Retries: ${context.retryCount}/${context.maxRetries}`));

  if (context.testOutput) {
    console.log(chalk.cyan(`\nTest Output:`));
    const lines = context.testOutput.split('\n').slice(0, 10);
    console.log(lines.join('\n') + (lines.length === 10 ? '\n... (truncated)' : ''));
  }

  if (context.reviewFindings) {
    console.log(chalk.magenta(`\nReview Findings:`));
    const lines = context.reviewFindings.split('\n').slice(0, 10);
    console.log(lines.join('\n') + (lines.length === 10 ? '\n... (truncated)' : ''));
  }

  const answer = await select({
    message: 'How would you like to proceed?',
    choices: [
      { name: 'Retry (same prompt)', value: 'retry' },
      { name: 'Retry with custom instructions', value: 'retry-with-prompt' },
      { name: 'Override and pass', value: 'override-pass' },
      { name: 'Skip this story', value: 'skip' },
      { name: 'Abort entire sprint execution', value: 'abort' },
    ],
  });

  if (answer === 'retry-with-prompt') {
    const customPrompt = await input({
      message: 'Enter custom instructions for the agent:',
    });
    return { action: answer, customPrompt };
  }

  return { action: answer as EscalationDecision['action'] };
}
