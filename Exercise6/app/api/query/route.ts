import { checkRateLimit, errorResponse } from '@/lib/api';
import { runDatabaseQuery } from '@/lib/tools/database';

// Runs a query spec directly, without the AI. The UI uses it for "next page" buttons.
export async function POST(req: Request) {
  const limited = checkRateLimit(req);
  if (limited) return limited;

  try {
    return Response.json(await runDatabaseQuery(await req.json()));
  } catch (error) {
    return errorResponse('api/query', error);
  }
}
