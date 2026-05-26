// Panel: Cash Flow — operativo vs financiero, balance acumulado, transaction tail.

const CATEGORIAS_FINANCIERAS = ['Aportes para negocio', 'Pago a Inversores', 'Pago Prestamo', 'Intereses'];
const esFinanciero = (c) => CATEGORIAS_FINANCIERAS.includes(c);

function PanelCashFlow({ filter }) {
  const T = useTheme();
  const [vista, setVista] = React.useState('todas'); // todas/op/fin
  const [pageSize, setPageSize] = React.useState(() => window.__LS__?.get('cf:pageSize') || 30);
  const [deletingId, setDeletingId] = React.useState(null);
  const [editingId, setEditingId] = React.useState(null);
  const [savingEditId, setSavingEditId] = React.useState(null);
  // Overlay session-only CF entries + Airtable-sourced cashflow (replace mocks when loaded)
  const sessionCF = useSessionCF();
  const atVentas = useAirtableTable('ventas');
  const atCF = useAirtableTable('cashflow');
  // Single source of truth: si Airtable cashflow está cargado, ÉL es la base.
  // Si no, usar mocks + overlay de venta sintetizada.
  const airtableCF = atCF.loaded ? (window.__AIRTABLE_DATA__?.cashflow || []) : [];
  const airtableVentas = (!atCF.loaded && atVentas.loaded) ? (window.__AIRTABLE_DATA__?.ventasCF || []) : [];
  const baseCF = atCF.loaded
    ? airtableCF
    : (airtableVentas.length > 0
        ? [...airtableVentas, ...CF_ALL.filter((r) => r.c !== 'Venta de mercancia')]
        : CF_ALL);
  const datos = applyFilter([...sessionCF, ...baseCF], filter);

  const tE = datos.reduce((s, m) => s + m.e, 0);
  const tS = datos.reduce((s, m) => s + m.s, 0);
  const neto = tE - tS;

  const opMovs = datos.filter((r) => !esFinanciero(r.c));
  const finMovs = datos.filter((r) => esFinanciero(r.c));
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

  // Balance acumulado from CF_MES
  let acc = 0;
  const bal = CF_MES.map((m) => { acc += m.e - m.s; return { m: m.m, bal: acc, e: m.e, s: m.s }; });

  // Chart
  const chartW = 760, chartH = 200;
  const maxBar = Math.max(...CF_MES.map((m) => Math.max(m.e, m.s)), 1);
  const barW = (chartW - 50) / CF_MES.length;

  const balW = 760, balH = 200;
  const balMin = Math.min(0, ...bal.map((b) => b.bal));
  const balMax = Math.max(0, ...bal.map((b) => b.bal));
  const balScale = (b) => balH - 20 - ((b - balMin) / (balMax - balMin || 1)) * (balH - 40);

  // Tail filtered by vista
  const filteredRows = vista === 'op' ? opMovs : vista === 'fin' ? finMovs : datos;
  const tailRows = filteredRows.slice(0, pageSize);

  // ── Export CSV helper (§8.5 · usa exportCSVDownload central con BOM UTF-8) ──
  const exportCSV = () => {
    const headers = ['Fecha', 'Tipo', 'Categoria', 'Aux', 'Entrada', 'Salida', 'Neto', 'AirtableID'];
    const rows = filteredRows.map((r) => {
      const tipo = r._src ? 'SESION' : (esFinanciero(r.c) ? 'FIN' : 'OP');
      return [r.f || '', tipo, r.c || '', r.a || '', r.e || 0, r.s || 0, (r.e || 0) - (r.s || 0), r._airtableId || ''];
    });
    window.exportCSVDownload(`cashflow-${HOY}-${vista}.csv`, headers, rows, {
      toastLabel: 'Cash flow exportado',
    });
  };

  // ── Delete from Airtable handler ──
  const handleDelete = async (row) => {
    if (!row._airtableId) {
      window.toastWarn?.('No se puede eliminar', 'Este movimiento no tiene ID de Airtable');
      return;
    }
    if (!confirm(`¿Eliminar este movimiento de Airtable?\n\n${row.f} · ${row.c}\nEntrada: ${row.e} · Salida: ${row.s}\n\nEsta acción es permanente.`)) return;
    setDeletingId(row._airtableId);
    try {
      await window.AT_CLIENT.remove('cashflow', row._airtableId);
      // Remueve del array local
      const arr = window.__AIRTABLE_DATA__?.cashflow;
      if (arr) {
        const idx = arr.findIndex((x) => x._airtableId === row._airtableId);
        if (idx >= 0) arr.splice(idx, 1);
      }
      window.toastOk?.('Eliminado', `${row.c} · ${row.f}`);
      window.dispatchEvent(new CustomEvent('airtable-loaded', { detail: { table: 'cashflow' } }));
    } catch (e) {
      window.toastErr?.('No se eliminó', e.message?.slice(0, 100) || 'error');
    }
    setDeletingId(null);
  };

  // ── Edit from Airtable handler · §8.1 ──
  const handleSaveEdit = async (row, patch) => {
    if (!row._airtableId) return;
    const F = window.AT.fields.cashflow;
    const fields = {};
    if (patch.f != null) fields[F.fecha] = patch.f;
    if (patch.c != null) fields[F.cuenta] = patch.c;
    if (patch.a != null) fields[F.auxiliar] = patch.a;
    if (patch.e != null) fields[F.entrada] = Number(patch.e) || 0;
    if (patch.s != null) fields[F.salida] = Number(patch.s) || 0;
    if (patch.notas != null) fields[F.notas] = patch.notas;
    setSavingEditId(row._airtableId);
    try {
      await window.AT_CLIENT.update('cashflow', row._airtableId, fields);
      // Refleja localmente
      const arr = window.__AIRTABLE_DATA__?.cashflow;
      if (arr) {
        const target = arr.find((x) => x._airtableId === row._airtableId);
        if (target) {
          if (patch.f != null) target.f = patch.f;
          if (patch.c != null) target.c = patch.c;
          if (patch.a != null) target.a = patch.a;
          if (patch.e != null) target.e = Number(patch.e) || 0;
          if (patch.s != null) target.s = Number(patch.s) || 0;
        }
      }
      window.toastOk?.('Movimiento actualizado', `${patch.c || row.c} · ${patch.f || row.f}`);
      window.dispatchEvent(new CustomEvent('airtable-loaded', { detail: { table: 'cashflow' } }));
      setEditingId(null);
    } catch (e) {
      window.toastErr?.('No se actualizó', e.message?.slice(0, 100) || 'error');
    }
    setSavingEditId(null);
  };

  return (
    <div>
      <TSectionHead ix="§01" name="Resumen del flujo" count={`${datos.length} MOV`} />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', border: `1px solid ${T.bd}`, margin: '0 0 0 14px' }}>
        <TCell label="Entradas.tot" value={fmt(tE)} color={T.gn} accent={T.gn} sub={`${datos.filter(r=>r.e>0).length} eventos`} big />
        <TCell label="Salidas.tot" value={fmt(tS)} color={T.re} accent={T.re} sub={`${datos.filter(r=>r.s>0).length} eventos`} big />
        <TCell label="Flujo.neto" value={(neto >= 0 ? '+' : '') + fmt(neto)} color={neto >= 0 ? T.gn : T.re} accent={neto >= 0 ? T.gn : T.re}
          sub={neto >= 0 ? 'Entró más ✓' : 'Salió más ⚠'} big />
        <TCell label="Movimientos" value={String(datos.length)} accent={T.t2}
          sub={`${opMovs.length} oper · ${finMovs.length} financ`} big />
      </div>

      <TSectionHead ix="§02" name="Flujo operativo · el negocio en sí" count={`${opMovs.length} mov`} />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', border: `1px solid ${T.bd}`, margin: '0 0 0 14px' }}>
        <TCell label="Ingresos.ventas" value={fmt(ventas)} color={T.gn} accent={T.gn}
          sub={`${opMovs.filter(r=>r.c==='Venta de mercancia').length} ventas registradas`} />
        <TCell label="Compras.mercancia" value={fmt(comprasMerc)} color={T.re} accent={T.re}
          sub="Alibaba · costo lote" />
        <TCell label="Gastos.op" value={fmt(gastosOp)} color={T.am} accent={T.am}
          sub="envío + courier + comisión + cuentas" />
        <TCell label="Neto.operativo"
          value={(opE - opS >= 0 ? '+' : '') + fmt(opE - opS)}
          color={opE - opS >= 0 ? T.gn : T.re}
          accent={opE - opS >= 0 ? T.gn : T.re}
          sub={opE - opS >= 0 ? 'Se sostiene solo ✓' : 'Depende de capital externo ⚠'} />
      </div>

      <TSectionHead ix="§03" name="Flujo financiero · deuda y capital" count={`${finMovs.length} mov`} />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', border: `1px solid ${T.bd}`, margin: '0 0 0 14px' }}>
        <TCell label="Aportes.recibidos" value={fmt(aportes)} color={T.pu} accent={T.pu}
          sub="capital externo inyectado" />
        <TCell label="Pago.inversores" value={fmt(pagoInv)} color={T.pu} accent={T.pu}
          sub="Andrea Correa" />
        <TCell label="Pago.prestamo" value={fmt(pagoPrest)} color={T.pu} accent={T.pu}
          sub={`Cooperativa · int. aparte ${fmt(intereses)}`} />
        <TCell label="Neto.financiero"
          value={(finE - finS >= 0 ? '+' : '') + fmt(finE - finS)}
          color={finE - finS >= 0 ? T.pu : T.re} accent={T.pu}
          sub="aportes − pagos a deuda" />
      </div>

      <TSectionHead ix="§04" name="Series mensuales · CF_MES" count="ENTRADAS · SALIDAS · BALANCE" />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', border: `1px solid ${T.bd}`, margin: '0 0 0 14px' }}>
        <div style={{ background: T.panel, padding: '14px 14px 10px', borderRight: `1px solid ${T.bd}` }}>
          <div style={{ fontSize: 9, color: T.t3, letterSpacing: '0.1em', marginBottom: 10 }}>▸ ENTRADAS vs SALIDAS · MENSUAL</div>
          <svg width="100%" viewBox={`0 0 ${chartW} ${chartH}`} preserveAspectRatio="none">
            {[0, 0.25, 0.5, 0.75, 1].map((p, i) => (
              <line key={i} x1="36" x2={chartW - 8} y1={chartH - 20 - p * (chartH - 40)} y2={chartH - 20 - p * (chartH - 40)} stroke={T.bd} strokeDasharray="1 3" />
            ))}
            {CF_MES.map((m, i) => {
              const x = 36 + i * barW;
              // Clamp ≥0: e/s vienen positivos por diseño, pero defendemos
              // por si cambia el cálculo upstream.
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
        <div style={{ background: T.panel, padding: '14px 14px 10px' }}>
          <div style={{ fontSize: 9, color: T.t3, letterSpacing: '0.1em', marginBottom: 10 }}>▸ BALANCE ACUMULADO</div>
          <svg width="100%" viewBox={`0 0 ${balW} ${balH}`} preserveAspectRatio="none">
            {/* zero line */}
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
      </div>

      <TSectionHead ix="§05" name="Movimientos · tail"
        count={`${tailRows.length} / ${datos.length} mov del período · 361 total`}
        right={
          <div style={{ display: 'flex', gap: 2, background: T.panel2, padding: 2, border: `1px solid ${T.bd}`, marginLeft: 8 }}>
            {[
              { id: 'todas', l: 'TODAS' },
              { id: 'op', l: 'OPER' },
              { id: 'fin', l: 'FIN' },
            ].map((v) => {
              const on = vista === v.id;
              return (
                <button key={v.id} onClick={() => setVista(v.id)} style={{
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
              {['FECHA','TIPO','CATEGORIA','AUX','ENTRADA','SALIDA','NETO',''].map((h, i) => (
                <th key={h + i} style={{ textAlign: i < 4 ? 'left' : (i === 7 ? 'center' : 'right'), padding: '7px 12px',
                  color: T.t3, letterSpacing: '0.14em', fontSize: 9, fontWeight: 600,
                  borderBottom: `1px solid ${T.bd}`, width: i === 7 ? 34 : undefined }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {tailRows.map((r, i) => {
              const fin = esFinanciero(r.c);
              const net = r.e - r.s;
              const isSession = !!r._src;
              const canDelete = !!r._airtableId && !isSession;
              const canEdit = !!r._airtableId && !isSession;
              const isDeletingThis = deletingId === r._airtableId;
              const isEditingThis = editingId === r._airtableId;
              return (
                <React.Fragment key={r._airtableId || i}>
                <tr style={{ borderBottom: isEditingThis ? 'none' : `1px dashed ${T.t4}`,
                  background: isSession ? T.panel2 : 'transparent', opacity: isDeletingThis ? 0.4 : 1 }}>
                  <td style={{ padding: '5px 12px', color: T.hot, letterSpacing: '0.04em',
                    borderLeft: isSession ? `2px solid ${T.am}` : '2px solid transparent' }}>{r.f}</td>
                  <td style={{ padding: '5px 12px' }}>
                    {isSession
                      ? <TPill color={T.am}>SES</TPill>
                      : fin
                      ? <TPill color={T.pu}>FIN</TPill>
                      : <TPill color={T.gn}>OP</TPill>}
                  </td>
                  <td style={{ padding: '5px 12px', color: T.t }}>{r.c}</td>
                  <td style={{ padding: '5px 12px', color: T.t3 }}>{r.a || '·'}</td>
                  <td style={{ padding: '5px 12px', textAlign: 'right', color: r.e > 0 ? T.gn : T.t4 }}>{r.e > 0 ? '+' + r.e.toLocaleString('es-DO', { maximumFractionDigits: 2 }) : '·'}</td>
                  <td style={{ padding: '5px 12px', textAlign: 'right', color: r.s > 0 ? T.re : T.t4 }}>{r.s > 0 ? '-' + r.s.toLocaleString('es-DO', { maximumFractionDigits: 2 }) : '·'}</td>
                  <td style={{ padding: '5px 12px', textAlign: 'right', color: net >= 0 ? T.gn : T.re, fontWeight: 500 }}>{(net >= 0 ? '+' : '') + net.toLocaleString('es-DO', { maximumFractionDigits: 0 })}</td>
                  <td style={{ padding: '5px 6px', textAlign: 'center', whiteSpace: 'nowrap' }}>
                    {canEdit && (
                      <button
                        type="button"
                        onClick={() => setEditingId(isEditingThis ? null : r._airtableId)}
                        title={isEditingThis ? 'Cancelar' : 'Editar en Airtable'}
                        style={{
                          background: 'transparent', color: isEditingThis ? T.am : T.t4,
                          border: `1px solid ${isEditingThis ? T.am : T.bd}`,
                          fontSize: 10, padding: '2px 5px', cursor: 'pointer',
                          fontFamily: 'inherit', lineHeight: 1, marginRight: 4,
                        }}
                        onMouseEnter={(ev) => { if (!isEditingThis) { ev.currentTarget.style.color = T.am; ev.currentTarget.style.borderColor = T.am; } }}
                        onMouseLeave={(ev) => { if (!isEditingThis) { ev.currentTarget.style.color = T.t4; ev.currentTarget.style.borderColor = T.bd; } }}
                      >✎</button>
                    )}
                    {canDelete && (
                      <button
                        type="button"
                        onClick={() => handleDelete(r)}
                        disabled={isDeletingThis}
                        title={isDeletingThis ? 'Eliminando...' : 'Eliminar de Airtable'}
                        style={{
                          background: 'transparent', color: T.t4, border: `1px solid ${T.bd}`,
                          fontSize: 10, padding: '2px 6px', cursor: isDeletingThis ? 'wait' : 'pointer',
                          fontFamily: 'inherit', lineHeight: 1,
                        }}
                        onMouseEnter={(ev) => { ev.currentTarget.style.color = T.re; ev.currentTarget.style.borderColor = T.re; }}
                        onMouseLeave={(ev) => { ev.currentTarget.style.color = T.t4; ev.currentTarget.style.borderColor = T.bd; }}
                      >{isDeletingThis ? '…' : '×'}</button>
                    )}
                  </td>
                </tr>
                {isEditingThis && (
                  <CFEditRow
                    row={r}
                    saving={savingEditId === r._airtableId}
                    onSave={(patch) => handleSaveEdit(r, patch)}
                    onCancel={() => setEditingId(null)}
                  />
                )}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
        <div style={{ padding: '8px 14px', fontSize: 9, color: T.t3, letterSpacing: '0.12em', borderTop: `1px solid ${T.bd}`,
            display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
          <span>▌MOSTRANDO {tailRows.length} de {filteredRows.length} en período · {(window.__AIRTABLE_DATA__?.cashflow?.length || baseCF.length || 0)} total Airtable</span>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            {filteredRows.length > pageSize && (
              <button
                type="button"
                onClick={() => { const next = pageSize + 30; setPageSize(next); window.__LS__?.set('cf:pageSize', next); }}
                style={{ background: 'transparent', color: T.t2, border: `1px solid ${T.bd}`, padding: '3px 8px',
                  fontSize: 9, fontFamily: 'inherit', cursor: 'pointer', letterSpacing: '0.1em' }}
                onMouseEnter={(ev) => { ev.currentTarget.style.color = T.hot; ev.currentTarget.style.borderColor = T.hot; }}
                onMouseLeave={(ev) => { ev.currentTarget.style.color = T.t2; ev.currentTarget.style.borderColor = T.bd; }}
              >+30 MÁS ↓</button>
            )}
            {filteredRows.length > 30 && pageSize > 30 && (
              <button
                type="button"
                onClick={() => { setPageSize(30); window.__LS__?.set('cf:pageSize', 30); }}
                style={{ background: 'transparent', color: T.t2, border: `1px solid ${T.bd}`, padding: '3px 8px',
                  fontSize: 9, fontFamily: 'inherit', cursor: 'pointer', letterSpacing: '0.1em' }}
              >COLAPSAR</button>
            )}
            <button
              type="button"
              onClick={exportCSV}
              style={{ background: 'transparent', color: T.hot, border: `1px solid ${T.hot}`, padding: '3px 10px',
                fontSize: 9, fontFamily: 'inherit', cursor: 'pointer', letterSpacing: '0.12em', fontWeight: 600 }}
              onMouseEnter={(ev) => { ev.currentTarget.style.background = T.hot; ev.currentTarget.style.color = T.hotInk; }}
              onMouseLeave={(ev) => { ev.currentTarget.style.background = 'transparent'; ev.currentTarget.style.color = T.hot; }}
            >⬇ CSV</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── CF Edit Row · §8.1 inline editor para movimientos de Airtable ──
// Se expande debajo del row al click ✎. Edita campos directos
// (fecha, categoría, auxiliar, entrada, salida) y persiste con
// AT_CLIENT.update. No cambia el ID de Airtable.
function CFEditRow({ row, saving, onSave, onCancel }) {
  const T = useTheme();
  const [f, setF] = React.useState(row.f || '');
  const [c, setC] = React.useState(row.c || '');
  const [a, setA] = React.useState(row.a || '');
  const [e, setE] = React.useState(String(row.e || ''));
  const [s, setS] = React.useState(String(row.s || ''));

  // Las categorías típicas que vemos en CF · selectable + libre via input fallback
  const COMMON_CATS = [
    'Venta de mercancia', 'Pago Envio', 'Compra de mercancia', 'Pago Prestamo',
    'Pago a Inversores', 'Pago ADS', 'Pago Comision', 'Envio Mercancia',
    'Intereses', 'Aportes para negocio', 'Cuentas por pagar', 'Pago deuda',
    'Otro',
  ];
  const catKnown = COMMON_CATS.includes(c);

  const eNum = parseFloat(e) || 0;
  const sNum = parseFloat(s) || 0;
  const warning = (eNum > 0 && sNum > 0) ? 'Tiene entrada Y salida simultáneamente.' : '';

  return (
    <tr style={{ background: T.panel2, borderBottom: `1px solid ${T.bdHi}`, borderLeft: `2px solid ${T.am}` }}>
      <td colSpan={8} style={{ padding: '10px 14px' }}>
        <div style={{ fontSize: 9, color: T.am, letterSpacing: '0.14em', marginBottom: 8 }}>
          ▸ EDITAR MOVIMIENTO · ID {row._airtableId}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6,1fr)', gap: 8 }}>
          <div>
            <div style={{ fontSize: 9, color: T.t3, letterSpacing: '0.14em', marginBottom: 4 }}>▸ FECHA</div>
            <input type="date" value={f} onChange={(ev) => setF(ev.target.value)}
              style={{ width: '100%', background: T.panel2, border: `1px solid ${T.bd}`, color: T.t,
                fontFamily: 'inherit', fontSize: 11, padding: '6px 8px', boxSizing: 'border-box', colorScheme: 'dark' }} />
          </div>
          <div style={{ gridColumn: 'span 2' }}>
            <div style={{ fontSize: 9, color: T.t3, letterSpacing: '0.14em', marginBottom: 4 }}>▸ CATEGORÍA</div>
            <select value={catKnown ? c : '_custom'} onChange={(ev) => {
              if (ev.target.value !== '_custom') setC(ev.target.value);
            }}
              style={{ width: '100%', background: T.panel2, border: `1px solid ${T.bd}`, color: T.t,
                fontFamily: 'inherit', fontSize: 11, padding: '6px 8px', boxSizing: 'border-box' }}>
              {COMMON_CATS.map((x) => <option key={x} value={x}>{x}</option>)}
              <option value="_custom">— libre —</option>
            </select>
            {!catKnown && (
              <input value={c} onChange={(ev) => setC(ev.target.value)}
                style={{ width: '100%', marginTop: 4, background: T.panel2, border: `1px solid ${T.bd}`, color: T.t,
                  fontFamily: 'inherit', fontSize: 11, padding: '6px 8px', boxSizing: 'border-box' }} />
            )}
          </div>
          <div>
            <div style={{ fontSize: 9, color: T.t3, letterSpacing: '0.14em', marginBottom: 4 }}>▸ AUX</div>
            <input value={a} onChange={(ev) => setA(ev.target.value)}
              style={{ width: '100%', background: T.panel2, border: `1px solid ${T.bd}`, color: T.t,
                fontFamily: 'inherit', fontSize: 11, padding: '6px 8px', boxSizing: 'border-box' }} />
          </div>
          <div>
            <div style={{ fontSize: 9, color: T.gn, letterSpacing: '0.14em', marginBottom: 4 }}>▸ ENTRADA</div>
            <input type="number" step="0.01" value={e} onChange={(ev) => setE(ev.target.value)}
              style={{ width: '100%', background: T.panel2, border: `1px solid ${T.bd}`, color: T.t,
                fontFamily: 'inherit', fontSize: 11, padding: '6px 8px', boxSizing: 'border-box', textAlign: 'right' }} />
          </div>
          <div>
            <div style={{ fontSize: 9, color: T.re, letterSpacing: '0.14em', marginBottom: 4 }}>▸ SALIDA</div>
            <input type="number" step="0.01" value={s} onChange={(ev) => setS(ev.target.value)}
              style={{ width: '100%', background: T.panel2, border: `1px solid ${T.bd}`, color: T.t,
                fontFamily: 'inherit', fontSize: 11, padding: '6px 8px', boxSizing: 'border-box', textAlign: 'right' }} />
          </div>
        </div>
        {warning && (
          <div style={{ marginTop: 8, fontSize: 10, color: T.am, letterSpacing: '0.04em' }}>
            ⚠ {warning} (puedes proceder; se guarda igual)
          </div>
        )}
        <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
          <button type="button"
            onClick={() => onSave({ f, c, a, e, s })}
            disabled={saving}
            style={{ padding: '6px 14px',
              background: saving ? T.panel3 : T.hot, color: saving ? T.t3 : T.hotInk,
              border: 'none', fontFamily: 'inherit', fontSize: 10, fontWeight: 700,
              letterSpacing: '0.14em', cursor: saving ? 'wait' : 'pointer' }}
          >{saving ? '…GUARDANDO' : '▸ GUARDAR'}</button>
          <button type="button" onClick={onCancel}
            style={{ padding: '6px 14px', background: 'transparent', color: T.t2,
              border: `1px solid ${T.bd}`, fontFamily: 'inherit', fontSize: 10,
              letterSpacing: '0.14em', cursor: 'pointer' }}
          >CANCELAR</button>
        </div>
      </td>
    </tr>
  );
}

window.PanelCashFlow = PanelCashFlow;
