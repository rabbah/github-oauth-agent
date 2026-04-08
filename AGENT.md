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
  - GitHub
---

## Overview

`hello-astro` demonstrates a complete OAuth2 authentication flow for AI agents built on the Astropods platform. It wraps any underlying agent adapter with an `AuthAdapter` that intercepts every incoming message: unauthenticated users receive a sign-in link, while authenticated users have their identity automatically injected into the conversation prompt.

Sessions are stored in-memory with an 8-hour TTL and keyed by conversation ID, allowing the agent to maintain per-conversation auth state across turns.

The agent assumes GitHub as the Identity Provider, and will operate as the authenticated user to fetch a list of their repositories and answer questions about those repos based on the contents of the respective README files in those repos.

## Usage

1. Configure OAuth credentials and endpoints via the required inputs (`OAUTH_CLIENT_ID`, `OAUTH_CLIENT_SECRET`, `OAUTH_AUTH_URL`, `OAUTH_TOKEN_URL`, `OAUTH_CALLBACK_URL`).
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

## Limitations

- Sessions are stored in-memory; restarting the agent clears all active sessions and requires users to re-authenticate.
- The agent uses a single OAuth client configuration — it does not support multi-tenant or per-user OAuth app credentials.
- Token refresh is not implemented; sessions expire after 8 hours and the user must sign in again.
- The callback server listens on port 80 (overridable via `PORT`); running multiple instances requires distinct port assignments.
