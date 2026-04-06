// Shared RequestDetailPanel — dark theme
import type { RequestRecord, PIIFinding, PIISeverity, Header } from '../types';

const C = {
  bg: '#0f172a', card: '#1e293b', border: '#334155',
  textPri: '#f1f5f9', textSec: '#94a3b8', textMuted: '#475569',
  blue: '#3b82f6', green: '#22c55e', yellow: '#eab308', orange: '#f97316', red: '#ef4444',
};

const METHOD_COLORS: Record<string, string> = {
  GET: '#1d4ed8', POST: '#166534', PUT: '#92400e', PATCH: '#5b21b6', DELETE: '#991b1b',
};

function methodColor(m: string) { return METHOD_COLORS[m.toUpperCase()] ?? '#334155'; }

const SEVERITY_COLORS: Record<PIISeverity, string> = {
  critical: C.red, high: C.orange, medium: C.yellow, low: C.green,
};

function HeaderTable({ headers, label }: { headers: Header[]; label: string }) {
  if (!headers.length) return null;
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: C.textMuted, marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
        {label}
      </div>
      <div style={{ backgroundColor: C.bg, borderRadius: 6, border: `1px solid ${C.border}`, overflow: 'hidden' }}>
        {headers.map((h, i) => (
          <div key={i} style={{ display: 'flex', gap: 0, borderBottom: i < headers.length - 1 ? `1px solid ${C.border}` : 'none', fontSize: 11 }}>
            <div style={{ padding: '4px 10px', color: C.textMuted, fontWeight: 600, width: '35%', wordBreak: 'break-all', borderRight: `1px solid ${C.border}`, backgroundColor: C.card + 'aa' }}>
              {h.name}
            </div>
            <div style={{ padding: '4px 10px', color: C.textSec, wordBreak: 'break-all', flex: 1 }}>
              {h.value}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function PIIFindingRow({ finding }: { finding: PIIFinding }) {
  const color = SEVERITY_COLORS[finding.severity];
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 8,
      padding: '5px 8px', marginBottom: 4, borderRadius: 6,
      backgroundColor: color + '15', border: `1px solid ${color}35`, fontSize: 11,
    }}>
      <span style={{ display: 'inline-block', width: 7, height: 7, borderRadius: '50%', backgroundColor: color, flexShrink: 0 }} />
      <span style={{ fontWeight: 700, color, textTransform: 'uppercase', fontSize: 9, flexShrink: 0 }}>{finding.severity}</span>
      <span style={{ color: C.textSec, flexShrink: 0 }}>{finding.type}</span>
      {finding.fieldName && <span style={{ color: C.textMuted, flexShrink: 0 }}>· {finding.fieldName}</span>}
      <code style={{ color: C.textMuted, marginLeft: 'auto', fontFamily: 'monospace', flexShrink: 0, fontSize: 10 }}>
        {finding.redactedPreview}
      </code>
    </div>
  );
}

export interface RequestDetailPanelProps {
  record: RequestRecord;
  onClose: () => void;
}

export function RequestDetailPanel({ record, onClose }: RequestDetailPanelProps) {
  const statusColor = record.responseStatusCode >= 500 ? C.red
    : record.responseStatusCode >= 400 ? C.orange
    : record.responseStatusCode >= 300 ? C.yellow : C.green;

  return (
    <div style={{ backgroundColor: C.card, overflowY: 'auto', maxHeight: 380, padding: '12px 14px', fontSize: 12 }}>
      {/* Header row */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
          <span style={{ padding: '2px 8px', borderRadius: 4, fontSize: 10, fontWeight: 700, color: '#fff', backgroundColor: methodColor(record.method), flexShrink: 0 }}>
            {record.method}
          </span>
          <span style={{ fontSize: 11, fontWeight: 700, color: statusColor, border: `1px solid ${statusColor}55`, borderRadius: 4, padding: '1px 6px', flexShrink: 0 }}>
            {record.responseStatusCode}
          </span>
          <span style={{ fontSize: 11, color: C.textMuted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={record.url}>
            {record.url}
          </span>
        </div>
        <button
          onClick={onClose}
          aria-label="Close detail panel"
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.textMuted, fontSize: 18, lineHeight: 1, padding: '0 4px', flexShrink: 0 }}
        >
          ×
        </button>
      </div>

      {/* PII Findings */}
      {record.piiFindings.length > 0 && (
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: C.textMuted, marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            PII Findings ({record.piiFindings.length})
          </div>
          {record.piiFindings.map((f, i) => <PIIFindingRow key={i} finding={f} />)}
        </div>
      )}

      <HeaderTable headers={record.requestHeaders} label="Request Headers" />

      {/* Request Body */}
      <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: C.textMuted, marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
          Request Payload
        </div>
        {record.bodyUnavailable ? (
          <span style={{ color: C.textMuted, fontStyle: 'italic', fontSize: 11 }}>Body unavailable</span>
        ) : record.decodeError ? (
          <span style={{ color: C.orange, fontStyle: 'italic', fontSize: 11 }}>Decode error — raw body could not be parsed</span>
        ) : record.requestBody ? (
          <>
            <pre style={{
              margin: 0, padding: '8px 10px', backgroundColor: C.bg,
              border: `1px solid ${C.border}`, borderRadius: 6,
              fontSize: 11, overflowX: 'auto', whiteSpace: 'pre-wrap',
              wordBreak: 'break-all', color: C.textSec, maxHeight: 120, overflowY: 'auto',
            }}>
              {record.requestBody}
            </pre>
            {record.truncated && <div style={{ fontSize: 10, color: C.orange, marginTop: 3 }}>⚠ Payload truncated at 1 MB</div>}
          </>
        ) : (
          <span style={{ color: C.textMuted, fontStyle: 'italic', fontSize: 11 }}>No body</span>
        )}
      </div>

      <HeaderTable headers={record.responseHeaders} label="Response Headers" />
    </div>
  );
}
