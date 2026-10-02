import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createImage, imageLimiter } from '@/lib/tools/images';
import { GeneratedImage } from '@/lib/models';
import { GET as getImage } from '@/app/api/images/[id]/route';
import { closeTestDatabase, jsonResponse, resetTestDatabase } from './helpers';

// A real 1x1 PNG, returned by the mocked image API
const PNG_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const PNG_BYTES = Buffer.from(PNG_BASE64, 'base64');

const imageResponse = () => jsonResponse({ created: 1, data: [{ b64_json: PNG_BASE64 }] });
const requestedModel = (call: unknown[]) => JSON.parse(String((call[1] as RequestInit).body)).model;

beforeEach(async () => {
  await resetTestDatabase();
  vi.spyOn(imageLimiter, 'tryAcquire').mockReturnValue(true);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
afterAll(closeTestDatabase);

describe('image generation tool', () => {
  it('creates an image, stores it in MongoDB linked to the chat, and returns its URL', async () => {
    const fetchMock = vi.fn(async () => imageResponse());
    vi.stubGlobal('fetch', fetchMock);

    const result = await createImage({ prompt: 'a cat astronaut', size: '1536x1024' }, 'chat-1');

    expect(result).toMatchObject({ type: 'image', model: 'gpt-image-1', size: '1536x1024', fallback: false });
    expect(result.url).toBe(`/api/images/${result.imageId}`);
    expect(requestedModel(fetchMock.mock.calls[0])).toBe('gpt-image-1');

    const saved = await GeneratedImage.findOne({ imageId: result.imageId }).lean();
    expect(saved).toMatchObject({ chatId: 'chat-1', prompt: 'a cat astronaut', bytes: PNG_BYTES.length });
  });

  it('falls back to the second model when the first one fails', async () => {
    const fetchMock = vi.fn(async (_url: string, init: RequestInit) =>
      JSON.parse(String(init.body)).model === 'gpt-image-1' ? jsonResponse({ error: { message: 'overloaded' } }, 500) : imageResponse()
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await createImage({ prompt: 'a red apple' });

    expect(result).toMatchObject({ model: 'google/gemini-2.5-flash-image', fallback: true });
  });

  it('gives a friendly error when every model fails', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ error: { message: 'down' } }, 500)));
    await expect(createImage({ prompt: 'a red apple' })).rejects.toThrow(/Could not generate the image/);
    expect(await GeneratedImage.countDocuments()).toBe(0);
  });

  it('validates the prompt before calling the API', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    await expect(createImage({ prompt: ' a ' })).rejects.toThrow(/3-1000 characters/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('respects the rate limit', async () => {
    vi.spyOn(imageLimiter, 'tryAcquire').mockReturnValue(false);
    await expect(createImage({ prompt: 'a red apple' })).rejects.toThrow(/Rate limit/);
  });
});

describe('GET /api/images/:id', () => {
  const params = (id: string) => ({ params: Promise.resolve({ id }) });

  it('returns the exact image bytes (regression: lean() returned an empty body)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => imageResponse()));
    const { imageId } = await createImage({ prompt: 'a red apple' });
    vi.unstubAllGlobals();

    const res = await getImage(new Request(`http://test/api/images/${imageId}`), params(imageId));

    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('image/png');
    expect(Buffer.from(await res.arrayBuffer()).equals(PNG_BYTES)).toBe(true);
  });

  it('adds a download header and returns 404 for unknown or invalid ids', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => imageResponse()));
    const { imageId } = await createImage({ prompt: 'a red apple' });

    const download = await getImage(new Request(`http://test/api/images/${imageId}?download`), params(imageId));
    expect(download.headers.get('content-disposition')).toMatch(/attachment/);

    expect((await getImage(new Request('http://test'), params('00000000-0000-0000-0000-000000000000'))).status).toBe(404);
    expect((await getImage(new Request('http://test'), params('../etc/passwd'))).status).toBe(404);
  });
});
