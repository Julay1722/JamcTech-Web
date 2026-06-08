// Primitivas de visualización (SVG, sin librerías). Extraídas del monolito.
import { useRef, useState, useLayoutEffect } from 'react';

export function fmtPct(n) {
  if (n == null || isNaN(n)) return '';
  const s = (n > 0 ? '+' : '') + n.toFixed(1) + '%';
  return s;
}

// tone: 'danger' | 'warning' | 'success' → colorea el valor sin inventar un %
// (para KPIs de conteo donde un delta porcentual no aplica). delta sigue
// disponible para KPIs con variación real.
const TONE_COLOR = { danger: 'var(--danger)', warning: 'var(--warning)', success: 'var(--success)' };
export function KPI({ label, value, delta, deltaLabel, currency, tone }) {
  const cls = delta == null ? 'neutral' : delta > 0 ? 'pos' : delta < 0 ? 'neg' : 'neutral';
  const arrow = delta == null ? '' : delta > 0 ? '↗' : delta < 0 ? '↘' : '→';
  const hasContent = delta != null || (deltaLabel && deltaLabel.length > 0);
  return (
    <div className="kpi">
      <div className="kpi-label">{label}</div>
      <div className="kpi-value" style={tone ? { color: TONE_COLOR[tone] } : undefined}>
        {currency && <span className="currency">RD$</span>}
        {value}
      </div>
      <div className={`kpi-delta ${cls}`} style={{ minHeight: 18 }}>
        {delta != null && (<><span>{arrow}</span><span>{fmtPct(delta)}</span></>)}
        {deltaLabel && <span style={{ color: 'var(--text-3)', marginLeft: delta != null ? 2 : 0 }}>{deltaLabel}</span>}
        {!hasContent && <span>&nbsp;</span>}
      </div>
    </div>
  );
}

// Barra de progreso / utilización. pct 0-100. Por defecto colorea por umbral
// (verde <60, ámbar 60-85, rojo >85) — útil para uso de tarjeta/línea. color override opcional.
export function Bar({ pct, color }) {
  const p = Math.max(0, Math.min(100, Number(pct) || 0));
  const auto = p > 85 ? 'var(--danger)' : p > 60 ? 'var(--warning)' : 'var(--success)';
  return (
    <div className="bar" title={`${p.toFixed(0)}%`}>
      <span style={{ width: `${p}%`, background: color || auto }} />
    </div>
  );
}

export function MiniBars({ values, w = 80, h = 28, color = 'var(--accent)' }) {
  if (!values || values.length === 0) return null;
  const max = Math.max(...values, 1);
  const bw = w / values.length;
  return (
    <svg width={w} height={h}>
      {values.map((v, i) => {
        const bh = (v / max) * h;
        return <rect key={i} x={i * bw + 0.5} y={h - bh} width={bw - 1} height={bh} fill={color} opacity={0.7} />;
      })}
    </svg>
  );
}

export function Sparkline({ values, w = 200, h = 50, color = 'var(--accent)' }) {
  if (!values || values.length < 2) return null;
  const max = Math.max(...values);
  const min = Math.min(...values);
  const range = max - min || 1;
  const points = values.map((v, i) => {
    const x = (i / (values.length - 1)) * w;
    const y = h - ((v - min) / range) * (h - 6) - 3;
    return `${x},${y}`;
  }).join(' ');
  return (
    <svg width={w} height={h}>
      <polygon points={`0,${h} ${points} ${w},${h}`} fill={color} opacity={0.1} />
      <polyline points={points} fill="none" stroke={color} strokeWidth={1.5} />
    </svg>
  );
}

function useContainerWidth() {
  const ref = useRef(null);
  const [w, setW] = useState(800);
  useLayoutEffect(() => {
    if (!ref.current) return;
    const measure = () => { if (ref.current) setW(ref.current.offsetWidth); };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  return [ref, w];
}

export function LineChart({ values, labels = [], h = 200, color = 'var(--accent)', fmt = (n) => n.toLocaleString('en-US'), title = '', yTicks = 4 }) {
  const [ref, containerW] = useContainerWidth();
  if (!values || values.length < 2) return <div ref={ref} className="muted" style={{ fontSize: 12, padding: 16, color: 'var(--text-3)' }}>Sin datos suficientes</div>;
  const w = Math.max(320, containerW);
  const PAD_L = 64, PAD_R = 16, PAD_T = 10, PAD_B = 28;
  const cw = w - PAD_L - PAD_R, ch = h - PAD_T - PAD_B;
  const max = Math.max(...values);
  const min = Math.min(0, Math.min(...values));
  const range = (max - min) || 1;
  const x = (i) => PAD_L + (i / Math.max(1, values.length - 1)) * cw;
  const y = (v) => PAD_T + ch - ((v - min) / range) * ch;
  const points = values.map((v, i) => `${x(i)},${y(v)}`).join(' ');
  const ticks = Array.from({ length: yTicks + 1 }, (_, i) => min + (range * i / yTicks));
  const labelEvery = Math.max(1, Math.ceil(values.length / Math.floor(cw / 60)));
  return (
    <div ref={ref} style={{ width: '100%', position: 'relative' }}>
      {title && <div style={{ fontSize: 11, color: 'var(--text-3)', marginBottom: 4, letterSpacing: '0.04em', textTransform: 'uppercase' }}>{title}</div>}
      <svg width="100%" height={h} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" style={{ display: 'block' }}>
        {ticks.map((t, i) => (
          <g key={i}>
            <line x1={PAD_L} y1={y(t)} x2={PAD_L + cw} y2={y(t)} stroke="var(--border)" strokeDasharray="2 4" strokeWidth={0.5} />
            <text x={PAD_L - 8} y={y(t) + 3} fontSize={10} fill="var(--text-3)" textAnchor="end" fontFamily="var(--font-mono)">{fmt(t)}</text>
          </g>
        ))}
        <polygon points={`${PAD_L},${PAD_T + ch} ${points} ${PAD_L + cw},${PAD_T + ch}`} fill={color} opacity={0.12} />
        <polyline points={points} fill="none" stroke={color} strokeWidth={1.8} />
        {values.map((v, i) => (
          <circle key={i} cx={x(i)} cy={y(v)} r={3} fill={color}><title>{(labels[i] || `#${i + 1}`) + ': ' + fmt(v)}</title></circle>
        ))}
        {labels.map((l, i) => (i % labelEvery === 0 || i === labels.length - 1) && (
          <text key={i} x={x(i)} y={h - 8} fontSize={10} fill="var(--text-3)" textAnchor="middle" fontFamily="var(--font-mono)">{l}</text>
        ))}
      </svg>
    </div>
  );
}

export function BarChart({ data, color = 'var(--accent)', fmt = (n) => n.toLocaleString('en-US'), title = '' }) {
  const [ref, containerW] = useContainerWidth();
  if (!data || data.length === 0) return <div ref={ref} className="muted" style={{ fontSize: 12, padding: 16, color: 'var(--text-3)' }}>Sin datos</div>;
  const w = Math.max(320, containerW);
  const PAD_L = Math.min(180, Math.max(80, w * 0.28));
  const PAD_R = 72, PAD_T = 4, PAD_B = 4;
  const max = Math.max(...data.map((d) => d.value));
  const barH = 22;
  const cw = w - PAD_L - PAD_R;
  const svgH = (barH + 8) * data.length + PAD_T + PAD_B;
  return (
    <div ref={ref} style={{ width: '100%' }}>
      {title && <div style={{ fontSize: 11, color: 'var(--text-3)', marginBottom: 6, letterSpacing: '0.04em', textTransform: 'uppercase' }}>{title}</div>}
      <svg width="100%" height={svgH} viewBox={`0 0 ${w} ${svgH}`} preserveAspectRatio="xMinYMin meet" style={{ display: 'block' }}>
        {data.map((d, i) => {
          const yPos = i * (barH + 8) + PAD_T;
          const bw = max > 0 ? (Math.abs(d.value) / max) * cw : 0;
          const maxChars = Math.max(8, Math.floor(PAD_L / 7));
          const lblShort = d.label.length > maxChars ? d.label.slice(0, maxChars - 1) + '…' : d.label;
          return (
            <g key={i}>
              <text x={PAD_L - 8} y={yPos + barH / 2 + 4} fontSize={11} fill="var(--text-2)" textAnchor="end">{lblShort}<title>{d.label}</title></text>
              <rect x={PAD_L} y={yPos} width={bw} height={barH} fill={d.color || color} opacity={0.85} rx={2} />
              <text x={PAD_L + bw + 6} y={yPos + barH / 2 + 4} fontSize={11} fill="var(--text)" fontFamily="var(--font-mono)">{fmt(d.value)}</text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

export function DonutChart({ data, size = 180, strokeW = 26, fmt = (n, p) => `${n.toLocaleString('en-US')} (${p.toFixed(1)}%)`, title = '' }) {
  if (!data || data.length === 0) return null;
  const total = data.reduce((s, d) => s + d.value, 0) || 1;
  const cx = size / 2, cy = size / 2, r = size / 2 - strokeW / 2;
  const circ = 2 * Math.PI * r;
  let offset = 0;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 24, width: '100%' }}>
      <svg width={size} height={size} style={{ flexShrink: 0 }}>
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="var(--border)" strokeWidth={strokeW} />
        {data.map((d, i) => {
          const len = (d.value / total) * circ;
          const seg = (
            <circle key={i} cx={cx} cy={cy} r={r} fill="none" stroke={d.color} strokeWidth={strokeW}
              strokeDasharray={`${len} ${circ - len}`} strokeDashoffset={-offset} transform={`rotate(-90 ${cx} ${cy})`} />
          );
          offset += len;
          return seg;
        })}
        <text x={cx} y={cy - 2} textAnchor="middle" fontSize={16} fontWeight={600} fontFamily="var(--font-mono)" fill="var(--text)">{total.toLocaleString('en-US')}</text>
        <text x={cx} y={cy + 16} textAnchor="middle" fontSize={9} fill="var(--text-3)" style={{ textTransform: 'uppercase' }} letterSpacing={0.6}>{title || 'TOTAL'}</text>
      </svg>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, fontSize: 13, flex: 1, minWidth: 0 }}>
        {data.map((d, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '4px 8px', borderRadius: 4, background: 'var(--surface-2)' }}>
            <span style={{ width: 12, height: 12, background: d.color, borderRadius: 3, flexShrink: 0 }} />
            <span style={{ color: 'var(--text-2)', fontWeight: 500 }}>{d.label}</span>
            <span style={{ color: 'var(--text-3)', marginLeft: 'auto', fontFamily: 'var(--font-mono)', fontSize: 12 }}>{fmt(d.value, (d.value / total) * 100)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
