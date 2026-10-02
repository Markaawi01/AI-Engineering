'use client';

import { useState } from 'react';
import type { DatabaseResult } from '@/lib/tools/database';

const format = (value: unknown) => {
  if (value == null) return '—';
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(value)) return value.slice(0, 10);
  return String(value);
};

// Database results as a table, with Previous/Next buttons that call /api/query directly
export function DataTable({ result: initial }: { result: DatabaseResult }) {
  const [result, setResult] = useState(initial);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showQuery, setShowQuery] = useState(false);
  const { metadata: meta } = result;

  async function goToPage(page: number) {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...result.spec, page }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setResult(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load page');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="rounded-xl border border-zinc-200 dark:border-zinc-700 overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 bg-zinc-50 dark:bg-zinc-800 text-xs text-zinc-600 dark:text-zinc-300">
        <span>
          🗄️ <strong>{meta.collection}</strong> · {meta.operation} · {meta.total} result{meta.total === 1 ? '' : 's'} · {meta.durationMs} ms
        </span>
        <button onClick={() => setShowQuery((s) => !s)} className="underline">
          {showQuery ? 'Hide' : 'Show'} MongoDB query
        </button>
      </div>

      {showQuery && (
        <pre className="px-3 py-2 text-xs bg-zinc-900 text-green-300 overflow-x-auto whitespace-pre-wrap break-all">
          {meta.mongoQuery}
        </pre>
      )}

      {result.rows.length === 0 ? (
        <p className="px-3 py-4 text-sm text-zinc-500">No matching records.</p>
      ) : (
        <div className={`overflow-x-auto ${loading ? 'opacity-50' : ''}`}>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left border-b border-zinc-200 dark:border-zinc-700">
                {result.columns.map((c) => (
                  <th key={c} className="px-3 py-2 font-semibold whitespace-nowrap">{c}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {result.rows.map((row, i) => (
                <tr key={i} className="border-b last:border-0 border-zinc-100 dark:border-zinc-800 align-top">
                  {result.columns.map((c) => (
                    <td key={c} className={`px-3 py-2 ${c === 'description' || c === 'comment' ? 'min-w-56' : 'whitespace-nowrap'}`}>
                      {format(row[c])}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {meta.totalPages > 1 && (
        <div className="flex items-center justify-between px-3 py-2 text-xs border-t border-zinc-200 dark:border-zinc-700">
          <button disabled={loading || meta.page <= 1} onClick={() => goToPage(meta.page - 1)} className="px-2 py-1 rounded border disabled:opacity-40">
            ← Previous
          </button>
          <span>Page {meta.page} of {meta.totalPages}</span>
          <button disabled={loading || meta.page >= meta.totalPages} onClick={() => goToPage(meta.page + 1)} className="px-2 py-1 rounded border disabled:opacity-40">
            Next →
          </button>
        </div>
      )}
      {error && <p className="px-3 py-2 text-xs text-red-600">{error}</p>}
    </div>
  );
}
