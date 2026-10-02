import { z } from 'zod';
import { errorResponse } from '@/lib/api';
import { connectDB } from '@/lib/db';
import { Settings } from '@/lib/models';

const MODELS = ['openai/gpt-4o-mini', 'openai/gpt-4o', 'google/gemini-2.5-flash'] as const;

const settingsSchema = z.object({
  pageSize: z.number().int().min(1).max(50).optional(),
  defaultJokeCategory: z.enum(['dad', 'programming', 'general']).optional(),
  model: z.enum(MODELS).optional(),
});

const view = (s: { pageSize: number; defaultJokeCategory: string; model: string }) => ({
  pageSize: s.pageSize,
  defaultJokeCategory: s.defaultJokeCategory,
  model: s.model,
  availableModels: MODELS,
});

// GET /api/settings
export async function GET() {
  try {
    await connectDB();
    const settings = await Settings.findOneAndUpdate(
      { key: 'default' },
      { $setOnInsert: { key: 'default' } },
      { upsert: true, returnDocument: 'after' }
    ).lean();
    return Response.json(view(settings!));
  } catch (error) {
    return errorResponse('api/settings', error);
  }
}

// PUT /api/settings   body: { pageSize?, defaultJokeCategory?, model? }
export async function PUT(req: Request) {
  try {
    const changes = settingsSchema.parse(await req.json());
    await connectDB();
    const settings = await Settings.findOneAndUpdate(
      { key: 'default' },
      { $set: changes },
      { upsert: true, returnDocument: 'after', runValidators: true }
    ).lean();
    return Response.json(view(settings!));
  } catch (error) {
    return errorResponse('api/settings', error);
  }
}
