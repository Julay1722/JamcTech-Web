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

export const todayISO = () => new Date().toISOString().slice(0, 10);
