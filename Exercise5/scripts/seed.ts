// npm run seed
// Creates the collections + indexes and loads the sample data.
// Safe to run again: movies/users/reviews are replaced, saved jokes and votes are kept.

import { connectDB, disconnectDB } from '../lib/db';
import { ALL_MODELS, Joke, Movie, Review, Settings, User } from '../lib/models';
import { localJokes, movies, reviews, users } from './seed-data';

try { process.loadEnvFile('.env.local'); } catch { /* use existing environment */ }

async function seed() {
  await connectDB();
  console.log('Connected to', process.env.MONGODB_URI);

  // Create collections and all indexes defined in lib/models.ts ("migrations" for MongoDB)
  for (const [name, model] of Object.entries(ALL_MODELS)) {
    await model.createCollection().catch(() => {}); // already exists
    await model.syncIndexes();
    console.log(`  indexes ready: ${name}`);
  }

  await Promise.all([Movie.deleteMany({}), User.deleteMany({}), Review.deleteMany({})]);
  await Movie.insertMany(movies); // insertMany runs the schema validation on every document
  await User.insertMany(users);
  await Review.insertMany(reviews);

  // Keep jokes saved from the API (and their votes); only add missing local ones
  await Joke.bulkWrite(
    localJokes.map((j) => ({ updateOne: { filter: { jokeId: j.jokeId }, update: { $setOnInsert: j }, upsert: true } }))
  );
  await Settings.updateOne({ key: 'default' }, { $setOnInsert: { key: 'default' } }, { upsert: true });

  console.log(`Seeded ${movies.length} movies, ${users.length} users, ${reviews.length} reviews, ${localJokes.length} local jokes.`);
}

seed()
  .catch((error) => {
    console.error('Seed failed:', error.message);
    process.exitCode = 1;
  })
  .finally(disconnectDB);
