// Modal genérico + ConfirmModal + hook useConfirm.
// Toda acción destructiva pasa por ConfirmModal (PROMPT_REWRITE §6).
import { useState, useCallback, useEffect } from 'react';

export function Modal({ title, onClose, width = 520, children }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose?.(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose?.(); }}>
      <div className="modal" style={{ width, maxWidth: '92vw' }}>
        {title && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--s-3)' }}>
            <div className="modal-title" style={{ margin: 0 }}>{title}</div>
            <button className="icon-btn" onClick={onClose} aria-label="Cerrar">×</button>
          </div>
        )}
        {children}
      </div>
    </div>
  );
}

export function ConfirmModal({ open = true, title = 'Confirmar', body, danger = true, busy = false, confirmLabel = 'Confirmar', onCancel, onConfirm }) {
  if (!open) return null;
  return (
    <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onCancel?.(); }}>
      <div className="modal" style={{ minWidth: 360, maxWidth: 460 }}>
        <div className="modal-title">{title}</div>
        <div className="modal-body">{body}</div>
        <div className="modal-actions">
          <button className="btn ghost" onClick={onCancel} disabled={busy}>Cancelar</button>
          <button className={`btn ${danger ? 'danger' : ''}`} onClick={onConfirm} disabled={busy}>
            {busy ? 'Procesando…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

// Hook: const confirm = useConfirm(); ... const ok = await confirm({title, body});
export function useConfirm() {
  const [state, setState] = useState(null); // { title, body, resolve }
  const confirm = useCallback((opts) => new Promise((resolve) => setState({ ...opts, resolve })), []);
  const node = state ? (
    <ConfirmModal
      title={state.title}
      body={state.body}
      danger={state.danger !== false}
      confirmLabel={state.confirmLabel}
      onCancel={() => { state.resolve(false); setState(null); }}
      onConfirm={() => { state.resolve(true); setState(null); }}
    />
  ) : null;
  return [confirm, node];
}
