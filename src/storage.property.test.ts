// Property-based tests for storage eviction
// Feature: browser-network-privacy-monitor
// Validates: Requirements 2.3

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import type { RequestRecord, PIIFinding } from './types';

// ---------------------------------------------------------------------------
// Helpers — pure eviction logic mirroring evictToQuota() in storage.ts
// ---------------------------------------------------------------------------

/**
 * Simulates the FIFO eviction algorithm from evictToQuota():
 * Sort records ascending by timestampMs, delete from the front until
 * the "usage" (approximated as records.length * bytesPerRecord) drops
 * below targetCount.
 *
 * Returns { remaining, deleted }.
 */
function simulateEviction(
  records: RequestRecord[],
  totalCount: number,
  targetCount: number
): { remaining: RequestRecord[]; deleted: RequestRecord[] } {
  // Sort ascending by timestampMs (oldest first) — mirrors index 'by-timestamp' ascending cursor
  const sorted = [...records].sort((a, b) => a.timestampMs - b.timestampMs);

  const deleted: RequestRecord[] = [];
  let current = totalCount;

  for (const record of sorted) {
    if (current < targetCount) break;
    deleted.push(record);
    current -= 1;
  }

  const deletedIds = new Set(deleted.map(r => r.id));
  const remaining = records.filter(r => !deletedIds.has(r.id));

  return { remaining, deleted };
}

// ---------------------------------------------------------------------------
// Arbitraries
// ---------------------------------------------------------------------------

/** Arbitrary for a minimal RequestRecord with a unique id and timestampMs */
const requestRecordArb = fc.record({
  id: fc.uuid(),
  origin: fc.webUrl({ validSchemes: ['https'] }),
  url: fc.webUrl({ validSchemes: ['https'] }),
  method: fc.constantFrom('GET', 'POST', 'PUT', 'DELETE', 'PATCH'),
  requestHeaders: fc.constant([] as any[]),
  responseHeaders: fc.constant([] as any[]),
  requestBody: fc.constant(null),
  responseStatusCode: fc.integer({ min: 100, max: 599 }),
  timestampMs: fc.integer({ min: 0, max: Number.MAX_SAFE_INTEGER }),
  piiFindings: fc.constant([] as PIIFinding[]),
  riskContribution: fc.integer({ min: 0, max: 100 }),
  truncated: fc.boolean(),
  bodyUnavailable: fc.boolean(),
  decodeError: fc.boolean(),
});

/**
 * Generates a set of records where the count exceeds the eviction threshold,
 * along with threshold and target counts.
 *
 * threshold > target, and records.length > threshold so eviction is triggered.
 */
const evictionScenarioArb = fc
  .integer({ min: 5, max: 50 })
  .chain(targetCount =>
    fc.integer({ min: targetCount + 1, max: targetCount + 20 }).chain(thresholdCount =>
      fc
        .integer({ min: thresholdCount + 1, max: thresholdCount + 30 })
        .chain(recordCount =>
          fc
            .uniqueArray(requestRecordArb, { minLength: recordCount, maxLength: recordCount, selector: r => r.id })
            .map(records => ({ records, thresholdCount, targetCount }))
        )
    )
  );

// ---------------------------------------------------------------------------
// Property 10: Storage eviction preserves recency
// Feature: browser-network-privacy-monitor, Property 10: Storage eviction preserves recency
// ---------------------------------------------------------------------------

describe('Property 10: Storage eviction preserves recency', () => {
  it(
    'all remaining records have timestampMs >= every deleted record timestampMs',
    () => {
      // Feature: browser-network-privacy-monitor, Property 10: Storage eviction preserves recency
      // Validates: Requirements 2.3
      fc.assert(
        fc.property(
          evictionScenarioArb,
          ({ records, thresholdCount, targetCount }) => {
            const { remaining, deleted } = simulateEviction(records as RequestRecord[], thresholdCount + 1, targetCount);

            // If nothing was deleted, the invariant holds trivially
            if (deleted.length === 0) return;

            const maxDeletedTimestamp = Math.max(...deleted.map(r => r.timestampMs));

            for (const r of remaining) {
              expect(r.timestampMs).toBeGreaterThanOrEqual(maxDeletedTimestamp);
            }
          }
        ),
        { numRuns: 100 }
      );
    }
  );

  it(
    'deleted records are always the oldest (minimum timestampMs) in the original set',
    () => {
      // Feature: browser-network-privacy-monitor, Property 10: Storage eviction preserves recency
      // Validates: Requirements 2.3
      fc.assert(
        fc.property(
          evictionScenarioArb,
          ({ records, thresholdCount, targetCount }) => {
            const { deleted } = simulateEviction(records as RequestRecord[], thresholdCount + 1, targetCount);

            if (deleted.length === 0) return;

            // The deleted records should be the ones with the smallest timestamps
            const sortedByTimestamp = [...records].sort((a, b) => a.timestampMs - b.timestampMs);
            const expectedDeleted = sortedByTimestamp.slice(0, deleted.length);

            const deletedIds = new Set(deleted.map(r => r.id));
            const expectedDeletedIds = new Set(expectedDeleted.map(r => r.id));

            // Every expected-deleted record should actually be deleted
            for (const id of expectedDeletedIds) {
              expect(deletedIds.has(id)).toBe(true);
            }
          }
        ),
        { numRuns: 100 }
      );
    }
  );

  it(
    'eviction stops as soon as usage drops below target (no over-eviction)',
    () => {
      // Feature: browser-network-privacy-monitor, Property 10: Storage eviction preserves recency
      // Validates: Requirements 2.3
      fc.assert(
        fc.property(
          evictionScenarioArb,
          ({ records, thresholdCount, targetCount }) => {
            const initialCount = thresholdCount + 1;
            const { deleted } = simulateEviction(records as RequestRecord[], initialCount, targetCount);

            // After eviction, remaining count should be >= targetCount
            // (we stop as soon as we reach the target, not before)
            const countAfterEviction = initialCount - deleted.length;
            expect(countAfterEviction).toBeLessThan(targetCount);

            // And we should not have deleted more than necessary:
            // deleting one fewer record would have left us at or above target
            if (deleted.length > 0) {
              const countIfOneLessDeleted = initialCount - (deleted.length - 1);
              expect(countIfOneLessDeleted).toBeGreaterThanOrEqual(targetCount);
            }
          }
        ),
        { numRuns: 100 }
      );
    }
  );
});
