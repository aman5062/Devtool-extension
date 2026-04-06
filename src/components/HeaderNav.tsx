import 'react';

interface NavItemProps {
  label: string;
  icon: string;
  active: boolean;
  onClick: () => void;
}

const NavItem = ({ label, icon, active, onClick }: NavItemProps) => (
  <div 
    onClick={onClick}
    title={label}
    style={{
      flex: 1,
      minWidth: '40px',
      height: '100%',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      cursor: 'pointer',
      transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
      color: active ? '#4facfe' : '#64748b',
      position: 'relative',
    }}
    onMouseEnter={(e) => !active && (e.currentTarget.style.color = '#94a3b8')}
    onMouseLeave={(e) => !active && (e.currentTarget.style.color = '#64748b')}
  >
    <span style={{ 
      fontSize: '22px', 
      filter: active ? 'drop-shadow(0 0 8px rgba(79, 172, 254, 0.4))' : 'none',
      transform: active ? 'scale(1.1)' : 'scale(1)',
      transition: 'transform 0.3s'
    }}>{icon}</span>
    {active && (
      <div style={{
        position: 'absolute',
        bottom: 0,
        left: '15%',
        right: '15%',
        height: '3px',
        background: 'linear-gradient(90deg, #4facfe, #00f2fe)',
        borderRadius: '3px 3px 0 0',
        boxShadow: '0 0 15px rgba(79, 172, 254, 0.6)'
      }}></div>
    )}
  </div>
);

export const HeaderNav = ({ activeTab, setActiveTab }: { activeTab: string, setActiveTab: (t: any) => void }) => {
  const tabs = [
    { id: 'network', label: 'Net', icon: '🌐' },
    { id: 'safety', label: 'Shield', icon: '🛡️' },
    { id: 'resources', label: 'Assets', icon: '📦' },
    { id: 'meta', label: 'SEO', icon: '🔍' },
    { id: 'tester', label: 'API', icon: '⚡' },
    { id: 'health', label: 'Vital', icon: '🏥' },
    { id: 'settings', label: 'Prefs', icon: '⚙️' },
  ];

  return (
    <div style={{ 
      width: '100%', 
      height: '52px', 
      borderBottom: '1px solid var(--border-glass)',
      display: 'flex',
      alignItems: 'center',
      background: 'rgba(10, 15, 25, 0.8)',
      backdropFilter: 'blur(12px)',
      WebkitBackdropFilter: 'blur(12px)',
      padding: '0 8px',
      zIndex: 1000,
    }}>
      <div 
        onClick={() => window.open(chrome.runtime.getURL('dashboard.html'), '_blank')}
        title="Open Dashboard"
        style={{ 
          width: '32px', height: '32px', borderRadius: '8px', 
          background: 'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: '18px', margin: '0 8px',
          boxShadow: '0 4px 10px rgba(0,0,0,0.3)',
          flexShrink: 0,
          cursor: 'pointer'
        }}>🌌</div>
      
      <div style={{ 
        flex: 1, 
        display: 'flex', 
        justifyContent: 'space-around',
        maxWidth: '500px'
      }}>
        {tabs.map(tab => (
          <NavItem 
            key={tab.id}
            label={tab.label}
            icon={tab.icon}
            active={activeTab === tab.id}
            onClick={() => setActiveTab(tab.id)}
          />
        ))}
      </div>

      <button 
        onClick={() => window.open(chrome.runtime.getURL('dashboard.html'), '_blank')}
        title="Open Full Dashboard"
        style={{
          background: 'rgba(255,255,255,0.05)',
          border: '1px solid var(--border-glass)',
          borderRadius: '6px',
          padding: '6px',
          marginLeft: '8px',
          cursor: 'pointer',
          color: 'var(--text-muted)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          transition: 'all 0.2s'
        }}
        onMouseEnter={(e) => (e.currentTarget.style.color = '#fff')}
        onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-muted)')}
      >
        🖥️
      </button>
    </div>
  );
};
