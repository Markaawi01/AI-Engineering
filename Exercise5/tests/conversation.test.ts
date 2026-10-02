import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { convertToModelMessages } from 'ai';
import { Conversation } from '@/lib/models';
import { tools, type ChatMessage } from '@/lib/tools';
import { closeTestDatabase, resetTestDatabase } from './helpers';

beforeAll(resetTestDatabase);
afterAll(closeTestDatabase);

describe('conversation history', () => {
  it('a saved conversation with tool calls can be sent to the AI again after reloading', async () => {
    // Shape produced by the AI SDK: `providerExecuted` is undefined
    const messages: ChatMessage[] = [
      { id: 'u1', role: 'user', parts: [{ type: 'text', text: 'Find users over 25' }] },
      {
        id: 'a1',
        role: 'assistant',
        parts: [
          {
            type: 'tool-getTopJokes',
            toolCallId: 'call_1',
            state: 'output-available',
            input: { limit: 3 },
            output: { type: 'jokeList', keyword: 'top rated', jokes: [] },
            providerExecuted: undefined,
          },
          { type: 'text', text: 'Here you go.' },
        ],
      },
    ];

    await Conversation.updateOne({ chatId: 'history-test' }, { $set: { messages } }, { upsert: true });
    const loaded = (await Conversation.findOne({ chatId: 'history-test' }).lean())!.messages as ChatMessage[];

    // Before the fix MongoDB stored undefined as null and this threw "Invalid prompt"
    expect(JSON.stringify(loaded)).not.toContain('null');
    expect(() => convertToModelMessages(loaded, { tools })).not.toThrow();
  });
});
