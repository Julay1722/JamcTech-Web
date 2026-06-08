// Bootstrap — auth gate + providers. La app NO se monta sin sesión válida.
import { StrictMode, useState, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import './styles/theme.css';
import { auth } from './lib/supabase.js';
import { ToastProvider } from './components/Toast.jsx';
import { DataProvider } from './hooks/useData.jsx';
import LoginScreen from './components/LoginScreen.jsx';
import App from './App.jsx';

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

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ToastProvider>
      <Root />
    </ToastProvider>
  </StrictMode>
);
