// Pickers que leen useData: cuentas, SKUs, contrapartes, préstamos, inversores.
// MedioPagoSelect resuelve la regla 7/8 (pagar con tarjeta → prestamo_id del gemelo).
import { useState, useEffect } from 'react';
import { useData } from '../hooks/useData.jsx';
import { Select } from './Form.jsx';

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

export function ContraparteSelect({ value, onChange, tipo, placeholder = '— elegí —', invalid, incluirTodas = false }) {
  const { contrapartes } = useData();
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
  return <Select value={value} onChange={(v) => onChange(v === '' ? null : Number(v))} options={options} placeholder={placeholder} invalid={invalid} />;
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
