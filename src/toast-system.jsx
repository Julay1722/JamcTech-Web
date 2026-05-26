// ════════════════════════════════════════════════════════════════
// toast-system.jsx — v3.5
// Sistema centralizado de notificaciones (toasts), skeleton de loading
// inicial, y helpers de localStorage para persistir preferencias.
// Cargado DESPUÉS de primitives.jsx y ANTES de los paneles.
// ════════════════════════════════════════════════════════════════

// ── localStorage helpers (con try/catch para modos privados) ────
window.__LS__ = {
  get(key, fallback = null) {
    try {
      const v = localStorage.getItem('jamc:' + key);
      return v == null ? fallback : JSON.parse(v);
    } catch (e) {
      return fallback;
    }
  },
  set(key, value) {
    try {
      localStorage.setItem('jamc:' + key, JSON.stringify(value));
      return true;
    } catch (e) {
      return false;
    }
  },
  remove(key) {
    try {
      localStorage.removeItem('jamc:' + key);
      return true;
    } catch (e) {
      return false;
    }
  },
};

// ── Toast store global ───────────────────────────────────────────
window.__TOASTS__ = window.__TOASTS__ || {
  items: [],
  listeners: new Set(),
  add(t) {
    const id = `t-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const toast = {
      id,
      kind: t.kind || 'info',  // 'ok' | 'err' | 'warn' | 'info'
      title: t.title || '',
      msg: t.msg || '',
      ttl: t.ttl != null ? t.ttl : 5000,
      _ts: Date.now(),
    };
    this.items = [toast, ...this.items].slice(0, 5);
    this.listeners.forEach((fn) => fn());
    if (toast.ttl > 0) {
      setTimeout(() => this.remove(id), toast.ttl);
    }
    return id;
  },
  remove(id) {
    this.items = this.items.filter((t) => t.id !== id);
    this.listeners.forEach((fn) => fn());
  },
  clear() {
    this.items = [];
    this.listeners.forEach((fn) => fn());
  },
  subscribe(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  },
};

// Helpers de fácil uso desde cualquier archivo
window.toastOk   = (title, msg, ttl) => window.__TOASTS__.add({ kind: 'ok',   title, msg, ttl });
window.toastErr  = (title, msg, ttl) => window.__TOASTS__.add({ kind: 'err',  title, msg, ttl: ttl != null ? ttl : 8000 });
window.toastWarn = (title, msg, ttl) => window.__TOASTS__.add({ kind: 'warn', title, msg, ttl });
window.toastInfo = (title, msg, ttl) => window.__TOASTS__.add({ kind: 'info', title, msg, ttl });

// Hook para subscribirse a los toasts en componentes
function useToasts() {
  const [, force] = React.useReducer((x) => x + 1, 0);
  React.useEffect(() => window.__TOASTS__.subscribe(force), []);
  return window.__TOASTS__.items;
}

// ── Componente: ToastContainer ───────────────────────────────────
function ToastContainer() {
  const toasts = useToasts();
  if (toasts.length === 0) return null;
  return (
    <div style={{
      position: 'fixed', top: 70, right: 14, zIndex: 9999,
      display: 'flex', flexDirection: 'column', gap: 8,
      maxWidth: 380, pointerEvents: 'none',
    }}>
      {toasts.map((t) => (
        <ToastItem key={t.id} toast={t} />
      ))}
    </div>
  );
}

function ToastItem({ toast }) {
  const colors = {
    ok:   { bg: '#0d2a0d', bd: '#1a4a1a', col: '#9fdc9f', icon: '✓' },
    err:  { bg: '#2a0d0d', bd: '#4a1a1a', col: '#f0a0a0', icon: '✕' },
    warn: { bg: '#2a1d0a', bd: '#4a3a1a', col: '#f5a623', icon: '⚠' },
    info: { bg: '#0a1d2a', bd: '#1a3a4a', col: '#4fc3f7', icon: '◆' },
  };
  const c = colors[toast.kind] || colors.info;
  return (
    <div style={{
      background: c.bg,
      border: `1px solid ${c.bd}`,
      borderLeft: `3px solid ${c.col}`,
      padding: '9px 12px',
      fontSize: 10,
      color: c.col,
      lineHeight: 1.5,
      pointerEvents: 'auto',
      animation: 'toast-slide-in 0.2s ease-out',
      letterSpacing: '0.02em',
      fontFamily: 'inherit',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
        <div style={{ flex: 1 }}>
          {toast.title && <div style={{ fontWeight: 700, marginBottom: 2 }}>{c.icon} {toast.title}</div>}
          {toast.msg && <div style={{ color: c.col, opacity: 0.85 }}>{toast.msg}</div>}
        </div>
        <button onClick={() => window.__TOASTS__.remove(toast.id)} style={{
          background: 'transparent', border: 'none', color: c.col, opacity: 0.6,
          cursor: 'pointer', fontSize: 12, padding: 0, lineHeight: 1, marginTop: -2,
        }}>×</button>
      </div>
    </div>
  );
}

// ── Bootstrap loading skeleton ───────────────────────────────────
// Se monta INMEDIATAMENTE en el #root antes de React, para que el usuario
// vea algo mientras Babel compila los JSX. Se reemplaza por TerminalApp.
(function injectBootSkeleton() {
  const root = document.getElementById('root');
  if (!root) return;
  if (root.children.length > 0) return; // ya hay algo
  root.innerHTML = `
    <div id="boot-skel" style="
      display:flex;flex-direction:column;align-items:center;justify-content:center;
      min-height:100vh;font-family:'IBM Plex Mono',monospace;color:#9fdc9f;
      background:#070708;text-align:center;padding:20px;">
      <div style="font-size:28px;font-weight:700;letter-spacing:3px;margin-bottom:6px;color:#b8f700;">
        JAMC.TECH
      </div>
      <div style="font-size:10px;letter-spacing:2px;color:#888;margin-bottom:28px;">
        TERMINAL · CARGANDO...
      </div>
      <div style="display:flex;gap:8px;margin-bottom:14px;">
        <div class="dot1" style="width:8px;height:8px;background:#b8f700;animation:pulse-dot 1.2s infinite 0s;"></div>
        <div class="dot2" style="width:8px;height:8px;background:#b8f700;animation:pulse-dot 1.2s infinite 0.2s;"></div>
        <div class="dot3" style="width:8px;height:8px;background:#b8f700;animation:pulse-dot 1.2s infinite 0.4s;"></div>
      </div>
      <div style="font-size:9px;color:#555;letter-spacing:1.5px;max-width:300px;line-height:1.6;">
        ▸ Cargando React y Babel<br/>
        ▸ Compilando ~10 componentes JSX<br/>
        ▸ Conectando con Airtable
      </div>
      <div style="font-size:8px;color:#444;margin-top:24px;letter-spacing:1px;">
        Si esto tarda más de 10 segundos · F12 → Console
      </div>
    </div>
    <style>
      @keyframes pulse-dot { 0%,100%{opacity:0.2}50%{opacity:1} }
      @keyframes toast-slide-in { from{transform:translateX(20px);opacity:0}to{transform:translateX(0);opacity:1} }
    </style>
  `;
})();

// Expose
Object.assign(window, { ToastContainer, useToasts });
