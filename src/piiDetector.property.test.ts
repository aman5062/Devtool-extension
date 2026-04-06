// Property-based tests for piiDetector
// Feature: browser-network-privacy-monitor
// Validates: Requirements 5.1, 5.2, 5.3

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { detectPII, luhn } from './piiDetector';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Compute the Luhn check digit for a prefix string of digits */
function luhnCheckDigit(prefix: string): string {
  // We treat the prefix as positions len-1 down to 0 (right to left),
  // and the check digit will be at position 0 (rightmost).
  // Alternate doubling starts at position 1 from the right (i.e. the last prefix digit).
  let sum = 0;
  let alternate = true; // position 1 from right (last prefix digit) is doubled
  for (let i = prefix.length - 1; i >= 0; i--) {
    let n = parseInt(prefix[i], 10);
    if (alternate) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    sum += n;
    alternate = !alternate;
  }
  return String((10 - (sum % 10)) % 10);
}

/** Arbitrary that produces a Luhn-valid card number string (13–19 digits) */
const luhnValidCardArb = fc
  .integer({ min: 13, max: 19 })
  .chain(len =>
    fc
      .string({
        unit: fc.constantFrom('0', '1', '2', '3', '4', '5', '6', '7', '8', '9'),
        minLength: len - 1,
        maxLength: len - 1,
      })
      .map(prefix => prefix + luhnCheckDigit(prefix))
  )
  .filter(card => luhn(card)); // double-check

/** Arbitrary that produces a digit string that is NOT Luhn-valid (13–19 digits) */
const luhnInvalidCardArb = fc
  .integer({ min: 13, max: 19 })
  .chain(len =>
    fc.string({
      unit: fc.constantFrom('0', '1', '2', '3', '4', '5', '6', '7', '8', '9'),
      minLength: len,
      maxLength: len,
    })
  )
  .filter(s => !luhn(s));

/**
 * Email arbitrary constrained to start with an alphanumeric character so the
 * word-boundary regex in piiDetector matches the full generated address.
 */
const alphanumEmailArb = fc
  .emailAddress()
  .filter(e => /^[A-Za-z0-9]/.test(e));

// ---------------------------------------------------------------------------
// Property 1: PII detection never stores raw values
// Feature: browser-network-privacy-monitor, Property 1: PII detection never stores raw values
// ---------------------------------------------------------------------------

describe('Property 1: PII detection never stores raw values', () => {
  it('no raw email appears in any finding field', () => {
    // Feature: browser-network-privacy-monitor, Property 1: PII detection never stores raw values
    fc.assert(
      fc.property(
        alphanumEmailArb,
        email => {
          const findings = detectPII(`contact: ${email}`, []);
          for (const f of findings) {
            expect(f.redactedPreview).not.toBe(email);
            expect(f.redactedPreview).not.toContain(email);
            if (f.fieldName) {
              expect(f.fieldName).not.toBe(email);
            }
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('no raw credit card number appears in any finding field', () => {
    // Feature: browser-network-privacy-monitor, Property 1: PII detection never stores raw values
    fc.assert(
      fc.property(
        luhnValidCardArb,
        card => {
          const findings = detectPII(`card: ${card}`, []);
          for (const f of findings) {
            expect(f.redactedPreview).not.toBe(card);
            expect(f.redactedPreview).not.toContain(card);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('no raw bearer token appears in any finding field', () => {
    // Feature: browser-network-privacy-monitor, Property 1: PII detection never stores raw values
    fc.assert(
      fc.property(
        fc.string({ minLength: 8, maxLength: 64 }).filter(s => /^[A-Za-z0-9\-._~+/]+=*$/.test(s)),
        token => {
          const findings = detectPII('', [{ name: 'Authorization', value: `Bearer ${token}` }]);
          for (const f of findings) {
            expect(f.redactedPreview).not.toBe(token);
            expect(f.redactedPreview).not.toContain(token);
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});

// ---------------------------------------------------------------------------
// Property 2: Redacted preview format invariant
// Feature: browser-network-privacy-monitor, Property 2: Redacted preview format invariant
// ---------------------------------------------------------------------------

describe('Property 2: Redacted preview format invariant', () => {
  it('email redactedPreview = first 2 chars + redaction + last 2 chars of matched value', () => {
    // Feature: browser-network-privacy-monitor, Property 2: Redacted preview format invariant — for values ≥ 4 chars, assert preview = first 2 + redaction chars + last 2
    const EMAIL_RE = /\b[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}\b/g;
    fc.assert(
      fc.property(
        alphanumEmailArb,
        email => {
          const payload = `email: ${email}`;
          const findings = detectPII(payload, []);
          const emailFinding = findings.find(f => f.type === 'email');
          if (!emailFinding) return;

          // Find the actual matched value from the payload
          const matches = [...payload.matchAll(EMAIL_RE)];
          if (matches.length === 0) return;
          const matched = matches[0][0];

          if (matched.length < 4) return; // redact() returns '****' for short values

          const preview = emailFinding.redactedPreview;
          expect(preview.slice(0, 2)).toBe(matched.slice(0, 2));
          expect(preview.slice(-2)).toBe(matched.slice(-2));
          const middle = preview.slice(2, -2);
          expect(middle.length).toBeGreaterThan(0);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('credit card redactedPreview = first 2 chars + redaction + last 2 chars', () => {
    // Feature: browser-network-privacy-monitor, Property 2: Redacted preview format invariant — for values ≥ 4 chars, assert preview = first 2 + redaction chars + last 2
    fc.assert(
      fc.property(
        luhnValidCardArb,
        card => {
          const findings = detectPII(`card: ${card}`, []);
          const ccFinding = findings.find(f => f.type === 'credit_card');
          if (!ccFinding) return;

          // card is always >= 13 digits, so >= 4 chars
          const preview = ccFinding.redactedPreview;
          expect(preview.slice(0, 2)).toBe(card.slice(0, 2));
          expect(preview.slice(-2)).toBe(card.slice(-2));
          const middle = preview.slice(2, -2);
          expect(middle.length).toBeGreaterThan(0);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('bearer token redactedPreview = first 2 chars + redaction + last 2 chars', () => {
    // Feature: browser-network-privacy-monitor, Property 2: Redacted preview format invariant — for values ≥ 4 chars, assert preview = first 2 + redaction chars + last 2
    fc.assert(
      fc.property(
        fc.string({ minLength: 8, maxLength: 64 }).filter(s => /^[A-Za-z0-9\-._~+/]+=*$/.test(s)),
        token => {
          const findings = detectPII('', [{ name: 'Authorization', value: `Bearer ${token}` }]);
          const bearerFinding = findings.find(f => f.type === 'bearer_token');
          if (!bearerFinding) return;

          const preview = bearerFinding.redactedPreview;
          expect(preview.slice(0, 2)).toBe(token.slice(0, 2));
          expect(preview.slice(-2)).toBe(token.slice(-2));
          const middle = preview.slice(2, -2);
          expect(middle.length).toBeGreaterThan(0);
        }
      ),
      { numRuns: 100 }
    );
  });
});

// ---------------------------------------------------------------------------
// Property 8: Luhn-valid credit card detection
// Feature: browser-network-privacy-monitor, Property 8: Luhn-valid credit card detection
// ---------------------------------------------------------------------------

describe('Property 8: Luhn-valid credit card detection', () => {
  it('Luhn-valid card numbers are detected as credit_card', () => {
    // Feature: browser-network-privacy-monitor, Property 8: Luhn-valid credit card detection — generate Luhn-valid and Luhn-invalid sequences; assert detection correctness
    fc.assert(
      fc.property(
        luhnValidCardArb,
        card => {
          const findings = detectPII(`card: ${card}`, []);
          expect(findings.some(f => f.type === 'credit_card')).toBe(true);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('Luhn-invalid digit sequences are NOT detected as credit_card', () => {
    // Feature: browser-network-privacy-monitor, Property 8: Luhn-valid credit card detection — generate Luhn-valid and Luhn-invalid sequences; assert detection correctness
    fc.assert(
      fc.property(
        luhnInvalidCardArb,
        card => {
          const findings = detectPII(`card: ${card}`, []);
          expect(findings.some(f => f.type === 'credit_card')).toBe(false);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('luhn() returns true for all generated Luhn-valid cards', () => {
    // Feature: browser-network-privacy-monitor, Property 8: Luhn-valid credit card detection — generate Luhn-valid and Luhn-invalid sequences; assert detection correctness
    fc.assert(
      fc.property(
        luhnValidCardArb,
        card => {
          expect(luhn(card)).toBe(true);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('luhn() returns false for all generated Luhn-invalid cards', () => {
    // Feature: browser-network-privacy-monitor, Property 8: Luhn-valid credit card detection — generate Luhn-valid and Luhn-invalid sequences; assert detection correctness
    fc.assert(
      fc.property(
        luhnInvalidCardArb,
        card => {
          expect(luhn(card)).toBe(false);
        }
      ),
      { numRuns: 100 }
    );
  });
});
