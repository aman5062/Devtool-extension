// Unit tests for reportExporter
// Validates: Requirements 7.3, 7.4, 7.6, 7.7

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { RequestRecord, PIIFinding } from './types';

// ---------------------------------------------------------------------------
// Mock storage layer before importing reportExporter
// ---------------------------------------------------------------------------

vi.mock('./storage', () => ({
  getAllOriginSummaries: vi.fn(),
  getRecordsByOrigin: vi.fn(),
}));

import { exportReport } from './reportExporter';
import { getAllOriginSummaries, getRecordsByOrigin } from './storage';

// ---------------------------------------------------------------------------
// DOM / download capture helpers (same pattern as property test)
// ---------------------------------------------------------------------------

function setupDownloadCapture(): { getCapturedBlob: () => Blob | null; getCapturedFilename: () => string | null } {
  let capturedBlob: Blob | null = null;
  let capturedFilename: string | null = null;

  vi.stubGlobal('URL', {
    createObjectURL: (blob: Blob) => {
      capturedBlob = blob;
      return 'blob:mock-url';
    },
    revokeObjectURL: vi.fn(),
  });

  const fakeAnchor = {
    href: '',
    download: '',
    style: { display: '' },
    click: vi.fn(),
    set download(v: string) { capturedFilename = v; },
    get download() { return capturedFilename ?? ''; },
  };
  vi.spyOn(document, 'createElement').mockReturnValue(fakeAnchor as unknown as HTMLElement);
  vi.spyOn(document.body, 'appendChild').mockImplementation(() => fakeAnchor as unknown as Node);
  vi.spyOn(document.body, 'removeChild').mockImplementation(() => fakeAnchor as unknown as Node);
  vi.stubGlobal('setTimeout', (fn: () => void) => fn());

  return {
    getCapturedBlob: () => capturedBlob,
    getCapturedFilename: () => capturedFilename,
  };
}

async function blobToText(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsText(blob);
  });
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeRecord(overrides: Partial<RequestRecord> = {}): RequestRecord {
  return {
    id: 'test-id-1',
    origin: 'https://example.com',
    url: 'https://example.com/api/data',
    method: 'GET',
    requestHeaders: [],
    responseHeaders: [],
    requestBody: null,
    responseStatusCode: 200,
    timestampMs: new Date('2024-06-15T10:30:00.000Z').getTime(),
    piiFindings: [],
    riskContribution: 0,
    truncated: false,
    bodyUnavailable: false,
    decodeError: false,
    ...overrides,
  };
}

const samplePIIFinding: PIIFinding = {
  type: 'email',
  severity: 'medium',
  redactedPreview: 'us**om',
  location: 'body',
};

function mockStorageWithRecords(records: RequestRecord[]): void {
  const origins = [...new Set(records.map(r => r.origin))];
  vi.mocked(getAllOriginSummaries).mockResolvedValue(
    origins.map(origin => ({
      origin,
      requestCount: records.filter(r => r.origin === origin).length,
      lastActivityMs: Date.now(),
      riskScore: 0,
    }))
  );
  vi.mocked(getRecordsByOrigin).mockImplementation(async (origin: string) =>
    records.filter(r => r.origin === origin)
  );
}

// ---------------------------------------------------------------------------
// CSV header row format
// Validates: Requirement 7.3
// ---------------------------------------------------------------------------

describe('CSV header row format', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
  });

  it('first line contains exactly the required column names in order', async () => {
    const { getCapturedBlob } = setupDownloadCapture();
    mockStorageWithRecords([]);

    await exportReport({ scope: 'all' }, 'csv');

    const blob = getCapturedBlob();
    expect(blob).not.toBeNull();

    const csv = await blobToText(blob!);
    const headerLine = csv.split('\n')[0];
    expect(headerLine).toBe('timestamp,site,method,url,status_code,pii_detected,pii_types,risk_score');
  });

  it('header columns are exactly: timestamp, site, method, url, status_code, pii_detected, pii_types, risk_score', async () => {
    const { getCapturedBlob } = setupDownloadCapture();
    mockStorageWithRecords([]);

    await exportReport({ scope: 'all' }, 'csv');

    const blob = getCapturedBlob();
    const csv = await blobToText(blob!);
    const columns = csv.split('\n')[0].split(',');

    expect(columns).toEqual([
      'timestamp',
      'site',
      'method',
      'url',
      'status_code',
      'pii_detected',
      'pii_types',
      'risk_score',
    ]);
  });

  it('data row maps fields to correct columns', async () => {
    const { getCapturedBlob } = setupDownloadCapture();
    const record = makeRecord({
      id: 'r1',
      origin: 'https://example.com',
      url: 'https://example.com/path',
      method: 'POST',
      responseStatusCode: 201,
      timestampMs: new Date('2024-06-15T10:30:00.000Z').getTime(),
      piiFindings: [samplePIIFinding],
      riskContribution: 42,
    });
    mockStorageWithRecords([record]);

    await exportReport({ scope: 'all' }, 'csv');

    const blob = getCapturedBlob();
    const csv = await blobToText(blob!);
    const lines = csv.split('\n').filter(l => l.trim() !== '');
    expect(lines).toHaveLength(2); // header + 1 data row

    const dataRow = lines[1].split(',');
    // timestamp (ISO string)
    expect(dataRow[0]).toBe(new Date(record.timestampMs).toISOString());
    // site
    expect(dataRow[1]).toBe('https://example.com');
    // method
    expect(dataRow[2]).toBe('POST');
    // url
    expect(dataRow[3]).toBe('https://example.com/path');
    // status_code
    expect(dataRow[4]).toBe('201');
    // pii_detected
    expect(dataRow[5]).toBe('true');
    // pii_types
    expect(dataRow[6]).toBe('email');
    // risk_score
    expect(dataRow[7]).toBe('42');
  });

  it('pii_detected is false when no PII findings', async () => {
    const { getCapturedBlob } = setupDownloadCapture();
    const record = makeRecord({ piiFindings: [] });
    mockStorageWithRecords([record]);

    await exportReport({ scope: 'all' }, 'csv');

    const blob = getCapturedBlob();
    const csv = await blobToText(blob!);
    const dataRow = csv.split('\n')[1].split(',');
    expect(dataRow[5]).toBe('false');
    expect(dataRow[6]).toBe(''); // empty pii_types
  });

  it('pii_types lists multiple types separated by semicolons', async () => {
    const { getCapturedBlob } = setupDownloadCapture();
    const record = makeRecord({
      piiFindings: [
        { type: 'email', severity: 'medium', redactedPreview: 'ab**cd', location: 'body' },
        { type: 'ssn', severity: 'critical', redactedPreview: 'ab**cd', location: 'body' },
      ],
    });
    mockStorageWithRecords([record]);

    await exportReport({ scope: 'all' }, 'csv');

    const blob = getCapturedBlob();
    const csv = await blobToText(blob!);
    const dataRow = csv.split('\n')[1].split(',');
    expect(dataRow[6]).toBe('email;ssn');
  });
});

// ---------------------------------------------------------------------------
// JSON schema shape
// Validates: Requirement 7.4
// ---------------------------------------------------------------------------

describe('JSON schema shape', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
  });

  it('exported JSON has a metadata section with generatedAt and scope', async () => {
    const { getCapturedBlob } = setupDownloadCapture();
    mockStorageWithRecords([]);

    await exportReport({ scope: 'all' }, 'json');

    const blob = getCapturedBlob();
    expect(blob).not.toBeNull();

    const json = JSON.parse(await blobToText(blob!));
    expect(json).toHaveProperty('metadata');
    expect(json.metadata).toHaveProperty('generatedAt');
    expect(json.metadata).toHaveProperty('scope');
  });

  it('metadata.generatedAt is a valid ISO 8601 date string', async () => {
    const { getCapturedBlob } = setupDownloadCapture();
    mockStorageWithRecords([]);

    await exportReport({ scope: 'all' }, 'json');

    const blob = getCapturedBlob();
    const json = JSON.parse(await blobToText(blob!));
    const parsed = new Date(json.metadata.generatedAt);
    expect(parsed.toString()).not.toBe('Invalid Date');
    expect(json.metadata.generatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  });

  it('metadata.scope reflects the export scope', async () => {
    const { getCapturedBlob } = setupDownloadCapture();
    mockStorageWithRecords([]);

    await exportReport({ scope: 'all' }, 'json');

    const blob = getCapturedBlob();
    const json = JSON.parse(await blobToText(blob!));
    expect(json.metadata.scope).toEqual({ scope: 'all' });
  });

  it('metadata.scope reflects site scope with origin', async () => {
    const { getCapturedBlob } = setupDownloadCapture();
    vi.mocked(getRecordsByOrigin).mockResolvedValue([]);

    await exportReport({ scope: 'site', origin: 'https://example.com' }, 'json');

    const blob = getCapturedBlob();
    const json = JSON.parse(await blobToText(blob!));
    expect(json.metadata.scope).toEqual({ scope: 'site', origin: 'https://example.com' });
  });

  it('exported JSON has a records array', async () => {
    const { getCapturedBlob } = setupDownloadCapture();
    mockStorageWithRecords([]);

    await exportReport({ scope: 'all' }, 'json');

    const blob = getCapturedBlob();
    const json = JSON.parse(await blobToText(blob!));
    expect(json).toHaveProperty('records');
    expect(Array.isArray(json.records)).toBe(true);
  });

  it('records array contains all exported records', async () => {
    const { getCapturedBlob } = setupDownloadCapture();
    const records = [
      makeRecord({ id: 'r1', origin: 'https://a.com', url: 'https://a.com/1' }),
      makeRecord({ id: 'r2', origin: 'https://b.com', url: 'https://b.com/2' }),
    ];
    mockStorageWithRecords(records);

    await exportReport({ scope: 'all' }, 'json');

    const blob = getCapturedBlob();
    const json = JSON.parse(await blobToText(blob!));
    expect(json.records).toHaveLength(2);
    const ids = json.records.map((r: RequestRecord) => r.id);
    expect(ids).toContain('r1');
    expect(ids).toContain('r2');
  });

  it('records array is empty when no data exists', async () => {
    const { getCapturedBlob } = setupDownloadCapture();
    mockStorageWithRecords([]);

    await exportReport({ scope: 'all' }, 'json');

    const blob = getCapturedBlob();
    const json = JSON.parse(await blobToText(blob!));
    expect(json.records).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Filename date format
// Validates: Requirement 7.6
// ---------------------------------------------------------------------------

describe('Filename date format', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
  });

  it('CSV filename matches network-privacy-report-{YYYY-MM-DD}.csv', async () => {
    const { getCapturedFilename } = setupDownloadCapture();
    mockStorageWithRecords([]);

    await exportReport({ scope: 'all' }, 'csv');

    const name = getCapturedFilename();
    expect(name).toMatch(/^network-privacy-report-\d{4}-\d{2}-\d{2}\.csv$/);
  });

  it('JSON filename matches network-privacy-report-{YYYY-MM-DD}.json', async () => {
    const { getCapturedFilename } = setupDownloadCapture();
    mockStorageWithRecords([]);

    await exportReport({ scope: 'all' }, 'json');

    const name = getCapturedFilename();
    expect(name).toMatch(/^network-privacy-report-\d{4}-\d{2}-\d{2}\.json$/);
  });

  it('filename date portion matches today\'s date', async () => {
    const { getCapturedFilename } = setupDownloadCapture();
    mockStorageWithRecords([]);

    await exportReport({ scope: 'all' }, 'csv');

    const name = getCapturedFilename()!;
    const dateMatch = name.match(/network-privacy-report-(\d{4}-\d{2}-\d{2})\.csv/);
    expect(dateMatch).not.toBeNull();

    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    expect(dateMatch![1]).toBe(`${yyyy}-${mm}-${dd}`);
  });
});

// ---------------------------------------------------------------------------
// Error path — no partial file on failure
// Validates: Requirement 7.7
// ---------------------------------------------------------------------------

describe('Error path — no partial file on failure', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
  });

  it('throws when storage fetch fails and does not trigger a download', async () => {
    const { getCapturedBlob } = setupDownloadCapture();

    vi.mocked(getAllOriginSummaries).mockRejectedValue(new Error('storage unavailable'));

    await expect(exportReport({ scope: 'all' }, 'csv')).rejects.toThrow();
    expect(getCapturedBlob()).toBeNull();
  });

  it('throws when storage fetch fails for site scope and does not trigger a download', async () => {
    const { getCapturedBlob } = setupDownloadCapture();

    vi.mocked(getRecordsByOrigin).mockRejectedValue(new Error('db error'));

    await expect(exportReport({ scope: 'site', origin: 'https://example.com' }, 'json')).rejects.toThrow();
    expect(getCapturedBlob()).toBeNull();
  });

  it('error message includes context about the failure', async () => {
    setupDownloadCapture();

    vi.mocked(getAllOriginSummaries).mockRejectedValue(new Error('IndexedDB quota exceeded'));

    await expect(exportReport({ scope: 'all' }, 'csv')).rejects.toThrow(/IndexedDB quota exceeded/);
  });
});
