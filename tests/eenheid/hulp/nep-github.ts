// Testhulp (geen test zelf): een nagebootst GitHub, naar hetzelfde model als hulp/nep-google.ts. `fetch` wordt onderschept,
// er gaat niets naar buiten, en de nep-GitHub is STRENG: hij controleert echt wat de server stuurt.
//
// Wat hij nakijkt, zodat de test iets waard is:
//  - de code wordt maar één keer ingewisseld, en alleen met de juiste client id + client secret en de juiste redirect_uri;
//  - PKCE: de meegestuurde code_verifier moet bij de code_challenge van de authorize-URL horen;
//  - de app-JWT wordt met de ECHTE publieke sleutel gecontroleerd (RS256, iss, exp ≤ 10 minuten);
//  - het intrekken van een token komt met basisauthenticatie van client id + secret en het juiste tokenveld.
// Elk verzoek wordt opgeslagen, zodat de test kan vaststellen dat er nergens een geheim in een URL stond.
import { createHash, createVerify, generateKeyPairSync, randomBytes } from 'node:crypto';

export const CLIENT_ID = 'Ov23liEenheidsTest01';
export const CLIENT_SECRET = 'ghcs_eenheidstestgeheim0123456789abcdef';
export const APP_ID = '987654';
export const LOGIN = 'pavlo';

export type Verzoek = { url: string; methode: string; body: string; auth: string };

export type NepGithub = ReturnType<typeof nepGithub>;

/**
 * Zet de nep-GitHub aan. `opties.expiration` bootst een OAuth-app na waarin de eigenaar «expiration» heeft aangezet: dan
 * komen er ook `refresh_token` en `expires_in` mee.
 */
export function nepGithub(opties: { expiration?: boolean } = {}) {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const pem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
  const verzoeken: Verzoek[] = [];
  /** Uitgegeven codes: code → { challenge, redirect, gebruikt }. */
  const codes = new Map<string, { challenge: string; redirect: string; gebruikt: boolean }>();
  /** Geldige tokens; ingetrokken tokens verdwijnen hieruit, zodat «echt intrekken» te meten is. */
  const tokens = new Set<string>();
  const verversTokens = new Set<string>();
  let installatieTokens = 0;
  const staat = { installaties: [{ id: 42, account: { login: LOGIN, type: 'User' }, repository_selection: 'selected' }] as any[] };
  /** (21.10.2026) Repositories voor de Git Data API, pull requests en Actions-logboeken (zie punt 5 hieronder). */
  type NepRepo = {
    standaard: string; refs: Map<string, string>; commits: Map<string, { tree: string; parent: string; message: string }>; trees: Map<string, Map<string, string>>;
    blobs: Map<string, string>; pulls: any[]; verwijderdeRefs: string[]; prWeigeren: boolean; samenvoegPogingen: number;
    runs: any[]; jobs: Map<number, any[]>; logs: Map<number, string>; logWeg: Set<number>; zips: Map<number, Uint8Array>; logOmleiding?: (id: number) => string;
  };
  const repos = new Map<string, NepRepo>();
  const repoMaken = (naam: string, bestanden: Record<string, string> = { 'README.md': '# proef\n' }, standaard = 'main'): NepRepo => {
    const tree = new Map(Object.entries(bestanden));
    const treeSha = createHash('sha1').update(`tree ${naam}`).digest('hex');
    const commitSha = createHash('sha1').update(`commit ${naam}`).digest('hex');
    const r: NepRepo = { standaard, refs: new Map([[standaard, commitSha]]), commits: new Map([[commitSha, { tree: treeSha, parent: '', message: 'begin' }]]), trees: new Map([[treeSha, tree]]),
      blobs: new Map(), pulls: [], verwijderdeRefs: [], prWeigeren: false, samenvoegPogingen: 0, runs: [], jobs: new Map(), logs: new Map(), logWeg: new Set(), zips: new Map() };
    repos.set(naam, r);
    return r;
  };
  /** Een geldige token uitgeven (zoals na een OAuth-koppeling). */
  const tokenGeven = () => { const t = `gho_proef_${randomBytes(8).toString('hex')}`; tokens.add(t); return t; };

  const echteFetch = globalThis.fetch;
  const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json', 'x-ratelimit-remaining': '4999', 'x-ratelimit-reset': '1800000000' } });

  /** Een code uitgeven zoals GitHub dat doet nadat de eigenaar op «Authorize» klikte. */
  const codeVoor = (authUrl: string) => {
    const u = new URL(authUrl);
    const code = `gho_code_${randomBytes(6).toString('hex')}`;
    codes.set(code, { challenge: u.searchParams.get('code_challenge') || '', redirect: u.searchParams.get('redirect_uri') || '', gebruikt: false });
    return code;
  };

  /** Controleert de app-JWT met de publieke sleutel: handtekening, algoritme, uitgever en de grens van 10 minuten. */
  const jwtGeldig = (jwt: string): { ok: boolean; iss: string } => {
    const [kop, inhoud, sig] = String(jwt).split('.');
    if (!kop || !inhoud || !sig) return { ok: false, iss: '' };
    let k: any, i: any;
    try { k = JSON.parse(Buffer.from(kop, 'base64url').toString()); i = JSON.parse(Buffer.from(inhoud, 'base64url').toString()); } catch { return { ok: false, iss: '' }; }
    if (k.alg !== 'RS256') return { ok: false, iss: '' };
    const nu = Math.floor(Date.now() / 1000);
    if (!(i.iat <= nu + 5) || !(i.exp > nu) || i.exp - nu > 600) return { ok: false, iss: String(i.iss || '') };
    const ok = createVerify('RSA-SHA256').update(`${kop}.${inhoud}`).verify(publicKey, Buffer.from(sig, 'base64url'));
    return { ok, iss: String(i.iss || '') };
  };

  globalThis.fetch = (async (input: unknown, init?: RequestInit) => {
    const url = String(input);
    const methode = String(init?.method || 'GET').toUpperCase();
    const koppen = (init?.headers || {}) as Record<string, string>;
    const body = typeof init?.body === 'string' ? init.body : '';
    verzoeken.push({ url, methode, body, auth: String(koppen.Authorization || '') });

    // ---- 1. code of vernieuwingstoken inwisselen -------------------------------------------------
    if (url === 'https://github.com/login/oauth/access_token') {
      const p = new URLSearchParams(body);
      if (p.get('client_id') !== CLIENT_ID || p.get('client_secret') !== CLIENT_SECRET) return json({ error: 'incorrect_client_credentials' }, 200);
      const scope = 'repo,read:org,read:project';
      const extra = opties.expiration
        ? { refresh_token: `ghr_${randomBytes(8).toString('hex')}`, expires_in: 28_800, refresh_token_expires_in: 15_897_600 }
        : {};
      if (p.get('grant_type') === 'refresh_token') {
        if (!verversTokens.has(String(p.get('refresh_token')))) return json({ error: 'bad_refresh_token' }, 200);
        verversTokens.delete(String(p.get('refresh_token')));
        const token = `gho_vers_${randomBytes(8).toString('hex')}`;
        tokens.add(token);
        if (extra.refresh_token) verversTokens.add(extra.refresh_token);
        return json({ access_token: token, token_type: 'bearer', scope, ...extra });
      }
      const rij = codes.get(String(p.get('code')));
      // Een code leeft 10 minuten en kan één keer worden ingewisseld — precies zoals GitHub het doet.
      if (!rij || rij.gebruikt) return json({ error: 'bad_verification_code' }, 200);
      if (rij.redirect !== p.get('redirect_uri')) return json({ error: 'redirect_uri_mismatch' }, 200);
      const verifier = String(p.get('code_verifier') || '');
      if (rij.challenge && createHash('sha256').update(verifier).digest('base64url') !== rij.challenge) return json({ error: 'bad_verification_code' }, 200);
      rij.gebruikt = true;
      const token = `gho_${randomBytes(10).toString('hex')}`;
      tokens.add(token);
      if (extra.refresh_token) verversTokens.add(extra.refresh_token);
      return json({ access_token: token, token_type: 'bearer', scope, ...extra });
    }

    // ---- 2. een token intrekken ------------------------------------------------------------------
    if (methode === 'DELETE' && url === `https://api.github.com/applications/${CLIENT_ID}/token`) {
      const verwacht = `Basic ${Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64')}`;
      if (koppen.Authorization !== verwacht) return json({ message: 'Bad credentials' }, 401);
      let token = '';
      try { token = String(JSON.parse(body).access_token || ''); } catch { /* geen json */ }
      if (!tokens.has(token)) return new Response('', { status: 404 });
      tokens.delete(token);
      // 204 mag geen body hebben: met een lege string gooit undici een TypeError en zou het intrekken stil mislukken.
      return new Response(null, { status: 204 });
    }

    // ---- 3. wie zijn we ------------------------------------------------------------------------
    if (url === 'https://api.github.com/user') {
      const token = String(koppen.Authorization || '').replace(/^Bearer /, '');
      if (!tokens.has(token)) return json({ message: 'Bad credentials' }, 401);
      return json({ login: LOGIN, name: 'Pavlo', avatar_url: 'https://avatars.githubusercontent.com/u/1', html_url: `https://github.com/${LOGIN}`, public_repos: 7, total_private_repos: 3, followers: 5 });
    }

    // ---- 4. GitHub App: installaties en installatietoken -----------------------------------------
    if (url.startsWith('https://api.github.com/app/installations')) {
      const controle = jwtGeldig(String(koppen.Authorization || '').replace(/^Bearer /, ''));
      if (!controle.ok || controle.iss !== APP_ID) return json({ message: 'A JSON web token could not be decoded' }, 401);
      const maken = /\/app\/installations\/(\d+)\/access_tokens$/.exec(new URL(url).pathname);
      if (maken && methode === 'POST') {
        if (!staat.installaties.some((i) => String(i.id) === maken[1])) return json({ message: 'Not Found' }, 404);
        installatieTokens += 1;
        const token = `ghs_${randomBytes(10).toString('hex')}`;
        tokens.add(token);
        return json({
          token, expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
          permissions: { contents: 'read', issues: 'write' }, repository_selection: 'selected',
          repositories: [{ full_name: `${LOGIN}/mijn-ruimte` }, { full_name: `${LOGIN}/notities` }],
        }, 201);
      }
      return json(staat.installaties);
    }
    if (url.startsWith('https://api.github.com/installation/repositories')) {
      const token = String(koppen.Authorization || '').replace(/^Bearer /, '');
      if (!tokens.has(token)) return json({ message: 'Bad credentials' }, 401);
      return json({ total_count: 2, repositories: [{ full_name: `${LOGIN}/mijn-ruimte` }, { full_name: `${LOGIN}/notities` }] });
    }


    // ---- 5. (21.10.2026) Git Data API, pull requests en GitHub Actions-logboeken — STRENG: alleen met een geldige token, en een
    //         logboekadres (ondertekend, van GitHub) weigert elke Authorization-kop: zo is te meten dat de token daar NIET heen gaat.
    const repoPad = /^https:\/\/api\.github\.com\/repos\/([^/]+\/[^/?]+)(\/[^?]*)?(\?.*)?$/.exec(url);
    if (repoPad) {
      const token = String(koppen.Authorization || '').replace(/^Bearer /, '');
      if (!tokens.has(token)) return json({ message: 'Bad credentials' }, 401);
      const r = repos.get(repoPad[1]);
      if (!r) return json({ message: 'Not Found' }, 404);
      const rest = repoPad[2] || '';
      const lijf = (() => { try { return body ? JSON.parse(body) : {}; } catch { return {}; } })();
      if (!rest && methode === 'GET') return json({ full_name: repoPad[1], default_branch: r.standaard });
      const refLees = /^\/git\/ref\/heads\/(.+)$/.exec(rest);
      if (refLees && methode === 'GET') { const sha = r.refs.get(decodeURIComponent(refLees[1])); return sha ? json({ ref: `refs/heads/${refLees[1]}`, object: { sha, type: 'commit' } }) : json({ message: 'Not Found' }, 404); }
      const commitLees = /^\/git\/commits\/([0-9a-f]{40})$/.exec(rest);
      if (commitLees && methode === 'GET') { const c = r.commits.get(commitLees[1]); return c ? json({ sha: commitLees[1], tree: { sha: c.tree } }) : json({ message: 'Not Found' }, 404); }
      if (rest === '/git/blobs' && methode === 'POST') {
        if (typeof lijf.content !== 'string' || !['utf-8', 'base64'].includes(lijf.encoding)) return json({ message: 'Invalid request' }, 422);
        const sha = createHash('sha1').update(`blob ${lijf.content}`).digest('hex');
        r.blobs.set(sha, lijf.encoding === 'base64' ? Buffer.from(lijf.content, 'base64').toString('utf8') : lijf.content);
        return json({ sha }, 201);
      }
      if (rest === '/git/trees' && methode === 'POST') {
        const basis = r.trees.get(String(lijf.base_tree));
        if (!basis || !Array.isArray(lijf.tree)) return json({ message: 'Invalid tree' }, 422);
        const nieuw = new Map(basis);
        for (const e of lijf.tree) {
          if (e.sha === null) { if (!nieuw.has(e.path)) return json({ message: 'path not found' }, 422); nieuw.delete(e.path); continue; }
          if (!r.blobs.has(e.sha) || e.mode !== '100644' || e.type !== 'blob') return json({ message: 'Invalid tree entry' }, 422);
          nieuw.set(e.path, r.blobs.get(e.sha)!);
        }
        const sha = createHash('sha1').update(`tree ${JSON.stringify([...nieuw.entries()].sort())}`).digest('hex');
        r.trees.set(sha, nieuw);
        return json({ sha }, 201);
      }
      if (rest === '/git/commits' && methode === 'POST') {
        if (!r.trees.has(String(lijf.tree)) || !Array.isArray(lijf.parents) || lijf.parents.length !== 1 || !r.commits.has(lijf.parents[0])) return json({ message: 'Invalid commit' }, 422);
        const sha = createHash('sha1').update(`commit ${lijf.tree} ${lijf.parents[0]} ${lijf.message}`).digest('hex');
        r.commits.set(sha, { tree: lijf.tree, parent: lijf.parents[0], message: String(lijf.message) });
        return json({ sha }, 201);
      }
      if (rest === '/git/refs' && methode === 'POST') {
        const naam = String(lijf.ref || '').replace(/^refs\/heads\//, '');
        if (r.refs.has(naam)) return json({ message: 'Reference already exists' }, 422);
        if (!r.commits.has(String(lijf.sha))) return json({ message: 'Object does not exist' }, 422);
        r.refs.set(naam, String(lijf.sha));
        return json({ ref: `refs/heads/${naam}`, object: { sha: lijf.sha } }, 201);
      }
      const refWeg = /^\/git\/refs\/heads\/(.+)$/.exec(rest);
      if (refWeg && methode === 'DELETE') { const naam = decodeURIComponent(refWeg[1]); if (!r.refs.delete(naam)) return json({ message: 'Not Found' }, 404); r.verwijderdeRefs.push(naam); return new Response(null, { status: 204 }); }
      if (rest === '/pulls' && methode === 'POST') {
        if (r.prWeigeren) return json({ message: 'Validation Failed' }, 422);
        if (!r.refs.has(String(lijf.head)) || !r.refs.has(String(lijf.base))) return json({ message: 'Validation Failed' }, 422);
        const number = r.pulls.length + 1;
        r.pulls.push({ number, title: lijf.title, head: lijf.head, base: lijf.base, body: lijf.body, draft: !!lijf.draft });
        return json({ number, html_url: `https://github.com/${repoPad[1]}/pull/${number}`, draft: !!lijf.draft }, 201);
      }
      if (/\/merge$/.test(rest)) { r.samenvoegPogingen++; return json({ message: 'nooit' }, 405); }
      if (rest === '/actions/runs' && methode === 'GET') return json({ total_count: r.runs.length, workflow_runs: r.runs });
      const runLees = /^\/actions\/runs\/(\d+)$/.exec(rest);
      if (runLees) { const run = r.runs.find((x) => String(x.id) === runLees[1]); return run ? json(run) : json({ message: 'Not Found' }, 404); }
      const jobsLees = /^\/actions\/runs\/(\d+)\/jobs$/.exec(rest);
      if (jobsLees) return json({ total_count: (r.jobs.get(Number(jobsLees[1])) || []).length, jobs: r.jobs.get(Number(jobsLees[1])) || [] });
      const jobLog = /^\/actions\/jobs\/(\d+)\/logs$/.exec(rest);
      if (jobLog) {
        if (r.logWeg.has(Number(jobLog[1]))) return new Response(null, { status: 410 });
        return new Response(null, { status: 302, headers: { location: r.logOmleiding ? r.logOmleiding(Number(jobLog[1])) : `https://pipelines.actions.githubusercontent.com/serviceHosts/x/logs/${jobLog[1]}?sig=ondertekend` } });
      }
      const runLog = /^\/actions\/runs\/(\d+)\/logs$/.exec(rest);
      if (runLog) return new Response(null, { status: 302, headers: { location: `https://productionresultssa1.blob.core.windows.net/actions-results/${runLog[1]}.zip?sig=ondertekend` } });
      return json({ message: 'onbekend repo-pad in nep-github', url }, 599);
    }
    const logAdres = /^https:\/\/pipelines\.actions\.githubusercontent\.com\/serviceHosts\/x\/logs\/(\d+)\?sig=ondertekend$/.exec(url);
    if (logAdres) {
      if (koppen.Authorization) return new Response('token hoort hier niet', { status: 403 });
      for (const r of repos.values()) { const t = r.logs.get(Number(logAdres[1])); if (t !== undefined) return new Response(t, { status: 200, headers: { 'content-type': 'text/plain' } }); }
      return new Response('', { status: 404 });
    }
    const zipAdres = /^https:\/\/productionresultssa1\.blob\.core\.windows\.net\/actions-results\/(\d+)\.zip\?sig=ondertekend$/.exec(url);
    if (zipAdres) {
      if (koppen.Authorization) return new Response('token hoort hier niet', { status: 403 });
      for (const r of repos.values()) { const z = r.zips.get(Number(zipAdres[1])); if (z) return new Response(z, { status: 200, headers: { 'content-type': 'application/zip' } }); }
      return new Response('', { status: 404 });
    }
    return json({ message: 'onbekend pad in nep-github', url }, 599);
  }) as typeof fetch;

  return {
    /** Wat de eigenaar in de kluis zou zetten (precies de twee vormen die de kaart uitlegt). */
    oauthKluisWaarde: () => `client_id: ${CLIENT_ID}\nclient_secret: ${CLIENT_SECRET}`,
    appKluisWaarde: () => `app_id: ${APP_ID}\n${pem}`,
    privateKeyPem: () => pem,
    codeVoor,
    verzoeken,
    tokens,
    verversTokens,
    installatieTokenTeller: () => installatieTokens,
    /** De app «de-installeren», om GITHUB_APP_GEEN_INSTALLATIE te kunnen testen. */
    zonderInstallaties: () => { staat.installaties = []; },
    /** (21.10.2026) Repositories (Git Data, PR, Actions) en een geldige token. */
    repoMaken, repo: (naam: string) => repos.get(naam), tokenGeven,
    herstel: () => { globalThis.fetch = echteFetch; },
  };
}
