/* eslint-disable @next/next/no-img-element -- images come from our own /api/images route */
import type { ImageResult } from '@/lib/tools/images';

const ASPECT: Record<string, string> = {
  '1024x1024': 'aspect-square',
  '1536x1024': 'aspect-[3/2]',
  '1024x1536': 'aspect-[2/3]',
};

const MAX_WIDTH: Record<string, string> = {
  '1024x1024': 'max-w-md',
  '1536x1024': 'max-w-xl',
  '1024x1536': 'max-w-xs',
};

export function ImageCard({ image }: { image: ImageResult }) {
  return (
    <figure className={`w-full ${MAX_WIDTH[image.size] ?? 'max-w-md'} rounded-xl border border-zinc-200 dark:border-zinc-700 overflow-hidden`}>
      <a href={image.url} target="_blank" rel="noopener" title="Open full size">
        <img
          src={image.url}
          alt={image.prompt}
          loading="lazy"
          decoding="async"
          className={`w-full ${ASPECT[image.size] ?? 'aspect-square'} object-cover bg-zinc-100 dark:bg-zinc-800`}
        />
      </a>
      <figcaption className="p-3 text-sm space-y-2">
        <p className="text-zinc-600 dark:text-zinc-300 line-clamp-3">🎨 {image.prompt}</p>
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-zinc-500">
          <span>
            {image.model} · {image.size} · {(image.durationMs / 1000).toFixed(1)}s
            {image.fallback && ' · fallback model'}
          </span>
          <span className="flex gap-2">
            <a href={image.url} target="_blank" rel="noopener" className="underline">Open</a>
            <a href={`${image.url}?download`} className="underline">Download</a>
          </span>
        </div>
      </figcaption>
    </figure>
  );
}

// Placeholder with the right shape while the image is being created
export function ImageLoading({ size }: { size?: string }) {
  const s = size ?? '1024x1024';
  return (
    <div className={`w-full ${MAX_WIDTH[s] ?? 'max-w-md'} rounded-xl border border-dashed border-zinc-300 dark:border-zinc-700 overflow-hidden`}>
      <div className={`${ASPECT[s] ?? 'aspect-square'} bg-gradient-to-br from-zinc-100 to-zinc-200 dark:from-zinc-800 dark:to-zinc-900 animate-pulse flex flex-col items-center justify-center gap-2 text-sm text-zinc-500`}>
        <span className="h-6 w-6 rounded-full border-2 border-zinc-300 border-t-zinc-600 animate-spin" />
        Creating your image…
        <span className="text-xs">This usually takes 20–40 seconds</span>
      </div>
    </div>
  );
}
