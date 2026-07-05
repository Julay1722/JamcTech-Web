// Helpers de formato compartidos (moneda RD$/USD$, fechas, números).
export const num = (v) => (v == null || v === '' ? 0 : parseFloat(v) || 0);

const NBSP = ' '; // espacio NO separable: la moneda nunca se parte del número.

export function money(v, currency = 'RD$') {
  const n = num(v);
  const s = n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${currency}${NBSP}${s}`;
}

export function moneyShort(v) {
  const n = num(v);
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (abs >= 1_000) return (n / 1_000).toFixed(1) + 'k';
  return n.toFixed(0);
}

export const intNum = (v) => Math.round(num(v)).toLocaleString('en-US');

export function fmtDate(iso) {
  if (!iso) return '';
  const [y, m, d] = String(iso).slice(0, 10).split('-');
  return `${d}/${m}/${y}`;
}

const MES_LABELS = { '01': 'Ene', '02': 'Feb', '03': 'Mar', '04': 'Abr', '05': 'May', '06': 'Jun', '07': 'Jul', '08': 'Ago', '09': 'Sep', '10': 'Oct', '11': 'Nov', '12': 'Dic' };
export function ymLabel(ym) {
  if (!ym) return '';
  const mm = ym.slice(5, 7);
  const yy = ym.slice(2, 4);
  return `${MES_LABELS[mm] || mm}-${yy}`;
}

// Fecha de HOY en hora LOCAL (no UTC: con RD a UTC-4, toISOString() ya es
// "mañana" a partir de las 8:00 PM — registraría ventas/pagos con fecha corrida).
export const todayISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

// Ocurrencia más reciente (hoy o pasada) del día `dia` del mes. Para saber cuándo
// cerró el último estado de cuenta (corte) de una tarjeta/línea revolvente.
export function ultimoDiaMesISO(dia) {
  const dn = Number(dia);
  if (!dn || dn < 1) return null;
  const hoy = new Date(todayISO() + 'T00:00:00');
  for (let i = 0; i < 13; i++) {
    const y = hoy.getFullYear(), mo = hoy.getMonth() - i;
    const ultimo = new Date(y, mo + 1, 0).getDate();
    const d = new Date(y, mo, Math.min(dn, ultimo));
    if (d <= hoy) return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }
  return null;
}

// Estado de pago del CICLO EN CURSO de una tarjeta/línea revolvente.
// El ciclo arranca en el último corte (o último vencimiento si no hay corte): un
// PAGO_* ligado a ese préstamo con fecha dentro de la ventana = ciclo ya atendido.
// Así la UI deja de marcar "vence mañana / no pagado" cuando Julio ya pagó.
export function cicloPagoEstado(prestamo, movimientos) {
  const venceDia = Number(prestamo.diaVencimiento) || 0;
  const corteDia = Number(prestamo.diaCorte) || 0;
  const proximoPago = venceDia ? proximoDiaMesISO(venceDia) : null;
  // El ciclo cuyo pago vence en `proximoPago` cerró en SU corte correspondiente:
  // si vence > corte, el corte es del MISMO mes que el vencimiento; si vence <= corte,
  // el corte fue el mes ANTERIOR. Anclar al vencimiento (no a "el último corte antes de
  // hoy") evita que un pago del ciclo YA vencido marque como pagado el ciclo siguiente.
  let cicloStart = null;
  if (proximoPago && corteDia) {
    const [y, m] = proximoPago.slice(0, 10).split('-').map(Number);
    const base = new Date(y, (m - 1) - (venceDia > corteDia ? 0 : 1), 1);
    const ultimo = new Date(base.getFullYear(), base.getMonth() + 1, 0).getDate();
    const dd = Math.min(corteDia, ultimo);
    cicloStart = `${base.getFullYear()}-${String(base.getMonth() + 1).padStart(2, '0')}-${String(dd).padStart(2, '0')}`;
  } else if (proximoPago) {
    cicloStart = ultimoDiaMesISO(venceDia); // sin día de corte: fallback al vencimiento
  }
  const pagos = (movimientos || []).filter((mv) => mv.prestamoId === prestamo.id
    && (mv.tipo === 'PAGO_LINEA_CREDITO' || mv.tipo === 'PAGO_TARJETA_CREDITO') && mv.salida > 0
    && (!cicloStart || String(mv.fecha).slice(0, 10) >= cicloStart));
  const pagadoCiclo = pagos.reduce((s, mv) => s + mv.salida, 0);
  const ultimoPago = pagos.map((mv) => String(mv.fecha).slice(0, 10)).sort().slice(-1)[0] || null;
  return { proximoPago, cicloStart, pagadoCiclo, ultimoPago, yaPagoCiclo: pagadoCiclo > 0 };
}

// Días entre hoy y una fecha ISO (negativo = ya pasó, 0 = hoy).
export function diasHasta(iso) {
  if (!iso) return null;
  const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
  const d = new Date(String(iso).slice(0, 10) + 'T00:00:00');
  return Math.round((d - hoy) / 86400000);
}

// Próxima fecha (hoy o futura) cuyo día del mes sea `dia`. Devuelve ISO 'YYYY-MM-DD'.
// Clampa a fin de mes (día 31 en feb → 28/29). Para corte/vencimiento de tarjetas:
// si el día ya pasó este mes, rueda al mes siguiente (ej. vence día 9, hoy es 20 →
// el 9 del mes que viene). Así el sistema entiende el ciclo corte→pago.
export function proximoDiaMesISO(dia) {
  const dn = Number(dia);
  if (!dn || dn < 1) return null;
  const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
  for (let i = 0; i < 13; i++) {
    const y = hoy.getFullYear(), mo = hoy.getMonth() + i;
    const ultimo = new Date(y, mo + 1, 0).getDate();
    const d = new Date(y, mo, Math.min(dn, ultimo));
    if (d >= hoy) return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }
  return null;
}
