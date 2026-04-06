import { useState } from 'react';
import type { RequestRecord, Header } from '../types';
import { generateCurl } from '../utils/curl';

const C = {
  bg: '#0a0f18', card: '#161e2d', border: 'rgba(255,255,255,0.08)',
  textPri: '#f8fafc', textSec: '#94a3b8', textMuted: '#64748b',
  blue: '#3b82f6', green: '#10b981', yellow: '#f59e0b', orange: '#f97316', red: '#ef4444',
};

const METHOD_COLORS: Record<string, string> = {
  GET: '#3b82f6', POST: '#10b981', PUT: '#f59e0b', PATCH: '#8b5cf6', DELETE: '#ef4444',
};

function methodColor(m: string) { return METHOD_COLORS[m.toUpperCase()] ?? '#475569'; }

function HeaderTable({ headers, label }: { headers: Header[]; label: string }) {
  if (!headers.length) return <div style={{ padding: '12px', fontSize: '11px', color: C.textMuted }}>No {label}</div>;
  return (
    <div style={{ padding: '12px' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', border: `1px solid ${C.border}`, borderRadius: '8px', overflow: 'hidden' }}>
        {headers.map((h, i) => (
          <div key={i} style={{ display: 'flex', borderBottom: i < headers.length - 1 ? `1px solid ${C.border}` : 'none', fontSize: '11px', background: i % 2 === 0 ? 'rgba(255,255,255,0.02)' : 'transparent' }}>
            <div style={{ padding: '8px 10px', color: '#fff', fontWeight: 700, width: '30%', wordBreak: 'break-all', borderRight: `1px solid ${C.border}`, opacity: 0.8 }}>
              {h.name}
            </div>
            <div style={{ padding: '8px 10px', color: C.textSec, wordBreak: 'break-all', flex: 1, fontFamily: 'monospace' }}>
              {h.value}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function RequestDetailPanel({ record, onClose }: { record: RequestRecord; onClose: () => void }) {
  const [activeSubTab, setActiveSubTab] = useState<'payload' | 'headers'>('payload');
  const [copied, setCopied] = useState(false);

  const statusColor = record.responseStatusCode >= 400 ? C.red : record.responseStatusCode >= 300 ? C.yellow : C.green;

  const handleCopyCurl = () => {
    const curl = generateCurl(record);
    navigator.clipboard.writeText(curl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="glass-card animate-fade-in" style={{ 
      position: 'absolute', top: '12px', left: '12px', right: '12px', bottom: '12px', 
      zIndex: 200, display: 'flex', flexDirection: 'column', overflow: 'hidden', padding: '0', 
      backgroundColor: 'rgba(15, 23, 42, 0.98)', border: '1px solid var(--border-glass)', boxShadow: '0 20px 60px rgba(0,0,0,0.8)'
    }}>
      {/* Detail Header */}
      <div style={{ padding: '16px', borderBottom: `1px solid ${C.border}`, background: 'rgba(255,255,255,0.03)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ padding: '2px 8px', borderRadius: '4px', fontSize: '10px', fontWeight: 900, color: '#fff', background: methodColor(record.method) }}>{record.method}</span>
            <span style={{ fontSize: '12px', fontWeight: 800, color: statusColor }}>{record.responseStatusCode}</span>
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button 
              onClick={handleCopyCurl}
              className="btn-ghost" 
              style={{ fontSize: '10px', padding: '4px 10px', color: copied ? C.green : '#fff' }}
            >
              {copied ? '✓ COPIED' : '📋 COPY cURL'}
            </button>
            <button onClick={onClose} style={{ background: 'none', border: 'none', color: C.textMuted, cursor: 'pointer', fontSize: '20px' }}>×</button>
          </div>
        </div>
        <div style={{ fontSize: '11px', color: C.textSec, wordBreak: 'break-all', fontFamily: 'monospace', opacity: 0.8 }}>{record.url}</div>
      </div>

      {/* Sub-Tabs */}
      <div style={{ display: 'flex', borderBottom: `1px solid ${C.border}`, background: 'rgba(0,0,0,0.2)' }}>
        {['payload', 'headers'].map((tab) => (
          <div 
            key={tab}
            onClick={() => setActiveSubTab(tab as any)}
            style={{ 
              padding: '10px 20px', fontSize: '11px', fontWeight: 800, textTransform: 'uppercase', cursor: 'pointer',
              color: activeSubTab === tab ? '#4facfe' : C.textMuted, borderBottom: activeSubTab === tab ? '2px solid #4facfe' : 'none'
            }}
          >
            {tab}
          </div>
        ))}
      </div>

      {/* Content Area */}
      <div style={{ flex: 1, overflowY: 'auto', background: 'rgba(255,255,255,0.01)' }}>
        {activeSubTab === 'payload' && (
          <div style={{ padding: '16px' }}>
            <div style={{ fontSize: '10px', fontWeight: 900, color: C.textMuted, textTransform: 'uppercase', marginBottom: '10px', letterSpacing: '0.1em' }}>Payload Analysis</div>
            
            {record.piiFindings.length > 0 && (
              <div style={{ marginBottom: '20px' }}>
                {record.piiFindings.map((f, i) => (
                  <div key={i} style={{ padding: '8px 12px', borderRadius: '6px', background: 'rgba(239, 68, 68, 0.08)', border: '1px solid rgba(239, 68, 68, 0.2)', marginBottom: '8px', fontSize: '11px' }}>
                    <span style={{ fontWeight: 800, color: C.red, textTransform: 'uppercase', fontSize: '9px', marginRight: '8px' }}>{f.severity}</span>
                    <span style={{ color: '#fff' }}>Detected: {f.type}</span>
                    <div style={{ fontSize: '10px', color: C.textMuted, marginTop: '4px', fontStyle: 'italic' }}>Value: {f.redactedPreview}</div>
                  </div>
                ))}
              </div>
            )}

            {record.requestBody ? (
              <pre style={{ 
                background: 'rgba(0,0,0,0.3)', padding: '12px', borderRadius: '8px', border: `1px solid ${C.border}`, 
                color: '#10b981', fontSize: '11px', fontFamily: 'monospace', whiteSpace: 'pre-wrap', wordBreak: 'break-all' 
              }}>
                {record.requestBody}
              </pre>
            ) : (
              <div style={{ padding: '20px', textAlign: 'center', color: C.textMuted, fontSize: '11px', fontStyle: 'italic' }}>No Payload Captured</div>
            )}
            
            <div style={{ fontSize: '10px', fontWeight: 900, color: C.textMuted, textTransform: 'uppercase', marginTop: '20px', marginBottom: '10px', letterSpacing: '0.1em' }}>Meta Details</div>
            <div style={{ fontSize: '11px', color: C.textSec }}>
              • Time: {new Date(record.timestampMs).toLocaleTimeString()}<br/>
              • Size: {record.requestBody?.length || 0} bytes
            </div>
          </div>
        )}

        {activeSubTab === 'headers' && (
          <div>
            <div style={{ padding: '16px 16px 0', fontSize: '10px', fontWeight: 900, color: C.textMuted, textTransform: 'uppercase', letterSpacing: '0.1em' }}>Request Headers</div>
            <HeaderTable headers={record.requestHeaders} label="Request" />
            <div style={{ padding: '0 16px', fontSize: '10px', fontWeight: 900, color: C.textMuted, textTransform: 'uppercase', letterSpacing: '0.1em' }}>Response Headers</div>
            <HeaderTable headers={record.responseHeaders} label="Response" />
          </div>
        )}
      </div>
    </div>
  );
}

