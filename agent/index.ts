/**
 * hello-astro - Agent showing basic auth flow
 *
 * This agent uses Mastra's Agent class with the Astro adapter to connect
 * to the Astro messaging service via gRPC.
 *
 * Environment variables (automatically injected by 'ast dev'):
 *   GRPC_SERVER_ADDR         - injected by Astro messaging service
 *   OPENAI_API_KEY           - injected by openai model
 *   REDIS_HOST/PORT/URL      - injected by redis knowledge store
 *
 * Auth environment variables (set via ast configure or .env):
 *   OAUTH_CLIENT_ID          - OAuth app client ID
 *   OAUTH_CLIENT_SECRET      - OAuth app client secret
 *   OAUTH_AUTH_URL           - Provider authorization endpoint
 *   OAUTH_TOKEN_URL          - Provider token endpoint
 *   OAUTH_USERINFO_URL       - Provider userinfo endpoint (optional, for OIDC/GitHub etc.)
 *   OAUTH_CALLBACK_URL       - Full URL of this agent's callback, e.g. http://localhost:3001/callback
 *   OAUTH_SCOPES             - Space-separated scopes (default: "openid profile email")
 */

import { Agent } from '@mastra/core/agent';
import { Mastra } from '@mastra/core/mastra';
import { Memory } from '@mastra/memory';
import { LibSQLStore } from '@mastra/libsql';
import { Observability } from '@mastra/observability';
import { OtelExporter } from '@mastra/otel-exporter';
import { MastraAdapter } from '@astropods/adapter-mastra';
import { serve } from '@astropods/adapter-core';
import { AuthAdapter } from './auth/adapter';
import { startCallbackServer } from './auth/callback';
import { listRepos, getRepoDetails, getRepoReadme, listRecentActivity } from './tools/github';

const memory = new Memory({
  storage: new LibSQLStore({
    id: 'memory',
    url: ':memory:',
  }),
});

function resolveOtlpTracesEndpoint(): string {
  const raw = process.env.OTEL_EXPORTER_OTLP_ENDPOINT || 'http://localhost:4318';
  try {
    const url = new URL(raw);
    if (!url.pathname || url.pathname === '/') {
      url.pathname = '/v1/traces';
    }
    return url.toString();
  } catch {
    return `${raw.replace(/\/+$/, '')}/v1/traces`;
  }
}

const observability = new Observability({
  configs: {
    otel: {
      serviceName: 'hello-astro',
      exporters: [
        new OtelExporter({
          provider: {
            custom: {
              endpoint: resolveOtlpTracesEndpoint(),
              protocol: 'http/protobuf',
            },
          },
        }),
      ],
    },
  },
});

const agent = new Agent({
  id: 'hello-astro',
  name: 'Hello Astro',
  instructions: `You are a helpful AI assistant with access to the authenticated user's GitHub account.

You have four GitHub tools:
- list_github_repos: list all repos the user has access to (owner, collaborator, org member), sorted by most recently updated
- get_github_repo_details: get metadata for a specific repo (stars, forks, issues, language, topics, etc.)
- get_github_repo_readme: fetch and read a repo's README to explain what it does
- list_github_activity: list the user's recent GitHub activity (pushes, PRs, issues, forks, etc.)

When answering questions about GitHub activity, call the appropriate tool(s) and synthesize the results into a helpful, readable response. You have access to private repos via the user's OAuth token — no rate limiting concerns.`,
  model: 'openai/gpt-4o',
  memory,
  tools: { listRepos, getRepoDetails, getRepoReadme, listRecentActivity },
  // Ensure traces include stable Astro metadata by default.
  // The collector endpoint is injected by `ast dev`.
  defaultOptions: {
    tracingOptions: {
      tags: ['astro', 'agent:hello-astro'],
      metadata: {
        agent_id: 'hello-astro',
      },
    },
  },
});

// Instantiate Mastra so it registers agents/observability plugins at startup.
new Mastra({
  agents: {
    'hello-astro': agent,
  },
  observability,
});

// Start the OAuth callback HTTP server before connecting to the messaging service.
startCallbackServer();

// Wrap the Mastra adapter with auth enforcement, then connect to the messaging service.
serve(new AuthAdapter(new MastraAdapter(agent)));
