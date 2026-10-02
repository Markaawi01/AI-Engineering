'use client';

import { useCallback, useEffect, useState } from 'react';
import { Chat } from '@/components/Chat';
import { ConversationSidebar } from '@/components/ConversationSidebar';
import type { ChatMessage } from '@/lib/tools';

const STORAGE_KEY = 'exercise6-chat-id';

const newId = () => crypto.randomUUID();
const isValidId = (id: string | null): id is string => !!id && /^[\w-]{1,100}$/.test(id);

function rememberId(id: string) {
  try {
    localStorage.setItem(STORAGE_KEY, id);
  } catch {
    /* private mode / storage blocked */
  }
}

// Which conversation to open first: the ?chat=<id> link, then the last one used, else a new one
function initialChatId() {
  const fromUrl = new URLSearchParams(window.location.search).get('chat');
  if (isValidId(fromUrl)) return fromUrl;
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (isValidId(saved)) return saved;
  } catch {}
  return newId();
}

type OpenChat = { id: string; messages: ChatMessage[] };

export default function Home() {
  const [chat, setChat] = useState<OpenChat | null>(null);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [listKey, setListKey] = useState(0); // changing it reloads the conversation list
  const [menuOpen, setMenuOpen] = useState(false);

  // Load a saved conversation from MongoDB and show it
  const openChat = useCallback(async (id: string, { updateUrl = true } = {}) => {
    setLoadingId(id);
    setLoadError(null);
    try {
      const res = await fetch(`/api/conversations/${id}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setChat({ id, messages: data.messages });
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : 'Could not load this conversation');
      setChat((current) => current ?? { id, messages: [] });
    } finally {
      setLoadingId(null);
    }
    rememberId(id);
    // Put the id in the address bar so Back/Forward and bookmarks work
    if (updateUrl) window.history.pushState({ chatId: id }, '', `/?chat=${id}`);
    setMenuOpen(false);
  }, []);

  function startNewChat() {
    const id = newId();
    setChat({ id, messages: [] });
    setLoadError(null);
    rememberId(id);
    window.history.pushState({ chatId: id }, '', '/');
    setMenuOpen(false);
  }

  async function deleteChat(id: string) {
    await fetch(`/api/conversations/${id}`, { method: 'DELETE' }).catch(() => {});
    setListKey((k) => k + 1);
    if (id === chat?.id) startNewChat();
  }

  useEffect(() => {
    openChat(initialChatId(), { updateUrl: false });

    // Browser Back/Forward buttons switch between conversations
    const onPopState = () => {
      const id = new URLSearchParams(window.location.search).get('chat');
      if (isValidId(id)) openChat(id, { updateUrl: false });
      else startNewChat();
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openChat]);

  const sidebar = (
    <ConversationSidebar
      activeId={chat?.id ?? ''}
      refreshKey={listKey}
      onSelect={(id) => (id === chat?.id ? setMenuOpen(false) : openChat(id))}
      onNew={startNewChat}
      onDelete={deleteChat}
    />
  );

  return (
    <div className="flex flex-1 min-h-0 w-full">
      {/* Conversation list: always visible on large screens */}
      <aside className="hidden lg:block w-64 shrink-0 border-r border-zinc-200 dark:border-zinc-800 p-3 h-screen sticky top-0">
        {sidebar}
      </aside>

      {/* Conversation list on small screens: a drawer opened with the ☰ button */}
      {menuOpen && (
        <div className="lg:hidden fixed inset-0 z-40 flex">
          <div className="w-72 max-w-[85%] bg-background p-3 shadow-xl h-full">{sidebar}</div>
          <button aria-label="Close conversations" className="flex-1 bg-black/40" onClick={() => setMenuOpen(false)} />
        </div>
      )}

      <div className="flex-1 min-w-0 flex flex-col">
        {loadError && (
          <p role="alert" className="mx-4 mt-4 rounded-lg bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300 px-3 py-2 text-sm">
            {loadError}
          </p>
        )}
        {!chat || loadingId === chat.id ? (
          <p className="p-6 text-sm text-zinc-500">Loading chat…</p>
        ) : (
          // `key` makes React start a fresh Chat for every conversation
          <Chat
            key={chat.id}
            chatId={chat.id}
            initialMessages={chat.messages}
            onFinished={() => setTimeout(() => setListKey((k) => k + 1), 500)}
            onDeleteChat={() => deleteChat(chat.id)}
            onOpenMenu={() => setMenuOpen(true)}
          />
        )}
        {loadingId && chat && loadingId !== chat.id && (
          <div className="fixed bottom-4 right-4 rounded-lg bg-zinc-900 text-white text-sm px-3 py-2 shadow">Opening conversation…</div>
        )}
      </div>
    </div>
  );
}
