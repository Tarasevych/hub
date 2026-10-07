// GitHub-integratie van de site (service github): repositories, issues, pull requests, commits, CI-runs, README, zoeken, projecten (GraphQL) en
// activiteit, plus twee schrijfacties (issue aanmaken, reageren). Alles via de persoonlijke toegangstoken (PAT) uit de kluis van de gebruiker
// (doel "github"); de token verlaat de server nooit. De server praat uitsluitend met api.github.com, op vaste paden met gevalideerde parameters.
import { error, json } from '../server/platform';
import { rateLimit } from '../server/platform/beveiliging';
import { apiPlatformVaultItems, readOwnerVaultPlaintext } from './api-platform-vault';

const API = 'https://api.github.com';
const REPO = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})\/[A-Za-z0-9._-]{1,100}$/;
const LOGIN = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/;

let doFetch: typeof fetch = fetch;
let tokenOf: (userId: string) => Promise<string | null> = async (userId) => {
  const item = (await apiPlatformVaultItems(userId)).find((row) => row.purpose === 'github');
  if (!item) return null;
  try { return await readOwnerVaultPlaintext(userId, item.keyName, 'github'); } catch { return null; }
};
/** Alleen voor tests. */
export const setGithubDeps = (deps: { fetch?: typeof fetch; token?: (userId: string) => Promise<string | null> } | null) => {
  doFetch = deps?.fetch ?? fetch;
  tokenOf = deps?.token ?? (async (userId) => {
    const item = (await apiPlatformVaultItems(userId)).find((row) => row.purpose === 'github');
    if (!item) return null;
    try { return await readOwnerVaultPlaintext(userId, item.keyName, 'github'); } catch { return null; }
  });
};

export type GhResult<T> = { ok: true; data: T; rate?: { remaining: number; reset: number } } | { ok: false; error: string; status: number };

async function gh(userId: string, path: string, init: { method?: string; body?: unknown; graphql?: string } = {}): Promise<GhResult<any>> {
  const token = await tokenOf(userId);
  if (!token) return { ok: false, error: 'GITHUB_TOKEN_MISSING', status: 409 };
  let res: Response;
  try {
    res = await doFetch(init.graphql ? `${API}/graphql` : `${API}${path}`, {
      method: init.graphql ? 'POST' : init.method || 'GET',
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'User-Agent': 'mijn-ruimte', 'X-GitHub-Api-Version': '2022-11-28', ...(init.body || init.graphql ? { 'Content-Type': 'application/json' } : {}) },
      body: init.graphql ? JSON.stringify({ query: init.graphql }) : init.body ? JSON.stringify(init.body) : undefined,
      signal: AbortSignal.timeout(20_000), redirect: 'error',
    });
  } catch { return { ok: false, error: 'GITHUB_UNREACHABLE', status: 502 }; }
  const remaining = Number(res.headers.get('x-ratelimit-remaining') ?? NaN); const reset = Number(res.headers.get('x-ratelimit-reset') ?? NaN);
  const rate = Number.isFinite(remaining) ? { remaining, reset: Number.isFinite(reset) ? reset * 1000 : 0 } : undefined;
  const data: any = await res.json().catch(() => null);
  if (res.status === 401) return { ok: false, error: 'GITHUB_TOKEN_INVALID', status: 401 };
  if (res.status === 403 && remaining === 0) return { ok: false, error: 'GITHUB_RATE_LIMITED', status: 429 };
  if (res.status === 403) return { ok: false, error: 'GITHUB_FORBIDDEN', status: 403 };
  if (res.status === 404) return { ok: false, error: 'GITHUB_NOT_FOUND', status: 404 };
  if (!res.ok) return { ok: false, error: `GITHUB_ERROR_${res.status}`, status: 502 };
  if (init.graphql && data?.errors?.length) return { ok: false, error: 'GITHUB_GRAPHQL_ERROR', status: 502 };
  return { ok: true, data, rate };
}

const s = (v: unknown, max = 300) => (typeof v === 'string' ? v.slice(0, max) : '');
const n = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const userOf = (u: any) => (u ? { login: s(u.login, 60), avatar: s(u.avatar_url, 200), url: s(u.html_url, 200) } : null);

// ---- verkleinde vormen: alleen wat de UI en het model nodig hebben ----
export const shapeRepo = (r: any) => ({
  id: n(r.id), name: s(r.name, 100), fullName: s(r.full_name, 140), private: !!r.private, fork: !!r.fork, archived: !!r.archived, description: s(r.description, 300), language: s(r.language, 40),
  stars: n(r.stargazers_count), forks: n(r.forks_count), openIssues: n(r.open_issues_count), defaultBranch: s(r.default_branch, 80), pushedAt: s(r.pushed_at, 40), updatedAt: s(r.updated_at, 40), url: s(r.html_url, 200),
  owner: s(r.owner?.login, 60), visibility: s(r.visibility, 20), license: s(r.license?.spdx_id, 40), topics: Array.isArray(r.topics) ? r.topics.slice(0, 10).map((t: unknown) => s(t, 40)) : [],
});
export const shapeIssue = (i: any) => ({
  number: n(i.number), title: s(i.title, 300), state: s(i.state, 20), isPull: !!i.pull_request || i.draft !== undefined || !!i.head, draft: !!i.draft, merged: !!i.merged_at, author: userOf(i.user)?.login || '', comments: n(i.comments),
  labels: Array.isArray(i.labels) ? i.labels.slice(0, 8).map((l: any) => ({ name: s(l.name, 60), color: s(l.color, 8) })) : [], createdAt: s(i.created_at, 40), updatedAt: s(i.updated_at, 40), url: s(i.html_url, 200), body: s(i.body, 1500),
  assignees: Array.isArray(i.assignees) ? i.assignees.slice(0, 5).map((a: any) => s(a.login, 60)) : [], base: s(i.base?.ref, 80), head: s(i.head?.ref, 80),
});
export const shapeCommit = (c: any) => ({ sha: s(c.sha, 40), message: s(c.commit?.message, 300).split('\n')[0], author: s(c.commit?.author?.name, 80), login: s(c.author?.login, 60), date: s(c.commit?.author?.date, 40), url: s(c.html_url, 200) });
export const shapeRun = (r: any) => ({ id: n(r.id), name: s(r.name, 120), status: s(r.status, 20), conclusion: s(r.conclusion, 20), branch: s(r.head_branch, 80), event: s(r.event, 30), sha: s(r.head_sha, 40).slice(0, 7), createdAt: s(r.created_at, 40), updatedAt: s(r.updated_at, 40), url: s(r.html_url, 200), actor: s(r.actor?.login, 60) });
export const shapeEvent = (e: any) => ({ id: s(e.id, 30), type: s(e.type, 40), repo: s(e.repo?.name, 140), createdAt: s(e.created_at, 40), summary: eventSummary(e) });
function eventSummary(e: any): string {
  const p = e.payload || {};
  switch (e.type) {
    case 'PushEvent': return `push · ${n(p.size ?? p.commits?.length)} commit(s) → ${s(p.ref, 100).replace('refs/heads/', '')}`;
    case 'IssuesEvent': return `issue ${s(p.action, 20)} · #${n(p.issue?.number)} ${s(p.issue?.title, 120)}`;
    case 'IssueCommentEvent': return `comment · #${n(p.issue?.number)} ${s(p.issue?.title, 120)}`;
    case 'PullRequestEvent': return `pull request ${s(p.action, 20)} · #${n(p.pull_request?.number)} ${s(p.pull_request?.title, 120)}`;
    case 'WatchEvent': return 'star';
    case 'CreateEvent': return `create ${s(p.ref_type, 20)} ${s(p.ref, 80)}`;
    case 'ForkEvent': return 'fork';
    default: return s(e.type, 40).replace(/Event$/, '');
  }
}

export const validRepo = (v: unknown): string => (typeof v === 'string' && REPO.test(v.trim()) ? v.trim() : '');

// ---- bewerkingen (los van HTTP, dus testbaar en door MCP-hulpmiddelen te gebruiken) ----
export async function ghStatus(userId: string) {
  const me = await gh(userId, '/user');
  if (!me.ok) return me.error === 'GITHUB_TOKEN_MISSING' ? ({ ok: true, data: { connected: false } } as GhResult<any>) : me;
  return { ok: true, data: { connected: true, login: s(me.data.login, 60), name: s(me.data.name, 100), avatar: s(me.data.avatar_url, 200), url: s(me.data.html_url, 200), publicRepos: n(me.data.public_repos), privateRepos: n(me.data.total_private_repos), followers: n(me.data.followers) }, rate: me.rate } as GhResult<any>;
}
export async function ghRepos(userId: string, q: { query?: string; page?: number }) {
  const page = Math.max(1, Math.min(20, Math.floor(Number(q.page) || 1)));
  const res = await gh(userId, `/user/repos?sort=pushed&per_page=30&page=${page}&affiliation=owner,collaborator,organization_member`);
  if (!res.ok) return res;
  let repos = (res.data as any[]).map(shapeRepo);
  const needle = String(q.query || '').trim().toLowerCase();
  if (needle) repos = repos.filter((r) => `${r.fullName} ${r.description} ${r.language}`.toLowerCase().includes(needle));
  return { ok: true, data: { repos, page, hasMore: (res.data as any[]).length === 30 }, rate: res.rate } as GhResult<any>;
}
export async function ghRepo(userId: string, repo: string) {
  const [info, langs, release] = await Promise.all([gh(userId, `/repos/${repo}`), gh(userId, `/repos/${repo}/languages`), gh(userId, `/repos/${repo}/releases/latest`)]);
  if (!info.ok) return info;
  const total = langs.ok ? Object.values(langs.data as Record<string, number>).reduce((a, b) => a + Number(b), 0) : 0;
  return { ok: true, data: { ...shapeRepo(info.data), languages: langs.ok ? Object.entries(langs.data as Record<string, number>).map(([name, bytes]) => ({ name, percent: total ? Math.round((Number(bytes) / total) * 100) : 0 })).sort((a, b) => b.percent - a.percent).slice(0, 8) : [], latestRelease: release.ok ? { tag: s(release.data.tag_name, 60), name: s(release.data.name, 120), publishedAt: s(release.data.published_at, 40), url: s(release.data.html_url, 200) } : null }, rate: info.rate } as GhResult<any>;
}
export async function ghIssues(userId: string, repo: string, q: { state?: string; kind?: string }) {
  const state = ['open', 'closed', 'all'].includes(String(q.state)) ? String(q.state) : 'open';
  const pulls = q.kind === 'pr';
  const res = await gh(userId, pulls ? `/repos/${repo}/pulls?state=${state}&per_page=30&sort=updated&direction=desc` : `/repos/${repo}/issues?state=${state}&per_page=30&sort=updated&direction=desc`);
  if (!res.ok) return res;
  const items = (res.data as any[]).filter((i) => (pulls ? true : !i.pull_request)).map((i) => ({ ...shapeIssue(i), isPull: pulls }));
  return { ok: true, data: { items }, rate: res.rate } as GhResult<any>;
}
export async function ghCommits(userId: string, repo: string, branch?: string) {
  const res = await gh(userId, `/repos/${repo}/commits?per_page=30${branch && /^[A-Za-z0-9._/-]{1,100}$/.test(branch) ? `&sha=${encodeURIComponent(branch)}` : ''}`);
  return res.ok ? ({ ok: true, data: { commits: (res.data as any[]).map(shapeCommit) }, rate: res.rate } as GhResult<any>) : res;
}
export async function ghActions(userId: string, repo: string) {
  const res = await gh(userId, `/repos/${repo}/actions/runs?per_page=20`);
  if (!res.ok) return res;
  const runs = ((res.data as any).workflow_runs ?? []).map(shapeRun);
  const latest = runs[0];
  return { ok: true, data: { runs, summary: { total: n((res.data as any).total_count), failing: runs.filter((r: any) => r.conclusion === 'failure').length, latest: latest ? { status: latest.status, conclusion: latest.conclusion } : null } }, rate: res.rate } as GhResult<any>;
}
export async function ghReadme(userId: string, repo: string) {
  const res = await gh(userId, `/repos/${repo}/readme`);
  if (!res.ok) return res;
  const text = res.data?.encoding === 'base64' ? Buffer.from(String(res.data.content || ''), 'base64').toString('utf8') : '';
  return { ok: true, data: { name: s(res.data.name, 100), text: text.slice(0, 20_000), truncated: text.length > 20_000, url: s(res.data.html_url, 200) }, rate: res.rate } as GhResult<any>;
}
export async function ghSearch(userId: string, q: { q?: string; type?: string }) {
  const query = String(q.q ?? '').trim().slice(0, 256);
  if (query.length < 2) return { ok: false, error: 'GITHUB_QUERY_INVALID', status: 400 } as GhResult<any>;
  const type = ['repositories', 'issues', 'code'].includes(String(q.type)) ? String(q.type) : 'repositories';
  const res = await gh(userId, `/search/${type}?q=${encodeURIComponent(query)}&per_page=20`);
  if (!res.ok) return res;
  const items = ((res.data as any).items ?? []) as any[];
  const shaped = type === 'repositories' ? items.map(shapeRepo) : type === 'issues' ? items.map(shapeIssue) : items.map((c) => ({ name: s(c.name, 200), path: s(c.path, 300), repo: s(c.repository?.full_name, 140), url: s(c.html_url, 200) }));
  return { ok: true, data: { type, total: n((res.data as any).total_count), items: shaped }, rate: res.rate } as GhResult<any>;
}
export async function ghProjects(userId: string) {
  const res = await gh(userId, '', { graphql: '{ viewer { projectsV2(first: 20, orderBy: {field: UPDATED_AT, direction: DESC}) { nodes { id title shortDescription url closed updatedAt items { totalCount } } } } }' });
  if (!res.ok) return res.error === 'GITHUB_GRAPHQL_ERROR' ? ({ ok: false, error: 'GITHUB_PROJECTS_SCOPE', status: 403 } as GhResult<any>) : res;
  const nodes = (res.data?.data?.viewer?.projectsV2?.nodes ?? []) as any[];
  return { ok: true, data: { projects: nodes.map((p) => ({ id: s(p.id, 60), title: s(p.title, 160), description: s(p.shortDescription, 300), url: s(p.url, 200), closed: !!p.closed, updatedAt: s(p.updatedAt, 40), items: n(p.items?.totalCount) })) }, rate: res.rate } as GhResult<any>;
}
export async function ghActivity(userId: string) {
  const me = await gh(userId, '/user');
  if (!me.ok) return me;
  const login = s(me.data.login, 60);
  if (!LOGIN.test(login)) return { ok: false, error: 'GITHUB_LOGIN_INVALID', status: 502 } as GhResult<any>;
  const res = await gh(userId, `/users/${login}/events?per_page=30`);
  return res.ok ? ({ ok: true, data: { events: (res.data as any[]).map(shapeEvent) }, rate: res.rate } as GhResult<any>) : res;
}
export async function ghCreateIssue(userId: string, repo: string, title: string, body: string) {
  const t = title.trim().slice(0, 250);
  if (t.length < 3) return { ok: false, error: 'GITHUB_TITLE_INVALID', status: 400 } as GhResult<any>;
  const res = await gh(userId, `/repos/${repo}/issues`, { method: 'POST', body: { title: t, body: String(body ?? '').slice(0, 20_000) } });
  return res.ok ? ({ ok: true, data: { number: n(res.data.number), url: s(res.data.html_url, 200) }, rate: res.rate } as GhResult<any>) : res;
}
export async function ghComment(userId: string, repo: string, issue: number, body: string) {
  if (!Number.isInteger(issue) || issue < 1) return { ok: false, error: 'GITHUB_ISSUE_INVALID', status: 400 } as GhResult<any>;
  const text = String(body ?? '').trim().slice(0, 20_000);
  if (!text) return { ok: false, error: 'GITHUB_BODY_INVALID', status: 400 } as GhResult<any>;
  const res = await gh(userId, `/repos/${repo}/issues/${issue}/comments`, { method: 'POST', body: { body: text } });
  return res.ok ? ({ ok: true, data: { url: s(res.data.html_url, 200) }, rate: res.rate } as GhResult<any>) : res;
}

// ---- routes ----
type SessionAuth = { errorCode: string } | { service: string; user: { id: string; status: string } };
const bodyOf = (b: unknown): Record<string, unknown> => (b && typeof b === 'object' ? (b as Record<string, unknown>) : {});

export function createGithubRoutes(deps: { requireSession: (event: Record<string, unknown>, body: unknown) => Promise<SessionAuth>; audit: (userId: string, action: string, result: string, details?: Record<string, unknown>) => Promise<unknown> }) {
  const route = (name: string, write: boolean, run: (userId: string, b: Record<string, unknown>) => Promise<GhResult<any>>) => [async (ctx: any) => {
    const auth = await deps.requireSession(ctx.event, ctx.body);
    if ('errorCode' in auth || auth.service !== 'github' || auth.user.status !== 'approved') return error('OWNER_GITHUB_SESSION_REQUIRED', 403);
    if (!(await rateLimit(`github:${write ? 'w' : 'r'}:${auth.user.id}`, write ? 30 : 240, 600, { failClosed: true })).ok) return error('RATE_LIMITED', 429);
    const out = await run(auth.user.id, bodyOf(ctx.body));
    if (write) await deps.audit(auth.user.id, `owner.github.${name}`, out.ok ? 'success' : 'failure', { reason: out.ok ? '' : out.error });
    if (!out.ok) return error(out.error, out.status);
    return json({ ok: true, ...out.data, rate: out.rate });
  }];
  const withRepo = (fn: (userId: string, repo: string, b: Record<string, unknown>) => Promise<GhResult<any>>) => async (userId: string, b: Record<string, unknown>) => {
    const repo = validRepo(b.repo);
    return repo ? fn(userId, repo, b) : ({ ok: false, error: 'GITHUB_REPO_INVALID', status: 400 } as GhResult<any>);
  };
  return {
    'POST /api/owner/github/status': route('status', false, (u) => ghStatus(u)),
    'POST /api/owner/github/repos': route('repos', false, (u, b) => ghRepos(u, { query: String(b.query ?? ''), page: Number(b.page) })),
    'POST /api/owner/github/repo': route('repo', false, withRepo((u, r) => ghRepo(u, r))),
    'POST /api/owner/github/issues': route('issues', false, withRepo((u, r, b) => ghIssues(u, r, { state: String(b.state ?? ''), kind: String(b.kind ?? '') }))),
    'POST /api/owner/github/commits': route('commits', false, withRepo((u, r, b) => ghCommits(u, r, b.branch ? String(b.branch) : undefined))),
    'POST /api/owner/github/actions': route('actions', false, withRepo((u, r) => ghActions(u, r))),
    'POST /api/owner/github/readme': route('readme', false, withRepo((u, r) => ghReadme(u, r))),
    'POST /api/owner/github/search': route('search', false, (u, b) => ghSearch(u, { q: String(b.q ?? ''), type: String(b.type ?? '') })),
    'POST /api/owner/github/projects': route('projects', false, (u) => ghProjects(u)),
    'POST /api/owner/github/activity': route('activity', false, (u) => ghActivity(u)),
    'POST /api/owner/github/issue/create': route('issue_create', true, withRepo((u, r, b) => ghCreateIssue(u, r, String(b.title ?? ''), String(b.body ?? '')))),
    'POST /api/owner/github/issue/comment': route('issue_comment', true, withRepo((u, r, b) => ghComment(u, r, Number(b.number), String(b.body ?? '')))),
  };
}
