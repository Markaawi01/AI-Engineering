// npm run benchmark
// Measures the database tool and caching so the performance report uses real numbers.

import { connectDB, disconnectDB } from '../lib/db';
import { Movie } from '../lib/models';
import { runDatabaseQuery } from '../lib/tools/database';
import { getCached, setCached, clearMemoryCache } from '../lib/cache';

try { process.loadEnvFile('.env.local'); } catch { /* use existing environment */ }

const RUNS = 50;

async function time(fn: () => Promise<unknown>) {
  const durations: number[] = [];
  for (let i = 0; i < RUNS; i++) {
    const start = performance.now();
    await fn();
    durations.push(performance.now() - start);
  }
  durations.sort((a, b) => a - b);
  const avg = durations.reduce((s, d) => s + d, 0) / RUNS;
  return { avg: avg.toFixed(2), p95: durations[Math.floor(RUNS * 0.95)].toFixed(2) };
}

async function main() {
  await connectDB();
  await runDatabaseQuery({ collection: 'movies', operation: 'find' }); // warm up

  console.log(`\nDatabase tool (${RUNS} runs each, ms)`);
  const queries = {
    'Sci-fi movies': { collection: 'movies', operation: 'find', conditions: [{ field: 'genre', operator: 'eq', value: 'sci-fi' }] },
    'Users over 25': { collection: 'users', operation: 'find', conditions: [{ field: 'age', operator: 'gt', value: 25 }] },
    'Rating above 8.5': { collection: 'movies', operation: 'find', conditions: [{ field: 'rating', operator: 'gt', value: 8.5 }] },
    'Count by genre': { collection: 'movies', operation: 'countBy', groupBy: 'genre' },
  };
  for (const [name, spec] of Object.entries(queries)) {
    const t = await time(() => runDatabaseQuery(spec));
    console.log(`  ${name.padEnd(18)} avg ${t.avg}  p95 ${t.p95}`);
  }

  console.log('\nIndex usage (documents examined for "rating > 8.5")');
  type Stats = { executionStats: { totalDocsExamined: number; totalKeysExamined: number; nReturned: number } };
  const withIndex = (await Movie.find({ rating: { $gt: 8.5 } }).explain('executionStats')) as unknown as Stats;
  const noIndex = (await Movie.find({ rating: { $gt: 8.5 } }).hint({ $natural: 1 }).explain('executionStats')) as unknown as Stats;
  console.log(`  with index:    ${withIndex.executionStats.totalDocsExamined} docs examined, ${withIndex.executionStats.nReturned} returned`);
  console.log(`  without index: ${noIndex.executionStats.totalDocsExamined} docs examined, ${noIndex.executionStats.nReturned} returned`);

  console.log(`\nCache lookups (${RUNS} runs each, ms)`);
  await setCached('benchmark:key', 'benchmark', { title: 'Inception' }, 60);
  const memory = await time(() => getCached('benchmark:key'));
  const mongo = await time(async () => {
    clearMemoryCache();
    await getCached('benchmark:key');
  });
  console.log(`  memory cache   avg ${memory.avg}  p95 ${memory.p95}`);
  console.log(`  MongoDB cache  avg ${mongo.avg}  p95 ${mongo.p95}`);
}

main()
  .catch((error) => {
    console.error('Benchmark failed:', error.message);
    process.exitCode = 1;
  })
  .finally(disconnectDB);
