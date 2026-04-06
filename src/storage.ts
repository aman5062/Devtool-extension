// Storage layer for Browser Network Privacy Monitor
// Uses IndexedDB via `idb` library
// Requirements: 2.1, 2.2, 2.3, 2.4, 2.5

import { openDB, type IDBPDatabase } from 'idb';
import type { RequestRecord, OriginSummary } from './types';

const DB_NAME = 'privacy_monitor';
const DB_VERSION = 1;
const STORE_NAME = 'requests';

const RETENTION_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const EVICT_THRESHOLD_BYTES = 500 * 1024 * 1024; // 500 MB
const EVICT_TARGET_BYTES = 450 * 1024 * 1024;    // 450 MB

type PrivacyMonitorDB = IDBPDatabase<{
  requests: {
    key: string;
    value: RequestRecord;
    indexes: {
      'by-origin': string;
      'by-timestamp': number;
      'by-origin-timestamp': [string, number];
    };
  };
}>;

let dbPromise: Promise<PrivacyMonitorDB> | null = null;

function getDB(): Promise<PrivacyMonitorDB> {
  if (!dbPromise) {
    dbPromise = openDB<{
      requests: {
        key: string;
        value: RequestRecord;
        indexes: {
          'by-origin': string;
          'by-timestamp': number;
          'by-origin-timestamp': [string, number];
        };
      };
    }>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
          store.createIndex('by-origin', 'origin');
          store.createIndex('by-timestamp', 'timestampMs');
          store.createIndex('by-origin-timestamp', ['origin', 'timestampMs']);
        }
      },
    }) as Promise<PrivacyMonitorDB>;
  }
  return dbPromise;
}

export async function saveRecord(record: RequestRecord): Promise<void> {
  const db = await getDB();
  try {
    await db.put(STORE_NAME, record);
  } catch (err: unknown) {
    const isQuotaError =
      err instanceof DOMException &&
      (err.name === 'QuotaExceededError' || err.name === 'NS_ERROR_DOM_QUOTA_REACHED');
    if (isQuotaError) {
      await evictToQuota();
      await db.put(STORE_NAME, record);
    } else {
      throw err;
    }
  }
}

export async function getRecordsByOrigin(
  origin: string,
  filters?: {
    method?: string;
    startMs?: number;
    endMs?: number;
    hasPII?: boolean;
  }
): Promise<RequestRecord[]> {
  const db = await getDB();
  const records = await db.getAllFromIndex(STORE_NAME, 'by-origin', origin);

  if (!filters) return records;

  return records.filter((r) => {
    if (filters.method !== undefined && r.method !== filters.method) return false;
    if (filters.startMs !== undefined && r.timestampMs < filters.startMs) return false;
    if (filters.endMs !== undefined && r.timestampMs > filters.endMs) return false;
    if (filters.hasPII !== undefined) {
      const hasPII = r.piiFindings.length > 0;
      if (hasPII !== filters.hasPII) return false;
    }
    return true;
  });
}

export async function getAllOriginSummaries(): Promise<OriginSummary[]> {
  const db = await getDB();
  const all = await db.getAll(STORE_NAME);

  const map = new Map<string, { requestCount: number; lastActivityMs: number; riskScore: number }>();

  for (const record of all) {
    const existing = map.get(record.origin);
    if (!existing) {
      map.set(record.origin, {
        requestCount: 1,
        lastActivityMs: record.timestampMs,
        riskScore: record.riskContribution,
      });
    } else {
      existing.requestCount += 1;
      if (record.timestampMs > existing.lastActivityMs) {
        existing.lastActivityMs = record.timestampMs;
      }
      if (record.riskContribution > existing.riskScore) {
        existing.riskScore = record.riskContribution;
      }
    }
  }

  return Array.from(map.entries()).map(([origin, data]) => ({
    origin,
    ...data,
  }));
}

export async function deleteRecordsByOrigin(origin: string): Promise<void> {
  const db = await getDB();
  const tx = db.transaction(STORE_NAME, 'readwrite');
  const index = tx.store.index('by-origin');
  let cursor = await index.openCursor(origin);
  while (cursor) {
    await cursor.delete();
    cursor = await cursor.continue();
  }
  await tx.done;
}

export async function deleteAllRecords(): Promise<void> {
  const db = await getDB();
  await db.clear(STORE_NAME);
}

export async function pruneOldRecords(): Promise<void> {
  const db = await getDB();
  const cutoff = Date.now() - RETENTION_MS;
  const tx = db.transaction(STORE_NAME, 'readwrite');
  const index = tx.store.index('by-timestamp');
  const range = IDBKeyRange.upperBound(cutoff);
  let cursor = await index.openCursor(range);
  while (cursor) {
    await cursor.delete();
    cursor = await cursor.continue();
  }
  await tx.done;
}

export async function evictToQuota(): Promise<void> {
  if (typeof navigator === 'undefined' || !navigator.storage?.estimate) {
    return;
  }

  const estimate = await navigator.storage.estimate();
  const usage = estimate.usage ?? 0;

  if (usage <= EVICT_THRESHOLD_BYTES) {
    return;
  }

  const db = await getDB();

  // Delete oldest records FIFO until usage drops below target
  const tx = db.transaction(STORE_NAME, 'readwrite');
  const index = tx.store.index('by-timestamp');
  let cursor = await index.openCursor(null, 'next'); // ascending by timestampMs

  while (cursor) {
    await cursor.delete();
    cursor = await cursor.continue();

    // Re-check storage estimate periodically
    const currentEstimate = await navigator.storage.estimate();
    const currentUsage = currentEstimate.usage ?? 0;
    if (currentUsage < EVICT_TARGET_BYTES) {
      break;
    }
  }

  await tx.done;
}
