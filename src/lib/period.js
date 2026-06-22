// Lógica de filtro de período, centralizada (antes duplicada en Overview/Ventas).
// Soporta presets (todo/mes/3m/6m/ano) y rango custom {from, to} (fechas ISO).
export function inPeriod(fecha, period, custom) {
  if (!fecha) return false;
  if (period === 'todo' || !period) return true;
  const d = String(fecha).slice(0, 10);
  if (period === 'custom') {
    const from = custom?.from || '';
    const to = custom?.to || '';
    if (from && d < from) return false; // ISO compara lexicográficamente
    if (to && d > to) return false;
    return true;
  }
  const dt = new Date(d + 'T00:00:00');
  const now = new Date();
  if (period === 'mes') return dt.getFullYear() === now.getFullYear() && dt.getMonth() === now.getMonth();
  if (period === 'ano') return dt.getFullYear() === now.getFullYear();
  const months = period === '3m' ? 3 : period === '6m' ? 6 : 12;
  const cutoff = new Date(now.getFullYear(), now.getMonth() - months + 1, 1);
  return dt >= cutoff;
}

// Etiqueta legible del período activo (para subtítulos).
export function periodLabel(period, custom) {
  const map = { todo: 'todo el histórico', mes: 'este mes', '3m': 'últimos 3 meses', '6m': 'últimos 6 meses', ano: 'este año' };
  if (period === 'custom') {
    const f = custom?.from || '…', t = custom?.to || '…';
    return `${f} → ${t}`;
  }
  return map[period] || 'todo';
}
