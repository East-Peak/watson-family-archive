'use client';

import {
  useEffect,
  useState,
  useCallback,
  createContext,
  useContext,
  type ReactNode,
} from 'react';

interface ToastItem {
  id: number;
  message: string;
  type: 'success' | 'error' | 'info';
  link?: { label: string; href: string };
}

interface ToastContextValue {
  showToast: (toast: Omit<ToastItem, 'id'>) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
}

let nextId = 0;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const showToast = useCallback((toast: Omit<ToastItem, 'id'>) => {
    const id = nextId++;
    setToasts((prev) => [...prev, { ...toast, id }]);
  }, []);

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return (
    <ToastContext value={{ showToast }}>
      {children}
      <div className="fixed bottom-20 right-6 z-[9999] flex flex-col gap-2 pointer-events-none">
        {toasts.map((toast) => (
          <ToastCard key={toast.id} toast={toast} onDismiss={dismiss} />
        ))}
      </div>
    </ToastContext>
  );
}

function ToastCard({
  toast,
  onDismiss,
}: {
  toast: ToastItem;
  onDismiss: (id: number) => void;
}) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // Trigger entrance animation on mount
    const enterFrame = requestAnimationFrame(() => setVisible(true));
    const timer = setTimeout(() => onDismiss(toast.id), 5000);
    return () => {
      cancelAnimationFrame(enterFrame);
      clearTimeout(timer);
    };
  }, [toast.id, onDismiss]);

  const bgClass =
    toast.type === 'success'
      ? 'bg-oak/95 text-white'
      : toast.type === 'error'
        ? 'bg-red-600/95 text-white'
        : 'bg-shield/95 text-white';

  return (
    <div
      className={`pointer-events-auto rounded-xl px-4 py-3 shadow-lg text-sm font-medium ${bgClass} transition-all duration-300 ${
        visible ? 'opacity-100 translate-x-0' : 'opacity-0 translate-x-8'
      }`}
    >
      <div className="flex items-center gap-3">
        <span>{toast.message}</span>
        {toast.link && (
          <a
            href={toast.link.href}
            className="underline underline-offset-2 opacity-90 hover:opacity-100"
          >
            {toast.link.label}
          </a>
        )}
        <button
          onClick={() => onDismiss(toast.id)}
          className="ml-2 opacity-60 hover:opacity-100"
          aria-label="Dismiss"
        >
          &times;
        </button>
      </div>
    </div>
  );
}
