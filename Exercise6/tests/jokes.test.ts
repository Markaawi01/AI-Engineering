import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getJoke, rateJoke, resetJokeBreaker, searchJokes, topJokes } from '@/lib/tools/jokes';
import { Joke } from '@/lib/models';
import { closeTestDatabase, jsonResponse, resetTestDatabase } from './helpers';

beforeEach(async () => {
  await resetTestDatabase();
  resetJokeBreaker();
});
afterEach(() => vi.unstubAllGlobals());
afterAll(closeTestDatabase);

describe('jokes tool', () => {
  it('fetches a random dad joke with the right headers and saves it', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ id: 'abc', joke: 'A test joke.', status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await getJoke({ category: 'dad' });

    expect(result.fallback).toBe(false);
    expect(result.joke).toMatchObject({ id: 'abc', text: 'A test joke.', source: 'icanhazdadjoke' });
    expect(fetchMock.mock.calls[0][1].headers.Accept).toBe('application/json');
    expect(await Joke.exists({ jokeId: 'abc' })).toBeTruthy(); // stored for offline use
  });

  it('falls back to the local database when the API is down', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('fetch failed')));

    const result = await getJoke({ category: 'programming' });

    expect(result.fallback).toBe(true);
    expect(result.joke.category).toBe('programming');
    expect(result.joke.source).toBe('local');
  });

  it('opens the circuit after repeated failures and stops calling the API', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({}, 500));
    vi.stubGlobal('fetch', fetchMock);

    for (let i = 0; i < 3; i++) await getJoke({ category: 'dad' }); // each one falls back
    const callsWhenOpened = fetchMock.mock.calls.length;
    await getJoke({ category: 'dad' });

    expect(fetchMock.mock.calls.length).toBe(callsWhenOpened); // no new API calls while open
  });

  it('searches by keyword and merges API results with saved jokes', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ results: [{ id: 'cat1', joke: 'My cat is a purr-fectionist.' }], total_jokes: 1 })));
    const result = await searchJokes({ keyword: 'cat' });
    expect(result.jokes.map((j) => j.id)).toContain('cat1');
  });

  it('search still works offline using the text index', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('fetch failed')));
    const result = await searchJokes({ keyword: 'bugs' });
    expect(result.note).toMatch(/unavailable/);
    expect(result.jokes[0].text).toMatch(/bugs/i);
  });

  it('validates the search keyword', async () => {
    await expect(searchJokes({ keyword: '   ' })).rejects.toThrow(/1-50 characters/);
  });

  it('counts thumbs up / down and ranks top jokes', async () => {
    await rateJoke('local-2', 'up');
    await rateJoke('local-2', 'up');
    await rateJoke('local-3', 'up');
    const down = await rateJoke('local-3', 'down');
    expect(down).toMatchObject({ thumbsUp: 1, thumbsDown: 1 });

    const top = await topJokes();
    expect(top.jokes[0].id).toBe('local-2');
    await expect(rateJoke('missing', 'up')).rejects.toThrow('Joke not found');
  });
});
