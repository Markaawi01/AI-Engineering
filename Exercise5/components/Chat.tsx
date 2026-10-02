'use client';

import { useChat } from '@ai-sdk/react';
import { useEffect, useRef, useState } from 'react';
import type { ChatMessage } from '@/lib/tools';
import { ErrorCard, ToolResult } from './ToolResult';
import { Sidebar } from './Sidebar';

const EXAMPLES = [
  'Show me all sci-fi movies',
  'Find users over 25',
  'Get movies with rating above 8.5',
  'Count total movies by genre',
  'Tell me about Inception and The Matrix',
  'Recommend a drama from around 1995',
  'Tell me a programming joke',
  'Search jokes about cats',
];

export function Chat({ chatId, initialMessages, onClear }: { chatId: string; initialMessages: ChatMessage[]; onClear: () => void }) {
  const [input, setInput] = useState('');
  const [statsKey, setStatsKey] = useState(0);
  const bottomRef = useRef<HTMLDivElement>(null);

  const { messages, sendMessage, status, error, regenerate, clearError, stop } = useChat<ChatMessage>({
    id: chatId,
    messages: initialMessages,
    onFinish: () => setStatsKey((k) => k + 1), // refresh tool statistics after each answer
  });

  const busy = status === 'submitted' || status === 'streaming';

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, status]);

  function send(text: string) {
    const trimmed = text.trim();
    if (!trimmed || busy) return;
    if (trimmed.length > 2000) return; // same limit as the server
    sendMessage({ text: trimmed });
    setInput('');
  }

  return (
    <div className="flex flex-col lg:flex-row gap-6 w-full max-w-6xl mx-auto px-4 py-6 flex-1">
      <main className="flex-1 min-w-0 flex flex-col">
        <header className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-xl font-bold">🎬 Movie & Jokes Assistant</h1>
            <p className="text-xs text-zinc-500">Database chat · OMDb movies · Dad jokes — AI SDK v5 + MongoDB</p>
          </div>
          <button
            onClick={() => {
              stop();
              onClear();
            }}
            disabled={messages.length === 0}
            className="text-sm rounded-lg border px-3 py-1.5 hover:bg-zinc-100 dark:hover:bg-zinc-800 disabled:opacity-40"
          >
            🗑️ Clear chat
          </button>
        </header>

        <div className="flex-1 space-y-4">
          {messages.length === 0 && (
            <div className="rounded-xl border border-dashed border-zinc-300 dark:border-zinc-700 p-4">
              <p className="text-sm text-zinc-500 mb-3">Try one of these:</p>
              <div className="flex flex-wrap gap-2">
                {EXAMPLES.map((e) => (
                  <button key={e} onClick={() => send(e)} className="text-sm rounded-full border px-3 py-1 hover:bg-zinc-100 dark:hover:bg-zinc-800">
                    {e}
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
          className="sticky bottom-0 mt-4 flex gap-2 bg-background py-3"
        >
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            maxLength={2000}
            placeholder="Ask about movies, users, reviews or jokes…"
            className="flex-1 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-transparent px-4 py-2 outline-none focus:ring-2 focus:ring-zinc-400"
          />
          {busy ? (
            <button type="button" onClick={stop} className="rounded-xl border px-4 py-2">Stop</button>
          ) : (
            <button type="submit" disabled={!input.trim()} className="rounded-xl bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 px-4 py-2 disabled:opacity-40">
              Send
            </button>
          )}
        </form>
      </main>

      <div className="lg:w-72 shrink-0 lg:border-l lg:pl-6 border-zinc-200 dark:border-zinc-800">
        <Sidebar refreshKey={statsKey} />
      </div>
    </div>
  );
}
