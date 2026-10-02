import { ApiCache } from './models';

// Two cache layers:
// 1. In-memory Map - fastest, but lost when the server restarts
// 2. MongoDB `apicaches` collection - survives restarts, cleaned up by a TTL index
const memory = new Map<string, { data: unknown; expiresAt: number }>();
const MAX_MEMORY_ITEMS = 500;

export async function getCached<T>(key: string): Promise<T | null> {
  const hit = memory.get(key);
  if (hit && hit.expiresAt > Date.now()) return hit.data as T;

  const doc = await ApiCache.findOne({ key, expiresAt: { $gt: new Date() } }).lean();
  if (!doc) return null;

  memory.set(key, { data: doc.data, expiresAt: doc.expiresAt.getTime() });
  return doc.data as T;
}

export async function setCached(key: string, source: string, data: unknown, ttlSeconds: number) {
  const expiresAt = new Date(Date.now() + ttlSeconds * 1000);

  if (memory.size >= MAX_MEMORY_ITEMS) {
    memory.delete(memory.keys().next().value!); // drop the oldest entry
  }
  memory.set(key, { data, expiresAt: expiresAt.getTime() });

  await ApiCache.updateOne({ key }, { key, source, data, expiresAt }, { upsert: true });
}

// Used by tests
export function clearMemoryCache() {
  memory.clear();
}
