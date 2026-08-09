import type { AgentDriver } from '../agent/driver-interface.js';
import type { DashboardState } from '../tui/render-dashboard.js';

export interface ConversationalSupervisorOptions {
  userPrompt: string;
  driver: AgentDriver;
  projectRoot: string;
  dashboardState: DashboardState;
  onChunk?: (text: string) => void;
}

export async function askConversationalSupervisor(
  options: ConversationalSupervisorOptions
): Promise<string> {
  const { userPrompt, driver, projectRoot, dashboardState, onChunk } = options;

  const currentStoryInfo = dashboardState.currentStoryKey
    ? `Active Story: ${dashboardState.currentStoryKey} (Phase: ${dashboardState.currentPhase})`
    : 'No active story executing.';

  const prompt = [
    `System: You are the BMad Supervisor Agent managing project "${dashboardState.projectName}".`,
    `Context:`,
    `- Total Stories: ${dashboardState.totalStories} (Completed: ${dashboardState.completedStories}, In Progress: ${dashboardState.inProgressStories})`,
    `- ${currentStoryInfo}`,
    `- Active Driver: ${driver.displayName}`,
    ``,
    `User Question/Directive:`,
    `"${userPrompt}"`,
    ``,
    `Provide a concise, helpful, professional response to the user's question or directive as the BMad Supervisor. Keep response under 10 lines.`
  ].join('\n');

  let fullOutput = '';
  try {
    const result = await driver.execute({
      prompt,
      workingDirectory: projectRoot,
      onStdout: (chunk) => {
        const text = chunk.trim();
        if (text) {
          fullOutput += (fullOutput ? '\n' : '') + text;
          onChunk?.(text);
        }
      },
      onStderr: () => {}
    });

    if (!fullOutput && result.stdout) {
      fullOutput = result.stdout.trim();
    }
    if (!fullOutput) {
      fullOutput = `Supervisor (${driver.displayName}): Directive received. State & context synchronized.`;
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    fullOutput = `Supervisor (${driver.displayName}): Context updated for "${userPrompt}". (${msg})`;
  }

  return fullOutput;
}
