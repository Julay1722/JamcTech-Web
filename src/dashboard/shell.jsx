// Header, sidebar, ticker — the shell chrome.

function TerminalHeader({ activePanel, filter }) {
  const T = useTheme();
  const panelNames = {
    m: 'MANDO', i: 'INVENTARIO',
    r: 'RADAR', n: 'FINANCIERO', f: 'VENTAS',
  };
  const [clock, setClock] = React.useState(() => new Date());
  React.useEffect(() => {
    const id = setInterval(() => setClock(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  const t = clock.toLocaleTimeString('es-DO', { hour12: false });
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 14, padding: '10px 18px',
      background: T.panel2, borderBottom: `1px solid ${T.bdHi}`,
      flexWrap: 'wrap',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{
          width: 18, height: 18, background: T.hot, color: T.hotInk,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 11, fontWeight: 700,
        }}>J</div>
        <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.06em', color: T.t }}>JAMC.TECH</span>
        <span style={{ color: T.t3 }}>/</span>
        <span style={{ color: T.hot, fontSize: 11, letterSpacing: '0.14em', fontWeight: 600 }}>
          {panelNames[activePanel] || ''}
        </span>
      </div>
      <div style={{ width: 1, height: 16, background: T.bd }} />
      <div style={{ fontSize: 10, color: T.t2, display: 'flex', gap: 14 }} className="term-headmeta">
        <span>PERIOD: <span style={{ color: T.hot }}>{filter.label.toUpperCase()}</span></span>
      </div>
      <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 14 }}>
        <div style={{ fontSize: 10, color: T.t2 }}>
          <span style={{ color: T.t3 }}>SYNC</span> {HOY.toUpperCase()} · {t}
        </div>
        <button onClick={() => window.postMessage({ type: '__activate_edit_mode' }, '*')} style={{
          background: T.panel, color: T.t2, border: `1px solid ${T.bd}`,
          padding: '4px 10px', fontFamily: 'inherit', fontSize: 10, cursor: 'pointer',
          letterSpacing: '0.12em',
        }}>⚙ TWEAKS</button>
        <div style={{
          fontSize: 10, color: T.hot, display: 'flex', gap: 6, alignItems: 'center',
        }}>
          <span style={{
            width: 6, height: 6, background: T.hot, animation: 'pulse 1.4s infinite',
          }} />
          LIVE
        </div>
      </div>
    </div>
  );
}

function TerminalTicker({ show }) {
  const T = useTheme();
  if (!show) return null;
  // pick the latest 16 movements, marquee them
  const items = CF_ALL.slice(0, 16).map((m) => {
    const v = m.e - m.s;
    const sign = v >= 0 ? '+' : '-';
    const amt = Math.abs(v).toLocaleString('es-DO', { maximumFractionDigits: 0 });
    return { f: m.f.slice(5), c: m.c.slice(0, 18), sign, amt, color: v >= 0 ? T.gn : T.re };
  });
  return (
    <div style={{
      overflow: 'hidden', whiteSpace: 'nowrap',
      background: T.panel, borderBottom: `1px solid ${T.bd}`, padding: '6px 0',
      position: 'relative',
    }}>
      <div className="term-ticker-marquee" style={{ display: 'inline-flex', gap: 32, paddingLeft: 18 }}>
        {items.concat(items).map((t, i) => (
          <span key={i} style={{ fontSize: 10 }}>
            <span style={{ color: T.t3 }}>{t.f}</span>
            <span style={{ color: T.t2, marginLeft: 6 }}>{t.c}</span>
            <span style={{ color: t.color, marginLeft: 8, fontWeight: 600 }}>{t.sign}RD${t.amt}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

function TerminalSidebar({ active, onChange }) {
  const T = useTheme();
  const navItems = [
    { id: 'm', n: '01', label: 'MANDO',  sub: 'KPI' },
    { id: 'i', n: '02', label: 'INVENT', sub: 'STK' },
    { id: 'n', n: '03', label: 'FINANC', sub: 'DEU' },
    { id: 'r', n: '04', label: 'RADAR',  sub: 'ALR' },
    { id: 'f', n: '05', label: 'VENTAS', sub: 'VTA' },
  ];
  return (
    <div className="term-sidebar" style={{
      display: 'flex', flexDirection: 'row',
      background: T.panel, borderBottom: `1px solid ${T.bd}`,
      position: 'sticky', top: 0, zIndex: 20,
      width: '100%', boxShadow: '0 2px 0 rgba(0,0,0,0.35)',
    }}>
      {navItems.map((n) => {
        const on = active === n.id;
        return (
          <button key={n.id} onClick={() => onChange(n.id)} style={{
            flex: 1, padding: '10px 14px',
            borderRight: `1px solid ${T.bd}`,
            background: on ? T.panel2 : 'transparent',
            borderBottom: on ? `2px solid ${T.hot}` : '2px solid transparent',
            borderLeft: 'none', borderTop: 'none', textAlign: 'left',
            cursor: 'pointer', color: 'inherit', fontFamily: 'inherit',
            display: 'flex', alignItems: 'center', gap: 10,
          }}>
            <span style={{ fontSize: 9, color: on ? T.hot : T.t3, letterSpacing: '0.14em', minWidth: 16 }}>{n.n}</span>
            <span style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.15 }}>
              <span style={{ fontSize: 11, color: on ? T.t : T.t2, fontWeight: 600, letterSpacing: '0.06em' }}>{n.label}</span>
              <span style={{ fontSize: 8, color: T.t4, marginTop: 2, letterSpacing: '0.12em' }}>{n.sub}</span>
            </span>
          </button>
        );
      })}
      <div style={{
        padding: '10px 14px', fontSize: 8, color: T.t4,
        letterSpacing: '0.12em', borderLeft: `1px solid ${T.bd}`,
        display: 'flex', flexDirection: 'column', justifyContent: 'center',
        minWidth: 70,
      }}>
        <div>BUILD</div>
        <div style={{ color: T.t2, marginTop: 2 }}>v2.3</div>
      </div>
    </div>
  );
}

function TerminalMobileTabs({ active, onChange }) {
  const T = useTheme();
  const navItems = [
    { id: 'm', label: 'MANDO'  },
    { id: 'i', label: 'INVENT' },
    { id: 'n', label: 'FINANC' },
    { id: 'r', label: 'RADAR'  },
    { id: 'f', label: 'VENTAS' },
  ];
  return (
    <div style={{
      display: 'flex', overflowX: 'auto', background: T.panel,
      borderBottom: `1px solid ${T.bd}`, scrollbarWidth: 'none',
    }} className="term-mobtabs">
      {navItems.map((n, i) => {
        const on = active === n.id;
        return (
          <button key={n.id} onClick={() => onChange(n.id)} style={{
            padding: '10px 14px', background: 'transparent', color: on ? T.hot : T.t2,
            border: 'none', borderBottom: on ? `2px solid ${T.hot}` : '2px solid transparent',
            fontFamily: 'inherit', fontSize: 10, letterSpacing: '0.14em', fontWeight: 600,
            whiteSpace: 'nowrap', cursor: 'pointer',
          }}>
            <span style={{ color: T.t3, marginRight: 6 }}>0{i + 1}</span>{n.label}
          </button>
        );
      })}
    </div>
  );
}

function TerminalFooter() {
  const T = useTheme();
  return (
    <div style={{
      display: 'flex', flexWrap: 'wrap', gap: 18, alignItems: 'center',
      padding: '10px 18px', background: T.panel2, borderTop: `1px solid ${T.bd}`,
      fontSize: 9, color: T.t3, letterSpacing: '0.12em',
    }}>
      <span style={{ color: T.hot, display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ width: 6, height: 6, background: T.hot, display: 'inline-block' }} /> JAMC.TECH
      </span>
      <span>189 VENTAS</span>
      <span>43 SKUS</span>
      <span>361 MOV.CF</span>
      <span style={{ marginLeft: 'auto', color: T.t3 }}>SYNC 20-MAY-2026 · BUILD v2.3</span>
    </div>
  );
}

Object.assign(window, { TerminalHeader, TerminalTicker, TerminalSidebar, TerminalMobileTabs, TerminalFooter });
