import { readFile } from 'fs/promises';
import { parse } from 'yaml';

export interface SprintStatusMeta {
  generated?: string;
  lastUpdated?: string;
  project?: string;
  projectKey?: string;
  trackingSystem?: string;
  storyLocation?: string;
}

export type StoryStatusValue = 'backlog' | 'ready-for-dev' | 'in-progress' | 'review' | 'done' | 'optional';

export type DevelopmentStatus = Record<string, StoryStatusValue>;

export interface ActionItem {
  epic: string | number;
  action: string;
  owner: string;
  status: string;
}

export interface SprintStatus {
  meta: SprintStatusMeta;
  developmentStatus: DevelopmentStatus;
  actionItems: ActionItem[];
}

/**
 * Reads and parses the sprint status YAML file.
 */
export async function parseSprintStatus(filePath: string): Promise<SprintStatus> {
  try {
    const fileContent = await readFile(filePath, 'utf8');
    const parsed = parse(fileContent);

    const meta: SprintStatusMeta = {
      generated: parsed.generated,
      lastUpdated: parsed.last_updated,
      project: parsed.project,
      projectKey: parsed.project_key,
      trackingSystem: parsed.tracking_system,
      storyLocation: parsed.story_location,
    };

    return {
      meta,
      developmentStatus: parsed.development_status || {},
      actionItems: parsed.action_items || [],
    };
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`Failed to parse sprint status: ${error.message}`);
    }
    throw error;
  }
}

/**
 * Extracts epic-N keys from the development status.
 */
export function getEpicKeys(status: SprintStatus): string[] {
  return Object.keys(status.developmentStatus).filter((key) => /^epic-\d+$/.test(key));
}

/**
 * Extracts story keys for a given epic.
 */
export function getStoryKeysForEpic(status: SprintStatus, epicKey: string): string[] {
  const epicMatch = epicKey.match(/^epic-(\d+)$/);
  if (!epicMatch) return [];
  const epicNumber = epicMatch[1];
  
  const prefix = `${epicNumber}-`;
  return Object.keys(status.developmentStatus).filter((key) => key.startsWith(prefix) && !key.endsWith('-retrospective'));
}

/**
 * Filters stories by their status.
 */
export function getStoriesByStatus(status: SprintStatus, targetStatus: StoryStatusValue): string[] {
  return Object.entries(status.developmentStatus)
    .filter(([key, val]) => val === targetStatus && /^\d+-\d+-/.test(key))
    .map(([key]) => key);
}

/**
 * Finds the first backlog or ready-for-dev story.
 */
export function getNextActionableStory(status: SprintStatus): string | null {
  const allStories = Object.keys(status.developmentStatus).filter((key) => /^\d+-\d+-/.test(key));
  
  // Try to find ready-for-dev first, then backlog
  const readyStory = allStories.find((key) => status.developmentStatus[key] === 'ready-for-dev');
  if (readyStory) return readyStory;

  const backlogStory = allStories.find((key) => status.developmentStatus[key] === 'backlog');
  return backlogStory || null;
}
