// ════════════════════════════════════════════════════════════════
// session-ledger.jsx
//
// A tiny session-scoped store that holds operations performed in
// the current browser session — sales, lot purchases, loan payments,
// etc. — so they can ripple across panels without an Airtable round-trip.
//
// Why this exists:
//   The other panels (INVENTARIO, CASHFLOW, FINANC, etc.) read from
//   static mock arrays in data.js. Operations the user registers in
//   one panel (e.g. "register a sale" in VENTAS) need to be visible
//   in OTHER panels (inventory should drop, cashflow should grow).
//   This ledger is the single source of truth for those session deltas.
//
// Event shape:
//   { id, fecha, tipo, ...specific fields }
//   tipo ∈ 'venta' | 'lote_compra' | 'prestamo_pago' | 'credito_cargo' |
//          'credito_pago' | 'inversor_pago' | 'banco_mov' | 'cf_mov'
//
// Subscribe with useSessionEvents() to re-render on changes.
// Each panel can also derive specific views:
//   useStockDeltaBySKU()  → { skuId: deltaQty }   (sales reduce stock)
//   useCFExtras()         → array of CF rows (synthesized from events)
// ════════════════════════════════════════════════════════════════

(function () {
  if (window.__SESSION_LEDGER__) return; // hot-reload safe

  const events = [];
  const subs = new Set();
  let counter = 0;

  function notify() {
    subs.forEach((fn) => fn(counter));
  }

  function addEvent(ev) {
    const id = ev.id || `sess-${++counter}-${Date.now()}`;
    const stamped = { id, ...ev, _ts: Date.now() };
    events.unshift(stamped); // newest first
    notify();
    return stamped;
  }

  function removeEvent(id) {
    const idx = events.findIndex((e) => e.id === id);
    if (idx < 0) return false;
    events.splice(idx, 1);
    notify();
    return true;
  }

  function updateEvent(id, patch) {
    const idx = events.findIndex((e) => e.id === id);
    if (idx < 0) return false;
    events[idx] = { ...events[idx], ...patch, _ts: Date.now() };
    notify();
    return true;
  }

  function clearEvents() {
    events.length = 0;
    notify();
  }

  function getEvents(filter) {
    return filter ? events.filter(filter) : events.slice();
  }

  function subscribe(fn) {
    subs.add(fn);
    return () => subs.delete(fn);
  }

  window.__SESSION_LEDGER__ = {
    addEvent, removeEvent, updateEvent, clearEvents, getEvents, subscribe,
  };
})();

// ── React hook: re-renders when ledger changes ─────────────────
function useSessionEvents(filter) {
  const [, force] = React.useState(0);
  React.useEffect(() => {
    return window.__SESSION_LEDGER__.subscribe(() => force((n) => n + 1));
  }, []);
  return window.__SESSION_LEDGER__.getEvents(filter);
}

// ── Derived: stock delta per SKU from venta + ajuste + lote events ──
//   { 'C00001': -2, 'C00018': +5 }
//   ventas use -qty per linea; ajustes use raw delta; lote_recibido use +qty per linea
function useStockDeltaBySKU() {
  const evs = useSessionEvents((e) => e.tipo === 'venta' || e.tipo === 'ajuste_stock' || e.tipo === 'lote_recibido');
  const delta = {};
  evs.forEach((e) => {
    if (e.tipo === 'venta') {
      if (Array.isArray(e.lineas) && e.lineas.length > 0) {
        e.lineas.forEach((l) => {
          if (l.skuId) delta[l.skuId] = (delta[l.skuId] || 0) - (l.qty || 0);
        });
      } else if (e.skuId) {
        delta[e.skuId] = (delta[e.skuId] || 0) - (e.qty || 0);
      }
    } else if (e.tipo === 'ajuste_stock' && e.skuId) {
      delta[e.skuId] = (delta[e.skuId] || 0) + (e.delta || 0);
    } else if (e.tipo === 'lote_recibido' && Array.isArray(e.lineas)) {
      e.lineas.forEach((l) => {
        if (l.skuId) delta[l.skuId] = (delta[l.skuId] || 0) + (l.qty || 0);
      });
    }
  });
  return delta;
}

// ── Derived: CF entries synthesized from session events ─────────
//   Produces rows in the same shape as CF_ALL (f, c, a, e, s)
//   so they can be appended/merged into the cash-flow table.
function useSessionCF() {
  const evs = useSessionEvents();
  const rows = [];
  evs.forEach((e) => {
    if (e.tipo === 'venta') {
      // Sum across lineas if present, fallback to single-SKU precioTotal.
      const total = e.precioFacturadoTotal != null ? e.precioFacturadoTotal
        : (e.precioTotal != null ? e.precioTotal : 0);
      const itemCount = Array.isArray(e.lineas) && e.lineas.length > 0
        ? e.lineas.reduce((s, l) => s + (l.qty || 0), 0)
        : (e.qty || 0);
      const description = Array.isArray(e.lineas) && e.lineas.length > 1
        ? `${e.lineas.length} SKUs · ${itemCount} ud`
        : (e.lineas?.[0]?.skuNombre || e.skuNombre || '');
      rows.push({
        f: e.fecha,
        c: 'Venta de mercancia',
        a: e.cuentaNombre || e.canal || 'Facebook',
        e: total,
        s: 0,
        cuentaId: e.cuentaId,
        _src: 'sesión · venta',
        _desc: description,
        _evId: e.id,
      });
    } else if (e.tipo === 'cf_mov') {
      rows.push({
        f: e.fecha, c: e.categoria, a: e.cuenta || '',
        e: e.entrada || 0, s: e.salida || 0,
        cuentaId: e.cuentaId,
        _src: e.src || 'sesión · cf manual',
        _evId: e.id,
      });
    }
    // Add others (loan payment, lot purchase) as those forms get wired
  });
  return rows;
}

Object.assign(window, { useSessionEvents, useStockDeltaBySKU, useSessionCF });

// ── Airtable subscription hook ──────────────────────────────────
// Re-renderiza el componente cuando una tabla específica termina de cargar
// desde Airtable. Retorna { loaded, count, error } para que el caller
// pueda mostrar el estado de la fuente de datos.
function useAirtableTable(table) {
  const [state, setState] = React.useState(() => {
    const data = window.__AIRTABLE_DATA__ || {};
    return {
      loaded: !!data[table],
      count: data[table]?.length || 0,
      error: data[table + 'Error'] || null,
    };
  });
  React.useEffect(() => {
    const onLoad = (e) => {
      if (e.detail?.table !== table) return;
      setState({ loaded: true, count: e.detail.count, error: null });
    };
    const onErr = (e) => {
      if (e.detail?.table !== table) return;
      setState({ loaded: false, count: 0, error: e.detail.error });
    };
    window.addEventListener('airtable-loaded', onLoad);
    window.addEventListener('airtable-error', onErr);
    return () => {
      window.removeEventListener('airtable-loaded', onLoad);
      window.removeEventListener('airtable-error', onErr);
    };
  }, [table]);
  return state;
}

Object.assign(window, { useAirtableTable });
