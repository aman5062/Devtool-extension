// Unit tests for riskScorer
// Validates: Requirements 6.1

import { describe, it, expect } from 'vitest';
import { computeRiskScore } from './riskScorer';
import type { PIIFinding } from './types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function finding(severity: PIIFinding['severity']): PIIFinding {
  return { type: 'email', severity, redactedPreview: 'ab**cd', location: 'body' };
}

function findings(severity: PIIFinding['severity'], count: number): PIIFinding[] {
  return Array.from({ length: count }, () => finding(severity));
}

// ---------------------------------------------------------------------------
// Zero findings
// ---------------------------------------------------------------------------

describe('computeRiskScore — zero findings', () => {
  it('returns 0 for an empty array', () => {
    expect(computeRiskScore([])).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Single-severity scoring
// ---------------------------------------------------------------------------

describe('computeRiskScore — single severity', () => {
  it('scores one Critical finding as 25', () => {
    expect(computeRiskScore(findings('critical', 1))).toBe(25);
  });

  it('scores one High finding as 10', () => {
    expect(computeRiskScore(findings('high', 1))).toBe(10);
  });

  it('scores one Medium finding as 5', () => {
    expect(computeRiskScore(findings('medium', 1))).toBe(5);
  });

  it('scores one Low finding as 1', () => {
    expect(computeRiskScore(findings('low', 1))).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Per-severity caps
// ---------------------------------------------------------------------------

describe('computeRiskScore — per-severity caps', () => {
  it('caps Critical at 50 (2 findings = 50, not 50+)', () => {
    expect(computeRiskScore(findings('critical', 2))).toBe(50);
  });

  it('caps Critical at 50 even with many findings (10 × 25 = 250 → 50)', () => {
    expect(computeRiskScore(findings('critical', 10))).toBe(50);
  });

  it('caps High at 30 (3 findings = 30, not 30+)', () => {
    expect(computeRiskScore(findings('high', 3))).toBe(30);
  });

  it('caps High at 30 even with many findings (10 × 10 = 100 → 30)', () => {
    expect(computeRiskScore(findings('high', 10))).toBe(30);
  });

  it('caps Medium at 15 (3 findings = 15, not 15+)', () => {
    expect(computeRiskScore(findings('medium', 3))).toBe(15);
  });

  it('caps Medium at 15 even with many findings (10 × 5 = 50 → 15)', () => {
    expect(computeRiskScore(findings('medium', 10))).toBe(15);
  });

  it('caps Low at 5 (5 findings = 5, not 5+)', () => {
    expect(computeRiskScore(findings('low', 5))).toBe(5);
  });

  it('caps Low at 5 even with many findings (20 × 1 = 20 → 5)', () => {
    expect(computeRiskScore(findings('low', 20))).toBe(5);
  });
});

// ---------------------------------------------------------------------------
// Total cap at 100
// ---------------------------------------------------------------------------

describe('computeRiskScore — total cap at 100', () => {
  it('caps total at 100 when all severities are maxed (50+30+15+5 = 100)', () => {
    const all = [
      ...findings('critical', 10),
      ...findings('high', 10),
      ...findings('medium', 10),
      ...findings('low', 10),
    ];
    expect(computeRiskScore(all)).toBe(100);
  });

  it('caps total at 100 for all-Critical overflow', () => {
    expect(computeRiskScore(findings('critical', 100))).toBe(50);
  });

  it('never exceeds 100 for any combination', () => {
    const mixed = [
      ...findings('critical', 5),
      ...findings('high', 5),
      ...findings('medium', 5),
      ...findings('low', 5),
    ];
    expect(computeRiskScore(mixed)).toBeLessThanOrEqual(100);
  });
});

// ---------------------------------------------------------------------------
// Mixed severity scoring
// ---------------------------------------------------------------------------

describe('computeRiskScore — mixed severity', () => {
  it('sums contributions from different severities', () => {
    // 1 critical (25) + 1 high (10) = 35
    const result = computeRiskScore([finding('critical'), finding('high')]);
    expect(result).toBe(35);
  });

  it('sums all four severities without hitting any cap', () => {
    // 1 critical (25) + 1 high (10) + 1 medium (5) + 1 low (1) = 41
    const result = computeRiskScore([
      finding('critical'),
      finding('high'),
      finding('medium'),
      finding('low'),
    ]);
    expect(result).toBe(41);
  });

  it('applies per-severity cap before summing', () => {
    // 3 critical → capped at 50, 1 high → 10; total = 60
    const result = computeRiskScore([...findings('critical', 3), finding('high')]);
    expect(result).toBe(60);
  });

  it('handles critical + medium combination', () => {
    // 1 critical (25) + 2 medium (10) = 35
    const result = computeRiskScore([finding('critical'), ...findings('medium', 2)]);
    expect(result).toBe(35);
  });
});

// ---------------------------------------------------------------------------
// Exact boundary values
// ---------------------------------------------------------------------------

describe('computeRiskScore — exact boundary values', () => {
  it('Critical: 1 finding = 25 (below cap)', () => {
    expect(computeRiskScore(findings('critical', 1))).toBe(25);
  });

  it('Critical: 2 findings = 50 (at cap)', () => {
    expect(computeRiskScore(findings('critical', 2))).toBe(50);
  });

  it('Critical: 3 findings = 50 (above cap, still capped)', () => {
    expect(computeRiskScore(findings('critical', 3))).toBe(50);
  });

  it('High: 2 findings = 20 (below cap)', () => {
    expect(computeRiskScore(findings('high', 2))).toBe(20);
  });

  it('High: 3 findings = 30 (at cap)', () => {
    expect(computeRiskScore(findings('high', 3))).toBe(30);
  });

  it('High: 4 findings = 30 (above cap, still capped)', () => {
    expect(computeRiskScore(findings('high', 4))).toBe(30);
  });

  it('Medium: 2 findings = 10 (below cap)', () => {
    expect(computeRiskScore(findings('medium', 2))).toBe(10);
  });

  it('Medium: 3 findings = 15 (at cap)', () => {
    expect(computeRiskScore(findings('medium', 3))).toBe(15);
  });

  it('Medium: 4 findings = 15 (above cap, still capped)', () => {
    expect(computeRiskScore(findings('medium', 4))).toBe(15);
  });

  it('Low: 4 findings = 4 (below cap)', () => {
    expect(computeRiskScore(findings('low', 4))).toBe(4);
  });

  it('Low: 5 findings = 5 (at cap)', () => {
    expect(computeRiskScore(findings('low', 5))).toBe(5);
  });

  it('Low: 6 findings = 5 (above cap, still capped)', () => {
    expect(computeRiskScore(findings('low', 6))).toBe(5);
  });

  it('total boundary: 50+30+15+5 = 100 (at total cap)', () => {
    const all = [
      ...findings('critical', 2),  // 50
      ...findings('high', 3),      // 30
      ...findings('medium', 3),    // 15
      ...findings('low', 5),       // 5
    ];
    expect(computeRiskScore(all)).toBe(100);
  });
});
