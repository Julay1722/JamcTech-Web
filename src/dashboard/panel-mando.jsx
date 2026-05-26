// Panel: Mando — vista unificada de análisis · P&L + Cash Flow + métricas.
// No registra nada (ese flujo vive en INVENTARIO §06 y VENTAS).
// Organizado por apartados simétricos: cada § es un bloque de 4 cards big
// (o tabla / chart cuando aplica). Filtrable por período desde la barra global.

const CATEGORIAS_FINANCIERAS = ['Aportes para negocio', 'Pago a Inversores', 'Pago Prestamo', 'Intereses'];
const esFinanciero = (c) => CATEGORIAS_FINANCIERAS.includes(c);

function PanelMando({ filter }) {
  const T = useTheme();

  // ── P&L (mensual) ─────────────────────────────────────────────
  // Overlay session ventas onto the months they fall in, so the dashboard
  // reflects today's activity instead of just the Airtable snapshot.
  const sessionVentas = useSessionEvents((e) => e.tipo === 'venta');
  const sessionByMonth = React.useMemo(() => {
    const M_ES = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
    const out = {};
    sessionVentas.forEach((e) => {
      if (!e.fecha) return;
      const parts = e.fecha.split('-');
      if (parts.length < 2) return;
      const key = `${M_ES[parseInt(parts[1], 10) - 1]}-${parts[0].slice(2)}`;
      if (!out[key]) out[key] = { v: 0, g: 0, n: 0 };
      out[key].v += e.precioFacturadoTotal ?? e.precioTotal ?? 0;
      out[key].g += e.gananciaTotal ?? e.ganancia ?? 0;
      out[key].n += 1;
    });
    return out;
  }, [sessionVentas]);

  const atResumen = useAirtableTable('resumen');
  const baseMES = atResumen.loaded ? (window.__AIRTABLE_DATA__?.resumen || MES) : MES;
  const { datos: MfRaw, parcial } = applyFilterOrLatest(baseMES, filter);
  if (MfRaw.length === 0) return null;
  const Mf = MfRaw.map((x) => {
    const extra = sessionByMonth[x.m];
    if (!extra || (extra.v === 0 && extra.g === 0)) return x;
    const v = x.v + extra.v;
    const g = x.g + extra.g;
    return { ...x, v, g, p: v > 0 ? (g / v) * 100 : 0, _sessionDelta: extra };
  });
  const Mc = Mf.slice();
  const Md = Mf.slice().reverse();

  const tv = Mf.reduce((s, x) => s + x.v, 0);
  const tg = Mf.reduce((s, x) => s + x.g, 0);
  const tm = tv > 0 ? (tg / tv) * 100 : 0;
  const cap = Md[0].c;
  const growth = Md.length > 1 ? ((Md[0].v - Md[1].v) / Md[1].v) * 100 : null;

  const best = Mf.reduce((a, b) => (b.v > a.v ? b : a), Mf[0]);
  const margins = Mf.map((x) => x.p);
  const mMax = Math.max(...margins);
  const mMin = Math.min(...margins);
  const avgG = tg / Mf.length;
  const avgV = tv / Mf.length;

  // ── Inventario / ventas ───────────────────────────────────────
  const SK = buildSK();
  const criticos = SK.filter((s) => s.estado === 'critico').length;
  const totalHist = MES.reduce((s, x) => s + x.v, 0);
  const udsHist = Object.values(VENTAS_SKU).reduce((s, n) => s + n, 0);
  const udsPer = Math.round(udsHist * (tv / Math.max(1, totalHist)));
  const ticket = udsPer > 0 ? tv / udsPer : 0;
  const topSku = SK.slice().sort((a, b) => b.vendido - a.vendido)[0];

  // ── Cash Flow (movimientos) ───────────────────────────────────
  const sessionCF = useSessionCF();
  const atVentas = useAirtableTable('ventas');
  const atCF = useAirtableTable('cashflow');
  const airtableCF = atCF.loaded ? (window.__AIRTABLE_DATA__?.cashflow || []) : [];
  const airtableVentas = (!atCF.loaded && atVentas.loaded) ? (window.__AIRTABLE_DATA__?.ventasCF || []) : [];
  const baseCF = atCF.loaded
    ? airtableCF
    : (airtableVentas.length > 0
        ? [...airtableVentas, ...CF_ALL.filter((r) => r.c !== 'Venta de mercancia')]
        : CF_ALL);
  const cfDatos = applyFilter([...sessionCF, ...baseCF], filter);
  const tE = cfDatos.reduce((s, m) => s + m.e, 0);
  const tS = cfDatos.reduce((s, m) => s + m.s, 0);
  const neto = tE - tS;
  const opMovs = cfDatos.filter((r) => !esFinanciero(r.c));
  const finMovs = cfDatos.filter((r) => esFinanciero(r.c));
  const opE = opMovs.reduce((s, r) => s + r.e, 0);
  const opS = opMovs.reduce((s, r) => s + r.s, 0);
  const finE = finMovs.reduce((s, r) => s + r.e, 0);
  const finS = finMovs.reduce((s, r) => s + r.s, 0);
  const ventas = opMovs.filter((r) => r.c === 'Venta de mercancia').reduce((s, r) => s + r.e, 0);
  const comprasMerc = opMovs.filter((r) => r.c === 'Compra de mercancia').reduce((s, r) => s + r.s, 0);
  const gastosOpCats = ['Pago Envio','Envio Mercancia','Pago Comision','Cuentas por pagar','Pago ADS','Courier','Pago deuda','Otro'];
  const gastosOp = opMovs.filter((r) => gastosOpCats.includes(r.c)).reduce((s, r) => s + r.s, 0);
  const aportes = finMovs.filter((r) => r.c === 'Aportes para negocio').reduce((s, r) => s + r.e, 0);
  const pagoInv = finMovs.filter((r) => r.c === 'Pago a Inversores').reduce((s, r) => s + r.s, 0);
  const pagoPrest = finMovs.filter((r) => r.c === 'Pago Prestamo').reduce((s, r) => s + r.s, 0);
  const intereses = finMovs.filter((r) => r.c === 'Intereses').reduce((s, r) => s + r.s, 0);

  // ── Balance acumulado (siempre desde el inicio de los registros) ──
  let acc = 0;
  const bal = CF_MES.map((m) => { acc += m.e - m.s; return { m: m.m, bal: acc, e: m.e, s: m.s }; });

  // ── Series para charts ────────────────────────────────────────
  const ventasArr = Mc.map((m) => m.v);
  const ganArr = Mc.map((m) => m.g);
  const margenArr = Mc.map((m) => m.p);
  const capArr = Mc.map((m) => m.c);

  // ── CF tail con filtro op/fin ─────────────────────────────────
  const [vistaCF, setVistaCF] = React.useState('todas');
  const tailRows = (vistaCF === 'op' ? opMovs : vistaCF === 'fin' ? finMovs : cfDatos).slice(0, 30);

  return (
    <div>
      {parcial && (
        <div style={{
          background: '#3a2f12', border: `1px solid ${T.am}`, color: T.am,
          padding: '8px 12px', margin: '6px 0 0 14px', fontSize: 11, letterSpacing: '0.04em',
        }}>
          ⚠ RANGO MUY CORTO — MOSTRANDO {Md[0].m.toUpperCase()} (más reciente disponible)
        </div>
      )}

      {/* §01 P&L · totales del período */}
      <TSectionHead ix="§01" name="P&L · totales del período" count={`${Mf.length} MO`} />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', border: `1px solid ${T.bd}`, margin: '0 0 0 14px' }}>
        <TCell centered label="Sales.total" value={fmt(tv)} accent={T.hot} spark={ventasArr} sparkColor={T.hot} big
          sub={`Ingresos del período · ${Mf.length} meses`} />
        <TCell centered label="Profit.total" value={fmt(tg)} color={T.gn} accent={T.gn} spark={ganArr} sparkColor={T.gn} big
          sub={`Ganancia bruta · margen ${tm.toFixed(1)}%`} />
        <TCell centered label="Capital.close" value={fmt(cap)} accent={T.bl} spark={capArr} sparkColor={T.bl} big
          sub={`Capital al cierre · ${Md[0].m}`} />
        <TCell centered label="Growth.mom"
          value={growth == null ? '—' : (growth >= 0 ? '+' : '') + growth.toFixed(1) + '%'}
          color={growth == null ? T.t3 : growth >= 0 ? T.gn : T.re}
          accent={growth == null ? T.bd : growth >= 0 ? T.gn : T.re} big
          sub={growth == null ? 'Sin mes anterior en rango' : `${Md[1].m} → ${Md[0].m}`} />
      </div>

      {/* §02 Cash Flow · resumen del período */}
      <TSectionHead ix="§02" name="Cash Flow · resumen del período" count={`${cfDatos.length} MOV`} />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', border: `1px solid ${T.bd}`, margin: '0 0 0 14px' }}>
        <TCell centered label="Entradas.tot" value={fmt(tE)} color={T.gn} accent={T.gn} big
          sub="Dinero que entró al negocio" />
        <TCell centered label="Salidas.tot" value={fmt(tS)} color={T.re} accent={T.re} big
          sub="Dinero que salió del negocio" />
        <TCell centered label="Flujo.neto" value={(neto >= 0 ? '+' : '') + fmt(neto)}
          color={neto >= 0 ? T.gn : T.re} accent={neto >= 0 ? T.gn : T.re} big
          sub={neto >= 0 ? 'Entró más que salió ✓' : 'Salió más que entró ⚠'} />
        <TCell centered label="Movimientos" value={String(cfDatos.length)} accent={T.t2} big
          sub={`${opMovs.length} oper · ${finMovs.length} financ`} />
      </div>

      {/* §03 Rendimiento mensual */}
      <TSectionHead ix="§03" name="Rendimiento mensual" count="MEJOR · MARGEN · PROMEDIOS" />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', border: `1px solid ${T.bd}`, margin: '0 0 0 14px' }}>
        <TCell centered label="Best.month" value={best.m} accent={T.hot} color={T.hot} big
          sub={`${fmt(best.v)} · ${best.p.toFixed(1)}% margen`} />
        <TCell centered label="Margin.max/min" value={`${mMax.toFixed(1)}% / ${mMin.toFixed(1)}%`} accent={T.am} big
          sub={`Rango ${(mMax - mMin).toFixed(1)} pp`} />
        <TCell centered label="Profit.avg/mo" value={fmt(avgG)} accent={T.gn} big
          sub={`Σ ÷ ${Mf.length} meses`} />
        <TCell centered label="Sales.avg/mo" value={fmt(avgV)} accent={T.hot} big
          sub={`Σ ÷ ${Mf.length} meses`} />
      </div>

      {/* §04 Flujo operativo */}
      <TSectionHead ix="§04" name="Flujo operativo · el negocio en sí" count={`${opMovs.length} mov`} />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', border: `1px solid ${T.bd}`, margin: '0 0 0 14px' }}>
        <TCell centered label="Ingresos.ventas" value={fmt(ventas)} color={T.gn} accent={T.gn} big
          sub={`${opMovs.filter(r=>r.c==='Venta de mercancia').length} ventas registradas`} />
        <TCell centered label="Compras.merc" value={fmt(comprasMerc)} color={T.re} accent={T.re} big
          sub="Alibaba · costo de lotes" />
        <TCell centered label="Gastos.op" value={fmt(gastosOp)} color={T.am} accent={T.am} big
          sub="Envío · courier · comisión · cuentas" />
        <TCell centered label="Neto.operativo"
          value={(opE - opS >= 0 ? '+' : '') + fmt(opE - opS)}
          color={opE - opS >= 0 ? T.gn : T.re}
          accent={opE - opS >= 0 ? T.gn : T.re} big
          sub={opE - opS >= 0 ? 'Se sostiene solo ✓' : 'Depende de capital externo'} />
      </div>

      {/* §05 Flujo financiero */}
      <TSectionHead ix="§05" name="Flujo financiero · deuda y capital" count={`${finMovs.length} mov`} />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', border: `1px solid ${T.bd}`, margin: '0 0 0 14px' }}>
        <TCell centered label="Aportes.recib" value={fmt(aportes)} color={T.pu} accent={T.pu} big
          sub="Capital externo inyectado" />
        <TCell centered label="Pago.inversores" value={fmt(pagoInv)} color={T.pu} accent={T.pu} big
          sub="Andrea Correa" />
        <TCell centered label="Pago.prestamo" value={fmt(pagoPrest)} color={T.pu} accent={T.pu} big
          sub={`Cooperativa · int. ${fmt(intereses)}`} />
        <TCell centered label="Neto.financiero"
          value={(finE - finS >= 0 ? '+' : '') + fmt(finE - finS)}
          color={finE - finS >= 0 ? T.pu : T.re} accent={T.pu} big
          sub="Aportes − pagos a deuda" />
      </div>

      {/* §06 Inventario y ventas */}
      <TSectionHead ix="§06" name="Inventario y ventas" count={`SKU.TOP · CRIT ${criticos}`} />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', border: `1px solid ${T.bd}`, margin: '0 0 0 14px' }}>
        <TCell centered label="Units.period" value={fmtNum(udsPer)} accent={T.bl} big
          sub={`Histórico ${fmtNum(udsHist)} ud`} />
        <TCell centered label="Top.SKU" value={topSku?.nm || '—'} accent={T.hot} color={T.hot} big
          sub={`${topSku?.vendido} ud · ${topSku?.cat}`} />
        <TCell centered label="Avg.ticket" value={fmt(ticket)} accent={T.pu} big
          sub={`${fmtNum(udsPer)} ud · ${fmt(tv)} ingreso`} />
        <TCell centered label="SKU.critico" value={String(criticos)}
          color={criticos === 0 ? T.gn : criticos < 4 ? T.am : T.re}
          accent={criticos === 0 ? T.gn : criticos < 4 ? T.am : T.re} big
          sub={criticos === 0 ? 'Todo en orden' : criticos < 4 ? 'Requiere atención' : 'Reorden urgente'} />
      </div>

      {/* §07 Series temporales */}
      <TSectionHead ix="§07" name="Series temporales" count="P&L · CASH FLOW · BALANCE" />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', border: `1px solid ${T.bd}`, margin: '0 0 0 14px' }}>
        <ChartPL Mc={Mc} ventasArr={ventasArr} ganArr={ganArr} margenArr={margenArr} maxV={Math.max(...ventasArr, 1)} />
        <ChartCFBars />
      </div>
      <div style={{ background: T.panel, border: `1px solid ${T.bd}`, borderTop: 'none', margin: '0 0 0 14px' }}>
        <ChartBalance bal={bal} />
      </div>

      {/* §08 Detalle mensual P&L */}
      <TSectionHead ix="§08" name="Detalle mensual P&L" count={`${Md.length} FILAS`} />
      <div style={{ background: T.panel, border: `1px solid ${T.bd}`, margin: '0 0 0 14px' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
          <thead>
            <tr style={{ background: T.panel2 }}>
              {['MES','VENTAS','GANANCIA','MARGEN','CAPITAL','vs ANT.'].map((h, i) => (
                <th key={h} style={{ padding: '9px 14px', textAlign: i === 0 ? 'left' : 'right',
                  fontSize: 9, fontWeight: 600, color: T.t3, letterSpacing: '0.14em',
                  borderBottom: `1px solid ${T.bd}` }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Md.map((m, i) => {
              const next = Md[i + 1];
              const vs = next ? ((m.v - next.v) / next.v) * 100 : null;
              return (
                <tr key={m.m} style={{ borderBottom: `1px solid ${T.bd}` }}>
                  <td style={{ padding: '8px 14px', color: T.t, fontWeight: 600 }}>{m.m.toUpperCase()}</td>
                  <td style={{ padding: '8px 14px', textAlign: 'right', color: T.t }}>{fmt(m.v)}</td>
                  <td style={{ padding: '8px 14px', textAlign: 'right', color: T.t2 }}>{fmt(m.g)}</td>
                  <td style={{ padding: '8px 14px', textAlign: 'right', color: m.p >= 40 ? T.gn : T.am }}>{m.p.toFixed(1)}%</td>
                  <td style={{ padding: '8px 14px', textAlign: 'right', color: T.t2 }}>{fmt(m.c)}</td>
                  <td style={{ padding: '8px 14px', textAlign: 'right', color: vs == null ? T.t4 : vs >= 0 ? T.gn : T.re, fontWeight: 500 }}>
                    {vs == null ? '──' : (vs >= 0 ? '▲' : '▼') + ' ' + Math.abs(vs).toFixed(1) + '%'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* §09 Movimientos · cash flow tail */}
      <TSectionHead ix="§09" name="Movimientos · cash flow tail"
        count={`${tailRows.length} / ${cfDatos.length} mov del período · 361 total`}
        right={
          <div style={{ display: 'flex', gap: 2, background: T.panel2, padding: 2, border: `1px solid ${T.bd}`, marginLeft: 8 }}>
            {[
              { id: 'todas', l: 'TODAS' },
              { id: 'op', l: 'OPER' },
              { id: 'fin', l: 'FIN' },
            ].map((v) => {
              const on = vistaCF === v.id;
              return (
                <button key={v.id} onClick={() => setVistaCF(v.id)} style={{
                  fontSize: 10, padding: '3px 9px', border: 'none',
                  background: on ? T.hot : 'transparent', color: on ? T.hotInk : T.t2,
                  fontFamily: 'inherit', cursor: 'pointer', fontWeight: 600, letterSpacing: '0.06em',
                }}>{v.l}</button>
              );
            })}
          </div>
        } />
      <div style={{ background: T.panel, border: `1px solid ${T.bd}`, margin: '0 0 0 14px' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 10 }}>
          <thead>
            <tr style={{ background: T.panel2 }}>
              {['FECHA','TIPO','CATEGORIA','AUX','ENTRADA','SALIDA','NETO'].map((h, i) => (
                <th key={h} style={{ textAlign: i < 4 ? 'left' : 'right', padding: '7px 12px',
                  color: T.t3, letterSpacing: '0.14em', fontSize: 9, fontWeight: 600,
                  borderBottom: `1px solid ${T.bd}` }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {tailRows.map((r, i) => {
              const fin = esFinanciero(r.c);
              const net = r.e - r.s;
              const isSession = !!r._src;
              return (
                <tr key={i} style={{ borderBottom: `1px dashed ${T.t4}`,
                  background: isSession ? T.panel2 : 'transparent' }}>
                  <td style={{ padding: '5px 12px', color: T.hot, letterSpacing: '0.04em',
                    borderLeft: isSession ? `2px solid ${T.am}` : '2px solid transparent' }}>{r.f}</td>
                  <td style={{ padding: '5px 12px' }}>
                    {isSession ? <TPill color={T.am}>SES</TPill> : fin ? <TPill color={T.pu}>FIN</TPill> : <TPill color={T.gn}>OP</TPill>}
                  </td>
                  <td style={{ padding: '5px 12px', color: T.t }}>{r.c}</td>
                  <td style={{ padding: '5px 12px', color: T.t3 }}>{r.a || '·'}</td>
                  <td style={{ padding: '5px 12px', textAlign: 'right', color: r.e > 0 ? T.gn : T.t4 }}>{r.e > 0 ? '+' + r.e.toLocaleString('es-DO', { maximumFractionDigits: 2 }) : '·'}</td>
                  <td style={{ padding: '5px 12px', textAlign: 'right', color: r.s > 0 ? T.re : T.t4 }}>{r.s > 0 ? '-' + r.s.toLocaleString('es-DO', { maximumFractionDigits: 2 }) : '·'}</td>
                  <td style={{ padding: '5px 12px', textAlign: 'right', color: net >= 0 ? T.gn : T.re, fontWeight: 500 }}>{(net >= 0 ? '+' : '') + net.toLocaleString('es-DO', { maximumFractionDigits: 0 })}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <div style={{ padding: '8px 14px', fontSize: 9, color: T.t3, letterSpacing: '0.12em', borderTop: `1px solid ${T.bd}` }}>
          ▌MOSTRANDO {tailRows.length} de {cfDatos.length} en período · 361 total Airtable
        </div>
      </div>
    </div>
  );
}

// ─── Charts (helpers locales para mantener PanelMando legible) ───
function ChartPL({ Mc, ventasArr, ganArr, margenArr, maxV }) {
  const T = useTheme();
  const chartW = 720, chartH = 200;
  const barW = (chartW - 50) / Mc.length;
  return (
    <div style={{ background: T.panel, padding: '14px 14px 10px', borderRight: `1px solid ${T.bd}` }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, color: T.t3, letterSpacing: '0.1em', marginBottom: 10 }}>
        <span>▸ VENTAS · GANANCIA · MARGEN%</span>
        <span>SCALE: <span style={{ color: T.t }}>0—{(maxV/1000).toFixed(0)}k</span> · Y₂ 25—60%</span>
      </div>
      <svg width="100%" viewBox={`0 0 ${chartW} ${chartH}`} preserveAspectRatio="none" style={{ display: 'block' }}>
        {[0, 0.25, 0.5, 0.75, 1].map((p, i) => (
          <line key={i} x1="36" x2={chartW - 8} y1={chartH - 24 - p * (chartH - 50)} y2={chartH - 24 - p * (chartH - 50)} stroke={T.bd} strokeDasharray="1 3" />
        ))}
        {Mc.map((m, i) => {
          const x = 36 + i * barW;
          // Clamp ≥0: g puede ser negativo en meses de pérdida (gastos > ingresos);
          // SVG rechaza height negativo. Pérdidas se reflejan en KPIs aparte.
          const vH = Math.max(0, (m.v / maxV) * (chartH - 50));
          const gH = Math.max(0, (m.g / maxV) * (chartH - 50));
          return (
            <g key={i}>
              <rect x={x + 2} y={chartH - 24 - vH} width={barW * 0.4} height={vH} fill={T.hotDim} />
              <rect x={x + barW * 0.5} y={chartH - 24 - gH} width={barW * 0.4} height={gH} fill={T.gn} opacity="0.7" />
              <text x={x + barW / 2} y={chartH - 8} fontSize="8" fill={T.t3} textAnchor="middle">{m.m.slice(0,3).toUpperCase()}</text>
            </g>
          );
        })}
        <line x1="36" x2={chartW - 8} y1={chartH - 24 - ((40 - 25) / 35) * (chartH - 50)} y2={chartH - 24 - ((40 - 25) / 35) * (chartH - 50)} stroke={T.am} strokeDasharray="3 2" opacity="0.5" />
        <path
          d={margenArr.map((p, i) => {
            const x = 36 + i * barW + barW / 2;
            const py = chartH - 24 - ((p - 25) / 35) * (chartH - 50);
            return (i === 0 ? 'M' : 'L') + x + ',' + py;
          }).join(' ')}
          fill="none" stroke={T.hot} strokeWidth="1.4"
        />
        {margenArr.map((p, i) => {
          const x = 36 + i * barW + barW / 2;
          const py = chartH - 24 - ((p - 25) / 35) * (chartH - 50);
          return <rect key={i} x={x - 2} y={py - 2} width={4} height={4} fill={T.hot} />;
        })}
      </svg>
    </div>
  );
}

function ChartCFBars() {
  const T = useTheme();
  const chartW = 720, chartH = 200;
  const maxBar = Math.max(...CF_MES.map((m) => Math.max(m.e, m.s)), 1);
  const barW = (chartW - 50) / CF_MES.length;
  return (
    <div style={{ background: T.panel, padding: '14px 14px 10px' }}>
      <div style={{ fontSize: 9, color: T.t3, letterSpacing: '0.1em', marginBottom: 10 }}>▸ ENTRADAS vs SALIDAS · MENSUAL</div>
      <svg width="100%" viewBox={`0 0 ${chartW} ${chartH}`} preserveAspectRatio="none">
        {[0, 0.25, 0.5, 0.75, 1].map((p, i) => (
          <line key={i} x1="36" x2={chartW - 8} y1={chartH - 20 - p * (chartH - 40)} y2={chartH - 20 - p * (chartH - 40)} stroke={T.bd} strokeDasharray="1 3" />
        ))}
        {CF_MES.map((m, i) => {
          const x = 36 + i * barW;
          // Clamp ≥0: e/s vienen positivos por diseño, pero defendemos por si
          // cambia el cálculo upstream (Airtable, session deltas, etc.).
          const eH = Math.max(0, (m.e / maxBar) * (chartH - 40));
          const sH = Math.max(0, (m.s / maxBar) * (chartH - 40));
          return (
            <g key={i}>
              <rect x={x + 2} y={chartH - 20 - eH} width={barW * 0.4} height={eH} fill={T.gn} />
              <rect x={x + barW * 0.5} y={chartH - 20 - sH} width={barW * 0.4} height={sH} fill={T.re} opacity="0.8" />
              <text x={x + barW / 2} y={chartH - 6} fontSize="8" fill={T.t3} textAnchor="middle">{m.m.slice(0,3).toUpperCase()}</text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function ChartBalance({ bal }) {
  const T = useTheme();
  const balW = 1500, balH = 180;
  const balMin = Math.min(0, ...bal.map((b) => b.bal));
  const balMax = Math.max(0, ...bal.map((b) => b.bal));
  const balScale = (b) => balH - 20 - ((b - balMin) / (balMax - balMin || 1)) * (balH - 40);
  return (
    <div style={{ background: T.panel, padding: '14px 14px 10px' }}>
      <div style={{ fontSize: 9, color: T.t3, letterSpacing: '0.1em', marginBottom: 10 }}>▸ BALANCE ACUMULADO · DESDE INICIO</div>
      <svg width="100%" viewBox={`0 0 ${balW} ${balH}`} preserveAspectRatio="none">
        <line x1="36" x2={balW - 8} y1={balScale(0)} y2={balScale(0)} stroke={T.re} strokeDasharray="3 2" opacity="0.5" />
        <path
          d={bal.map((b, i) => {
            const x = 36 + (i / (bal.length - 1)) * (balW - 50);
            return (i === 0 ? 'M' : 'L') + x + ',' + balScale(b.bal);
          }).join(' ') + ` L${balW - 14},${balScale(0)} L36,${balScale(0)} Z`}
          fill={T.hot} opacity="0.12"
        />
        <path
          d={bal.map((b, i) => {
            const x = 36 + (i / (bal.length - 1)) * (balW - 50);
            return (i === 0 ? 'M' : 'L') + x + ',' + balScale(b.bal);
          }).join(' ')}
          fill="none" stroke={T.hot} strokeWidth="1.5"
        />
        {bal.map((b, i) => {
          const x = 36 + (i / (bal.length - 1)) * (balW - 50);
          return (
            <g key={i}>
              <rect x={x - 2} y={balScale(b.bal) - 2} width={4} height={4} fill={T.hot} />
              <text x={x} y={balH - 6} fontSize="8" fill={T.t3} textAnchor="middle">{b.m.slice(0,3).toUpperCase()}</text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

window.PanelMando = PanelMando;
