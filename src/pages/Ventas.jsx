// ════════════════════════════════════════════════════════════════
// Ventas — Lista de ventas (DataTable + editar/borrar) + Nueva venta
// (form multi-SKU con envío cobrado, cuenta de cobro y gasto asociado).
//
// FASE 4 / bugs arreglados (la lógica vive en los writers, aquí solo se
// alimentan con los datos correctos):
//  - CTA-1: createVenta exige cuentaCobroId; el gasto asociado exige cuenta.
//  - VEN-1: editar venta (header o líneas) pasa ctx={codigo,fecha,canalId,
//    cuentaCobroId} → el writer re-sincroniza el ingreso de caja.
//  - VEN-2: el envío cobrado entra en total_facturado (la DB lo suma vía trigger).
//  - regla 7: gasto asociado vía MedioPagoSelect; si es tarjeta el writer lo
//    registra DRAWDOWN + prestamo_id.
// Cálculos de ganancia/CPP son de la DB (triggers); aquí solo se previsualizan.
// ════════════════════════════════════════════════════════════════
import { useState, useMemo, useEffect } from 'react';
import { useData } from '../hooks/useData.jsx';
import { createVenta, updateVentaHeader, updateVentaLineas, removeVenta } from '../lib/db/writers.js';
import { Modal, useConfirm } from '../components/Modal.jsx';
import { Field, TextInput, NumberInput, MoneyInput, DateInput, TextArea } from '../components/Form.jsx';
import { DataTable } from '../components/Table.jsx';
import { CuentaSelect, MedioPagoSelect, SkuSelect, ContraparteSelect } from '../components/Pickers.jsx';
import { KPI } from '../components/Charts.jsx';
import { useToast } from '../components/Toast.jsx';
import { money, intNum, fmtDate, todayISO, num } from '../lib/format.js';
import { downloadCSV, csvName } from '../lib/csv.js';
import { inPeriod } from '../lib/period.js';

const FACEBOOK_ID = 9; // canal default (CANAL_VENTA)

// id incremental local para líneas en el form (no es el id de DB).
let _lid = 1;
const newLinea = () => ({ key: _lid++, skuId: '', cantidad: 1, precio: '' });

export default function VentasPage({ period, customRange }) {
  const data = useData();
  const t = useToast();
  const [confirm, confirmNode] = useConfirm();
  const [tab, setTab] = useState('lista');
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState(null); // venta seleccionada para editar

  // Mapa SKU id → nombre, para mostrar el producto en vez del código en la lista.
  const skuNameById = useMemo(
    () => Object.fromEntries(data.skus.map((s) => [s.id, s.nombre])),
    [data.skus],
  );
  const nameOf = (id) => {
    if (id === 'LEGACY-SALE') return '(venta legacy)';
    return skuNameById[id] || id;
  };

  if (data.loading) {
    return (
      <div>
        <div className="topbar"><div><h1>Ventas</h1><div className="sub">Cargando…</div></div></div>
        <div className="section"><div className="empty">Cargando ventas…</div></div>
      </div>
    );
  }

  const ventasPeriodo = data.ventas.filter((v) => inPeriod(v.fecha, period, customRange));
  const filtered = ventasPeriodo.filter((v) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      (v.codigo || '').toLowerCase().includes(q) ||
      (v.canal || '').toLowerCase().includes(q) ||
      (v.lineas || []).some((l) => nameOf(l.skuId).toLowerCase().includes(q))
    );
  });

  // KPIs del período
  const revenue = ventasPeriodo.reduce((s, v) => s + v.facturado, 0);
  const ganancia = ventasPeriodo.reduce((s, v) => s + v.gananciaNeta, 0);
  const uds = ventasPeriodo.reduce((s, v) => s + v.lineas.reduce((a, l) => a + l.cantidad, 0), 0);
  const margenPct = revenue > 0 ? (ganancia / revenue) * 100 : 0;
  const ticket = ventasPeriodo.length > 0 ? revenue / ventasPeriodo.length : 0;

  function exportarCSV() {
    const headers = ['Código', 'Fecha', 'Canal', 'Cliente', 'Productos', 'Líneas', 'Facturado', 'Ganancia neta', 'Gasto asociado'];
    const rows = filtered.map((v) => [
      v.codigo,
      v.fecha,
      v.canal,
      v.clienteNombre,
      (v.lineas || []).map((l) => nameOf(l.skuId)).join(', '),
      v.lineas.length,
      v.facturado,
      v.gananciaNeta,
      v.gastoAsociado,
    ]);
    const n = downloadCSV(csvName('ventas'), headers, rows);
    t.ok('Ventas exportadas', `${n} fila(s) · CSV`);
  }

  async function doDelete(v) {
    const ok = await confirm({
      title: `¿Eliminar venta ${v.codigo}?`,
      body: `${fmtDate(v.fecha)} · ${v.canal || 'sin canal'} · ${money(v.facturado)}. Se borran ${v.lineas.length} línea(s) y la caja asociada (ingreso + gasto). No es reversible.`,
      confirmLabel: 'Eliminar',
    });
    if (!ok) return;
    try {
      await removeVenta(v.id);
      await data.refreshAll();
      t.ok('Venta eliminada', v.codigo);
    } catch (e) {
      t.err('No se pudo eliminar', e.message);
    }
  }

  const columns = [
    {
      key: 'producto', label: 'Producto',
      render: (v) => {
        const lineas = v.lineas || [];
        if (lineas.length === 0) {
          return (
            <div>
              <div><span className="muted">—</span></div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-3)' }}>{v.codigo}</div>
            </div>
          );
        }
        const primero = nameOf(lineas[0].skuId);
        const todos = lineas.map((l) => nameOf(l.skuId)).join(', ');
        const extra = lineas.length - 1;
        return (
          <div>
            <div title={todos}>
              {primero}
              {extra > 0 && <span style={{ color: 'var(--text-3)' }}> (+{extra} más)</span>}
            </div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-3)' }}>{v.codigo}</div>
          </div>
        );
      },
    },
    { key: 'fecha', label: 'Fecha', render: (v) => fmtDate(v.fecha) },
    { key: 'canal', label: 'Canal', render: (v) => v.canal || <span className="muted">—</span> },
    { key: 'lineas', label: '#Líneas', align: 'right', num: true, render: (v) => v.lineas.length },
    { key: 'facturado', label: 'Facturado', align: 'right', num: true, render: (v) => money(v.facturado) },
    {
      key: 'gananciaNeta', label: 'Ganancia neta', align: 'right', num: true,
      render: (v) => (
        <span style={{ color: v.gananciaNeta >= 0 ? 'var(--success)' : 'var(--danger)' }}>
          {money(v.gananciaNeta)}
          {v.gastoAsociado > 0 && (
            <div style={{ fontSize: 10, fontWeight: 400, color: 'var(--text-3)' }}>neto · −{money(v.gastoAsociado)}</div>
          )}
        </span>
      ),
    },
    {
      key: 'acciones', label: '', align: 'right',
      render: (v) => (
        <button className="icon-btn danger" title="Eliminar"
          onClick={(e) => { e.stopPropagation(); doDelete(v); }}>×</button>
      ),
    },
  ];

  return (
    <div>
      <div className="topbar">
        <div>
          <h1>Ventas</h1>
          <div className="sub">{data.ventas.length} ventas totales · {ventasPeriodo.length} en el período</div>
        </div>
        {tab === 'lista' && (
          <div className="topbar-actions">
            <input className="input" style={{ width: 200 }} type="text" placeholder="Buscar producto, código o canal…"
              value={search} onChange={(e) => setSearch(e.target.value)} />
            <button className="btn ghost" onClick={exportarCSV} disabled={!filtered.length} title="Descargar CSV">⤓ CSV</button>
            <span className="pill">{filtered.length} mostrando</span>
          </div>
        )}
      </div>

      <div className="tabs">
        <button className={tab === 'lista' ? 'tab active' : 'tab'} onClick={() => setTab('lista')}>Lista de ventas</button>
        <button className={tab === 'nueva' ? 'tab active' : 'tab'} onClick={() => setTab('nueva')}>+ Nueva venta</button>
      </div>

      {tab === 'nueva' && (
        <div className="section">
          <FormVenta onCreated={() => setTab('lista')} />
        </div>
      )}

      {tab === 'lista' && (
        <>
          <div className="kpi-row">
            <KPI label="Ventas en período" value={intNum(ventasPeriodo.length)} deltaLabel={`${intNum(uds)} unidades`} />
            <KPI label="Revenue" currency value={intNum(revenue)} delta={margenPct} deltaLabel="margen neto" />
            <KPI label="Ganancia neta" currency value={intNum(ganancia)} deltaLabel="ya resta gastos asociados" />
            <KPI label="Ticket promedio" currency value={intNum(ticket)} deltaLabel="por venta" />
          </div>

          <div className="section">
            <div className="section-head">
              <div className="section-title">Ventas · {filtered.length} de {ventasPeriodo.length}</div>
              <div className="section-desc">Click en una fila para editar el encabezado y las líneas</div>
            </div>
            <DataTable
              columns={columns}
              rows={filtered}
              getRowKey={(v) => v.id}
              onRowClick={(v) => setEditing(v)}
              empty="No hay ventas en este período"
            />
          </div>
        </>
      )}

      {editing && (
        <EditVentaModal
          venta={editing}
          onClose={() => setEditing(null)}
          onSaved={() => setEditing(null)}
        />
      )}

      {confirmNode}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════
// FormVenta — registrar una venta nueva (multi-SKU + envío + gasto asociado).
// ════════════════════════════════════════════════════════════════
function FormVenta({ onCreated }) {
  const data = useData();
  const t = useToast();
  const [fecha, setFecha] = useState(todayISO());
  const [canalId, setCanalId] = useState(FACEBOOK_ID);
  const [envioCobrado, setEnvioCobrado] = useState('');
  const [cuentaCobroId, setCuentaCobroId] = useState(null);
  const [clienteNombre, setClienteNombre] = useState('');
  const [lineas, setLineas] = useState([newLinea()]);
  const [busy, setBusy] = useState(false);
  // Gasto asociado (courier/comisión) opcional.
  const [gastoMonto, setGastoMonto] = useState('');
  const [gastoConcepto, setGastoConcepto] = useState('Pago Envío');
  const [gastoMedio, setGastoMedio] = useState({ cuentaId: null, prestamoId: null });
  const [tries, setTries] = useState(false); // marca validación tras intentar enviar

  const cppOf = (skuId) => data.skus.find((s) => s.id === skuId)?.cpp || 0;

  const addLinea = () => setLineas((arr) => [...arr, newLinea()]);
  const removeLinea = (key) => setLineas((arr) => (arr.length === 1 ? arr : arr.filter((l) => l.key !== key)));
  const updateLinea = (key, patch) => setLineas((arr) => arr.map((l) => (l.key === key ? { ...l, ...patch } : l)));

  const lineasValidas = lineas.filter((l) => l.skuId && num(l.cantidad) > 0);
  const subtotal = lineasValidas.reduce((s, l) => s + num(l.precio) * num(l.cantidad), 0);
  const costo = lineasValidas.reduce((s, l) => s + cppOf(l.skuId) * num(l.cantidad), 0);
  const envio = num(envioCobrado);
  const gasto = num(gastoMonto);
  const facturado = subtotal + envio;
  const gananciaNeta = facturado - costo - gasto;
  const margen = facturado > 0 ? (gananciaNeta / facturado) * 100 : 0;

  const gastoActivo = gasto > 0;
  const cuentaInvalida = tries && !cuentaCobroId;
  const gastoCuentaInvalida = tries && gastoActivo && !gastoMedio.cuentaId;
  const valid = lineasValidas.length > 0 && subtotal > 0 && !!cuentaCobroId && (!gastoActivo || !!gastoMedio.cuentaId);

  const reset = () => {
    setEnvioCobrado(''); setClienteNombre(''); setGastoMonto('');
    setLineas([newLinea()]); setTries(false);
  };

  const onSubmit = async () => {
    setTries(true);
    if (!valid) {
      if (!cuentaCobroId) t.warn('Falta la cuenta de cobro', 'Elegí a qué cuenta entra el pago');
      else if (gastoActivo && !gastoMedio.cuentaId) t.warn('Falta el medio de pago del gasto', 'Elegí de dónde sale el gasto asociado');
      else t.warn('Venta incompleta', 'Agregá al menos un SKU con precio');
      return;
    }
    setBusy(true);
    try {
      const payload = {
        fecha,
        canalId,
        clienteNombre: clienteNombre || null,
        envioCobrado: envio,
        descuento: 0,
        cuentaCobroId,
        lineas: lineasValidas.map((l) => ({ skuId: l.skuId, cantidad: num(l.cantidad), precio: num(l.precio) })),
      };
      if (gastoActivo) {
        payload.gasto = {
          monto: gasto,
          cuentaId: gastoMedio.cuentaId,
          prestamoId: gastoMedio.prestamoId, // si es tarjeta → DRAWDOWN (regla 7)
          concepto: gastoConcepto,
          tipo: gastoConcepto === 'Pago Comisión' ? 'PAGO_COMISION' : gastoConcepto === 'Pago Envío' ? 'PAGO_TRANSPORTE' : 'OTROS',
        };
      }
      const res = await createVenta(payload, data.ventas);
      await data.refreshAll();
      t.ok('Venta registrada', `${res.codigo} · ${money(facturado)} · ${lineasValidas.length} línea(s)`);
      reset();
      onCreated && onCreated();
    } catch (e) {
      t.err('No se pudo registrar', e.message);
    }
    setBusy(false);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-4)' }}>
      <div className="grid-2">
        <Field label="Fecha" required>
          <DateInput value={fecha} onChange={setFecha} />
        </Field>
        <Field label="Canal" required>
          <ContraparteSelect tipo="CANAL_VENTA" value={canalId} onChange={(v) => setCanalId(v ?? FACEBOOK_ID)} />
        </Field>
        <Field label="Cuenta de cobro" required hint="A qué cuenta entra el pago de la venta">
          <CuentaSelect filter="liquidas" value={cuentaCobroId} onChange={setCuentaCobroId} invalid={cuentaInvalida} />
        </Field>
        <Field label="Envío cobrado (RD$)" hint="Lo que el cliente pagó por envío · se suma al facturado">
          <MoneyInput value={envioCobrado} onChange={setEnvioCobrado} placeholder="0" />
        </Field>
      </div>

      <div>
        <div className="field-label" style={{ marginBottom: 8 }}>SKUs vendidos · {lineasValidas.length} línea(s)</div>
        {lineas.map((l) => {
          const cpp = cppOf(l.skuId);
          return (
            <div key={l.key} className="line-row" style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 80px 110px 90px 36px', gap: 8, alignItems: 'center', marginBottom: 8 }}>
              <SkuSelect value={l.skuId} onChange={(v) => updateLinea(l.key, { skuId: v })} />
              <NumberInput value={l.cantidad} min="1" onChange={(v) => updateLinea(l.key, { cantidad: v })} placeholder="Cant." />
              <NumberInput value={l.precio} onChange={(v) => updateLinea(l.key, { precio: v })} placeholder="Precio ud." />
              <span className="num" style={{ fontSize: 12, color: 'var(--text-3)', textAlign: 'right' }} title="CPP del SKU">
                {cpp > 0 ? `cpp ${money(cpp)}` : '—'}
              </span>
              <button className="icon-btn danger" onClick={() => removeLinea(l.key)} disabled={lineas.length === 1} title="Quitar">×</button>
            </div>
          );
        })}
        <button className="btn ghost" style={{ marginTop: 4 }} onClick={addLinea}>+ Añadir SKU</button>
      </div>

      <Field label="Cliente / referencia" hint="Opcional">
        <TextInput value={clienteNombre} onChange={setClienteNombre} placeholder="nombre del cliente, referencia…" />
      </Field>

      <div className="section" style={{ padding: 'var(--s-3)' }}>
        <div className="field-label" style={{ marginBottom: 8 }}>Gasto asociado (courier / comisión) · opcional</div>
        <div className="grid-3">
          <Field label="Concepto">
            <select className="select" value={gastoConcepto} onChange={(e) => setGastoConcepto(e.target.value)}>
              <option value="Pago Envío">Pago Envío (courier)</option>
              <option value="Pago Comisión">Pago Comisión</option>
              <option value="Otro">Otro gasto</option>
            </select>
          </Field>
          <Field label="Monto (RD$)" hint="Se registra como movimiento separado · resta de la ganancia neta">
            <MoneyInput value={gastoMonto} onChange={setGastoMonto} placeholder="0" />
          </Field>
          <Field label="Medio de pago" required={gastoActivo} hint="Tarjeta = se carga a la tarjeta (DRAWDOWN)">
            <MedioPagoSelect value={gastoMedio} onChange={setGastoMedio} invalid={gastoCuentaInvalida} />
          </Field>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8 }}>
        <button className="btn" disabled={!valid || busy} onClick={onSubmit}>{busy ? 'Registrando…' : 'Registrar venta'}</button>
        <button className="btn ghost" disabled={busy} onClick={reset}>Limpiar</button>
      </div>

      {(subtotal > 0 || lineasValidas.length > 0) && (
        <div className="summary">
          <div className="summary-item"><span className="lbl">Facturado{envio > 0 ? ` (incl. envío ${money(envio)})` : ''}</span><span className="val">{money(facturado)}</span></div>
          <div className="summary-item"><span className="lbl">Costo productos (CPP)</span><span className="val">{money(costo)}</span></div>
          {gasto > 0 && <div className="summary-item"><span className="lbl">Gasto asociado</span><span className="val" style={{ color: 'var(--danger)' }}>−{money(gasto)}</span></div>}
          <div className="summary-item"><span className="lbl">Ganancia neta</span><span className="val" style={{ color: gananciaNeta >= 0 ? 'var(--success)' : 'var(--danger)' }}>{money(gananciaNeta)}</span></div>
          <div className="summary-item"><span className="lbl">Margen</span><span className="val">{margen.toFixed(1)}%</span></div>
        </div>
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════
// EditVentaModal — editar encabezado (fecha/canal/envío/notas) + líneas
// (agregar/editar/quitar SKUs). Pasa ctx a los writers para re-sincronizar la
// caja (VEN-1). El total/ganancia los recalcula la DB tras guardar.
// ════════════════════════════════════════════════════════════════
function EditVentaModal({ venta, onClose, onSaved }) {
  const data = useData();
  const t = useToast();
  const [confirm, confirmNode] = useConfirm();

  const [fecha, setFecha] = useState(venta.fecha || '');
  const [canalId, setCanalId] = useState(venta.canalId ?? FACEBOOK_ID);
  const [envioCobrado, setEnvioCobrado] = useState(venta.envioCobrado || 0);
  const [notas, setNotas] = useState(venta.notas || '');
  // cuenta de cobro: necesaria para re-sincronizar la caja (VEN-1). Se intenta
  // recuperar de la caja existente; si no, el dueño la elige.
  const [cuentaCobroId, setCuentaCobroId] = useState(null);
  const [lineas, setLineas] = useState([]); // { id?, key, skuId, cantidad, precio }
  const [removedIds, setRemovedIds] = useState([]);
  const [busy, setBusy] = useState(false);
  const [tries, setTries] = useState(false);

  // Precargar líneas + intentar deducir la cuenta de cobro desde el movimiento VENTA.
  useEffect(() => {
    setLineas((venta.lineas || []).map((l) => ({ id: l.id, key: _lid++, skuId: l.skuId, cantidad: l.cantidad, precio: l.precio })));
    const mov = data.movimientos.find((m) => m.ventaId === venta.id && m.tipo === 'VENTA');
    setCuentaCobroId(mov?.cuentaId ?? null);
  }, [venta.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const cppOf = (skuId) => data.skus.find((s) => s.id === skuId)?.cpp || 0;
  const skuName = (skuId) => data.skus.find((s) => s.id === skuId)?.nombre || skuId;

  const addLinea = () => setLineas((arr) => [...arr, { key: _lid++, skuId: '', cantidad: 1, precio: '' }]);
  const updateLinea = (key, patch) => setLineas((arr) => arr.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  const removeLinea = (key) => setLineas((arr) => {
    const l = arr.find((x) => x.key === key);
    if (l && l.id) setRemovedIds((ids) => [...ids, l.id]);
    return arr.filter((x) => x.key !== key);
  });

  const subtotal = lineas.reduce((s, l) => s + num(l.precio) * num(l.cantidad), 0);
  const costo = lineas.reduce((s, l) => {
    // si la línea ya existía y no cambió de SKU, usa su cpp_historico; si no, el CPP actual
    const orig = (venta.lineas || []).find((o) => o.id === l.id);
    const cpp = orig && orig.skuId === l.skuId ? orig.cppHistorico : cppOf(l.skuId);
    return s + cpp * num(l.cantidad);
  }, 0);
  const envio = num(envioCobrado);
  const facturado = subtotal + envio;
  const gananciaNeta = facturado - costo - (venta.gastoAsociado || 0);
  const margen = facturado > 0 ? (gananciaNeta / facturado) * 100 : 0;

  const cuentaInvalida = tries && !cuentaCobroId;
  const valid = !!cuentaCobroId && lineas.some((l) => l.skuId && num(l.cantidad) > 0);

  const ctx = () => ({ codigo: venta.codigo, fecha, canalId, cuentaCobroId });

  const onSave = async () => {
    setTries(true);
    if (!cuentaCobroId) { t.warn('Falta la cuenta de cobro', 'Necesaria para re-sincronizar la caja de la venta'); return; }
    if (!valid) { t.warn('Venta sin líneas válidas', 'Debe quedar al menos un SKU con cantidad'); return; }
    setBusy(true);
    try {
      const context = ctx();
      // 1. Header (re-sincroniza la caja con el nuevo total/canal/fecha/cuenta) — VEN-1
      await updateVentaHeader(venta.id, { fecha, canalId, envioCobrado: envio, notas }, context);
      // 2. Líneas: upsert + removeIds. Si una línea EXISTENTE cambia de SKU, se
      // trata como remove+insert: el trigger de snapshot de cpp_historico solo
      // corre en INSERT, no en UPDATE de sku_id, así que un UPDATE in-place dejaría
      // el costo del SKU viejo → ganancia histórica incorrecta.
      const upsert = [];
      const removeIds = [...removedIds];
      lineas.filter((l) => l.skuId && num(l.cantidad) > 0).forEach((l) => {
        const orig = (venta.lineas || []).find((o) => o.id === l.id);
        if (l.id && orig) {
          if (orig.skuId !== l.skuId) {
            removeIds.push(l.id);
            upsert.push({ skuId: l.skuId, cantidad: num(l.cantidad), precio: num(l.precio) });
          } else if (orig.cantidad !== num(l.cantidad) || orig.precio !== num(l.precio)) {
            upsert.push({ id: l.id, cantidad: num(l.cantidad), precio: num(l.precio) });
          }
        } else {
          upsert.push({ skuId: l.skuId, cantidad: num(l.cantidad), precio: num(l.precio) });
        }
      });
      if (upsert.length || removeIds.length) {
        await updateVentaLineas(venta.id, { upsert, removeIds }, context);
      }
      await data.refreshAll();
      t.ok('Venta actualizada', `${venta.codigo} · ${money(facturado)}`);
      onSaved && onSaved();
    } catch (e) {
      t.err('No se pudo guardar', e.message);
    }
    setBusy(false);
  };

  const onDelete = async () => {
    const ok = await confirm({
      title: `¿Eliminar venta ${venta.codigo}?`,
      body: `Se borran las ${venta.lineas.length} línea(s) y la caja asociada. No es reversible.`,
      confirmLabel: 'Eliminar',
    });
    if (!ok) return;
    setBusy(true);
    try {
      await removeVenta(venta.id);
      await data.refreshAll();
      t.ok('Venta eliminada', venta.codigo);
      onSaved && onSaved();
    } catch (e) {
      t.err('No se pudo eliminar', e.message);
    }
    setBusy(false);
  };

  return (
    <Modal title={`Editar venta ${venta.codigo}`} width={640} onClose={onClose}>
      {confirmNode}
      <div className="grid-2" style={{ marginBottom: 'var(--s-3)' }}>
        <Field label="Fecha"><DateInput value={fecha} onChange={setFecha} /></Field>
        <Field label="Canal">
          <ContraparteSelect tipo="CANAL_VENTA" value={canalId} onChange={(v) => setCanalId(v ?? FACEBOOK_ID)} />
        </Field>
        <Field label="Envío cobrado (RD$)"><MoneyInput value={envioCobrado} onChange={setEnvioCobrado} placeholder="0" /></Field>
        <Field label="Cuenta de cobro" required hint="A qué cuenta entró el pago (sincroniza la caja)">
          <CuentaSelect filter="liquidas" value={cuentaCobroId} onChange={setCuentaCobroId} invalid={cuentaInvalida} />
        </Field>
      </div>

      <div className="field-label" style={{ marginBottom: 6 }}>Productos · {lineas.length} línea(s)</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 10 }}>
        {lineas.map((l) => {
          const sub = num(l.precio) * num(l.cantidad);
          return (
            <div key={l.key} style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 70px 100px 100px 32px', gap: 8, alignItems: 'center' }}>
              <SkuSelect value={l.skuId} onChange={(v) => updateLinea(l.key, { skuId: v })} soloActivos={false} />
              <NumberInput value={l.cantidad} min="1" onChange={(v) => updateLinea(l.key, { cantidad: v })} placeholder="Cant." />
              <NumberInput value={l.precio} onChange={(v) => updateLinea(l.key, { precio: v })} placeholder="Precio ud." />
              <span className="num" style={{ fontSize: 12, textAlign: 'right' }}>{sub > 0 ? money(sub) : '—'}</span>
              <button className="icon-btn danger" onClick={() => removeLinea(l.key)} title="Quitar">×</button>
            </div>
          );
        })}
        {lineas.length === 0 && <div className="muted">Esta venta no tiene líneas. Agregá al menos una.</div>}
      </div>
      <button className="btn ghost" onClick={addLinea} style={{ marginBottom: 'var(--s-3)' }}>+ producto</button>

      <div className="summary" style={{ marginBottom: 'var(--s-3)' }}>
        <div className="summary-item"><span className="lbl">Productos</span><span className="val">{money(subtotal)}</span></div>
        {envio > 0 && <div className="summary-item"><span className="lbl">+ Envío</span><span className="val">{money(envio)}</span></div>}
        <div className="summary-item"><span className="lbl">Total facturado</span><span className="val">{money(facturado)}</span></div>
        <div className="summary-item"><span className="lbl">Ganancia neta{venta.gastoAsociado > 0 ? ` (−${money(venta.gastoAsociado)} gasto)` : ''}</span><span className="val" style={{ color: gananciaNeta >= 0 ? 'var(--success)' : 'var(--danger)' }}>{money(gananciaNeta)}</span></div>
        <div className="summary-item"><span className="lbl">Margen</span><span className="val">{margen.toFixed(1)}%</span></div>
      </div>

      <Field label="Notas"><TextArea value={notas} onChange={setNotas} placeholder="cliente, referencia…" /></Field>

      {venta.gastoAsociado > 0 && (
        <div className="field-hint" style={{ marginTop: 4 }}>
          Esta venta tiene un gasto asociado de {money(venta.gastoAsociado)} (courier/comisión). Para editarlo, gestiónalo desde Finanzas / Movimientos.
        </div>
      )}

      <div className="modal-actions" style={{ marginTop: 'var(--s-4)' }}>
        <button className="btn danger" onClick={onDelete} disabled={busy} style={{ marginRight: 'auto' }}>Eliminar</button>
        <button className="btn ghost" onClick={onClose} disabled={busy}>Cancelar</button>
        <button className="btn" onClick={onSave} disabled={busy || !valid}>{busy ? 'Guardando…' : 'Guardar'}</button>
      </div>
    </Modal>
  );
}
