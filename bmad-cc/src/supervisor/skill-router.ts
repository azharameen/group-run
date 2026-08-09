/**
 * skill-router.ts
 *
 * Provides the dynamic BMad skill catalog and routing engine for the Supervisor.
 * Dynamically scans installed BMad skills under `.agent/skills/<skill-name>/SKILL.md` and
 * catalog entries in `_bmad/_config/bmad-help.csv`.
 * Integrates the `/bmad-help` discovery harness when story state is ambiguous,
 * missing prerequisites, or skill sequence is uncertain.
 */

import type { AgentDriver } from '../agent/driver-interface.js';
import { scanSkillManifests, type ScannedSkillManifest } from './skill-manifest-scanner.js';
import { loadBmadHelpCatalog, type BmadHelpCatalogRow } from './catalog-parser.js';
import {
  runBmadHelpDiscovery,
  mapSkillNameToPhase,
  resolveSkillsFromCatalogAndManifests
} from './bmad-help-discovery.js';

export interface SkillInvocation {
  skillName: string;
  phase: 'create' | 'develop' | 'review' | 'test' | 'document' | 'retrospective';
  priority: number;
  reason: string;
  required: boolean;
}

export interface SkillCatalogEntry {
  name: string;
  phase: 'create' | 'develop' | 'review' | 'test' | 'document' | 'retrospective' | string;
  description: string;
  defaultPriority: number;
  /** When this skill is applicable (for Supervisor context). */
  applicableWhen: string;
  precededBy?: string;
  followedBy?: string;
  required?: boolean;
  module?: string;
  menuCode?: string;
  action?: string;
}

/** Native BMad skill catalog — declarative metadata fallback. */
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

export interface RouteSkillsOptions {
  projectRoot?: string;
  customCatalog?: SkillCatalogEntry[];
  driver?: AgentDriver;
  enableBmadHelpDiscovery?: boolean;
  catalogRows?: BmadHelpCatalogRow[];
  manifests?: ScannedSkillManifest[];
}

/**
 * Maps bmad-help.csv catalog rows and SKILL.md manifests into SkillCatalogEntry records.
 */
export function buildDynamicSkillCatalog(
  manifests: ScannedSkillManifest[],
  catalogRows: BmadHelpCatalogRow[]
): SkillCatalogEntry[] {
  const catalogMap = new Map<string, SkillCatalogEntry>();

  // Add default catalog entries
  for (const entry of NATIVE_SKILL_CATALOG) {
    catalogMap.set(entry.name, { ...entry });
  }

  // Populate from CSV catalog
  for (const row of catalogRows) {
    if (!row.skill || row.skill === '_meta') continue;

    const phase = mapSkillNameToPhase(row.skill);
    const existing = catalogMap.get(row.skill);

    catalogMap.set(row.skill, {
      name: row.skill,
      phase,
      description: row.description || row.displayName || existing?.description || '',
      defaultPriority: existing?.defaultPriority ?? 0,
      applicableWhen: row.precededBy
        ? `Preceded by: ${row.precededBy}. Phase: ${row.phase}`
        : existing?.applicableWhen || `Phase: ${row.phase}`,
      precededBy: row.precededBy,
      followedBy: row.followedBy,
      required: row.required,
      module: row.module,
      menuCode: row.menuCode,
      action: row.action
    });
  }

  // Enrich with scanned SKILL.md manifests
  for (const manifest of manifests) {
    const existing = catalogMap.get(manifest.name);
    if (existing) {
      existing.description = manifest.description || existing.description;
      if (manifest.prerequisites.length > 0) {
        existing.precededBy = manifest.prerequisites.join(', ');
      }
    } else {
      catalogMap.set(manifest.name, {
        name: manifest.name,
        phase: manifest.phase ? mapSkillNameToPhase(manifest.name) : mapSkillNameToPhase(manifest.name),
        description: manifest.description || 'Scanned BMad skill',
        defaultPriority: 0,
        applicableWhen: manifest.prerequisites.length
          ? `Prerequisites: ${manifest.prerequisites.join(', ')}`
          : 'Installed BMad skill',
        precededBy: manifest.prerequisites.join(', '),
        required: true
      });
    }
  }

  return Array.from(catalogMap.values());
}

/**
 * Asynchronously loads dynamic skill catalog from project root directory.
 */
export async function loadDynamicSkillCatalog(projectRoot: string): Promise<SkillCatalogEntry[]> {
  const manifests = await scanSkillManifests(projectRoot);
  const catalogRows = await loadBmadHelpCatalog(projectRoot);
  return buildDynamicSkillCatalog(manifests, catalogRows);
}

/**
 * Builds a structured prompt for the Supervisor LLM to decide which
 * BMad skill(s) to invoke for a given story context.
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
 */
export function parseSkillRoutingResponse(llmOutput: string): SkillInvocation[] {
  try {
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
 * Fallback routing when LLM is unavailable or for deterministic lifecycle routing.
 * Uses dynamic catalog entries if provided.
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
 * Main skill routing function. Dynamically utilizes scanned manifests,
 * bmad-help.csv catalog entries, and bmad-help discovery harness.
 */
export function routeSkillsForStory(
  storyKey: string,
  storyStatus: string,
  storyContent: string,
  epicStatus: string,
  allStoriesInEpicDone: boolean,
  optionsOrCatalog?: RouteSkillsOptions | SkillCatalogEntry[]
): SkillInvocation[] {
  let customCatalog: SkillCatalogEntry[] | undefined;
  let options: RouteSkillsOptions | undefined;

  if (Array.isArray(optionsOrCatalog)) {
    customCatalog = optionsOrCatalog;
  } else if (optionsOrCatalog && typeof optionsOrCatalog === 'object') {
    options = optionsOrCatalog;
    customCatalog = options.customCatalog;
  }

  const statusNormalized = (storyStatus || 'backlog').trim().toLowerCase();

  // Check if state is ambiguous or sequence uncertain
  const isAmbiguousStatus = !['backlog', 'ready-for-dev', 'in-progress', 'review', 'done'].includes(statusNormalized);
  const isMissingSpecInDev = (statusNormalized === 'ready-for-dev' || statusNormalized === 'in-progress') && !storyContent.trim();

  // Trigger bmad-help discovery harness if ambiguous state or explicit discovery options provided
  if ((isAmbiguousStatus || isMissingSpecInDev || options?.enableBmadHelpDiscovery) && (options?.catalogRows || options?.manifests)) {
    return resolveSkillsFromCatalogAndManifests(
      {
        storyKey,
        storyStatus,
        storyContent,
        epicStatus,
        projectRoot: options.projectRoot || '',
        driver: options.driver,
        catalogRows: options.catalogRows,
        manifests: options.manifests
      },
      options.catalogRows || [],
      options.manifests || []
    );
  }

  // If custom catalog provided or built dynamically
  if (options?.manifests || options?.catalogRows) {
    const dynamicCatalog = buildDynamicSkillCatalog(options.manifests || [], options.catalogRows || []);
    return fallbackSkillRouting(
      storyKey,
      storyStatus,
      storyContent,
      epicStatus,
      allStoriesInEpicDone,
      dynamicCatalog
    );
  }

  return fallbackSkillRouting(
    storyKey,
    storyStatus,
    storyContent,
    epicStatus,
    allStoriesInEpicDone,
    customCatalog
  );
}

/**
 * Asynchronous skill router that loads dynamic manifests and CSV catalog from project root,
 * executing `/bmad-help` discovery when workflow state is ambiguous.
 */
export async function routeSkillsForStoryAsync(
  storyKey: string,
  storyStatus: string,
  storyContent: string,
  epicStatus: string,
  allStoriesInEpicDone: boolean,
  options: RouteSkillsOptions
): Promise<SkillInvocation[]> {
  if (!options.projectRoot) {
    return routeSkillsForStory(storyKey, storyStatus, storyContent, epicStatus, allStoriesInEpicDone, options);
  }

  const manifests = options.manifests || (await scanSkillManifests(options.projectRoot));
  const catalogRows = options.catalogRows || (await loadBmadHelpCatalog(options.projectRoot));
  const statusNormalized = (storyStatus || 'backlog').trim().toLowerCase();

  const isAmbiguous = !['backlog', 'ready-for-dev', 'in-progress', 'review', 'done'].includes(statusNormalized);
  const isMissingSpec = (statusNormalized === 'ready-for-dev' || statusNormalized === 'in-progress') && !storyContent.trim();

  if (isAmbiguous || isMissingSpec || options.enableBmadHelpDiscovery) {
    const discoveryRes = await runBmadHelpDiscovery({
      storyKey,
      storyStatus,
      storyContent,
      epicStatus,
      projectRoot: options.projectRoot,
      driver: options.driver,
      catalogRows,
      manifests
    });
    if (discoveryRes.recommendedSkills.length > 0) {
      return discoveryRes.recommendedSkills;
    }
  }

  const dynamicCatalog = buildDynamicSkillCatalog(manifests, catalogRows);
  return fallbackSkillRouting(
    storyKey,
    storyStatus,
    storyContent,
    epicStatus,
    allStoriesInEpicDone,
    dynamicCatalog
  );
}
