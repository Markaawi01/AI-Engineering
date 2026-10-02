import { connectDB } from '../db';
import { Movie } from '../models';
import { getCached, setCached } from '../cache';
import { ApiError, CircuitBreaker, RateLimiter, RateLimitError, fetchJson, withRetry } from '../resilience';
import { logError } from '../logger';

const OMDB_URL = 'https://www.omdbapi.com/';
const CACHE_TTL = 60 * 60 * 24 * 7; // found movies: 7 days
const NOT_FOUND_TTL = 60 * 60 * 24; // "not found": 1 day

// OMDb free tier = 1000 requests/day
export const omdbLimiter = new RateLimiter(1000, 24 * 60 * 60 * 1000);
export let omdbBreaker = new CircuitBreaker('OMDb', 3, 30_000);

export function resetOmdbBreaker() {
  omdbBreaker = new CircuitBreaker('OMDb', 3, 30_000);
}

export type MovieDetails = {
  title: string;
  year: number | null;
  genre: string | null;
  director: string | null;
  actors: string[];
  plot: string | null;
  runtime: string | null;
  poster: string | null;
  ratings: { source: string; value: string }[];
  imdbRating: number | null;
  imdbID: string | null;
};

export type MovieResult =
  | { type: 'movie'; found: true; movie: MovieDetails; source: 'omdb' | 'cache' | 'local'; note?: string }
  | { type: 'movie'; found: false; query: string; source: 'omdb' | 'cache' | 'local'; note?: string; suggestions: string[] };

type OmdbMovie = {
  Response: 'True' | 'False';
  Error?: string;
  Title: string; Year: string; Genre: string; Director: string; Actors: string;
  Plot: string; Runtime: string; Poster: string; imdbRating: string; imdbID: string;
  Ratings?: { Source: string; Value: string }[];
};

type OmdbSearch = {
  Response: 'True' | 'False';
  Error?: string;
  Search?: { Title: string; Year: string; imdbID: string; Poster: string }[];
};

const na = (v?: string) => (!v || v === 'N/A' ? null : v);

function fromOmdb(m: OmdbMovie): MovieDetails {
  return {
    title: m.Title,
    year: parseInt(m.Year) || null,
    genre: na(m.Genre),
    director: na(m.Director),
    actors: na(m.Actors)?.split(',').map((a) => a.trim()) ?? [],
    plot: na(m.Plot),
    runtime: na(m.Runtime),
    poster: na(m.Poster),
    ratings: (m.Ratings ?? []).map((r) => ({ source: r.Source, value: r.Value })),
    imdbRating: parseFloat(m.imdbRating) || null,
    imdbID: na(m.imdbID),
  };
}

function fromLocal(m: { title: string; year: number; genre: string; director: string; description: string; rating: number }): MovieDetails {
  return {
    title: m.title, year: m.year, genre: m.genre, director: m.director, actors: [],
    plot: m.description, runtime: null, poster: null,
    ratings: [{ source: 'Local database', value: `${m.rating}/10` }],
    imdbRating: m.rating, imdbID: null,
  };
}

// One OMDb call, protected by rate limiter + circuit breaker + retry
async function callOmdb<T extends { Response: string; Error?: string }>(params: Record<string, string>): Promise<T> {
  const apiKey = process.env.OMDB_API_KEY;
  if (!apiKey) throw new ApiError('OMDB_API_KEY is not set', 401, false);
  if (!omdbLimiter.tryAcquire()) throw new RateLimitError('OMDb');

  const url = `${OMDB_URL}?${new URLSearchParams({ ...params, apikey: apiKey })}`;
  const data = await omdbBreaker.call(() => withRetry(() => fetchJson<T>(url)));

  if (data.Response === 'False' && data.Error && !/not found/i.test(data.Error)) {
    // e.g. "Invalid API key!" or "Request limit reached!" - retrying won't help
    throw new ApiError(`OMDb: ${data.Error}`, 400, false);
  }
  return data;
}

// Fallback: look in our own movies collection (partial, case-insensitive title match)
async function findLocal(title: string, year?: number) {
  await connectDB();
  const escaped = title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const filter: Record<string, unknown> = { title: { $regex: escaped, $options: 'i' } };
  if (year) filter.year = year;
  return Movie.find(filter).sort({ rating: -1 }).limit(5).lean();
}

export async function getMovieDetails({ title, year }: { title: string; year?: number }): Promise<MovieResult> {
  title = title.trim();
  if (!title || title.length > 200) throw new ApiError('Please give a movie title (1-200 characters)', 400, false);

  const cacheKey = `omdb:${title.toLowerCase()}:${year ?? ''}`;
  await connectDB();
  const cached = await getCached<MovieResult>(cacheKey);
  if (cached) return { ...cached, source: 'cache' };

  let note: string | undefined;
  try {
    // 1. Exact title
    const exact = await callOmdb<OmdbMovie>({ t: title, plot: 'short', ...(year && { y: String(year) }) });
    let result: MovieResult | null = exact.Response === 'True'
      ? { type: 'movie', found: true, movie: fromOmdb(exact), source: 'omdb' }
      : null;

    // 2. Partial title: search, then load the best match
    if (!result) {
      const search = await callOmdb<OmdbSearch>({ s: title, type: 'movie', ...(year && { y: String(year) }) });
      const first = search.Search?.[0];
      if (first) {
        const details = await callOmdb<OmdbMovie>({ i: first.imdbID, plot: 'short' });
        if (details.Response === 'True') {
          result = { type: 'movie', found: true, movie: fromOmdb(details), source: 'omdb', note: `Closest match for "${title}"` };
        }
      }
      result ??= {
        type: 'movie', found: false, query: title, source: 'omdb',
        suggestions: search.Search?.slice(1, 5).map((s) => `${s.Title} (${s.Year})`) ?? [],
      };
    }

    await setCached(cacheKey, 'omdb', result, result.found ? CACHE_TTL : NOT_FOUND_TTL);
    return result;
  } catch (error) {
    // API failed (no key, outage, circuit open, rate limit) -> fall back to the local database
    if (!(error instanceof ApiError && error.status === 401)) await logError('movies/omdb', error, { title, year });
    note = error instanceof ApiError && error.status === 401
      ? 'OMDb API key not set - showing data from the local database.'
      : `OMDb unavailable (${error instanceof Error ? error.message : 'error'}) - showing data from the local database.`;
  }

  const local = await findLocal(title, year);
  if (local.length) {
    return { type: 'movie', found: true, movie: fromLocal(local[0]), source: 'local', note };
  }
  return { type: 'movie', found: false, query: title, source: 'local', note, suggestions: [] };
}

// Batch: several movies at once, 3 requests at a time, cache checked first for each
export async function getManyMovieDetails(movies: { title: string; year?: number }[]) {
  const results: MovieResult[] = new Array(movies.length);
  let next = 0;
  const worker = async () => {
    while (next < movies.length) {
      const i = next++;
      results[i] = await getMovieDetails(movies[i]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(3, movies.length) }, worker));
  return { type: 'movieList' as const, results };
}

// Recommendations from our database: same genre, similar years, best rated first
export async function recommendMovies({
  genre, year, minRating = 7, limit = 5,
}: { genre?: string; year?: number; minRating?: number; limit?: number }) {
  await connectDB();
  const filter: Record<string, unknown> = { rating: { $gte: minRating } };
  if (genre) filter.genre = { $regex: `^${genre.replace(/[^a-z-]/gi, '')}$`, $options: 'i' };
  if (year) filter.year = { $gte: year - 5, $lte: year + 5 };

  const movies = await Movie.find(filter).sort({ rating: -1 }).limit(Math.min(limit, 10)).lean();
  return {
    type: 'recommendations' as const,
    criteria: { genre: genre ?? 'any', years: year ? `${year - 5}-${year + 5}` : 'any', minRating },
    movies: movies.map((m) => ({ title: m.title, year: m.year, genre: m.genre, rating: m.rating, director: m.director })),
  };
}
