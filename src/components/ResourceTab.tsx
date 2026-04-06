import { useState } from 'react';

interface Resource {
  url: string;
  type: 'image' | 'script' | 'style' | 'font' | 'fetch' | 'xhr' | 'other';
  size?: number;
  status?: number;
}

export const ResourceTab = ({ resources }: { resources: Resource[] }) => {
  const [activeType, setActiveType] = useState<'all' | 'image' | 'script' | 'style' | 'font'>('all');

  const filtered = activeType === 'all' ? resources : resources.filter(r => r.type === activeType);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Category Tabs */}
      <div style={{ display: 'flex', gap: '10px' }}>
        {['all', 'script', 'style', 'image', 'font'].map(t => (
          <button
            key={t}
            onClick={() => setActiveType(t as any)}
            className="btn-ghost"
            style={{ 
              textTransform: 'capitalize',
              backgroundColor: activeType === t ? 'rgba(59, 130, 246, 0.2)' : 'transparent',
              borderColor: activeType === t ? '#3b82f6' : 'var(--border-glass)',
              color: activeType === t ? '#3b82f6' : 'var(--text-secondary)',
            }}
          >
            {t}s
          </button>
        ))}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {filtered.map((res, i) => (
          <div key={i} className="glass-card" style={{ padding: '12px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ 
                fontSize: '9px', 
                fontWeight: 800, 
                textTransform: 'uppercase', 
                backgroundColor: 'rgba(59, 130, 246, 0.1)', 
                color: '#3b82f6', 
                padding: '2px 6px', 
                borderRadius: '4px' 
              }}>
                {res.type}
              </span>
              <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>{res.size ? `${(res.size/1024).toFixed(1)} KB` : ''}</span>
            </div>
            
            <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: '12px', fontWeight: 700 }}>
              {res.url.split('/').pop() || res.url}
            </div>
            
            <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
              <button 
                className="btn-ghost" 
                style={{ fontSize: '10px', padding: '3px 8px' }}
                onClick={() => window.open(res.url, '_blank')}
              >
                View
              </button>
              <button 
                className="btn-ghost" 
                style={{ fontSize: '10px', padding: '3px 8px' }}
                onClick={() => navigator.clipboard.writeText(res.url)}
              >
                Copy
              </button>
            </div>
          </div>
        ))}
      </div>
      
      {filtered.length === 0 && (
        <div style={{ padding: '100px', textAlign: 'center', color: 'var(--text-muted)' }}>
          <div style={{ fontSize: '40px', marginBottom: '16px' }}>📦</div>
          <p>No resources found in this category.</p>
        </div>
      )}
    </div>
  );
};
