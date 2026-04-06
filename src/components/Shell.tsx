import React, { useState } from 'react';
import { HeaderNav } from './HeaderNav';
import { CustomModal } from './CustomModal';

export const Shell = ({ children, activeTab, setActiveTab }: { children: React.ReactNode, activeTab: string, setActiveTab: (t: any) => void }) => {
  const [modal, setModal] = useState<{ isOpen: boolean; title: string; message: string; onConfirm: () => void } | null>(null);

  const confirmAction = (title: string, message: string, onConfirm: () => void) => {
    setModal({ isOpen: true, title, message, onConfirm });
  };

  const handleClearStorage = () => {
    confirmAction(
      "Purge Site Storage?",
      "This will permanently delete all LocalStorage, SessionStorage, and Cookies for this origin. Proceed?",
      async () => {
        try {
          const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
          if(tabs[0]?.id) {
            chrome.tabs.sendMessage(tabs[0].id, { type: 'CLEAR_STORAGE' }).catch(() => {
              console.warn("Could not send CLEAR_STORAGE message. Is the content script active on this page?");
            });
          }
        } catch (e) {
          console.error("Failed to query tabs:", e);
        }
        setModal(null);
      }
    );
  };

  const handleCaptureSnapshot = async () => {
    try {
      const data = await chrome.tabs.captureVisibleTab();
      const link = document.createElement('a');
      link.href = data;
      link.download = `devsphere-snap-${Date.now()}.png`;
      link.click();
    } catch (e) {
      console.error("Failed to capture snapshot:", e);
    }
  };

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      width: '100vw',
      height: '100vh',
      background: 'var(--bg-deep)',
      color: 'var(--text-primary)',
      fontFamily: 'var(--font-sans)',
      overflow: 'hidden',
      position: 'relative'
    }}>
      {/* Top Header Navigation */}
      <HeaderNav activeTab={activeTab} setActiveTab={setActiveTab} />

      {/* Main Content Area */}
      <div style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        background: 'rgba(255, 255, 255, 0.01)',
      }}>
        <div style={{
          flex: 1,
          overflowY: 'auto',
          padding: '12px 12px 80px', /* Bottom padding for toolbar space */
          scrollBehavior: 'smooth',
          background: 'radial-gradient(circle at top left, rgba(79, 172, 254, 0.03) 0%, transparent 60%)',
          position: 'relative'
        }}>
          <div className="animate-fade-in" style={{ width: '100%', maxWidth: '1200px', margin: '0 auto' }}>
            {children}
          </div>
        </div>
      </div>

      {/* Toolkit Toolbar - More discrete */}
      <div style={{
        position: 'fixed',
        bottom: '12px',
        right: '12px',
        padding: '4px',
        background: 'rgba(23, 28, 40, 0.9)',
        backdropFilter: 'blur(16px)',
        border: '1px solid var(--border-glass)',
        borderRadius: '20px',
        boxShadow: '0 4px 20px rgba(0,0,0,0.5)',
        display: 'flex',
        gap: '4px',
        zIndex: 1000
      }}>
         <button 
          className="btn-ghost" 
          title="Snapshot Viewport"
          style={{ width: '28px', height: '28px', borderRadius: '50%', padding: '0', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '14px' }}
          onClick={handleCaptureSnapshot}
         >📸</button>
         <button 
          className="btn-ghost" 
          title="Wipe Storage"
          style={{ width: '28px', height: '28px', borderRadius: '50%', padding: '0', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '14px', color: '#ef4444' }}
          onClick={handleClearStorage}
         >🧹</button>
      </div>

      {modal && (
        <CustomModal 
          isOpen={modal.isOpen}
          title={modal.title}
          message={modal.message}
          onConfirm={modal.onConfirm}
          onCancel={() => setModal(null)}
        />
      )}
    </div>
  );
};
