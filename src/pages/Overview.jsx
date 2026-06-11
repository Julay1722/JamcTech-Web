// Resumen / Mando — KPIs (capital líquido, revenue, ganancia neta, stock) +
// charts. KPIs verificados vs SQL (ver Fase 3). Capital = saldo de cuentas
// líquidas (KPI-2/3), stock excluye LEGACY-SALE (KPI-1), deuda incluye tarjetas (KPI-5).
import { useMemo } from 'react';
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

    // Mix de valor de inventario por categoría
    const catVal = {};
    skus.forEach((k) => { catVal[k.categoria] = (catVal[k.categoria] || 0) + k.stock * k.cpp; });
    const donut = Object.entries(catVal).filter(([, v]) => v > 0)
      .map(([label, value]) => ({ label, value: Math.round(value), color: CAT_COLORS[label] || '#847b64' }))
      .sort((a, b) => b.value - a.value);

    // Top SKUs por ganancia (período completo, desde la vista de stock)
    const topSkus = [...skus].sort((a, b) => b.ganancia - a.ganancia).slice(0, 8)
      .filter((k) => k.ganancia > 0)
      .map((k) => ({ label: k.nombre, value: Math.round(k.ganancia) }));

    return { capitalLiquido, revenue, ganancia, stock, deudaRD, deudaUSD, revSerie, ganSerie, labels, donut, topSkus, nVentas: ventasP.length };
  }, [skus, ventas, cuentas, prestamos, period, customRange]);

  const margenPct = m.revenue > 0 ? (m.ganancia / m.revenue) * 100 : 0;

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
          <div className="section-head"><div className="section-title">Valor de inventario por categoría</div></div>
          <DonutChart data={m.donut} fmt={(n, p) => money(n) + ` (${p.toFixed(0)}%)`} title="RD$" />
        </div>
        <div className="section">
          <div className="section-head"><div className="section-title">Top SKUs por ganancia</div></div>
          <BarChart data={m.topSkus} fmt={(n) => 'RD$' + intNum(n)} color="var(--success)" />
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
