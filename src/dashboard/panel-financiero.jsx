// Panel: Financiero — 5 tabs: análisis (KPIs + deuda) + 4 paneles CRUD de productos.

function ProgressBar({ pct, color, height = 6 }) {
  const T = useTheme();
  return (
    <div style={{ height, background: T.t4, position: 'relative', overflow: 'hidden' }}>
      <div style={{ position: 'absolute', left: 0, top: 0, height: '100%', width: `${Math.min(100, Math.max(0, pct))}%`, background: color }} />
    </div>
  );
}

function FinCard({ title, accent, children, sub }) {
  const T = useTheme();
  return (
    <div style={{ background: T.panel, border: `1px solid ${T.bd}`, margin: '0 0 0 14px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderBottom: `1px solid ${T.bd}` }}>
        <div style={{ width: 2, height: 14, background: accent }} />
        <div style={{ fontSize: 11, color: T.t, letterSpacing: '0.16em', fontWeight: 600 }}>{title.toUpperCase()}</div>
        {sub && <div style={{ fontSize: 9, color: T.t3, marginLeft: 'auto', letterSpacing: '0.06em' }}>{sub}</div>}
      </div>
      <div style={{ padding: '12px 14px' }}>{children}</div>
    </div>
  );
}

function FinKV({ label, value, color }) {
  const T = useTheme();
  return (
    <div style={{ background: T.panel2, border: `1px solid ${T.bd}`, padding: '8px 10px' }}>
      <div style={{ fontSize: 9, color: T.t3, letterSpacing: '0.12em' }}>▸ {label.toUpperCase()}</div>
      <div style={{ fontSize: 13, color: color || T.t, marginTop: 3, fontWeight: 500 }}>{value}</div>
    </div>
  );
}

function PanelFinanciero() {
  const T = useTheme();
  const [tab, setTab] = React.useState('analisis');

  const TABS = [
    { id: 'analisis',   l: 'ANÁLISIS · KPIS',    i: '01' },
    { id: 'creditos',   l: 'LÍNEAS DE CRÉDITO',  i: '02' },
    { id: 'prestamos',  l: 'PRÉSTAMOS',          i: '03' },
    { id: 'inversores', l: 'INVERSORES',         i: '04' },
    { id: 'bancos',     l: 'CUENTAS DE BANCO',   i: '05' },
  ];

  return (
    <div>
      <div style={{ display: 'flex', gap: 0, padding: '10px 0 0 14px', borderBottom: `1px solid ${T.bd}`, marginTop: 4, flexWrap: 'wrap' }}>
        {TABS.map((tt) => {
          const on = tab === tt.id;
          return (
            <button key={tt.id} onClick={() => setTab(tt.id)} style={{
              background: 'transparent', color: on ? T.t : T.t2,
              border: 'none', borderBottom: on ? `2px solid ${T.hot}` : '2px solid transparent',
              padding: '10px 16px', fontFamily: 'inherit', fontSize: 11, fontWeight: 600,
              letterSpacing: '0.14em', cursor: 'pointer',
            }}>
              <span style={{ color: T.t3, marginRight: 8 }}>{tt.i}</span>{tt.l}
            </button>
          );
        })}
      </div>

      {tab === 'analisis' && (
        <>
          <FinKpisDeuda />
          <FinAnalisis />
        </>
      )}
      {tab === 'creditos'   && <PanelFinCreditos />}
      {tab === 'prestamos'  && <PanelFinPrestamos />}
      {tab === 'inversores' && <PanelFinInversores />}
      {tab === 'bancos'     && <PanelFinBancos />}
    </div>
  );
}

// KPIs de alto nivel — típicamente la primera cosa que ves al entrar.
// El detalle de cada producto vive en sus tabs propias (02–05).
function FinKpisDeuda() {
  const T = useTheme();
  const deudaTotal = COOP.saldo + ANDREA.pendiente + BHD.usado;
  const compromisoMes = COOP.cuota + COOP.seguro
    + (ANDREA.pagado / Math.max(1, ANDREA.pagos.length))
    + (BHD.usado * BHD.tasaMensual / 100);

  return (
    <div>
      <TSectionHead ix="§01" name="KPIs generales" count={`DEUDA ${fmt(deudaTotal)}`} />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', border: `1px solid ${T.bd}`, margin: '0 0 0 14px' }}>
        <TCell label="Deuda.total" value={fmt(deudaTotal)} color={T.re} accent={T.re} big
          sub="COOP + ANDREA + BHD" />
        <TCell label="Saldo.coop" value={fmt(COOP.saldo)} accent={T.hot} big
          sub={`${COOP.tasa}%/mes · cuota ${fmt(COOP.cuota)}`} />
        <TCell label="Pendiente.andrea" value={fmt(ANDREA.pendiente)} color={T.pu} accent={T.pu} big
          sub={`retorno 2× · pagado ${fmt(ANDREA.pagado)}`} />
        <TCell label="Compromiso.mes" value={fmt(compromisoMes)} color={T.am} accent={T.am} big
          sub="cuotas + intereses estimados" />
      </div>
    </div>
  );
}

function FinAnalisis() {
  const T = useTheme();
  const G_MES = 16000;
  const C = { saldo: COOP.saldo, tasa: COOP.tasa, cuota: COOP.cuota };
  const A = { pend: ANDREA.pendiente, meses: 48 };
  const B = { limite: BHD.limite, usado: BHD.usado, tasaM: BHD.tasaMensual / 100 };

  const [simExtra, setSimExtra] = React.useState(0);

  const costoCoop = C.saldo * C.tasa / 100;
  const costoAndrea = A.pend / A.meses;
  const costoBhd = B.usado * B.tasaM;
  const costoTotal = costoCoop + costoAndrea + costoBhd;
  const ratio = G_MES / Math.max(1, costoTotal);

  const cuotas = C.cuota + A.pend / A.meses + B.usado * B.tasaM;
  const pctDeuda = (cuotas / G_MES) * 100;
  const espacio = G_MES * 0.30 - cuotas;
  const bhdLibre = B.limite - B.usado;

  let sem, semColor, semText;
  if (ratio >= 3 && pctDeuda <= 30) { sem = 'VERDE'; semColor = T.gn; semText = 'Rentable y caja holgada'; }
  else if (ratio >= 1.5 && pctDeuda <= 45) { sem = 'AMARILLO'; semColor = T.am; semText = 'Rentable, caja ajustada'; }
  else { sem = 'ROJO'; semColor = T.re; semText = 'Revisar con cuidado'; }

  // Simulator outputs
  const nuevaCuota = cuotas + simExtra * B.tasaM;
  const nuevoPct = (nuevaCuota / G_MES) * 100;
  const nuevoCostoTotal = costoTotal + simExtra * B.tasaM;
  const nuevoRatio = G_MES / Math.max(1, nuevoCostoTotal);

  return (
    <div>
      <div style={{
        margin: '10px 14px 0', padding: '10px 14px',
        background: '#2a1d3a', border: `1px solid ${T.pu}`, color: T.pu,
        fontSize: 10, letterSpacing: '0.06em', lineHeight: 1.55,
      }}>
        ⚠ CALCULADORA DE <strong>REFERENCIA, NO CONSEJO FINANCIERO</strong>. Cada KPI muestra su fórmula. Las decisiones son del usuario.
        <br/>SUPUESTOS · G_MES = RD$16,000 · COOP {C.tasa}% mes · ANDREA objetivo 48 mo · BHD {(BHD.tasaMensual).toFixed(2)}% mes
      </div>

      {/* Salud */}
      <TSectionHead ix="§02" name="Salud de la deuda" count="SEMÁFORO + 3 KPIS" />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', border: `1px solid ${T.bd}`, margin: '0 0 0 14px' }}>
        <div style={{ padding: '14px 16px', background: T.panel, borderRight: `1px solid ${T.bd}`, position: 'relative', display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 2, background: semColor }} />
          <div style={{ fontSize: 9, color: T.t3, letterSpacing: '0.14em' }}>▸ SEMAFORO</div>
          <div style={{ fontSize: 26, color: semColor, fontWeight: 600, letterSpacing: '-0.01em' }}>{sem}</div>
          <div style={{ fontSize: 10, color: T.t2 }}>{semText}</div>
          <div style={{ fontSize: 8, color: T.t4, fontStyle: 'italic' }}>referencia · NO consejo financiero</div>
        </div>
        <TCell label="Deuda.buena?" value={ratio.toFixed(2) + '×'} accent={ratio >= 1.5 ? T.gn : T.re} color={ratio >= 1.5 ? T.gn : T.re}
          sub={`G_MES / costo total · ≥ 1.5× rentable`} />
        <TCell label="%.en.deuda" value={pctDeuda.toFixed(1) + '%'}
          color={pctDeuda <= 30 ? T.gn : pctDeuda <= 45 ? T.am : T.re}
          accent={pctDeuda <= 30 ? T.gn : pctDeuda <= 45 ? T.am : T.re}
          sub={`cuotas / G_MES · ≤30% holgado`} />
        <TCell label="Costo.mensual" value={fmt(costoTotal)} color={T.re} accent={T.re}
          sub={`COOP ${fmt(costoCoop)} · AND ${fmt(costoAndrea)} · BHD ${fmt(costoBhd)}`} />
      </div>

      {/* Capacidad */}
      <TSectionHead ix="§03" name="¿Puedo tomar más deuda?" />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', border: `1px solid ${T.bd}`, margin: '0 0 0 14px' }}>
        <TCell label="Capacidad.hasta.30%" value={(espacio >= 0 ? '+' : '') + fmt(espacio)}
          color={espacio >= 0 ? T.gn : T.re} accent={espacio >= 0 ? T.gn : T.re}
          sub={`(${fmtNum(G_MES)} × 30%) − ${fmt(cuotas)} cuotas`} big />
        <TCell label="BHD.sin.usar" value={fmt(bhdLibre)} color={T.bl} accent={T.bl}
          sub={`límite ${fmt(B.limite)} − usado ${fmt(B.usado)}`} big />
      </div>

      {/* Simulator */}
      <TSectionHead ix="§04" name="Simulador · ¿qué pasa si pido más?" count={`+${fmt(simExtra)} VIA BHD`} />
      <div style={{ background: T.panel, border: `1px solid ${T.bd}`, margin: '0 0 0 14px', padding: '14px 16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 14 }}>
          <div style={{ fontSize: 10, color: T.t3, letterSpacing: '0.14em', minWidth: 120 }}>▸ EXTRA · VIA BHD</div>
          <input type="range" min="0" max="100000" step="5000" value={simExtra}
            onChange={(e) => setSimExtra(Number(e.target.value))}
            style={{ flex: 1, accentColor: T.hot }} />
          <div style={{ minWidth: 110, textAlign: 'right', color: T.hot, fontWeight: 600, fontSize: 14 }}>{fmt(simExtra)}</div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 8 }}>
          <FinKV label="Nueva cuota mensual" value={fmt(nuevaCuota)} color={T.am} />
          <FinKV label="Nuevo % en deuda" value={nuevoPct.toFixed(1) + '%'} color={nuevoPct <= 30 ? T.gn : nuevoPct <= 45 ? T.am : T.re} />
          <FinKV label="Nuevo ratio rentab." value={nuevoRatio.toFixed(2) + '×'} color={nuevoRatio >= 1.5 ? T.gn : T.re} />
          <FinKV label="Veredicto" value={nuevoPct <= 30 && nuevoRatio >= 3 ? 'Aún rentable' : nuevoPct <= 45 ? 'Caja ajustada' : 'Margen fino'} color={nuevoPct <= 30 ? T.gn : nuevoPct <= 45 ? T.am : T.re} />
        </div>
        <div style={{ fontSize: 9, color: T.t4, marginTop: 10, fontStyle: 'italic' }}>
          fórmula: nueva_cuota = cuotas + extra × BHD.tasaM · ratio = G_MES / (costo_total + extra × tasaM)
        </div>
      </div>

      {/* Orden de pago */}
      <TSectionHead ix="§05" name="¿Qué deuda pagar primero?" count="POR TASA EFECTIVA DESC" />
      <div style={{ background: T.panel, border: `1px solid ${T.bd}`, margin: '0 0 0 14px' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
          <thead>
            <tr style={{ background: T.panel2 }}>
              {['PRIORIDAD','DEUDA','TASA EFECTIVA','RAZÓN'].map((h, i) => (
                <th key={h} style={{ textAlign: i === 0 ? 'left' : i === 3 ? 'left' : 'right', padding: '8px 14px',
                  color: T.t3, fontSize: 9, letterSpacing: '0.14em', fontWeight: 600, borderBottom: `1px solid ${T.bd}` }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr style={{ borderBottom: `1px solid ${T.bd}` }}>
              <td style={{ padding: '9px 14px', color: T.hot, fontWeight: 600 }}>1ª</td>
              <td style={{ padding: '9px 14px', color: T.t }}>BHD (línea revolvente)</td>
              <td style={{ padding: '9px 14px', textAlign: 'right', color: T.re }}>{BHD.tasaMensual.toFixed(2)}% / mo</td>
              <td style={{ padding: '9px 14px', color: T.t2 }}>tasa nominal más alta · revolvente</td>
            </tr>
            <tr style={{ borderBottom: `1px solid ${T.bd}` }}>
              <td style={{ padding: '9px 14px', color: T.am, fontWeight: 600 }}>2ª</td>
              <td style={{ padding: '9px 14px', color: T.t }}>Andrea (inversora 2×)</td>
              <td style={{ padding: '9px 14px', textAlign: 'right', color: T.am }}>~2.08% / mo del aporte</td>
              <td style={{ padding: '9px 14px', color: T.t2 }}>100% retorno repartido en 48 mo</td>
            </tr>
            <tr>
              <td style={{ padding: '9px 14px', color: T.gn, fontWeight: 600 }}>3ª</td>
              <td style={{ padding: '9px 14px', color: T.t }}>Cooperativa</td>
              <td style={{ padding: '9px 14px', textAlign: 'right', color: T.gn }}>{C.tasa.toFixed(2)}% / mo</td>
              <td style={{ padding: '9px 14px', color: T.t2 }}>tasa más baja · cuota fija</td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Cuándo libre */}
      <TSectionHead ix="§06" name="¿Cuándo libre?" />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', border: `1px solid ${T.bd}`, margin: '0 0 0 14px' }}>
        <TCell label="Coop.libre" value={`${Math.ceil(C.saldo / C.cuota)} meses`} accent={T.hot}
          sub={`${fmt(C.saldo)} / ${fmt(C.cuota)} cuota`} big />
        <TCell label="Andrea.libre" value={`${A.meses} meses`} color={T.pu} accent={T.pu}
          sub={`objetivo configurado · 4 años`} big />
      </div>

      {/* Oportunidad BHD */}
      <TSectionHead ix="§07" name="Costo de oportunidad · BHD libre" count={`${fmt(bhdLibre)}`} />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', border: `1px solid ${T.bd}`, margin: '0 0 0 14px' }}>
        <TCell label="Ganancia.potencial" value={fmt(bhdLibre * 0.40)} color={T.gn} accent={T.gn}
          sub={`${fmt(bhdLibre)} × 40% margen prom.`} />
        <TCell label="Costo.credito" value={fmt(bhdLibre * BHD.tasaMensual / 100)} color={T.re} accent={T.re}
          sub={`${fmt(bhdLibre)} × ${BHD.tasaMensual.toFixed(2)}% mes`} />
        <TCell label="Neto.mensual" value={fmt(bhdLibre * 0.40 - bhdLibre * BHD.tasaMensual / 100)} color={T.gn} accent={T.gn}
          sub="ganancia − costo" />
        <TCell label="Ratio.retorno" value={(0.40 / (BHD.tasaMensual / 100)).toFixed(2) + '×'} color={T.hot} accent={T.hot}
          sub="ganancia / costo crédito" />
      </div>
    </div>
  );
}

window.PanelFinanciero = PanelFinanciero;
