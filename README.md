# hello-auth

Agent showing basic auth flow

## Quick start

```bash
# Install dependencies
bun install

# Start the agent locally
ast dev
```

## Project structure

```
hello-auth/
├── agent/
│   └── index.ts          # Agent entry point
├── astropods.yml             # Agent specification
├── Dockerfile            # Agent container
├── .env                  # Environment variables (set via ast configure; not committed)
└── package.json
```

## Configuration

The agent is configured in `astropods.yml`. Key sections:

### Integrations

| Integration | Type | Environment variable |
|------------|------|---------------------|
| OpenAI | Model API | `OPENAI_API_KEY` |

### Knowledge stores
- **Redis** — key-value store for caching and fast lookups

### Interfaces
- **Web** — HTTP/SSE endpoint (playground available at `localhost:3000` during dev)

