import { useState, useEffect } from 'react';
import type { RequestRecord } from '../types';

export const TesterTab = ({ prefill }: { prefill?: RequestRecord | null }) => {
  const [method, setMethod] = useState('GET');
  const [url, setUrl] = useState('');
  const [headers, setHeaders] = useState([{ key: '', value: '' }]);
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);
  const [response, setResponse] = useState<any>(null);

  useEffect(() => {
    if (prefill) {
      setMethod(prefill.method.toUpperCase());
      setUrl(prefill.url);
      setHeaders(prefill.requestHeaders.map(h => ({ key: h.name, value: h.value })));
      setBody(prefill.requestBody || '');
      setResponse(null); // Clear old results
    }
  }, [prefill]);

  const addHeader = () => setHeaders([...headers, { key: '', value: '' }]);
  const removeHeader = (i: number) => setHeaders(headers.filter((_, idx) => idx !== i));
  const updateHeader = (i: number, field: 'key' | 'value', val: string) => {
    const newHeaders = [...headers];
    newHeaders[i][field] = val;
    setHeaders(newHeaders);
  };

  const sendRequest = async () => {
    setSending(true);
    setResponse(null);
    const start = Date.now();
    try {
      const hdrs: any = {};
      headers.forEach(h => { if(h.key) hdrs[h.key] = h.value; });
      const opts: any = { method, headers: hdrs };
      if (['POST', 'PUT', 'PATCH'].includes(method)) opts.body = body;
      
      const res = await fetch(url, opts);
      const data = await res.text();
      setResponse({
        status: res.status,
        statusText: res.statusText,
        time: Date.now() - start,
        body: data,
        headers: Array.from(res.headers.entries())
      });
    } catch (e: any) {
      setResponse({ error: e.message, status: 0 });
    } finally {
      setSending(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <div className="glass-card" style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <h3 style={{ fontSize: '14px', color: '#4facfe' }}>Composer</h3>
        
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <select 
            value={method} 
            onChange={(e) => setMethod(e.target.value)}
            style={{ 
              width: '100%', 
              padding: '8px', 
              borderRadius: '6px', 
              background: 'rgba(0,0,0,0.3)', 
              color: 'white', 
              border: '1px solid var(--border-glass)',
              outline: 'none',
              fontSize: '12px'
            }}
          >
            {['GET', 'POST', 'PUT', 'DELETE', 'PATCH'].map(m => <option key={m}>{m}</option>)}
          </select>
          <input 
            value={url} 
            onChange={(e) => setUrl(e.target.value)} 
            placeholder="Target URL..."
            style={{ 
              width: '100%', 
              padding: '8px 12px', 
              borderRadius: '6px', 
              background: 'rgba(0,0,0,0.3)', 
              color: 'white', 
              border: '1px solid var(--border-glass)',
              outline: 'none',
              fontSize: '12px'
            }}
          />
        </div>

        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px', alignItems: 'center' }}>
            <span style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Headers</span>
            <button className="btn-ghost" onClick={addHeader} style={{ fontSize: '9px', padding: '2px 8px' }}>+</button>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
             {headers.map((h, i) => (
                <div key={i} style={{ display: 'flex', gap: '4px' }}>
                   <input 
                    placeholder="Key" 
                    value={h.key} 
                    onChange={(e) => updateHeader(i, 'key', e.target.value)}
                    style={{ flex: 1, padding: '6px', background: 'transparent', border: '1px solid var(--border-glass)', borderRadius: '4px', color: 'white', fontSize: '11px' }} 
                   />
                   <input 
                    placeholder="Value" 
                    value={h.value} 
                    onChange={(e) => updateHeader(i, 'value', e.target.value)}
                    style={{ flex: 1, padding: '6px', background: 'transparent', border: '1px solid var(--border-glass)', borderRadius: '4px', color: 'white', fontSize: '11px' }} 
                   />
                   <button onClick={() => removeHeader(i)} style={{ color: '#ef4444', background: 'none', border: 'none', cursor: 'pointer', padding: '6px', fontSize: '14px' }}>×</button>
                </div>
             ))}
          </div>
        </div>

        {['POST', 'PUT', 'PATCH'].includes(method) && (
          <div>
            <div style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '6px' }}>Body</div>
            <textarea 
              rows={3}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder='JSON body...'
              style={{
                width: '100%',
                padding: '10px',
                background: 'rgba(0,0,0,0.2)',
                color: '#10b981',
                border: '1px solid var(--border-glass)',
                borderRadius: '6px',
                fontFamily: 'var(--font-mono)',
                fontSize: '11px',
                outline: 'none',
                resize: 'none'
              }}
            />
          </div>
        )}

        <button 
          className="btn-primary" 
          disabled={sending || !url} 
          onClick={sendRequest}
          style={{ padding: '10px', fontSize: '13px' }}
        >
          {sending ? 'Sending...' : 'Send'}
        </button>
      </div>

      <div className="glass-card" style={{ padding: '16px', flex: 1, display: 'flex', flexDirection: 'column' }}>
         <h3 style={{ fontSize: '14px', marginBottom: '12px' }}>Response</h3>
         {!response ? (
           <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', textAlign: 'center' }}>
              <div style={{ maxWidth: '200px' }}>
                <div style={{ fontSize: '40px', marginBottom: '16px' }}>🪁</div>
                <p>Send a request to see the response output and analytics here.</p>
              </div>
           </div>
         ) : response.error ? (
            <div style={{ color: '#ef4444', padding: '20px', borderRadius: '10px', backgroundColor: 'rgba(239, 68, 68, 0.1)', border: '1px solid #ef4444' }}>
               Error: {response.error}
            </div>
         ) : (
           <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '20px', overflow: 'hidden' }}>
              <div style={{ display: 'flex', gap: '20px' }}>
                 <div className="glass-card" style={{ padding: '12px 20px', flex: 1, textAlign: 'center' }}>
                    <div style={{ fontSize: '18px', fontWeight: 800, color: response.status < 300 ? '#10b981' : '#f59e0b' }}>{response.status}</div>
                    <div style={{ fontSize: '10px', textTransform: 'uppercase', color: 'var(--text-muted)' }}>Status</div>
                 </div>
                 <div className="glass-card" style={{ padding: '12px 20px', flex: 1, textAlign: 'center' }}>
                    <div style={{ fontSize: '18px', fontWeight: 800, color: '#3b82f6' }}>{response.time} ms</div>
                    <div style={{ fontSize: '10px', textTransform: 'uppercase', color: 'var(--text-muted)' }}>Latency</div>
                 </div>
              </div>
              
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                <div style={{ marginBottom: '10px', fontSize: '12px', color: 'var(--text-muted)' }}>Raw Body Output</div>
                <pre style={{
                   flex: 1,
                   padding: '16px',
                   background: '#080c14',
                   color: '#10b981',
                   border: '1px solid var(--border-glass)',
                   borderRadius: '10px',
                   overflowX: 'hidden',
                   overflowY: 'auto',
                   maxHeight: '300px',
                   fontSize: '11px',
                   lineHeight: '1.5',
                   fontFamily: 'var(--font-mono)',
                   whiteSpace: 'pre-wrap',
                   scrollbarWidth: 'thin',
                   scrollbarColor: 'var(--blue-glass) transparent'
                }}>
                   {response.body}
                </pre>
              </div>
           </div>
         )}
      </div>
    </div>
  );
};
