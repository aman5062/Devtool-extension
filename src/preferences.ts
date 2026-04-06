// Preferences store for Browser Network Privacy Monitor
// Uses chrome.storage.local with in-memory fallback for non-extension environments
// Requirements: 9.1, 9.5, 8.3

import type { Preferences, SiteRiskScore } from './types';

const PREFS_KEY = 'preferences';
const RISK_SCORES_KEY = 'siteRiskScores';

const DEFAULT_PREFERENCES: Preferences = {
  globalMonitoringEnabled: true,
  disabledSites: [],
  autoCapture: true,
  enableShield: true,
  detectPII: true,
  showNotifications: false,
  darkMode: true,
};

// In-memory fallback store (used when chrome.storage.local is unavailable)
let inMemoryPrefs: Preferences = { ...DEFAULT_PREFERENCES };
let inMemoryRiskScores: SiteRiskScore = {};

function isStorageAvailable(): boolean {
  return typeof chrome !== 'undefined' && chrome?.storage?.local != null;
}

export async function getPreferences(): Promise<Preferences> {
  if (!isStorageAvailable()) {
    console.warn(
      '[preferences] chrome.storage.local is unavailable; using in-memory preferences.'
    );
    return { ...inMemoryPrefs };
  }

  return new Promise((resolve) => {
    chrome.storage.local.get(PREFS_KEY, (result) => {
      const stored = result[PREFS_KEY] as Partial<Preferences> | undefined;
      resolve({
        ...DEFAULT_PREFERENCES,
        ...stored,
      });
    });
  });
}

export async function savePreferences(prefs: Preferences): Promise<void> {
  if (!isStorageAvailable()) {
    console.warn(
      '[preferences] chrome.storage.local is unavailable; saving preferences in-memory only.'
    );
    inMemoryPrefs = { ...prefs };
    return;
  }

  return new Promise((resolve) => {
    chrome.storage.local.set({ [PREFS_KEY]: prefs }, () => {
      resolve();
    });
  });
}

export async function getSiteRiskScores(): Promise<SiteRiskScore> {
  if (!isStorageAvailable()) {
    return { ...inMemoryRiskScores };
  }

  return new Promise((resolve) => {
    chrome.storage.local.get(RISK_SCORES_KEY, (result) => {
      const stored = result[RISK_SCORES_KEY] as SiteRiskScore | undefined;
      resolve(stored ?? {});
    });
  });
}

export async function updateSiteRiskScore(origin: string, score: number): Promise<void> {
  if (!isStorageAvailable()) {
    inMemoryRiskScores[origin] = score;
    return;
  }

  const current = await getSiteRiskScores();
  current[origin] = score;

  return new Promise((resolve) => {
    chrome.storage.local.set({ [RISK_SCORES_KEY]: current }, () => {
      resolve();
    });
  });
}
