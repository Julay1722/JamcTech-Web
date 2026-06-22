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
  cuentas: [], prestamos: [], inversores: [], cuotas: [], contrapartes: [], pagosProgramados: [],
};

export function DataProvider({ children }) {
  const [state, setState] = useState({ ...EMPTY, loading: true, error: null });

  // refreshAll({ initial }): solo la PRIMERA carga muestra el skeleton "Cargando".
  // Los refrescos tras guardar un form actualizan los datos EN SITIO, sin poner
  // loading=true → la página no se desmonta ni se reinicia al sub-tab por defecto
  // (así se pueden hacer varios cambios seguidos en un mismo apartado).
  const refreshAll = useCallback(async (opts = {}) => {
    if (opts.initial) setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const data = await loadAll();
      setState((s) => ({ ...s, ...data, loading: false, error: null }));
    } catch (e) {
      console.error('[useData] carga falló:', e);
      setState((s) => ({ ...s, loading: false, error: e.message || String(e) }));
    }
  }, []);

  useEffect(() => { refreshAll({ initial: true }); }, [refreshAll]);

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
