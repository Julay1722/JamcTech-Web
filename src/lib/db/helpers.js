// Helpers de escritura: conversión de moneda, status maps, generación de códigos.
import { num } from '../format.js';

// status_lote ↔ status_entrada. Un lote RECIBIDO pone sus entradas RECIBIDO;
// estados de tránsito del lote mantienen la entrada PENDIENTE.
export const LOTE_TO_ENTRADA_STATUS = {
  PENDIENTE: 'PENDIENTE', EN_TRANSITO: 'PENDIENTE', EN_COURIER_USA: 'PENDIENTE',
  RECIBIDO: 'RECIBIDO', CANCELADO: 'PERDIDO',
};

// Convierte un costo a RD$. Si la moneda es USD, multiplica por la tasa.
// INV-1: el costo_unitario_base SIEMPRE se guarda en RD$ (el trigger de CPP
// asume RD$). Guardar USD crudo corrompe el CPP.
export function toRD(monto, moneda, tasaCambio) {
  const m = num(monto);
  if (String(moneda).toUpperCase() === 'USD') return m * num(tasaCambio || 0);
  return m;
}

// Código de venta nuevo: VTA-YYMMDD-NNN (incremental dentro del día).
export function nextVentaCodigo(fecha, ventasExistentes) {
  const f = String(fecha || new Date().toISOString().slice(0, 10)).replace(/-/g, '').slice(2);
  const prefix = `VTA-${f}`;
  const n = (ventasExistentes || []).filter((v) => (v.codigo || '').startsWith(prefix)).length;
  return `${prefix}-${String(n + 1).padStart(3, '0')}`;
}

// Código de lote nuevo: L-YYMMDD-NN.
export function nextLoteCodigo(fecha, lotesExistentes) {
  const f = String(fecha || new Date().toISOString().slice(0, 10)).replace(/-/g, '').slice(2);
  const prefix = `L-${f}`;
  const n = (lotesExistentes || []).filter((l) => (l.codigo || '').startsWith(prefix)).length;
  return `${prefix}-${String(n + 1).padStart(2, '0')}`;
}
