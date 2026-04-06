// Dashboard UI — Browser Network Privacy Monitor (Dark Theme Redesign)
// Requirements: 4.1, 4.2, 4.4, 4.5, 4.7, 6.3, 6.4, 7.2, 7.7, 9.1, 9.2, 9.5

import { useEffect, useRef, useState } from 'react';
import type { ExportFormat, OriginSummary, PIIFinding, PIIType, Preferences, RequestRecord } from '../types';
import { getAllOriginSummaries, getRecordsByOrigin, deleteRecordsByOrigin, deleteAllRecords } from '../storage';
import { getPreferences, savePreferences } from '../preferences';
import { exportReport } from '../reportExporter';
import { RequestDetailPanel } from '../components/RequestDetailPanel';

// ── Color Palette ─────────────────────────────────────────────────────────────

const C = {
  bg:        '#0f172a',
  card:      '#1e293b',
  border:    '#334155',
  textPri:   '#f1f5f9',
  textSec:   '#94a3b8',
  textMuted: '#475569',
  blue:      '#3b82f6',
  green:     '#22c55e',
  yellow:    '#eab308',
  orange:    '#f97316',
  red:       '#ef4444',
} as const;

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDate(ms: number): string {
  return new Date(ms).toLocaleDateString(undefined, {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function riskColor(score: number): string {
  if (score <= 25) return C.green;
  if (score <= 50) return C.yellow;
  if (score <= 75) return C.orange;
  return C.red;
}

function riskLabel(score: number): string {
  if (score <= 25) return 'Low';
  if (score <= 50) return 'Med';
  if (score <= 75) return 'High';
  return 'Crit';
}

function methodBg(method: string): string {
  switch (method) {
    case 'GET':    return C.blue;
    case 'POST':   return C.green;
    case 'PUT':    return C.orange;
    case 'PATCH':  return '#a855f7';
    case 'DELETE': return C.red;
    default:       return C.textMuted;
  }
}

function statusColor(code: number): string {
  if (code < 300) return C.green;
  if (code < 400) return C.yellow;
  if (code < 500) return C.orange;
  return C.red;
}

// ── Risk Bar ──────────────────────────────────────────────────────────────────

function RiskBar({ score }: { score: number }) {
  const color = riskColor(score);
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
      <div
        style={{
          flex: 1,
          height: 4,
          borderRadius: 2,
          backgroundColor: C.border,
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            width: `${Math.min(score, 100)}%`,
            height: '100%',
            backgroundColor: color,
            borderRadius: 2,
            transition: 'width 0.3s ease',
          }}
        />
      </div>
      <span style={{ fontSize: 10, fontWeight: 700, color, flexShrink: 0, minWidth: 28, textAlign: 'right' }}>
        {score}%
      </span>
    </div>
  );
}

// ── Method Badge ──────────────────────────────────────────────────────────────

function MethodBadge({ method }: { method: string }) {
  return (
    <span
      style={{
        display: 'inline-block',
        padding: '2px 7px',
        borderRadius: 4,
        fontSize: 10,
        fontWeight: 700,
        color: '#fff',
        backgroundColor: methodBg(method),
        minWidth: 46,
        textAlign: 'center',
        letterSpacing: '0.03em',
        flexShrink: 0,
      }}
    >
      {method}
    </span>
  );
}

// ── Sidebar Site Row ──────────────────────────────────────────────────────────

interface SiteRowProps {
  summary: OriginSummary;
  isAllowlisted: boolean;
  isSelected: boolean;
  onClick: () => void;
  onToggleAllowlist: (e: React.MouseEvent) => void;
}

function SiteRow({ summary, isAllowlisted, isSelected, onClick, onToggleAllowlist }: SiteRowProps) {
  const [hovered, setHovered] = useState(false);
  const color = riskColor(summary.riskScore);

  // Extract short hostname for display
  let host = summary.origin;
  try { host = new URL(summary.origin).hostname; } catch { /* keep */ }

  return (
    <div
      onClick={onClick}
      role="row"
      aria-selected={isSelected}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        padding: '10px 14px',
        cursor: 'pointer',
        borderBottom: `1px solid ${C.border}`,
        backgroundColor: isSelected ? '#1d3a5f' : hovered ? '#243347' : 'transparent',
        borderLeft: isSelected ? `3px solid ${C.blue}` : '3px solid transparent',
        transition: 'background-color 0.15s, border-left-color 0.15s',
        opacity: isAllowlisted ? 0.55 : 1,
      }}
    >
      {/* Top row: favicon circle + hostname + count */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
        {/* Favicon placeholder */}
        <div
          style={{
            width: 24,
            height: 24,
            borderRadius: '50%',
            backgroundColor: color + '33',
            border: `1.5px solid ${color}66`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
            fontSize: 10,
            fontWeight: 700,
            color,
          }}
        >
          {host.charAt(0).toUpperCase()}
        </div>

        {/* Hostname */}
        <div
          style={{
            flex: 1,
            minWidth: 0,
            fontSize: 12,
            fontWeight: 600,
            color: isSelected ? C.textPri : C.textSec,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
          title={summary.origin}
        >
          {host}
        </div>

        {/* Request count */}
        <span style={{ fontSize: 11, color: C.textMuted, flexShrink: 0 }}>
          {summary.requestCount.toLocaleString()}
        </span>
      </div>

      {/* Risk bar row */}
      <div style={{ paddingLeft: 32 }}>
        <RiskBar score={summary.riskScore} />
      </div>

      {/* Allowlist toggle — small, below */}
      <div style={{ paddingLeft: 32, marginTop: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
        {isAllowlisted && (
          <span style={{ fontSize: 9, color: C.textMuted, backgroundColor: C.border, padding: '1px 5px', borderRadius: 4 }}>
            DISABLED
          </span>
        )}
        <button
          onClick={onToggleAllowlist}
          aria-label={isAllowlisted ? `Enable monitoring for ${summary.origin}` : `Disable monitoring for ${summary.origin}`}
          style={{
            padding: '2px 8px',
            borderRadius: 4,
            border: `1px solid ${isAllowlisted ? C.green + '80' : C.border}`,
            backgroundColor: 'transparent',
            color: isAllowlisted ? C.green : C.textMuted,
            fontSize: 10,
            fontWeight: 600,
            cursor: 'pointer',
            transition: 'color 0.15s, border-color 0.15s',
          }}
        >
          {isAllowlisted ? '✓ Enable' : '⊘ Disable'}
        </button>
      </div>
    </div>
  );
}

// ── Sort Controls ─────────────────────────────────────────────────────────────

type SortKey = 'riskScore' | 'requestCount' | 'lastActivityMs' | 'origin';

interface SortControlsProps {
  sortKey: SortKey;
  onChange: (key: SortKey) => void;
}

function SortControls({ sortKey, onChange }: SortControlsProps) {
  const options: { key: SortKey; label: string }[] = [
    { key: 'riskScore',     label: 'Risk' },
    { key: 'requestCount',  label: 'Requests' },
    { key: 'lastActivityMs', label: 'Recent' },
    { key: 'origin',        label: 'A–Z' },
  ];
  return (
    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
      {options.map((opt) => {
        const active = sortKey === opt.key;
        return (
          <button
            key={opt.key}
            onClick={() => onChange(opt.key)}
            aria-pressed={active}
            style={{
              padding: '3px 9px',
              borderRadius: 5,
              border: `1px solid ${active ? C.blue : C.border}`,
              backgroundColor: active ? C.blue + '22' : 'transparent',
              color: active ? C.blue : C.textMuted,
              fontSize: 10,
              fontWeight: active ? 700 : 400,
              cursor: 'pointer',
              transition: 'all 0.15s',
            }}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

// ── Request Row ───────────────────────────────────────────────────────────────

interface RequestRowProps {
  record: RequestRecord;
  isSelected: boolean;
  onClick: () => void;
}

function RequestRow({ record, isSelected, onClick }: RequestRowProps) {
  const [hovered, setHovered] = useState(false);
  const piiCount = record.piiFindings.length;
  const ts = new Date(record.timestampMs).toLocaleTimeString(undefined, {
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });

  let displayUrl = record.url;
  try {
    const u = new URL(record.url);
    displayUrl = u.pathname + u.search;
  } catch { /* keep */ }

  return (
    <div
      onClick={onClick}
      role="row"
      aria-selected={isSelected}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '8px 14px',
        cursor: 'pointer',
        borderBottom: `1px solid ${C.border}`,
        backgroundColor: isSelected ? '#1d3a5f' : hovered ? '#243347' : 'transparent',
        borderLeft: isSelected ? `3px solid ${C.blue}` : '3px solid transparent',
        transition: 'background-color 0.15s',
      }}
    >
      <MethodBadge method={record.method} />

      <div
        style={{
          flex: 1,
          minWidth: 0,
          fontSize: 12,
          color: C.textSec,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          fontFamily: 'monospace',
        }}
        title={record.url}
      >
        {displayUrl}
      </div>

      <span style={{ flexShrink: 0, fontSize: 12, fontWeight: 700, color: statusColor(record.responseStatusCode), minWidth: 32, textAlign: 'right' }}>
        {record.responseStatusCode}
      </span>

      <span style={{ flexShrink: 0, fontSize: 10, color: C.textMuted, minWidth: 68, textAlign: 'right' }}>
        {ts}
      </span>

      {piiCount > 0 && (
        <span
          aria-label={`${piiCount} PII finding${piiCount !== 1 ? 's' : ''}`}
          style={{
            flexShrink: 0,
            display: 'inline-flex',
            alignItems: 'center',
            gap: 3,
            padding: '2px 7px',
            borderRadius: 10,
            fontSize: 10,
            fontWeight: 700,
            color: '#fff',
            backgroundColor: C.red,
          }}
        >
          ⚠ {piiCount}
        </span>
      )}
    </div>
  );
}

// ── Request List Panel ────────────────────────────────────────────────────────

const HTTP_METHODS = ['ALL', 'GET', 'POST', 'PUT', 'PATCH', 'DELETE'] as const;

interface RequestListPanelProps {
  origin: string;
  selectedRecord: RequestRecord | null;
  onSelectRecord: (r: RequestRecord) => void;
  onClearSiteData?: () => void;
}

function RequestListPanel({ origin, selectedRecord, onSelectRecord, onClearSiteData }: RequestListPanelProps) {
  const [records, setRecords] = useState<RequestRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [methodFilter, setMethodFilter] = useState<string>('ALL');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [piiFilter, setPiiFilter] = useState<'all' | 'pii-only'>('all');
  const [urlSearch, setUrlSearch] = useState('');
  const [debouncedUrl, setDebouncedUrl] = useState('');

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  function handleUrlChange(value: string) {
    setUrlSearch(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setDebouncedUrl(value), 500);
  }
  useEffect(() => () => { if (debounceRef.current) clearTimeout(debounceRef.current); }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const filters: Parameters<typeof getRecordsByOrigin>[1] = {};
    if (methodFilter !== 'ALL') filters.method = methodFilter;
    if (fromDate) filters.startMs = new Date(fromDate).getTime();
    if (toDate) { const d = new Date(toDate); d.setHours(23, 59, 59, 999); filters.endMs = d.getTime(); }
    if (piiFilter === 'pii-only') filters.hasPII = true;

    getRecordsByOrigin(origin, filters)
      .then((data) => {
        if (!cancelled) {
          data.sort((a, b) => b.timestampMs - a.timestampMs);
          setRecords(data);
        }
      })
      .catch((err) => console.error('[dashboard] load requests error', err))
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [origin, methodFilter, fromDate, toDate, piiFilter]);

  const displayed = debouncedUrl
    ? records.filter((r) => r.url.toLowerCase().includes(debouncedUrl.toLowerCase()))
    : records;

  const inputStyle: React.CSSProperties = {
    padding: '4px 10px',
    borderRadius: 6,
    border: `1px solid ${C.border}`,
    backgroundColor: C.bg,
    color: C.textPri,
    fontSize: 11,
    outline: 'none',
  };

  return (
    <div style={{ backgroundColor: C.card, borderRadius: 10, border: `1px solid ${C.border}`, overflow: 'hidden', flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      {/* Panel header */}
      <div style={{ padding: '12px 14px', borderBottom: `1px solid ${C.border}`, backgroundColor: C.bg + 'aa', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
          <span style={{ fontWeight: 700, fontSize: 13, color: C.textPri }}>Requests</span>
          <span style={{ fontSize: 12, color: C.blue, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{origin}</span>
          {onClearSiteData && (
            <button
              onClick={onClearSiteData}
              aria-label={`Clear all data for ${origin}`}
              style={{ marginLeft: 'auto', padding: '3px 10px', borderRadius: 6, border: `1px solid ${C.red}66`, backgroundColor: 'transparent', color: C.red, fontSize: 11, fontWeight: 600, cursor: 'pointer' }}
            >
              🗑 Clear
            </button>
          )}
        </div>

        {/* Filters */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: C.textMuted }}>
            Method:
            <select value={methodFilter} onChange={(e) => setMethodFilter(e.target.value)} aria-label="Filter by HTTP method" style={inputStyle}>
              {HTTP_METHODS.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
          </label>

          <label style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: C.textMuted }}>
            From:
            <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} aria-label="Filter from date" style={inputStyle} />
          </label>

          <label style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: C.textMuted }}>
            To:
            <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} aria-label="Filter to date" style={inputStyle} />
          </label>

          <label style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: C.textMuted }}>
            PII:
            <select value={piiFilter} onChange={(e) => setPiiFilter(e.target.value as 'all' | 'pii-only')} aria-label="Filter by PII presence" style={inputStyle}>
              <option value="all">All</option>
              <option value="pii-only">PII only</option>
            </select>
          </label>

          <input
            type="search"
            placeholder="Search URL…"
            value={urlSearch}
            onChange={(e) => handleUrlChange(e.target.value)}
            aria-label="Search by URL substring"
            style={{ ...inputStyle, flex: 1, minWidth: 140 }}
          />
        </div>
      </div>

      {/* Rows */}
      <div style={{ overflowY: 'auto', flex: 1 }}>
        {loading ? (
          <div style={{ padding: 24, textAlign: 'center', color: C.textMuted, fontSize: 12 }}>Loading…</div>
        ) : displayed.length === 0 ? (
          <div style={{ padding: 24, textAlign: 'center', color: C.textMuted, fontSize: 12 }}>No requests match the current filters.</div>
        ) : (
          <div role="table" aria-label={`Requests for ${origin}`}>
            {displayed.map((record) => (
              <RequestRow
                key={record.id}
                record={record}
                isSelected={selectedRecord?.id === record.id}
                onClick={() => onSelectRecord(record)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Stat Card ─────────────────────────────────────────────────────────────────

interface StatCardProps {
  label: string;
  value: string | number;
  color?: string;
  icon?: string;
}

function StatCard({ label, value, color = C.blue, icon }: StatCardProps) {
  return (
    <div
      style={{
        flex: '1 1 130px',
        backgroundColor: C.card,
        borderRadius: 10,
        padding: '14px 18px',
        border: `1px solid ${C.border}`,
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
      }}
    >
      <div style={{ fontSize: 11, color: C.textMuted, fontWeight: 500, display: 'flex', alignItems: 'center', gap: 5 }}>
        {icon && <span>{icon}</span>}
        {label}
      </div>
      <div style={{ fontSize: 26, fontWeight: 800, color, lineHeight: 1 }}>{value}</div>
    </div>
  );
}

// ── Summary Panel ─────────────────────────────────────────────────────────────

interface SummaryPanelProps {
  summaries: OriginSummary[];
}

function SummaryPanel({ summaries }: SummaryPanelProps) {
  const totalRequests = summaries.reduce((sum, s) => sum + s.requestCount, 0);
  const totalSites = summaries.length;
  const highRisk = summaries.filter((s) => s.riskScore > 50).length;
  const totalPII = summaries.reduce((sum, s) => sum + (s.riskScore > 0 ? 1 : 0), 0);
  const top5 = [...summaries].sort((a, b) => b.riskScore - a.riskScore).slice(0, 5);

  return (
    <div>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
        <StatCard label="Total Requests" value={totalRequests.toLocaleString()} icon="📡" />
        <StatCard label="Sites Monitored" value={totalSites} color={C.green} icon="🌐" />
        <StatCard label="High Risk Sites" value={highRisk} color={highRisk > 0 ? C.red : C.green} icon="⚠️" />
        <StatCard label="Active Sites" value={totalPII} color={C.yellow} icon="📊" />
      </div>

      {top5.length > 0 && (
        <div style={{ backgroundColor: C.card, borderRadius: 10, border: `1px solid ${C.border}`, overflow: 'hidden', marginBottom: 16 }}>
          <div style={{ padding: '10px 16px', borderBottom: `1px solid ${C.border}`, fontWeight: 700, fontSize: 12, color: C.textSec, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
            Top Risk Sites
          </div>
          {top5.map((s) => {
            const color = riskColor(s.riskScore);
            return (
              <div key={s.origin} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px', borderBottom: `1px solid ${C.border}` }}>
                <div style={{ flex: 1, fontSize: 12, fontWeight: 600, color: C.textPri, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={s.origin}>
                  {s.origin}
                </div>
                <span style={{ fontSize: 11, color: C.textMuted, flexShrink: 0 }}>{s.requestCount.toLocaleString()} req</span>
                <div style={{ width: 80, flexShrink: 0 }}>
                  <RiskBar score={s.riskScore} />
                </div>
                <span style={{ fontSize: 11, fontWeight: 700, color, flexShrink: 0, minWidth: 32, textAlign: 'right' }}>
                  {riskLabel(s.riskScore)}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── PII Section ───────────────────────────────────────────────────────────────

const PII_TYPE_LABELS: Record<PIIType, string> = {
  email: 'Email', phone: 'Phone', credit_card: 'Credit Card',
  password_field: 'Password Field', ssn: 'SSN', ipv4: 'IPv4 Address',
  ipv6: 'IPv6 Address', jwt: 'JWT Token', bearer_token: 'Bearer Token',
  basic_auth: 'Basic Auth', api_key: 'API Key',
};

const SEVERITY_ORDER = ['critical', 'high', 'medium', 'low'] as const;

const SEVERITY_COLORS: Record<string, string> = {
  critical: C.red, high: C.orange, medium: C.yellow, low: C.green,
};

interface PIIFindingWithOrigin extends PIIFinding { origin: string; }

interface PIISectionProps {
  selectedOrigin: string | null;
  summaries: OriginSummary[];
}

function PIISection({ selectedOrigin, summaries }: PIISectionProps) {
  const [findings, setFindings] = useState<PIIFindingWithOrigin[]>([]);
  const [loading, setLoading] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    async function load() {
      try {
        const origins = selectedOrigin ? [selectedOrigin] : summaries.map((s) => s.origin);
        const allFindings: PIIFindingWithOrigin[] = [];
        for (const origin of origins) {
          const records = await getRecordsByOrigin(origin);
          for (const record of records)
            for (const f of record.piiFindings)
              allFindings.push({ ...f, origin });
        }
        if (!cancelled) setFindings(allFindings);
      } catch (err) {
        console.error('[dashboard] PII load error', err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [selectedOrigin, summaries]);

  const grouped = new Map<string, Map<PIIType, PIIFindingWithOrigin[]>>();
  for (const f of findings) {
    if (!grouped.has(f.origin)) grouped.set(f.origin, new Map());
    const byType = grouped.get(f.origin)!;
    if (!byType.has(f.type)) byType.set(f.type, []);
    byType.get(f.type)!.push(f);
  }
  for (const byType of grouped.values())
    for (const [type, arr] of byType)
      byType.set(type, [...arr].sort((a, b) => SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity)));

  const totalCount = findings.length;

  function toggleGroup(key: string) {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }

  return (
    <div style={{ backgroundColor: C.card, borderRadius: 10, border: `1px solid ${C.border}`, overflow: 'hidden', marginTop: 16 }}>
      <button
        onClick={() => setCollapsed((c) => !c)}
        aria-expanded={!collapsed}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', gap: 10,
          padding: '12px 16px', borderBottom: collapsed ? 'none' : `1px solid ${C.border}`,
          backgroundColor: 'transparent', border: 'none', cursor: 'pointer', textAlign: 'left',
        }}
      >
        <span style={{ fontWeight: 700, fontSize: 13, flex: 1, color: C.textPri }}>
          🔐 PII &amp; Sensitive Data
          {selectedOrigin && <span style={{ fontWeight: 400, color: C.blue, marginLeft: 6 }}>— {selectedOrigin}</span>}
        </span>
        {!loading && (
          <span style={{ fontSize: 11, fontWeight: 600, color: totalCount > 0 ? C.red : C.textMuted, backgroundColor: totalCount > 0 ? C.red + '22' : C.border, padding: '2px 8px', borderRadius: 10 }}>
            {totalCount} finding{totalCount !== 1 ? 's' : ''}
          </span>
        )}
        <span style={{ fontSize: 11, color: C.textMuted }}>{collapsed ? '▶' : '▼'}</span>
      </button>

      {!collapsed && (
        <div style={{ maxHeight: 480, overflowY: 'auto' }}>
          {loading ? (
            <div style={{ padding: 24, textAlign: 'center', color: C.textMuted, fontSize: 12 }}>Loading…</div>
          ) : totalCount === 0 ? (
            <div style={{ padding: 24, textAlign: 'center', color: C.textMuted, fontSize: 12 }}>No PII findings detected.</div>
          ) : (
            Array.from(grouped.entries()).map(([origin, byType]) => (
              <div key={origin}>
                {!selectedOrigin && (
                  <div style={{ padding: '8px 16px', backgroundColor: C.bg + 'aa', borderBottom: `1px solid ${C.border}`, fontSize: 12, fontWeight: 700, color: C.textSec }}>
                    {origin}
                  </div>
                )}
                {Array.from(byType.entries()).map(([type, typeFindings]) => {
                  const groupKey = `${origin}::${type}`;
                  const isExpanded = expandedGroups.has(groupKey);
                  const worstSeverity = typeFindings[0]?.severity ?? 'low';
                  return (
                    <div key={type} style={{ borderBottom: `1px solid ${C.border}` }}>
                      <button
                        onClick={() => toggleGroup(groupKey)}
                        aria-expanded={isExpanded}
                        style={{
                          width: '100%', display: 'flex', alignItems: 'center', gap: 10,
                          padding: '9px 16px 9px 24px', backgroundColor: 'transparent',
                          border: 'none', cursor: 'pointer', textAlign: 'left',
                        }}
                      >
                        <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', backgroundColor: SEVERITY_COLORS[worstSeverity], flexShrink: 0 }} />
                        <span style={{ flex: 1, fontSize: 12, fontWeight: 600, color: C.textPri }}>{PII_TYPE_LABELS[type]}</span>
                        <span style={{ fontSize: 11, color: C.textMuted, backgroundColor: C.border, padding: '1px 7px', borderRadius: 8 }}>{typeFindings.length}</span>
                        <span style={{ fontSize: 10, color: C.textMuted }}>{isExpanded ? '▲' : '▼'}</span>
                      </button>
                      {isExpanded && (
                        <div style={{ backgroundColor: C.bg + '88' }}>
                          {typeFindings.map((f, i) => (
                            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 16px 6px 40px', borderTop: `1px solid ${C.border}`, fontSize: 11 }}>
                              <span style={{ flexShrink: 0, padding: '1px 7px', borderRadius: 8, fontSize: 10, fontWeight: 700, color: '#fff', backgroundColor: SEVERITY_COLORS[f.severity], textTransform: 'capitalize' }}>
                                {f.severity}
                              </span>
                              {f.fieldName && <span style={{ color: C.textMuted, flexShrink: 0 }}>{f.fieldName}</span>}
                              <code style={{ flex: 1, color: C.textSec, backgroundColor: C.border + '66', padding: '1px 6px', borderRadius: 4, fontSize: 11, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={f.redactedPreview}>
                                {f.redactedPreview}
                              </code>
                              <span style={{ flexShrink: 0, fontSize: 10, color: C.textMuted, backgroundColor: C.border, padding: '1px 6px', borderRadius: 6 }}>{f.location}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

// ── Toast ─────────────────────────────────────────────────────────────────────

function Toast({ message, onDismiss }: { message: string; onDismiss: () => void }) {
  useEffect(() => {
    const t = setTimeout(onDismiss, 4000);
    return () => clearTimeout(t);
  }, [onDismiss]);

  return (
    <div
      role="alert"
      aria-live="assertive"
      style={{
        position: 'fixed', bottom: 24, right: 24, zIndex: 9999,
        maxWidth: 360, padding: '12px 16px', borderRadius: 10,
        backgroundColor: '#1e293b', border: `1px solid ${C.red}`,
        color: C.textPri, fontSize: 13, fontWeight: 500,
        boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
        display: 'flex', alignItems: 'flex-start', gap: 10,
      }}
    >
      <span style={{ color: C.red, flexShrink: 0 }}>⚠</span>
      <span style={{ flex: 1 }}>{message}</span>
      <button onClick={onDismiss} aria-label="Dismiss" style={{ background: 'none', border: 'none', color: C.textMuted, cursor: 'pointer', fontSize: 16, lineHeight: 1, padding: 0, flexShrink: 0 }}>×</button>
    </div>
  );
}

// ── Export Controls ───────────────────────────────────────────────────────────

interface ExportControlsProps {
  selectedOrigin: string | null;
  onError: (message: string) => void;
}

function ExportControls({ selectedOrigin, onError }: ExportControlsProps) {
  const [busy, setBusy] = useState<string | null>(null);

  async function handleExport(format: ExportFormat, scopeType: 'site' | 'all') {
    const key = `${scopeType}-${format}`;
    setBusy(key);
    try {
      const scope = scopeType === 'site' && selectedOrigin
        ? { scope: 'site' as const, origin: selectedOrigin }
        : { scope: 'all' as const };
      await exportReport(scope, format);
    } catch (err) {
      onError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }

  const btnStyle = (active: boolean): React.CSSProperties => ({
    padding: '4px 10px', borderRadius: 5,
    border: `1px solid ${active ? C.blue : C.border}`,
    backgroundColor: active ? C.blue + '33' : 'transparent',
    color: active ? C.blue : C.textSec,
    fontSize: 10, fontWeight: 600,
    cursor: active ? 'not-allowed' : 'pointer',
    opacity: active ? 0.7 : 1,
    display: 'inline-flex', alignItems: 'center', gap: 3,
    transition: 'all 0.15s',
  });

  const formats: ExportFormat[] = ['json', 'csv', 'pdf'];

  return (
    <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
      {selectedOrigin && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <span style={{ fontSize: 10, color: C.textMuted, flexShrink: 0 }}>Site:</span>
          {formats.map((fmt) => {
            const key = `site-${fmt}`;
            return (
              <button key={fmt} onClick={() => handleExport(fmt, 'site')} disabled={busy !== null} aria-label={`Export current site as ${fmt.toUpperCase()}`} style={btnStyle(busy === key)}>
                {busy === key ? '…' : fmt.toUpperCase()}
              </button>
            );
          })}
        </div>
      )}
      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        <span style={{ fontSize: 10, color: C.textMuted, flexShrink: 0 }}>All:</span>
        {formats.map((fmt) => {
          const key = `all-${fmt}`;
          return (
            <button key={fmt} onClick={() => handleExport(fmt, 'all')} disabled={busy !== null} aria-label={`Export all sites as ${fmt.toUpperCase()}`} style={btnStyle(busy === key)}>
              {busy === key ? '…' : fmt.toUpperCase()}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ── Allowlist Panel ───────────────────────────────────────────────────────────

interface AllowlistPanelProps {
  disabledSites: string[];
  onRemove: (origin: string) => void;
}

function AllowlistPanel({ disabledSites, onRemove }: AllowlistPanelProps) {
  const [collapsed, setCollapsed] = useState(disabledSites.length === 0);
  if (disabledSites.length === 0) return null;

  return (
    <div style={{ backgroundColor: C.card, borderRadius: 10, border: `1px solid ${C.yellow}44`, overflow: 'hidden', marginBottom: 16 }}>
      <button
        onClick={() => setCollapsed((c) => !c)}
        aria-expanded={!collapsed}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', gap: 10,
          padding: '12px 16px', borderBottom: collapsed ? 'none' : `1px solid ${C.yellow}44`,
          backgroundColor: C.yellow + '11', border: 'none', cursor: 'pointer', textAlign: 'left',
        }}
      >
        <span style={{ fontWeight: 700, fontSize: 13, flex: 1, color: C.yellow }}>⊘ Allowlisted Sites</span>
        <span style={{ fontSize: 11, fontWeight: 600, color: C.yellow, backgroundColor: C.yellow + '22', padding: '2px 8px', borderRadius: 10 }}>
          {disabledSites.length} site{disabledSites.length !== 1 ? 's' : ''} disabled
        </span>
        <span style={{ fontSize: 11, color: C.textMuted }}>{collapsed ? '▶' : '▼'}</span>
      </button>
      {!collapsed && (
        <div>
          {disabledSites.map((origin) => (
            <div key={origin} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '9px 16px', borderBottom: `1px solid ${C.border}` }}>
              <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: C.textMuted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={origin}>
                {origin}
              </span>
              <button
                onClick={() => onRemove(origin)}
                aria-label={`Re-enable monitoring for ${origin}`}
                style={{ flexShrink: 0, padding: '3px 9px', borderRadius: 6, border: `1px solid ${C.green}66`, backgroundColor: 'transparent', color: C.green, fontSize: 11, fontWeight: 600, cursor: 'pointer' }}
              >
                ✓ Enable
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Main App ──────────────────────────────────────────────────────────────────

export default function App() {
  const [summaries, setSummaries] = useState<OriginSummary[]>([]);
  const [prefs, setPrefs] = useState<Preferences>({ globalMonitoringEnabled: true, disabledSites: [] });
  const [loading, setLoading] = useState(true);
  const [sortKey, setSortKey] = useState<SortKey>('riskScore');
  const [selectedOrigin, setSelectedOrigin] = useState<string | null>(null);
  const [selectedRecord, setSelectedRecord] = useState<RequestRecord | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  useEffect(() => {
    async function init() {
      try {
        const [data, loadedPrefs] = await Promise.all([getAllOriginSummaries(), getPreferences()]);
        setSummaries(data);
        setPrefs(loadedPrefs);
      } catch (err) {
        console.error('[dashboard] init error', err);
      } finally {
        setLoading(false);
      }
    }
    init();
  }, []);

  const sorted = [...summaries].sort((a, b) => {
    switch (sortKey) {
      case 'riskScore':     return b.riskScore - a.riskScore;
      case 'requestCount':  return b.requestCount - a.requestCount;
      case 'lastActivityMs': return b.lastActivityMs - a.lastActivityMs;
      case 'origin':        return a.origin.localeCompare(b.origin);
    }
  });

  const disabledSet = new Set(prefs.disabledSites);

  async function handleToggleMonitoring() {
    const updated: Preferences = { ...prefs, globalMonitoringEnabled: !prefs.globalMonitoringEnabled };
    setPrefs(updated);
    await savePreferences(updated);
  }

  async function handleToggleAllowlist(origin: string) {
    const isDisabled = disabledSet.has(origin);
    const updatedSites = isDisabled
      ? prefs.disabledSites.filter((s) => s !== origin)
      : [...prefs.disabledSites, origin];
    const updated: Preferences = { ...prefs, disabledSites: updatedSites };
    setPrefs(updated);
    await savePreferences(updated);
  }

  async function handleClearSiteData(origin: string) {
    if (!window.confirm(`Delete all recorded data for "${origin}"? This cannot be undone.`)) return;
    await deleteRecordsByOrigin(origin);
    const updated = await getAllOriginSummaries();
    setSummaries(updated);
    setSelectedOrigin(null);
    setSelectedRecord(null);
  }

  async function handleClearAllData() {
    if (!window.confirm('Delete ALL recorded data for every site? This cannot be undone.')) return;
    await deleteAllRecords();
    const updated = await getAllOriginSummaries();
    setSummaries(updated);
    setSelectedOrigin(null);
    setSelectedRecord(null);
  }

  return (
    <div style={{ minHeight: '100vh', fontFamily: 'system-ui, -apple-system, sans-serif', fontSize: 13, color: C.textPri, backgroundColor: C.bg, display: 'flex', flexDirection: 'column' }}>

      {/* ── Header ── */}
      <header
        style={{
          backgroundColor: C.card,
          borderBottom: `1px solid ${C.border}`,
          padding: '0 20px',
          height: 52,
          display: 'flex',
          alignItems: 'center',
          gap: 14,
          flexShrink: 0,
          boxShadow: '0 1px 0 rgba(0,0,0,0.4)',
          position: 'sticky',
          top: 0,
          zIndex: 100,
        }}
      >
        {/* Logo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div
            style={{
              width: 32,
              height: 32,
              borderRadius: 8,
              background: `linear-gradient(135deg, ${C.blue}, #6366f1)`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 16,
              boxShadow: `0 0 12px ${C.blue}55`,
              flexShrink: 0,
            }}
          >
            🔍
          </div>
          <div>
            <div style={{ fontWeight: 800, fontSize: 14, color: C.textPri, lineHeight: 1.1 }}>Privacy Monitor</div>
            <div style={{ fontSize: 10, color: C.textMuted, lineHeight: 1 }}>Network Dashboard</div>
          </div>
        </div>

        <div style={{ width: 1, height: 28, backgroundColor: C.border, flexShrink: 0 }} />

        {/* Global monitoring toggle */}
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, cursor: 'pointer', userSelect: 'none' }}>
          <span style={{ fontSize: 12, color: C.textSec }}>Monitoring</span>
          <button
            role="switch"
            aria-checked={prefs.globalMonitoringEnabled}
            aria-label="Toggle global monitoring"
            onClick={handleToggleMonitoring}
            style={{
              position: 'relative', width: 40, height: 22, borderRadius: 11,
              border: 'none', cursor: 'pointer',
              backgroundColor: prefs.globalMonitoringEnabled ? C.green : C.textMuted,
              transition: 'background-color 0.2s', padding: 0, flexShrink: 0,
            }}
          >
            <span
              style={{
                position: 'absolute', top: 3,
                left: prefs.globalMonitoringEnabled ? 21 : 3,
                width: 16, height: 16, borderRadius: '50%',
                backgroundColor: '#fff', transition: 'left 0.2s',
                boxShadow: '0 1px 3px rgba(0,0,0,0.4)',
              }}
            />
          </button>
        </label>

        {!prefs.globalMonitoringEnabled && (
          <span role="alert" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 10px', borderRadius: 6, backgroundColor: C.yellow + '22', color: C.yellow, fontSize: 11, fontWeight: 600, border: `1px solid ${C.yellow}44` }}>
            ⏸ Paused
          </span>
        )}

        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 10 }}>
          <ExportControls selectedOrigin={selectedOrigin} onError={(msg) => setToastMessage(msg)} />
          <div style={{ width: 1, height: 20, backgroundColor: C.border }} />
          <button
            onClick={handleClearAllData}
            aria-label="Clear all recorded data"
            style={{ padding: '5px 12px', borderRadius: 6, border: `1px solid ${C.red}55`, backgroundColor: 'transparent', color: C.red, fontSize: 11, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap', transition: 'background-color 0.15s' }}
          >
            🗑 Clear all
          </button>
        </div>
      </header>

      {/* ── Body: Sidebar + Main ── */}
      <div style={{ display: 'flex', flex: 1, minHeight: 0, overflow: 'hidden' }}>

        {/* ── Sidebar ── */}
        <aside
          style={{
            width: 280,
            flexShrink: 0,
            backgroundColor: C.card,
            borderRight: `1px solid ${C.border}`,
            display: 'flex',
            flexDirection: 'column',
            overflowY: 'auto',
          }}
        >
          {/* Sidebar header */}
          <div style={{ padding: '12px 14px', borderBottom: `1px solid ${C.border}`, flexShrink: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <span style={{ fontWeight: 700, fontSize: 12, color: C.textSec, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                Sites {!loading && <span style={{ color: C.textMuted, fontWeight: 400 }}>({summaries.length})</span>}
              </span>
            </div>
            <SortControls sortKey={sortKey} onChange={setSortKey} />
          </div>

          {/* Site list */}
          {loading ? (
            <div style={{ padding: 24, textAlign: 'center', color: C.textMuted, fontSize: 12 }}>Loading…</div>
          ) : sorted.length === 0 ? (
            <div style={{ padding: 24, textAlign: 'center', color: C.textMuted, fontSize: 12, lineHeight: 1.6 }}>
              No sites yet.<br />Browse the web to start capturing requests.
            </div>
          ) : (
            <div role="table" aria-label="Monitored sites" style={{ flex: 1 }}>
              {sorted.map((summary) => (
                <SiteRow
                  key={summary.origin}
                  summary={summary}
                  isAllowlisted={disabledSet.has(summary.origin)}
                  isSelected={selectedOrigin === summary.origin}
                  onClick={() => {
                    setSelectedOrigin((prev) => {
                      const next = prev === summary.origin ? null : summary.origin;
                      if (next !== prev) setSelectedRecord(null);
                      return next;
                    });
                  }}
                  onToggleAllowlist={(e) => { e.stopPropagation(); handleToggleAllowlist(summary.origin); }}
                />
              ))}
            </div>
          )}
        </aside>

        {/* ── Main content ── */}
        <main style={{ flex: 1, overflowY: 'auto', padding: 20, display: 'flex', flexDirection: 'column', gap: 0, minWidth: 0 }}>

          {/* Allowlist panel */}
          {!loading && (
            <AllowlistPanel disabledSites={prefs.disabledSites} onRemove={(origin) => handleToggleAllowlist(origin)} />
          )}

          {selectedOrigin ? (
            /* ── Site selected: request list + detail ── */
            <div style={{ display: 'flex', flexDirection: 'column', gap: 0, flex: 1, minHeight: 0 }}>
              {/* Site header bar */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
                <button
                  onClick={() => { setSelectedOrigin(null); setSelectedRecord(null); }}
                  aria-label="Back to overview"
                  style={{ padding: '4px 10px', borderRadius: 6, border: `1px solid ${C.border}`, backgroundColor: 'transparent', color: C.textSec, fontSize: 11, cursor: 'pointer' }}
                >
                  ← Back
                </button>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: C.textPri, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {selectedOrigin}
                  </div>
                  {(() => {
                    const s = summaries.find((x) => x.origin === selectedOrigin);
                    if (!s) return null;
                    return (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 2 }}>
                        <span style={{ fontSize: 11, color: C.textMuted }}>{s.requestCount.toLocaleString()} requests</span>
                        <span style={{ fontSize: 11, color: C.textMuted }}>·</span>
                        <span style={{ fontSize: 11, color: C.textMuted }}>Last: {formatDate(s.lastActivityMs)}</span>
                        <span style={{ fontSize: 11, color: C.textMuted }}>·</span>
                        <span style={{ fontSize: 11, fontWeight: 700, color: riskColor(s.riskScore) }}>
                          Risk {s.riskScore}% — {riskLabel(s.riskScore)}
                        </span>
                      </div>
                    );
                  })()}
                </div>
              </div>

              <RequestListPanel
                origin={selectedOrigin}
                selectedRecord={selectedRecord}
                onSelectRecord={setSelectedRecord}
                onClearSiteData={() => handleClearSiteData(selectedOrigin)}
              />

              {selectedRecord && (
                <div style={{ marginTop: 12, backgroundColor: C.card, borderRadius: 10, border: `1px solid ${C.border}`, overflow: 'hidden' }}>
                  <RequestDetailPanel record={selectedRecord} onClose={() => setSelectedRecord(null)} />
                </div>
              )}

              <PIISection selectedOrigin={selectedOrigin} summaries={summaries} />
            </div>
          ) : (
            /* ── No site selected: summary overview ── */
            <div>
              {!loading && summaries.length > 0 && <SummaryPanel summaries={summaries} />}
              <PIISection selectedOrigin={null} summaries={summaries} />
            </div>
          )}
        </main>
      </div>

      {/* Toast */}
      {toastMessage && <Toast message={toastMessage} onDismiss={() => setToastMessage(null)} />}
    </div>
  );
}
