import fs from 'fs/promises';
import path from 'path';
import { fileExists } from '../utils/file-helpers.js';

export interface ScannedSkillManifest {
  name: string;
  description: string;
  prerequisites: string[];
  phase?: string;
  path: string;
}

function cleanQuote(str: string): string {
  let s = str.trim();
  if ((s.startsWith("'") && s.endsWith("'")) || (s.startsWith('"') && s.endsWith('"'))) {
    return s.slice(1, -1);
  }
  return s;
}

/**
 * Scans installed BMad skills under `.agent/skills/<skill-name>/SKILL.md`
 * Parses YAML frontmatter (name, description, prerequisites/preceded-by, etc.)
 */
export async function scanSkillManifests(projectRoot: string): Promise<ScannedSkillManifest[]> {
  const skillsDir = path.join(projectRoot, '.agent', 'skills');
  if (!(await fileExists(skillsDir))) {
    return [];
  }

  const results: ScannedSkillManifest[] = [];

  try {
    const entries = await fs.readdir(skillsDir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) {
        const skillFilePath = path.join(skillsDir, entry.name, 'SKILL.md');
        if (await fileExists(skillFilePath)) {
          try {
            const content = await fs.readFile(skillFilePath, 'utf8');
            const parsed = parseSkillFrontmatter(content, skillFilePath, entry.name);
            if (parsed) {
              results.push(parsed);
            }
          } catch {
            // Ignore unparseable individual skill files
          }
        }
      }
    }
  } catch {
    // If reading directory fails
  }

  return results;
}

/**
 * Helper to parse YAML frontmatter delimited by `---`
 */
export function parseSkillFrontmatter(
  content: string,
  filePath: string,
  dirName: string
): ScannedSkillManifest | null {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) {
    return {
      name: dirName,
      description: '',
      prerequisites: [],
      path: filePath
    };
  }

  const yamlText = match[1];
  const lines = yamlText.split(/\r?\n/);
  
  let name = dirName;
  let description = '';
  const prerequisites: string[] = [];
  let phase: string | undefined;

  let inPrereqsArray = false;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    if (inPrereqsArray && trimmed.startsWith('-')) {
      const val = cleanQuote(trimmed.slice(1));
      if (val) prerequisites.push(val);
      continue;
    }

    const keyValMatch = line.match(/^([a-zA-Z0-9_-]+):\s*(.*)$/);
    if (keyValMatch) {
      const key = keyValMatch[1].toLowerCase();
      const rawVal = keyValMatch[2].trim();
      inPrereqsArray = false;

      const unquotedVal = cleanQuote(rawVal);

      if (key === 'name') {
        if (unquotedVal) name = unquotedVal;
      } else if (key === 'description') {
        description = unquotedVal;
      } else if (key === 'phase') {
        phase = unquotedVal;
      } else if (key === 'prerequisites' || key === 'preceded-by' || key === 'preceded_by') {
        if (rawVal.startsWith('[')) {
          const items = rawVal
            .replace(/^\[|\]$/g, '')
            .split(',')
            .map(s => cleanQuote(s))
            .filter(Boolean);
          prerequisites.push(...items);
        } else if (!rawVal) {
          inPrereqsArray = true;
        } else {
          prerequisites.push(unquotedVal);
        }
      }
    }
  }

  return {
    name,
    description,
    prerequisites,
    phase,
    path: filePath
  };
}
