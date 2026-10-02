import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { POST as query } from '@/app/api/query/route';
import { POST as vote } from '@/app/api/jokes/[id]/vote/route';
import { GET as getSettings, PUT as putSettings } from '@/app/api/settings/route';
import { GET as stats } from '@/app/api/stats/route';
import { POST as chat } from '@/app/api/chat/route';
import { closeTestDatabase, resetTestDatabase } from './helpers';

beforeAll(resetTestDatabase);
afterAll(closeTestDatabase);

const post = (body: unknown) =>
  new Request('http://test/api', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
const put = (body: unknown) =>
  new Request('http://test/api', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
const params = (id: string) => ({ params: Promise.resolve({ id }) });

describe('API routes (integration)', () => {
  it('POST /api/query returns a page of results', async () => {
    const res = await query(post({ collection: 'movies', operation: 'find', pageSize: 3, page: 2 }));
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.rows).toHaveLength(3);
    expect(data.metadata.page).toBe(2);
  });

  it('POST /api/query returns 400 with a clear message for bad input', async () => {
    const res = await query(post({ collection: 'movies', operation: 'find', conditions: [{ field: 'secret', operator: 'eq', value: 1 }] }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/Unknown field/);
  });

  it('POST /api/jokes/:id/vote validates the vote', async () => {
    expect((await vote(post({ vote: 'up' }), params('local-1'))).status).toBe(200);
    expect((await vote(post({ vote: 'maybe' }), params('local-1'))).status).toBe(400);
    expect((await vote(post({ vote: 'up' }), params('nope'))).status).toBe(404);
  });

  it('GET/PUT /api/settings saves preferences and rejects invalid ones', async () => {
    expect((await (await getSettings()).json()).pageSize).toBe(10);
    const ok = await putSettings(put({ pageSize: 20, defaultJokeCategory: 'programming' }));
    expect(await ok.json()).toMatchObject({ pageSize: 20, defaultJokeCategory: 'programming' });
    expect((await putSettings(put({ pageSize: 500 }))).status).toBe(400);
    expect((await putSettings(put({ model: 'some/unknown-model' }))).status).toBe(400);
  });

  it('GET /api/stats reports database counts and circuit states', async () => {
    const data = await (await stats()).json();
    expect(data.database.movies).toBe(44);
    expect(data.circuits).toEqual({ omdb: 'CLOSED', jokes: 'CLOSED' });
  });

  it('POST /api/chat rejects invalid bodies before calling the AI', async () => {
    expect((await chat(post({ messages: [] }))).status).toBe(400);
    const tooLong = { id: 'x', messages: [{ id: '1', role: 'user', parts: [{ type: 'text', text: 'a'.repeat(2001) }] }] };
    expect((await chat(post(tooLong))).status).toBe(400);
  });
});
