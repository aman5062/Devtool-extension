import { useEffect, useState } from 'react';
import type { RequestRecord, Preferences } from '../types';
import { getRecordsByOrigin } from '../storage';
import { getPreferences } from '../preferences';

// Components
import { Shell } from '../components/Shell';
import { NetworkTab } from '../components/NetworkTab';
import { SafetyTab } from '../components/SafetyTab';
import { ResourceTab } from '../components/ResourceTab';
import { MetaTab } from '../components/MetaTab';
import { TesterTab } from '../components/TesterTab';
import { HealthTab } from '../components/HealthTab';
import { SettingsTab } from '../components/SettingsTab';

export default function App() {
  const [activeTab, setActiveTab] = useState('network');
  const [records, setRecords] = useState<RequestRecord[]>([]);
  const [, setPrefs] = useState<Preferences | null>(null);
  const [selectedRecord, setSelectedRecord] = useState<RequestRecord | null>(null);
  const [origin, setOrigin] = useState<string>('');

  useEffect(() => {
    const init = async () => {
      try {
        const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
        if (tabs[0]?.url) {
          const u = new URL(tabs[0].url);
          setOrigin(u.origin);
          const recs = await getRecordsByOrigin(u.origin);
          setRecords(recs);
        }
        const p = await getPreferences();
        setPrefs(p);
      } catch (e) {
        console.error('Initialization error:', e);
      }
    };
    init();
    
    // Auto-refresh interval
    const interval = setInterval(init, 3000);
    return () => clearInterval(interval);
  }, []);

  return (
    <Shell activeTab={activeTab} setActiveTab={setActiveTab}>
      <div style={{ paddingBottom: '100px' }}>
        {activeTab === 'network' && (
          <NetworkTab 
            records={records} 
            onSelect={setSelectedRecord} 
            selectedId={selectedRecord?.id || null} 
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
          <ResourceTab 
            resources={records.map(r => ({
              url: r.url,
              type: (r.resourceType === 'image' || r.resourceType === 'script' || r.resourceType === 'stylesheet') 
                ? r.resourceType.replace('stylesheet', 'style') as any 
                : 'fetch',
              size: r.requestBody?.length || 0,
              status: r.responseStatusCode
            }))} 
          />
        )}

        {activeTab === 'meta' && (
          <MetaTab 
            seo={{
              title: origin.replace(/https?:\/\/(www\.)?/, ''),
              description: "Full Dashboard Analysis for " + origin,
              ogTitle: "DevSphere Protected Origin",
              ogImage: "https://images.unsplash.com/photo-1550751827-4bd374c3f58b?auto=format&fit=crop&q=80&w=600&h=400"
            }}
          />
        )}

        {activeTab === 'tester' && <TesterTab />}

        {activeTab === 'health' && (
          <HealthTab 
            metrics={{
              totalElements: 1240,
              maxDepth: 34,
              accessibilityIssues: 12
            }}
          />
        )}

        {activeTab === 'settings' && <SettingsTab />}
      </div>
    </Shell>
  );
}
