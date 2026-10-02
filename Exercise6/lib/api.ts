import { ZodError } from 'zod';
import { friendlyError, logError } from './logger';
import { RateLimiter } from './resilience';

// Every API route returns errors in the same shape: { error: "message" }
export async function errorResponse(source: string, error: unknown) {
  if (error instanceof ZodError) {
    const details = error.issues.map((i) => `${i.path.join('.') || 'body'}: ${i.message}`).join('; ');
    return Response.json({ error: `Invalid input - ${details}` }, { status: 400 });
  }

  const name = error instanceof Error ? error.name : '';
  const status =
    name === 'QueryValidationError' ? 400 :
    name === 'RateLimitError' ? 429 :
    name === 'DatabaseError' || name === 'CircuitOpenError' ? 503 :
    (error as { status?: number })?.status && (error as { status: number }).status < 500
      ? (error as { status: number }).status
      : 500;

  if (status >= 500) await logError(source, error);
  const message = status === 404 || status === 400 ? (error as Error).message : friendlyError(error);
  return Response.json({ error: message }, { status });
}

// Simple per-visitor rate limit for our own API (protects the OpenRouter bill)
const visitorLimiter = new RateLimiter(20, 60_000);

export function checkRateLimit(req: Request) {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0].trim() || 'local';
  if (!visitorLimiter.tryAcquire(ip)) {
    return Response.json({ error: 'Too many requests. Please wait a minute and try again.' }, { status: 429 });
  }
  return null;
}
