import { readFile } from 'fs/promises';

export interface Epic {
  key: string;
  title: string;
  storyKeys: string[];
  dependencies: string[];
}

/**
 * Parses epics.md markdown to extract epic sections.
 */
export async function parseEpics(filePath: string): Promise<Epic[]> {
  const content = await readFile(filePath, 'utf8');
  const epics: Epic[] = [];
  
  // Simple regex based parsing for epics.md format
  // Assuming markdown structure:
  // # epic-0: Title
  // ## Dependencies
  // - epic-1
  // ## Stories
  // - 0-1-slug
  // - 0-2-slug
  
  const epicBlocks = content.split(/^#\s+/m).filter(block => block.trim());
  
  for (const block of epicBlocks) {
    const lines = block.split('\n');
    const headerMatch = lines[0].match(/^(epic-\d+):\s*(.*)/i);
    
    if (headerMatch) {
      const key = headerMatch[1].toLowerCase();
      const title = headerMatch[2].trim();
      
      const storyKeys: string[] = [];
      const dependencies: string[] = [];
      
      let inStories = false;
      let inDependencies = false;
      
      for (const line of lines.slice(1)) {
        if (/^##\s+Stories/i.test(line)) {
          inStories = true;
          inDependencies = false;
        } else if (/^##\s+Dependencies/i.test(line)) {
          inDependencies = true;
          inStories = false;
        } else if (/^##/.test(line)) {
          inStories = false;
          inDependencies = false;
        } else if (line.trim().startsWith('-')) {
          const item = line.replace(/^-/, '').trim();
          if (inStories) {
            storyKeys.push(item);
          } else if (inDependencies) {
            dependencies.push(item);
          }
        }
      }
      
      epics.push({ key, title, storyKeys, dependencies });
    }
  }
  
  return epics;
}
