'use client';

import { useChat } from '@ai-sdk/react';
import { useEffect, useRef, useState } from 'react';
import type { ChatMessage } from '@/lib/tools';
import type { ImageSize } from '@/lib/tools/images';
import { ErrorCard, ToolResult } from './ToolResult';
import { Sidebar } from './Sidebar';

const EXAMPLES: { text: string; mode?: 'image' }[] = [
  { text: 'Show me all sci-fi movies' },
  { text: 'Find users over 25' },
  { text: 'Get movies with rating above 8.5' },
  { text: 'Count total movies by genre' },
  { text: 'Tell me about Inception and The Matrix' },
  { text: 'Recommend a drama from around 1995' },
  { text: 'Tell me a programming joke' },
  { text: 'A cozy cinema with popcorn, watercolor style', mode: 'image' },
];

const SIZES: { value: ImageSize; label: string }[] = [
  { value: '1024x1024', label: 'Square' },
  { value: '1536x1024', label: 'Landscape' },
  { value: '1024x1536', label: 'Portrait' },
];

function ImageIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <circle cx="8.5" cy="8.5" r="1.5" />
      <path d="M21 15l-5-5L5 21" />
    </svg>
  );
}

type Props = {
  chatId: string;
  initialMessages: ChatMessage[];
  onFinished: () => void; // tells the page an answer was saved (refresh the conversation list)
  onDeleteChat: () => void;
  onOpenMenu: () => void; // opens the conversation list on small screens
};

export function Chat({ chatId, initialMessages, onFinished, onDeleteChat, onOpenMenu }: Props) {
  const [input, setInput] = useState('');
  const [statsKey, setStatsKey] = useState(0);
  const [imageMode, setImageMode] = useState(false);
  const [imageSize, setImageSize] = useState<ImageSize>('1024x1024');
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const { messages, sendMessage, status, error, regenerate, clearError, stop } = useChat<ChatMessage>({
    id: chatId,
    messages: initialMessages,
    onFinish: () => {
      setStatsKey((k) => k + 1); // refresh tool statistics after each answer
      onFinished();
    },
  });

  const busy = status === 'submitted' || status === 'streaming';

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, status]);

  function send(text: string, mode: 'chat' | 'image' = imageMode ? 'image' : 'chat') {
    const trimmed = text.trim();
    if (!trimmed || busy) return;
    if (trimmed.length > 2000) return; // same limit as the server
    // `body` is sent to /api/chat together with the messages
    sendMessage({ text: trimmed }, { body: { mode, imageSize } });
    setInput('');
  }

  return (
    <div className="flex flex-col xl:flex-row gap-6 w-full max-w-6xl mx-auto px-4 py-6 flex-1 min-w-0">
      <main className="flex-1 min-w-0 flex flex-col">
        <header className="flex items-center justify-between gap-2 mb-4">
          <div className="flex items-center gap-2 min-w-0">
            <button
              onClick={onOpenMenu}
              aria-label="Open conversations"
              className="lg:hidden rounded-lg border px-2.5 py-1.5 hover:bg-zinc-100 dark:hover:bg-zinc-800"
            >
              ☰
            </button>
            <div className="min-w-0">
              <h1 className="text-xl font-bold truncate">🎬 Movie & Jokes Assistant</h1>
              <p className="text-xs text-zinc-500 truncate">Database · Movies · Jokes · Images — AI SDK v5 + MongoDB</p>
            </div>
          </div>
          <button
            onClick={() => {
              stop();
              onDeleteChat();
            }}
            disabled={messages.length === 0}
            className="shrink-0 text-sm rounded-lg border px-3 py-1.5 hover:bg-zinc-100 dark:hover:bg-zinc-800 disabled:opacity-40"
          >
            🗑️ <span className="hidden sm:inline">Delete chat</span>
          </button>
        </header>

        <div className="flex-1 space-y-4">
          {messages.length === 0 && (
            <div className="rounded-xl border border-dashed border-zinc-300 dark:border-zinc-700 p-4">
              <p className="text-sm text-zinc-500 mb-3">Try one of these:</p>
              <div className="flex flex-wrap gap-2">
                {EXAMPLES.map((e) => (
                  <button
                    key={e.text}
                    onClick={() => send(e.text, e.mode ?? 'chat')}
                    className="text-sm rounded-full border px-3 py-1 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                  >
                    {e.mode === 'image' && '🎨 '}
                    {e.text}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((message) => (
            <div key={message.id} className={message.role === 'user' ? 'flex justify-end' : ''}>
              <div className={message.role === 'user' ? 'max-w-[85%] rounded-2xl bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 px-4 py-2' : 'w-full space-y-2'}>
                {message.parts.map((part, i) =>
                  part.type === 'text' ? (
                    <p key={i} className="whitespace-pre-wrap leading-relaxed">{part.text}</p>
                  ) : (
                    <ToolResult key={i} part={part} />
                  )
                )}
              </div>
            </div>
          ))}

          {status === 'submitted' && <p className="text-sm text-zinc-500 animate-pulse">Thinking…</p>}

          {error && (
            <div className="space-y-2">
              <ErrorCard message={error.message || 'Something went wrong.'} />
              <div className="flex gap-2">
                <button onClick={() => regenerate()} className="text-sm rounded-lg border px-3 py-1">↻ Retry</button>
                <button onClick={clearError} className="text-sm rounded-lg border px-3 py-1">Dismiss</button>
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            send(input);
          }}
          className="sticky bottom-0 mt-4 bg-background py-3 space-y-2"
        >
          {imageMode && (
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="rounded-full bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-200 px-2.5 py-1 font-medium">
                🎨 Image mode
              </span>
              <div role="radiogroup" aria-label="Image size" className="flex rounded-full border overflow-hidden">
                {SIZES.map((s) => (
                  <button
                    key={s.value}
                    type="button"
                    role="radio"
                    aria-checked={imageSize === s.value}
                    onClick={() => setImageSize(s.value)}
                    className={`px-2.5 py-1 ${imageSize === s.value ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900' : 'hover:bg-zinc-100 dark:hover:bg-zinc-800'}`}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
              <button type="button" onClick={() => setImageMode(false)} className="text-zinc-500 underline">
                Back to chat
              </button>
            </div>
          )}

          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => {
                setImageMode((m) => !m);
                inputRef.current?.focus();
              }}
              aria-pressed={imageMode}
              aria-label={imageMode ? 'Turn off image mode' : 'Generate an image'}
              title={imageMode ? 'Turn off image mode' : 'Generate an image'}
              className={`shrink-0 rounded-xl border px-3 ${
                imageMode
                  ? 'bg-violet-600 border-violet-600 text-white'
                  : 'border-zinc-300 dark:border-zinc-700 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800'
              }`}
            >
              <ImageIcon />
            </button>
            <input
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              maxLength={2000}
              placeholder={imageMode ? 'Describe the image you want…' : 'Ask about movies, users, reviews or jokes…'}
              className={`flex-1 min-w-0 rounded-xl border bg-transparent px-4 py-2 outline-none focus:ring-2 ${
                imageMode ? 'border-violet-400 focus:ring-violet-400' : 'border-zinc-300 dark:border-zinc-700 focus:ring-zinc-400'
              }`}
            />
            {busy ? (
              <button type="button" onClick={stop} className="rounded-xl border px-4 py-2">Stop</button>
            ) : (
              <button
                type="submit"
                disabled={!input.trim()}
                className={`rounded-xl px-4 py-2 text-white disabled:opacity-40 ${
                  imageMode ? 'bg-violet-600' : 'bg-zinc-900 dark:bg-zinc-100 dark:text-zinc-900'
                }`}
              >
                {imageMode ? 'Create' : 'Send'}
              </button>
            )}
          </div>
        </form>
      </main>

      <div className="xl:w-72 shrink-0 xl:border-l xl:pl-6 border-zinc-200 dark:border-zinc-800">
        <Sidebar refreshKey={statsKey} />
      </div>
    </div>
  );
}
