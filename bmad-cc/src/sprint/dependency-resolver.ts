import { SprintStatus, getEpicKeys, getStoryKeysForEpic, StoryStatusValue } from './sprint-status-parser.js';
import { Epic } from './epic-parser.js';

export interface StoryQueueItem {
  storyKey: string;
  epicKey: string;
  status: StoryStatusValue;
  priority: number;
}

/**
 * Resolves the order of stories to execute based on epic order and story numbers.
 * Epics are ordered numerically by default.
 * Stories are ordered numerically by their index.
 */
export function resolveDependencyOrder(sprintStatus: SprintStatus, epics: Epic[]): StoryQueueItem[] {
  const queue: StoryQueueItem[] = [];
  
  // Use epic keys from status or from the epics array (which provides ordering)
  const statusEpicKeys = getEpicKeys(sprintStatus);
  const orderedEpics = [...epics].sort((a, b) => getEpicIndex(a.key) - getEpicIndex(b.key));
  
  // If an epic is in status but not in the markdown, add it at the end
  for (const key of statusEpicKeys) {
    if (!orderedEpics.find((e) => e.key === key)) {
      orderedEpics.push({ key, title: key, storyKeys: getStoryKeysForEpic(sprintStatus, key), dependencies: [] });
    }
  }

  let priority = 1;

  for (const epic of orderedEpics) {
    const stories = getStoryKeysForEpic(sprintStatus, epic.key);
    
    // Sort stories numerically e.g., 1-1, 1-2, 1-10
    stories.sort((a, b) => {
      const getNum = (s: string) => parseInt(s.split('-')[1] || '0', 10);
      return getNum(a) - getNum(b);
    });

    for (const storyKey of stories) {
      const status = sprintStatus.developmentStatus[storyKey];
      if (status) {
        queue.push({
          storyKey,
          epicKey: epic.key,
          status,
          priority: priority++
        });
      }
    }
  }

  return queue;
}

function getEpicIndex(epicKey: string): number {
  const match = epicKey.match(/^epic-(\d+)$/);
  return match ? parseInt(match[1], 10) : 9999;
}
