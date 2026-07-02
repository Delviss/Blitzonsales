import { InboxIcon } from './icons';

interface Column<T> {
  key: string;
  header: string;
  render?: (row: T) => React.ReactNode;
  align?: 'left' | 'right';
}

export default function DataTable<T extends Record<string, any>>({
  columns,
  rows,
  emptyText = 'Keine Einträge vorhanden.',
  title,
}: {
  columns: Column<T>[];
  rows: T[];
  emptyText?: string;
  title?: string;
}) {
  return (
    <div className="card overflow-hidden animate-fade-up">
      {title && (
        <div className="px-5 py-3.5 border-b border-line flex items-center justify-between">
          <h2 className="font-bold text-white text-sm">{title}</h2>
          <span className="text-[11px] text-steel font-semibold tabular-nums">
            {rows.length} {rows.length === 1 ? 'Eintrag' : 'Einträge'}
          </span>
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-[13px]">
          <thead>
            <tr>
              {columns.map(col => (
                <th
                  key={col.key}
                  className={`px-4 py-3 bg-navy2/70 text-steel font-semibold text-[10.5px] uppercase tracking-wider border-b border-line ${
                    col.align === 'right' ? 'text-right' : 'text-left'
                  }`}
                >
                  {col.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="px-4 py-14 text-center">
                  <div className="flex flex-col items-center gap-2 text-steel">
                    <InboxIcon size={26} className="opacity-60" />
                    <span className="text-sm">{emptyText}</span>
                  </div>
                </td>
              </tr>
            ) : rows.map((row, i) => (
              <tr
                key={i}
                className="group border-b border-line/40 last:border-b-0 transition-colors duration-150 hover:bg-brand/[0.045]"
              >
                {columns.map(col => (
                  <td
                    key={col.key}
                    className={`px-4 py-3 text-steel2 tabular-nums ${col.align === 'right' ? 'text-right' : ''}`}
                  >
                    {col.render ? col.render(row) : row[col.key] ?? '—'}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
