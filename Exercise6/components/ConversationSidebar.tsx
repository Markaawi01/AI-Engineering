'use client';

import { useEffect, useState } from 'react';

export type ConversationSummary = {
  id: string;
  title: string;
  updatedAt: string;
  messageCount: number;
};

type Props = {
  activeId: string;
  refreshKey: number;
  onSelect: (id: string) => void;
  onNew: () => void;
  onDelete: (id: string) => void;
};

// "Today", "Yesterday", "Previous 7 days", "Older"
function groupName(date: Date) {
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const days = (startOfToday.getTime() - new Date(date).setHours(0, 0, 0, 0)) / 86_400_000;
  if (days <= 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 7) return 'Previous 7 days';
  return 'Older';
}

export function ConversationSidebar({ activeId, refreshKey, onSelect, onNew, onDelete }: Props) {
  const [conversations, setConversations] = useState<ConversationSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  useEffect(() => {
    // Small delay so a search request isn't sent on every key press
    const timer = setTimeout(() => {
      fetch(`/api/conversations${search.trim() ? `?q=${encodeURIComponent(search.trim())}` : ''}`)
        .then(async (r) => {
          const data = await r.json();
          if (!r.ok) throw new Error(data.error);
          setConversations(data.conversations);
          setError(null);
        })
        .catch((e) => setError(e instanceof Error ? e.message : 'Could not load conversations'));
    }, search ? 250 : 0);
    return () => clearTimeout(timer);
  }, [refreshKey, search]);

  const groups = new Map<string, ConversationSummary[]>();
  for (const c of conversations ?? []) {
    const name = groupName(new Date(c.updatedAt));
    groups.set(name, [...(groups.get(name) ?? []), c]);
  }

  return (
    <nav aria-label="Conversations" className="flex flex-col h-full text-sm">
      <button
        onClick={onNew}
        className="flex items-center justify-center gap-2 rounded-lg bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 px-3 py-2 font-medium hover:opacity-90"
      >
        <span aria-hidden>＋</span> New chat
      </button>

      <input
        type="search"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search conversations…"
        maxLength={100}
        className="mt-3 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-transparent px-3 py-1.5 outline-none focus:ring-2 focus:ring-zinc-400"
      />

      <div className="mt-3 flex-1 overflow-y-auto -mx-1 px-1">
        {error && <p className="text-xs text-red-600">{error}</p>}
        {!conversations && !error && <p className="text-xs text-zinc-500">Loading…</p>}
        {conversations?.length === 0 && (
          <p className="text-xs text-zinc-500">{search ? 'No conversations match.' : 'No saved conversations yet.'}</p>
        )}

        {[...groups].map(([name, items]) => (
          <div key={name} className="mb-3">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-400 px-2 mb-1">{name}</p>
            <ul className="space-y-0.5">
              {items.map((c) => {
                const active = c.id === activeId;
                return (
                  <li key={c.id} className="group relative">
                    <button
                      onClick={() => onSelect(c.id)}
                      aria-current={active ? 'page' : undefined}
                      title={c.title}
                      className={`w-full text-left rounded-lg px-2 py-2 pr-8 truncate ${
                        active ? 'bg-zinc-200 dark:bg-zinc-800 font-medium' : 'hover:bg-zinc-100 dark:hover:bg-zinc-900'
                      }`}
                    >
                      {c.title}
                      <span className="block text-[11px] font-normal text-zinc-500">
                        {c.messageCount} messages · {new Date(c.updatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </button>
                    <button
                      onClick={() => {
                        if (confirm(`Delete "${c.title}"? This also deletes its images.`)) onDelete(c.id);
                      }}
                      aria-label={`Delete conversation ${c.title}`}
                      className="absolute right-1 top-1/2 -translate-y-1/2 rounded p-1 text-zinc-400 hover:text-red-600 opacity-100 lg:opacity-0 lg:group-hover:opacity-100 focus:opacity-100"
                    >
                      🗑️
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
    </nav>
  );
}
