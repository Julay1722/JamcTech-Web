// Filtro de período (Resumen, Ventas, Libro). Presets + rango de fechas custom.
const PERIODS = [
  { id: 'todo', label: 'Todo' },
  { id: 'mes', label: 'Este mes' },
  { id: '3m', label: '3 meses' },
  { id: '6m', label: '6 meses' },
  { id: 'ano', label: 'Año' },
];

export default function PeriodFilter({ value, onChange, custom, onCustom }) {
  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
      <div className="period-bar">
        {PERIODS.map((p) => (
          <button key={p.id} className={value === p.id ? 'active' : ''} onClick={() => onChange(p.id)}>
            {p.label}
          </button>
        ))}
        <button className={value === 'custom' ? 'active' : ''} onClick={() => onChange('custom')}>Rango</button>
      </div>
      {value === 'custom' && onCustom && (
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <input className="input" type="date" value={custom?.from || ''} style={{ width: 150, padding: '4px 8px' }}
            onChange={(e) => onCustom({ ...custom, from: e.target.value })} />
          <span style={{ color: 'var(--text-3)' }}>→</span>
          <input className="input" type="date" value={custom?.to || ''} style={{ width: 150, padding: '4px 8px' }}
            onChange={(e) => onCustom({ ...custom, to: e.target.value })} />
        </div>
      )}
    </div>
  );
}
