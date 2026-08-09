import { readFile, writeFile } from 'fs/promises';
import { parseDocument, Document } from 'yaml';
import { StoryStatusValue } from './sprint-status-parser.js';

async function updateYamlKey(filePath: string, yamlPath: string[], newValue: any): Promise<void> {
  const content = await readFile(filePath, 'utf8');
  const doc = parseDocument(content);
  
  doc.setIn(yamlPath, newValue);
  
  await writeFile(filePath, doc.toString(), 'utf8');
}

/**
 * Updates a specific story's status in the sprint status file.
 */
export async function updateStoryStatus(filePath: string, storyKey: string, newStatus: StoryStatusValue): Promise<void> {
  await updateYamlKey(filePath, ['development_status', storyKey], newStatus);
}

/**
 * Updates a specific epic's status in the sprint status file.
 */
export async function updateEpicStatus(filePath: string, epicKey: string, newStatus: StoryStatusValue): Promise<void> {
  await updateYamlKey(filePath, ['development_status', epicKey], newStatus);
}

/**
 * Updates the last_updated date to today in YYYY-MM-DD format.
 */
export async function updateLastUpdated(filePath: string): Promise<void> {
  const today = new Date().toISOString().split('T')[0];
  const content = await readFile(filePath, 'utf8');
  const doc = parseDocument(content);
  
  doc.set('last_updated', today);
  
  await writeFile(filePath, doc.toString(), 'utf8');
}
