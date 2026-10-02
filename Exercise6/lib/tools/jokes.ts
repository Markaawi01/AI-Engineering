import { connectDB } from '../db';
import { Joke } from '../models';
import { ApiError, CircuitBreaker, RateLimiter, RateLimitError, fetchJson, withRetry } from '../resilience';
import { logError } from '../logger';

const API_URL = 'https://icanhazdadjoke.com';
const HEADERS = {
  Accept: 'application/json',
  'User-Agent': 'AI SDK Exercise 5 (learning project)', // the API asks for a User-Agent
};

export type JokeCategory = 'dad' | 'programming' | 'general';

// icanhazdadjoke only has dad jokes, so categories are made by searching for topic words
const CATEGORY_TERMS: Record<Exclude<JokeCategory, 'dad'>, string[]> = {
  programming: ['computer', 'program', 'keyboard', 'internet', 'robot', 'email'],
  general: ['food', 'animal', 'school', 'music', 'car', 'doctor'],
};

// Be polite to a free API: at most 30 calls per minute from this server
export const jokeLimiter = new RateLimiter(30, 60_000);
export let jokeBreaker = new CircuitBreaker('icanhazdadjoke', 3, 30_000);

export function resetJokeBreaker() {
  jokeBreaker = new CircuitBreaker('icanhazdadjoke', 3, 30_000);
}

type ApiJoke = { id: string; joke: string };
type ApiSearch = { results: ApiJoke[]; total_jokes: number };

export type JokeView = {
  id: string;
  text: string;
  category: JokeCategory;
  source: 'icanhazdadjoke' | 'local';
  thumbsUp: number;
  thumbsDown: number;
};

const toView = (j: { jokeId: string; text: string; category: string; source: string; thumbsUp: number; thumbsDown: number }): JokeView => ({
  id: j.jokeId,
  text: j.text,
  category: j.category as JokeCategory,
  source: j.source as JokeView['source'],
  thumbsUp: j.thumbsUp,
  thumbsDown: j.thumbsDown,
});

async function callApi<T>(path: string): Promise<T> {
  if (!jokeLimiter.tryAcquire()) throw new RateLimitError('icanhazdadjoke');
  return jokeBreaker.call(() => withRetry(() => fetchJson<T>(`${API_URL}${path}`, { headers: HEADERS, timeoutMs: 5000 })));
}

// Save API jokes so they work offline later. Keeps existing votes.
async function saveJokes(jokes: ApiJoke[], category: JokeCategory) {
  if (!jokes.length) return [];
  await Joke.bulkWrite(
    jokes.map((j) => ({
      updateOne: {
        filter: { jokeId: j.id },
        update: { $setOnInsert: { jokeId: j.id, text: j.joke.trim(), category, source: 'icanhazdadjoke' } },
        upsert: true,
      },
    }))
  );
  const saved = await Joke.find({ jokeId: { $in: jokes.map((j) => j.id) } }).lean();
  return saved.map(toView);
}

async function randomLocalJoke(category: JokeCategory) {
  const [joke] = await Joke.aggregate([{ $match: { category } }, { $sample: { size: 1 } }]);
  return joke ? toView(joke) : null;
}

export async function getJoke({ category = 'dad' }: { category?: JokeCategory }) {
  await connectDB();

  try {
    let apiJoke: ApiJoke | undefined;
    if (category === 'dad') {
      apiJoke = await callApi<ApiJoke>('/');
    } else {
      const terms = CATEGORY_TERMS[category];
      const term = terms[Math.floor(Math.random() * terms.length)];
      const { results } = await callApi<ApiSearch>(`/search?term=${encodeURIComponent(term)}&limit=20`);
      apiJoke = results[Math.floor(Math.random() * results.length)];
    }
    if (apiJoke) {
      const [saved] = await saveJokes([apiJoke], category);
      return { type: 'joke' as const, joke: saved, fallback: false };
    }
  } catch (error) {
    await logError('jokes/api', error, { category });
  }

  // Fallback: a random joke we saved earlier (or one from the seed data)
  const local = await randomLocalJoke(category);
  if (!local) throw new ApiError('No jokes available right now - the joke API is down and the local joke list is empty.', 503, false);
  return {
    type: 'joke' as const,
    joke: local,
    fallback: true,
    note: 'The joke API is unavailable, so this joke comes from the local database.',
  };
}

export async function searchJokes({ keyword, limit = 5 }: { keyword: string; limit?: number }) {
  keyword = keyword.trim();
  if (!keyword || keyword.length > 50) throw new ApiError('Search keyword must be 1-50 characters', 400, false);
  limit = Math.min(Math.max(limit, 1), 10);
  await connectDB();

  let note: string | undefined;
  try {
    const { results } = await callApi<ApiSearch>(`/search?term=${encodeURIComponent(keyword)}&limit=${limit}`);
    await saveJokes(results, 'dad');
  } catch (error) {
    await logError('jokes/search', error, { keyword });
    note = 'The joke API is unavailable, so results come from the local database only.';
  }

  // Search the database (which now also contains the API results) with the text index
  const jokes = await Joke.find({ $text: { $search: keyword } }, { score: { $meta: 'textScore' } })
    .sort({ score: { $meta: 'textScore' } })
    .limit(limit)
    .lean();

  return { type: 'jokeList' as const, keyword, jokes: jokes.map(toView), note };
}

export async function rateJoke(jokeId: string, vote: 'up' | 'down') {
  await connectDB();
  const joke = await Joke.findOneAndUpdate(
    { jokeId },
    { $inc: vote === 'up' ? { thumbsUp: 1 } : { thumbsDown: 1 } },
    { returnDocument: 'after' }
  ).lean();
  if (!joke) throw new ApiError('Joke not found', 404, false);
  return toView(joke);
}

export async function topJokes(limit = 5) {
  await connectDB();
  const jokes = await Joke.aggregate([
    { $addFields: { score: { $subtract: ['$thumbsUp', '$thumbsDown'] } } },
    { $match: { thumbsUp: { $gt: 0 } } },
    { $sort: { score: -1, thumbsUp: -1 } },
    { $limit: Math.min(limit, 10) },
  ]);
  return { type: 'jokeList' as const, keyword: 'top rated', jokes: jokes.map(toView) };
}
