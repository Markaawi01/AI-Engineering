/* eslint-disable @next/next/no-img-element -- plain <img> with native lazy loading; posters come from many domains */
import type { MovieResult, recommendMovies } from '@/lib/tools/movies';

type Recommendations = Awaited<ReturnType<typeof recommendMovies>>;

const SOURCE_LABEL = { omdb: 'OMDb', cache: 'Cached', local: 'Local database' } as const;

function MovieCard({ result }: { result: MovieResult }) {
  if (!result.found) {
    return (
      <div className="rounded-xl border border-zinc-200 dark:border-zinc-700 p-3 text-sm">
        <p>🎬 No movie found for “{result.query}”.</p>
        {result.suggestions.length > 0 && <p className="text-zinc-500 mt-1">Did you mean: {result.suggestions.join(', ')}?</p>}
        {result.note && <p className="text-amber-600 text-xs mt-1">{result.note}</p>}
      </div>
    );
  }

  const m = result.movie;
  return (
    <div className="flex flex-col sm:flex-row gap-3 rounded-xl border border-zinc-200 dark:border-zinc-700 p-3">
      {m.poster ? (
        <img
          src={m.poster}
          alt={`Poster of ${m.title}`}
          loading="lazy" // lazy loading: only downloaded when scrolled into view
          decoding="async"
          width={120}
          height={178}
          className="w-28 h-auto rounded-lg object-cover self-start bg-zinc-200"
        />
      ) : (
        <div className="w-28 h-40 rounded-lg bg-zinc-200 dark:bg-zinc-800 flex items-center justify-center text-3xl shrink-0">🎬</div>
      )}
      <div className="text-sm space-y-1 min-w-0">
        <p className="font-semibold text-base">
          {m.title} {m.year && <span className="font-normal text-zinc-500">({m.year})</span>}
        </p>
        <p className="text-zinc-500">{[m.genre, m.runtime, m.director && `Dir. ${m.director}`].filter(Boolean).join(' · ')}</p>
        {m.plot && <p>{m.plot}</p>}
        {m.actors.length > 0 && <p><span className="text-zinc-500">Cast:</span> {m.actors.join(', ')}</p>}
        <div className="flex flex-wrap gap-1 pt-1">
          {m.ratings.map((r) => (
            <span key={r.source} className="text-xs rounded-full bg-amber-100 text-amber-900 px-2 py-0.5">
              ⭐ {r.source}: {r.value}
            </span>
          ))}
          <span className="text-xs rounded-full bg-zinc-100 dark:bg-zinc-800 px-2 py-0.5">{SOURCE_LABEL[result.source]}</span>
        </div>
        {result.note && <p className="text-amber-600 text-xs">{result.note}</p>}
      </div>
    </div>
  );
}

export function MovieCards({ results }: { results: MovieResult[] }) {
  return (
    <div className="space-y-2">
      {results.map((r, i) => (
        <MovieCard key={i} result={r} />
      ))}
    </div>
  );
}

export function RecommendationList({ data }: { data: Recommendations }) {
  return (
    <div className="rounded-xl border border-zinc-200 dark:border-zinc-700 p-3 text-sm">
      <p className="text-xs text-zinc-500 mb-2">
        🍿 Genre: {data.criteria.genre} · Years: {data.criteria.years} · Rating ≥ {data.criteria.minRating}
      </p>
      {data.movies.length === 0 ? (
        <p>No recommendations match these filters.</p>
      ) : (
        <ol className="list-decimal pl-5 space-y-1">
          {data.movies.map((m) => (
            <li key={m.title}>
              <strong>{m.title}</strong> ({m.year}) — {m.genre}, ⭐ {m.rating} · {m.director}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
