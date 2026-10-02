import { z } from 'zod';
import { checkRateLimit, errorResponse } from '@/lib/api';
import { rateJoke } from '@/lib/tools/jokes';

const bodySchema = z.object({ vote: z.enum(['up', 'down']) });

// POST /api/jokes/<jokeId>/vote   body: { "vote": "up" | "down" }
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const limited = checkRateLimit(req);
  if (limited) return limited;

  try {
    const { id } = await params;
    const { vote } = bodySchema.parse(await req.json());
    return Response.json(await rateJoke(id, vote));
  } catch (error) {
    return errorResponse('api/jokes/vote', error);
  }
}
