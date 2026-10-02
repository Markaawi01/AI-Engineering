'use client';

import type { ChatMessage } from '@/lib/tools';
import { DataTable } from './DataTable';
import { JokeCard, JokeList } from './JokeCard';
import { MovieCards, RecommendationList } from './MovieCards';

type Part = ChatMessage['parts'][number];

const LOADING_TEXT: Record<string, string> = {
  queryDatabase: 'Querying the database…',
  getMovieInfo: 'Looking up movie details…',
  recommendMovies: 'Finding recommendations…',
  getJoke: 'Fetching a joke…',
  searchJokes: 'Searching jokes…',
  getTopJokes: 'Loading top jokes…',
};

function Loading({ tool }: { tool: string }) {
  return (
    <div className="flex items-center gap-2 rounded-xl border border-dashed border-zinc-300 dark:border-zinc-700 px-3 py-3 text-sm text-zinc-500">
      <span className="h-4 w-4 rounded-full border-2 border-zinc-300 border-t-zinc-600 animate-spin" />
      {LOADING_TEXT[tool] ?? 'Working…'}
    </div>
  );
}

export function ErrorCard({ message }: { message: string }) {
  return (
    <div role="alert" className="rounded-xl border border-red-200 bg-red-50 dark:bg-red-950 dark:border-red-800 px-3 py-2 text-sm text-red-700 dark:text-red-300">
      ⚠️ {message}
    </div>
  );
}

// Renders one tool part of a message according to its state and tool name
export function ToolResult({ part }: { part: Part }) {
  if (!part.type.startsWith('tool-')) return null;
  const tool = part.type.slice(5);
  const p = part as Extract<Part, { type: `tool-${string}` }>;

  if (p.state === 'input-streaming' || p.state === 'input-available') return <Loading tool={tool} />;
  if (p.state === 'output-error') return <ErrorCard message={p.errorText} />;

  switch (p.type) {
    case 'tool-queryDatabase':
      return <DataTable result={p.output} />;
    case 'tool-getMovieInfo':
      return <MovieCards results={p.output.results} />;
    case 'tool-recommendMovies':
      return <RecommendationList data={p.output} />;
    case 'tool-getJoke':
      return <JokeCard joke={p.output.joke} note={p.output.note} />;
    case 'tool-searchJokes':
    case 'tool-getTopJokes':
      return <JokeList keyword={p.output.keyword} jokes={p.output.jokes} note={'note' in p.output ? p.output.note : undefined} />;
    default:
      return null;
  }
}
