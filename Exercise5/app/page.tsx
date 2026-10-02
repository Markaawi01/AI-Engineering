'use client';

import { useEffect, useState } from 'react';
import { Chat } from '@/components/Chat';
import type { ChatMessage } from '@/lib/tools';

const STORAGE_KEY = 'exercise5-chat-id';

const newId = () => crypto.randomUUID();

function readChatId() {
  // A link like /?chat=<id> opens that saved conversation
  const fromUrl = new URLSearchParams(window.location.search).get('chat');
  if (fromUrl && /^[\w-]{1,100}$/.test(fromUrl)) return fromUrl;
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) return saved;
    const id = newId();
    localStorage.setItem(STORAGE_KEY, id);
    return id;
  } catch {
    return newId(); // private mode / storage blocked
  }
}

// Loads the saved conversation (from MongoDB) before showing the chat
export default function Home() {
  const [chat, setChat] = useState<{ id: string; messages: ChatMessage[] } | null>(null);

  useEffect(() => {
    const id = readChatId();
    fetch(`/api/conversations/${id}`)
      .then((r) => (r.ok ? r.json() : { messages: [] }))
      .then((data) => setChat({ id, messages: data.messages }))
      .catch(() => setChat({ id, messages: [] }));
  }, []);

  async function clearChat() {
    if (!chat) return;
    await fetch(`/api/conversations/${chat.id}`, { method: 'DELETE' }).catch(() => {});
    const id = newId();
    try {
      localStorage.setItem(STORAGE_KEY, id);
    } catch {}
    setChat({ id, messages: [] });
  }

  if (!chat) {
    return <p className="p-6 text-sm text-zinc-500">Loading chat…</p>;
  }

  // `key` makes React start a fresh Chat when the id changes (after Clear)
  return <Chat key={chat.id} chatId={chat.id} initialMessages={chat.messages} onClear={clearChat} />;
}
