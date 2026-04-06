// Service Worker — request interception pipeline
// Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 6.2, 8.1, 8.2, 9.3

import { detectPII } from '../piiDetector';
import { computeRiskScore } from '../riskScorer';
import { saveRecord, pruneOldRecords } from '../storage';
import { getPreferences, updateSiteRiskScore } from '../preferences';
import { shouldProcessRequest } from './filterLogic';
import type { CapturedRequest, Header, RequestRecord } from '../types';

// ---------------------------------------------------------------------------
// In-flight request accumulator
// ---------------------------------------------------------------------------

const inFlight = new Map<string, Partial<CapturedRequest>>();

const ONE_MB = 1024 * 1024;

// ---------------------------------------------------------------------------
// Body decoding helpers
// ---------------------------------------------------------------------------

function decodeRawBody(
  raw: chrome.webRequest.UploadData[],
): { body: string | null; truncated: boolean; decodeError: boolean; bodyUnavailable: boolean } {
  // Concatenate all raw chunks
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  for (const chunk of raw) {
    if (chunk.bytes) {
      const arr = new Uint8Array(chunk.bytes);
      chunks.push(arr);
      totalBytes += arr.byteLength;
    }
  }

  if (chunks.length === 0) {
    return { body: null, truncated: false, decodeError: false, bodyUnavailable: true };
  }

  // Merge chunks, truncating at 1 MB
  const truncated = totalBytes > ONE_MB;
  const limit = truncated ? ONE_MB : totalBytes;
  const merged = new Uint8Array(limit);
  let offset = 0;
  for (const chunk of chunks) {
    if (offset >= limit) break;
    const take = Math.min(chunk.byteLength, limit - offset);
    merged.set(chunk.subarray(0, take), offset);
    offset += take;
  }

  try {
    const body = new TextDecoder('utf-8', { fatal: true }).decode(merged);
    return { body, truncated, decodeError: false, bodyUnavailable: false };
  } catch {
    // Decode failed — store as base64
    const binary = Array.from(merged)
      .map((b) => String.fromCharCode(b))
      .join('');
    const body = btoa(binary);
    return { body, truncated, decodeError: true, bodyUnavailable: false };
  }
}

// ---------------------------------------------------------------------------
// Listener: onBeforeRequest
// ---------------------------------------------------------------------------

function onBeforeRequest(details: chrome.webRequest.WebRequestBodyDetails): void {
  try {
    const entry: Partial<CapturedRequest> = {
      requestId: details.requestId,
      url: details.url,
      method: details.method,
      tabId: details.tabId,
      timestampMs: Date.now(),
      truncated: false,
      bodyUnavailable: false,
      decodeError: false,
      requestBody: null,
      requestHeaders: [],
      responseHeaders: [],
    };

    const rb = details.requestBody;
    if (rb) {
      if (rb.raw && rb.raw.length > 0) {
        const { body, truncated, decodeError, bodyUnavailable } = decodeRawBody(rb.raw);
        entry.requestBody = body;
        entry.truncated = truncated;
        entry.decodeError = decodeError;
        entry.bodyUnavailable = bodyUnavailable;
      } else if (rb.formData) {
        entry.requestBody = JSON.stringify(rb.formData);
      } else {
        // Stream / unavailable
        entry.bodyUnavailable = true;
        entry.requestBody = null;
      }
    }

    inFlight.set(details.requestId, entry);
  } catch (err) {
    console.error('[background] onBeforeRequest error:', err);
  }
}

// ---------------------------------------------------------------------------
// Listener: onSendHeaders
// ---------------------------------------------------------------------------

function onSendHeaders(details: chrome.webRequest.WebRequestHeadersDetails): void {
  try {
    const entry = inFlight.get(details.requestId);
    if (!entry) return;
    entry.requestHeaders = (details.requestHeaders ?? []) as Header[];
  } catch (err) {
    console.error('[background] onSendHeaders error:', err);
  }
}

// ---------------------------------------------------------------------------
// Listener: onHeadersReceived
// ---------------------------------------------------------------------------

function onHeadersReceived(details: chrome.webRequest.WebResponseHeadersDetails): void {
  try {
    const entry = inFlight.get(details.requestId);
    if (!entry) return;
    entry.responseHeaders = (details.responseHeaders ?? []) as Header[];
  } catch (err) {
    console.error('[background] onHeadersReceived error:', err);
  }
}

// ---------------------------------------------------------------------------
// Listener: onCompleted
// ---------------------------------------------------------------------------

async function onCompleted(details: chrome.webRequest.WebResponseCacheDetails): Promise<void> {
  try {
    const entry = inFlight.get(details.requestId);
    if (!entry) return;
    inFlight.delete(details.requestId);

    // Assemble full CapturedRequest
    const captured: CapturedRequest = {
      requestId: details.requestId,
      url: entry.url ?? details.url,
      method: entry.method ?? details.method,
      tabId: entry.tabId ?? details.tabId,
      timestampMs: entry.timestampMs ?? Date.now(),
      requestHeaders: entry.requestHeaders ?? [],
      responseHeaders: (details.responseHeaders ?? entry.responseHeaders ?? []) as Header[],
      requestBody: entry.requestBody ?? null,
      statusCode: details.statusCode,
      truncated: entry.truncated ?? false,
      bodyUnavailable: entry.bodyUnavailable ?? false,
      decodeError: entry.decodeError ?? false,
    };

    // Check preferences — skip if monitoring disabled globally or for this origin
    const prefs = await getPreferences();

    let origin: string;
    try {
      origin = new URL(captured.url).origin;
    } catch {
      return; // malformed URL — skip
    }

    if (!shouldProcessRequest(origin, prefs)) return;

    // PII detection
    const piiFindings = detectPII(captured.requestBody ?? '', captured.requestHeaders);

    // Risk score
    const riskContribution = computeRiskScore(piiFindings);

    // Build RequestRecord
    const record: RequestRecord = {
      id: crypto.randomUUID(),
      origin,
      url: captured.url,
      method: captured.method,
      requestHeaders: captured.requestHeaders,
      responseHeaders: captured.responseHeaders,
      requestBody: captured.requestBody,
      responseStatusCode: captured.statusCode,
      timestampMs: captured.timestampMs,
      piiFindings,
      riskContribution,
      truncated: captured.truncated,
      bodyUnavailable: captured.bodyUnavailable,
      decodeError: captured.decodeError,
    };

    // Persist
    await saveRecord(record);

    // Update site risk score
    await updateSiteRiskScore(origin, riskContribution);

    // Notify popup/dashboard — fire and forget, ignore if not open
    chrome.runtime.sendMessage({ type: 'NEW_REQUEST', record }).catch(() => {
      // popup/dashboard not open — expected, ignore
    });
  } catch (err) {
    console.error('[background] onCompleted error:', err);
  }
}

// ---------------------------------------------------------------------------
// Register webRequest listeners
// ---------------------------------------------------------------------------

if (chrome.webRequest) {
  chrome.webRequest.onBeforeRequest.addListener(
    onBeforeRequest,
    { urls: ['<all_urls>'] },
    ['requestBody'],
  );

  chrome.webRequest.onSendHeaders.addListener(
    onSendHeaders,
    { urls: ['<all_urls>'] },
    ['requestHeaders'],
  );

  chrome.webRequest.onHeadersReceived.addListener(
    onHeadersReceived,
    { urls: ['<all_urls>'] },
    ['responseHeaders'],
  );

  chrome.webRequest.onCompleted.addListener(
    onCompleted,
    { urls: ['<all_urls>'] },
    ['responseHeaders'],
  );
}

// ---------------------------------------------------------------------------
// Startup: prune old records and register daily alarm
// ---------------------------------------------------------------------------

pruneOldRecords().catch((err) => console.error('[background] pruneOldRecords error:', err));

if (chrome.alarms) {
  chrome.alarms.create('daily-prune', { periodInMinutes: 24 * 60 });
  chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === 'daily-prune') {
      pruneOldRecords().catch((err) => console.error('[background] daily prune error:', err));
    }
  });
}
