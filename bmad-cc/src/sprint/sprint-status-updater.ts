import { StoryStatusValue } from './sprint-status-parser.js';

/**
 * DEPRECATED / ZERO-MUTATION PRIMITIVE:
 * Direct programmatic file modifications to sprint-status.yaml are removed.
 * In accordance with BMad architecture (R1 & R2), sprint status updates are driven
 * natively by BMad skill execution (e.g., bmad-dev-story, bmad-code-review) within
 * CLI driver agent sessions.
 */

export async function updateStoryStatus(_filePath: string, _storyKey: string, _newStatus: StoryStatusValue): Promise<void> {
  // No-op: Sprint status updates are performed natively by BMad skills within CLI drivers.
}

export async function updateEpicStatus(_filePath: string, _epicKey: string, _newStatus: StoryStatusValue): Promise<void> {
  // No-op: Epic status updates are performed natively by BMad skills within CLI drivers.
}

export async function updateLastUpdated(_filePath: string): Promise<void> {
  // No-op: Last updated timestamps are updated natively by BMad skills within CLI drivers.
}
