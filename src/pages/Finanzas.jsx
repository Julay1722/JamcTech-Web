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
  createCuenta, createPrestamo, updatePrestamo, createInversor, updateInversor,
  createCompensacion, updateCompensacion, removeCompensacion,
  createPagoFinanciero,
  removeCuenta, removePrestamo, removeInversor,
} from '../lib/db/writers.js';
import { Modal, useConfirm } from '../components/Modal.jsx';
import { Field, TextInput, NumberInput, MoneyInput, DateInput, TextArea, Select } from '../components/Form.jsx';
import { DataTable } from '../components/Table.jsx';
import { CuentaSelect, MedioPagoSelect, ContraparteSelect } from '../components/Pickers.jsx';
import { KPI, Bar } from '../components/Charts.jsx';
import { useToast } from '../components/Toast.jsx';
import { money, intNum, fmtDate, todayISO, num } from '../lib/format.js';
import LibroPage from './Libro.jsx';
import MovForm from '../components/forms/MovForm.jsx';

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

// Suma separando RD vs USD. NO se convierte (no hay tasa fija fiable): las
// entidades en USD se muestran aparte para no falsear el total en pesos.
function splitMoneda(items, montoFn) {
  let rd = 0, usd = 0;
  for (const x of items) { const m = (montoFn ? montoFn(x) : x) || 0; if (x.moneda === 'USD') usd += m; else rd += m; }
  return { rd, usd };
}
// Muestra RD$ y, si hay monto en USD, una segunda línea US$ (sin mezclar monedas).
function DualMonto({ rd, usd, sub }) {
  return (
    <>
      <span>{money(rd)}</span>
      {usd > 0 && <span style={{ display: 'block', fontSize: sub || 12, color: 'var(--text-3)', fontWeight: 400, marginTop: 2 }}>+ {money(usd, 'USD$')}</span>}
    </>
  );
}

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

  return (
    <div>
      <div className="topbar">
        <div>
          <h1>Finanzas</h1>
          <div className="sub">Deudas · inversores · banco</div>
        </div>
      </div>

      {/* Sub-tabs planos (un solo nivel, sin anidamiento) */}
      <div className="tabs">
        <button className={tab === 'resumen' ? 'tab active' : 'tab'} onClick={() => setTab('resumen')}>Resumen</button>
        <button className={tab === 'analisis' ? 'tab active' : 'tab'} onClick={() => setTab('analisis')}>Análisis deuda</button>
        <button className={['deudas', 'prestamos', 'tarjetas'].includes(tab) ? 'tab active' : 'tab'} onClick={() => setTab('deudas')}>Deudas</button>
        <button className={tab === 'inversores' ? 'tab active' : 'tab'} onClick={() => setTab('inversores')}>Inversores</button>
        <button className={tab === 'cuentas' ? 'tab active' : 'tab'} onClick={() => setTab('cuentas')}>Banco</button>
      </div>

      {tab === 'resumen' && <ResumenTab prestamos={prestamos} inversores={inversores} cuentas={cuentas} />}
      {tab === 'analisis' && <AnalisisTab prestamosTab={prestamosTab} tarjetas={tarjetas} inversores={inversores} cuentas={cuentas} />}
      {['deudas', 'prestamos', 'tarjetas'].includes(tab) && <DeudasTab prestamos={prestamosTab} tarjetas={tarjetas} />}
      {tab === 'inversores' && <InversoresTab inversores={inversores} />}
      {tab === 'cuentas' && <CuentasTab cuentas={cuentas} />}
    </div>
  );
}

/* ════════════════════════ RESUMEN ════════════════════════ */
function ResumenTab({ prestamos, inversores, cuentas }) {
  const dDeuda = splitMoneda(prestamos, (p) => p.saldoPendiente);
  const dLiq = splitMoneda(cuentas.filter((c) => c.esLiquida), (c) => c.saldo);
  const invExternos = inversores.filter((i) => !i.esDueno);
  const pendienteInv = invExternos.reduce((s, i) => s + i.saldoPendiente, 0);
  const aportadoInv = invExternos.reduce((s, i) => s + i.capitalInvertido, 0);
  const coop = prestamos.find((p) => p.tipo === 'PRESTAMO');
  const nConSaldo = prestamos.filter((p) => p.saldoPendiente > 0).length;
  const prestamosNoTarjeta = prestamos.filter((p) => p.tipo !== 'TARJETA_CREDITO');
  const lineasYTarjetas = prestamos.filter((p) => p.tipo === 'LINEA_CREDITO' || p.tipo === 'TARJETA_CREDITO');

  return (
    <>
      <div className="kpi-row">
        <KPI label="Capital líquido" currency value={intNum(dLiq.rd)} deltaLabel={dLiq.usd > 0 ? `débito + efectivo · + ${money(dLiq.usd, 'USD$')}` : 'débito + efectivo'} />
        <KPI label="Deuda total" currency value={intNum(dDeuda.rd)} tone="neg" deltaLabel={dDeuda.usd > 0 ? `${nConSaldo} con saldo · + ${money(dDeuda.usd, 'USD$')}` : `${nConSaldo} con saldo`} />
        {coop && <KPI label="Saldo Coop" currency value={intNum(coop.saldoPendiente)} deltaLabel="préstamo principal" />}
        <KPI label="Pendiente a inversores" currency value={intNum(pendienteInv)} deltaLabel={`${invExternos.length} externo(s) · ${money(aportadoInv)} aportado`} />
      </div>

      <div className="grid-2">
        <div className="section">
          <div className="section-head">
            <div><div className="section-title">Préstamos y líneas</div><div className="section-desc">{prestamosNoTarjeta.length} producto(s)</div></div>
          </div>
          <DataTable getRowKey={(p) => p.id}
            columns={[
              { key: 'nombre', label: 'Producto' },
              { key: 'tipo', label: 'Tipo', render: (p) => <span className="muted">{p.tipo === 'LINEA_CREDITO' ? 'línea' : 'préstamo'}</span> },
              { key: 'monto', label: 'Monto / Límite', align: 'right', num: true, render: (p) => money(p.tipo === 'LINEA_CREDITO' ? p.limiteCredito : p.montoInicial, p.moneda === 'USD' ? 'USD$' : 'RD$') },
              { key: 'cap', label: 'Pagado', align: 'right', num: true, render: (p) => <span style={{ color: 'var(--success)' }}>{money(p.capitalPagado)}</span> },
              { key: 'saldo', label: 'Saldo', align: 'right', num: true, render: (p) => <span style={{ color: 'var(--danger)' }}>{money(p.saldoPendiente, p.moneda === 'USD' ? 'USD$' : 'RD$')}</span> },
              { key: 'tasa', label: 'Tasa', align: 'right', num: true, render: (p) => (p.tasaMensual ? `${(p.tasaMensual * 100).toFixed(2)}%` : '—') },
            ]}
            rows={prestamosNoTarjeta} empty="Sin préstamos · agrégalos en Deudas" />
        </div>

        <div className="section">
          <div className="section-head">
            <div><div className="section-title">Inversores externos</div><div className="section-desc">{invExternos.length} esperan retorno</div></div>
          </div>
          <DataTable getRowKey={(i) => i.id}
            columns={[
              { key: 'nombre', label: 'Inversor' },
              { key: 'cap', label: 'Aporte', align: 'right', num: true, render: (i) => money(i.capitalInvertido) },
              { key: 'pag', label: 'Pagado', align: 'right', num: true, render: (i) => <span style={{ color: 'var(--success)' }}>{money(i.totalDevuelto)}</span> },
              { key: 'pen', label: 'Pendiente', align: 'right', num: true, render: (i) => <span style={{ color: 'var(--warning)' }}>{money(i.saldoPendiente)}</span> },
            ]}
            rows={invExternos} empty="Sin inversores externos" />
        </div>
      </div>

      <div className="section">
        <div className="section-head">
          <div><div className="section-title">Uso de líneas y tarjetas</div><div className="section-desc">crédito revolvente · % utilizado del límite</div></div>
        </div>
        <DataTable getRowKey={(p) => p.id}
          columns={[
            { key: 'nombre', label: 'Producto' },
            { key: 'usado', label: 'Usado', align: 'right', num: true, render: (p) => money(p.usado, p.moneda === 'USD' ? 'USD$' : 'RD$') },
            { key: 'limite', label: 'Límite', align: 'right', num: true, render: (p) => money(p.limiteCredito, p.moneda === 'USD' ? 'USD$' : 'RD$') },
            {
              key: 'uso', label: 'Utilización', align: 'right',
              render: (p) => { const pct = p.limiteCredito > 0 ? (p.usado / p.limiteCredito) * 100 : 0; return <div style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'flex-end' }}><div style={{ width: 100 }}><Bar pct={pct} /></div><span className={`badge ${usoCls(pct)}`} style={{ minWidth: 42, textAlign: 'center' }}>{pct.toFixed(0)}%</span></div>; },
            },
          ]}
          rows={lineasYTarjetas} empty="Sin líneas ni tarjetas" />
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

    // Deuda separada por moneda (no se mezclan pesos con dólares).
    const dPrest = splitMoneda(prestamosTab, (p) => p.saldoPendiente);
    const dTarj = splitMoneda(tarjetas, (p) => p.saldoPendiente);
    const deudaInversores = (inversores || []).filter((i) => !i.esDueno).reduce((s, i) => s + i.saldoPendiente, 0);
    const deudaRD = dPrest.rd + dTarj.rd + deudaInversores;
    const deudaUSD = dPrest.usd + dTarj.usd;
    const deudaPrestamos = dPrest.rd;   // para el pago mensual / ratios (mayoría RD)
    const deudaTarjetas = dTarj.rd;

    // Sobra/falta mensual y margen de colapso.
    const sobraFalta = cashflowProm - pagoTotal;
    const margenColapso = cashflowProm > pagoTotal && cashflowProm > 0 ? (sobraFalta / cashflowProm) * 100 : 0;

    // Utilización por línea/tarjeta (barras de progreso).
    const utilizacion = [...tarjetas, ...prestamosTab.filter((p) => p.tipo === 'LINEA_CREDITO')]
      .filter((p) => p.limiteCredito > 0)
      .map((p) => ({ id: p.id, nombre: p.nombre, usado: p.usado, limite: p.limiteCredito, moneda: p.moneda, pct: (p.usado / p.limiteCredito) * 100 }));

    // Orden de pago (avalancha): la deuda más cara primero (tasa mensual DESC).
    const ordenPago = [...prestamosTab, ...tarjetas]
      .filter((p) => p.saldoPendiente > 0)
      .map((p) => ({ id: p.id, nombre: p.nombre, tipo: p.tipo, saldo: p.saldoPendiente, tasa: p.tasaMensual || 0, interesMensual: p.saldoPendiente * (p.tasaMensual || 0), moneda: p.moneda }))
      .sort((x, y) => (y.tasa - x.tasa) || (y.interesMensual - x.interesMensual));

    return { cashflowProm, pagoTotal, pagoPrestamos, pagoTarjetas, cobertura, semaforo, mensaje, breakdown, deudaRD, deudaUSD, dPrest, dTarj, deudaPrestamos, deudaTarjetas, deudaInversores, sobraFalta, margenColapso, utilizacion, ordenPago, nMeses: meses.length };
  }, [data.movimientos, data.cuotas, prestamosTab, tarjetas, inversores]);

  return (
    <>
      <div className="kpi-row">
        <KPI label="Cash flow mensual prom." currency value={intNum(a.cashflowProm)} delta={a.cashflowProm >= 0 ? 1 : -1} deltaLabel={`últimos ${a.nMeses} mes(es)`} />
        <KPI label="Pago mensual a deudas" currency value={intNum(a.pagoTotal)} deltaLabel="cuotas + mínimos est." />
        <KPI label="Cobertura" value={a.cobertura >= 99 ? '∞' : a.cobertura.toFixed(2) + '×'} tone={a.semaforo} deltaLabel="flujo / pagos" />
        <KPI label="Sobra / falta mensual" currency value={intNum(a.sobraFalta)} tone={a.sobraFalta >= 0 ? 'success' : 'danger'} deltaLabel={a.sobraFalta >= 0 ? `margen ${a.margenColapso.toFixed(0)}%` : 'déficit'} />
      </div>

      {/* Semáforo grande con barra de cobertura */}
      <div className="section" style={{ borderLeft: `3px solid var(--${a.semaforo})` }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: 'var(--s-2) var(--s-3)' }}>
          <span style={{ width: 16, height: 16, borderRadius: '50%', background: `var(--${a.semaforo})`, flexShrink: 0, boxShadow: `0 0 8px var(--${a.semaforo})` }} />
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 600, color: `var(--${a.semaforo})` }}>
              {a.semaforo === 'success' ? 'Cómodo' : a.semaforo === 'warning' ? 'Ajustado' : 'Riesgo'}
            </div>
            <div style={{ fontSize: 13, color: 'var(--text-2)' }}>{a.mensaje}</div>
          </div>
          <div style={{ width: 200 }}>
            <Bar pct={Math.min(100, a.cobertura * 33)} color={`var(--${a.semaforo})`} />
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, color: 'var(--text-3)', marginTop: 2 }}><span>0×</span><span>1×</span><span>2×</span><span>3×+</span></div>
          </div>
        </div>
      </div>

      <div className="grid-2">
        {/* Utilización de crédito (barras de progreso) */}
        <div className="section">
          <div className="section-head"><div><div className="section-title">Utilización de crédito</div><div className="section-desc">% usado del límite por línea/tarjeta</div></div></div>
          {a.utilizacion.length === 0 ? <div className="empty">Sin líneas ni tarjetas con límite.</div> : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-3)', padding: 'var(--s-2) 0' }}>
              {a.utilizacion.map((u) => (
                <div key={u.id}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
                    <span>{u.nombre}</span>
                    <span className="muted">{money(u.usado, u.moneda === 'USD' ? 'USD$' : 'RD$')} / {money(u.limite, u.moneda === 'USD' ? 'USD$' : 'RD$')} · <b className={usoCls(u.pct)} style={{ color: `var(--${u.pct > 85 ? 'danger' : u.pct > 60 ? 'warning' : 'success'})` }}>{u.pct.toFixed(0)}%</b></span>
                  </div>
                  <Bar pct={u.pct} />
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Desglose de deuda total (RD$ y US$ por separado) */}
        <div className="section">
          <div className="section-head"><div><div className="section-title">Deuda total · {money(a.deudaRD)}{a.deudaUSD > 0 && <> + {money(a.deudaUSD, 'USD$')}</>}</div><div className="section-desc">composición por tipo · pesos y dólares aparte</div></div></div>
          <div className="grid-3" style={{ marginBottom: 'var(--s-3)' }}>
            <div className="stat-card"><div className="stat-label">Préstamos/líneas</div><div className="stat-value"><DualMonto rd={a.dPrest.rd} usd={a.dPrest.usd} /></div></div>
            <div className="stat-card"><div className="stat-label">Tarjetas</div><div className="stat-value"><DualMonto rd={a.dTarj.rd} usd={a.dTarj.usd} /></div></div>
            <div className="stat-card"><div className="stat-label">Inversores</div><div className="stat-value">{money(a.deudaInversores)}</div></div>
          </div>
          {a.deudaRD > 0 && (
            <>
              <div style={{ display: 'flex', height: 10, borderRadius: 999, overflow: 'hidden' }}>
                <div style={{ width: `${(a.dPrest.rd / a.deudaRD) * 100}%`, background: 'var(--accent)' }} title="Préstamos/líneas" />
                <div style={{ width: `${(a.dTarj.rd / a.deudaRD) * 100}%`, background: 'var(--danger)' }} title="Tarjetas" />
                <div style={{ width: `${(a.deudaInversores / a.deudaRD) * 100}%`, background: 'var(--warning)' }} title="Inversores" />
              </div>
              <div className="field-hint" style={{ marginTop: 6 }}>Barra en RD$. {a.deudaUSD > 0 ? `Deuda en dólares aparte: ${money(a.deudaUSD, 'USD$')}.` : ''}</div>
            </>
          )}
        </div>
      </div>

      {/* Orden de pago (avalancha) */}
      <div className="section">
        <div className="section-head">
          <div><div className="section-title">Orden de pago sugerido (avalancha)</div><div className="section-desc">paga primero la deuda más cara · ahorra más interés</div></div>
        </div>
        <DataTable getRowKey={(r) => r.id}
          columns={[
            { key: 'prio', label: '#', align: 'right', num: true, render: (r) => a.ordenPago.indexOf(r) + 1 },
            { key: 'nombre', label: 'Deuda', render: (r) => <>{r.nombre}{a.ordenPago.indexOf(r) === 0 && <span className="badge danger" style={{ marginLeft: 8 }}>Pagar primero</span>}</> },
            { key: 'tipo', label: 'Tipo', render: (r) => <span className="muted">{r.tipo.replace('_', ' ').toLowerCase()}</span> },
            { key: 'saldo', label: 'Saldo', align: 'right', num: true, render: (r) => money(r.saldo, r.moneda === 'USD' ? 'USD$' : 'RD$') },
            { key: 'tasa', label: 'Tasa/mes', align: 'right', num: true, render: (r) => (r.tasa ? `${(r.tasa * 100).toFixed(2)}%` : '—') },
            { key: 'interes', label: 'Interés/mes', align: 'right', num: true, render: (r) => <span style={{ color: 'var(--danger)' }}>{r.interesMensual > 0 ? money(r.interesMensual) : '—'}</span> },
          ]}
          rows={a.ordenPago} empty="Sin deudas con saldo" />
        <div className="field-hint" style={{ padding: 'var(--s-2) 0 0' }}>
          Estimación: préstamos amortizados usan la cuota mediana del schedule; líneas/tarjetas usan 5% del saldo como pago mínimo. El flujo operacional excluye movimientos financieros.
        </div>
      </div>
    </>
  );
}

/* ════════════════════════ PRÉSTAMOS ════════════════════════ */
// Deudas unificadas: préstamos/líneas + tarjetas en una sola vista (idea 1701),
// con editar (updatePrestamo) y click-en-fila → historial inline (mío).
function DeudasTab({ prestamos, tarjetas }) {
  const data = useData();
  const t = useToast();
  const [confirm, confirmNode] = useConfirm();
  const [nuevo, setNuevo] = useState(null);   // 'prestamo' | 'tarjeta'
  const [editar, setEditar] = useState(null); // registro a editar
  const [selP, setSelP] = useState(null);     // préstamo expandido
  const [selT, setSelT] = useState(null);     // tarjeta expandida

  const doDelete = async (p, esTarjeta) => {
    const ok = await confirm({ title: `¿Eliminar ${p.nombre}?`, body: `Se desactiva ${esTarjeta ? 'la tarjeta' : 'el préstamo'} (soft-delete). Los movimientos quedan en el historial.`, confirmLabel: 'Eliminar' });
    if (!ok) return;
    try { await removePrestamo(p.id); await data.refreshAll(); t.ok(esTarjeta ? 'Tarjeta eliminada' : 'Préstamo eliminado', p.nombre); }
    catch (e) { t.err('No se pudo eliminar', e.message); }
  };
  const accionesCol = (esTarjeta) => ({
    key: 'acc', label: '', align: 'right',
    render: (p) => (
      <span className="row-actions-inner" onClick={(e) => e.stopPropagation()}>
        <button className="icon-btn" title="Editar" onClick={() => setEditar(p)}>✎</button>
        <button className="icon-btn danger" title="Eliminar" onClick={() => doDelete(p, esTarjeta)}>×</button>
      </span>
    ),
  });

  return (
    <>
      <div className="section">
        <div className="section-head">
          <div>
            <div className="section-title">Préstamos y líneas de crédito</div>
            <div className="section-desc">Click en una fila para ver la amortización · ✎ para editar</div>
          </div>
          <button className="btn" onClick={() => setNuevo('prestamo')}>+ Préstamo / línea</button>
        </div>
        <DataTable getRowKey={(p) => p.id} onRowClick={(p) => setSelP(selP?.id === p.id ? null : p)}
          columns={[
            { key: 'nombre', label: 'Nombre' },
            { key: 'tipo', label: 'Tipo', render: (p) => <span className="muted">{p.tipo === 'LINEA_CREDITO' ? 'línea de crédito' : 'préstamo amortizado'}</span> },
            { key: 'monto', label: 'Monto / Límite', align: 'right', num: true, render: (p) => money(p.tipo === 'LINEA_CREDITO' ? p.limiteCredito : p.montoInicial, p.moneda === 'USD' ? 'USD$' : 'RD$') },
            { key: 'cap', label: 'Capital pagado', align: 'right', num: true, render: (p) => <span style={{ color: 'var(--success)' }}>{money(p.capitalPagado)}</span> },
            { key: 'saldo', label: 'Saldo / Usado', align: 'right', num: true, render: (p) => <span style={{ color: 'var(--danger)' }}>{money(p.saldoPendiente, p.moneda === 'USD' ? 'USD$' : 'RD$')}</span> },
            { key: 'tasa', label: 'Tasa', align: 'right', num: true, render: (p) => (p.tasaMensual ? `${(p.tasaMensual * 100).toFixed(2)}%/mes` : '—') },
            accionesCol(false),
          ]}
          rows={prestamos} empty="Sin préstamos · + Préstamo / línea" />
      </div>
      {selP && <DetalleAmortizacion prestamo={selP} />}

      <div className="section">
        <div className="section-head">
          <div>
            <div className="section-title">Tarjetas de crédito</div>
            <div className="section-desc">Click en una fila para ver los usos (cargos y pagos) · ✎ para editar</div>
          </div>
          <button className="btn" onClick={() => setNuevo('tarjeta')}>+ Tarjeta</button>
        </div>
        <DataTable getRowKey={(p) => p.id} onRowClick={(p) => setSelT(selT?.id === p.id ? null : p)}
          columns={[
            { key: 'nombre', label: 'Tarjeta' },
            { key: 'moneda', label: 'Moneda', render: (p) => <span className="muted">{p.moneda}</span> },
            { key: 'limite', label: 'Límite', align: 'right', num: true, render: (p) => money(p.limiteCredito, p.moneda === 'USD' ? 'USD$' : 'RD$') },
            { key: 'usado', label: 'Usado', align: 'right', num: true, render: (p) => money(p.usado, p.moneda === 'USD' ? 'USD$' : 'RD$') },
            { key: 'disp', label: 'Disponible', align: 'right', num: true, render: (p) => <span style={{ color: 'var(--success)' }}>{money(Math.max(0, p.limiteCredito - p.usado), p.moneda === 'USD' ? 'USD$' : 'RD$')}</span> },
            {
              key: 'uso', label: '% uso', align: 'right',
              render: (p) => { const pct = p.limiteCredito > 0 ? (p.usado / p.limiteCredito) * 100 : 0; return <div style={{ display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'flex-end' }}><div style={{ width: 56 }}><Bar pct={pct} /></div><span className={`badge ${usoCls(pct)}`}>{pct.toFixed(0)}%</span></div>; },
            },
            accionesCol(true),
          ]}
          rows={tarjetas} empty="Sin tarjetas · + Tarjeta" />
      </div>
      {selT && <DetalleUsosTarjeta tarjeta={selT} />}

      {nuevo && (
        <Modal title={nuevo === 'tarjeta' ? 'Nueva tarjeta de crédito' : 'Nuevo préstamo o línea'} width={640} onClose={() => setNuevo(null)}>
          <FormPrestamo tipoFijo={nuevo === 'tarjeta' ? 'TARJETA_CREDITO' : undefined} onDone={() => setNuevo(null)} />
        </Modal>
      )}
      {editar && (
        <Modal title={`Editar ${editar.nombre}`} width={640} onClose={() => setEditar(null)}>
          <FormPrestamo prestamo={editar} tipoFijo={editar.tipo === 'TARJETA_CREDITO' ? 'TARJETA_CREDITO' : undefined} onDone={() => setEditar(null)} />
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
// (TarjetasTab fusionado en DeudasTab — ver arriba.)

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

      <div className="kpi-row" style={{ marginBottom: 'var(--s-4)' }}>
        <KPI label="Capital invertido" currency value={intNum(inversor.capitalInvertido)} deltaLabel="aportado al negocio" />
        <KPI label={esDueno ? 'A devolver' : 'Target a devolver'} value={esDueno ? '∞' : money(inversor.montoPactadoDevolver)} deltaLabel={esDueno ? 'dueño' : 'pactado'} />
        <KPI label={esDueno ? 'Recibido' : 'Devuelto'} currency value={intNum(inversor.totalDevuelto)} deltaLabel="pagos registrados" />
        <KPI label="Pendiente" value={esDueno ? '—' : money(inversor.saldoPendiente)} deltaLabel={esDueno ? 'n/a' : 'por devolver'} tone={!esDueno && inversor.saldoPendiente > 0 ? 'warning' : undefined} />
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

// Fecha de corte del devengo: día (día_de_pago − 5) más reciente ya pasado.
// Ej. día de pago 17 → corte el 12. El devengado se "congela" en ese corte y
// solo avanza cuando pasa el siguiente (decisión de Julio: corte 5 días antes
// del pago, como una factura mensual). Default día de pago = 17.
const DIAS_ANTES_CORTE = 5;
function corteDevengo(diaPago) {
  const corteDay = Math.max(1, (Number(diaPago) || 17) - DIAS_ANTES_CORTE);
  const now = new Date();
  let corte = new Date(now.getFullYear(), now.getMonth(), corteDay, 23, 59, 59);
  if (now < corte) corte = new Date(now.getFullYear(), now.getMonth() - 1, corteDay, 23, 59, 59);
  return corte;
}

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

  // Devengo acumulado de por vida (regla 9), CONGELADO en la fecha de corte:
  // corte = día (día_de_pago − 5) más reciente ya pasado (Julio: corte 5 días
  // antes del pago). El monto no sube cada día: se queda fijo hasta que pasa el
  // siguiente corte (como una factura mensual que cierra ese día). Mide ventas/
  // meses desde el inicio de la regla HASTA el corte, no hasta hoy.
  const computeDevengado = (regla) => {
    const inicio = regla.fechaInicio || inversor.fechaInicio;
    if (!inicio) return { generado: 0, detalle: 'Sin fecha de inicio' };
    const desde = new Date(inicio + 'T00:00:00');
    const hasta = corteDevengo(regla.diaPago); // 5 días antes del día de pago
    const ms = Math.max(0, hasta - desde);
    const meses = ms / (30.4 * 86400000);
    const trimestres = Math.floor(meses / 3);
    const vs = ventas.filter((v) => {
      if (!v.fecha) return false;
      const d = new Date(v.fecha + 'T00:00:00');
      return d >= desde && d <= hasta;
    });
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
  const [showMov, setShowMov] = useState(false);
  const [sel, setSel] = useState(null); // cuenta seleccionada → filtra el libro de abajo

  // Banco: débito + efectivo (las CREDITO/tarjetas viven en Deudas).
  const cuentasBanco = cuentas.filter((c) => c.tipo !== 'CREDITO');
  const dLiq = splitMoneda(cuentasBanco.filter((c) => c.esLiquida), (c) => c.saldo);

  const doDelete = async (c) => {
    const ok = await confirm({ title: `¿Eliminar ${c.nombre}?`, body: 'Se desactiva la cuenta (soft-delete). Los movimientos quedan en el historial.', confirmLabel: 'Eliminar' });
    if (!ok) return;
    try { await removeCuenta(c.id); await data.refreshAll(); t.ok('Cuenta eliminada', c.nombre); }
    catch (e) { t.err('No se pudo eliminar', e.message); }
  };

  return (
    <>
      <div className="kpi-row">
        <KPI label="Capital líquido" currency value={intNum(dLiq.rd)} deltaLabel={dLiq.usd > 0 ? `débito + efectivo · + ${money(dLiq.usd, 'USD$')}` : 'débito + efectivo'} />
        {cuentasBanco.slice(0, 3).map((c) => (
          c.moneda === 'USD'
            ? <KPI key={c.id} label={c.nombre} value={money(c.saldo, 'USD$')} deltaLabel="dólares" />
            : <KPI key={c.id} label={c.nombre} currency value={intNum(c.saldo)} deltaLabel={c.tipo.toLowerCase()} />
        ))}
      </div>

      <div className="section">
        <div className="section-head">
          <div>
            <div className="section-title">Cuentas</div>
            <div className="section-desc">Click en una cuenta para ver SOLO su libro abajo · todas juntas para cuadrar caja</div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn ghost" onClick={() => setShowMov(true)}>+ Registrar movimiento</button>
            <button className="btn" onClick={() => setShowNuevo(true)}>+ Nueva cuenta</button>
          </div>
        </div>
        <DataTable
          getRowKey={(c) => c.id}
          isActive={(c) => sel?.id === c.id}
          onRowClick={(c) => setSel(sel?.id === c.id ? null : c)}
          columns={[
            { key: 'nombre', label: 'Nombre' },
            { key: 'tipo', label: 'Tipo', render: (c) => <span className={`badge ${c.tipo === 'DEBITO' ? 'success' : c.tipo === 'EFECTIVO' ? 'warning' : 'neutral'}`}>{c.tipo}</span> },
            { key: 'moneda', label: 'Moneda', render: (c) => <span className="muted">{c.moneda}</span> },
            { key: 'saldo', label: 'Saldo actual', align: 'right', num: true, render: (c) => <span style={{ color: c.saldo >= 0 ? 'var(--success)' : 'var(--danger)', fontWeight: 600 }}>{money(c.saldo, c.moneda === 'USD' ? 'USD$' : 'RD$')}</span> },
            { key: 'acciones', label: '', align: 'right', render: (c) => <button className="icon-btn danger" title="Eliminar" onClick={(e) => { e.stopPropagation(); doDelete(c); }}>×</button> },
          ]}
          rows={cuentasBanco}
          empty="Sin cuentas · + Nueva cuenta"
        />
      </div>

      {/* Libro contable debajo: todas las cuentas, o filtrado a la cuenta seleccionada. */}
      <LibroPage embedded cuentaFilter={sel?.id ?? null} cuentaNombre={sel?.nombre} onClearCuenta={() => setSel(null)} />

      {showNuevo && (
        <Modal title="Nueva cuenta de banco" width={560} onClose={() => setShowNuevo(false)}>
          <FormCuenta onDone={() => setShowNuevo(false)} />
        </Modal>
      )}
      {showMov && (
        <Modal title="Registrar movimiento" width={560} onClose={() => setShowMov(false)}>
          <MovForm onDone={() => setShowMov(false)} />
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
function FormPrestamo({ tipoFijo, prestamo, onDone }) {
  const editing = !!prestamo;
  const data = useData();
  const t = useToast();
  const [nombre, setNombre] = useState(prestamo?.nombre || '');
  const [tipo, setTipo] = useState(prestamo?.tipo || tipoFijo || 'PRESTAMO');
  const [monto, setMonto] = useState(prestamo?.montoInicial || '');
  const [limite, setLimite] = useState(prestamo?.limiteCredito || '');
  // tasa guardada es decimal mensual; el input es % anual → reconstruir × 1200.
  const [tasaAnual, setTasaAnual] = useState(prestamo?.tasaMensual ? String(+(prestamo.tasaMensual * 1200).toFixed(4)) : '');
  const [seguro, setSeguro] = useState(prestamo?.seguroMensual || '');
  const [plazo, setPlazo] = useState(prestamo?.plazoMeses || '');
  const [fechaInicio, setFechaInicio] = useState(prestamo?.fechaInicio || '');
  const [fechaPrimerPago, setFechaPrimerPago] = useState(prestamo?.fechaPrimerPago || '');
  const [diaCorte, setDiaCorte] = useState(prestamo?.diaCorte || '');
  const [diaVencimiento, setDiaVencimiento] = useState(prestamo?.diaVencimiento || '');
  const [moneda, setMoneda] = useState(prestamo?.moneda || 'RD');
  const [notas, setNotas] = useState(prestamo?.notas || '');
  const [busy, setBusy] = useState(false);

  const esLinea = tipo === 'LINEA_CREDITO' || tipo === 'TARJETA_CREDITO';
  const esTarjeta = tipo === 'TARJETA_CREDITO';
  const tasaMensualCalc = tasaAnual ? num(tasaAnual) / 12 : null;
  const valid = nombre.trim().length > 1 && (esLinea ? num(limite) > 0 : num(monto) > 0);

  const onSubmit = async () => {
    if (!valid) { t.warn('Datos incompletos', esLinea ? 'Falta nombre y límite' : 'Falta nombre y monto inicial'); return; }
    setBusy(true);
    try {
      const payload = {
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
      };
      const label = { PRESTAMO: 'Préstamo', LINEA_CREDITO: 'Línea', TARJETA_CREDITO: 'Tarjeta' }[tipo];
      if (editing) { await updatePrestamo(prestamo.id, payload); t.ok(`${label} actualizado`, nombre); }
      else { await createPrestamo(payload); t.ok(`${label} creado`, nombre); }
      await data.refreshAll();
      onDone?.();
    } catch (e) { t.err(editing ? 'No se pudo guardar' : 'No se pudo crear', e.message); }
    setBusy(false);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-3)' }}>
      <div className="grid-2">
        <Field label="Nombre" required><TextInput value={nombre} onChange={setNombre} placeholder={esTarjeta ? 'ej. Scotia CC RD' : 'ej. Coop préstamo'} /></Field>
        {!tipoFijo && !editing && (
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
        <button className="btn" disabled={!valid || busy} onClick={onSubmit}>{busy ? 'Guardando…' : (editing ? 'Guardar cambios' : 'Crear')}</button>
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
