// ════════════════════════════════════════════════════════════════
// useData — contexto central de datos (reemplaza window.__AIRTABLE_DATA__).
// Los componentes consumen los datos vía este hook, nunca vía globals.
//
// FASE 2: estructura + estado de carga. Los loaders reales se conectan en
// FASE 3 (src/lib/db/*). Por ahora expone arrays vacíos y loading=false tras
// el primer ciclo para que el shell se monte y navegue.
// ════════════════════════════════════════════════════════════════
import { createContext, useContext, useState, useEffect, useCallback } from 'react';

const DataCtx = createContext(null);

const EMPTY = {
  skus: [], ventas: [], lotes: [], entradas: [], movimientos: [],
  cuentas: [], prestamos: [], inversores: [], cuotas: [], compensaciones: [],
  saldoCuentas: [], saldoPrestamos: [], saldoInversores: [], stock: [],
};

export function DataProvider({ children }) {
  const [state, setState] = useState({ ...EMPTY, loading: true, error: null });

  const refreshAll = useCallback(async () => {
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      // FASE 3: aquí se llaman los loaders reales y se arma el estado.
      // Placeholder por ahora.
      setState((s) => ({ ...s, loading: false }));
    } catch (e) {
      setState((s) => ({ ...s, loading: false, error: e.message }));
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
