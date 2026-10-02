import { errorResponse } from '@/lib/api';
import { connectDB } from '@/lib/db';
import { ApiCache, Conversation, ErrorLog, Joke, Movie, ToolUsage } from '@/lib/models';
import { jokeBreaker } from '@/lib/tools/jokes';
import { omdbBreaker } from '@/lib/tools/movies';

// GET /api/stats - tool usage analytics and performance numbers
export async function GET() {
  try {
    await connectDB();

    const [tools, counts] = await Promise.all([
      ToolUsage.aggregate([
        { $sort: { durationMs: 1 } },
        {
          $group: {
            _id: '$tool',
            calls: { $sum: 1 },
            failures: { $sum: { $cond: ['$success', 0, 1] } },
            cached: { $sum: { $cond: ['$cached', 1, 0] } },
            fallbacks: { $sum: { $cond: ['$fallback', 1, 0] } },
            avgMs: { $avg: '$durationMs' },
            durations: { $push: '$durationMs' },
            lastUsed: { $max: '$createdAt' },
          },
        },
        { $sort: { calls: -1 } },
      ]),
      Promise.all([
        Movie.estimatedDocumentCount(),
        Joke.estimatedDocumentCount(),
        ApiCache.countDocuments({ expiresAt: { $gt: new Date() } }),
        Conversation.estimatedDocumentCount(),
        ErrorLog.countDocuments({ createdAt: { $gt: new Date(Date.now() - 86_400_000) } }),
      ]),
    ]);

    return Response.json({
      tools: tools.map((t) => ({
        tool: t._id,
        calls: t.calls,
        successRate: Math.round(((t.calls - t.failures) / t.calls) * 100),
        cacheHits: t.cached,
        fallbacks: t.fallbacks,
        avgMs: Math.round(t.avgMs),
        p95Ms: t.durations[Math.min(t.durations.length - 1, Math.floor(t.durations.length * 0.95))],
        lastUsed: t.lastUsed,
      })),
      database: {
        movies: counts[0],
        jokes: counts[1],
        cachedApiResponses: counts[2],
        conversations: counts[3],
        errorsLast24h: counts[4],
      },
      circuits: { omdb: omdbBreaker.getState(), jokes: jokeBreaker.getState() },
    });
  } catch (error) {
    return errorResponse('api/stats', error);
  }
}
