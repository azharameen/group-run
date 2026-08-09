import { promises as fs } from 'node:fs';

/**
 * Represents the result of a validation check on a file.
 */
export interface ValidationResult {
  file: string;
  valid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * Validates a sprint-status.yaml file.
 * 
 * @param filePath The path to the sprint-status.yaml file.
 * @returns A promise resolving to the ValidationResult.
 */
export async function validateSprintStatus(filePath: string): Promise<ValidationResult> {
  const result: ValidationResult = { file: filePath, valid: true, errors: [], warnings: [] };
  try {
    const content = await fs.readFile(filePath, 'utf8');
    
    if (!content.includes('development_status:')) {
      result.valid = false;
      result.errors.push('Missing required key: development_status');
    }
    
    // Basic regex check for enum values in development_status map
    // Expected values like Pending, In Progress, Review, Completed, etc.
    const statusRegex = /^[-\s]*\w+:\s*(Pending|In Progress|Review|Testing|Completed|Failed|Blocked)$/gm;
    const statusesFound = content.match(statusRegex);
    if (!statusesFound && content.includes('development_status:')) {
       result.warnings.push('Could not detect valid status enum values. Ensure statuses are valid.');
    }
  } catch (err: any) {
    result.valid = false;
    result.errors.push(`Failed to read file: ${err.message}`);
  }
  return result;
}

/**
 * Validates a story markdown file.
 * 
 * @param filePath The path to the story markdown file.
 * @returns A promise resolving to the ValidationResult.
 */
export async function validateStorySpec(filePath: string): Promise<ValidationResult> {
  const result: ValidationResult = { file: filePath, valid: true, errors: [], warnings: [] };
  try {
    const content = await fs.readFile(filePath, 'utf8');
    
    if (!content.startsWith('---')) {
      result.valid = false;
      result.errors.push('Missing YAML frontmatter');
    }
    
    if (!/^#\s+.+/m.test(content)) {
      result.valid = false;
      result.errors.push('Missing story title (H1)');
    }
    
    if (!/##\s+(Acceptance Criteria|Tasks)/i.test(content)) {
      result.valid = false;
      result.errors.push('Missing Acceptance Criteria or Tasks section');
    }
  } catch (err: any) {
    result.valid = false;
    result.errors.push(`Failed to read file: ${err.message}`);
  }
  return result;
}

/**
 * Validates an epics.md file.
 * 
 * @param filePath The path to the epic file.
 * @returns A promise resolving to the ValidationResult.
 */
export async function validateEpicFile(filePath: string): Promise<ValidationResult> {
  const result: ValidationResult = { file: filePath, valid: true, errors: [], warnings: [] };
  try {
    const content = await fs.readFile(filePath, 'utf8');
    
    if (!/##\s+.+/m.test(content)) {
      result.valid = false;
      result.errors.push('No epic sections found (H2)');
    }
    
    if (!/-\s+\[[ x]\]\s+.+/m.test(content)) {
      result.warnings.push('No story lists or task items found within epics');
    }
  } catch (err: any) {
    result.valid = false;
    result.errors.push(`Failed to read file: ${err.message}`);
  }
  return result;
}
