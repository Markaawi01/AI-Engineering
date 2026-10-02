import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { makeTitle } from '@/lib/conversations';
import { Conversation, GeneratedImage } from '@/lib/models';
import { GET as listConversations } from '@/app/api/conversations/route';
import { DELETE as deleteConversation, GET as getConversation } from '@/app/api/conversations/[id]/route';
import { POST as chat } from '@/app/api/chat/route';
import type { ChatMessage } from '@/lib/tools';
import { closeTestDatabase, resetTestDatabase } from './helpers';

beforeEach(resetTestDatabase);
afterAll(closeTestDatabase);

const userMessage = (text: string): ChatMessage => ({ id: 'u-' + text, role: 'user', parts: [{ type: 'text', text }] });
const params = (id: string) => ({ params: Promise.resolve({ id }) });

async function saveConversation(chatId: string, title: string, updatedAt: Date, messages = [userMessage(title)]) {
  await Conversation.collection.insertOne({ chatId, title, messages, createdAt: updatedAt, updatedAt });
}

describe('conversation titles', () => {
  it('uses the first user message, shortened', () => {
    expect(makeTitle([userMessage('Show me all   sci-fi movies')])).toBe('Show me all sci-fi movies');
    const long = makeTitle([userMessage('a'.repeat(100))]);
    expect(long).toHaveLength(60);
    expect(long.endsWith('…')).toBe(true);
    expect(makeTitle([])).toBe('New chat');
  });
});

describe('GET /api/conversations (sidebar list)', () => {
  it('lists conversations newest first without sending the messages', async () => {
    await saveConversation('old', 'Old chat', new Date('2026-01-01'));
    await saveConversation('new', 'New chat about jokes', new Date('2026-09-01'));
    await saveConversation('empty', 'Nothing yet', new Date('2026-10-01'), []); // no messages -> hidden

    const { conversations } = await (await listConversations(new Request('http://test/api/conversations'))).json();

    expect(conversations.map((c: { id: string }) => c.id)).toEqual(['new', 'old']);
    expect(conversations[0]).toEqual({ id: 'new', title: 'New chat about jokes', messageCount: 1, updatedAt: '2026-09-01T00:00:00.000Z' });
  });

  it('searches titles (case-insensitive, regex characters are safe)', async () => {
    await saveConversation('a', 'Sci-fi movies', new Date());
    await saveConversation('b', 'Programming jokes', new Date());

    const search = async (q: string) =>
      (await (await listConversations(new Request(`http://test/api/conversations?q=${encodeURIComponent(q)}`))).json()).conversations;

    expect((await search('JOKES')).map((c: { id: string }) => c.id)).toEqual(['b']);
    expect(await search('.*')).toEqual([]);
  });
});

describe('opening and deleting a conversation', () => {
  it('GET returns the saved messages for the clicked conversation', async () => {
    await saveConversation('c1', 'Find users over 25', new Date());
    const data = await (await getConversation(new Request('http://test'), params('c1'))).json();
    expect(data).toMatchObject({ id: 'c1', title: 'Find users over 25' });
    expect(data.messages[0].parts[0].text).toBe('Find users over 25');
  });

  it('DELETE removes the conversation and only its own images', async () => {
    await saveConversation('c1', 'Draw a cat', new Date());
    const image = { prompt: 'cat', model: 'gpt-image-1', size: '1024x1024', contentType: 'image/png', data: Buffer.from('x'), bytes: 1 };
    await GeneratedImage.create([
      { ...image, imageId: 'i1', chatId: 'c1' },
      { ...image, imageId: 'i2', chatId: 'c1' },
      { ...image, imageId: 'i3', chatId: 'other' },
    ]);

    const data = await (await deleteConversation(new Request('http://test'), params('c1'))).json();

    expect(data).toEqual({ deleted: true, imagesDeleted: 2 });
    expect(await Conversation.exists({ chatId: 'c1' })).toBeNull();
    expect(await GeneratedImage.find().distinct('imageId')).toEqual(['i3']);
  });
});

describe('POST /api/chat image mode', () => {
  const post = (body: unknown) =>
    new Request('http://test/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

  it('rejects unknown modes and image sizes before calling the AI', async () => {
    const messages = [userMessage('a cat')];
    expect((await chat(post({ id: 'x', messages, mode: 'video' }))).status).toBe(400);
    expect((await chat(post({ id: 'x', messages, mode: 'image', imageSize: '99x99' }))).status).toBe(400);
  });
});
