# Performance Report

Measured on 2026-09-29 on a Windows 11 laptop, MongoDB 8.3 running locally, 44 movies / 12 users /
40 reviews. Reproduce with `npm run benchmark`, and see live numbers in the app sidebar or `GET /api/stats`.

## 1. Measurements

### Database tool (50 runs each)

| Query | Average | p95 |
|---|---|---|
| Show me all sci-fi movies | 2.99 ms | 3.99 ms |
| Find users over 25 | 2.00 ms | 2.84 ms |
| Get movies with rating above 8.5 | 1.94 ms | 2.28 ms |
| Count total movies by genre | 1.95 ms | 2.45 ms |

### Index effect (`rating > 8.5`, from MongoDB `explain`)

| | Documents examined | Returned |
|---|---|---|
| With `rating` index | 12 | 12 |
| Without index (forced collection scan) | 44 | 12 |

With the index MongoDB reads only the matching documents. The difference grows with the data:
with 100,000 movies a collection scan would read all 100,000.

### Cache

| Lookup | Average | p95 |
|---|---|---|
| In-memory cache | < 0.01 ms | 0.01 ms |
| MongoDB cache (`apicaches`) | 1.21 ms | 2.04 ms |
| External API call (measured in the app) | 322–581 ms | – |

A cached movie or search is **about 300–500× faster** than calling the API again, and it doesn't use
the OMDb daily quota (1,000 requests).

### Tool timings in the app (from `toolusages`)

| Tool | Average | Notes |
|---|---|---|
| queryDatabase | 15 ms | Includes the settings lookup |
| getMovieInfo | 15 ms | Local fallback (no OMDb key yet) |
| recommendMovies | 8 ms | |
| searchJokes | 322 ms | External API + text search |
| getJoke | 569 ms | External API |

The AI model itself takes most of the time: a full answer takes about **2–5 seconds**, while
the tools take milliseconds. Streaming shows the text and tool cards as soon as they arrive, so the
app feels faster than the total time.

## 2. Optimizations implemented

| Area | What was done |
|---|---|
| Indexing | Compound `{genre, rating}`, single `rating`, `year`, `age`, `favorite_genre`, `movie_id`, `user_id`; text indexes on movies and jokes |
| Query optimization | `.lean()` (plain objects instead of Mongoose documents); page query and total count run in parallel; stable sort so pages never overlap |
| Pagination | `skip`/`limit` with a maximum of 50 rows per page; the UI loads new pages through `/api/query` without calling the AI again |
| Caching | Two levels (memory + MongoDB). The TTL index deletes expired entries automatically. "Not found" answers are cached for 1 day so repeated mistakes don't use quota |
| Batch requests | `getMovieInfo` accepts up to 5 movies in one tool call and fetches 3 at a time; jokes are saved with a single `bulkWrite` |
| Connection pooling | One shared Mongoose connection with `maxPoolSize: 10`, reused across hot reloads |
| External APIs | 5–8 s timeouts, circuit breaker, client-side rate limits (OMDb 1,000/day, jokes 30/min) |
| Frontend | Lazy-loaded posters (`loading="lazy"`), streaming UI, loading placeholders per tool |
| Monitoring | Every tool call is saved with duration, success, cache and fallback flags; `/api/stats` shows the average and p95 |

## 3. Recommendations

1. **Case-insensitive genre search can't fully use the index.** `genre eq "sci-fi"` becomes the
   regex `/^sci-fi$/i`, so MongoDB scans the whole `genre` index. With big data, store a lowercase
   `genreKey` field (or use a case-insensitive collation index) and match it exactly.
2. **Use range pagination for deep pages.** `skip(10000)` still walks 10,000 entries. For large
   results, paginate with "rating < last seen rating" instead of `skip`.
3. **Move the rate limiter and memory cache to Redis when running more than one server.** Right now
   they live in the memory of one Node.js process.
4. **Cache the settings document** for a few seconds. Each tool call reads it (≈1 ms), which is cheap
   but unnecessary.
5. **Watch the AI cost and latency.** The model is the slowest part. `gpt-4o-mini` is the default for
   speed and cost; use `gpt-4o` from Settings only when answers need more reasoning.
6. **Add an OMDb key.** Movie answers will then include cast, posters and runtime, and caching will
   keep usage well under the free 1,000 requests per day.
