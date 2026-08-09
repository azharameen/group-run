export interface SkillInvocation {
  skillName: string;
  phase: 'create' | 'develop' | 'review' | 'test' | 'document' | 'retrospective';
  priority: number;
  reason: string;
  required: boolean;
}

/**
 * Determines which BMad skill(s) to invoke based on story status and content.
 * Guarantees zero redundant re-development for stories already in review or done.
 */
export function routeSkillsForStory(
  storyKey: string,
  storyStatus: string,
  storyContent: string,
  epicStatus: string,
  allStoriesInEpicDone: boolean
): SkillInvocation[] {
  const skills: SkillInvocation[] = [];
  const statusLower = (storyStatus || 'backlog').toLowerCase();

  switch (statusLower) {
    case 'backlog':
      skills.push({
        skillName: 'bmad-create-story',
        phase: 'create',
        priority: 0,
        reason: 'Story is in backlog; requires spec creation & AC distillation',
        required: true
      });
      break;

    case 'ready-for-dev':
    case 'in-progress': {
      const lowerContent = storyContent.toLowerCase();
      
      // Pre-requisite design skills if referenced in spec
      if (statusLower === 'ready-for-dev') {
        if (lowerContent.includes('ui') || lowerContent.includes('component') || lowerContent.includes('page') || lowerContent.includes('layout')) {
          skills.push({
            skillName: 'bmad-ux',
            phase: 'develop',
            priority: -2,
            reason: 'UI keywords detected in story spec; running UX design spec first',
            required: false
          });
        }
        if (lowerContent.includes('architecture') || lowerContent.includes('invariant') || lowerContent.includes('data model')) {
          skills.push({
            skillName: 'bmad-architecture',
            phase: 'develop',
            priority: -1,
            reason: 'Architecture keywords detected in story spec; verifying architecture spine invariants',
            required: false
          });
        }
      }

      skills.push({
        skillName: 'bmad-dev-story',
        phase: 'develop',
        priority: 0,
        reason: statusLower === 'in-progress' ? 'Resuming active story development' : 'Starting story code implementation',
        required: true
      });
      break;
    }

    case 'review':
      // CRITICAL: Story is already developed! Do NOT run bmad-dev-story. Only run code review & verification.
      skills.push({
        skillName: 'bmad-code-review',
        phase: 'review',
        priority: 0,
        reason: 'Story code implementation complete; running adversarial code review',
        required: true
      });
      break;

    case 'done':
      // Already completed. No development or review skills needed.
      break;
  }

  if (allStoriesInEpicDone && statusLower === 'done') {
    skills.push({
      skillName: 'bmad-retrospective',
      phase: 'retrospective',
      priority: 10,
      reason: 'All stories in epic completed; generating epic retrospective',
      required: false
    });
  }

  return skills.sort((a, b) => a.priority - b.priority);
}
