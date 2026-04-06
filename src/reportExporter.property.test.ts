// Property-based tests for reportExporter
// Feature: browser-network-privacy-monitor
// Validates: Requirements 7.3, 7.4

import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fc from 'fast-check';
import type { RequestRecord, PIIFinding, PIIType, PIISeverity } from './types';

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
// Helpers to capture blob content from triggerDownload
// ---------------------------------------------------------------------------

/**
 * Sets up DOM mocks so that triggerDownload's URL.createObjectURL + anchor click
 * is intercepted. Returns a function that resolves the last captured Blob.
 */
function setupDownloadCapture(): { getCapturedBlob: () => Blob | null } {
  let capturedBlob: Blob | null = null;

  // Mock URL.createObjectURL to capture the blob
  vi.stubGlobal('URL', {
    createObjectURL: (blob: Blob) => {
      capturedBlob = blob;
      return 'blob:mock-url';
    },
    revokeObjectURL: vi.fn(),
  });

  // Mock document.createElement to return a fake anchor
  const fakeAnchor = {
    href: '',
    download: '',
    style: { display: '' },
    click: vi.fn(),
  };
  vi.spyOn(document, 'createElement').mockReturnValue(fakeAnchor as unknown as HTMLElement);
  vi.spyOn(document.body, 'appendChild').mockImplementation(() => fakeAnchor as unknown as Node);
  vi.spyOn(document.body, 'removeChild').mockImplementation(() => fakeAnchor as unknown as Node);

  // Stub setTimeout so revokeObjectURL doesn't cause issues
  vi.stubGlobal('setTimeout', (fn: () => void) => fn());

  return {
    getCapturedBlob: () => capturedBlob,
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
// Arbitraries
// ---------------------------------------------------------------------------

const piiTypeArb: fc.Arbitrary<PIIType> = fc.constantFrom(
  'email', 'phone', 'credit_card', 'password_field', 'ssn',
  'ipv4', 'ipv6', 'jwt', 'bearer_token', 'basic_auth', 'api_key'
);

const piiSeverityArb: fc.Arbitrary<PIISeverity> = fc.constantFrom(
  'critical', 'high', 'medium', 'low'
);

const piiFindingArb: fc.Arbitrary<PIIFinding> = fc.record({
  type: piiTypeArb,
  severity: piiSeverityArb,
  redactedPreview: fc.string({ minLength: 4, maxLength: 20 }),
  location: fc.constantFrom('body', 'header') as fc.Arbitrary<'body' | 'header'>,
  fieldName: fc.option(fc.string({ minLength: 1, maxLength: 20 }), { nil: undefined }),
});

const requestRecordArb: fc.Arbitrary<RequestRecord> = fc.record({
  id: fc.uuid(),
  origin: fc.webUrl({ validSchemes: ['https'] }),
  url: fc.webUrl({ validSchemes: ['https'] }),
  method: fc.constantFrom('GET', 'POST', 'PUT', 'DELETE', 'PATCH'),
  requestHeaders: fc.constant([]),
  responseHeaders: fc.constant([]),
  requestBody: fc.constant(null),
  responseStatusCode: fc.integer({ min: 100, max: 599 }),
  timestampMs: fc.integer({ min: 0, max: 8_640_000_000_000_000 }), // max valid JS Date
  piiFindings: fc.array(piiFindingArb, { minLength: 0, maxLength: 3 }),
  riskContribution: fc.integer({ min: 0, max: 100 }),
  truncated: fc.boolean(),
  bodyUnavailable: fc.boolean(),
  decodeError: fc.boolean(),
});

// ---------------------------------------------------------------------------
// Mock setup helpers
// ---------------------------------------------------------------------------

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
// Property 6: CSV export row count matches request count
// Feature: browser-network-privacy-monitor, Property 6: CSV export row count matches request count
// ---------------------------------------------------------------------------

describe('Property 6: CSV export row count matches request count', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
  });

  it('CSV data rows equal input record count', async () => {
    // Feature: browser-network-privacy-monitor, Property 6: CSV export row count matches request count
    // Validates: Requirements 7.3
    await fc.assert(
      fc.asyncProperty(
        fc.array(requestRecordArb, { minLength: 0, maxLength: 30 }),
        async (records) => {
          vi.clearAllMocks();
          vi.restoreAllMocks();

          const { getCapturedBlob } = setupDownloadCapture();
          mockStorageWithRecords(records);

          await exportReport({ scope: 'all' }, 'csv');

          const blob = getCapturedBlob();
          expect(blob).not.toBeNull();

          const csvText = await blobToText(blob!);
          const lines = csvText.split('\n').filter(line => line.trim() !== '');

          // First line is the header; remaining lines are data rows
          const headerCount = 1;
          const dataRowCount = lines.length - headerCount;

          expect(dataRowCount).toBe(records.length);
        }
      ),
      { numRuns: 100 }
    );
  });
});

// ---------------------------------------------------------------------------
// Property 7: JSON export round-trip fidelity
// Feature: browser-network-privacy-monitor, Property 7: JSON export round-trip fidelity
// ---------------------------------------------------------------------------

describe('Property 7: JSON export round-trip fidelity', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
  });

  it('exported JSON preserves id, origin, method, url, timestampMs, piiFindings for each record', async () => {
    // Feature: browser-network-privacy-monitor, Property 7: JSON export round-trip fidelity
    // Validates: Requirements 7.4
    await fc.assert(
      fc.asyncProperty(
        fc.array(requestRecordArb, { minLength: 0, maxLength: 20 }),
        async (records) => {
          vi.clearAllMocks();
          vi.restoreAllMocks();

          const { getCapturedBlob } = setupDownloadCapture();
          mockStorageWithRecords(records);

          await exportReport({ scope: 'all' }, 'json');

          const blob = getCapturedBlob();
          expect(blob).not.toBeNull();

          const jsonText = await blobToText(blob!);
          const parsed = JSON.parse(jsonText) as {
            metadata: { generatedAt: string; scope: unknown };
            records: RequestRecord[];
          };

          expect(parsed.records).toHaveLength(records.length);

          // Build a map from id -> original record for O(1) lookup
          const originalById = new Map(records.map(r => [r.id, r]));

          for (const exportedRecord of parsed.records) {
            const original = originalById.get(exportedRecord.id);
            expect(original).toBeDefined();

            expect(exportedRecord.id).toBe(original!.id);
            expect(exportedRecord.origin).toBe(original!.origin);
            expect(exportedRecord.method).toBe(original!.method);
            expect(exportedRecord.url).toBe(original!.url);
            expect(exportedRecord.timestampMs).toBe(original!.timestampMs);
            expect(exportedRecord.piiFindings).toEqual(original!.piiFindings);
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});
