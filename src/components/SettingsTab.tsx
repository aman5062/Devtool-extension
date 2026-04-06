import { useState } from 'react';

export const SettingsTab = () => {
  const [prefs, setPrefs] = useState({
    autoCapture: true,
    enableShield: true,
    detectPII: true,
    showNotifications: false,
    darkMode: true,
  });

  const toggle = (field: keyof typeof prefs) => {
    setPrefs({ ...prefs, [field]: !prefs[field] });
  };

  const menuItems = [
    { id: 'autoCapture', label: 'Auto-capture Network', desc: 'Automatically store network requests for analysis.', icon: '🛰️' },
    { id: 'enableShield', label: 'Shield Protection', desc: 'Enable phishing and suspicious TLD detection.', icon: '🛡️' },
    { id: 'detectPII', label: 'PII Detection', desc: 'Alert when personal information is found in requests.', icon: '🔍' },
    { id: 'showNotifications', label: 'Push Notifications', desc: 'Show desktop alerts for critical security flags.', icon: '🔔' },
    { id: 'darkMode', label: 'Dark Mode (Always On)', desc: 'Professional dark theme for the best developer experience.', icon: '🌙' },
  ];

  return (
    <div style={{ maxWidth: '800px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <h2 style={{ fontSize: '24px', fontWeight: 800, marginBottom: '8px' }}>Preferences</h2>
      <p style={{ color: 'var(--text-secondary)', marginBottom: '16px' }}>Customize DevSphere to fit your development workflow. No server sync, all data stays local.</p>

      <div className="glass-card" style={{ padding: '0' }}>
         {menuItems.map((item, i) => (
           <div key={item.id} style={{ 
             padding: '20px 24px', 
             borderBottom: i < menuItems.length - 1 ? '1px solid var(--border-glass)' : 'none',
             display: 'flex',
             alignItems: 'center',
             justifyContent: 'space-between',
             gap: '24px'
           }}>
             <div style={{ display: 'flex', gap: '20px', alignItems: 'center' }}>
               <span style={{ fontSize: '24px' }}>{item.icon}</span>
               <div>
                  <div style={{ fontWeight: 700, fontSize: '16px' }}>{item.label}</div>
                  <div style={{ color: 'var(--text-muted)', fontSize: '13px' }}>{item.desc}</div>
               </div>
             </div>
             
             <div 
               onClick={() => toggle(item.id as any)}
               style={{
                 width: '50px',
                 height: '26px',
                 borderRadius: '13px',
                 background: (prefs as any)[item.id] ? '#3b82f6' : 'rgba(255,255,255,0.05)',
                 border: '1px solid var(--border-glass)',
                 cursor: 'pointer',
                 padding: '3px',
                 transition: 'all 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275)',
                 display: 'flex',
                 justifyContent: (prefs as any)[item.id] ? 'flex-end' : 'flex-start',
                 boxShadow: (prefs as any)[item.id] ? '0 0 10px rgba(59, 130, 246, 0.4)' : 'none'
               }}
             >
                <div style={{ 
                  width: '18px', 
                  height: '18px', 
                  borderRadius: '50%', 
                  background: 'white', 
                  boxShadow: '0 2px 4px rgba(0,0,0,0.2)' 
                }}></div>
             </div>
           </div>
         ))}
      </div>

      <div style={{ padding: '24px', textAlign: 'center' }}>
         <button className="btn-primary" style={{ padding: '12px 32px' }}>Save All Changes</button>
         <button 
          className="btn-ghost" 
          style={{ padding: '12px 32px', marginLeft: '16px', color: '#ef4444', borderColor: 'rgba(239, 68, 68, 0.2)' }}
          onClick={() => { if(confirm('Clear all local data?')) alert('Data cleared!'); }}
         >
           Reset All Factory Settings
         </button>
      </div>
    </div>
  );
};
