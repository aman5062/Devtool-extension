import React, { useState } from 'react';
import type { RequestRecord } from '../types';
import { generateCurl } from '../utils/curl';

type ResourceTypeFilter = 'all' | 'fetch' | 'js' | 'css' | 'img' | 'media' | 'other';

const formatBytes = (bytes: number) => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
};

const getMethodColor = (m: string) => {
  switch(m.toUpperCase()) {
    case 'GET': return '#3b82f6';
    case 'POST': return '#10b981';
    case 'PUT': return '#f59e0b';
    case 'DELETE': return '#ef4444';
    default: return '#94a3b8';
  }
};

const getStatusColor = (s: number) => {
  if (s < 300) return '#10b981';
  if (s < 400) return '#f59e0b';
  return '#ef4444';
};

export const NetworkTab = ({ records, onSelect, selectedId, onTry }: { records: RequestRecord[]; onSelect: (r: RequestRecord) => void; selectedId: string | null; onTry?: (r: RequestRecord) => void }) => {
  const [filter, setFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState<ResourceTypeFilter>('all');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const filtered = records.filter(r => {
    const searchVal = filter.toLowerCase();
    const matchesSearch = !searchVal || 
      r.url.toLowerCase().includes(searchVal) || 
      r.method.toLowerCase().includes(searchVal) ||
      (r.resourceType && r.resourceType.toLowerCase().includes(searchVal));

    if (!matchesSearch) return false;
    if (typeFilter === 'all') return true;
    
    const type = (r.resourceType || 'other').toLowerCase();
    
    switch(typeFilter) {
      case 'fetch': 
        return type === 'xmlhttprequest' || type === 'fetch' || type === 'ping' || type === 'websocket';
      case 'js': 
        return type === 'script';
      case 'css': 
        return type === 'stylesheet';
      case 'img': 
        return type === 'image' || type === 'font'; // Include fonts in images or elsewhere? Keep in images for now or 'other'
      case 'media': 
        return type === 'media' || type === 'object';
      case 'other': 
        return type === 'other' || type === 'main_frame' || type === 'sub_frame' || type === 'csp_report';
      default: 
        return true;
    }
  });

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const filterTabs: { id: ResourceTypeFilter; label: string }[] = [
    { id: 'all', label: 'All' },
    { id: 'fetch', label: 'Fetch/XHR' },
    { id: 'js', label: 'JS' },
    { id: 'css', label: 'CSS' },
    { id: 'img', label: 'Img' },
    { id: 'media', label: 'Media' },
    { id: 'other', label: 'Other/X' },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      {/* Network Stats */}
      <div style={{ display: 'flex', gap: '8px', flexWrap: 'nowrap' }}>
        <div className="glass-card" style={{ flex: 1, padding: '8px', textAlign: 'center', minWidth: '0' }}>
          <div style={{ fontSize: '16px', fontWeight: 900, color: '#fff' }}>{records.length}</div>
          <div style={{ fontSize: '8px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Requests</div>
        </div>
        <div className="glass-card" style={{ flex: 1, padding: '8px', textAlign: 'center', minWidth: '0' }}>
          <div style={{ fontSize: '16px', fontWeight: 900, color: '#fff' }}>{formatBytes(records.reduce((acc, r) => acc + (r.requestBody?.length || 0), 0))}</div>
          <div style={{ fontSize: '8px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Sent</div>
        </div>
        <div className="glass-card" style={{ flex: 1, padding: '8px', textAlign: 'center', minWidth: '0' }}>
          <div style={{ fontSize: '16px', fontWeight: 900, color: records.filter(r => r.responseStatusCode >= 400).length > 0 ? '#ef4444' : '#10b981' }}>{records.filter(r => r.responseStatusCode >= 400).length}</div>
          <div style={{ fontSize: '8px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Errors</div>
        </div>
      </div>

      {/* Advanced Filter Toolbar */}
      <div style={{ 
          display: 'flex', flexDirection: 'column', gap: '8px', padding: '10px', 
          background: 'rgba(0,0,0,0.2)', border: '1px solid var(--border-glass)', borderRadius: '12px'
        }}>
          <div style={{ position: 'relative', width: '100%' }}>
            <input 
              type="text" 
              placeholder="Filter by URL, Method, or Type..."
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              style={{
                width: '100%', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: '6px', padding: '6px 30px 6px 12px', color: 'white', fontSize: '11px', outline: 'none',
              }}
            />
            {filter && (
              <button 
                onClick={() => setFilter('')}
                style={{
                  position: 'absolute', right: '8px', top: '50%', transform: 'translateY(-50%)',
                  background: 'transparent', border: 'none', color: '#64748b', cursor: 'pointer', fontSize: '12px'
                }}
              >✕</button>
            )}
          </div>
          <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
            {filterTabs.map(tab => (
              <button
                key={tab.id}
                onClick={() => setTypeFilter(tab.id)}
                style={{
                  padding: '4px 8px', borderRadius: '4px', fontSize: '9px', fontWeight: 800, border: 'none', cursor: 'pointer',
                  background: typeFilter === tab.id ? '#3b82f6' : 'rgba(255,255,255,0.05)',
                  color: typeFilter === tab.id ? '#fff' : '#64748b', transition: 'all 0.2s'
                }}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        <div style={{ flex: 1, background: 'rgba(10, 15, 25, 0.4)', borderRadius: '12px', border: '1px solid var(--border-glass)', minHeight: '300px', overflow: 'hidden' }}>
          {records.length === 0 ? (
            <div style={{ padding: '40px', textAlign: 'center' }}>
               <div style={{ fontSize: '40px', marginBottom: '12px', opacity: 0.3 }}>🌐</div>
               <div style={{ fontWeight: 800, fontSize: '14px', color: '#fff' }}>No Traffic Recorded</div>
            </div>
          ) : filtered.length === 0 ? (
            <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '11px' }}>No matches found.</div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '11px' }}>
              <thead style={{ background: 'rgba(255,255,255,0.03)', color: '#64748b', textTransform: 'uppercase', fontSize: '10px' }}>
                <tr>
                  <th style={{ padding: '10px 12px' }}>Method</th>
                  <th style={{ padding: '10px 12px' }}>Status</th>
                  <th style={{ padding: '10px 12px' }}>Path</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(r => {
                  const isExpanded = selectedId === r.id;
                  let path = '/';
                  try { 
                    const u = new URL(r.url);
                    path = u.pathname + u.search;
                  } catch(e) {}

                  return (
                    <React.Fragment key={r.id}>
                      <tr 
                        onClick={() => onSelect(isExpanded ? null! : r)}
                        style={{ 
                          borderBottom: isExpanded ? 'none' : '1px solid rgba(255,255,255,0.05)', 
                          cursor: 'pointer',
                          background: isExpanded ? 'rgba(59, 130, 246, 0.1)' : 'transparent',
                          transition: 'background 0.2s'
                        }}
                      >
                        <td style={{ padding: '10px 12px', fontWeight: 800, color: getMethodColor(r.method) }}>{r.method}</td>
                        <td style={{ padding: '10px 12px', fontWeight: 800, color: getStatusColor(r.responseStatusCode) }}>{r.responseStatusCode}</td>
                        <td style={{ 
                          padding: '10px 12px', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', 
                          whiteSpace: 'nowrap', color: isExpanded ? '#fff' : '#64748b'
                        }} title={r.url}>
                          {path}
                        </td>
                      </tr>
                      {isExpanded && (
                        <tr>
                          <td colSpan={3} style={{ padding: '0 12px 12px', background: 'rgba(59, 130, 246, 0.05)', borderBottom: '1px solid rgba(59, 130, 246, 0.2)' }}>
                            <div className="animate-fade-in" style={{ padding: '12px', background: 'rgba(0,0,0,0.3)', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.05)' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                                   <div style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Full Endpoint</div>
                                   <div style={{ display: 'flex', gap: '8px' }}>
                                      <button onClick={() => handleCopy(r.url, `url-${r.id}`)} className="btn-ghost" style={{ fontSize: '9px', padding: '2px 8px' }}>
                                        {copiedId === `url-${r.id}` ? '✓ Copied' : '🔗 URL'}
                                      </button>
                                      <button onClick={() => handleCopy(generateCurl(r), `curl-${r.id}`)} className="btn-ghost" style={{ fontSize: '9px', padding: '2px 8px' }}>
                                        {copiedId === `curl-${r.id}` ? '✓ Copied' : '📋 cURL'}
                                      </button>
                                      <button onClick={() => onTry?.(r)} className="btn-primary" style={{ fontSize: '9px', padding: '2px 8px', background: '#8b5cf6' }}>
                                        🚀 Try in Composer
                                      </button>
                                   </div>
                                </div>
                                <div style={{ fontSize: '10px', color: '#94a3b8', wordBreak: 'break-all', marginBottom: '12px', fontFamily: 'monospace' }}>{r.url}</div>
                                
                                {r.requestBody && (
                                  <>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                                      <div style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Payload</div>
                                      <button onClick={() => handleCopy(r.requestBody!, `body-${r.id}`)} className="btn-ghost" style={{ fontSize: '9px', padding: '2px 8px' }}>
                                        {copiedId === `body-${r.id}` ? '✓ Copied' : '📋 Copy Body'}
                                      </button>
                                    </div>
                                    <pre style={{ 
                                      padding: '8px', background: '#000', borderRadius: '4px', fontSize: '10px', color: '#10b981', 
                                      fontFamily: 'monospace', overflow: 'auto', maxHeight: '100px', margin: 0
                                    }}>
                                      {r.requestBody}
                                    </pre>
                                  </>
                                )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
    </div>
  );
};
