// Pickers que leen useData: cuentas, SKUs, contrapartes, préstamos, inversores.
// MedioPagoSelect resuelve la regla 7/8 (pagar con tarjeta → prestamo_id del gemelo).
import { useState, useEffect } from 'react';
import { useData } from '../hooks/useData.jsx';
import { Select, Field, TextInput } from './Form.jsx';
import { Modal } from './Modal.jsx';
import { useToast } from './Toast.jsx';
import { createContraparte, removeContraparte } from '../lib/db/writers.js';

// Empareja una cuenta CREDITO con su préstamo gemelo por nombre (modelo dual).
export function twinPrestamoId(cuenta, prestamos) {
  if (!cuenta || cuenta.tipo !== 'CREDITO') return null;
  const norm = (s) => String(s || '').toLowerCase().replace(/\s+/g, ' ').trim();
  const p = prestamos.find((x) => norm(x.nombre) === norm(cuenta.nombre));
  return p ? p.id : null;
}

// Select de cuenta (exige selección real — CTA-1). filter: 'liquidas' | 'todas'.
export function CuentaSelect({ value, onChange, filter = 'todas', placeholder = '— elegí cuenta —', invalid }) {
  const { cuentas } = useData();
  const list = filter === 'liquidas' ? cuentas.filter((c) => c.esLiquida) : cuentas;
  const options = list.map((c) => ({ value: c.id, label: `${c.nombre}${c.tipo === 'CREDITO' ? ' (tarjeta)' : ''}` }));
  return <Select value={value} onChange={(v) => onChange(v === '' ? null : Number(v))} options={options} placeholder={placeholder} invalid={invalid} />;
}

// Medio de pago: devuelve { cuentaId, prestamoId }. Si es tarjeta (CREDITO),
// liga el prestamo_id gemelo → el writer lo registra como DRAWDOWN (regla 7).
export function MedioPagoSelect({ value, onChange, placeholder = '— medio de pago —', invalid }) {
  const { cuentas, prestamos } = useData();
  const options = cuentas.map((c) => ({ value: c.id, label: `${c.nombre}${c.tipo === 'CREDITO' ? ' (tarjeta · DRAWDOWN)' : ''}` }));
  return (
    <Select value={value?.cuentaId} invalid={invalid} placeholder={placeholder} options={options}
      onChange={(v) => {
        if (v === '') return onChange({ cuentaId: null, prestamoId: null });
        const cuenta = cuentas.find((c) => c.id === Number(v));
        onChange({ cuentaId: Number(v), prestamoId: twinPrestamoId(cuenta, prestamos) });
      }} />
  );
}

// Picker de SKU en DOS pasos: primero la categoría, luego el SKU de esa categoría
// (evita desplegar los ~50 SKUs de una). La categoría se deriva sola del SKU ya
// elegido (al editar). Devuelve el skuId vía onChange, igual que antes.
export function SkuSelect({ value, onChange, placeholder = '— elegí SKU —', invalid, soloActivos = true }) {
  const { skus } = useData();
  const list = (soloActivos ? skus.filter((s) => s.activa) : skus).filter((s) => s.id !== 'LEGACY-SALE');
  const selSku = list.find((s) => s.id === value);
  const skuCat = selSku ? selSku.categoria : '';
  const [cat, setCat] = useState(skuCat);
  // Sincroniza la categoría cuando el value externo trae un SKU (carga / editar).
  useEffect(() => { if (skuCat && skuCat !== cat) setCat(skuCat); }, [skuCat]); // eslint-disable-line react-hooks/exhaustive-deps

  const categorias = [...new Set(list.map((s) => s.categoria).filter(Boolean))].sort();
  const skuList = cat ? list.filter((s) => s.categoria === cat) : [];

  return (
    <div style={{ display: 'flex', gap: 6, minWidth: 0 }}>
      <div style={{ flex: '0 0 120px' }}>
        <Select value={cat} onChange={(c) => { setCat(c); if (value) onChange(null); }}
          options={categorias.map((c) => ({ value: c, label: c }))}
          placeholder="— categoría —" invalid={invalid && !value} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <Select value={value || ''} onChange={(v) => onChange(v || null)}
          options={skuList.map((s) => ({ value: s.id, label: `${s.nombre} · stock ${s.stock}` }))}
          placeholder={cat ? placeholder : 'elegí categoría primero'} invalid={invalid && !value} disabled={!cat} />
      </div>
    </div>
  );
}

// Tipos de contraparte (enum tipo_contraparte de la DB) con label amigable.
const TIPOS_CONTRAPARTE = [
  { value: 'SERVICIO', label: 'Servicio / Suscripción' },
  { value: 'PROVEEDOR', label: 'Proveedor' },
  { value: 'CANAL_VENTA', label: 'Canal de venta' },
  { value: 'PERSONA_OPERATIVA', label: 'Persona operativa' },
  { value: 'CLIENTE_FAMILIAR', label: 'Cliente / Familiar' },
  { value: 'BANCO', label: 'Banco' },
  { value: 'INVERSOR', label: 'Inversor' },
  { value: 'OTRO', label: 'Otro' },
];

export function ContraparteSelect({ value, onChange, tipo, placeholder = '— elegí —', invalid, incluirTodas = false, gestionable = true }) {
  const { contrapartes } = useData();
  const [showManage, setShowManage] = useState(false);
  // Lee las contrapartes reales de la DB. Filtra por `tipo` (ej. PROVEEDOR,
  // CANAL_VENTA, INVERSOR) salvo que incluirTodas=true. Fallback a IDs conocidos
  // si aún no cargaron (evita un select vacío en el primer render).
  const FALLBACK = {
    CANAL_VENTA: [{ id: 9, nombre: 'Facebook' }, { id: 17, nombre: 'Cliente Generico' }],
    PROVEEDOR: [{ id: 5, nombre: 'Alibaba' }, { id: 6, nombre: 'Temu' }, { id: 7, nombre: 'Amazon' }],
    INVERSOR: [{ id: 8, nombre: 'Andrea Correa' }],
  };
  let list = contrapartes && contrapartes.length
    ? (incluirTodas || !tipo ? contrapartes : contrapartes.filter((c) => c.tipo === tipo))
    : (FALLBACK[tipo] || []);
  // Canal de venta: ofrecer también clientes (familiares/genéricos) como destino.
  if (tipo === 'CANAL_VENTA' && contrapartes?.length) {
    list = contrapartes.filter((c) => c.tipo === 'CANAL_VENTA' || c.tipo === 'CLIENTE_FAMILIAR' || c.tipo === 'OTRO');
  }
  const options = list.map((c) => ({ value: c.id, label: c.nombre }));
  return (
    <div style={{ display: 'flex', gap: 6, alignItems: 'center', minWidth: 0 }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <Select value={value} onChange={(v) => onChange(v === '' ? null : Number(v))} options={options} placeholder={placeholder} invalid={invalid} />
      </div>
      {gestionable && (
        <button type="button" className="icon-btn" title="Añadir / gestionar contrapartes"
          onClick={() => setShowManage(true)}>+</button>
      )}
      {showManage && (
        <GestionContrapartes tipoDefault={tipo} onPick={(id) => { onChange(id); setShowManage(false); }} onClose={() => setShowManage(false)} />
      )}
    </div>
  );
}

// Modal de gestión: crear una contraparte nueva (queda seleccionada) y eliminar
// las que no estén en uso (removeContraparte valida las 7 FKs y avisa claro).
function GestionContrapartes({ tipoDefault, onPick, onClose }) {
  const data = useData();
  const t = useToast();
  const [nombre, setNombre] = useState('');
  const [tipoNuevo, setTipoNuevo] = useState(tipoDefault || 'SERVICIO');
  const [busy, setBusy] = useState(false);

  const crear = async () => {
    if (nombre.trim().length < 2) { t.warn('Falta el nombre', 'ej. Netlify, Claro, EDE Este…'); return; }
    setBusy(true);
    try {
      const row = await createContraparte({ nombre, tipo: tipoNuevo });
      await data.refreshAll();
      t.ok('Contraparte creada', row.nombre);
      onPick?.(row.id); // queda seleccionada en el picker que abrió el modal
    } catch (e) { t.err('No se pudo crear', e.message); }
    setBusy(false);
  };

  const borrar = async (c) => {
    setBusy(true);
    try {
      await removeContraparte(c.id);
      await data.refreshAll();
      t.ok('Contraparte eliminada', c.nombre);
    } catch (e) { t.err(`No se puede eliminar "${c.nombre}"`, e.message); }
    setBusy(false);
  };

  const tipoLabel = (v) => TIPOS_CONTRAPARTE.find((x) => x.value === v)?.label || v;

  return (
    <Modal title="Contrapartes" width={520} onClose={onClose}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-3)' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 170px 90px', gap: 8, alignItems: 'end' }}>
          <Field label="Nueva contraparte"><TextInput value={nombre} onChange={setNombre} placeholder="ej. Netlify" /></Field>
          <Field label="Tipo"><Select value={tipoNuevo} onChange={setTipoNuevo} options={TIPOS_CONTRAPARTE} /></Field>
          <button className="btn" style={{ marginBottom: 1 }} disabled={busy || nombre.trim().length < 2} onClick={crear}>Crear</button>
        </div>

        <div className="field-label">Existentes ({(data.contrapartes || []).length})</div>
        <div style={{ maxHeight: 300, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 4 }}>
          {(data.contrapartes || []).map((c) => (
            <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 10px', borderRadius: 6, background: 'var(--surface-2)' }}>
              <span style={{ flex: 1, fontSize: 13 }}>{c.nombre}</span>
              <span className="muted" style={{ fontSize: 11 }}>{tipoLabel(c.tipo)}</span>
              <button type="button" className="icon-btn danger" title="Eliminar (solo si no está en uso)"
                disabled={busy} onClick={() => borrar(c)}>×</button>
            </div>
          ))}
        </div>
        <div className="field-hint">Solo se pueden eliminar contrapartes sin registros (ventas, movimientos, lotes…). Las que están en uso se bloquean para no dejar datos huérfanos.</div>
      </div>
    </Modal>
  );
}

export function PrestamoSelect({ value, onChange, filter, placeholder = '— elegí —', invalid }) {
  const { prestamos } = useData();
  const list = filter ? prestamos.filter(filter) : prestamos;
  const options = list.map((p) => ({ value: p.id, label: p.nombre }));
  return <Select value={value} onChange={(v) => onChange(v === '' ? null : Number(v))} options={options} placeholder={placeholder} invalid={invalid} />;
}

export function InversorSelect({ value, onChange, placeholder = '— elegí inversor —', invalid }) {
  const { inversores } = useData();
  const options = inversores.map((i) => ({ value: i.id, label: i.nombre + (i.esDueno ? ' (dueño)' : '') }));
  return <Select value={value} onChange={(v) => onChange(v === '' ? null : Number(v))} options={options} placeholder={placeholder} invalid={invalid} />;
}
