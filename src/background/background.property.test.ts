// Property-based tests for background request pipeline — disabled-site exclusion
// Feature: browser-network-privacy-monitor
// Validates: Requirements 1.6, 9.1, 9.2

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { shouldProcessRequest } from './filterLogic';

// ---------------------------------------------------------------------------
// Arbitraries
// ---------------------------------------------------------------------------

/** Arbitrary for a valid HTTPS origin string, e.g. "https://example.com" */
const originArb = fc
  .webUrl({ validSchemes: ['https'], withQueryParameters: false, withFragments: false })
  .map(url => {
    try {
      return new URL(url).origin;
    } catch {
      return 'https://example.com';
    }
  })
  .filter(o => o !== 'null' && o.startsWith('https://'));

/**
 * Generates a scenario with:
 *  - `allOrigins`: a deduplicated list of origins
 *  - `disabledOrigins`: a non-empty subset of allOrigins that are disabled
 *  - `enabledOrigins`: the remaining origins (not disabled)
 *  - `prefs`: a Preferences object with globalMonitoringEnabled=true and
 *             disabledSites set to disabledOrigins
 */
const disabledSiteScenarioArb = fc
  .uniqueArray(originArb, { minLength: 2, maxLength: 10 })
  .chain(allOrigins =>
    fc
      .integer({ min: 1, max: allOrigins.length })
      .map(disabledCount => {
        const disabledOrigins = allOrigins.slice(0, disabledCount);
        const enabledOrigins = allOrigins.slice(disabledCount);
        const prefs = {
          globalMonitoringEnabled: true,
          disabledSites: disabledOrigins,
        };
        return { allOrigins, disabledOrigins, enabledOrigins, prefs };
      })
  );

// ---------------------------------------------------------------------------
// Property 9: Disabled-site monitoring exclusion
// Feature: browser-network-privacy-monitor, Property 9: Disabled-site monitoring exclusion
// ---------------------------------------------------------------------------

describe('Property 9: Disabled-site monitoring exclusion', () => {
  it('shouldProcessRequest returns false for every origin in disabledSites', () => {
    // Feature: browser-network-privacy-monitor, Property 9: Disabled-site monitoring exclusion
    // Validates: Requirements 1.6, 9.1, 9.2
    fc.assert(
      fc.property(
        disabledSiteScenarioArb,
        ({ disabledOrigins, prefs }) => {
          for (const origin of disabledOrigins) {
            expect(shouldProcessRequest(origin, prefs)).toBe(false);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('shouldProcessRequest returns true for origins NOT in disabledSites (when global monitoring is on)', () => {
    // Feature: browser-network-privacy-monitor, Property 9: Disabled-site monitoring exclusion
    // Validates: Requirements 1.6, 9.1, 9.2
    fc.assert(
      fc.property(
        disabledSiteScenarioArb.filter(s => s.enabledOrigins.length > 0),
        ({ enabledOrigins, prefs }) => {
          for (const origin of enabledOrigins) {
            expect(shouldProcessRequest(origin, prefs)).toBe(true);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('adding an origin to disabledSites always flips shouldProcessRequest to false', () => {
    // Feature: browser-network-privacy-monitor, Property 9: Disabled-site monitoring exclusion
    // Validates: Requirements 1.6, 9.1, 9.2
    fc.assert(
      fc.property(
        originArb,
        fc.array(originArb, { minLength: 0, maxLength: 5 }),
        (targetOrigin, otherDisabled) => {
          const prefsWithout = {
            globalMonitoringEnabled: true,
            disabledSites: otherDisabled.filter(o => o !== targetOrigin),
          };
          const prefsWith = {
            globalMonitoringEnabled: true,
            disabledSites: [...prefsWithout.disabledSites, targetOrigin],
          };

          // Before adding: may or may not be processed (depends on otherDisabled)
          // After adding: must NOT be processed
          expect(shouldProcessRequest(targetOrigin, prefsWith)).toBe(false);

          // If it wasn't already disabled, adding it must change the result
          if (!prefsWithout.disabledSites.includes(targetOrigin)) {
            expect(shouldProcessRequest(targetOrigin, prefsWithout)).toBe(true);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('disabledSites exclusion is independent of global monitoring flag when global is true', () => {
    // Feature: browser-network-privacy-monitor, Property 9: Disabled-site monitoring exclusion
    // Validates: Requirements 1.6, 9.1, 9.2
    fc.assert(
      fc.property(
        originArb,
        fc.array(originArb, { minLength: 1, maxLength: 5 }),
        (origin, disabledSites) => {
          const disabledWithOrigin = [...disabledSites, origin];
          const prefs = { globalMonitoringEnabled: true, disabledSites: disabledWithOrigin };
          // Regardless of what else is in disabledSites, origin must be excluded
          expect(shouldProcessRequest(origin, prefs)).toBe(false);
        }
      ),
      { numRuns: 100 }
    );
  });
});
