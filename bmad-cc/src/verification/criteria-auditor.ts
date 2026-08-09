export interface CriterionItem {
  text: string;
  checked: boolean;
  lineNumber: number;
}

export interface AuditResult {
  total: number;
  completed: number;
  pending: number;
  percentage: number;
  items: CriterionItem[];
}

export function auditAcceptanceCriteria(markdownContent: string): AuditResult {
  const lines = markdownContent.split('\n');
  const items: CriterionItem[] = [];
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const match = line.match(/^(\s*)-\s+\[([ xX])\]\s+(.*)/);
    
    if (match) {
      const checked = match[2].toLowerCase() === 'x';
      const text = match[3].trim();
      
      items.push({
        text,
        checked,
        lineNumber: i + 1,
      });
    }
  }

  const total = items.length;
  const completed = items.filter(item => item.checked).length;
  const pending = total - completed;
  const percentage = total === 0 ? 100 : Math.round((completed / total) * 100);

  return {
    total,
    completed,
    pending,
    percentage,
    items,
  };
}
