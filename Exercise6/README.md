# Exercise 6 – Movie & Jokes Assistant with Conversations and Images

Exercise 6 builds on Exercise 5 (same app, copied) and adds two features:

| Feature | How it works |
|---|---|
| 💬 **Conversation sidebar** | Every chat is saved in MongoDB with a title (your first question). The left sidebar lists them newest first, grouped by *Today / Yesterday / Previous 7 days / Older*. Click one to open it, search by title, start a **New chat**, or delete one with 🗑️. The address bar shows `/?chat=<id>`, so Back/Forward and bookmarks work. On phones the list opens with the ☰ button. |
| 🎨 **Image generation** | Click the **image icon** next to the message box to switch on *Image mode*, pick **Square / Landscape / Portrait**, describe the picture and press **Create**. The AI writes a detailed prompt and calls the `generateImage` tool (gpt-image-1, with Gemini as fallback). The image appears in the chat with **Open** and **Download** links. You can also just ask "draw a…" in normal chat mode. |

Images are stored in their own `generatedimages` collection (not inside the conversation, which keeps
conversations small) and served by `/api/images/<id>`. Deleting a conversation also deletes its images.

Everything from Exercise 5 below still applies. This exercise uses its own database, `exercise6`.

---

A chat app built with **Next.js** and the **AI SDK v5** where the AI uses three kinds of tools:

| Tool | What it does | Data source |
|---|---|---|
| 🗄️ **Database chat** (`queryDatabase`) | Turns questions like *"Find users over 25"* into safe MongoDB queries | MongoDB: `movies`, `users`, `reviews` |
| 🎬 **Movie database** (`getMovieInfo`, `recommendMovies`) | Plot, cast, ratings, poster and runtime; recommendations by genre/year | OMDb API → cached in MongoDB → local fallback |
| 😄 **Dad jokes** (`getJoke`, `searchJokes`, `getTopJokes`) | Random jokes by category, keyword search, thumbs up/down | icanhazdadjoke.com → stored in MongoDB → local fallback |

Database choice: **MongoDB** with **Mongoose** (database `exercise6`).

---

## 1. Setup

### Requirements
- Node.js 18+ (tested on Node 24)
- MongoDB running locally (tested on MongoDB 8.3, Windows service `MongoDB`)
- An OpenRouter API key (the project uses OpenAI models through OpenRouter)
- Optional: a free OMDb API key

### Steps

```bash
cd Exercise6
npm install
```

Create `.env.local` in the `Exercise6` folder:

```
OPENAI_API_KEY=your_openrouter_key
MONGODB_URI=mongodb://127.0.0.1:27017/exercise6
OMDB_API_KEY=your_omdb_key        # optional, see below
```

Load the sample data and create all indexes:

```bash
npm run seed
```

Start the app:

```bash
npm run dev
```

Open http://localhost:3000.

### Getting an OMDb key (optional)
1. Go to https://www.omdbapi.com/apikey.aspx and choose the **FREE** plan (1,000 requests/day).
2. Activate the key with the link in the email.
3. Add `OMDB_API_KEY=...` to `.env.local` and restart `npm run dev`.

Without a key the movie tool still works: it answers from the local `movies` collection and shows
*"OMDb API key not set – showing data from the local database."*

---

## 2. User guide

Type a question or click one of the example buttons.

**Database questions**
- *Show me all sci-fi movies*
- *Find users over 25*
- *Get movies with rating above 8.5*
- *Count total movies by genre*
- *What is the average rating per genre?*
- *Show reviews for movie 1 sorted by rating*

Results appear as a **table**. Use **Show MongoDB query** to see the query that was run, and
**Previous / Next** to page through large results (rows per page is a setting).

**Movies**
- *Tell me about Inception and The Matrix* (several movies in one request)
- *Tell me about "incep"* (partial titles work)
- *Recommend a drama from around 1995*

Results appear as **movie cards with posters**. Posters load lazily (only when scrolled into view).

**Jokes**
- *Tell me a joke* (uses your default category from Settings)
- *Tell me a programming joke* / *general joke*
- *Search jokes about cats*
- *Show the top rated jokes*

Rate jokes with 👍 / 👎. Every joke you see is saved, so it is available offline later.

**Sidebar**
- **Tool usage** – calls, success rate, average time and cache hits per tool, API circuit status.
- **Settings** – rows per page, default joke category and AI model (saved in MongoDB).

**Images**
- Click the image icon, choose a size, type *A cozy cinema with popcorn, watercolor style*, press **Create**.
- It takes about 20–40 seconds. Each image costs about $0.01–0.02 (quality `low`); at most 10 per minute.

**Delete chat** deletes the conversation (and its images) and starts a new one. Conversations are saved in MongoDB
and restored when you reload the page. A link like `/?chat=<id>` opens a saved conversation.

---

## 3. API endpoints

All errors use the same shape: `{ "error": "message" }` with a matching HTTP status
(400 invalid input, 404 not found, 429 rate limited, 503 database/API unavailable).

| Method | Path | Body / params | Response |
|---|---|---|---|
| POST | `/api/chat` | `{ id, messages: UIMessage[] }` (sent by `useChat`) | AI SDK UI message stream |
| POST | `/api/query` | Query spec (see below) | `{ type: "table", columns, rows, metadata, spec }` |
| POST | `/api/jokes/:id/vote` | `{ "vote": "up" \| "down" }` | Updated joke |
| GET | `/api/stats` | – | Tool analytics, database counts, circuit states |
| GET | `/api/settings` | – | `{ pageSize, defaultJokeCategory, model, availableModels }` |
| PUT | `/api/settings` | Any of `pageSize` (1-50), `defaultJokeCategory`, `model` | Updated settings |
| GET | `/api/conversations?q=<search>` | – | `{ conversations: [{ id, title, updatedAt, messageCount }] }` (newest 50) |
| GET | `/api/conversations/:id` | – | `{ id, title, messages }` |
| DELETE | `/api/conversations/:id` | – | `{ deleted, imagesDeleted }` |
| GET | `/api/images/:id` | add `?download` to download | The PNG image (cached by the browser for a year) |

`/api/chat` also accepts `mode: "chat" | "image"` and `imageSize: "1024x1024" | "1536x1024" | "1024x1536"`.
In image mode the first AI step **must** call `generateImage` (AI SDK `prepareStep` + `toolChoice`), and later steps may not call tools.

`/api/chat`, `/api/query` and the vote route are limited to **20 requests per minute per visitor**.

### Query spec (`/api/query` and the `queryDatabase` tool)

```json
{
  "collection": "movies",
  "operation": "find",
  "conditions": [{ "field": "rating", "operator": "gt", "value": 8.5 }],
  "sort": { "field": "rating", "direction": "desc" },
  "page": 1,
  "pageSize": 10
}
```

- `collection`: `movies` | `users` | `reviews`
- `operation`: `find` | `count` | `countBy` (needs `groupBy`) | `average` (needs `averageField`)
- `operator`: `eq`, `ne`, `gt`, `gte`, `lt`, `lte`, `contains`, `in` (symbols like `>` also work)
- Fields: see the schema below. Unknown fields are rejected.

Example with PowerShell:

```powershell
Invoke-RestMethod -Method Post -Uri http://localhost:3000/api/query -ContentType "application/json" `
  -Body '{"collection":"users","operation":"find","conditions":[{"field":"age","operator":"gt","value":25}]}'
```

---

## 4. Database design

| Collection | Fields | Indexes |
|---|---|---|
| `movies` | movieId, title, year, genre, rating, director, description | movieId (unique), {genre, rating}, rating, year, text(title, description) |
| `users` | userId, name, email, age, favorite_genre | userId, email (unique), age, favorite_genre |
| `reviews` | reviewId, movie_id → movies, user_id → users, rating, comment, date | reviewId (unique), movie_id, user_id |
| `jokes` | jokeId, text, category, source, thumbsUp, thumbsDown | jokeId (unique), category, text index |
| `apicaches` | key, source, data, expiresAt | key (unique), **TTL** on expiresAt (auto-delete) |
| `conversations` | chatId, title, messages | chatId (unique), updatedAt |
| `generatedimages` | imageId, chatId, prompt, model, size, contentType, data, bytes | imageId (unique), chatId |
| `settings` | pageSize, defaultJokeCategory, model | key (unique) |
| `toolusages` | tool, success, durationMs, cached, fallback, error | {tool, createdAt}, TTL 90 days |
| `errorlogs` | source, message, details | TTL 30 days |

Validation lives in the Mongoose schemas (`lib/models.ts`): required fields, ranges (rating 0-10,
age 1-120, year 1888-2100), allowed genres, and email format.

### Backups

```bash
npm run backup                           # -> backups/<date-time>/<collection>.json
npm run restore                          # restore the newest backup
npm run restore -- 2026-09-29T14-52-12-685Z   # restore a specific one
```

The 7 newest backups are kept. Backups use MongoDB Extended JSON, so dates and ids are restored
exactly. To back up daily, add `npm run backup` to Windows Task Scheduler.

---

## 5. How the error handling works

| Problem | What happens |
|---|---|
| Invalid user input | zod validation → 400 with a clear message (UI shows it in a red card) |
| AI writes an invalid query | Rejected by the query builder; the AI sees the error and tries again |
| Temporary API error (timeout, 429, 5xx) | Retried twice with backoff (300 ms, 600 ms) |
| API keeps failing | **Circuit breaker** opens after 3 failures: calls fail instantly for 30 s instead of waiting, then one test call is allowed |
| OMDb down / no key | Answer from the local `movies` collection, with a note |
| Joke API down | Random joke from the `jokes` collection, with a note |
| MongoDB down | "The database is not available right now…" (503) |
| Any error | Logged to the terminal and the `errorlogs` collection |

Safety of the database tool: the AI never writes MongoDB syntax. It fills in a query spec, and
`lib/query-builder.ts` checks every field and operator against an allow-list, escapes regex
characters and builds the query itself. The tools can only read, never change or delete data.

---

## 6. Testing

```bash
npm test
```

58 tests in `tests/`, using a separate `exercise6_test` database and a fake API key (your data and key are never used):

| File | Type | Covers |
|---|---|---|
| `query-builder.test.ts` | Unit | The 4 example queries, symbols, pagination, rejecting unknown fields / `$where`, regex escaping |
| `resilience.test.ts` | Unit | Retry, circuit breaker states, rate limiter, HTTP error mapping |
| `database.test.ts` | Integration | Real queries on MongoDB, pagination without overlap, index usage |
| `movies.test.ts` | Integration (mocked OMDb) | Details, caching, partial titles, not found, fallbacks, batch, recommendations |
| `jokes.test.ts` | Integration (mocked API) | Headers, saving, offline fallback, circuit breaker, search, voting |
| `api-routes.test.ts` | Integration | Route handlers, status codes, input validation |
| `conversation.test.ts` | Regression | Saved conversations can be sent to the AI again |
| `conversations-sidebar.test.ts` | Integration | Titles, sidebar list order/search, opening and deleting (with images), image-mode validation |
| `images.test.ts` | Integration (mocked API) | Image saved and linked to the chat, fallback model, errors, rate limit, image route returns the exact bytes |

External APIs are mocked in tests, so they run offline and never use your API quota.

---

## 7. Troubleshooting

| Symptom | Fix |
|---|---|
| "The database is not available right now" | Start MongoDB: open **Services**, find **MongoDB**, click **Start**. Check `MONGODB_URI` in `.env.local`. |
| Tables are empty | Run `npm run seed`. |
| Movie cards say "OMDb API key not set" | Add `OMDB_API_KEY` to `.env.local` and restart `npm run dev`. |
| "OMDb: Invalid API key!" in the logs | The key isn't activated yet – click the link in the OMDb email. |
| "OMDb is temporarily unavailable (too many failures)" | The circuit breaker is open. Wait 30 seconds. |
| "Too many requests" | Rate limit (20/min). Wait a minute. |
| Chat answers with an error immediately | Check `OPENAI_API_KEY` (an OpenRouter key) and your OpenRouter credit. |
| Old conversation keeps coming back | Click **New chat**, or delete it in the sidebar. |
| Image says "Could not generate the image right now" | Both image models failed – check your OpenRouter credit and try again. Details are in `errorlogs`. |
| Image says "refused by the safety filter" | Describe the picture differently. |
| "Rate limit reached for image generation" | Max 10 images per minute. Wait a moment. |
| Build error about `next/font/google` | Fixed in Exercise 6: the app no longer downloads Google Fonts. |
| `npm test` fails with a connection error | MongoDB must be running for the integration tests. |
| Something else | Look in the `errorlogs` collection (MongoDB Compass → `exercise6` → `errorlogs`). |

---

## 8. Project structure

```
app/
  page.tsx                   Conversation sidebar + opens the selected conversation
  api/chat/route.ts          streamText + tools + saves history
  api/query/route.ts         Direct queries (pagination)
  api/jokes/[id]/vote/       Thumbs up / down
  api/stats, api/settings, api/conversations/[id]
components/                  Chat, ConversationSidebar, ImageCard, ToolResult, DataTable, MovieCards, JokeCard, Sidebar
lib/
  ai.ts                      OpenRouter provider
  db.ts, models.ts           Mongoose connection (pooling) and schemas
  query-builder.ts           Natural language spec -> safe MongoDB query
  resilience.ts              Retry, circuit breaker, rate limiter, fetch with timeout
  cache.ts, logger.ts, api.ts
  tools/                     database.ts, movies.ts, jokes.ts, images.ts, index.ts (AI SDK tools)
  conversations.ts           Conversation titles
scripts/                     seed, backup/restore, benchmark
tests/                       Vitest tests
docs/PERFORMANCE.md          Performance report
```
