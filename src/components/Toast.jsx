// Sistema de toasts — feedback de cada escritura (éxito/error).
import { createContext, useContext, useState, useCallback, useRef } from 'react';

const ToastCtx = createContext(null);

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const idRef = useRef(0);

  const dismiss = useCallback((id) => {
    setToasts((t) => t.filter((x) => x.id !== id));
  }, []);

  const push = useCallback((kind, title, msg, ttl = 4000) => {
    const id = ++idRef.current;
    setToasts((t) => [...t, { id, kind, title, msg }]);
    if (ttl) setTimeout(() => dismiss(id), ttl);
    return id;
  }, [dismiss]);

  const api = {
    ok:   (title, msg) => push('success', title, msg),
    err:  (title, msg) => push('error', title, msg, 6000),
    warn: (title, msg) => push('warning', title, msg),
    info: (title, msg) => push('info', title, msg),
  };

  return (
    <ToastCtx.Provider value={api}>
      {children}
      <div className="toast-stack">
        {toasts.map((t) => (
          <div key={t.id} className={`toast ${t.kind}`} onClick={() => dismiss(t.id)}>
            <div className="toast-title">{t.title}</div>
            {t.msg && <div className="toast-msg">{t.msg}</div>}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastCtx);
  if (!ctx) throw new Error('useToast fuera de ToastProvider');
  return ctx;
}
