import { randomUUID } from 'crypto';
import type { SkillInvocation } from './skill-router.js';
import type { SupervisorContext } from './context-assembler.js';

export interface SupervisorDirective {
  sessionId: string;
  storyKey: string;
  targetSkill: string;
  prompt: string;
  contextFiles: string[];
  constraints: string[];
}

/**
 * Generates structured prompts that the agent CLI will receive.
 */
export function generateDirective(
  storyKey: string,
  skillInvocation: SkillInvocation,
  storySpec: { title: string; filePath: string; content: string },
  context: SupervisorContext,
  retryFeedback?: string
): SupervisorDirective {
  let prompt = `/${skillInvocation.skillName} ${storySpec.filePath}\n\n`;
  prompt += `Context:\n${context.sprintOverview}\n\n`;
  
  if (retryFeedback) {
    prompt += `PREVIOUS ATTEMPT FEEDBACK:\n${retryFeedback}\n\n`;
  }
  
  if (context.architectureSummary) {
    prompt += `Architecture Constraints:\n${context.architectureSummary}\n\n`;
  }
  
  // Keep total prompt under roughly 4000 tokens (truncate characters)
  prompt = prompt.substring(0, 15000); 

  return {
    sessionId: randomUUID(),
    storyKey,
    targetSkill: skillInvocation.skillName,
    prompt,
    contextFiles: [storySpec.filePath],
    constraints: [
      'Follow project architecture strictly',
      'Address any previous attempt feedback if provided'
    ]
  };
}
