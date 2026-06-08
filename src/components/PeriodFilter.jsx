// Filtro de período (Resumen y Ventas). Valores: todo / mes / 3m / 6m / año.
const PERIODS = [
  { id: 'todo', label: 'Todo' },
  { id: 'mes',  label: 'Este mes' },
  { id: '3m',   label: '3 meses' },
  { id: '6m',   label: '6 meses' },
  { id: 'ano',  label: 'Año' },
];

export default function PeriodFilter({ value, onChange }) {
  return (
    <div className="period-bar">
      {PERIODS.map((p) => (
        <button key={p.id} className={value === p.id ? 'active' : ''} onClick={() => onChange(p.id)}>
          {p.label}
        </button>
      ))}
    </div>
  );
}
