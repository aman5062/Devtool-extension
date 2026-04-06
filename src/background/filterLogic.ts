// Pure filtering logic for the background request pipeline
// Extracted for testability — no Chrome API dependencies
// Requirements: 1.6, 9.1, 9.2

/**
 * Determines whether a request from `origin` should be processed given the
 * current preferences.  Returns true when the request should be recorded,
 * false when it should be silently skipped.
 *
 * Pure function — no side effects, no I/O.
 */
export function shouldProcessRequest(
  origin: string,
  prefs: { globalMonitoringEnabled: boolean; disabledSites: string[] },
): boolean {
  if (!prefs.globalMonitoringEnabled) return false;
  if (prefs.disabledSites.includes(origin)) return false;
  return true;
}
