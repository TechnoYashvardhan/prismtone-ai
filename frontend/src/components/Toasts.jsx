import { useCallback, useState } from 'react';

/** Minimal toast notifications (no dependency). */
export function useToasts() {
  const [toasts, setToasts] = useState([]);

  const notify = useCallback((message, type = 'info', ttl = 3200) => {
    const id = `${Date.now()}-${Math.random()}`;
    setToasts((prev) => [...prev.slice(-3), { id, message, type }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), ttl);
  }, []);

  return { toasts, notify };
}

export function ToastStack({ toasts }) {
  return (
    <div className="toast-stack" role="status" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={`toast ${t.type}`}>{t.message}</div>
      ))}
    </div>
  );
}
