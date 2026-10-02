import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError, CircuitBreaker, CircuitOpenError, RateLimiter, fetchJson, withRetry } from '@/lib/resilience';
import { jsonResponse } from './helpers';

afterEach(() => vi.unstubAllGlobals());

describe('withRetry', () => {
  it('retries temporary errors and then succeeds', async () => {
    const fn = vi.fn()
      .mockRejectedValueOnce(new ApiError('down', 503, true))
      .mockResolvedValueOnce('ok');
    await expect(withRetry(fn, { baseDelayMs: 1 })).resolves.toBe('ok');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('does not retry permanent errors', async () => {
    const fn = vi.fn().mockRejectedValue(new ApiError('bad request', 400, false));
    await expect(withRetry(fn, { baseDelayMs: 1 })).rejects.toThrow('bad request');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('gives up after the retry limit', async () => {
    const fn = vi.fn().mockRejectedValue(new ApiError('down', 503, true));
    await expect(withRetry(fn, { retries: 2, baseDelayMs: 1 })).rejects.toThrow('down');
    expect(fn).toHaveBeenCalledTimes(3);
  });
});

describe('CircuitBreaker', () => {
  it('opens after 3 failures, fails fast, then half-opens after the cooldown', async () => {
    let now = 0;
    const breaker = new CircuitBreaker('Test API', 3, 1000, () => now);
    const failing = vi.fn().mockRejectedValue(new ApiError('down', 500, true));

    for (let i = 0; i < 3; i++) await expect(breaker.call(failing)).rejects.toThrow('down');
    expect(breaker.getState()).toBe('OPEN');

    // While open, the API is not called at all
    await expect(breaker.call(failing)).rejects.toBeInstanceOf(CircuitOpenError);
    expect(failing).toHaveBeenCalledTimes(3);

    now = 1000;
    expect(breaker.getState()).toBe('HALF_OPEN');
    await expect(breaker.call(async () => 'back')).resolves.toBe('back');
    expect(breaker.getState()).toBe('CLOSED');
  });

  it('does not count "not found" style errors as outages', async () => {
    const breaker = new CircuitBreaker('Test API', 1);
    await expect(breaker.call(() => Promise.reject(new ApiError('not found', 404, false)))).rejects.toThrow();
    expect(breaker.getState()).toBe('CLOSED');
  });
});

describe('RateLimiter', () => {
  it('allows N calls per window per key', () => {
    let now = 0;
    const limiter = new RateLimiter(2, 1000, () => now);
    expect([limiter.tryAcquire('a'), limiter.tryAcquire('a'), limiter.tryAcquire('a')]).toEqual([true, true, false]);
    expect(limiter.tryAcquire('b')).toBe(true); // other visitors are not affected
    now = 1001;
    expect(limiter.tryAcquire('a')).toBe(true);
  });
});

describe('fetchJson', () => {
  it('maps HTTP status codes to retryable / permanent errors', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({}, 503)));
    await expect(fetchJson('http://x')).rejects.toMatchObject({ status: 503, retryable: true });

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({}, 404)));
    await expect(fetchJson('http://x')).rejects.toMatchObject({ status: 404, retryable: false });

    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('fetch failed')));
    await expect(fetchJson('http://x')).rejects.toThrow('network error');
  });
});
