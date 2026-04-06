// Unit tests for storage layer
// Validates: Requirements 2.2, 2.3, 2.5

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { RequestRecord, PIIFinding } from './types';

// ---------------------------------------------------------------------------
// Polyfill IDBKeyRange for jsdom (not provided by jsdom)
// ---------------------------------------------------------------------------

if (typeof IDBKeyRange === 'undefined') {
  // Minimal IDBKeyRange polyfill — only upperBound is used by storage.ts
  (globalThis as Record<string, unknown>).IDBKeyRange = {
    upperBound: (upper: unknown, open = false) => ({ upper, open, _type: 'upperBound' }),
    lowerBound: (lower: unknown, open = false) => ({ lower, open, _type: 'lowerBound' }),
    bound: (lower: unknown, upper: unknown) => ({ lower, upper, _type: 'bound' }),
    only: (value: unknown) => ({ value, _type: 'only' }),
  };
}

// ---------------------------------------------------------------------------
// Mock idb — provide a minimal in-memory IndexedDB-like implementation
// ---------------------------------------------------------------------------

type StoreRecord = RequestRecord;

interface MockCursor {
  value: StoreRecord;
  delete(): Promise<void>;
  continue(): Promise<MockCursor | null>;
}

// In-memory records array shared across the mock DB
let records: StoreRecord[] = [];

function makeCursor(items: StoreRecord[]): MockCursor | null {
  if (items.length === 0) return null;
  // Work on a snapshot; deletions mutate the outer `records` array
  const snapshot = [...items];
// idx was unused

  function cursorAt(i: number): MockCursor | null {
    if (i >= snapshot.length) return null;
    return {
      value: snapshot[i],
      delete: async () => {
        const id = snapshot[i].id;
        records = records.filter(r => r.id !== id);
      },
      continue: async () => cursorAt(i + 1),
    };
  }

  return cursorAt(0);
}

function makeTransaction() {
  const store = {
    index(name: string) {
      return {
        async openCursor(query?: unknown, _direction?: string): Promise<MockCursor | null> {
          let items: StoreRecord[];
          if (name === 'by-timestamp') {
            if (query && (query as { _type: string })._type === 'upperBound') {
              const cutoff = (query as { upper: number }).upper;
              items = records.filter(r => r.timestampMs <= cutoff);
            } else {
              items = [...records];
            }
            items.sort((a, b) => a.timestampMs - b.timestampMs);
          } else if (name === 'by-origin') {
            const origin = query as string;
            items = records.filter(r => r.origin === origin);
          } else {
            items = [...records];
          }
          return makeCursor(items);
        },
        async getAll(query?: string): Promise<StoreRecord[]> {
          if (query !== undefined) {
            return records.filter(r => r.origin === query);
          }
          return [...records];
        },
      };
    },
  };

  return {
    store,
    done: Promise.resolve(),
  };
}

const mockDB = {
  async put(_store: string, record: StoreRecord): Promise<void> {
    const idx = records.findIndex(r => r.id === record.id);
    if (idx >= 0) {
      records[idx] = record;
    } else {
      records.push(record);
    }
  },
  async getAll(_store: string): Promise<StoreRecord[]> {
    return [...records];
  },
  async getAllFromIndex(_store: string, indexName: string, query: string): Promise<StoreRecord[]> {
    if (indexName === 'by-origin') {
      return records.filter(r => r.origin === query);
    }
    return [...records];
  },
  async clear(_store: string): Promise<void> {
    records = [];
  },
  transaction(_store: string, _mode: string) {
    return makeTransaction();
  },
};

vi.mock('idb', () => ({
  openDB: vi.fn().mockResolvedValue(mockDB),
}));

// ---------------------------------------------------------------------------
// Import storage functions AFTER mocking idb
// ---------------------------------------------------------------------------

const storageModule = await import('./storage');
const {
  saveRecord,
  getRecordsByOrigin,
  getAllOriginSummaries,
  deleteRecordsByOrigin,
  deleteAllRecords,
  pruneOldRecords,
  evictToQuota,
} = storageModule;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRecord(overrides: Partial<RequestRecord> = {}): RequestRecord {
  return {
    id: crypto.randomUUID(),
    origin: 'https://example.com',
    url: 'https://example.com/api',
    method: 'GET',
    requestHeaders: [],
    responseHeaders: [],
    requestBody: null,
    responseStatusCode: 200,
    timestampMs: Date.now(),
    piiFindings: [] as PIIFinding[],
    riskContribution: 0,
    truncated: false,
    bodyUnavailable: false,
    decodeError: false,
    ...overrides,
  };
}

/** Install a mock navigator.storage.estimate that returns the given usage values in sequence */
function mockStorageEstimate(usageValues: number[]) {
  let callCount = 0;
  const estimateMock = vi.fn().mockImplementation(async () => {
    const usage = usageValues[Math.min(callCount, usageValues.length - 1)];
    callCount++;
    return { usage };
  });

  Object.defineProperty(globalThis.navigator, 'storage', {
    value: { estimate: estimateMock },
    writable: true,
    configurable: true,
  });

  return estimateMock;
}

function removeStorageMock() {
  Object.defineProperty(globalThis.navigator, 'storage', {
    value: undefined,
    writable: true,
    configurable: true,
  });
}

beforeEach(() => {
  records = [];
  // Reset navigator.storage to undefined between tests
  removeStorageMock();
});

// ---------------------------------------------------------------------------
// saveRecord
// ---------------------------------------------------------------------------

describe('saveRecord', () => {
  it('persists a record to the store', async () => {
    const record = makeRecord();
    await saveRecord(record);
    expect(records).toHaveLength(1);
    expect(records[0].id).toBe(record.id);
  });

  it('on QuotaExceededError triggers eviction then retries', async () => {
    // Seed some old records so eviction has something to delete
    const old1 = makeRecord({ id: 'old-1', timestampMs: 1000 });
    const old2 = makeRecord({ id: 'old-2', timestampMs: 2000 });
    records.push(old1, old2);

    const BYTES_500MB = 500 * 1024 * 1024;
    const BYTES_450MB = 450 * 1024 * 1024;
    // First estimate call: above threshold; subsequent: below target
    mockStorageEstimate([BYTES_500MB + 1, BYTES_450MB - 1, BYTES_450MB - 1]);

    // Make put throw QuotaExceededError on first call, succeed on retry
    let putCallCount = 0;
    const originalPut = mockDB.put.bind(mockDB);
    vi.spyOn(mockDB, 'put').mockImplementation(async (store: string, record: StoreRecord) => {
      putCallCount++;
      if (putCallCount === 1) {
        throw new DOMException('Quota exceeded', 'QuotaExceededError');
      }
      return originalPut(store, record);
    });

    const newRecord = makeRecord({ id: 'new-record', timestampMs: 9999 });
    await saveRecord(newRecord);

    // The new record should have been saved after eviction
    expect(records.some(r => r.id === 'new-record')).toBe(true);

    vi.restoreAllMocks();
  });
});

// ---------------------------------------------------------------------------
// getRecordsByOrigin — filtering
// ---------------------------------------------------------------------------

describe('getRecordsByOrigin', () => {
  it('returns all records for the given origin', async () => {
    const r1 = makeRecord({ origin: 'https://a.com' });
    const r2 = makeRecord({ origin: 'https://a.com' });
    const r3 = makeRecord({ origin: 'https://b.com' });
    records.push(r1, r2, r3);

    const result = await getRecordsByOrigin('https://a.com');
    expect(result).toHaveLength(2);
  });

  it('filters by method', async () => {
    const get = makeRecord({ method: 'GET' });
    const post = makeRecord({ method: 'POST' });
    records.push(get, post);

    const result = await getRecordsByOrigin('https://example.com', { method: 'POST' });
    expect(result).toHaveLength(1);
    expect(result[0].method).toBe('POST');
  });

  it('filters by date range', async () => {
    const early = makeRecord({ timestampMs: 1000 });
    const mid = makeRecord({ timestampMs: 5000 });
    const late = makeRecord({ timestampMs: 9000 });
    records.push(early, mid, late);

    const result = await getRecordsByOrigin('https://example.com', {
      startMs: 2000,
      endMs: 8000,
    });
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(mid.id);
  });

  it('filters by PII presence (hasPII: true)', async () => {
    const withPII = makeRecord({
      piiFindings: [{ type: 'email', severity: 'medium', redactedPreview: 'ab**cd', location: 'body' }],
    });
    const withoutPII = makeRecord({ piiFindings: [] });
    records.push(withPII, withoutPII);

    const result = await getRecordsByOrigin('https://example.com', { hasPII: true });
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(withPII.id);
  });

  it('filters by PII presence (hasPII: false)', async () => {
    const withPII = makeRecord({
      piiFindings: [{ type: 'email', severity: 'medium', redactedPreview: 'ab**cd', location: 'body' }],
    });
    const withoutPII = makeRecord({ piiFindings: [] });
    records.push(withPII, withoutPII);

    const result = await getRecordsByOrigin('https://example.com', { hasPII: false });
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(withoutPII.id);
  });
});

// ---------------------------------------------------------------------------
// getAllOriginSummaries
// ---------------------------------------------------------------------------

describe('getAllOriginSummaries', () => {
  it('returns one summary per origin', async () => {
    records.push(
      makeRecord({ origin: 'https://a.com', timestampMs: 1000, riskContribution: 10 }),
      makeRecord({ origin: 'https://a.com', timestampMs: 2000, riskContribution: 5 }),
      makeRecord({ origin: 'https://b.com', timestampMs: 3000, riskContribution: 20 }),
    );

    const summaries = await getAllOriginSummaries();
    expect(summaries).toHaveLength(2);
  });

  it('counts requests correctly per origin', async () => {
    records.push(
      makeRecord({ origin: 'https://a.com' }),
      makeRecord({ origin: 'https://a.com' }),
      makeRecord({ origin: 'https://a.com' }),
    );

    const summaries = await getAllOriginSummaries();
    const summary = summaries.find(s => s.origin === 'https://a.com');
    expect(summary?.requestCount).toBe(3);
  });

  it('reports the latest activity timestamp', async () => {
    records.push(
      makeRecord({ origin: 'https://a.com', timestampMs: 1000 }),
      makeRecord({ origin: 'https://a.com', timestampMs: 9000 }),
      makeRecord({ origin: 'https://a.com', timestampMs: 5000 }),
    );

    const summaries = await getAllOriginSummaries();
    const summary = summaries.find(s => s.origin === 'https://a.com');
    expect(summary?.lastActivityMs).toBe(9000);
  });

  it('reports the maximum risk score across records', async () => {
    records.push(
      makeRecord({ origin: 'https://a.com', riskContribution: 10 }),
      makeRecord({ origin: 'https://a.com', riskContribution: 75 }),
      makeRecord({ origin: 'https://a.com', riskContribution: 30 }),
    );

    const summaries = await getAllOriginSummaries();
    const summary = summaries.find(s => s.origin === 'https://a.com');
    expect(summary?.riskScore).toBe(75);
  });
});

// ---------------------------------------------------------------------------
// deleteRecordsByOrigin — Requirement 2.5: completes within 2 seconds
// ---------------------------------------------------------------------------

describe('deleteRecordsByOrigin', () => {
  it('removes all records for the given origin', async () => {
    records.push(
      makeRecord({ id: 'a1', origin: 'https://a.com' }),
      makeRecord({ id: 'a2', origin: 'https://a.com' }),
      makeRecord({ id: 'b1', origin: 'https://b.com' }),
    );

    await deleteRecordsByOrigin('https://a.com');

    expect(records.every(r => r.origin !== 'https://a.com')).toBe(true);
    expect(records.some(r => r.origin === 'https://b.com')).toBe(true);
  });

  it('completes within 2 seconds (Requirement 2.5)', async () => {
    for (let i = 0; i < 100; i++) {
      records.push(makeRecord({ id: `rec-${i}`, origin: 'https://target.com', timestampMs: i }));
    }

    const start = Date.now();
    await deleteRecordsByOrigin('https://target.com');
    const elapsed = Date.now() - start;

    expect(elapsed).toBeLessThan(2000);
    expect(records.filter(r => r.origin === 'https://target.com')).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// deleteAllRecords — Requirement 2.5: completes within 2 seconds
// ---------------------------------------------------------------------------

describe('deleteAllRecords', () => {
  it('removes every record from the store', async () => {
    records.push(
      makeRecord({ origin: 'https://a.com' }),
      makeRecord({ origin: 'https://b.com' }),
      makeRecord({ origin: 'https://c.com' }),
    );

    await deleteAllRecords();
    expect(records).toHaveLength(0);
  });

  it('completes within 2 seconds (Requirement 2.5)', async () => {
    for (let i = 0; i < 200; i++) {
      records.push(makeRecord({ id: `rec-${i}` }));
    }

    const start = Date.now();
    await deleteAllRecords();
    const elapsed = Date.now() - start;

    expect(elapsed).toBeLessThan(2000);
    expect(records).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// pruneOldRecords — Requirement 2.2: retain records for 30 days
// ---------------------------------------------------------------------------

describe('pruneOldRecords', () => {
  const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

  it('deletes records older than 30 days', async () => {
    const now = Date.now();
    const old = makeRecord({ id: 'old', timestampMs: now - THIRTY_DAYS_MS - 1 });
    const fresh = makeRecord({ id: 'fresh', timestampMs: now - 1000 });
    records.push(old, fresh);

    await pruneOldRecords();

    expect(records.some(r => r.id === 'old')).toBe(false);
    expect(records.some(r => r.id === 'fresh')).toBe(true);
  });

  it('retains records just inside the 30-day boundary', async () => {
    const now = Date.now();
    // cutoff = now - 30 days; a record at cutoff + 1 ms should survive
    const atBoundary = makeRecord({ id: 'boundary', timestampMs: now - THIRTY_DAYS_MS + 1 });
    records.push(atBoundary);

    await pruneOldRecords();

    expect(records.some(r => r.id === 'boundary')).toBe(true);
  });

  it('deletes multiple old records and keeps all recent ones', async () => {
    const now = Date.now();
    const oldRecords = Array.from({ length: 5 }, (_, i) =>
      makeRecord({ id: `old-${i}`, timestampMs: now - THIRTY_DAYS_MS - (i + 1) * 1000 })
    );
    const freshRecords = Array.from({ length: 3 }, (_, i) =>
      makeRecord({ id: `fresh-${i}`, timestampMs: now - i * 1000 })
    );
    records.push(...oldRecords, ...freshRecords);

    await pruneOldRecords();

    expect(records.filter(r => r.id.startsWith('old-'))).toHaveLength(0);
    expect(records.filter(r => r.id.startsWith('fresh-'))).toHaveLength(3);
  });

  it('does nothing when all records are within 30 days', async () => {
    const now = Date.now();
    records.push(
      makeRecord({ id: 'r1', timestampMs: now - 1000 }),
      makeRecord({ id: 'r2', timestampMs: now - 86400000 }), // 1 day ago
    );

    await pruneOldRecords();

    expect(records).toHaveLength(2);
  });

  it('does nothing when store is empty', async () => {
    await pruneOldRecords();
    expect(records).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// evictToQuota — Requirement 2.3: FIFO eviction, oldest deleted first
// ---------------------------------------------------------------------------

describe('evictToQuota', () => {
  const BYTES_500MB = 500 * 1024 * 1024;
  const BYTES_450MB = 450 * 1024 * 1024;

  it('does nothing when storage is below threshold', async () => {
    records.push(makeRecord({ id: 'r1' }), makeRecord({ id: 'r2' }));

    mockStorageEstimate([BYTES_450MB - 1]);

    await evictToQuota();

    expect(records).toHaveLength(2);
  });

  it('deletes oldest records first (FIFO) when over threshold', async () => {
    const old1 = makeRecord({ id: 'old-1', timestampMs: 1000 });
    const old2 = makeRecord({ id: 'old-2', timestampMs: 2000 });
    const newer = makeRecord({ id: 'newer', timestampMs: 9000 });
    records.push(old1, old2, newer);

    // First call: above threshold; after first deletion: below target
    mockStorageEstimate([BYTES_500MB + 1, BYTES_450MB - 1]);

    await evictToQuota();

    // The oldest record should have been deleted first
    expect(records.some(r => r.id === 'old-1')).toBe(false);
    // The newer record should remain
    expect(records.some(r => r.id === 'newer')).toBe(true);
  });

  it('stops evicting once usage drops below 450 MB target', async () => {
    for (let i = 1; i <= 5; i++) {
      records.push(makeRecord({ id: `r${i}`, timestampMs: i * 1000 }));
    }

    // Above threshold on first two calls, below target after that
    mockStorageEstimate([BYTES_500MB + 1, BYTES_500MB + 1, BYTES_450MB - 1]);

    await evictToQuota();

    // Should have stopped after dropping below target — not all records deleted
    expect(records.length).toBeGreaterThan(0);
  });

  it('skips eviction when navigator.storage is unavailable', async () => {
    records.push(makeRecord({ id: 'r1' }));

    // navigator.storage is already undefined from beforeEach
    await evictToQuota();

    expect(records).toHaveLength(1);
  });
});
