import { connectDB } from '../db';
import { Movie, Review, User } from '../models';
import { buildQuery, describeQuery, querySpecSchema, type CollectionName, type QuerySpec } from '../query-builder';

const MODELS = { movies: Movie, users: User, reviews: Review } as const;
const ID_FIELD: Record<CollectionName, string> = { movies: 'movieId', users: 'userId', reviews: 'reviewId' };

export type DatabaseResult = {
  type: 'table';
  columns: string[];
  rows: Record<string, unknown>[];
  metadata: {
    collection: CollectionName;
    operation: QuerySpec['operation'];
    mongoQuery: string;
    returned: number;
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
    durationMs: number;
  };
  spec: QuerySpec; // sent back so the UI can ask for the next page
};

// Rename our internal id field back to "id" and drop MongoDB's _id
function cleanRow(collection: CollectionName, doc: Record<string, unknown>) {
  const { _id, [ID_FIELD[collection]]: id, ...rest } = doc;
  return { id, ...rest };
}

export async function runDatabaseQuery(input: unknown): Promise<DatabaseResult> {
  const spec = querySpecSchema.parse(input); // throws ZodError on bad input
  const built = buildQuery(spec); // throws QueryValidationError on unknown fields etc.
  const started = Date.now();

  await connectDB();
  const model = MODELS[spec.collection] as typeof Movie;

  let rows: Record<string, unknown>[];
  let total: number;

  if (built.kind === 'find') {
    // Run the page query and the total count at the same time
    const [docs, count] = await Promise.all([
      model.find(built.filter).sort(built.sort).skip(built.skip).limit(built.limit).lean(),
      model.countDocuments(built.filter),
    ]);
    rows = docs.map((d) => cleanRow(spec.collection, d as Record<string, unknown>));
    total = count;
  } else if (built.kind === 'count') {
    total = await model.countDocuments(built.filter);
    rows = [{ count: total }];
  } else {
    const groups = await model.aggregate(built.pipeline);
    rows = groups.map(({ _id, ...values }) => ({
      [spec.groupBy ?? 'group']: _id ?? 'all',
      ...Object.fromEntries(
        Object.entries(values).map(([k, v]) => [k, typeof v === 'number' ? Math.round(v * 100) / 100 : v])
      ),
    }));
    total = rows.length;
  }

  const pageSize = built.kind === 'find' ? spec.pageSize : Math.max(rows.length, 1);

  return {
    type: 'table',
    columns: rows.length ? Object.keys(rows[0]) : [],
    rows,
    metadata: {
      collection: spec.collection,
      operation: spec.operation,
      mongoQuery: describeQuery(built),
      returned: rows.length,
      total,
      page: built.kind === 'find' ? spec.page : 1,
      pageSize,
      totalPages: built.kind === 'find' ? Math.max(1, Math.ceil(total / spec.pageSize)) : 1,
      durationMs: Date.now() - started,
    },
    spec,
  };
}
