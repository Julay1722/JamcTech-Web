// Helpers de escritura: conversión de moneda, status maps, generación de códigos.
import { num, todayISO } from '../format.js';

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
  const f = String(fecha || todayISO()).replace(/-/g, '').slice(2);
  const prefix = `VTA-${f}`;
  const n = (ventasExistentes || []).filter((v) => (v.codigo || '').startsWith(prefix)).length;
  return `${prefix}-${String(n + 1).padStart(3, '0')}`;
}

// Código de lote nuevo: L-YYMMDD-NN.
export function nextLoteCodigo(fecha, lotesExistentes) {
  const f = String(fecha || todayISO()).replace(/-/g, '').slice(2);
  const prefix = `L-${f}`;
  const n = (lotesExistentes || []).filter((l) => (l.codigo || '').startsWith(prefix)).length;
  return `${prefix}-${String(n + 1).padStart(2, '0')}`;
}

const round2 = (x) => Math.round((Number(x) + Number.EPSILON) * 100) / 100;
// Suma `i` meses a una fecha ISO manteniendo el día (clampa a fin de mes).
function sumarMesesISO(iso, i) {
  const [y, m, d] = String(iso).slice(0, 10).split('-').map(Number);
  const base = new Date(y, m - 1 + i, 1);
  const ultimo = new Date(base.getFullYear(), base.getMonth() + 1, 0).getDate();
  const dd = Math.min(d, ultimo);
  return `${base.getFullYear()}-${String(base.getMonth() + 1).padStart(2, '0')}-${String(dd).padStart(2, '0')}`;
}

// Construye el schedule de cuotas amortizadas (sistema francés: cuota fija de
// capital+interés; el seguro es un fijo mensual aparte). Devuelve filas listas
// para insertar en `cuotas` (sin prestamo_id; el caller lo agrega).
//   saldo        balance de capital de arranque
//   r            tasa mensual (ej. 0.0167)
//   seguro       seguro mensual fijo
//   fechaPrimera 'YYYY-MM-DD' de la primera cuota nueva
//   numeroInicial número de la primera cuota
//   modo 'REDUCIR_CUOTA'  → n cuotas fijas (nCuotas); calcula la cuota P&I
//        'ACORTAR_PLAZO'  → cuota P&I fija (cuotaPI); calcula cuántas hacen falta
// La última cuota se ajusta para cerrar el saldo exacto en 0.
export function construirScheduleAmortizado({ saldo, r, seguro = 0, fechaPrimera, numeroInicial = 1, modo, nCuotas, cuotaPI }) {
  const S = round2(saldo);
  const tasa = Number(r) || 0;
  if (S <= 0) return [];
  let pi, n;
  if (modo === 'REDUCIR_CUOTA') {
    n = Math.max(1, Math.round(nCuotas));
    pi = tasa > 0 ? S * tasa / (1 - Math.pow(1 + tasa, -n)) : S / n;
  } else { // ACORTAR_PLAZO
    pi = round2(cuotaPI);
    if (tasa > 0 && pi <= S * tasa) throw new Error('La cuota fija no cubre ni el interés; usá la opción de bajar la cuota.');
    n = tasa > 0 ? Math.ceil(-Math.log(1 - (S * tasa) / pi) / Math.log(1 + tasa)) : Math.ceil(S / pi);
  }
  const rows = [];
  let bal = S;
  for (let i = 0; i < n && bal > 0.0001; i++) {
    const interes = round2(bal * tasa);
    let capital = round2(pi - interes);
    if (i === n - 1 || capital >= bal) capital = round2(bal); // última: cierra en 0
    const saldoPost = round2(bal - capital);
    rows.push({
      numero: numeroInicial + i,
      fecha_pago: sumarMesesISO(fechaPrimera, i),
      capital, interes, seguro: round2(seguro), abono_capital: 0,
      monto_total: round2(capital + interes + seguro),
      saldo_post: saldoPost, pagada: false,
    });
    bal = saldoPost;
  }
  return rows;
}
