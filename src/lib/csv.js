// Export CSV — función pura. El caller pasa headers + rows y hace el toast.
// BOM UTF-8 para que Excel reconozca acentos y RD$; escape RFC4180 (dobla "").
// (Adaptado de la versión paralela del otro chat — su helper estaba bien hecho.)

function escapeCell(v) {
  if (v == null) return '';
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  const s = String(v);
  return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

// headers: string[] · rows: (string|number)[][] · filename: 'algo.csv'
// Devuelve el número de filas exportadas (para el toast del caller).
export function downloadCSV(filename, headers, rows) {
  const lines = [headers.map(escapeCell).join(',')];
  rows.forEach((row) => lines.push(row.map(escapeCell).join(',')));
  const csv = '﻿' + lines.join('\r\n') + '\r\n'; // BOM + CRLF
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  return rows.length;
}

// Helper de fecha para nombres de archivo: 'ventas-2026-06-08.csv'
export function csvName(prefix) {
  return `${prefix}-${new Date().toISOString().slice(0, 10)}.csv`;
}
