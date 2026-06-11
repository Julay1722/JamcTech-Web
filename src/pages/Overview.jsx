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
  const { skus, ventas, cuentas, prestamos } = useData();

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

    return { capitalLiquido, revenue, ganancia, stock, deudaRD, deudaUSD, revSerie, ganSerie, labels, donut, invTotal, skusConStock, catRows, topByMetric, nVentas: ventasP.length };
  }, [skus, ventas, cuentas, prestamos, period, customRange]);

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
