import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { runDatabaseQuery } from '@/lib/tools/database';
import { Movie, User } from '@/lib/models';
import { closeTestDatabase, resetTestDatabase } from './helpers';

beforeAll(resetTestDatabase);
afterAll(closeTestDatabase);

describe('database tool (integration, real MongoDB test database)', () => {
  it('Show me all sci-fi movies', async () => {
    const result = await runDatabaseQuery({ collection: 'movies', operation: 'find', conditions: [{ field: 'genre', operator: 'eq', value: 'sci-fi' }] });
    expect(result.metadata.total).toBe(await Movie.countDocuments({ genre: 'Sci-Fi' }));
    expect(result.rows.every((r) => r.genre === 'Sci-Fi')).toBe(true);
    expect(result.rows[0]).toHaveProperty('id'); // "id" instead of movieId/_id
    expect(result.rows[0]).not.toHaveProperty('_id');
  });

  it('Find users over 25', async () => {
    const result = await runDatabaseQuery({ collection: 'users', operation: 'find', conditions: [{ field: 'age', operator: 'gt', value: 25 }] });
    expect(result.metadata.total).toBe(await User.countDocuments({ age: { $gt: 25 } }));
    expect(result.rows.every((r) => (r.age as number) > 25)).toBe(true);
  });

  it('Get movies with rating above 8.5 - with pagination metadata', async () => {
    const page1 = await runDatabaseQuery({ collection: 'movies', operation: 'find', conditions: [{ field: 'rating', operator: 'gt', value: 8.5 }], pageSize: 5 });
    const page2 = await runDatabaseQuery({ ...page1.spec, page: 2 });
    expect(page1.metadata.total).toBe(await Movie.countDocuments({ rating: { $gt: 8.5 } }));
    expect(page1.metadata.totalPages).toBe(Math.ceil(page1.metadata.total / 5));
    // Pages never overlap
    const ids1 = page1.rows.map((r) => r.id);
    expect(page2.rows.some((r) => ids1.includes(r.id))).toBe(false);
  });

  it('Count total movies by genre', async () => {
    const result = await runDatabaseQuery({ collection: 'movies', operation: 'countBy', groupBy: 'genre' });
    const total = result.rows.reduce((sum, r) => sum + (r.count as number), 0);
    expect(total).toBe(await Movie.countDocuments());
    expect(result.columns).toEqual(['genre', 'count']);
  });

  it('average rating per genre and plain count', async () => {
    const avg = await runDatabaseQuery({ collection: 'movies', operation: 'average', averageField: 'rating', groupBy: 'genre' });
    expect(avg.rows[0]).toHaveProperty('average');
    const count = await runDatabaseQuery({ collection: 'reviews', operation: 'count' });
    expect(count.rows[0].count).toBe(40);
  });

  it('uses an index for genre + rating queries (query optimization)', async () => {
    const plan = await Movie.find({ genre: 'Drama' }).sort({ rating: -1 }).explain('queryPlanner') as unknown as {
      queryPlanner: { winningPlan: unknown };
    };
    expect(JSON.stringify(plan.queryPlanner.winningPlan)).toContain('IXSCAN');
  });

  it('rejects invalid queries with a clear error', async () => {
    await expect(runDatabaseQuery({ collection: 'movies', operation: 'find', conditions: [{ field: 'budget', operator: 'gt', value: 1 }] }))
      .rejects.toThrow(/Unknown field "budget"/);
  });
});
