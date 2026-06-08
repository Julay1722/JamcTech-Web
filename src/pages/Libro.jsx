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
import { KPI } from '../components/Charts.jsx';
import { useToast } from '../components/Toast.jsx';
import { MOVFIN_TIPOS } from '../lib/supabase.js';
import { money, intNum, fmtDate, todayISO, num } from '../lib/format.js';

/* ──────────── Período ──────────── */
function inPeriod(fecha, period) {
  if (period === 'todo' || !fecha) return true;
  const d = new Date(fecha + 'T00:00:00');
  const now = new Date();
  if (period === 'mes') return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
  if (period === 'ano') return d.getFullYear() === now.getFullYear();
  const months = period === '3m' ? 3 : period === '6m' ? 6 : 12;
  const cutoff = new Date(now.getFullYear(), now.getMonth() - months + 1, 1);
  return d >= cutoff;
}

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

export default function LibroPage({ embedded, period: periodProp, onNavigate }) {
  const data = useData();
  const t = useToast();
  const [confirm, confirmNode] = useConfirm();
  const [tab, setTab] = useState('lista');
  // Embebido en Finanzas no hay barra de período del padre → selector interno.
  const [periodLocal, setPeriodLocal] = useState('todo');
  const period = embedded ? periodLocal : (periodProp || 'todo');
  const [naturaleza, setNaturaleza] = useState('todas'); // todas | op | fin
  const [search, setSearch] = useState('');
  const [limit, setLimit] = useState(500);
  const [editing, setEditing] = useState(null);

  // useMemo SIEMPRE se llama antes de cualquier return (regla de hooks).
  const filteredAll = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (data.movimientos || []).filter((m) => {
      if (!inPeriod(m.fecha, period)) return false;
      if (naturaleza === 'op' && m.naturaleza === 'FINANCIERO') return false;
      if (naturaleza === 'fin' && m.naturaleza !== 'FINANCIERO') return false;
      if (q) {
        const txt = `${m.tipo} ${m.cuenta} ${m.contraparte} ${m.notas}`.toLowerCase();
        if (!txt.includes(q)) return false;
      }
      return true;
    });
  }, [data.movimientos, period, naturaleza, search]);

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
        </div>
      )}

      <div className="tabs">
        <button className={tab === 'lista' ? 'tab active' : 'tab'} onClick={() => setTab('lista')}>Libro contable</button>
        <button className={tab === 'movfin' ? 'tab active' : 'tab'} onClick={() => setTab('movfin')}>+ Pago a préstamo/línea/inversor</button>
        <button className={tab === 'ajuste' ? 'tab active' : 'tab'} onClick={() => setTab('ajuste')}>+ Gasto / ajuste / transferencia</button>
      </div>

      {tab === 'movfin' && (
        <div className="section"><FormPagoFinanciero onDone={() => setTab('lista')} /></div>
      )}

      {tab === 'ajuste' && (
        <div className="section"><FormGastoAjuste onDone={() => setTab('lista')} /></div>
      )}

      {tab === 'lista' && (
        <>
          <div className="kpi-row">
            <KPI label="Movimientos" value={intNum(filteredAll.length)} deltaLabel={`de ${intNum(data.movimientos.length)} totales`} />
            <KPI label="Total Debe (entradas)" currency value={intNum(totalDebe)} deltaLabel="cobros / aportes / ingresos" />
            <KPI label="Total Haber (salidas)" currency value={intNum(totalHaber)} deltaLabel="pagos / compras / gastos" />
            <KPI label="Saldo neto del período" currency value={intNum(neto)} delta={neto >= 0 ? 1 : -1} deltaLabel={neto >= 0 ? 'superávit' : 'déficit'} />
          </div>

          <div className="section" style={{ marginBottom: 'var(--s-3)' }}>
            <div className="section-head">
              <div>
                <div className="section-title">Filtros</div>
                <div className="section-desc">Combina período + naturaleza + búsqueda libre</div>
              </div>
              {(period !== 'todo' || naturaleza !== 'todas' || search) && (
                <button className="btn ghost" onClick={() => { if (embedded) setPeriodLocal('todo'); setNaturaleza('todas'); setSearch(''); }}>
                  Limpiar filtros
                </button>
              )}
            </div>
            <div className="grid-3">
              {embedded && (
                <Field label="Período">
                  <Select value={period} onChange={setPeriodLocal} options={PERIOD_OPTS} />
                </Field>
              )}
              <Field label="Naturaleza">
                <Select value={naturaleza} onChange={setNaturaleza} options={[
                  { value: 'todas', label: 'Todas' },
                  { value: 'op', label: 'Solo operacional (CASHFLOW)' },
                  { value: 'fin', label: 'Solo financiero' },
                ]} />
              </Field>
              <Field label="Búsqueda libre" hint="tipo, cuenta, contraparte, notas">
                <TextInput value={search} onChange={setSearch} placeholder="buscar…" />
              </Field>
            </div>
          </div>

          <div className="section">
            <div className="section-head">
              <div>
                <div className="section-title">Libro contable</div>
                <div className="section-desc">{rows.length} de {filteredAll.length} · ordenado desc por fecha</div>
              </div>
              {filteredAll.length > limit && (
                <button className="btn ghost" onClick={() => setLimit((l) => l + 500)}>
                  Cargar más ({filteredAll.length - limit} restantes)
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
        </>
      )}

      {editing && (
        <EditMovimientoModal
          mov={editing}
          onClose={() => setEditing(null)}
          onSaved={() => setEditing(null)}
        />
      )}

      {confirmNode}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════
// FormPagoFinanciero — pago/abono a préstamo, disposición/pago/cargo de línea,
// depósito/retorno de inversor. Mapea el label amigable (MOVFIN_TIPOS) al enum
// movimiento_tipo + side correctos, y liga prestamoId / inversorId / cuotaId.
// ════════════════════════════════════════════════════════════════

// Cada label → { enum, side, target('prestamo'|'inversor'), filtro? }.
const MOVFIN_MAP = {
  'Cuota Préstamo':    { tipo: 'PAGO_PRESTAMO',       side: 'salida',  target: 'prestamo', soloPrestamo: true, desgloseCuota: true },
  'Abono Préstamo':    { tipo: 'PAGO_PRESTAMO',       side: 'salida',  target: 'prestamo', soloPrestamo: true },
  'Disposición Línea': { tipo: 'DRAWDOWN',            side: 'entrada', target: 'prestamo' }, // DEU-5: sube el usado
  'Pago Línea':        { tipo: 'PAGO_LINEA_CREDITO',  side: 'salida',  target: 'prestamo' },
  'Cargo Línea':       { tipo: 'DRAWDOWN',            side: 'entrada', target: 'prestamo' }, // DEU-5: cargo suma al usado
  'Depósito Inversor': { tipo: 'APORTE_INVERSOR',     side: 'entrada', target: 'inversor' }, // INVR-1
  'Retorno Inversor':  { tipo: 'PAGO_INVERSOR',       side: 'salida',  target: 'inversor' }, // INVR-1
  'Otro':              { tipo: 'OTROS',               side: 'salida',  target: null },
};

function FormPagoFinanciero({ onDone }) {
  const data = useData();
  const t = useToast();
  const [label, setLabel] = useState('Cuota Préstamo');
  const [fecha, setFecha] = useState(todayISO());
  const [prestamoId, setPrestamoId] = useState(null);
  const [inversorId, setInversorId] = useState(null);
  const [cuotaId, setCuotaId] = useState(null);
  const [cuentaId, setCuentaId] = useState(null);
  const [monto, setMonto] = useState('');
  const [capital, setCapital] = useState('');
  const [interes, setInteres] = useState('');
  const [seguro, setSeguro] = useState('');
  const [notas, setNotas] = useState('');
  const [busy, setBusy] = useState(false);
  const [tries, setTries] = useState(false);

  const meta = MOVFIN_MAP[label] || MOVFIN_MAP['Otro'];
  const esPrestamo = meta.target === 'prestamo';
  const esInversor = meta.target === 'inversor';
  const prestamo = data.prestamos.find((p) => p.id === prestamoId) || null;
  // Solo el Coop (tipo PRESTAMO) tiene schedule de cuotas; permitimos elegir cuota
  // pendiente para pagarla (DEU-2: el writer marca cuotas.pagada).
  const esCoop = meta.desgloseCuota && prestamo && prestamo.tipo === 'PRESTAMO';
  const cuotasPendientes = useMemo(
    () => (esCoop ? data.cuotas.filter((c) => c.prestamoId === prestamoId && !c.pagada).sort((a, b) => a.numero - b.numero) : []),
    [esCoop, data.cuotas, prestamoId],
  );

  // Al cambiar de concepto, resetea el destino que no aplica.
  useEffect(() => {
    if (!esPrestamo) { setPrestamoId(null); setCuotaId(null); }
    if (!esInversor) setInversorId(null);
    if (!meta.desgloseCuota) { setCapital(''); setInteres(''); setSeguro(''); }
  }, [label]); // eslint-disable-line react-hooks/exhaustive-deps

  // Al elegir una cuota del Coop, pre-llena su desglose (capital/interés/seguro).
  useEffect(() => {
    if (!cuotaId) return;
    const c = cuotasPendientes.find((x) => x.id === cuotaId);
    if (c) {
      setCapital(String(c.capital + c.abonoCapital || c.capital || ''));
      setInteres(String(c.interes || ''));
      setSeguro(String(c.seguro || ''));
      if (c.fechaPago) setFecha((f) => f || c.fechaPago);
    }
  }, [cuotaId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Para Cuota Préstamo el monto se calcula del desglose.
  const montoCalc = meta.desgloseCuota ? num(capital) + num(interes) + num(seguro) : num(monto);

  const targetOk = (!esPrestamo || !!prestamoId) && (!esInversor || !!inversorId);
  const cuentaInvalida = tries && !cuentaId;
  const valid = montoCalc > 0 && !!cuentaId && targetOk;

  const reset = () => {
    setMonto(''); setCapital(''); setInteres(''); setSeguro(''); setNotas('');
    setCuotaId(null); setTries(false);
  };

  const onSubmit = async () => {
    setTries(true);
    if (!valid) {
      if (!cuentaId) t.warn('Falta la cuenta', 'Elegí de qué cuenta sale/entra el dinero');
      else if (esPrestamo && !prestamoId) t.warn('Falta el préstamo/línea', 'Elegí el producto financiero');
      else if (esInversor && !inversorId) t.warn('Falta el inversor', 'Elegí el inversor');
      else t.warn('Monto inválido', 'El monto debe ser mayor a 0');
      return;
    }
    setBusy(true);
    try {
      await createPagoFinanciero({
        fecha,
        monto: montoCalc,
        cuentaId,
        tipo: meta.tipo,
        side: meta.side,
        prestamoId: esPrestamo ? prestamoId : null,
        inversorId: esInversor ? inversorId : null,
        cuotaId: esCoop ? cuotaId : null, // DEU-2
        notas: notas || label,
      });
      await data.refreshAll();
      const destino = esPrestamo ? (prestamo?.nombre || '') : esInversor ? (data.inversores.find((i) => i.id === inversorId)?.nombre || '') : '';
      t.ok('Movimiento registrado', `${label} · ${money(montoCalc)}${destino ? ' · ' + destino : ''}`);
      reset();
      onDone && onDone();
    } catch (e) {
      t.err('No se pudo registrar', e.message);
    }
    setBusy(false);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-4)' }}>
      <div className="info-box" style={{ fontSize: 12, color: 'var(--text-2)', background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.3)', borderRadius: 'var(--r-sm)', padding: 'var(--s-3) var(--s-4)' }}>
        Pagos a deuda e inversores. La cuota del Coop marca la cuota pagada en el schedule (DEU-2); el pago a inversor liga el inversor (INVR-1); disposiciones/cargos de línea suben el usado (DRAWDOWN, DEU-5).
      </div>

      <div className="grid-3">
        <Field label="Tipo" required>
          <Select value={label} onChange={setLabel} options={MOVFIN_TIPOS} />
        </Field>
        <Field label="Fecha" required>
          <DateInput value={fecha} onChange={setFecha} />
        </Field>
        <Field label="Cuenta" required hint="De dónde sale / a dónde entra el dinero">
          <CuentaSelect filter="todas" value={cuentaId} onChange={setCuentaId} invalid={cuentaInvalida} />
        </Field>
      </div>

      {esPrestamo && (
        <div className="grid-2">
          <Field label="Préstamo / línea" required hint={meta.soloPrestamo ? 'Solo el Coop tiene schedule de cuotas' : undefined}>
            <PrestamoSelect
              value={prestamoId}
              onChange={(v) => { setPrestamoId(v); setCuotaId(null); }}
            />
          </Field>
          {esCoop && (
            <Field label="Cuota a pagar" hint="Elegí la cuota pendiente del schedule (DEU-2)">
              <Select
                value={cuotaId ?? ''}
                onChange={(v) => setCuotaId(v === '' ? null : Number(v))}
                placeholder="— sin ligar a cuota —"
                options={cuotasPendientes.map((c) => ({ value: c.id, label: `#${c.numero} · ${fmtDate(c.fechaPago)} · ${money(c.montoTotal)}` }))}
              />
            </Field>
          )}
        </div>
      )}

      {esInversor && (
        <Field label="Inversor" required>
          <InversorSelect value={inversorId} onChange={setInversorId} />
        </Field>
      )}

      {meta.desgloseCuota ? (
        <>
          <div className="grid-3">
            <Field label="Capital (RD$)"><MoneyInput value={capital} onChange={setCapital} placeholder="0" /></Field>
            <Field label="Interés (RD$)"><MoneyInput value={interes} onChange={setInteres} placeholder="0" /></Field>
            <Field label="Seguro (RD$)"><MoneyInput value={seguro} onChange={setSeguro} placeholder="0" /></Field>
          </div>
          <Field label="Monto total (RD$)" hint="Calculado de capital + interés + seguro">
            <MoneyInput value={montoCalc || ''} onChange={() => {}} readOnly />
          </Field>
        </>
      ) : (
        <div className="grid-2">
          <Field label="Monto (RD$)" required>
            <MoneyInput value={monto} onChange={setMonto} placeholder="0" />
          </Field>
          <Field label="Notas" hint="opcional">
            <TextInput value={notas} onChange={setNotas} placeholder="descripción" />
          </Field>
        </div>
      )}

      {meta.desgloseCuota && (
        <Field label="Notas" hint="opcional">
          <TextInput value={notas} onChange={setNotas} placeholder="descripción" />
        </Field>
      )}

      <div style={{ display: 'flex', gap: 8 }}>
        <button className="btn" disabled={!valid || busy} onClick={onSubmit}>{busy ? 'Registrando…' : 'Registrar movimiento'}</button>
        <button className="btn ghost" disabled={busy} onClick={reset}>Limpiar</button>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════
// FormGastoAjuste — gasto operativo / ajuste / aporte / transferencia interna.
// Exige cuenta (CTA-1). Si es gasto se elige el medio de pago (regla 7: tarjeta
// → DRAWDOWN). Transferencia interna = TRANSFERENCIA_INTERNA + cuentaDestinoId
// en una sola fila (CTA-2).
// ════════════════════════════════════════════════════════════════

// Conceptos de gasto/ajuste. dir: dirección sugerida; transfer marca el flujo
// especial; tarjeta indica que puede pagarse con tarjeta (regla 7).
const CONCEPTOS_GASTO = [
  { label: 'Compra operativa', tipo: 'COMPRA_OPERATIVA', dir: 'salida', tarjeta: true },
  { label: 'Pago ADS', tipo: 'PAGO_ADS', dir: 'salida', tarjeta: true },
  { label: 'Pago Comisión', tipo: 'PAGO_COMISION', dir: 'salida', tarjeta: true },
  { label: 'Pago Transporte / Courier', tipo: 'PAGO_TRANSPORTE', dir: 'salida', tarjeta: true },
  { label: 'Fee bancario', tipo: 'FEE_BANCARIO', dir: 'salida' },
  { label: 'Aporte del dueño', tipo: 'APORTE_DUENO', dir: 'entrada' },
  { label: 'Refund de proveedor', tipo: 'REFUND_PROVEEDOR', dir: 'entrada' },
  { label: 'Refund a cliente', tipo: 'REFUND_CLIENTE', dir: 'salida' },
  { label: 'Ajuste', tipo: 'AJUSTE', dir: 'salida' },
  { label: 'Otro', tipo: 'OTROS', dir: 'salida' },
  { label: 'Transferencia interna', tipo: 'TRANSFERENCIA_INTERNA', dir: 'transfer' },
];

function FormGastoAjuste({ onDone }) {
  const data = useData();
  const t = useToast();
  const [conceptoLabel, setConceptoLabel] = useState('Compra operativa');
  const [fecha, setFecha] = useState(todayISO());
  const [dir, setDir] = useState('salida'); // entrada | salida (no aplica a transfer)
  // Para gastos/aportes: medio de pago (regla 7: tarjeta → DRAWDOWN + prestamoId).
  const [medio, setMedio] = useState({ cuentaId: null, prestamoId: null });
  // Para transferencias: cuenta origen + destino reales (CTA-2).
  const [origenId, setOrigenId] = useState(null);
  const [destinoId, setDestinoId] = useState(null);
  const [monto, setMonto] = useState('');
  const [notas, setNotas] = useState('');
  const [busy, setBusy] = useState(false);
  const [tries, setTries] = useState(false);

  const concepto = CONCEPTOS_GASTO.find((c) => c.label === conceptoLabel) || CONCEPTOS_GASTO[0];
  const esTransfer = concepto.dir === 'transfer';
  const esTarjeta = medio.prestamoId != null;

  // Al cambiar de concepto, sugiere la dirección (editable salvo transfer).
  useEffect(() => { if (concepto.dir !== 'transfer') setDir(concepto.dir); }, [conceptoLabel]); // eslint-disable-line react-hooks/exhaustive-deps

  const m = num(monto);
  const cuentaInvalida = tries && !esTransfer && !medio.cuentaId;
  const origenInvalido = tries && esTransfer && !origenId;
  const destinoInvalido = tries && esTransfer && (!destinoId || destinoId === origenId);
  const valid = m > 0 && (esTransfer
    ? (!!origenId && !!destinoId && origenId !== destinoId)
    : !!medio.cuentaId);

  const reset = () => { setMonto(''); setNotas(''); setTries(false); };

  const onSubmit = async () => {
    setTries(true);
    if (!valid) {
      if (m <= 0) t.warn('Monto inválido', 'El monto debe ser mayor a 0');
      else if (esTransfer && !origenId) t.warn('Falta cuenta origen', 'Elegí de dónde sale');
      else if (esTransfer && (!destinoId || destinoId === origenId)) t.warn('Cuenta destino inválida', 'Elegí una cuenta distinta de destino');
      else if (!esTransfer && !medio.cuentaId) t.warn('Falta la cuenta', 'Elegí el medio de pago');
      return;
    }
    setBusy(true);
    try {
      if (esTransfer) {
        // CTA-2: una sola fila TRANSFERENCIA_INTERNA con cuentaDestinoId.
        await createMovimiento({
          fecha,
          tipo: 'TRANSFERENCIA_INTERNA',
          cuentaId: origenId,
          cuentaDestinoId: destinoId,
          monto: m,
          notas: notas || 'Transferencia interna',
        });
        const nO = data.cuentas.find((c) => c.id === origenId)?.nombre || '';
        const nD = data.cuentas.find((c) => c.id === destinoId)?.nombre || '';
        t.ok('Transferencia registrada', `${nO} → ${nD} · ${money(m)}`);
      } else {
        // Gasto/aporte/ajuste. regla 7: si paga con tarjeta → DRAWDOWN + prestamoId
        // (el writer lo resuelve cuando recibe prestamoId).
        await createMovimiento({
          fecha,
          tipo: concepto.tipo,
          cuentaId: medio.cuentaId,
          prestamoId: medio.prestamoId, // si es tarjeta → DRAWDOWN (regla 7)
          monto: m,
          side: dir, // entrada | salida
          notas,
        });
        t.ok('Movimiento registrado', `${concepto.label} · ${dir === 'entrada' ? '+' : '−'}${money(m)}`);
      }
      await data.refreshAll();
      reset();
      onDone && onDone();
    } catch (e) {
      t.err('No se pudo registrar', e.message);
    }
    setBusy(false);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-4)' }}>
      <div className="info-box" style={{ fontSize: 12, color: 'var(--text-2)', background: 'rgba(59,130,246,0.08)', border: '1px solid rgba(59,130,246,0.3)', borderRadius: 'var(--r-sm)', padding: 'var(--s-3) var(--s-4)' }}>
        Gastos operativos, aportes, ajustes y transferencias. Elegí la cuenta real de donde sale/entra el dinero (CTA-1). Si pagás con tarjeta se registra como cargo a la tarjeta (DRAWDOWN, regla 7). Ventas, lotes y pagos de deuda usan sus propios apartados.
      </div>

      <div className="grid-3">
        <Field label="Concepto" required>
          <Select value={conceptoLabel} onChange={setConceptoLabel} options={CONCEPTOS_GASTO.map((c) => c.label)} />
        </Field>
        <Field label="Fecha" required>
          <DateInput value={fecha} onChange={setFecha} />
        </Field>
        {!esTransfer && (
          <Field label="Dirección">
            <Select value={dir} onChange={setDir} options={[
              { value: 'salida', label: 'Salida (dinero que sale)' },
              { value: 'entrada', label: 'Entrada (dinero que entra)' },
            ]} />
          </Field>
        )}
      </div>

      {esTransfer ? (
        <div className="grid-3">
          <Field label="Cuenta origen" required>
            <CuentaSelect filter="todas" value={origenId} onChange={setOrigenId} invalid={origenInvalido} />
          </Field>
          <Field label="Cuenta destino" required>
            <CuentaSelect filter="todas" value={destinoId} onChange={setDestinoId} invalid={destinoInvalido} />
          </Field>
          <Field label="Monto (RD$)" required hint="Sale de origen, entra a destino (CTA-2)">
            <MoneyInput value={monto} onChange={setMonto} placeholder="0" />
          </Field>
        </div>
      ) : (
        <div className="grid-3">
          <Field label="Medio de pago" required hint="Tarjeta = cargo a la tarjeta (DRAWDOWN)">
            <MedioPagoSelect value={medio} onChange={setMedio} invalid={cuentaInvalida} />
          </Field>
          <Field label="Monto (RD$)" required>
            <MoneyInput value={monto} onChange={setMonto} placeholder="0" />
          </Field>
          <Field label="Notas" hint="opcional · contraparte, descripción">
            <TextInput value={notas} onChange={setNotas} placeholder="ej. Facebook · banco · descripción" />
          </Field>
        </div>
      )}

      {esTransfer && (
        <Field label="Notas" hint="opcional">
          <TextInput value={notas} onChange={setNotas} placeholder="descripción de la transferencia" />
        </Field>
      )}

      {esTarjeta && !esTransfer && (
        <div className="field-hint" style={{ color: 'var(--accent)' }}>
          Se registrará como cargo a la tarjeta (DRAWDOWN) y subirá su usado.
        </div>
      )}

      <div style={{ display: 'flex', gap: 8 }}>
        <button className="btn" disabled={!valid || busy} onClick={onSubmit}>
          {busy ? 'Registrando…' : esTransfer ? 'Registrar transferencia' : 'Registrar movimiento'}
        </button>
        <button className="btn ghost" disabled={busy} onClick={reset}>Limpiar</button>
      </div>
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
