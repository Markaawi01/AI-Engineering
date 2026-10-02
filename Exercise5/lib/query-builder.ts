import { z } from 'zod';
import type { PipelineStage, SortOrder } from 'mongoose';

// Natural language -> MongoDB, safely:
// the AI model turns the user's question into a QuerySpec (validated by zod),
// and THIS file turns the spec into a real MongoDB query. The model never writes
// raw MongoDB syntax, so it cannot run `$where`, delete data or read other collections.

export class QueryValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'QueryValidationError';
  }
}

type FieldType = 'number' | 'string' | 'date';

// Fields users may query, per collection. "id" maps to our movieId/userId/reviewId.
export const COLLECTIONS = {
  movies: {
    id: 'number', title: 'string', year: 'number', genre: 'string',
    rating: 'number', director: 'string', description: 'string',
  },
  users: {
    id: 'number', name: 'string', email: 'string', age: 'number', favorite_genre: 'string',
  },
  reviews: {
    id: 'number', movie_id: 'number', user_id: 'number', rating: 'number', comment: 'string', date: 'date',
  },
} as const satisfies Record<string, Record<string, FieldType>>;

export type CollectionName = keyof typeof COLLECTIONS;

const ID_FIELD: Record<CollectionName, string> = { movies: 'movieId', users: 'userId', reviews: 'reviewId' };

export const MAX_PAGE_SIZE = 50;

const OPERATORS = ['eq', 'ne', 'gt', 'gte', 'lt', 'lte', 'contains', 'in'] as const;
type Operator = (typeof OPERATORS)[number];

// AI models often write ">" instead of "gt", so symbols are accepted and converted
const OPERATOR_SYMBOLS = { '=': 'eq', '==': 'eq', '!=': 'ne', '>': 'gt', '>=': 'gte', '<': 'lt', '<=': 'lte' } as const;

const toOperator = (op: string): Operator => (OPERATOR_SYMBOLS as Record<string, Operator>)[op] ?? (op as Operator);

const valueSchema = z.union([z.string(), z.number(), z.array(z.union([z.string(), z.number()]))]);

export const querySpecSchema = z.object({
  collection: z.enum(['movies', 'users', 'reviews']).describe('Which collection to query'),
  operation: z
    .enum(['find', 'count', 'countBy', 'average'])
    .describe('find = list documents, count = how many match, countBy = count per value of groupBy, average = average of averageField (optionally per groupBy)'),
  conditions: z
    .array(
      z.object({
        field: z.string().describe('Field name from the schema'),
        operator: z
          .enum([...OPERATORS, ...(Object.keys(OPERATOR_SYMBOLS) as (keyof typeof OPERATOR_SYMBOLS)[])])
          .describe('eq (=), ne (!=), gt (>), gte (>=), lt (<), lte (<=), contains (text includes), in (one of a list)'),
        value: valueSchema,
      })
    )
    .max(10)
    .default([])
    .describe('All conditions must match (AND). Text "eq" is case-insensitive.'),
  groupBy: z.string().optional().describe('Field to group by, for countBy/average'),
  averageField: z.string().optional().describe('Numeric field to average, for average'),
  sort: z
    .object({ field: z.string(), direction: z.enum(['asc', 'desc']) })
    .optional(),
  page: z.number().int().min(1).max(1000).default(1),
  pageSize: z.number().int().min(1).max(MAX_PAGE_SIZE).default(10),
});

export type QuerySpec = z.infer<typeof querySpecSchema>;

export type BuiltQuery =
  | { kind: 'find'; filter: Record<string, unknown>; sort: Record<string, SortOrder>; skip: number; limit: number }
  | { kind: 'count'; filter: Record<string, unknown> }
  | { kind: 'aggregate'; pipeline: PipelineStage[] };

// Escape characters that have a special meaning in regular expressions
const escapeRegex = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function checkField(collection: CollectionName, field: string): FieldType {
  const fields = COLLECTIONS[collection] as Record<string, FieldType>;
  const type = fields[field];
  if (!type) {
    throw new QueryValidationError(
      `Unknown field "${field}" for ${collection}. Allowed: ${Object.keys(fields).join(', ')}`
    );
  }
  return type;
}

const dbField = (collection: CollectionName, field: string) => (field === 'id' ? ID_FIELD[collection] : field);

function coerce(value: string | number, type: FieldType, field: string): string | number | Date {
  if (type === 'number') {
    const n = typeof value === 'number' ? value : Number(value);
    if (!Number.isFinite(n)) throw new QueryValidationError(`"${field}" needs a number, got "${value}"`);
    return n;
  }
  if (type === 'date') {
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) throw new QueryValidationError(`"${field}" needs a date, got "${value}"`);
    return d;
  }
  const s = String(value).trim();
  if (s.length > 200) throw new QueryValidationError(`Value for "${field}" is too long`);
  return s;
}

export function buildFilter(collection: CollectionName, conditions: QuerySpec['conditions']) {
  const filter: Record<string, Record<string, unknown>> = {};

  for (const { field, operator: rawOperator, value } of conditions) {
    const operator = toOperator(rawOperator);
    const type = checkField(collection, field);
    const key = dbField(collection, field);
    const target = (filter[key] ??= {});

    if (operator === 'in') {
      const list = Array.isArray(value) ? value : [value];
      if (list.length === 0 || list.length > 50) throw new QueryValidationError(`"in" needs 1-50 values`);
      target.$in = list.map((v) => {
        const c = coerce(v, type, field);
        return typeof c === 'string' ? new RegExp(`^${escapeRegex(c)}$`, 'i') : c;
      });
      continue;
    }

    if (Array.isArray(value)) throw new QueryValidationError(`Operator "${operator}" needs a single value`);
    const coerced = coerce(value, type, field);

    if (operator === 'contains') {
      if (type !== 'string') throw new QueryValidationError(`"contains" only works on text fields`);
      target.$regex = new RegExp(escapeRegex(String(coerced)), 'i');
    } else if (operator === 'eq' && typeof coerced === 'string') {
      // Case-insensitive exact match: "sci-fi" finds "Sci-Fi"
      target.$regex = new RegExp(`^${escapeRegex(coerced)}$`, 'i');
    } else if (operator === 'ne' && typeof coerced === 'string') {
      target.$not = new RegExp(`^${escapeRegex(coerced)}$`, 'i');
    } else {
      target[`$${operator}`] = coerced;
    }
  }

  return filter;
}

export function buildQuery(spec: QuerySpec): BuiltQuery {
  const { collection, operation } = spec;
  const filter = buildFilter(collection, spec.conditions);

  if (operation === 'count') return { kind: 'count', filter };

  if (operation === 'find') {
    const sort: Record<string, SortOrder> = {};
    if (spec.sort) {
      checkField(collection, spec.sort.field);
      sort[dbField(collection, spec.sort.field)] = spec.sort.direction === 'asc' ? 1 : -1;
    }
    sort[ID_FIELD[collection]] = 1; // stable order so pages never overlap
    return {
      kind: 'find',
      filter,
      sort,
      skip: (spec.page - 1) * spec.pageSize,
      limit: spec.pageSize,
    };
  }

  // countBy / average -> aggregation pipeline
  const groupField = spec.groupBy ? dbField(collection, spec.groupBy) : null;
  if (spec.groupBy) checkField(collection, spec.groupBy);

  let accumulator: Record<string, unknown>;
  if (operation === 'countBy') {
    if (!groupField) throw new QueryValidationError('countBy needs a groupBy field');
    accumulator = { count: { $sum: 1 } };
  } else {
    if (!spec.averageField) throw new QueryValidationError('average needs an averageField');
    if (checkField(collection, spec.averageField) !== 'number') {
      throw new QueryValidationError(`Can only average number fields`);
    }
    accumulator = { average: { $avg: `$${dbField(collection, spec.averageField)}` }, count: { $sum: 1 } };
  }

  const sortKey = operation === 'countBy' ? 'count' : 'average';
  return {
    kind: 'aggregate',
    pipeline: [
      { $match: filter },
      { $group: { _id: groupField ? `$${groupField}` : null, ...accumulator } },
      { $sort: { [sortKey]: -1, _id: 1 } },
      { $limit: MAX_PAGE_SIZE },
    ] as PipelineStage[],
  };
}

// Makes the MongoDB query readable for the UI (RegExp objects -> strings)
export function describeQuery(built: BuiltQuery): string {
  return JSON.stringify(built, (_key, value) => (value instanceof RegExp ? value.toString() : value));
}
