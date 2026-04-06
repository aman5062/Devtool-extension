import 'react';

interface SidebarItemProps {
  label: string;
  icon: string;
  active: boolean;
  onClick: () => void;
}

const SidebarItem = ({ label, icon, active, onClick }: SidebarItemProps) => (
  <div 
    onClick={onClick}
    title={label}
    style={{
      height: '60px',
      width: '100%',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      gap: '4px',
      cursor: 'pointer',
      transition: 'all 0.2s ease',
      backgroundColor: active ? 'rgba(59, 130, 246, 0.12)' : 'transparent',
      color: active ? '#4facfe' : '#94a3b8',
      position: 'relative',
    }}
  >
    {active && (
      <div style={{
        position: 'absolute',
        left: 0,
        top: '20%',
        bottom: '20%',
        width: '3px',
        background: 'linear-gradient(to bottom, #4facfe, #00f2fe)',
        borderRadius: '0 4px 4px 0',
      }}></div>
    )}
    <span style={{ fontSize: '20px' }}>{icon}</span>
    <span style={{ fontSize: '9px', fontWeight: active ? 700 : 500, textTransform: 'uppercase' }}>{label}</span>
  </div>
);

export const Sidebar = ({ activeTab, setActiveTab }: { activeTab: string, setActiveTab: (t: any) => void }) => {
  const tabs = [
    { id: 'network', label: 'Net', icon: '🌐' },
    { id: 'safety', label: 'Shield', icon: '🛡️' },
    { id: 'resources', label: 'Assets', icon: '📦' },
    { id: 'meta', label: 'Meta', icon: '🔍' },
    { id: 'tester', label: 'API', icon: '⚡' },
    { id: 'health', label: 'Health', icon: '🏥' },
    { id: 'settings', label: 'Prefs', icon: '⚙️' },
  ];

  return (
    <div style={{ 
      width: '64px', 
      height: '100vh', 
      borderRight: '1px solid var(--border-glass)',
      display: 'flex',
      flexDirection: 'column',
      background: 'rgba(10, 15, 25, 0.4)',
      backdropFilter: 'blur(10px)',
      flexShrink: 0,
      paddingTop: '20px'
    }}>
      <div style={{ 
        width: '40px', height: '40px', borderRadius: '10px', 
        background: 'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: '22px', margin: '0 auto 24px',
        boxShadow: '0 4px 15px rgba(0,0,0,0.3)',
      }}>🌌</div>
      
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        {tabs.map(tab => (
          <SidebarItem 
            key={tab.id}
            label={tab.label}
            icon={tab.icon}
            active={activeTab === tab.id}
            onClick={() => setActiveTab(tab.id)}
          />
        ))}
      </div>
      
      <div style={{ padding: '12px 0', fontSize: '9px', color: 'var(--text-muted)', textAlign: 'center', borderTop: '1px solid var(--border-glass)' }}>
        PRO
      </div>
    </div>
  );
};
