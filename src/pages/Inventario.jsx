// ════════════════════════════════════════════════════════════════
// Inventario — SKUs · Re-Stock · Lotes (+ editar) · Descontinuados.
// + Nuevo SKU (FormSKU) y + Nuevo lote (FormLote).
//
// Reescritura Fase 4. Reproduce la intención del monolito, NO sus bugs.
// Cada escritura usa los writers atómicos de src/lib/db/writers.js y
// dispara data.refreshAll() + toast. Cada borrado pasa por useConfirm.
//
// Bugs arreglados respecto al monolito (ver BUGS_DATOS.md / jamc-reglas):
//  - INV-1: FormLote maneja moneda RD|USD con tasaCambio; el writer convierte
//    costos a RD$ (exige tasa si USD). EditLote edita SIEMPRE en RD$ (los valores
//    existentes ya vienen convertidos del loader; re-convertir corrompería el CPP).
//  - INV-7: status de lote con los 5 valores reales (STATUS_LOTE).
//  - CTA-1 / regla 7: medio de pago real vía MedioPagoSelect (si tarjeta →
//    DRAWDOWN ligado al prestamo_id gemelo). Nunca defaultea a BHD.
//  - FormSKU genera id_sku {CAT}-{MARCA}-{MODELO}-{COLOR} en MAYÚSCULAS y
//    valida que no exista ya en data.skus.
//  - EditLoteModal usa updateLoteHeader/updateEntrada/addEntradaToLote/
//    removeEntrada con (moneda, tasa) correctos.
// ════════════════════════════════════════════════════════════════
import { useState, useMemo, useEffect, Fragment } from 'react';
import { useData } from '../hooks/useData.jsx';
import { useToast } from '../components/Toast.jsx';
import { Modal, useConfirm } from '../components/Modal.jsx';
import { Field, TextInput, NumberInput, MoneyInput, DateInput, TextArea, Select } from '../components/Form.jsx';
import { DataTable } from '../components/Table.jsx';
import { SkuSelect, MedioPagoSelect, ContraparteSelect } from '../components/Pickers.jsx';
import { KPI, Sparkline } from '../components/Charts.jsx';
import {
  createSKU, updateSKU, removeSKU, countSKURefs,
  createLote, updateLoteHeader, updateEntrada, addEntradaToLote, removeEntrada, removeLote,
} from '../lib/db/writers.js';
import { SKU_CATEGORIAS, STATUS_LOTE } from '../lib/supabase.js';
import { money, intNum, num, fmtDate, todayISO } from '../lib/format.js';
import { downloadCSV, csvName } from '../lib/csv.js';

/* ──────────── helpers de presentación ──────────── */
const CAT_CODE = { Mouse: 'MOU', Teclado: 'TEC', Headset: 'HEA', Stand: 'STA', 'Mouse Pad': 'PAD', Otro: 'OTR' };
const STATUS_LABEL = {
  PENDIENTE: 'Pendiente', EN_TRANSITO: 'En tránsito', EN_COURIER_USA: 'En courier USA',
  RECIBIDO: 'Recibido', CANCELADO: 'Cancelado',
};
const statusLote = (s) => STATUS_LABEL[s] || s;
const statusCls = (s) => (s === 'RECIBIDO' ? 'success' : s === 'CANCELADO' ? 'danger' : 'warning');
const estadoCls = (e) => (e === 'critico' ? 'danger' : e === 'atencion' ? 'warning' : e === 'descontinuado' ? 'neutral' : 'success');
const estadoLabel = (e) => (e === 'critico' ? 'crítico' : e === 'atencion' ? 'atención' : e);

// Ranking de severidad para derivar el estado "peor" de un grupo de variantes.
const ESTADO_RANK = { critico: 4, atencion: 3, ok: 1 };
// Comparación natural (numérica-aware) para que T90 y T90 Pro queden juntos.
const naturalCmp = (a, b) => (a || '').localeCompare(b || '', 'es', { numeric: true, sensitivity: 'base' });
// Orden de categorías en la vista jerárquica.
const CAT_ORDER = ['Mouse', 'Teclado', 'Headset', 'Mouse Pad', 'Stand', 'Otro'];
// Si la categoría es "Otro" pero el prefijo del id es conocido, usarlo como categoría visible.
const PREFIX_CAT = { MOU: 'Mouse', TEC: 'Teclado', HEA: 'Headset', STA: 'Stand', PAD: 'Mouse Pad', OTR: 'Otro' };
const catVisible = (s) => {
  if (s.categoria && s.categoria !== 'Otro') return s.categoria;
  const prefix = (s.id || '').split('-')[0];
  return PREFIX_CAT[prefix] || s.categoria || 'Otro';
};

export default function InventarioPage() {
  const data = useData();
  const t = useToast();
  const [confirm, confirmNode] = useConfirm();

  const [tab, setTab] = useState('skus'); // skus | restock | lotes | descontinuados
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all'); // all | critico | atencion | ok
  const [detail, setDetail] = useState(null);   // SKU para ProductDetailModal
  const [editSku, setEditSku] = useState(null);  // SKU para editar
  const [editLote, setEditLote] = useState(null); // lote para EditLoteModal
  const [showFormSku, setShowFormSku] = useState(false);
  const [showFormLote, setShowFormLote] = useState(false);

  const skus = data.skus || [];
  const lotes = data.lotes || [];

  // SKUs activos (sin descontinuados ni placeholder — loader ya excluye LEGACY-SALE)
  const activos = useMemo(() => skus.filter((s) => s.estado !== 'descontinuado'), [skus]);
  const descontinuados = useMemo(() => skus.filter((s) => s.estado === 'descontinuado'), [skus]);

  const valorStock = activos.reduce((s, x) => s + x.stock * x.cpp, 0);
  const totalUds = activos.reduce((s, x) => s + x.stock, 0);

  // Lista filtrada de la sub-tab SKUs
  const skusFiltrados = useMemo(() => {
    let list = filter === 'all' ? activos : activos.filter((s) => s.estado === filter);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((s) =>
        (s.id || '').toLowerCase().includes(q) ||
        (s.nombre || '').toLowerCase().includes(q) ||
        (s.marca || '').toLowerCase().includes(q) ||
        (s.categoria || '').toLowerCase().includes(q));
    }
    return [...list].sort((a, b) => (a.categoria + a.nombre).localeCompare(b.categoria + b.nombre, 'es', { numeric: true }));
  }, [activos, filter, search]);

  /* ──────────── acciones ──────────── */
  async function doReactivar(s) {
    try {
      await updateSKU(s.id, { activa: true });
      await data.refreshAll();
      t.ok('SKU reactivado', `${s.nombre} vuelve a inventario activo`);
    } catch (e) { t.err('No se pudo reactivar', e.message); }
  }

  async function doBorrarSku(s) {
    let refs = { ventas: 0, entradas: 0 };
    try { refs = await countSKURefs(s.id); } catch { /* best effort */ }
    const tieneRefs = refs.ventas > 0 || refs.entradas > 0;
    const ok = await confirm({
      title: `¿Eliminar SKU ${s.id}?`,
      body: tieneRefs
        ? `${s.nombre}. ATENCIÓN: tiene ${refs.ventas} venta(s) y ${refs.entradas} entrada(s) históricas. Borrarlo puede fallar por FK. Mejor descontinúalo (Estado = Descontinuado) en lugar de borrar.`
        : `${s.nombre}. Stock actual: ${s.stock} ud. Sin historial — borrado seguro.`,
      confirmLabel: 'Eliminar',
    });
    if (!ok) return;
    try {
      await removeSKU(s.id);
      await data.refreshAll();
      t.ok('SKU eliminado', `${s.id} · ${s.nombre}`);
    } catch (e) { t.err('No se pudo eliminar', e.message); }
  }

  async function doBorrarLote(l) {
    const ok = await confirm({
      title: `¿Eliminar lote ${l.codigo}?`,
      body: `${l.entradas.length} entrada(s) · ${l.proveedor || 'sin proveedor'} · ${fmtDate(l.fecha)}. Borra entradas, header y la caja satélite (compra/envío/aduana) en cascada. No reversible.`,
      confirmLabel: 'Eliminar',
    });
    if (!ok) return;
    try {
      await removeLote(l.loteId);
      await data.refreshAll();
      t.ok('Lote eliminado', l.codigo);
    } catch (e) { t.err('No se pudo eliminar', e.message); }
  }

  if (data.loading) {
    return (
      <div>
        <div className="topbar"><div><h1>Inventario</h1><div className="sub">SKUs, lotes y reposición</div></div></div>
        <div className="empty"><span className="loader" /> Cargando inventario…</div>
      </div>
    );
  }

  return (
    <div>
      <div className="topbar">
        <div>
          <h1>Inventario</h1>
          <div className="sub">
            {activos.length} SKUs · {intNum(totalUds)} ud · {money(valorStock)} en stock · {lotes.length} lotes
          </div>
        </div>
        <div className="topbar-actions">
          {(tab === 'skus' || tab === 'restock' || tab === 'descontinuados') && (
            <button className="btn" onClick={() => setShowFormSku(true)}>+ Nuevo SKU</button>
          )}
          {(tab === 'lotes' || tab === 'skus' || tab === 'restock') && (
            <button className="btn ghost" onClick={() => setShowFormLote(true)}>+ Nuevo lote</button>
          )}
        </div>
      </div>

      <div className="tabs">
        <button className={tab === 'skus' ? 'tab active' : 'tab'} onClick={() => setTab('skus')}>SKUs ({activos.length})</button>
        <button className={tab === 'restock' ? 'tab active' : 'tab'} onClick={() => setTab('restock')}>Re-Stock</button>
        <button className={tab === 'lotes' ? 'tab active' : 'tab'} onClick={() => setTab('lotes')}>Lotes ({lotes.length})</button>
        {descontinuados.length > 0 && (
          <button className={tab === 'descontinuados' ? 'tab active' : 'tab'} onClick={() => setTab('descontinuados')}>
            Descontinuados ({descontinuados.length})
          </button>
        )}
      </div>

      {tab === 'skus' && (
        <SkusTab
          rows={skusFiltrados} search={search} setSearch={setSearch} filter={filter} setFilter={setFilter}
          onRow={(s) => setDetail(s)} onEdit={(s) => setEditSku(s)} onDel={doBorrarSku}
        />
      )}
      {tab === 'restock' && <RestockTab skus={activos} />}
      {tab === 'lotes' && <LotesTab lotes={lotes} onRow={(l) => setEditLote(l)} onDel={doBorrarLote} />}
      {tab === 'descontinuados' && (
        <DescontinuadosTab rows={descontinuados} onReactivar={doReactivar} onEdit={(s) => setEditSku(s)} onDel={doBorrarSku} />
      )}

      {/* Modales / forms */}
      {detail && <ProductDetailModal sku={detail} data={data} onClose={() => setDetail(null)}
        onEdit={() => { setEditSku(detail); setDetail(null); }} />}
      {editSku && <EditSkuModal sku={editSku} onClose={() => setEditSku(null)}
        onSaved={async () => { await data.refreshAll(); setEditSku(null); }} />}
      {editLote && <EditLoteModal lote={editLote} onClose={() => setEditLote(null)} />}
      {showFormSku && <Modal title="Nuevo SKU" width={720} onClose={() => setShowFormSku(false)}>
        <FormSKU onClose={() => setShowFormSku(false)} />
      </Modal>}
      {showFormLote && <Modal title="Nuevo lote" width={920} onClose={() => setShowFormLote(false)}>
        <FormLote onClose={() => setShowFormLote(false)} />
      </Modal>}

      {confirmNode}
    </div>
  );
}

/* ════════════════════════ Sub-tab: SKUs ════════════════════════ */
// Vista jerárquica de 3 niveles (recuperada del monolito):
//   N1 categoría    → fila-cabecera con subtotales (modelos · SKUs · ud · stock RD$)
//   N2 marca+modelo → 1 sola variante = SKU directo; >1 = fila colapsable con agregados
//   N3 variantes    → al expandir, cada color como sub-row indentada
// DataTable no soporta filas-cabecera ni hijas colapsables, así que renderizamos
// una <table className="data"> custom. Misma firma de props que la tabla plana.
function SkusTab({ rows, search, setSearch, filter, setFilter, onRow, onEdit, onDel }) {
  const t = useToast();
  const [expanded, setExpanded] = useState({}); // key 'cat|marca|modelo' → bool

  const exportarCSV = () => {
    const headers = ['SKU', 'Nombre', 'Categoría', 'Marca', 'Stock', 'En tránsito', 'CPP', 'Precio sugerido', 'Precio 40%', 'Estado'];
    const csvRows = rows.map((s) => [s.id, s.nombre, s.categoria, s.marca, s.stock, s.enTransito, s.cpp, s.precioSugerido, s.cpp > 0 ? Math.round((s.cpp / 0.6) * 100) / 100 : '', s.estado]);
    const n = downloadCSV(csvName('inventario'), headers, csvRows);
    t.ok('Inventario exportado', `${n} SKU(s) · CSV`);
  };

  // Estado "peor" entre las variantes de un modelo (el del SKU más crítico).
  const estadoPeor = (items) => items.reduce(
    (peor, s) => ((ESTADO_RANK[s.estado] || 0) > (ESTADO_RANK[peor] || 0) ? s.estado : peor),
    'ok',
  );

  // 1) Agrupar por categoría visible. 2) Dentro de cada categoría, agrupar por
  // marca+modelo. 3) Ordenar todo natural-aware (marca → modelo → color).
  const cats = useMemo(() => {
    const byCat = {};
    rows.forEach((s) => { (byCat[catVisible(s)] ||= []).push(s); });

    const catKeys = Object.keys(byCat).sort((a, b) => {
      const ia = CAT_ORDER.indexOf(a), ib = CAT_ORDER.indexOf(b);
      if (ia === -1 && ib === -1) return a.localeCompare(b, 'es');
      if (ia === -1) return 1;
      if (ib === -1) return -1;
      return ia - ib;
    });

    return catKeys.map((cat) => {
      const items = byCat[cat];
      const byModel = {};
      items.forEach((s) => {
        const modelo = s.modelo || s.nombre || '';
        const key = `${s.marca || '—'}|${modelo}`;
        (byModel[key] ||= { marca: s.marca || '—', modelo, items: [] }).items.push(s);
      });
      const modelos = Object.values(byModel)
        .map((g) => ({ ...g, items: [...g.items].sort((a, b) => naturalCmp(a.color, b.color)) }))
        .sort((a, b) => naturalCmp(a.marca, b.marca) || naturalCmp(a.modelo, b.modelo));
      return {
        cat,
        modelos,
        nSkus: items.length,
        totalStock: items.reduce((sum, x) => sum + (x.stock || 0), 0),
        valorStock: items.reduce((sum, x) => sum + (x.stock || 0) * (x.cpp || 0), 0),
      };
    });
  }, [rows]);

  // Precio al que hay que vender para mantener 40% de margen SOBRE LA VENTA
  // (igual que mide la app el margen: ganancia/precio). 40% margen → precio =
  // cpp / (1 − 0.40) = cpp / 0.60.
  const MARGEN_OBJ = 0.40;
  const precio40 = (cpp) => (cpp > 0 ? cpp / (1 - MARGEN_OBJ) : 0);

  // Sub-row (variante de color o SKU único): celdas de datos + acciones.
  const skuCells = (s, { indent = false } = {}) => {
    return (
      <>
        <td className={`num right ${s.stock <= 0 ? 'neg' : ''}`}>{s.stock}</td>
        <td className="num right" style={{ color: s.enTransito > 0 ? 'var(--warning)' : 'var(--text-3)' }}>{s.enTransito > 0 ? s.enTransito : '—'}</td>
        <td className="num right">{money(s.cpp)}</td>
        <td className="num right" style={{ color: s.cpp > 0 ? 'var(--success)' : 'var(--text-3)' }}>{s.cpp > 0 ? money(precio40(s.cpp)) : '—'}</td>
        <td>
          <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
            <span className={`badge ${estadoCls(s.estado)}`} style={indent ? { fontSize: 9 } : undefined}>{estadoLabel(s.estado)}</span>
            <button className="icon-btn" title="Editar" style={{ padding: '2px 6px' }} onClick={(e) => { e.stopPropagation(); onEdit(s); }}>✎</button>
            <button className="icon-btn danger" title="Eliminar" style={{ padding: '2px 6px' }} onClick={(e) => { e.stopPropagation(); onDel(s); }}>×</button>
          </div>
        </td>
      </>
    );
  };

  return (
    <div className="section">
      <div className="section-head">
        <div className="section-title">Catálogo activo</div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
          <input className="input" style={{ width: 180 }} type="text" placeholder="Buscar nombre, SKU, marca…"
            value={search} onChange={(e) => setSearch(e.target.value)} />
          {['all', 'critico', 'atencion', 'ok'].map((f) => (
            <button key={f} className="pill"
              style={{ background: filter === f ? 'var(--surface-3)' : 'var(--surface)', color: filter === f ? 'var(--text)' : 'var(--text-2)' }}
              onClick={() => setFilter(f)}>
              {f === 'all' ? 'Todos' : estadoLabel(f)}
            </button>
          ))}
          <button className="btn ghost" onClick={exportarCSV} disabled={!rows.length} title="Descargar CSV">⤓ CSV</button>
        </div>
      </div>

      {!rows.length ? (
        <div className="empty">Sin SKUs en este filtro</div>
      ) : (
        <table className="data">
          <thead>
            <tr>
              <th></th>
              <th>Marca · Modelo</th>
              <th className="num right">Stock</th>
              <th className="num right">En camino</th>
              <th className="num right">CPP</th>
              <th className="num right">Precio 40%</th>
              <th>Estado</th>
            </tr>
          </thead>
          <tbody>
            {cats.map(({ cat, modelos, nSkus, totalStock, valorStock }) => (
              <Fragment key={cat}>
                {/* ── NIVEL 1: cabecera de categoría con subtotales ── */}
                <tr style={{ background: 'var(--surface-2)' }}>
                  <td colSpan="7" style={{ padding: '10px 12px', fontWeight: 600, fontSize: 12, color: 'var(--text)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    {cat}
                    <span style={{ marginLeft: 8, fontWeight: 400, color: 'var(--text-3)', fontSize: 11, textTransform: 'none', letterSpacing: 0 }}>
                      {modelos.length} modelo{modelos.length !== 1 ? 's' : ''} · {nSkus} SKU{nSkus !== 1 ? 's' : ''} · {intNum(totalStock)} ud · {money(valorStock)} en stock
                    </span>
                  </td>
                </tr>

                {modelos.map((g) => {
                  // ── NIVEL 2: marca+modelo con 1 sola variante → SKU directo ──
                  if (g.items.length === 1) {
                    const s = g.items[0];
                    return (
                      <tr key={`${cat}|${g.marca}|${g.modelo}`} style={{ cursor: 'pointer' }} onClick={() => onRow(s)}>
                        <td></td>
                        <td>
                          <div style={{ fontWeight: 500 }}>{g.marca} {g.modelo}</div>
                          <div style={{ fontSize: 11, color: 'var(--text-3)', fontFamily: 'var(--font-mono)', marginTop: 2 }}>{s.id}</div>
                        </td>
                        {skuCells(s)}
                      </tr>
                    );
                  }

                  // ── NIVEL 2: marca+modelo con >1 variante → fila colapsable ──
                  const key = `${cat}|${g.marca}|${g.modelo}`;
                  const isOpen = !!expanded[key];
                  const totStock = g.items.reduce((s, x) => s + (x.stock || 0), 0);
                  const totEC = g.items.reduce((s, x) => s + (x.enTransito || 0), 0);
                  const cppProm = g.items.reduce((s, x) => s + (x.cpp || 0), 0) / g.items.length;
                  const est = estadoPeor(g.items);
                  return (
                    <Fragment key={key}>
                      <tr style={{ cursor: 'pointer' }} onClick={() => setExpanded((m) => ({ ...m, [key]: !m[key] }))}>
                        <td style={{ textAlign: 'center', color: 'var(--text-3)', fontSize: 11 }}>{isOpen ? '▼' : '▶'}</td>
                        <td>
                          <div style={{ fontWeight: 500 }}>{g.marca} {g.modelo}</div>
                          {!isOpen && (
                            <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2 }}>
                              {g.items.length} variantes · {g.items.map((s) => s.color).filter(Boolean).join(' · ') || g.items.map((s) => s.id).join(' · ')}
                            </div>
                          )}
                        </td>
                        <td className={`num right ${totStock === 0 ? 'neg' : ''}`}>{totStock}</td>
                        <td className="num right" style={{ color: totEC > 0 ? 'var(--warning)' : 'var(--text-3)' }}>{totEC > 0 ? totEC : '—'}</td>
                        <td className="num right">{money(cppProm)}</td>
                        <td className="num right" style={{ color: cppProm > 0 ? 'var(--success)' : 'var(--text-3)' }}>{cppProm > 0 ? money(precio40(cppProm)) : '—'}</td>
                        <td><span className={`badge ${estadoCls(est)}`}>{estadoLabel(est)}</span></td>
                      </tr>

                      {/* ── NIVEL 3: variantes de color (al expandir) ── */}
                      {isOpen && g.items.map((s) => (
                        <tr key={s.id} style={{ background: 'var(--surface)', cursor: 'pointer' }} onClick={() => onRow(s)}>
                          <td></td>
                          <td style={{ paddingLeft: 24 }}>
                            <div style={{ fontSize: 12 }}>↳ <strong>{s.color || s.id}</strong></div>
                            <div style={{ fontSize: 10, color: 'var(--text-3)', fontFamily: 'var(--font-mono)', marginTop: 2 }}>{s.id}</div>
                          </td>
                          {skuCells(s, { indent: true })}
                        </tr>
                      ))}
                    </Fragment>
                  );
                })}
              </Fragment>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

/* ════════════════════════ Sub-tab: Re-Stock ════════════════════════ */
// El sistema calcula CUÁNTO pedir según la VELOCIDAD DE VENTAS de cada SKU
// (igual que la web anterior): velocidad = unidades vendidas ÷ días desde la
// primera venta del SKU. Para cubrir (lead time + buffer) días al ritmo actual:
//   necesidad = round(velocidad × (leadTime + buffer))
//   a pedir   = max(0, necesidad − (stock + en camino))
// Un SKU que no se vende (velocidad 0) NO se sugiere pedir aunque tenga poco
// stock; uno que se vende rápido se sugiere aunque parezca "ok". El pedido real
// se hace creando un lote.
function RestockTab({ skus }) {
  const { ventas } = useData();
  const [leadTime, setLeadTime] = useState(() => Number(localStorage.getItem('restock-lead')) || 52);
  const [buffer, setBuffer] = useState(() => { const v = localStorage.getItem('restock-buffer'); return v != null ? Number(v) : 30; });
  useEffect(() => { if (Number(leadTime) > 0) localStorage.setItem('restock-lead', String(leadTime)); }, [leadTime]);
  useEffect(() => { localStorage.setItem('restock-buffer', String(buffer)); }, [buffer]);

  // Ventas por SKU en los últimos 6 meses (para el sparkline de tendencia).
  const ventas6m = useMemo(() => {
    const now = new Date();
    const months = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
    }
    const map = {};
    (ventas || []).forEach((v) => {
      const ym = (v.fecha || '').slice(0, 7);
      if (!months.includes(ym)) return;
      (v.lineas || []).forEach((l) => {
        (map[l.skuId] ||= {})[ym] = ((map[l.skuId] || {})[ym] || 0) + l.cantidad;
      });
    });
    return { months, map };
  }, [ventas]);
  const sparkFor = (skuId) => ventas6m.months.map((ym) => ventas6m.map[skuId]?.[ym] || 0);

  // Primera venta por SKU + global (para días activos → velocidad).
  const primeras = useMemo(() => {
    let globalMin = null;
    const bySku = {};
    (ventas || []).forEach((v) => {
      const f = v.fecha; if (!f) return;
      if (!globalMin || f < globalMin) globalMin = f;
      (v.lineas || []).forEach((l) => { if (!bySku[l.skuId] || f < bySku[l.skuId]) bySku[l.skuId] = f; });
    });
    return { globalMin, bySku };
  }, [ventas]);

  const items = useMemo(() => {
    const hoy = new Date();
    const diasObjetivo = (Number(leadTime) || 0) + (Number(buffer) || 0);
    const diasDesde = (fStr) => { if (!fStr) return 1; const d = new Date(fStr + 'T00:00:00'); return Math.max(1, Math.round((hoy - d) / 86400000)); };
    return skus
      .filter((s) => s.id !== 'LEGACY-SALE' && s.activa !== false && s.estado !== 'descontinuado')
      .map((s) => {
        const primera = primeras.bySku[s.id] || primeras.globalMin;
        const diasActivo = diasDesde(primera);
        const velocidad = s.vendidas > 0 ? s.vendidas / diasActivo : 0;       // uds/día
        const vtasMes = velocidad > 0 ? +(velocidad * 30).toFixed(1) : 0;
        const diasStock = velocidad > 0 && s.stock > 0 ? Math.round(s.stock / velocidad) : null;
        const necesidad = Math.round(velocidad * diasObjetivo);
        const cubierto = s.stock + s.enTransito;
        const aPedir = Math.max(0, necesidad - cubierto);
        return { ...s, velocidad, vtasMes, diasStock, necesidad, aPedir, costoEst: aPedir * s.cpp };
      })
      .filter((s) => s.aPedir > 0)   // solo lo que de verdad hay que pedir (velocidad-driven)
      .sort((a, b) => {
        // más urgente primero: menos días de stock; los sin velocidad al final.
        const da = a.diasStock == null ? Infinity : a.diasStock;
        const db = b.diasStock == null ? Infinity : b.diasStock;
        return da - db || b.aPedir - a.aPedir;
      });
  }, [skus, primeras, leadTime, buffer]);

  const criticos = items.filter((s) => s.estado === 'critico').length;
  const costoTotal = items.reduce((s, x) => s + x.costoEst, 0);
  const udsTotal = items.reduce((s, x) => s + x.aPedir, 0);

  const columns = [
    {
      key: 'nombre', label: 'Producto', render: (s) => (
        <div>
          <div style={{ fontWeight: 500 }}>{s.nombre}</div>
          <div style={{ fontSize: 11, color: 'var(--text-3)', fontFamily: 'var(--font-mono)' }}>{s.id}</div>
        </div>
      ),
    },
    { key: 'estado', label: 'Estado', render: (s) => <span className={`badge ${estadoCls(s.estado)}`}>{estadoLabel(s.estado)}</span> },
    { key: 'stock', label: 'Stock', align: 'right', num: true, render: (s) => <span className={s.stock <= 0 ? 'neg' : ''}>{s.stock}</span> },
    { key: 'enTransito', label: 'En camino', align: 'right', num: true, render: (s) => (s.enTransito > 0 ? s.enTransito : '—') },
    { key: 'vtasMes', label: 'Ventas/mes', align: 'right', num: true, render: (s) => (s.vtasMes > 0 ? s.vtasMes.toFixed(1) : '—') },
    { key: 'diasStock', label: 'Días stock', align: 'right', num: true, render: (s) => (s.diasStock != null ? <span className={s.diasStock < leadTime ? 'neg' : ''}>{s.diasStock}d</span> : <span className="muted">—</span>) },
    {
      key: 'spark', label: 'Ventas 6m',
      render: (s) => { const vals = sparkFor(s.id); return vals.some((v) => v > 0) ? <Sparkline values={vals} w={90} h={24} /> : <span className="muted">—</span>; },
    },
    { key: 'aPedir', label: 'A pedir', align: 'right', num: true, render: (s) => <span className="pos" style={{ fontWeight: 600 }}>{s.aPedir}</span> },
    { key: 'cpp', label: 'CPP', align: 'right', num: true, render: (s) => money(s.cpp) },
    { key: 'costoEst', label: 'Costo est.', align: 'right', num: true, render: (s) => (s.costoEst > 0 ? money(s.costoEst) : '—') },
  ];

  return (
    <>
      <div style={{ padding: 'var(--s-3)', background: 'var(--surface-2)', borderRadius: 4, marginBottom: 'var(--s-4)' }}>
        <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start', flexWrap: 'wrap' }}>
          <Field label="Lead time (días)" hint="Cuánto tarda en llegar un pedido" style={{ width: 180 }}>
            <NumberInput value={leadTime} onChange={setLeadTime} min="1" />
          </Field>
          <Field label="Buffer seguridad (días)" hint="Stock extra para imprevistos" style={{ width: 180 }}>
            <NumberInput value={buffer} onChange={setBuffer} min="0" />
          </Field>
        </div>
        <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 'var(--s-2)', lineHeight: 1.5 }}>
          <strong>"A pedir"</strong> = velocidad de venta × {(Number(leadTime) || 0) + (Number(buffer) || 0)} días − (stock + en camino).
          El sistema usa el ritmo de ventas de cada SKU; el pedido real se hace creando un lote.
        </div>
      </div>

      <div className="kpi-row">
        <KPI label="SKUs a pedir" value={intNum(items.length)} deltaLabel={`para cubrir ${leadTime}+${buffer}d`} />
        <KPI label="Críticos a pedir" value={intNum(criticos)} deltaLabel="stock crítico" />
        <KPI label="Costo estimado" currency value={intNum(costoTotal)} deltaLabel="a CPP actual" />
        <KPI label="Unidades a pedir" value={intNum(udsTotal)} deltaLabel="total sugerido" />
      </div>

      <div className="section">
        <div className="section-head">
          <div>
            <div className="section-title">SKUs que necesitan reorden</div>
            <div className="section-desc">{items.length} con pedido sugerido por velocidad · ordenados por urgencia (menos días de stock primero)</div>
          </div>
        </div>
        <DataTable columns={columns} rows={items} getRowKey={(s) => s.id}
          empty="Ningún SKU necesita reorden al ritmo de ventas actual." />
      </div>
    </>
  );
}

/* ════════════════════════ Sub-tab: Lotes ════════════════════════ */
function LotesTab({ lotes, onRow, onDel }) {
  const [search, setSearch] = useState('');
  const [fStatus, setFStatus] = useState('all');

  const filtered = useMemo(() => {
    let list = fStatus === 'all' ? lotes : lotes.filter((l) => l.status === fStatus);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((l) =>
        (l.codigo || '').toLowerCase().includes(q) ||
        (l.proveedor || '').toLowerCase().includes(q) ||
        l.entradas.some((e) => (e.skuId || '').toLowerCase().includes(q)));
    }
    return list;
  }, [lotes, fStatus, search]);

  const columns = [
    { key: 'codigo', label: 'Lote', render: (l) => <span className="num" style={{ fontSize: 11 }}>{l.codigo}</span> },
    { key: 'fecha', label: 'Fecha', render: (l) => fmtDate(l.fecha) },
    { key: 'status', label: 'Status', render: (l) => <span className={`badge ${statusCls(l.status)}`}>{statusLote(l.status)}</span> },
    { key: 'proveedor', label: 'Proveedor', render: (l) => <span className="muted">{l.proveedor || '—'}</span> },
    { key: 'moneda', label: 'Moneda', render: (l) => l.moneda },
    { key: 'nEnt', label: 'Entradas', align: 'right', num: true, render: (l) => l.entradas.length },
    { key: 'envio', label: 'Envío', align: 'right', num: true, render: (l) => (l.envio > 0 ? money(l.envio) : '—') },
    { key: 'courier', label: 'Courier', align: 'right', num: true, render: (l) => (l.courier > 0 ? money(l.courier) : '—') },
    {
      key: 'acc', label: '', render: (l) => (
        <div style={{ display: 'inline-flex', gap: 4 }}>
          <button className="icon-btn" title="Editar" onClick={(e) => { e.stopPropagation(); onRow(l); }}>✎</button>
          <button className="icon-btn danger" title="Eliminar" onClick={(e) => { e.stopPropagation(); onDel(l); }}>×</button>
        </div>
      ),
    },
  ];

  return (
    <div className="section">
      <div className="section-head">
        <div className="section-title">Lotes de compra</div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
          <input className="input" style={{ width: 180 }} type="text" placeholder="Buscar lote, proveedor, SKU…"
            value={search} onChange={(e) => setSearch(e.target.value)} />
          <button className="pill" style={{ background: fStatus === 'all' ? 'var(--surface-3)' : 'var(--surface)' }} onClick={() => setFStatus('all')}>Todos</button>
          {STATUS_LOTE.map((s) => (
            <button key={s} className="pill" style={{ background: fStatus === s ? 'var(--surface-3)' : 'var(--surface)' }} onClick={() => setFStatus(s)}>
              {statusLote(s)}
            </button>
          ))}
        </div>
      </div>
      <DataTable columns={columns} rows={filtered} onRowClick={onRow} getRowKey={(l) => l.key}
        empty="Sin lotes en este filtro" />
    </div>
  );
}

/* ════════════════════════ Sub-tab: Descontinuados ════════════════════════ */
function DescontinuadosTab({ rows, onReactivar, onEdit, onDel }) {
  const columns = [
    { key: 'nombre', label: 'Producto', render: (s) => <span style={{ fontWeight: 500 }}>{s.nombre}</span> },
    { key: 'id', label: 'SKU', render: (s) => <span className="muted" style={{ fontFamily: 'var(--font-mono)', fontSize: 11 }}>{s.id}</span> },
    { key: 'stock', label: 'Stock', align: 'right', num: true },
    { key: 'precioSugerido', label: 'Precio', align: 'right', num: true, render: (s) => (s.precioSugerido > 0 ? money(s.precioSugerido) : '—') },
    {
      key: 'acc', label: '', render: (s) => (
        <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end', alignItems: 'center' }}>
          <button className="btn ghost" style={{ padding: '2px 10px', fontSize: 11 }} onClick={() => onReactivar(s)}>↑ Reactivar</button>
          <button className="icon-btn" title="Editar" style={{ padding: '2px 6px' }} onClick={() => onEdit(s)}>✎</button>
          <button className="icon-btn danger" title="Eliminar" style={{ padding: '2px 6px' }} onClick={() => onDel(s)}>×</button>
        </div>
      ),
    },
  ];
  return (
    <div className="section">
      <div style={{ fontSize: 12, color: 'var(--text-2)', marginBottom: 'var(--s-3)' }}>
        Productos que ya no vendés. No aparecen en alertas ni en la lista activa, pero conservás su historial. Reactivá cualquiera cuando quieras.
      </div>
      <DataTable columns={columns} rows={[...rows].sort((a, b) => (a.nombre || '').localeCompare(b.nombre || ''))}
        getRowKey={(s) => s.id} empty="No hay SKUs descontinuados" />
    </div>
  );
}

/* ════════════════════════ ProductDetailModal ════════════════════════ */
// Detalle de un SKU: stats (stock, CPP, valor, ganancia) + historial de
// entradas (de lotes) y ventas que lo referencian.
function ProductDetailModal({ sku, data, onClose, onEdit }) {
  const entradas = useMemo(() => {
    const out = [];
    (data.lotes || []).forEach((l) => {
      l.entradas.filter((e) => e.skuId === sku.id).forEach((e) => {
        out.push({ ...e, loteCodigo: l.codigo, fecha: l.fecha, loteStatus: l.status });
      });
    });
    return out.sort((a, b) => (a.fecha < b.fecha ? 1 : -1));
  }, [data.lotes, sku.id]);

  const ventas = useMemo(() => {
    const out = [];
    (data.ventas || []).forEach((v) => {
      v.lineas.filter((ln) => ln.skuId === sku.id).forEach((ln) => {
        out.push({ codigo: v.codigo, fecha: v.fecha, cantidad: ln.cantidad, precio: ln.precio, ganancia: ln.gananciaTotal });
      });
    });
    return out.sort((a, b) => (a.fecha < b.fecha ? 1 : -1));
  }, [data.ventas, sku.id]);

  const margen = sku.precioSugerido > 0 ? Math.round(((sku.precioSugerido - sku.cpp) / sku.precioSugerido) * 100) : 0;

  return (
    <Modal title={sku.nombre} width={820} onClose={onClose}>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 'var(--s-3)' }}>
        <span className="num" style={{ fontSize: 12, color: 'var(--text-3)' }}>{sku.id}</span>
        <span className={`badge ${estadoCls(sku.estado)}`}>{estadoLabel(sku.estado)}</span>
        <span className="badge neutral">{sku.categoria}</span>
        <button className="btn ghost" style={{ marginLeft: 'auto' }} onClick={onEdit}>✎ Editar</button>
      </div>

      <div className="grid-3" style={{ marginBottom: 'var(--s-4)' }}>
        <div className="stat-card"><div className="stat-label">Stock actual</div><div className="stat-value">{intNum(sku.stock)} ud</div></div>
        <div className="stat-card"><div className="stat-label">En camino</div><div className="stat-value" style={{ color: sku.enTransito > 0 ? 'var(--warning)' : undefined }}>{intNum(sku.enTransito)} ud</div></div>
        <div className="stat-card"><div className="stat-label">CPP actual</div><div className="stat-value">{money(sku.cpp)}</div></div>
        <div className="stat-card"><div className="stat-label">Precio sugerido</div><div className="stat-value">{sku.precioSugerido > 0 ? money(sku.precioSugerido) : '—'}</div></div>
        <div className="stat-card"><div className="stat-label">Precio 40%</div><div className="stat-value" style={{ color: sku.cpp > 0 ? 'var(--success)' : undefined }}>{sku.cpp > 0 ? money(sku.cpp / 0.6) : '—'}</div></div>
        <div className="stat-card"><div className="stat-label">Margen actual</div><div className="stat-value" style={{ color: sku.precioSugerido > 0 ? (margen >= 40 ? 'var(--success)' : 'var(--warning)') : undefined }}>{sku.precioSugerido > 0 ? margen + '%' : '—'}</div></div>
        <div className="stat-card"><div className="stat-label">Valor en stock</div><div className="stat-value">{money(sku.stock * sku.cpp)}</div></div>
        <div className="stat-card"><div className="stat-label">Vendidas</div><div className="stat-value">{intNum(sku.vendidas)} ud</div></div>
        <div className="stat-card"><div className="stat-label">Ingresos</div><div className="stat-value">{money(sku.ingresos)}</div></div>
        <div className="stat-card"><div className="stat-label">Ganancia</div><div className="stat-value" style={{ color: 'var(--success)' }}>{money(sku.ganancia)}</div></div>
      </div>

      {sku.notas && <div style={{ fontSize: 12, color: 'var(--text-2)', marginBottom: 'var(--s-3)' }}>Notas: {sku.notas}</div>}

      <div className="section-title" style={{ marginBottom: 6 }}>Entradas (lotes) · {entradas.length}</div>
      <DataTable
        columns={[
          { key: 'fecha', label: 'Fecha', render: (e) => fmtDate(e.fecha) },
          { key: 'loteCodigo', label: 'Lote', render: (e) => <span className="num" style={{ fontSize: 11 }}>{e.loteCodigo}</span> },
          { key: 'status', label: 'Status', render: (e) => <span className={`badge ${e.status === 'RECIBIDO' ? 'success' : 'warning'}`}>{e.status}</span> },
          { key: 'cantidad', label: 'Cant.', align: 'right', num: true },
          { key: 'costoBase', label: 'Costo base', align: 'right', num: true, render: (e) => money(e.costoBase) },
          { key: 'costoTotal', label: 'Costo landed', align: 'right', num: true, render: (e) => money(e.costoTotal) },
        ]}
        rows={entradas} getRowKey={(e) => e.id} empty="Sin entradas registradas para este SKU" />

      <div className="section-title" style={{ margin: '16px 0 6px' }}>Ventas · {ventas.length}</div>
      <DataTable
        columns={[
          { key: 'fecha', label: 'Fecha', render: (v) => fmtDate(v.fecha) },
          { key: 'codigo', label: 'Venta', render: (v) => <span className="num" style={{ fontSize: 11 }}>{v.codigo}</span> },
          { key: 'cantidad', label: 'Cant.', align: 'right', num: true },
          { key: 'precio', label: 'Precio/ud', align: 'right', num: true, render: (v) => money(v.precio) },
          { key: 'ganancia', label: 'Ganancia', align: 'right', num: true, render: (v) => <span className="pos">{money(v.ganancia)}</span> },
        ]}
        rows={ventas} getRowKey={(v, i) => v.codigo + i} empty="Sin ventas para este SKU" />

      <div className="modal-actions"><button className="btn ghost" onClick={onClose}>Cerrar</button></div>
    </Modal>
  );
}

/* ════════════════════════ EditSkuModal ════════════════════════ */
function EditSkuModal({ sku, onClose, onSaved }) {
  const t = useToast();
  const [f, setF] = useState({
    nombre: sku.nombre, marca: sku.marca === '—' ? '' : sku.marca, modelo: sku.modelo, color: sku.color,
    categoria: sku.categoria, precioSugerido: sku.precioSugerido || '', notas: sku.notas || '',
    activa: sku.activa,
  });
  const [busy, setBusy] = useState(false);
  const set = (k) => (v) => setF((p) => ({ ...p, [k]: v }));

  async function save() {
    if (!f.nombre.trim()) { t.err('Falta el nombre', 'El SKU necesita un nombre'); return; }
    setBusy(true);
    try {
      await updateSKU(sku.id, {
        nombre: f.nombre.trim(), marca: f.marca.trim(), modelo: f.modelo.trim(), color: f.color.trim(),
        categoria: f.categoria, precioSugerido: f.precioSugerido, notas: f.notas, activa: f.activa,
      });
      t.ok('SKU actualizado', sku.id);
      await onSaved();
    } catch (e) { t.err('No se pudo guardar', e.message); }
    setBusy(false);
  }

  return (
    <Modal title={`Editar SKU · ${sku.id}`} width={680} onClose={onClose}>
      <div className="row-4">
        <Field label="Nombre" required style={{ gridColumn: 'span 2' }}><TextInput value={f.nombre} onChange={set('nombre')} /></Field>
        <Field label="Marca"><TextInput value={f.marca} onChange={set('marca')} /></Field>
        <Field label="Modelo"><TextInput value={f.modelo} onChange={set('modelo')} /></Field>
      </div>
      <div className="row-4" style={{ marginTop: 'var(--s-3)' }}>
        <Field label="Color"><TextInput value={f.color} onChange={set('color')} /></Field>
        <Field label="Categoría"><Select value={f.categoria} onChange={set('categoria')} options={SKU_CATEGORIAS} /></Field>
        <Field label="Precio venta (RD$)"><MoneyInput value={f.precioSugerido} onChange={set('precioSugerido')} placeholder="opcional" /></Field>
        <Field label="Estado">
          <Select value={f.activa ? 'Activo' : 'Descontinuado'} onChange={(v) => set('activa')(v === 'Activo')}
            options={['Activo', 'Descontinuado']} />
        </Field>
      </div>
      <Field label="Notas" style={{ marginTop: 'var(--s-3)' }}><TextArea value={f.notas} onChange={set('notas')} placeholder="opcional" /></Field>
      <div className="modal-actions">
        <button className="btn ghost" onClick={onClose} disabled={busy}>Cancelar</button>
        <button className="btn" onClick={save} disabled={busy}>{busy ? 'Guardando…' : 'Guardar cambios'}</button>
      </div>
    </Modal>
  );
}

/* ════════════════════════ FormSKU (nuevo) ════════════════════════ */
// Genera id_sku {CAT}-{MARCA}-{MODELO}-{COLOR} en MAYÚSCULAS y valida que no
// exista ya en data.skus antes de crear.
function FormSKU({ onClose }) {
  const data = useData();
  const t = useToast();
  const [f, setF] = useState({ categoria: 'Mouse', marca: '', modelo: '', color: '', precioSugerido: '', notas: '' });
  const [busy, setBusy] = useState(false);
  const set = (k) => (v) => setF((p) => ({ ...p, [k]: v }));

  const catCode = CAT_CODE[f.categoria] || 'OTR';
  const mkCode = f.marca.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 3);
  const modCode = f.modelo.toUpperCase().replace(/[^A-Z0-9]/g, '');
  const colCode = f.color.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 3);
  const skuId = [catCode, mkCode, modCode, colCode].filter(Boolean).join('-');
  const autoNombre = [f.marca, f.modelo, f.color].filter(Boolean).join(' ');
  const valid = mkCode && modCode && colCode;
  const yaExiste = valid && (data.skus || []).some((s) => s.id === skuId);
  // Aviso suave: ya existe el MISMO modelo (marca+modelo), aunque el código difiera
  // (otro color, o un casi-duplicado por tipeo). No bloquea, solo avisa.
  const norm = (s) => (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '');
  const modeloKey = norm(f.marca) + '|' + norm(f.modelo);
  const mismoModelo = (valid && !yaExiste)
    ? (data.skus || []).filter((s) => s.id !== skuId && s.id !== 'LEGACY-SALE' && `${norm(s.marca)}|${norm(s.modelo)}` === modeloKey)
    : [];

  async function submit() {
    if (!valid) { t.err('Datos incompletos', 'Marca, modelo y color son obligatorios'); return; }
    if (yaExiste) { t.err('SKU duplicado', `${skuId} ya existe en el catálogo`); return; }
    setBusy(true);
    try {
      const res = await createSKU({
        id: skuId, nombre: autoNombre, marca: f.marca.trim(), modelo: f.modelo.trim(), color: f.color.trim(),
        categoria: f.categoria, precioSugerido: f.precioSugerido, notas: f.notas,
      });
      await data.refreshAll();
      t.ok('SKU creado', `${res.id_sku || skuId} · ${f.categoria}`);
      onClose();
    } catch (e) { t.err('No se pudo crear', e.message); }
    setBusy(false);
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-3)' }}>
      <div className="row-4">
        <Field label="Categoría"><Select value={f.categoria} onChange={set('categoria')} options={SKU_CATEGORIAS} /></Field>
        <Field label="Marca" required><TextInput value={f.marca} onChange={set('marca')} placeholder="HXSJ" /></Field>
        <Field label="Modelo" required><TextInput value={f.modelo} onChange={set('modelo')} placeholder="T90 Pro" /></Field>
        <Field label="Color" required><TextInput value={f.color} onChange={set('color')} placeholder="Negro" /></Field>
      </div>
      <div className="row">
        <Field label="Precio venta sugerido (RD$)"><MoneyInput value={f.precioSugerido} onChange={set('precioSugerido')} placeholder="opcional" /></Field>
        <Field label="Notas"><TextInput value={f.notas} onChange={set('notas')} placeholder="opcional" /></Field>
      </div>

      {valid && (
        <div className="summary">
          <div className="summary-item"><span className="lbl">ID generado</span><span className="val num" style={{ color: yaExiste ? 'var(--danger)' : 'var(--accent)' }}>{skuId}</span></div>
          <div className="summary-item"><span className="lbl">Nombre</span><span className="val" style={{ fontSize: 13 }}>{autoNombre}</span></div>
          <div className="summary-item"><span className="lbl">Categoría</span><span className="val" style={{ fontSize: 13 }}>{f.categoria}</span></div>
          <div className="summary-item"><span className="lbl">Precio</span><span className="val">{f.precioSugerido ? money(f.precioSugerido) : '—'}</span></div>
        </div>
      )}
      {yaExiste && <div style={{ fontSize: 12, color: 'var(--danger)' }}>Ese código ya existe — ajustá modelo/color para diferenciarlo.</div>}
      {mismoModelo.length > 0 && (
        <div style={{ fontSize: 12, color: 'var(--warning)' }}>
          ⚠ Ya tienes <b>{f.marca} {f.modelo}</b> en: {mismoModelo.map((s) => s.color || s.id).join(', ')}. Verificá que no sea un duplicado (podés crearlo igual si es otra variante).
        </div>
      )}

      <div className="modal-actions">
        <button className="btn ghost" onClick={onClose} disabled={busy}>Cancelar</button>
        <button className="btn" disabled={!valid || yaExiste || busy} onClick={submit}>{busy ? 'Creando…' : 'Crear SKU'}</button>
      </div>
    </div>
  );
}

/* ════════════════════════ Líneas de SKU (reusable lote) ════════════════════════ */
function LineasSku({ lineas, setLineas, monedaLabel }) {
  const addLinea = () => setLineas((arr) => [...arr, { key: 'k' + Date.now() + Math.random(), skuId: null, cantidad: 1, costoUd: '' }]);
  const updateLinea = (key, patch) => setLineas((arr) => {
    const next = arr.map((l) => (l.key === key ? { ...l, ...patch } : l));
    const last = next[next.length - 1];
    if (patch.skuId && last.key === key && last.skuId) {
      next.push({ key: 'k' + Date.now() + Math.random(), skuId: null, cantidad: 1, costoUd: '' });
    }
    return next;
  });
  const removeLinea = (key) => setLineas((arr) => (arr.length > 1 ? arr.filter((l) => l.key !== key) : arr));

  return (
    <div>
      <div className="field-label" style={{ marginBottom: 8 }}>SKUs del lote</div>
      <div className="line-row" style={{ borderBottom: '1px solid var(--border)', paddingBottom: 6, marginBottom: 4 }}>
        <span style={{ fontSize: 10, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>SKU</span>
        <span style={{ fontSize: 10, color: 'var(--text-3)', textTransform: 'uppercase', textAlign: 'right' }}>Cantidad</span>
        <span style={{ fontSize: 10, color: 'var(--text-3)', textTransform: 'uppercase', textAlign: 'right' }}>Costo/ud ({monedaLabel})</span>
        <span style={{ fontSize: 10, color: 'var(--text-3)', textTransform: 'uppercase', textAlign: 'right' }}>Subtotal</span>
        <span></span>
      </div>
      {lineas.map((l) => {
        const subtotal = num(l.cantidad) * num(l.costoUd);
        return (
          <div key={l.key} className="line-row">
            <SkuSelect value={l.skuId} onChange={(v) => updateLinea(l.key, { skuId: v })} soloActivos={false} />
            <NumberInput value={l.cantidad} onChange={(v) => updateLinea(l.key, { cantidad: v })} min="1" />
            <NumberInput value={l.costoUd} onChange={(v) => updateLinea(l.key, { costoUd: v })} placeholder="0" />
            <span className="num" style={{ fontSize: 12, textAlign: 'right' }}>{subtotal > 0 ? subtotal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—'}</span>
            <button className="icon-btn danger" onClick={() => removeLinea(l.key)} disabled={lineas.length === 1}>×</button>
          </div>
        );
      })}
      <button className="btn ghost" style={{ marginTop: 8 }} onClick={addLinea}>+ Añadir SKU</button>
    </div>
  );
}

/* ════════════════════════ FormLote (nuevo) ════════════════════════ */
// moneda RD|USD + tasaCambio (writer convierte a RD$, exige tasa si USD).
// medio de pago vía MedioPagoSelect (tarjeta → DRAWDOWN, regla 7).
function FormLote({ onClose }) {
  const data = useData();
  const t = useToast();
  const [fecha, setFecha] = useState(todayISO());
  const [status, setStatus] = useState('PENDIENTE');
  const [proveedorId, setProveedorId] = useState(null);
  const [moneda, setMoneda] = useState('RD');
  const [tasaCambio, setTasaCambio] = useState(() => Number(localStorage.getItem('tasa-cambio-usd')) || 60);
  const [medioPago, setMedioPago] = useState({ cuentaId: null, prestamoId: null });
  const [envio, setEnvio] = useState('');
  const [courier, setCourier] = useState('');
  const [otros, setOtros] = useState('');
  const [impuestos, setImpuestos] = useState('');
  const [nota, setNota] = useState('');
  const [lineas, setLineas] = useState([{ key: 'k0', skuId: null, cantidad: 1, costoUd: '' }]);
  const [busy, setBusy] = useState(false);

  useEffect(() => { if (Number(tasaCambio) > 0) localStorage.setItem('tasa-cambio-usd', String(tasaCambio)); }, [tasaCambio]);

  const esUSD = moneda === 'USD';
  const monLbl = esUSD ? 'USD$' : 'RD$';
  const lineasValidas = lineas.filter((l) => l.skuId && num(l.cantidad) > 0);
  const costoBase = lineasValidas.reduce((s, l) => s + num(l.cantidad) * num(l.costoUd), 0);
  const shared = num(envio) + num(courier) + num(otros) + num(impuestos);
  const totalMon = costoBase + shared;
  const tasa = num(tasaCambio);
  const totalRD = esUSD ? totalMon * tasa : totalMon;

  const valid = lineasValidas.length > 0 && medioPago.cuentaId && (!esUSD || tasa > 0);

  async function submit() {
    if (!lineasValidas.length) { t.err('Sin líneas', 'Agregá al menos un SKU al lote'); return; }
    if (!medioPago.cuentaId) { t.err('Falta medio de pago', 'Elegí de dónde sale el dinero del lote'); return; }
    if (esUSD && !(tasa > 0)) { t.err('Falta la tasa', 'En USD necesitás la tasa de cambio USD→RD'); return; }
    setBusy(true);
    try {
      const res = await createLote({
        fecha, proveedorId, status, moneda, tasaCambio: tasa,
        envio: num(envio), courier: num(courier), otros: num(otros), impuestos: num(impuestos),
        cuentaPagoId: medioPago.cuentaId, prestamoId: medioPago.prestamoId, nota,
        lineas: lineasValidas.map((l) => ({ skuId: l.skuId, cantidad: num(l.cantidad), costoUd: num(l.costoUd) })),
      }, data.lotes);
      await data.refreshAll();
      t.ok('Lote registrado', `${res.codigo} · ${lineasValidas.length} SKU(s) · ${money(totalRD)}`);
      onClose();
    } catch (e) { t.err('No se pudo registrar', e.message); }
    setBusy(false);
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-4)' }}>
      <div className="row-4">
        <Field label="Fecha de compra"><DateInput value={fecha} onChange={setFecha} /></Field>
        <Field label="Estado"><Select value={status} onChange={setStatus} options={STATUS_LOTE.map((s) => ({ value: s, label: statusLote(s) }))} /></Field>
        <Field label="Proveedor"><ContraparteSelect tipo="PROVEEDOR" value={proveedorId} onChange={setProveedorId} placeholder="— proveedor —" /></Field>
        <Field label="Moneda"><Select value={moneda} onChange={setMoneda} options={[{ value: 'RD', label: 'RD$' }, { value: 'USD', label: 'USD$' }]} /></Field>
      </div>

      <LineasSku lineas={lineas} setLineas={setLineas} monedaLabel={monLbl} />

      {esUSD && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 'var(--s-3)', background: 'var(--surface-2)', borderRadius: 4 }}>
          <div style={{ fontSize: 11, color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>Tasa de cambio</div>
          <div style={{ flex: 1, fontSize: 12, color: 'var(--text-3)' }}>RD$ por 1 USD$. El lote se guarda en RD$ (se anota el USD original en la caja).</div>
          <NumberInput value={tasaCambio} onChange={setTasaCambio} step="0.01" />
          <span style={{ fontSize: 12, color: 'var(--text-3)' }}>RD$/USD</span>
        </div>
      )}

      <div className="row-4">
        <Field label={`Envío (${monLbl})`} hint="China → USA"><MoneyInput value={envio} onChange={setEnvio} placeholder="0" /></Field>
        <Field label={`Courier (${monLbl})`} hint="USA → DR"><MoneyInput value={courier} onChange={setCourier} placeholder="0" /></Field>
        <Field label={`Impuestos (${monLbl})`} hint="Aduana"><MoneyInput value={impuestos} onChange={setImpuestos} placeholder="0" /></Field>
        <Field label={`Otros (${monLbl})`} hint="Fee / comisión"><MoneyInput value={otros} onChange={setOtros} placeholder="0" /></Field>
      </div>

      <div className="row">
        <Field label="Medio de pago" required hint="Si es tarjeta, se registra como DRAWDOWN ligado a la tarjeta">
          <MedioPagoSelect value={medioPago} onChange={setMedioPago} invalid={!medioPago.cuentaId} />
        </Field>
        <Field label="Notas"><TextInput value={nota} onChange={setNota} placeholder="opcional" /></Field>
      </div>

      <div className="summary">
        <div className="summary-item"><span className="lbl">Costo base ({monLbl})</span><span className="val">{costoBase.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span></div>
        <div className="summary-item"><span className="lbl">Compartidos ({monLbl})</span><span className="val">{shared.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span></div>
        <div className="summary-item"><span className="lbl">Total ({monLbl})</span><span className="val">{totalMon.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span></div>
        <div className="summary-item"><span className="lbl">Total en RD$</span><span className="val" style={{ color: 'var(--accent)' }}>{money(totalRD)}</span></div>
      </div>

      <div className="modal-actions">
        <button className="btn ghost" onClick={onClose} disabled={busy}>Cancelar</button>
        <button className="btn" disabled={!valid || busy} onClick={submit}>{busy ? 'Registrando…' : 'Registrar lote'}</button>
      </div>
    </div>
  );
}

/* ════════════════════════ EditLoteModal ════════════════════════ */
// Edita un lote existente: header (status/proveedor/costos compartidos) +
// entradas (agregar/editar/borrar). Cada acción es un writer individual con
// (moneda, tasa) para convertir costos USD a RD$ (INV-1/INV-3).
function EditLoteModal({ lote, onClose }) {
  const data = useData();
  const t = useToast();
  const [confirm, confirmNode] = useConfirm();

  const [status, setStatus] = useState(lote.status || 'PENDIENTE');
  const [proveedorId, setProveedorId] = useState(lote.proveedorId || null);
  const [fechaRecibido, setFechaRecibido] = useState(lote.fechaRecibido || '');
  // EditLote SIEMPRE en RD$: los valores existentes (entradas/costos) ya vienen
  // convertidos a RD$ del loader; re-convertir a USD corrompería el CPP. Para
  // capturar una compra NUEVA en USD, usar "+ Nuevo lote" (FormLote sí maneja USD→RD).
  const moneda = 'RD';
  const tasa = 1;
  const [envio, setEnvio] = useState(lote.envio || '');
  const [courier, setCourier] = useState(lote.courier || '');
  const [otros, setOtros] = useState(lote.otros || '');
  const [impuestos, setImpuestos] = useState(lote.impuestos || '');
  // Líneas: existentes (con id de entrada) + nuevas (sin id).
  const [lineas, setLineas] = useState(() => lote.entradas.map((e) => ({
    key: 'e' + e.id, entradaId: e.id, skuId: e.skuId, cantidad: e.cantidad, costoUd: e.costoBase, status: e.status, isNew: false,
  })));
  const [busy, setBusy] = useState(false);

  const monLbl = 'RD$';

  const addLinea = () => setLineas((arr) => [...arr, { key: 'n' + Date.now() + Math.random(), entradaId: null, skuId: null, cantidad: 1, costoUd: '', isNew: true }]);
  const updateLinea = (key, patch) => setLineas((arr) => arr.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  const removeLineaLocal = (key) => setLineas((arr) => arr.filter((l) => l.key !== key));

  async function removeLineaPersistida(l) {
    const ok = await confirm({ title: 'Borrar línea', body: `Quitar ${l.skuId} del lote. Reduce stock/CPP en cascada.`, confirmLabel: 'Borrar' });
    if (!ok) return;
    setBusy(true);
    try {
      await removeEntrada(l.entradaId);
      removeLineaLocal(l.key);
      await data.refreshAll();
      t.ok('Línea eliminada', l.skuId);
    } catch (e) { t.err('No se pudo eliminar', e.message); }
    setBusy(false);
  }

  async function save() {
    setBusy(true);
    try {
      // 1) Header
      await updateLoteHeader(lote.loteId, {
        status, proveedorId,
        fechaRecibido: status === 'RECIBIDO' ? (fechaRecibido || lote.fecha) : (fechaRecibido || null),
        envio: num(envio), courier: num(courier), otros: num(otros), impuestos: num(impuestos),
      }, moneda, tasa);
      // 2) Entradas: nuevas → addEntradaToLote; existentes modificadas → updateEntrada
      for (const l of lineas) {
        if (!l.skuId || num(l.cantidad) <= 0) continue;
        if (l.isNew) {
          await addEntradaToLote(lote.loteId, { fecha: lote.fecha, skuId: l.skuId, cantidad: num(l.cantidad), costoUd: num(l.costoUd), nota: '' }, status, moneda, tasa);
        } else {
          const orig = lote.entradas.find((e) => e.id === l.entradaId);
          const cambiado = orig && (orig.skuId !== l.skuId || orig.cantidad !== num(l.cantidad) || orig.costoBase !== num(l.costoUd));
          if (cambiado) {
            await updateEntrada(l.entradaId, { skuId: l.skuId, cantidad: num(l.cantidad), costoUd: num(l.costoUd) }, moneda, tasa);
          }
        }
      }
      await data.refreshAll();
      t.ok('Lote actualizado', `${lote.codigo} · ${lineas.length} línea(s)`);
      onClose();
    } catch (e) { t.err('No se pudo guardar', e.message); }
    setBusy(false);
  }

  return (
    <Modal title={`Editar lote · ${lote.codigo}`} width={920} onClose={onClose}>
      <div className="row-4">
        <Field label="Estado"><Select value={status} onChange={setStatus} options={STATUS_LOTE.map((s) => ({ value: s, label: statusLote(s) }))} /></Field>
        <Field label="Proveedor"><ContraparteSelect tipo="PROVEEDOR" value={proveedorId} onChange={setProveedorId} placeholder="— proveedor —" /></Field>
        <Field label="Fecha recibido" hint="Solo si ya llegó"><DateInput value={fechaRecibido} onChange={setFechaRecibido} /></Field>
        <Field label="Moneda" hint="Edición en RD$"><div className="input" style={{ background: 'var(--surface-3)', color: 'var(--text-3)' }}>RD$</div></Field>
      </div>

      <div style={{ marginTop: 'var(--s-4)' }}>
        <div className="field-label" style={{ marginBottom: 8 }}>SKUs del lote</div>
        <div className="line-row" style={{ borderBottom: '1px solid var(--border)', paddingBottom: 6, marginBottom: 4 }}>
          <span style={{ fontSize: 10, color: 'var(--text-3)', textTransform: 'uppercase' }}>SKU</span>
          <span style={{ fontSize: 10, color: 'var(--text-3)', textTransform: 'uppercase', textAlign: 'right' }}>Cantidad</span>
          <span style={{ fontSize: 10, color: 'var(--text-3)', textTransform: 'uppercase', textAlign: 'right' }}>Costo/ud ({monLbl})</span>
          <span style={{ fontSize: 10, color: 'var(--text-3)', textTransform: 'uppercase', textAlign: 'right' }}>Subtotal</span>
          <span></span>
        </div>
        {lineas.map((l) => {
          const subtotal = num(l.cantidad) * num(l.costoUd);
          return (
            <div key={l.key} className="line-row">
              <SkuSelect value={l.skuId} onChange={(v) => updateLinea(l.key, { skuId: v })} soloActivos={false} />
              <NumberInput value={l.cantidad} onChange={(v) => updateLinea(l.key, { cantidad: v })} min="1" />
              <NumberInput value={l.costoUd} onChange={(v) => updateLinea(l.key, { costoUd: v })} placeholder="0" />
              <span className="num" style={{ fontSize: 12, textAlign: 'right' }}>
                {subtotal > 0 ? subtotal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—'}
                {l.isNew && <div style={{ fontSize: 10, color: 'var(--accent)' }}>NUEVO</div>}
              </span>
              <button className="icon-btn danger" disabled={busy}
                onClick={() => (l.isNew ? removeLineaLocal(l.key) : removeLineaPersistida(l))}>×</button>
            </div>
          );
        })}
        <button className="btn ghost" style={{ marginTop: 8 }} onClick={addLinea}>+ Añadir SKU</button>
      </div>

      <div className="row-4" style={{ marginTop: 'var(--s-4)' }}>
        <Field label={`Envío (${monLbl})`}><MoneyInput value={envio} onChange={setEnvio} placeholder="0" /></Field>
        <Field label={`Courier (${monLbl})`}><MoneyInput value={courier} onChange={setCourier} placeholder="0" /></Field>
        <Field label={`Impuestos (${monLbl})`}><MoneyInput value={impuestos} onChange={setImpuestos} placeholder="0" /></Field>
        <Field label={`Otros (${monLbl})`}><MoneyInput value={otros} onChange={setOtros} placeholder="0" /></Field>
      </div>
      <div className="field-hint" style={{ marginTop: 6 }}>
        Nota: cambiar el estado a "Recibido" marca todas las entradas como recibidas y dispara el recálculo de CPP en la DB.
      </div>

      <div className="modal-actions">
        <button className="btn ghost" onClick={onClose} disabled={busy}>Cancelar</button>
        <button className="btn" onClick={save} disabled={busy}>{busy ? 'Guardando…' : 'Guardar cambios'}</button>
      </div>
      {confirmNode}
    </Modal>
  );
}
