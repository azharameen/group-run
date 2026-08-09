import type { AgentDriver } from '../agent/driver-interface.js';
import type { SkillInvocation } from './skill-router.js';
import { loadBmadHelpCatalog, extractModuleMetaDocs, type BmadHelpCatalogRow } from './catalog-parser.js';
import { scanSkillManifests, type ScannedSkillManifest } from './skill-manifest-scanner.js';

export interface DiscoveryContext {
  storyKey: string;
  storyStatus: string;
  storyContent: string;
  epicStatus: string;
  projectRoot: string;
  driver?: AgentDriver;
  catalogRows?: BmadHelpCatalogRow[];
  manifests?: ScannedSkillManifest[];
}

export interface BmadHelpDiscoveryResult {
  recommendedSkills: SkillInvocation[];
  reasoning: string;
  discoveredViaDriver: boolean;
  moduleDocsConsulted: string[];
}

/**
 * Dynamic `bmad-help` Discovery Harness.
 * Spawns a CLI driver session executing `/bmad-help` (or inspecting catalog & module llms.txt docs)
 * to resolve workflow routing when supervisor state is ambiguous, missing prerequisites, or skill sequence is uncertain.
 */
export async function runBmadHelpDiscovery(
  ctx: DiscoveryContext
): Promise<BmadHelpDiscoveryResult> {
  const catalogRows = ctx.catalogRows || (await loadBmadHelpCatalog(ctx.projectRoot));
  const manifests = ctx.manifests || (await scanSkillManifests(ctx.projectRoot));
  const metaDocs = extractModuleMetaDocs(catalogRows);

  const moduleDocsConsulted = metaDocs.map(m => `${m.module}: ${m.docsUrlOrPath}`);

  // Build a prompt for /bmad-help execution
  const prompt = `/bmad-help query: Determine the exact recommended BMad skill sequence for story '${ctx.storyKey}' with current status '${ctx.storyStatus}'.
Context:
- Story Spec: ${ctx.storyContent ? ctx.storyContent.substring(0, 1000) : '(No spec written)'}
- Epic Status: ${ctx.epicStatus}
- Installed Skills: ${manifests.map(m => m.name).join(', ')}
- Available Catalog Entries: ${catalogRows.filter(r => r.skill !== '_meta').map(r => r.skill).join(', ')}

Please consult the catalog manifest (_bmad/_config/bmad-help.csv) and module documentation (${metaDocs.map(m => m.docsUrlOrPath).join(', ')}) to output recommended next skill(s) as JSON array:
[{"skillName": "...", "phase": "...", "priority": 0, "reason": "...", "required": true}]`;

  let driverOutput = '';
  let discoveredViaDriver = false;

  if (ctx.driver) {
    try {
      const sessionResult = await ctx.driver.execute({
        prompt,
        workingDirectory: ctx.projectRoot
      });
      if (sessionResult) {
        driverOutput = `${sessionResult.stdout || ''}\n${sessionResult.stderr || ''}`;
      }
    } catch (_err) {
      driverOutput = '';
      discoveredViaDriver = false;
    }
  }

  let recommendedSkills: SkillInvocation[] = [];
  if (driverOutput && driverOutput.trim().length > 0) {
    try {
      recommendedSkills = parseBmadHelpDriverOutput(driverOutput);
    } catch {
      recommendedSkills = [];
    }
  }

  if (recommendedSkills.length > 0) {
    discoveredViaDriver = true;
  } else {
    discoveredViaDriver = false;
    recommendedSkills = resolveSkillsFromCatalogAndManifests(ctx, catalogRows, manifests);
  }

  return {
    recommendedSkills,
    reasoning: `Discovered skills via bmad-help harness for '${ctx.storyKey}' (status: '${ctx.storyStatus}')`,
    discoveredViaDriver,
    moduleDocsConsulted
  };
}

/**
 * Parses JSON or skill references returned from a `/bmad-help` driver execution session.
 */
export function parseBmadHelpDriverOutput(output: string): SkillInvocation[] {
  try {
    const jsonMatch = output.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      if (Array.isArray(parsed)) {
        const valid = parsed
          .filter((s: any) => typeof s.skillName === 'string')
          .map((s: any) => ({
            skillName: s.skillName,
            phase: s.phase || mapSkillNameToPhase(s.skillName),
            priority: typeof s.priority === 'number' ? s.priority : 0,
            reason: s.reason || `[bmad-help] Recommended skill ${s.skillName}`,
            required: typeof s.required === 'boolean' ? s.required : true
          }));
        if (valid.length > 0) return valid;
      }
    }
  } catch {
    // Ignore JSON parse error and fallback to regex scanning
  }

  // Regex extraction of skill names from bmad-help text response
  const skills: SkillInvocation[] = [];
  const skillMatches = output.match(/bmad-[a-z0-9-]+/gi);
  if (skillMatches) {
    const uniqueSkills = Array.from(new Set(skillMatches));
    uniqueSkills.forEach((skillName, idx) => {
      if (skillName !== 'bmad-help') {
        skills.push({
          skillName,
          phase: mapSkillNameToPhase(skillName),
          priority: idx,
          reason: `[bmad-help] Discovered ${skillName} in help response`,
          required: true
        });
      }
    });
  }

  return skills;
}

/**
 * Helper to map skill names to standard supervisor phases
 */
export function mapSkillNameToPhase(skillName: string): 'create' | 'develop' | 'review' | 'test' | 'document' | 'retrospective' {
  const lower = skillName.toLowerCase();
  if (lower.includes('create-story') || lower.includes('prd') || lower.includes('product-brief')) {
    return 'create';
  }
  if (lower.includes('review') || lower.includes('code-review')) {
    return 'review';
  }
  if (lower.includes('retrospective')) {
    return 'retrospective';
  }
  if (lower.includes('test') || lower.includes('qa')) {
    return 'test';
  }
  if (lower.includes('document')) {
    return 'document';
  }
  return 'develop';
}

/**
 * Analyzes `bmad-help.csv` catalog rows and scanned manifests to dynamically resolve skill sequence
 * when driver is not present or driver response is unparseable.
 */
export function resolveSkillsFromCatalogAndManifests(
  ctx: DiscoveryContext,
  catalog: BmadHelpCatalogRow[],
  manifests: ScannedSkillManifest[]
): SkillInvocation[] {
  const result: SkillInvocation[] = [];
  const statusNormalized = (ctx.storyStatus || 'backlog').trim().toLowerCase();

  // Find entries in catalog matching current status / phase
  if (statusNormalized === 'backlog' || !ctx.storyContent.trim()) {
    const createRow = catalog.find(r => r.phase === '4-implementation' && r.skill === 'bmad-create-story')
      || catalog.find(r => r.skill === 'bmad-create-story');
    if (createRow) {
      result.push({
        skillName: createRow.skill,
        phase: 'create',
        priority: 0,
        reason: `[catalog] Story ${ctx.storyKey} in backlog; catalog recommends ${createRow.displayName || createRow.skill}`,
        required: createRow.required
      });
    }
  } else if (statusNormalized === 'ready-for-dev' || statusNormalized === 'in-progress' || statusNormalized === 'draft') {
    // Check prerequisites: e.g. bmad-architecture or bmad-ux
    if (/\b(ui|frontend|layout|component)\b/i.test(ctx.storyContent)) {
      const uxRow = catalog.find(r => r.skill === 'bmad-ux');
      if (uxRow) {
        result.push({
          skillName: uxRow.skill,
          phase: 'develop',
          priority: -2,
          reason: `[catalog] Story UI requirements detected; catalog recommends ${uxRow.displayName || uxRow.skill}`,
          required: uxRow.required
        });
      }
    }
    if (/\b(architecture|schema|database|system design)\b/i.test(ctx.storyContent)) {
      const archRow = catalog.find(r => r.skill === 'bmad-architecture');
      if (archRow) {
        result.push({
          skillName: archRow.skill,
          phase: 'develop',
          priority: -1,
          reason: `[catalog] Architectural requirements detected; catalog recommends ${archRow.displayName || archRow.skill}`,
          required: archRow.required
        });
      }
    }

    const devRow = catalog.find(r => r.skill === 'bmad-dev-story');
    if (devRow) {
      result.push({
        skillName: devRow.skill,
        phase: 'develop',
        priority: 0,
        reason: `[catalog] Development phase; catalog recommends ${devRow.displayName || devRow.skill}`,
        required: devRow.required
      });
    }
  } else if (statusNormalized === 'review') {
    const reviewRow = catalog.find(r => r.skill === 'bmad-code-review');
    if (reviewRow) {
      result.push({
        skillName: reviewRow.skill,
        phase: 'review',
        priority: 0,
        reason: `[catalog] Review phase; catalog recommends ${reviewRow.displayName || reviewRow.skill}`,
        required: reviewRow.required
      });
    }
  }

  // Check if any installed SKILL.md manifests match
  if (result.length === 0 && manifests.length > 0) {
    const defaultManifest = manifests.find(m => m.name === 'bmad-dev-story') || manifests[0];
    result.push({
      skillName: defaultManifest.name,
      phase: mapSkillNameToPhase(defaultManifest.name),
      priority: 0,
      reason: `[manifest] Scanned manifest recommends ${defaultManifest.name}`,
      required: true
    });
  }

  // Final fallback to bmad-create-story if empty spec or bmad-dev-story if spec present
  if (result.length === 0) {
    if (!ctx.storyContent.trim()) {
      result.push({
        skillName: 'bmad-create-story',
        phase: 'create',
        priority: 0,
        reason: `[discovery fallback] Missing spec; defaulting to bmad-create-story`,
        required: true
      });
    } else {
      result.push({
        skillName: 'bmad-dev-story',
        phase: 'develop',
        priority: 0,
        reason: `[discovery fallback] Spec present; defaulting to bmad-dev-story`,
        required: true
      });
    }
  }

  return result.sort((a, b) => a.priority - b.priority);
}
