import { experimental_generateImage as generateImage } from 'ai';
import { randomUUID } from 'crypto';
import { getImageModel, IMAGE_MODELS } from '../ai';
import { connectDB } from '../db';
import { logError } from '../logger';
import { GeneratedImage } from '../models';
import { ApiError, RateLimiter, RateLimitError, withRetry } from '../resilience';

export const IMAGE_SIZES = ['1024x1024', '1536x1024', '1024x1536'] as const; // square, landscape, portrait
export type ImageSize = (typeof IMAGE_SIZES)[number];

// Every image costs money, so allow at most 10 per minute from this server
export const imageLimiter = new RateLimiter(10, 60_000);

const TIMEOUT_MS = 90_000; // image models can take 20-40 seconds

export type ImageResult = {
  type: 'image';
  imageId: string;
  url: string;
  prompt: string;
  model: string;
  size: ImageSize;
  durationMs: number;
  fallback: boolean;
};

export async function createImage(
  { prompt, size = '1024x1024' }: { prompt: string; size?: ImageSize },
  chatId?: string
): Promise<ImageResult> {
  prompt = prompt.trim();
  if (prompt.length < 3 || prompt.length > 1000) {
    throw new ApiError('Please describe the image in 3-1000 characters.', 400, false);
  }
  if (!imageLimiter.tryAcquire()) throw new RateLimitError('image generation');

  const started = Date.now();
  let lastError: unknown;

  // Try each model in order; the first one that works wins
  for (const [index, model] of IMAGE_MODELS.entries()) {
    try {
      const { image } = await withRetry(
        () =>
          generateImage({
            model: getImageModel(model),
            prompt,
            size,
            providerOptions: { openai: { quality: 'low' } }, // 'low' is fast and cheap; use 'high' for better images
            abortSignal: AbortSignal.timeout(TIMEOUT_MS),
            maxRetries: 0, // withRetry handles retries
          }),
        { retries: 1, baseDelayMs: 1000 }
      );

      await connectDB();
      const imageId = randomUUID();
      await GeneratedImage.create({
        imageId,
        chatId,
        prompt,
        model,
        size,
        contentType: image.mediaType || 'image/png',
        data: Buffer.from(image.uint8Array),
        bytes: image.uint8Array.length,
      });

      return {
        type: 'image',
        imageId,
        url: `/api/images/${imageId}`,
        prompt,
        model,
        size,
        durationMs: Date.now() - started,
        fallback: index > 0,
      };
    } catch (error) {
      lastError = error;
      await logError('images/generate', error, { model, prompt });
    }
  }

  const reason = lastError instanceof Error && /safety|moderation|policy|rejected/i.test(lastError.message)
    ? 'The image request was refused by the safety filter. Try describing it differently.'
    : 'Could not generate the image right now. Please try again in a moment.';
  throw new ApiError(reason, 503, false);
}

export async function deleteImagesForChat(chatId: string) {
  await connectDB();
  const { deletedCount } = await GeneratedImage.deleteMany({ chatId });
  return deletedCount;
}
