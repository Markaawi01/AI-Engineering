import { describe, expect, it } from 'vitest';
import { buildQuery, querySpecSchema, QueryValidationError } from '@/lib/query-builder';

const spec = (input: object) => querySpecSchema.parse(input);

describe('query builder (natural language -> MongoDB)', () => {
  it('"Show me all sci-fi movies" -> case-insensitive genre match', () => {
    const q = buildQuery(spec({ collection: 'movies', operation: 'find', conditions: [{ field: 'genre', operator: 'eq', value: 'sci-fi' }] }));
    expect(q.kind).toBe('find');
    if (q.kind !== 'find') return;
    const regex = (q.filter.genre as { $regex: RegExp }).$regex;
    expect(regex.test('Sci-Fi')).toBe(true);
    expect(regex.test('Sci-Fi Horror')).toBe(false); // exact match, not "contains"
  });

  it('"Find users over 25" -> $gt on a number', () => {
    const q = buildQuery(spec({ collection: 'users', operation: 'find', conditions: [{ field: 'age', operator: 'gt', value: 25 }] }));
    expect(q.kind === 'find' && q.filter).toEqual({ age: { $gt: 25 } });
  });

  it('accepts symbols like ">" and numbers written as text', () => {
    const q = buildQuery(spec({ collection: 'movies', operation: 'find', conditions: [{ field: 'rating', operator: '>', value: '8.5' }] }));
    expect(q.kind === 'find' && q.filter).toEqual({ rating: { $gt: 8.5 } });
  });

  it('"Count total movies by genre" -> aggregation pipeline', () => {
    const q = buildQuery(spec({ collection: 'movies', operation: 'countBy', groupBy: 'genre' }));
    expect(q.kind).toBe('aggregate');
    if (q.kind !== 'aggregate') return;
    expect(q.pipeline[1]).toEqual({ $group: { _id: '$genre', count: { $sum: 1 } } });
  });

  it('maps "id" to the internal id field', () => {
    const q = buildQuery(spec({ collection: 'reviews', operation: 'find', conditions: [{ field: 'id', operator: 'in', value: [1, 2] }] }));
    expect(q.kind === 'find' && q.filter).toEqual({ reviewId: { $in: [1, 2] } });
  });

  it('calculates pagination and always adds a stable sort', () => {
    const q = buildQuery(spec({ collection: 'movies', operation: 'find', page: 3, pageSize: 5, sort: { field: 'rating', direction: 'desc' } }));
    expect(q.kind === 'find' && [q.skip, q.limit, q.sort]).toEqual([10, 5, { rating: -1, movieId: 1 }]);
  });

  it('rejects unknown fields and MongoDB operators used as field names', () => {
    expect(() => buildQuery(spec({ collection: 'movies', operation: 'find', conditions: [{ field: 'budget', operator: 'gt', value: 1 }] })))
      .toThrow(QueryValidationError);
    expect(() => buildQuery(spec({ collection: 'movies', operation: 'find', conditions: [{ field: '$where', operator: 'eq', value: '1' }] })))
      .toThrow(/Unknown field/);
  });

  it('escapes regex characters so users cannot inject patterns', () => {
    const q = buildQuery(spec({ collection: 'users', operation: 'find', conditions: [{ field: 'name', operator: 'contains', value: '.*' }] }));
    const regex = q.kind === 'find' ? (q.filter.name as { $regex: RegExp }).$regex : null;
    expect(regex?.test('Amina')).toBe(false);
    expect(regex?.test('a.*b')).toBe(true);
  });

  it('validates value types', () => {
    expect(() => buildQuery(spec({ collection: 'users', operation: 'find', conditions: [{ field: 'age', operator: 'gt', value: 'old' }] })))
      .toThrow(/needs a number/);
    expect(() => buildQuery(spec({ collection: 'movies', operation: 'find', conditions: [{ field: 'rating', operator: 'contains', value: 8 }] })))
      .toThrow(/only works on text/);
    expect(() => buildQuery(spec({ collection: 'movies', operation: 'average', averageField: 'title' })))
      .toThrow(/number fields/);
  });

  it('zod rejects bad specs (unknown collection, huge page size)', () => {
    expect(querySpecSchema.safeParse({ collection: 'passwords', operation: 'find' }).success).toBe(false);
    expect(querySpecSchema.safeParse({ collection: 'movies', operation: 'find', pageSize: 1000 }).success).toBe(false);
    expect(querySpecSchema.safeParse({ collection: 'movies', operation: 'drop' }).success).toBe(false);
  });
});
