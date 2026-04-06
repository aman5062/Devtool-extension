import 'react';

interface ModalProps {
  isOpen: boolean;
  title: string;
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export const CustomModal = ({ isOpen, title, message, onConfirm, onCancel }: ModalProps) => {
  if (!isOpen) return null;

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(0, 0, 0, 0.8)',
      backdropFilter: 'blur(4px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 2000,
      padding: '20px'
    }}>
      <div className="glass-card animate-fade-in" style={{
        width: '100%',
        maxWidth: '320px',
        padding: '24px',
        background: 'rgba(23, 28, 40, 0.95)',
        border: '1px solid var(--border-glass)',
        boxShadow: '0 20px 50px rgba(0,0,0,0.5)',
        display: 'flex',
        flexDirection: 'column',
        gap: '16px'
      }}>
        <div style={{ fontSize: '18px', fontWeight: 800, color: '#4facfe' }}>{title}</div>
        <div style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.5 }}>{message}</div>
        
        <div style={{ display: 'flex', gap: '12px', marginTop: '8px' }}>
          <button 
            className="btn-ghost" 
            style={{ flex: 1, padding: '10px' }} 
            onClick={onCancel}
          >
            Cancel
          </button>
          <button 
            className="btn-primary" 
            style={{ flex: 1, padding: '10px', background: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)', boxShadow: '0 4px 12px rgba(239, 68, 68, 0.3)' }} 
            onClick={onConfirm}
          >
            Confirm
          </button>
        </div>
      </div>
    </div>
  );
};
