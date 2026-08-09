import fs from 'node:fs/promises';
import { parse, stringify } from 'yaml';

/**
 * Parses a YAML string into a typed object.
 * 
 * @param content YAML string.
 * @returns Parsed object of type T.
 */
export function parseYaml<T>(content: string): T {
  return parse(content) as T;
}

/**
 * Stringifies an object to a YAML string.
 * 
 * @param data Object to stringify.
 * @returns YAML string.
 */
export function stringifyYaml(data: unknown): string {
  return stringify(data, {
    indent: 2,
    lineWidth: 0 // Prevent wrapping long lines
  });
}

/**
 * Reads and parses a YAML file.
 * 
 * @param filePath Path to the YAML file.
 * @returns Parsed object of type T.
 */
export async function readYamlFile<T>(filePath: string): Promise<T> {
  const content = await fs.readFile(filePath, 'utf8');
  return parseYaml<T>(content);
}
