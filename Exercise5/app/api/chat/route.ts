import { convertToModelMessages, createIdGenerator, stepCountIs, streamText } from 'ai';
import { z } from 'zod';
import { getModel } from '@/lib/ai';
import { checkRateLimit, errorResponse } from '@/lib/api';
import { connectDB } from '@/lib/db';
import { friendlyError, logError } from '@/lib/logger';
import { Conversation, Settings } from '@/lib/models';
import { tools, type ChatMessage } from '@/lib/tools';

export const maxDuration = 60;

const SYSTEM_PROMPT = `You are a friendly assistant for a movie database app with three kinds of tools:
1. queryDatabase - questions about movies, users and reviews stored in OUR database.
2. getMovieInfo / recommendMovies - details from OMDb (plot, cast, poster) and recommendations.
3. getJoke / searchJokes / getTopJokes - jokes.
Rules:
- Always use a tool when the question is about the data, movies or jokes. Never invent data.
- IMPORTANT: the app already displays every tool result to the user as a table, movie card or joke card.
  So after a tool call NEVER write tables, bullet lists of the results, or the joke text again.
  Reply with ONE short sentence, e.g. "Here are the 7 sci-fi movies." or "Hope that made you laugh!"
- If a tool returns an error, explain it simply and suggest what the user can try.`;

// Validate the request body before doing anything expensive
const bodySchema = z.object({
  id: z.string().min(1).max(100),
  messages: z
    .array(z.object({ id: z.string(), role: z.enum(['user', 'assistant', 'system']), parts: z.array(z.any()) }).passthrough())
    .min(1)
    .max(100),
});

const MAX_USER_TEXT = 2000;

export async function POST(req: Request) {
  const limited = checkRateLimit(req);
  if (limited) return limited;

  let body: z.infer<typeof bodySchema>;
  try {
    body = bodySchema.parse(await req.json());
  } catch (error) {
    return errorResponse('api/chat', error);
  }

  // Older saved conversations may contain `null` fields, which the AI SDK rejects - remove them
  const messages = JSON.parse(JSON.stringify(body.messages), (_key, value) => (value === null ? undefined : value)) as ChatMessage[];
  const last = messages.at(-1)!;
  const lastText = last.parts.map((p) => (p.type === 'text' ? p.text : '')).join('');
  if (last.role === 'user' && (lastText.trim().length === 0 || lastText.length > MAX_USER_TEXT)) {
    return Response.json({ error: `Messages must be 1-${MAX_USER_TEXT} characters.` }, { status: 400 });
  }

  // The model name is a user setting; fall back to the default if the database is down
  let modelName: string | undefined;
  try {
    await connectDB();
    modelName = (await Settings.findOne({ key: 'default' }).lean())?.model;
  } catch {
    /* database down - tools will report it, chat still works */
  }

  const result = streamText({
    model: getModel(modelName),
    system: SYSTEM_PROMPT,
    messages: convertToModelMessages(messages),
    tools,
    stopWhen: stepCountIs(5), // allow a few tool calls + the final answer
  });

  return result.toUIMessageStreamResponse({
    originalMessages: messages,
    // Saved messages need unique ids, otherwise every assistant message gets id ""
    generateMessageId: createIdGenerator({ prefix: 'msg', size: 16 }),
    // Save the whole conversation after every answer (conversation history)
    onFinish: async ({ messages: finalMessages }) => {
      try {
        await Conversation.updateOne(
          { chatId: body.id },
          { $set: { messages: finalMessages } },
          { upsert: true }
        );
      } catch (error) {
        await logError('api/chat/save', error, { chatId: body.id });
      }
    },
    onError: (error) => {
      logError('api/chat/stream', error);
      return friendlyError(error);
    },
  });
}
