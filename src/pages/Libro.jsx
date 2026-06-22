// ════════════════════════════════════════════════════════════════
// Libro — libro contable (movimientos) + registro de pagos financieros y
// gastos/ajustes/transferencias. Reescritura de MovimientosPage / FormMovFin /
// FormAjusteCF / EditModal del monolito viejo (sin copiar sus bugs).
//
// Sub-tabs:
//  1. "Libro contable" — DataTable de data.movimientos (fecha, tipo, cuenta,
//     contraparte, debe, haber, naturaleza, notas) con filtro de período,
//     búsqueda, KPIs del período y editar/borrar vía Modal. Los movimientos
//     que vienen de una fuente (venta/lote/cuota) se editan en su página, no
//     aquí (editar suelto desincroniza los totales del origen).
//  2. "+ Pago a préstamo/línea/inversor" — FormPagoFinanciero → createPagoFinanciero.
//  3. "+ Gasto / ajuste / transferencia" — FormGastoAjuste → createMovimiento.
//
// Bugs arreglados (la lógica vive en los writers; aquí se alimentan bien):
//  - CTA-1: todo form exige cuenta real (CuentaSelect / MedioPagoSelect), nunca
//    defaultea a BHD.
//  - CTA-2: transferencia interna = TRANSFERENCIA_INTERNA con cuentaDestinoId
//    (una sola fila), no dos movimientos sueltos.
//  - DEU-2: pagar la cuota del Coop pasa cuotaId → el writer marca la cuota pagada.
//  - DEU-5: "Cargo Línea"/"Disposición Línea" = DRAWDOWN (entrada) → suma al usado.
//  - INVR-1: pago/depósito a inversor pasa inversorId → la vista del inversor baja.
//  - regla 7: gasto pagado con tarjeta vía MedioPagoSelect → DRAWDOWN + prestamoId.
//
// Acepta prop `embedded` (oculta topbar/h1 para montarse dentro de Finanzas).
// ════════════════════════════════════════════════════════════════
import { useState, useMemo, useEffect } from 'react';
import { useData } from '../hooks/useData.jsx';
import { createMovimiento, updateMovimiento, removeMovimiento, createPagoFinanciero } from '../lib/db/writers.js';
import { Modal, useConfirm } from '../components/Modal.jsx';
import { Field, TextInput, NumberInput, MoneyInput, DateInput, TextArea, Select } from '../components/Form.jsx';
import { DataTable } from '../components/Table.jsx';
import { CuentaSelect, MedioPagoSelect, PrestamoSelect, InversorSelect } from '../components/Pickers.jsx';
import MovForm from '../components/forms/MovForm.jsx';
import { KPI } from '../components/Charts.jsx';
import { useToast } from '../components/Toast.jsx';
import { MOVFIN_TIPOS } from '../lib/supabase.js';
import { money, intNum, fmtDate, todayISO, num } from '../lib/format.js';
import { downloadCSV, csvName } from '../lib/csv.js';
import { inPeriod } from '../lib/period.js';

const PERIOD_OPTS = [
  { value: 'todo', label: 'Todo' }, { value: 'ano', label: 'Este año' },
  { value: '12m', label: 'Últ. 12 meses' }, { value: '6m', label: 'Últ. 6 meses' },
  { value: '3m', label: 'Últ. 3 meses' }, { value: 'mes', label: 'Este mes' },
];

// Conceptos editables a mano (tipos enum movimiento_tipo). Solo se ofrecen para
// movimientos sueltos (no ligados a venta/lote/cuota/inversor).
// Tipos a los que se PUEDE cambiar un movimiento suelto desde el editor. Solo
// conceptos que NO requieren una FK (venta/lote/préstamo/inversor/cuenta_destino):
// cambiar a DRAWDOWN/PAGO_PRESTAMO/PAGO_INVERSOR/TRANSFERENCIA_INTERNA dejaría el
// movimiento con naturaleza FINANCIERO pero sin su FK → saldo descuadrado. Para
// esos, el usuario usa los forms "+ Pago…" / "+ Gasto/ajuste/transferencia".
const TIPOS_EDIT = [
  'COMPRA_OPERATIVA', 'PAGO_ADS', 'PAGO_COMISION', 'PAGO_TRANSPORTE',
  'APORTE_DUENO', 'FEE_BANCARIO', 'REFUND_PROVEEDOR', 'REFUND_CLIENTE',
  'AJUSTE', 'OTROS',
];

// Un movimiento "viene de una fuente" si está ligado a venta/lote/cuota/inversor.
// Esos NO se editan sueltos aquí (rompería la sincronización con el origen).
function sourceOf(m) {
  if (m.ventaId) return { kind: 'venta', label: 'Editar en Ventas', page: 'ventas' };
  if (m.loteId) return { kind: 'lote', label: 'Editar en Inventario', page: 'inventario' };
  if (m.cuotaId || m.prestamoId || m.inversorId) return { kind: 'deuda', label: 'Editar en Finanzas', page: 'finanzas' };
  return null;
}

const natBadge = (nat) => (
  <span className="badge" style={{
    background: nat === 'FINANCIERO' ? 'rgba(245,158,11,0.18)' : 'rgba(59,130,246,0.18)',
    color: nat === 'FINANCIERO' ? '#f59e0b' : '#3b82f6', fontSize: 9,
  }}>{nat === 'FINANCIERO' ? 'FIN' : 'OP'}</span>
);

export default function LibroPage({ embedded, period: periodProp, customRange, onNavigate, cuentaFilter = null, cuentaNombre, onClearCuenta }) {
  const data = useData();
  const t = useToast();
  const [confirm, confirmNode] = useConfirm();
  const [showMov, setShowMov] = useState(false);
  // Embebido en Finanzas no hay barra de período del padre → selector interno
  // (presets simples, sin rango custom). Top-level usa el período + rango del padre.
  const [periodLocal, setPeriodLocal] = useState('todo');
  const period = embedded ? periodLocal : (periodProp || 'todo');
  const range = embedded ? null : customRange;
  const [naturaleza, setNaturaleza] = useState('todas'); // todas | op | fin
  const [search, setSearch] = useState('');
  const [limit, setLimit] = useState(500);
  const [editing, setEditing] = useState(null);

  // useMemo SIEMPRE se llama antes de cualquier return (regla de hooks).
  const filteredAll = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = (data.movimientos || []).filter((m) => {
      // Filtro por cuenta: solo por cuentaId (cada pata de transferencia ya está
      // atribuida a su cuenta con su entrada/salida; NO usar cuentaDestinoId o se
      // contaría la otra pata como fila fantasma).
      if (cuentaFilter != null && m.cuentaId !== cuentaFilter) return false;
      if (!inPeriod(m.fecha, period, range)) return false;
      if (naturaleza === 'op' && m.naturaleza === 'FINANCIERO') return false;
      if (naturaleza === 'fin' && m.naturaleza !== 'FINANCIERO') return false;
      if (q) {
        const txt = `${m.tipo} ${m.cuenta} ${m.contraparte} ${m.notas}`.toLowerCase();
        if (!txt.includes(q)) return false;
      }
      return true;
    });
    // Si está filtrado por cuenta, calcular saldo corrido (asc) y devolver desc.
    if (cuentaFilter != null) {
      const asc = list.slice().sort((a, b) => (a.fecha || '').localeCompare(b.fecha || '') || a.id - b.id);
      let run = 0;
      asc.forEach((m) => { m._saldo = (run += m.entrada - m.salida); });
    }
    return list;
  }, [data.movimientos, period, range, naturaleza, search, cuentaFilter]);

  if (data.loading) {
    return (
      <div>
        {!embedded && <div className="topbar"><div><h1>Libro contable</h1><div className="sub">Cargando…</div></div></div>}
        <div className="section"><div className="empty">Cargando movimientos…</div></div>
      </div>
    );
  }

  const totalDebe = filteredAll.reduce((s, m) => s + m.entrada, 0);
  const totalHaber = filteredAll.reduce((s, m) => s + m.salida, 0);
  const neto = totalDebe - totalHaber;
  const rows = filteredAll.slice(0, limit);

  async function doDelete(m) {
    const ok = await confirm({
      title: '¿Eliminar movimiento?',
      body: `${fmtDate(m.fecha)} · ${m.tipo} · ${m.cuenta || 'sin cuenta'} · ${money(m.entrada || m.salida)}. Borra de Supabase, no es reversible.`,
      confirmLabel: 'Eliminar',
    });
    if (!ok) return;
    try {
      await removeMovimiento(m.id);
      await data.refreshAll();
      t.ok('Movimiento eliminado', m.tipo);
    } catch (e) {
      t.err('No se pudo eliminar', e.message);
    }
  }

  const columns = [
    { key: 'fecha', label: 'Fecha', render: (m) => <span style={{ fontSize: 12, color: 'var(--text-3)' }}>{fmtDate(m.fecha)}</span> },
    { key: 'tipo', label: 'Tipo', render: (m) => <span style={{ fontWeight: 500 }}>{m.tipo}</span> },
    { key: 'cuenta', label: 'Cuenta', render: (m) => m.cuenta || <span className="muted">—</span> },
    { key: 'contraparte', label: 'Contraparte', render: (m) => m.contraparte || <span className="muted">—</span> },
    { key: 'entrada', label: 'Debe', align: 'right', num: true, render: (m) => (m.entrada > 0 ? <span style={{ color: 'var(--success)' }}>{money(m.entrada)}</span> : '') },
    { key: 'salida', label: 'Haber', align: 'right', num: true, render: (m) => (m.salida > 0 ? <span style={{ color: 'var(--danger)' }}>{money(m.salida)}</span> : '') },
    ...(cuentaFilter != null ? [{ key: 'saldo', label: 'Saldo', align: 'right', num: true, render: (m) => <span style={{ fontWeight: 600 }}>{money(m._saldo)}</span> }] : []),
    { key: 'naturaleza', label: 'Nat.', render: (m) => natBadge(m.naturaleza) },
    { key: 'notas', label: 'Notas', render: (m) => <span style={{ fontSize: 12, color: 'var(--text-3)' }} title={m.notas}>{(m.notas || '').slice(0, 40) || '—'}</span> },
    {
      key: 'acciones', label: '', align: 'right',
      render: (m) => {
        const src = sourceOf(m);
        return (
          <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
            {src ? (
              <button className="icon-btn" title={`Vino de ${src.kind} · editar en su fuente`}
                onClick={(e) => { e.stopPropagation(); onNavigate?.(src.page); }}>↗</button>
            ) : (
              <button className="icon-btn" title="Editar" onClick={(e) => { e.stopPropagation(); setEditing(m); }}>✎</button>
            )}
            <button className="icon-btn danger" title="Eliminar" onClick={(e) => { e.stopPropagation(); doDelete(m); }}>×</button>
          </div>
        );
      },
    },
  ];

  return (
    <div>
      {!embedded && (
        <div className="topbar">
          <div>
            <h1>Libro contable</h1>
            <div className="sub">
              {data.movimientos.length} movimientos · {filteredAll.length} en filtros · saldo período:{' '}
              <strong style={{ color: neto >= 0 ? 'var(--success)' : 'var(--danger)' }}>{money(neto)}</strong>
            </div>
          </div>
          <div className="topbar-actions">
            <button className="btn" onClick={() => setShowMov(true)}>+ Registrar movimiento</button>
          </div>
        </div>
      )}

      {cuentaFilter != null && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 'var(--s-3)' }}>
          <span className="section-title" style={{ fontSize: 15 }}>Libro · {cuentaNombre || 'cuenta'}</span>
          <span className="chip active" style={{ cursor: 'pointer' }} onClick={() => onClearCuenta?.()}>
            {cuentaNombre} ✕
          </span>
          <span style={{ fontSize: 12, color: 'var(--text-3)' }}>(click para ver todas las cuentas)</span>
        </div>
      )}

      <div className="kpi-row">
            <KPI label="Movimientos" value={intNum(filteredAll.length)} deltaLabel={`de ${intNum(data.movimientos.length)} totales`} />
            <KPI label="Total Debe (entradas)" currency value={intNum(totalDebe)} deltaLabel="cobros / aportes / ingresos" />
            <KPI label="Total Haber (salidas)" currency value={intNum(totalHaber)} deltaLabel="pagos / compras / gastos" />
            <KPI label="Saldo neto del período" currency value={intNum(neto)} delta={neto >= 0 ? 1 : -1} deltaLabel={neto >= 0 ? 'superávit' : 'déficit'} />
          </div>

          <div className="section">
            <div className="section-head">
              <div>
                <div className="section-title">{cuentaFilter != null ? 'Movimientos' : 'Libro contable'}</div>
                <div className="section-desc">{rows.length} de {filteredAll.length} · orden desc por fecha</div>
              </div>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                <div className="chips">
                  {[['todas', 'Todas'], ['op', 'Operacional'], ['fin', 'Financiero']].map(([k, l]) => (
                    <button key={k} className={`chip ${naturaleza === k ? 'active' : ''}`} onClick={() => setNaturaleza(k)}>{l}</button>
                  ))}
                </div>
                <button className="btn ghost" disabled={!filteredAll.length} title="Descargar CSV"
                  onClick={() => {
                    const headers = ['Fecha', 'Tipo', 'Cuenta', 'Contraparte', 'Entrada', 'Salida', 'Naturaleza', 'Notas'];
                    const rowsCsv = filteredAll.map((m) => [m.fecha, m.tipo, m.cuenta, m.contraparte, m.entrada, m.salida, m.naturaleza, m.notas]);
                    const n = downloadCSV(csvName('movimientos'), headers, rowsCsv);
                    t.ok('Movimientos exportados', `${n} fila(s) · CSV`);
                  }}>⤓ CSV</button>
              </div>
            </div>

            {/* Fila de búsqueda (y período si está embebido), debajo del header */}
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 'var(--s-3)', flexWrap: 'wrap' }}>
              {embedded && (
                <select className="select" style={{ width: 'auto', minWidth: 130 }} value={period} onChange={(e) => setPeriodLocal(e.target.value)}>
                  {PERIOD_OPTS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              )}
              <input className="input" style={{ maxWidth: 300 }} placeholder="Buscar tipo, cuenta, contraparte, notas…"
                value={search} onChange={(e) => setSearch(e.target.value)} />
              {filteredAll.length > limit && (
                <button className="btn ghost" onClick={() => setLimit((l) => l + 500)}>
                  Cargar más ({filteredAll.length - limit})
                </button>
              )}
            </div>

            <DataTable
              columns={columns}
              rows={rows}
              getRowKey={(m) => m.id}
              empty="Sin movimientos en estos filtros"
            />
          </div>

      {editing && (
        <EditMovimientoModal
          mov={editing}
          onClose={() => setEditing(null)}
          onSaved={() => setEditing(null)}
        />
      )}

      {showMov && (
        <Modal title="Registrar movimiento" width={560} onClose={() => setShowMov(false)}>
          <MovForm onDone={() => setShowMov(false)} />
        </Modal>
      )}

      {confirmNode}
    </div>
  );
}


// ════════════════════════════════════════════════════════════════
// EditMovimientoModal — editar un movimiento suelto (no ligado a venta/lote/
// cuota/inversor). Solo expone fecha/tipo/cuenta/debe/haber/notas → updateMovimiento.
// ════════════════════════════════════════════════════════════════
function EditMovimientoModal({ mov, onClose, onSaved }) {
  const data = useData();
  const t = useToast();
  const [confirm, confirmNode] = useConfirm();
  const [fecha, setFecha] = useState(mov.fecha || '');
  const [tipo, setTipo] = useState(mov.tipo || 'OTROS');
  const [cuentaId, setCuentaId] = useState(mov.cuentaId ?? null);
  const [entrada, setEntrada] = useState(mov.entrada || 0);
  const [salida, setSalida] = useState(mov.salida || 0);
  const [notas, setNotas] = useState(mov.notas || '');
  const [busy, setBusy] = useState(false);
  const [tries, setTries] = useState(false);

  // Asegura que el tipo actual esté en la lista aunque no sea uno de los comunes.
  const tipoOpts = useMemo(() => Array.from(new Set([mov.tipo, ...TIPOS_EDIT].filter(Boolean))), [mov.tipo]);

  const cuentaInvalida = tries && !cuentaId;
  const valid = !!cuentaId && (num(entrada) > 0 || num(salida) > 0);

  const onSave = async () => {
    setTries(true);
    if (!cuentaId) { t.warn('Falta la cuenta', 'Elegí la cuenta del movimiento'); return; }
    if (num(entrada) <= 0 && num(salida) <= 0) { t.warn('Monto vacío', 'Debe (entrada) o Haber (salida) debe ser mayor a 0'); return; }
    setBusy(true);
    try {
      await updateMovimiento(mov.id, {
        fecha, tipo, cuentaId,
        entrada: num(entrada), salida: num(salida), notas,
      });
      await data.refreshAll();
      t.ok('Movimiento actualizado', tipo);
      onSaved && onSaved();
    } catch (e) {
      t.err('No se pudo guardar', e.message);
    }
    setBusy(false);
  };

  const onDelete = async () => {
    const ok = await confirm({
      title: '¿Eliminar movimiento?',
      body: `${fmtDate(mov.fecha)} · ${mov.tipo} · ${money(mov.entrada || mov.salida)}. No es reversible.`,
      confirmLabel: 'Eliminar',
    });
    if (!ok) return;
    setBusy(true);
    try {
      await removeMovimiento(mov.id);
      await data.refreshAll();
      t.ok('Movimiento eliminado', mov.tipo);
      onSaved && onSaved();
    } catch (e) {
      t.err('No se pudo eliminar', e.message);
    }
    setBusy(false);
  };

  return (
    <Modal title="Editar movimiento" width={560} onClose={onClose}>
      {confirmNode}
      <div className="grid-2" style={{ marginBottom: 'var(--s-3)' }}>
        <Field label="Fecha"><DateInput value={fecha} onChange={setFecha} /></Field>
        <Field label="Tipo / concepto">
          <Select value={tipo} onChange={setTipo} options={tipoOpts} />
        </Field>
        <Field label="Cuenta" required>
          <CuentaSelect filter="todas" value={cuentaId} onChange={setCuentaId} invalid={cuentaInvalida} />
        </Field>
        <Field label="Contraparte" hint="solo lectura · se gestiona en su fuente">
          <TextInput value={mov.contraparte || '—'} onChange={() => {}} readOnly />
        </Field>
        <Field label="Debe (entrada RD$)"><MoneyInput value={entrada} onChange={setEntrada} placeholder="0" /></Field>
        <Field label="Haber (salida RD$)"><MoneyInput value={salida} onChange={setSalida} placeholder="0" /></Field>
      </div>
      <Field label="Notas"><TextArea value={notas} onChange={setNotas} placeholder="descripción" /></Field>

      <div className="field-hint" style={{ marginTop: 6 }}>
        Naturaleza: {mov.naturaleza === 'FINANCIERO' ? 'Financiero' : 'Operacional'} (la calcula la DB según el tipo).
      </div>

      <div className="modal-actions" style={{ marginTop: 'var(--s-4)' }}>
        <button className="btn danger" onClick={onDelete} disabled={busy} style={{ marginRight: 'auto' }}>Eliminar</button>
        <button className="btn ghost" onClick={onClose} disabled={busy}>Cancelar</button>
        <button className="btn" onClick={onSave} disabled={busy || !valid}>{busy ? 'Guardando…' : 'Guardar'}</button>
      </div>
    </Modal>
  );
}
