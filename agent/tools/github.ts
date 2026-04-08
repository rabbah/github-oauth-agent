import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { getSession } from '../auth/session';
import { conversationContext } from '../auth/context';

function githubHeaders(token: string) {
  return {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  };
}

async function ghFetch(token: string, path: string): Promise<unknown> {
  const url = `https://api.github.com${path}`;
  console.log(`[github] GET ${url}`);
  const res = await fetch(url, { headers: githubHeaders(token) });
  if (!res.ok) {
    const body = await res.text();
    console.error(`[github] API error ${res.status} for ${path}: ${body}`);
    throw new Error(`GitHub API error ${res.status}: ${body}`);
  }
  return res.json();
}

function tokenFor() {
  const conversationId = conversationContext.getStore();
  console.log(`[github] tokenFor conversationId=${conversationId}`);
  if (!conversationId) throw new Error('No conversation context — cannot look up session.');
  const session = getSession(conversationId);
  if (!session) {
    console.error(`[github] no session for conversationId=${conversationId}`);
    throw new Error('No authenticated session found for this conversation.');
  }
  console.log(`[github] session found for user=${session.userId} login=${session.login} token=${session.accessToken ? 'present' : 'MISSING'}`);
  return { token: session.accessToken, session };
}

export const listRepos = createTool({
  id: 'list_github_repos',
  description:
    "List the authenticated user's GitHub repositories sorted by most recently updated. Includes private repos.",
  inputSchema: z.object({
    per_page: z.number().optional().default(50).describe('Number of repos to return (max 100).'),
  }),
  execute: async ({ per_page = 50 }: { per_page?: number }) => {
    const { token } = tokenFor();
    const path = `/user/repos?sort=updated&per_page=${per_page}&affiliation=owner,collaborator,organization_member`;
    console.log(`[github] calling ghFetch: ${path}`);
    const repos = (await ghFetch(token, path)) as Record<string, unknown>[];
    return repos.map((r) => ({
      name: r['full_name'],
      description: r['description'],
      private: r['private'],
      language: r['language'],
      stars: r['stargazers_count'],
      forks: r['forks_count'],
      open_issues: r['open_issues_count'],
      updated_at: r['updated_at'],
      pushed_at: r['pushed_at'],
      topics: r['topics'],
      url: r['html_url'],
    }));
  },
});

export const getRepoDetails = createTool({
  id: 'get_github_repo_details',
  description: 'Get detailed metadata about a specific GitHub repository.',
  inputSchema: z.object({
    owner: z.string().describe('Repository owner (username or org).'),
    repo: z.string().describe('Repository name (without owner prefix).'),
  }),
  execute: async ({ owner, repo }: { owner: string; repo: string }) => {
    const { token } = tokenFor();
    const r = (await ghFetch(token, `/repos/${owner}/${repo}`)) as Record<string, unknown>;
    const license = r['license'] as Record<string, unknown> | null;
    return {
      name: r['full_name'],
      description: r['description'],
      private: r['private'],
      language: r['language'],
      stars: r['stargazers_count'],
      forks: r['forks_count'],
      open_issues: r['open_issues_count'],
      created_at: r['created_at'],
      updated_at: r['updated_at'],
      pushed_at: r['pushed_at'],
      default_branch: r['default_branch'],
      topics: r['topics'],
      license: license?.['name'] ?? null,
      url: r['html_url'],
    };
  },
});

export const getRepoReadme = createTool({
  id: 'get_github_repo_readme',
  description: "Fetch and decode a GitHub repository's README. Use this to explain what a repo does.",
  inputSchema: z.object({
    owner: z.string().describe('Repository owner (username or org).'),
    repo: z.string().describe('Repository name (without owner prefix).'),
  }),
  execute: async ({ owner, repo }: { owner: string; repo: string }) => {
    const { token } = tokenFor();
    const data = (await ghFetch(token, `/repos/${owner}/${repo}/readme`)) as Record<string, unknown>;
    const content = Buffer.from(data['content'] as string, 'base64').toString('utf-8');
    return { path: data['path'], content };
  },
});

export const listRecentActivity = createTool({
  id: 'list_github_activity',
  description:
    "List the authenticated user's recent GitHub activity: pushes, pull requests, issues, branch creation, etc.",
  inputSchema: z.object({
    per_page: z.number().optional().default(30).describe('Number of events to return (max 100).'),
  }),
  execute: async ({ per_page = 30 }: { per_page?: number }) => {
    const { token, session } = tokenFor();
    // Prefer login for the events endpoint (GitHub requires the username, not numeric ID).
    const username = session.login ?? session.name ?? session.userId;
    const events = (await ghFetch(
      token,
      `/users/${username}/events?per_page=${per_page}`,
    )) as Record<string, unknown>[];
    return events.map((e) => ({
      type: e['type'],
      repo: (e['repo'] as Record<string, unknown>)?.['name'],
      created_at: e['created_at'],
      summary: summarizePayload(e['type'] as string, e['payload'] as Record<string, unknown>),
    }));
  },
});

function summarizePayload(type: string, payload: Record<string, unknown>): Record<string, unknown> {
  switch (type) {
    case 'PushEvent': {
      const commits = payload['commits'] as Record<string, unknown>[];
      return {
        ref: payload['ref'],
        commits: commits?.slice(0, 5).map((c) => ({
          sha: (c['sha'] as string)?.slice(0, 7),
          message: c['message'],
        })),
      };
    }
    case 'PullRequestEvent': {
      const pr = payload['pull_request'] as Record<string, unknown>;
      return { action: payload['action'], title: pr?.['title'], url: pr?.['html_url'] };
    }
    case 'IssuesEvent': {
      const issue = payload['issue'] as Record<string, unknown>;
      return { action: payload['action'], title: issue?.['title'], url: issue?.['html_url'] };
    }
    case 'CreateEvent':
      return { ref_type: payload['ref_type'], ref: payload['ref'] };
    case 'DeleteEvent':
      return { ref_type: payload['ref_type'], ref: payload['ref'] };
    case 'ForkEvent': {
      const forkee = payload['forkee'] as Record<string, unknown>;
      return { forked_to: forkee?.['full_name'] };
    }
    case 'WatchEvent':
      return { action: payload['action'] };
    default:
      return {};
  }
}
