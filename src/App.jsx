// Shell de la app — sidebar, tabs, period filter, logout.
// Las páginas se montan según la pestaña activa (5 tabs, igual que el monolito).
import { useState, useEffect } from 'react';
import { auth } from './lib/supabase.js';
import { useData } from './hooks/useData.jsx';
import PeriodFilter from './components/PeriodFilter.jsx';
import OverviewPage from './pages/Overview.jsx';
import AlertasPage from './pages/Alertas.jsx';
import VentasPage from './pages/Ventas.jsx';
import InventarioPage from './pages/Inventario.jsx';
import FinanzasPage from './pages/Finanzas.jsx';
import LibroPage from './pages/Libro.jsx';

function fmtDate(iso) {
  if (!iso) return '';
  const [y, m, d] = String(iso).slice(0, 10).split('-');
  return `${d}/${m}/${y}`;
}

export default function App() {
  const data = useData();
  const [page, setPage] = useState('overview');
  const [period, setPeriod] = useState('todo');
  const [customRange, setCustomRange] = useState({ from: '', to: '' });
  const [navCollapsed, setNavCollapsed] = useState(() => localStorage.getItem('nav-collapsed') === '1');
  useEffect(() => { localStorage.setItem('nav-collapsed', navCollapsed ? '1' : '0'); }, [navCollapsed]);

  const alertCount = data.alertCount || 0;
  const pages = [
    { id: 'overview',   label: 'Resumen',    icon: '◉', badge: null },
    { id: 'alertas',    label: 'Alertas',    icon: '!', badge: alertCount, badgeColor: 'var(--danger)' },
    { id: 'ventas',     label: 'Ventas',     icon: '$', badge: (data.ventas || []).length },
    { id: 'inventario', label: 'Inventario', icon: '▤', badge: (data.skus || []).length },
    { id: 'finanzas',   label: 'Finanzas',   icon: '∮', badge: null },
    { id: 'libro',      label: 'Libro',      icon: '≣', badge: (data.movimientos || []).length },
  ];
  const showPeriod = ['overview', 'ventas', 'libro'].includes(page);
  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className={`app ${navCollapsed ? 'collapsed' : ''}`}>
      <aside className="nav" style={{ width: navCollapsed ? 56 : 224, minWidth: navCollapsed ? 56 : 224, maxWidth: navCollapsed ? 56 : 224, flex: `0 0 ${navCollapsed ? 56 : 224}px` }}>
        <button className="nav-toggle" title={navCollapsed ? 'Expandir' : 'Colapsar'} onClick={() => setNavCollapsed((c) => !c)}>
          {navCollapsed ? '›' : '‹'}
        </button>
        <div className="brand">
          <div className="brand-mark">J</div>
          <div>
            <div className="brand-text">JAMC.TECH</div>
            <div className="brand-sub">v3 · Supabase</div>
          </div>
        </div>

        <div className="nav-section-label">General</div>
        {pages.map((p) => (
          <div key={p.id} className={`nav-item ${page === p.id ? 'active' : ''}`} onClick={() => setPage(p.id)}>
            <span className="nav-item-icon" style={p.badgeColor ? { color: p.badgeColor } : undefined}>{p.icon}</span>
            <span>{p.label}</span>
            {p.badge != null && p.badge > 0 && (
              <span className="nav-item-badge" style={p.badgeColor ? { background: p.badgeColor + '22', color: p.badgeColor } : undefined}>{p.badge}</span>
            )}
          </div>
        ))}

        <div className="nav-section-label">Sistema</div>
        <div className="nav-item" onClick={() => data.refreshAll?.()}>
          <span className="nav-item-icon">↻</span>
          <span>Sincronizar</span>
        </div>

        <div style={{ marginTop: 'auto', padding: 'var(--s-3)', fontSize: 11, color: 'var(--text-4)' }}>
          <div>Build v3.0</div>
          <div>{fmtDate(today)} · Supabase ✓</div>
          <button className="btn ghost" onClick={() => auth.signOut()} style={{ marginTop: 8, fontSize: 11, padding: '4px 10px' }}>
            ⎋ Salir
          </button>
        </div>
      </aside>

      <main className="main">
        {showPeriod ? (
          <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', position: 'sticky', top: 0, zIndex: 50, background: 'var(--bg)', padding: '10px 0', marginLeft: 'calc(-1 * var(--s-6))', marginRight: 'calc(-1 * var(--s-6))', paddingLeft: 'var(--s-6)', paddingRight: 'var(--s-6)', marginBottom: 'var(--s-4)', borderBottom: '1px solid var(--border)' }}>
            <PeriodFilter value={period} onChange={setPeriod} custom={customRange} onCustom={setCustomRange} />
          </div>
        ) : <div style={{ paddingTop: 'var(--s-5)' }} />}

        {data.loading && <div className="empty"><span className="loader" /> Cargando datos…</div>}
        {data.error && <div className="empty" style={{ color: 'var(--danger)' }}>Error cargando: {data.error}</div>}

        {!data.loading && (<>
          {page === 'overview'   && <OverviewPage period={period} customRange={customRange} />}
          {page === 'alertas'    && <AlertasPage />}
          {page === 'ventas'     && <VentasPage period={period} customRange={customRange} />}
          {page === 'inventario' && <InventarioPage />}
          {page === 'finanzas'   && <FinanzasPage onNavigate={setPage} />}
          {page === 'libro'      && <LibroPage period={period} customRange={customRange} onNavigate={setPage} />}
        </>)}
      </main>
    </div>
  );
}
