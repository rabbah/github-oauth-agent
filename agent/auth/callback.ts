import { exchangeCode, fetchUserInfo } from './oauth';
import { setSession } from './session';
import { join } from 'path';

const PORT = Number(process.env.PORT ?? 80);
const SESSION_TTL_MS = 8 * 60 * 60 * 1000; // 8 hours

// Messaging adapter URL — proxied to for /api/* requests from the SPA.
// In dev, the messaging service runs on the host at port 3100; host.docker.internal
// resolves to the host machine from inside the Docker container (Docker Desktop / Mac).
const MESSAGING_URL = process.env.GRPC_SERVER_ADDR
  ? `http://${process.env.GRPC_SERVER_ADDR.replace(/^https?:\/\//, '').replace(/:\d+$/, '')}:8080`
  : 'http://host.docker.internal:3100';

// Built SPA lives at /app/public in the container (agent/auth/ → ../../public)
const PUBLIC_DIR = join(import.meta.dir, '../../public');

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

  setSession(state, userInfo.id, Date.now() + SESSION_TTL_MS, accessToken, userInfo.login, userInfo.name, userInfo.email);
  console.log(`[auth] authenticated user=${userInfo.id} conversation=${state}`);

  // Redirect back to the SPA (served from this same agent on /)
  return new Response(null, {
    status: 302,
    headers: { Location: `/?conversation=${state}&replay_last=true` },
  });
}

async function proxyApi(req: Request, url: URL): Promise<Response> {
  const target = new URL(url.pathname + url.search, MESSAGING_URL);
  const proxyRes = await fetch(target.toString(), {
    method: req.method,
    headers: req.headers,
    body: req.body,
    // @ts-expect-error — Bun supports duplex for streaming bodies
    duplex: 'half',
  });
  return new Response(proxyRes.body, {
    status: proxyRes.status,
    headers: proxyRes.headers,
  });
}

async function serveStatic(pathname: string): Promise<Response> {
  const rel = pathname === '/' ? 'index.html' : pathname.replace(/^\//, '');
  const file = Bun.file(join(PUBLIC_DIR, rel));
  if (await file.exists()) {
    return new Response(file);
  }
  // SPA fallback — unknown paths serve index.html for client-side routing
  return new Response(Bun.file(join(PUBLIC_DIR, 'index.html')));
}

export function startCallbackServer(): void {
  Bun.serve({
    port: PORT,
    async fetch(req) {
      const url = new URL(req.url);

      // OAuth callback
      if (url.pathname === '/callback') {
        try {
          return await handleCallback(url);
        } catch (err) {
          console.error('[auth] callback error:', err);
          return html(
            'Sign-in error',
            '<h2>Something went wrong</h2><p>Authentication failed. Please try again.</p>',
          );
        }
      }

      // Proxy /api/* to the messaging adapter
      if (url.pathname.startsWith('/api/')) {
        try {
          return await proxyApi(req, url);
        } catch (err) {
          console.error('[server] proxy error:', err);
          return new Response('Bad gateway', { status: 502 });
        }
      }

      // Serve SPA static files
      return serveStatic(url.pathname);
    },
  });

  console.log(`[server] listening on http://localhost:${PORT}`);
}
