import { createOpenAI } from '@ai-sdk/openai';

// Our key is an OpenRouter key, so the OpenAI provider points at OpenRouter.
// `.chat()` uses the Chat Completions API - OpenRouter's Responses API does not support tools well.
const openrouter = createOpenAI({
  baseURL: 'https://openrouter.ai/api/v1',
  apiKey: process.env.OPENAI_API_KEY,
});

export const DEFAULT_MODEL = 'openai/gpt-4o-mini';

export const getModel = (name: string = DEFAULT_MODEL) => openrouter.chat(name);

// Image models are tried in this order (the second one is the fallback)
export const IMAGE_MODELS = ['gpt-image-1', 'google/gemini-2.5-flash-image'] as const;

export const getImageModel = (name: string) => openrouter.image(name);
