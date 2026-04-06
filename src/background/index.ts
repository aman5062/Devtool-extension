// Service Worker — request interception pipeline
// Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 6.2, 8.1, 8.2, 9.3

import { detectPII } from '../piiDetector';
import { computeRiskScore } from '../riskScorer';
import { saveRecord, pruneOldRecords, getRecordsByOrigin, getAllOriginSummaries, deleteRecordsByOrigin } from '../storage';
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

function onBeforeRequest(details: chrome.webRequest.OnBeforeRequestDetails): chrome.webRequest.BlockingResponse | undefined {
  try {
    const entry: Partial<CapturedRequest> = {
      requestId: details.requestId,
      url: details.url,
      method: details.method,
      tabId: details.tabId,
      initiator: details.initiator,
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
  return undefined;
}

// ---------------------------------------------------------------------------
// Listener: onSendHeaders
// ---------------------------------------------------------------------------

function onSendHeaders(details: chrome.webRequest.OnSendHeadersDetails): void {
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

function onHeadersReceived(details: chrome.webRequest.OnHeadersReceivedDetails): chrome.webRequest.BlockingResponse | undefined {
  try {
    const entry = inFlight.get(details.requestId);
    if (!entry) return;
    entry.responseHeaders = (details.responseHeaders ?? []) as Header[];
  } catch (err) {
    console.error('[background] onHeadersReceived error:', err);
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// Listener: onCompleted
// ---------------------------------------------------------------------------

function onCompleted(details: chrome.webRequest.OnCompletedDetails): void {
  // Wrap the async processing in a fire-and-forget async wrapper.
  // We can't await it here because the webRequest listener must return synchronously.
  (async () => {
    try {
      const entry = inFlight.get(details.requestId);
      // We still process even if no entry (could happen if onBeforeRequest was missed somehow)
      const data = (entry || {}) as any;
      inFlight.delete(details.requestId);

      // Assemble full CapturedRequest
      const captured: CapturedRequest & { resourceType: string } = {
        requestId: details.requestId,
        url: data.url ?? details.url,
        method: data.method ?? details.method,
        tabId: data.tabId ?? details.tabId,
        timestampMs: data.timestampMs ?? Date.now(),
        requestHeaders: data.requestHeaders ?? [],
        responseHeaders: (details.responseHeaders ?? data.responseHeaders ?? []) as Header[],
        requestBody: data.requestBody ?? null,
        statusCode: details.statusCode,
        truncated: data.truncated ?? false,
        bodyUnavailable: data.bodyUnavailable ?? false,
        decodeError: data.decodeError ?? false,
        resourceType: details.type,
        initiator: details.initiator || data.initiator,
      };

      // Check preferences — skip if monitoring disabled globally or for this origin
      const prefs = await getPreferences();

      let origin: string;
      try {
        // Use initiator as the primary origin for per-site dashboard grouping.
        // This ensures cross-origin requests made by a site are shown in that site's dashboard.
        // Fallback to request URL's origin if no initiator is present (e.g. top-level nav).
        const initiatorOrigin = captured.initiator;
        if (initiatorOrigin && initiatorOrigin !== 'null' && initiatorOrigin.startsWith('http')) {
           origin = initiatorOrigin;
        } else {
           origin = new URL(captured.url).origin;
        }
      } catch {
        return;
      }

      if (!shouldProcessRequest(origin, prefs)) return;

      // Analysis (Generic PII / Risk calculation)
      const piiFindings = detectPII(captured.requestBody ?? '', captured.requestHeaders);
      const riskContribution = computeRiskScore(piiFindings);

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
        resourceType: captured.resourceType,
        initiator: captured.initiator,
        tabId: captured.tabId,
      };

      // Persist
      await saveRecord(record);

      // Update site risk score
      await updateSiteRiskScore(origin, riskContribution);

      // Notify popup/dashboard
      chrome.runtime.sendMessage({ type: 'NEW_REQUEST', record }).catch(() => {});
    } catch (err) {
      console.error('[background] onCompleted processing error:', err);
    }
  })();
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
  
  // Listen for redirects to update in-flight information
  chrome.webRequest.onBeforeRedirect.addListener(
    (details) => {
      const entry = inFlight.get(details.requestId);
      if (entry) {
        entry.url = details.redirectUrl;
      }
    },
    { urls: ['<all_urls>'] }
  );
}

// ---------------------------------------------------------------------------
// Startup: prune old records and register daily alarm
// ---------------------------------------------------------------------------

pruneOldRecords().catch((err) => console.error('[background] pruneOldRecords error:', err));

if (chrome.alarms) {
  chrome.alarms.create('daily-prune', { periodInMinutes: 24 * 60 });
  chrome.alarms.onAlarm.addListener((alarm: chrome.alarms.Alarm) => {
    if (alarm.name === 'daily-prune') {
      pruneOldRecords().catch((err) => console.error('[background] daily prune error:', err));
    }
  });
}

// ---------------------------------------------------------------------------
// Proxy handlers for In-Page Widget
// ---------------------------------------------------------------------------

chrome.runtime.onMessage.addListener((message: any, _sender: chrome.runtime.MessageSender, sendResponse: (response?: any) => void) => {
  if (message.type === 'GET_RECORDS_PROXY') {
    const { origin } = message;
    getRecordsByOrigin(origin).then((records) => {
      sendResponse({ records });
    }).catch((err) => {
      console.error('[background] Proxy storage error:', err);
      sendResponse({ records: [] });
    });
    return true;
  }

  if (message.type === 'GET_ALL_RECORDS_PROXY') {
    getAllOriginSummaries().then((summaries) => {
      sendResponse({ summaries });
    }).catch((err) => {
      console.error('[background] Proxy summarization error:', err);
      sendResponse({ summaries: [] });
    });
    return true;
  }

  if (message.type === 'CLEAR_SITE_RECORDS') {
    const { origin } = message;
    deleteRecordsByOrigin(origin).then(() => {
      sendResponse({ ok: true });
    }).catch((err) => {
      console.error('[background] Proxy clear error:', err);
      sendResponse({ ok: false });
    });
    return true;
  }
});
