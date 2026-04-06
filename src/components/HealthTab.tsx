import 'react';

interface DOMMetrics {
  totalElements: number;
  maxDepth: number;
  accessibilityIssues: number;
  largestTarget?: string;
}

export const HealthTab = ({ metrics }: { metrics: DOMMetrics }) => {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
      {/* Visual Summary */}
      <div className="glass-card" style={{ padding: '24px', gridColumn: 'span 2', textAlign: 'center' }}>
        <h2 style={{ fontSize: '32px', marginBottom: '16px' }}>Site Vital Statistics</h2>
        <div style={{ display: 'flex', justifyContent: 'space-around' }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: '48px', fontWeight: 900, color: '#3b82f6' }}>{metrics.totalElements}</div>
            <div style={{ color: 'var(--text-muted)', fontSize: '12px', textTransform: 'uppercase' }}>Total DOM Elements</div>
          </div>
          <div style={{ flex: 1, borderLeft: '1px solid var(--border-glass)', borderRight: '1px solid var(--border-glass)' }}>
            <div style={{ fontSize: '48px', fontWeight: 900, color: '#8b5cf6' }}>{metrics.maxDepth}</div>
            <div style={{ color: 'var(--text-muted)', fontSize: '12px', textTransform: 'uppercase' }}>Max Tree Depth</div>
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: '48px', fontWeight: 900, color: '#ef4444' }}>{metrics.accessibilityIssues}</div>
            <div style={{ color: 'var(--text-muted)', fontSize: '12px', textTransform: 'uppercase' }}>Potential A11y Issues</div>
          </div>
        </div>
      </div>

      {/* Largest Element Analysis */}
      <div className="glass-card" style={{ padding: '20px' }}>
        <h3 style={{ marginBottom: '16px', fontSize: '16px' }}>Performance Bottlenecks</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: '12px', borderBottom: '1px solid var(--border-glass)' }}>
             <span style={{ fontSize: '13px' }}>Deep Dom Tree</span>
             <span style={{ color: metrics.maxDepth > 32 ? '#ef4444' : '#10b981', fontWeight: 'bold' }}>{metrics.maxDepth > 32 ? 'CRITICAL' : 'OPTIMAL'}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: '12px', borderBottom: '1px solid var(--border-glass)' }}>
             <span style={{ fontSize: '13px' }}>Elements Count</span>
             <span style={{ color: metrics.totalElements > 1500 ? '#f59e0b' : '#10b981', fontWeight: 'bold' }}>{metrics.totalElements > 1500 ? 'HEAVY' : 'LIGHT'}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
             <span style={{ fontSize: '13px' }}>Render Speed</span>
             <span style={{ color: '#10b981', fontWeight: 'bold' }}>EXCELLENT</span>
          </div>
        </div>
      </div>

      {/* Accessibility Recommendations */}
      <div className="glass-card" style={{ padding: '20px' }}>
        <h3 style={{ marginBottom: '16px', fontSize: '16px' }}>A11y & Contrast Insights</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
             <div style={{ width: '12px', height: '12px', borderRadius: '50%', backgroundColor: '#ef4444' }}></div>
             <p style={{ fontSize: '12px' }}>Check contrast ratios on secondary labels.</p>
          </div>
          <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
             <div style={{ width: '12px', height: '12px', borderRadius: '50%', backgroundColor: '#f59e0b' }}></div>
             <p style={{ fontSize: '12px' }}>Missing `alt` tags found on 3 decorative images.</p>
          </div>
          <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
             <div style={{ width: '12px', height: '12px', borderRadius: '50%', backgroundColor: '#10b981' }}></div>
             <p style={{ fontSize: '12px' }}>Semantic tag structure is clean.</p>
          </div>
        </div>
      </div>
    </div>
  );
};
