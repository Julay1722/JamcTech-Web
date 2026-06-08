// Tabla de datos genérica. columns = [{key, label, align?, render?, className?}].
// render(row) opcional para celdas custom. onRowClick opcional.
export function DataTable({ columns, rows, onRowClick, empty = 'Sin datos', getRowKey }) {
  if (!rows || rows.length === 0) return <div className="empty">{empty}</div>;
  return (
    <table className="data">
      <thead>
        <tr>
          {columns.map((c) => (
            <th key={c.key} className={c.align === 'right' ? 'right' : ''}>{c.label}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, i) => (
          <tr key={getRowKey ? getRowKey(row) : (row.id ?? i)}
              style={onRowClick ? { cursor: 'pointer' } : undefined}
              onClick={onRowClick ? () => onRowClick(row) : undefined}>
            {columns.map((c) => {
              const cls = [c.align === 'right' ? 'right' : '', c.num ? 'num' : '', c.className || ''].filter(Boolean).join(' ');
              return <td key={c.key} className={cls}>{c.render ? c.render(row) : row[c.key]}</td>;
            })}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
