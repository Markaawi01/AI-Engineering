import { tool, type InferUITools, type UIMessage, type UIDataTypes } from 'ai';
import { z } from 'zod';
import { connectDB } from '../db';
import { Settings, ToolUsage } from '../models';
import { ToolError, friendlyError, logError } from '../logger';
import { querySpecSchema } from '../query-builder';
import { runDatabaseQuery } from './database';
import { getManyMovieDetails, recommendMovies } from './movies';
import { getJoke, searchJokes, topJokes } from './jokes';
import { createImage, IMAGE_SIZES } from './images';

// Runs a tool, measures it, saves analytics, and turns errors into friendly messages.
// Throwing here makes the AI SDK send an "output-error" part, which the UI shows as an error card.
async function track<T>(name: string, input: unknown, run: () => Promise<T>): Promise<T> {
  const started = Date.now();
  try {
    const result = await run();
    const r = result as { fallback?: boolean; source?: string; results?: { source?: string }[] };
    const cached = r.source === 'cache' || !!r.results?.some((m) => m.source === 'cache');
    const fallback = !!r.fallback || r.source === 'local' || !!r.results?.some((m) => m.source === 'local');
    await ToolUsage.create({ tool: name, success: true, durationMs: Date.now() - started, cached, fallback, input }).catch(() => {});
    return result;
  } catch (error) {
    await logError(`tool/${name}`, error, { input });
    await ToolUsage.create({
      tool: name, success: false, durationMs: Date.now() - started, error: String((error as Error)?.message ?? error), input,
    }).catch(() => {});
    throw new ToolError(friendlyError(error));
  }
}

async function getSettings() {
  try {
    await connectDB();
    return (await Settings.findOne({ key: 'default' }).lean()) ?? { pageSize: 10, defaultJokeCategory: 'dad' as const };
  } catch {
    return { pageSize: 10, defaultJokeCategory: 'dad' as const };
  }
}

export const tools = {
  queryDatabase: tool({
    description: `Query the movie database with a structured query. Collections and fields:
- movies: id, title, year, genre (Sci-Fi, Drama, Action, Comedy, Crime, Thriller, Animation, Romance, Horror, Fantasy, Adventure), rating (0-10), director, description
- users: id, name, email, age, favorite_genre
- reviews: id, movie_id, user_id, rating (1-10), comment, date
Examples: "sci-fi movies" -> movies, find, genre eq Sci-Fi. "users over 25" -> users, find, age gt 25.
"count movies by genre" -> movies, countBy, groupBy genre. "average rating per genre" -> movies, average, averageField rating, groupBy genre.`,
    inputSchema: querySpecSchema.extend({ pageSize: z.number().int().min(1).max(50).optional() }),
    execute: async (input) => {
      const { pageSize } = await getSettings();
      return track('queryDatabase', input, () => runDatabaseQuery({ ...input, pageSize: input.pageSize ?? pageSize }));
    },
  }),

  getMovieInfo: tool({
    description:
      'Get detailed info (plot, cast, ratings, poster, runtime) for 1-5 movies from OMDb. Supports partial titles. Pass several movies at once instead of calling this tool many times.',
    inputSchema: z.object({
      movies: z
        .array(z.object({ title: z.string().min(1).max(200), year: z.number().int().min(1888).max(2100).optional() }))
        .min(1)
        .max(5),
    }),
    execute: (input) => track('getMovieInfo', input, () => getManyMovieDetails(input.movies)),
  }),

  recommendMovies: tool({
    description: 'Recommend well-rated movies from the database by genre and/or around a year (+/- 5 years).',
    inputSchema: z.object({
      genre: z.string().max(30).optional(),
      year: z.number().int().min(1888).max(2100).optional(),
      minRating: z.number().min(0).max(10).optional(),
      limit: z.number().int().min(1).max(10).optional(),
    }),
    execute: (input) => track('recommendMovies', input, () => recommendMovies(input)),
  }),

  getJoke: tool({
    description: 'Get a random joke. Categories: dad, programming, general. If the user does not say, leave category empty.',
    inputSchema: z.object({ category: z.enum(['dad', 'programming', 'general']).optional() }),
    execute: async (input) => {
      const { defaultJokeCategory } = await getSettings();
      return track('getJoke', input, () => getJoke({ category: input.category ?? defaultJokeCategory }));
    },
  }),

  searchJokes: tool({
    description: 'Search jokes by a keyword (one word works best, e.g. "cat", "pizza").',
    inputSchema: z.object({ keyword: z.string().min(1).max(50), limit: z.number().int().min(1).max(10).optional() }),
    execute: (input) => track('searchJokes', input, () => searchJokes(input)),
  }),

  getTopJokes: tool({
    description: 'Show the jokes with the most thumbs up from users.',
    inputSchema: z.object({ limit: z.number().int().min(1).max(10).optional() }),
    execute: (input) => track('getTopJokes', input, () => topJokes(input.limit)),
  }),

  generateImage: tool({
    description:
      'Generate an image from a text description. Only use it when the user asks for a picture/image/drawing. Write a detailed English prompt. Size: 1024x1024 square (default), 1536x1024 landscape, 1024x1536 portrait.',
    inputSchema: z.object({
      prompt: z.string().min(3).max(1000).describe('Detailed description of the image'),
      size: z.enum(IMAGE_SIZES).optional(),
    }),
    // experimental_context carries the chat id, so the image is linked to its conversation
    execute: (input, { experimental_context }) =>
      track('generateImage', input, () => createImage(input, (experimental_context as ToolContext | undefined)?.chatId)),
  }),
};

export type ToolContext = { chatId: string };

export type ChatTools = InferUITools<typeof tools>;
export type ChatMessage = UIMessage<never, UIDataTypes, ChatTools>;
