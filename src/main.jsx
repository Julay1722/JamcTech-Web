// Bootstrap — auth gate + providers. La app NO se monta sin sesión válida.
import { StrictMode, useState, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import './styles/theme.css';
import { auth } from './lib/supabase.js';
import { ToastProvider } from './components/Toast.jsx';
import { DataProvider } from './hooks/useData.jsx';
import LoginScreen from './components/LoginScreen.jsx';
import App from './App.jsx';

// Tema Aurora: aplica el tema guardado (o el del sistema la 1ra vez) ANTES de
// montar, para que no haya flash. El toggle (en App) actualiza esto en vivo.
(function initTheme() {
  try {
    const saved = localStorage.getItem('jamc_theme');
    const theme = saved || (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    document.documentElement.setAttribute('data-theme', theme);
  } catch { document.documentElement.setAttribute('data-theme', 'light'); }
})();

function Root() {
  const [authState, setAuthState] = useState('loading'); // 'loading' | 'out' | sessionObj

  useEffect(() => {
    let mounted = true;
    auth.getSession().then(({ data }) => {
      if (mounted) setAuthState(data.session || 'out');
    }).catch(() => mounted && setAuthState('out'));
    const { data: sub } = auth.onAuthChange((session) => {
      if (mounted) setAuthState(session || 'out');
    });
    return () => { mounted = false; sub?.subscription?.unsubscribe?.(); };
  }, []);

  if (authState === 'loading') {
    return <div className="center-screen" style={{ color: 'var(--text-3)' }}>Cargando…</div>;
  }
  if (authState === 'out') return <LoginScreen />;

  return (
    <DataProvider>
      <App />
    </DataProvider>
  );
}

// Guard contra HMR: reusar el root si ya existe (evita el warning de
// createRoot duplicado al recargar el módulo en dev).
const container = document.getElementById('root');
const root = (container._root ||= createRoot(container));
root.render(
  <StrictMode>
    <ToastProvider>
      <Root />
    </ToastProvider>
  </StrictMode>
);
