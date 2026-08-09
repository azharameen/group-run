import type { SprintStatus, StoryStatusValue } from '../sprint/sprint-status-parser.js';

export interface QueuedStory {
  storyKey: string;
  epicKey: string;
  currentStatus: StoryStatusValue;
  priority: number;        // Lower = execute first
}

export interface QueueFilterOptions {
  epic?: string;    // e.g. 'EP-4', 'epic-4', or '4'
  status?: string;  // e.g. 'backlog', 'review', 'in-progress'
}

export class ExecutionQueue {
  private queue: QueuedStory[] = [];
  private completed: Set<string> = new Set();
  private skipped: Set<string> = new Set();
  private current: QueuedStory | null = null;
  private totalStoriesCount: number = 0;

  /** Build queue from sprint status, filtering out done stories and applying filter options */
  public buildFromSprintStatus(sprintStatus: SprintStatus, filters?: QueueFilterOptions): void {
    const stories: QueuedStory[] = [];
    let totalCount = 0;

    // Normalize epic filter if provided (e.g. '4', 'EP-4', 'epic-4' -> 'epic-4')
    let targetEpicKey: string | null = null;
    if (filters?.epic) {
      const match = filters.epic.match(/(\d+)/);
      if (match) {
        targetEpicKey = `epic-${match[1]}`;
      }
    }

    const targetStatus = filters?.status?.toLowerCase();

    for (const [key, value] of Object.entries(sprintStatus.developmentStatus)) {
      if (key.startsWith('epic-') || key.endsWith('-retrospective')) {
        continue;
      }
      
      const match = key.match(/^(\d+)-(\d+)-.+$/);
      if (match) {
        totalCount++;
        const epicNum = parseInt(match[1], 10);
        const storyNum = parseInt(match[2], 10);
        const epicKey = `epic-${epicNum}`;
        const priority = epicNum * 1000 + storyNum;

        // Apply epic filter
        if (targetEpicKey && epicKey !== targetEpicKey) {
          continue;
        }

        // Apply status filter
        if (targetStatus && value.toLowerCase() !== targetStatus) {
          continue;
        }

        if (value !== 'done') {
          stories.push({
            storyKey: key,
            epicKey,
            currentStatus: value,
            priority
          });
        } else {
          this.completed.add(key);
        }
      }
    }

    this.totalStoriesCount = totalCount;
    this.queue = stories.sort((a, b) => a.priority - b.priority);
  }

  /** Get the next story to execute (or null if queue is empty) */
  public next(): QueuedStory | null {
    while (this.queue.length > 0) {
      const item = this.queue.shift();
      if (item && !this.completed.has(item.storyKey) && !this.skipped.has(item.storyKey)) {
        this.current = item;
        return item;
      }
    }
    this.current = null;
    return null;
  }

  /** Mark current story as completed */
  public markCompleted(storyKey: string): void {
    this.completed.add(storyKey);
    if (this.current?.storyKey === storyKey) {
      this.current = null;
    }
  }

  /** Mark current story as skipped */
  public markSkipped(storyKey: string): void {
    this.skipped.add(storyKey);
    if (this.current?.storyKey === storyKey) {
      this.current = null;
    }
  }

  /** Get remaining count */
  public remaining(): number {
    return this.queue.filter(q => !this.completed.has(q.storyKey) && !this.skipped.has(q.storyKey)).length + (this.current ? 1 : 0);
  }

  /** Get total count (including done) */
  public total(): number {
    return this.totalStoriesCount;
  }

  /** Get progress percentage */
  public progress(): number {
    if (this.totalStoriesCount === 0) return 100;
    const doneOrSkippedOrCompleted = this.totalStoriesCount - this.remaining();
    return Math.round((doneOrSkippedOrCompleted / this.totalStoriesCount) * 100);
  }

  /** Get all stories grouped by status */
  public getStatusSummary(): Record<string, QueuedStory[]> {
    const summary: Record<string, QueuedStory[]> = {};
    for (const story of this.queue) {
      if (!summary[story.currentStatus]) {
        summary[story.currentStatus] = [];
      }
      summary[story.currentStatus].push(story);
    }
    return summary;
  }
}
