import { useState, useEffect } from 'react';
import { Shell } from '../components/Shell';
import { NetworkTab } from '../components/NetworkTab';
import { SafetyTab } from '../components/SafetyTab';
import { ResourceTab } from '../components/ResourceTab';
import { MetaTab } from '../components/MetaTab';
import { TesterTab } from '../components/TesterTab';
import { HealthTab } from '../components/HealthTab';
import { SettingsTab } from '../components/SettingsTab';
import type { RequestRecord } from '../types';

export const WidgetApp = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState('network');
  const [records, setRecords] = useState<RequestRecord[]>([]);
  const [selectedRecord, setSelectedRecord] = useState<RequestRecord | null>(null);
  const [prefill, setPrefill] = useState<RequestRecord | null>(null);
  const [origin] = useState(() => window.location.origin);

  const handleTry = (r: RequestRecord) => {
    setPrefill(r);
    setActiveTab('tester');
  };

  useEffect(() => {
    if (!isOpen) return;

    const fetchData = () => {
      chrome.runtime.sendMessage({ type: 'GET_RECORDS_PROXY', origin }, (response) => {
        if (response?.records) {
          setRecords(response.records);
        }
      });
    };

    fetchData();
    const interval = setInterval(fetchData, 3000);
    
    const handleNew = (msg: any) => {
      if (msg.type === 'NEW_REQUEST' && msg.record.origin === origin) {
        setRecords(prev => [msg.record, ...prev]);
      }
    };
    chrome.runtime.onMessage.addListener(handleNew);

    return () => {
      clearInterval(interval);
      chrome.runtime.onMessage.removeListener(handleNew);
    };
  }, [isOpen, origin]);

  if (!isOpen) {
    return (
      <div 
        onClick={() => setIsOpen(true)}
        style={{
          position: 'fixed',
          bottom: '24px',
          right: '24px',
          width: '56px',
          height: '56px',
          borderRadius: '50%',
          background: 'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
          boxShadow: '0 8px 32px rgba(79, 172, 254, 0.4)',
          zIndex: 999999,
          fontSize: '28px',
          transition: 'transform 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275)',
        }}
        onMouseEnter={(e) => (e.currentTarget.style.transform = 'scale(1.1) rotate(5deg)')}
        onMouseLeave={(e) => (e.currentTarget.style.transform = 'scale(1) rotate(0deg)')}
      >
        🌌
      </div>
    );
  }

  return (
    <div style={{
      position: 'fixed',
      top: '10px',
      right: '10px',
      bottom: '10px',
      width: '420px',
      background: 'rgba(10, 15, 25, 0.95)',
      backdropFilter: 'blur(20px)',
      borderRadius: '16px',
      border: '1px solid rgba(255,255,255,0.1)',
      boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
      zIndex: 999999,
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden',
      animation: 'slideIn 0.4s cubic-bezier(0, 0, 0.2, 1)'
    }}>
      <style>{`
        @keyframes slideIn { from { transform: translateX(100%); opacity: 0; } to { transform: translateX(0); opacity: 1; } }
      `}</style>
      
      <div style={{ position: 'absolute', top: '16px', right: '50px', zIndex: 1001 }}>
          <button 
            onClick={() => setIsOpen(false)}
            style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', fontSize: '24px' }}
          >
            ×
          </button>
      </div>

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        <Shell activeTab={activeTab} setActiveTab={setActiveTab}>
          {activeTab === 'network' && (
            <NetworkTab 
              records={records} 
              onSelect={setSelectedRecord} 
              selectedId={selectedRecord?.id || null} 
              onTry={handleTry}
            />
          )}
          {activeTab === 'safety' && (
             <SafetyTab 
              verdict={records.some(r => r.piiFindings.length > 5) ? 'dangerous' : records.length > 15 ? 'suspicious' : 'safe'}
              score={Math.min(100, Math.max(0, 100 - records.length))}
              piiFindings={records.reduce((acc, r) => acc + r.piiFindings.length, 0)}
              phishingFlags={[]}
            />
          )}
          {activeTab === 'resources' && (
            <ResourceTab resources={records.map(r => ({
                url: r.url,
                type: (r.resourceType === 'image' || r.resourceType === 'script' || r.resourceType === 'stylesheet') ? r.resourceType.replace('stylesheet', 'style') as any : 'fetch',
                size: r.requestBody?.length || 0,
                status: r.responseStatusCode
              }))} 
            />
          )}
          {activeTab === 'meta' && <MetaTab seo={{ title: document.title, description: "In-page audit" }} />}
          {activeTab === 'tester' && <TesterTab prefill={prefill} />}
          {activeTab === 'health' && <HealthTab metrics={{ totalElements: document.querySelectorAll('*').length, maxDepth: 10, accessibilityIssues: 0 }} />}
          {activeTab === 'settings' && <SettingsTab />}
        </Shell>
      </div>
    </div>
  );
};
