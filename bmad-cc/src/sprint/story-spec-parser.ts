import { readFile } from 'fs/promises';
import matter from 'gray-matter';

export interface Task {
  text: string;
  checked: boolean;
  subtasks?: Task[];
}

export interface AcceptanceCriterion {
  text: string;
  checked: boolean;
}

export interface StorySpec {
  key: string;
  title: string;
  status?: string;
  type?: string;
  baselineCommit?: string;
  createdDate?: string;
  contextPaths?: string[];
  intent?: string;
  acceptanceCriteria: AcceptanceCriterion[];
  tasks: Task[];
  devNotes?: string;
  filePath: string;
}

/**
 * Parses a single story spec markdown file.
 * Supports both standard and spec-driven formats.
 */
export async function parseStorySpec(filePath: string): Promise<StorySpec> {
  const content = await readFile(filePath, 'utf8');
  const parsed = matter(content);
  const data = parsed.data;
  const body = parsed.content;

  // Extract key from filename (e.g. 4-1-create-interrupt-management-service.md)
  const pathParts = filePath.replace(/\\/g, '/').split('/');
  const filename = pathParts[pathParts.length - 1];
  const key = filename.replace(/\.md$/, '');

  const spec: StorySpec = {
    key,
    title: data.title || extractTitle(body),
    status: data.status,
    type: data.type,
    baselineCommit: data.baseline_commit || data.baseline_revision,
    createdDate: data.created,
    contextPaths: Array.isArray(data.context) ? data.context : [],
    intent: extractSection(body, 'Intent'),
    acceptanceCriteria: extractChecklist(body, ['Acceptance Criteria', 'Tasks / Acceptance Criteria']),
    tasks: extractTasks(body, ['Tasks / Subtasks']),
    devNotes: extractSection(body, 'Dev Notes'),
    filePath,
  };

  return spec;
}

/**
 * Counts checked and unchecked acceptance criteria.
 */
export function getAcceptanceCriteriaCompletion(spec: StorySpec): { total: number; completed: number; percentage: number } {
  const total = spec.acceptanceCriteria.length;
  const completed = spec.acceptanceCriteria.filter(ac => ac.checked).length;
  const percentage = total === 0 ? 0 : Math.round((completed / total) * 100);
  
  return { total, completed, percentage };
}

// Helpers
function extractTitle(body: string): string {
  const match = body.match(/^# (?:Story [\d\.]+:\s*)?(.*)$/m);
  return match ? match[1].trim() : '';
}

function extractSection(body: string, sectionTitle: string): string | undefined {
  const regex = new RegExp(`##\\s+${sectionTitle}\\s*\\n([\\s\\S]*?)(?:\\n## |$)`, 'i');
  const match = body.match(regex);
  return match ? match[1].trim() : undefined;
}

function extractChecklist(body: string, possibleHeaders: string[]): AcceptanceCriterion[] {
  for (const header of possibleHeaders) {
    const section = extractSection(body, header);
    if (section) {
      return parseChecklist(section);
    }
  }
  return [];
}

function extractTasks(body: string, possibleHeaders: string[]): Task[] {
  for (const header of possibleHeaders) {
    const section = extractSection(body, header);
    if (section) {
      return parseChecklist(section).map(ac => ({ text: ac.text, checked: ac.checked }));
    }
  }
  return [];
}

function parseChecklist(text: string): AcceptanceCriterion[] {
  const items: AcceptanceCriterion[] = [];
  const lines = text.split('\n');
  for (const line of lines) {
    const match = line.match(/^\s*-\s*\[([ xX])\]\s+(.*)$/);
    if (match) {
      items.push({
        checked: match[1].toLowerCase() === 'x',
        text: match[2].trim(),
      });
    }
  }
  return items;
}
