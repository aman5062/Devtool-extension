import 'react';

interface ModalProps {
  isOpen: boolean;
  title: string;
  message: string;
  onConfirm: () => void;
  onCancel?: () => void; // Optional for alerts
  confirmLabel?: string;
  cancelLabel?: string;
  type?: 'danger' | 'info';
}

export const CustomModal = ({ 
  isOpen, 
  title, 
  message, 
  onConfirm, 
  onCancel, 
  confirmLabel = 'Confirm', 
  cancelLabel = 'Cancel',
  type = 'info' 
}: ModalProps) => {
  if (!isOpen) return null;

  const isAlert = !onCancel;

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(0, 0, 0, 0.75)',
      backdropFilter: 'blur(12px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 10000,
      padding: '20px',
      animation: 'fadeIn 0.2s ease-out'
    }}>
      <style>{`
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes slideUp { from { transform: translateY(20px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
      `}</style>
      <div className="glass-card" style={{
        width: '100%',
        maxWidth: '360px',
        padding: '32px',
        background: 'rgba(23, 28, 40, 0.98)',
        border: '1px solid rgba(255, 255, 255, 0.1)',
        boxShadow: '0 25px 60px rgba(0,0,0,0.8), 0 0 20px rgba(79, 172, 254, 0.1)',
        display: 'flex',
        flexDirection: 'column',
        gap: '20px',
        animation: 'slideUp 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275)'
      }}>
        <div style={{ 
          fontSize: '22px', 
          fontWeight: 900, 
          color: type === 'danger' ? '#ef4444' : '#4facfe',
          letterSpacing: '-0.02em'
        }}>
          {title}
        </div>
        <div style={{ 
          fontSize: '15px', 
          color: 'rgba(255,255,255,0.7)', 
          lineHeight: 1.6,
          fontWeight: 400
        }}>
          {message}
        </div>
        
        <div style={{ display: 'flex', gap: '12px', marginTop: '12px' }}>
          {!isAlert && (
            <button 
              className="btn-ghost" 
              style={{ flex: 1, padding: '12px', borderRadius: '12px', fontWeight: 700 }} 
              onClick={onCancel}
            >
              {cancelLabel}
            </button>
          )}
          <button 
            className="btn-primary" 
            style={{ 
              flex: 1, 
              padding: '12px', 
              borderRadius: '12px', 
              fontWeight: 800,
              background: type === 'danger' 
                ? 'linear-gradient(135deg, #ef4444 0%, #b91c1c 100%)' 
                : 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
              boxShadow: type === 'danger' 
                ? '0 8px 20px rgba(239, 68, 68, 0.3)' 
                : '0 8px 20px rgba(59, 130, 246, 0.3)' 
            }} 
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
};
