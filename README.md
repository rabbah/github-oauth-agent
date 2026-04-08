# hello-astro

An AI agent that authenticates users via OAuth2 (GitHub) and then answers questions about their GitHub activity — repositories, recent pushes, pull requests, issues, and more — using their OAuth token directly, so private repos are accessible and API rate limits are not a concern.

## Quick start

```bash
# Install dependencies
bun install

# Start the agent locally
ast dev
```

Open the playground at `http://localhost:3000`. Your first message will prompt you to sign in with GitHub. After authenticating, you can ask things like:

- "Which of my repos were updated most recently?"
- "What does my `hello-astro` repo do?"
- "Show me my recent GitHub activity."
- "List all my private repos."

## How it works

1. Every incoming message is intercepted by `AuthAdapter`.
2. If no session exists, the agent returns a sign-in link (OAuth2 authorization URL).
3. The user clicks the link, authorizes the GitHub OAuth app, and is redirected to the callback server (port 3001).
4. The callback server exchanges the code for an access token, fetches the user's GitHub profile, and stores a session keyed by conversation ID with an 8-hour TTL.
5. Subsequent messages have the user's identity and conversation ID injected as system context, which the agent uses to call GitHub tools with the stored token.

## GitHub tools

| Tool | Description |
|---|---|
| `list_github_repos` | All repos the user owns, collaborates on, or accesses via an org, sorted by most recently updated |
| `get_github_repo_details` | Stars, forks, open issues, language, topics, and license for a specific repo |
| `get_github_repo_readme` | Fetches and decodes a repo's README so the agent can explain what the project does |
| `list_github_activity` | Recent events: pushes (with commit messages), PRs, issues, forks, branch creation, etc. |

## Project structure

```
hello-astro/
├── agent/
│   ├── index.ts              # Agent entry point — wires Mastra, tools, auth, and observability
│   ├── auth/
│   │   ├── adapter.ts        # AuthAdapter: enforces sign-in on every message
│   │   ├── callback.ts       # OAuth callback HTTP server (port 3001)
│   │   ├── oauth.ts          # Authorization URL, code exchange, userinfo fetch
│   │   └── session.ts        # In-memory session store (keyed by conversation ID)
│   └── tools/
│       └── github.ts         # GitHub API tools (repos, README, activity)
├── astropods.yml             # Agent specification
├── Dockerfile                # Agent container
├── .env                      # Environment variables (set via ast configure; not committed)
└── package.json
```

## Configuration

### Required OAuth inputs

| Variable | Description |
|---|---|
| `OAUTH_CLIENT_ID` | GitHub OAuth app client ID |
| `OAUTH_CLIENT_SECRET` | GitHub OAuth app client secret |
| `OAUTH_AUTH_URL` | `https://github.com/login/oauth/authorize` |
| `OAUTH_TOKEN_URL` | `https://github.com/login/oauth/access_token` |
| `OAUTH_USERINFO_URL` | `https://api.github.com/user` |
| `OAUTH_CALLBACK_URL` | Full callback URL, e.g. `http://localhost:3001/callback` |

### Optional inputs

| Variable | Default | Description |
|---|---|---|
| `OAUTH_SCOPES` | `openid profile email` | Set to `repo user` for GitHub to access private repos |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | `http://localhost:4318` | OTLP endpoint for traces |

> **Note:** For GitHub OAuth, set `OAUTH_SCOPES=repo user` to grant the agent access to private repositories and the events API.

### Integrations

| Integration | Purpose |
|---|---|
| OpenAI (`gpt-4o`) | LLM for conversation and tool use |
| Redis | Key-value cache (knowledge store) |
| GitHub API | Repository and activity data via user's OAuth token |
| OpenTelemetry | Distributed tracing via OTLP |
