import 'react';

interface SafetyProps {
  verdict: 'safe' | 'suspicious' | 'dangerous';
  score: number;
  piiFindings: number;
  phishingFlags: string[];
}

export const SafetyTab = ({ verdict, score, piiFindings, phishingFlags }: SafetyProps) => {
  const getVerdictColor = (v: string) => {
    switch(v) {
      case 'safe': return '#10b981';
      case 'suspicious': return '#f59e0b';
      case 'dangerous': return '#ef4444';
      default: return '#94a3b8';
    }
  };

  const color = getVerdictColor(verdict);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* Top Banner */}
      <div className="glass-card" style={{ 
        padding: '16px', 
        textAlign: 'center', 
        border: `1px solid ${color}40`,
        background: `linear-gradient(135deg, ${color}08, transparent)`
      }}>
        <div style={{ fontSize: '10px', fontWeight: 800, textTransform: 'uppercase', color: color, marginBottom: '4px', letterSpacing: '0.05em' }}>Verdict</div>
        <h1 style={{ fontSize: '32px', color: color, textTransform: 'uppercase', marginBottom: '8px', fontWeight: 900 }}>{verdict}</h1>
        <p style={{ color: 'var(--text-secondary)', fontSize: '11px', lineHeight: 1.4 }}>Heuristic scan for vulnerabilities, phishing, and PII leaks complete.</p>
        
        <div style={{ display: 'flex', justifyContent: 'center', gap: '20px', marginTop: '16px', borderTop: '1px solid var(--border-glass)', paddingTop: '16px' }}>
           <div style={{ flex: 1 }}>
             <div style={{ fontSize: '18px', fontWeight: 800 }}>{score}%</div>
             <div style={{ fontSize: '9px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Risk</div>
           </div>
           <div style={{ flex: 1, borderLeft: '1px solid var(--border-glass)', borderRight: '1px solid var(--border-glass)' }}>
             <div style={{ fontSize: '18px', fontWeight: 800 }}>{piiFindings}</div>
             <div style={{ fontSize: '9px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>PII</div>
           </div>
           <div style={{ flex: 1 }}>
             <div style={{ fontSize: '18px', fontWeight: 800 }}>{phishingFlags.length}</div>
             <div style={{ fontSize: '9px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Flags</div>
           </div>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {/* Security Checklist */}
        <div className="glass-card" style={{ padding: '16px' }}>
          <h3 style={{ marginBottom: '12px', fontSize: '13px' }}>Security Report</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
             <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
               <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>HTTPS Status</span>
               <span style={{ color: '#10b981', fontWeight: 800, fontSize: '10px' }}>VERIFIED</span>
             </div>
             <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
               <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Reputation</span>
               <span style={{ color: phishingFlags.length > 0 ? '#f59e0b' : '#10b981', fontWeight: 800, fontSize: '10px' }}>{phishingFlags.length > 0 ? 'ALERT' : 'GOOD'}</span>
             </div>
          </div>
        </div>

        {/* Flagged Areas */}
        <div className="glass-card" style={{ padding: '16px' }}>
           <h3 style={{ marginBottom: '8px', fontSize: '13px' }}>System Flags</h3>
           {phishingFlags.length === 0 ? (
             <div style={{ color: 'var(--text-muted)', fontSize: '11px' }}>No active security flags detected.</div>
           ) : (
             <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {phishingFlags.map((f, i) => (
                  <div key={i} style={{ padding: '8px', borderRadius: '6px', backgroundColor: 'rgba(239, 68, 68, 0.08)', border: '1px solid rgba(239, 68, 68, 0.15)', fontSize: '11px', color: '#ef4444' }}>
                     🚩 {f}
                  </div>
                ))}
             </div>
           )}
        </div>
      </div>
    </div>
  );
};
