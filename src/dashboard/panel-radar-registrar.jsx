// Panels: Radar (placeholder) + Registrar (placeholder con sketch del wizard)

function PanelRadar() {
  const T = useTheme();
  const stockDelta = useStockDeltaBySKU();
  const sessionEvents = useSessionEvents();
  const [filterSev, setFilterSev] = React.useState('all');

  // Subscribe to live FINANC product state so RADAR reflects session edits.
  const [productState, setProductState] = React.useState(() => ({ ...(window.__PRODUCT_STATE__ || {}) }));
  React.useEffect(() => {
    const handler = () => setProductState({ ...(window.__PRODUCT_STATE__ || {}) });
    window.addEventListener('product-state-update', handler);
    return () => window.removeEventListener('product-state-update', handler);
  }, []);

  // Daysago helper for timestamps
  const daysAgo = (iso) => {
    if (!iso) return '';
    const d = (new Date(HOY) - new Date(iso)) / 86400000;
    if (d <= 0) return 'HOY';
    if (d < 1) return 'HOY';
    if (d < 7) return `HACE ${Math.round(d)}D`;
    return iso;
  };
  const daysUntil = (iso) => {
    const d = (new Date(iso) - new Date(HOY)) / 86400000;
    return Math.round(d);
  };

  const alerts = React.useMemo(() => {
    const out = [];

    // Stock con session overlay
    const SK = buildSK().map((s) => {
      const d = stockDelta[s.id] || 0;
      if (d === 0) return s;
      const s2 = { ...s, s: Math.max(0, s.s + d) };
      if (s2.s <= 0 || s2.s <= (s.min || 0)) s2.estado = 'critico';
      return s2;
    });

    SK.filter((s) => s.estado === 'critico').forEach((s) => out.push({
      sev: 'critical', cat: 'inventario',
      title: s.nm,
      detail: `${s.s} ud restantes · ${s.diasStock != null ? 'agota en ' + s.diasStock + 'd' : 'agotado'} · cpp ${fmt(s.cpp || 0)}`,
      action: '↗ PEDIR LOTE',
      ts: HOY,
    }));
    SK.filter((s) => s.estado === 'en_reposicion').slice(0, 8).forEach((s) => out.push({
      sev: 'warning', cat: 'inventario',
      title: s.nm,
      detail: `${s.enCamino || 0} ud en camino · ${s.notaEstado || 'en lote pendiente'}`,
      action: '→ VER LOTE',
      ts: HOY,
    }));
    SK.filter((s) => s.estado === 'sin_movimiento').slice(0, 6).forEach((s) => out.push({
      sev: 'info', cat: 'inventario',
      title: s.nm,
      detail: `${s.s} ud parado · sin ventas · evalúa liquidación o promoción`,
      action: '→ REVISAR',
      ts: HOY,
    }));

    // Líneas de crédito
    const creditos = productState['FIN-LC'] || [];
    creditos.forEach((c) => {
      const pct = c.usado / c.limite;
      const isUSD = c.moneda === 'USD';
      const f = (v) => isUSD ? `$${v.toFixed(2)}` : fmt(v);
      if (pct >= 0.9) {
        out.push({
          sev: 'critical', cat: 'finanz',
          title: `${c.nombre} · USO ${(pct * 100).toFixed(0)}%`,
          detail: `${f(c.usado)} de ${f(c.limite)} · queda ${f(c.limite - c.usado)} disponible`,
          action: '↗ PAGAR YA', ts: HOY,
        });
      } else if (pct >= 0.75) {
        out.push({
          sev: 'warning', cat: 'finanz',
          title: `${c.nombre} · uso ${(pct * 100).toFixed(0)}%`,
          detail: `${f(c.usado)} de ${f(c.limite)} · monitorea uso`,
          action: '→ REVISAR', ts: HOY,
        });
      }
    });

    // Cuentas de banco
    const bancos = productState['BNK'] || [];
    bancos.forEach((b) => {
      const overlay = window.bancoOverlayDelta ? window.bancoOverlayDelta(b.id, sessionEvents) : 0;
      const saldo = b.saldo + overlay;
      const isUSD = b.moneda === 'USD';
      const thresh = isUSD ? 100 : 5000;
      const fmtMon = isUSD ? `$${saldo.toFixed(2)}` : fmt(saldo);
      if (saldo < 0) {
        out.push({
          sev: 'critical', cat: 'finanz',
          title: `${b.nombre} · saldo negativo`,
          detail: `Saldo ${fmtMon} · cuenta en rojo, requiere aporte urgente`,
          action: '↗ APORTAR', ts: HOY,
        });
      } else if (saldo < thresh) {
        out.push({
          sev: 'warning', cat: 'finanz',
          title: `${b.nombre} · saldo bajo`,
          detail: `Saldo ${fmtMon} · cerca del umbral mínimo`,
          action: '→ MONITOR', ts: HOY,
        });
      }
    });

    // Próximas cuotas (préstamos)
    const prestamos = productState['FIN-P'] || [];
    prestamos.forEach((p) => {
      const start = p.fechaInicio || p.inicio;
      if (!start) return;
      const pagosCount = (p.movimientos || []).length;
      const next = new Date(start);
      next.setMonth(next.getMonth() + pagosCount + 1);
      const iso = next.toISOString().slice(0, 10);
      const dias = daysUntil(iso);
      if (dias >= 0 && dias <= 30) {
        out.push({
          sev: dias <= 7 ? 'warning' : 'info', cat: 'finanz',
          title: `Cuota ${p.nombre} en ${dias}d`,
          detail: `Vence ${iso} · ${fmt(p.cuota || 0)} · cuota #${pagosCount + 1}`,
          action: dias <= 7 ? '↗ PAGAR' : '→ AGENDAR',
          ts: iso,
        });
      } else if (dias < 0 && dias >= -14) {
        out.push({
          sev: 'critical', cat: 'finanz',
          title: `Cuota ${p.nombre} VENCIDA`,
          detail: `Esperada ${iso} hace ${-dias} días · ${fmt(p.cuota || 0)}`,
          action: '↗ PAGAR URGENTE', ts: iso,
        });
      }
    });

    // Pagos a inversores (mensual ~próximos)
    const inversores = productState['FIN-I'] || [];
    inversores.forEach((inv) => {
      if (!inv.pendiente || inv.pendiente <= 0) return;
      const pagos = inv.movimientos || [];
      if (pagos.length === 0) return;
      const lastPago = pagos[0]; // newest first
      const lastDate = new Date(lastPago.fecha);
      const next = new Date(lastDate);
      next.setMonth(next.getMonth() + 1);
      const iso = next.toISOString().slice(0, 10);
      const dias = daysUntil(iso);
      if (dias >= 0 && dias <= 30) {
        out.push({
          sev: dias <= 7 ? 'warning' : 'info', cat: 'finanz',
          title: `Pago ${inv.nombre} sugerido en ${dias}d`,
          detail: `Pendiente ${fmt(inv.pendiente)} · último pago ${lastPago.fecha}`,
          action: '→ PROGRAMAR', ts: iso,
        });
      }
    });

    return out;
  }, [stockDelta, productState, sessionEvents]);

  const crit = alerts.filter((a) => a.sev === 'critical').length;
  const warn = alerts.filter((a) => a.sev === 'warning').length;
  const info = alerts.filter((a) => a.sev === 'info').length;

  const visible = filterSev === 'all' ? alerts : alerts.filter((a) => a.sev === filterSev);
  const grouped = {};
  visible.forEach((a) => { (grouped[a.cat] = grouped[a.cat] || []).push(a); });
  const sevOrder = { critical: 0, warning: 1, info: 2 };
  Object.values(grouped).forEach((arr) => arr.sort((a, b) => sevOrder[a.sev] - sevOrder[b.sev]));

  const sevColor = (s) => s === 'critical' ? T.re : s === 'warning' ? T.am : T.bl;
  const sevLabel = (s) => s === 'critical' ? 'CRÍTICA' : s === 'warning' ? 'ATENCIÓN' : 'INFO';

  return (
    <div>
      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes radarPulse {
          0%, 100% { transform: scale(1); opacity: 1; }
          50% { transform: scale(1.8); opacity: 0.35; }
        }
        @keyframes radarFadeIn {
          from { opacity: 0; transform: translateY(-3px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes radarScan {
          0% { transform: translateY(-100%); }
          100% { transform: translateY(100%); }
        }
        .radar-scan-bg::before {
          content: ''; position: absolute; left: 0; right: 0; top: 0; height: 60%;
          background: linear-gradient(180deg, transparent, ${T.hot}08, transparent);
          animation: radarScan 8s linear infinite; pointer-events: none;
        }
      ` }} />

      <TSectionHead ix="§01" name="Centro de mando · señales en vivo"
        count={`${alerts.length} ALERTA${alerts.length === 1 ? '' : 'S'} ACTIVA${alerts.length === 1 ? '' : 'S'}`} />
      <div className="radar-scan-bg" style={{
        position: 'relative', overflow: 'hidden',
        display: 'grid', gridTemplateColumns: 'repeat(3,1fr)',
        border: `1px solid ${T.bd}`, margin: '0 0 0 14px',
      }}>
        <RadarCounter T={T} label="Críticas"  count={crit} color={T.re} pulse
          selected={filterSev === 'critical'}
          onClick={() => setFilterSev(filterSev === 'critical' ? 'all' : 'critical')} />
        <RadarCounter T={T} label="Atención"  count={warn} color={T.am}
          selected={filterSev === 'warning'}
          onClick={() => setFilterSev(filterSev === 'warning' ? 'all' : 'warning')} />
        <RadarCounter T={T} label="Info"      count={info} color={T.bl}
          selected={filterSev === 'info'}
          onClick={() => setFilterSev(filterSev === 'info' ? 'all' : 'info')} />
      </div>

      <TSectionHead ix="§02" name="Feed de alertas"
        count={`${visible.length} VISIBLES${filterSev !== 'all' ? ' · FILTRO ' + sevLabel(filterSev) : ''}`}
        right={filterSev !== 'all' ? (
          <button type="button" onClick={() => setFilterSev('all')} style={{
            background: 'transparent', color: T.t2, border: `1px solid ${T.bd}`,
            padding: '4px 10px', fontFamily: 'inherit', fontSize: 9,
            letterSpacing: '0.14em', fontWeight: 600, cursor: 'pointer',
          }}>✕ QUITAR FILTRO</button>
        ) : null} />

      <div style={{ margin: '0 0 0 14px' }}>
        {alerts.length === 0 && (
          <div style={{
            padding: '50px 20px', background: T.panel, border: `1px solid ${T.gn}`,
            textAlign: 'center', letterSpacing: '0.14em',
          }}>
            <div style={{ fontSize: 32, color: T.gn, marginBottom: 8, letterSpacing: '-0.02em' }}>✓</div>
            <div style={{ fontSize: 13, color: T.gn, fontWeight: 600, marginBottom: 4 }}>TODO EN ORDEN</div>
            <div style={{ fontSize: 10, color: T.t3 }}>0 alertas · sistema saludable</div>
          </div>
        )}
        {visible.length === 0 && alerts.length > 0 && (
          <div style={{
            padding: '32px 20px', background: T.panel, border: `1px solid ${T.bd}`,
            textAlign: 'center', color: T.t3, fontSize: 11, letterSpacing: '0.1em',
          }}>
            ▸ NINGUNA ALERTA EN EL FILTRO ACTUAL
          </div>
        )}
        {Object.entries(grouped).map(([cat, arr]) => (
          <div key={cat} style={{ marginBottom: 18 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
              <div style={{ fontSize: 9, color: T.t3, letterSpacing: '0.18em', textTransform: 'uppercase', fontWeight: 600 }}>
                ▸ {cat} · {arr.length}
              </div>
              <div style={{ flex: 1, height: 1, background: T.bd }} />
            </div>
            <div style={{ background: T.panel, border: `1px solid ${T.bd}` }}>
              {arr.map((a, i) => {
                const c = sevColor(a.sev);
                return (
                  <div key={i} style={{
                    display: 'grid', gridTemplateColumns: '24px 90px 90px 1fr 140px',
                    padding: '10px 14px', alignItems: 'center', gap: 12,
                    borderBottom: i < arr.length - 1 ? `1px solid ${T.bd}` : 'none',
                    borderLeft: `2px solid ${c}`,
                    opacity: 0, animation: 'radarFadeIn 0.35s ease-out forwards',
                    animationDelay: `${i * 35}ms`,
                  }}>
                    <span style={{
                      width: 10, height: 10, background: c, borderRadius: '50%',
                      animation: a.sev === 'critical' ? 'radarPulse 1.6s infinite' : 'none',
                      boxShadow: a.sev === 'critical' ? `0 0 10px ${c}` : `0 0 4px ${c}66`,
                    }} />
                    <span style={{
                      color: c, fontSize: 9, letterSpacing: '0.14em', fontWeight: 700,
                    }}>{sevLabel(a.sev)}</span>
                    <span style={{ color: T.t3, fontSize: 9, letterSpacing: '0.08em' }}>{daysAgo(a.ts)}</span>
                    <span style={{ fontSize: 11, color: T.t, lineHeight: 1.45 }}>
                      <strong style={{ color: T.t }}>{a.title}</strong>
                      <span style={{ color: T.t3 }}> · {a.detail}</span>
                    </span>
                    <span style={{
                      fontSize: 10, color: c, textAlign: 'right',
                      letterSpacing: '0.12em', fontWeight: 600,
                    }}>{a.action}</span>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      <div style={{
        margin: '12px 0 0 14px', fontSize: 9, color: T.t4,
        letterSpacing: '0.06em', fontStyle: 'italic',
      }}>
        ▸ feed derivado de INVENTARIO + FINANC + session ledger · se actualiza en vivo al registrar movimientos
      </div>
    </div>
  );
}

function RadarCounter({ T, label, count, color, pulse, selected, onClick }) {
  return (
    <button onClick={onClick} style={{
      padding: '18px 18px', background: selected ? color + '12' : 'transparent',
      borderRight: `1px solid ${T.bd}`, borderTop: 'none', borderBottom: 'none',
      borderLeft: selected ? `2px solid ${color}` : '2px solid transparent',
      cursor: 'pointer', textAlign: 'left', position: 'relative',
      fontFamily: 'inherit', color: 'inherit',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{
          width: 10, height: 10, background: color, borderRadius: '50%',
          animation: pulse && count > 0 ? 'radarPulse 1.6s infinite' : 'none',
          boxShadow: count > 0 ? `0 0 10px ${color}` : 'none',
        }} />
        <span style={{ fontSize: 9, color: T.t3, letterSpacing: '0.16em', fontWeight: 600 }}>
          ▸ {label.toUpperCase()}
        </span>
      </div>
      <div style={{
        fontSize: 36, color: count > 0 ? color : T.t4, fontWeight: 600,
        marginTop: 8, letterSpacing: '-0.03em', lineHeight: 1, fontFeatureSettings: '"tnum"',
      }}>
        {String(count).padStart(2, '0')}
      </div>
      <div style={{ fontSize: 9, color: T.t4, marginTop: 8, letterSpacing: '0.12em' }}>
        {selected ? '✓ filtrando' : count > 0 ? 'click para filtrar' : 'sin alertas'}
      </div>
    </button>
  );
}

// Local KV card (each Babel script has its own scope; panel-financiero defines its own)
function RKV({ label, value, color }) {
  const T = useTheme();
  return (
    <div style={{ background: T.panel2, border: `1px solid ${T.bd}`, padding: '8px 10px' }}>
      <div style={{ fontSize: 9, color: T.t3, letterSpacing: '0.12em' }}>▸ {label.toUpperCase()}</div>
      <div style={{ fontSize: 13, color: color || T.t, marginTop: 3, fontWeight: 500 }}>{value}</div>
    </div>
  );
}

function PanelRegistrar() {
  const T = useTheme();
  const [tab, setTab] = React.useState('venta');

  const tabs = [
    { id: 'venta', l: 'NUEVA VENTA' },
    { id: 'cf',    l: 'AJUSTE MANUAL CF' },
    { id: 'hist',  l: 'HISTÓRICO' },
    { id: 'log',   l: 'LOG DE SESIÓN' },
  ];

  return (
    <div>
      <div style={{ margin: '10px 14px 0', padding: '10px 14px', background: T.panel2, border: `1px solid ${T.bd}`, borderLeft: `2px solid ${T.gn}`, color: T.t2, fontSize: 10, letterSpacing: '0.04em', lineHeight: 1.55 }}>
        ▸ <strong style={{ color: T.t }}>Cada movimiento se genera desde su fuente.</strong> Las ventas, lotes, cuotas, disposiciones y pagos crean automáticamente sus movimientos de cash flow vinculados a la cuenta de banco seleccionada. <span style={{ color: T.am }}>AJUSTE MANUAL CF</span> es solo para excepciones (descuadres, hallazgos, comisiones automáticas sin fuente).
      </div>

      <div style={{ display: 'flex', gap: 0, padding: '10px 0 0 14px', borderBottom: `1px solid ${T.bd}` }}>
        {tabs.map((tt, i) => {
          const on = tab === tt.id;
          return (
            <button key={tt.id} onClick={() => setTab(tt.id)} style={{
              background: 'transparent', color: on ? T.t : T.t2,
              border: 'none', borderBottom: on ? `2px solid ${T.hot}` : '2px solid transparent',
              padding: '10px 16px', fontFamily: 'inherit', fontSize: 11, fontWeight: 600,
              letterSpacing: '0.14em', cursor: 'pointer',
            }}>
              <span style={{ color: T.t3, marginRight: 8 }}>0{i + 1}</span>{tt.l}
            </button>
          );
        })}
      </div>

      {tab === 'venta' && <FormVenta />}
      {tab === 'cf'    && <FormCashFlow />}
      {tab === 'hist'  && <HistoricoVentas />}
      {tab === 'log'   && <SesionLog />}
    </div>
  );
}

// ── Histórico Ventas · §8.5 + §8.1 ──────────────────────────────
// Lista las ventas históricas de Airtable como tabla paginada, con
// botones de delete per row (borra TODAS las líneas asociadas al ID_Venta)
// y export CSV. Edit per row queda diferido a una iteración futura porque
// edit de venta multi-SKU requiere UX más rica (re-prorrata, etc.).
function HistoricoVentas() {
  const T = useTheme();
  const atVentas = useAirtableTable('ventas');
  // Re-render cuando airtable refresca después de delete
  const [, force] = React.useReducer((x) => x + 1, 0);
  React.useEffect(() => {
    const onChange = (e) => { if (e.detail?.table === 'ventas') force(); };
    window.addEventListener('airtable-loaded', onChange);
    return () => window.removeEventListener('airtable-loaded', onChange);
  }, []);

  const [pageSize, setPageSize] = React.useState(() => window.__LS__?.get('ventas:pageSize') || 30);
  const [deletingId, setDeletingId] = React.useState(null);
  const [editingId, setEditingId] = React.useState(null);
  const [savingEditId, setSavingEditId] = React.useState(null);
  const [query, setQuery] = React.useState('');

  const allVentas = (window.__AIRTABLE_DATA__?.ventas || []).slice().sort((a, b) =>
    (b.fecha || '').localeCompare(a.fecha || ''));
  const filtered = query
    ? allVentas.filter((v) => {
        const q = query.toLowerCase();
        if ((v.idVenta || '').toLowerCase().includes(q)) return true;
        if ((v.canal || '').toLowerCase().includes(q)) return true;
        if ((v.fecha || '').includes(q)) return true;
        if ((v.lineas || []).some((l) => (l.skuRef || '').toLowerCase().includes(q))) return true;
        return false;
      })
    : allVentas;
  const tail = filtered.slice(0, pageSize);

  const handleDelete = async (v) => {
    if (!confirm(`¿Eliminar venta ${v.idVenta} de Airtable?\n\n` +
      `${v.fecha} · ${v.canal || '—'}\n` +
      `${(v.lineas || []).length} línea(s) · ${v.cantidadTotal} ud · ${fmt(v.precioFacturadoTotal || 0)}\n\n` +
      `Borra ${(v.lineas || []).length} record(s) de Airtable. Acción permanente.`)) return;
    setDeletingId(v.idVenta);
    try {
      const res = await window.AT_CLIENT.removeVenta(v.idVenta);
      window.toastOk?.('Venta eliminada', `${v.idVenta} · ${res.deletedCount} record(s) borrados`);
    } catch (err) {
      window.toastErr?.('Error al eliminar', err.message);
    } finally {
      setDeletingId(null);
    }
  };

  // §8.1 edit: edita header (fecha/canal/notas) propagando a todas las líneas
  // de la venta. SKUs y cantidades no editables (requeriría re-prorrata).
  // Para cambios de línea, conservador: borra y recrea.
  const handleSaveEdit = async (v, patch) => {
    setSavingEditId(v.idVenta);
    try {
      const res = await window.AT_CLIENT.updateVentaHeader(v.idVenta, patch);
      window.toastOk?.('Venta actualizada', `${v.idVenta} · ${res.updatedCount} línea(s)`);
      setEditingId(null);
    } catch (err) {
      window.toastErr?.('Error al actualizar', err.message);
    } finally {
      setSavingEditId(null);
    }
  };

  const exportCSV = () => {
    const headers = ['IDVenta','Fecha','Canal','NumSKUs','UdsTotal','Facturado','Costo','Ganancia','MargenPct','SKUs','Notas'];
    const rows = filtered.map((v) => [
      v.idVenta || '',
      v.fecha || '',
      v.canal || '',
      (v.lineas || []).length,
      v.cantidadTotal || 0,
      v.precioFacturadoTotal || 0,
      v.baseCostTotal || 0,
      v.gananciaTotal || 0,
      Math.round((v.margenPct || 0) * 10) / 10,
      (v.lineas || []).map((l) => `${l.skuRef || ''}×${l.qty}`).join(' | '),
      v.notas || '',
    ]);
    window.exportCSVDownload(`ventas-${HOY}.csv`, headers, rows, { toastLabel: 'Ventas exportadas' });
  };

  if (!atVentas.loaded && allVentas.length === 0) {
    return (
      <div style={{ padding: '32px 24px', textAlign: 'center', color: T.t3, fontSize: 11, letterSpacing: '0.1em' }}>
        ▸ Cargando ventas desde Airtable...
      </div>
    );
  }

  return (
    <div style={{ margin: '0 0 0 14px' }}>
      <TSectionHead ix="§01" name="Histórico de ventas (Airtable)"
        count={`${filtered.length}${query ? '/' + allVentas.length : ''} ventas · ${atVentas.loaded ? 'LIVE' : 'mock'}`}
        right={
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="buscar..."
              style={{ background: T.panel2, color: T.t, border: `1px solid ${T.bd}`,
                padding: '3px 8px', fontSize: 10, fontFamily: 'inherit', width: 130 }}
            />
            <button type="button" onClick={exportCSV}
              style={{ background: 'transparent', color: T.hot, border: `1px solid ${T.hot}`, padding: '3px 10px',
                fontSize: 9, fontFamily: 'inherit', cursor: 'pointer', letterSpacing: '0.12em', fontWeight: 600 }}
              onMouseEnter={(ev) => { ev.currentTarget.style.background = T.hot; ev.currentTarget.style.color = T.hotInk; }}
              onMouseLeave={(ev) => { ev.currentTarget.style.background = 'transparent'; ev.currentTarget.style.color = T.hot; }}
            >▼ CSV</button>
          </div>
        } />
      {filtered.length === 0 ? (
        <div style={{ padding: '24px 16px', textAlign: 'center', color: T.t3, fontSize: 11, letterSpacing: '0.1em',
          background: T.panel, border: `1px solid ${T.bd}` }}>
          {query ? `▸ Sin coincidencias para "${query}"` : '▸ Sin ventas en Airtable todavía'}
        </div>
      ) : (
        <div style={{ background: T.panel, border: `1px solid ${T.bd}`, overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 10, minWidth: 720 }}>
            <thead>
              <tr style={{ background: T.panel2 }}>
                {['FECHA','ID','CANAL','SKUs','UDS','FACTURADO','GANANCIA','MGN%',''].map((h, i) => (
                  <th key={h + i} style={{ textAlign: i < 3 ? 'left' : (i === 8 ? 'center' : 'right'),
                    padding: '7px 12px', color: T.t3, letterSpacing: '0.14em',
                    fontSize: 9, fontWeight: 600, borderBottom: `1px solid ${T.bd}`,
                    width: i === 8 ? 34 : undefined }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {tail.map((v) => {
                const isDel = deletingId === v.idVenta;
                const isEdit = editingId === v.idVenta;
                const margen = v.margenPct || 0;
                return (
                  <React.Fragment key={v.idVenta}>
                  <tr style={{ borderBottom: isEdit ? 'none' : `1px dashed ${T.t4}`, opacity: isDel ? 0.4 : 1 }}>
                    <td style={{ padding: '5px 12px', color: T.hot, letterSpacing: '0.04em' }}>{v.fecha}</td>
                    <td style={{ padding: '5px 12px', color: T.t3, fontSize: 9 }}>{v.idVenta}</td>
                    <td style={{ padding: '5px 12px', color: T.t }}>{v.canal || '—'}</td>
                    <td style={{ padding: '5px 12px', textAlign: 'right', color: T.t2 }}>{(v.lineas || []).length}</td>
                    <td style={{ padding: '5px 12px', textAlign: 'right', color: T.t }}>{v.cantidadTotal || 0}</td>
                    <td style={{ padding: '5px 12px', textAlign: 'right', color: T.gn, fontWeight: 500 }}>{fmt(v.precioFacturadoTotal || 0)}</td>
                    <td style={{ padding: '5px 12px', textAlign: 'right', color: (v.gananciaTotal || 0) >= 0 ? T.gn : T.re, fontWeight: 500 }}>
                      {fmt(v.gananciaTotal || 0)}
                    </td>
                    <td style={{ padding: '5px 12px', textAlign: 'right',
                      color: margen >= 35 ? T.gn : margen >= 20 ? T.am : T.re }}>
                      {margen.toFixed(1)}%
                    </td>
                    <td style={{ padding: '5px 6px', textAlign: 'center', whiteSpace: 'nowrap' }}>
                      <button type="button"
                        onClick={() => setEditingId(isEdit ? null : v.idVenta)}
                        title={isEdit ? 'Cancelar' : 'Editar header (fecha/canal/notas)'}
                        style={{ background: 'transparent', color: isEdit ? T.am : T.t4,
                          border: `1px solid ${isEdit ? T.am : T.bd}`,
                          fontSize: 10, padding: '2px 5px', cursor: 'pointer',
                          fontFamily: 'inherit', lineHeight: 1, marginRight: 4 }}
                        onMouseEnter={(ev) => { if (!isEdit) { ev.currentTarget.style.color = T.am; ev.currentTarget.style.borderColor = T.am; } }}
                        onMouseLeave={(ev) => { if (!isEdit) { ev.currentTarget.style.color = T.t4; ev.currentTarget.style.borderColor = T.bd; } }}
                      >✎</button>
                      <button type="button"
                        onClick={() => handleDelete(v)}
                        disabled={isDel}
                        title={isDel ? 'Eliminando...' : 'Eliminar venta de Airtable'}
                        style={{ background: 'transparent', color: T.t4, border: `1px solid ${T.bd}`,
                          fontSize: 10, padding: '2px 6px', cursor: isDel ? 'wait' : 'pointer',
                          fontFamily: 'inherit', lineHeight: 1 }}
                        onMouseEnter={(ev) => { ev.currentTarget.style.color = T.re; ev.currentTarget.style.borderColor = T.re; }}
                        onMouseLeave={(ev) => { ev.currentTarget.style.color = T.t4; ev.currentTarget.style.borderColor = T.bd; }}
                      >{isDel ? '…' : '×'}</button>
                    </td>
                  </tr>
                  {isEdit && (
                    <VentaHeaderEditRow
                      venta={v}
                      saving={savingEditId === v.idVenta}
                      onSave={(patch) => handleSaveEdit(v, patch)}
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
            <span>▌MOSTRANDO {tail.length} de {filtered.length}{query ? ` (filtro · de ${allVentas.length})` : ''}</span>
            <div style={{ display: 'flex', gap: 6 }}>
              {filtered.length > pageSize && (
                <button type="button"
                  onClick={() => { const n = pageSize + 30; setPageSize(n); window.__LS__?.set('ventas:pageSize', n); }}
                  style={{ background: 'transparent', color: T.t2, border: `1px solid ${T.bd}`,
                    padding: '3px 8px', fontSize: 9, fontFamily: 'inherit', cursor: 'pointer', letterSpacing: '0.1em' }}
                >+30 MÁS ↓</button>
              )}
              {pageSize > 30 && (
                <button type="button"
                  onClick={() => { setPageSize(30); window.__LS__?.set('ventas:pageSize', 30); }}
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

function FormVenta() {
  const T = useTheme();
  const SK = buildSK();
  const stockDelta = useStockDeltaBySKU();
  const [fecha, setFecha] = React.useState(HOY);
  const [lineas, setLineas] = React.useState([{ skuId: '', qty: '' }]);
  const [precioFacturado, setPrecioFacturado] = React.useState('');
  const [canal, setCanal] = React.useState('FB Marketplace');
  const [cuentaId, setCuentaId] = React.useState(window.BANCOS_SEED?.[0]?.id || '');
  const [nota, setNota] = React.useState('');
  const [saved, setSaved] = React.useState(null);

  const addLinea = () => setLineas((arr) => [...arr, { skuId: '', qty: '' }]);
  const removeLinea = (i) => setLineas((arr) => arr.length > 1 ? arr.filter((_, j) => j !== i) : arr);
  const updateLinea = (i, patch) => setLineas((arr) => arr.map((l, j) => j === i ? { ...l, ...patch } : l));

  // Enrich each line with derived data: sku, stock, baseCost, etc.
  const enriched = lineas.map((l) => {
    const sku = SK.find((s) => s.id === l.skuId);
    const stockSesion = sku ? sku.s + (stockDelta[sku.id] || 0) : 0;
    const q = parseFloat(l.qty) || 0;
    const baseCost = sku ? (sku.cpp || 0) * q : 0;
    return { ...l, sku, stockSesion, q, baseCost, stockPost: stockSesion - q };
  });

  const lineasValidas = enriched.filter((e) => e.sku && e.q > 0);
  const baseCostTotal = lineasValidas.reduce((s, e) => s + e.baseCost, 0);
  const facturadoTotal = parseFloat(precioFacturado) || 0;
  const upliftRatio = baseCostTotal > 0 ? facturadoTotal / baseCostTotal : 0;
  const gananciaTotal = facturadoTotal - baseCostTotal;
  const margenTotal = facturadoTotal > 0 ? (gananciaTotal / facturadoTotal) * 100 : 0;

  // Per-line prorrata: cada SKU absorbe parte del facturado proporcional a su costo.
  // Garantiza margen % uniforme entre líneas (ganancia balanceada).
  const prorrata = enriched.map((e) => {
    if (!e.sku || e.q <= 0) return { ...e, precioAsignado: 0, ganancia: 0 };
    const precioAsignado = baseCostTotal > 0 ? e.baseCost * upliftRatio : 0;
    return { ...e, precioAsignado, ganancia: precioAsignado - e.baseCost };
  });

  // §6 #5 validación mixta: hard guards bloquean (datos faltantes / inválidos),
  // soft warnings permiten proceder (regla de negocio que Julio puede sobrescribir).
  const guards = [];          // hard · button disabled
  const warnings = [];        // soft · button habilitado · warning visible
  if (lineasValidas.length === 0) guards.push('al menos 1 SKU con cantidad');
  if (facturadoTotal <= 0) guards.push('precio facturado > 0');
  if (!cuentaId) guards.push('selecciona cuenta destino');
  const duplicateSkus = new Set();
  const dup = lineasValidas.find((e) => {
    if (duplicateSkus.has(e.skuId)) return true;
    duplicateSkus.add(e.skuId);
    return false;
  });
  if (dup) guards.push('SKU duplicado · combina las cantidades');
  // SOFT — permite proceder con warning visible
  const stockNeg = enriched.find((e) => e.sku && e.stockPost < 0);
  if (stockNeg) warnings.push(`stock insuficiente en ${stockNeg.sku.id} (queda ${stockNeg.stockSesion}, vendería ${stockNeg.q})`);
  if (fecha > HOY) warnings.push('fecha futura');

  const reset = () => {
    setFecha(HOY);
    setLineas([{ skuId: '', qty: '' }]);
    setPrecioFacturado('');
    setCanal('FB Marketplace');
    setCuentaId(window.BANCOS_SEED?.[0]?.id || '');
    setNota(''); setSaved(null);
  };
  const [saving, setSaving] = React.useState(false);
  const submit = () => {
    if (guards.length) return;
    if (saving) return; // §6 #11 idempotencia · doble-click no duplica
    const cuentaNombre = window.findBancoNombre(cuentaId);
    const ventaLineas = prorrata.filter((e) => e.sku && e.q > 0).map((e) => ({
      skuId: e.sku.id,
      skuNombre: e.sku.nm,
      qty: e.q,
      cppEnVenta: e.sku.cpp || 0,
      baseCost: e.baseCost,
      precioAsignado: e.precioAsignado,
      ganancia: e.ganancia,
    }));
    const ev = window.__SESSION_LEDGER__.addEvent({
      tipo: 'venta',
      fecha,
      lineas: ventaLineas,
      precioFacturadoTotal: facturadoTotal,
      precioTotal: facturadoTotal,        // compat con readers viejos
      baseCostTotal,
      gananciaTotal,
      margenTotal,
      upliftRatio,
      canal,
      cuentaId,
      cuentaNombre,
      nota,
      pending: true,                       // optimistic flag
    });
    const items = ventaLineas.length;
    setSaving(true);
    setSaved(`▸ Subiendo a Airtable · ${items} ${items === 1 ? 'SKU' : 'SKUs'} · ${fmt(facturadoTotal)}`);
    // Optimistic write to Airtable; on success se remueve el evento (la venta
    // ahora vive en window.__AIRTABLE_DATA__.ventas y se ve via el overlay).
    if (window.AT_CLIENT?.createVenta) {
      window.AT_CLIENT.createVenta({
        fecha,
        lineas: ventaLineas,
        precioFacturadoTotal: facturadoTotal,
        canal,
        nota,
      })
        .then(({ idVenta }) => {
          window.__SESSION_LEDGER__.removeEvent(ev.id);
          setSaving(false);
          setSaved(`✓ Venta ${idVenta} guardada en Airtable · ${fmt(facturadoTotal)} → ${cuentaNombre}`);
          setTimeout(() => { setSaved(null); reset(); }, 4000);
        })
        .catch((err) => {
          window.__SESSION_LEDGER__.updateEvent(ev.id, { pending: false, error: err.message });
          setSaving(false);
          setSaved(`✕ Falló · ${err.message.slice(0, 60)} · queda en sesión para reintentar`);
          setTimeout(() => { setSaved(null); }, 6000);
        });
    } else {
      setSaving(false);
      setSaved(`✓ Venta registrada (offline) · ${items} ${items === 1 ? 'SKU' : 'SKUs'} · ${fmt(facturadoTotal)} → ${cuentaNombre}`);
      setTimeout(() => { setSaved(null); reset(); }, 4000);
    }
  };

  return (
    <div style={{ background: T.panel, border: `1px solid ${T.bd}`, margin: '0 0 0 14px', padding: '18px 22px' }}>
      <div style={{ fontSize: 11, color: T.t, letterSpacing: '0.14em', fontWeight: 600, marginBottom: 8 }}>NUEVA VENTA</div>
      <div style={{ background: T.panel2, padding: '10px 12px', border: `1px solid ${T.bd}`, marginBottom: 16, fontSize: 10, color: T.t2, lineHeight: 1.55 }}>
        Añade los SKUs vendidos con sus cantidades. Ingresa el <span style={{ color: T.hot }}>precio facturado total</span> — la ganancia se prorratea <span style={{ color: T.am }}>ponderado por costo</span> para que cada SKU contribuya con el mismo margen %.
        <br />Fórmula: <span style={{ color: T.t }}>precio asignado i = costo i × (facturado / Σ costos)</span>
      </div>

      {/* Encabezado: fecha + canal + cuenta */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 14, marginBottom: 14 }}>
        <FormField label="Fecha">
          <TInput type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
        </FormField>
        <FormField label="Canal">
          <TSelect value={canal} onChange={(e) => setCanal(e.target.value)}>
            <option>FB Marketplace</option>
            <option>WhatsApp</option>
            <option>Tienda física</option>
            <option>Otro</option>
          </TSelect>
        </FormField>
        <FormField label="Cuenta destino" hint="dónde se deposita el cobro">
          <TSelect value={cuentaId} onChange={(e) => setCuentaId(e.target.value)}
            style={{ borderLeft: `2px solid ${T.gn}` }}>
            <option value="">— selecciona —</option>
            {(window.bancosOpts ? window.bancosOpts() : []).map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </TSelect>
        </FormField>
      </div>

      {/* SKUs · líneas editables */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
        <div style={{ fontSize: 9, color: T.t3, letterSpacing: '0.14em' }}>▸ SKUS VENDIDOS · {lineas.length} {lineas.length === 1 ? 'línea' : 'líneas'}</div>
        <div style={{ flex: 1, height: 1, background: T.bd }} />
      </div>
      <div style={{ background: T.panel2, border: `1px solid ${T.bd}`, marginBottom: 14 }}>
        <div style={{
          display: 'grid', gridTemplateColumns: '30px 1fr 80px 100px 110px 110px 30px',
          padding: '7px 10px', fontSize: 9, color: T.t3, letterSpacing: '0.14em',
          borderBottom: `1px solid ${T.bd}`, background: T.panel3, gap: 8,
        }}>
          <span>#</span>
          <span>SKU</span>
          <span style={{ textAlign: 'right' }}>CANT.</span>
          <span style={{ textAlign: 'right' }}>CPP × QTY</span>
          <span style={{ textAlign: 'right' }}>PRECIO ASIG.</span>
          <span style={{ textAlign: 'right' }}>GANANCIA</span>
          <span></span>
        </div>
        {prorrata.map((e, i) => (
          <div key={i} style={{
            display: 'grid', gridTemplateColumns: '30px 1fr 80px 100px 110px 110px 30px',
            padding: '6px 10px', alignItems: 'center', gap: 8,
            borderBottom: i < prorrata.length - 1 ? `1px dashed ${T.t4}` : 'none',
            borderLeft: e.sku && e.stockPost < 0 ? `2px solid ${T.re}` : '2px solid transparent',
          }}>
            <span style={{ fontSize: 10, color: T.t3, letterSpacing: '0.1em' }}>{String(i + 1).padStart(2, '0')}</span>
            <TSelect value={e.skuId} onChange={(ev) => updateLinea(i, { skuId: ev.target.value })}>
              <option value="">— selecciona —</option>
              {SK.filter((s) => (s.s + (stockDelta[s.id] || 0)) > 0).map((s) => {
                const sStock = s.s + (stockDelta[s.id] || 0);
                return <option key={s.id} value={s.id}>{s.nm} · {s.id} · stock {sStock}</option>;
              })}
            </TSelect>
            <TInput type="number" min="0" placeholder="0" value={e.qty}
              onChange={(ev) => updateLinea(i, { qty: ev.target.value })}
              style={{ textAlign: 'right',
                borderLeft: `2px solid ${e.sku && e.stockPost < 0 ? T.re : T.hot}` }} />
            <span style={{ fontSize: 11, color: e.baseCost > 0 ? T.t : T.t4, textAlign: 'right' }}>
              {e.baseCost > 0 ? fmt(e.baseCost) : '—'}
            </span>
            <span style={{ fontSize: 11, color: e.precioAsignado > 0 ? T.hot : T.t4, textAlign: 'right', fontWeight: 600 }}>
              {e.precioAsignado > 0 ? fmt(e.precioAsignado) : '—'}
            </span>
            <span style={{ fontSize: 11, color: e.ganancia > 0 ? T.gn : e.ganancia < 0 ? T.re : T.t4, textAlign: 'right' }}>
              {e.precioAsignado > 0 ? fmt(e.ganancia) : '—'}
            </span>
            <button type="button" onClick={() => removeLinea(i)} disabled={lineas.length === 1}
              title="Quitar línea" style={{
                background: 'transparent', color: lineas.length === 1 ? T.t4 : T.t2,
                border: `1px solid ${T.bd}`, fontFamily: 'inherit', fontSize: 12, lineHeight: 1,
                padding: '4px 0', cursor: lineas.length === 1 ? 'default' : 'pointer',
              }}>−</button>
          </div>
        ))}
        <button type="button" onClick={addLinea} style={{
          display: 'flex', alignItems: 'center', gap: 8, width: '100%', textAlign: 'left',
          background: T.panel, color: T.hot, border: 'none', borderTop: `1px solid ${T.bd}`,
          padding: '8px 12px', fontFamily: 'inherit', fontSize: 10, letterSpacing: '0.14em',
          fontWeight: 600, cursor: 'pointer',
        }}>
          <span style={{ fontSize: 14, lineHeight: 1 }}>+</span> AÑADIR SKU
        </button>
      </div>

      {/* Precio facturado total + nota */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 14 }}>
        <FormField label="Precio facturado total RD$" hint={baseCostTotal > 0 ? `costo total ${fmt(baseCostTotal)} · margen ${margenTotal.toFixed(1)}%` : 'lo que efectivamente cobraste'}>
          <TInput type="number" min="0" value={precioFacturado} placeholder="0"
            onChange={(e) => setPrecioFacturado(e.target.value)}
            style={{ borderLeft: `2px solid ${T.hot}` }} />
        </FormField>
        <FormField label="Notas" hint="opcional · cliente, referencia">
          <TInput value={nota} onChange={(e) => setNota(e.target.value)}
            placeholder="cliente, referencia, etc." />
        </FormField>
      </div>

      {/* Cross-effect preview */}
      <div style={{ marginTop: 16, background: T.panel2, border: `1px solid ${T.bd}`, padding: '12px 14px' }}>
        <div style={{ fontSize: 9, color: T.t3, letterSpacing: '0.14em', marginBottom: 10 }}>▸ RESUMEN · EFECTOS CRUZADOS</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 8 }}>
          <RKV label="Facturado total" value={facturadoTotal > 0 ? fmt(facturadoTotal) : '—'} color={facturadoTotal > 0 ? T.hot : T.t3} />
          <RKV label="Costo total" value={baseCostTotal > 0 ? fmt(baseCostTotal) : '—'} color={T.t2} />
          <RKV label="Ganancia total" value={baseCostTotal > 0 && facturadoTotal > 0 ? fmt(gananciaTotal) : '—'}
            color={gananciaTotal > 0 ? T.gn : gananciaTotal < 0 ? T.re : T.t3} />
          <RKV label="Margen" value={facturadoTotal > 0 ? margenTotal.toFixed(1) + '%' : '—'}
            color={margenTotal >= 35 ? T.gn : margenTotal > 0 ? T.am : T.t3} />
        </div>
        <div style={{ marginTop: 10, display: 'flex', gap: 14, fontSize: 10, color: T.t2, flexWrap: 'wrap' }}>
          <span><span style={{ color: T.gn }}>⊕</span> CF entrada · <span style={{ color: T.t }}>{facturadoTotal > 0 ? fmt(facturadoTotal) : 'pendiente'}</span> → {cuentaId ? window.findBancoNombre(cuentaId) : '—'}</span>
          <span><span style={{ color: T.re }}>⊖</span> Stock · <span style={{ color: T.t }}>
            {lineasValidas.length > 0
              ? lineasValidas.map((e) => `${e.sku.id} −${e.q}`).join(' · ')
              : 'pendiente'}
          </span></span>
        </div>
      </div>

      <FormSubmit label="REGISTRAR VENTA" color={T.hot}
        onSubmit={submit} onClear={reset}
        confirmation={saved}
        busy={saving}
        disabled={guards.length > 0}
        warning={
          saved ? null
          : guards.length > 0 ? 'falta: ' + guards.join(', ')
          : warnings.length > 0 ? warnings.join(' · ') + ' (puedes proceder)'
          : null
        } />
    </div>
  );
}

// ── Sesión log ──────────────────────────────────────────────────
function SesionLog() {
  const T = useTheme();
  const evs = useSessionEvents();
  const [editingId, setEditingId] = React.useState(null);

  const tipoStyle = (t) => ({
    venta:         { c: T.hot, l: 'VENTA'        },
    cf_mov:        { c: T.am,  l: 'CF'           },
    ajuste_stock:  { c: T.bl,  l: 'AJUSTE STOCK' },
    lote_compra:   { c: T.bl,  l: 'LOTE'         },
    prestamo_pago: { c: T.gn,  l: 'PAGO PRÉSTAMO'},
    credito_cargo: { c: T.re,  l: 'CARGO CRÉDITO'},
    credito_pago:  { c: T.gn,  l: 'PAGO CRÉDITO' },
  }[t] || { c: T.t2, l: t });

  return (
    <div style={{ margin: '0 0 0 14px' }}>
      <TSectionHead ix="§01" name="Log de operaciones de esta sesión"
        count={`${evs.length} ${evs.length === 1 ? 'operación' : 'operaciones'}`}
        right={evs.length > 0 ? (
          <button type="button" onClick={() => {
            if (confirm('¿Limpiar todo el log de sesión?')) window.__SESSION_LEDGER__.clearEvents();
          }} style={{
            background: 'transparent', color: T.re, border: `1px solid ${T.bd}`,
            padding: '4px 10px', fontFamily: 'inherit', fontSize: 9,
            letterSpacing: '0.14em', fontWeight: 600, cursor: 'pointer',
          }}>✕ LIMPIAR</button>
        ) : null} />
      <div style={{ background: T.panel, border: `1px solid ${T.bd}` }}>
        {evs.length === 0 && (
          <div style={{ padding: '32px 16px', textAlign: 'center', color: T.t3, fontSize: 11, letterSpacing: '0.1em' }}>
            ▸ SIN OPERACIONES EN SESIÓN · registra una venta para verla aquí
          </div>
        )}
        {evs.map((e) => {
          const s = tipoStyle(e.tipo);
          const editable = e.tipo === 'venta' || e.tipo === 'cf_mov' || e.tipo === 'ajuste_stock';
          if (editingId === e.id && e.tipo === 'venta') {
            return <VentaEditor key={e.id} ev={e} onClose={() => setEditingId(null)} />;
          }
          if (editingId === e.id && e.tipo === 'ajuste_stock') {
            return <AjusteEditor key={e.id} ev={e} onClose={() => setEditingId(null)} />;
          }
          if (editingId === e.id && e.tipo === 'cf_mov') {
            return <CfMovEditor key={e.id} ev={e} onClose={() => setEditingId(null)} />;
          }
          return (
            <div key={e.id} style={{ display: 'grid',
              gridTemplateColumns: '110px 140px 1fr 130px 30px 30px',
              padding: '8px 14px', alignItems: 'center', gap: 10, fontSize: 11,
              borderBottom: `1px solid ${T.bd}`, borderLeft: `2px solid ${s.c}`,
            }}>
              <span style={{ color: T.t2, fontSize: 10 }}>{e.fecha}</span>
              <span style={{ color: s.c, fontSize: 9, letterSpacing: '0.14em', fontWeight: 600 }}>{s.l}</span>
              <span style={{ color: T.t, fontSize: 11 }}>
                {e.tipo === 'venta'
                  ? (() => {
                      // Modern shape: lineas[]. Fallback to old single-SKU shape.
                      const lineas = Array.isArray(e.lineas) && e.lineas.length > 0
                        ? e.lineas
                        : (e.skuId ? [{ skuId: e.skuId, skuNombre: e.skuNombre, qty: e.qty }] : []);
                      const desc = lineas.length > 1
                        ? `${lineas.length} SKUs: ${lineas.map((l) => `${l.skuNombre} ×${l.qty}`).join(' · ')}`
                        : lineas[0] ? `${lineas[0].skuNombre} · ${lineas[0].qty} ud` : '—';
                      return <>{desc.split(':')[0]}<span style={{ color: T.t3 }}> {desc.includes(':') ? ':' + desc.split(':').slice(1).join(':') : ''} · {e.canal}{e.cuentaNombre ? ' → ' + e.cuentaNombre : ''}{e.nota ? ' · ' + e.nota : ''}</span></>;
                    })()
                  : e.tipo === 'cf_mov'
                  ? <>{e.categoria} <span style={{ color: T.t3 }}>· {e.cuenta || '—'}{e.nota ? ' · ' + e.nota : ''}{e.src ? ' · ' + e.src : ''}</span></>
                  : e.tipo === 'ajuste_stock'
                  ? <>{e.skuNombre} <span style={{ color: T.t3 }}>· {e.delta >= 0 ? '+' : ''}{e.delta} ud · {e.razon}{e.nota ? ' · ' + e.nota : ''}</span></>
                  : <span style={{ color: T.t3 }}>{JSON.stringify(e).slice(0, 80)}…</span>}
              </span>
              <span style={{ textAlign: 'right', color: T.hot, fontWeight: 600 }}>
                {e.tipo === 'venta' ? fmt(e.precioFacturadoTotal ?? e.precioTotal ?? 0)
                  : e.tipo === 'cf_mov' ? (e.entrada > 0 ? '+' + fmt(e.entrada) : '−' + fmt(e.salida))
                  : e.tipo === 'ajuste_stock' ? (e.delta >= 0 ? '+' : '') + e.delta + ' ud'
                  : '—'}
              </span>
              {editable ? (
                <button type="button" onClick={() => setEditingId(e.id)}
                  title="Modificar"
                  style={{
                    background: 'transparent', color: T.t3, border: `1px solid ${T.bd}`,
                    fontFamily: 'inherit', fontSize: 10, lineHeight: 1, padding: '3px 0',
                    cursor: 'pointer',
                  }}
                  onMouseEnter={(ev) => { ev.currentTarget.style.color = T.am; ev.currentTarget.style.borderColor = T.am; }}
                  onMouseLeave={(ev) => { ev.currentTarget.style.color = T.t3; ev.currentTarget.style.borderColor = T.bd; }}
                >✎</button>
              ) : <span />}
              <button type="button" onClick={() => window.__SESSION_LEDGER__.removeEvent(e.id)}
                title="Eliminar de la sesión"
                style={{
                  background: 'transparent', color: T.t3, border: `1px solid ${T.bd}`,
                  fontFamily: 'inherit', fontSize: 11, lineHeight: 1, padding: '3px 0',
                  cursor: 'pointer',
                }}
                onMouseEnter={(ev) => { ev.currentTarget.style.color = T.re; ev.currentTarget.style.borderColor = T.re; }}
                onMouseLeave={(ev) => { ev.currentTarget.style.color = T.t3; ev.currentTarget.style.borderColor = T.bd; }}
              >×</button>
            </div>
          );
        })}
      </div>
      <div style={{ marginTop: 10, fontSize: 9, color: T.t4, letterSpacing: '0.06em', fontStyle: 'italic', padding: '0 0 0 14px' }}>
        ▸ las operaciones de sesión se pierden al recargar · listo para sustituir con Airtable
      </div>
    </div>
  );
}

// ── Inline editors for session log rows ────────────────────────
// Show a row's fields as editable inputs. On save, update the ledger
// in place (preserves id, so linked CF entries stay attached).

function EditorShell({ accent, children, onSave, onCancel, disabled }) {
  const T = useTheme();
  return (
    <div style={{
      background: T.panel2, borderBottom: `1px solid ${T.bd}`,
      borderLeft: `2px solid ${accent}`, padding: '12px 14px',
    }}>
      {children}
      <div style={{ display: 'flex', gap: 8, marginTop: 12, alignItems: 'center' }}>
        <button type="button" onClick={onSave} disabled={disabled} style={{
          padding: '6px 14px', background: disabled ? T.panel3 : accent,
          color: disabled ? T.t3 : T.hotInk, border: 'none',
          fontFamily: 'inherit', fontSize: 10, fontWeight: 700,
          letterSpacing: '0.14em', cursor: disabled ? 'not-allowed' : 'pointer',
        }}>▸ GUARDAR</button>
        <button type="button" onClick={onCancel} style={{
          padding: '6px 14px', background: 'transparent', color: T.t2,
          border: `1px solid ${T.bd}`, fontFamily: 'inherit', fontSize: 10,
          letterSpacing: '0.14em', cursor: 'pointer',
        }}>CANCELAR</button>
      </div>
    </div>
  );
}

function VentaEditor({ ev, onClose }) {
  const T = useTheme();
  // Normalize old single-SKU shape into the new lineas-shape so the editor handles both.
  const initialLineas = Array.isArray(ev.lineas) && ev.lineas.length > 0
    ? ev.lineas.map((l) => ({ ...l }))
    : (ev.skuId ? [{
        skuId: ev.skuId, skuNombre: ev.skuNombre, qty: ev.qty,
        cppEnVenta: ev.cppEnVenta || 0,
      }] : []);
  const initialFacturado = ev.precioFacturadoTotal ?? ev.precioTotal ?? 0;

  const [fecha, setFecha] = React.useState(ev.fecha);
  const [lineas, setLineas] = React.useState(initialLineas);
  const [precioFacturado, setPrecioFacturado] = React.useState(String(initialFacturado));
  const [canal, setCanal] = React.useState(ev.canal);
  const [cuentaId, setCuentaId] = React.useState(ev.cuentaId || '');
  const [nota, setNota] = React.useState(ev.nota || '');

  const updateLineaQty = (i, qty) => setLineas((arr) => arr.map((l, j) =>
    j === i ? { ...l, qty: parseFloat(qty) || 0 } : l));

  const baseCostTotal = lineas.reduce((s, l) => s + (l.cppEnVenta || 0) * (l.qty || 0), 0);
  const facturado = parseFloat(precioFacturado) || 0;
  const ratio = baseCostTotal > 0 ? facturado / baseCostTotal : 0;
  const gananciaTotal = facturado - baseCostTotal;
  const margenTotal = facturado > 0 ? (gananciaTotal / facturado) * 100 : 0;

  const disabled = facturado <= 0 || lineas.filter((l) => l.qty > 0).length === 0;

  const save = () => {
    if (disabled) return;
    const cuentaNombre = cuentaId ? window.findBancoNombre(cuentaId) : '';
    // Re-prorratea cada línea con el nuevo facturado
    const reLineas = lineas.filter((l) => l.qty > 0).map((l) => {
      const baseCost = (l.cppEnVenta || 0) * l.qty;
      const precioAsignado = baseCostTotal > 0 ? baseCost * ratio : 0;
      return {
        skuId: l.skuId,
        skuNombre: l.skuNombre,
        qty: l.qty,
        cppEnVenta: l.cppEnVenta || 0,
        baseCost,
        precioAsignado,
        ganancia: precioAsignado - baseCost,
      };
    });
    window.__SESSION_LEDGER__.updateEvent(ev.id, {
      fecha, canal, cuentaId, cuentaNombre, nota,
      lineas: reLineas,
      precioFacturadoTotal: facturado,
      precioTotal: facturado,
      baseCostTotal,
      gananciaTotal,
      margenTotal,
      upliftRatio: ratio,
    });
    onClose();
  };

  return (
    <EditorShell accent={T.hot} onSave={save} onCancel={onClose} disabled={disabled}>
      <div style={{ fontSize: 9, color: T.t3, letterSpacing: '0.14em', marginBottom: 8 }}>
        ▸ EDITAR VENTA · ajusta cantidades y total facturado · SKUs no editables (borra y crea para cambiar)
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8, marginBottom: 10 }}>
        <FormField label="Fecha">
          <TInput type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
        </FormField>
        <FormField label="Canal">
          <TSelect value={canal} onChange={(e) => setCanal(e.target.value)}>
            <option>FB Marketplace</option>
            <option>WhatsApp</option>
            <option>Tienda física</option>
            <option>Otro</option>
          </TSelect>
        </FormField>
        <FormField label="Cuenta destino">
          <TSelect value={cuentaId} onChange={(e) => setCuentaId(e.target.value)}>
            <option value="">— ninguna —</option>
            {(window.bancosOpts ? window.bancosOpts() : []).map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </TSelect>
        </FormField>
      </div>

      {/* Lineas table */}
      <div style={{ background: T.panel, border: `1px solid ${T.bd}`, marginBottom: 10 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '30px 1fr 80px 100px 110px',
          padding: '6px 10px', background: T.panel3, fontSize: 9, color: T.t3, letterSpacing: '0.14em', gap: 8 }}>
          <span>#</span>
          <span>SKU</span>
          <span style={{ textAlign: 'right' }}>CANT.</span>
          <span style={{ textAlign: 'right' }}>CPP × QTY</span>
          <span style={{ textAlign: 'right' }}>PRECIO ASIG.</span>
        </div>
        {lineas.map((l, i) => {
          const baseCost = (l.cppEnVenta || 0) * (l.qty || 0);
          const precioAsignado = baseCostTotal > 0 ? baseCost * ratio : 0;
          return (
            <div key={i} style={{ display: 'grid', gridTemplateColumns: '30px 1fr 80px 100px 110px',
              padding: '5px 10px', alignItems: 'center', gap: 8,
              borderTop: i > 0 ? `1px dashed ${T.t4}` : 'none', fontSize: 10 }}>
              <span style={{ color: T.t3 }}>{String(i + 1).padStart(2, '0')}</span>
              <span style={{ color: T.t }}>{l.skuNombre} <span style={{ color: T.t4 }}>· {l.skuId}</span></span>
              <TInput type="number" min="0" value={l.qty}
                onChange={(e) => updateLineaQty(i, e.target.value)}
                style={{ textAlign: 'right', fontSize: 11 }} />
              <span style={{ color: T.t2, textAlign: 'right' }}>{baseCost > 0 ? fmt(baseCost) : '—'}</span>
              <span style={{ color: precioAsignado > 0 ? T.hot : T.t4, textAlign: 'right', fontWeight: 600 }}>
                {precioAsignado > 0 ? fmt(precioAsignado) : '—'}
              </span>
            </div>
          );
        })}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 8 }}>
        <FormField label="Precio facturado total RD$" hint={baseCostTotal > 0 ? `costo total ${fmt(baseCostTotal)} · margen ${margenTotal.toFixed(1)}%` : ''}>
          <TInput type="number" value={precioFacturado}
            onChange={(e) => setPrecioFacturado(e.target.value)} />
        </FormField>
        <FormField label="Nota">
          <TInput value={nota} onChange={(e) => setNota(e.target.value)} />
        </FormField>
      </div>
      <div style={{ marginTop: 8, fontSize: 10, color: T.t2 }}>
        Nueva ganancia: <span style={{ color: gananciaTotal > 0 ? T.gn : T.re, fontWeight: 600 }}>
          {facturado > 0 ? fmt(gananciaTotal) : '—'}
        </span>
        {' · '}margen: <span style={{ color: margenTotal >= 35 ? T.gn : T.am, fontWeight: 600 }}>
          {facturado > 0 ? margenTotal.toFixed(1) + '%' : '—'}
        </span>
      </div>
    </EditorShell>
  );
}

function AjusteEditor({ ev, onClose }) {
  const T = useTheme();
  const [fecha, setFecha] = React.useState(ev.fecha);
  const [delta, setDelta] = React.useState(String(ev.delta));
  const [razon, setRazon] = React.useState(ev.razon || 'Pérdida');
  const [nota, setNota] = React.useState(ev.nota || '');
  const d = parseFloat(delta) || 0;
  const disabled = d === 0;
  const save = () => {
    if (disabled) return;
    window.__SESSION_LEDGER__.updateEvent(ev.id, { fecha, delta: d, razon, nota });
    onClose();
  };
  return (
    <EditorShell accent={T.bl} onSave={save} onCancel={onClose} disabled={disabled}>
      <div style={{ fontSize: 9, color: T.t3, letterSpacing: '0.14em', marginBottom: 8 }}>
        ▸ EDITAR AJUSTE · {ev.skuNombre}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 8 }}>
        <FormField label="Fecha">
          <TInput type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
        </FormField>
        <FormField label="Ajuste (±)">
          <TInput type="number" value={delta} onChange={(e) => setDelta(e.target.value)} />
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
        <FormField label="Nota">
          <TInput value={nota} onChange={(e) => setNota(e.target.value)} />
        </FormField>
      </div>
    </EditorShell>
  );
}

function CfMovEditor({ ev, onClose }) {
  const T = useTheme();
  const [fecha, setFecha] = React.useState(ev.fecha);
  const [categoria, setCategoria] = React.useState(ev.categoria || 'Otro');
  const [cuentaId, setCuentaId] = React.useState(ev.cuentaId || '');
  const [entrada, setEntrada] = React.useState(String(ev.entrada || 0));
  const [salida, setSalida] = React.useState(String(ev.salida || 0));
  const [nota, setNota] = React.useState(ev.nota || '');
  const en = parseFloat(entrada) || 0;
  const sa = parseFloat(salida) || 0;
  const disabled = (en === 0 && sa === 0) || (en > 0 && sa > 0);

  // Linked CF entries (from FINANC products) are read-only — they regenerate from their source.
  if (ev.linkedMovId || ev.linkedLoteId) {
    return (
      <div style={{
        background: T.panel2, borderBottom: `1px solid ${T.bd}`,
        borderLeft: `2px solid ${T.am}`, padding: '12px 14px', fontSize: 10, color: T.am,
        letterSpacing: '0.06em',
      }}>
        ▸ Este CF se genera automáticamente desde otra fuente
        ({ev.linkedMovId ? 'movimiento de producto' : 'lote'}).
        Edita el movimiento original en su panel — esta entrada se regenera al guardar.
        <button type="button" onClick={onClose} style={{
          marginLeft: 14, background: 'transparent', color: T.t2, border: `1px solid ${T.bd}`,
          padding: '4px 10px', fontFamily: 'inherit', fontSize: 9,
          letterSpacing: '0.14em', cursor: 'pointer',
        }}>CERRAR</button>
      </div>
    );
  }

  const save = () => {
    if (disabled) return;
    const cuentaNombre = cuentaId ? window.findBancoNombre(cuentaId) : ev.cuenta;
    window.__SESSION_LEDGER__.updateEvent(ev.id, {
      fecha, categoria, cuentaId, cuenta: cuentaNombre, entrada: en, salida: sa, nota,
    });
    onClose();
  };

  return (
    <EditorShell accent={T.am} onSave={save} onCancel={onClose} disabled={disabled}>
      <div style={{ fontSize: 9, color: T.t3, letterSpacing: '0.14em', marginBottom: 8 }}>
        ▸ EDITAR AJUSTE MANUAL CF
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8 }}>
        <FormField label="Fecha">
          <TInput type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
        </FormField>
        <FormField label="Categoría">
          <TSelect value={categoria} onChange={(e) => setCategoria(e.target.value)}>
            <option>Otro</option>
            <option>Intereses</option>
            <option>Pago Comision</option>
            <option>Aportes para negocio</option>
            <option>Pago Envio</option>
          </TSelect>
        </FormField>
        <FormField label="Cuenta">
          <TSelect value={cuentaId} onChange={(e) => setCuentaId(e.target.value)}>
            <option value="">— —</option>
            {(window.bancosOpts ? window.bancosOpts() : []).map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </TSelect>
        </FormField>
        <FormField label="Entrada RD$">
          <TInput type="number" value={entrada} onChange={(e) => setEntrada(e.target.value)} />
        </FormField>
        <FormField label="Salida RD$">
          <TInput type="number" value={salida} onChange={(e) => setSalida(e.target.value)} />
        </FormField>
        <FormField label="Nota">
          <TInput value={nota} onChange={(e) => setNota(e.target.value)} />
        </FormField>
      </div>
    </EditorShell>
  );
}

function FormCashFlow() {
  const T = useTheme();
  const [fecha, setFecha]       = React.useState(HOY);
  const [categoria, setCategoria] = React.useState('Otro');
  const [cuentaId, setCuentaId] = React.useState(window.BANCOS_SEED?.[0]?.id || '');
  const [entrada, setEntrada]   = React.useState('');
  const [salida, setSalida]     = React.useState('');
  const [nota, setNota]         = React.useState('');
  const [saved, setSaved] = React.useState(null);

  const e = parseFloat(entrada) || 0;
  const s = parseFloat(salida) || 0;
  const guards = [];
  if (e === 0 && s === 0) guards.push('entrada o salida > 0');
  if (e > 0 && s > 0) guards.push('elige solo entrada O salida');
  if (!cuentaId) guards.push('selecciona cuenta');

  const reset = () => {
    setFecha(HOY); setCategoria('Otro');
    setCuentaId(window.BANCOS_SEED?.[0]?.id || '');
    setEntrada(''); setSalida(''); setNota(''); setSaved(null);
  };
  const [saving, setSaving] = React.useState(false);
  const submit = async () => {
    if (guards.length) return;
    if (saving) return; // §6 #11 idempotencia
    setSaving(true);
    const cuentaNombre = window.findBancoNombre(cuentaId);
    const ev = window.__SESSION_LEDGER__.addEvent({
      tipo: 'cf_mov',
      fecha,
      categoria,
      cuenta: cuentaNombre,
      cuentaId,
      entrada: e,
      salida: s,
      nota,
      src: 'sesión · ajuste manual',
      pending: true,
    });
    setSaved(`▸ Sincronizando · ${ev.id.slice(0, 14)}`);

    // Escribir a Airtable (background)
    if (window.AT_CLIENT?.create && window.AT?.fields?.cashflow) {
      const F = window.AT.fields.cashflow;
      try {
        const res = await window.AT_CLIENT.create('cashflow', {
          [F.fecha]:    fecha,
          [F.cuenta]:   categoria,
          [F.auxiliar]: cuentaNombre + (nota ? ' · ' + nota : ''),
          [F.entrada]:  e,
          [F.salida]:   s,
        });
        window.__SESSION_LEDGER__.updateEvent(ev.id, { pending: false, _airtableId: res.id });
        setSaved(`✓ CF guardado · ${categoria} · ${e > 0 ? '+' + fmt(e) : '-' + fmt(s)}`);
        window.toastOk?.('CF guardado', `${categoria} · ${e > 0 ? '+' + fmt(e) : '-' + fmt(s)}`);
      } catch (err) {
        window.__SESSION_LEDGER__.updateEvent(ev.id, { pending: false, error: err.message });
        setSaved(`✕ CF no sincronizado · ${err.message?.slice(0, 60)}`);
        window.toastErr?.('CF no sincronizado', err.message?.slice(0, 100) || 'error');
      }
    } else {
      setSaved(`✓ Ajuste registrado offline · ${ev.id.slice(0, 14)}`);
    }
    setSaving(false);
    setTimeout(() => { setSaved(null); reset(); }, 3500);
  };

  return (
    <div style={{ background: T.panel, border: `1px solid ${T.bd}`, margin: '0 0 0 14px', padding: '18px 22px' }}>
      <div style={{ background: '#3a2f12', padding: '10px 12px', border: `1px solid ${T.am}`, marginBottom: 16, fontSize: 10, color: T.am, lineHeight: 1.55, letterSpacing: '0.04em' }}>
        ⚠ <strong>AJUSTE MANUAL · SOLO PARA EXCEPCIONES.</strong> Usa este formulario únicamente para movimientos que NO tienen una fuente clásica:
        descuadres, hallazgos en efectivo, comisiones automáticas del banco sin contexto, intereses cobrados sin notificación, etc.
        Para ventas usa NUEVA VENTA; para lotes, cuotas, disposiciones y pagos usa el panel correspondiente.
      </div>
      <div style={{ fontSize: 11, color: T.t, letterSpacing: '0.14em', fontWeight: 600, marginBottom: 16 }}>NUEVO AJUSTE · CF</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 14 }}>
        <FormField label="Fecha">
          <TInput type="date" value={fecha} onChange={(ev) => setFecha(ev.target.value)} />
        </FormField>
        <FormField label="Categoría">
          <TSelect value={categoria} onChange={(ev) => setCategoria(ev.target.value)}>
            <option>Otro</option>
            <option>Intereses</option>
            <option>Pago Comision</option>
            <option>Aportes para negocio</option>
            <option>Pago Envio</option>
          </TSelect>
        </FormField>
        <FormField label="Cuenta afectada" hint="dónde se aplica el movimiento">
          <TSelect value={cuentaId} onChange={(ev) => setCuentaId(ev.target.value)}
            style={{ borderLeft: `2px solid ${T.am}` }}>
            <option value="">— selecciona —</option>
            {(window.bancosOpts ? window.bancosOpts() : []).map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </TSelect>
        </FormField>
        <FormField label="Entrada RD$" hint="dejar 0 si es salida">
          <TInput type="number" value={entrada} placeholder="0"
            onChange={(ev) => setEntrada(ev.target.value)}
            style={{ borderLeft: `2px solid ${T.gn}` }} />
        </FormField>
        <FormField label="Salida RD$" hint="dejar 0 si es entrada">
          <TInput type="number" value={salida} placeholder="0"
            onChange={(ev) => setSalida(ev.target.value)}
            style={{ borderLeft: `2px solid ${T.re}` }} />
        </FormField>
        <FormField label="Nota" hint="justificación del ajuste">
          <TInput value={nota} placeholder="razón del ajuste manual"
            onChange={(ev) => setNota(ev.target.value)} />
        </FormField>
      </div>
      <FormSubmit label="REGISTRAR AJUSTE" color={T.am}
        onSubmit={submit} onClear={reset} confirmation={saved}
        busy={saving}
        disabled={guards.length > 0}
        warning={guards.length > 0 && !saved ? 'falta: ' + guards.join(', ') : null} />
      {false && (
        <div style={{ marginTop: -10, fontSize: 9, color: T.am, letterSpacing: '0.06em' }}>
          ⚠ falta: {guards.join(', ')}
        </div>
      )}
    </div>
  );
}

// ── VentaHeaderEditRow · §8.1 ──────────────────────────────────
// Editor inline para campos de header de una venta histórica (fecha,
// canal, notas). Aplica los cambios a TODOS los records de la venta
// (multi-línea) usando AT_CLIENT.updateVentaHeader. SKUs y cantidades
// NO se editan acá (requeriría re-prorrata) — borrar + recrear es la
// vía para esos cambios.
function VentaHeaderEditRow({ venta, saving, onSave, onCancel }) {
  const T = useTheme();
  const [fecha, setFecha] = React.useState(venta.fecha || '');
  const [canal, setCanal] = React.useState(venta.canal || '');
  const [notas, setNotas] = React.useState(venta.notas || '');

  const changed = fecha !== venta.fecha || canal !== venta.canal || notas !== (venta.notas || '');
  const disabled = saving || !changed;

  return (
    <tr style={{ background: T.panel2, borderBottom: `1px solid ${T.bdHi}`, borderLeft: `2px solid ${T.am}` }}>
      <td colSpan={9} style={{ padding: '10px 14px' }}>
        <div style={{ fontSize: 9, color: T.am, letterSpacing: '0.14em', marginBottom: 8 }}>
          ▸ EDITAR HEADER · {venta.idVenta} · {venta.lineas.length} línea(s) afectadas
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8 }}>
          <div>
            <div style={{ fontSize: 9, color: T.t3, letterSpacing: '0.14em', marginBottom: 4 }}>▸ FECHA</div>
            <input type="date" value={fecha} onChange={(ev) => setFecha(ev.target.value)}
              style={{ width: '100%', background: T.panel2, border: `1px solid ${T.bd}`, color: T.t,
                fontFamily: 'inherit', fontSize: 11, padding: '6px 8px', boxSizing: 'border-box', colorScheme: 'dark' }} />
          </div>
          <div>
            <div style={{ fontSize: 9, color: T.t3, letterSpacing: '0.14em', marginBottom: 4 }}>▸ CANAL</div>
            <select value={canal} onChange={(ev) => setCanal(ev.target.value)}
              style={{ width: '100%', background: T.panel2, border: `1px solid ${T.bd}`, color: T.t,
                fontFamily: 'inherit', fontSize: 11, padding: '6px 8px', boxSizing: 'border-box' }}>
              {['FB Marketplace','WhatsApp','Tienda física','Otro', canal].filter((x, i, a) => x && a.indexOf(x) === i).map((opt) =>
                <option key={opt} value={opt}>{opt}</option>)}
            </select>
          </div>
          <div>
            <div style={{ fontSize: 9, color: T.t3, letterSpacing: '0.14em', marginBottom: 4 }}>▸ NOTA</div>
            <input value={notas} onChange={(ev) => setNotas(ev.target.value)}
              placeholder="(opcional)"
              style={{ width: '100%', background: T.panel2, border: `1px solid ${T.bd}`, color: T.t,
                fontFamily: 'inherit', fontSize: 11, padding: '6px 8px', boxSizing: 'border-box' }} />
          </div>
        </div>
        {!changed && (
          <div style={{ marginTop: 8, fontSize: 9, color: T.t4, fontStyle: 'italic' }}>
            ▸ ningún cambio pendiente
          </div>
        )}
        <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
          <button type="button"
            onClick={() => onSave({ fecha, canal, notas })}
            disabled={disabled}
            style={{ padding: '6px 14px',
              background: disabled ? T.panel3 : T.hot, color: disabled ? T.t3 : T.hotInk,
              border: 'none', fontFamily: 'inherit', fontSize: 10, fontWeight: 700,
              letterSpacing: '0.14em', cursor: disabled ? 'not-allowed' : 'pointer' }}
          >{saving ? '…GUARDANDO' : '▸ GUARDAR'}</button>
          <button type="button" onClick={onCancel}
            style={{ padding: '6px 14px', background: 'transparent', color: T.t2,
              border: `1px solid ${T.bd}`, fontFamily: 'inherit', fontSize: 10,
              letterSpacing: '0.14em', cursor: 'pointer' }}
          >CANCELAR</button>
          <span style={{ fontSize: 9, color: T.t4, letterSpacing: '0.04em', marginLeft: 8, alignSelf: 'center' }}>
            Para cambiar SKUs o cantidades: borra y crea de nuevo.
          </span>
        </div>
      </td>
    </tr>
  );
}

window.PanelRadar = PanelRadar;
window.PanelRegistrar = PanelRegistrar;
