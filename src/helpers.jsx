// Shared formatting + small visual primitives used by all 3 directions.
// Numeric values keep tabular-nums for clean column alignment.

const fmt = (n) => 'RD$' + Math.round(n).toLocaleString('es-DO');
const fmtK = (n) => {
  const a = Math.abs(n);
  if (a >= 1_000_000) return 'RD$' + (n / 1_000_000).toFixed(1) + 'M';
  if (a >= 1_000) return 'RD$' + (n / 1000).toFixed(0) + 'k';
  return 'RD$' + Math.round(n);
};
const fmtNum = (n) => Math.round(n).toLocaleString('es-DO');
const fmtPct = (n, signed = false) =>
  (signed && n >= 0 ? '+' : '') + n.toFixed(1) + '%';

// Build a snapshot of all KPIs each direction needs, derived from real data.js.
function deriveDashboardSnapshot() {
  const SK = (typeof buildSK === 'function') ? buildSK() : [];
  const tv = MES.reduce((s, x) => s + x.v, 0);
  const tg = MES.reduce((s, x) => s + x.g, 0);
  const tm = tv > 0 ? (tg / tv) * 100 : 0;
  const cap = MES[MES.length - 1]?.c || 0;
  const last = MES[MES.length - 1];
  const prev = MES[MES.length - 2];
  const growth = prev?.v ? ((last.v - prev.v) / prev.v) * 100 : 0;

  const best = MES.reduce((a, b) => (b.v > a.v ? b : a), MES[0]);
  const margins = MES.map((x) => x.p);
  const mMax = Math.max(...margins);
  const mMin = Math.min(...margins);
  const avgG = tg / MES.length;
  const avgV = tv / MES.length;

  const udsTotal = Object.values(VENTAS_SKU).reduce((s, n) => s + n, 0);
  const topSku = SK.slice().sort((a, b) => b.vendido - a.vendido)[0];
  const ticket = udsTotal > 0 ? tv / udsTotal : 0;
  const criticos = SK.filter((s) => s.estado === 'critico').length;
  const atencion = SK.filter((s) => s.estado === 'atencion').length;
  const enRep    = SK.filter((s) => s.estado === 'en_reposicion').length;
  const ok       = SK.filter((s) => s.estado === 'ok').length;
  const sinMov   = SK.filter((s) => s.estado === 'sin_movimiento').length;

  const stockTotal = SK.reduce((s, x) => s + x.s, 0);
  const enCaminoUds = SK.reduce((s, x) => s + x.enCamino, 0);
  const enCaminoSKUs = SK.filter((s) => s.enCamino > 0).length;
  const capInv = SK.reduce((s, x) => s + x.valorStock, 0);
  const capInmovil = SK.filter((s) => s.estado === 'sin_movimiento')
    .reduce((s, x) => s + x.valorStock, 0);
  const margenProm = Math.round(
    SK.filter((s) => s.pv > 0).reduce((sum, x) => sum + x.margen, 0) /
      Math.max(1, SK.filter((s) => s.pv > 0).length)
  );

  // Cash flow rollups (full history; variations slice as needed)
  const cfE = CF_ALL.reduce((s, m) => s + m.e, 0);
  const cfS = CF_ALL.reduce((s, m) => s + m.s, 0);
  const FINANC = ['Aportes para negocio', 'Pago a Inversores', 'Pago Prestamo', 'Intereses'];
  const opE = CF_ALL.filter((r) => !FINANC.includes(r.c)).reduce((s, r) => s + r.e, 0);
  const opS = CF_ALL.filter((r) => !FINANC.includes(r.c)).reduce((s, r) => s + r.s, 0);

  // Debt totals
  const deudaTotal = COOP.saldo + ANDREA.pendiente + BHD.usado;
  const compromisoMes =
    COOP.cuota + COOP.seguro +
    (ANDREA.pagado / Math.max(1, ANDREA.pagos.length)) +
    (BHD.usado * BHD.tasaMensual / 100);

  return {
    SK,
    sales: { tv, tg, tm, cap, last, prev, growth, best, mMax, mMin, avgG, avgV },
    inv: { udsTotal, topSku, ticket, criticos, atencion, enRep, ok, sinMov,
           stockTotal, enCaminoUds, enCaminoSKUs, capInv, capInmovil, margenProm },
    cf:  { cfE, cfS, neto: cfE - cfS, opE, opS, opNeto: opE - opS, count: CF_ALL.length },
    fin: { deudaTotal, compromisoMes },
  };
}

// Spark — tiny inline polyline. Pure SVG, no deps.
function Spark({ values, w = 80, h = 22, color = 'currentColor', fill = false, strokeWidth = 1.25 }) {
  if (!values || values.length === 0) return null;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const pts = values.map((v, i) => {
    const x = (i / (values.length - 1)) * w;
    const y = h - ((v - min) / range) * (h - 4) - 2;
    return [x, y];
  });
  const d = pts.map((p, i) => (i === 0 ? 'M' : 'L') + p[0].toFixed(1) + ',' + p[1].toFixed(1)).join(' ');
  const areaD = d + ` L${w},${h} L0,${h} Z`;
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} style={{ display: 'block' }}>
      {fill && <path d={areaD} fill={color} opacity="0.12" />}
      <path d={d} fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// Tiny bar mini-chart.
function MiniBars({ values, w = 80, h = 22, color = 'currentColor', dim = '#333' }) {
  if (!values || values.length === 0) return null;
  const max = Math.max(...values, 1);
  const bw = w / values.length;
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} style={{ display: 'block' }}>
      {values.map((v, i) => {
        // Clamp a ≥0: SVG <rect> rechaza height negativos. Si v es negativo
        // (puede pasar con session deltas o ganancias negativas), mostramos
        // la barra en altura 0 — la información se preserva en el color
        // (dim para v<=0) pero no rompe el render.
        const bh = Math.max(0, (v / max) * (h - 2));
        return (
          <rect key={i}
            x={i * bw + 0.5}
            y={h - bh}
            width={bw - 1}
            height={bh}
            fill={v > 0 ? color : dim}
            rx="0.5"
          />
        );
      })}
    </svg>
  );
}

// ── Export CSV helper (§8.5) ──────────────────────────────────────
// Genera un .csv con BOM UTF-8 (necesario para que Excel reconozca acentos
// y emojis correctamente), separador coma, escape RFC4180 (dobla las comillas
// dentro de strings). El que llama solo proporciona headers + rows.
//
//   exportCSVDownload('inventario-2026-05-24.csv',
//     ['SKU','Nombre','Stock'],
//     skus.map(s => [s.id, s.nm, s.s]),
//     { toastLabel: 'Inventario exportado' });
//
// Las celdas se serializan:
//   - strings: entre comillas dobles, escape de " a ""
//   - numbers, booleans, null/undefined: as-is (sin formato moneda)
function escapeCSVCell(v) {
  if (v == null) return '';
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  const s = String(v);
  if (/[",\n\r]/.test(s)) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}
function exportCSVDownload(filename, headers, rows, opts = {}) {
  const lines = [headers.map(escapeCSVCell).join(',')];
  rows.forEach((row) => {
    lines.push(row.map(escapeCSVCell).join(','));
  });
  // BOM UTF-8 al inicio. Sin esto, Excel abre el archivo en cp1252 y
  // los acentos / símbolos de RD$ se rompen.
  const csv = '﻿' + lines.join('\r\n') + '\r\n';
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  if (opts.toastLabel !== false) {
    window.toastOk?.(opts.toastLabel || 'CSV exportado', `${rows.length} fila${rows.length === 1 ? '' : 's'} · ${filename}`);
  }
}

Object.assign(window, {
  fmt, fmtK, fmtNum, fmtPct, deriveDashboardSnapshot, Spark, MiniBars,
  exportCSVDownload, escapeCSVCell,
});
