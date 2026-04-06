// Popup UI — NetSpy
import { useEffect, useRef, useState } from 'react';
import type { RequestRecord, PIISeverity, Preferences } from '../types';
import { getRecordsByOrigin } from '../storage';
import { getPreferences, savePreferences, getSiteRiskScores } from '../preferences';
import { RequestDetailPanel } from '../components/RequestDetailPanel';

// ── Types ─────────────────────────────────────────────────────────────────────

interface LogEntry {
  level: 'log' | 'warn' | 'error' | 'info';
  message: string;
  timestamp: number;
}

interface HeaderRow { key: string; value: string }

interface ApiResponse {
  status: number;
  statusText: string;
  headers: Record<string, string>;
  body: string;
  timeMs: number;
}

type TabId = 'requests' | 'safety' | 'headers' | 'perf' | 'console' | 'api';

// ── Constants ─────────────────────────────────────────────────────────────────

const C = {
  bg: '#0f172a', card: '#1e293b', border: '#334155',
  textPri: '#f1f5f9', textSec: '#94a3b8', textMuted: '#475569',
  blue: '#3b82f6', green: '#22c55e', yellow: '#eab308', orange: '#f97316', red: '#ef4444',
};

const METHOD_COLORS: Record<string, { bg: string; text: string }> = {
  GET:    { bg: '#1d4ed8', text: '#93c5fd' },
  POST:   { bg: '#166534', text: '#86efac' },
  PUT:    { bg: '#92400e', text: '#fcd34d' },
  PATCH:  { bg: '#5b21b6', text: '#c4b5fd' },
  DELETE: { bg: '#991b1b', text: '#fca5a5' },
};

const SEVERITY_COLORS: Record<string, string> = {
  critical: '#ef4444', high: '#f97316', medium: '#eab308', low: '#22c55e',
};

const SECURITY_HEADERS = [
  { name: 'content-security-policy',   label: 'Content-Security-Policy',  color: C.red },
  { name: 'strict-transport-security', label: 'Strict-Transport-Security', color: C.orange },
  { name: 'x-frame-options',           label: 'X-Frame-Options',           color: C.yellow },
  { name: 'x-content-type-options',    label: 'X-Content-Type-Options',    color: C.yellow },
  { name: 'referrer-policy',           label: 'Referrer-Policy',           color: '#94a3b8' },
  { name: 'permissions-policy',        label: 'Permissions-Policy',        color: '#94a3b8' },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatTime(ms: number): string {
  return new Date(ms).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function truncateUrl(url: string, max = 52): string {
  try {
    const u = new URL(url);
    const path = u.pathname + u.search;
    return path.length > max ? path.slice(0, max) + '…' : path;
  } catch {
    return url.length > max ? url.slice(0, max) + '…' : url;
  }
}

function methodStyle(method: string) {
  return METHOD_COLORS[method.toUpperCase()] ?? { bg: '#334155', text: '#94a3b8' };
}

function piiWorstSeverity(findings: RequestRecord['piiFindings']): PIISeverity | null {
  if (!findings.length) return null;
  const order: PIISeverity[] = ['critical', 'high', 'medium', 'low'];
  for (const s of order) if (findings.some(f => f.severity === s)) return s;
  return 'low';
}

function riskColor(score: number) {
  if (score <= 25) return '#22c55e';
  if (score <= 50) return '#eab308';
  if (score <= 75) return '#f97316';
  return '#ef4444';
}

function riskLabel(score: number) {
  if (score <= 25) return 'Safe';
  if (score <= 50) return 'Low Risk';
  if (score <= 75) return 'Medium Risk';
  return 'High Risk';
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function copyToClipboard(text: string) {
  try { navigator.clipboard.writeText(text); } catch { /* ignore */ }
}

function buildCurl(record: RequestRecord): string {
  const headers = record.requestHeaders
    .map(h => `  -H '${h.name}: ${h.value.replace(/'/g, "\\'")}'`)
    .join(' \\\n');
  const body = record.requestBody
    ? ` \\\n  --data '${record.requestBody.replace(/'/g, "\\'")}'`
    : '';
  return `curl -X ${record.method} \\\n${headers}${body} \\\n  '${record.url}'`;
}

function buildFetch(record: RequestRecord): string {
  const headers: Record<string, string> = {};
  record.requestHeaders.forEach(h => { headers[h.name] = h.value; });
  const opts: Record<string, unknown> = { method: record.method, headers };
  if (record.requestBody) opts.body = record.requestBody;
  return `fetch('${record.url}', ${JSON.stringify(opts, null, 2)})
  .then(r => r.json())
  .then(console.log);`;
}

// ── Small shared components ───────────────────────────────────────────────────

function RiskRing({ score, size = 72 }: { score: number; size?: number }) {
  const r = (size - 10) / 2;
  const circ = 2 * Math.PI * r;
  const fill = (score / 100) * circ;
  const color = riskColor(score);
  return (
    <svg width={size} height={size} style={{ transform: 'rotate(-90deg)', flexShrink: 0 }}>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="#1e293b" strokeWidth={8} />
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth={8}
        strokeDasharray={`${fill} ${circ}`} strokeLinecap="round"
        style={{ transition: 'stroke-dasharray 0.5s ease' }} />
      <text x={size/2} y={size/2 + 1} textAnchor="middle" dominantBaseline="middle"
        fill={color} fontSize={size < 60 ? 11 : 14} fontWeight={700}
        style={{ transform: `rotate(90deg)`, transformOrigin: `${size/2}px ${size/2}px` }}>
        {score}%
      </text>
    </svg>
  );
}

function Toggle({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button role="switch" aria-checked={on} aria-label={label} onClick={() => onChange(!on)}
      style={{
        position: 'relative', width: 36, height: 20, borderRadius: 10, border: 'none',
        cursor: 'pointer', padding: 0, flexShrink: 0,
        backgroundColor: on ? '#3b82f6' : '#334155', transition: 'background-color 0.2s',
      }}>
      <span style={{
        position: 'absolute', top: 2, left: on ? 18 : 2,
        width: 16, height: 16, borderRadius: '50%', backgroundColor: '#fff',
        transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.4)',
      }} />
    </button>
  );
}

function SmallBtn({ onClick, children, title }: { onClick: () => void; children: React.ReactNode; title?: string }) {
  return (
    <button onClick={onClick} title={title} style={{
      padding: '3px 8px', borderRadius: 5, border: `1px solid ${C.border}`,
      backgroundColor: C.card, color: C.textSec, fontSize: 10, fontWeight: 600,
      cursor: 'pointer', whiteSpace: 'nowrap',
    }}>
      {children}
    </button>
  );
}

// ── Request Row ───────────────────────────────────────────────────────────────

function RequestRow({ record, selected, onClick }: { record: RequestRecord; selected: boolean; onClick: () => void }) {
  const ms = methodStyle(record.method);
  const worst = piiWorstSeverity(record.piiFindings);
  const statusOk = record.responseStatusCode < 400;
  return (
    <div onClick={onClick} style={{
      display: 'flex', alignItems: 'center', gap: 8,
      padding: '7px 12px', cursor: 'pointer',
      borderBottom: `1px solid ${C.card}`,
      backgroundColor: selected ? '#1e3a5f' : 'transparent',
      transition: 'background-color 0.1s',
    }}>
      <span style={{
        flexShrink: 0, padding: '2px 6px', borderRadius: 4,
        fontSize: 10, fontWeight: 700, letterSpacing: '0.03em',
        backgroundColor: ms.bg, color: ms.text, minWidth: 42, textAlign: 'center',
      }}>{record.method}</span>
      <span title={record.url} style={{
        flex: 1, fontSize: 11, color: '#cbd5e1',
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
      }}>{truncateUrl(record.url)}</span>
      <span style={{ flexShrink: 0, fontSize: 11, fontWeight: 600, color: statusOk ? '#4ade80' : '#f87171' }}>
        {record.responseStatusCode}
      </span>
      <span style={{ flexShrink: 0, fontSize: 10, color: '#475569', minWidth: 56, textAlign: 'right' }}>
        {formatTime(record.timestampMs)}
      </span>
      {worst && (
        <span style={{
          flexShrink: 0, padding: '1px 6px', borderRadius: 8,
          fontSize: 9, fontWeight: 700, color: '#fff', backgroundColor: SEVERITY_COLORS[worst],
        }}>PII</span>
      )}
    </div>
  );
}

// ── Enhanced RequestDetailPanel wrapper with copy buttons ─────────────────────

function RequestDetailWithCopy({ record, onClose, onReplay }: {
  record: RequestRecord; onClose: () => void; onReplay: (r: RequestRecord) => void;
}) {
  const [copied, setCopied] = useState<string | null>(null);
  function copy(type: 'curl' | 'fetch') {
    copyToClipboard(type === 'curl' ? buildCurl(record) : buildFetch(record));
    setCopied(type);
    setTimeout(() => setCopied(null), 1500);
  }
  return (
    <div>
      <div style={{
        display: 'flex', gap: 6, padding: '6px 14px',
        backgroundColor: '#162032', borderTop: `1px solid ${C.border}`,
        borderBottom: `1px solid ${C.border}`,
      }}>
        <SmallBtn onClick={() => copy('curl')}>{copied === 'curl' ? '✓ Copied!' : '📋 Copy cURL'}</SmallBtn>
        <SmallBtn onClick={() => copy('fetch')}>{copied === 'fetch' ? '✓ Copied!' : '📋 Copy fetch()'}</SmallBtn>
        <SmallBtn onClick={() => onReplay(record)}>🔁 Replay in API Tester</SmallBtn>
      </div>
      <RequestDetailPanel record={record} onClose={onClose} />
    </div>
  );
}

// ── Headers Tab ───────────────────────────────────────────────────────────────

function HeadersTab({ record }: { record: RequestRecord | null }) {
  if (!record) {
    return (
      <div style={{ padding: 24, textAlign: 'center', color: C.textMuted, fontSize: 12 }}>
        Select a request to analyze its headers.
      </div>
    );
  }

  const respHeaders = record.responseHeaders;
  const headerMap: Record<string, string> = {};
  respHeaders.forEach(h => { headerMap[h.name.toLowerCase()] = h.value; });

  const corsOrigin = headerMap['access-control-allow-origin'];
  const setCookies = respHeaders.filter(h => h.name.toLowerCase() === 'set-cookie');

  return (
    <div style={{ padding: 12, overflowY: 'auto', maxHeight: 400, display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* Security headers */}
      <div>
        <div style={{ fontSize: 10, fontWeight: 700, color: C.textMuted, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>
          Security Headers
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {SECURITY_HEADERS.map(sh => {
            const val = headerMap[sh.name];
            return (
              <div key={sh.name} style={{
                display: 'flex', alignItems: 'flex-start', gap: 8,
                padding: '6px 10px', borderRadius: 6, backgroundColor: C.card,
                border: `1px solid ${C.border}`,
              }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: C.textPri }}>{sh.label}</div>
                  {val && <div style={{ fontSize: 10, color: C.textMuted, marginTop: 2, wordBreak: 'break-all' }}>{val}</div>}
                </div>
                {val ? (
                  <span style={{ flexShrink: 0, padding: '2px 7px', borderRadius: 4, fontSize: 9, fontWeight: 700, backgroundColor: '#14532d40', color: '#4ade80' }}>
                    Present
                  </span>
                ) : (
                  <span style={{ flexShrink: 0, padding: '2px 7px', borderRadius: 4, fontSize: 9, fontWeight: 700, backgroundColor: sh.color + '30', color: sh.color }}>
                    Missing
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* CORS */}
      <div>
        <div style={{ fontSize: 10, fontWeight: 700, color: C.textMuted, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>
          CORS
        </div>
        <div style={{ padding: '6px 10px', borderRadius: 6, backgroundColor: C.card, border: `1px solid ${C.border}` }}>
          {corsOrigin ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 11, color: C.textSec, flex: 1 }}>
                Access-Control-Allow-Origin: <strong style={{ color: C.textPri }}>{corsOrigin}</strong>
              </span>
              {corsOrigin === '*' && (
                <span style={{ flexShrink: 0, padding: '2px 7px', borderRadius: 4, fontSize: 9, fontWeight: 700, backgroundColor: C.orange + '30', color: C.orange }}>
                  ⚠ Wildcard
                </span>
              )}
            </div>
          ) : (
            <span style={{ fontSize: 11, color: C.textMuted, fontStyle: 'italic' }}>No CORS headers</span>
          )}
        </div>
      </div>

      {/* Set-Cookie */}
      {setCookies.length > 0 && (
        <div>
          <div style={{ fontSize: 10, fontWeight: 700, color: C.textMuted, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>
            Set-Cookie ({setCookies.length})
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {setCookies.map((h, i) => {
              const val = h.value.toLowerCase();
              const hasSecure = val.includes('secure');
              const hasHttpOnly = val.includes('httponly');
              const hasSameSite = val.includes('samesite');
              return (
                <div key={i} style={{ padding: '6px 10px', borderRadius: 6, backgroundColor: C.card, border: `1px solid ${C.border}` }}>
                  <div style={{ fontSize: 10, color: C.textMuted, wordBreak: 'break-all', marginBottom: 5 }}>{h.value}</div>
                  <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                    {(['Secure', 'HttpOnly', 'SameSite'] as const).map(attr => {
                      const present = attr === 'Secure' ? hasSecure : attr === 'HttpOnly' ? hasHttpOnly : hasSameSite;
                      return (
                        <span key={attr} style={{
                          padding: '1px 6px', borderRadius: 4, fontSize: 9, fontWeight: 700,
                          backgroundColor: present ? '#14532d40' : C.orange + '30',
                          color: present ? '#4ade80' : C.orange,
                        }}>{present ? `✓ ${attr}` : `✗ ${attr}`}</span>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* All response headers */}
      <div>
        <div style={{ fontSize: 10, fontWeight: 700, color: C.textMuted, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>
          All Response Headers ({respHeaders.length})
        </div>
        <div style={{ backgroundColor: C.bg, borderRadius: 6, border: `1px solid ${C.border}`, overflow: 'hidden' }}>
          {respHeaders.map((h, i) => (
            <div key={i} style={{ display: 'flex', borderBottom: i < respHeaders.length - 1 ? `1px solid ${C.border}` : 'none', fontSize: 11 }}>
              <div style={{ padding: '4px 10px', color: C.textMuted, fontWeight: 600, width: '40%', wordBreak: 'break-all', borderRight: `1px solid ${C.border}`, backgroundColor: C.card + 'aa' }}>
                {h.name}
              </div>
              <div style={{ padding: '4px 10px', color: C.textSec, wordBreak: 'break-all', flex: 1 }}>
                {h.value}
              </div>
            </div>
          ))}
          {respHeaders.length === 0 && (
            <div style={{ padding: '10px', color: C.textMuted, fontSize: 11, fontStyle: 'italic' }}>No response headers captured.</div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Performance Tab ───────────────────────────────────────────────────────────

function PerfTab({ records }: { records: RequestRecord[] }) {
  const now = Date.now();
  const recentMs = now - 60_000;

  const totalBytes = records.reduce((sum, r) => sum + (r.requestBody?.length ?? 0), 0);
  const reqPerMin = records.filter(r => r.timestampMs >= recentMs).length;

  const methodCounts: Record<string, number> = {};
  records.forEach(r => { methodCounts[r.method] = (methodCounts[r.method] ?? 0) + 1; });
  const maxMethodCount = Math.max(1, ...Object.values(methodCounts));

  const statusBuckets: Record<string, number> = { '2xx': 0, '3xx': 0, '4xx': 0, '5xx': 0, 'other': 0 };
  records.forEach(r => {
    const s = r.responseStatusCode;
    if (s >= 200 && s < 300) statusBuckets['2xx']++;
    else if (s >= 300 && s < 400) statusBuckets['3xx']++;
    else if (s >= 400 && s < 500) statusBuckets['4xx']++;
    else if (s >= 500) statusBuckets['5xx']++;
    else statusBuckets['other']++;
  });
  const statusColors: Record<string, string> = { '2xx': C.green, '3xx': C.yellow, '4xx': C.orange, '5xx': C.red, 'other': C.textMuted };

  // Slowest 5 by URL (no timing data, show N/A)
  const urlCounts: Record<string, number> = {};
  records.forEach(r => { urlCounts[r.url] = (urlCounts[r.url] ?? 0) + 1; });
  const slowest5 = Object.entries(urlCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  const statCard = (label: string, value: string) => (
    <div style={{ flex: 1, padding: '10px 12px', borderRadius: 8, backgroundColor: C.card, border: `1px solid ${C.border}`, textAlign: 'center' }}>
      <div style={{ fontSize: 18, fontWeight: 700, color: C.textPri }}>{value}</div>
      <div style={{ fontSize: 10, color: C.textMuted, marginTop: 2 }}>{label}</div>
    </div>
  );

  return (
    <div style={{ padding: 12, overflowY: 'auto', maxHeight: 400, display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* Stat cards */}
      <div style={{ display: 'flex', gap: 8 }}>
        {statCard('Total Requests', String(records.length))}
        {statCard('Data Transferred', formatBytes(totalBytes))}
        {statCard('Req / min', String(reqPerMin))}
      </div>

      {/* Method bar chart */}
      <div>
        <div style={{ fontSize: 10, fontWeight: 700, color: C.textMuted, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>
          Requests by Method
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
          {Object.entries(methodCounts).map(([method, count]) => {
            const ms = methodStyle(method);
            const pct = (count / maxMethodCount) * 100;
            return (
              <div key={method} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ width: 48, fontSize: 10, fontWeight: 700, color: ms.text, textAlign: 'right', flexShrink: 0 }}>{method}</span>
                <div style={{ flex: 1, height: 14, borderRadius: 3, backgroundColor: C.bg, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${pct}%`, backgroundColor: ms.bg, borderRadius: 3, transition: 'width 0.4s ease' }} />
                </div>
                <span style={{ width: 28, fontSize: 10, color: C.textMuted, textAlign: 'right', flexShrink: 0 }}>{count}</span>
              </div>
            );
          })}
          {Object.keys(methodCounts).length === 0 && (
            <div style={{ fontSize: 11, color: C.textMuted, fontStyle: 'italic' }}>No data</div>
          )}
        </div>
      </div>

      {/* Status code breakdown */}
      <div>
        <div style={{ fontSize: 10, fontWeight: 700, color: C.textMuted, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>
          Status Code Breakdown
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {Object.entries(statusBuckets).filter(([, v]) => v > 0).map(([bucket, count]) => (
            <div key={bucket} style={{
              padding: '6px 12px', borderRadius: 6, backgroundColor: statusColors[bucket] + '20',
              border: `1px solid ${statusColors[bucket]}50`, textAlign: 'center',
            }}>
              <div style={{ fontSize: 16, fontWeight: 700, color: statusColors[bucket] }}>{count}</div>
              <div style={{ fontSize: 10, color: statusColors[bucket] }}>{bucket}</div>
            </div>
          ))}
          {records.length === 0 && <div style={{ fontSize: 11, color: C.textMuted, fontStyle: 'italic' }}>No data</div>}
        </div>
      </div>

      {/* Top endpoints */}
      <div>
        <div style={{ fontSize: 10, fontWeight: 700, color: C.textMuted, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>
          Top 5 Endpoints (by frequency)
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {slowest5.map(([url, count], i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 8px', borderRadius: 6, backgroundColor: C.card, border: `1px solid ${C.border}` }}>
              <span style={{ fontSize: 10, color: C.textMuted, flexShrink: 0, width: 16, textAlign: 'center' }}>{i + 1}</span>
              <span style={{ flex: 1, fontSize: 10, color: C.textSec, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={url}>
                {truncateUrl(url, 60)}
              </span>
              <span style={{ flexShrink: 0, fontSize: 10, color: C.textMuted }}>×{count}</span>
              <span style={{ flexShrink: 0, fontSize: 10, color: C.textMuted, fontStyle: 'italic' }}>N/A</span>
            </div>
          ))}
          {slowest5.length === 0 && <div style={{ fontSize: 11, color: C.textMuted, fontStyle: 'italic' }}>No data</div>}
        </div>
      </div>
    </div>
  );
}

// ── Console Tab ───────────────────────────────────────────────────────────────

function ConsoleTab() {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  async function fetchLogs() {
    try {
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      const tabId = tabs[0]?.id;
      if (!tabId) { setError('No active tab'); return; }
      const result = await chrome.tabs.sendMessage(tabId, { type: 'GET_CONSOLE_LOGS' }).catch(() => null);
      if (Array.isArray(result)) { setLogs(result); setError(null); }
      else setError('Content script not available on this page.');
    } catch (e) {
      setError('Could not connect to page.');
    }
  }

  async function clearLogs() {
    try {
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      const tabId = tabs[0]?.id;
      if (tabId) await chrome.tabs.sendMessage(tabId, { type: 'CLEAR_CONSOLE_LOGS' }).catch(() => null);
    } catch { /* ignore */ }
    setLogs([]);
  }

  useEffect(() => {
    fetchLogs();
    intervalRef.current = setInterval(fetchLogs, 2000);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, []);

  const levelColor: Record<LogEntry['level'], string> = {
    error: C.red, warn: C.yellow, info: C.blue, log: '#64748b',
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 400 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 12px', borderBottom: `1px solid ${C.border}` }}>
        <span style={{ fontSize: 11, color: C.textMuted }}>{logs.length} entries</span>
        <SmallBtn onClick={clearLogs}>🗑 Clear</SmallBtn>
      </div>
      <div style={{ flex: 1, overflowY: 'auto', fontFamily: 'monospace', fontSize: 11, backgroundColor: '#0a0f1a' }}>
        {error ? (
          <div style={{ padding: 16, color: C.orange, fontSize: 11 }}>{error}</div>
        ) : logs.length === 0 ? (
          <div style={{ padding: 16, color: C.textMuted, fontStyle: 'italic' }}>No console logs captured yet.</div>
        ) : (
          [...logs].reverse().map((log, i) => (
            <div key={i} style={{
              display: 'flex', alignItems: 'flex-start', gap: 8,
              padding: '4px 10px', borderBottom: `1px solid #0f172a`,
              backgroundColor: log.level === 'error' ? '#1a0a0a' : log.level === 'warn' ? '#1a1500' : 'transparent',
            }}>
              <span style={{ flexShrink: 0, fontSize: 9, color: '#334155', paddingTop: 1 }}>
                {new Date(log.timestamp).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
              </span>
              <span style={{
                flexShrink: 0, padding: '1px 5px', borderRadius: 3, fontSize: 9, fontWeight: 700,
                backgroundColor: levelColor[log.level] + '25', color: levelColor[log.level],
                textTransform: 'uppercase', minWidth: 32, textAlign: 'center',
              }}>{log.level}</span>
              <span style={{ color: levelColor[log.level], wordBreak: 'break-all', flex: 1 }}>{log.message}</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

// ── API Tester Tab ────────────────────────────────────────────────────────────

function ApiTesterTab({ prefill }: { prefill: RequestRecord | null }) {
  const [method, setMethod] = useState('GET');
  const [url, setUrl] = useState('');
  const [headers, setHeaders] = useState<HeaderRow[]>([{ key: '', value: '' }]);
  const [body, setBody] = useState('');
  const [response, setResponse] = useState<ApiResponse | null>(null);
  const [sending, setSending] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  // Pre-fill from selected request
  useEffect(() => {
    if (!prefill) return;
    setMethod(prefill.method);
    setUrl(prefill.url);
    setHeaders(
      prefill.requestHeaders.length > 0
        ? prefill.requestHeaders.map(h => ({ key: h.name, value: h.value }))
        : [{ key: '', value: '' }]
    );
    setBody(prefill.requestBody ?? '');
    setResponse(null);
  }, [prefill]);

  function addHeader() { setHeaders(h => [...h, { key: '', value: '' }]); }
  function removeHeader(i: number) { setHeaders(h => h.filter((_, idx) => idx !== i)); }
  function updateHeader(i: number, field: 'key' | 'value', val: string) {
    setHeaders(h => h.map((row, idx) => idx === i ? { ...row, [field]: val } : row));
  }

  async function sendRequest() {
    setSending(true);
    setResponse(null);
    const start = Date.now();
    try {
      const hdrs: Record<string, string> = {};
      headers.forEach(h => { if (h.key.trim()) hdrs[h.key.trim()] = h.value; });
      const opts: RequestInit = { method, headers: hdrs };
      if (['POST', 'PUT', 'PATCH'].includes(method) && body) opts.body = body;
      const res = await fetch(url, opts);
      const timeMs = Date.now() - start;
      const respHeaders: Record<string, string> = {};
      res.headers.forEach((v, k) => { respHeaders[k] = v; });
      const text = await res.text();
      setResponse({ status: res.status, statusText: res.statusText, headers: respHeaders, body: text, timeMs });
    } catch (e) {
      setResponse({ status: 0, statusText: String(e), headers: {}, body: '', timeMs: Date.now() - start });
    } finally {
      setSending(false);
    }
  }

  function buildCurlFromForm(): string {
    const hdrs = headers.filter(h => h.key.trim()).map(h => `  -H '${h.key}: ${h.value.replace(/'/g, "\\'")}'`).join(' \\\n');
    const b = body ? ` \\\n  --data '${body.replace(/'/g, "\\'")}'` : '';
    return `curl -X ${method} \\\n${hdrs}${b} \\\n  '${url}'`;
  }

  function buildFetchFromForm(): string {
    const hdrs: Record<string, string> = {};
    headers.filter(h => h.key.trim()).forEach(h => { hdrs[h.key] = h.value; });
    const opts: Record<string, unknown> = { method, headers: hdrs };
    if (body) opts.body = body;
    return `fetch('${url}', ${JSON.stringify(opts, null, 2)})\n  .then(r => r.json())\n  .then(console.log);`;
  }

  function copy(type: string, text: string) {
    copyToClipboard(text);
    setCopied(type);
    setTimeout(() => setCopied(null), 1500);
  }

  let prettyBody = '';
  if (response?.body) {
    try { prettyBody = JSON.stringify(JSON.parse(response.body), null, 2); }
    catch { prettyBody = response.body; }
  }

  const statusColor = !response ? C.textMuted
    : response.status >= 500 ? C.red
    : response.status >= 400 ? C.orange
    : response.status >= 300 ? C.yellow : C.green;

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '6px 8px', borderRadius: 5,
    border: `1px solid ${C.border}`, backgroundColor: C.bg,
    color: C.textPri, fontSize: 11, boxSizing: 'border-box',
    outline: 'none',
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', maxHeight: 480, overflowY: 'auto' }}>
      <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
        {/* Method + URL */}
        <div style={{ display: 'flex', gap: 6 }}>
          <select value={method} onChange={e => setMethod(e.target.value)} style={{ ...inputStyle, width: 90, flexShrink: 0 }}>
            {['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].map(m => <option key={m}>{m}</option>)}
          </select>
          <input value={url} onChange={e => setUrl(e.target.value)} placeholder="https://api.example.com/endpoint"
            style={{ ...inputStyle, flex: 1 }} />
        </div>

        {/* Headers */}
        <div>
          <div style={{ fontSize: 10, fontWeight: 700, color: C.textMuted, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>
            Headers
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {headers.map((h, i) => (
              <div key={i} style={{ display: 'flex', gap: 4 }}>
                <input value={h.key} onChange={e => updateHeader(i, 'key', e.target.value)}
                  placeholder="Header name" style={{ ...inputStyle, flex: 1 }} />
                <input value={h.value} onChange={e => updateHeader(i, 'value', e.target.value)}
                  placeholder="Value" style={{ ...inputStyle, flex: 2 }} />
                <button onClick={() => removeHeader(i)} style={{
                  padding: '0 8px', borderRadius: 5, border: `1px solid ${C.border}`,
                  backgroundColor: C.card, color: C.red, fontSize: 14, cursor: 'pointer', flexShrink: 0,
                }}>×</button>
              </div>
            ))}
            <SmallBtn onClick={addHeader}>+ Add Header</SmallBtn>
          </div>
        </div>

        {/* Body */}
        {['POST', 'PUT', 'PATCH'].includes(method) && (
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, color: C.textMuted, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>
              Body
            </div>
            <textarea value={body} onChange={e => setBody(e.target.value)}
              placeholder='{"key": "value"}'
              rows={4}
              style={{ ...inputStyle, resize: 'vertical', fontFamily: 'monospace' }} />
          </div>
        )}

        {/* Actions */}
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <button onClick={sendRequest} disabled={sending || !url.trim()} style={{
            padding: '7px 16px', borderRadius: 6, border: 'none',
            backgroundColor: sending ? '#1e3a5f' : C.blue, color: '#fff',
            fontSize: 12, fontWeight: 700, cursor: sending ? 'not-allowed' : 'pointer',
          }}>
            {sending ? 'Sending…' : 'Send Request'}
          </button>
          <SmallBtn onClick={() => copy('curl', buildCurlFromForm())}>{copied === 'curl' ? '✓ Copied!' : '📋 Copy cURL'}</SmallBtn>
          <SmallBtn onClick={() => copy('fetch', buildFetchFromForm())}>{copied === 'fetch' ? '✓ Copied!' : '📋 Copy fetch()'}</SmallBtn>
        </div>
      </div>

      {/* Response */}
      {response && (
        <div style={{ borderTop: `1px solid ${C.border}`, padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: statusColor }}>
              {response.status} {response.statusText}
            </span>
            <span style={{ fontSize: 11, color: C.textMuted }}>{response.timeMs}ms</span>
          </div>

          {Object.keys(response.headers).length > 0 && (
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, color: C.textMuted, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>
                Response Headers
              </div>
              <div style={{ backgroundColor: C.bg, borderRadius: 6, border: `1px solid ${C.border}`, overflow: 'hidden' }}>
                {Object.entries(response.headers).map(([k, v], i, arr) => (
                  <div key={k} style={{ display: 'flex', borderBottom: i < arr.length - 1 ? `1px solid ${C.border}` : 'none', fontSize: 10 }}>
                    <div style={{ padding: '3px 8px', color: C.textMuted, fontWeight: 600, width: '40%', wordBreak: 'break-all', borderRight: `1px solid ${C.border}`, backgroundColor: C.card + 'aa' }}>{k}</div>
                    <div style={{ padding: '3px 8px', color: C.textSec, wordBreak: 'break-all', flex: 1 }}>{v}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {prettyBody && (
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, color: C.textMuted, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>
                Response Body
              </div>
              <pre style={{
                margin: 0, padding: '8px 10px', backgroundColor: C.bg,
                border: `1px solid ${C.border}`, borderRadius: 6,
                fontSize: 10, overflowX: 'auto', whiteSpace: 'pre-wrap',
                wordBreak: 'break-all', color: C.textSec, maxHeight: 200, overflowY: 'auto',
                fontFamily: 'monospace',
              }}>{prettyBody}</pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Safety Tab ────────────────────────────────────────────────────────────────

interface SafetyResult {
  riskPercent: number;
  verdict: 'safe' | 'suspicious' | 'dangerous';
  flags: { label: string; severity: 'low' | 'medium' | 'high'; detail: string }[];
  dangerousLinks: { url: string; reason: string }[];
}

const SUSPICIOUS_TLDS = ['.xyz', '.tk', '.ml', '.ga', '.cf', '.gq', '.top', '.click', '.loan', '.work', '.date', '.racing'];
const PHISHING_KEYWORDS = ['login', 'signin', 'verify', 'account', 'secure', 'update', 'confirm', 'banking', 'paypal', 'amazon', 'google', 'microsoft', 'apple', 'netflix'];
const DANGEROUS_LINK_PATTERNS = [
  /\.(exe|bat|cmd|msi|dmg|pkg|deb|apk|ps1|vbs|js)(\?|$)/i,
  /bit\.ly|tinyurl|t\.co|goo\.gl|ow\.ly|short\.io/i,
  /javascript:/i,
  /data:text\/html/i,
];

async function checkSiteSafety(origin: string): Promise<SafetyResult> {
  const flags: SafetyResult['flags'] = [];
  const dangerousLinks: SafetyResult['dangerousLinks'] = [];
  try {
    const url = new URL(origin);
    const hostname = url.hostname.toLowerCase();
    if (url.protocol !== 'https:') flags.push({ label: 'No HTTPS', severity: 'high', detail: 'Site uses unencrypted HTTP — data can be intercepted.' });
    const tld = '.' + hostname.split('.').slice(-1)[0];
    if (SUSPICIOUS_TLDS.includes(tld)) flags.push({ label: `Suspicious TLD (${tld})`, severity: 'medium', detail: 'This top-level domain is commonly used in phishing and spam.' });
    const matchedKeywords = PHISHING_KEYWORDS.filter(k => hostname.includes(k));
    if (matchedKeywords.length > 0) flags.push({ label: 'Phishing keywords in domain', severity: 'high', detail: `Domain contains: ${matchedKeywords.join(', ')}` });
    if (/^\d{1,3}(\.\d{1,3}){3}$/.test(hostname)) flags.push({ label: 'IP address URL', severity: 'high', detail: 'Legitimate sites rarely use raw IP addresses.' });
    const parts = hostname.split('.');
    if (parts.length > 4) flags.push({ label: 'Excessive subdomains', severity: 'medium', detail: `${parts.length} subdomain levels — may be obfuscating the real domain.` });
    if (hostname.startsWith('xn--')) flags.push({ label: 'Punycode domain', severity: 'medium', detail: 'Domain uses international characters — possible homograph attack.' });
    try {
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      const tabId = tabs[0]?.id;
      if (tabId) {
        const links = await chrome.tabs.sendMessage(tabId, { type: 'GET_PAGE_LINKS' }).catch(() => []) as string[];
        for (const link of links.slice(0, 200)) {
          for (const pattern of DANGEROUS_LINK_PATTERNS) {
            if (pattern.test(link)) {
              dangerousLinks.push({ url: link.length > 80 ? link.slice(0, 80) + '…' : link, reason: getDangerReason(link) });
              break;
            }
          }
        }
        if (dangerousLinks.length > 0) flags.push({ label: `${dangerousLinks.length} dangerous link${dangerousLinks.length > 1 ? 's' : ''} found`, severity: 'high', detail: 'Page contains links to executable files or URL shorteners.' });
      }
    } catch { /* content script not available */ }
  } catch { /* invalid origin */ }
  let risk = 0;
  for (const f of flags) { if (f.severity === 'high') risk += 30; else if (f.severity === 'medium') risk += 15; else risk += 5; }
  risk = Math.min(risk, 100);
  const verdict: SafetyResult['verdict'] = risk >= 60 ? 'dangerous' : risk >= 25 ? 'suspicious' : 'safe';
  return { riskPercent: risk, verdict, flags, dangerousLinks };
}

function getDangerReason(url: string): string {
  if (/\.(exe|bat|cmd|msi|dmg|pkg|deb|apk|ps1|vbs)(\?|$)/i.test(url)) return 'Executable file download';
  if (/bit\.ly|tinyurl|t\.co|goo\.gl|ow\.ly|short\.io/i.test(url)) return 'URL shortener (destination unknown)';
  if (/javascript:/i.test(url)) return 'JavaScript injection';
  if (/data:text\/html/i.test(url)) return 'Data URI injection';
  return 'Suspicious pattern';
}

function SafetyTab({ origin }: { origin: string | null }) {
  const [result, setResult] = useState<SafetyResult | null>(null);
  const [checking, setChecking] = useState(false);

  useEffect(() => { if (origin) runCheck(origin); }, [origin]);

  async function runCheck(o: string) {
    setChecking(true); setResult(null);
    try { setResult(await checkSiteSafety(o)); } finally { setChecking(false); }
  }

  if (!origin) return <div style={{ padding: 24, textAlign: 'center', color: C.textMuted, fontSize: 12 }}>No active tab detected.</div>;

  return (
    <div style={{ padding: 14, overflowY: 'auto', maxHeight: 400 }}>
      {checking ? (
        <div style={{ textAlign: 'center', padding: 24, color: C.textMuted, fontSize: 12 }}>
          <div style={{ fontSize: 24, marginBottom: 8 }}>🔍</div>Analyzing site safety…
        </div>
      ) : result ? (
        <SafetyReport result={result} onRecheck={() => runCheck(origin)} />
      ) : null}
    </div>
  );
}

function SafetyReport({ result, onRecheck }: { result: SafetyResult; onRecheck: () => void }) {
  const verdictConfig = {
    safe:       { icon: '✅', color: '#22c55e', label: 'Safe' },
    suspicious: { icon: '⚠️', color: '#eab308', label: 'Suspicious' },
    dangerous:  { icon: '🚨', color: '#ef4444', label: 'Dangerous' },
  }[result.verdict];
  const circ = 2 * Math.PI * 28;
  const fill = (result.riskPercent / 100) * circ;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '12px 14px', borderRadius: 10, backgroundColor: C.card, border: `1px solid ${verdictConfig.color}40` }}>
        <svg width={70} height={70} style={{ transform: 'rotate(-90deg)', flexShrink: 0 }}>
          <circle cx={35} cy={35} r={28} fill="none" stroke="#0f172a" strokeWidth={8} />
          <circle cx={35} cy={35} r={28} fill="none" stroke={verdictConfig.color} strokeWidth={8} strokeDasharray={`${fill} ${circ}`} strokeLinecap="round" />
          <text x={35} y={36} textAnchor="middle" dominantBaseline="middle" fill={verdictConfig.color} fontSize={13} fontWeight={700} style={{ transform: 'rotate(90deg)', transformOrigin: '35px 35px' }}>{result.riskPercent}%</text>
        </svg>
        <div>
          <div style={{ fontSize: 18, marginBottom: 2 }}>{verdictConfig.icon}</div>
          <div style={{ fontSize: 15, fontWeight: 700, color: verdictConfig.color }}>{verdictConfig.label}</div>
          <div style={{ fontSize: 10, color: '#64748b', marginTop: 2 }}>Risk score: {result.riskPercent}/100</div>
        </div>
        <button onClick={onRecheck} style={{ marginLeft: 'auto', padding: '5px 10px', borderRadius: 6, border: `1px solid ${C.border}`, backgroundColor: C.bg, color: '#64748b', fontSize: 10, cursor: 'pointer' }}>↻ Recheck</button>
      </div>
      {result.flags.length > 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: C.textMuted, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Risk Factors</div>
          {result.flags.map((f, i) => (
            <div key={i} style={{ padding: '8px 10px', borderRadius: 8, backgroundColor: C.card, borderLeft: `3px solid ${SEVERITY_COLORS[f.severity]}` }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                <span style={{ fontSize: 9, fontWeight: 700, padding: '1px 5px', borderRadius: 4, backgroundColor: SEVERITY_COLORS[f.severity] + '30', color: SEVERITY_COLORS[f.severity], textTransform: 'uppercase' }}>{f.severity}</span>
                <span style={{ fontSize: 11, fontWeight: 600, color: '#e2e8f0' }}>{f.label}</span>
              </div>
              <div style={{ fontSize: 10, color: '#64748b' }}>{f.detail}</div>
            </div>
          ))}
        </div>
      ) : (
        <div style={{ padding: '10px 12px', borderRadius: 8, backgroundColor: '#14532d20', border: '1px solid #16a34a40', color: '#4ade80', fontSize: 11, textAlign: 'center' }}>
          ✓ No risk factors detected
        </div>
      )}
      {result.dangerousLinks.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: C.textMuted, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Dangerous Links ({result.dangerousLinks.length})</div>
          {result.dangerousLinks.slice(0, 5).map((l, i) => (
            <div key={i} style={{ padding: '7px 10px', borderRadius: 8, backgroundColor: C.card, borderLeft: '3px solid #ef4444' }}>
              <div style={{ fontSize: 10, fontWeight: 600, color: '#fca5a5', marginBottom: 2 }}>{l.reason}</div>
              <div style={{ fontSize: 10, color: '#64748b', wordBreak: 'break-all' }}>{l.url}</div>
            </div>
          ))}
          {result.dangerousLinks.length > 5 && <div style={{ fontSize: 10, color: C.textMuted, textAlign: 'center' }}>+{result.dangerousLinks.length - 5} more</div>}
        </div>
      )}
    </div>
  );
}

// ── Main App ──────────────────────────────────────────────────────────────────

export default function App() {
  const [records, setRecords] = useState<RequestRecord[]>([]);
  const [origin, setOrigin] = useState<string | null>(null);
  const [selected, setSelected] = useState<RequestRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [prefs, setPrefs] = useState<Preferences>({ globalMonitoringEnabled: true, disabledSites: [] });
  const [riskScore, setRiskScore] = useState(0);
  const [tab, setTab] = useState<TabId>('requests');
  const [apiPrefill, setApiPrefill] = useState<RequestRecord | null>(null);
  const [consoleLogs, setConsoleLogs] = useState<LogEntry[]>([]);

  // Fetch console log count for badge (separate from ConsoleTab's own polling)
  useEffect(() => {
    async function fetchCount() {
      try {
        const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
        const tabId = tabs[0]?.id;
        if (!tabId) return;
        const result = await chrome.tabs.sendMessage(tabId, { type: 'GET_CONSOLE_LOGS' }).catch(() => null);
        if (Array.isArray(result)) setConsoleLogs(result);
      } catch { /* ignore */ }
    }
    fetchCount();
    const id = setInterval(fetchCount, 3000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    async function init() {
      try {
        const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
        const url = tabs[0]?.url;
        if (!url) { setLoading(false); return; }
        let o: string;
        try { o = new URL(url).origin; } catch { setLoading(false); return; }
        setOrigin(o);
        const [recs, p, scores] = await Promise.all([getRecordsByOrigin(o), getPreferences(), getSiteRiskScores()]);
        setRecords(recs.sort((a, b) => b.timestampMs - a.timestampMs));
        setPrefs(p);
        setRiskScore(scores[o] ?? 0);
      } catch (e) { console.error(e); }
      finally { setLoading(false); }
    }
    init();
  }, []);

  useEffect(() => {
    if (!origin) return;
    const handler = (msg: { type: string; record: RequestRecord }) => {
      if (msg.type === 'NEW_REQUEST' && msg.record?.origin === origin) {
        setRecords(prev => [msg.record, ...prev]);
      }
    };
    chrome.runtime.onMessage.addListener(handler);
    return () => chrome.runtime.onMessage.removeListener(handler);
  }, [origin]);

  async function toggleSiteMonitoring(enabled: boolean) {
    if (!origin) return;
    const sites = enabled
      ? prefs.disabledSites.filter(s => s !== origin)
      : [...prefs.disabledSites.filter(s => s !== origin), origin];
    const updated = { ...prefs, disabledSites: sites };
    setPrefs(updated);
    await savePreferences(updated);
  }

  function handleReplay(record: RequestRecord) {
    setApiPrefill(record);
    setTab('api');
  }

  const siteEnabled = origin ? !prefs.disabledSites.includes(origin) : true;
  const piiCount = records.reduce((n, r) => n + r.piiFindings.length, 0);
  const color = riskColor(riskScore);

  // Most recently selected or most recent record for headers tab
  const headersRecord = selected ?? records[0] ?? null;

  const TABS: { id: TabId; label: string }[] = [
    { id: 'requests', label: `Reqs${records.length ? ` ${records.length}` : ''}` },
    { id: 'safety',   label: '🛡 Safety' },
    { id: 'headers',  label: '🔧 Headers' },
    { id: 'perf',     label: '⚡ Perf' },
    { id: 'console',  label: `📋${consoleLogs.length > 0 ? ` ${consoleLogs.length}` : ' Log'}` },
    { id: 'api',      label: '🔁 API' },
  ];

  return (
    <div style={{ width: 400, minHeight: 300, display: 'flex', flexDirection: 'column', backgroundColor: C.bg, overflow: 'hidden' }}>

      {/* Global paused banner */}
      {!prefs.globalMonitoringEnabled && (
        <div style={{ padding: '6px 12px', backgroundColor: '#451a03', borderBottom: '1px solid #92400e', color: '#fcd34d', fontSize: 11, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
          ⏸ Global monitoring is paused
        </div>
      )}

      {/* Header */}
      <div style={{ padding: '8px 12px', backgroundColor: C.bg, borderBottom: `1px solid ${C.card}`, display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{ width: 26, height: 26, borderRadius: 7, background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, flexShrink: 0 }}>🔍</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#f1f5f9', lineHeight: 1.2 }}>NetSpy</div>
          {origin && <div style={{ fontSize: 9, color: '#64748b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={origin}>{origin}</div>}
        </div>
        <RiskRing score={riskScore} size={46} />
        {origin && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
            <Toggle on={siteEnabled} onChange={toggleSiteMonitoring} label="Toggle site monitoring" />
            <span style={{ fontSize: 8, color: '#475569' }}>{siteEnabled ? 'ON' : 'OFF'}</span>
          </div>
        )}
        <button onClick={() => chrome.tabs.create({ url: chrome.runtime.getURL('dashboard.html') })} title="Open Dashboard" style={{ padding: '4px 8px', borderRadius: 5, border: `1px solid ${C.border}`, backgroundColor: C.card, color: '#94a3b8', fontSize: 9, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0 }}>
          Dash ↗
        </button>
      </div>

      {/* Risk summary bar */}
      <div style={{ padding: '8px 14px', backgroundColor: C.bg, borderBottom: `1px solid ${C.card}`, display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{ flex: 1, height: 6, borderRadius: 3, backgroundColor: C.card, overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${riskScore}%`, borderRadius: 3, backgroundColor: color, transition: 'width 0.5s ease' }} />
        </div>
        <span style={{ fontSize: 11, fontWeight: 700, color, flexShrink: 0 }}>{riskLabel(riskScore)}</span>
        <span style={{ fontSize: 10, color: '#475569', flexShrink: 0 }}>{records.length} req · {piiCount} PII</span>
      </div>

      {/* Tab bar — equal width tabs, no overflow */}
      <div style={{ display: 'flex', borderBottom: `1px solid ${C.card}`, backgroundColor: C.bg, flexShrink: 0 }}>
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{
            flex: 1, padding: '7px 2px', border: 'none', cursor: 'pointer',
            backgroundColor: 'transparent',
            color: tab === t.id ? C.blue : '#475569',
            fontSize: 10, fontWeight: tab === t.id ? 700 : 400,
            borderBottom: tab === t.id ? `2px solid ${C.blue}` : '2px solid transparent',
            transition: 'color 0.15s', whiteSpace: 'nowrap', overflow: 'hidden',
            textOverflow: 'ellipsis', minWidth: 0,
          }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tab === 'requests' && (
        <>
          <div style={{ flex: 1, overflowY: 'auto', maxHeight: selected ? 200 : 360 }}>
            {loading ? (
              <div style={{ padding: 24, textAlign: 'center', color: '#475569', fontSize: 12 }}>Loading…</div>
            ) : records.length === 0 ? (
              <div style={{ padding: 24, textAlign: 'center', color: '#475569', fontSize: 12 }}>No requests captured yet for this site.</div>
            ) : (
              records.map(r => (
                <RequestRow key={r.id} record={r} selected={selected?.id === r.id}
                  onClick={() => setSelected(prev => prev?.id === r.id ? null : r)} />
              ))
            )}
          </div>
          {selected && (
            <RequestDetailWithCopy
              record={selected}
              onClose={() => setSelected(null)}
              onReplay={handleReplay}
            />
          )}
        </>
      )}

      {tab === 'safety' && <SafetyTab origin={origin} />}
      {tab === 'headers' && <HeadersTab record={headersRecord} />}
      {tab === 'perf' && <PerfTab records={records} />}
      {tab === 'console' && <ConsoleTab />}
      {tab === 'api' && <ApiTesterTab prefill={apiPrefill} />}
    </div>
  );
}
