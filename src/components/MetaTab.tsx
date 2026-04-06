// No-op

interface SEO {
  title?: string;
  description?: string;
  keywords?: string;
  ogTitle?: string;
  ogDescription?: string;
  ogImage?: string;
  twitterCard?: string;
  canonical?: string;
}

export const MetaTab = ({ seo }: { seo: SEO }) => {
  const metaItems = [
    { label: 'Document Title', value: seo.title, icon: '🏷️' },
    { label: 'Meta Description', value: seo.description, icon: '📝' },
    { label: 'Keywords', value: seo.keywords, icon: '🔑' },
    { label: 'Canonical URL', value: seo.canonical, icon: '🔗' },
    { label: 'OG Title', value: seo.ogTitle, icon: '🔵' },
    { label: 'OG Description', value: seo.ogDescription, icon: '📋' },
    { label: 'Twitter Card', value: seo.twitterCard, icon: '🐦' },
  ];

  const score = Math.round((metaItems.filter(i => !!i.value).length / metaItems.length) * 100);
  const color = score > 80 ? '#10b981' : score > 50 ? '#f59e0b' : '#ef4444';
  const radius = 22;
  const circum = 2 * Math.PI * radius;
  const dash = circum - (score / 100) * circum;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* Search HUD */}
      <div className="glass-card" style={{ padding: '16px', display: 'flex', gap: '20px', alignItems: 'center', background: 'linear-gradient(135deg, rgba(79, 172, 254, 0.05) 0%, rgba(0, 242, 254, 0.05) 100%)' }}>
        <div style={{ position: 'relative', width: '56px', height: '56px', flexShrink: 0 }}>
           <svg width="56" height="56" viewBox="0 0 56 56">
              <circle cx="28" cy="28" r={radius} fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="4" />
              <circle cx="28" cy="28" r={radius} fill="none" stroke={color} strokeWidth="4" 
                strokeDasharray={circum} strokeDashoffset={dash} strokeLinecap="round" transform="rotate(-90 28 28)" 
                style={{ transition: 'stroke-dashoffset 0.8s ease' }}
              />
              <text x="28" y="32" textAnchor="middle" fill="#fff" style={{ fontSize: '12px', fontWeight: 900 }}>{score}%</text>
           </svg>
           <div style={{ position: 'absolute', bottom: '-4px', left: '0', width: '100%', textAlign: 'center', fontSize: '7px', fontWeight: 900, textTransform: 'uppercase', color: 'var(--text-muted)' }}>Health</div>
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: '9px', fontWeight: 900, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '4px', letterSpacing: '0.05em' }}>SEO Presence Monitor</div>
          <h3 style={{ fontSize: '15px', fontWeight: 800, marginBottom: '2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: '#fff' }}>{seo.title || 'Untitled Source'}</h3>
          <p style={{ color: 'var(--text-secondary)', fontSize: '11px', opacity: 0.8, display: '-webkit-box', WebkitLineClamp: 1, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{seo.description || 'No meta description found for this origin.'}</p>
        </div>
      </div>

      {/* Meta Specs */}
      <div className="glass-card" style={{ padding: '0' }}>
        <div style={{ padding: '16px', borderBottom: '1px solid var(--border-glass)', fontWeight: 700 }}>Meta Details</div>
        {metaItems.map((item, i) => (
          <div key={i} style={{ 
            padding: '16px', 
            borderBottom: i < metaItems.length - 1 ? '1px solid var(--border-glass)' : 'none',
            display: 'flex',
            gap: '16px',
            alignItems: 'center'
          }}>
            <span style={{ fontSize: '20px' }}>{item.icon}</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>{item.label}</div>
              <div style={{ wordBreak: 'break-all', fontSize: '14px' }}>{item.value || <span style={{ fontStyle: 'italic', color: 'var(--text-muted)' }}>Missing tag</span>}</div>
            </div>
            {item.value && (
              <button 
                className="btn-ghost" 
                style={{ fontSize: '11px', padding: '4px 8px' }}
                onClick={() => navigator.clipboard.writeText(item.value!)}
              >
                Copy
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};
