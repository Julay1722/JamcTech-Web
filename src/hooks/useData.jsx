// ════════════════════════════════════════════════════════════════
// useData — contexto central de datos (reemplaza window.__AIRTABLE_DATA__).
// Los componentes consumen los datos vía este hook, nunca vía globals.
// Carga todo tras login (DataProvider se monta solo con sesión válida).
// ════════════════════════════════════════════════════════════════
import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { loadAll } from '../lib/db/loaders.js';

const DataCtx = createContext(null);

const EMPTY = {
  skus: [], ventas: [], lotes: [], movimientos: [],
  cuentas: [], prestamos: [], inversores: [], cuotas: [], contrapartes: [],
};

export function DataProvider({ children }) {
  const [state, setState] = useState({ ...EMPTY, loading: true, error: null });

  const refreshAll = useCallback(async () => {
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const data = await loadAll();
      setState({ ...data, loading: false, error: null });
    } catch (e) {
      console.error('[useData] carga falló:', e);
      setState((s) => ({ ...s, loading: false, error: e.message || String(e) }));
    }
  }, []);

  useEffect(() => { refreshAll(); }, [refreshAll]);

  const alertCount = (state.skus || []).filter((s) => s.estado === 'critico').length;

  return (
    <DataCtx.Provider value={{ ...state, alertCount, refreshAll }}>
      {children}
    </DataCtx.Provider>
  );
}

export function useData() {
  const ctx = useContext(DataCtx);
  if (!ctx) throw new Error('useData fuera de DataProvider');
  return ctx;
}
