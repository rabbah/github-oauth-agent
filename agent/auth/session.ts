interface SessionEntry {
  userId: string;
  login?: string;    // GitHub login / username (used for API calls)
  name?: string;
  email?: string;
  accessToken: string;
  expiresAt: number; // ms since epoch
}

const sessions = new Map<string, SessionEntry>();

export function setSession(
  conversationId: string,
  userId: string,
  expiresAt: number,
  accessToken: string,
  login?: string,
  name?: string,
  email?: string,
): void {
  sessions.set(conversationId, { userId, login, name, email, accessToken, expiresAt });
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
