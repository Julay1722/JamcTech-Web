// App shell — composes everything, owns top-level state.

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "accent": "lime",
  "density": "cozy",
  "ticker": true,
  "mono": "ibm",
  "showSidebar": true
}/*EDITMODE-END*/;

const MONO_FONTS = {
  ibm: '"IBM Plex Mono", ui-monospace, monospace',
  jet: '"JetBrains Mono", ui-monospace, monospace',
  fira: '"Fira Code", ui-monospace, monospace',
  space: '"Space Mono", ui-monospace, monospace',
};

function TerminalApp() {
  const [tweaks, setTweak] = useTweaks(TWEAK_DEFAULTS);
  const [activePanel, setActivePanel] = React.useState('m');
  const [filter, setFilter] = React.useState({ modo: 'todo', desde: '', hasta: '', label: 'Todo el período' });
  const [isMobile, setIsMobile] = React.useState(false);

  React.useEffect(() => {
    const update = () => setIsMobile(window.innerWidth < 860);
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  // Compute + cache theme based on tweaks
  const theme = React.useMemo(() => buildTerminalTheme(tweaks.accent, tweaks.density), [tweaks.accent, tweaks.density]);
  window.__terminalTheme = theme;
  // Inject CSS variables for font-family at the root so all components inherit
  React.useEffect(() => {
    document.documentElement.style.setProperty('--term-mono', MONO_FONTS[tweaks.mono] || MONO_FONTS.ibm);
    document.body.style.background = theme.bg;
  }, [tweaks.mono, theme.bg]);

  const showSidebar = !isMobile && tweaks.showSidebar;

  const PanelComponent = ({ m: PanelMando, i: PanelInventario, r: PanelRadar, n: PanelFinanciero, f: PanelRegistrar })[activePanel];

  const showsFilter = ['m', 'i'].includes(activePanel);

  return (
    <div style={{
      background: theme.bg, color: theme.t, minHeight: '100vh',
      display: 'flex', flexDirection: 'column',
      fontFamily: 'var(--term-mono)', fontFeatureSettings: '"tnum"',
    }}>
      <TerminalHeader
        activePanel={activePanel}
        filter={filter}
      />
      <TerminalTicker show={tweaks.ticker} />

      {showSidebar && <TerminalSidebar active={activePanel} onChange={setActivePanel} />}
      {isMobile && !showSidebar && <TerminalMobileTabs active={activePanel} onChange={setActivePanel} />}

      <div style={{ flex: 1, padding: '12px 18px 22px', minWidth: 0, maxWidth: '100%' }}>
        {showsFilter && (
          <TFilterBar filter={filter} setFilter={setFilter} monthsList={MESES_LIST} />
        )}
        {PanelComponent && <PanelComponent filter={filter} />}
      </div>

      <TerminalFooter />

      <TerminalTweaksPanel tweaks={tweaks} setTweak={setTweak} />
      <ToastContainer />
    </div>
  );
}

function TerminalTweaksPanel({ tweaks, setTweak }) {
  return (
    <TweaksPanel title="Tweaks · JAMC Terminal">
      <TweakSection label="Visual">
        <TweakRow label="Acento">
          <AccentPicker value={tweaks.accent} onChange={(v) => setTweak('accent', v)} />
        </TweakRow>
        <TweakRadio
          label="Densidad"
          value={tweaks.density}
          options={['dense', 'cozy', 'roomy']}
          onChange={(v) => setTweak('density', v)}
        />
        <TweakSelect
          label="Fuente mono"
          value={tweaks.mono}
          options={[
            { value: 'ibm', label: 'IBM Plex Mono' },
            { value: 'jet', label: 'JetBrains Mono' },
            { value: 'fira', label: 'Fira Code' },
            { value: 'space', label: 'Space Mono' },
          ]}
          onChange={(v) => setTweak('mono', v)}
        />
      </TweakSection>

      <TweakSection label="Layout">
        <TweakToggle
          label="Mostrar ticker"
          value={tweaks.ticker}
          onChange={(v) => setTweak('ticker', v)}
        />
        <TweakToggle
          label="Sidebar (desktop)"
          value={tweaks.showSidebar}
          onChange={(v) => setTweak('showSidebar', v)}
        />
      </TweakSection>
    </TweaksPanel>
  );
}

function AccentPicker({ value, onChange }) {
  const opts = [
    { id: 'lime', c: '#c8ff2e', l: 'LIME' },
    { id: 'amber', c: '#ffb340', l: 'AMBER' },
    { id: 'cyan', c: '#5fd0ff', l: 'CYAN' },
    { id: 'red', c: '#ff5563', l: 'RED' },
  ];
  return (
    <div style={{ display: 'flex', gap: 6, width: '100%' }}>
      {opts.map((o) => (
        <button key={o.id} onClick={() => onChange(o.id)} style={{
          flex: 1, padding: '7px 4px', background: value === o.id ? o.c : 'transparent',
          color: value === o.id ? '#0a0a0c' : o.c, border: `1px solid ${o.c}`,
          fontFamily: 'var(--term-mono, monospace)', fontSize: 9, fontWeight: 700, letterSpacing: '0.12em',
          cursor: 'pointer', borderRadius: 4,
        }}>{o.l}</button>
      ))}
    </div>
  );
}

window.TerminalApp = TerminalApp;
