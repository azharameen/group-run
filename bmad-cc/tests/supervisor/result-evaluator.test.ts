import { describe, it, expect } from 'vitest';
import { parseReviewFindings, evaluateResult } from '../../src/supervisor/result-evaluator.js';

describe('result-evaluator', () => {
  describe('parseReviewFindings', () => {
    it('returns zero findings for zero/negative count strings', () => {
      const inputs = [
        'Critical findings: 0\nHigh findings: 0',
        'No critical issues identified.',
        '0 critical findings',
        'critical: 0',
        'high: 0',
        'No blockers found during code review.',
        'Critical: 0\nHigh: 0\nMedium: 0\nLow: 0',
        'None identified (0 critical, 0 high issues)'
      ];

      for (const input of inputs) {
        const findings = parseReviewFindings(input);
        expect(findings.critical).toBe(0);
        expect(findings.high).toBe(0);
      }
    });

    it('correctly counts genuine positive findings', () => {
      const input = `
- [Critical] Potential SQL injection in user query handler
- [High] Unhandled null pointer exception in driver
- Medium findings: 2
- Low findings: 5
      `;
      const findings = parseReviewFindings(input);
      expect(findings.critical).toBe(1);
      expect(findings.high).toBe(1);
      expect(findings.medium).toBe(2);
      expect(findings.low).toBe(5);
    });

    it('parses structured numeric key-value findings', () => {
      const input = 'Critical findings: 2\nHigh: 3\nMedium: 0';
      const findings = parseReviewFindings(input);
      expect(findings.critical).toBe(2);
      expect(findings.high).toBe(3);
      expect(findings.medium).toBe(0);
    });

    it('parses count-first severity strings', () => {
      const input = 'Found 3 critical issues and 1 high issue';
      const findings = parseReviewFindings(input);
      expect(findings.critical).toBe(3);
      expect(findings.high).toBe(1);
    });
  });

  describe('evaluateResult', () => {
    it('evaluates clean execution cleanly', async () => {
      const report = await evaluateResult(
        'STORY-1',
        'develop',
        0,
        '3 tests passed',
        '+ line 1\n+ line 2',
        ['src/a.ts'],
        'nonexistent-spec.md',
        'Critical findings: 0\nHigh: 0'
      );

      expect(report.testsPassed).toBe(true);
      expect(report.testsRan).toBe(true);
      expect(report.reviewFindings).toEqual({ critical: 0, high: 0, medium: 0, low: 0 });
      expect(report.errors.length).toBe(0);
    });

    it('records errors when tests fail', async () => {
      const report = await evaluateResult(
        'STORY-1',
        'develop',
        1,
        '1 test failed',
        '',
        [],
        'nonexistent-spec.md',
        'No critical issues'
      );

      expect(report.testsPassed).toBe(false);
      expect(report.errors).toContain('Verification test execution failed');
    });

    it('records errors when critical review findings are present', async () => {
      const report = await evaluateResult(
        'STORY-1',
        'review',
        0,
        '3 tests passed',
        '',
        [],
        'nonexistent-spec.md',
        'Critical findings: 2\nHigh: 0'
      );

      expect(report.reviewFindings?.critical).toBe(2);
      expect(report.errors.some(e => e.includes('Review findings identified 2 critical'))).toBe(true);
    });
  });
});
