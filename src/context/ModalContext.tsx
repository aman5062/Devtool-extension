import { createContext, useContext, useState, ReactNode } from 'react';
import { CustomModal } from '../components/CustomModal';

interface ModalOptions {
  title: string;
  message: string;
  onConfirm: () => void;
  onCancel?: () => void;
  confirmLabel?: string;
  cancelLabel?: string;
  type?: 'danger' | 'info';
}

interface ModalContextType {
  popConfirm: (options: ModalOptions) => void;
  popAlert: (title: string, message: string, onOk?: () => void) => void;
}

const ModalContext = createContext<ModalContextType | undefined>(undefined);

export const ModalProvider = ({ children }: { children: ReactNode }) => {
  const [modal, setModal] = useState<ModalOptions | null>(null);
  const [isOpen, setIsOpen] = useState(false);

  const popConfirm = (options: ModalOptions) => {
    setModal({
      ...options,
      onCancel: options.onCancel || (() => {})
    });
    setIsOpen(true);
  };

  const popAlert = (title: string, message: string, onOk?: () => void) => {
    setModal({
      title,
      message,
      onConfirm: () => {
        onOk?.();
        setIsOpen(false);
      },
      confirmLabel: 'OK',
      type: 'info'
    });
    setIsOpen(true);
  };

  const handleConfirm = () => {
    modal?.onConfirm();
    setIsOpen(false);
  };

  const handleCancel = () => {
    modal?.onCancel?.();
    setIsOpen(false);
  };

  return (
    <ModalContext.Provider value={{ popConfirm, popAlert }}>
      {children}
      {modal && (
        <CustomModal
          isOpen={isOpen}
          title={modal.title}
          message={modal.message}
          confirmLabel={modal.confirmLabel}
          cancelLabel={modal.cancelLabel}
          type={modal.type}
          onConfirm={handleConfirm}
          onCancel={modal.onCancel ? handleCancel : undefined}
        />
      )}
    </ModalContext.Provider>
  );
};

export const useModal = () => {
  const context = useContext(ModalContext);
  if (!context) {
    throw new Error('useModal must be used within a ModalProvider');
  }
  return context;
};
