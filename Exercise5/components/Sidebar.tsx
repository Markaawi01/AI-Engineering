'use client';

import { useEffect, useState } from 'react';

type Stats = {
  tools: { tool: string; calls: number; successRate: number; cacheHits: number; fallbacks: number; avgMs: number; p95Ms: number }[];
  database: { movies: number; jokes: number; cachedApiResponses: number; conversations: number; errorsLast24h: number };
  circuits: { omdb: string; jokes: string };
};

type Settings = {
  pageSize: number;
  defaultJokeCategory: 'dad' | 'programming' | 'general';
  model: string;
  availableModels: string[];
};

const CIRCUIT_COLOR: Record<string, string> = { CLOSED: 'text-green-600', HALF_OPEN: 'text-amber-600', OPEN: 'text-red-600' };

// Tool usage statistics + user settings. `refreshKey` changes after every answer so stats stay current.
export function Sidebar({ refreshKey }: { refreshKey: number }) {
  const [stats, setStats] = useState<Stats | null>(null);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetch('/api/stats')
      .then(async (r) => (r.ok ? setStats(await r.json()) : setError((await r.json()).error)))
      .catch(() => setError('Could not load statistics'));
  }, [refreshKey]);

  useEffect(() => {
    fetch('/api/settings')
      .then(async (r) => r.ok && setSettings(await r.json()))
      .catch(() => {});
  }, []);

  async function update(changes: Partial<Settings>) {
    setSaved(false);
    const res = await fetch('/api/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(changes),
    });
    if (res.ok) {
      setSettings(await res.json());
      setSaved(true);
    }
  }

  return (
    <aside className="space-y-5 text-sm">
      <section>
        <h2 className="font-semibold mb-2">📊 Tool usage</h2>
        {error && <p className="text-red-600 text-xs">{error}</p>}
        {!stats && !error && <p className="text-zinc-500 text-xs">Loading…</p>}
        {stats && stats.tools.length === 0 && <p className="text-zinc-500 text-xs">No tools used yet.</p>}
        {stats && stats.tools.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-zinc-500">
                  <th className="py-1 pr-2">Tool</th><th className="pr-2">Calls</th><th className="pr-2">OK</th><th className="pr-2">Avg</th><th>Cache</th>
                </tr>
              </thead>
              <tbody>
                {stats.tools.map((t) => (
                  <tr key={t.tool} className="border-t border-zinc-100 dark:border-zinc-800">
                    <td className="py-1 pr-2">{t.tool}</td>
                    <td className="pr-2">{t.calls}</td>
                    <td className="pr-2">{t.successRate}%</td>
                    <td className="pr-2">{t.avgMs}ms</td>
                    <td>{t.cacheHits}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {stats && (
          <ul className="mt-2 text-xs text-zinc-500 space-y-0.5">
            <li>Movies: {stats.database.movies} · Jokes: {stats.database.jokes}</li>
            <li>Cached API responses: {stats.database.cachedApiResponses}</li>
            <li>Errors (24h): {stats.database.errorsLast24h}</li>
            <li>
              OMDb: <span className={CIRCUIT_COLOR[stats.circuits.omdb]}>{stats.circuits.omdb}</span> · Jokes API:{' '}
              <span className={CIRCUIT_COLOR[stats.circuits.jokes]}>{stats.circuits.jokes}</span>
            </li>
          </ul>
        )}
      </section>

      {settings && (
        <section className="space-y-2">
          <h2 className="font-semibold">⚙️ Settings</h2>
          <label className="flex items-center justify-between gap-2">
            Rows per page
            <select value={settings.pageSize} onChange={(e) => update({ pageSize: Number(e.target.value) })} className="border rounded px-1 py-0.5 bg-transparent">
              {[5, 10, 20, 50].map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </label>
          <label className="flex items-center justify-between gap-2">
            Default joke
            <select
              value={settings.defaultJokeCategory}
              onChange={(e) => update({ defaultJokeCategory: e.target.value as Settings['defaultJokeCategory'] })}
              className="border rounded px-1 py-0.5 bg-transparent"
            >
              <option value="dad">Dad</option>
              <option value="programming">Programming</option>
              <option value="general">General</option>
            </select>
          </label>
          <label className="flex items-center justify-between gap-2">
            Model
            <select value={settings.model} onChange={(e) => update({ model: e.target.value })} className="border rounded px-1 py-0.5 bg-transparent max-w-40">
              {settings.availableModels.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
          </label>
          {saved && <p className="text-xs text-green-600">Saved</p>}
        </section>
      )}
    </aside>
  );
}
