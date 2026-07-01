interface Column<T> {
  key: string;
  header: string;
  render?: (row: T) => React.ReactNode;
}

export default function DataTable<T extends Record<string, any>>({
  columns,
  rows,
  emptyText = 'Keine Einträge.',
}: {
  columns: Column<T>[];
  rows: T[];
  emptyText?: string;
}) {
  return (
    <div className="rounded-xl border border-line overflow-hidden">
      <table className="w-full border-collapse text-[12.5px]">
        <thead>
          <tr>
            {columns.map(col => (
              <th key={col.key} className="text-left px-3 py-2.5 bg-navy2 text-steel2 font-semibold text-[11px] uppercase tracking-wide border-b border-line">
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr><td colSpan={columns.length} className="px-3 py-6 text-center text-steel">{emptyText}</td></tr>
          ) : rows.map((row, i) => (
            <tr key={i} className={i % 2 === 0 ? 'bg-panel' : 'bg-navy2/50'}>
              {columns.map(col => (
                <td key={col.key} className="px-3 py-2.5 border-b border-line/50 text-steel2">
                  {col.render ? col.render(row) : row[col.key] ?? '—'}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
