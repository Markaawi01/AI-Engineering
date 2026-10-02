'use client';

import { useState } from 'react';
import type { JokeView } from '@/lib/tools/jokes';

const CATEGORY_STYLE = {
  dad: 'from-amber-50 to-orange-100 border-amber-200 dark:from-amber-950 dark:to-orange-950 dark:border-amber-800',
  programming: 'from-sky-50 to-indigo-100 border-sky-200 dark:from-sky-950 dark:to-indigo-950 dark:border-sky-800',
  general: 'from-emerald-50 to-teal-100 border-emerald-200 dark:from-emerald-950 dark:to-teal-950 dark:border-emerald-800',
};
const CATEGORY_ICON = { dad: '👨', programming: '💻', general: '😄' };

export function JokeCard({ joke: initial, note }: { joke: JokeView; note?: string }) {
  const [joke, setJoke] = useState(initial);
  const [voted, setVoted] = useState<'up' | 'down' | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function vote(v: 'up' | 'down') {
    if (voted) return;
    setVoted(v); // optimistic: show the vote right away
    setError(null);
    try {
      const res = await fetch(`/api/jokes/${encodeURIComponent(joke.id)}/vote`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vote: v }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setJoke(data);
    } catch (e) {
      setVoted(null);
      setError(e instanceof Error ? e.message : 'Vote failed');
    }
  }

  return (
    <div className={`rounded-xl border bg-gradient-to-br p-4 ${CATEGORY_STYLE[joke.category]}`}>
      <p className="text-xs uppercase tracking-wide text-zinc-500 mb-1">
        {CATEGORY_ICON[joke.category]} {joke.category} joke · {joke.source === 'local' ? 'offline collection' : 'icanhazdadjoke'}
      </p>
      <p className="text-base font-medium leading-relaxed">{joke.text}</p>
      <div className="flex items-center gap-2 mt-3">
        <button
          onClick={() => vote('up')}
          disabled={!!voted}
          aria-label="Thumbs up"
          className={`rounded-full px-3 py-1 text-sm border bg-white/70 dark:bg-black/30 ${voted === 'up' ? 'ring-2 ring-green-500' : ''} disabled:cursor-default`}
        >
          👍 {joke.thumbsUp}
        </button>
        <button
          onClick={() => vote('down')}
          disabled={!!voted}
          aria-label="Thumbs down"
          className={`rounded-full px-3 py-1 text-sm border bg-white/70 dark:bg-black/30 ${voted === 'down' ? 'ring-2 ring-red-500' : ''} disabled:cursor-default`}
        >
          👎 {joke.thumbsDown}
        </button>
        {voted && <span className="text-xs text-zinc-500">Thanks for rating!</span>}
      </div>
      {note && <p className="text-xs text-amber-700 dark:text-amber-400 mt-2">{note}</p>}
      {error && <p className="text-xs text-red-600 mt-2">{error}</p>}
    </div>
  );
}

export function JokeList({ keyword, jokes, note }: { keyword: string; jokes: JokeView[]; note?: string }) {
  if (jokes.length === 0) {
    return <p className="text-sm text-zinc-500">No jokes found for “{keyword}”.</p>;
  }
  return (
    <div className="space-y-2">
      <p className="text-xs text-zinc-500">🔎 {jokes.length} joke{jokes.length === 1 ? '' : 's'} for “{keyword}”</p>
      {jokes.map((j) => (
        <JokeCard key={j.id} joke={j} />
      ))}
      {note && <p className="text-xs text-amber-700">{note}</p>}
    </div>
  );
}
