import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getManyMovieDetails, getMovieDetails, recommendMovies, resetOmdbBreaker } from '@/lib/tools/movies';
import { ApiCache } from '@/lib/models';
import { closeTestDatabase, jsonResponse, resetTestDatabase } from './helpers';

const inception = {
  Response: 'True', Title: 'Inception', Year: '2010', Genre: 'Action, Adventure, Sci-Fi', Director: 'Christopher Nolan',
  Actors: 'Leonardo DiCaprio, Joseph Gordon-Levitt', Plot: 'A thief steals secrets through dreams.', Runtime: '148 min',
  Poster: 'https://example.com/inception.jpg', imdbRating: '8.8', imdbID: 'tt1375666',
  Ratings: [{ Source: 'Internet Movie Database', Value: '8.8/10' }],
};

beforeEach(async () => {
  await resetTestDatabase();
  resetOmdbBreaker();
  vi.stubEnv('OMDB_API_KEY', 'test-key');
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
afterAll(closeTestDatabase);

describe('movie tool', () => {
  it('fetches details from OMDb and caches them in MongoDB', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(inception));
    vi.stubGlobal('fetch', fetchMock);

    const first = await getMovieDetails({ title: 'Inception' });
    expect(first).toMatchObject({ found: true, source: 'omdb' });
    if (first.found) {
      expect(first.movie.actors).toContain('Leonardo DiCaprio');
      expect(first.movie.poster).toBe('https://example.com/inception.jpg');
      expect(first.movie.runtime).toBe('148 min');
    }
    expect(String(fetchMock.mock.calls[0][0])).toContain('t=Inception');

    const second = await getMovieDetails({ title: 'inception' }); // different case, same cache key
    expect(second.source).toBe('cache');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(await ApiCache.countDocuments()).toBe(1);
  });

  it('supports partial titles: exact miss -> search -> details', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      const params = new URL(url).searchParams;
      if (params.get('t')) return jsonResponse({ Response: 'False', Error: 'Movie not found!' });
      if (params.get('s')) return jsonResponse({ Response: 'True', Search: [{ Title: 'Inception', Year: '2010', imdbID: 'tt1375666', Poster: 'N/A' }] });
      return jsonResponse(inception);
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await getMovieDetails({ title: 'incep' });
    expect(result).toMatchObject({ found: true, note: 'Closest match for "incep"' });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('handles "Movie not found" responses', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ Response: 'False', Error: 'Movie not found!' })));
    const result = await getMovieDetails({ title: 'Zzzxqq Nothing' });
    expect(result).toMatchObject({ found: false, source: 'omdb' });
  });

  it('falls back to the local database when OMDb fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({}, 503)));
    const result = await getMovieDetails({ title: 'Matrix' });
    expect(result).toMatchObject({ found: true, source: 'local' });
    expect(result.note).toMatch(/OMDb unavailable/);
  });

  it('falls back when there is no API key or the key is invalid', async () => {
    vi.stubEnv('OMDB_API_KEY', '');
    const noKey = await getMovieDetails({ title: 'Dune' });
    expect(noKey).toMatchObject({ found: true, source: 'local' });
    expect(noKey.note).toMatch(/key not set/);

    vi.stubEnv('OMDB_API_KEY', 'wrong');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ Response: 'False', Error: 'Invalid API key!' })));
    const badKey = await getMovieDetails({ title: 'Coco' });
    expect(badKey).toMatchObject({ found: true, source: 'local' });
  });

  it('batch: several movies in one call, in the same order', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({}, 503)));
    const { results } = await getManyMovieDetails([{ title: 'Up' }, { title: 'Alien' }, { title: 'Coco' }]);
    expect(results.map((r) => (r.found ? r.movie.title : null))).toEqual(['Up', 'Alien', 'Coco']);
  });

  it('recommends by genre and year range', async () => {
    const result = await recommendMovies({ genre: 'drama', year: 1995, limit: 3 });
    expect(result.movies.length).toBeGreaterThan(0);
    expect(result.movies.every((m) => m.genre === 'Drama' && m.year >= 1990 && m.year <= 2000)).toBe(true);
    expect(result.movies[0].rating).toBeGreaterThanOrEqual(result.movies.at(-1)!.rating);
  });
});
