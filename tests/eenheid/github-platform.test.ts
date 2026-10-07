// GitHub-integratie: verkleinde vormen, validatie, foutafhandeling en dat de token alleen als header de server verlaat.
import { ghActions, ghActivity, ghComment, ghCreateIssue, ghIssues, ghRepos, ghSearch, ghStatus, setGithubDeps, shapeIssue, validRepo } from '../../backend/github-platform';
import { checker } from './hulp/nep-google';

type Call = { url: string; method: string; body?: string; auth?: string };
function mock(routes: Record<string, unknown>, calls: Call[] = []) {
  const fn = (async (url: string, init?: RequestInit) => {
    const call = { url: String(url), method: init?.method || 'GET', body: init?.body as string | undefined, auth: (init?.headers as Record<string, string>)?.Authorization };
    calls.push(call);
    const key = Object.keys(routes).filter((k) => call.url.startsWith(`https://api.github.com${k}`)).sort((a, b) => b.length - a.length)[0];
    if (!key) return new Response('{}', { status: 404 });
    const v = routes[key];
    if (v instanceof Response) return v;
    return new Response(JSON.stringify(v), { status: 200, headers: { 'x-ratelimit-remaining': '4999', 'x-ratelimit-reset': '1800000000' } });
  }) as unknown as typeof fetch;
  setGithubDeps({ fetch: fn, token: async () => 'ghp_test' });
  return calls;
}

export async function main(): Promise<number> {
  const { check, einde } = checker('github-platform');
  try {
    check('repo-namen worden gevalideerd', validRepo('octo/hello-world') === 'octo/hello-world' && ['', 'a', '../x/y', 'a/b/c', 'a b/c', 'a/b?x=1', 5, null].every((b) => validRepo(b) === ''));

    setGithubDeps({ fetch: (async () => new Response('{}')) as unknown as typeof fetch, token: async () => null });
    const none: any = await ghStatus('u1');
    check('status zonder token = niet verbonden (geen fout)', none.ok && none.data.connected === false);

    let calls = mock({ '/user': { login: 'octo', name: 'Octo', public_repos: 3, total_private_repos: 2, followers: 1 } });
    const st: any = await ghStatus('u1');
    check('status met token toont login; token alleen in Authorization-header', st.ok && st.data.login === 'octo' && st.data.privateRepos === 2 && calls[0].auth === 'Bearer ghp_test' && !calls[0].url.includes('ghp_test') && !JSON.stringify(st).includes('ghp_test'));

    mock({ '/user': new Response('{}', { status: 401 }) });
    const bad: any = await ghStatus('u1');
    mock({ '/user': new Response('{}', { status: 403, headers: { 'x-ratelimit-remaining': '0' } }) });
    const lim: any = await ghStatus('u1');
    check('ongeldige token en rate limit geven herkenbare fouten', bad.error === 'GITHUB_TOKEN_INVALID' && lim.error === 'GITHUB_RATE_LIMITED');

    mock({ '/user/repos': [{ id: 1, name: 'a', full_name: 'o/a', description: 'mail tool', language: 'TS', stargazers_count: 5, owner: { login: 'o' }, secret: 'x' }, { id: 2, name: 'b', full_name: 'o/b', description: 'huis', language: 'Go' }] });
    const repos: any = await ghRepos('u1', { query: 'mail' });
    check('repos worden verkleind en gefilterd', repos.ok && repos.data.repos.length === 1 && !('secret' in repos.data.repos[0]));

    mock({ '/repos/o/a/issues': [{ number: 1, title: 'bug', state: 'open' }, { number: 2, title: 'pr', state: 'open', pull_request: {} }] });
    const iss: any = await ghIssues('u1', 'o/a', { state: 'open' });
    check('issues sluiten pull requests uit', iss.ok && iss.data.items.length === 1 && iss.data.items[0].number === 1 && shapeIssue({ number: 3, pull_request: {} }).isPull === true);

    mock({ '/repos/o/a/actions/runs': { total_count: 2, workflow_runs: [{ id: 1, status: 'completed', conclusion: 'failure' }, { id: 2, status: 'completed', conclusion: 'success' }] } });
    const act: any = await ghActions('u1', 'o/a');
    check('actions vat mislukte runs samen', act.ok && act.data.summary.failing === 1 && act.data.summary.latest.conclusion === 'failure');

    const short: any = await ghSearch('u1', { q: 'a' });
    calls = mock({ '/search/repositories': { total_count: 0, items: [] } });
    await ghSearch('u1', { q: 'a&b=c d', type: 'bogus' });
    check('zoeken weigert te korte vragen en codeert de query', short.error === 'GITHUB_QUERY_INVALID' && calls[0].url.includes('q=a%26b%3Dc%20d'));

    mock({ '/user': { login: 'octo' }, '/users/octo/events': [{ id: '1', type: 'PushEvent', repo: { name: 'o/a' }, payload: { size: 2, ref: 'refs/heads/main' } }] });
    const ev: any = await ghActivity('u1');
    check('activiteit krijgt een leesbare samenvatting', ev.ok && ev.data.events[0].summary === 'push · 2 commit(s) → main', JSON.stringify(ev.data));

    const t1: any = await ghCreateIssue('u1', 'o/a', 'x', '');
    const t2: any = await ghComment('u1', 'o/a', 0, 'hi');
    const t3: any = await ghComment('u1', 'o/a', 1, '  ');
    calls = mock({ '/repos/o/a/issues': { number: 7, html_url: 'https://github.com/o/a/issues/7' } });
    const made: any = await ghCreateIssue('u1', 'o/a', 'Titel hier', 'tekst');
    check('issue aanmaken/reageren valideert invoer en stuurt POST', t1.error === 'GITHUB_TITLE_INVALID' && t2.error === 'GITHUB_ISSUE_INVALID' && t3.error === 'GITHUB_BODY_INVALID' && made.data.number === 7 && calls[0].method === 'POST' && JSON.parse(calls[0].body || '{}').title === 'Titel hier');
  } finally { setGithubDeps(null); }
  return einde();
}
