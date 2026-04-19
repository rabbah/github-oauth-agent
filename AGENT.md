---
description: "OAuth2-authenticated AI agent that gates every conversation behind GitHub sign-in and answers questions about the user's repos"
tags:
  - oauth2
  - github
  - openai
  - mastra
  - example
authors:
  - name: rabbah
    account: rabbah
capabilities:
  - "Enforces OAuth2 authentication before processing any conversation message"
  - "Exchanges OAuth authorization codes and manages sessions with TTL-based expiry"
  - "Injects authenticated user identity (ID, name, email) into conversation context"
  - "Lists the authenticated user's GitHub repositories"
  - "Retrieves repository metadata (stars, forks, open issues, language, topics)"
  - "Fetches and reads README files from any of the user's repositories"
  - "Displays recent GitHub activity (pushes, PRs, issues, forks) for the user"
  - "Supports OIDC and GitHub OAuth provider field conventions"
repository: github:rabbah/github-oauth-agent
integrations:
  - GitHub
  - OpenAI
  - Mastra
---

## Overview

`github-oauth-agent` demonstrates a complete OAuth2 authentication flow for AI agents built on the Astropods platform. It wraps any underlying agent adapter with an `AuthAdapter` that intercepts every incoming message: unauthenticated users receive a sign-in link, while authenticated users have their identity automatically injected into the conversation prompt.

Sessions are stored in-memory with an 8-hour TTL and keyed by conversation ID, allowing the agent to maintain per-conversation auth state across turns.

The agent uses GitHub as the Identity Provider and operates on behalf of the authenticated user to list repositories, fetch README content, retrieve repo metadata, and surface recent activity — making it a useful reference implementation for any agent that needs to act as the signed-in user.

## Usage

1. Configure OAuth credentials and endpoints via the required inputs (`OAUTH_CLIENT_ID`, `OAUTH_CLIENT_SECRET`, `OAUTH_AUTH_URL`, `OAUTH_TOKEN_URL`, `OAUTH_CALLBACK_URL`).
2. On first message, the agent returns a sign-in link. Click it to authorize via GitHub.
3. After authorization, GitHub redirects to the callback server, which exchanges the code for a token, fetches user info, and creates a session.
4. Subsequent messages are processed normally with the user's identity prepended to the prompt.

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

### Example Prompts

Once authenticated, you can ask things like:

- *"List my repositories"*
- *"Show me my recent GitHub activity"*
- *"How many open issues does my repo have?"*

## Limitations

- Sessions are stored in-memory; restarting the agent clears all active sessions and requires users to re-authenticate.
- The agent uses a single OAuth client configuration — it does not support multi-tenant or per-user OAuth app credentials.
- Token refresh is not implemented; sessions expire after 8 hours and the user must sign in again.
