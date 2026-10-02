// Error-handling building blocks shared by all tools:
// retry with backoff, circuit breaker, rate limiter, and fetch with a timeout.

export class ApiError extends Error {
  constructor(message: string, public status?: number, public retryable = true) {
    super(message);
    this.name = 'ApiError';
  }
}

export class CircuitOpenError extends Error {
  constructor(service: string, public retryInMs: number) {
    super(`${service} is temporarily unavailable (too many failures). Trying again in ${Math.ceil(retryInMs / 1000)}s.`);
    this.name = 'CircuitOpenError';
  }
}

export class RateLimitError extends Error {
  constructor(service: string) {
    super(`Rate limit reached for ${service}. Please wait a moment.`);
    this.name = 'RateLimitError';
  }
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// ---------- Retry ----------

export async function withRetry<T>(
  fn: () => Promise<T>,
  { retries = 2, baseDelayMs = 300 }: { retries?: number; baseDelayMs?: number } = {}
): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn();
    } catch (error) {
      // Don't retry things that will fail again: bad input, 404, open circuit, rate limit
      const retryable = error instanceof ApiError ? error.retryable : !(error instanceof CircuitOpenError || error instanceof RateLimitError);
      if (attempt >= retries || !retryable) throw error;
      await sleep(baseDelayMs * 2 ** attempt); // 300ms, 600ms, 1200ms...
    }
  }
}

// ---------- Circuit breaker ----------
// CLOSED: calls go through. After `failureThreshold` failures in a row -> OPEN.
// OPEN: calls fail immediately (no waiting on a dead API). After `cooldownMs` -> HALF_OPEN.
// HALF_OPEN: one test call. Success -> CLOSED, failure -> OPEN again.

type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

export class CircuitBreaker {
  private state: CircuitState = 'CLOSED';
  private failures = 0;
  private openedAt = 0;

  constructor(
    private service: string,
    private failureThreshold = 3,
    private cooldownMs = 30_000,
    private now: () => number = Date.now
  ) {}

  getState(): CircuitState {
    if (this.state === 'OPEN' && this.now() - this.openedAt >= this.cooldownMs) {
      this.state = 'HALF_OPEN';
    }
    return this.state;
  }

  async call<T>(fn: () => Promise<T>): Promise<T> {
    if (this.getState() === 'OPEN') {
      throw new CircuitOpenError(this.service, this.cooldownMs - (this.now() - this.openedAt));
    }
    try {
      const result = await fn();
      this.failures = 0;
      this.state = 'CLOSED';
      return result;
    } catch (error) {
      // Only real outages count - a "movie not found" is not the API's fault
      if (!(error instanceof ApiError) || error.retryable) {
        this.failures++;
        if (this.state === 'HALF_OPEN' || this.failures >= this.failureThreshold) {
          this.state = 'OPEN';
          this.openedAt = this.now();
        }
      }
      throw error;
    }
  }
}

// ---------- Rate limiter (sliding window) ----------

export class RateLimiter {
  private hits = new Map<string, number[]>();

  constructor(private limit: number, private windowMs: number, private now: () => number = Date.now) {}

  /** Returns true if the call is allowed and records it. */
  tryAcquire(key = 'global'): boolean {
    const cutoff = this.now() - this.windowMs;
    const recent = (this.hits.get(key) ?? []).filter((t) => t > cutoff);
    if (recent.length >= this.limit) {
      this.hits.set(key, recent);
      return false;
    }
    recent.push(this.now());
    this.hits.set(key, recent);
    return true;
  }
}

// ---------- fetch with timeout ----------

export async function fetchJson<T = unknown>(
  url: string,
  { timeoutMs = 8000, headers = {} }: { timeoutMs?: number; headers?: Record<string, string> } = {}
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, { headers, signal: AbortSignal.timeout(timeoutMs) });
  } catch (error) {
    const reason = error instanceof Error && error.name === 'TimeoutError' ? 'timed out' : 'network error';
    throw new ApiError(`Request ${reason}`, undefined, true);
  }

  if (response.status === 429) throw new ApiError('Rate limited by API', 429, true);
  if (response.status >= 500) throw new ApiError(`API server error (${response.status})`, response.status, true);
  if (!response.ok) throw new ApiError(`API request failed (${response.status})`, response.status, false);

  try {
    return (await response.json()) as T;
  } catch {
    throw new ApiError('API returned invalid JSON', response.status, true);
  }
}
