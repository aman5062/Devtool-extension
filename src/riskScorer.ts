// Risk Scorer — pure function, no I/O
// Requirements: 6.1

import type { PIIFinding } from './types';

const WEIGHTS: Record<string, number> = {
  critical: 25,
  high: 10,
  medium: 5,
  low: 1,
};

const CAPS: Record<string, number> = {
  critical: 50,
  high: 30,
  medium: 15,
  low: 5,
};

/**
 * Compute a risk score in [0, 100] from a list of PII findings.
 *
 * Weighted sum with per-severity caps:
 *   Critical: 25 pts each, capped at 50
 *   High:     10 pts each, capped at 30
 *   Medium:    5 pts each, capped at 15
 *   Low:       1 pt  each, capped at  5
 * Total capped at 100.
 */
export function computeRiskScore(findings: PIIFinding[]): number {
  const totals: Record<string, number> = { critical: 0, high: 0, medium: 0, low: 0 };

  for (const finding of findings) {
    const sev = finding.severity.toLowerCase();
    if (sev in totals) {
      totals[sev] += WEIGHTS[sev];
    }
  }

  let score = 0;
  for (const sev of Object.keys(totals)) {
    score += Math.min(totals[sev], CAPS[sev]);
  }

  return Math.min(score, 100);
}
