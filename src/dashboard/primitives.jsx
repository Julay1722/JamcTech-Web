// Terminal theme tokens + primitives shared across panels.
// All components read theme from window.__terminalTheme (set by app shell).

const TERMINAL_THEMES = {
  lime: { hot: '#c8ff2e', hotDim: '#7a9e1c', hotInk: '#070708' },
  amber: { hot: '#ffb340', hotDim: '#a87420', hotInk: '#070708' },
  cyan: { hot: '#5fd0ff', hotDim: '#2a8bbb', hotInk: '#070708' },
  red: { hot: '#ff5563', hotDim: '#a83641', hotInk: '#fafafa' }
};

function buildTerminalTheme(accent, density) {
  const A = TERMINAL_THEMES[accent] || TERMINAL_THEMES.lime;
  // Densidad ajustada 2026-05-26: reducido base scale para menos overload
  // visual. dense=0.85x, cozy=1.0x, roomy=1.2x. Bloomberg pero más
  // respiración entre cards.
  const d = density === 'dense' ? 0.85 : density === 'roomy' ? 1.2 : 1.0;
  return {
    bg: '#070708',
    panel: '#0c0c0e',
    panel2: '#101013',
    panel3: '#14141a',
    bd: '#1a1a1e',
    bdHi: '#2a2a30',
    t: '#e4e4e7',
    t2: '#b8bcc6',
    t3: '#6f7480',
    t4: '#393c45',
    hot: A.hot, hotDim: A.hotDim, hotInk: A.hotInk,
    // Paleta semántica suavizada — chroma baja, lightness consistente ~0.74
    re: 'oklch(0.72 0.13 22)',
    am: 'oklch(0.80 0.13 72)',
    gn: 'oklch(0.80 0.13 148)',
    bl: 'oklch(0.78 0.11 230)',
    pu: 'oklch(0.75 0.13 295)',
    or: 'oklch(0.76 0.13 50)',
    pad: 12 * d, gap: 8 * d, padCell: 11 * d,
    fz: density === 'dense' ? 10 : 11,
    fzKpi: density === 'dense' ? 17 : 19
  };
}

function useTheme() {
  return window.__terminalTheme || buildTerminalTheme('lime', 'cozy');
}

// ─── Pill / badge ────────────────────────────────────────────
function TPill({ children, color, dim, size = 'sm' }) {
  const fz = size === 'lg' ? 10 : 9;
  return (
    <span style={{
      display: 'inline-block', padding: size === 'lg' ? '2px 8px' : '1px 6px',
      fontSize: fz, letterSpacing: '0.08em',
      color, background: dim || color + '18',
      border: `1px solid ${color}55`, borderRadius: 2,
      fontWeight: 600, whiteSpace: 'nowrap'
    }}>{children}</span>);

}

// ─── Section header ──────────────────────────────────────────
// 2026-05-26: aplicando guidelines ui-ux-pro-max — Minimalism
// (whitespace-balance: "use whitespace intentionally to group related
// items"; visual-hierarchy: "via size, spacing, contrast — not color
// alone"). Removed hot accent del §nn (era ruido visual), tipografía
// más sutil y plana. Sin línea horizontal de separación.
function TSectionHead({ ix, name, count, right }) {
  const T = useTheme();
  return (
    <div style={{
      display: 'flex', alignItems: 'baseline', gap: 12,
      padding: '14px 14px 8px',
      marginTop: 6,
    }}>
      <div style={{ fontSize: 9, color: T.t4, letterSpacing: '0.18em', fontFamily: 'inherit' }}>{ix}</div>
      <div style={{ fontSize: 11, color: T.t, letterSpacing: '0.10em', fontWeight: 500 }}>
        {name.toUpperCase()}
      </div>
      <div style={{ flex: 1 }} />
      {count && <div style={{ fontSize: 9, color: T.t4, letterSpacing: '0.04em' }}>{count}</div>}
      {right}
    </div>);

}

// ─── KPI cell ────────────────────────────────────────────────
// Render value, shrinking the "RD$" currency prefix to keep the number prominent.
function renderTCellValue(value) {
  if (typeof value !== 'string') return value;
  const m = value.match(/^([+\-]?)(RD\$)(.+)$/);
  if (!m) return value;
  return (
    <>
      {m[1] && <span>{m[1]}</span>}
      <span style={{ fontSize: '0.55em', opacity: 0.55, marginRight: '0.18em', letterSpacing: '0.04em', verticalAlign: '0.18em' }}>{m[2]}</span>
      <span>{m[3]}</span>
    </>
  );
}

function TCell({ label, value, color, sub, spark, sparkColor, span = 1, accent, big, italic, valueClass, centered }) {
  const T = useTheme();
  // 2026-05-26 (ui-ux-pro-max): primary-action ("one primary CTA"
  // se aplica análogamente a un solo accent point por cell);
  // visual-hierarchy via size/spacing not color; whitespace-balance.
  // Removed: ▸ marker, 2px accent stripe (era ruido); accent ahora
  // solo en color del value cuando se pasa explícitamente.
  return (
    <div style={{
      gridColumn: `span ${span}`,
      background: T.panel, border: `1px solid ${T.bd}`,
      padding: '12px 14px 11px',
      display: 'flex', flexDirection: 'column', gap: 6,
      minHeight: big ? 64 : 52, justifyContent: "flex-start"
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
        <div style={{
          fontSize: 9, letterSpacing: '0.14em', color: T.t3, fontWeight: 400,
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis'
        }}>{label.toUpperCase()}</div>
        {spark &&
        <div style={{ color: sparkColor || T.t4, flexShrink: 0 }}>
            <MiniBars values={spark} w={48} h={12} color="currentColor" dim={T.t4} />
          </div>
        }
      </div>
      <div className={valueClass} style={{
        fontSize: big ? T.fzKpi + 2 : T.fzKpi,
        fontWeight: 500, color: color || T.t, lineHeight: 1.0, letterSpacing: '-0.01em',
        fontStyle: italic ? 'italic' : 'normal',
        textAlign: centered ? 'center' : 'left'
      }}>{renderTCellValue(value)}</div>
      {sub && <div style={{
        fontSize: 9, color: T.t3, lineHeight: 1.3, marginTop: 'auto',
        textAlign: centered ? 'center' : 'left',
        letterSpacing: '0.02em', fontWeight: 400,
      }}>{sub}</div>}
    </div>);

}

// ─── Filter bar (period chooser, real wiring) ────────────────
function TFilterBar({ filter, setFilter, monthsList }) {
  const T = useTheme();
  const presets = [
  { id: 'todo', l: 'TODO' },
  { id: 'dias:7', l: '7D' },
  { id: 'dias:30', l: '30D' },
  { id: 'dias:90', l: '90D' },
  { id: 'dias:180', l: '6M' },
  { id: 'dias:365', l: '1AÑO' }];

  return (
    <div style={{
      display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8,
      background: T.panel, border: `1px solid ${T.bd}`,
      padding: '8px 12px', margin: '8px 0 4px 14px', borderRadius: 0
    }}>
      <div style={{ fontSize: 9, color: T.t3, letterSpacing: '0.16em' }}>▸ PERIOD</div>
      <div style={{ display: 'flex', gap: 2, background: T.panel2, padding: 2, border: `1px solid ${T.bd}` }}>
        {presets.map((p) => {
          const on = filter.modo === p.id;
          return (
            <button
              key={p.id}
              onClick={() => setFilter({ modo: p.id, desde: '', hasta: '', label: p.l === 'TODO' ? 'Todo el período' : 'Últimos ' + p.l })}
              style={{
                fontSize: 10, padding: '4px 9px', border: 'none',
                background: on ? T.hot : 'transparent', color: on ? T.hotInk : T.t2,
                fontFamily: 'inherit', cursor: 'pointer', fontWeight: 600, letterSpacing: '0.06em'
              }}>{p.l}</button>);

        })}
      </div>
      <select
        value={filter.modo.startsWith('mes:') ? filter.modo.slice(4) : ''}
        onChange={(e) => {
          const v = e.target.value;
          if (!v) return;
          const m = monthsList.find((x) => x.v === v);
          const d = v + '-01';
          const lastDay = new Date(new Date(d).setMonth(new Date(d).getMonth() + 1) - 1).toISOString().slice(0, 10);
          setFilter({ modo: 'mes:' + v, desde: d, hasta: lastDay, label: m.l });
        }}
        style={{
          fontSize: 10, background: T.panel2, color: T.t, border: `1px solid ${T.bd}`,
          padding: '4px 6px', fontFamily: 'inherit'
        }}>
        
        <option value="">— mes —</option>
        {monthsList.map((m) => <option key={m.v} value={m.v}>{m.l}</option>)}
      </select>
      <div style={{ width: 1, height: 18, background: T.bd, margin: '0 4px' }} />
      <span style={{ fontSize: 10, color: T.t3 }}>RANGO</span>
      <input type="date" value={filter.modo === 'rango' ? filter.desde : ''}
      min="2025-07-01" max={HOY}
      onChange={(e) => setFilter({ ...filter, modo: 'rango', desde: e.target.value, hasta: filter.hasta || HOY, label: 'Rango personalizado' })}
      style={{
        fontSize: 10, background: T.panel2, color: T.t, border: `1px solid ${T.bd}`,
        padding: '3px 5px', fontFamily: 'inherit', colorScheme: 'dark'
      }} />
      <span style={{ fontSize: 10, color: T.t3 }}>→</span>
      <input type="date" value={filter.modo === 'rango' ? filter.hasta : ''}
      min="2025-07-01" max={HOY}
      onChange={(e) => setFilter({ ...filter, modo: 'rango', desde: filter.desde || '2025-07-01', hasta: e.target.value, label: 'Rango personalizado' })}
      style={{
        fontSize: 10, background: T.panel2, color: T.t, border: `1px solid ${T.bd}`,
        padding: '3px 5px', fontFamily: 'inherit', colorScheme: 'dark'
      }} />
      <div style={{ marginLeft: 'auto', fontSize: 10, color: T.hot, letterSpacing: '0.14em' }}>
        {filter.label.toUpperCase()}
      </div>
    </div>);

}

// ─── React-side filter helpers (don't mutate global F) ───────
function applyFilter(arr, filter) {
  if (filter.modo === 'todo') return arr.slice();
  let d, h;
  if (filter.modo === 'rango' || filter.modo.startsWith('mes:')) {
    d = filter.desde;h = filter.hasta;
  } else if (filter.modo.startsWith('dias:')) {
    const dias = parseInt(filter.modo.slice(5));
    const base = new Date(HOY);
    const desde = new Date(base);
    desde.setDate(desde.getDate() - dias);
    d = desde.toISOString().slice(0, 10);
    h = HOY;
  } else return arr.slice();
  return arr.filter((r) => r.f >= d && r.f <= h);
}
function applyFilterOrLatest(arr, filter) {
  const fl = applyFilter(arr, filter);
  if (fl.length === 0 && arr.length > 0) {
    return { datos: [arr[arr.length - 1]], parcial: true };
  }
  return { datos: fl, parcial: false };
}

// ─── Form primitives (shared by every contextual "Registrar" section) ─
function FormField({ label, children, hint }) {
  const T = useTheme();
  return (
    <div>
      <div style={{ fontSize: 9, color: T.t3, letterSpacing: '0.14em', marginBottom: 6 }}>▸ {label.toUpperCase()}</div>
      {children}
      {hint && <div style={{ fontSize: 9, color: T.t4, marginTop: 4, fontStyle: 'italic' }}>{hint}</div>}
    </div>);

}

function TInput(props) {
  const T = useTheme();
  return <input {...props} style={{
    width: '100%', background: T.panel2, border: `1px solid ${T.bd}`, color: T.t,
    fontFamily: 'inherit', fontSize: 11, padding: '8px 10px', boxSizing: 'border-box',
    colorScheme: 'dark', ...(props.style || {})
  }} />;
}

function TSelect({ children, ...props }) {
  const T = useTheme();
  return <select {...props} style={{
    width: '100%', background: T.panel2, border: `1px solid ${T.bd}`, color: T.t,
    fontFamily: 'inherit', fontSize: 11, padding: '8px 10px', boxSizing: 'border-box', ...(props.style || {})
  }}>{children}</select>;
}

// FormSubmit · §6 #7 loading explícito + §6 #11 idempotencia + §6 #5 validación
// Props:
//   - busy: true mientras el submit async está en vuelo. Muestra "…" en label,
//     deshabilita el botón → doble-click no dispara segundo submit.
//   - disabled: deshabilita por validación fallida. Visual gris claro.
//   - warning: mensaje no-bloqueante (validación mixta §6 #5). Se muestra
//     en amber junto al botón; submit sigue habilitado.
//   - confirmation: mensaje de éxito post-submit (verde).
function FormSubmit({ label, color, onSubmit, onClear, confirmation, busy, disabled, warning }) {
  const T = useTheme();
  const blocked = busy || disabled;
  return (
    <div style={{ display: 'flex', gap: 8, marginTop: 18, flexWrap: 'wrap', alignItems: 'center' }}>
      <button type="button" onClick={onSubmit} disabled={blocked} style={{
        padding: '10px 18px',
        background: blocked ? T.panel3 : (color || T.hot),
        color: blocked ? T.t3 : T.hotInk,
        border: 'none', fontFamily: 'inherit', fontSize: 11, fontWeight: 700,
        letterSpacing: '0.14em',
        cursor: blocked ? (busy ? 'wait' : 'not-allowed') : 'pointer',
        opacity: disabled && !busy ? 0.6 : 1,
      }}>{busy ? '… SINCRONIZANDO' : '▸ ' + label}</button>
      <button type="button" onClick={onClear} disabled={busy} style={{
        padding: '10px 18px', background: 'transparent', color: T.t3,
        border: `1px solid ${T.bd}`, fontFamily: 'inherit', fontSize: 11,
        letterSpacing: '0.14em', cursor: busy ? 'wait' : 'pointer',
        opacity: busy ? 0.5 : 1,
      }}>LIMPIAR</button>
      {warning && !busy && !confirmation &&
        <span style={{ fontSize: 10, color: T.am, letterSpacing: '0.04em', marginLeft: 8 }}>
          ⚠ {warning}
        </span>
      }
      {confirmation &&
      <span style={{ fontSize: 10, color: T.gn, letterSpacing: '0.12em', marginLeft: 8 }}>
          ● {confirmation}
        </span>
      }
    </div>);

}

// ─── Inline tab strip (subnavigation inside a section) ───────
function TTabStrip({ tabs, active, onChange, dense }) {
  const T = useTheme();
  return (
    <div style={{ display: 'flex', gap: 0, borderBottom: `1px solid ${T.bd}`, background: T.panel2 }}>
      {tabs.map((tt, i) => {
        const on = active === tt.id;
        return (
          <button key={tt.id} onClick={() => onChange(tt.id)} style={{
            background: on ? T.panel : 'transparent', color: on ? T.t : T.t2,
            border: 'none', borderBottom: on ? `2px solid ${T.hot}` : '2px solid transparent',
            borderRight: `1px solid ${T.bd}`,
            padding: dense ? '8px 14px' : '10px 16px',
            fontFamily: 'inherit', fontSize: dense ? 10 : 11, fontWeight: 600,
            letterSpacing: '0.14em', cursor: 'pointer'
          }}>
            <span style={{ color: T.t3, marginRight: 8 }}>0{i + 1}</span>{tt.l}
          </button>);

      })}
    </div>);

}

Object.assign(window, {
  TERMINAL_THEMES, buildTerminalTheme, useTheme,
  TPill, TSectionHead, TCell, TFilterBar, TTabStrip,
  FormField, TInput, TSelect, FormSubmit,
  applyFilter, applyFilterOrLatest
});