/**
 * skill-router.ts
 *
 * Provides the native BMad skill catalog for the Supervisor LLM.
 * NO hardcoded routing logic — the Supervisor agent decides which
 * skill(s) to invoke based on story state, context, and BMad skill specs.
 *
 * The TypeScript layer only provides:
 *   1. The skill catalog (metadata for the LLM to reason over).
 *   2. A helper to build a structured routing prompt for the Supervisor LLM.
 *   3. A parser to extract the LLM's routing decision back into typed records.
 */

export interface SkillInvocation {
  skillName: string;
  phase: 'create' | 'develop' | 'review' | 'test' | 'document' | 'retrospective';
  priority: number;
  reason: string;
  required: boolean;
}

export interface SkillCatalogEntry {
  name: string;
  phase: 'create' | 'develop' | 'review' | 'test' | 'document' | 'retrospective';
  description: string;
  defaultPriority: number;
  /** When this skill is applicable (for Supervisor context). */
  applicableWhen: string;
}

/** Native BMad skill catalog — declarative metadata only, no routing rules. */
export const NATIVE_SKILL_CATALOG: SkillCatalogEntry[] = [
  {
    name: 'bmad-create-story',
    phase: 'create',
    description: 'Story spec creation, acceptance criteria distillation, and story file authoring.',
    defaultPriority: 0,
    applicableWhen: 'Story file does not exist or story is in backlog with no spec written.'
  },
  {
    name: 'bmad-ux',
    phase: 'develop',
    description: 'User interface design and UX specification planning.',
    defaultPriority: -2,
    applicableWhen: 'Story has UI/frontend requirements that need design specs before dev begins.'
  },
  {
    name: 'bmad-architecture',
    phase: 'develop',
    description: 'System architectural design and invariant enforcement.',
    defaultPriority: -1,
    applicableWhen: 'Story requires data model, system design or architecture decisions.'
  },
  {
    name: 'bmad-dev-story',
    phase: 'develop',
    description: 'Story implementation and code generation.',
    defaultPriority: 0,
    applicableWhen: 'Story spec is ready and implementation must begin or resume.'
  },
  {
    name: 'bmad-code-review',
    phase: 'review',
    description: 'Adversarial code review and quality verification.',
    defaultPriority: 0,
    applicableWhen: 'Story implementation is complete and needs adversarial review.'
  },
  {
    name: 'bmad-retrospective',
    phase: 'retrospective',
    description: 'Epic retrospective and overall sprint assessment.',
    defaultPriority: 10,
    applicableWhen: 'All stories in an epic are complete and a retrospective is warranted.'
  }
];

/**
 * Builds a structured prompt for the Supervisor LLM to decide which
 * BMad skill(s) to invoke for a given story context.
 *
 * The LLM reads this prompt and responds with a JSON array of SkillInvocation
 * objects (see `parseSkillRoutingResponse` below).
 */
export function buildSkillRoutingPrompt(
  storyKey: string,
  storyStatus: string,
  storyContent: string,
  epicStatus: string,
  allStoriesInEpicDone: boolean,
  sprintOverview: string,
  customCatalog?: SkillCatalogEntry[]
): string {
  const catalog = customCatalog || NATIVE_SKILL_CATALOG;

  const catalogText = catalog
    .map(
      s =>
        `- ${s.name} (phase: ${s.phase}, priority: ${s.defaultPriority})\n  Description: ${s.description}\n  Applicable when: ${s.applicableWhen}`
    )
    .join('\n');

  return `You are the BMad Command Center Supervisor. Your task is to decide which BMad skill(s) to invoke for the following story.

## Story Context
- Story Key: ${storyKey}
- Current Status: ${storyStatus}
- Epic Status: ${epicStatus}
- All Stories in Epic Done: ${allStoriesInEpicDone}

## Story Spec Content
${storyContent ? storyContent.substring(0, 3000) : '(no story spec file found — story is unspecified)'}

## Sprint Overview
${sprintOverview || '(no sprint status available)'}

## Available BMad Skills
${catalogText}

## Instructions
Based on the story context above, decide which BMad skill(s) should be invoked next to advance this story through the sprint lifecycle. Consider:
- What is the current lifecycle phase based on the status?
- What does the story spec content indicate (e.g., UI requirements, architecture decisions)?
- Are there prerequisite skills that should run first?
- Should a retrospective be triggered?

Respond ONLY with a JSON array of skill invocations in this exact format (no markdown, no extra text):
[
  {
    "skillName": "bmad-create-story",
    "phase": "create",
    "priority": 0,
    "reason": "Story spec file does not exist; must create spec before development.",
    "required": true
  }
]

If no skills should be invoked (e.g., story is already done), respond with an empty array: []`;
}

/**
 * Parses the Supervisor LLM's routing response into typed SkillInvocation records.
 * Falls back to an empty array if the LLM response is malformed.
 */
export function parseSkillRoutingResponse(llmOutput: string): SkillInvocation[] {
  try {
    // Extract JSON from the response (handle cases where LLM wraps in markdown)
    const jsonMatch = llmOutput.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return [];

    const parsed = JSON.parse(jsonMatch[0]);
    if (!Array.isArray(parsed)) return [];

    const validPhases = new Set(['create', 'develop', 'review', 'test', 'document', 'retrospective']);

    return parsed
      .filter(
        (s: any) =>
          typeof s.skillName === 'string' &&
          typeof s.phase === 'string' &&
          validPhases.has(s.phase) &&
          typeof s.priority === 'number' &&
          typeof s.reason === 'string' &&
          typeof s.required === 'boolean'
      )
      .sort((a: SkillInvocation, b: SkillInvocation) => a.priority - b.priority) as SkillInvocation[];
  } catch {
    return [];
  }
}

/**
 * Synchronous fallback routing when the Supervisor LLM is unavailable.
 * Uses simple lifecycle state to determine a reasonable default skill.
 * This is the ONLY permitted fallback — not the primary routing path.
 */
export function fallbackSkillRouting(
  storyKey: string,
  storyStatus: string,
  storyContent: string,
  epicStatus: string,
  allStoriesInEpicDone: boolean,
  customCatalog?: SkillCatalogEntry[]
): SkillInvocation[] {
  const skills: SkillInvocation[] = [];
  const catalog = customCatalog || NATIVE_SKILL_CATALOG;
  const statusNormalized = (storyStatus || 'backlog').trim().toLowerCase();

  if (statusNormalized === 'backlog') {
    const s = catalog.find(c => c.phase === 'create');
    if (s) {
      skills.push({
        skillName: s.name,
        phase: 'create',
        priority: s.defaultPriority,
        reason: `[FALLBACK] Story ${storyKey} requires spec creation via ${s.name}`,
        required: true
      });
    }
  } else if (statusNormalized === 'ready-for-dev' || statusNormalized === 'in-progress') {
    if (/\b(ui|user interface|frontend|layout|component|view|page)\b/i.test(storyContent)) {
      const uxSkill = catalog.find(c => c.name === 'bmad-ux');
      if (uxSkill) {
        skills.push({
          skillName: uxSkill.name,
          phase: 'develop',
          priority: uxSkill.defaultPriority,
          reason: `[FALLBACK] Story ${storyKey} has UI requirements; invoking ${uxSkill.name}`,
          required: false
        });
      }
    }

    if (/\b(architecture|system design|data model|schema|database)\b/i.test(storyContent)) {
      const archSkill = catalog.find(c => c.name === 'bmad-architecture');
      if (archSkill) {
        skills.push({
          skillName: archSkill.name,
          phase: 'develop',
          priority: archSkill.defaultPriority,
          reason: `[FALLBACK] Story ${storyKey} has architectural requirements; invoking ${archSkill.name}`,
          required: false
        });
      }
    }

    const s = catalog.find(c => c.name === 'bmad-dev-story');
    if (s) {
      skills.push({
        skillName: s.name,
        phase: 'develop',
        priority: s.defaultPriority,
        reason: `[FALLBACK] Story ${storyKey} development via ${s.name}`,
        required: true
      });
    }
  } else if (statusNormalized === 'review') {
    const s = catalog.find(c => c.phase === 'review');
    if (s) {
      skills.push({
        skillName: s.name,
        phase: 'review',
        priority: s.defaultPriority,
        reason: `[FALLBACK] Story ${storyKey} review via ${s.name}`,
        required: true
      });
    }
  }

  if (allStoriesInEpicDone && statusNormalized === 'done') {
    const s = catalog.find(c => c.phase === 'retrospective');
    if (s) {
      skills.push({
        skillName: s.name,
        phase: 'retrospective',
        priority: s.defaultPriority,
        reason: `[FALLBACK] All stories done; triggering epic retrospective via ${s.name}`,
        required: false
      });
    }
  }

  // Fallback for unknown / unhandled non-done statuses
  if (skills.length === 0 && statusNormalized !== 'done') {
    if (!storyContent.trim()) {
      const s = catalog.find(c => c.phase === 'create');
      if (s) {
        skills.push({
          skillName: s.name,
          phase: 'create',
          priority: s.defaultPriority,
          reason: `[FALLBACK] Unknown status '${storyStatus}' with missing spec; defaulting to ${s.name}`,
          required: true
        });
      }
    } else {
      const s = catalog.find(c => c.name === 'bmad-dev-story');
      if (s) {
        skills.push({
          skillName: s.name,
          phase: 'develop',
          priority: s.defaultPriority,
          reason: `[FALLBACK] Unknown status '${storyStatus}' with spec; defaulting to ${s.name}`,
          required: true
        });
      }
    }
  }

  return skills.sort((a, b) => a.priority - b.priority);
}

/**
 * Main skill routing function. Delegates to fallbackSkillRouting.
 */
export function routeSkillsForStory(
  storyKey: string,
  storyStatus: string,
  storyContent: string,
  epicStatus: string,
  allStoriesInEpicDone: boolean,
  customCatalog?: SkillCatalogEntry[]
): SkillInvocation[] {
  return fallbackSkillRouting(
    storyKey,
    storyStatus,
    storyContent,
    epicStatus,
    allStoriesInEpicDone,
    customCatalog
  );
}
