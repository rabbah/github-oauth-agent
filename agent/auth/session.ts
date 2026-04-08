interface SessionEntry {
  userId: string;
  name?: string;
  email?: string;
  expiresAt: number; // ms since epoch
}

const sessions = new Map<string, SessionEntry>();

export function setSession(conversationId: string, userId: string, expiresAt: number, name?: string, email?: string): void {
  sessions.set(conversationId, { userId, name, email, expiresAt });
}

export function getSession(conversationId: string): SessionEntry | null {
  const entry = sessions.get(conversationId);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    sessions.delete(conversationId);
    return null;
  }
  return entry;
}
