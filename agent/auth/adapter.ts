import type { AgentAdapter, StreamHooks, StreamOptions } from '@astropods/adapter-core';
import { getAuthorizationUrl } from './oauth';
import { getSession } from './session';

/**
 * AuthAdapter wraps any AgentAdapter and enforces OAuth authentication.
 *
 * On every incoming message it checks whether the conversation already has
 * a live session (set by the OAuth callback server after the user signs in).
 * If not, it responds with a sign-in link and drops the message — the inner
 * adapter never sees it.
 *
 * The conversationId is used as the OAuth `state` parameter so the callback
 * server knows which session to activate after the provider redirects back.
 */
export class AuthAdapter implements AgentAdapter {
  readonly name: string;

  constructor(private readonly inner: AgentAdapter) {
    this.name = inner.name;

    // Forward optional streamAudio if the inner adapter supports it.
    if (inner.streamAudio) {
      this.streamAudio = inner.streamAudio.bind(inner);
    }
  }

  streamAudio?: AgentAdapter['streamAudio'];

  async stream(prompt: string, hooks: StreamHooks, options: StreamOptions): Promise<void> {
    const session = getSession(options.conversationId);

    if (!session) {
      const authUrl = getAuthorizationUrl(options.conversationId);
      hooks.onChunk(
        `You need to sign in before I can help you.\n\n` +
          `[Click here to authenticate](${authUrl})\n\n` +
          `Once you've signed in, send me another message and I'll be ready to go.`,
      );
      hooks.onFinish();
      return;
    }

    const identity = [
      `The user is authenticated.`,
      `Their OAuth user ID is: ${session.userId}`,
      session.name  ? `Their name is: ${session.name}`  : null,
      session.email ? `Their email is: ${session.email}` : null,
    ].filter(Boolean).join(' ');

    const withContext = `[${identity}]\n\n${prompt}`;

    return this.inner.stream(withContext, hooks, options);
  }

  getConfig() {
    return this.inner.getConfig();
  }
}
