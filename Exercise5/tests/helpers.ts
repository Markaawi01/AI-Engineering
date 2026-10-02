import { connectDB, disconnectDB } from '@/lib/db';
import { ALL_MODELS, Joke, Movie, Review, User } from '@/lib/models';
import { localJokes, movies, reviews, users } from '@/scripts/seed-data';
import { clearMemoryCache } from '@/lib/cache';

// Fresh test database with the same sample data as `npm run seed`
export async function resetTestDatabase() {
  await connectDB();
  await Promise.all(Object.values(ALL_MODELS).map((m) => m.collection.deleteMany({})));
  await Promise.all(Object.values(ALL_MODELS).map((m) => m.syncIndexes()));
  await Movie.insertMany(movies);
  await User.insertMany(users);
  await Review.insertMany(reviews);
  await Joke.insertMany(localJokes);
  clearMemoryCache();
}

export async function closeTestDatabase() {
  await disconnectDB();
}

// Builds a fake fetch Response
export const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
