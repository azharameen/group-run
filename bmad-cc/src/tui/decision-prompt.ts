import readline from 'readline';
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

/**
 * Non-TUI CLI prompt fallback using standard readline (no @inquirer/prompts dependency).
 */
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

  console.log(chalk.bold('\nHow would you like to proceed?'));
  console.log('  1. Retry (same prompt)');
  console.log('  2. Retry with custom instructions');
  console.log('  3. Override and pass');
  console.log('  4. Skip this story');
  console.log('  5. Abort entire sprint execution');

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  const ask = (q: string): Promise<string> => new Promise(res => rl.question(q, res));

  let choice = await ask('\nEnter choice (1-5): ');
  choice = choice.trim();

  rl.close();

  if (choice === '2') {
    const rl2 = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });
    const customPrompt = await new Promise<string>(res => rl2.question('Enter custom instructions for agent: ', res));
    rl2.close();
    return { action: 'retry-with-prompt', customPrompt };
  }

  switch (choice) {
    case '1': return { action: 'retry' };
    case '3': return { action: 'override-pass' };
    case '4': return { action: 'skip' };
    case '5': return { action: 'abort' };
    default: return { action: 'retry' };
  }
}
