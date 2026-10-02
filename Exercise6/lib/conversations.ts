import type { ChatMessage } from './tools';

const MAX_TITLE = 60;

// The sidebar title is the first thing the user asked, shortened
export function makeTitle(messages: ChatMessage[]): string {
  const firstUser = messages.find((m) => m.role === 'user');
  const text = firstUser?.parts
    .map((p) => (p.type === 'text' ? p.text : ''))
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!text) return 'New chat';
  return text.length > MAX_TITLE ? `${text.slice(0, MAX_TITLE - 1).trimEnd()}…` : text;
}
