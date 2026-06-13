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
