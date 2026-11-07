// GitHub-integratie van de site (service github): repositories, issues, pull requests, commits, CI-runs, README, zoeken, projecten (GraphQL) en
// activiteit, plus twee schrijfacties (issue aanmaken, reageren). De token komt via ÉÉN punt — backend/github-toegang.ts — dat zelf de
// beschikbare weg kiest (OAuth-app → GitHub App → persoonlijke token uit de kluis, doel "github") en een verlopen token zelf vernieuwt; de
// token verlaat de server nooit. De server praat uitsluitend met api.github.com, op vaste paden met gevalideerde parameters.
import { error, json } from '../server/platform';
import { rateLimit } from '../server/platform/beveiliging';
import { apiPlatformVaultItems, readOwnerVaultPlaintext } from './api-platform-kluis';
import { metaUitRecord, vaultStaat } from '../shared/kluis-meta';
import { SERVICE_HOSTS } from './deployment-identiteit';
import {
  GITHUB_APP_DOEL, GITHUB_OAUTH_DOEL, githubInstelWaarden, type GithubSleutelFeiten, type GithubVerbindingFeiten,
} from '../shared/github-koppeling';
import { githubTokenVoor, githubWeg, setPatLezer } from './github-toegang';
import { oauthOntkoppelen, oauthStarten, oauthTerugkeer, oauthVernieuwen } from './github-oauth';
import { appInstallaties, appOntkoppelen, appRepos, appTokenVernieuwen } from './github-app';
import { appSleutel, oauthApp } from './github-koppeling-opslag';
import { githubLade } from './ruimte-bord-github';
import { ruimteOf, type AiRuimte } from '../shared/ai-ruimte';
import type { PrVoorstel } from '../shared/github-pr';

/**
 * WIE VRAAGT HET, EN UIT WELKE LADE (migratie 0086). Elke bewerking hieronder krijgt dit in plaats van een losse `userId`,
 * zodat er geen enkele weg overblijft die stil de PERSOONLIJKE GitHub-koppeling gebruikt terwijl de mens in de technische
 * ruimte staat. Een gewone string blijft toegestaan en betekent de persoonlijke lade: zo blijven aanroepers van buiten (en de
 * bestaande eenheidstests) ongewijzigd werken, en is er maar één plek die de lade kan vergroten — de poort.
 */
export type GhWie = string | { userId: string; ruimte?: AiRuimte | null };
const wieUit = (v: GhWie): { userId: string; ruimte: AiRuimte } =>
  typeof v === 'string' ? { userId: v, ruimte: 'prive' } : { userId: String(v.userId || ''), ruimte: ruimteOf(v.ruimte ?? 'prive') };

const API = 'https://api.github.com';
const REPO = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})\/[A-Za-z0-9._-]{1,100}$/;
const LOGIN = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/;

/** PAT (`github`) of een later toegevoegde alternatieve verbinding (`github-app`). De waarde verlaat de server nooit. */
const GITHUB_DOELEINDEN = ['github', 'github-app'] as const;
/** Eén rij uit de kluis zoals de koppelkaart die mag zien: naam, doel en termijn — nooit de versleutelde waarde. */
type KluisRij = { keyName: string; purpose: string; meta?: unknown; createdAt: number; updatedAt: number };
let kluisRijen: (userId: string) => Promise<KluisRij[]> = (userId) => apiPlatformVaultItems(userId) as unknown as Promise<KluisRij[]>;
export async function githubKoppeling(userId: string): Promise<{ keyName: string; purpose: (typeof GITHUB_DOELEINDEN)[number] } | null> {
  const items = await kluisRijen(userId);
  for (const purpose of GITHUB_DOELEINDEN) {
    const item = items.find((row) => row.purpose === purpose);
    if (item) return { keyName: item.keyName, purpose };
  }
  return null;
}
async function tokenUitKluis(userId: string): Promise<string | null> {
  const kop = await githubKoppeling(userId);
  if (!kop) return null;
  try { return await readOwnerVaultPlaintext(userId, kop.keyName, kop.purpose); } catch { return null; }
}
// De PAT blijft de laatste weg van github-toegang.ts; dat bestand kent de kluis niet, dus het krijgt de lezer hier mee.
setPatLezer(tokenUitKluis);
let doFetch: typeof fetch = fetch;
let tokenOf: (userId: string, ruimte?: AiRuimte) => Promise<string | null> = githubTokenVoor;
/** Alleen voor tests. */
export const setGithubDeps = (deps: { fetch?: typeof fetch; token?: (userId: string, ruimte?: AiRuimte) => Promise<string | null>; kluis?: (userId: string) => Promise<KluisRij[]> } | null) => {
  doFetch = deps?.fetch ?? fetch;
  tokenOf = deps?.token ?? githubTokenVoor;
  kluisRijen = deps?.kluis ?? ((userId) => apiPlatformVaultItems(userId) as unknown as Promise<KluisRij[]>);
};

export type GhResult<T> = { ok: true; data: T; rate?: { remaining: number; reset: number } } | { ok: false; error: string; status: number };

async function gh(wie: GhWie, path: string, init: { method?: string; body?: unknown; graphql?: string } = {}): Promise<GhResult<any>> {
  const { userId, ruimte } = wieUit(wie);
  const token = await tokenOf(userId, ruimte);
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
export async function ghStatus(wie: GhWie) {
  const me = await gh(wie, '/user');
  if (!me.ok) return me.error === 'GITHUB_TOKEN_MISSING' ? ({ ok: true, data: { connected: false } } as GhResult<any>) : me;
  return { ok: true, data: { connected: true, login: s(me.data.login, 60), name: s(me.data.name, 100), avatar: s(me.data.avatar_url, 200), url: s(me.data.html_url, 200), publicRepos: n(me.data.public_repos), privateRepos: n(me.data.total_private_repos), followers: n(me.data.followers) }, rate: me.rate } as GhResult<any>;
}
/**
 * De sleutel achter de koppeling, zonder waarde: naam, doel en termijn uit de metadata van de kluis. Elk veld wordt hier
 * met de hand gezet, zodat de versleutelde waarde (ciphertext, iv, authTag) nooit mee naar buiten kan liften.
 */
export async function githubSleutelInfo(userId: string, ruimte: AiRuimte = 'prive'): Promise<GithubSleutelFeiten | null> {
  // De kluis is PERSOONLIJK: er is er maar één (doel «github» / «github-app»). In de technische ruimte met EIGEN gegevens
  // hoort die sleutel er dus niet bij — hem tonen zou een persoonlijke verbinding suggereren die daar niet gebruikt wordt
  // (backend/github-toegang.ts slaat de PAT daar ook over). Op «gedeeld» is de lade persoonlijk en komt hij gewoon mee.
  if (ruimteOf(ruimte) === 'technisch') return null;
  let rijen: KluisRij[];
  try { rijen = await kluisRijen(userId); } catch { return null; }
  for (const purpose of GITHUB_DOELEINDEN) {
    const rij = rijen.find((row) => row.purpose === purpose);
    if (!rij) continue;
    const meta = metaUitRecord(rij.meta);
    const { staat, dagenOver } = vaultStaat(meta);
    return { keyName: s(rij.keyName, 80), purpose, meta, staat, dagenOver, bijgewerktOp: n(rij.updatedAt), aangemaaktOp: n(rij.createdAt) };
  }
  return null;
}

/**
 * Alles wat de koppelkaart (github.*\/accounts) in één verzoek nodig heeft: wie we bij GitHub zijn én wat er over de sleutel in
 * de kluis bekend is. De tokenwaarde komt er nooit in: die gaat alleen als Authorization-header naar api.github.com en staat in
 * geen enkel veld van dit antwoord. Een afgewezen token is hier geen fout maar een staat: de kaart moet juist dán de reden tonen.
 */
export async function ghKoppeling(wie: GhWie): Promise<GhResult<any>> {
  const { userId, ruimte } = wieUit(wie);
  const [sleutel, st, extra] = await Promise.all([githubSleutelInfo(userId, ruimte), ghStatus(wie), koppelExtra(userId, ruimte)]);
  if (!st.ok) return { ok: true, data: { connected: false, sleutel, fout: st.error, ...extra } } as GhResult<any>;
  return { ok: true, data: { ...st.data, sleutel, ...extra }, rate: st.rate } as GhResult<any>;
}

/**
 * De drie wegen zoals ze er voor DEZE eigenaar uit zien, plus de waarden die hij bij GitHub moet invullen. Hier staat geen
 * token en geen client secret: alleen de client id en het App ID (publieke gegevens die ook in de adresbalk van GitHub staan),
 * de scopes, de termijn en langs welke weg de server nu praat.
 */
async function koppelExtra(userId: string, ruimte: AiRuimte = 'prive'): Promise<{ verbinding: GithubVerbindingFeiten | null; oauthKlaar: boolean; oauthClientId: string; appKlaar: boolean; appId: string; instel: ReturnType<typeof githubInstelWaarden> }> {
  const leeg = { verbinding: null, oauthKlaar: false, oauthClientId: '', appKlaar: false, appId: '', instel: githubInstelWaarden(SERVICE_HOSTS.github) };
  try {
    const [weg, oauth, app] = await Promise.all([githubWeg(userId, ruimte).catch(() => null), oauthApp(userId).catch(() => null), appSleutel(userId).catch(() => null)]);
    return {
      ...leeg,
      verbinding: weg ? { via: weg.via, scopes: weg.scopes.map((x) => s(x, 40)), verlooptOp: n(weg.verlooptOp), vernieuwbaar: weg.via !== 'pat', installatie: n(weg.installatie), repos: weg.repos.map((x) => s(x, 140)), bijgewerktOp: n(weg.bijgewerktOp) } : null,
      oauthKlaar: !!oauth && oauth !== 'onleesbaar',
      oauthClientId: oauth && oauth !== 'onleesbaar' ? s(oauth.clientId, 80) : '',
      appKlaar: !!app && app !== 'onleesbaar',
      appId: app && app !== 'onleesbaar' ? s(app.appId || app.clientId, 80) : '',
    };
  } catch { return leeg; }
}
export async function ghRepos(wie: GhWie, q: { query?: string; page?: number }) {
  const page = Math.max(1, Math.min(20, Math.floor(Number(q.page) || 1)));
  const res = await gh(wie, `/user/repos?sort=pushed&per_page=30&page=${page}&affiliation=owner,collaborator,organization_member`);
  if (!res.ok) return res;
  let repos = (res.data as any[]).map(shapeRepo);
  const needle = String(q.query || '').trim().toLowerCase();
  if (needle) repos = repos.filter((r) => `${r.fullName} ${r.description} ${r.language}`.toLowerCase().includes(needle));
  return { ok: true, data: { repos, page, hasMore: (res.data as any[]).length === 30 }, rate: res.rate } as GhResult<any>;
}
export async function ghRepo(wie: GhWie, repo: string) {
  const [info, langs, release] = await Promise.all([gh(wie, `/repos/${repo}`), gh(wie, `/repos/${repo}/languages`), gh(wie, `/repos/${repo}/releases/latest`)]);
  if (!info.ok) return info;
  const total = langs.ok ? Object.values(langs.data as Record<string, number>).reduce((a, b) => a + Number(b), 0) : 0;
  return { ok: true, data: { ...shapeRepo(info.data), languages: langs.ok ? Object.entries(langs.data as Record<string, number>).map(([name, bytes]) => ({ name, percent: total ? Math.round((Number(bytes) / total) * 100) : 0 })).sort((a, b) => b.percent - a.percent).slice(0, 8) : [], latestRelease: release.ok ? { tag: s(release.data.tag_name, 60), name: s(release.data.name, 120), publishedAt: s(release.data.published_at, 40), url: s(release.data.html_url, 200) } : null }, rate: info.rate } as GhResult<any>;
}
export async function ghIssues(wie: GhWie, repo: string, q: { state?: string; kind?: string }) {
  const state = ['open', 'closed', 'all'].includes(String(q.state)) ? String(q.state) : 'open';
  const pulls = q.kind === 'pr';
  const res = await gh(wie, pulls ? `/repos/${repo}/pulls?state=${state}&per_page=30&sort=updated&direction=desc` : `/repos/${repo}/issues?state=${state}&per_page=30&sort=updated&direction=desc`);
  if (!res.ok) return res;
  const items = (res.data as any[]).filter((i) => (pulls ? true : !i.pull_request)).map((i) => ({ ...shapeIssue(i), isPull: pulls }));
  return { ok: true, data: { items }, rate: res.rate } as GhResult<any>;
}
export async function ghCommits(wie: GhWie, repo: string, branch?: string) {
  const res = await gh(wie, `/repos/${repo}/commits?per_page=30${branch && /^[A-Za-z0-9._/-]{1,100}$/.test(branch) ? `&sha=${encodeURIComponent(branch)}` : ''}`);
  return res.ok ? ({ ok: true, data: { commits: (res.data as any[]).map(shapeCommit) }, rate: res.rate } as GhResult<any>) : res;
}
export async function ghActions(wie: GhWie, repo: string) {
  const res = await gh(wie, `/repos/${repo}/actions/runs?per_page=20`);
  if (!res.ok) return res;
  const runs = ((res.data as any).workflow_runs ?? []).map(shapeRun);
  const latest = runs[0];
  return { ok: true, data: { runs, summary: { total: n((res.data as any).total_count), failing: runs.filter((r: any) => r.conclusion === 'failure').length, latest: latest ? { status: latest.status, conclusion: latest.conclusion } : null } }, rate: res.rate } as GhResult<any>;
}
export async function ghReadme(wie: GhWie, repo: string) {
  const res = await gh(wie, `/repos/${repo}/readme`);
  if (!res.ok) return res;
  const text = res.data?.encoding === 'base64' ? Buffer.from(String(res.data.content || ''), 'base64').toString('utf8') : '';
  return { ok: true, data: { name: s(res.data.name, 100), text: text.slice(0, 20_000), truncated: text.length > 20_000, url: s(res.data.html_url, 200) }, rate: res.rate } as GhResult<any>;
}
export async function ghSearch(wie: GhWie, q: { q?: string; type?: string }) {
  const query = String(q.q ?? '').trim().slice(0, 256);
  if (query.length < 2) return { ok: false, error: 'GITHUB_QUERY_INVALID', status: 400 } as GhResult<any>;
  const type = ['repositories', 'issues', 'code'].includes(String(q.type)) ? String(q.type) : 'repositories';
  const res = await gh(wie, `/search/${type}?q=${encodeURIComponent(query)}&per_page=20`);
  if (!res.ok) return res;
  const items = ((res.data as any).items ?? []) as any[];
  const shaped = type === 'repositories' ? items.map(shapeRepo) : type === 'issues' ? items.map(shapeIssue) : items.map((c) => ({ name: s(c.name, 200), path: s(c.path, 300), repo: s(c.repository?.full_name, 140), url: s(c.html_url, 200) }));
  return { ok: true, data: { type, total: n((res.data as any).total_count), items: shaped }, rate: res.rate } as GhResult<any>;
}
export async function ghProjects(wie: GhWie) {
  const res = await gh(wie, '', { graphql: '{ viewer { projectsV2(first: 20, orderBy: {field: UPDATED_AT, direction: DESC}) { nodes { id title shortDescription url closed updatedAt items { totalCount } } } } }' });
  if (!res.ok) return res.error === 'GITHUB_GRAPHQL_ERROR' ? ({ ok: false, error: 'GITHUB_PROJECTS_SCOPE', status: 403 } as GhResult<any>) : res;
  const nodes = (res.data?.data?.viewer?.projectsV2?.nodes ?? []) as any[];
  return { ok: true, data: { projects: nodes.map((p) => ({ id: s(p.id, 60), title: s(p.title, 160), description: s(p.shortDescription, 300), url: s(p.url, 200), closed: !!p.closed, updatedAt: s(p.updatedAt, 40), items: n(p.items?.totalCount) })) }, rate: res.rate } as GhResult<any>;
}
export async function ghActivity(wie: GhWie) {
  const me = await gh(wie, '/user');
  if (!me.ok) return me;
  const login = s(me.data.login, 60);
  if (!LOGIN.test(login)) return { ok: false, error: 'GITHUB_LOGIN_INVALID', status: 502 } as GhResult<any>;
  const res = await gh(wie, `/users/${login}/events?per_page=30`);
  return res.ok ? ({ ok: true, data: { events: (res.data as any[]).map(shapeEvent) }, rate: res.rate } as GhResult<any>) : res;
}
export async function ghCreateIssue(wie: GhWie, repo: string, title: string, body: string) {
  const t = title.trim().slice(0, 250);
  if (t.length < 3) return { ok: false, error: 'GITHUB_TITLE_INVALID', status: 400 } as GhResult<any>;
  const res = await gh(wie, `/repos/${repo}/issues`, { method: 'POST', body: { title: t, body: String(body ?? '').slice(0, 20_000) } });
  return res.ok ? ({ ok: true, data: { number: n(res.data.number), url: s(res.data.html_url, 200) }, rate: res.rate } as GhResult<any>) : res;
}
export async function ghComment(wie: GhWie, repo: string, issue: number, body: string) {
  if (!Number.isInteger(issue) || issue < 1) return { ok: false, error: 'GITHUB_ISSUE_INVALID', status: 400 } as GhResult<any>;
  const text = String(body ?? '').trim().slice(0, 20_000);
  if (!text) return { ok: false, error: 'GITHUB_BODY_INVALID', status: 400 } as GhResult<any>;
  const res = await gh(wie, `/repos/${repo}/issues/${issue}/comments`, { method: 'POST', body: { body: text } });
  return res.ok ? ({ ok: true, data: { url: s(res.data.html_url, 200) }, rate: res.rate } as GhResult<any>) : res;
}

// ---- CI-logboeken (21.10.2026, recht «Журнали CI»): de jobs van één GitHub Actions-run en de tekst van hun logboek ----
//
// GitHub geeft een logboek nooit direct: GET …/actions/jobs/{id}/logs antwoordt 302 naar een kortlevend, ondertekend adres
// (tekst), GET …/actions/runs/{id}/logs 302 naar een zip met één tekstbestand per stap. Wij volgen die ene omleiding ZELF,
// alleen naar de hosts die GitHub daarvoor gebruikt, en ZONDER onze token mee te sturen (het adres is al ondertekend). Elke
// download heeft een harde grens; de tekst wordt ontdaan van kleurcodes en tijdstempels en ingekort tot de staart (daar staan
// de fouten), met de foutregels apart erbij. Alles wat uit een logboek komt is onbetrouwbare tekst, nooit een opdracht.
const LOG_HOST = /^(?:[a-z0-9-]+\.)*(?:actions\.githubusercontent\.com|blob\.core\.windows\.net|githubusercontent\.com)$/i;
const LOG_MAX_DOWNLOAD = 8 * 1024 * 1024;
export const CI_LOG_STANDAARD = 15_000;
export const CI_LOG_MAX = 50_000;
const CI_TOTAAL_MAX = 80_000;

type Download = { ok: true; bytes: Buffer; afgekapt: boolean } | { ok: false; error: string; status: number };
async function ghDownload(wie: GhWie, path: string): Promise<Download> {
  const { userId, ruimte } = wieUit(wie);
  const token = await tokenOf(userId, ruimte);
  if (!token) return { ok: false, error: 'GITHUB_TOKEN_MISSING', status: 409 };
  let res: Response;
  try {
    res = await doFetch(`${API}${path}`, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'User-Agent': 'mijn-ruimte', 'X-GitHub-Api-Version': '2022-11-28' }, signal: AbortSignal.timeout(20_000), redirect: 'manual' });
  } catch { return { ok: false, error: 'GITHUB_UNREACHABLE', status: 502 }; }
  if (res.status === 401) return { ok: false, error: 'GITHUB_TOKEN_INVALID', status: 401 };
  if (res.status === 403) return { ok: false, error: Number(res.headers.get('x-ratelimit-remaining')) === 0 ? 'GITHUB_RATE_LIMITED' : 'GITHUB_ACTIONS_FORBIDDEN', status: 403 };
  if (res.status === 404) return { ok: false, error: 'GITHUB_NOT_FOUND', status: 404 };
  if (res.status === 410) return { ok: false, error: 'GITHUB_LOGS_GONE', status: 410 };
  let bron = res;
  if (res.status >= 300 && res.status < 400) {
    const waar = res.headers.get('location') || '';
    let u: URL;
    try { u = new URL(waar); } catch { return { ok: false, error: 'GITHUB_LOG_HOST', status: 502 }; }
    if (u.protocol !== 'https:' || u.username || u.password || !LOG_HOST.test(u.hostname)) return { ok: false, error: 'GITHUB_LOG_HOST', status: 502 };
    try { bron = await doFetch(u.toString(), { headers: { 'User-Agent': 'mijn-ruimte' }, signal: AbortSignal.timeout(30_000), redirect: 'error' }); }
    catch { return { ok: false, error: 'GITHUB_UNREACHABLE', status: 502 }; }
    if (bron.status === 404 || bron.status === 410) return { ok: false, error: 'GITHUB_LOGS_GONE', status: 410 };
  }
  if (!bron.ok) return { ok: false, error: `GITHUB_ERROR_${bron.status}`, status: 502 };
  const delen: Buffer[] = [];
  let n = 0, afgekapt = false;
  const lezer = bron.body?.getReader();
  if (lezer) {
    for (;;) {
      const { done, value } = await lezer.read();
      if (done) break;
      const stuk = Buffer.from(value);
      if (n + stuk.length > LOG_MAX_DOWNLOAD) { delen.push(stuk.subarray(0, LOG_MAX_DOWNLOAD - n)); n = LOG_MAX_DOWNLOAD; afgekapt = true; await lezer.cancel().catch(() => undefined); break; }
      delen.push(stuk); n += stuk.length;
    }
  }
  return { ok: true, bytes: Buffer.concat(delen), afgekapt };
}

/** Kleurcodes en de tijdstempel vooraan elke regel weg; tekens die geen tekst zijn ook. */
export const logOpschonen = (t: string) => t
  .replace(/\x1b\[[0-9;?]*[A-Za-z]/g, '')
  .replace(/^﻿/, '')
  .replace(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z ?/gm, '')
  .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '')
  .replace(/\r\n?/g, '\n');
const FOUTREGEL = /##\[error\]|(?:^|[\s:[(])(?:error|fatal|failed|failure|exception|traceback|panic)\b|✖|\bERR!/i;
/** Staart + foutregels van één logboek. `max` = tekens van de staart. */
export function logSamenvatting(rauw: string, max: number) {
  const tekst = logOpschonen(rauw);
  const regels = tekst.split('\n');
  const fouten = regels.filter((r) => FOUTREGEL.test(r)).slice(-40).map((r) => r.replace(/##\[error\]/g, '').trim().slice(0, 300));
  const staart = tekst.length > max ? tekst.slice(tekst.length - max) : tekst;
  return { lines: regels.length, chars: tekst.length, truncated: tekst.length > max, errors: fouten, tail: tekst.length > max ? `…[${tekst.length - max} chars cut]\n${staart.slice(staart.indexOf('\n') + 1)}` : staart };
}
const shapeJob = (j: any) => ({
  id: n(j.id), name: s(j.name, 160), status: s(j.status, 20), conclusion: s(j.conclusion, 20), startedAt: s(j.started_at, 40), completedAt: s(j.completed_at, 40), url: s(j.html_url, 200),
  steps: Array.isArray(j.steps) ? j.steps.slice(0, 80).map((st: any) => ({ number: n(st.number), name: s(st.name, 160), status: s(st.status, 20), conclusion: s(st.conclusion, 20) })) : [],
});
/** Zip van een hele run → per job de tekst van zijn stappen (bestanden «<job>/<n>_<stap>.txt»). */
async function zipPerJob(bytes: Buffer): Promise<Map<string, string>> {
  const { unzipSync } = await import('fflate');
  const uit = new Map<string, string>();
  let bestanden: Record<string, Uint8Array>;
  try { bestanden = unzipSync(new Uint8Array(bytes), { filter: (f) => f.name.endsWith('.txt') && f.originalSize <= LOG_MAX_DOWNLOAD }); }
  catch { return uit; }
  const namen = Object.keys(bestanden).sort((a, b) => a.localeCompare(b, 'en', { numeric: true }));
  let totaal = 0;
  for (const naam of namen) {
    const map = naam.includes('/') ? naam.slice(0, naam.indexOf('/')) : naam.replace(/^\d+_/, '').replace(/\.txt$/, '');
    const tekst = Buffer.from(bestanden[naam]).toString('utf8');
    totaal += tekst.length;
    if (totaal > 4 * LOG_MAX_DOWNLOAD) break;
    uit.set(map, `${uit.get(map) ?? ''}${uit.has(map) ? '\n' : ''}${naam.includes('/') ? `===== ${naam.slice(naam.indexOf('/') + 1).replace(/\.txt$/, '')} =====\n` : ''}${tekst}`);
  }
  return uit;
}

export type CiLogVraag = { runId?: number; jobId?: number; failedOnly?: boolean; maxChars?: number };
/**
 * Logboeken van één run. Zonder run_id: de laatste MISLUKTE run (anders de laatste). Zonder job_id: de mislukte jobs (hoogstens 3),
 * of de eerste job als er geen enkele mislukte is. Eerst het logboek per job (tekst); geeft GitHub dat niet meer (404/410), dan de
 * zip van de hele run als terugval.
 */
export async function ghCiLogs(wie: GhWie, repo: string, q: CiLogVraag = {}): Promise<GhResult<any>> {
  const max = Math.max(1000, Math.min(CI_LOG_MAX, Math.floor(Number(q.maxChars) || CI_LOG_STANDAARD)));
  let runId = Number.isInteger(q.runId) && (q.runId as number) > 0 ? q.runId as number : 0;
  let run: any;
  if (!runId) {
    const lijst = await gh(wie, `/repos/${repo}/actions/runs?per_page=20`);
    if (!lijst.ok) return lijst;
    const runs = ((lijst.data as any)?.workflow_runs ?? []) as any[];
    run = runs.find((r) => r.conclusion === 'failure') ?? runs[0];
    if (!run) return { ok: false, error: 'GITHUB_GEEN_RUNS', status: 404 };
    runId = n(run.id);
  } else {
    const r = await gh(wie, `/repos/${repo}/actions/runs/${runId}`);
    if (!r.ok) return r;
    run = r.data;
  }
  const jobsRes = await gh(wie, `/repos/${repo}/actions/runs/${runId}/jobs?per_page=50&filter=latest`);
  if (!jobsRes.ok) return jobsRes;
  const jobs = (((jobsRes.data as any)?.jobs ?? []) as any[]).map(shapeJob);
  const jobId = Number.isInteger(q.jobId) && (q.jobId as number) > 0 ? q.jobId as number : 0;
  let gekozen = jobId ? jobs.filter((j) => j.id === jobId) : jobs.filter((j) => j.conclusion === 'failure' || j.conclusion === 'cancelled' || j.conclusion === 'timed_out');
  if (jobId && !gekozen.length) return { ok: false, error: 'GITHUB_JOB_ONBEKEND', status: 404 };
  if (!gekozen.length && q.failedOnly !== true) gekozen = jobs.slice(0, 1);
  gekozen = gekozen.slice(0, 3);
  let zip: Map<string, string> | null = null;
  let totaal = 0;
  const metLog = [];
  for (const j of gekozen) {
    const ruimte = Math.max(1000, Math.min(max, CI_TOTAAL_MAX - totaal));
    let bron: 'job' | 'zip' = 'job';
    let tekst = '';
    let afgekapt = false;
    const d = await ghDownload(wie, `/repos/${repo}/actions/jobs/${j.id}/logs`);
    if (d.ok) { tekst = d.bytes.toString('utf8'); afgekapt = d.afgekapt; }
    else if (d.error === 'GITHUB_LOGS_GONE' || d.error === 'GITHUB_NOT_FOUND') {
      if (!zip) {
        const z = await ghDownload(wie, `/repos/${repo}/actions/runs/${runId}/logs`);
        if (!z.ok) return z.error === 'GITHUB_NOT_FOUND' ? { ok: false, error: 'GITHUB_LOGS_GONE', status: 410 } : z;
        zip = await zipPerJob(z.bytes);
      }
      bron = 'zip';
      tekst = zip.get(j.name) ?? [...zip.entries()].find(([k]) => k.toLowerCase() === j.name.toLowerCase())?.[1] ?? '';
      if (!tekst) { metLog.push({ ...j, log: { source: bron, missing: true } }); continue; }
    } else return d;
    const sam = logSamenvatting(tekst, ruimte);
    totaal += sam.tail.length;
    metLog.push({ ...j, log: { source: bron, downloadTruncated: afgekapt, ...sam } });
  }
  const shaped = shapeRun(run);
  return {
    ok: true,
    data: {
      run: { ...shaped, sha: s(run?.head_sha, 40) },
      jobs: metLog,
      otherJobs: jobs.filter((j) => !gekozen.some((g) => g.id === j.id)).map((j) => ({ id: j.id, name: j.name, conclusion: j.conclusion, status: j.status })),
      note: gekozen.length ? '' : 'No failed job in this run; pass job_id to read a specific job.',
    },
  };
}

// ---- pull request maken (21.10.2026, recht «Створювати pull request»): nieuwe branch + één commit + PR, NOOIT samenvoegen ----
//
// Langs de Git Data API, zodat er niets lokaal gekloond hoeft te worden en geen bestaande branch geraakt wordt:
//   1. de basisbranch (of de standaardbranch van de repository) → commit-sha → tree-sha;
//   2. de nieuwe branch mag NIET bestaan (bestaat hij: weigeren — er is geen «force» in deze code);
//   3. een blob per bestand, één tree op de basistree (verwijderen = sha null), één commit met de basis als ouder;
//   4. refs/heads/<branch> aanmaken, dan de pull request openen;
//   5. mislukt de pull request, dan wordt de branch die WIJ net maakten weer weggehaald (alleen die, alleen dan).
// Deze functie wordt nooit rechtstreeks door een AI aangeroepen: alleen nadat de eigenaar het voorstel op de site bevestigde.
const segmenten = (b: string) => b.split('/').map(encodeURIComponent).join('/');
export async function ghCreatePr(wie: GhWie, v: PrVoorstel): Promise<GhResult<any>> {
  const repo = validRepo(v.repo);
  if (!repo) return { ok: false, error: 'GITHUB_REPO_INVALID', status: 400 };
  let base = v.base;
  if (!base) {
    const info = await gh(wie, `/repos/${repo}`);
    if (!info.ok) return info;
    base = s((info.data as any)?.default_branch, 100);
    if (!base) return { ok: false, error: 'GITHUB_BASE_ONBEKEND', status: 404 };
  }
  if (base === v.branch) return { ok: false, error: 'GITHUB_BRANCH_IS_BASE', status: 400 };
  const ref = await gh(wie, `/repos/${repo}/git/ref/heads/${segmenten(base)}`);
  if (!ref.ok) return ref.error === 'GITHUB_NOT_FOUND' ? { ok: false, error: 'GITHUB_BASE_ONBEKEND', status: 404 } : ref;
  const baseSha = s((ref.data as any)?.object?.sha, 40);
  const bestaat = await gh(wie, `/repos/${repo}/git/ref/heads/${segmenten(v.branch)}`);
  if (bestaat.ok) return { ok: false, error: 'GITHUB_BRANCH_EXISTS', status: 409 };
  if (bestaat.error !== 'GITHUB_NOT_FOUND') return bestaat;
  const commit = await gh(wie, `/repos/${repo}/git/commits/${baseSha}`);
  if (!commit.ok) return commit;
  const baseTree = s((commit.data as any)?.tree?.sha, 40);
  const tree: Array<{ path: string; mode: '100644'; type: 'blob'; sha: string | null }> = [];
  for (const f of v.files) {
    if (f.delete) { tree.push({ path: f.path, mode: '100644', type: 'blob', sha: null }); continue; }
    const blob = await gh(wie, `/repos/${repo}/git/blobs`, { method: 'POST', body: { content: String(f.content ?? ''), encoding: f.encoding === 'base64' ? 'base64' : 'utf-8' } });
    if (!blob.ok) return blob;
    tree.push({ path: f.path, mode: '100644', type: 'blob', sha: s((blob.data as any)?.sha, 40) });
  }
  const nieuweTree = await gh(wie, `/repos/${repo}/git/trees`, { method: 'POST', body: { base_tree: baseTree, tree } });
  if (!nieuweTree.ok) return nieuweTree.error === 'GITHUB_ERROR_422' ? { ok: false, error: 'GITHUB_TREE_GEWEIGERD', status: 422 } : nieuweTree;
  const nieuweCommit = await gh(wie, `/repos/${repo}/git/commits`, { method: 'POST', body: { message: v.commitMessage, tree: s((nieuweTree.data as any)?.sha, 40), parents: [baseSha] } });
  if (!nieuweCommit.ok) return nieuweCommit;
  const commitSha = s((nieuweCommit.data as any)?.sha, 40);
  const nieuweRef = await gh(wie, `/repos/${repo}/git/refs`, { method: 'POST', body: { ref: `refs/heads/${v.branch}`, sha: commitSha } });
  if (!nieuweRef.ok) return nieuweRef.error === 'GITHUB_ERROR_422' ? { ok: false, error: 'GITHUB_BRANCH_EXISTS', status: 409 } : nieuweRef;
  const pr = await gh(wie, `/repos/${repo}/pulls`, { method: 'POST', body: { title: v.title, head: v.branch, base, body: v.body, draft: v.draft, maintainer_can_modify: true } });
  if (!pr.ok) {
    await gh(wie, `/repos/${repo}/git/refs/heads/${segmenten(v.branch)}`, { method: 'DELETE' }).catch(() => undefined);
    return pr.error === 'GITHUB_ERROR_422' ? { ok: false, error: 'GITHUB_PR_GEWEIGERD', status: 422 } : pr;
  }
  return { ok: true, data: { number: n((pr.data as any)?.number), url: s((pr.data as any)?.html_url, 200), repo, base, branch: v.branch, commit: commitSha, files: v.files.length, draft: !!(pr.data as any)?.draft, merged: false }, rate: pr.rate };
}

// ---- routes ----
type SessionAuth = { errorCode: string } | { service: string; user: { id: string; status: string } };
const bodyOf = (b: unknown): Record<string, unknown> => (b && typeof b === 'object' ? (b as Record<string, unknown>) : {});

/** Host van dit verzoek. De server verwijdert x-forwarded-host, dus alleen de echte Host-header telt. */
const hostVan = (event: Record<string, unknown>): string => {
  const koppen = (event?.headers || {}) as Record<string, string>;
  return String(koppen.host || koppen.Host || '').split(',')[0].trim().toLowerCase();
};
/** Waarde van één cookie uit het verzoek; '' als hij er niet is. Nooit gejournaliseerd. */
const cookieVan = (event: Record<string, unknown>, naam: string): string => {
  const koppen = (event?.headers || {}) as Record<string, string>;
  for (const deel of String(koppen.cookie || koppen.Cookie || '').split(';')) {
    const i = deel.indexOf('=');
    if (i > 0 && deel.slice(0, i).trim() === naam) return deel.slice(i + 1).trim();
  }
  return '';
};

export function createGithubRoutes(deps: {
  requireSession: (event: Record<string, unknown>, body: unknown) => Promise<SessionAuth>;
  audit: (userId: string, action: string, result: string, details?: Record<string, unknown>) => Promise<unknown>;
  /** Sessie uit alleen de cookies (GitHub stuurt de browser met een GET terug, zonder body). */
  anchor?: (event: Record<string, unknown>) => Promise<{ user: { id: string } } | null>;
  /** Naam van het sessiecookie, zodat de `state` aan déze sessie gebonden kan worden. */
  sessieCookie?: string;
}) {
  /**
   * ÉÉN POORT VOOR ELKE GITHUB-ROUTE (migratie 0086). Na de sessie en de limiet vraagt elke route eerst de LADE op
   * (backend/ruimte-bord-github.ts → githubLade, dienst «github»):
   *   • persoonlijke ruimte → de persoonlijke koppeling, precies zoals het altijd was;
   *   • technisch + «gedeeld» → ook de persoonlijke koppeling, maar bewust en in het logboek;
   *   • technisch + «eigen»   → uitsluitend de EIGEN koppeling van de technische lade;
   *   • «uit», «bevroren» of nog niets gekozen → geen gegevens, met de reden in beide talen (nooit een lege kaart).
   * Omdat de lade hier wordt bepaald en als `wie` meegaat naar elke bewerking, kan geen enkele route hem overslaan — ook de
   * hulpmiddelen van een AI niet, want die lopen via dezelfde routes (backend/site-aanroep.ts).
   */
  const route = (name: string, write: boolean, run: (wie: GhWie, b: Record<string, unknown>) => Promise<GhResult<any>>) => [async (ctx: any) => {
    const auth = await deps.requireSession(ctx.event, ctx.body);
    if ('errorCode' in auth || auth.service !== 'github' || auth.user.status !== 'approved') return error('OWNER_GITHUB_SESSION_REQUIRED', 403);
    if (!(await rateLimit(`github:${write ? 'w' : 'r'}:${auth.user.id}`, write ? 30 : 240, 600, { failClosed: true })).ok) return error('RATE_LIMITED', 429);
    const poort = await githubLade({ userId: auth.user.id, tabContext: bodyOf(ctx.body).tabContext });
    if (!poort.ok) {
      if (write) await deps.audit(auth.user.id, `owner.github.${name}`, 'denied', { reason: 'RUIMTE_GESLOTEN' });
      return poort.resp;
    }
    const out = await run({ userId: auth.user.id, ruimte: poort.lade.ruimte }, bodyOf(ctx.body));
    if (write) await deps.audit(auth.user.id, `owner.github.${name}`, out.ok ? 'success' : 'failure', { reason: out.ok ? '' : out.error, ruimte: poort.lade.ruimte });
    if (!out.ok) return error(out.error, out.status);
    return json({ ok: true, ...out.data, rate: out.rate, ruimte: poort.kop });
  }];
  const withRepo = (fn: (wie: GhWie, repo: string, b: Record<string, unknown>) => Promise<GhResult<any>>) => async (wie: GhWie, b: Record<string, unknown>) => {
    const repo = validRepo(b.repo);
    return repo ? fn(wie, repo, b) : ({ ok: false, error: 'GITHUB_REPO_INVALID', status: 400 } as GhResult<any>);
  };
  return {
    'POST /api/owner/github/status': route('status', false, (u) => ghStatus(u)),
    // Koppelkaart (github.*/accounts): staat + sleutelgegevens uit de kluis, zonder enige tokenwaarde.
    'POST /api/owner/github/koppeling': route('koppeling', false, (u) => ghKoppeling(u)),
    'POST /api/owner/github/repos': route('repos', false, (u, b) => ghRepos(u, { query: String(b.query ?? ''), page: Number(b.page) })),
    'POST /api/owner/github/repo': route('repo', false, withRepo((u, r) => ghRepo(u, r))),
    'POST /api/owner/github/issues': route('issues', false, withRepo((u, r, b) => ghIssues(u, r, { state: String(b.state ?? ''), kind: String(b.kind ?? '') }))),
    'POST /api/owner/github/commits': route('commits', false, withRepo((u, r, b) => ghCommits(u, r, b.branch ? String(b.branch) : undefined))),
    'POST /api/owner/github/actions': route('actions', false, withRepo((u, r) => ghActions(u, r))),
    // 21.10.2026 «Журнали CI»: jobs + logboektekst (ingekort) van één run; alleen lezen.
    'POST /api/owner/github/actions/logs': route('actions_logs', false, withRepo((u, r, b) => ghCiLogs(u, r, { runId: Number(b.run_id) || undefined, jobId: Number(b.job_id) || undefined, failedOnly: b.failed_only === true, maxChars: Number(b.max_chars) || undefined }))),
    'POST /api/owner/github/readme': route('readme', false, withRepo((u, r) => ghReadme(u, r))),
    'POST /api/owner/github/search': route('search', false, (u, b) => ghSearch(u, { q: String(b.q ?? ''), type: String(b.type ?? '') })),
    'POST /api/owner/github/projects': route('projects', false, (u) => ghProjects(u)),
    'POST /api/owner/github/activity': route('activity', false, (u) => ghActivity(u)),
    'POST /api/owner/github/issue/create': route('issue_create', true, withRepo((u, r, b) => ghCreateIssue(u, r, String(b.title ?? ''), String(b.body ?? '')))),
    'POST /api/owner/github/issue/comment': route('issue_comment', true, withRepo((u, r, b) => ghComment(u, r, Number(b.number), String(b.body ?? '')))),
    // 21.10.2026 «Створювати pull request»: maakt NIETS aan GitHub — alleen een verzoek in de bevestigingsrij (backend/ai-bevestiging.ts).
    // Pas als de eigenaar het op de site bevestigt (passkey/app-code), maakt de server branch, commit en PR (ghCreatePr). Met alleen
    // `bevestiging_id`: de stand van een eerder verzoek. Laat geladen: dev-mg-bevestiging.ts importeert dit bestand.
    'POST /api/owner/github/pr/voorstel': route('pr_voorstel', true, async (u, b) => (await import('./dev-mg-bevestiging')).prVoorstelRoute(u, b) as Promise<GhResult<any>>),
    ...koppelRoutes(deps),
  };
}

/**
 * De routes van het ECHTE koppelen: de OAuth-flow starten, de terugkeer van GitHub aannemen, vernieuwen, ontkoppelen, en de
 * installatie van de GitHub App bekijken. Geen enkele route geeft een token terug; de journaalregels bevatten alleen de weg
 * en een foutcode.
 */
function koppelRoutes(deps: Parameters<typeof createGithubRoutes>[0]) {
  const sessieCookie = deps.sessieCookie || '';
  /** Eigenaarssessie van de GitHub-dienst, zoals alle andere routes hier die eisen. */
  /**
   * Eigenaarssessie van de GitHub-dienst PLUS de gegevenslade. Koppelen, vernieuwen en ontkoppelen raken de token zelf, dus
   * zij mogen al helemaal niet buiten de poort om: wie in de technische ruimte koppelt, koppelt de TECHNISCHE lade, en wie
   * daar niets mag, koppelt niets. `null` = geen sessie; `{ auth, weigering }` = sessie maar gesloten lade.
   */
  const poort = async (ctx: any): Promise<{ auth: any; ruimte: AiRuimte; weigering: null } | { auth: any; ruimte: null; weigering: ReturnType<typeof json> } | null> => {
    const auth = await deps.requireSession(ctx.event, ctx.body);
    if ('errorCode' in auth || auth.service !== 'github' || auth.user.status !== 'approved') return null;
    const lade = await githubLade({ userId: auth.user.id, tabContext: bodyOf(ctx.body).tabContext });
    if (!lade.ok) return { auth, ruimte: null, weigering: lade.resp };
    return { auth, ruimte: lade.lade.ruimte, weigering: null };
  };
  const omleiding = (host: string, code: string) => ({
    statusCode: 303,
    headers: { Location: `https://${host}/accounts?github=${encodeURIComponent(code.slice(0, 60))}`, 'Cache-Control': 'no-store', 'Content-Type': 'text/plain; charset=utf-8' },
    body: '',
  });

  return {
    // Start van de flow. Eigen, strenge limiet: wie de knop blijft indrukken, maakt geen stortvloed van `state`-rijen.
    'POST /api/owner/github/oauth/start': [async (ctx: any) => {
      const p = await poort(ctx);
      if (!p) return error('OWNER_GITHUB_SESSION_REQUIRED', 403);
      if (p.weigering) return p.weigering;
      const auth = p.auth;
      if (!(await rateLimit(`github:oauth:start:${auth.user.id}`, 10, 600, { failClosed: true })).ok) return error('RATE_LIMITED', 429);
      // De host komt NIET uit de kop van het verzoek maar uit de identiteit van de deployment: zo wijst redirect_uri altijd
      // naar het adres dat de eigenaar bij GitHub registreerde, ook als iemand een eigen Host-kop meestuurt.
      if (hostVan(ctx.event) !== SERVICE_HOSTS.github) return error('GITHUB_OAUTH_HOST_ONJUIST', 400);
      // De LADE gaat mee in de bewaarde `state`: de terugkeer van GitHub schrijft de token in dezelfde lade waarin de mens
      // de flow begon, en GitHub kan die keuze niet veranderen (backend/github-oauth.ts).
      const uit = await oauthStarten(auth.user.id, { sessieToken: cookieVan(ctx.event, sessieCookie), host: SERVICE_HOSTS.github, ruimte: p.ruimte });
      await deps.audit(auth.user.id, 'owner.github.oauth.start', uit.ok ? 'success' : 'failure', { reason: uit.ok ? '' : uit.fout, doel: GITHUB_OAUTH_DOEL, ruimte: p.ruimte });
      return uit.ok ? json({ ok: true, authUrl: uit.data.authUrl }) : error(uit.fout, uit.status);
    }],

    // Terugkeer van GitHub: een gewone navigatie van de browser, dus GET zonder body. De sessie komt uit de cookies, de
    // `state` moet bij die sessie en bij deze host horen en is daarna verbruikt. Het antwoord is een omleiding naar de
    // koppelkaart met alleen een RESULTAATCODE in de URL — nooit een code of een token.
    'GET /api/owner/github/oauth/callback': [async (ctx: any) => {
      const host = hostVan(ctx.event);
      const veiligeHost = host === SERVICE_HOSTS.github ? host : SERVICE_HOSTS.github;
      if (host !== SERVICE_HOSTS.github) return omleiding(veiligeHost, 'GITHUB_OAUTH_HOST_ONJUIST');
      const anker = deps.anchor ? await deps.anchor(ctx.event).catch(() => null) : null;
      if (!anker?.user?.id) return omleiding(veiligeHost, 'OWNER_GITHUB_SESSION_REQUIRED');
      if (!(await rateLimit(`github:oauth:cb:${anker.user.id}`, 20, 600, { failClosed: true })).ok) return omleiding(veiligeHost, 'RATE_LIMITED');
      const uit = await oauthTerugkeer({
        state: String(ctx.query?.state || ''), code: String(ctx.query?.code || ''), fout: String(ctx.query?.error || ''),
        host, sessieToken: cookieVan(ctx.event, sessieCookie), userId: anker.user.id,
      });
      await deps.audit(anker.user.id, 'owner.github.oauth.callback', uit.ok ? 'success' : 'failure', { reason: uit.ok ? '' : uit.fout, login: uit.ok ? uit.data.login : '', ruimte: uit.ok ? uit.data.ruimte : '' });
      return omleiding(veiligeHost, uit.ok ? 'ok' : uit.fout);
    }],

    'POST /api/owner/github/oauth/vernieuwen': [async (ctx: any) => {
      const p = await poort(ctx);
      if (!p) return error('OWNER_GITHUB_SESSION_REQUIRED', 403);
      if (p.weigering) return p.weigering;
      const auth = p.auth;
      if (!(await rateLimit(`github:oauth:ververs:${auth.user.id}`, 20, 600, { failClosed: true })).ok) return error('RATE_LIMITED', 429);
      const uit = await oauthVernieuwen(auth.user.id, p.ruimte);
      await deps.audit(auth.user.id, 'owner.github.oauth.vernieuwen', uit.ok ? 'success' : 'failure', { reason: uit.ok ? '' : uit.fout, ruimte: p.ruimte });
      // Alleen de nieuwe termijn, nooit de token zelf.
      return uit.ok ? json({ ok: true, verlooptOp: uit.data.verlooptOp }) : error(uit.fout, uit.status);
    }],

    // Ontkoppelen trekt de token bij GitHub echt in (OAuth) of verwijdert het bewaarde installatietoken (App).
    'POST /api/owner/github/ontkoppelen': [async (ctx: any) => {
      const p = await poort(ctx);
      if (!p) return error('OWNER_GITHUB_SESSION_REQUIRED', 403);
      if (p.weigering) return p.weigering;
      const auth = p.auth;
      if (!(await rateLimit(`github:ontkoppel:${auth.user.id}`, 20, 600, { failClosed: true })).ok) return error('RATE_LIMITED', 429);
      const weg = String(bodyOf(ctx.body).weg || 'oauth');
      // Ontkoppelen raakt ALLEEN de lade waarin deze mens nu staat: wie technisch ontkoppelt, verliest zijn persoonlijke
      // koppeling niet, en wie persoonlijk ontkoppelt, laat de technische staan.
      const uit = weg === 'app' ? await appOntkoppelen(auth.user.id, p.ruimte) : await oauthOntkoppelen(auth.user.id, p.ruimte);
      await deps.audit(auth.user.id, 'owner.github.ontkoppelen', uit.ok ? 'success' : 'failure', { weg, reason: uit.ok ? '' : uit.fout, ruimte: p.ruimte });
      return uit.ok ? json({ ok: true, ...uit.data }) : error(uit.fout, uit.status);
    }],

    // GitHub App: waar de app van de eigenaar staat en bij welke repositories ze mag.
    'POST /api/owner/github/app/installaties': [async (ctx: any) => {
      const p = await poort(ctx);
      if (!p) return error('OWNER_GITHUB_SESSION_REQUIRED', 403);
      if (p.weigering) return p.weigering;
      const auth = p.auth;
      if (!(await rateLimit(`github:app:lijst:${auth.user.id}`, 60, 600, { failClosed: true })).ok) return error('RATE_LIMITED', 429);
      const uit = await appInstallaties(auth.user.id);
      if (!uit.ok) return error(uit.fout, uit.status);
      const repos = await appRepos(auth.user.id);
      return json({ ok: true, ...uit.data, repos: repos.ok ? repos.data.repos : [], doel: GITHUB_APP_DOEL });
    }],

    // De app op een gekozen installatie zetten (of de enige installatie pakken) en meteen een installatietoken halen.
    'POST /api/owner/github/app/verbinden': [async (ctx: any) => {
      const p = await poort(ctx);
      if (!p) return error('OWNER_GITHUB_SESSION_REQUIRED', 403);
      if (p.weigering) return p.weigering;
      const auth = p.auth;
      if (!(await rateLimit(`github:app:verbind:${auth.user.id}`, 20, 600, { failClosed: true })).ok) return error('RATE_LIMITED', 429);
      const gevraagd = Math.max(0, Math.floor(Number(bodyOf(ctx.body).installatie) || 0));
      const uit = await appTokenVernieuwen(auth.user.id, gevraagd, p.ruimte);
      await deps.audit(auth.user.id, 'owner.github.app.verbinden', uit.ok ? 'success' : 'failure', { reason: uit.ok ? '' : uit.fout, installatie: uit.ok ? uit.data.installatie : gevraagd, ruimte: p.ruimte });
      // Alleen de installatie en de termijn; het installatietoken blijft op de server.
      return uit.ok ? json({ ok: true, installatie: uit.data.installatie, verlooptOp: uit.data.verlooptOp }) : error(uit.fout, uit.status);
    }],
  };
}
