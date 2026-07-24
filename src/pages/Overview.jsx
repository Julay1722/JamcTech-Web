// Resumen / Mando — KPIs (capital líquido, revenue, ganancia neta, stock) +
// charts. KPIs verificados vs SQL (ver Fase 3). Capital = saldo de cuentas
// líquidas (KPI-2/3), stock excluye LEGACY-SALE (KPI-1), deuda incluye tarjetas (KPI-5).
import { useMemo, useState } from 'react';
import { useData } from '../hooks/useData.jsx';
import { KPI, LineChart, BarChart, DonutChart } from '../components/Charts.jsx';
import { money, intNum, ymLabel } from '../lib/format.js';
import { inPeriod } from '../lib/period.js';

const CAT_COLORS = {
  Mouse: '#f2b53e', Teclado: '#6fd08a', Headset: '#5fd0ff',
  'Mouse Pad': '#ef9a3d', Stand: '#c08af2', Otro: '#847b64',
};

export default function OverviewPage({ period, customRange }) {
  const { skus, ventas, cuentas, prestamos, movimientos } = useData();

  const m = useMemo(() => {
    const ventasP = ventas.filter((v) => inPeriod(v.fecha, period, customRange));
    const capitalLiquido = cuentas.filter((c) => c.esLiquida).reduce((s, c) => s + c.saldo, 0);
    const revenue = ventasP.reduce((s, v) => s + v.facturado, 0);
    const ganancia = ventasP.reduce((s, v) => s + v.gananciaNeta, 0);
    const stock = skus.reduce((s, k) => s + k.stock, 0); // ya excluye LEGACY-SALE
    // Deuda separada por moneda (RD$ y US$ no se mezclan: no hay tasa fija).
    let deudaRD = 0, deudaUSD = 0;
    prestamos.forEach((p) => { if (p.moneda === 'USD') deudaUSD += p.saldoPendiente; else deudaRD += p.saldoPendiente; });

    // Serie mensual de revenue + ganancia
    const byMonth = {};
    ventasP.forEach((v) => {
      const ym = (v.fecha || '').slice(0, 7);
      if (!ym) return;
      (byMonth[ym] ||= { v: 0, g: 0 }).v += v.facturado;
      byMonth[ym].g += v.gananciaNeta;
    });
    const months = Object.keys(byMonth).sort();
    const revSerie = months.map((ym) => byMonth[ym].v);
    const ganSerie = months.map((ym) => byMonth[ym].g);
    const labels = months.map(ymLabel);

    // ── Resumen mensual estilo "25/26 Overview" del sheet (histórico completo,
    // no respeta el filtro de período). Capital = saldo acumulado de las cuentas
    // líquidas RD al CIERRE de cada mes (como el sheet). Cash flow = operacional
    // neto del mes (naturaleza CASHFLOW). Rendimiento = ganancia/ventas.
    const liquidasRD = new Set(cuentas.filter((c) => c.esLiquida && c.moneda !== 'USD').map((c) => c.id));
    const usdCuentas = new Set(cuentas.filter((c) => c.moneda === 'USD').map((c) => c.id));
    // Cash flow OPERATIVO (CFO): solo la operación del negocio. Se excluye lo que NO
    // es flujo operativo real: financiamiento (aporte del dueño), transferencias
    // internas (mover dinero propio) y ajustes/cuadres (no son efectivo real).
    const noOperativo = new Set(['TRANSFERENCIA_INTERNA', 'APORTE_DUENO', 'AJUSTE']);
    const mensual = {};
    const mes = (f) => (f || '').slice(0, 7);
    ventas.forEach((v) => {
      const ym = mes(v.fecha); if (!ym) return;
      const r = (mensual[ym] ||= { ventas: 0, ganancia: 0, n: 0, cashflow: 0, capDelta: 0 });
      r.ventas += v.facturado; r.ganancia += v.gananciaNeta; r.n += 1;
    });
    (movimientos || []).forEach((mv) => {
      const ym = mes(mv.fecha); if (!ym) return;
      const r = (mensual[ym] ||= { ventas: 0, ganancia: 0, n: 0, cashflow: 0, capDelta: 0 });
      if (mv.naturaleza === 'CASHFLOW' && !noOperativo.has(mv.tipo)) {
        // Movimiento en cuenta USD → convertir a RD con su tasa antes de sumar.
        r.cashflow += usdCuentas.has(mv.cuentaId) && mv.tasaCambio
          ? (mv.entrada - mv.salida) * mv.tasaCambio
          : (mv.entrada - mv.salida);
      }
      if (liquidasRD.has(mv.cuentaId)) r.capDelta += mv.entrada - mv.salida;
    });
    let capAcum = 0;
    const overviewMensual = Object.keys(mensual).sort().map((ym) => {
      const r = mensual[ym];
      capAcum += r.capDelta;
      return {
        ym, label: ymLabel(ym),
        capital: capAcum, ventas: r.ventas, ganancia: r.ganancia, n: r.n,
        rendimiento: r.ventas > 0 ? (r.ganancia / r.ventas) * 100 : null,
        cashflow: r.cashflow,
      };
    });
    const ovTot = {
      ventas: overviewMensual.reduce((s, r) => s + r.ventas, 0),
      ganancia: overviewMensual.reduce((s, r) => s + r.ganancia, 0),
      cashflow: overviewMensual.reduce((s, r) => s + r.cashflow, 0),
      n: overviewMensual.reduce((s, r) => s + r.n, 0),
    };
    ovTot.rendimiento = ovTot.ventas > 0 ? (ovTot.ganancia / ovTot.ventas) * 100 : null;

    // Inventario por categoría: valor (stock×cpp), # SKUs con stock, unidades.
    const catAgg = {};
    skus.forEach((k) => {
      const a = (catAgg[k.categoria] ||= { skus: 0, stock: 0, valor: 0 });
      if (k.stock > 0) a.skus += 1;
      a.stock += k.stock;
      a.valor += k.stock * k.cpp;
    });
    const invTotal = Object.values(catAgg).reduce((s, a) => s + a.valor, 0);
    const skusConStock = Object.values(catAgg).reduce((s, a) => s + a.skus, 0);
    const donut = Object.entries(catAgg).filter(([, a]) => a.valor > 0)
      .map(([label, a]) => ({ label, value: Math.round(a.valor), color: CAT_COLORS[label] || '#847b64' }))
      .sort((x, y) => y.value - x.value);
    const catRows = donut.map((d) => ({
      label: d.label, color: d.color,
      skus: catAgg[d.label].skus, stock: catAgg[d.label].stock, valor: d.value,
      pct: invTotal > 0 ? (d.value / invTotal) * 100 : 0,
    }));

    // Top SKUs precalculado por las 4 métricas (de por vida, como hoy).
    const TOP_KEYS = { ganancia: (k) => k.ganancia, ingresos: (k) => k.ingresos, vendidas: (k) => k.vendidas, valorStock: (k) => k.stock * k.cpp };
    const topByMetric = {};
    for (const key in TOP_KEYS) {
      const f = TOP_KEYS[key];
      topByMetric[key] = [...skus].map((k) => ({ label: k.nombre, value: Math.round(f(k)) }))
        .filter((d) => d.value > 0).sort((a, b) => b.value - a.value).slice(0, 8);
    }

    return { capitalLiquido, revenue, ganancia, stock, deudaRD, deudaUSD, revSerie, ganSerie, labels, donut, invTotal, skusConStock, catRows, topByMetric, overviewMensual, ovTot, nVentas: ventasP.length };
  }, [skus, ventas, cuentas, prestamos, movimientos, period, customRange]);

  const margenPct = m.revenue > 0 ? (m.ganancia / m.revenue) * 100 : 0;

  // Selector de métrica del Top SKUs (chips). No recalcula el useMemo: solo elige
  // qué precálculo de m.topByMetric leer.
  const [topMetric, setTopMetric] = useState('ganancia');
  const TOP_METRICS = [
    { key: 'ganancia', label: 'Ganancia', color: 'var(--success)', fmt: (n) => 'RD$ ' + intNum(n) },
    { key: 'ingresos', label: 'Ingresos', color: 'var(--accent)', fmt: (n) => 'RD$ ' + intNum(n) },
    { key: 'vendidas', label: 'Vendidas', color: 'var(--warning)', fmt: (n) => intNum(n) + ' ud' },
    { key: 'valorStock', label: 'Valor stock', color: 'var(--accent)', fmt: (n) => 'RD$ ' + intNum(n) },
  ];
  const metric = TOP_METRICS.find((x) => x.key === topMetric) || TOP_METRICS[0];

  return (
    <div>
      <div className="topbar">
        <div>
          <h1>Resumen</h1>
          <div className="sub">{m.nVentas} ventas en el período · margen neto {margenPct.toFixed(1)}%</div>
        </div>
      </div>

      <div className="kpi-row">
        <KPI label="Capital líquido" currency value={intNum(m.capitalLiquido)} deltaLabel="cuentas débito + efectivo" />
        <KPI label="Revenue" currency value={intNum(m.revenue)} deltaLabel={`${m.nVentas} ventas`} />
        <KPI label="Ganancia neta" currency value={intNum(m.ganancia)} delta={margenPct} deltaLabel="margen" />
        <KPI label="Stock total" value={intNum(m.stock)} deltaLabel="unidades físicas" />
      </div>

      <div className="grid-2">
        <div className="section">
          <div className="section-head"><div className="section-title">Revenue mensual</div></div>
          <LineChart values={m.revSerie} labels={m.labels} fmt={(n) => 'RD$' + (n / 1000).toFixed(0) + 'k'} color="var(--accent)" />
        </div>
        <div className="section">
          <div className="section-head"><div className="section-title">Ganancia mensual</div></div>
          <LineChart values={m.ganSerie} labels={m.labels} fmt={(n) => 'RD$' + (n / 1000).toFixed(0) + 'k'} color="var(--success)" />
        </div>
      </div>

      {/* Resumen mensual estilo "25/26 Overview" del sheet + cash flow */}
      <div className="section">
        <div className="section-head">
          <div>
            <div className="section-title">Resumen mensual</div>
            <div className="section-desc">capital líquido al cierre de cada mes · ventas, ganancia y cash flow operativo (operación pura: sin aportes, préstamos ni transferencias)</div>
          </div>
        </div>
        <table className="data">
          <thead>
            <tr>
              <th>Mes</th>
              <th className="right num">Capital</th>
              <th className="right num">Ventas</th>
              <th className="right num">#</th>
              <th className="right num">Ganancia</th>
              <th className="right num">Rendimiento</th>
              <th className="right num">Cash flow</th>
            </tr>
          </thead>
          <tbody>
            {m.overviewMensual.map((r, i) => {
              const esActual = i === m.overviewMensual.length - 1;
              return (
                <tr key={r.ym} className={esActual ? 'row-active' : ''}>
                  <td style={{ fontWeight: esActual ? 600 : 400 }}>{r.label}{esActual && <span className="muted" style={{ fontSize: 10 }}> · en curso</span>}</td>
                  <td className="right num" style={{ fontWeight: 500 }}>{money(r.capital)}</td>
                  <td className="right num">{r.ventas > 0 ? money(r.ventas) : <span className="muted">—</span>}</td>
                  <td className="right num muted">{r.n || ''}</td>
                  <td className="right num" style={{ color: r.ganancia > 0 ? 'var(--success)' : r.ganancia < 0 ? 'var(--danger)' : 'var(--text-3)' }}>{r.ganancia !== 0 ? money(r.ganancia) : '—'}</td>
                  <td className="right num">{r.rendimiento != null ? <span className={`badge ${r.rendimiento >= 40 ? 'success' : r.rendimiento >= 30 ? 'warning' : 'neutral'}`}>{r.rendimiento.toFixed(1)}%</span> : <span className="muted">—</span>}</td>
                  <td className="right num" style={{ color: r.cashflow >= 0 ? 'var(--success)' : 'var(--danger)' }}>{money(r.cashflow)}</td>
                </tr>
              );
            })}
            <tr style={{ fontWeight: 600, borderTop: '2px solid var(--border-2)' }}>
              <td>Total</td>
              <td className="right num muted">—</td>
              <td className="right num">{money(m.ovTot.ventas)}</td>
              <td className="right num muted">{m.ovTot.n}</td>
              <td className="right num" style={{ color: 'var(--success)' }}>{money(m.ovTot.ganancia)}</td>
              <td className="right num">{m.ovTot.rendimiento != null ? m.ovTot.rendimiento.toFixed(1) + '%' : '—'}</td>
              <td className="right num" style={{ color: m.ovTot.cashflow >= 0 ? 'var(--success)' : 'var(--danger)' }}>{money(m.ovTot.cashflow)}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div className="grid-2">
        <div className="section">
          <div className="section-head">
            <div>
              <div className="section-title">Inventario por categoría</div>
              <div className="section-desc">{money(m.invTotal)} · {m.catRows.length} categorías · {intNum(m.stock)} ud en stock</div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 'var(--s-4)', alignItems: 'center', flexWrap: 'wrap' }}>
            <div style={{ flexShrink: 0 }}>
              <DonutChart data={m.donut} size={150} strokeW={24} title="RD$" legend={false} />
            </div>
            <div style={{ flex: 1, minWidth: 260, overflowX: 'auto' }}>
              <table className="data">
                <thead><tr>
                  <th>Categoría</th>
                  <th className="right num">SKUs</th>
                  <th className="right num">Stock</th>
                  <th className="right num">Valor</th>
                  <th className="right num">% cartera</th>
                </tr></thead>
                <tbody>
                  {m.catRows.map((c) => (
                    <tr key={c.label}>
                      <td><span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 3, background: c.color, marginRight: 8, verticalAlign: 'middle' }} />{c.label}</td>
                      <td className="right num">{c.skus}</td>
                      <td className="right num">{intNum(c.stock)}</td>
                      <td className="right num">{money(c.valor)}</td>
                      <td className="right num">
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'flex-end' }}>
                          <span style={{ color: 'var(--text-3)' }}>{c.pct.toFixed(0)}%</span>
                          <span style={{ display: 'inline-block', width: 44, height: 6, borderRadius: 3, background: 'var(--surface-3)' }}>
                            <span style={{ display: 'block', height: 6, borderRadius: 3, width: `${c.pct}%`, background: c.color }} />
                          </span>
                        </div>
                      </td>
                    </tr>
                  ))}
                  <tr style={{ fontWeight: 600 }}>
                    <td>Total</td>
                    <td className="right num">{m.skusConStock}</td>
                    <td className="right num">{intNum(m.stock)}</td>
                    <td className="right num">{money(m.invTotal)}</td>
                    <td className="right num muted">100%</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <div className="section">
          <div className="section-head">
            <div className="section-title">Top SKUs por {metric.label.toLowerCase()}</div>
            <div className="chips">
              {TOP_METRICS.map((mt) => (
                <button key={mt.key} type="button" className={`chip${topMetric === mt.key ? ' active' : ''}`} onClick={() => setTopMetric(mt.key)}>{mt.label}</button>
              ))}
            </div>
          </div>
          <BarChart data={m.topByMetric[topMetric]} fmt={metric.fmt} color={metric.color} />
        </div>
      </div>

      <div className="section">
        <div className="section-head">
          <div className="section-title">Deuda total</div>
          <div className="section-desc">Préstamos + líneas + tarjetas (vw_saldo_prestamo)</div>
        </div>
        <div className="grid-3">
          {prestamos.map((p) => (
            <div key={p.id} className="stat-card">
              <div className="stat-label">{p.nombre}</div>
              <div className="stat-value" style={{ color: 'var(--danger)' }}>{money(p.saldoPendiente, p.moneda === 'USD' ? 'USD$' : 'RD$')}</div>
              <div style={{ fontSize: 11, color: 'var(--text-3)' }}>{p.tipo.replace('_', ' ').toLowerCase()}{p.moneda === 'USD' ? ' · USD' : ''}</div>
            </div>
          ))}
        </div>
        <div style={{ marginTop: 'var(--s-3)', textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: 15, fontWeight: 600, color: 'var(--danger)' }}>
          Total: {money(m.deudaRD)}{m.deudaUSD > 0 && <> + {money(m.deudaUSD, 'USD$')}</>}
        </div>
      </div>
    </div>
  );
}
