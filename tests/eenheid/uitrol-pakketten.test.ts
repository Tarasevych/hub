// Blijvende archieven van releases en publicatie op GitHub (audit 18.10.2026, punt 4; migratie 0061, backend/uitrol-github.ts).
//
// Reproduceert eerst het oude probleem en bewijst daarna dat het weg is:
//  - oud: de OK-gebeurtenis had geen archief → een run had nooit een pakket → geen download, geen GitHub-release;
//  - nu: OK/SSH_OK met pakket_pad/sha256 → de run krijgt het archief; download alleen met sterke bevestiging + eenmalige link, met auditregel;
//  - GitHub: echte JSON (SAMENVATTING met aanhalingstekens/nieuwe regels/backslash), target_commitish alleen bij een geldige commit,
//    upload van het archief, 3 pogingen bij 5xx/netwerk, geen herhaling bij 4xx, fouten nooit met de token, zonder token «niet gekoppeld».
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { closePool, getPool } from '../../server/platform/pg';
import { checker } from './hulp/nep-google';

const hex = (n: number) => randomBytes(n).toString('hex');
const iso = (ms: number) => new Date(ms).toISOString();
const TOKEN = 'ghp_GEHEIM_' + hex(12);

export async function main(): Promise<number> {
  const { check, einde } = checker('uitrol-pakketten');
  const basis = mkdtempSync(join(tmpdir(), 'uitrol-pakketten-'));
  const statusDir = join(basis, 'status'); mkdirSync(join(statusDir, 'runs'), { recursive: true });
  const pakDir = join(basis, 'pakketten'); mkdirSync(pakDir);
  const oud = { a: process.env.OPDRACHT_STATUS_DIR, b: process.env.UITROL_PAKKETTEN_DIR };
  Object.assign(process.env, { OPDRACHT_STATUS_DIR: statusDir, UITROL_PAKKETTEN_DIR: pakDir });
  const sys = getPool('systeem');
  const schrijfStappen = (regels: object[]) => writeFileSync(join(statusDir, 'stappen.jsonl'), regels.map((r) => JSON.stringify(r)).join('\n') + '\n');
  const schrijfEvents = (regels: object[]) => writeFileSync(join(statusDir, 'gebeurtenissen.jsonl'), regels.map((r) => JSON.stringify(r)).join('\n') + '\n');
  const EIGENAAR = randomUUID();
  try {
    const kolommen = await sys.query(`SELECT 1 FROM information_schema.columns WHERE table_schema='app' AND table_name='uitrol_runs' AND column_name='pakket_pad'`);
    if (!kolommen.rows[0]) { console.log('OVERGESLAGEN: migratie 0061 niet toegepast'); return einde(); }
    const r = await import('../../backend/uitrol-runs');
    const gh = await import('../../backend/uitrol-github');
    await sys.query("DELETE FROM app.uitrol_runs WHERE id LIKE '2028%' OR id LIKE 'ssh-2028%' OR id LIKE 'ev-2028%'");
    await sys.query('DELETE FROM app.uitrol_github_instellingen');

    const t0 = Date.parse('2028-05-01T10:00:00Z');
    const VERSIE = '20280501-095900', RUN = '20280501T100000Z-aaaaaaaa';
    const st = (stap: string, staat: string, pct: number, ms: number) => ({ run: RUN, tijd: iso(ms), versie: VERSIE, methode: 'passkey', stap, staat, pct, uk: `uk ${stap}`, nl: `nl ${stap}` });
    const ev = (n: number, ms: number, code: string, tag: string, extra: object = {}) => ({ id: `20280501T${String(n).padStart(12, '0')}Z-${hex(4)}`, tijd: iso(ms), bron: 'uitrol', code, niveau: 'info', uk: `uk ${code}`, nl: `nl ${code}`, tag, herkomst: 'passkey', ...extra });
    schrijfStappen([st('ontvangen', 'ok', 5, t0), st('installeren', 'bezig', 42, t0 + 1000), st('installeren', 'ok', 98, t0 + 60_000), st('klaar', 'ok', 100, t0 + 60_500)]);

    // ---- 1. oud gedrag: OK zonder archief → run zonder pakket (precies wat er op live gebeurde) ----
    schrijfEvents([ev(1, t0 + 60_400, 'OK', VERSIE)]);
    await r.runsSynchroniseren(true);
    let rij = (await sys.query('SELECT * FROM app.uitrol_runs WHERE id = $1', [RUN])).rows[0];
    check('oud: OK zonder archief → run zonder pakket_pad (het oude probleem)', rij?.staat === 'klaar' && rij.pakket_pad === '', JSON.stringify(rij && { staat: rij.staat, p: rij.pakket_pad }));
    const lijst0 = await r.runsLijst({ q: VERSIE });
    check('oud: API meldt «archief niet bewaard»', lijst0.runs[0]?.pakket?.bewaard === false);

    // ---- 2. nieuw: OK met archief → gekoppeld ----
    const inhoud = Buffer.concat([Buffer.from('pakket-'), randomBytes(5000)]);
    const pad = join(pakDir, `mijn-ruimte-${VERSIE}.tar.gz`);
    writeFileSync(pad, inhoud);
    const sha = createHash('sha256').update(inhoud).digest('hex');
    schrijfEvents([ev(1, t0 + 60_400, 'OK', VERSIE, { pakket_pad: pad, pakket_sha256: sha, pakket_bytes: inhoud.length })]);
    await r.runsSynchroniseren(true);
    rij = (await sys.query('SELECT * FROM app.uitrol_runs WHERE id = $1', [RUN])).rows[0];
    check('nieuw: run krijgt pakket_pad, sha256 en grootte uit de OK-gebeurtenis', rij?.pakket_pad === pad && rij.pakket_sha256 === sha && Number(rij.pakket_grootte) === inhoud.length, JSON.stringify(rij && { p: rij.pakket_pad, s: rij.pakket_sha256 }));
    const lijst1 = await r.runsLijst({ q: VERSIE });
    check('nieuw: API meldt bewaard + sha256, NOOIT het serverpad', lijst1.runs[0]?.pakket?.bewaard === true && lijst1.runs[0]?.pakket?.sha256 === sha && !JSON.stringify(lijst1).includes(pakDir));

    // pad buiten de archiefmap of met een vreemde naam wordt nooit overgenomen
    const { parseRootGebeurtenissen } = await import('../../backend/server-beheer');
    const raar = parseRootGebeurtenissen(JSON.stringify(ev(2, t0, 'OK', VERSIE, { pakket_pad: '/etc/shadow', pakket_sha256: sha })) + '\n');
    check('parser: willekeurig pad (/etc/shadow) wordt genegeerd', !raar[0]?.pakketPad);
    const raar2 = parseRootGebeurtenissen(JSON.stringify(ev(3, t0, 'OK', VERSIE, { pakket_pad: pad, pakket_sha256: 'xyz' })) + '\n');
    check('parser: ongeldige sha256 wordt genegeerd', raar2[0]?.pakketPad === pad && !raar2[0]?.pakketSha256);

    // SSH_OK met archief
    const SSH_ID = `20280501T${String(9).padStart(12, '0')}Z-${hex(4)}`;
    const padSsh = join(pakDir, 'mijn-ruimte-20280501-120000.tar.gz'); writeFileSync(padSsh, 'ssh');
    const shaSsh = createHash('sha256').update('ssh').digest('hex');
    schrijfEvents([ev(1, t0 + 60_400, 'OK', VERSIE, { pakket_pad: pad, pakket_sha256: sha, pakket_bytes: inhoud.length }),
      { id: SSH_ID, tijd: iso(t0 + 7_200_000), bron: 'uitrol', code: 'SSH_OK', niveau: 'info', uk: 'ssh', nl: 'ssh', tag: '20280501-120500', herkomst: 'ssh', wie: 'pavlo', release: '20280501-120500', pakket: '20280501-120000', pakket_pad: padSsh, pakket_sha256: shaSsh, pakket_bytes: 3 }]);
    await r.runsSynchroniseren(true);
    const sshRij = (await sys.query('SELECT pakket_pad, pakket_sha256 FROM app.uitrol_runs WHERE id = $1', [`ssh-${SSH_ID}`])).rows[0];
    check('SSH-installatie: archief bij de ssh-run', sshRij?.pakket_pad === padSsh && sshRij?.pakket_sha256 === shaSsh, JSON.stringify(sshRij));

    // ---- 3. download-routes: eigenaar + sterke bevestiging + eenmalige link + audit ----
    const users: Record<string, any> = { eig: { id: EIGENAAR, email: 'eig@example.test', role: 'owner' }, ander: { id: randomUUID(), email: 'a@example.test', role: 'user' } };
    let sterk = false;
    const routes = gh.uitrolGithubRoutes({ requireSession: async (event: any) => ({ user: users[event.who], service: 'admin' }) as any, isEigenaar: (u) => u.role === 'owner',
      sterkeStapOp: async () => (sterk ? null : { statusCode: 403, headers: {}, body: JSON.stringify({ error: 'STEP_UP_STRONG_REQUIRED' }) } as any) });
    const call = async (route: string, who: string, body: Record<string, unknown> = {}, params: Record<string, string> = {}) => {
      const res: any = await routes[route][0]({ event: { who, headers: {} }, body, params } as any);
      let data: any = null; try { data = JSON.parse(res.body); } catch { data = null; }
      return { status: res.statusCode as number, data, fout: String(data?.error || ''), res };
    };
    const LINK = 'POST /api/owner/uitrol/pakket/:runId/link', FILE = 'POST /api/owner/uitrol/pakket/:runId';
    let x = await call(LINK, 'ander', {}, { runId: RUN });
    check('download: geen eigenaar → 403 OWNER_REQUIRED', x.status === 403 && x.fout === 'OWNER_REQUIRED');
    x = await call(LINK, 'eig', {}, { runId: RUN });
    check('download: zonder sterke bevestiging (passkey) → 403 STEP_UP_STRONG_REQUIRED', x.status === 403 && x.fout === 'STEP_UP_STRONG_REQUIRED');
    x = await call(FILE, 'eig', { downloadId: 'verzonnen' }, { runId: RUN });
    check('download: bestand zonder geldige link → 403', x.status === 403 && x.fout === 'DOWNLOAD_LINK_ONGELDIG');
    sterk = true;
    x = await call(LINK, 'eig', {}, { runId: RUN });
    check('download: met bevestiging → eenmalige link met naam en sha256', x.status === 200 && typeof x.data?.downloadId === 'string' && x.data.downloadId.length > 20 && x.data.sha256 === sha && x.data.naam === `mijn-ruimte-${VERSIE}.tar.gz`, `${x.status} ${JSON.stringify(x.data)}`);
    const id = x.data.downloadId;
    let f = await call(FILE, 'ander', { downloadId: id }, { runId: RUN });
    check('download: link van de eigenaar werkt niet voor een ander account', f.status === 403);
    x = await call(LINK, 'eig', {}, { runId: RUN }); const id2 = x.data.downloadId;
    f = await call(FILE, 'eig', { downloadId: id2 }, { runId: 'ssh-' + SSH_ID });
    check('download: link geldt alleen voor de eigen run', f.status === 403);
    x = await call(LINK, 'eig', {}, { runId: RUN }); const id3 = x.data.downloadId;
    f = await call(FILE, 'eig', { downloadId: id3 }, { runId: RUN });
    check('download: bestand (filePath) met Content-Disposition en sha256-kop', f.status === 200 && f.res.filePath === pad && /attachment; filename="mijn-ruimte-20280501-095900\.tar\.gz"/.test(f.res.headers['Content-Disposition']) && f.res.headers['X-Pakket-Sha256'] === sha, `${f.status} ${JSON.stringify(f.data)}`);
    if (f.status !== 200) return einde();
    check('download: het bestand op dat pad heeft de bewaarde sha256', createHash('sha256').update(readFileSync(f.res.filePath)).digest('hex') === sha);
    f = await call(FILE, 'eig', { downloadId: id3 }, { runId: RUN });
    check('download: dezelfde link werkt maar één keer', f.status === 403);
    const audit = (await sys.query(`SELECT result, details FROM app.audit WHERE action = 'owner.uitrol.pakket.gedownload' AND actor_id = $1 ORDER BY id`, [EIGENAAR])).rows;
    check('download: staat in het journaal (wie, versie, sha256)', audit.some((a) => a.result === 'success' && a.details?.sha256 === sha), JSON.stringify(audit.map((a) => a.result)));
    const zonder = await call(LINK, 'eig', {}, { runId: '20280501T110000Z-onbekend' });
    check('download: run zonder archief → 404 ARCHIEF_NIET_BEWAARD (+ journaal)', zonder.status === 404 && zonder.fout === 'ARCHIEF_NIET_BEWAARD');
    // pad uit de database dat niet bij de versie past → geweigerd
    await sys.query(`UPDATE app.uitrol_runs SET pakket_pad = $2 WHERE id = $1`, [`ssh-${SSH_ID}`, join(pakDir, `mijn-ruimte-${VERSIE}.tar.gz`)]);
    check('download: pad dat niet bij de versie van de run past → geen archief', (await gh.archiefVanRun(`ssh-${SSH_ID}`)) === null);
    await sys.query(`UPDATE app.uitrol_runs SET pakket_pad = $2 WHERE id = $1`, [`ssh-${SSH_ID}`, padSsh]);

    // ---- 4. GitHub ----
    const body = (b: unknown) => (typeof b === 'string' ? JSON.parse(b) : null);
    check('releaseBody: SAMENVATTING met " \\ en nieuwe regels blijft geldige JSON', (() => {
      const b = gh.releaseBody({ versie: VERSIE, wijzigingen: 'Regel "een"\nback\\slash\ttab', bron_commit: 'unknown', pakket_sha256: sha });
      const terug = JSON.parse(JSON.stringify(b));
      return terug.body.includes('Regel "een"\nback\\slash') && terug.tag_name === `uitrol-${VERSIE}` && !('target_commitish' in terug);
    })());
    const commit = 'a'.repeat(40);
    check('releaseBody: target_commitish alleen bij een geldige 40-hex commit', gh.releaseBody({ versie: VERSIE, wijzigingen: 'x', bron_commit: commit, pakket_sha256: sha }).target_commitish === commit
      && !('target_commitish' in gh.releaseBody({ versie: VERSIE, wijzigingen: 'x', bron_commit: 'abc1234', pakket_sha256: sha })));

    await sys.query(`UPDATE app.uitrol_runs SET wijzigingen = $2, bron_commit = $3 WHERE id = $1`, [RUN, 'Wat "nieuw" is\nregel 2', commit]);
    // zonder token / repo
    gh.setUitrolGithubDeps({ token: async () => null, fetch: (async () => { throw new Error('mag niet'); }) as any, slaap: async () => undefined });
    let p = await gh.publiceer(RUN, users.eig, EIGENAAR);
    check('github: zonder repo → overgeslagen GEEN_REPO (geen verzoek)', p.uitkomst === 'overgeslagen' && p.code === 'GEEN_REPO');
    sterk = true;
    const opslaan = await call('POST /api/owner/uitrol/github/instellingen', 'eig', { repo: 'Tarasevych/hub', automatisch: false });
    check('github: instellingen opslaan (repo, automatisch)', opslaan.status === 200 && opslaan.data?.instellingen?.repo === 'Tarasevych/hub');
    const slecht = await call('POST /api/owner/uitrol/github/instellingen', 'eig', { repo: 'x; rm -rf /' });
    check('github: ongeldige repository geweigerd', slecht.status === 400 && slecht.fout === 'REPO_ONGELDIG');
    p = await gh.publiceer(RUN, users.eig, EIGENAAR);
    check('github: zonder token → overgeslagen GITHUB_NIET_GEKOPPELD', p.uitkomst === 'overgeslagen' && p.code === 'GITHUB_NIET_GEKOPPELD');
    const stand0 = await call('POST /api/owner/uitrol/github/stand', 'eig');
    check('github: stand zonder token → gekoppeld=false, geen fout', stand0.status === 200 && stand0.data.gekoppeld === false && stand0.data.klaar === false && stand0.data.archief.aantal >= 1);

    // met token: release + asset
    const verzoeken: Array<{ url: string; method: string; headers: Record<string, string>; body: unknown }> = [];
    let assetBytes = 0;
    const nep = (gedrag: (url: string, init: any) => { status: number; data?: unknown } | 'netwerk') => (async (url: string, init: any) => {
      let b: unknown = init?.body;
      if (b && typeof b === 'object' && typeof (b as ReadableStream).getReader === 'function') {
        const rd = (b as ReadableStream<Uint8Array>).getReader(); let n = 0; for (;;) { const { done, value } = await rd.read(); if (done) break; n += value.length; } assetBytes = n; b = `<stream ${n}>`;
      }
      verzoeken.push({ url, method: init?.method || 'GET', headers: init?.headers || {}, body: b });
      const g = gedrag(url, init);
      if (g === 'netwerk') throw new TypeError('fetch failed');
      return new Response(JSON.stringify(g.data ?? {}), { status: g.status, headers: { 'Content-Type': 'application/json' } });
    }) as any;
    gh.setUitrolGithubDeps({ token: async () => ({ token: TOKEN, doel: 'github-uitrol', naam: 'GH_RELEASES' }), slaap: async () => undefined,
      fetch: nep((url, init) => {
        if (url.endsWith(`/releases/tags/uitrol-${VERSIE}`)) return { status: 404 };
        if (url.endsWith('/repos/Tarasevych/hub/releases') && init.method === 'POST') return { status: 201, data: { id: 77, html_url: 'https://github.com/Tarasevych/hub/releases/tag/uitrol-' + VERSIE, assets: [] } };
        if (url.startsWith('https://uploads.github.com/repos/Tarasevych/hub/releases/77/assets')) return { status: 201, data: { id: 1 } };
        return { status: 500 };
      }) });
    p = await gh.publiceer(RUN, users.eig, EIGENAAR);
    const maak = verzoeken.find((v) => v.method === 'POST' && v.url.endsWith('/releases'));
    const mb = body(maak?.body);
    check('github: release aangemaakt met echte JSON (aanhalingstekens + nieuwe regel intact)', p.uitkomst === 'ok' && mb?.body?.includes('Wat "nieuw" is\nregel 2') && mb?.tag_name === `uitrol-${VERSIE}`, JSON.stringify(p));
    check('github: target_commitish = BRON-COMMIT', mb?.target_commitish === commit);
    check('github: sha256 in de beschrijving', String(mb?.body || '').includes(sha));
    const up = verzoeken.find((v) => v.url.startsWith('https://uploads.github.com'));
    check('github: archief geüpload als asset (naam, gzip, volledige grootte)', Boolean(up) && up!.url.includes(`name=mijn-ruimte-${VERSIE}.tar.gz`) && up!.headers['Content-Type'] === 'application/gzip' && assetBytes === inhoud.length, `${up?.url} ${assetBytes}`);
    check('github: token alleen in de Authorization-kop', verzoeken.every((v) => v.headers.Authorization === `Bearer ${TOKEN}`) && !verzoeken.some((v) => String(v.url).includes(TOKEN) || String(v.body).includes(TOKEN)));
    rij = (await sys.query('SELECT github_release_url, github_fout FROM app.uitrol_runs WHERE id = $1', [RUN])).rows[0];
    check('github: release-URL bij de run, geen fout', rij?.github_release_url?.startsWith('https://github.com/Tarasevych/hub/releases/') && rij.github_fout === '');

    // idempotent: bestaat al, asset al aanwezig → geen nieuwe release, geen upload
    verzoeken.length = 0;
    gh.setUitrolGithubDeps({ token: async () => ({ token: TOKEN, doel: 'github-uitrol', naam: 'GH' }), slaap: async () => undefined,
      fetch: nep((url) => url.endsWith(`/releases/tags/uitrol-${VERSIE}`) ? { status: 200, data: { id: 77, html_url: 'https://github.com/Tarasevych/hub/releases/tag/x', assets: [{ name: `mijn-ruimte-${VERSIE}.tar.gz` }] } } : { status: 500 }) });
    p = await gh.publiceer(RUN, users.eig, EIGENAAR);
    check('github: tweede keer idempotent (geen POST, geen upload)', p.uitkomst === 'ok' && verzoeken.length === 1 && verzoeken[0].method === 'GET');

    // 5xx → 3 pogingen; 4xx → één
    verzoeken.length = 0;
    gh.setUitrolGithubDeps({ token: async () => ({ token: TOKEN, doel: 'github', naam: 'GH' }), slaap: async () => undefined, fetch: nep(() => ({ status: 502, data: { message: `bad ${TOKEN}` } })) });
    p = await gh.publiceer(RUN, users.eig, EIGENAAR);
    check('github: 502 → drie pogingen, dan fout GITHUB_HTTP_502', p.uitkomst === 'fout' && p.code === 'GITHUB_HTTP_502' && verzoeken.length === 3, `${p.code} ${verzoeken.length}`);
    verzoeken.length = 0;
    gh.setUitrolGithubDeps({ token: async () => ({ token: TOKEN, doel: 'github', naam: 'GH' }), slaap: async () => undefined, fetch: nep(() => 'netwerk') });
    p = await gh.publiceer(RUN, users.eig, EIGENAAR);
    check('github: netwerkfout → drie pogingen, GITHUB_NETWERK', p.code === 'GITHUB_NETWERK' && verzoeken.length === 3);
    verzoeken.length = 0;
    gh.setUitrolGithubDeps({ token: async () => ({ token: TOKEN, doel: 'github', naam: 'GH' }), slaap: async () => undefined, fetch: nep(() => ({ status: 401, data: { message: 'Bad credentials' } })) });
    p = await gh.publiceer(RUN, users.eig, EIGENAAR);
    check('github: 401 → één poging (geen herhaling), GITHUB_HTTP_401', p.code === 'GITHUB_HTTP_401' && verzoeken.length === 1);
    const log = (await sys.query(`SELECT uitkomst, fout FROM app.uitrol_github_publicaties WHERE run_id = $1 ORDER BY id`, [RUN])).rows;
    const auditGh = (await sys.query(`SELECT details::text AS d FROM app.audit WHERE action LIKE 'owner.uitrol.github.%' ORDER BY id DESC LIMIT 20`)).rows;
    check('github: publicatielogboek met ok en fouten', log.some((l) => l.uitkomst === 'ok') && log.some((l) => l.fout === 'GITHUB_HTTP_401') && log.some((l) => l.fout === 'GITHUB_HTTP_502'));
    check('github: token NERGENS in logboek, run of journaal', !JSON.stringify(log).includes(TOKEN) && !auditGh.some((a) => a.d.includes(TOKEN))
      && !JSON.stringify((await sys.query('SELECT * FROM app.uitrol_runs WHERE id = $1', [RUN])).rows[0]).includes(TOKEN));
    const stand = await call('POST /api/owner/uitrol/github/stand', 'eig');
    check('github: stand-antwoord bevat nooit de token', stand.status === 200 && !JSON.stringify(stand.data).includes(TOKEN));

    // automatisch: nieuw archief gekoppeld → publicatie in de wachtrij
    verzoeken.length = 0;
    await call('POST /api/owner/uitrol/github/instellingen', 'eig', { repo: 'Tarasevych/hub', automatisch: true });
    gh.setUitrolGithubDeps({ token: async () => ({ token: TOKEN, doel: 'github-uitrol', naam: 'GH' }), slaap: async () => undefined,
      fetch: nep((url, init) => url.includes('/releases/tags/') ? { status: 404 } : url.endsWith('/releases') && init.method === 'POST' ? { status: 201, data: { id: 9, html_url: 'https://github.com/Tarasevych/hub/releases/tag/a', assets: [] } } : { status: 201, data: {} }) });
    await sys.query(`UPDATE app.uitrol_runs SET pakket_pad = '', github_release_url = '' WHERE id = $1`, [`ssh-${SSH_ID}`]);
    await r.runsSynchroniseren(true);
    for (let i = 0; i < 40 && !(await sys.query('SELECT github_release_url FROM app.uitrol_runs WHERE id = $1', [`ssh-${SSH_ID}`])).rows[0]?.github_release_url; i++) await new Promise((res) => setTimeout(res, 50));
    const autoRij = (await sys.query('SELECT github_release_url FROM app.uitrol_runs WHERE id = $1', [`ssh-${SSH_ID}`])).rows[0];
    check('github: automatisch gepubliceerd zodra het archief aan de run hangt', String(autoRij?.github_release_url || '').startsWith('https://github.com/'), JSON.stringify(autoRij));

    // ---- 5. opruimen ----
    sterk = false;
    let o = await call('POST /api/owner/uitrol/pakketten/opruimen', 'eig', { bewaar: 3 });
    check('opruimen: zonder bevestiging (passkey) geweigerd', o.status === 403);
    sterk = true;
    o = await call('POST /api/owner/uitrol/pakketten/opruimen', 'eig', { bewaar: 1 });
    check('opruimen: minder dan 3 bewaren geweigerd', o.status === 400 && o.fout === 'BEWAAR_ONGELDIG');
    for (const v of ['20280101-000001', '20280101-000002', '20280101-000003', '20280101-000004']) writeFileSync(join(pakDir, `mijn-ruimte-${v}.tar.gz`), v);
    writeFileSync(join(pakDir, 'niet-van-ons.txt'), 'x');
    o = await call('POST /api/owner/uitrol/pakketten/opruimen', 'eig', { bewaar: 3 });
    check('opruimen: alleen de oudste weg, de 3 nieuwste blijven, vreemde bestanden onaangeroerd', o.status === 200 && o.data.aantal === 3 && existsSync(pad) && existsSync(padSsh) && existsSync(join(pakDir, 'niet-van-ons.txt')) && !existsSync(join(pakDir, 'mijn-ruimte-20280101-000001.tar.gz')), JSON.stringify(o.data));
  } finally {
    const gh = await import('../../backend/uitrol-github'); gh.setUitrolGithubDeps(null);
    await sys.query("DELETE FROM app.uitrol_runs WHERE id LIKE '2028%' OR id LIKE 'ssh-2028%' OR id LIKE 'ev-2028%'").catch(() => undefined);
    await sys.query('DELETE FROM app.uitrol_github_instellingen WHERE eigenaar_id = $1', [EIGENAAR]).catch(() => undefined);
    if (oud.a === undefined) delete process.env.OPDRACHT_STATUS_DIR; else process.env.OPDRACHT_STATUS_DIR = oud.a;
    if (oud.b === undefined) delete process.env.UITROL_PAKKETTEN_DIR; else process.env.UITROL_PAKKETTEN_DIR = oud.b;
    rmSync(basis, { recursive: true, force: true });
    await closePool();
  }
  return einde();
}
