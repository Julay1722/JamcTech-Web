// ════════════════════════════════════════════════════════════════
// panel-fin-productos.jsx
//
// Unified CRUD panels for the four financial product categories:
//   · Líneas de Crédito   (currently: BHD)
//   · Préstamos           (currently: Cooperativa)
//   · Inversores          (currently: Andrea Correa)
//   · Cuentas de Banco    (mock 3 items — extend with Supabase)
//
// All four share the same pattern, driven by a config:
//   §01 LISTA       — selectable rows + KPIs + CREAR NUEVO
//   §02 DETALLE     — header + sub-tabs:
//                       a) MOVIMIENTOS · historial completo + edit/delete row
//                       b) NUEVO MOV.  · registrar movimiento del tipo correcto
//                       c) PARÁMETROS  · editar propiedades base + eliminar item
//
// Session-only state: edits don't persist past reload.
// Replace mutations with Supabase writes once the wiring is live.
// ════════════════════════════════════════════════════════════════

// ── Seed data: derive arrays from singletons in data.js, plus new banks ──
const PRESTAMOS_SEED = [{
  id: 'FIN-001',
  nombre: COOP.nombre,
  tipoSub: 'Cooperativa',
  fechaInicio: COOP.inicio,
  monto: COOP.monto,
  saldo: COOP.saldo,
  pagado: COOP.pagado,
  tasa: COOP.tasa,
  cuota: COOP.cuota,
  seguro: COOP.seguro,
  abonoMin5pct: COOP.abonoMin5pct,
  abonoAcum: COOP.abonoAcum,
  nota: 'Préstamo personal a 36 meses · garantía aportes.',
  movimientos: COOP.pagos.map((p, i) => ({
    id: `mov-coop-${i+1}`,
    fecha: monthToISO(p.mes),
    tipo: 'cuota',
    monto: p.total,
    capital: p.capital,
    interes: p.interes,
    seguro: p.seguro,
    abono: p.abono || 0,
    nota: p.nota,
  })),
}];

const INVERSORES_SEED = [{
  id: 'FIN-002',
  nombre: ANDREA.nombre,
  tipoSub: 'Inversor 2×',
  fechaInicio: ANDREA.inicio,
  aporte: ANDREA.aporte,
  retorno: ANDREA.retorno,
  pagado: ANDREA.pagado,
  pendiente: ANDREA.pendiente,
  meta: 48, // meses
  nota: 'Acuerdo verbal · retorno 100% en ~4 años.',
  movimientos: ANDREA.pagos.map((p, i) => ({
    id: `mov-and-${i+1}`,
    fecha: monthToISO(p.mes),
    tipo: 'pago',
    monto: p.monto,
    nota: '',
  })),
}];

const CREDITOS_SEED = [{
  id: 'FIN-003',
  nombre: BHD.nombre,
  tipoSub: 'Línea Revolvente',
  moneda: 'DOP',
  fechaInicio: '2026-02-14',
  limite: BHD.limite,
  usado: BHD.usado,
  tasaAnual: BHD.tasaAnual,
  tasaMensual: BHD.tasaMensual,
  nota: BHD.nota,
  movimientos: [
    {
      id: 'mov-bhd-1',
      fecha: '2026-05-17',
      tipo: 'cargo',
      categoria: 'disposicion',
      monto: BHD.usado,
      comision: 537.50,
      nota: 'Compra Alibaba · comisión del banco al desembolsar',
    },
  ],
}, {
  id: 'FIN-004',
  nombre: 'Popular Visa Platinum · 4421',
  tipoSub: 'Tarjeta de Crédito',
  moneda: 'DOP',
  fechaInicio: '2024-08-15',
  limite: 80000,
  usado: 18450,
  tasaAnual: 59.95,
  tasaMensual: 59.95 / 12,
  diaCorte: 25,
  diasPago: 20,
  pagoMinPct: 5,
  nota: 'Tarjeta personal usada para gastos operativos pequeños · paga al corte cuando hay flujo.',
  movimientos: [
    { id:'mov-tj-1', fecha:'2026-05-18', tipo:'cargo', categoria:'compra',      monto:3200,  nota:'Compra Office Depot · facturas' },
    { id:'mov-tj-2', fecha:'2026-05-10', tipo:'cargo', categoria:'compra',      monto:1850,  nota:'Combustible mes' },
    { id:'mov-tj-3', fecha:'2026-04-25', tipo:'pago',                            monto:9400,  comision:50, nota:'Pago al corte abril · + Tax 50' },
    { id:'mov-tj-4', fecha:'2026-04-10', tipo:'cargo', categoria:'compra',      monto:4200,  nota:'Reparación PC' },
    { id:'mov-tj-5', fecha:'2026-03-25', tipo:'cargo', categoria:'interes',     monto:280,   nota:'Interés saldo financiado' },
  ],
}, {
  id: 'FIN-005',
  nombre: 'Chase Sapphire · 8821',
  tipoSub: 'Tarjeta de Crédito',
  moneda: 'USD',
  fechaInicio: '2025-03-20',
  limite: 5000,
  usado: 842.50,
  tasaAnual: 24.99,
  tasaMensual: 24.99 / 12,
  diaCorte: 12,
  diasPago: 21,
  pagoMinPct: 3,
  nota: 'Tarjeta USD para compras Amazon US, AliExpress USD y suscripciones SaaS · paga full antes del corte.',
  movimientos: [
    { id:'mov-ch-1', fecha:'2026-05-15', tipo:'cargo', categoria:'compra',     monto:189.99, nota:'AliExpress · lote inventario' },
    { id:'mov-ch-2', fecha:'2026-05-08', tipo:'cargo', categoria:'compra',     monto:42.50,  nota:'Notion + Figma' },
    { id:'mov-ch-3', fecha:'2026-04-12', tipo:'pago',                           monto:610.01, comision:1.50, nota:'Pago al corte abril · + Tax 1.50' },
    { id:'mov-ch-4', fecha:'2026-04-03', tipo:'cargo', categoria:'compra',     monto:610.01, nota:'Amazon US · herramientas' },
  ],
}];

const BANCOS_SEED = [
  {
    id: 'BNK-001',
    nombre: 'BHD Cuenta Corriente · 9421',
    tipoSub: 'Corriente DOP',
    fechaInicio: '2024-01-15',
    saldo: 142500,
    moneda: 'DOP',
    nota: 'Cuenta operativa · entradas de ventas, pagos a proveedores y servicios.',
    movimientos: [
      { id:'mov-bnk1-1', fecha:'2026-05-20', tipo:'deposito',    monto:6450,  nota:'Ventas semana 20' },
      { id:'mov-bnk1-2', fecha:'2026-05-19', tipo:'retiro',      monto:4006,  nota:'Cuota COOP abril' },
      { id:'mov-bnk1-3', fecha:'2026-05-17', tipo:'transferencia',monto:68660, nota:'Disposición BHD → Alibaba' },
      { id:'mov-bnk1-4', fecha:'2026-05-13', tipo:'deposito',    monto:4600,  nota:'Venta Facebook' },
    ],
  },
  {
    id: 'BNK-002',
    nombre: 'Popular Ahorros · 7733',
    tipoSub: 'Ahorros DOP',
    fechaInicio: '2024-06-01',
    saldo: 28000,
    moneda: 'DOP',
    nota: 'Reserva imprevistos · objetivo 60 días de gastos.',
    movimientos: [
      { id:'mov-bnk2-1', fecha:'2026-03-01', tipo:'deposito', monto:5000, nota:'Aporte mensual reserva' },
      { id:'mov-bnk2-2', fecha:'2026-04-01', tipo:'deposito', monto:5000, nota:'Aporte mensual reserva' },
    ],
  },
  {
    id: 'BNK-003',
    nombre: 'PayPal Business',
    tipoSub: 'Digital USD',
    fechaInicio: '2025-09-10',
    saldo: 412.55,
    moneda: 'USD',
    nota: 'Cobros internacionales · convierte a DOP al transferir.',
    movimientos: [
      { id:'mov-bnk3-1', fecha:'2026-04-22', tipo:'deposito', monto:120,  nota:'Cliente USA' },
      { id:'mov-bnk3-2', fecha:'2026-04-29', tipo:'comision', monto:6.50, nota:'Fee PayPal' },
    ],
  },
];

// ────────────────────────────────────────────────────────────────
// Bank-account picker helpers
// ────────────────────────────────────────────────────────────────
// Used by every form that generates a CF entry — the user picks which
// bank account the money flows from/to. Single source of truth for
// the dropdown options across panels.

function bancosOpts(monedaFilter) {
  return BANCOS_SEED
    .filter((b) => !monedaFilter || b.moneda === monedaFilter)
    .map((b) => ({
      value: b.id,
      label: `${b.nombre} · ${b.tipoSub}`,
    }));
}
function findBancoNombre(id) {
  const b = BANCOS_SEED.find((x) => x.id === id);
  return b ? b.nombre : '';
}
// Resolve session-level overlay delta for a given bank
// (sum of CF entries linked to this account from OTHER products + ventas that
//  named this bank as destination — ventas live as 'venta' events, not 'cf_mov',
//  so they need explicit handling here).
function bancoOverlayDelta(bancoId, sessionEvents) {
  let delta = 0;
  sessionEvents.forEach((e) => {
    if (e.tipo === 'cf_mov' && e.cuentaId === bancoId && e.linkedProduct !== bancoId) {
      delta += (e.entrada || 0) - (e.salida || 0);
    } else if (e.tipo === 'venta' && e.cuentaId === bancoId) {
      delta += e.precioTotal || 0;
    }
  });
  return delta;
}

Object.assign(window, { bancosOpts, findBancoNombre, bancoOverlayDelta, BANCOS_SEED });

// Local KV card (panel-financiero.jsx defines one too; Babel scripts don't share scope)
function FinKV({ label, value, color }) {
  const T = useTheme();
  return (
    <div style={{ background: T.panel2, border: `1px solid ${T.bd}`, padding: '8px 10px' }}>
      <div style={{ fontSize: 9, color: T.t3, letterSpacing: '0.12em' }}>▸ {label.toUpperCase()}</div>
      <div style={{ fontSize: 13, color: color || T.t, marginTop: 3, fontWeight: 500 }}>{value}</div>
    </div>
  );
}

// Resolve polymorphic configs that can vary by current item/values
function resolveMovTipos(cfg, item) {
  return typeof cfg.movTipos === 'function' ? cfg.movTipos(item) : cfg.movTipos;
}
function resolveParamFields(cfg, values) {
  const fields = typeof cfg.paramFields === 'function' ? cfg.paramFields(values) : cfg.paramFields;
  return fields.filter((f) => !f.showIf || f.showIf(values || {}));
}
function resolveDetailKpis(cfg, item) {
  return typeof cfg.detailKpis === 'function' ? cfg.detailKpis(item) : cfg.detailKpis;
}

// Currency-aware formatter. Defaults to DOP/RD$ to match the global `fmt`.
//   fmtCur(1234, 'DOP') → "RD$1,234"
//   fmtCur(1234.5, 'USD') → "$1,234.50"
function fmtCur(n, moneda) {
  const v = typeof n === 'number' ? n : (parseFloat(n) || 0);
  if (moneda === 'USD') {
    return '$' + v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  if (moneda === 'EUR') {
    return '€' + v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  return 'RD$' + Math.round(v).toLocaleString('es-DO');
}
// Currency symbol shortcut for labels ("Límite RD$" vs "Límite $")
function curSym(moneda) {
  return moneda === 'USD' ? '$' : moneda === 'EUR' ? '€' : 'RD$';
}

// "May 2026" → "2026-05-15" (mid-month default)
function monthToISO(label) {
  if (!label) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(label)) return label;
  const M = { Ene:'01', Feb:'02', Mar:'03', Abr:'04', May:'05', Jun:'06',
              Jul:'07', Ago:'08', Sep:'09', Oct:'10', Nov:'11', Dic:'12' };
  const m = label.match(/^(\w{3})\s+(\d{4})/);
  if (!m) return '';
  return `${m[2]}-${M[m[1]] || '01'}-15`;
}

// Spanish short month label
function fechaToMes(iso) {
  const M = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return `${M[d.getMonth()]} ${d.getFullYear()}`;
}

// ────────────────────────────────────────────────────────────────
// Generic product panel
// ────────────────────────────────────────────────────────────────

function FinProductoPanel({ cfg }) {
  const T = useTheme();
  const [items, setItems] = React.useState(cfg.items);
  const sessionEvents = useSessionEvents();

  // Subscribe to Supabase productos: when window.__AIRTABLE_DATA__.productos[idPrefix]
  // is available, replace mock seeds with real records.
  React.useEffect(() => {
    const tryLoad = () => {
      const prods = window.__AIRTABLE_DATA__?.productos?.[cfg.idPrefix];
      if (prods && prods.length > 0) {
        setItems(prods);
      }
    };
    tryLoad();
    const onLoad = (e) => { if (e.detail?.table === 'productos') tryLoad(); };
    window.addEventListener('airtable-loaded', onLoad);
    return () => window.removeEventListener('airtable-loaded', onLoad);
  }, [cfg.idPrefix]);

  // Publish current state to a global so other panels (MANDO KPIs) can read it.
  React.useEffect(() => {
    if (!window.__PRODUCT_STATE__) window.__PRODUCT_STATE__ = {};
    window.__PRODUCT_STATE__[cfg.idPrefix] = items;
    window.dispatchEvent(new CustomEvent('product-state-update', { detail: { idPrefix: cfg.idPrefix } }));
  }, [items, cfg.idPrefix]);
  // Optional overlay: e.g. bank accounts apply CF entries linked from OTHER products
  // so their saldo reflects ventas, cuotas, lote purchases, etc. registered elsewhere.
  const displayItems = React.useMemo(() => {
    if (!cfg.overlay) return items;
    return items.map((i) => cfg.overlay(i, sessionEvents));
  }, [items, sessionEvents, cfg]);
  const [sel, setSel] = React.useState(items[0]?.id || null);
  const [sub, setSub] = React.useState('movimientos');
  const [creating, setCreating] = React.useState(false);
  const [flash, setFlash] = React.useState(null);

  // Re-anchor selection if it goes missing
  React.useEffect(() => {
    if (items.length > 0 && !items.find((i) => i.id === sel)) {
      setSel(items[0].id);
    }
  }, [items, sel]);

  const item = displayItems.find((i) => i.id === sel) || null;

  const patchItem = (id, patch) => {
    setItems((arr) => arr.map((i) => i.id === id ? { ...i, ...patch } : i));
  };
  // Mapping cfg.idPrefix + mov.tipo → MovFin Supabase singleSelect.
  // §8.2 · cuando hay match, el movimiento se persiste en MovimientosFinancieros
  // además del cashflow + update del producto.
  const MOVFIN_TIPO_MAP = {
    'FIN-P_cuota':       'Cuota Préstamo',
    'FIN-I_pago':        'Retorno Inversor',
    'FIN-LC_cargo':      'Cargo Línea',
    'FIN-LC_pago':       'Pago Línea',
    'FIN-LC_disposicion':'Disposición Línea',
  };

  const addMovimiento = (id, mov) => {
    const movId = `mov-${id}-${Date.now()}`;
    setItems((arr) => arr.map((i) => {
      if (i.id !== id) return i;
      const newMov = { ...mov, id: movId };
      const movs = [newMov, ...i.movimientos];
      // Recompute aggregates based on cfg.applyMov
      const next = cfg.applyMov ? cfg.applyMov({ ...i }, newMov, +1) : i;
      return { ...next, movimientos: movs };
    }));
    // §8.2 · Persiste el movimiento en MovimientosFinancieros (tabla nueva)
    const itLocal = items.find((i) => i.id === id);
    if (itLocal) {
      const mappedTipo = MOVFIN_TIPO_MAP[cfg.idPrefix + '_' + mov.tipo];
      if (mappedTipo && window.AT_CLIENT?.createMovFin && itLocal._airtableId) {
        // Monto = principal del movimiento (independiente de Capital/Interés/Seguro/Mora/Comisión).
        // Para Cuota Préstamo: monto = capital + interés + seguro + mora + abono (calculado en totalFrom).
        // Para Cargo/Pago Línea: monto = lo que el usuario puso en mov.monto.
        // Para Disposición / Retorno Inversor / Abono / Otro: monto solo.
        window.AT_CLIENT.createMovFin({
          tipo: mappedTipo,
          fecha: mov.fecha,
          monto: mov.monto,
          productoFinAirtableId: itLocal._airtableId,
          cuentaBanco: mov.cuentaId ? (window.findBancoNombre ? window.findBancoNombre(mov.cuentaId) : mov.cuentaId) : '',
          capital:  mov.capital,
          interes:  mov.interes,
          seguro:   mov.seguro,
          comision: mov.comision,   // Cargo/Pago Línea
          mora:     mov.mora,       // Cuota Préstamo (manual · default 0)
          notas:    mov.nota || '',
        }).catch((e) => {
          console.warn(`[FINANC·MovFin] falló:`, e.message);
          window.toastErr?.(`${cfg.label} · MovFin`, `No se sincronizó: ${e.message.slice(0, 80)}`);
        });
      }
    }
    // Post linked cashflow entries to the session ledger so they appear in
    // MANDO §09 and CASHFLOW §05 (each tagged with linkedMovId for cleanup on delete)
    if (cfg.cfEntries) {
      const it = items.find((i) => i.id === id);
      if (it) {
        const rows = cfg.cfEntries(it, { ...mov, id: movId });
        rows.forEach((row) => {
          window.__SESSION_LEDGER__.addEvent({
            tipo: 'cf_mov',
            linkedProduct: it.id,
            linkedMovId: movId,
            src: `sesión · ${cfg.label.toLowerCase()}`,
            ...row,
          });
          // ─── Persist a Supabase en paralelo (no bloquea la UI) ───
          if (window.AT_CLIENT?.create && window.AT?.fields?.cashflow) {
            const F = window.AT.fields.cashflow;
            window.AT_CLIENT.create('cashflow', {
              [F.fecha]:    row.fecha,
              [F.cuenta]:   row.categoria,
              [F.auxiliar]: row.cuenta || '',
              [F.entrada]:  row.entrada || 0,
              [F.salida]:   row.salida || 0,
            }).catch((e) => {
              console.warn(`[FINANC·${cfg.label}] Supabase CF falló:`, e.message);
              window.toastErr?.(`${cfg.label} · CF`, `No se sincronizó: ${e.message.slice(0, 80)}`);
            });
          }
        });
        // ─── Persist balance update a Supabase (financiero) ───
        if (window.AT_CLIENT?.update && it._airtableId) {
          const next = cfg.applyMov ? cfg.applyMov({ ...it }, { ...mov, id: movId }, +1) : it;
          if (next && window.AT?.fields?.financiero) {
            const F = window.AT.fields.financiero;
            const updateFields = {};
            if (next.totalPagado != null && F.totalPagado) updateFields[F.totalPagado] = next.totalPagado;
            if (next.balancePendiente != null && F.balancePendiente) updateFields[F.balancePendiente] = next.balancePendiente;
            if (Object.keys(updateFields).length > 0) {
              window.AT_CLIENT.update('financiero', it._airtableId, updateFields)
                .catch((e) => {
                  console.warn(`[FINANC·${cfg.label}] update falló:`, e.message);
                  window.toastWarn?.(`${cfg.label} · update`, `Saldo local actualizado, no sincronizado: ${e.message.slice(0, 80)}`);
                });
            }
          }
        }
      }
    }
  };
  const removeMovimiento = (id, movId) => {
    setItems((arr) => arr.map((i) => {
      if (i.id !== id) return i;
      const target = i.movimientos.find((m) => m.id === movId);
      if (!target) return i;
      const movs = i.movimientos.filter((m) => m.id !== movId);
      const next = cfg.applyMov ? cfg.applyMov({ ...i }, target, -1) : i;
      return { ...next, movimientos: movs };
    }));
    // Cleanup any session-ledger events linked to this movement
    const linked = window.__SESSION_LEDGER__.getEvents((e) => e.linkedMovId === movId);
    linked.forEach((e) => window.__SESSION_LEDGER__.removeEvent(e.id));
  };
  const removeItem = (id) => {
    setItems((arr) => arr.filter((i) => i.id !== id));
    setFlash({ msg: `${cfg.label} eliminado` });
    setTimeout(() => setFlash(null), 4000);
  };
  const addItem = (data) => {
    const id = `${cfg.idPrefix}-${String(items.length + 1).padStart(3, '0')}`;
    const fresh = { id, movimientos: [], ...data };
    setItems((arr) => [...arr, fresh]);
    setSel(id);
    setCreating(false);
    setFlash({ msg: `${cfg.label} creado · ${id}` });
    setTimeout(() => setFlash(null), 4000);
  };

  return (
    <div>
      {/* §01 — LISTA + Crear */}
      <TSectionHead ix="§01" name={`Lista de ${cfg.labelPlural.toLowerCase()}`}
        count={`${items.length} ${items.length === 1 ? cfg.label.toLowerCase() : cfg.labelPlural.toLowerCase()} · ${cfg.totalLabel(displayItems)}`}
        right={
          <button type="button" onClick={() => { setCreating(true); setSub('movimientos'); }} style={{
            background: 'transparent', color: cfg.accent, border: `1px solid ${cfg.accent}`,
            padding: '4px 12px', fontFamily: 'inherit', fontSize: 9,
            letterSpacing: '0.14em', fontWeight: 600, cursor: 'pointer',
          }}>+ CREAR {cfg.label.toUpperCase()}</button>
        } />

      {flash && (
        <div style={{ margin: '0 0 0 14px', background: T.panel, border: `1px dashed ${T.am}`, padding: '6px 12px', fontSize: 10, color: T.am, letterSpacing: '0.1em' }}>
          ● {flash.msg}
        </div>
      )}

      <ProductoLista cfg={cfg} items={displayItems} sel={sel} setSel={setSel} />

      {/* §02 — Detalle del seleccionado (or Crear form) */}
      {creating ? (
        <>
          <TSectionHead ix="§02" name={`Crear ${cfg.label.toLowerCase()}`} count="NUEVO REGISTRO" />
          <CrearForm cfg={cfg} onCancel={() => setCreating(false)} onCreate={addItem} />
        </>
      ) : item ? (
        <>
          <TSectionHead ix="§02" name={`Detalle · ${item.nombre}`} count={item.id} />
          <DetalleHeader cfg={cfg} item={item} />
          <div style={{ margin: '0 0 0 14px', background: T.panel, border: `1px solid ${T.bd}`, borderTop: 'none' }}>
            <TTabStrip
              active={sub}
              onChange={setSub}
              dense
              tabs={[
                { id: 'movimientos', l: `MOVIMIENTOS · ${item.movimientos.length}` },
                { id: 'nuevo',       l: 'REGISTRAR MOVIMIENTO' },
                { id: 'editar',      l: 'PARÁMETROS · ELIMINAR' },
              ]}
            />
            {sub === 'movimientos' && (
              <MovimientosList cfg={cfg} item={item} onRemove={(mid) => removeMovimiento(item.id, mid)} />
            )}
            {sub === 'nuevo' && (
              <NuevoMovForm cfg={cfg} item={item} onAdd={(m) => addMovimiento(item.id, m)} />
            )}
            {sub === 'editar' && (
              <EditarParametros cfg={cfg} item={item}
                onPatch={(p) => patchItem(item.id, p)}
                onDelete={() => removeItem(item.id)} />
            )}
          </div>
        </>
      ) : (
        <div style={{ margin: '0 0 0 14px', background: T.panel, border: `1px solid ${T.bd}`, padding: '40px 20px', textAlign: 'center', color: T.t3, fontSize: 11, letterSpacing: '0.12em' }}>
          ▸ NO HAY {cfg.labelPlural.toUpperCase()} · usa <span style={{ color: cfg.accent }}>+ CREAR</span> arriba
        </div>
      )}
    </div>
  );
}

// ── Selectable list of items + KPI columns ──
function ProductoLista({ cfg, items, sel, setSel }) {
  const T = useTheme();
  const cols = cfg.listColumns; // [{ k, l, w, align?, fmt?(item) }]

  return (
    <div style={{ margin: '0 0 0 14px', border: `1px solid ${T.bd}`, marginBottom: 0 }}>
      <div style={{ display: 'grid', gridTemplateColumns: cols.map((c) => c.w).join(' '), background: T.panel2, padding: '7px 12px', fontSize: 9, color: T.t3, letterSpacing: '0.14em', borderBottom: `1px solid ${T.bd}` }}>
        {cols.map((c) => <span key={c.k} style={{ textAlign: c.align || 'left' }}>{c.l}</span>)}
      </div>
      {items.length === 0 && (
        <div style={{ padding: '24px 12px', color: T.t3, fontSize: 11, letterSpacing: '0.1em', textAlign: 'center' }}>
          ▸ sin registros
        </div>
      )}
      {items.map((it) => {
        const on = it.id === sel;
        return (
          <button key={it.id} onClick={() => setSel(it.id)} style={{
            display: 'grid', gridTemplateColumns: cols.map((c) => c.w).join(' '),
            alignItems: 'center', padding: '9px 12px', width: '100%', textAlign: 'left',
            background: on ? T.panel3 : 'transparent', color: 'inherit', fontFamily: 'inherit',
            border: 'none', borderBottom: `1px solid ${T.bd}`,
            borderLeft: on ? `2px solid ${cfg.accent}` : '2px solid transparent',
            cursor: 'pointer', fontSize: 11,
          }}>
            {cols.map((c) => {
              const v = c.fmt ? c.fmt(it) : it[c.k];
              const co = c.color ? (typeof c.color === 'function' ? c.color(it) : c.color) : (c.k === 'id' && on ? cfg.accent : T.t);
              return (
                <span key={c.k} style={{ textAlign: c.align || 'left', color: co, fontSize: c.size || 11,
                  fontWeight: c.k === 'id' ? 600 : 400, letterSpacing: c.k === 'id' ? '0.06em' : 0 }}>
                  {v}
                </span>
              );
            })}
          </button>
        );
      })}
    </div>
  );
}

// ── KPI header for the selected item ──
function DetalleHeader({ cfg, item }) {
  const T = useTheme();
  const kpis = resolveDetailKpis(cfg, item);
  return (
    <div style={{ margin: '0 0 0 14px', background: T.panel, border: `1px solid ${T.bd}`, borderBottom: 'none' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderBottom: `1px solid ${T.bd}` }}>
        <div style={{ width: 2, height: 14, background: cfg.accent }} />
        <div style={{ fontSize: 11, color: T.t, letterSpacing: '0.16em', fontWeight: 600 }}>{item.nombre.toUpperCase()}</div>
        <div style={{ fontSize: 9, color: T.t3, letterSpacing: '0.06em' }}>{item.tipoSub} · inicio {item.fechaInicio}</div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${kpis.length},1fr)`, padding: '12px 14px', gap: 10 }}>
        {kpis.map((k, i) => (
          <FinKV key={i} label={k.l} value={k.v} color={k.color} />
        ))}
      </div>
      {item.nota && (
        <div style={{ padding: '0 14px 12px', fontSize: 10, color: T.t3, fontStyle: 'italic', lineHeight: 1.55 }}>
          {item.nota}
        </div>
      )}
    </div>
  );
}

// ── Historial de movimientos ──
function MovimientosList({ cfg, item, onRemove }) {
  const T = useTheme();
  const cols = cfg.movColumns;
  const sessionEvents = useSessionEvents();

  // Bank panels surface session CF entries from other products as virtual rows.
  // cfg.extraMovimientos(item, sessionEvents) returns array of read-only rows.
  const extraRows = cfg.extraMovimientos
    ? cfg.extraMovimientos(item, sessionEvents)
    : [];
  const allMovs = [...item.movimientos, ...extraRows]
    .sort((a, b) => (a.fecha < b.fecha ? 1 : -1));

  if (allMovs.length === 0) {
    return (
      <div style={{ padding: '32px 16px', textAlign: 'center', color: T.t3, fontSize: 11, letterSpacing: '0.1em' }}>
        ▸ SIN MOVIMIENTOS · registra el primero en la siguiente sub-tab
      </div>
    );
  }
  return (
    <div style={{ padding: '14px 16px' }}>
      <div style={{ border: `1px solid ${T.bd}` }}>
        <div style={{ display: 'grid', gridTemplateColumns: cols.map((c) => c.w).join(' ') + ' 30px',
          padding: '7px 10px', background: T.panel2, fontSize: 9, color: T.t3,
          letterSpacing: '0.14em', borderBottom: `1px solid ${T.bd}` }}>
          {cols.map((c) => <span key={c.k} style={{ textAlign: c.align || 'left' }}>{c.l}</span>)}
          <span></span>
        </div>
        {allMovs.map((m, i) => {
          const isVirtual = !!m._virtual;
          const tipoCfg = isVirtual ? null : resolveMovTipos(cfg, item).find((t) => t.id === m.tipo);
          return (
            <div key={m.id || `virt-${i}`} style={{ display: 'grid',
              gridTemplateColumns: cols.map((c) => c.w).join(' ') + ' 30px',
              padding: '7px 10px', alignItems: 'center', gap: 4, fontSize: 10,
              borderBottom: i < allMovs.length - 1 ? `1px dashed ${T.t4}` : 'none',
              borderLeft: isVirtual ? `2px solid ${T.am}` : (tipoCfg ? `2px solid ${tipoCfg.c}` : 'none'),
              background: isVirtual ? T.panel2 : 'transparent',
            }}>
              {cols.map((c) => {
                const raw = m[c.k];
                const co = c.color ? (typeof c.color === 'function' ? c.color(m, tipoCfg, item) : c.color) : T.t;
                const display = c.fmt ? c.fmt(raw, m, tipoCfg, item) : raw;
                return (
                  <span key={c.k} style={{ textAlign: c.align || 'left', color: co, fontSize: 10 }}>{display}</span>
                );
              })}
              <button type="button" onClick={() => !isVirtual && onRemove(m.id)} disabled={isVirtual}
                title={isVirtual ? 'Vinculado · elimina en su panel origen' : 'Eliminar movimiento'} style={{
                background: 'transparent', color: isVirtual ? T.t4 : T.t3, border: `1px solid ${T.bd}`,
                fontFamily: 'inherit', fontSize: 11, lineHeight: 1, padding: '3px 0',
                cursor: isVirtual ? 'not-allowed' : 'pointer',
              }}
                onMouseEnter={(e) => { if (!isVirtual) { e.currentTarget.style.color = T.re; e.currentTarget.style.borderColor = T.re; } }}
                onMouseLeave={(e) => { if (!isVirtual) { e.currentTarget.style.color = T.t3; e.currentTarget.style.borderColor = T.bd; } }}
              >×</button>
            </div>
          );
        })}
      </div>
      <div style={{ marginTop: 10, fontSize: 9, color: T.t4, letterSpacing: '0.06em', fontStyle: 'italic' }}>
        ▸ click × para eliminar el movimiento · cambios solo en sesión
      </div>
    </div>
  );
}

// ── Registrar nuevo movimiento ──
function NuevoMovForm({ cfg, item, onAdd }) {
  const T = useTheme();
  const movTipos = resolveMovTipos(cfg, item);
  // Build default vals (date + first option for each select field) so cuentaId etc. start populated.
  const initVals = (tipoId) => {
    const tc = movTipos.find((t) => t.id === tipoId) || movTipos[0];
    const v = { fecha: HOY, nota: '' };
    tc.fields.forEach((f) => {
      if (f.options && f.options.length > 0) {
        const first = f.options[0];
        v[f.k] = f.default ?? (typeof first === 'object' ? first.value : first);
      } else if (f.default !== undefined) {
        v[f.k] = f.default;
      }
    });
    return v;
  };
  const [tipo, setTipo] = React.useState(movTipos[0].id);
  const [vals, setVals] = React.useState(() => initVals(movTipos[0].id));
  const [saved, setSaved] = React.useState(null);

  // Snap tipo back to a valid one if item changes and current tipo isn't supported
  React.useEffect(() => {
    if (!movTipos.find((t) => t.id === tipo)) setTipo(movTipos[0].id);
  }, [item.id, item.tipoSub]);

  const tipoCfg = movTipos.find((t) => t.id === tipo) || movTipos[0];
  const fields = tipoCfg.fields;

  const update = (k, v) => setVals((p) => ({ ...p, [k]: v }));
  const num = (k) => parseFloat(vals[k]) || 0;
  const total = tipoCfg.totalFrom ? tipoCfg.totalFrom(vals, num) : num(tipoCfg.montoField || 'monto');

  const reset = () => { setVals(initVals(tipo)); setSaved(null); };
  const submit = () => {
    if (total <= 0) return;
    const guard = tipoCfg.guard?.(item, vals, num);
    if (guard) { setSaved(guard); return; }
    const payload = { fecha: vals.fecha, tipo, nota: vals.nota, monto: total };
    // Carry over each field's value. Use string for option/select fields
    // (e.g. cuentaId, categoria) — parseFloat would corrupt them.
    fields.forEach((f) => {
      if (f.k === 'fecha' || f.k === 'nota') return;
      payload[f.k] = f.options || f.type === 'text' || f.type === 'date'
        ? vals[f.k]
        : num(f.k);
    });
    onAdd(payload);
    setSaved(`${tipoCfg.l} ${fmt(total)} registrado`);
    setTimeout(() => { setSaved(null); reset(); }, 2500);
  };

  return (
    <div style={{ padding: '16px' }}>
      {/* Tipo selector (only if more than 1) */}
      {movTipos.length > 1 && (
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 9, color: T.t3, letterSpacing: '0.14em', marginBottom: 6 }}>▸ TIPO DE MOVIMIENTO</div>
          <div style={{ display: 'flex', gap: 0, background: T.panel2, border: `1px solid ${T.bd}`, flexWrap: 'wrap' }}>
            {movTipos.map((opt) => {
              const on = tipo === opt.id;
              return (
                <button key={opt.id} onClick={() => { setTipo(opt.id); setVals(initVals(opt.id)); }} style={{
                  flex: 1, padding: '9px 10px', background: on ? opt.c + '22' : 'transparent',
                  color: on ? opt.c : T.t2, border: 'none', borderRight: `1px solid ${T.bd}`,
                  borderLeft: on ? `2px solid ${opt.c}` : '2px solid transparent',
                  fontFamily: 'inherit', fontSize: 10, letterSpacing: '0.12em',
                  fontWeight: 600, cursor: 'pointer', textAlign: 'left',
                }}>
                  <div>{opt.l.toUpperCase()}</div>
                  <div style={{ fontSize: 8, color: T.t4, letterSpacing: '0.06em', marginTop: 2 }}>{opt.hint || ''}</div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.min(fields.length, 3)},1fr)`, gap: 14 }}>
        {fields.map((f) => (
          <FormField key={f.k} label={f.l} hint={f.hint}>
            {f.options ? (
              <TSelect value={vals[f.k] ?? ''} onChange={(e) => update(f.k, e.target.value)}
                style={{ borderLeft: `2px solid ${tipoCfg.c}` }}>
                <option value="">— selecciona —</option>
                {f.options.map((o) => {
                  const val = typeof o === 'object' ? o.value : o;
                  const lab = typeof o === 'object' ? o.label : o;
                  return <option key={val} value={val}>{lab}</option>;
                })}
              </TSelect>
            ) : (
              <TInput type={f.type || 'number'} step={f.step}
                value={vals[f.k] ?? ''}
                placeholder={f.placeholder || '0'}
                onChange={(e) => update(f.k, e.target.value)}
                style={{ borderLeft: f.accentLeft !== false && f.type !== 'date' ? `2px solid ${tipoCfg.c}` : undefined }} />
            )}
          </FormField>
        ))}
      </div>

      <FormField label="Nota" hint="opcional · referencia, propósito">
        <TInput value={vals.nota ?? ''} onChange={(e) => update('nota', e.target.value)}
          placeholder={tipoCfg.notaPlaceholder || ''} />
      </FormField>

      {/* Live preview */}
      {tipoCfg.preview && (
        <div style={{ marginTop: 16, background: T.panel2, border: `1px solid ${T.bd}`, padding: '12px 14px' }}>
          <div style={{ fontSize: 9, color: T.t3, letterSpacing: '0.14em', marginBottom: 10 }}>▸ PROYECCIÓN POST-MOVIMIENTO</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 8 }}>
            {tipoCfg.preview(item, vals, num, total).map((p, i) => (
              <FinKV key={i} label={p.l} value={p.v} color={p.color} />
            ))}
          </div>
        </div>
      )}

      <FormSubmit label={tipoCfg.submitLabel || `REGISTRAR ${tipoCfg.l.toUpperCase()}`}
        color={tipoCfg.c} onSubmit={submit} onClear={reset} confirmation={saved} />
    </div>
  );
}

// ── Editar parámetros base + eliminar item ──
function EditarParametros({ cfg, item, onPatch, onDelete }) {
  const T = useTheme();
  const [draft, setDraft] = React.useState({});
  const [confirmDel, setConfirmDel] = React.useState(false);
  const [saved, setSaved] = React.useState(false);

  React.useEffect(() => { setDraft({}); setConfirmDel(false); setSaved(false); }, [item.id]);

  const merged = { ...item, ...draft };
  const dirty = Object.keys(draft).length > 0;

  const patch = (k, v) => setDraft((p) => ({ ...p, [k]: v }));
  const save = () => {
    onPatch(draft);
    setDraft({});
    setSaved(true);
    setTimeout(() => setSaved(false), 4000);
  };

  return (
    <div style={{ padding: '16px' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 14 }}>
        {resolveParamFields(cfg, merged).map((f) => {
          const v = merged[f.k];
          const orig = item[f.k];
          const changed = v !== orig;
          const borderColor = changed ? T.am : T.bd;
          const accentBorder = changed ? T.am : cfg.accent;
          return (
            <FormField key={f.k} label={f.l} hint={f.hint || (changed ? `antes: ${typeof orig === 'number' ? orig : String(orig) || '—'}` : null)}>
              {f.options ? (
                <TSelect value={v ?? ''} onChange={(e) => patch(f.k, e.target.value)}
                  style={{
                    borderColor, borderLeft: `2px solid ${accentBorder}`,
                  }}>
                  {f.options.map((o) => {
                    const val = typeof o === 'object' ? o.value : o;
                    const lab = typeof o === 'object' ? o.label : o;
                    return <option key={val} value={val}>{lab}</option>;
                  })}
                </TSelect>
              ) : f.type === 'textarea' ? (
                <textarea value={v ?? ''} onChange={(e) => patch(f.k, e.target.value)} rows={3}
                  style={{
                    width: '100%', background: T.panel2,
                    border: `1px solid ${borderColor}`, color: T.t,
                    fontFamily: 'inherit', fontSize: 11, padding: '8px 10px', boxSizing: 'border-box',
                    colorScheme: 'dark', resize: 'vertical',
                    borderLeft: `2px solid ${accentBorder}`,
                  }} />
              ) : (
                <TInput type={f.type || 'text'} step={f.step} value={v ?? ''}
                  onChange={(e) => patch(f.k, f.type === 'number' ? (e.target.value === '' ? '' : parseFloat(e.target.value)) : e.target.value)}
                  style={{
                    borderColor, borderLeft: `2px solid ${accentBorder}`,
                  }} />
              )}
            </FormField>
          );
        })}
      </div>

      <div style={{ display: 'flex', gap: 8, marginTop: 18, flexWrap: 'wrap', alignItems: 'center' }}>
        {dirty ? (
          <>
            <button type="button" onClick={save} style={{
              padding: '10px 18px', background: cfg.accent, color: T.hotInk,
              border: 'none', fontFamily: 'inherit', fontSize: 11, fontWeight: 700,
              letterSpacing: '0.14em', cursor: 'pointer',
            }}>▸ GUARDAR CAMBIOS</button>
            <button type="button" onClick={() => setDraft({})} style={{
              padding: '10px 18px', background: 'transparent', color: T.t2,
              border: `1px solid ${T.bd}`, fontFamily: 'inherit', fontSize: 11,
              letterSpacing: '0.14em', cursor: 'pointer',
            }}>DESCARTAR</button>
            <span style={{ fontSize: 10, color: T.am, letterSpacing: '0.1em', marginLeft: 'auto' }}>
              ● CAMBIOS SIN GUARDAR
            </span>
          </>
        ) : (
          <span style={{ fontSize: 10, color: saved ? T.gn : T.t3, letterSpacing: '0.12em' }}>
            {saved ? '● cambios guardados en sesión' : '● sin cambios pendientes · edita un campo para activar guardar'}
          </span>
        )}
      </div>

      {/* Danger zone: eliminar */}
      <div style={{ marginTop: 28, borderTop: `1px dashed ${T.t4}`, paddingTop: 14 }}>
        <div style={{ fontSize: 9, color: T.re, letterSpacing: '0.14em', marginBottom: 8 }}>▸ ZONA PELIGROSA</div>
        {!confirmDel ? (
          <button type="button" onClick={() => setConfirmDel(true)} style={{
            background: 'transparent', color: T.re, border: `1px solid ${T.re}`,
            padding: '8px 14px', fontFamily: 'inherit', fontSize: 10,
            letterSpacing: '0.14em', fontWeight: 600, cursor: 'pointer',
          }}>✕ ELIMINAR {cfg.label.toUpperCase()}</button>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: T.re + '14', border: `1px solid ${T.re}`, padding: '8px 12px' }}>
            <span style={{ fontSize: 10, color: T.re, letterSpacing: '0.1em', fontWeight: 600 }}>
              ¿ELIMINAR {item.id} · {item.nombre.toUpperCase()}? Esta acción borra todos sus movimientos.
            </span>
            <button type="button" onClick={onDelete} style={{
              marginLeft: 'auto', background: T.re, color: T.hotInk, border: 'none',
              padding: '6px 12px', fontFamily: 'inherit', fontSize: 10,
              letterSpacing: '0.14em', fontWeight: 700, cursor: 'pointer',
            }}>CONFIRMAR</button>
            <button type="button" onClick={() => setConfirmDel(false)} style={{
              background: 'transparent', color: T.t2, border: `1px solid ${T.bd}`,
              padding: '6px 12px', fontFamily: 'inherit', fontSize: 10,
              letterSpacing: '0.14em', fontWeight: 600, cursor: 'pointer',
            }}>CANCELAR</button>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Crear nuevo item ──
function CrearForm({ cfg, onCancel, onCreate }) {
  const T = useTheme();
  const [vals, setVals] = React.useState(() => {
    const init = { fechaInicio: HOY, nota: '', movimientos: [] };
    const allFields = typeof cfg.paramFields === 'function' ? cfg.paramFields(init) : cfg.paramFields;
    allFields.forEach((f) => {
      if (f.default !== undefined) init[f.k] = f.default;
      else if (f.options && f.options.length > 0 && init[f.k] === undefined) {
        const first = f.options[0];
        init[f.k] = typeof first === 'object' ? first.value : first;
      }
    });
    return init;
  });
  const update = (k, v) => setVals((p) => ({ ...p, [k]: v }));

  const visibleFields = resolveParamFields(cfg, vals);
  const reqMissing = visibleFields.filter((f) => f.required && (vals[f.k] === '' || vals[f.k] == null)).map((f) => f.l);
  const submit = () => {
    if (reqMissing.length > 0) return;
    onCreate(vals);
  };

  return (
    <div style={{ margin: '0 0 0 14px', background: T.panel, border: `1px solid ${cfg.accent}`, padding: '16px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
        <div style={{ width: 2, height: 14, background: cfg.accent }} />
        <div style={{ fontSize: 11, color: cfg.accent, letterSpacing: '0.16em', fontWeight: 600 }}>
          NUEVO {cfg.label.toUpperCase()}
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 14 }}>
        {visibleFields.map((f) => (
          <FormField key={f.k} label={f.l + (f.required ? ' *' : '')} hint={f.hint}>
            {f.options ? (
              <TSelect value={vals[f.k] ?? ''} onChange={(e) => update(f.k, e.target.value)}
                style={{ borderLeft: `2px solid ${cfg.accent}` }}>
                {f.options.map((o) => {
                  const val = typeof o === 'object' ? o.value : o;
                  const lab = typeof o === 'object' ? o.label : o;
                  return <option key={val} value={val}>{lab}</option>;
                })}
              </TSelect>
            ) : f.type === 'textarea' ? (
              <textarea value={vals[f.k] ?? ''} onChange={(e) => update(f.k, e.target.value)} rows={3}
                style={{
                  width: '100%', background: T.panel2,
                  border: `1px solid ${T.bd}`, color: T.t,
                  fontFamily: 'inherit', fontSize: 11, padding: '8px 10px', boxSizing: 'border-box',
                  colorScheme: 'dark', resize: 'vertical',
                  borderLeft: `2px solid ${cfg.accent}`,
                }} />
            ) : (
              <TInput type={f.type || 'text'} step={f.step}
                value={vals[f.k] ?? ''}
                placeholder={f.placeholder}
                onChange={(e) => update(f.k, f.type === 'number' ? (e.target.value === '' ? '' : parseFloat(e.target.value)) : e.target.value)}
                style={{ borderLeft: `2px solid ${cfg.accent}` }} />
            )}
          </FormField>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 18, alignItems: 'center' }}>
        <button type="button" onClick={submit} disabled={reqMissing.length > 0} style={{
          padding: '10px 18px', background: reqMissing.length ? T.panel3 : cfg.accent,
          color: reqMissing.length ? T.t3 : T.hotInk, border: 'none',
          fontFamily: 'inherit', fontSize: 11, fontWeight: 700,
          letterSpacing: '0.14em', cursor: reqMissing.length ? 'not-allowed' : 'pointer',
        }}>▸ CREAR</button>
        <button type="button" onClick={onCancel} style={{
          padding: '10px 18px', background: 'transparent', color: T.t2,
          border: `1px solid ${T.bd}`, fontFamily: 'inherit', fontSize: 11,
          letterSpacing: '0.14em', cursor: 'pointer',
        }}>CANCELAR</button>
        {reqMissing.length > 0 && (
          <span style={{ fontSize: 10, color: T.am, letterSpacing: '0.06em', marginLeft: 'auto' }}>
            faltan: {reqMissing.join(', ')}
          </span>
        )}
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════
// Product-specific configs
// ════════════════════════════════════════════════════════════════

// ── PRÉSTAMOS ───────────────────────────────────────────────────
const PRESTAMOS_CFG = (T) => ({
  label: 'Préstamo',
  labelPlural: 'Préstamos',
  accent: T.hot,
  idPrefix: 'FIN-P',
  items: PRESTAMOS_SEED,
  totalLabel: (items) => `saldo total ${fmt(items.reduce((s, i) => s + (i.saldo || 0), 0))}`,
  listColumns: [
    { k: 'id',    l: 'ID',         w: '90px' },
    { k: 'nombre', l: 'NOMBRE',    w: '1fr' },
    { k: 'tipoSub', l: 'TIPO',     w: '120px', color: T.t2 },
    { k: 'monto', l: 'MONTO',      w: '110px', align: 'right', fmt: (i) => fmt(i.monto) },
    { k: 'saldo', l: 'SALDO',      w: '110px', align: 'right', fmt: (i) => fmt(i.saldo), color: T.re },
    { k: 'pagado', l: 'PAGADO',    w: '110px', align: 'right', fmt: (i) => fmt(i.pagado), color: T.gn },
    { k: 'tasa', l: 'TASA',        w: '80px', align: 'right', fmt: (i) => i.tasa + '%' },
    { k: 'cuota', l: 'CUOTA',      w: '100px', align: 'right', fmt: (i) => fmt(i.cuota), color: T.hot },
  ],
  detailKpis: (it) => [
    { l: 'Monto', v: fmt(it.monto) },
    { l: 'Saldo', v: fmt(it.saldo), color: T.re },
    { l: 'Pagado', v: fmt(it.pagado), color: T.gn },
    { l: 'Cuota', v: fmt(it.cuota), color: T.hot },
    { l: 'Tasa/mes', v: it.tasa + '%' },
    { l: 'Seguro', v: fmt(it.seguro) },
  ],
  movColumns: [
    { k: 'fecha',   l: 'FECHA',    w: '110px', color: T.t2, fmt: (v) => v || '—' },
    { k: 'monto',   l: 'TOTAL',    w: '110px', align: 'right', fmt: (v) => fmt(v), color: T.hot },
    { k: 'capital', l: 'CAPITAL',  w: '110px', align: 'right', fmt: (v) => v > 0 ? fmt(v) : '—', color: T.gn },
    { k: 'interes', l: 'INTERÉS',  w: '110px', align: 'right', fmt: (v) => v > 0 ? fmt(v) : '—', color: T.re },
    { k: 'seguro',  l: 'SEGURO',   w: '90px',  align: 'right', fmt: (v) => v > 0 ? fmt(v) : '—', color: T.t2 },
    { k: 'abono',   l: 'ABONO',    w: '90px',  align: 'right', fmt: (v) => v > 0 ? fmt(v) : '·', color: T.am },
    { k: 'nota',    l: 'NOTA',     w: '1fr', color: T.t3 },
  ],
  movTipos: [
    {
      id: 'cuota', l: 'Cuota mensual', c: T.hot, hint: 'desglose capital + interés',
      fields: [
        { k: 'fecha',    l: 'Fecha',          type: 'date' },
        { k: 'cuentaId', l: 'Cuenta origen',  options: bancosOpts('DOP'),
          hint: 'de qué cuenta sale el pago' },
        { k: 'capital', l: 'Capital RD$',   hint: 'amortiza saldo' },
        { k: 'interes', l: 'Interés RD$',   hint: 'tasa × saldo' },
        { k: 'seguro',  l: 'Seguro RD$' },
        { k: 'mora',    l: 'Mora RD$',     hint: 'cargo por atraso · default 0' },
        { k: 'abono',   l: 'Abono extra' },
      ],
      // Monto total = todos los componentes que el usuario ingrese.
      // Mora se suma porque sale de la cuenta junto con el resto de la cuota.
      totalFrom: (v, n) => n('capital') + n('interes') + n('seguro') + n('mora') + n('abono'),
      submitLabel: 'REGISTRAR CUOTA',
    },
  ],
  applyMov: (item, mov, sign) => ({
    ...item,
    saldo: item.saldo - sign * (mov.capital + (mov.abono || 0)),
    pagado: item.pagado + sign * (mov.capital + (mov.abono || 0)),
  }),
  // Each cuota becomes a single CF salida (Pago Prestamo) linked to the picked cuenta.
  cfEntries: (item, mov) => {
    if (mov.tipo !== 'cuota') return [];
    return [{
      fecha: mov.fecha,
      categoria: 'Pago Prestamo',
      cuenta: mov.cuentaId ? findBancoNombre(mov.cuentaId) : item.nombre,
      cuentaId: mov.cuentaId,
      entrada: 0,
      salida: mov.monto,
    }];
  },
  paramFields: [
    { k: 'nombre',       l: 'Nombre',           type: 'text',     required: true },
    { k: 'tipoSub',      l: 'Tipo',             type: 'text',     hint: 'Cooperativa, Banco, Personal…' },
    { k: 'fechaInicio',  l: 'Fecha inicio',     type: 'date' },
    { k: 'monto',        l: 'Monto RD$',        type: 'number',   required: true },
    { k: 'saldo',        l: 'Saldo actual',     type: 'number',   default: 0 },
    { k: 'pagado',       l: 'Capital pagado',   type: 'number',   default: 0 },
    { k: 'tasa',         l: 'Tasa mensual %',   type: 'number',   step: '0.01', required: true },
    { k: 'cuota',        l: 'Cuota normal',     type: 'number' },
    { k: 'seguro',       l: 'Seguro/mes',       type: 'number',   default: 0 },
    { k: 'abonoMin5pct', l: 'Abono mínimo 5%',  type: 'number',   default: 0 },
    { k: 'abonoAcum',    l: 'Fondo abono',      type: 'number',   default: 0 },
    { k: 'nota',         l: 'Nota',             type: 'textarea' },
  ],
});

// ── INVERSORES ──────────────────────────────────────────────────
const INVERSORES_CFG = (T) => ({
  label: 'Inversor',
  labelPlural: 'Inversores',
  accent: T.pu,
  idPrefix: 'FIN-I',
  items: INVERSORES_SEED,
  totalLabel: (items) => `pendiente total ${fmt(items.reduce((s, i) => s + (i.pendiente || 0), 0))}`,
  listColumns: [
    { k: 'id',      l: 'ID',           w: '90px' },
    { k: 'nombre',  l: 'NOMBRE',       w: '1fr' },
    { k: 'tipoSub', l: 'TIPO',         w: '110px', color: T.t2 },
    { k: 'aporte',  l: 'APORTE',       w: '110px', align: 'right', fmt: (i) => fmt(i.aporte) },
    { k: 'retorno', l: 'RETORNO',      w: '110px', align: 'right', fmt: (i) => fmt(i.retorno), color: T.pu },
    { k: 'pagado',  l: 'PAGADO',       w: '110px', align: 'right', fmt: (i) => fmt(i.pagado), color: T.gn },
    { k: 'pendiente', l: 'PENDIENTE',  w: '110px', align: 'right', fmt: (i) => fmt(i.pendiente), color: T.re },
    { k: 'pct',     l: '% RETORNO',    w: '90px',  align: 'right', fmt: (i) => ((i.pagado/i.retorno)*100).toFixed(1) + '%', color: T.am },
  ],
  detailKpis: (it) => [
    { l: 'Aporte', v: fmt(it.aporte) },
    { l: 'Retorno', v: fmt(it.retorno), color: T.pu },
    { l: 'Pagado', v: fmt(it.pagado), color: T.gn },
    { l: 'Pendiente', v: fmt(it.pendiente), color: T.re },
    { l: '% retornado', v: ((it.pagado/it.retorno)*100).toFixed(1) + '%', color: T.am },
    { l: 'Meta meses', v: it.meta || '—' },
  ],
  movColumns: [
    { k: 'fecha', l: 'FECHA', w: '110px', color: T.t2 },
    { k: 'monto', l: 'MONTO', w: '120px', align: 'right', fmt: (v) => fmt(v), color: T.pu },
    { k: 'pct',   l: '% RET', w: '90px',  align: 'right',
      fmt: (_, m) => ((m.monto / 100000) * 100).toFixed(2) + '%', color: T.am },
    { k: 'nota',  l: 'NOTA',  w: '1fr',   color: T.t3 },
  ],
  movTipos: [
    {
      id: 'pago', l: 'Pago al inversor', c: T.pu,
      fields: [
        { k: 'fecha',    l: 'Fecha', type: 'date' },
        { k: 'cuentaId', l: 'Cuenta origen', options: bancosOpts('DOP'),
          hint: 'de qué cuenta sale el pago' },
        { k: 'monto',    l: 'Monto RD$' },
      ],
      submitLabel: 'REGISTRAR PAGO',
      preview: (item, vals, num, total) => {
        const nuevoPagado = item.pagado + total;
        const nuevoPend = item.retorno - nuevoPagado;
        return [
          { l: 'Este pago', v: total > 0 ? fmt(total) : '—', color: T.pu },
          { l: '% del retorno', v: total > 0 ? ((total/item.retorno)*100).toFixed(2)+'%' : '—', color: T.am },
          { l: 'Nuevo pagado', v: fmt(nuevoPagado), color: T.gn },
          { l: 'Nuevo pendiente', v: fmt(nuevoPend), color: nuevoPend <= 0 ? T.gn : T.re },
        ];
      },
    },
  ],
  applyMov: (item, mov, sign) => ({
    ...item,
    pagado: item.pagado + sign * mov.monto,
    pendiente: item.pendiente - sign * mov.monto,
  }),
  // Pago al inversor → salida de cash flow linked to the picked cuenta.
  cfEntries: (item, mov) => {
    if (mov.tipo !== 'pago') return [];
    return [{
      fecha: mov.fecha,
      categoria: 'Pago a Inversores',
      cuenta: mov.cuentaId ? findBancoNombre(mov.cuentaId) : item.nombre,
      cuentaId: mov.cuentaId,
      entrada: 0,
      salida: mov.monto,
    }];
  },
  paramFields: [
    { k: 'nombre',      l: 'Nombre',          type: 'text',   required: true },
    { k: 'tipoSub',     l: 'Tipo',            type: 'text',   default: 'Inversor 2×',
      hint: 'ej. "Inversor 2×", "Familiar", "Préstamo amigo"' },
    { k: 'fechaInicio', l: 'Fecha inicio',    type: 'date' },
    { k: 'aporte',      l: 'Aporte RD$',      type: 'number', required: true },
    { k: 'retorno',     l: 'Retorno objetivo', type: 'number',
      hint: 'normalmente múltiplo del aporte', required: true },
    { k: 'pagado',      l: 'Pagado acum.',    type: 'number', default: 0 },
    { k: 'pendiente',   l: 'Pendiente',       type: 'number' },
    { k: 'meta',        l: 'Meta (meses)',    type: 'number', default: 48,
      hint: 'plazo objetivo del retorno' },
    { k: 'nota',        l: 'Nota',            type: 'textarea' },
  ],
});

// ── LÍNEAS DE CRÉDITO ───────────────────────────────────────────
// Type-aware: behavior switches based on tipoSub.
//   · 'Línea Revolvente' — disposición / pago capital / pago interés
//   · 'Tarjeta de Crédito' — compra / pago al corte (total) / pago mínimo / interés
//
// Helper to compute Tarjeta-specific derived state
function tarjetaNextCorte(item) {
  // From today, walk forward to next day-of-month matching diaCorte
  const dia = parseInt(item.diaCorte, 10);
  if (!dia || dia < 1 || dia > 28) return '—';
  const t = new Date(HOY);
  let y = t.getFullYear(), m = t.getMonth();
  if (t.getDate() >= dia) m += 1;
  if (m > 11) { y += 1; m = 0; }
  const d = new Date(y, m, dia);
  return d.toISOString().slice(0, 10);
}
const TIPOSUB_CREDITO = [
  { value: 'Línea Revolvente',   label: 'Línea Revolvente'   },
  { value: 'Tarjeta de Crédito', label: 'Tarjeta de Crédito' },
];
const MONEDA_OPTS = [
  { value: 'DOP', label: 'DOP · RD$' },
  { value: 'USD', label: 'USD · $'   },
  { value: 'EUR', label: 'EUR · €'  },
];
const isTarjeta = (it) => it && it.tipoSub === 'Tarjeta de Crédito';
// Currency-aware fmt for a credit item
const fmtC = (v, it) => fmtCur(v, it?.moneda || 'DOP');

const CREDITOS_CFG = (T) => ({
  label: 'Línea',
  labelPlural: 'Líneas de Crédito',
  accent: T.bl,
  idPrefix: 'FIN-LC',
  items: CREDITOS_SEED,
  totalLabel: (items) => {
    // Group by currency for the header summary
    const by = {};
    items.forEach((i) => {
      const m = i.moneda || 'DOP';
      by[m] = by[m] || { usado: 0, limite: 0 };
      by[m].usado += i.usado || 0;
      by[m].limite += i.limite || 0;
    });
    return Object.entries(by).map(([m, v]) =>
      `${fmtCur(v.usado, m)} / ${fmtCur(v.limite, m)}`
    ).join(' · ');
  },
  listColumns: [
    { k: 'id',          l: 'ID',         w: '90px' },
    { k: 'nombre',      l: 'NOMBRE',     w: '1fr' },
    { k: 'tipoSub',     l: 'TIPO',       w: '160px',
      color: (i) => isTarjeta(i) ? T.am : T.bl },
    { k: 'moneda',      l: 'MON',        w: '60px',  color: T.t2,
      fmt: (i) => i.moneda || 'DOP' },
    { k: 'limite',      l: 'LÍMITE',     w: '130px', align: 'right', fmt: (i) => fmtC(i.limite, i) },
    { k: 'usado',       l: 'USADO',      w: '130px', align: 'right', fmt: (i) => fmtC(i.usado, i), color: T.re },
    { k: 'disp',        l: 'DISPONIBLE', w: '130px', align: 'right', fmt: (i) => fmtC(i.limite - i.usado, i), color: T.gn },
    { k: 'tasaAnual',   l: 'TASA',       w: '80px',  align: 'right', fmt: (i) => i.tasaAnual + '%' },
  ],
  detailKpis: (it) => {
    const base = [
      { l: `Límite (${it.moneda || 'DOP'})`, v: fmtC(it.limite, it) },
      { l: 'Usado', v: fmtC(it.usado, it), color: T.re },
      { l: 'Disponible', v: fmtC(it.limite - it.usado, it), color: T.gn },
      { l: '% uso', v: ((it.usado/it.limite)*100).toFixed(1) + '%', color: T.am },
    ];
    if (isTarjeta(it)) {
      const minPct = parseFloat(it.pagoMinPct) || 5;
      const pagoMin = it.usado * minPct / 100;
      return [
        ...base,
        { l: 'Pago esperado (total)', v: fmtC(it.usado, it), color: T.hot },
        { l: 'Pago mínimo', v: `${fmtC(pagoMin, it)} · ${minPct}%`, color: T.am },
        { l: 'Próximo corte', v: tarjetaNextCorte(it), color: T.t2 },
        { l: 'Tasa anual', v: it.tasaAnual + '%' },
      ];
    }
    return [
      ...base,
      { l: 'Tasa anual', v: it.tasaAnual + '%' },
      { l: 'Interés/mes est.', v: fmtC(it.usado * it.tasaMensual / 100, it), color: T.am },
    ];
  },
  movColumns: [
    { k: 'fecha', l: 'FECHA', w: '110px', color: T.t2 },
    { k: 'tipo',  l: 'TIPO',  w: '200px',
      fmt: (v, m, tc) => (
        <span style={{ color: tc?.c, letterSpacing: '0.1em', fontSize: 10 }}>
          {(tc?.l || v).toUpperCase()}{m.categoria ? ' · ' + m.categoria.toUpperCase() : ''}
        </span>
      ),
    },
    { k: 'monto', l: 'MONTO', w: '120px', align: 'right',
      fmt: (v, m, tc, item) => fmtC(v, item),
      color: (m, tc) => tc?.c || T.t },
    { k: 'comision', l: 'COMIS.', w: '90px', align: 'right',
      fmt: (v, m, tc, item) => v > 0 ? fmtC(v, item) : '·',
      color: (m) => m.comision > 0 ? T.am : T.t4 },
    { k: 'nota',  l: 'NOTA',  w: '1fr',   color: T.t3 },
  ],
  movTipos: (item) => {
    const sym = curSym(item.moneda);
    const tarjeta = isTarjeta(item);

    // Cargo categorías vary by line type — tarjeta vs revolvente have different naming
    const cargoCategorias = tarjeta
      ? [
          { value: 'compra',   label: 'Compra' },
          { value: 'interes',  label: 'Interés cobrado' },
          { value: 'comision', label: 'Comisión bancaria' },
          { value: 'otro',     label: 'Otro' },
        ]
      : [
          { value: 'disposicion', label: 'Disposición' },
          { value: 'interes',     label: 'Interés al saldo' },
          { value: 'comision',    label: 'Comisión al saldo' },
          { value: 'otro',        label: 'Otro' },
        ];

    const minPct = parseFloat(item.pagoMinPct) || 5;
    const pagoMin = item.usado * minPct / 100;

    return [
      {
        id: 'cargo', l: 'Cargo', c: T.re, hint: '+ usado',
        fields: [
          { k: 'fecha', l: 'Fecha', type: 'date' },
          { k: 'categoria', l: 'Categoría', options: cargoCategorias,
            default: cargoCategorias[0].value },
          { k: 'cuentaId', l: 'Cuenta destino', options: bancosOpts(item.moneda),
            hint: tarjeta
              ? 'no aplica para compras (se cargan al saldo) — úsalo solo para disposiciones que depositan'
              : 'cuenta donde llega el neto del desembolso' },
          { k: 'monto', l: `Monto ${sym}`,
            hint: tarjeta ? 'lo que se agrega al saldo' : 'lo que el banco aprueba (suma al usado)' },
          { k: 'comision', l: `Comisión / Tax extra ${sym}`,
            hint: tarjeta
              ? 'cargos NO aplicados al saldo (ITBIS, comisión internacional)'
              : 'lo que el banco descuenta antes de depositar' },
        ],
        submitLabel: 'REGISTRAR CARGO',
        notaPlaceholder: 'comercio · referencia · propósito',
        preview: (item, vals, num, total) => {
          const com = num('comision');
          const nuevoUsado = item.usado + total;
          if (tarjeta) {
            return [
              { l: 'Cargo al saldo', v: total > 0 ? fmtC(total, item) : '—', color: T.re },
              { l: 'Comisión extra', v: com > 0 ? fmtC(com, item) : '—', color: com > 0 ? T.am : T.t3 },
              { l: 'Nuevo usado', v: fmtC(nuevoUsado, item), color: nuevoUsado > item.limite ? T.re : T.t },
              { l: 'Pago esperado al corte', v: fmtC(nuevoUsado, item), color: T.hot },
            ];
          }
          // Línea revolvente: monto aprobado vs neto recibido
          const neto = total - com;
          return [
            { l: 'Monto al saldo', v: total > 0 ? fmtC(total, item) : '—', color: T.re },
            { l: 'Comisión / Tax', v: com > 0 ? fmtC(com, item) : '—', color: com > 0 ? T.am : T.t3 },
            { l: 'Neto a cuenta', v: total > 0 ? fmtC(neto, item) : '—', color: T.gn },
            { l: 'Nuevo usado', v: fmtC(nuevoUsado, item), color: nuevoUsado > item.limite ? T.re : T.t },
          ];
        },
        guard: (item, vals, num) => {
          const m = num('monto');
          if (item.usado + m > item.limite) return `excede límite por ${fmtC(item.usado + m - item.limite, item)}`;
          return null;
        },
      },
      {
        id: 'pago', l: 'Pago', c: T.gn, hint: '− usado',
        fields: [
          { k: 'fecha', l: 'Fecha', type: 'date' },
          { k: 'cuentaId', l: 'Cuenta origen', options: bancosOpts(item.moneda),
            hint: 'cuenta desde donde se paga' },
          { k: 'monto', l: `Monto al saldo ${sym}`,
            hint: tarjeta
              ? `usado actual: ${fmtC(item.usado, item)} · mínimo: ${fmtC(pagoMin, item)}`
              : `usado actual: ${fmtC(item.usado, item)}` },
          { k: 'comision', l: `Comisión / Tax ${sym}`,
            hint: 'cargo bancario que sale de tu cuenta pero NO aplica al saldo' },
        ],
        submitLabel: 'REGISTRAR PAGO',
        preview: (item, vals, num, total) => {
          const com = num('comision');
          const nuevoUsado = Math.max(0, item.usado - total);
          const baseRows = [
            { l: 'Aplicado al saldo', v: total > 0 ? fmtC(total, item) : '—', color: T.gn },
            { l: 'Comisión / Tax', v: com > 0 ? fmtC(com, item) : '—', color: com > 0 ? T.am : T.t3 },
            { l: 'Total débito de cuenta', v: (total + com) > 0 ? fmtC(total + com, item) : '—', color: T.re },
          ];
          if (tarjeta) {
            const cubreMin = total >= pagoMin;
            const diff = total - item.usado;
            const exactoCorte = Math.abs(diff) < 0.01 && total > 0;
            let estado, estadoColor;
            if (total <= 0)        { estado = '—';                                                              estadoColor = T.t3; }
            else if (exactoCorte)  { estado = '✓ pago total al corte';                                          estadoColor = T.gn; }
            else if (diff > 0)     { estado = `+${fmtC(diff, item)} sobre el saldo`;                              estadoColor = T.am; }
            else if (cubreMin)     { estado = `cubre mínimo · falta ${fmtC(-diff, item)} para corte`;            estadoColor = T.am; }
            else                   { estado = `✕ NO cubre mínimo (faltan ${fmtC(pagoMin - total, item)})`;     estadoColor = T.re; }
            return [...baseRows, { l: 'Estado del pago', v: estado, color: estadoColor }];
          }
          return [...baseRows, { l: 'Nuevo usado', v: fmtC(nuevoUsado, item), color: T.t }];
        },
      },
    ];
  },
  applyMov: (item, mov, sign) => {
    // New model: cargo +usado, pago −usado.
    // Legacy aliases kept so old seed data keeps working.
    if (mov.tipo === 'cargo' || mov.tipo === 'disposicion' || mov.tipo === 'compra') {
      return { ...item, usado: item.usado + sign * mov.monto };
    }
    if (mov.tipo === 'pago' || mov.tipo === 'pago_capital' || mov.tipo === 'pago_total' || mov.tipo === 'pago_minimo') {
      return { ...item, usado: Math.max(0, item.usado - sign * mov.monto) };
    }
    // 'pago_interes' and 'interes' (legacy) don't move saldo — they were expense-only logs.
    return item;
  },
  // CF mapping per type/categoría:
  //   cargo + categoría=disposición → entrada (neto = monto − comisión) + comisión salida si > 0
  //   cargo + otras categorías (compra, interés, comisión al saldo) → sin CF inmediato (se carga al saldo, se paga después)
  //   pago → salida (monto + comisión)
  cfEntries: (item, mov) => {
    const rows = [];
    const cuentaNombre = mov.cuentaId ? findBancoNombre(mov.cuentaId) : item.nombre;
    if (mov.tipo === 'cargo') {
      if (mov.categoria === 'disposicion') {
        const com = parseFloat(mov.comision) || 0;
        const neto = mov.monto - com;
        if (neto > 0) {
          rows.push({
            fecha: mov.fecha,
            categoria: 'Otro',
            cuenta: cuentaNombre + ' · disposición',
            cuentaId: mov.cuentaId,
            entrada: neto,
            salida: 0,
          });
        }
        if (com > 0) {
          rows.push({
            fecha: mov.fecha,
            categoria: 'Pago Comision',
            cuenta: cuentaNombre + ' · comisión desembolso',
            cuentaId: mov.cuentaId,
            entrada: 0,
            salida: com,
          });
        }
      }
      // compra/interes/comisión al saldo: no CF — se carga al saldo y se paga luego.
    } else if (mov.tipo === 'pago') {
      rows.push({
        fecha: mov.fecha,
        categoria: 'Pago Prestamo',
        cuenta: cuentaNombre,
        cuentaId: mov.cuentaId,
        entrada: 0,
        salida: mov.monto,
      });
      const com = parseFloat(mov.comision) || 0;
      if (com > 0) {
        rows.push({
          fecha: mov.fecha,
          categoria: 'Pago Comision',
          cuenta: cuentaNombre + ' · tax/comisión',
          cuentaId: mov.cuentaId,
          entrada: 0,
          salida: com,
        });
      }
    }
    return rows;
  },
  paramFields: (vals) => {
    const sym = curSym(vals?.moneda);
    const baseFields = [
      { k: 'nombre',      l: 'Nombre',          type: 'text',   required: true,
        placeholder: 'ej. "BHD Línea Revolvente" o "Chase Sapphire · ####"' },
      { k: 'tipoSub',     l: 'Tipo',            options: TIPOSUB_CREDITO,
        default: 'Línea Revolvente', required: true,
        hint: 'cambia los tipos de movimiento disponibles' },
      { k: 'moneda',      l: 'Moneda',          options: MONEDA_OPTS,
        default: 'DOP', required: true,
        hint: 'límite, usado y movimientos se muestran en esta moneda' },
      { k: 'fechaInicio', l: 'Fecha apertura',  type: 'date' },
      { k: 'limite',      l: `Límite ${sym}`,    type: 'number', step: '0.01', required: true },
      { k: 'usado',       l: `Usado actual ${sym}`, type: 'number', step: '0.01', default: 0 },
      { k: 'tasaAnual',   l: 'Tasa anual %',    type: 'number', step: '0.01', required: true },
      { k: 'tasaMensual', l: 'Tasa mensual %',  type: 'number', step: '0.0001',
        hint: 'normalmente = anual / 12' },
    ];
    const tarjetaFields = [
      { k: 'diaCorte',   l: 'Día de corte',     type: 'number', step: '1',
        hint: 'día del mes (1–28) en que se factura',
        showIf: isTarjeta, default: 25 },
      { k: 'diasPago',   l: 'Días para pagar',  type: 'number', step: '1',
        hint: 'desde el corte hasta vencimiento',
        showIf: isTarjeta, default: 20 },
      { k: 'pagoMinPct', l: 'Pago mínimo %',    type: 'number', step: '0.01',
        hint: '% del saldo · típicamente 3–5%',
        showIf: isTarjeta, default: 5 },
    ];
    return [
      ...baseFields,
      ...tarjetaFields,
      { k: 'nota', l: 'Nota', type: 'textarea' },
    ];
  },
});

// ── CUENTAS DE BANCO ────────────────────────────────────────────
const BANCOS_CFG = (T) => ({
  label: 'Cuenta',
  labelPlural: 'Cuentas',
  accent: T.gn,
  idPrefix: 'BNK',
  items: BANCOS_SEED,
  // Overlay: apply session CF entries from OTHER products (ventas, cuotas, lotes,
  // disposiciones, pagos) so this account's saldo reflects them in real time.
  // Only counts events linked to this bank via cuentaId AND not generated by this
  // same bank's own movements (to avoid double-counting with applyMov).
  overlay: (item, sessionEvents) => {
    const delta = bancoOverlayDelta(item.id, sessionEvents);
    if (delta === 0) return item;
    return { ...item, saldo: item.saldo + delta, _overlaySaldoDelta: delta };
  },
  // Surface CF entries linked to this bank from OTHER products (cuotas,
  // disposiciones, lotes, ventas) as virtual rows in the historial.
  extraMovimientos: (item, sessionEvents) => {
    const rows = [];
    sessionEvents.forEach((e) => {
      if (e.tipo === 'cf_mov' && e.cuentaId === item.id && e.linkedProduct !== item.id) {
        const monto = (e.entrada || 0) - (e.salida || 0);
        rows.push({
          _virtual: true,
          id: 'virt-' + e.id,
          fecha: e.fecha,
          tipo: monto >= 0 ? 'deposito' : 'retiro',
          monto: Math.abs(monto),
          nota: '↪ ' + (e.categoria || 'CF') + (e.cuenta ? ' · ' + e.cuenta : ''),
        });
      } else if (e.tipo === 'venta' && e.cuentaId === item.id) {
        const total = e.precioFacturadoTotal ?? e.precioTotal ?? 0;
        rows.push({
          _virtual: true,
          id: 'virt-' + e.id,
          fecha: e.fecha,
          tipo: 'deposito',
          monto: total,
          nota: '↪ Venta ' + (Array.isArray(e.lineas) && e.lineas.length > 1
            ? `${e.lineas.length} SKUs`
            : (e.lineas?.[0]?.skuNombre || e.skuNombre || '')),
        });
      }
    });
    return rows;
  },
  totalLabel: (items) => {
    const dop = items.filter((i) => i.moneda === 'DOP').reduce((s, i) => s + i.saldo, 0);
    const usd = items.filter((i) => i.moneda === 'USD').reduce((s, i) => s + i.saldo, 0);
    return `${fmt(dop)} DOP${usd ? ' · $' + usd.toFixed(2) + ' USD' : ''}`;
  },
  listColumns: [
    { k: 'id',      l: 'ID',       w: '90px' },
    { k: 'nombre',  l: 'NOMBRE',   w: '1fr' },
    { k: 'tipoSub', l: 'TIPO',     w: '140px', color: T.t2 },
    { k: 'moneda',  l: 'MONEDA',   w: '80px',  color: T.t2 },
    { k: 'saldo',   l: 'SALDO',    w: '140px', align: 'right',
      fmt: (i) => i.moneda === 'USD' ? `$${i.saldo.toFixed(2)}` : fmt(i.saldo),
      color: (i) => i.saldo >= 0 ? T.gn : T.re },
    { k: 'mov',     l: 'MOV',      w: '70px',  align: 'right',
      fmt: (i) => String(i.movimientos.length), color: T.t3 },
  ],
  detailKpis: (it) => {
    const baseSaldo = it.saldo - (it._overlaySaldoDelta || 0);
    const overlay = it._overlaySaldoDelta || 0;
    return [
      { l: 'Saldo', v: it.moneda === 'USD' ? `$${it.saldo.toFixed(2)}` : fmt(it.saldo),
        color: it.saldo >= 0 ? T.gn : T.re },
      { l: 'Saldo base', v: it.moneda === 'USD' ? `$${baseSaldo.toFixed(2)}` : fmt(baseSaldo),
        color: T.t2 },
      { l: 'Δ sesión', v: overlay !== 0 ? (overlay > 0 ? '+' : '') + (it.moneda === 'USD' ? `$${overlay.toFixed(2)}` : fmt(overlay)) : '—',
        color: overlay > 0 ? T.gn : overlay < 0 ? T.re : T.t3 },
      { l: 'Moneda', v: it.moneda },
      { l: 'Movimientos', v: it.movimientos.length },
      { l: 'Apertura', v: it.fechaInicio, color: T.t2 },
    ];
  },
  movColumns: [
    { k: 'fecha', l: 'FECHA', w: '110px', color: T.t2 },
    { k: 'tipo',  l: 'TIPO',  w: '160px',
      fmt: (v, m, tc) => (
        <span style={{ color: tc?.c, letterSpacing: '0.1em', fontSize: 10 }}>
          {(tc?.l || v).toUpperCase()}
        </span>
      ),
    },
    { k: 'monto', l: 'MONTO', w: '130px', align: 'right',
      fmt: (v, m, tc) => fmt(v),
      color: (m, tc) => tc?.c || T.t },
    { k: 'nota',  l: 'NOTA',  w: '1fr', color: T.t3 },
  ],
  movTipos: [
    {
      id: 'deposito', l: 'Depósito', c: T.gn, hint: '+ saldo',
      fields: [
        { k: 'fecha', l: 'Fecha', type: 'date' },
        { k: 'monto', l: 'Monto' },
      ],
      submitLabel: 'REGISTRAR DEPÓSITO',
      preview: (item, vals, num, total) => [
        { l: 'Depósito', v: total > 0 ? fmt(total) : '—', color: T.gn },
        { l: 'Nuevo saldo', v: fmt(item.saldo + total), color: T.gn },
      ],
    },
    {
      id: 'retiro', l: 'Retiro', c: T.re, hint: '− saldo',
      fields: [
        { k: 'fecha', l: 'Fecha', type: 'date' },
        { k: 'monto', l: 'Monto' },
      ],
      submitLabel: 'REGISTRAR RETIRO',
      preview: (item, vals, num, total) => [
        { l: 'Retiro', v: total > 0 ? fmt(total) : '—', color: T.re },
        { l: 'Nuevo saldo', v: fmt(item.saldo - total), color: (item.saldo - total) >= 0 ? T.gn : T.re },
      ],
    },
    {
      id: 'transferencia', l: 'Transferencia', c: T.bl, hint: '+/- saldo',
      fields: [
        { k: 'fecha', l: 'Fecha', type: 'date' },
        { k: 'monto', l: 'Monto · (+) recibe, (-) envía' },
      ],
      submitLabel: 'REGISTRAR TRANSFERENCIA',
      notaPlaceholder: 'a/desde qué cuenta · referencia',
      preview: (item, vals, num, total) => [
        { l: 'Transferencia', v: total !== 0 ? fmt(total) : '—', color: T.bl },
        { l: 'Nuevo saldo', v: fmt(item.saldo + total), color: (item.saldo + total) >= 0 ? T.gn : T.re },
      ],
    },
    {
      id: 'comision', l: 'Comisión', c: T.am, hint: '− saldo · fee bancario',
      fields: [
        { k: 'fecha', l: 'Fecha', type: 'date' },
        { k: 'monto', l: 'Monto' },
      ],
      submitLabel: 'REGISTRAR COMISIÓN',
      preview: (item, vals, num, total) => [
        { l: 'Comisión', v: total > 0 ? fmt(total) : '—', color: T.am },
        { l: 'Nuevo saldo', v: fmt(item.saldo - total), color: T.t },
      ],
    },
  ],
  applyMov: (item, mov, sign) => {
    let delta = 0;
    if (mov.tipo === 'deposito')      delta = +mov.monto;
    if (mov.tipo === 'retiro')        delta = -mov.monto;
    if (mov.tipo === 'comision')      delta = -mov.monto;
    if (mov.tipo === 'transferencia') delta = +mov.monto;
    return { ...item, saldo: item.saldo + sign * delta };
  },
  // Bank movements ARE cash flow movements — generate CF rows directly.
  // Note: this can double-count if the user ALSO logs the same payment on the
  // related FINANC product (e.g. paying a cuota AND logging the retiro on the
  // bank). UI should prefer one source of truth per movement.
  cfEntries: (item, mov) => {
    if (mov.tipo === 'deposito' || (mov.tipo === 'transferencia' && mov.monto > 0)) {
      return [{
        fecha: mov.fecha,
        categoria: 'Otro',
        cuenta: `${item.nombre} · ${mov.tipo}`,
        entrada: Math.abs(mov.monto),
        salida: 0,
      }];
    }
    if (mov.tipo === 'retiro' || mov.tipo === 'comision' || (mov.tipo === 'transferencia' && mov.monto < 0)) {
      return [{
        fecha: mov.fecha,
        categoria: mov.tipo === 'comision' ? 'Pago Comision' : 'Otro',
        cuenta: `${item.nombre} · ${mov.tipo}`,
        entrada: 0,
        salida: Math.abs(mov.monto),
      }];
    }
    return [];
  },
  paramFields: [
    { k: 'nombre',      l: 'Nombre',         type: 'text', required: true,
      placeholder: 'ej. "BHD Cuenta Corriente · ####"' },
    { k: 'tipoSub',     l: 'Tipo',           type: 'text', default: 'Corriente DOP',
      hint: 'Corriente DOP, Ahorros DOP, Digital USD…' },
    { k: 'moneda',      l: 'Moneda',         type: 'text', default: 'DOP', required: true,
      hint: 'DOP, USD, EUR…' },
    { k: 'fechaInicio', l: 'Fecha apertura', type: 'date' },
    { k: 'saldo',       l: 'Saldo inicial',  type: 'number', default: 0 },
    { k: 'nota',        l: 'Nota',           type: 'textarea',
      placeholder: 'propósito de la cuenta, política de uso…' },
  ],
});

// ── Wrappers exposed to PanelFinanciero ─────────────────────────
function PanelFinPrestamos()   { const T = useTheme(); return <FinProductoPanel cfg={PRESTAMOS_CFG(T)} />; }
function PanelFinInversores()  { const T = useTheme(); return <FinProductoPanel cfg={INVERSORES_CFG(T)} />; }
function PanelFinCreditos()    { const T = useTheme(); return <FinProductoPanel cfg={CREDITOS_CFG(T)} />; }
function PanelFinBancos()      { const T = useTheme(); return <FinProductoPanel cfg={BANCOS_CFG(T)} />; }

Object.assign(window, {
  PanelFinPrestamos, PanelFinInversores, PanelFinCreditos, PanelFinBancos,
});

// Initialize global product state from seeds so MANDO KPIs work even before
// the user navigates to FINANC (FinProductoPanel keeps it in sync after mount).
if (!window.__PRODUCT_STATE__) {
  window.__PRODUCT_STATE__ = {
    'FIN-P':  PRESTAMOS_SEED,
    'FIN-I':  INVERSORES_SEED,
    'FIN-LC': CREDITOS_SEED,
    'BNK':    BANCOS_SEED,
  };
}
