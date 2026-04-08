import { exchangeCode, fetchUserInfo } from './oauth';
import { setSession } from './session';

const PORT = Number(process.env.CALLBACK_PORT ?? 3001);
const PLAYGROUND_URL = process.env.PLAYGROUND_URL ?? 'http://localhost:3000';
const SESSION_TTL_MS = 8 * 60 * 60 * 1000; // 8 hours

function html(title: string, body: string): Response {
  return new Response(
    `<!DOCTYPE html><html><head><title>${title}</title>
<style>body{font-family:sans-serif;max-width:480px;margin:80px auto;text-align:center}</style>
</head><body>${body}</body></html>`,
    { headers: { 'Content-Type': 'text/html; charset=utf-8' } },
  );
}

async function handleCallback(url: URL): Promise<Response> {
  const error = url.searchParams.get('error');
  if (error) {
    const desc = url.searchParams.get('error_description') ?? error;
    return html('Sign-in failed', `<h2>Sign-in failed</h2><p>${desc}</p>`);
  }

  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state'); // conversationId encoded here

  if (!code || !state) {
    return html(
      'Bad request',
      '<h2>Bad request</h2><p>Missing <code>code</code> or <code>state</code> parameter.</p>',
    );
  }

  const accessToken = await exchangeCode(code);
  const userInfo = await fetchUserInfo(accessToken);

  setSession(state, userInfo.id, Date.now() + SESSION_TTL_MS, userInfo.name, userInfo.email);
  console.log(`[auth] authenticated user=${userInfo.id} conversation=${state}`);

  return new Response(null, {
    status: 302,
    headers: { Location: `${PLAYGROUND_URL}?conversation=${state}&replay_last=true` },
  });
}

export function startCallbackServer(): void {
  Bun.serve({
    port: PORT,
    async fetch(req) {
      const url = new URL(req.url);

      if (url.pathname !== '/callback') {
        return new Response('Not found', { status: 404 });
      }

      try {
        return await handleCallback(url);
      } catch (err) {
        console.error('[auth] callback error:', err);
        return html(
          'Sign-in error',
          '<h2>Something went wrong</h2><p>Authentication failed. Please try again.</p>',
        );
      }
    },
  });

  console.log(`[auth] OAuth callback server listening on http://localhost:${PORT}/callback`);
}
