---
description: "OAuth2-authenticated AI agent that enforces user sign-in before processing any conversation message"
tags:
  - oauth2
  - authentication
  - openai
  - mastra
authors:
  - name: rabbah
    account: rabbah
capabilities:
  - "Enforces OAuth2 authentication before processing any conversation message"
  - "Exchanges OAuth authorization codes and manages sessions with TTL-based expiry"
  - "Injects authenticated user identity (ID, name, email) into conversation context"
  - "Supports OIDC and GitHub OAuth provider field conventions"
repository: github:rabbah/hello-astro
integrations:
  - OpenAI
  - Redis
  - OpenTelemetry
---

## Overview

`hello-auth` demonstrates a complete OAuth2 authentication flow for AI agents built on the Astropods platform. It wraps any underlying agent adapter with an `AuthAdapter` that intercepts every incoming message: unauthenticated users receive a sign-in link, while authenticated users have their identity automatically injected into the conversation prompt.

Sessions are stored in-memory with an 8-hour TTL and keyed by conversation ID, allowing the agent to maintain per-conversation auth state across turns.

## Usage

1. Configure OAuth credentials and endpoints via the required inputs (`OAUTH_CLIENT_ID`, `OAUTH_CLIENT_SECRET`, `OAUTH_AUTH_URL`, `OAUTH_TOKEN_URL`, `OAUTH_CALLBACK_URL`).
2. Start the agent with `ast dev` — this runs the gRPC messaging service and the OAuth callback server (default port 3001).
3. Open the playground at `http://localhost:3000`.
4. On first message, the agent returns a sign-in link. Click it to authorize via your OAuth provider.
5. After authorization, the provider redirects to the callback server, which exchanges the code for a token, fetches user info, and creates a session.
6. Subsequent messages are processed normally with the user's identity prepended to the prompt.

### Required Inputs

| Input | Description |
|---|---|
| `OAUTH_CLIENT_ID` | OAuth client ID |
| `OAUTH_CLIENT_SECRET` | OAuth client secret |
| `OAUTH_AUTH_URL` | Authorization endpoint URL |
| `OAUTH_TOKEN_URL` | Token exchange endpoint URL |
| `OAUTH_CALLBACK_URL` | Redirect URI registered with your OAuth provider |

### Optional Inputs

| Input | Default | Description |
|---|---|---|
| `OAUTH_SCOPES` | `openid profile email` | Scopes to request |
| `OAUTH_USERINFO_URL` | — | Userinfo endpoint (OIDC); falls back to token sub-claim |
| `CALLBACK_PORT` | `3001` | Port for the OAuth callback HTTP server |
| `PLAYGROUND_URL` | `http://localhost:3000` | Playground URL to redirect to after sign-in |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | `http://localhost:4318` | OTLP endpoint for traces |

## Limitations

- Sessions are stored in-memory; restarting the agent clears all active sessions and requires users to re-authenticate.
- The agent uses a single OAuth client configuration — it does not support multi-tenant or per-user OAuth app credentials.
- Token refresh is not implemented; sessions expire after 8 hours and the user must sign in again.
- The callback server listens on a single configurable port; running multiple instances requires distinct `CALLBACK_PORT` values.
