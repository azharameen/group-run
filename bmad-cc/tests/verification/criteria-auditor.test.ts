import { describe, it, expect } from 'vitest';
import { auditAcceptanceCriteria } from '../../src/verification/criteria-auditor.js';

describe('auditAcceptanceCriteria', () => {
  it('should parse markdown with mix of checked/unchecked items', () => {
    const markdown = `
# Acceptance Criteria
- [x] Item 1
- [ ] Item 2
- [X] Item 3
    `;
    const result = auditAcceptanceCriteria(markdown);
    expect(result.total).toBe(3);
    expect(result.completed).toBe(2);
    expect(result.pending).toBe(1);
    expect(result.percentage).toBe(67);
    expect(result.items[0].text).toBe('Item 1');
    expect(result.items[0].checked).toBe(true);
    expect(result.items[1].text).toBe('Item 2');
    expect(result.items[1].checked).toBe(false);
  });

  it('should handle nested checkboxes', () => {
    const markdown = `
- [ ] Parent
  - [x] Child 1
  - [ ] Child 2
    `;
    const result = auditAcceptanceCriteria(markdown);
    expect(result.total).toBe(3);
    expect(result.completed).toBe(1);
  });

  it('should handle no checkboxes (empty result)', () => {
    const markdown = `# Title\nJust some text without checkboxes.`;
    const result = auditAcceptanceCriteria(markdown);
    expect(result.total).toBe(0);
    expect(result.percentage).toBe(100);
  });
});
