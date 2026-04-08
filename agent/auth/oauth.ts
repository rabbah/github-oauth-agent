function requireEnv(name: string): string {
  const val = process.env[name];
  if (!val) throw new Error(`${name} environment variable is required`);
  return val;
}

/**
 * Build the OAuth2 authorization URL.
 * @param state  Opaque value echoed back in the callback — we use conversationId.
 */
export function getAuthorizationUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: requireEnv('OAUTH_CLIENT_ID'),
    redirect_uri: requireEnv('OAUTH_CALLBACK_URL'),
    response_type: 'code',
    scope: process.env.OAUTH_SCOPES ?? 'openid profile email',
    state,
  });
  return `${requireEnv('OAUTH_AUTH_URL')}?${params.toString()}`;
}

/**
 * Exchange an authorization code for an access token.
 * Returns the raw access token string.
 */
export async function exchangeCode(code: string): Promise<string> {
  const res = await fetch(requireEnv('OAUTH_TOKEN_URL'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
    },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: requireEnv('OAUTH_CALLBACK_URL'),
      client_id: requireEnv('OAUTH_CLIENT_ID'),
      client_secret: requireEnv('OAUTH_CLIENT_SECRET'),
    }).toString(),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Token exchange failed (${res.status}): ${body}`);
  }

  const data = (await res.json()) as { access_token?: string; error?: string; error_description?: string };
  if (!data.access_token) {
    throw new Error(data.error_description ?? data.error ?? 'No access_token in response');
  }
  return data.access_token;
}

export interface UserInfo {
  id: string;
  login?: string;  // GitHub login / username
  name?: string;
  email?: string;
}

/**
 * Fetch identity from the provider's userinfo endpoint.
 * Falls back to id="unknown" if OAUTH_USERINFO_URL is not set.
 *
 * The response is normalized: we accept the common sub/id/login fields
 * so this works with OIDC providers (sub), GitHub (id/login), and others.
 */
export async function fetchUserInfo(accessToken: string): Promise<UserInfo> {
  const url = process.env.OAUTH_USERINFO_URL;
  if (!url) return { id: 'unknown' };

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) {
    throw new Error(`Userinfo request failed (${res.status})`);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data = (await res.json()) as any;
  return {
    id: String(data.sub ?? data.id ?? data.login ?? 'unknown'),
    login: data.login ?? undefined,
    name: data.name ?? data.login ?? undefined,
    email: data.email ?? undefined,
  };
}
