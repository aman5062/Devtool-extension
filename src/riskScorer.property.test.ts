// Property-based tests for riskScorer
// Feature: browser-network-privacy-monitor
// Validates: Requirements 6.1

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { computeRiskScore } from './riskScorer';
import type { PIIFinding, PIISeverity, PIIType } from './types';

// ---------------------------------------------------------------------------
// Helpers / Arbitraries
// ---------------------------------------------------------------------------

const severityArb = fc.constantFrom<PIISeverity>('critical', 'high', 'medium', 'low');

const piiTypeArb = fc.constantFrom<PIIType>(
  'email', 'phone', 'credit_card', 'password_field', 'ssn',
  'ipv4', 'ipv6', 'jwt', 'bearer_token', 'basic_auth', 'api_key'
);

const findingArb: fc.Arbitrary<PIIFinding> = fc.record({
  type: piiTypeArb,
  severity: severityArb,
  redactedPreview: fc.string({ minLength: 1, maxLength: 20 }),
  location: fc.constantFrom<'body' | 'header'>('body', 'header'),
  fieldName: fc.option(fc.string({ minLength: 1, maxLength: 20 }), { nil: undefined }),
});

const findingsArb = fc.array(findingArb, { minLength: 0, maxLength: 50 });

// ---------------------------------------------------------------------------
// Property 3: Risk score bounded invariant
// Feature: browser-network-privacy-monitor, Property 3: Risk score bounded invariant
// ---------------------------------------------------------------------------

describe('Property 3: Risk score bounded invariant', () => {
  it('computeRiskScore always returns a value in [0, 100]', () => {
    // Feature: browser-network-privacy-monitor, Property 3: Risk score bounded invariant
    fc.assert(
      fc.property(findingsArb, findings => {
        const score = computeRiskScore(findings);
        expect(score).toBeGreaterThanOrEqual(0);
        expect(score).toBeLessThanOrEqual(100);
      }),
      { numRuns: 100 }
    );
  });
});

// ---------------------------------------------------------------------------
// Property 4: Risk score monotonicity
// Feature: browser-network-privacy-monitor, Property 4: Risk score monotonicity
// ---------------------------------------------------------------------------

describe('Property 4: Risk score monotonicity', () => {
  it('adding more findings never decreases the score (A ⊆ B → score(A) ≤ score(B))', () => {
    // Feature: browser-network-privacy-monitor, Property 4: Risk score monotonicity
    fc.assert(
      fc.property(
        findingsArb,
        findingsArb,
        (a, extra) => {
          // B = A ∪ extra (A is a subset of B)
          const b = [...a, ...extra];
          const scoreA = computeRiskScore(a);
          const scoreB = computeRiskScore(b);
          expect(scoreA).toBeLessThanOrEqual(scoreB);
        }
      ),
      { numRuns: 100 }
    );
  });
});

// ---------------------------------------------------------------------------
// Property 5: Risk score cap per severity
// Feature: browser-network-privacy-monitor, Property 5: Risk score cap per severity
// ---------------------------------------------------------------------------

describe('Property 5: Risk score cap per severity', () => {
  /** Build an arbitrary list of findings all of a single severity */
  function onlySeverityArb(severity: PIISeverity) {
    return fc.array(
      findingArb.map(f => ({ ...f, severity })),
      { minLength: 0, maxLength: 50 }
    );
  }

  it('Critical-only findings contribute at most 50 to the score', () => {
    // Feature: browser-network-privacy-monitor, Property 5: Risk score cap per severity
    fc.assert(
      fc.property(onlySeverityArb('critical'), findings => {
        const score = computeRiskScore(findings);
        expect(score).toBeLessThanOrEqual(50);
      }),
      { numRuns: 100 }
    );
  });

  it('High-only findings contribute at most 30 to the score', () => {
    // Feature: browser-network-privacy-monitor, Property 5: Risk score cap per severity
    fc.assert(
      fc.property(onlySeverityArb('high'), findings => {
        const score = computeRiskScore(findings);
        expect(score).toBeLessThanOrEqual(30);
      }),
      { numRuns: 100 }
    );
  });

  it('Medium-only findings contribute at most 15 to the score', () => {
    // Feature: browser-network-privacy-monitor, Property 5: Risk score cap per severity
    fc.assert(
      fc.property(onlySeverityArb('medium'), findings => {
        const score = computeRiskScore(findings);
        expect(score).toBeLessThanOrEqual(15);
      }),
      { numRuns: 100 }
    );
  });

  it('Low-only findings contribute at most 5 to the score', () => {
    // Feature: browser-network-privacy-monitor, Property 5: Risk score cap per severity
    fc.assert(
      fc.property(onlySeverityArb('low'), findings => {
        const score = computeRiskScore(findings);
        expect(score).toBeLessThanOrEqual(5);
      }),
      { numRuns: 100 }
    );
  });
});
