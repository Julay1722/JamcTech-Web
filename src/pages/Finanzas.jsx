// ════════════════════════════════════════════════════════════════
// Finanzas — Resumen · Deudas (Análisis/Préstamos/Tarjetas) · Inversores ·
// Banco (Cuentas/Movimientos).
//
// Reescritura desde el monolito (FinanzasPage 4180+). Reproduce la INTENCIÓN,
// no los bugs (ver jamc-reglas / BUGS_DATOS.md):
//  - INVR-1: pago a inversor lleva inversor_id (createPagoFinanciero) → la vista baja.
//  - INVR-2: PagoMensualModal pre-llena con (devengado − ya pagado), NO el
//    devengado total de por vida (evita sobrepago).
//  - INVR-3: createInversor escribe es_dueno (el writer ya lo hace).
//  - INVR-4: compensaciones llevan subordinaA + frecuencia.
//  - DEU-2: pagar una cuota marca cuotas.pagada (createPagoFinanciero con cuotaId).
//  - DEU-6: removePrestamo / removeInversor / removeCuenta son soft-delete (en writers).
//  - regla 9: devengo de compensaciones = acumulado de por vida (no ciclos que reinician).
//  - regla 7/8: cargo a tarjeta = DRAWDOWN + prestamo_id (vía MedioPagoSelect / createMovimiento).
//
// Toda la lógica de saldos vive en las vistas vw_* (data.cuentas/prestamos/
// inversores/cuotas/movimientos). Aquí solo se muestra y se alimentan writers.
// ════════════════════════════════════════════════════════════════
import { useState, useMemo, useEffect } from 'react';
import { useData } from '../hooks/useData.jsx';
import {
  createCuenta, createPrestamo, createInversor, updateInversor,
  createCompensacion, updateCompensacion, removeCompensacion,
  createPagoFinanciero,
  removeCuenta, removePrestamo, removeInversor,
} from '../lib/db/writers.js';
import { Modal, useConfirm } from '../components/Modal.jsx';
import { Field, TextInput, NumberInput, MoneyInput, DateInput, TextArea, Select } from '../components/Form.jsx';
import { DataTable } from '../components/Table.jsx';
import { CuentaSelect, MedioPagoSelect, ContraparteSelect } from '../components/Pickers.jsx';
import { KPI } from '../components/Charts.jsx';
import { useToast } from '../components/Toast.jsx';
import { money, intNum, fmtDate, todayISO, num } from '../lib/format.js';
import LibroPage from './Libro.jsx';

/* ──────────── Metadatos de métodos de compensación (del monolito) ──────────── */
const TIPO_COMPENSACION_META = {
  DIVIDENDO_PREFERENTE: { label: 'Dividendo Preferente', color: '#0ea5e9', frecuencia: 'TRIMESTRAL', desc: 'X% anual sobre el capital, pagado trimestralmente. Primero en prelación.', fields: ['pct'] },
  ROYALTY_BRUTO: { label: 'Royalty s/ Ingresos', color: '#0ea5e9', frecuencia: 'MENSUAL', desc: 'X% de ventas mensuales hasta recuperar una porción del capital.', fields: ['pct', 'cap'] },
  RBF: { label: 'Revenue-Based Financing', color: '#0ea5e9', frecuencia: 'MENSUAL', desc: '% mensual de ingresos hasta alcanzar el cap (típico 2× capital).', fields: ['pct', 'cap'] },
  SALARIO_PRO_LABORE: { label: 'Salario / Pro-Labore', color: '#7c5cff', frecuencia: 'MENSUAL', desc: 'Sueldo mensual fijo del dueño como operador.', fields: ['cuotaMensual'] },
  UTILIDADES_SUBORD: { label: 'Reparto Utilidades', color: '#7c5cff', frecuencia: 'MENSUAL', desc: 'X% de las utilidades del mes, después del dividendo preferente.', fields: ['pct'] },
  COMISION_SKU: { label: 'Comisión por SKU', color: '#7c5cff', frecuencia: 'MENSUAL', desc: 'Monto fijo por cada unidad vendida ese mes.', fields: ['montoPorUnidad'] },
  REINVERSION: { label: 'Reinversión Utilidades', color: '#7c5cff', frecuencia: 'MENSUAL', desc: '% de utilidades reinvertidas (suma al capital, no es cash).', fields: ['pct'] },
  CASHFLOW_ANUAL: { label: '% Cashflow Anual', color: '#7c5cff', frecuencia: 'ANUAL', desc: 'Al cierre del año, X% del cashflow positivo se paga al dueño.', fields: ['pct'] },
  EXCEDENTE_REAL: { label: '% Excedente Real', color: '#22c55e', frecuencia: 'MENSUAL', desc: 'X% de lo que queda cada mes tras gastos y deuda. Solo meses positivos.', fields: ['pct'] },
  FLAT: { label: 'Retorno Fijo (2× capital)', color: '#847b64', frecuencia: 'UNICO', desc: 'Devuelve un monto pactado total (sin método dinámico).', fields: ['retorno'] },
};
const COMP_OPTIONS = Object.entries(TIPO_COMPENSACION_META).map(([value, m]) => ({ value, label: m.label }));
const FRECUENCIAS = ['MENSUAL', 'TRIMESTRAL', 'ANUAL', 'UNICO'];

const usoCls = (pct) => (pct > 80 ? 'danger' : pct > 50 ? 'warning' : 'success');

export default function FinanzasPage({ onNavigate }) {
  const data = useData();
  const [tab, setTab] = useState('resumen'); // resumen | analisis | prestamos | tarjetas | inversores | cuentas | movimientos

  if (data.loading) {
    return (
      <div>
        <div className="topbar"><div><h1>Finanzas</h1><div className="sub">Cargando…</div></div></div>
        <div className="section"><div className="empty">Cargando finanzas…</div></div>
      </div>
    );
  }

  const prestamos = data.prestamos || [];
  const inversores = data.inversores || [];
  const cuentas = data.cuentas || [];

  // Préstamos amortizados (PRESTAMO + LINEA_CREDITO van al tab Préstamos).
  const prestamosTab = prestamos.filter((p) => p.tipo === 'PRESTAMO' || p.tipo === 'LINEA_CREDITO');
  // Tarjetas: TARJETA_CREDITO (revolventes con corte).
  const tarjetas = prestamos.filter((p) => p.tipo === 'TARJETA_CREDITO');

  const enDeudas = ['analisis', 'prestamos', 'tarjetas'].includes(tab);
  const enBanco = ['cuentas', 'movimientos'].includes(tab);
  const showNuevo = ['prestamos', 'tarjetas', 'inversores', 'cuentas'].includes(tab);

  return (
    <div>
      <div className="topbar">
        <div>
          <h1>Finanzas</h1>
          <div className="sub">Préstamos · tarjetas · inversores · banco</div>
        </div>
      </div>

      {/* Tabs nivel 1 (4 grupos) */}
      <div className="tabs">
        <button className={tab === 'resumen' ? 'tab active' : 'tab'} onClick={() => setTab('resumen')}>Resumen</button>
        <button className={enDeudas ? 'tab active' : 'tab'} onClick={() => setTab('analisis')}>Deudas</button>
        <button className={tab === 'inversores' ? 'tab active' : 'tab'} onClick={() => setTab('inversores')}>Inversores</button>
        <button className={enBanco ? 'tab active' : 'tab'} onClick={() => setTab('cuentas')}>Banco</button>
      </div>

      {/* Sub-subtabs de Deudas */}
      {enDeudas && (
        <div className="tabs" style={{ marginTop: 'calc(-1 * var(--s-2))' }}>
          <button className={tab === 'analisis' ? 'tab active' : 'tab'} onClick={() => setTab('analisis')}>Análisis</button>
          <button className={tab === 'prestamos' ? 'tab active' : 'tab'} onClick={() => setTab('prestamos')}>Préstamos</button>
          <button className={tab === 'tarjetas' ? 'tab active' : 'tab'} onClick={() => setTab('tarjetas')}>Tarjetas</button>
        </div>
      )}
      {/* Sub-subtabs de Banco */}
      {enBanco && (
        <div className="tabs" style={{ marginTop: 'calc(-1 * var(--s-2))' }}>
          <button className={tab === 'cuentas' ? 'tab active' : 'tab'} onClick={() => setTab('cuentas')}>Cuentas</button>
          <button className={tab === 'movimientos' ? 'tab active' : 'tab'} onClick={() => setTab('movimientos')}>Movimientos</button>
        </div>
      )}

      {tab === 'resumen' && <ResumenTab prestamos={prestamos} inversores={inversores} cuentas={cuentas} />}
      {tab === 'analisis' && <AnalisisTab prestamosTab={prestamosTab} tarjetas={tarjetas} inversores={inversores} cuentas={cuentas} />}
      {tab === 'prestamos' && <PrestamosTab prestamos={prestamosTab} />}
      {tab === 'tarjetas' && <TarjetasTab tarjetas={tarjetas} />}
      {tab === 'inversores' && <InversoresTab inversores={inversores} />}
      {tab === 'cuentas' && <CuentasTab cuentas={cuentas} />}
      {tab === 'movimientos' && <LibroPage embedded onNavigate={onNavigate} />}
    </div>
  );
}

/* ════════════════════════ RESUMEN ════════════════════════ */
function ResumenTab({ prestamos, inversores, cuentas }) {
  const deudaTotal = prestamos.reduce((s, p) => s + p.saldoPendiente, 0);
  const liquido = cuentas.filter((c) => c.esLiquida).reduce((s, c) => s + c.saldo, 0);
  const invExternos = inversores.filter((i) => !i.esDueno);
  const pendienteInv = invExternos.reduce((s, i) => s + i.saldoPendiente, 0);
  const aportadoInv = invExternos.reduce((s, i) => s + i.capitalInvertido, 0);

  return (
    <>
      <div className="kpi-row">
        <KPI label="Deuda total" currency value={intNum(deudaTotal)} deltaLabel={`${prestamos.filter((p) => p.saldoPendiente > 0).length} productos con saldo`} />
        <KPI label="Capital líquido" currency value={intNum(liquido)} deltaLabel="débito + efectivo" />
        <KPI label="Pendiente a inversores" currency value={intNum(pendienteInv)} deltaLabel={`${invExternos.length} externo(s)`} />
        <KPI label="Capital de inversores" currency value={intNum(aportadoInv)} deltaLabel="aportado al negocio" />
      </div>

      <div className="grid-2">
        <div className="section">
          <div className="section-head">
            <div className="section-title">Deudas</div>
            <div className="section-desc">{prestamos.length} producto(s) · saldo desde vw_saldo_prestamo</div>
          </div>
          <DataTable
            getRowKey={(p) => p.id}
            columns={[
              { key: 'nombre', label: 'Producto' },
              { key: 'tipo', label: 'Tipo', render: (p) => <span className="muted">{p.tipo.replace('_', ' ').toLowerCase()}</span> },
              { key: 'saldoPendiente', label: 'Saldo', align: 'right', num: true, render: (p) => <span style={{ color: 'var(--danger)' }}>{money(p.saldoPendiente, p.moneda === 'USD' ? 'USD$' : 'RD$')}</span> },
            ]}
            rows={prestamos}
            empty="Sin préstamos · agrégalos en Deudas › Préstamos"
          />
        </div>

        <div className="section">
          <div className="section-head">
            <div className="section-title">Inversores externos</div>
            <div className="section-desc">{invExternos.length} inversor(es) que esperan retorno</div>
          </div>
          <DataTable
            getRowKey={(i) => i.id}
            columns={[
              { key: 'nombre', label: 'Inversor' },
              { key: 'capitalInvertido', label: 'Aporte', align: 'right', num: true, render: (i) => money(i.capitalInvertido) },
              { key: 'totalDevuelto', label: 'Pagado', align: 'right', num: true, render: (i) => <span style={{ color: 'var(--success)' }}>{money(i.totalDevuelto)}</span> },
              { key: 'saldoPendiente', label: 'Pendiente', align: 'right', num: true, render: (i) => <span style={{ color: 'var(--warning)' }}>{money(i.saldoPendiente)}</span> },
            ]}
            rows={invExternos}
            empty="Sin inversores externos · agrégalos en la pestaña Inversores"
          />
        </div>
      </div>
    </>
  );
}

/* ════════════════════════ ANÁLISIS DE DEUDA (semáforo) ════════════════════════ */
function AnalisisTab({ prestamosTab, tarjetas, inversores, cuentas }) {
  const data = useData();

  const a = useMemo(() => {
    // Cashflow operacional promedio mensual (últimos 6 meses, solo CASHFLOW).
    const now = new Date();
    const cutoff = new Date(now.getFullYear(), now.getMonth() - 5, 1);
    const byMonth = {};
    (data.movimientos || []).forEach((m) => {
      if (m.naturaleza !== 'CASHFLOW' || !m.fecha) return;
      const d = new Date(m.fecha + 'T00:00:00');
      if (d < cutoff) return;
      const ym = m.fecha.slice(0, 7);
      (byMonth[ym] ||= { e: 0, s: 0 });
      byMonth[ym].e += m.entrada;
      byMonth[ym].s += m.salida;
    });
    const meses = Object.values(byMonth);
    const cashflowProm = meses.length ? meses.reduce((s, b) => s + (b.e - b.s), 0) / meses.length : 0;

    // Pagos mensuales estimados a deudas.
    let pagoPrestamos = 0;
    const breakdown = [];
    prestamosTab.forEach((p) => {
      if (p.saldoPendiente <= 0) return;
      // Cuota: si hay schedule, usar la cuota típica; si no, 5% del saldo.
      const cuotasP = (data.cuotas || []).filter((c) => c.prestamoId === p.id);
      let cuota;
      if (p.tipo === 'PRESTAMO' && cuotasP.length) {
        const tot = cuotasP.map((c) => c.montoTotal).filter((x) => x > 0).sort((x, y) => x - y);
        cuota = tot.length ? tot[Math.floor(tot.length / 2)] : p.saldoPendiente * 0.05;
      } else {
        cuota = p.saldoPendiente * 0.05; // línea: pago mínimo estándar
      }
      pagoPrestamos += cuota;
      breakdown.push({ nombre: p.nombre, tipo: p.tipo, monto: cuota });
    });
    let pagoTarjetas = 0;
    tarjetas.forEach((t) => {
      if (t.saldoPendiente <= 0) return;
      const cuota = t.saldoPendiente * 0.05;
      pagoTarjetas += cuota;
      breakdown.push({ nombre: t.nombre, tipo: 'TARJETA_CREDITO', monto: cuota });
    });

    const pagoTotal = pagoPrestamos + pagoTarjetas;
    const cobertura = pagoTotal > 0 ? cashflowProm / pagoTotal : (cashflowProm > 0 ? 99 : 0);
    let semaforo = 'success', mensaje = 'Cómodo: el flujo cubre los pagos con holgura.';
    if (cobertura < 1) { semaforo = 'danger'; mensaje = 'Riesgo: el flujo mensual NO cubre los pagos de deuda.'; }
    else if (cobertura < 1.5) { semaforo = 'warning'; mensaje = 'Ajustado: el flujo cubre los pagos pero con poco margen.'; }

    const deudaTotal = [...prestamosTab, ...tarjetas].reduce((s, p) => s + p.saldoPendiente, 0);
    return { cashflowProm, pagoTotal, pagoPrestamos, pagoTarjetas, cobertura, semaforo, mensaje, breakdown, deudaTotal, nMeses: meses.length };
  }, [data.movimientos, data.cuotas, prestamosTab, tarjetas]);

  return (
    <>
      <div className="kpi-row">
        <KPI label="Cash flow mensual prom." currency value={intNum(a.cashflowProm)} delta={a.cashflowProm >= 0 ? 1 : -1} deltaLabel={`últimos ${a.nMeses} mes(es)`} />
        <KPI label="Pago mensual a deudas" currency value={intNum(a.pagoTotal)} deltaLabel="cuotas + mínimos est." />
        <KPI label="Cobertura" value={a.cobertura >= 99 ? '∞' : a.cobertura.toFixed(2) + '×'} deltaLabel="flujo / pagos" />
        <KPI label="Deuda total" currency value={intNum(a.deudaTotal)} deltaLabel="saldo pendiente" />
      </div>

      <div className="section">
        <div className="section-head"><div className="section-title">Semáforo de deuda</div></div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: 'var(--s-3)' }}>
          <span style={{ width: 18, height: 18, borderRadius: '50%', background: `var(--${a.semaforo})`, flexShrink: 0 }} />
          <div>
            <div style={{ fontWeight: 600, color: `var(--${a.semaforo})` }}>
              {a.semaforo === 'success' ? 'Verde' : a.semaforo === 'warning' ? 'Amarillo' : 'Rojo'}
            </div>
            <div style={{ fontSize: 13, color: 'var(--text-2)' }}>{a.mensaje}</div>
          </div>
        </div>
        <div className="field-hint" style={{ padding: '0 var(--s-3) var(--s-3)' }}>
          Estimación: préstamos amortizados usan la cuota mediana del schedule; líneas/tarjetas usan 5% del saldo
          como pago mínimo. El flujo operacional excluye movimientos financieros.
        </div>
      </div>

      <div className="section">
        <div className="section-head">
          <div className="section-title">Desglose de pagos mensuales</div>
          <div className="section-desc">{a.breakdown.length} producto(s) con saldo</div>
        </div>
        <DataTable
          getRowKey={(r) => r.nombre}
          columns={[
            { key: 'nombre', label: 'Producto' },
            { key: 'tipo', label: 'Tipo', render: (r) => <span className="muted">{r.tipo.replace('_', ' ').toLowerCase()}</span> },
            { key: 'monto', label: 'Pago mensual est.', align: 'right', num: true, render: (r) => money(r.monto) },
          ]}
          rows={a.breakdown}
          empty="Sin deudas con saldo pendiente"
        />
      </div>
    </>
  );
}

/* ════════════════════════ PRÉSTAMOS ════════════════════════ */
function PrestamosTab({ prestamos }) {
  const data = useData();
  const t = useToast();
  const [confirm, confirmNode] = useConfirm();
  const [showNuevo, setShowNuevo] = useState(false);
  const [sel, setSel] = useState(null);

  const doDelete = async (p) => {
    const ok = await confirm({ title: `¿Eliminar ${p.nombre}?`, body: 'Se desactiva el préstamo (soft-delete). Los movimientos quedan en el historial.', confirmLabel: 'Eliminar' });
    if (!ok) return;
    try { await removePrestamo(p.id); await data.refreshAll(); t.ok('Préstamo eliminado', p.nombre); }
    catch (e) { t.err('No se pudo eliminar', e.message); }
  };

  return (
    <>
      <div className="section">
        <div className="section-head">
          <div>
            <div className="section-title">Préstamos y líneas de crédito</div>
            <div className="section-desc">Click en una fila para ver el detalle de amortización</div>
          </div>
          <button className="btn" onClick={() => setShowNuevo(true)}>+ Nuevo préstamo</button>
        </div>
        <DataTable
          getRowKey={(p) => p.id}
          onRowClick={(p) => setSel(sel?.id === p.id ? null : p)}
          columns={[
            { key: 'nombre', label: 'Nombre' },
            { key: 'tipo', label: 'Tipo', render: (p) => <span className="muted">{p.tipo === 'LINEA_CREDITO' ? 'línea de crédito' : 'préstamo amortizado'}</span> },
            { key: 'montoInicial', label: 'Monto / Límite', align: 'right', num: true, render: (p) => money(p.tipo === 'LINEA_CREDITO' ? p.limiteCredito : p.montoInicial, p.moneda === 'USD' ? 'USD$' : 'RD$') },
            { key: 'capitalPagado', label: 'Capital pagado', align: 'right', num: true, render: (p) => <span style={{ color: 'var(--success)' }}>{money(p.capitalPagado)}</span> },
            { key: 'saldoPendiente', label: 'Saldo / Usado', align: 'right', num: true, render: (p) => <span style={{ color: 'var(--danger)' }}>{money(p.saldoPendiente, p.moneda === 'USD' ? 'USD$' : 'RD$')}</span> },
            { key: 'tasaMensual', label: 'Tasa', align: 'right', num: true, render: (p) => (p.tasaMensual ? `${(p.tasaMensual * 100).toFixed(2)}%/mes` : '—') },
            { key: 'acciones', label: '', align: 'right', render: (p) => <button className="icon-btn danger" title="Eliminar" onClick={(e) => { e.stopPropagation(); doDelete(p); }}>×</button> },
          ]}
          rows={prestamos}
          empty="Sin préstamos · click + Nuevo préstamo"
        />
      </div>

      {sel && <DetalleAmortizacion prestamo={sel} />}

      {showNuevo && (
        <Modal title="Nuevo préstamo o línea de crédito" width={640} onClose={() => setShowNuevo(false)}>
          <FormPrestamo onDone={() => setShowNuevo(false)} />
        </Modal>
      )}
      {confirmNode}
    </>
  );
}

// Detalle de amortización: cuotas reales (data.cuotas) + registrar pago de cuota.
function DetalleAmortizacion({ prestamo }) {
  const data = useData();
  const t = useToast();
  const cuotas = (data.cuotas || []).filter((c) => c.prestamoId === prestamo.id);
  const [pagando, setPagando] = useState(null); // cuota a pagar
  const [cuentaId, setCuentaId] = useState(null);
  const [busy, setBusy] = useState(false);

  const proxima = cuotas.find((c) => !c.pagada);
  const pagadas = cuotas.filter((c) => c.pagada).length;
  const interesProyectado = cuotas.filter((c) => !c.pagada).reduce((s, c) => s + c.interes, 0);

  const tipoPago = prestamo.tipo === 'LINEA_CREDITO' ? 'PAGO_LINEA_CREDITO' : 'PAGO_PRESTAMO';

  const onPagar = async () => {
    if (!cuentaId) { t.warn('Falta la cuenta', 'Elegí de qué cuenta sale el pago'); return; }
    setBusy(true);
    try {
      await createPagoFinanciero({
        fecha: todayISO(), monto: pagando.montoTotal, cuentaId,
        tipo: tipoPago, side: 'salida', prestamoId: prestamo.id, cuotaId: pagando.id, // DEU-2
        notas: `Pago cuota #${pagando.numero} · ${prestamo.nombre}`,
      });
      await data.refreshAll();
      t.ok('Cuota pagada', `#${pagando.numero} · ${money(pagando.montoTotal)}`);
      setPagando(null); setCuentaId(null);
    } catch (e) { t.err('No se pudo pagar', e.message); }
    setBusy(false);
  };

  if (!cuotas.length) {
    return (
      <div className="section">
        <div className="section-head"><div className="section-title">Amortización · {prestamo.nombre}</div></div>
        <div className="empty">Este producto no tiene schedule de cuotas generado.</div>
      </div>
    );
  }

  return (
    <div className="section">
      <div className="section-head">
        <div>
          <div className="section-title">Amortización · {prestamo.nombre}</div>
          <div className="section-desc">
            {cuotas.length} cuota(s) · {pagadas} pagada(s) · {cuotas.length - pagadas} restante(s) · interés proyectado {money(interesProyectado)}
          </div>
        </div>
        {proxima && <span className="pill">Próxima: #{proxima.numero} · {money(proxima.montoTotal)}</span>}
      </div>
      <div style={{ maxHeight: 420, overflowY: 'auto' }}>
        <DataTable
          getRowKey={(c) => c.id}
          columns={[
            { key: 'numero', label: '#', align: 'right', num: true },
            { key: 'fechaPago', label: 'Fecha', render: (c) => fmtDate(c.fechaPago) },
            { key: 'capital', label: 'Capital', align: 'right', num: true, render: (c) => money(c.capital) },
            { key: 'interes', label: 'Interés', align: 'right', num: true, render: (c) => <span style={{ color: 'var(--danger)' }}>{money(c.interes)}</span> },
            { key: 'seguro', label: 'Seguro', align: 'right', num: true, render: (c) => (c.seguro > 0 ? money(c.seguro) : '—') },
            { key: 'montoTotal', label: 'Cuota', align: 'right', num: true, render: (c) => money(c.montoTotal) },
            { key: 'saldoPost', label: 'Saldo después', align: 'right', num: true, render: (c) => (c.saldoPost != null ? money(c.saldoPost) : '—') },
            {
              key: 'estado', label: 'Estado', align: 'right',
              render: (c) => c.pagada
                ? <span className="badge success">✓ {c.fechaPagada ? fmtDate(c.fechaPagada) : 'pagada'}</span>
                : <button className="btn ghost" style={{ fontSize: 11, padding: '2px 10px' }} onClick={() => { setPagando(c); setCuentaId(null); }}>Registrar pago</button>,
            },
          ]}
          rows={cuotas}
          empty="Sin cuotas"
        />
      </div>

      {pagando && (
        <Modal title={`Pagar cuota #${pagando.numero}`} width={460} onClose={() => setPagando(null)}>
          <div className="summary" style={{ marginBottom: 'var(--s-3)' }}>
            <div className="summary-item"><span className="lbl">Capital</span><span className="val">{money(pagando.capital)}</span></div>
            <div className="summary-item"><span className="lbl">Interés</span><span className="val">{money(pagando.interes)}</span></div>
            {pagando.seguro > 0 && <div className="summary-item"><span className="lbl">Seguro</span><span className="val">{money(pagando.seguro)}</span></div>}
            <div className="summary-item"><span className="lbl">Total a pagar</span><span className="val">{money(pagando.montoTotal)}</span></div>
          </div>
          <Field label="Cuenta de pago" required hint="De qué cuenta líquida sale el dinero">
            <CuentaSelect filter="liquidas" value={cuentaId} onChange={setCuentaId} invalid={busy && !cuentaId} />
          </Field>
          <div className="modal-actions" style={{ marginTop: 'var(--s-4)' }}>
            <button className="btn ghost" disabled={busy} onClick={() => setPagando(null)}>Cancelar</button>
            <button className="btn" disabled={busy || !cuentaId} onClick={onPagar}>{busy ? 'Pagando…' : `Pagar ${money(pagando.montoTotal)}`}</button>
          </div>
        </Modal>
      )}
    </div>
  );
}

/* ════════════════════════ TARJETAS ════════════════════════ */
function TarjetasTab({ tarjetas }) {
  const data = useData();
  const t = useToast();
  const [confirm, confirmNode] = useConfirm();
  const [showNuevo, setShowNuevo] = useState(false);
  const [sel, setSel] = useState(null);

  const doDelete = async (p) => {
    const ok = await confirm({ title: `¿Eliminar ${p.nombre}?`, body: 'Se desactiva la tarjeta (soft-delete). Los movimientos quedan en el historial.', confirmLabel: 'Eliminar' });
    if (!ok) return;
    try { await removePrestamo(p.id); await data.refreshAll(); t.ok('Tarjeta eliminada', p.nombre); }
    catch (e) { t.err('No se pudo eliminar', e.message); }
  };

  return (
    <>
      <div className="section">
        <div className="section-head">
          <div>
            <div className="section-title">Tarjetas de crédito</div>
            <div className="section-desc">Click en una fila para ver los usos (cargos y pagos)</div>
          </div>
          <button className="btn" onClick={() => setShowNuevo(true)}>+ Nueva tarjeta</button>
        </div>
        <DataTable
          getRowKey={(p) => p.id}
          onRowClick={(p) => setSel(sel?.id === p.id ? null : p)}
          columns={[
            { key: 'nombre', label: 'Tarjeta' },
            { key: 'limiteCredito', label: 'Límite', align: 'right', num: true, render: (p) => money(p.limiteCredito, p.moneda === 'USD' ? 'USD$' : 'RD$') },
            { key: 'usado', label: 'Usado', align: 'right', num: true, render: (p) => money(p.usado, p.moneda === 'USD' ? 'USD$' : 'RD$') },
            { key: 'disp', label: 'Disponible', align: 'right', num: true, render: (p) => <span style={{ color: 'var(--success)' }}>{money(Math.max(0, p.limiteCredito - p.usado), p.moneda === 'USD' ? 'USD$' : 'RD$')}</span> },
            {
              key: 'uso', label: '% uso', align: 'right',
              render: (p) => { const pct = p.limiteCredito > 0 ? (p.usado / p.limiteCredito) * 100 : 0; return <span className={`badge ${usoCls(pct)}`}>{pct.toFixed(1)}%</span>; },
            },
            { key: 'acciones', label: '', align: 'right', render: (p) => <button className="icon-btn danger" title="Eliminar" onClick={(e) => { e.stopPropagation(); doDelete(p); }}>×</button> },
          ]}
          rows={tarjetas}
          empty="Sin tarjetas · click + Nueva tarjeta"
        />
      </div>

      {sel && <DetalleUsosTarjeta tarjeta={sel} />}

      {showNuevo && (
        <Modal title="Nueva tarjeta de crédito" width={640} onClose={() => setShowNuevo(false)}>
          <FormPrestamo tipoFijo="TARJETA_CREDITO" onDone={() => setShowNuevo(false)} />
        </Modal>
      )}
      {confirmNode}
    </>
  );
}

// Usos de la tarjeta: movimientos ligados por prestamoId (regla 7/8).
function DetalleUsosTarjeta({ tarjeta }) {
  const data = useData();
  const usos = useMemo(() => {
    const movs = (data.movimientos || []).filter((m) => m.prestamoId === tarjeta.id);
    const asc = movs.slice().sort((a, b) => (a.fecha || '').localeCompare(b.fecha || '') || a.id - b.id);
    let saldo = 0;
    const rows = asc.map((m) => {
      // entrada (DRAWDOWN) = cargo (sube usado); salida = pago (baja usado).
      const cargo = m.entrada;
      const pago = m.salida;
      saldo += cargo - pago;
      return { ...m, cargo, pago, saldoDespues: saldo };
    });
    return rows.reverse();
  }, [data.movimientos, tarjeta.id]);

  return (
    <div className="section">
      <div className="section-head">
        <div>
          <div className="section-title">Usos · {tarjeta.nombre}</div>
          <div className="section-desc">
            {usos.length} movimiento(s) · límite {money(tarjeta.limiteCredito)} · usado {money(tarjeta.usado)} · disponible {money(Math.max(0, tarjeta.limiteCredito - tarjeta.usado))}
          </div>
        </div>
      </div>
      <div style={{ maxHeight: 420, overflowY: 'auto' }}>
        <DataTable
          getRowKey={(m) => m.id}
          columns={[
            { key: 'fecha', label: 'Fecha', render: (m) => fmtDate(m.fecha) },
            { key: 'tipo', label: 'Tipo', render: (m) => <span className="muted" style={{ fontSize: 11 }}>{m.tipo}</span> },
            { key: 'notas', label: 'Concepto', render: (m) => m.notas || <span className="muted">—</span> },
            { key: 'cargo', label: 'Cargo', align: 'right', num: true, render: (m) => (m.cargo > 0 ? <span style={{ color: 'var(--danger)' }}>{money(m.cargo)}</span> : '—') },
            { key: 'pago', label: 'Pago', align: 'right', num: true, render: (m) => (m.pago > 0 ? <span style={{ color: 'var(--success)' }}>{money(m.pago)}</span> : '—') },
            { key: 'saldoDespues', label: 'Saldo', align: 'right', num: true, render: (m) => money(m.saldoDespues) },
          ]}
          rows={usos}
          empty="Sin usos registrados · los cargos a esta tarjeta aparecen aquí (DRAWDOWN ligado por prestamo_id)"
        />
      </div>
    </div>
  );
}

/* ════════════════════════ INVERSORES ════════════════════════ */
function InversoresTab({ inversores }) {
  const data = useData();
  const t = useToast();
  const [confirm, confirmNode] = useConfirm();
  const [showNuevo, setShowNuevo] = useState(false);
  const [sel, setSel] = useState(null);

  const externos = inversores.filter((i) => !i.esDueno);
  const duenos = inversores.filter((i) => i.esDueno);

  const doDelete = async (i) => {
    const ok = await confirm({ title: `¿Eliminar ${i.nombre}?`, body: 'Se desactiva el inversor (soft-delete). Los pagos quedan en el historial.', confirmLabel: 'Eliminar' });
    if (!ok) return;
    try { await removeInversor(i.id); await data.refreshAll(); t.ok('Inversor eliminado', i.nombre); }
    catch (e) { t.err('No se pudo eliminar', e.message); }
  };

  const tabla = (items, empty) => (
    <DataTable
      getRowKey={(i) => i.id}
      onRowClick={(i) => setSel(sel?.id === i.id ? null : i)}
      columns={[
        { key: 'nombre', label: 'Nombre', render: (i) => <>{i.nombre}{i.esDueno && <span className="badge success" style={{ marginLeft: 6, fontSize: 9 }}>DUEÑO</span>}</> },
        { key: 'comp', label: 'Reglas', align: 'right', num: true, render: (i) => i.compensaciones.length },
        { key: 'capitalInvertido', label: 'Capital', align: 'right', num: true, render: (i) => money(i.capitalInvertido) },
        { key: 'montoPactadoDevolver', label: 'Target', align: 'right', num: true, render: (i) => (i.esDueno ? '∞' : money(i.montoPactadoDevolver)) },
        { key: 'totalDevuelto', label: 'Pagado', align: 'right', num: true, render: (i) => <span style={{ color: 'var(--success)' }}>{money(i.totalDevuelto)}</span> },
        { key: 'saldoPendiente', label: 'Pendiente', align: 'right', num: true, render: (i) => (i.esDueno ? '—' : <span style={{ color: 'var(--warning)' }}>{money(i.saldoPendiente)}</span>) },
        { key: 'acciones', label: '', align: 'right', render: (i) => <button className="icon-btn danger" title="Eliminar" onClick={(e) => { e.stopPropagation(); doDelete(i); }}>×</button> },
      ]}
      rows={items}
      empty={empty}
    />
  );

  return (
    <>
      <div className="section">
        <div className="section-head">
          <div>
            <div className="section-title">Inversores externos</div>
            <div className="section-desc">{externos.length} inversor(es) que esperan retorno · click para ver reglas y pagos</div>
          </div>
          <button className="btn" onClick={() => setShowNuevo(true)}>+ Nuevo inversor</button>
        </div>
        {tabla(externos, 'Sin inversores externos · click + Nuevo inversor')}
      </div>

      {duenos.length > 0 && (
        <div className="section">
          <div className="section-head">
            <div>
              <div className="section-title">Aportes del dueño</div>
              <div className="section-desc">{duenos.length} aporte(s) propio(s) · no son deudas</div>
            </div>
          </div>
          {tabla(duenos, 'Sin aportes del dueño')}
        </div>
      )}

      {sel && <DetalleInversor inversor={data.inversores.find((i) => i.id === sel.id) || sel} />}

      {showNuevo && (
        <Modal title="Nuevo inversor" width={560} onClose={() => setShowNuevo(false)}>
          <FormInversor onDone={() => setShowNuevo(false)} />
        </Modal>
      )}
      {confirmNode}
    </>
  );
}

// Detalle inversor: reglas de compensación (CRUD) + pagos + modal de pago mensual.
function DetalleInversor({ inversor }) {
  const data = useData();
  const reglas = inversor.compensaciones || [];
  const esDueno = inversor.esDueno;

  // Pagos hechos a este inversor (movimientos ligados por inversorId).
  const pagos = useMemo(() => {
    return (data.movimientos || [])
      .filter((m) => m.inversorId === inversor.id && (m.tipo === 'PAGO_INVERSOR' || m.tipo === 'APORTE_INVERSOR' || m.tipo === 'APORTE_DUENO'))
      .slice()
      .sort((a, b) => (b.fecha || '').localeCompare(a.fecha || '') || b.id - a.id);
  }, [data.movimientos, inversor.id]);

  const totalPagado = pagos.reduce((s, m) => s + m.salida + m.entrada, 0);

  return (
    <div className="section">
      <div className="section-head">
        <div>
          <div className="section-title">{esDueno ? 'Aportes y reglas' : 'Reglas y pagos'} · {inversor.nombre}</div>
          <div className="section-desc">{pagos.length} movimiento(s) · total {esDueno ? 'aportado' : 'pagado'} {money(totalPagado)}</div>
        </div>
      </div>

      <ReglasCompensacionList inversor={inversor} esDueno={esDueno} />

      <div style={{ marginTop: 'var(--s-3)', maxHeight: 360, overflowY: 'auto' }}>
        <div className="field-label" style={{ marginBottom: 6 }}>Historial de {esDueno ? 'aportes' : 'pagos'}</div>
        <DataTable
          getRowKey={(m) => m.id}
          columns={[
            { key: 'fecha', label: 'Fecha', render: (m) => fmtDate(m.fecha) },
            { key: 'cuenta', label: 'Cuenta', render: (m) => m.cuenta || <span className="muted">—</span> },
            { key: 'notas', label: 'Concepto', render: (m) => m.notas || <span className="muted">—</span> },
            { key: 'monto', label: esDueno ? 'Aporte' : 'Pago', align: 'right', num: true, render: (m) => <span style={{ color: 'var(--success)' }}>{money(m.salida + m.entrada)}</span> },
          ]}
          rows={pagos}
          empty={`Sin ${esDueno ? 'aportes' : 'pagos'} · registralos con "Registrar pago del mes"`}
        />
      </div>
    </div>
  );
}

/* ──────────── Reglas de compensación (CRUD) + devengo ──────────── */
// Devengo = ACUMULADO DE POR VIDA (regla 9). Pendiente por regla = devengado − ya pagado.
function ReglasCompensacionList({ inversor, esDueno }) {
  const data = useData();
  const t = useToast();
  const [confirm, confirmNode] = useConfirm();
  const reglas = inversor.compensaciones || [];
  const [showNueva, setShowNueva] = useState(false);
  const [editRegla, setEditRegla] = useState(null);
  const [pagoOpen, setPagoOpen] = useState(false);

  // Ventas/ganancia/unidades de por vida desde el inicio de cada regla (regla 9).
  const ventas = data.ventas || [];

  // Devengo acumulado de por vida para una regla. Simplificado pero coherente
  // con el monolito: usa revenue/ganancia/unidades desde la fecha de inicio
  // de la regla (o del inversor) hasta hoy. NO reinicia por ciclo.
  // TODO: el monolito tiene una "fecha de corte" (N días antes del pago) que
  // congela el monto; aquí calculamos directo a hoy. Si Julio necesita el corte
  // exacto, reintroducir corteDeRegla. La regla de negocio (acumulado de por
  // vida) se respeta.
  const computeDevengado = (regla) => {
    const inicio = regla.fechaInicio || inversor.fechaInicio;
    if (!inicio) return { generado: 0, detalle: 'Sin fecha de inicio' };
    const desde = new Date(inicio + 'T00:00:00');
    const hoy = new Date();
    const ms = Math.max(0, hoy - desde);
    const meses = ms / (30.4 * 86400000);
    const trimestres = Math.floor(meses / 3);
    const vs = ventas.filter((v) => v.fecha && new Date(v.fecha + 'T00:00:00') >= desde);
    const revenue = vs.reduce((s, v) => s + v.facturado, 0);
    const ganancia = vs.reduce((s, v) => s + v.gananciaNeta, 0);
    const unidades = vs.reduce((s, v) => s + v.lineas.reduce((a, l) => a + l.cantidad, 0), 0);
    const pct = num(regla.pctAplicado) / 100;
    const cuota = num(regla.cuotaMensual);
    const cap = num(regla.capDevolver) || num(regla.montoPactado) || 0;
    const porUnidad = num(regla.montoPorUnidad);
    const capital = inversor.capitalInvertido || 0;
    let generado = 0, detalle = '—';
    switch (regla.tipoCompensacion) {
      case 'DIVIDENDO_PREFERENTE':
        generado = capital * pct * (trimestres / 4);
        detalle = `${trimestres} trim × (${intNum(capital)} × ${(pct * 100).toFixed(1)}% / 4)`;
        break;
      case 'ROYALTY_BRUTO':
      case 'RBF':
        generado = Math.min(cap || Infinity, revenue * pct);
        detalle = `${(pct * 100).toFixed(1)}% × ${money(revenue)} revenue${cap ? ` (cap ${money(cap)})` : ''}`;
        break;
      case 'SALARIO_PRO_LABORE':
        generado = cuota * meses;
        detalle = `${money(cuota)}/mes × ${meses.toFixed(1)} meses`;
        break;
      case 'UTILIDADES_SUBORD':
      case 'REINVERSION':
      case 'EXCEDENTE_REAL':
      case 'CASHFLOW_ANUAL':
        generado = Math.max(0, ganancia) * pct;
        detalle = `${(pct * 100).toFixed(1)}% × ${money(ganancia)} ganancia`;
        break;
      case 'COMISION_SKU':
        generado = unidades * porUnidad;
        detalle = `${intNum(unidades)} ud × ${money(porUnidad)}/u`;
        break;
      case 'FLAT':
        generado = cap;
        detalle = `Retorno fijo ${money(cap)}`;
        break;
      default: detalle = '—';
    }
    return { generado: Math.max(0, generado), detalle, esInfoOnly: regla.tipoCompensacion === 'REINVERSION' };
  };

  // Pagado por regla (INVR-2: no sobre-estimar lo pendiente → evita sobrepago).
  // - Inversor con UNA sola regla: sin ambigüedad de atribución → cuenta TODO pago
  //   del inversor (tagueado "regla #ID" o no, ej. pagos hechos desde el Libro).
  // - Multi-regla: solo lo tagueado a ESTA regla (evita doble conteo entre reglas).
  //   ⚠️ Para Julio: con varias reglas, registra los pagos desde "Registrar pago del
  //   mes" (que los taguea) para que se atribuyan bien. Pagos sueltos por el Libro no
  //   se restan de una regla específica si el inversor tiene >1 regla.
  const computePagado = (regla) => {
    const delInversor = (data.movimientos || []).filter((m) => m.inversorId === inversor.id);
    const base = reglas.length <= 1
      ? delInversor
      : delInversor.filter((m) => typeof m.notas === 'string' && m.notas.includes(`regla #${regla.id}`));
    return base.reduce((s, m) => s + m.salida + m.entrada, 0);
  };

  const handleRemove = async (regla) => {
    const ok = await confirm({ title: '¿Borrar regla?', body: 'La data histórica de pagos no se pierde.', confirmLabel: 'Borrar' });
    if (!ok) return;
    try { await removeCompensacion(regla.id); await data.refreshAll(); t.ok('Regla eliminada', ''); }
    catch (e) { t.err('No se pudo borrar', e.message); }
  };

  return (
    <div style={{ padding: 'var(--s-3)', border: '1px solid var(--border)', borderRadius: 4, background: 'var(--surface)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--s-2)' }}>
        <div>
          <div className="section-title" style={{ fontSize: 14 }}>Reglas de compensación</div>
          <div className="section-desc" style={{ fontSize: 11 }}>{reglas.length} regla(s) · devengo acumulado de por vida</div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn ghost" style={{ fontSize: 12, padding: '4px 12px' }} onClick={() => setShowNueva(true)}>+ Regla</button>
          {reglas.length > 0 && (
            <button className="btn" style={{ fontSize: 12, padding: '4px 12px', background: 'var(--success)' }} onClick={() => setPagoOpen(true)}>Registrar pago del mes</button>
          )}
        </div>
      </div>

      {reglas.length === 0 && <div className="empty" style={{ padding: 'var(--s-4)' }}>Sin reglas configuradas · click + Regla</div>}

      {reglas.map((r) => {
        const m = TIPO_COMPENSACION_META[r.tipoCompensacion] || { label: r.tipoCompensacion, color: 'var(--text-3)', desc: '' };
        const dev = computeDevengado(r);
        const pagado = computePagado(r);
        const pendiente = Math.max(0, dev.generado - pagado);
        const params = [];
        if (r.pctAplicado != null) params.push(`${r.pctAplicado}%`);
        if (r.cuotaMensual != null) params.push(`${money(r.cuotaMensual)}/mes`);
        if (r.montoPorUnidad != null) params.push(`${money(r.montoPorUnidad)}/u`);
        if (r.capDevolver != null) params.push(`cap ${money(r.capDevolver)}`);
        return (
          <div key={r.id} style={{ padding: 'var(--s-3)', borderLeft: `4px solid ${m.color}`, background: 'var(--surface-2)', marginBottom: 8, borderRadius: 4 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
              <span className="badge" style={{ background: m.color, color: 'white', fontSize: 11, fontWeight: 600, padding: '3px 10px' }}>{m.label}</span>
              <span style={{ fontSize: 12, fontWeight: 500 }}>{params.join(' · ')}</span>
              <span style={{ flex: 1 }} />
              <span style={{ fontSize: 10, color: 'var(--text-3)' }}>paga día {r.diaPago || 17} · {(r.frecuencia || m.frecuencia || '').toLowerCase()}</span>
              <button className="icon-btn" title="Editar" onClick={() => setEditRegla(r)}>✎</button>
              <button className="icon-btn danger" title="Eliminar regla" onClick={() => handleRemove(r)}>×</button>
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-3)', marginBottom: 6, lineHeight: 1.4 }}>{m.desc}</div>
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr', gap: 8, padding: 'var(--s-2)', background: 'var(--surface)', borderRadius: 3 }}>
              <Stat label="Cálculo" value={dev.detalle} small />
              <Stat label={dev.esInfoOnly ? 'Acumulado' : 'Devengado'} value={money(dev.generado)} color={m.color} />
              <Stat label="Pagado" value={money(pagado)} color="var(--success)" />
              <Stat label="Pendiente" value={money(pendiente)} color={pendiente > 0 ? 'var(--warning)' : 'var(--text-3)'} />
            </div>
          </div>
        );
      })}

      {showNueva && (
        <Modal title="Nueva regla de compensación" width={560} onClose={() => setShowNueva(false)}>
          <FormCompensacion inversor={inversor} onDone={() => setShowNueva(false)} />
        </Modal>
      )}
      {editRegla && (
        <Modal title="Editar regla" width={560} onClose={() => setEditRegla(null)}>
          <FormCompensacion inversor={inversor} regla={editRegla} onDone={() => setEditRegla(null)} />
        </Modal>
      )}
      {pagoOpen && (
        <PagoMensualModal
          inversor={inversor} esDueno={esDueno} reglas={reglas}
          computeDevengado={computeDevengado} computePagado={computePagado}
          onClose={() => setPagoOpen(false)}
        />
      )}
      {confirmNode}
    </div>
  );
}

function Stat({ label, value, color, small }) {
  return (
    <div>
      <div style={{ fontSize: 9, textTransform: 'uppercase', color: 'var(--text-3)', letterSpacing: '0.05em' }}>{label}</div>
      <div style={{ fontSize: small ? 11 : 14, color: color || 'var(--text)', fontWeight: small ? 400 : 600, marginTop: 2 }}>{value}</div>
    </div>
  );
}

// ──────────── Pago mensual a inversor ────────────
// INVR-1: createPagoFinanciero con inversorId + tipo PAGO_INVERSOR side salida.
// INVR-2: pre-llena con (devengado − ya pagado), NO el devengado total.
function PagoMensualModal({ inversor, esDueno, reglas, computeDevengado, computePagado, onClose }) {
  const data = useData();
  const t = useToast();
  const [montos, setMontos] = useState({});
  const [fecha, setFecha] = useState(todayISO());
  const [cuentaId, setCuentaId] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const init = {};
    reglas.forEach((r) => {
      const dev = computeDevengado(r).generado;
      const pagado = computePagado(r);
      const pendiente = Math.max(0, dev - pagado); // INVR-2
      init[r.id] = pendiente > 0 ? pendiente.toFixed(2) : '';
    });
    setMontos(init);
  }, [inversor.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Reinversión no sale del banco (suma al capital del dueño).
  const reglasCash = reglas.filter((r) => r.tipoCompensacion !== 'REINVERSION');
  const reglasEquity = reglas.filter((r) => r.tipoCompensacion === 'REINVERSION');
  const totalCash = reglasCash.reduce((s, r) => s + num(montos[r.id]), 0);
  const totalEquity = reglasEquity.reduce((s, r) => s + num(montos[r.id]), 0);

  const onPagar = async () => {
    if (totalCash <= 0 && totalEquity <= 0) { t.warn('Sin montos', 'Todos los montos están en 0'); return; }
    if (totalCash > 0 && !cuentaId) { t.warn('Falta la cuenta', 'Elegí de qué cuenta sale el pago'); return; }
    setBusy(true);
    try {
      for (const r of reglas) {
        const monto = num(montos[r.id]);
        if (monto <= 0) continue;
        if (r.tipoCompensacion === 'REINVERSION') continue; // equity → capital, abajo
        const meta = TIPO_COMPENSACION_META[r.tipoCompensacion] || {};
        await createPagoFinanciero({
          fecha,
          monto,
          cuentaId,
          tipo: esDueno ? 'APORTE_DUENO' : 'PAGO_INVERSOR', // INVR-1
          side: esDueno ? 'entrada' : 'salida',
          inversorId: inversor.id, // INVR-1
          notas: `${meta.label || r.tipoCompensacion} · regla #${r.id}`,
        });
      }
      // Reinversión (decisión de Julio: "que suba"): el devengado NO sale en
      // efectivo, se queda en el negocio como más capital del inversor →
      // incrementa capital_invertido. No toca ninguna cuenta (no hay cash real).
      if (totalEquity > 0) {
        await updateInversor(inversor.id, {
          capitalInvertido: (inversor.capitalInvertido || 0) + totalEquity,
        });
      }
      await data.refreshAll();
      const partes = [];
      if (totalCash > 0) partes.push(`${money(totalCash)} en efectivo`);
      if (totalEquity > 0) partes.push(`${money(totalEquity)} reinvertido al capital`);
      t.ok('Pago registrado', `${inversor.nombre} · ${partes.join(' + ')}`);
      onClose?.();
    } catch (e) { t.err('Error al pagar', e.message); }
    setBusy(false);
  };

  const total = totalCash + totalEquity;

  return (
    <Modal title={`Registrar pago del mes · ${inversor.nombre}`} width={680} onClose={onClose}>
      <div style={{ padding: 'var(--s-3)', background: 'var(--surface-2)', borderRadius: 4, marginBottom: 'var(--s-3)', fontSize: 12, color: 'var(--text-2)' }}>
        Cada monto se pre-llena con lo <b>pendiente</b> (devengado − ya pagado), no el devengado total de por vida.
        Editás si querés pagar menos o más.
      </div>

      <div className="grid-2" style={{ marginBottom: 'var(--s-3)' }}>
        <Field label="Fecha del pago" required><DateInput value={fecha} onChange={setFecha} /></Field>
        <Field label="Cuenta origen" required={totalCash > 0} hint="De qué cuenta líquida sale el pago">
          <CuentaSelect filter="liquidas" value={cuentaId} onChange={setCuentaId} invalid={busy && totalCash > 0 && !cuentaId} />
        </Field>
      </div>

      <div className="field-label" style={{ marginBottom: 8 }}>Reglas a pagar ({reglas.length})</div>
      {reglas.map((r) => {
        const m = TIPO_COMPENSACION_META[r.tipoCompensacion] || { label: r.tipoCompensacion, color: 'var(--text-3)' };
        const dev = computeDevengado(r);
        const pagado = computePagado(r);
        const pendiente = Math.max(0, dev.generado - pagado);
        const esReinv = r.tipoCompensacion === 'REINVERSION';
        return (
          <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: 'var(--s-2)', borderLeft: `3px solid ${m.color}`, background: 'var(--surface-2)', marginBottom: 4, borderRadius: 3 }}>
            <div style={{ flex: 1 }}>
              <span className="badge" style={{ background: m.color, color: 'white', fontSize: 10, marginRight: 6 }}>{m.label}</span>
              <span style={{ fontSize: 11, color: 'var(--text-3)' }}>pendiente {money(pendiente)} · {dev.detalle}</span>
            </div>
            {esReinv && <span className="badge warning" style={{ fontSize: 9 }}>→ capital</span>}
            <div style={{ width: 130 }}>
              <NumberInput value={montos[r.id] ?? ''} onChange={(v) => setMontos((mm) => ({ ...mm, [r.id]: v }))} placeholder="0" />
            </div>
          </div>
        );
      })}

      <div className="summary" style={{ marginTop: 'var(--s-3)' }}>
        <div className="summary-item"><span className="lbl">Sale del banco</span><span className="val" style={{ color: 'var(--danger)' }}>{money(totalCash)}</span></div>
        {totalEquity > 0 && <div className="summary-item"><span className="lbl">Al capital (reinversión)</span><span className="val" style={{ color: 'var(--success)' }}>+{money(totalEquity)}</span></div>}
        <div className="summary-item"><span className="lbl">Total</span><span className="val">{money(total)}</span></div>
      </div>

      <div className="modal-actions" style={{ marginTop: 'var(--s-3)' }}>
        <button className="btn ghost" disabled={busy} onClick={onClose}>Cancelar</button>
        <button className="btn" disabled={busy} onClick={onPagar}>{busy ? 'Procesando…' : `Confirmar · ${money(totalCash)}`}</button>
      </div>
    </Modal>
  );
}

/* ════════════════════════ CUENTAS ════════════════════════ */
function CuentasTab({ cuentas }) {
  const data = useData();
  const t = useToast();
  const [confirm, confirmNode] = useConfirm();
  const [showNuevo, setShowNuevo] = useState(false);
  const [sel, setSel] = useState(null);

  // El tab Cuentas muestra débito + efectivo (las CREDITO viven en Tarjetas).
  const cuentasBanco = cuentas.filter((c) => c.tipo !== 'CREDITO');

  const doDelete = async (c) => {
    const ok = await confirm({ title: `¿Eliminar ${c.nombre}?`, body: 'Se desactiva la cuenta (soft-delete). Los movimientos quedan en el historial.', confirmLabel: 'Eliminar' });
    if (!ok) return;
    try { await removeCuenta(c.id); await data.refreshAll(); t.ok('Cuenta eliminada', c.nombre); }
    catch (e) { t.err('No se pudo eliminar', e.message); }
  };

  return (
    <>
      <div className="section">
        <div className="section-head">
          <div>
            <div className="section-title">Cuentas de banco</div>
            <div className="section-desc">Click en una fila para ver el estado de cuenta (ledger)</div>
          </div>
          <button className="btn" onClick={() => setShowNuevo(true)}>+ Nueva cuenta</button>
        </div>
        <DataTable
          getRowKey={(c) => c.id}
          onRowClick={(c) => setSel(sel?.id === c.id ? null : c)}
          columns={[
            { key: 'nombre', label: 'Nombre' },
            { key: 'tipo', label: 'Tipo', render: (c) => <span className={`badge ${c.tipo === 'DEBITO' ? 'success' : 'neutral'}`}>{c.tipo}</span> },
            { key: 'moneda', label: 'Moneda', render: (c) => <span className="muted">{c.moneda}</span> },
            { key: 'saldo', label: 'Saldo actual', align: 'right', num: true, render: (c) => <span style={{ color: c.saldo >= 0 ? 'var(--success)' : 'var(--danger)', fontWeight: 600 }}>{money(c.saldo, c.moneda === 'USD' ? 'USD$' : 'RD$')}</span> },
            { key: 'acciones', label: '', align: 'right', render: (c) => <button className="icon-btn danger" title="Eliminar" onClick={(e) => { e.stopPropagation(); doDelete(c); }}>×</button> },
          ]}
          rows={cuentasBanco}
          empty="Sin cuentas · click + Nueva cuenta"
        />
      </div>

      {sel && <DetalleCuentaLedger cuenta={sel} />}

      {showNuevo && (
        <Modal title="Nueva cuenta de banco" width={560} onClose={() => setShowNuevo(false)}>
          <FormCuenta onDone={() => setShowNuevo(false)} />
        </Modal>
      )}
      {confirmNode}
    </>
  );
}

// Ledger de una cuenta: movimientos con running balance.
function DetalleCuentaLedger({ cuenta }) {
  const data = useData();
  const [search, setSearch] = useState('');

  const m = useMemo(() => {
    const movs = (data.movimientos || []).filter((x) => x.cuentaId === cuenta.id || x.cuentaDestinoId === cuenta.id);
    const asc = movs.slice().sort((a, b) => (a.fecha || '').localeCompare(b.fecha || '') || a.id - b.id);
    let running = 0;
    const rows = asc.map((x) => {
      // Si es transferencia, la cuenta destino recibe (entrada) lo que sale del origen.
      const esDestino = x.cuentaDestinoId === cuenta.id;
      const ent = esDestino ? x.salida : x.entrada;
      const sal = esDestino ? 0 : x.salida;
      running += ent - sal;
      return { ...x, _ent: ent, _sal: sal, saldoDespues: running };
    });
    let filtered = rows;
    if (search) {
      const q = search.toLowerCase();
      filtered = rows.filter((x) => (x.notas || '').toLowerCase().includes(q) || (x.tipo || '').toLowerCase().includes(q) || (x.contraparte || '').toLowerCase().includes(q));
    }
    const totalEnt = rows.reduce((s, x) => s + x._ent, 0);
    const totalSal = rows.reduce((s, x) => s + x._sal, 0);
    return { rows: filtered.reverse(), totalEnt, totalSal, count: rows.length };
  }, [data.movimientos, cuenta.id, search]);

  return (
    <div className="section">
      <div className="section-head">
        <div>
          <div className="section-title">Estado de cuenta · {cuenta.nombre}</div>
          <div className="section-desc">{m.count} movimiento(s) · entradas {money(m.totalEnt)} · salidas {money(m.totalSal)} · saldo {money(cuenta.saldo, cuenta.moneda === 'USD' ? 'USD$' : 'RD$')}</div>
        </div>
        <input className="input" style={{ width: 200 }} placeholder="Buscar concepto/tipo/contraparte…" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>
      <div style={{ maxHeight: 480, overflowY: 'auto' }}>
        <DataTable
          getRowKey={(x) => x.id}
          columns={[
            { key: 'fecha', label: 'Fecha', render: (x) => fmtDate(x.fecha) },
            { key: 'tipo', label: 'Tipo', render: (x) => <span className="muted" style={{ fontSize: 11 }}>{x.tipo}</span> },
            { key: 'notas', label: 'Concepto', render: (x) => x.notas || <span className="muted">—</span> },
            { key: 'ent', label: 'Entrada', align: 'right', num: true, render: (x) => (x._ent > 0 ? <span style={{ color: 'var(--success)' }}>{money(x._ent)}</span> : '—') },
            { key: 'sal', label: 'Salida', align: 'right', num: true, render: (x) => (x._sal > 0 ? <span style={{ color: 'var(--danger)' }}>{money(x._sal)}</span> : '—') },
            { key: 'saldoDespues', label: 'Saldo', align: 'right', num: true, render: (x) => <span style={{ fontWeight: 600 }}>{money(x.saldoDespues)}</span> },
          ]}
          rows={m.rows}
          empty="Sin movimientos en esta cuenta"
        />
      </div>
    </div>
  );
}

/* El sub-tab "Movimientos" reusa <LibroPage embedded /> (ver import arriba) —
   libro contable completo con sus forms de pago/gasto/transferencia. */

/* ════════════════════════ FORMS ════════════════════════ */

// ──────────── Nueva cuenta ────────────
// Si tipo CREDITO pide límite (regla del prompt). El gemelo préstamo/tarjeta y
// el saldo inicial DRAWDOWN no se crean aquí: las tarjetas se gestionan en el
// tab Tarjetas (createPrestamo TARJETA_CREDITO). TODO: si Julio quiere el flujo
// "crear cuenta de crédito que también es tarjeta", encadenar createPrestamo.
function FormCuenta({ onDone }) {
  const data = useData();
  const t = useToast();
  const [nombre, setNombre] = useState('');
  const [tipo, setTipo] = useState('DEBITO');
  const [moneda, setMoneda] = useState('RD');
  const [limite, setLimite] = useState('');
  const [notas, setNotas] = useState('');
  const [busy, setBusy] = useState(false);

  const esCredito = tipo === 'CREDITO';
  const valid = nombre.trim().length > 1 && (!esCredito || num(limite) > 0);

  const onSubmit = async () => {
    if (!valid) { t.warn('Datos incompletos', esCredito ? 'La tarjeta necesita nombre y límite' : 'Falta el nombre'); return; }
    setBusy(true);
    try {
      await createCuenta({ nombre: nombre.trim(), tipo, moneda, limite: esCredito ? limite : null, notas });
      await data.refreshAll();
      t.ok('Cuenta creada', `${nombre} · ${tipo} ${moneda}`);
      onDone?.();
    } catch (e) { t.err('No se pudo crear', e.message); }
    setBusy(false);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-3)' }}>
      <div className="grid-2">
        <Field label="Nombre" required><TextInput value={nombre} onChange={setNombre} placeholder="ej. Popular Ahorros" /></Field>
        <Field label="Tipo">
          <Select value={tipo} onChange={setTipo} options={[{ value: 'DEBITO', label: 'Débito' }, { value: 'CREDITO', label: 'Crédito (tarjeta)' }, { value: 'EFECTIVO', label: 'Efectivo' }]} />
        </Field>
        <Field label="Moneda">
          <Select value={moneda} onChange={setMoneda} options={[{ value: 'RD', label: 'RD$' }, { value: 'USD', label: 'USD' }]} />
        </Field>
        {esCredito && (
          <Field label="Límite de crédito" required hint="Tope de la tarjeta">
            <MoneyInput value={limite} onChange={setLimite} placeholder="0" />
          </Field>
        )}
      </div>
      <Field label="Notas"><TextInput value={notas} onChange={setNotas} placeholder="opcional" /></Field>
      <div style={{ display: 'flex', gap: 8 }}>
        <button className="btn" disabled={!valid || busy} onClick={onSubmit}>{busy ? 'Creando…' : 'Crear cuenta'}</button>
      </div>
    </div>
  );
}

// ──────────── Nuevo préstamo / línea / tarjeta ────────────
function FormPrestamo({ tipoFijo, onDone }) {
  const data = useData();
  const t = useToast();
  const [nombre, setNombre] = useState('');
  const [tipo, setTipo] = useState(tipoFijo || 'PRESTAMO');
  const [monto, setMonto] = useState('');
  const [limite, setLimite] = useState('');
  const [tasaAnual, setTasaAnual] = useState('');
  const [seguro, setSeguro] = useState('');
  const [plazo, setPlazo] = useState('');
  const [fechaInicio, setFechaInicio] = useState('');
  const [fechaPrimerPago, setFechaPrimerPago] = useState('');
  const [diaCorte, setDiaCorte] = useState('');
  const [diaVencimiento, setDiaVencimiento] = useState('');
  const [moneda, setMoneda] = useState('RD');
  const [notas, setNotas] = useState('');
  const [busy, setBusy] = useState(false);

  const esLinea = tipo === 'LINEA_CREDITO' || tipo === 'TARJETA_CREDITO';
  const esTarjeta = tipo === 'TARJETA_CREDITO';
  const tasaMensualCalc = tasaAnual ? num(tasaAnual) / 12 : null;
  const valid = nombre.trim().length > 1 && (esLinea ? num(limite) > 0 : num(monto) > 0);

  const onSubmit = async () => {
    if (!valid) { t.warn('Datos incompletos', esLinea ? 'Falta nombre y límite' : 'Falta nombre y monto inicial'); return; }
    setBusy(true);
    try {
      await createPrestamo({
        nombre: nombre.trim(), tipo, moneda,
        montoInicial: esLinea ? null : num(monto),
        limiteCredito: esLinea ? num(limite) : null,
        tasaMensual: tasaMensualCalc != null ? tasaMensualCalc / 100 : null, // % → decimal
        seguroMensual: seguro || null,
        plazoMeses: plazo || null,
        fechaInicio: fechaInicio || null,
        fechaPrimerPago: fechaPrimerPago || null,
        diaCorte: esTarjeta && diaCorte ? num(diaCorte) : null,
        diaVencimiento: esTarjeta && diaVencimiento ? num(diaVencimiento) : null,
        notas,
      });
      await data.refreshAll();
      const label = { PRESTAMO: 'Préstamo', LINEA_CREDITO: 'Línea', TARJETA_CREDITO: 'Tarjeta' }[tipo];
      t.ok(`${label} creado`, nombre);
      onDone?.();
    } catch (e) { t.err('No se pudo crear', e.message); }
    setBusy(false);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-3)' }}>
      <div className="grid-2">
        <Field label="Nombre" required><TextInput value={nombre} onChange={setNombre} placeholder={esTarjeta ? 'ej. Scotia CC RD' : 'ej. Coop préstamo'} /></Field>
        {!tipoFijo && (
          <Field label="Tipo">
            <Select value={tipo} onChange={setTipo} options={[{ value: 'PRESTAMO', label: 'Préstamo amortizado' }, { value: 'LINEA_CREDITO', label: 'Línea de crédito' }, { value: 'TARJETA_CREDITO', label: 'Tarjeta de crédito' }]} />
          </Field>
        )}
        {!esLinea
          ? <Field label="Monto inicial" required><MoneyInput value={monto} onChange={setMonto} placeholder="0" /></Field>
          : <Field label="Límite" required><MoneyInput value={limite} onChange={setLimite} placeholder="0" /></Field>}
        <Field label="Tasa anual (%)" hint={tasaMensualCalc != null ? `≈ ${tasaMensualCalc.toFixed(2)}% mensual` : 'opcional'}>
          <NumberInput value={tasaAnual} onChange={setTasaAnual} placeholder="20" />
        </Field>
        <Field label="Moneda">
          <Select value={moneda} onChange={setMoneda} options={[{ value: 'RD', label: 'RD$' }, { value: 'USD', label: 'USD' }]} />
        </Field>
      </div>

      {!esLinea && (
        <div className="grid-3">
          <Field label="Seguro mensual"><MoneyInput value={seguro} onChange={setSeguro} placeholder="0" /></Field>
          <Field label="Plazo (meses)"><NumberInput value={plazo} onChange={setPlazo} placeholder="48" /></Field>
          <Field label="Fecha desembolso"><DateInput value={fechaInicio} onChange={setFechaInicio} /></Field>
          <Field label="Fecha primer pago" hint="Define el ciclo mensual"><DateInput value={fechaPrimerPago} onChange={setFechaPrimerPago} /></Field>
        </div>
      )}

      {esTarjeta && (
        <div className="grid-2">
          <Field label="Día de corte" hint="Día del mes que cierra el ciclo"><NumberInput value={diaCorte} onChange={setDiaCorte} placeholder="25" min="1" /></Field>
          <Field label="Día de pago/vencimiento" hint="Día límite de pago"><NumberInput value={diaVencimiento} onChange={setDiaVencimiento} placeholder="15" min="1" /></Field>
        </div>
      )}

      <Field label="Notas"><TextInput value={notas} onChange={setNotas} placeholder="opcional" /></Field>
      <div style={{ display: 'flex', gap: 8 }}>
        <button className="btn" disabled={!valid || busy} onClick={onSubmit}>{busy ? 'Creando…' : 'Crear'}</button>
      </div>
    </div>
  );
}

// ──────────── Nuevo inversor ────────────
// INVR-3: createInversor escribe es_dueno (el writer ya lo hace). Target por
// defecto = 2× capital. Las reglas de compensación se agregan luego en el detalle.
function FormInversor({ onDone }) {
  const data = useData();
  const t = useToast();
  const [nombre, setNombre] = useState('');
  const [capital, setCapital] = useState('');
  const [target, setTarget] = useState('');
  const [fechaInicio, setFechaInicio] = useState(todayISO());
  const [contraparteId, setContraparteId] = useState(null);
  const [esDueno, setEsDueno] = useState(false);
  const [tipoCompensacion, setTipoCompensacion] = useState('FLAT');
  const [notas, setNotas] = useState('');
  const [busy, setBusy] = useState(false);

  const yaHayDueno = (data.inversores || []).some((i) => i.esDueno);
  const valid = nombre.trim().length > 1 && (esDueno || num(capital) > 0);

  const onSubmit = async () => {
    if (esDueno && yaHayDueno) { t.err('Solo un dueño', 'Ya existe un inversor marcado como dueño'); return; }
    if (!valid) { t.warn('Datos incompletos', 'Falta nombre y capital'); return; }
    setBusy(true);
    try {
      const capNum = num(capital);
      await createInversor({
        nombre: nombre.trim(),
        capitalInvertido: capNum,
        montoPactadoDevolver: target !== '' ? num(target) : capNum * 2,
        fechaInicio: fechaInicio || null,
        contraparteId: contraparteId || null,
        esDueno, // INVR-3
        tipoCompensacion,
        notas,
      });
      await data.refreshAll();
      t.ok(esDueno ? 'Dueño registrado' : 'Inversor creado', `${nombre}. Agregá sus reglas de compensación en el detalle.`);
      onDone?.();
    } catch (e) { t.err('No se pudo crear', e.message); }
    setBusy(false);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-3)' }}>
      <div className="grid-2">
        <Field label="Nombre" required><TextInput value={nombre} onChange={setNombre} placeholder="ej. Andrea Correa" /></Field>
        <Field label="Vincular a contraparte" hint="Opcional">
          <ContraparteSelect tipo="INVERSOR" value={contraparteId} onChange={setContraparteId} placeholder="— ninguna —" />
        </Field>
      </div>

      <div style={{ padding: 'var(--s-3)', background: 'var(--surface-2)', borderRadius: 4, border: `1px solid ${esDueno ? '#7c5cff' : 'var(--border)'}` }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: yaHayDueno && !esDueno ? 'not-allowed' : 'pointer', opacity: yaHayDueno && !esDueno ? 0.5 : 1 }}>
          <input type="checkbox" checked={esDueno} disabled={yaHayDueno && !esDueno} onChange={(e) => setEsDueno(e.target.checked)} />
          <span style={{ fontWeight: 600, color: esDueno ? '#7c5cff' : 'var(--text-2)' }}>Es el dueño del negocio</span>
        </label>
        <div className="field-hint" style={{ marginTop: 4 }}>
          {yaHayDueno && !esDueno ? 'Ya hay un dueño marcado. Solo se permite uno.' : esDueno ? 'Sus aportes no son deudas (no restan del capital).' : 'Inversor externo: espera retorno.'}
        </div>
      </div>

      <div className="grid-3">
        <Field label="Capital invertido (RD$)" required={!esDueno}><MoneyInput value={capital} onChange={setCapital} placeholder="50000" /></Field>
        <Field label="Target a devolver" hint="Default: 2× capital"><MoneyInput value={target} onChange={setTarget} placeholder={capital ? String(num(capital) * 2) : '0'} /></Field>
        <Field label="Fecha inicio"><DateInput value={fechaInicio} onChange={setFechaInicio} /></Field>
      </div>

      <Field label="Método de compensación (default)" hint="Podés agregar más reglas en el detalle">
        <Select value={tipoCompensacion} onChange={setTipoCompensacion} options={COMP_OPTIONS} />
      </Field>

      <Field label="Notas"><TextInput value={notas} onChange={setNotas} placeholder="opcional" /></Field>
      <div style={{ display: 'flex', gap: 8 }}>
        <button className="btn" disabled={!valid || busy} onClick={onSubmit}>{busy ? 'Creando…' : esDueno ? 'Registrar dueño' : 'Crear inversor'}</button>
      </div>
    </div>
  );
}

// ──────────── Regla de compensación (crear / editar) ────────────
// INVR-4: incluye subordinaA + frecuencia.
function FormCompensacion({ inversor, regla, onDone }) {
  const data = useData();
  const t = useToast();
  const editing = !!regla;
  const [tipoCompensacion, setTipoCompensacion] = useState(regla?.tipoCompensacion || 'FLAT');
  const [pctAplicado, setPctAplicado] = useState(regla?.pctAplicado ?? '');
  const [cuotaMensual, setCuotaMensual] = useState(regla?.cuotaMensual ?? '');
  const [montoPorUnidad, setMontoPorUnidad] = useState(regla?.montoPorUnidad ?? '');
  const [capDevolver, setCapDevolver] = useState(regla?.capDevolver ?? '');
  const [montoPactado, setMontoPactado] = useState(regla?.montoPactado ?? '');
  const [bonusThreshold, setBonusThreshold] = useState(regla?.bonusThreshold ?? '');
  const [diaPago, setDiaPago] = useState(regla?.diaPago ?? 17);
  const [frecuencia, setFrecuencia] = useState(regla?.frecuencia || TIPO_COMPENSACION_META[regla?.tipoCompensacion || 'FLAT']?.frecuencia || 'MENSUAL');
  const [subordinaA, setSubordinaA] = useState(regla?.subordinaA || '');
  const [fechaInicio, setFechaInicio] = useState(regla?.fechaInicio || inversor.fechaInicio || todayISO());
  const [notas, setNotas] = useState(regla?.notas || '');
  const [busy, setBusy] = useState(false);

  const meta = TIPO_COMPENSACION_META[tipoCompensacion] || { fields: [] };
  const f = meta.fields || [];
  // Otras reglas a las que esta puede subordinarse (INVR-4).
  const otrasReglas = (inversor.compensaciones || []).filter((r) => r.id !== regla?.id);

  const onSubmit = async () => {
    setBusy(true);
    try {
      const payload = {
        tipoCompensacion,
        pctAplicado: f.includes('pct') ? pctAplicado : (editing ? pctAplicado : ''),
        cuotaMensual: f.includes('cuotaMensual') ? cuotaMensual : (editing ? cuotaMensual : ''),
        montoPorUnidad: f.includes('montoPorUnidad') ? montoPorUnidad : (editing ? montoPorUnidad : ''),
        capDevolver: f.includes('cap') ? capDevolver : (editing ? capDevolver : ''),
        montoPactado: f.includes('retorno') ? montoPactado : (editing ? montoPactado : ''),
        bonusThreshold,
        diaPago,
        frecuencia, // INVR-4
        subordinaA: subordinaA || null, // INVR-4
        fechaInicio: fechaInicio || null,
        notas,
      };
      if (editing) await updateCompensacion(regla.id, payload);
      else await createCompensacion(inversor.id, payload);
      await data.refreshAll();
      t.ok(editing ? 'Regla actualizada' : 'Regla creada', meta.label || tipoCompensacion);
      onDone?.();
    } catch (e) { t.err('No se pudo guardar', e.message); }
    setBusy(false);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-3)' }}>
      <Field label="Método de compensación" required>
        <Select value={tipoCompensacion} onChange={(v) => { setTipoCompensacion(v); setFrecuencia(TIPO_COMPENSACION_META[v]?.frecuencia || 'MENSUAL'); }} options={COMP_OPTIONS} />
      </Field>
      {meta.desc && <div className="field-hint">{meta.desc}</div>}

      <div className="grid-3">
        {f.includes('pct') && <Field label="% aplicado"><NumberInput value={pctAplicado} onChange={setPctAplicado} placeholder="8" /></Field>}
        {f.includes('cuotaMensual') && <Field label="Cuota mensual (RD$)"><MoneyInput value={cuotaMensual} onChange={setCuotaMensual} placeholder="25000" /></Field>}
        {f.includes('montoPorUnidad') && <Field label="Monto por unidad (RD$)"><MoneyInput value={montoPorUnidad} onChange={setMontoPorUnidad} placeholder="100" /></Field>}
        {f.includes('cap') && <Field label="Cap máximo (RD$)"><MoneyInput value={capDevolver} onChange={setCapDevolver} placeholder="0" /></Field>}
        {f.includes('retorno') && <Field label="Monto target (RD$)"><MoneyInput value={montoPactado} onChange={setMontoPactado} placeholder="0" /></Field>}
        <Field label="Día de pago (1-28)"><NumberInput value={diaPago} onChange={setDiaPago} placeholder="17" min="1" /></Field>
        <Field label="Frecuencia"><Select value={frecuencia} onChange={setFrecuencia} options={FRECUENCIAS} /></Field>
        <Field label="Fecha inicio"><DateInput value={fechaInicio} onChange={setFechaInicio} /></Field>
      </div>

      <Field label="Subordina a (INVR-4)" hint="Se paga después de esta otra regla (opcional)">
        <Select
          value={subordinaA}
          onChange={setSubordinaA}
          placeholder="— ninguna —"
          options={otrasReglas.map((r) => ({ value: String(r.id), label: TIPO_COMPENSACION_META[r.tipoCompensacion]?.label || r.tipoCompensacion }))}
        />
      </Field>

      <Field label="Notas"><TextArea value={notas} onChange={setNotas} placeholder="opcional" /></Field>
      <div style={{ display: 'flex', gap: 8 }}>
        <button className="btn" disabled={busy} onClick={onSubmit}>{busy ? 'Guardando…' : editing ? 'Guardar' : 'Crear regla'}</button>
      </div>
    </div>
  );
}
