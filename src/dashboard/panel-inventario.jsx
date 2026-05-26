// Panel: Inventario — current state of stock. Doesn't depend on period filter (inventory is "now").

const STATE_META = {
  critico:       { label: 'CRITICO', color: '#ff5563', order: 0 },
  atencion:      { label: 'ATENCION', color: '#ffb240', order: 1 },
  en_reposicion: { label: 'REPOSIC', color: '#ff9d4d', order: 2 },
  ok:            { label: 'OK', color: '#5fe084', order: 3 },
  sin_movimiento:{ label: 'SIN.MOV', color: '#5b5f6a', order: 4 },
};

function PanelInventario() {
  const T = useTheme();
  // Subscribe to Airtable SKU load so buildSK overlay re-renders the panel.
  const atSkus = useAirtableTable('skus');
  // Session sales reduce stock & adjust derived counts (overlay on top of buildSK)
  const stockDelta = useStockDeltaBySKU();
  const SK = React.useMemo(() => {
    const base = buildSK();
    return base.map((s) => {
      const d = stockDelta[s.id] || 0;
      if (d === 0) return s;
      const s2 = { ...s, s: Math.max(0, s.s + d), _sessionDelta: d };
      // Re-derive estado on the adjusted stock so urgency reflects session sales.
      if (s2.s <= 0)               s2.estado = 'critico';
      else if (s2.s <= (s.min || 0)) s2.estado = 'critico';
      return s2;
    });
  }, [stockDelta, atSkus.loaded, atSkus.count]);
  const [coverage, setCoverage] = React.useState(3);
  const [catFilter, setCatFilter] = React.useState('all');
  const [stateFilter, setStateFilter] = React.useState('all');
  const [expandedModels, setExpandedModels] = React.useState({});
  const toggleModel = (key) => setExpandedModels((c) => ({ ...c, [key]: !c[key] }));
  const [expandedModelsInv, setExpandedModelsInv] = React.useState({});
  const toggleModelInv = (key) => setExpandedModelsInv((c) => ({ ...c, [key]: !c[key] }));

  const stockTotal = SK.reduce((s, x) => s + x.s, 0);
  const enCaminoUds = SK.reduce((s, x) => s + x.enCamino, 0);
  const enCaminoSKUs = SK.filter((s) => s.enCamino > 0).length;
  const capInv = SK.reduce((s, x) => s + x.valorStock, 0);
  const capEnCamino = SK.reduce((s, x) => s + x.valorEnCamino, 0);

  const criticos = SK.filter((s) => s.estado === 'critico').length;
  const atencion = SK.filter((s) => s.estado === 'atencion').length;
  const enRep    = SK.filter((s) => s.estado === 'en_reposicion').length;
  const ok       = SK.filter((s) => s.estado === 'ok').length;
  const sinMov   = SK.filter((s) => s.estado === 'sin_movimiento').length;

  const margenProm = Math.round(
    SK.filter((s) => s.pv > 0).reduce((sum, x) => sum + x.margen, 0) /
      Math.max(1, SK.filter((s) => s.pv > 0).length)
  );
  const productEstrella = SK.slice().sort((a, b) => b.vendido - a.vendido)[0];
  const productLento = SK.filter((s) => s.vendido > 0)
    .sort((a, b) => a.velocidad - b.velocidad)[0];
  const cats = [...new Set(SK.map((s) => s.cat))];

  // Reorder list
  const reorder = SK
    .filter((s) => s.estado === 'critico' || s.estado === 'atencion')
    .map((s) => {
      const ventasMes = s.velocidad * 30;
      const objetivo = Math.ceil(ventasMes * coverage);
      const aPedir = Math.max(0, objetivo - s.s - s.enCamino);
      return { ...s, aPedir, costoEst: aPedir * s.cpp };
    })
    .filter((s) => s.aPedir > 0);
  const totalCosto = reorder.reduce((s, x) => s + x.costoEst, 0);
  const totalUd = reorder.reduce((s, x) => s + x.aPedir, 0);

  // Table: filtered + grouped by category + sorted by state urgency
  let tableSKUs = SK.slice();
  if (catFilter !== 'all') tableSKUs = tableSKUs.filter((s) => s.cat === catFilter);
  if (stateFilter !== 'all') tableSKUs = tableSKUs.filter((s) => s.estado === stateFilter);
  tableSKUs.sort((a, b) => {
    if (a.cat !== b.cat) return a.cat.localeCompare(b.cat);
    return STATE_META[a.estado].order - STATE_META[b.estado].order;
  });
  const groupedSKUs = {};
  tableSKUs.forEach((s) => { (groupedSKUs[s.cat] = groupedSKUs[s.cat] || []).push(s); });

  const rotacion = (Object.values(VENTAS_SKU).reduce((a,b)=>a+b,0) / Math.max(1, stockTotal)).toFixed(2);
  const velAgg = SK.reduce((s, x) => s + x.velocidad, 0);
  const diasStockGlobal = velAgg > 0 ? Math.round(stockTotal / velAgg) : null;
  const coberturaProm = velAgg > 0 ? ((stockTotal / velAgg) / 30).toFixed(1) : '∞';
  const capInmovil = SK.filter((s) => s.estado === 'sin_movimiento').reduce((s, x) => s + x.valorStock, 0);

  // proximo pedido = reorder total at current coverage
  const proximoPedido = totalCosto;

  return (
    <div>
      <TSectionHead ix="§01" name="Resumen de inventario" count={`${SK.length} SKUs · ${stockTotal} UD`} />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', border: `1px solid ${T.bd}`, margin: '0 0 0 14px' }}>
        <TCell label="Stock.fisico" value={`${stockTotal} ud`} accent={T.t2} centered big
          sub="Unidades disponibles ahora" />
        <TCell label="En.camino" value={`${enCaminoUds} ud`} color={T.or} accent={T.or} centered big
          sub={`Unidades en pedido · lead ~52d`} />
        <TCell label="Capital.inv" value={fmt(capInv)} color={T.bl} accent={T.bl} centered big
          sub="Valor del stock al costo" />
        <TCell label="Proximo.pedido" value={fmt(proximoPedido)} color={T.hot} accent={T.hot} centered big
          sub={`Costo estimado para cubrir ${coverage} meses`} />
      </div>

      <TSectionHead ix="§02" name="Estado de stock · 5 niveles" />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', border: `1px solid ${T.bd}`, margin: '0 0 0 14px' }}>
        <TCell label="Critico" value={String(criticos)} color={T.re} accent={T.re} centered big
          sub="< 60 días de stock" />
        <TCell label="Atencion" value={String(atencion)} color={T.am} accent={T.am} centered big
          sub="60—90 días de stock" />
        <TCell label="Reposicion" value={String(enRep)} color={T.or} accent={T.or} centered big
          sub="Stock bajo, lote en camino" />
        <TCell label="Saludables" value={String(ok)} color={T.gn} accent={T.gn} centered big
          sub="> 90 días de stock" />
        <TCell label="Sin.movimiento" value={String(sinMov)} color={T.t3} accent={T.t3} centered big
          sub="Sin ventas recientes" />
      </div>

      <TSectionHead ix="§03" name="Rendimiento de productos" />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', border: `1px solid ${T.bd}`, margin: '0 0 0 14px' }}>
        <TCell label="Producto.estrella" value={productEstrella?.nm || '—'} color={T.hot} italic accent={T.hot}
          sub={`${productEstrella?.vendido} ud · ${productEstrella?.cat}`} />
        <TCell label="Mas.lento" value={productLento?.nm || '—'} accent={T.am}
          sub={productLento ? `${productLento.vendido} ud · ${productLento.vtasMes.toFixed(1)}/mes` : ''} />
        <TCell label="Margen.promedio" value={`${margenProm}%`} color={T.gn} accent={T.gn}
          sub={`${SK.filter(s=>s.margen>=35).length} SKUs ≥ 35%`} />
        <TCell label="SKUs.totales" value={String(SK.length)} accent={T.t2}
          sub={`${cats.length} categorías`} />
      </div>

      <TSectionHead ix="§04" name="Salud del inventario" />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', border: `1px solid ${T.bd}`, margin: '0 0 0 14px' }}>
        <TCell label="Rotacion" value={rotacion} accent={T.t2}
          sub={`uds vendidas ÷ stock`} />
        <TCell label="Dias.stock.global" value={diasStockGlobal != null ? diasStockGlobal + 'd' : '∞'} accent={T.t2}
          sub={`stock ÷ velocidad agregada`} />
        <TCell label="Capital.inmovil" value={fmt(capInmovil)} color={T.re} accent={T.re}
          sub={`${sinMov} SKUs sin venta`} />
        <TCell label="Cobertura.prom" value={`${coberturaProm} mo`} accent={T.gn}
          sub={`promedio de la cartera`} />
      </div>

      {/* Reorder tool */}
      <TSectionHead ix="§05" name="Herramienta de reorden · proyección"
        right={
          <div style={{ display: 'flex', gap: 2, background: T.panel2, padding: 2, border: `1px solid ${T.bd}`, marginLeft: 8 }}>
            {[2, 3, 4, 6].map((m) => {
              const on = coverage === m;
              return (
                <button key={m} onClick={() => setCoverage(m)} style={{
                  fontSize: 10, padding: '3px 8px', border: 'none',
                  background: on ? T.hot : 'transparent', color: on ? T.hotInk : T.t2,
                  fontFamily: 'inherit', cursor: 'pointer', fontWeight: 600,
                }}>{m}M</button>
              );
            })}
          </div>
        } />
      <div style={{ background: T.panel, border: `1px solid ${T.bd}`, margin: '0 0 0 14px', padding: '10px 14px' }}>
        <div style={{ fontSize: 10, color: T.t3, marginBottom: 8, letterSpacing: '0.06em' }}>
          Cubrir {coverage} mes(es) de demanda. Estimado usa CPP histórico — <span style={{ color: T.am }}>NO es costo final</span>.
        </div>
        {reorder.length === 0 ? (
          <div style={{ fontSize: 11, color: T.gn, padding: '12px 0' }}>✓ TODO EN ORDEN · ningún SKU crítico ni en atención requiere pedido a {coverage}M.</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 10 }}>
            <thead>
              <tr>
                {['PRODUCTO','STOCK','EN.CAM','VTS/MO','PEDIR','CPP','COSTO EST.'].map((h, i) => (
                  <th key={h} style={{ textAlign: i < 1 ? 'left' : 'right', padding: '6px 8px',
                    color: T.t3, letterSpacing: '0.14em', fontSize: 9, fontWeight: 600,
                    borderBottom: `1px solid ${T.bd}` }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(() => {
                // Árbol: cat → marca (alfabética) → modelo → variantes
                const sorted = reorder.slice().sort((a, b) => {
                  if (a.cat !== b.cat) return a.cat.localeCompare(b.cat);
                  if (a.mk !== b.mk) return a.mk.localeCompare(b.mk);
                  const am = splitNmColor(a.nm).modelo;
                  const bm = splitNmColor(b.nm).modelo;
                  if (am !== bm) return am.localeCompare(bm);
                  return a.nm.localeCompare(b.nm);
                });
                const tree = {};
                sorted.forEach((s) => {
                  const { modelo } = splitNmColor(s.nm);
                  const key = modelo || s.nm;
                  const catG = (tree[s.cat] = tree[s.cat] || {});
                  const brandG = (catG[s.mk] = catG[s.mk] || {});
                  (brandG[key] = brandG[key] || []).push(s);
                });
                return Object.entries(tree).map(([cat, brands]) => {
                  const catCount = Object.values(brands).reduce((n, modelos) =>
                    n + Object.values(modelos).reduce((m, arr) => m + arr.length, 0), 0);
                  return (
                    <React.Fragment key={cat}>
                      <tr>
                        <td colSpan="7" style={{ background: T.panel3, padding: '6px 12px',
                          color: T.hot, fontSize: 9, letterSpacing: '0.16em', fontWeight: 600 }}>
                          ▸ {cat.toUpperCase()} · {catCount}
                        </td>
                      </tr>
                      {Object.entries(brands).map(([brand, modelos]) => {
                        const brandCount = Object.values(modelos).reduce((n, arr) => n + arr.length, 0);
                        return (
                          <React.Fragment key={brand}>
                            <tr>
                              <td colSpan="7" style={{
                                padding: '4px 12px 4px 14px',
                                borderBottom: `1px dashed ${T.t4}`,
                                background: T.panel,
                              }}>
                                <span style={{ color: T.t3, fontSize: 9, letterSpacing: '0.18em', fontWeight: 600 }}>
                                  ┊ {brand.toUpperCase()}
                                </span>
                                <span style={{ color: T.t4, fontSize: 8, marginLeft: 8, letterSpacing: '0.08em' }}>
                                  · {brandCount}
                                </span>
                              </td>
                            </tr>
                            {Object.entries(modelos).map(([modelo, items]) => {
                              if (items.length === 1) {
                                const s = items[0];
                                return (
                                  <tr key={s.id} style={{ borderBottom: `1px solid ${T.bd}` }}>
                                    <td style={{ padding: '5px 8px 5px 18px', color: T.t }}>{s.nm}</td>
                                    <td style={{ padding: '5px 8px', textAlign: 'right', color: T.t2 }}>{s.s}</td>
                                    <td style={{ padding: '5px 8px', textAlign: 'right', color: s.enCamino > 0 ? T.or : T.t4 }}>{s.enCamino || '·'}</td>
                                    <td style={{ padding: '5px 8px', textAlign: 'right', color: T.t2 }}>{s.vtasMes.toFixed(1)}</td>
                                    <td style={{ padding: '5px 8px', textAlign: 'right', color: T.hot, fontWeight: 600 }}>{s.aPedir}</td>
                                    <td style={{ padding: '5px 8px', textAlign: 'right', color: T.t2 }}>{fmt(s.cpp)}</td>
                                    <td style={{ padding: '5px 8px', textAlign: 'right', color: T.t }}>{fmt(s.costoEst)}</td>
                                  </tr>
                                );
                              }
                              const modelKey = `${cat}/${brand}/${modelo}`;
                              const open = !!expandedModels[modelKey];
                              const subStock = items.reduce((n, x) => n + x.s, 0);
                              const subEnCam = items.reduce((n, x) => n + x.enCamino, 0);
                              const subVtas = items.reduce((n, x) => n + x.vtasMes, 0);
                              const subUd = items.reduce((n, x) => n + x.aPedir, 0);
                              const subCost = items.reduce((n, x) => n + x.costoEst, 0);
                              const cppMin = Math.min(...items.map((x) => x.cpp));
                              const cppMax = Math.max(...items.map((x) => x.cpp));
                              const cppDisplay = cppMin === cppMax ? fmt(cppMin) : `${fmt(cppMin)}–${fmt(cppMax)}`;
                              return (
                                <React.Fragment key={modelo}>
                                  <tr style={{ background: T.panel2, cursor: 'pointer' }}
                                      onClick={() => toggleModel(modelKey)}
                                      title={open ? 'Click para colapsar variantes' : 'Click para expandir variantes'}>
                                    <td style={{ padding: '6px 8px 6px 18px', color: T.t, fontSize: 10, letterSpacing: '0.04em', fontWeight: 600 }}>
                                      <span style={{ color: T.hot, marginRight: 10, display: 'inline-block', width: 8, fontSize: 9 }}>{open ? '▾' : '▸'}</span>
                                      {modelo}
                                      <span style={{ color: T.t4, marginLeft: 10, fontWeight: 400, letterSpacing: '0.08em' }}>· Σ {items.length} variantes</span>
                                    </td>
                                    <td style={{ padding: '6px 8px', textAlign: 'right', color: T.t, fontSize: 10, fontWeight: 600 }}>{subStock}</td>
                                    <td style={{ padding: '6px 8px', textAlign: 'right', color: subEnCam > 0 ? T.or : T.t4, fontSize: 10, fontWeight: 600 }}>{subEnCam || '·'}</td>
                                    <td style={{ padding: '6px 8px', textAlign: 'right', color: T.t, fontSize: 10, fontWeight: 600 }}>{subVtas.toFixed(1)}</td>
                                    <td style={{ padding: '6px 8px', textAlign: 'right', color: T.hot, fontSize: 10, fontWeight: 600 }}>{subUd}</td>
                                    <td style={{ padding: '6px 8px', textAlign: 'right', color: T.t2, fontSize: 10 }}>{cppDisplay}</td>
                                    <td style={{ padding: '6px 8px', textAlign: 'right', color: T.hot, fontSize: 10, fontWeight: 600 }}>{fmt(subCost)}</td>
                                  </tr>
                                  {open && items.map((s) => {
                                    const { color } = splitNmColor(s.nm);
                                    return (
                                      <tr key={s.id} style={{ borderBottom: `1px solid ${T.bd}` }}>
                                        <td style={{ padding: '5px 8px 5px 32px', color: T.t2 }}>
                                          <span style={{ color: T.t4, marginRight: 8 }}>└</span>
                                          {color || s.nm}
                                        </td>
                                        <td style={{ padding: '5px 8px', textAlign: 'right', color: T.t2 }}>{s.s}</td>
                                        <td style={{ padding: '5px 8px', textAlign: 'right', color: s.enCamino > 0 ? T.or : T.t4 }}>{s.enCamino || '·'}</td>
                                        <td style={{ padding: '5px 8px', textAlign: 'right', color: T.t2 }}>{s.vtasMes.toFixed(1)}</td>
                                        <td style={{ padding: '5px 8px', textAlign: 'right', color: T.hot, fontWeight: 600 }}>{s.aPedir}</td>
                                        <td style={{ padding: '5px 8px', textAlign: 'right', color: T.t2 }}>{fmt(s.cpp)}</td>
                                        <td style={{ padding: '5px 8px', textAlign: 'right', color: T.t }}>{fmt(s.costoEst)}</td>
                                      </tr>
                                    );
                                  })}
                                </React.Fragment>
                              );
                            })}
                          </React.Fragment>
                        );
                      })}
                    </React.Fragment>
                  );
                });
              })()}
              <tr style={{ background: T.panel2 }}>
                <td colSpan="4" style={{ padding: '7px 8px', color: T.hot, letterSpacing: '0.14em', fontSize: 9 }}>TOTAL · proyección</td>
                <td style={{ padding: '7px 8px', textAlign: 'right', color: T.hot, fontWeight: 600 }}>{totalUd} ud</td>
                <td></td>
                <td style={{ padding: '7px 8px', textAlign: 'right', color: T.hot, fontWeight: 600 }}>{fmt(totalCosto)}</td>
              </tr>
            </tbody>
          </table>
        )}
      </div>

      {/* Inline registration: lots & adjustments live where the inventory data is. */}
      <TSectionHead ix="§06" name="Input · Registrar entrada o ajuste"
        count="ENTRADA · AJUSTE — escribe directo al inventario" />
      <InventarioRegistrar />

      {/* SKU table */}
      <TSectionHead ix="§07" name="Inventario completo"
        count={`${tableSKUs.length}/${SK.length} SKUs · ${atSkus.loaded ? 'LIVE · airtable' : atSkus.error ? 'MOCK (airtable falló)' : 'MOCK · cargando…'}`}
        right={
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginLeft: 8 }}>
            <select value={catFilter} onChange={(e) => setCatFilter(e.target.value)}
              style={{ fontSize: 10, background: T.panel2, color: T.t, border: `1px solid ${T.bd}`, padding: '3px 5px', fontFamily: 'inherit' }}>
              <option value="all">CAT · TODAS</option>
              {cats.map((c) => <option key={c} value={c}>{c.toUpperCase()}</option>)}
            </select>
            <select value={stateFilter} onChange={(e) => setStateFilter(e.target.value)}
              style={{ fontSize: 10, background: T.panel2, color: T.t, border: `1px solid ${T.bd}`, padding: '3px 5px', fontFamily: 'inherit' }}>
              <option value="all">EST · TODOS</option>
              {Object.entries(STATE_META).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
            <button
              type="button"
              onClick={() => {
                const headers = ['SKU','Nombre','Categoria','Marca','Stock','EnCamino','PrecioVenta','CPP','MargenPct','UdsVendidas','VtsMes','DiasStock','EstadoCode','EstadoLabel'];
                const rows = tableSKUs.map((s) => [
                  s.id, s.nm, s.cat, s.mk, s.s, s.enCamino || 0,
                  s.pv || 0, s.cpp || 0, s.margen || 0,
                  s.vendido || 0, s.vtsMes || 0,
                  s.diasStock == null ? '' : s.diasStock,
                  s.estado, STATE_META[s.estado]?.label || s.estado,
                ]);
                const suffix = [catFilter === 'all' ? null : `cat-${catFilter}`, stateFilter === 'all' ? null : `est-${stateFilter}`]
                  .filter(Boolean).join('-');
                window.exportCSVDownload(
                  `inventario-${HOY}${suffix ? '-' + suffix : ''}.csv`,
                  headers, rows,
                  { toastLabel: 'Inventario exportado' }
                );
              }}
              style={{ background: 'transparent', color: T.hot, border: `1px solid ${T.hot}`, padding: '3px 10px',
                fontSize: 9, fontFamily: 'inherit', cursor: 'pointer', letterSpacing: '0.12em', fontWeight: 600 }}
              onMouseEnter={(ev) => { ev.currentTarget.style.background = T.hot; ev.currentTarget.style.color = T.hotInk; }}
              onMouseLeave={(ev) => { ev.currentTarget.style.background = 'transparent'; ev.currentTarget.style.color = T.hot; }}
            >▼ CSV</button>
          </div>
        } />
      <div style={{ background: T.panel, border: `1px solid ${T.bd}`, margin: '0 0 0 14px' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 10 }}>
          <thead>
            <tr style={{ background: T.panel2 }}>
              {['PRODUCTO','STOCK','EN.CAM','P.VENTA','MGN','VTS/MO','DIAS.STK','ESTADO'].map((h, i) => (
                <th key={h} style={{ textAlign: i === 0 ? 'left' : 'right', padding: '8px 12px',
                  color: T.t3, letterSpacing: '0.14em', fontSize: 9, fontWeight: 600,
                  borderBottom: `1px solid ${T.bd}` }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {(() => {
              // Árbol: cat → marca (alfabética) → modelo → variantes
              const sorted = tableSKUs.slice().sort((a, b) => {
                if (a.cat !== b.cat) return a.cat.localeCompare(b.cat);
                if (a.mk !== b.mk) return a.mk.localeCompare(b.mk);
                const am = splitNmColor(a.nm).modelo;
                const bm = splitNmColor(b.nm).modelo;
                if (am !== bm) return am.localeCompare(bm);
                if (a.estado !== b.estado) return STATE_META[a.estado].order - STATE_META[b.estado].order;
                return a.nm.localeCompare(b.nm);
              });
              const tree = {};
              sorted.forEach((s) => {
                const { modelo } = splitNmColor(s.nm);
                const key = modelo || s.nm;
                const catG = (tree[s.cat] = tree[s.cat] || {});
                const brandG = (catG[s.mk] = catG[s.mk] || {});
                (brandG[key] = brandG[key] || []).push(s);
              });

              return Object.entries(tree).map(([cat, brands]) => {
                const catCount = Object.values(brands).reduce((n, modelos) =>
                  n + Object.values(modelos).reduce((m, arr) => m + arr.length, 0), 0);
                return (
                  <React.Fragment key={cat}>
                    <tr>
                      <td colSpan="8" style={{ background: T.panel3, padding: '6px 12px',
                        color: T.hot, fontSize: 9, letterSpacing: '0.16em', fontWeight: 600 }}>
                        ▸ {cat.toUpperCase()} · {catCount}
                      </td>
                    </tr>
                    {Object.entries(brands).map(([brand, modelos]) => {
                      const brandCount = Object.values(modelos).reduce((n, arr) => n + arr.length, 0);
                      return (
                        <React.Fragment key={brand}>
                          <tr>
                            <td colSpan="8" style={{
                              padding: '4px 12px 4px 14px',
                              borderBottom: `1px dashed ${T.t4}`,
                              background: T.panel,
                            }}>
                              <span style={{ color: T.t3, fontSize: 9, letterSpacing: '0.18em', fontWeight: 600 }}>
                                ┊ {brand.toUpperCase()}
                              </span>
                              <span style={{ color: T.t4, fontSize: 8, marginLeft: 8, letterSpacing: '0.08em' }}>
                                · {brandCount}
                              </span>
                            </td>
                          </tr>
                          {Object.entries(modelos).map(([modelo, items]) => {
                            // Una sola variante → fila normal indentada
                            if (items.length === 1) {
                              const s = items[0];
                              const meta = STATE_META[s.estado];
                              return (
                                <tr key={s.id} style={{ borderBottom: `1px solid ${T.bd}` }}>
                                  <td style={{ padding: '6px 12px 6px 18px', color: T.t }}>
                                    <div>{s.nm}</div>
                                    <div style={{ fontSize: 8, color: T.t4, letterSpacing: '0.06em', marginTop: 2 }}>{s.id}</div>
                                  </td>
                                  <td style={{ padding: '6px 12px', textAlign: 'right', color: s.s === 0 ? T.re : T.t }}>{s.s}</td>
                                  <td style={{ padding: '6px 12px', textAlign: 'right', color: s.enCamino > 0 ? T.or : T.t4 }}>{s.enCamino || '·'}</td>
                                  <td style={{ padding: '6px 12px', textAlign: 'right', color: s.pv > 0 ? T.t2 : T.t4 }}>{s.pv > 0 ? fmt(s.pv) : '—'}</td>
                                  <td style={{ padding: '6px 12px', textAlign: 'right', color: s.margen >= 35 ? T.gn : s.margen > 0 ? T.am : T.t4 }}>{s.margen > 0 ? s.margen + '%' : '—'}</td>
                                  <td style={{ padding: '6px 12px', textAlign: 'right', color: T.t2 }}>{s.vtasMes > 0 ? s.vtasMes.toFixed(1) : '·'}</td>
                                  <td style={{ padding: '6px 12px', textAlign: 'right', color: T.t2 }}>{s.diasStock != null ? s.diasStock + 'd' : '∞'}</td>
                                  <td style={{ padding: '6px 12px', textAlign: 'right' }}>
                                    <TPill color={meta.color}>{meta.label}</TPill>
                                  </td>
                                </tr>
                              );
                            }
                            // Múltiples variantes → sub-header desplegable
                            const modelKey = `${cat}/${brand}/${modelo}`;
                            const open = !!expandedModelsInv[modelKey];
                            const subStock = items.reduce((n, x) => n + x.s, 0);
                            const subEnCam = items.reduce((n, x) => n + x.enCamino, 0);
                            const subVtas = items.reduce((n, x) => n + x.vtasMes, 0);
                            const pvVals = items.filter((x) => x.pv > 0).map((x) => x.pv);
                            const havePv = pvVals.length > 0;
                            const pvMin = havePv ? Math.min(...pvVals) : 0;
                            const pvMax = havePv ? Math.max(...pvVals) : 0;
                            const pvDisplay = !havePv ? '—' : pvMin === pvMax ? fmt(pvMin) : `${fmt(pvMin)}–${fmt(pvMax)}`;
                            const mgVals = items.filter((x) => x.margen > 0).map((x) => x.margen);
                            const haveMg = mgVals.length > 0;
                            const mgMin = haveMg ? Math.min(...mgVals) : 0;
                            const mgMax = haveMg ? Math.max(...mgVals) : 0;
                            const mgDisplay = !haveMg ? '—' : mgMin === mgMax ? `${mgMin}%` : `${mgMin}–${mgMax}%`;
                            const mgColor = !haveMg ? T.t4 : mgMin >= 35 ? T.gn : mgMax > 0 ? T.am : T.t4;
                            const worstState = items.reduce((acc, x) =>
                              STATE_META[x.estado].order < STATE_META[acc].order ? x.estado : acc,
                              items[0].estado);
                            const worstMeta = STATE_META[worstState];
                            const diasAgg = subVtas > 0 ? Math.round(subStock / (subVtas / 30)) : null;

                            return (
                              <React.Fragment key={modelo}>
                                <tr style={{ background: T.panel2, cursor: 'pointer' }}
                                    onClick={() => toggleModelInv(modelKey)}
                                    title={open ? 'Click para colapsar variantes' : 'Click para expandir variantes'}>
                                  <td style={{ padding: '6px 12px 6px 18px', color: T.t, fontSize: 10, letterSpacing: '0.04em', fontWeight: 600 }}>
                                    <span style={{ color: T.hot, marginRight: 10, display: 'inline-block', width: 8, fontSize: 9 }}>{open ? '▾' : '▸'}</span>
                                    {modelo}
                                    <span style={{ color: T.t4, marginLeft: 10, fontWeight: 400, letterSpacing: '0.08em' }}>· Σ {items.length} variantes</span>
                                  </td>
                                  <td style={{ padding: '6px 12px', textAlign: 'right', color: subStock === 0 ? T.re : T.t, fontSize: 10, fontWeight: 600 }}>{subStock}</td>
                                  <td style={{ padding: '6px 12px', textAlign: 'right', color: subEnCam > 0 ? T.or : T.t4, fontSize: 10, fontWeight: 600 }}>{subEnCam || '·'}</td>
                                  <td style={{ padding: '6px 12px', textAlign: 'right', color: havePv ? T.t2 : T.t4, fontSize: 10 }}>{pvDisplay}</td>
                                  <td style={{ padding: '6px 12px', textAlign: 'right', color: mgColor, fontSize: 10 }}>{mgDisplay}</td>
                                  <td style={{ padding: '6px 12px', textAlign: 'right', color: T.t2, fontSize: 10, fontWeight: 600 }}>{subVtas > 0 ? subVtas.toFixed(1) : '·'}</td>
                                  <td style={{ padding: '6px 12px', textAlign: 'right', color: T.t2, fontSize: 10 }}>{diasAgg != null ? diasAgg + 'd' : '∞'}</td>
                                  <td style={{ padding: '6px 12px', textAlign: 'right' }}>
                                    <TPill color={worstMeta.color}>{worstMeta.label}</TPill>
                                  </td>
                                </tr>
                                {open && items.map((s) => {
                                  const meta = STATE_META[s.estado];
                                  const { color } = splitNmColor(s.nm);
                                  return (
                                    <tr key={s.id} style={{ borderBottom: `1px solid ${T.bd}` }}>
                                      <td style={{ padding: '6px 12px 6px 32px', color: T.t2 }}>
                                        <div>
                                          <span style={{ color: T.t4, marginRight: 8 }}>└</span>
                                          {color || s.nm}
                                        </div>
                                        <div style={{ fontSize: 8, color: T.t4, letterSpacing: '0.06em', marginTop: 2, marginLeft: 16 }}>{s.id}</div>
                                      </td>
                                      <td style={{ padding: '6px 12px', textAlign: 'right', color: s.s === 0 ? T.re : T.t }}>{s.s}</td>
                                      <td style={{ padding: '6px 12px', textAlign: 'right', color: s.enCamino > 0 ? T.or : T.t4 }}>{s.enCamino || '·'}</td>
                                      <td style={{ padding: '6px 12px', textAlign: 'right', color: s.pv > 0 ? T.t2 : T.t4 }}>{s.pv > 0 ? fmt(s.pv) : '—'}</td>
                                      <td style={{ padding: '6px 12px', textAlign: 'right', color: s.margen >= 35 ? T.gn : s.margen > 0 ? T.am : T.t4 }}>{s.margen > 0 ? s.margen + '%' : '—'}</td>
                                      <td style={{ padding: '6px 12px', textAlign: 'right', color: T.t2 }}>{s.vtasMes > 0 ? s.vtasMes.toFixed(1) : '·'}</td>
                                      <td style={{ padding: '6px 12px', textAlign: 'right', color: T.t2 }}>{s.diasStock != null ? s.diasStock + 'd' : '∞'}</td>
                                      <td style={{ padding: '6px 12px', textAlign: 'right' }}>
                                        <TPill color={meta.color}>{meta.label}</TPill>
                                      </td>
                                    </tr>
                                  );
                                })}
                              </React.Fragment>
                            );
                          })}
                        </React.Fragment>
                      );
                    })}
                  </React.Fragment>
                );
              });
            })()}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Inline registration forms surfaced inside the Inventario panel ────
// Each form is co-located with the data it mutates. Wizard sketch — no
// Airtable write yet; the submit button just stages the payload visually.

function InventarioRegistrar() {
  const T = useTheme();
  const SK = buildSK();
  const [tab, setTab] = React.useState('entrada');

  return (
    <div style={{ background: T.panel, border: `1px solid ${T.bd}`, margin: '0 0 0 14px' }}>
      <TTabStrip
        active={tab}
        onChange={setTab}
        dense
        tabs={[
          { id: 'entrada',     l: 'NUEVA ENTRADA · LOTE' },
          { id: 'administrar', l: 'ADMINISTRAR LOTE' },
          { id: 'historico',   l: 'HISTÓRICO LOTES' },
          { id: 'ajuste',      l: 'AJUSTE DE STOCK' },
          { id: 'nuevosku',    l: 'NUEVO SKU' },
          { id: 'editsku',     l: 'EDITAR SKU' },
        ]}
      />

      {tab === 'entrada'     && <FormEntradaLote SK={SK} />}
      {tab === 'administrar' && <FormAdministrarLote SK={SK} />}
      {tab === 'historico'   && <HistoricoLotes SK={SK} />}
      {tab === 'ajuste'      && <FormAjusteStock SK={SK} />}
      {tab === 'nuevosku'    && <FormNuevoSku SK={SK} />}
      {tab === 'editsku'     && <FormEditarSku SK={SK} />}
    </div>
  );
}

// ─── Mock lots: synthesized from EN_CAMINO + recent purchases so the
//     "Administrar Lote" tab has something real to display until Airtable.
//     Cada SKU lleva su propio costoUd (costo base por unidad antes de extras).
const LOTES_MOCK = [
  // === Últimos 90 días (HOY = 2026-05-22 → cutoff ≈ 2026-02-22) ===
  {
    id: 'AJ140', fecha: '2026-05-15', status: 'En Camino',
    skus: [
      { id: 'MOU-AJA-AJ179APEX-AZU', nm: 'AJ179 Apex Azul', qty: 8, costoUd: 1450 },
      { id: 'MOU-AJA-AJ179APEX-MAM', nm: 'AJ179 Apex Mam',  qty: 8, costoUd: 1450 },
    ],
    envio: 0, courier: 0, otros: 0,
    pendiente: ['envio', 'courier', 'otros'],
    nota: 'Compra reciente · pendiente toda la cadena de costos.',
  },
  {
    id: 'AJ139', fecha: '2026-05-03', status: 'En Camino',
    skus: [
      { id: 'TEC-AJA-NK61-BLA', nm: 'NK61 Blanco', qty: 6, costoUd: 1650 },
      { id: 'TEC-AJA-NK61-AZU', nm: 'NK61 Azul',   qty: 6, costoUd: 1650 },
      { id: 'TEC-AJA-NK68-CON', nm: 'NK68 Con',    qty: 4, costoUd: 1820 },
    ],
    envio: 5200, courier: 0, otros: 0,
    pendiente: ['courier', 'otros'],
    nota: 'Envío pagado · esperando courier.',
  },
  {
    id: 'ATT-091', fecha: '2026-04-28', status: 'En Camino',
    skus: [
      { id: 'HEA-ATT-G800-NEG', nm: 'G800 Negro',  qty: 10, costoUd: 1125 },
      { id: 'HEA-ATT-G800-BLA', nm: 'G800 Blanco', qty: 10, costoUd: 1125 },
    ],
    envio: 0, courier: 0, otros: 0,
    pendiente: ['envio', 'courier', 'otros'],
    nota: 'Pagada a Att. Shark — pendiente factura de envío.',
  },
  {
    id: 'AJ138', fecha: '2026-04-12', status: 'En Camino',
    skus: [
      { id: 'MOU-HXS-T90-NEG', nm: 'T90 Negro',  qty: 25, costoUd: 640 },
      { id: 'MOU-HXS-T90-BLA', nm: 'T90 Blanco', qty: 25, costoUd: 656 },
    ],
    envio: 6800, courier: 0, otros: 0,
    pendiente: ['courier', 'otros'],
    nota: 'Envío salió de Shenzhen 12-abr. Courier llega ~52d.',
  },
  {
    id: 'HXS-022', fecha: '2026-03-14', status: 'Recibido',
    skus: [
      { id: 'MOU-HXS-T90PRO-NEG', nm: 'T90 Pro Negro',  qty: 10, costoUd: 770 },
      { id: 'MOU-HXS-T90PRO-BLA', nm: 'T90 Pro Blanco', qty: 10, costoUd: 770 },
    ],
    envio: 3800, courier: 4900, otros: 920,
    pendiente: [],
    nota: 'Llegó completo · CPP cerrado.',
  },
  {
    id: 'AJ137', fecha: '2026-02-28', status: 'Recibido',
    skus: [
      { id: 'MOU-AJA-AJ159PRO-NEG', nm: 'AJ159Pro Negro',  qty: 12, costoUd: 1200 },
      { id: 'MOU-AJA-AJ159PRO-BLA', nm: 'AJ159Pro Blanco', qty: 12, costoUd: 1200 },
    ],
    envio: 4200, courier: 5400, otros: 1450,
    pendiente: [],
    nota: 'CPP cerrado · listo para vender.',
  },
  // === Más viejos que 90 días ===
  {
    id: 'AJ136', fecha: '2026-01-22', status: 'Recibido',
    skus: [
      { id: 'HEA-AJA-AHM09MAX-NEG', nm: 'AHM09 Max Negro', qty: 6, costoUd: 2100 },
    ],
    envio: 2400, courier: 3100, otros: 580,
    pendiente: [],
    nota: 'Pedido pequeño · headsets premium.',
  },
  {
    id: 'AJ135', fecha: '2025-12-08', status: 'Recibido',
    skus: [
      { id: 'MOU-AJA-AJ139-NEG', nm: 'AJ139 Negro',  qty: 15, costoUd: 980 },
      { id: 'MOU-AJA-AJ139-ROJ', nm: 'AJ139 Rojo',   qty: 5,  costoUd: 980 },
    ],
    envio: 5400, courier: 6800, otros: 1340,
    pendiente: [],
    nota: 'Lote grande · cerrado en diciembre.',
  },
  {
    id: 'HXS-021', fecha: '2025-11-15', status: 'Recibido',
    skus: [
      { id: 'MOU-HXS-T90-NEG', nm: 'T90 Negro',  qty: 30, costoUd: 590 },
      { id: 'MOU-HXS-T90-BLA', nm: 'T90 Blanco', qty: 20, costoUd: 590 },
    ],
    envio: 6200, courier: 7900, otros: 1180,
    pendiente: [],
    nota: 'Primer lote grande de T90 · referencia de CPP base.',
  },
  {
    id: 'ATT-090', fecha: '2025-10-04', status: 'Recibido',
    skus: [
      { id: 'MOU-PAD-80X30-NEG', nm: 'Pad 80x30 Negro', qty: 12, costoUd: 380 },
    ],
    envio: 1800, courier: 2400, otros: 420,
    pendiente: [],
    nota: 'Pads grandes · lote pequeño.',
  },
  {
    id: 'AJ134', fecha: '2025-08-19', status: 'Recibido',
    skus: [
      { id: 'TEC-AJA-NK68-CON', nm: 'NK68 Con', qty: 4, costoUd: 1780 },
    ],
    envio: 1200, courier: 1850, otros: 380,
    pendiente: [],
    nota: 'Lote de muestra · NK68.',
  },
];

function lotTotals(L) {
  const baseTotal = L.skus.reduce((s, x) => s + (x.qty || 0) * (x.costoUd || 0), 0);
  const extras = (L.envio || 0) + (L.courier || 0) + (L.otros || 0);
  const total = baseTotal + extras;
  const uds = L.skus.reduce((s, x) => s + (x.qty || 0), 0);
  const uplift = baseTotal > 0 ? total / baseTotal : 1;
  const cppPromedio = uds > 0 ? total / uds : 0;
  return { baseTotal, extras, total, uds, uplift, cppPromedio };
}

function FormAdministrarLote({ SK }) {
  const T = useTheme();
  const [rango, setRango] = React.useState('90d'); // '90d' | 'todos'
  const [removed, setRemoved] = React.useState(() => new Set());
  const [confirmDel, setConfirmDel] = React.useState(false);
  const [flash, setFlash] = React.useState(null); // {id, msg}
  // Sort desc by date, then filter by range
  const lotesAll = React.useMemo(() => {
    return LOTES_MOCK.slice().sort((a, b) => (a.fecha < b.fecha ? 1 : -1));
  }, []);
  const lotesSorted = React.useMemo(() => {
    return lotesAll.filter((l) => !removed.has(l.id));
  }, [lotesAll, removed]);
  const cutoff = React.useMemo(() => {
    const d = new Date(HOY); d.setDate(d.getDate() - 90);
    return d.toISOString().slice(0, 10);
  }, []);
  const lotes = rango === '90d'
    ? lotesSorted.filter((l) => l.fecha >= cutoff)
    : lotesSorted;

  const [sel, setSel] = React.useState(lotesAll[0].id);
  const [draft, setDraft] = React.useState({});

  // If filter hides the currently-selected lote, snap to the first visible one
  React.useEffect(() => {
    if (lotes.length > 0 && !lotes.find((l) => l.id === sel)) {
      setSel(lotes[0].id);
    }
  }, [rango, removed]);

  // Reset confirm when changing selection
  React.useEffect(() => { setConfirmDel(false); }, [sel]);

  const lote = lotesSorted.find((l) => l.id === sel) || lotesSorted[0];
  const d = { ...lote, ...(draft[lote.id] || {}) };
  // Ensure skus is the merged/editable copy
  if (!draft[lote.id]?.skus) d.skus = lote.skus.map((s) => ({ ...s }));
  const tot = lotTotals(d);
  const totOrig = lotTotals(lote);
  const deltaCpp = tot.cppPromedio - totOrig.cppPromedio;
  const deltaUplift = (tot.uplift - totOrig.uplift) * 100;

  const update = (patch) => setDraft((p) => ({ ...p, [lote.id]: { ...(p[lote.id] || {}), ...patch } }));
  const updateSku = (i, patch) => {
    const next = (d.skus || []).map((s, j) => j === i ? { ...s, ...patch } : s);
    update({ skus: next });
  };
  const addSku = () => update({ skus: [...(d.skus || []), { id: '', nm: '', qty: 0, costoUd: 0 }] });
  const removeSku = (i) => {
    if ((d.skus || []).length <= 1) return;
    update({ skus: (d.skus || []).filter((_, j) => j !== i) });
  };

  const dirty = !!draft[lote.id];

  const handleDelete = () => {
    const id = lote.id;
    // Pick the next selection BEFORE removing — prefer the next visible lote in the list, else previous
    const visible = lotes;
    const idx = visible.findIndex((l) => l.id === id);
    const nextSel = visible[idx + 1]?.id || visible[idx - 1]?.id
      || lotesSorted.find((l) => l.id !== id)?.id
      || null;
    setRemoved((p) => { const n = new Set(p); n.add(id); return n; });
    setDraft((p) => { const n = { ...p }; delete n[id]; return n; });
    if (nextSel) setSel(nextSel);
    setConfirmDel(false);

    // ─── Cleanup: borrar CF entries y eventos linkeados al lote (session) ───
    let sessionDeleted = 0;
    if (window.__SESSION_LEDGER__) {
      const linked = window.__SESSION_LEDGER__.getEvents((e) => e.linkedLoteId === id);
      sessionDeleted = linked.length;
      linked.forEach((e) => {
        // Si el evento tiene _airtableId, borrarlo de Airtable también
        if (e._airtableId && window.AT_CLIENT?.remove) {
          window.AT_CLIENT.remove('cashflow', e._airtableId)
            .catch((err) => console.warn('[lote-delete] CF Airtable remove falló:', err.message));
        }
        window.__SESSION_LEDGER__.removeEvent(e.id);
      });
    }

    // ─── Cleanup: borrar también las entradas (records de Lote en Airtable) ───
    let airtableEntries = 0;
    if (lote.lineas && window.AT_CLIENT?.remove) {
      const entradaIds = lote.lineas.map((l) => l._airtableId).filter(Boolean);
      airtableEntries = entradaIds.length;
      Promise.allSettled(
        entradaIds.map((aid) => window.AT_CLIENT.remove('entradas', aid))
      ).then((results) => {
        const failed = results.filter((r) => r.status === 'rejected').length;
        if (failed > 0) {
          window.toastWarn?.('Lote · cleanup parcial', `${results.length - failed} de ${results.length} entradas borradas`);
        }
      });
    }

    window.toastOk?.('Lote eliminado', `${id} · ${sessionDeleted} CF + ${airtableEntries} entradas`);
    setFlash({ id, msg: `Lote ${id} eliminado · ${sessionDeleted} CF + ${airtableEntries} entradas Airtable` });
    setTimeout(() => setFlash((f) => (f && f.id === id ? null : f)), 5000);
  };

  const handleUndo = () => {
    if (!flash) return;
    setRemoved((p) => { const n = new Set(p); n.delete(flash.id); return n; });
    setSel(flash.id);
    setFlash(null);
  };

  // Empty state — all lotes deleted
  if (!lote) {
    return (
      <div style={{ padding: '18px 22px' }}>
        <div style={{ background: T.panel2, padding: '40px 20px', border: `1px solid ${T.bd}`, textAlign: 'center', color: T.t3, fontSize: 11, letterSpacing: '0.12em' }}>
          ▸ NO HAY LOTES · todos fueron eliminados
          {flash && (
            <div style={{ marginTop: 14 }}>
              <button type="button" onClick={handleUndo} style={{
                padding: '8px 16px', background: 'transparent', color: T.hot,
                border: `1px solid ${T.hot}`, fontFamily: 'inherit', fontSize: 10,
                letterSpacing: '0.14em', cursor: 'pointer', fontWeight: 600,
              }}>↶ DESHACER · {flash.id}</button>
            </div>
          )}
        </div>
      </div>
    );
  }

  const statusColor = (s) =>
    s === 'En Camino' ? T.or :
    s === 'Recibido'  ? T.gn :
    s === 'Ajuste'    ? T.am : T.t3;

  return (
    <div style={{ padding: '18px 22px' }}>
      <div style={{ background: T.panel2, padding: '10px 12px', border: `1px solid ${T.bd}`, marginBottom: 16, fontSize: 10, color: T.t2, lineHeight: 1.55 }}>
        Edita un lote existente para <span style={{ color: T.hot }}>cargar costos pendientes</span> (envío, courier, otros) a medida que llegan, o para cambiar el <span style={{ color: T.gn }}>status</span> cuando recibas físicamente. El CPP por SKU se recalcula en vivo con <span style={{ color: T.am }}>uplift ponderado por valor</span>, y verás el delta vs el CPP original del lote.
      </div>

      {/* Lots list — selectable rows · scroll · filtro 90d / todos */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
        <div style={{ fontSize: 9, color: T.t3, letterSpacing: '0.14em' }}>▸ LOTES</div>
        <div style={{ flex: 1, height: 1, background: T.bd }} />
        <div style={{ display: 'flex', gap: 2, background: T.panel3, padding: 2, border: `1px solid ${T.bd}` }}>
          {[
            { id: '90d',   l: 'ULT.90D' },
            { id: 'todos', l: 'TODOS'   },
          ].map((r) => {
            const on = rango === r.id;
            return (
              <button key={r.id} onClick={() => setRango(r.id)} style={{
                fontSize: 10, padding: '3px 9px', border: 'none',
                background: on ? T.hot : 'transparent', color: on ? T.hotInk : T.t2,
                fontFamily: 'inherit', cursor: 'pointer', fontWeight: 600, letterSpacing: '0.08em',
              }}>{r.l}</button>
            );
          })}
        </div>
        <div style={{ fontSize: 9, color: T.t3, letterSpacing: '0.08em' }}>
          {lotes.length}/{lotesSorted.length}
        </div>
      </div>
      <div style={{ border: `1px solid ${T.bd}`, marginBottom: 14 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '90px 110px 90px 1fr 110px 110px 90px', background: T.panel2, padding: '7px 12px', fontSize: 9, color: T.t3, letterSpacing: '0.14em', borderBottom: `1px solid ${T.bd}` }}>
          <span>LOTE</span>
          <span>FECHA</span>
          <span>STATUS</span>
          <span>SKUs</span>
          <span style={{ textAlign: 'right' }}>TOTAL RD$</span>
          <span style={{ textAlign: 'right' }}>CPP PROM.</span>
          <span style={{ textAlign: 'right' }}>PEND.</span>
        </div>
        <div style={{ maxHeight: 280, overflowY: 'auto' }}>
          {lotes.map((L) => {
          const t = lotTotals(L);
          const on = L.id === sel;
          return (
            <button key={L.id} onClick={() => setSel(L.id)} style={{
              display: 'grid', gridTemplateColumns: '90px 110px 90px 1fr 110px 110px 90px',
              alignItems: 'center', padding: '8px 12px', width: '100%', textAlign: 'left',
              background: on ? T.panel3 : 'transparent', color: 'inherit', fontFamily: 'inherit',
              border: 'none', borderBottom: `1px solid ${T.bd}`, borderLeft: on ? `2px solid ${T.hot}` : '2px solid transparent',
              cursor: 'pointer', fontSize: 11,
            }}>
              <span style={{ color: on ? T.hot : T.t, fontWeight: 600, letterSpacing: '0.06em' }}>{L.id}</span>
              <span style={{ color: T.t2, fontSize: 10 }}>{L.fecha}</span>
              <span><TPill color={statusColor(L.status)}>{L.status.toUpperCase()}</TPill></span>
              <span style={{ color: T.t2, fontSize: 10 }}>{L.skus.map((s) => s.nm).join(' · ')}</span>
              <span style={{ textAlign: 'right', color: T.t }}>{fmt(t.total)}</span>
              <span style={{ textAlign: 'right', color: T.t2 }}>{fmt(t.cppPromedio)}</span>
              <span style={{ textAlign: 'right', color: L.pendiente.length ? T.am : T.gn, fontSize: 10, letterSpacing: '0.1em' }}>
                {L.pendiente.length ? L.pendiente.length + ' COSTO' + (L.pendiente.length > 1 ? 'S' : '') : 'CERRADO'}
              </span>
            </button>
          );
          })}
        </div>
      </div>

      {/* Editor for selected lot */}
      <div style={{ border: `1px solid ${T.bdHi}`, background: T.panel2, padding: '14px 16px' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 14, marginBottom: 14, flexWrap: 'wrap' }}>
          <div style={{ fontSize: 13, color: T.hot, letterSpacing: '0.12em', fontWeight: 600 }}>▸ LOTE {d.id}</div>
          <div style={{ fontSize: 10, color: T.t3 }}>creado {d.fecha}</div>
          <div style={{ marginLeft: 'auto', fontSize: 10, color: T.t3, letterSpacing: '0.1em' }}>
            {d.skus.length} SKU · {tot.uds} ud
          </div>
          {!confirmDel ? (
            <button type="button" onClick={() => setConfirmDel(true)} title="Eliminar lote" style={{
              background: 'transparent', color: T.t3, border: `1px solid ${T.bd}`,
              padding: '5px 10px', fontFamily: 'inherit', fontSize: 9,
              letterSpacing: '0.14em', fontWeight: 600, cursor: 'pointer',
            }}
              onMouseEnter={(e) => { e.currentTarget.style.color = T.re; e.currentTarget.style.borderColor = T.re; }}
              onMouseLeave={(e) => { e.currentTarget.style.color = T.t3; e.currentTarget.style.borderColor = T.bd; }}
            >✕ ELIMINAR LOTE</button>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: (T.re || '#c53030') + '14', border: `1px solid ${T.re || '#c53030'}`, padding: '4px 6px 4px 10px' }}>
              <span style={{ fontSize: 9, color: T.re || '#c53030', letterSpacing: '0.12em', fontWeight: 600 }}>¿ELIMINAR {d.id}?</span>
              <button type="button" onClick={handleDelete} style={{
                background: T.re || '#c53030', color: T.hotInk || '#fff', border: 'none',
                padding: '4px 10px', fontFamily: 'inherit', fontSize: 9,
                letterSpacing: '0.14em', fontWeight: 700, cursor: 'pointer',
              }}>CONFIRMAR</button>
              <button type="button" onClick={() => setConfirmDel(false)} style={{
                background: 'transparent', color: T.t2, border: `1px solid ${T.bd}`,
                padding: '4px 8px', fontFamily: 'inherit', fontSize: 9,
                letterSpacing: '0.14em', fontWeight: 600, cursor: 'pointer',
              }}>CANCELAR</button>
            </div>
          )}
        </div>

        {flash && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: T.panel, border: `1px dashed ${T.am || T.bd}`, padding: '7px 12px', marginBottom: 12 }}>
            <span style={{ fontSize: 10, color: T.am || T.t2, letterSpacing: '0.1em' }}>● {flash.msg}</span>
            <button type="button" onClick={handleUndo} style={{
              marginLeft: 'auto', background: 'transparent', color: T.hot,
              border: `1px solid ${T.hot}`, padding: '3px 10px', fontFamily: 'inherit',
              fontSize: 9, letterSpacing: '0.14em', fontWeight: 600, cursor: 'pointer',
            }}>↶ DESHACER</button>
            <button type="button" onClick={() => setFlash(null)} style={{
              background: 'transparent', color: T.t3, border: 'none',
              fontFamily: 'inherit', fontSize: 12, lineHeight: 1, padding: '3px 6px', cursor: 'pointer',
            }}>✕</button>
          </div>
        )}

        {/* SKUs editables · costo por unidad */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
          <div style={{ fontSize: 9, color: T.t3, letterSpacing: '0.14em' }}>▸ SKUS DEL LOTE · COSTO BASE POR UNIDAD</div>
          <div style={{ flex: 1, height: 1, background: T.bd }} />
        </div>
        <div style={{ background: T.panel, border: `1px solid ${T.bd}`, marginBottom: 14 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '30px 1fr 70px 110px 100px 110px 30px', padding: '7px 10px', fontSize: 9, color: T.t3, letterSpacing: '0.14em', borderBottom: `1px solid ${T.bd}`, background: T.panel3, gap: 8 }}>
            <span>#</span>
            <span>SKU</span>
            <span style={{ textAlign: 'right' }}>CANT.</span>
            <span style={{ textAlign: 'right' }}>COSTO/UD</span>
            <span style={{ textAlign: 'right' }}>SUBTOTAL</span>
            <span style={{ textAlign: 'right' }}>CPP FINAL*</span>
            <span></span>
          </div>
          {d.skus.map((s, i) => {
            const q = parseFloat(s.qty) || 0;
            const cu = parseFloat(s.costoUd) || 0;
            const sub = q * cu;
            const cppFinal = cu > 0 ? cu * tot.uplift : 0;
            return (
              <div key={i} style={{ display: 'grid', gridTemplateColumns: '30px 1fr 70px 110px 100px 110px 30px', padding: '6px 10px', alignItems: 'center', gap: 8, borderBottom: i < d.skus.length - 1 ? `1px dashed ${T.t4}` : 'none' }}>
                <span style={{ fontSize: 10, color: T.t3, letterSpacing: '0.1em' }}>{String(i + 1).padStart(2, '0')}</span>
                <select value={s.id || ''} onChange={(e) => {
                  const ref = SK.find((x) => x.id === e.target.value);
                  updateSku(i, { id: e.target.value, nm: ref?.nm || '' });
                }} style={{
                  width: '100%', background: T.panel2, border: `1px solid ${T.bd}`, color: T.t,
                  fontFamily: 'inherit', fontSize: 11, padding: '6px 8px',
                }}>
                  <option value="">— selecciona —</option>
                  {SK.map((sk) => <option key={sk.id} value={sk.id}>{sk.nm} · {sk.id}</option>)}
                </select>
                <input type="number" min="0" placeholder="0" value={s.qty}
                  onChange={(e) => updateSku(i, { qty: parseFloat(e.target.value) || 0 })}
                  style={{
                    width: '100%', background: T.panel2, border: `1px solid ${T.bd}`, color: T.t,
                    fontFamily: 'inherit', fontSize: 11, padding: '6px 8px', textAlign: 'right', boxSizing: 'border-box',
                  }} />
                <input type="number" min="0" placeholder="0" value={s.costoUd}
                  onChange={(e) => updateSku(i, { costoUd: parseFloat(e.target.value) || 0 })}
                  style={{
                    width: '100%', background: T.panel2, border: `1px solid ${T.bd}`, color: T.t,
                    fontFamily: 'inherit', fontSize: 11, padding: '6px 8px', textAlign: 'right', boxSizing: 'border-box',
                  }} />
                <span style={{ fontSize: 11, color: sub > 0 ? T.t : T.t4, textAlign: 'right', letterSpacing: '0.02em' }}>
                  {sub > 0 ? fmt(sub) : '—'}
                </span>
                <span style={{ fontSize: 11, color: cppFinal > 0 ? T.hot : T.t4, textAlign: 'right', fontWeight: 600 }}>
                  {cppFinal > 0 ? fmt(cppFinal) : '—'}
                </span>
                <button type="button" onClick={() => removeSku(i)} disabled={d.skus.length === 1} style={{
                  background: 'transparent', color: d.skus.length === 1 ? T.t4 : T.t2,
                  border: `1px solid ${T.bd}`, fontFamily: 'inherit', fontSize: 12, lineHeight: 1,
                  padding: '4px 0', cursor: d.skus.length === 1 ? 'default' : 'pointer',
                }} title="Quitar línea">−</button>
              </div>
            );
          })}
          <button type="button" onClick={addSku} style={{
            display: 'flex', alignItems: 'center', gap: 8, width: '100%', textAlign: 'left',
            background: T.panel2, color: T.hot, border: 'none', borderTop: `1px solid ${T.bd}`,
            padding: '8px 12px', fontFamily: 'inherit', fontSize: 10, letterSpacing: '0.14em',
            fontWeight: 600, cursor: 'pointer',
          }}>
            <span style={{ fontSize: 14, lineHeight: 1 }}>+</span> AÑADIR SKU
          </button>
        </div>

        {/* Costos compartidos */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
          <div style={{ fontSize: 9, color: T.t3, letterSpacing: '0.14em' }}>▸ COSTOS COMPARTIDOS · SE PRORRATEAN POR VALOR</div>
          <div style={{ flex: 1, height: 1, background: T.bd }} />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 14 }}>
          <FormField label={`Envío ${d.envio === 0 && lote.pendiente.includes('envio') ? '· PENDIENTE' : ''}`} hint="China → USA">
            <TInput type="number" value={d.envio} onChange={(e) => update({ envio: parseFloat(e.target.value) || 0 })}
              style={{ borderColor: d.envio === 0 && lote.pendiente.includes('envio') ? T.am : T.bd }} />
          </FormField>
          <FormField label={`Courier ${d.courier === 0 && lote.pendiente.includes('courier') ? '· PENDIENTE' : ''}`} hint="USA → DR">
            <TInput type="number" value={d.courier} onChange={(e) => update({ courier: parseFloat(e.target.value) || 0 })}
              style={{ borderColor: d.courier === 0 && lote.pendiente.includes('courier') ? T.am : T.bd }} />
          </FormField>
          <FormField label={`Otros ${d.otros === 0 && lote.pendiente.includes('otros') ? '· PENDIENTE' : ''}`} hint="aduana, comisión">
            <TInput type="number" value={d.otros} onChange={(e) => update({ otros: parseFloat(e.target.value) || 0 })}
              style={{ borderColor: d.otros === 0 && lote.pendiente.includes('otros') ? T.am : T.bd }} />
          </FormField>
        </div>

        {/* Status switcher — solo En Camino / Recibido. Ajuste vive en su propia tab. */}
        <div style={{ marginTop: 14 }}>
          <div style={{ fontSize: 9, color: T.t3, letterSpacing: '0.14em', marginBottom: 6 }}>▸ STATUS DEL LOTE</div>
          <div style={{ display: 'flex', gap: 0, background: T.panel, border: `1px solid ${T.bd}` }}>
            {['En Camino', 'Recibido'].map((s) => {
              const on = d.status === s;
              return (
                <button key={s} onClick={() => update({ status: s })} style={{
                  flex: 1, padding: '8px 12px', background: on ? statusColor(s) + '22' : 'transparent',
                  color: on ? statusColor(s) : T.t2, border: 'none', borderRight: `1px solid ${T.bd}`,
                  borderLeft: on ? `2px solid ${statusColor(s)}` : '2px solid transparent',
                  fontFamily: 'inherit', fontSize: 10, letterSpacing: '0.14em', fontWeight: 600,
                  cursor: 'pointer',
                }}>{s.toUpperCase()}</button>
              );
            })}
          </div>
        </div>

        {/* Resumen — mismo orden que Nuevo Lote: BASE + COMPARTIDOS → UPLIFT → TOTAL */}
        <div style={{ marginTop: 16, background: T.panel, border: `1px solid ${T.bd}`, padding: '12px 14px' }}>
          <div style={{ fontSize: 9, color: T.t3, letterSpacing: '0.14em', marginBottom: 10 }}>▸ RESUMEN DEL LOTE</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 14, alignItems: 'flex-end' }}>
            <div>
              <div style={{ fontSize: 9, color: T.t4, letterSpacing: '0.12em' }}>BASE (Σ subtotales)</div>
              <div style={{ fontSize: 14, color: tot.baseTotal > 0 ? T.t : T.t3, fontWeight: 500, marginTop: 3 }}>
                {tot.baseTotal > 0 ? fmt(tot.baseTotal) : '—'}
              </div>
              <div style={{ fontSize: 8, color: T.t4, marginTop: 2, letterSpacing: '0.06em' }}>costo base · {tot.uds} ud</div>
            </div>
            <div>
              <div style={{ fontSize: 9, color: T.t4, letterSpacing: '0.12em' }}>+ COMPARTIDOS</div>
              <div style={{ fontSize: 14, color: tot.extras > 0 ? T.t : T.t3, fontWeight: 500, marginTop: 3 }}>
                {tot.extras > 0 ? fmt(tot.extras) : '—'}
              </div>
              <div style={{ fontSize: 8, color: T.t4, marginTop: 2, letterSpacing: '0.06em' }}>envío + courier + otros</div>
            </div>
            <div>
              <div style={{ fontSize: 9, color: T.t4, letterSpacing: '0.12em' }}>UPLIFT POR VALOR</div>
              <div style={{ fontSize: 14, color: (tot.uplift - 1) > 0 ? T.am : T.t3, fontWeight: 500, marginTop: 3 }}>
                {(tot.uplift - 1) > 0 ? '+' + ((tot.uplift - 1) * 100).toFixed(2) + '%' : '—'}
              </div>
              <div style={{ fontSize: 8, color: T.t4, marginTop: 2, letterSpacing: '0.06em' }}>× {tot.uplift.toFixed(4)} · ponderado</div>
            </div>
            <div>
              <div style={{ fontSize: 9, color: T.t4, letterSpacing: '0.12em' }}>= TOTAL LOTE</div>
              <div style={{ fontSize: 18, color: tot.total > 0 ? T.hot : T.t3, fontWeight: 600, marginTop: 3, letterSpacing: '-0.01em' }}>
                {tot.total > 0 ? fmt(tot.total) : '—'}
              </div>
              <div style={{ fontSize: 8, color: T.t4, marginTop: 2, letterSpacing: '0.06em' }}>base + compartidos</div>
            </div>
          </div>
          {/* Delta vs original */}
          {dirty && (
            <div style={{ marginTop: 12, paddingTop: 10, borderTop: `1px dashed ${T.t4}`, display: 'flex', gap: 18, alignItems: 'center', flexWrap: 'wrap' }}>
              <div style={{ fontSize: 9, color: T.t3, letterSpacing: '0.14em' }}>▸ DELTA VS LOTE ORIGINAL</div>
              <div style={{ fontSize: 10, color: T.t2 }}>
                <span style={{ color: T.t4 }}>CPP PROM.</span>{' '}
                <span style={{ color: deltaCpp > 0 ? T.re : deltaCpp < 0 ? T.gn : T.t3, fontWeight: 600 }}>
                  {deltaCpp > 0 ? '+' : ''}{fmt(Math.round(deltaCpp))}
                </span>
                <span style={{ color: T.t4 }}> (antes {fmt(totOrig.cppPromedio)})</span>
              </div>
              <div style={{ fontSize: 10, color: T.t2 }}>
                <span style={{ color: T.t4 }}>UPLIFT</span>{' '}
                <span style={{ color: deltaUplift > 0 ? T.am : deltaUplift < 0 ? T.gn : T.t3, fontWeight: 600 }}>
                  {deltaUplift > 0 ? '+' : ''}{deltaUplift.toFixed(2)}pp
                </span>
                <span style={{ color: T.t4 }}> (antes {((totOrig.uplift - 1) * 100).toFixed(2)}%)</span>
              </div>
            </div>
          )}
        </div>

        {d.nota && (
          <div style={{ marginTop: 12, fontSize: 10, color: T.t3, fontStyle: 'italic', borderLeft: `2px solid ${T.bd}`, paddingLeft: 10 }}>
            {d.nota}
          </div>
        )}

        <div style={{ display: 'flex', gap: 8, marginTop: 18, flexWrap: 'wrap', alignItems: 'center', minHeight: 38 }}>
          {dirty ? (
            <>
              <button type="button" style={{
                padding: '10px 18px', background: T.hot, color: T.hotInk,
                border: 'none', fontFamily: 'inherit', fontSize: 11, fontWeight: 700,
                letterSpacing: '0.14em', cursor: 'pointer',
              }}>▸ GUARDAR CAMBIOS</button>
              <button type="button" onClick={() => setDraft((p) => { const n = { ...p }; delete n[lote.id]; return n; })} style={{
                padding: '10px 18px', background: 'transparent', color: T.t2,
                border: `1px solid ${T.bd}`, fontFamily: 'inherit', fontSize: 11,
                letterSpacing: '0.14em', cursor: 'pointer',
              }}>DESCARTAR CAMBIOS</button>
              <span style={{ fontSize: 10, color: T.am, letterSpacing: '0.1em', marginLeft: 'auto' }}>
                ● CAMBIOS SIN GUARDAR
              </span>
            </>
          ) : (
            <span style={{ fontSize: 10, color: T.t3, letterSpacing: '0.12em' }}>
              ● SIN CAMBIOS PENDIENTES · edita un campo para activar guardar
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

// Auto Lote ID: L-YYMMDD-NN where NN is a daily sequence.
// Pulls existing same-day lots from LOTES_MOCK so the counter is realistic.
function nextLoteId(fecha) {
  const f = (fecha || HOY).slice(2).replace(/-/g, '');         // "260522"
  const sameDay = LOTES_MOCK.filter((l) => l.fecha === (fecha || HOY)).length;
  const seq = String(sameDay + 1).padStart(2, '0');
  return `L-${f}-${seq}`;
}

function FormEntradaLote({ SK }) {
  const T = useTheme();
  const [fecha, setFecha] = React.useState(HOY);
  const [status, setStatus] = React.useState('En Camino');
  const [lineas, setLineas] = React.useState([{ sku: '', qty: '', costoUd: '' }]);
  const [envio, setEnvio] = React.useState('');
  const [courier, setCourier] = React.useState('');
  const [otros, setOtros] = React.useState('');
  const [cuentaId, setCuentaId] = React.useState(window.BANCOS_SEED?.[0]?.id || '');
  const [saved, setSaved] = React.useState(null);

  const loteId = nextLoteId(fecha);
  const totalQty = lineas.reduce((s, l) => s + (parseFloat(l.qty) || 0), 0);
  const baseTotal = lineas.reduce((s, l) => s + (parseFloat(l.qty) || 0) * (parseFloat(l.costoUd) || 0), 0);
  const extras = (parseFloat(envio)||0) + (parseFloat(courier)||0) + (parseFloat(otros)||0);
  const total = baseTotal + extras;
  // Prorrateo ponderado por valor: cada SKU absorbe extras proporcional a su costo.
  // CPP_final_i = costo_ud_i × (total / baseTotal). Equivale a un uplift uniforme.
  const uplift = baseTotal > 0 ? total / baseTotal : 1;
  const upliftPct = (uplift - 1) * 100;

  const addLinea = () => setLineas((arr) => [...arr, { sku: '', qty: '', costoUd: '' }]);
  const removeLinea = (i) => setLineas((arr) => arr.length > 1 ? arr.filter((_, j) => j !== i) : arr);
  const updateLinea = (i, patch) => setLineas((arr) => arr.map((l, j) => j === i ? { ...l, ...patch } : l));

  const reset = () => {
    setFecha(HOY); setStatus('En Camino');
    setLineas([{ sku: '', qty: '', costoUd: '' }]);
    setEnvio(''); setCourier(''); setOtros('');
    setCuentaId(window.BANCOS_SEED?.[0]?.id || '');
    setSaved(null);
  };
  const [saving, setSaving] = React.useState(false);
  const submit = async () => {
    if (saving) return; // §6 #11 idempotencia
    const lineasReales = lineas.filter((l) => l.sku && (parseFloat(l.qty) || 0) > 0);
    const skuCount = lineasReales.length;
    setSaving(true);

    // ─── Airtable write (cuando hay líneas reales) ───
    let airtableSyncMsg = '';
    if (skuCount > 0 && window.AT_CLIENT?.createLote) {
      try {
        setSaved('▸ Sincronizando con Airtable...');
        const result = await window.AT_CLIENT.createLote({
          fecha,
          status,
          lineas: lineasReales.map((l) => ({
            skuId: l.sku,
            qty: parseFloat(l.qty) || 0,
            costoUd: parseFloat(l.costoUd) || 0,
          })),
          envio: parseFloat(envio) || 0,
          courier: parseFloat(courier) || 0,
          otros: parseFloat(otros) || 0,
        });
        airtableSyncMsg = ` · ☁ Airtable: ${result.airtableIds?.length || 0} records`;
        window.toastOk?.('Lote sincronizado', `${loteId} · ${result.airtableIds?.length || 0} records en Airtable`);
      } catch (e) {
        airtableSyncMsg = ` · ⚠ Airtable falló: ${e.message?.slice(0, 80) || 'error'}`;
        console.error('[FormEntradaLote] Airtable createLote falló:', e);
        window.toastErr?.('Lote no sincronizado', `${loteId} guardado local · Airtable: ${e.message?.slice(0, 80) || 'error'}`);
      }
    }

    // Generate cashflow entries: compra de mercancia + extras prorrateados.
    // Tagged with linkedLoteId so they can be cleaned up if the lote is deleted.
    const cuentaNombre = cuentaId ? window.findBancoNombre(cuentaId) : `${loteId} · sin asignar`;
    const cfRows = [];
    if (baseTotal > 0) {
      cfRows.push({
        fecha, categoria: 'Compra de mercancia',
        cuenta: cuentaNombre, cuentaId,
        entrada: 0, salida: baseTotal,
      });
    }
    if ((parseFloat(envio) || 0) > 0) {
      cfRows.push({
        fecha, categoria: 'Pago Envio',
        cuenta: `${cuentaNombre} · China → USA`, cuentaId,
        entrada: 0, salida: parseFloat(envio),
      });
    }
    if ((parseFloat(courier) || 0) > 0) {
      cfRows.push({
        fecha, categoria: 'Pago Envio',
        cuenta: `${cuentaNombre} · Courier USA → DR`, cuentaId,
        entrada: 0, salida: parseFloat(courier),
      });
    }
    if ((parseFloat(otros) || 0) > 0) {
      cfRows.push({
        fecha, categoria: 'Otro',
        cuenta: `${cuentaNombre} · aduana / comisión`, cuentaId,
        entrada: 0, salida: parseFloat(otros),
      });
    }
    // Escribe CF también a Airtable (en paralelo, no bloquea UI)
    cfRows.forEach((row) => {
      window.__SESSION_LEDGER__.addEvent({
        tipo: 'cf_mov',
        linkedLoteId: loteId,
        src: 'sesión · lote',
        ...row,
      });
      if (window.AT_CLIENT?.create) {
        const F = window.AT?.fields?.cashflow;
        if (F) {
          window.AT_CLIENT.create('cashflow', {
            [F.fecha]:    row.fecha,
            [F.cuenta]:   row.categoria,
            [F.auxiliar]: row.cuenta || '',
            [F.entrada]:  row.entrada || 0,
            [F.salida]:   row.salida || 0,
          }).catch((e) => {
            console.warn('[CF·lote] Airtable falló:', e.message);
            window.toastErr?.('CF · lote', `No se pudo guardar en Airtable: ${e.message.slice(0, 80)}`);
          });
        }
      }
    });

    // If the lote is received in the same step, add stock to each SKU line.
    // Cleanup of these adds (or the previous state) is by linkedLoteId.
    if (status === 'Recibido') {
      const lineasOk = lineasReales.map((l) => ({
        skuId: l.sku,
        qty: parseFloat(l.qty) || 0,
        costoUd: parseFloat(l.costoUd) || 0,
      }));
      if (lineasOk.length > 0) {
        window.__SESSION_LEDGER__.addEvent({
          tipo: 'lote_recibido',
          linkedLoteId: loteId,
          fecha,
          lineas: lineasOk,
        });
      }
    }

    const cfMsg = cfRows.length > 0 ? ` · ${cfRows.length} entrada${cfRows.length === 1 ? '' : 's'} CF` : '';
    const msg = skuCount === 0
      ? `Lote ${loteId} creado como borrador · agrega SKUs en Administrar Lote${cfMsg}${airtableSyncMsg}`
      : `Lote ${loteId} guardado · ${skuCount} SKU · ${totalQty} ud · ${total > 0 ? fmt(total) : 'sin costos aún'}${cfMsg}${airtableSyncMsg}`;
    setSaved(msg);
    setSaving(false);
    setTimeout(() => setSaved(null), 8000);
  };

  return (
    <div style={{ padding: '18px 22px' }}>
      <div style={{ background: T.panel2, padding: '10px 12px', border: `1px solid ${T.bd}`, marginBottom: 16, fontSize: 10, color: T.t2, lineHeight: 1.55 }}>
        Cada SKU lleva su <span style={{ color: T.hot }}>costo base por unidad</span>. Los costos compartidos (<span style={{ color: T.hot }}>envío, courier, otros</span>) se prorratean <span style={{ color: T.am }}>ponderado por valor</span> — un SKU que cuesta más absorbe más extras. Fórmula: <span style={{ color: T.t }}>CPP final = costo/ud × (total / base)</span>. <span style={{ color: T.t3 }}>Puedes guardar el lote vacío y completar después en Administrar Lote.</span>
      </div>

      {/* Encabezado del lote */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 14 }}>
        <FormField label="Lote ID · auto" hint="fecha + secuencia del día (no editable)">
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8,
            background: T.panel3, border: `1px solid ${T.bd}`, padding: '8px 10px',
            boxSizing: 'border-box', fontSize: 11, color: T.hot, fontWeight: 600,
            letterSpacing: '0.06em',
          }}>
            <span>{loteId}</span>
            <span style={{ marginLeft: 'auto', fontSize: 8, color: T.hotInk, background: T.hot, padding: '1px 6px', letterSpacing: '0.14em' }}>AUTO</span>
          </div>
        </FormField>
        <FormField label="Fecha de compra">
          <TInput type="date" value={fecha} onChange={(e) => setFecha(e.target.value || HOY)} />
        </FormField>
        <FormField label="Status" hint="ajustes se hacen en la tab 03">
          <TSelect value={status} onChange={(e) => setStatus(e.target.value)}>
            <option>En Camino</option>
            <option>Recibido (físico)</option>
          </TSelect>
        </FormField>
      </div>

      {/* SKUs del lote — repetible · cada uno con su propio costo/ud */}
      <div style={{ marginTop: 18 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
          <div style={{ fontSize: 9, color: T.t3, letterSpacing: '0.14em' }}>▸ SKUS EN EL LOTE · COSTO BASE POR UNIDAD</div>
          <div style={{ flex: 1, height: 1, background: T.bd }} />
          <div style={{ fontSize: 9, color: T.t3, letterSpacing: '0.1em' }}>
            {lineas.length} línea{lineas.length !== 1 ? 's' : ''} · {totalQty} ud
          </div>
        </div>
        <div style={{ background: T.panel2, border: `1px solid ${T.bd}` }}>
          <div style={{ display: 'grid', gridTemplateColumns: '30px 1fr 70px 110px 100px 110px 30px', padding: '7px 10px', fontSize: 9, color: T.t3, letterSpacing: '0.14em', borderBottom: `1px solid ${T.bd}`, background: T.panel3, gap: 8 }}>
            <span>#</span>
            <span>SKU</span>
            <span style={{ textAlign: 'right' }}>CANT.</span>
            <span style={{ textAlign: 'right' }}>COSTO/UD</span>
            <span style={{ textAlign: 'right' }}>SUBTOTAL</span>
            <span style={{ textAlign: 'right' }}>CPP FINAL*</span>
            <span></span>
          </div>
          {lineas.map((l, i) => {
            const skuRef = SK.find((s) => s.id === l.sku);
            const q = parseFloat(l.qty) || 0;
            const cu = parseFloat(l.costoUd) || 0;
            const sub = q * cu;
            const cppFinal = cu > 0 ? cu * uplift : 0;
            return (
              <div key={i} style={{ display: 'grid', gridTemplateColumns: '30px 1fr 70px 110px 100px 110px 30px', padding: '6px 10px', alignItems: 'center', gap: 8, borderBottom: i < lineas.length - 1 ? `1px dashed ${T.t4}` : 'none' }}>
                <span style={{ fontSize: 10, color: T.t3, letterSpacing: '0.1em' }}>{String(i + 1).padStart(2, '0')}</span>
                <select value={l.sku} onChange={(e) => updateLinea(i, { sku: e.target.value })} style={{
                  width: '100%', background: T.panel, border: `1px solid ${T.bd}`, color: T.t,
                  fontFamily: 'inherit', fontSize: 11, padding: '6px 8px',
                }}>
                  <option value="">— selecciona —</option>
                  {SK.map((s) => <option key={s.id} value={s.id}>{s.nm} · {s.id}</option>)}
                </select>
                <input type="number" min="1" placeholder="0" value={l.qty}
                  onChange={(e) => updateLinea(i, { qty: e.target.value })}
                  style={{
                    width: '100%', background: T.panel, border: `1px solid ${T.bd}`, color: T.t,
                    fontFamily: 'inherit', fontSize: 11, padding: '6px 8px', textAlign: 'right', boxSizing: 'border-box',
                  }} />
                <div style={{ position: 'relative' }}>
                  <input type="number" min="0" placeholder={skuRef ? String(skuRef.cpp) : '0'} value={l.costoUd}
                    onChange={(e) => updateLinea(i, { costoUd: e.target.value })}
                    style={{
                      width: '100%', background: T.panel, border: `1px solid ${T.bd}`, color: T.t,
                      fontFamily: 'inherit', fontSize: 11, padding: '6px 8px', textAlign: 'right', boxSizing: 'border-box',
                    }} />
                  {skuRef && !l.costoUd && (
                    <span style={{ position: 'absolute', right: 6, top: -10, fontSize: 7, color: T.t4, letterSpacing: '0.1em' }}>
                      HIST. {fmt(skuRef.cpp)}
                    </span>
                  )}
                </div>
                <span style={{ fontSize: 11, color: sub > 0 ? T.t : T.t4, textAlign: 'right', letterSpacing: '0.02em' }}>
                  {sub > 0 ? fmt(sub) : '—'}
                </span>
                <span style={{ fontSize: 11, color: cppFinal > 0 ? T.hot : T.t4, textAlign: 'right', fontWeight: 600 }}>
                  {cppFinal > 0 ? fmt(cppFinal) : '—'}
                </span>
                <button type="button" onClick={() => removeLinea(i)} disabled={lineas.length === 1} style={{
                  background: 'transparent', color: lineas.length === 1 ? T.t4 : T.t2,
                  border: `1px solid ${T.bd}`, fontFamily: 'inherit', fontSize: 12, lineHeight: 1,
                  padding: '4px 0', cursor: lineas.length === 1 ? 'default' : 'pointer',
                }} title="Quitar línea">−</button>
              </div>
            );
          })}
          <button type="button" onClick={addLinea} style={{
            display: 'flex', alignItems: 'center', gap: 8, width: '100%', textAlign: 'left',
            background: T.panel, color: T.hot, border: 'none', borderTop: `1px solid ${T.bd}`,
            padding: '8px 12px', fontFamily: 'inherit', fontSize: 10, letterSpacing: '0.14em',
            fontWeight: 600, cursor: 'pointer',
          }}>
            <span style={{ fontSize: 14, lineHeight: 1 }}>+</span> AÑADIR SKU
          </button>
        </div>
        <div style={{ fontSize: 9, color: T.t4, marginTop: 6, fontStyle: 'italic', letterSpacing: '0.04em' }}>
          * CPP FINAL = costo/ud × uplift. El uplift reparte los compartidos proporcional al costo de cada SKU.
        </div>
      </div>

      {/* Costos compartidos */}
      <div style={{ marginTop: 18 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
          <div style={{ fontSize: 9, color: T.t3, letterSpacing: '0.14em' }}>▸ COSTOS COMPARTIDOS · SE PRORRATEAN POR UNIDAD</div>
          <div style={{ flex: 1, height: 1, background: T.bd }} />
          <div style={{ fontSize: 9, color: T.t3, letterSpacing: '0.1em' }}>todos opcionales · cargar después</div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 14 }}>
          <FormField label="Envío China→USA" hint="opcional · agregar después">
            <TInput type="number" placeholder="0" value={envio} onChange={(e) => setEnvio(e.target.value)} />
          </FormField>
          <FormField label="Courier USA→DR" hint="opcional · agregar después">
            <TInput type="number" placeholder="0" value={courier} onChange={(e) => setCourier(e.target.value)} />
          </FormField>
          <FormField label="Otros costos" hint="aduana, comisión, etc.">
            <TInput type="number" placeholder="0" value={otros} onChange={(e) => setOtros(e.target.value)} />
          </FormField>
        </div>
        <div style={{ marginTop: 14 }}>
          <FormField label="Cuenta origen del pago" hint="de qué cuenta sale el dinero — puede dejarse en blanco si aún no se paga">
            <TSelect value={cuentaId} onChange={(e) => setCuentaId(e.target.value)}
              style={{ borderLeft: `2px solid ${T.re}` }}>
              <option value="">— sin asignar (compromiso futuro) —</option>
              {(window.bancosOpts ? window.bancosOpts() : []).map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </TSelect>
          </FormField>
        </div>
      </div>

      {/* Resumen del lote — orden de fórmula: BASE + COMPARTIDOS → UPLIFT → TOTAL */}
      <div style={{ marginTop: 18, background: T.panel2, border: `1px solid ${T.bd}`, padding: '12px 14px' }}>
        <div style={{ fontSize: 9, color: T.t3, letterSpacing: '0.14em', marginBottom: 10 }}>▸ RESUMEN DEL LOTE</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 14, alignItems: 'flex-end' }}>
          <div>
            <div style={{ fontSize: 9, color: T.t4, letterSpacing: '0.12em' }}>BASE (Σ subtotales)</div>
            <div style={{ fontSize: 14, color: baseTotal > 0 ? T.t : T.t3, fontWeight: 500, marginTop: 3 }}>
              {baseTotal > 0 ? fmt(baseTotal) : '—'}
            </div>
            <div style={{ fontSize: 8, color: T.t4, marginTop: 2, letterSpacing: '0.06em' }}>costo base · {totalQty} ud</div>
          </div>
          <div>
            <div style={{ fontSize: 9, color: T.t4, letterSpacing: '0.12em' }}>+ COMPARTIDOS</div>
            <div style={{ fontSize: 14, color: extras > 0 ? T.t : T.t3, fontWeight: 500, marginTop: 3 }}>
              {extras > 0 ? fmt(extras) : '—'}
            </div>
            <div style={{ fontSize: 8, color: T.t4, marginTop: 2, letterSpacing: '0.06em' }}>envío + courier + otros</div>
          </div>
          <div>
            <div style={{ fontSize: 9, color: T.t4, letterSpacing: '0.12em' }}>UPLIFT POR VALOR</div>
            <div style={{ fontSize: 14, color: upliftPct > 0 ? T.am : T.t3, fontWeight: 500, marginTop: 3 }}>
              {upliftPct > 0 ? '+' + upliftPct.toFixed(2) + '%' : '—'}
            </div>
            <div style={{ fontSize: 8, color: T.t4, marginTop: 2, letterSpacing: '0.06em' }}>× {uplift.toFixed(4)} · ponderado</div>
          </div>
          <div>
            <div style={{ fontSize: 9, color: T.t4, letterSpacing: '0.12em' }}>= TOTAL LOTE</div>
            <div style={{ fontSize: 18, color: total > 0 ? T.hot : T.t3, fontWeight: 600, marginTop: 3, letterSpacing: '-0.01em' }}>
              {total > 0 ? fmt(total) : '—'}
            </div>
            <div style={{ fontSize: 8, color: T.t4, marginTop: 2, letterSpacing: '0.06em' }}>base + compartidos</div>
          </div>
        </div>
      </div>

      <FormSubmit label="REGISTRAR LOTE" onSubmit={submit} onClear={reset} confirmation={saved} busy={saving} />
    </div>
  );
}

function FormAjusteStock({ SK }) {
  const T = useTheme();
  const stockDelta = useStockDeltaBySKU();
  const [fecha, setFecha] = React.useState(HOY);
  const [skuId, setSkuId] = React.useState('');
  const [delta, setDelta] = React.useState('');
  const [razon, setRazon] = React.useState('Pérdida');
  const [nota, setNota] = React.useState('');
  const [saved, setSaved] = React.useState(null);

  const sku = SK.find((s) => s.id === skuId);
  const stockSesion = sku ? sku.s + (stockDelta[sku.id] || 0) : 0;
  const d = parseFloat(delta) || 0;
  const stockPost = stockSesion + d;

  const guards = [];
  if (!sku) guards.push('selecciona SKU');
  if (d === 0) guards.push('ajuste ≠ 0');
  if (stockPost < 0) guards.push(`stock no puede ser negativo (quedaría ${stockPost})`);

  const reset = () => {
    setFecha(HOY); setSkuId(''); setDelta(''); setRazon('Pérdida'); setNota(''); setSaved(null);
  };
  const submit = () => {
    if (guards.length) return;
    const ev = window.__SESSION_LEDGER__.addEvent({
      tipo: 'ajuste_stock',
      fecha,
      skuId: sku.id,
      skuNombre: sku.nm,
      delta: d,
      razon,
      nota,
    });
    setSaved(`Ajuste registrado · ${sku.id} ${d >= 0 ? '+' : ''}${d} ud · ${ev.id.slice(0, 14)}`);
    setTimeout(() => { setSaved(null); reset(); }, 4000);
  };

  return (
    <div style={{ padding: '18px 22px' }}>
      <div style={{ background: T.panel2, padding: '10px 12px', border: `1px solid ${T.bd}`, marginBottom: 16, fontSize: 10, color: T.t2, lineHeight: 1.55 }}>
        Para corregir el stock cuando el físico ≠ sistema. Cantidad <span style={{ color: T.am }}>positiva o negativa</span>. <span style={{ color: T.gn }}>No afecta cash flow</span> — solo el stock de la sesión.
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 14 }}>
        <FormField label="Fecha">
          <TInput type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
        </FormField>
        <FormField label="SKU" hint={sku ? `stock sesión: ${stockSesion}` : ''}>
          <TSelect value={skuId} onChange={(e) => setSkuId(e.target.value)}>
            <option value="">— selecciona —</option>
            {SK.map((s) => {
              const sStock = s.s + (stockDelta[s.id] || 0);
              return <option key={s.id} value={s.id}>{s.nm} · stock {sStock}</option>;
            })}
          </TSelect>
        </FormField>
        <FormField label="Ajuste (±)" hint="ej: -2 si faltan dos">
          <TInput type="number" placeholder="0" value={delta}
            onChange={(e) => setDelta(e.target.value)}
            style={{ borderLeft: `2px solid ${d > 0 ? T.gn : d < 0 ? T.re : T.bd}` }} />
        </FormField>
        <FormField label="Razón">
          <TSelect value={razon} onChange={(e) => setRazon(e.target.value)}>
            <option>Pérdida</option>
            <option>Conteo físico</option>
            <option>Devolución</option>
            <option>Daño / defecto</option>
            <option>Otro</option>
          </TSelect>
        </FormField>
        <FormField label="Notas">
          <TInput value={nota} placeholder="opcional" onChange={(e) => setNota(e.target.value)} />
        </FormField>
        <FormField label="Stock post-ajuste" hint={sku ? 'preview en vivo' : ''}>
          <div style={{
            background: T.panel3, border: `1px solid ${T.bd}`, padding: '8px 10px',
            fontSize: 13, color: stockPost < 0 ? T.re : stockPost === 0 ? T.am : T.gn,
            fontWeight: 600,
          }}>
            {sku ? `${stockSesion} → ${stockPost}` : '—'}
          </div>
        </FormField>
      </div>
      <FormSubmit label="REGISTRAR AJUSTE" color={T.am}
        onSubmit={submit} onClear={reset} confirmation={saved} />
      {guards.length > 0 && !saved && (
        <div style={{ marginTop: -10, fontSize: 9, color: T.am, letterSpacing: '0.06em' }}>
          ⚠ falta: {guards.join(', ')}
        </div>
      )}
    </div>
  );
}

// ─── Combobox: dropdown con valores existentes + crear nuevo al escribir ──
function Combobox({ value, onChange, options, placeholder, addLabel = 'Añadir', disabled, allowAdd = true }) {
  const T = useTheme();
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState(value || '');
  const wrapRef = React.useRef(null);

  React.useEffect(() => { setQuery(value || ''); }, [value]);
  React.useEffect(() => {
    const handler = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const q = query.trim().toLowerCase();
  const filtered = q ? options.filter((o) => o.toLowerCase().includes(q)) : options;
  const exactMatch = options.some((o) => o.toLowerCase() === q);
  const showAdd = allowAdd && q && !exactMatch;

  return (
    <div ref={wrapRef} style={{ position: 'relative' }}>
      <div style={{
        display: 'flex', alignItems: 'center',
        background: T.panel2, border: `1px solid ${open ? T.bdHi : T.bd}`,
        opacity: disabled ? 0.5 : 1,
      }}>
        <input
          disabled={disabled}
          value={query}
          placeholder={placeholder}
          onChange={(e) => { setQuery(e.target.value); onChange(e.target.value); setOpen(true); }}
          onFocus={() => !disabled && setOpen(true)}
          style={{
            flex: 1, background: 'transparent', border: 'none', color: T.t,
            fontFamily: 'inherit', fontSize: 11, padding: '8px 10px', outline: 'none',
            minWidth: 0,
          }}
        />
        <button type="button" onClick={() => !disabled && setOpen((o) => !o)} disabled={disabled} style={{
          background: 'transparent', border: 'none', color: T.t3,
          padding: '0 10px', cursor: disabled ? 'default' : 'pointer', fontSize: 10,
        }}>{open ? '▴' : '▾'}</button>
      </div>
      {open && !disabled && (
        <div style={{
          position: 'absolute', left: 0, right: 0, top: '100%', zIndex: 50,
          background: T.panel, border: `1px solid ${T.bdHi}`,
          maxHeight: 220, overflowY: 'auto',
          boxShadow: '0 6px 18px rgba(0,0,0,0.5)',
        }}>
          {showAdd && (
            <button type="button" onClick={() => { onChange(query.trim()); setOpen(false); }} style={{
              display: 'flex', alignItems: 'center', gap: 8, width: '100%', textAlign: 'left',
              padding: '8px 12px', background: T.panel2, color: T.hot, border: 'none',
              borderBottom: `1px solid ${T.bd}`, fontFamily: 'inherit', fontSize: 10,
              letterSpacing: '0.08em', fontWeight: 600, cursor: 'pointer',
            }}>
              <span style={{ fontSize: 12 }}>+</span> {addLabel.toUpperCase()} <span style={{ color: T.t }}>"{query.trim()}"</span>
            </button>
          )}
          {filtered.length === 0 && !showAdd && (
            <div style={{ padding: '8px 12px', fontSize: 10, color: T.t4, fontStyle: 'italic' }}>sin opciones</div>
          )}
          {filtered.map((o) => (
            <button key={o} type="button" onClick={() => { onChange(o); setQuery(o); setOpen(false); }} style={{
              display: 'block', width: '100%', textAlign: 'left',
              padding: '7px 12px',
              background: query === o ? T.panel3 : 'transparent', color: T.t,
              border: 'none', borderBottom: `1px solid ${T.bd}`,
              fontFamily: 'inherit', fontSize: 11, cursor: 'pointer',
            }}>{o}</button>
          ))}
        </div>
      )}
    </div>
  );
}

// Separa nombre display en {modelo, color} usando la lista de colores conocidos.
function splitNmColor(nm) {
  const tokens = (nm || '').trim().split(/\s+/);
  if (tokens.length < 2) return { modelo: nm || '', color: '' };
  const last = tokens[tokens.length - 1];
  if (Object.keys(COLOR_CODE).includes(last)) {
    return { modelo: tokens.slice(0, -1).join(' '), color: last };
  }
  return { modelo: nm, color: '' };
}


// Genera ID auto siguiendo la convención CAT-MK-MODELO-COL.
const CAT_CODE = { 'Mouse': 'MOU', 'Headset': 'HEA', 'Teclado': 'TEC', 'Mousepad': 'MOU-PAD', 'Otro': 'OTR' };
const COLOR_CODE = {
  'Negro': 'NEG', 'Blanco': 'BLA', 'Azul': 'AZU', 'Rojo': 'ROJ',
  'Gris': 'GRI', 'Verde': 'VER', 'Mamut': 'MAM', 'Conmemorativo': 'CON', 'Amarillo': 'AMA',
};

function FormNuevoSku({ SK }) {
  const T = useTheme();
  // Catálogos derivados del SK existente
  const catsExist = [...new Set(SK.map((s) => s.cat))];
  const marcasExist = React.useMemo(() => [...new Set(SK.map((s) => s.mk))].sort(), []);
  // Pivot modelos por marca, extraídos de los nombres del catálogo
  const modelosByMarca = React.useMemo(() => {
    const m = {};
    SK.forEach((s) => {
      const { modelo } = splitNmColor(s.nm);
      if (!modelo) return;
      (m[s.mk] = m[s.mk] || new Set()).add(modelo);
    });
    Object.keys(m).forEach((k) => { m[k] = [...m[k]].sort(); });
    return m;
  }, []);
  const colorsExist = React.useMemo(() => {
    const fromSk = SK.map((s) => splitNmColor(s.nm).color).filter(Boolean);
    return [...new Set([...Object.keys(COLOR_CODE), ...fromSk])].sort();
  }, []);

  // Categorías permitidas por el singleSelect Airtable (schema verificado).
  const SKU_CATS_AIRTABLE = (window.AT_CLIENT && window.AT_CLIENT.SKU_CATEGORIAS) || ['Mouse', 'Teclado', 'Headset', 'Otro'];
  // Dropdown incluye 'Mousepad' porque Julio vende/planea vender mousepads.
  // Si lo elige y no está aún en Airtable: soft warning. El writer lo rechazará
  // hasta que Julio agregue la opción al singleSelect (1 minuto, sin push).
  const SKU_CATS_UI = [...new Set([...SKU_CATS_AIRTABLE, 'Mousepad'])];

  const [cat, setCat] = React.useState('Mouse');
  const [mk, setMk] = React.useState('');
  const [modelo, setModelo] = React.useState('');
  const [color, setColor] = React.useState('');
  const [nm, setNm] = React.useState('');
  const [pv, setPv] = React.useState('');
  const [cppRef, setCppRef] = React.useState('');
  const [stockIni, setStockIni] = React.useState('');
  const [saved, setSaved] = React.useState(null);
  const [saving, setSaving] = React.useState(false);

  const modelosForMarca = modelosByMarca[mk] || [];

  // Generación de ID
  const catCode = CAT_CODE[cat] || cat.toUpperCase().slice(0, 3);
  const mkCode = mk.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 3);
  const modeloCode = modelo.toUpperCase().replace(/[^A-Z0-9]/g, '');
  const colorCode = COLOR_CODE[color] || color.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 3);
  const skuIdParts = [catCode, mkCode, modeloCode, colorCode].filter(Boolean);
  const skuId = skuIdParts.length >= 2 ? skuIdParts.join('-') : '';
  const autoNm = [modelo, color].filter(Boolean).join(' ');
  const finalNm = nm.trim() || autoNm;
  const collision = skuId && SK.find((s) => s.id === skuId);
  const catPendingAirtable = cat && !SKU_CATS_AIRTABLE.includes(cat);

  // Margen estimado
  const pvN = parseFloat(pv) || 0;
  const cppN = parseFloat(cppRef) || 0;
  const margen = pvN > 0 && cppN > 0 ? ((pvN - cppN) / pvN) * 100 : null;

  // §6 #5 validación mixta: hard guards (button disabled) vs soft warnings (proceede).
  // Categoría no presente en Airtable es SOFT WARNING — Julio puede intentar
  // y el writer mostrará el error real si la opción no fue agregada todavía.
  const hardError =
    !skuId ? 'faltan datos · categoría + marca + modelo mínimos' :
    collision ? `ID ${skuId} ya existe · cambia modelo o color` :
    null;
  const softWarning =
    !hardError && catPendingAirtable
      ? `"${cat}" no está aún en Airtable · agrégala al campo Categoría (1 min, sin push) o el guardado fallará`
      : !hardError && parseFloat(stockIni) > 0
      ? 'el stock inicial no se persiste · regístralo después como lote Recibido'
      : null;

  const reset = () => {
    setCat('Mouse'); setMk(''); setModelo(''); setColor(''); setNm('');
    setPv(''); setCppRef(''); setStockIni(''); setSaved(null);
  };
  const submit = async () => {
    if (saving) return;            // §6 #11 idempotencia
    if (hardError) {
      setSaved('⚠ ' + hardError);
      setTimeout(() => setSaved(null), 6000);
      return;
    }
    setSaving(true);
    try {
      await window.AT_CLIENT.createSKU({
        id:     skuId,
        nm:     finalNm,
        mk,
        modelo,
        color,
        cat,
        pv:     pvN,
      });
      const stockMsg = parseFloat(stockIni) > 0
        ? ` · stock inicial ${stockIni} ud (pendiente · regístralo como lote Recibido)`
        : '';
      setSaved(`SKU ${skuId} creado · ${finalNm}${stockMsg}`);
      window.toastOk?.('SKU creado', `${skuId} · ${finalNm}`);
      setTimeout(() => setSaved(null), 6000);
      reset();
    } catch (err) {
      const msg = err?.message || 'error desconocido';
      setSaved('✕ Airtable: ' + msg);
      window.toastErr?.('Error al crear SKU', msg);
      setTimeout(() => setSaved(null), 8000);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ padding: '18px 22px' }}>
      <div style={{ background: T.panel2, padding: '10px 12px', border: `1px solid ${T.bd}`, marginBottom: 16, fontSize: 10, color: T.t2, lineHeight: 1.55 }}>
        Crea un producto nuevo en el catálogo. Cada campo es un <span style={{ color: T.hot }}>dropdown</span> con los valores que ya existen — o puedes escribir uno nuevo y se añade al roster. El <span style={{ color: T.hot }}>ID se genera automáticamente</span> siguiendo <span style={{ color: T.t }}>CAT-MARCA-MODELO-COLOR</span>. El CPP de referencia es opcional. <span style={{ color: T.t3 }}>Editar un SKU existente (renombrar ID sin tocar precios/ventas) llegará en otra herramienta.</span>
      </div>

      {/* Identidad */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
        <div style={{ fontSize: 9, color: T.t3, letterSpacing: '0.14em' }}>▸ IDENTIDAD DEL PRODUCTO</div>
        <div style={{ flex: 1, height: 1, background: T.bd }} />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 14 }}>
        <FormField label="Categoría" hint={`en Airtable: ${SKU_CATS_AIRTABLE.join(' · ')} · "Mousepad" pendiente de agregar`}>
          <Combobox
            value={cat} onChange={setCat}
            options={SKU_CATS_UI}
            placeholder="ej. Mouse"
            allowAdd={false}
          />
        </FormField>
        <FormField label="Marca" hint={`${marcasExist.length} en sistema · escribe para añadir`}>
          <Combobox
            value={mk} onChange={setMk}
            options={marcasExist}
            placeholder="ej. HXSJ"
            addLabel="Añadir marca"
          />
        </FormField>
        <FormField label="Modelo" hint={mk ? `${modelosForMarca.length} en ${mk} · o escribe nuevo` : 'todos los modelos · o escribe nuevo'}>
          <Combobox
            value={modelo} onChange={setModelo}
            options={modelosForMarca.length > 0 ? modelosForMarca : Object.values(modelosByMarca).flat()}
            placeholder="ej. T90, NK61, G800"
            addLabel="Añadir modelo"
          />
        </FormField>
        <FormField label="Color / variante" hint={`${colorsExist.length} colores · escribe para añadir`}>
          <Combobox
            value={color} onChange={setColor}
            options={colorsExist}
            placeholder="ej. Negro"
            addLabel="Añadir color"
          />
        </FormField>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginTop: 14 }}>
        <FormField label="Nombre display" hint={autoNm ? `auto: "${autoNm}" (editable)` : 'se autogenera de modelo + color'}>
          <TInput placeholder={autoNm || '—'} value={nm} onChange={(e) => setNm(e.target.value)} />
        </FormField>
        <FormField label="SKU ID · preview" hint="generado de CAT-MARCA-MODELO-COLOR">
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8,
            background: T.panel3,
            border: `1px solid ${collision ? T.re : skuId ? T.bd : T.bd}`,
            padding: '8px 10px', boxSizing: 'border-box', fontSize: 11,
            color: collision ? T.re : skuId ? T.hot : T.t3, fontWeight: 600,
            letterSpacing: '0.06em',
          }}>
            <span>{skuId || '— faltan campos —'}</span>
            {skuId && !collision && (
              <span style={{ marginLeft: 'auto', fontSize: 8, color: T.hotInk, background: T.hot, padding: '1px 6px', letterSpacing: '0.14em' }}>AUTO</span>
            )}
            {collision && (
              <span style={{ marginLeft: 'auto', fontSize: 8, color: '#fff', background: T.re, padding: '1px 6px', letterSpacing: '0.14em' }}>YA EXISTE</span>
            )}
          </div>
        </FormField>
      </div>

      {/* Precios + stock */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8, marginTop: 18 }}>
        <div style={{ fontSize: 9, color: T.t3, letterSpacing: '0.14em' }}>▸ PRECIOS Y STOCK INICIAL</div>
        <div style={{ flex: 1, height: 1, background: T.bd }} />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 14 }}>
        <FormField label="Precio venta RD$" hint="precio público objetivo">
          <TInput type="number" placeholder="0" value={pv} onChange={(e) => setPv(e.target.value)} />
        </FormField>
        <FormField label="CPP referencia RD$" hint="opcional · se recalcula al registrar lote">
          <TInput type="number" placeholder="0" value={cppRef} onChange={(e) => setCppRef(e.target.value)} />
        </FormField>
        <FormField label="Stock inicial" hint="opcional · si ya tienes unidades">
          <TInput type="number" placeholder="0" value={stockIni} onChange={(e) => setStockIni(e.target.value)} />
        </FormField>
      </div>

      {/* Preview del SKU */}
      <div style={{ marginTop: 18, background: T.panel2, border: `1px solid ${T.bd}`, padding: '12px 14px' }}>
        <div style={{ fontSize: 9, color: T.t3, letterSpacing: '0.14em', marginBottom: 10 }}>▸ PREVIEW · COMO SE GUARDARÁ</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 14, alignItems: 'flex-end' }}>
          <div>
            <div style={{ fontSize: 9, color: T.t4, letterSpacing: '0.12em' }}>NOMBRE</div>
            <div style={{ fontSize: 14, color: finalNm ? T.t : T.t3, fontWeight: 500, marginTop: 3 }}>
              {finalNm || '—'}
            </div>
            <div style={{ fontSize: 8, color: T.t4, marginTop: 2, letterSpacing: '0.06em' }}>{cat || '—'} · {mk || '—'}</div>
          </div>
          <div>
            <div style={{ fontSize: 9, color: T.t4, letterSpacing: '0.12em' }}>PRECIO / CPP</div>
            <div style={{ fontSize: 14, color: pvN > 0 ? T.t : T.t3, fontWeight: 500, marginTop: 3 }}>
              {pvN > 0 ? fmt(pvN) : '—'} <span style={{ color: T.t4, fontSize: 11 }}>/ {cppN > 0 ? fmt(cppN) : '—'}</span>
            </div>
            <div style={{ fontSize: 8, color: T.t4, marginTop: 2, letterSpacing: '0.06em' }}>venta / costo ref.</div>
          </div>
          <div>
            <div style={{ fontSize: 9, color: T.t4, letterSpacing: '0.12em' }}>MARGEN EST.</div>
            <div style={{ fontSize: 14, color: margen == null ? T.t3 : margen >= 35 ? T.gn : margen > 0 ? T.am : T.re, fontWeight: 500, marginTop: 3 }}>
              {margen == null ? '—' : margen.toFixed(1) + '%'}
            </div>
            <div style={{ fontSize: 8, color: T.t4, marginTop: 2, letterSpacing: '0.06em' }}>(pv − cpp) / pv</div>
          </div>
          <div>
            <div style={{ fontSize: 9, color: T.t4, letterSpacing: '0.12em' }}>STOCK INI.</div>
            <div style={{ fontSize: 14, color: parseFloat(stockIni) > 0 ? T.t : T.t3, fontWeight: 500, marginTop: 3 }}>
              {parseFloat(stockIni) > 0 ? stockIni + ' ud' : '—'}
            </div>
            <div style={{ fontSize: 8, color: T.t4, marginTop: 2, letterSpacing: '0.06em' }}>unidades disponibles</div>
          </div>
        </div>
      </div>

      <FormSubmit
        label="REGISTRAR SKU"
        onSubmit={submit}
        onClear={reset}
        confirmation={saved}
        busy={saving}
        disabled={!!hardError}
        warning={softWarning}
      />
    </div>
  );
}

// ─── Form: Editar SKU · solo renombra la nomenclatura del ID ─────────
// Importante: NO modifica precios, ventas, lotes ni CPP histórico.
// Solo cambia categoría/marca/modelo/color (que recomponen el ID)
// y el nombre display. Los valores históricos se conservan ligados al SKU.
function FormEditarSku({ SK }) {
  const T = useTheme();
  const catsExist = [...new Set(SK.map((s) => s.cat))];
  const marcasExist = React.useMemo(() => [...new Set(SK.map((s) => s.mk))].sort(), []);
  const modelosByMarca = React.useMemo(() => {
    const m = {};
    SK.forEach((s) => {
      const { modelo } = splitNmColor(s.nm);
      if (!modelo) return;
      (m[s.mk] = m[s.mk] || new Set()).add(modelo);
    });
    Object.keys(m).forEach((k) => { m[k] = [...m[k]].sort(); });
    return m;
  }, []);
  const colorsExist = React.useMemo(() => {
    const fromSk = SK.map((s) => splitNmColor(s.nm).color).filter(Boolean);
    return [...new Set([...Object.keys(COLOR_CODE), ...fromSk])].sort();
  }, []);

  const SKU_CATS_AIRTABLE = (window.AT_CLIENT && window.AT_CLIENT.SKU_CATEGORIAS) || ['Mouse', 'Teclado', 'Headset', 'Otro'];
  // Dropdown incluye 'Mousepad' aunque no esté aún en Airtable · ver
  // comentario en FormNuevoSku.
  const SKU_CATS_UI = [...new Set([...SKU_CATS_AIRTABLE, 'Mousepad'])];

  const [selId, setSelId] = React.useState('');
  // selId stores the full picker label "ID · Nombre"; parse back to find the SKU
  const sel = SK.find((s) => `${s.id} · ${s.nm}` === selId);

  const [cat, setCat] = React.useState('');
  const [mk, setMk] = React.useState('');
  const [modelo, setModelo] = React.useState('');
  const [color, setColor] = React.useState('');
  const [nm, setNm] = React.useState('');
  const [saved, setSaved] = React.useState(null);
  const [saving, setSaving] = React.useState(false);
  const [confirmDel, setConfirmDel] = React.useState(false);
  const [deleting, setDeleting] = React.useState(false);

  // Cargar el SKU seleccionado en los campos editables
  React.useEffect(() => {
    if (!sel) { setCat(''); setMk(''); setModelo(''); setColor(''); setNm(''); setConfirmDel(false); return; }
    const split = splitNmColor(sel.nm);
    setCat(sel.cat); setMk(sel.mk);
    setModelo(split.modelo); setColor(split.color); setNm(sel.nm);
    setConfirmDel(false);
  }, [selId]);

  // Compute new ID
  const catCode = CAT_CODE[cat] || cat.toUpperCase().slice(0, 3);
  const mkCode = mk.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 3);
  const modeloCode = modelo.toUpperCase().replace(/[^A-Z0-9]/g, '');
  const colorCode = COLOR_CODE[color] || color.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 3);
  const newIdParts = [catCode, mkCode, modeloCode, colorCode].filter(Boolean);
  const newId = newIdParts.length >= 2 ? newIdParts.join('-') : '';
  const autoNm = [modelo, color].filter(Boolean).join(' ');
  const finalNm = nm.trim() || autoNm;
  const changed = sel && (newId !== sel.id || finalNm !== sel.nm || cat !== sel.cat || mk !== sel.mk);
  const collision = sel && newId && newId !== sel.id && SK.find((s) => s.id === newId);
  const catPendingAirtable = cat && !SKU_CATS_AIRTABLE.includes(cat);

  const modelosForMarca = modelosByMarca[mk] || [];

  // Refs históricas para warning al eliminar
  const refs = sel && window.AT_CLIENT?.countSKURefs
    ? window.AT_CLIENT.countSKURefs(sel.id)
    : { ventas: 0, entradas: 0 };

  const hardError =
    !sel ? 'selecciona un SKU del dropdown' :
    !newId ? 'faltan campos · categoría + marca + modelo mínimos' :
    collision ? `ID ${newId} ya existe · usa otra combinación` :
    !changed ? 'sin cambios para guardar' :
    null;
  // Categoría pendiente → soft warning, no hard guard. Si Julio procede sin
  // agregarla en Airtable, el writer mostrará un toast error explicativo.
  const softWarning =
    !hardError && catPendingAirtable
      ? `"${cat}" no está aún en Airtable · agrégala al campo Categoría (1 min, sin push) o el guardado fallará`
      : null;

  const submit = async () => {
    if (saving) return;           // §6 #11 idempotencia
    if (hardError) {
      setSaved('⚠ ' + hardError);
      setTimeout(() => setSaved(null), 6000);
      return;
    }
    setSaving(true);
    try {
      await window.AT_CLIENT.updateSKU(sel._airtableId, {
        id:     newId,
        nm:     finalNm,
        mk,
        modelo,
        color,
        cat,
      });
      const idMsg = newId !== sel.id ? `${sel.id} → ${newId}` : newId;
      setSaved(`SKU actualizado · ${idMsg} · historial conservado`);
      window.toastOk?.('SKU actualizado', idMsg);
      setTimeout(() => setSaved(null), 6000);
    } catch (err) {
      const msg = err?.message || 'error desconocido';
      setSaved('✕ Airtable: ' + msg);
      window.toastErr?.('Error al actualizar SKU', msg);
      setTimeout(() => setSaved(null), 8000);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!sel || deleting) return;
    if (!confirmDel) { setConfirmDel(true); return; }
    setDeleting(true);
    try {
      await window.AT_CLIENT.removeSKU(sel._airtableId);
      const refsMsg = (refs.ventas + refs.entradas) > 0
        ? ` · ${refs.ventas} venta(s) + ${refs.entradas} entrada(s) quedan sin link`
        : '';
      window.toastOk?.('SKU eliminado', `${sel.id}${refsMsg}`);
      setSelId('');
      setConfirmDel(false);
    } catch (err) {
      const msg = err?.message || 'error desconocido';
      window.toastErr?.('Error al eliminar SKU', msg);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div style={{ padding: '18px 22px' }}>
      <div style={{ background: '#2a1d3a', border: `1px solid ${T.pu}`, padding: '10px 12px', marginBottom: 16, fontSize: 10, color: T.pu, lineHeight: 1.55, letterSpacing: '0.04em' }}>
        ⚠ <strong>SOLO RENOMBRA EL SKU.</strong> Esto cambia la <span style={{ color: '#fff' }}>nomenclatura del ID</span> y el <span style={{ color: '#fff' }}>nombre display</span>. <span style={{ color: '#fff' }}>NO modifica</span> precio de venta, CPP histórico, ventas pasadas, lotes ni stock. Todo el historial sigue ligado al SKU bajo su nuevo nombre.
      </div>

      {/* SKU picker */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
        <div style={{ fontSize: 9, color: T.t3, letterSpacing: '0.14em' }}>▸ SKU A EDITAR</div>
        <div style={{ flex: 1, height: 1, background: T.bd }} />
        <div style={{ fontSize: 9, color: T.t3, letterSpacing: '0.08em' }}>{SK.length} SKUs</div>
      </div>
      <Combobox
        value={selId}
        onChange={setSelId}
        options={SK.map((s) => `${s.id} · ${s.nm}`)}
        placeholder="busca por ID o nombre…"
        allowAdd={false}
      />
      {selId && !sel && (
        <div style={{ fontSize: 10, color: T.am, marginTop: 6, fontStyle: 'italic' }}>
          Selecciona un SKU del dropdown para cargar sus datos editables.
        </div>
      )}

      {sel && (
        <>
          {/* Read-only historical context */}
          <div style={{ marginTop: 18, background: T.panel2, border: `1px solid ${T.bd}`, padding: '12px 14px' }}>
            <div style={{ fontSize: 9, color: T.t3, letterSpacing: '0.14em', marginBottom: 10 }}>▸ HISTORIAL ACTUAL · NO SE MODIFICA</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: 14 }}>
              <ReadKV label="ID actual" value={sel.id} />
              <ReadKV label="Precio venta" value={sel.pv > 0 ? fmt(sel.pv) : '—'} />
              <ReadKV label="CPP histórico" value={fmt(sel.cpp)} />
              <ReadKV label="Stock actual" value={`${sel.s} ud`} />
              <ReadKV label="Unidades vendidas" value={`${sel.vendido} ud`} />
            </div>
          </div>

          {/* Editable identity */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8, marginTop: 18 }}>
            <div style={{ fontSize: 9, color: T.t3, letterSpacing: '0.14em' }}>▸ NUEVA IDENTIDAD · SOLO NOMENCLATURA</div>
            <div style={{ flex: 1, height: 1, background: T.bd }} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 14 }}>
            <FormField label="Categoría" hint={`en Airtable: ${SKU_CATS_AIRTABLE.join(' · ')} · "Mousepad" pendiente de agregar`}>
              <Combobox value={cat} onChange={setCat}
                options={SKU_CATS_UI}
                placeholder="categoría" allowAdd={false} />
            </FormField>
            <FormField label="Marca" hint={`${marcasExist.length} en sistema`}>
              <Combobox value={mk} onChange={setMk} options={marcasExist}
                placeholder="marca" addLabel="Añadir marca" />
            </FormField>
            <FormField label="Modelo" hint={mk ? `${modelosForMarca.length} en ${mk}` : 'todos'}>
              <Combobox value={modelo} onChange={setModelo}
                options={modelosForMarca.length > 0 ? modelosForMarca : Object.values(modelosByMarca).flat()}
                placeholder="modelo" addLabel="Añadir modelo" />
            </FormField>
            <FormField label="Color / variante" hint={`${colorsExist.length} colores`}>
              <Combobox value={color} onChange={setColor} options={colorsExist}
                placeholder="color" addLabel="Añadir color" />
            </FormField>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginTop: 14 }}>
            <FormField label="Nombre display" hint={autoNm ? `auto: "${autoNm}" (editable)` : 'se autogenera'}>
              <TInput placeholder={autoNm || '—'} value={nm} onChange={(e) => setNm(e.target.value)} />
            </FormField>
            <FormField label="ID nuevo · preview" hint="generado de CAT-MARCA-MODELO-COLOR">
              <div style={{
                display: 'flex', alignItems: 'center', gap: 8,
                background: T.panel3,
                border: `1px solid ${collision ? T.re : newId === sel.id ? T.bd : newId ? T.bd : T.bd}`,
                padding: '8px 10px', boxSizing: 'border-box', fontSize: 11,
                color: collision ? T.re : newId === sel.id ? T.t3 : newId ? T.hot : T.t3,
                fontWeight: 600, letterSpacing: '0.06em',
              }}>
                <span>{newId || '— faltan campos —'}</span>
                {collision && (
                  <span style={{ marginLeft: 'auto', fontSize: 8, color: '#fff', background: T.re, padding: '1px 6px', letterSpacing: '0.14em' }}>COLISIÓN</span>
                )}
                {newId && newId === sel.id && (
                  <span style={{ marginLeft: 'auto', fontSize: 8, color: T.t3, background: T.bd, padding: '1px 6px', letterSpacing: '0.14em' }}>SIN CAMBIO</span>
                )}
                {newId && newId !== sel.id && !collision && (
                  <span style={{ marginLeft: 'auto', fontSize: 8, color: T.hotInk, background: T.hot, padding: '1px 6px', letterSpacing: '0.14em' }}>NUEVO</span>
                )}
              </div>
            </FormField>
          </div>

          {/* Delta preview */}
          {changed && (
            <div style={{ marginTop: 18, background: T.panel2, border: `1px solid ${T.bd}`, padding: '12px 14px' }}>
              <div style={{ fontSize: 9, color: T.t3, letterSpacing: '0.14em', marginBottom: 10 }}>▸ DIFF DE RENOMBRADO</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 30px 1fr', gap: 14, alignItems: 'center' }}>
                <div style={{ background: T.panel3, padding: '8px 12px', border: `1px solid ${T.bd}` }}>
                  <div style={{ fontSize: 9, color: T.t4, letterSpacing: '0.12em' }}>ANTES</div>
                  <div style={{ fontSize: 12, color: T.t, marginTop: 4 }}>{sel.id}</div>
                  <div style={{ fontSize: 10, color: T.t3, marginTop: 2 }}>{sel.nm}</div>
                </div>
                <div style={{ textAlign: 'center', color: T.hot, fontSize: 14 }}>→</div>
                <div style={{ background: T.panel3, padding: '8px 12px', border: `1px solid ${collision ? T.re : T.hot}` }}>
                  <div style={{ fontSize: 9, color: T.t4, letterSpacing: '0.12em' }}>DESPUÉS</div>
                  <div style={{ fontSize: 12, color: collision ? T.re : T.hot, marginTop: 4 }}>{newId || '—'}</div>
                  <div style={{ fontSize: 10, color: T.t3, marginTop: 2 }}>{finalNm || '—'}</div>
                </div>
              </div>
            </div>
          )}

          <FormSubmit
            label="GUARDAR CAMBIOS"
            onSubmit={submit}
            onClear={() => setSelId('')}
            confirmation={saved}
            busy={saving}
            disabled={!!hardError || deleting}
            warning={softWarning}
          />

          {/* Zona eliminar — Airtable hard delete, no rollback */}
          <div style={{ marginTop: 22, background: '#2a1414', border: `1px solid ${T.re}`, padding: '12px 14px' }}>
            <div style={{ fontSize: 9, color: T.re, letterSpacing: '0.14em', marginBottom: 8, fontWeight: 700 }}>
              ▸ ZONA DE ELIMINACIÓN · IRREVERSIBLE
            </div>
            <div style={{ fontSize: 10, color: T.t2, lineHeight: 1.55, marginBottom: 10 }}>
              Eliminar este SKU borra el record de Airtable. <span style={{ color: T.t }}>El historial de ventas y entradas
              no se borra</span> — solo pierden el link al SKU.
              {(refs.ventas + refs.entradas) > 0 && (
                <div style={{ marginTop: 6, color: T.am, fontStyle: 'italic' }}>
                  ⚠ {sel.id} tiene <strong>{refs.ventas}</strong> venta(s) y <strong>{refs.entradas}</strong> entrada(s)
                  en histórico · puedes proceder pero quedan referencias colgadas.
                </div>
              )}
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <button
                type="button"
                onClick={handleDelete}
                disabled={deleting || saving}
                style={{
                  padding: '8px 16px',
                  background: confirmDel ? T.re : 'transparent',
                  color: confirmDel ? '#fff' : T.re,
                  border: `1px solid ${T.re}`,
                  fontFamily: 'inherit', fontSize: 10, letterSpacing: '0.14em',
                  cursor: (deleting || saving) ? 'wait' : 'pointer',
                  fontWeight: 700,
                  opacity: (deleting || saving) ? 0.5 : 1,
                }}
              >
                {deleting ? '… ELIMINANDO' : confirmDel ? `✕ CONFIRMAR · ELIMINAR ${sel.id}` : `✕ ELIMINAR SKU`}
              </button>
              {confirmDel && !deleting && (
                <button
                  type="button"
                  onClick={() => setConfirmDel(false)}
                  style={{
                    padding: '8px 14px', background: 'transparent', color: T.t3,
                    border: `1px solid ${T.bd}`, fontFamily: 'inherit', fontSize: 10,
                    letterSpacing: '0.14em', cursor: 'pointer',
                  }}
                >CANCELAR</button>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function ReadKV({ label, value }) {
  const T = useTheme();
  return (
    <div>
      <div style={{ fontSize: 9, color: T.t4, letterSpacing: '0.12em' }}>{label.toUpperCase()}</div>
      <div style={{ fontSize: 12, color: T.t2, marginTop: 3, fontWeight: 500 }}>{value}</div>
    </div>
  );
}

// ─── HistoricoLotes · §8.1 (Tarea A) ─────────────────────────────
// Tabla paginada de TODOS los lotes Airtable con búsqueda + filtros +
// edit inline (header) + delete por fila + export CSV. Mismo patrón
// que HistoricoVentas (panel-radar-registrar.jsx).
function HistoricoLotes({ SK }) {
  const T = useTheme();
  const atEntradas = useAirtableTable('entradas');
  const [, force] = React.useReducer((x) => x + 1, 0);
  React.useEffect(() => {
    const onChange = (e) => { if (e.detail?.table === 'entradas') force(); };
    window.addEventListener('airtable-loaded', onChange);
    return () => window.removeEventListener('airtable-loaded', onChange);
  }, []);

  const [pageSize, setPageSize] = React.useState(() => window.__LS__?.get('lotes:pageSize') || 30);
  const [query, setQuery] = React.useState('');
  const [statusFilter, setStatusFilter] = React.useState('all');
  const [editingId, setEditingId] = React.useState(null);
  const [savingEditId, setSavingEditId] = React.useState(null);
  const [deletingId, setDeletingId] = React.useState(null);

  const allLotes = (window.__AIRTABLE_DATA__?.lotes || []).slice().sort((a, b) =>
    (b.fecha || '').localeCompare(a.fecha || ''));

  let filtered = allLotes;
  if (statusFilter !== 'all') filtered = filtered.filter((l) => l.status === statusFilter);
  if (query) {
    const q = query.toLowerCase();
    filtered = filtered.filter((l) => {
      if ((l.id || '').toLowerCase().includes(q)) return true;
      if ((l.fecha || '').includes(q)) return true;
      if ((l.proveedor || '').toLowerCase().includes(q)) return true;
      if ((l.skus || []).some((s) =>
        (s.id || '').toLowerCase().includes(q) ||
        (s.nm || '').toLowerCase().includes(q))) return true;
      return false;
    });
  }
  const tail = filtered.slice(0, pageSize);

  const handleDelete = async (l) => {
    const t = lotTotals(l);
    const linesCount = (l.skus || []).length;
    if (!confirm(
      `¿Eliminar lote ${l.id}?\n\n` +
      `${l.fecha} · ${l.status || '—'}\n` +
      `${linesCount} línea(s) · ${t.uds} ud · ${fmt(t.total)}\n\n` +
      `Borra ${linesCount} record(s) de Airtable. Acción permanente.`,
    )) return;
    setDeletingId(l.id);
    try {
      const res = await window.AT_CLIENT.removeLote(l.id);
      window.toastOk?.('Lote eliminado', `${l.id} · ${res.deletedCount} record(s) borrados`);
    } catch (err) {
      window.toastErr?.('Error al eliminar', err?.message || 'desconocido');
    } finally {
      setDeletingId(null);
    }
  };

  const handleSaveEdit = async (l, patch) => {
    setSavingEditId(l.id);
    try {
      const res = await window.AT_CLIENT.updateLoteHeader(l.id, patch);
      window.toastOk?.('Lote actualizado', `${l.id} · ${res.updatedCount} línea(s)`);
      setEditingId(null);
    } catch (err) {
      window.toastErr?.('Error al actualizar', err?.message || 'desconocido');
    } finally {
      setSavingEditId(null);
    }
  };

  const exportCSV = () => {
    const headers = ['LoteID','Fecha','Status','Proveedor','NumSKUs','UdsTotal','BaseTotal','Envio','Courier','Otros','Total','CPPProm','Pendiente','SKUs','Notas'];
    const rows = filtered.map((l) => {
      const t = lotTotals(l);
      return [
        l.id || '',
        l.fecha || '',
        l.status || '',
        l.proveedor || '',
        (l.skus || []).length,
        t.uds,
        t.baseTotal,
        l.envio || 0,
        l.courier || 0,
        l.otros || 0,
        t.total,
        Math.round(t.cppPromedio * 100) / 100,
        (l.pendiente || []).join('+') || 'cerrado',
        (l.skus || []).map((s) => `${s.id || s.nm}×${s.qty}`).join(' | '),
        l.nota || '',
      ];
    });
    const suffix = [
      statusFilter === 'all' ? null : `est-${statusFilter.toLowerCase().replace(/\s+/g, '')}`,
      query ? `q-${query.slice(0, 12)}` : null,
    ].filter(Boolean).join('-');
    window.exportCSVDownload(
      `lotes-${HOY}${suffix ? '-' + suffix : ''}.csv`,
      headers, rows,
      { toastLabel: 'Lotes exportados' },
    );
  };

  const statusOptions = ['all', ...new Set(allLotes.map((l) => l.status).filter(Boolean))];
  const statusColor = (s) =>
    s === 'En Camino' ? T.or : s === 'Recibido' ? T.gn : s === 'Ajuste' ? T.am : T.t3;

  if (!atEntradas.loaded && allLotes.length === 0) {
    return (
      <div style={{ padding: '32px 24px', textAlign: 'center', color: T.t3, fontSize: 11, letterSpacing: '0.1em' }}>
        ▸ Cargando entradas desde Airtable...
      </div>
    );
  }

  return (
    <div style={{ padding: '18px 22px' }}>
      <div style={{ background: T.panel2, padding: '10px 12px', border: `1px solid ${T.bd}`, marginBottom: 14, fontSize: 10, color: T.t2, lineHeight: 1.55 }}>
        Lista paginada de TODOS los lotes en Airtable. Botón <span style={{ color: T.am }}>✎</span> abre editor inline (fecha · status · proveedor · costos compartidos · notas) propagado a todas las líneas. Botón <span style={{ color: T.re }}>×</span> elimina el lote completo. <span style={{ color: T.t3 }}>Para cambiar cantidad/SKUs de un lote existente: bórralo y créalo nuevo con NUEVA ENTRADA · LOTE.</span>
      </div>

      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 10, flexWrap: 'wrap' }}>
        <input type="text" value={query} onChange={(e) => setQuery(e.target.value)}
          placeholder="buscar SKU, fecha, lote, proveedor…"
          title="busca por nombre SKU, ID SKU, fecha (YYYY-MM-DD), ID lote o proveedor"
          style={{ background: T.panel2, color: T.t, border: `1px solid ${T.bd}`,
            padding: '5px 10px', fontSize: 11, fontFamily: 'inherit', flex: '1 1 220px', minWidth: 180 }}
        />
        <div style={{ display: 'flex', gap: 2, background: T.panel3, padding: 2, border: `1px solid ${T.bd}` }}>
          {statusOptions.map((s) => {
            const on = statusFilter === s;
            return (
              <button key={s} type="button" onClick={() => setStatusFilter(s)} style={{
                fontSize: 10, padding: '3px 9px', border: 'none',
                background: on ? T.hot : 'transparent', color: on ? T.hotInk : T.t2,
                fontFamily: 'inherit', cursor: 'pointer', fontWeight: 600, letterSpacing: '0.08em',
              }}>{s === 'all' ? 'TODOS' : s.toUpperCase()}</button>
            );
          })}
        </div>
        <button type="button" onClick={exportCSV}
          title="Exporta los lotes filtrados a CSV (UTF-8 con BOM para Excel)"
          style={{ background: 'transparent', color: T.hot, border: `1px solid ${T.hot}`, padding: '4px 12px',
            fontSize: 9, fontFamily: 'inherit', cursor: 'pointer', letterSpacing: '0.12em', fontWeight: 600 }}
          onMouseEnter={(ev) => { ev.currentTarget.style.background = T.hot; ev.currentTarget.style.color = T.hotInk; }}
          onMouseLeave={(ev) => { ev.currentTarget.style.background = 'transparent'; ev.currentTarget.style.color = T.hot; }}
        >▼ CSV</button>
      </div>
      <div style={{ fontSize: 9, color: T.t3, letterSpacing: '0.08em', marginBottom: 6 }}>
        ▌MOSTRANDO {tail.length} de {filtered.length}
        {query || statusFilter !== 'all' ? ` (filtros · de ${allLotes.length})` : ''}
        {' · '}{atEntradas.loaded ? 'LIVE · airtable' : 'cargando…'}
      </div>

      {filtered.length === 0 ? (
        <div style={{ padding: '24px 16px', textAlign: 'center', color: T.t3, fontSize: 11, letterSpacing: '0.1em',
          background: T.panel, border: `1px solid ${T.bd}` }}>
          {(query || statusFilter !== 'all') ? '▸ Sin coincidencias para los filtros activos' : '▸ Sin lotes en Airtable todavía'}
        </div>
      ) : (
        <div style={{ background: T.panel, border: `1px solid ${T.bd}`, overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 10, minWidth: 760 }}>
            <thead>
              <tr style={{ background: T.panel2 }}>
                {['FECHA','LOTE','STATUS','SKUs','UDS','TOTAL','CPP PROM','PEND.',''].map((h, i) => (
                  <th key={h + i} style={{
                    textAlign: i < 3 ? 'left' : (i === 8 ? 'center' : 'right'),
                    padding: '7px 12px', color: T.t3, letterSpacing: '0.14em',
                    fontSize: 9, fontWeight: 600, borderBottom: `1px solid ${T.bd}`,
                    width: i === 8 ? 64 : undefined,
                  }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {tail.map((l) => {
                const t = lotTotals(l);
                const isDel = deletingId === l.id;
                const isEdit = editingId === l.id;
                return (
                  <React.Fragment key={l.id}>
                    <tr style={{ borderBottom: isEdit ? 'none' : `1px dashed ${T.t4}`, opacity: isDel ? 0.4 : 1 }}>
                      <td style={{ padding: '5px 12px', color: T.hot, letterSpacing: '0.04em' }}>{l.fecha}</td>
                      <td style={{ padding: '5px 12px', color: T.t, fontWeight: 600 }}>{l.id}</td>
                      <td style={{ padding: '5px 12px' }}><TPill color={statusColor(l.status)}>{(l.status || '—').toUpperCase()}</TPill></td>
                      <td style={{ padding: '5px 12px', textAlign: 'right', color: T.t2 }}>{(l.skus || []).length}</td>
                      <td style={{ padding: '5px 12px', textAlign: 'right', color: T.t }}>{t.uds}</td>
                      <td style={{ padding: '5px 12px', textAlign: 'right', color: T.gn, fontWeight: 500 }}>{fmt(t.total)}</td>
                      <td style={{ padding: '5px 12px', textAlign: 'right', color: T.t2 }}>{fmt(t.cppPromedio)}</td>
                      <td style={{ padding: '5px 12px', textAlign: 'right',
                        color: (l.pendiente || []).length ? T.am : T.gn,
                        fontSize: 9, letterSpacing: '0.08em' }}>
                        {(l.pendiente || []).length
                          ? `${l.pendiente.length} COSTO${l.pendiente.length > 1 ? 'S' : ''}`
                          : 'CERRADO'}
                      </td>
                      <td style={{ padding: '5px 6px', textAlign: 'center', whiteSpace: 'nowrap' }}>
                        <button type="button"
                          onClick={() => setEditingId(isEdit ? null : l.id)}
                          title={isEdit ? 'Cancelar edición' : 'Editar header del lote (fecha, status, costos, notas)'}
                          style={{ background: 'transparent', color: isEdit ? T.am : T.t4,
                            border: `1px solid ${isEdit ? T.am : T.bd}`,
                            fontSize: 10, padding: '2px 5px', cursor: 'pointer',
                            fontFamily: 'inherit', lineHeight: 1, marginRight: 4 }}
                          onMouseEnter={(ev) => { if (!isEdit) { ev.currentTarget.style.color = T.am; ev.currentTarget.style.borderColor = T.am; } }}
                          onMouseLeave={(ev) => { if (!isEdit) { ev.currentTarget.style.color = T.t4; ev.currentTarget.style.borderColor = T.bd; } }}
                        >✎</button>
                        <button type="button"
                          onClick={() => handleDelete(l)}
                          disabled={isDel}
                          title={isDel ? 'Eliminando…' : 'Eliminar lote completo (todas las líneas)'}
                          style={{ background: 'transparent', color: T.t4, border: `1px solid ${T.bd}`,
                            fontSize: 10, padding: '2px 6px', cursor: isDel ? 'wait' : 'pointer',
                            fontFamily: 'inherit', lineHeight: 1 }}
                          onMouseEnter={(ev) => { ev.currentTarget.style.color = T.re; ev.currentTarget.style.borderColor = T.re; }}
                          onMouseLeave={(ev) => { ev.currentTarget.style.color = T.t4; ev.currentTarget.style.borderColor = T.bd; }}
                        >{isDel ? '…' : '×'}</button>
                      </td>
                    </tr>
                    {isEdit && (
                      <LoteHeaderEditRow
                        lote={l}
                        saving={savingEditId === l.id}
                        onSave={(patch) => handleSaveEdit(l, patch)}
                        onCancel={() => setEditingId(null)}
                      />
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
          <div style={{ padding: '8px 14px', fontSize: 9, color: T.t3, letterSpacing: '0.12em',
            borderTop: `1px solid ${T.bd}`, display: 'flex', justifyContent: 'space-between',
            alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
            <span>▌MOSTRANDO {tail.length} de {filtered.length}</span>
            <div style={{ display: 'flex', gap: 6 }}>
              {filtered.length > pageSize && (
                <button type="button"
                  onClick={() => { const n = pageSize + 30; setPageSize(n); window.__LS__?.set('lotes:pageSize', n); }}
                  style={{ background: 'transparent', color: T.t2, border: `1px solid ${T.bd}`,
                    padding: '3px 8px', fontSize: 9, fontFamily: 'inherit', cursor: 'pointer', letterSpacing: '0.1em' }}
                >+30 MÁS ↓</button>
              )}
              {pageSize > 30 && (
                <button type="button"
                  onClick={() => { setPageSize(30); window.__LS__?.set('lotes:pageSize', 30); }}
                  style={{ background: 'transparent', color: T.t2, border: `1px solid ${T.bd}`,
                    padding: '3px 8px', fontSize: 9, fontFamily: 'inherit', cursor: 'pointer', letterSpacing: '0.1em' }}
                >COLAPSAR</button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── LoteHeaderEditRow · editor inline para HistoricoLotes ────────
function LoteHeaderEditRow({ lote, saving, onSave, onCancel }) {
  const T = useTheme();
  const [fecha, setFecha] = React.useState(lote.fecha || '');
  const [status, setStatus] = React.useState(lote.status || 'En Camino');
  const [proveedor, setProveedor] = React.useState(lote.proveedor || '');
  const [envio, setEnvio] = React.useState(String(lote.envio || ''));
  const [courier, setCourier] = React.useState(String(lote.courier || ''));
  const [otros, setOtros] = React.useState(String(lote.otros || ''));
  const [notas, setNotas] = React.useState(lote.nota || '');

  const changed =
    fecha !== (lote.fecha || '') ||
    status !== (lote.status || '') ||
    proveedor !== (lote.proveedor || '') ||
    Number(envio || 0) !== (lote.envio || 0) ||
    Number(courier || 0) !== (lote.courier || 0) ||
    Number(otros || 0) !== (lote.otros || 0) ||
    notas !== (lote.nota || '');

  const today = new Date().toISOString().slice(0, 10);
  const fechaFutura = fecha > today;
  const disabled = saving || !changed;

  return (
    <tr style={{ background: T.panel2, borderBottom: `1px solid ${T.bdHi}`, borderLeft: `2px solid ${T.am}` }}>
      <td colSpan={9} style={{ padding: '12px 14px' }}>
        <div style={{ fontSize: 9, color: T.am, letterSpacing: '0.14em', marginBottom: 8 }}>
          ▸ EDITAR HEADER · {lote.id} · {(lote.skus || []).length} línea(s) afectadas
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 8, marginBottom: 8 }}>
          <div>
            <div style={{ fontSize: 9, color: T.t3, letterSpacing: '0.14em', marginBottom: 4 }}>▸ FECHA</div>
            <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)}
              title="fecha del lote (YYYY-MM-DD)"
              style={{ width: '100%', background: T.panel2, border: `1px solid ${T.bd}`, color: T.t,
                fontFamily: 'inherit', fontSize: 11, padding: '6px 8px', boxSizing: 'border-box', colorScheme: 'dark' }} />
          </div>
          <div>
            <div style={{ fontSize: 9, color: T.t3, letterSpacing: '0.14em', marginBottom: 4 }}>▸ STATUS</div>
            <select value={status} onChange={(e) => setStatus(e.target.value)}
              title="En Camino → Recibido cuando llega físicamente"
              style={{ width: '100%', background: T.panel2, border: `1px solid ${T.bd}`, color: T.t,
                fontFamily: 'inherit', fontSize: 11, padding: '6px 8px', boxSizing: 'border-box' }}>
              {['En Camino', 'Recibido', 'Ajuste', status].filter((s, i, a) => s && a.indexOf(s) === i).map((s) =>
                <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div>
            <div style={{ fontSize: 9, color: T.t3, letterSpacing: '0.14em', marginBottom: 4 }}>▸ PROVEEDOR</div>
            <input value={proveedor} onChange={(e) => setProveedor(e.target.value)}
              placeholder="(opcional)"
              title="nombre del proveedor (ej. AJ, HXSJ, Att. Shark)"
              style={{ width: '100%', background: T.panel2, border: `1px solid ${T.bd}`, color: T.t,
                fontFamily: 'inherit', fontSize: 11, padding: '6px 8px', boxSizing: 'border-box' }} />
          </div>
          <div>
            <div style={{ fontSize: 9, color: T.t3, letterSpacing: '0.14em', marginBottom: 4 }}>▸ NOTAS</div>
            <input value={notas} onChange={(e) => setNotas(e.target.value)}
              placeholder="(opcional)"
              style={{ width: '100%', background: T.panel2, border: `1px solid ${T.bd}`, color: T.t,
                fontFamily: 'inherit', fontSize: 11, padding: '6px 8px', boxSizing: 'border-box' }} />
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8 }}>
          <div>
            <div style={{ fontSize: 9, color: T.t3, letterSpacing: '0.14em', marginBottom: 4 }}>▸ ENVÍO RD$</div>
            <input type="number" value={envio} onChange={(e) => setEnvio(e.target.value)}
              placeholder="0"
              title="costo envío internacional del lote"
              style={{ width: '100%', background: T.panel2, border: `1px solid ${T.bd}`, color: T.t,
                fontFamily: 'inherit', fontSize: 11, padding: '6px 8px', boxSizing: 'border-box' }} />
          </div>
          <div>
            <div style={{ fontSize: 9, color: T.t3, letterSpacing: '0.14em', marginBottom: 4 }}>▸ COURIER RD$</div>
            <input type="number" value={courier} onChange={(e) => setCourier(e.target.value)}
              placeholder="0"
              title="costo courier / agencia / aduana local"
              style={{ width: '100%', background: T.panel2, border: `1px solid ${T.bd}`, color: T.t,
                fontFamily: 'inherit', fontSize: 11, padding: '6px 8px', boxSizing: 'border-box' }} />
          </div>
          <div>
            <div style={{ fontSize: 9, color: T.t3, letterSpacing: '0.14em', marginBottom: 4 }}>▸ OTROS RD$</div>
            <input type="number" value={otros} onChange={(e) => setOtros(e.target.value)}
              placeholder="0"
              title="otros costos del lote (impuestos extra, manejo, etc.)"
              style={{ width: '100%', background: T.panel2, border: `1px solid ${T.bd}`, color: T.t,
                fontFamily: 'inherit', fontSize: 11, padding: '6px 8px', boxSizing: 'border-box' }} />
          </div>
        </div>
        {!changed && (
          <div style={{ marginTop: 8, fontSize: 9, color: T.t4, fontStyle: 'italic' }}>
            ▸ ningún cambio pendiente
          </div>
        )}
        <div style={{ display: 'flex', gap: 8, marginTop: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <button type="button"
            onClick={() => onSave({ fecha, status, proveedor, envio, courier, otros, notas })}
            disabled={disabled}
            style={{ padding: '6px 14px',
              background: disabled ? T.panel3 : T.hot, color: disabled ? T.t3 : T.hotInk,
              border: 'none', fontFamily: 'inherit', fontSize: 10, fontWeight: 700,
              letterSpacing: '0.14em', cursor: disabled ? 'not-allowed' : (saving ? 'wait' : 'pointer') }}
          >{saving ? '…GUARDANDO' : '▸ GUARDAR'}</button>
          <button type="button" onClick={onCancel} disabled={saving}
            style={{ padding: '6px 14px', background: 'transparent', color: T.t2,
              border: `1px solid ${T.bd}`, fontFamily: 'inherit', fontSize: 10,
              letterSpacing: '0.14em', cursor: saving ? 'wait' : 'pointer', opacity: saving ? 0.5 : 1 }}
          >CANCELAR</button>
          {fechaFutura && changed && (
            <span style={{ fontSize: 10, color: T.am, letterSpacing: '0.04em' }}>
              ⚠ fecha futura · puedes proceder
            </span>
          )}
          <span style={{ fontSize: 9, color: T.t4, letterSpacing: '0.04em', marginLeft: 'auto', alignSelf: 'center' }}>
            Para cambiar cantidades/SKUs: borra y crea nuevo lote.
          </span>
        </div>
      </td>
    </tr>
  );
}

Object.assign(window, { PanelInventario, InventarioRegistrar, HistoricoLotes });

