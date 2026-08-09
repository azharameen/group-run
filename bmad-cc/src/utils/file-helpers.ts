import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';

/**
 * Writes a file atomically by writing to a temporary file first, then renaming.
 * 
 * @param filePath Path of the file to write.
 * @param content String content to write.
 */
export async function atomicWriteFile(filePath: string, content: string): Promise<void> {
  const tempPath = `${filePath}.${Date.now()}.tmp`;
  try {
    await fs.writeFile(tempPath, content, 'utf8');
    await fs.rename(tempPath, filePath);
  } catch (error) {
    if (existsSync(tempPath)) {
      await fs.unlink(tempPath).catch(() => {});
    }
    throw error;
  }
}

/**
 * Ensures that a directory exists, creating it and its parents if necessary.
 * 
 * @param dirPath Directory path to ensure.
 */
export async function ensureDir(dirPath: string): Promise<void> {
  await fs.mkdir(dirPath, { recursive: true });
}

/**
 * Resolves a path relative to the project root.
 * 
 * @param projectRoot The root directory.
 * @param relativePath The relative path from the root.
 * @returns Absolute path.
 */
export function resolvePath(projectRoot: string, relativePath: string): string {
  return path.resolve(projectRoot, relativePath);
}

/**
 * Checks if a file exists asynchronously.
 * 
 * @param filePath Path to check.
 * @returns true if the file exists, false otherwise.
 */
export async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}
