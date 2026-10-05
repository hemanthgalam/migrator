import type { Preview } from '../lib/types';

const cell = (v: unknown) => (v === null || v === undefined ? <span className="text-3 italic">null</span> : typeof v === 'object' ? JSON.stringify(v) : String(v));

export function DataTable({ data, maxRows = 50, testId }: { data: Preview; maxRows?: number; testId?: string }) {
  if (!data.rows.length) return <p className="px-4 py-8 text-center text-sm text-3">No rows.</p>;
  return (
    <div className="max-h-96 overflow-auto rounded-lg border border-default" data-testid={testId}>
      <table className="w-full font-mono text-xs">
        <thead className="sticky top-0 surface-2">
          <tr>
            {data.columns.map((c) => <th key={c} className="border-b border-default px-3 py-2 text-left font-medium whitespace-nowrap text-2">{c}</th>)}
          </tr>
        </thead>
        <tbody>
          {data.rows.slice(0, maxRows).map((r, i) => (
            <tr key={i} className="odd:bg-[var(--surface-1)] even:bg-[var(--surface-2)]/50">
              {data.columns.map((c) => <td key={c} className="max-w-64 truncate px-3 py-1.5 whitespace-nowrap text-1">{cell(r[c])}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
