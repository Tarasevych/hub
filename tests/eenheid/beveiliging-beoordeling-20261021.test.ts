// ONAFHANKELIJKE BEVEILIGINGSREVIEW van de wijzigingen van 21.10.2026 (bovenop 6aabff9). Elke «FOUT»-check hieronder is een AANVAL
// die op de code van vóór deze review slaagde (dus de check faalde) en nu wordt tegengehouden. Waar een check een HYPOTHESE van
// de opdracht weerlegt (geen lek), staat er «(geen lek)» bij: die slaagt op beide versies en houdt het zo.
//
//   1. SVG-ontsmetting (shared/merk-eigen.ts): XML-entiteiten en CSS-ontsnappingen omzeilden de controles op url()/@import, en
//      image-set() laadt zonder url();
//   2. eigen logo's (backend/merk-eigen.ts): «zetten» schreef onbeperkt nieuwe sleutels (lezen toont er hoogstens 64);
//   3. de serverdeur (deploy/mcp/server.mjs): «/x/..//oauth2/…» werd doorgestuurd naar host «oauth2» (SSRF), en koppen die de
//      klant nooit naar de app mag sturen (x-mijn-ruimte-intern, hop-by-hop) gingen mee;
//   4. connector v2 erfenis (backend/connector-v2-erfenis.ts): een app die zich bij de registratie «Claude» noemt en alleen een
//      PRIVÉ-toestemming kreeg, erfde op /claude de BEHEERkant van de echte Claude;
//   5. lokale concepten (src/mail-concept-lokaal.ts): bleven na afmelden in platte tekst op het apparaat staan;
//   6. Gmail in de technische ruimte (backend/ruimte-cloud-agenda.ts → ladeOf): een technisch tabblad met post op «власні» zag de
//      PERSOONLIJKE Gmail en kon haar loskoppelen (nieuwe route …/google/accounts/:id/disconnect) — plus IDOR en oorsprong (geen lek);
//   7. sleutelkluis (backend/index.ts): «uit dit account in de hele browser» en «alle accounts afmelden» lieten de DEK in het geheugen.
// Alles lokaal: Google en de app achter de deur zijn nagebootst; er gaat niets naar buiten.
import http from 'node:http';
import { spawn } from 'node:child_process';
import { mkdtemp, mkdir, readdir, rm, writeFile } from 'node:fs/promises';
import { writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { getPool } from '../../server/platform/pg';
import { checker, nepGoogle } from './hulp/nep-google';
import { googleStartLichaam } from '../../src/mail/mail-koppel-model';

const MAIL_SCOPES = ['https://www.googleapis.com/auth/gmail.readonly', 'https://www.googleapis.com/auth/gmail.modify', 'https://www.googleapis.com/auth/gmail.send', 'https://www.googleapis.com/auth/gmail.labels'];
const slaap = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Nagebootste Web Storage (met key/length, zoals de browser). */
function nepOpslag() {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => (m.has(k) ? m.get(k)! : null), setItem: (k: string, v: string) => { m.set(k, String(v)); }, removeItem: (k: string) => { m.delete(k); },
    clear: () => m.clear(), key: (i: number) => [...m.keys()][i] ?? null, get length() { return m.size; }, _m: m,
  };
}

/** De deur als apart proces met een NEP-APP erachter die elk doorgestuurd verzoek vastlegt (zelfde opzet als connector-beide-kanten). */
async function metDeur(run: (deur: number, gezien: Array<{ url: string; headers: http.IncomingHttpHeaders }>) => Promise<void>) {
  const d = await mkdtemp(join(tmpdir(), 'mr-br-deur-'));
  const site = join(d, 'site'); await mkdir(site, { recursive: true }); await writeFile(join(site, 'UITROL-VERSIE'), '20261021-000000\n');
  writeFileSync(join(d, 'rechten.json'), JSON.stringify({ read: true, uitrol: false }));
  writeFileSync(join(d, 'mcp.token'), `${'b'.repeat(40)}\n`);
  const gezien: Array<{ url: string; headers: http.IncomingHttpHeaders }> = [];
  const app = http.createServer((req, res) => {
    req.on('data', () => undefined);
    req.on('end', () => { gezien.push({ url: String(req.url), headers: req.headers }); res.writeHead(418, { 'content-type': 'application/json' }); res.end('{"nep":true}'); });
  });
  await new Promise<void>((r) => app.listen(0, '127.0.0.1', () => r()));
  const appPoort = (app.address() as { port: number }).port;
  const poort = 20000 + Math.floor(Math.random() * 20000);
  const proc = spawn(process.execPath, ['deploy/mcp/server.mjs'], {
    env: { ...process.env, MCP_PORT: String(poort), MCP_ROOT: site, MCP_TOKEN_FILE: join(d, 'mcp.token'), MCP_RECHTEN_FILE: join(d, 'rechten.json'), MCP_INTREKKEN_FILE: join(d, 'intrekken'),
      MCP_STATE_FILE: join(d, 'state', 'sessions.json'), MCP_UITROL_INBOX: join(d, 'inbox'), MCP_UITROL_STATUS: join(d, 'status.json'), MCP_RELEASES_DIR: d, MCP_HEALTH_URL: 'http://127.0.0.1:1/x',
      MCP_ISSUER: 'https://mcp.tarasevych.com', MCP_APP_URL: `http://127.0.0.1:${appPoort}`, MCP_AGENTPADEN: 'app' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let log = ''; proc.stdout.on('data', (b) => { log += b; }); proc.stderr.on('data', (b) => { log += b; });
  try {
    for (let i = 0; i < 60 && !log.includes('mijn-ruimte-mcp'); i++) await slaap(100);
    await run(poort, gezien);
  } finally {
    proc.kill('SIGTERM');
    await new Promise((r) => app.close(() => r(undefined)));
    await rm(d, { recursive: true, force: true }).catch(() => undefined);
  }
}
/** Rauw verzoek: het pad gaat LETTERLIJK de lijn op (geen normalisatie door de client). Tijdslimiet = «niet doorgestuurd». */
function rauw(poort: number, pad: string, koppen: Record<string, string>): Promise<number> {
  return new Promise((ok) => {
    const r = http.request({ host: '127.0.0.1', port: poort, method: 'POST', path: pad, headers: { host: 'mcp.tarasevych.com', 'content-type': 'application/x-www-form-urlencoded', ...koppen }, timeout: 8000 }, (res) => { res.resume(); res.on('end', () => ok(res.statusCode || 0)); });
    r.on('timeout', () => { r.destroy(); ok(-1); });
    r.on('error', () => ok(-2));
    r.end('grant_type=x');
  });
}

export async function main(): Promise<number> {
  const { check, einde } = checker('beveiliging-beoordeling-20261021');
  const T = `${Date.now()}-${randomBytes(2).toString('hex')}`;
  const pool = getPool('systeem');
  const omgevingVoor = Object.fromEntries(['GOOGLE_OAUTH_GRANT_ENCRYPTION_KEY_V1', 'MERK_EIGEN_MAP', 'OWNER_EMAIL', 'GOOGLE_OAUTH_CLIENT_ID', 'GOOGLE_OAUTH_CLIENT_SECRET'].map((n) => [n, process.env[n]]));
  const omgevingTerug = () => { for (const [n, w] of Object.entries(omgevingVoor)) { if (w === undefined) delete process.env[n]; else process.env[n] = w; } };

  // ================================================================ 1. SVG-ontsmetting: lezen zoals de browser leest
  const { ontsmetSvg } = await import('../../shared/merk-eigen');
  const kop = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">';
  const reden = (svg: string) => { const u = ontsmetSvg(svg); return u.ok ? 'OK' : u.reden; };
  const aanvallen: Array<[string, string]> = [
    ['XML-entiteit in een presentatie-attribuut: fill="&#117;rl(https://…)"', `${kop}<path d="M0 0" fill="&#117;rl(https://x.test/f#a)"/></svg>`],
    ['hex-entiteit in een style-attribuut: fill:&#x75;rl(https://…)', `${kop}<path d="M0 0" style="fill:&#x75;rl(https://x.test/f)"/></svg>`],
    ['CSS-ontsnapping in <style>: u\\72l(https://…)', `${kop}<style>.a{fill:u\\72l(https://x.test/f)}</style><path class="a" d="M0 0"/></svg>`],
    ['@import verstopt als &#64;import in <style> (XML lost de entiteit op)', `${kop}<style>&#64;import "https://x.test/a.css";</style></svg>`],
    ['@import verstopt als @\\69mport (CSS-ontsnapping)', `${kop}<style>@\\69mport "https://x.test/a.css";</style></svg>`],
    ['image-set() in <style> laadt zonder url()', `${kop}<style>.a{background:image-set("https://x.test/a.png" 1x)}</style></svg>`],
    ['image-set() in een style-attribuut', `${kop}<path d="M0 0" style="background:image-set('https://x.test/a.png' 1x)"/></svg>`],
    ['url() met entiteit in <style>', `${kop}<style>.a{fill:&#117;rl(https://x.test/f)}</style></svg>`],
    ['CSS-ontsnapping in een presentatie-attribuut: filter="\\75 rl(…)"', `${kop}<path d="M0 0" filter="\\75 rl(https://x.test/f#a)"/></svg>`],
  ];
  for (const [naam, svg] of aanvallen) { const r = reden(svg); check(`SVG: ${naam} → GEWEIGERD`, r !== 'OK', r); }
  // De vectoren uit de opdracht die de ontsmetting AL tegenhield (geen lek, blijft zo): script/handlers/javascript:/data:/SMIL/CDATA/
  // entiteiten/naamruimten/hoofdletters/unicode in de tagnaam. En een editor-naamruimte met <script> erin verdwijnt als TAG.
  const alGeweigerd: Array<[string, string]> = [
    ['<svg onload=…> zonder aanhalingstekens', '<svg onload=alert(1) viewBox="0 0 1 1"></svg>'],
    ['<svg onload="…">', '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1" onload="alert(1)"></svg>'],
    ['ONLOAD in hoofdletters op een kindelement', `${kop}<g ONLOAD="alert(1)"/></svg>`],
    ['genaamruimd handler-attribuut ev:onclick', `${kop}<g ev:onclick="alert(1)"/></svg>`],
    ['xlink:href="javascript:…"', `${kop}<use xlink:href="javascript:alert(1)"/></svg>`],
    ['java&#115;cript: via entiteit in xlink:href', `${kop}<use xlink:href="java&#115;cript:alert(1)"/></svg>`],
    ['<use href="data:…">', `${kop}<use href="data:image/svg+xml;base64,PHN2Zz48L3N2Zz4="/></svg>`],
    ['SMIL <set attributeName="href">', `${kop}<set attributeName="href" to="javascript:alert(1)"/></svg>`],
    ['SMIL <animate>', `${kop}<animate attributeName="x" values="0;1"/></svg>`],
    ['<![CDATA[ in <style>', `${kop}<style><![CDATA[@import url(https://x.test/a.css);]]></style></svg>`],
    ['<!ENTITY> (billion laughs / externe entiteit)', '<!DOCTYPE svg [<!ENTITY a SYSTEM "file:///etc/passwd">]><svg viewBox="0 0 1 1">&a;</svg>'],
    ['<svg:script> (prefix van de SVG-naamruimte)', `${kop}<svg:script>alert(1)</svg:script></svg>`],
    ['<SCRIPT> in hoofdletters', `${kop}<SCRIPT>alert(1)</SCRIPT></svg>`],
    ['unicode in de tagnaam (<scrİpt>)', `${kop}<scrİpt>alert(1)</scrİpt></svg>`],
    ['<foreignObject> met HTML', `${kop}<foreignObject><body xmlns="http://www.w3.org/1999/xhtml"><img src=x onerror=alert(1)></body></foreignObject></svg>`],
    ['<?xml-stylesheet?>', '<?xml-stylesheet href="https://x.test/a.css"?><svg viewBox="0 0 1 1"/>'],
  ];
  const doorgelaten = alGeweigerd.filter(([, svg]) => reden(svg) === 'OK').map(([n]) => n);
  check(`(geen lek) SVG: ${alGeweigerd.length} vectoren uit de opdracht (script, handlers, javascript:, data:, SMIL, CDATA, ENTITY, naamruimte, hoofdletters, unicode) → geweigerd`, doorgelaten.length === 0, doorgelaten.join(' | '));
  const editor = ontsmetSvg(`${kop}<x:script>alert(1)</x:script><path d="M0 0"/></svg>`);
  check('(geen lek) SVG: <x:script> (editor-naamruimte) verdwijnt als tag; er blijft geen <script in de uitvoer', !editor.ok || !/<[a-z:]*script/i.test(editor.inhoud.toString('utf8')));
  const goed: Array<[string, string]> = [
    ['gradient + use #id + style met url(#g) en url(\'#g\')', `${kop}<defs><linearGradient id="g"><stop offset="0" stop-color="#f00"/></linearGradient><path id="p" d="M0 0h24v24H0z"/></defs><style>.a{fill:url(#g)}.b{stroke:url('#g')}</style><use href="#p" class="a"/></svg>`],
    ['tekst met &amp; en een font-naam met CSS-ontsnapping (Illustrator)', `${kop}<style>.t{font-family:"\\5FAE\\8F6F"}</style><text class="t" x="1" y="10">A &amp; B</text></svg>`],
  ];
  for (const [naam, svg] of goed) { const r = reden(svg); check(`SVG (geen valse weigering): ${naam} → aanvaard`, r === 'OK', r); }

  // ================================================================ 2. eigen logo's: bovengrens bij «zetten»
  const kaart = await mkdtemp(join(tmpdir(), 'mr-br-merk-'));
  process.env.MERK_EIGEN_MAP = kaart;
  try {
    const me = await import('../../backend/merk-eigen');
    const svg = Buffer.from(`${kop}<path d="M0 0h1v1z"/></svg>`);
    for (let i = 0; i < 64; i++) await me.merkEigenZetten(`m${i}`, 'svg', svg);
    const te = await me.merkEigenZetten('m64', 'svg', svg);
    const naTe = (await readdir(kaart)).filter((n) => /\.(svg|png)$/.test(n)).length;
    check('eigen logo\'s: de 65e NIEUWE sleutel → TE_VEEL, er komt geen 65e bestand bij (lezen toont er toch hoogstens 64)', !te.ok && (te as { reden: string }).reden === 'TE_VEEL' && naTe === 64, `${JSON.stringify(te).slice(0, 60)} bestanden=${naTe}`);
    const vervang = await me.merkEigenZetten('m3', 'svg', Buffer.from(`${kop}<path d="M0 0h2v2z"/></svg>`));
    check('eigen logo\'s: een BESTAANDE sleutel vervangen kan ook bij 64 (geen valse weigering)', vervang.ok === true);
    me.merkEigenCacheWeg();
    const lijst = await me.merkEigenLezen();
    check('eigen logo\'s: wat de beheerder «bewaard» kreeg, staat ook echt in de lijst (64, niets stil «TE_VEEL»)', lijst.rijen.length === 64 && !lijst.geweigerd.some((g) => g.reden === 'TE_VEEL'), `${lijst.rijen.length} ${lijst.geweigerd.map((g) => g.reden).join(',')}`);
  } finally { await rm(kaart, { recursive: true, force: true }); omgevingTerug(); }

  // ================================================================ 3. de serverdeur: geen hostwissel, geen interne koppen
  await metDeur(async (deur, gezien) => {
    const status = await rauw(deur, '/x/..//oauth2/token', {
      'x-mijn-ruimte-intern': 'geraden-sleutel', te: 'trailers', 'proxy-authorization': 'Basic Zm9vOmJhcg==', 'cf-connecting-ip': '198.51.100.7',
    });
    const v = gezien.find((g) => g.url.includes('oauth2'));
    check('deur: «/x/..//oauth2/token» gaat naar DE APP (niet naar host «oauth2»: SSRF) met één schuine streep vooraan',
      status === 418 && !!v && v.url === '/oauth2/token' && v.headers.host === 'mcp.tarasevych.com', `status ${status}, app zag: ${gezien.map((g) => g.url).join(' | ') || 'NIETS'}`);
    check('deur: de interne sleutelkop, TE en Proxy-Authorization van de klant komen NIET bij de app; cf-connecting-ip wel',
      !!v && v.headers['x-mijn-ruimte-intern'] === undefined && v.headers.te === undefined && v.headers['proxy-authorization'] === undefined && v.headers['cf-connecting-ip'] === '198.51.100.7',
      v ? JSON.stringify({ intern: v.headers['x-mijn-ruimte-intern'], te: v.headers.te, pa: v.headers['proxy-authorization'] }) : 'geen verzoek bij de app');
    const voor = gezien.length;
    const s2 = await rauw(deur, '/.//mcp', {});
    check('deur: ook «/.//mcp» blijft bij de app («/mcp»)', s2 === 418 && gezien.length === voor + 1 && gezien[gezien.length - 1].url === '/mcp', `status ${s2}, ${gezien.slice(voor).map((g) => g.url).join(',') || 'NIETS'}`);
    const s3 = await rauw(deur, '/oauth2/token', {});
    check('deur (geen valse weigering): het gewone «/oauth2/token» gaat nog steeds door', s3 === 418 && gezien[gezien.length - 1].url === '/oauth2/token', String(s3));
  });

  // ================================================================ 4. connector v2: erfenis per REGISTRATIE, niet per gekozen naam
  const opruimClients: string[] = [];
  const brUser = `br-${randomUUID()}`;
  try {
    const echt = `br-echt-${randomBytes(6).toString('hex')}`, vals = `br-vals-${randomBytes(6).toString('hex')}`;
    opruimClients.push(echt, vals);
    await pool.query(`INSERT INTO app.mcp_oauth_clients (client_id, client_name, redirect_uris) VALUES ($1,'Claude',ARRAY['https://claude.ai/api/mcp/auth_callback']), ($2,'Evil (Claude)',ARRAY['https://kwaad.example/cb'])`, [echt, vals]);
    const token = async (client: string, naam: string, ruimte: 'prive' | 'technisch', scopes: string[]) => {
      const r = await pool.query(`INSERT INTO app.mcp_oauth_tokens (user_id, client_id, client_name, scope, access_hash, refresh_hash, access_expires_at, refresh_expires_at, ruimte)
        VALUES ($1,$2,$3,'mcp',$4,$5, now() + interval '1 hour', now() + interval '14 days', $6) RETURNING id::text AS id`, [brUser, client, naam, randomBytes(16).toString('hex'), randomBytes(16).toString('hex'), ruimte]);
      const id = String(r.rows[0].id);
      await pool.query(`INSERT INTO app.ai_toegang (user_id, soort, onderwerp_id, scopes) VALUES ($1,'mcp-koppeling',$2,$3)`, [brUser, id, scopes]);
      return id;
    };
    const tEcht = await token(echt, 'Claude', 'technisch', ['devices.read', 'site.read']);
    const tVals = await token(vals, 'Evil (Claude)', 'prive', ['devices.read', 'board.read']);
    const { rechtenVoorOudToken } = await import('../../backend/connector-v2-erfenis');
    const r = await rechtenVoorOudToken(brUser, 'Evil (Claude)', 'claude', tVals);
    const beheer = (r?.sleutels ?? []).filter((k) => k.endsWith(':beheer'));
    check('connector: een ANDERE registratie die zich «Evil (Claude)» noemt (alleen PRIVÉ toegestaan) erft op /claude GEEN beheerkant van de echte Claude',
      !!r && !r.kanten.includes('beheer') && beheer.length === 0 && r.kanten.join() === 'gebruiker', `${JSON.stringify(r?.kanten)} beheer: ${beheer.slice(0, 5).join(',')}${beheer.length > 5 ? ` (+${beheer.length - 5})` : ''}`);
    const r2 = await rechtenVoorOudToken(brUser, 'Claude', 'claude', tEcht);
    check('connector (geen valse weigering): het technische token van de echte registratie houdt zijn beheerkant', !!r2 && r2.kanten.includes('beheer') && r2.sleutels.includes('get_live_release:beheer'), JSON.stringify(r2?.kanten));
    const tEcht2 = await token(echt, 'Claude', 'prive', ['devices.read']);
    const r3 = await rechtenVoorOudToken(brUser, 'Claude', 'claude', tEcht2);
    const r2b = await rechtenVoorOudToken(brUser, 'Claude', 'claude', tEcht);
    // Gescheiden ruimtes (besluit eigenaar 1.11.2026): één token = één ruimte; tot dan erfde een privétoken de beheerkant van een
    // technische grant van dezelfde registratie, met beheersleutels afgeleid uit zijn PRIVÉscopes (devices.read → machine_list:beheer).
    check('connector (gescheiden ruimtes): een PRIVÉ token van dezelfde registratie als een technische grant krijgt alleen de gebruikerskant',
      r3?.kanten.join() === 'gebruiker' && !(r3?.sleutels ?? []).some((k) => k.endsWith(':beheer')) && (r3?.sleutels ?? []).includes('machine_list:gebruiker'), JSON.stringify(r3?.kanten));
    check('connector (gescheiden ruimtes): het TECHNISCHE token houdt alleen zijn beheerkant, ook naast een privégrant van dezelfde registratie',
      r2b?.kanten.join() === 'beheer' && (r2b?.sleutels ?? []).includes('machine_list:beheer') && !(r2b?.sleutels ?? []).some((k) => k.endsWith(':gebruiker')), JSON.stringify(r2b?.kanten));
  } finally {
    await pool.query(`DELETE FROM app.ai_toegang WHERE user_id = $1`, [brUser]).catch(() => undefined);
    await pool.query(`DELETE FROM app.mcp_oauth_clients WHERE client_id = ANY($1)`, [opruimClients]).catch(() => undefined);
  }

  // ================================================================ 5. lokale concepten: weg bij afmelden (zelfde regel als de privé-post)
  const ls = nepOpslag(), ss = nepOpslag();
  const g = globalThis as Record<string, unknown>;
  const lsVoor = g.localStorage, ssVoor = g.sessionStorage;
  g.localStorage = ls; g.sessionStorage = ss;
  try {
    const lokaal = await import('../../src/mail-concept-lokaal');
    const cache = await import('../../src/mail-bijlage-cache');
    const { cacheAccountKey } = await import('../../src/account-sleutel');
    const A = 'gebruiker-a-' + T, B = 'gebruiker-b-' + T;
    const c = (id: string, body: string) => ({ id, to: 'x@example.test', cc: '', bcc: '', subject: 'vertrouwelijk', body, open: false, op: Date.now(), serverOp: 0 });
    const sA = lokaal.conceptScope(cacheAccountKey(A), 'prive'), sAt = lokaal.conceptScope(cacheAccountKey(A), 'technisch'), sB = lokaal.conceptScope(cacheAccountKey(B), 'prive');
    lokaal.schrijfConcept(sA, c('conceptA0001', 'geheim van A'), ls); lokaal.schrijfConcept(sAt, c('conceptA0002', 'technisch van A'), ls); lokaal.schrijfConcept(sB, c('conceptB0001', 'van B'), ls);
    ls.setItem('mail-draft-active-id', 'oud12345'); ls.setItem('mail-draft-oud12345', JSON.stringify({ to: 'y@example.test', body: 'oud concept', savedAt: Date.now() }));
    check('voorbereiding: drie concepten (A privé, A technisch, B) en één oud niet-gescoopt concept', !!lokaal.leesConcept(sA, ls) && !!lokaal.leesConcept(sAt, ls) && !!lokaal.leesConcept(sB, ls) && ls.getItem('mail-draft-oud12345') !== null);
    // «Вийти» zonder «Зберегти цей акаунт» (UnifiedServiceApp → endMailPrivateCacheSession) en «account verwijderd» (forgetMailPrivateCacheOwner)
    await cache.endMailPrivateCacheSession(A);
    check('afmelden van A (niet onthouden): A\'s concepten (beide ruimtes) en het eigenaarloze oude concept zijn van het apparaat; B blijft',
      !lokaal.leesConcept(sA, ls) && !lokaal.leesConcept(sAt, ls) && !!lokaal.leesConcept(sB, ls) && ls.getItem('mail-draft-oud12345') === null && ls.getItem('mail-draft-active-id') === null,
      [...ls._m.keys()].join(' | '));
    await cache.forgetMailPrivateCacheOwner(B);
    check('account B verwijderd: ook B\'s concept is weg', !lokaal.leesConcept(sB, ls), [...ls._m.keys()].join(' | '));
    lokaal.schrijfConcept(sA, c('conceptA0003', 'nog eens A'), ls); lokaal.schrijfConcept(sB, c('conceptB0002', 'nog eens B'), ls);
    await cache.clearAllMailPrivateCaches();
    check('«alle accounts afmelden» / «overal intrekken»: geen enkel concept blijft op het apparaat', ![...ls._m.keys()].some((k) => k.startsWith(lokaal.CONCEPT_PREFIX) || k.startsWith('mail-draft-')), [...ls._m.keys()].join(' | '));
  } finally { g.localStorage = lsVoor; g.sessionStorage = ssVoor; }

  // ================================================================ 6. Gmail tussen de ruimtes + IDOR + oorsprong van de start
  const eigenaar = `br-eig-${T}@example.test`, sub = `sub-br-${T}`;
  const G = await nepGoogle({ ownerEmail: eigenaar });
  process.env.GOOGLE_OAUTH_GRANT_ENCRYPTION_KEY_V1 = `beveiligingsreview-${T}-32-tekens-minstens-xx`;
  const profielen = new Map<string, { sub: string; email: string }>();
  const ingetrokken: string[] = [];
  const nepFetch = globalThis.fetch;
  globalThis.fetch = (async (input: unknown, init?: RequestInit) => {
    const url = String(input);
    if (url === 'https://id.tarasevych.com/') return new Response('<!doctype html><title>id</title>', { status: 200, headers: { 'content-type': 'text/html; charset=utf-8' } });
    if (url === 'https://oauth2.googleapis.com/token') {
      const p = new URLSearchParams(String(init?.body || ''));
      const code = p.get('code') || '';
      if (code.startsWith('suite-')) {
        if (!p.get('code_verifier')) return new Response('{"error":"invalid_request"}', { status: 400 });
        return new Response(JSON.stringify({ access_token: `at-${code}`, refresh_token: `rt-${code}`, scope: ['openid', 'email', 'profile', ...MAIL_SCOPES].join(' '), expires_in: 3600, token_type: 'Bearer' }), { status: 200 });
      }
    }
    if (url === 'https://openidconnect.googleapis.com/v1/userinfo') {
      const tok = String((init?.headers as Record<string, string> | undefined)?.Authorization || '').replace(/^Bearer at-/, '');
      const pr = profielen.get(tok);
      if (pr) return new Response(JSON.stringify({ sub: pr.sub, email: pr.email, email_verified: true, name: pr.email, picture: '' }), { status: 200 });
    }
    if (url.startsWith('https://oauth2.googleapis.com/revoke')) { ingetrokken.push(url); return new Response('{}', { status: 200 }); }
    return nepFetch(input as never, init);
  }) as typeof fetch;
  const MAIL = 'mail.tarasevych.com';
  const opruimUsers: string[] = [];
  let uid = '';
  const sk = await import('../../backend/sleutelkluis');
  try {
    const P = G.browser();
    const post = (b: ReturnType<typeof G.browser>, pad: string, extra: Record<string, unknown> = {}, kop?: Record<string, string>) => b.verzoek(MAIL, pad, b.ctxBody('mail', extra), kop ? { kop } : {});
    const snapshot = async (b: ReturnType<typeof G.browser>) => (await post(b, '/api/owner/mail/google-suite/accounts')) as { status: number; data: { accounts?: Array<{ id: string; email: string }>; inactiveAccounts?: Array<{ id: string }> } };
    const googleAntwoord = async (authUrl: string, profiel: { sub: string; email: string }) => {
      const code = `suite-${randomBytes(6).toString('hex')}`; profielen.set(code, profiel);
      return P.verzoek('id.tarasevych.com', '/api/owner/google-suite/callback', { state: new URL(authUrl).searchParams.get('state'), code });
    };
    await P.aanmelden(sub, eigenaar, { service: 'mail', authTime: Math.floor(Date.now() / 1000) - 3600 });
    uid = String((await pool.query("select id from app.records where tbl='users' and data->>'email'=$1", [eigenaar])).rows[0]?.id || '');
    opruimUsers.push(uid);
    const start = await post(P, '/api/owner/mail/google-suite/onboarding/start', googleStartLichaam({ taal: 'uk', returnTo: `https://${MAIL}/accounts`, sourceOrigin: `https://${MAIL}`, tabContext: P.tab, rol: 'primary' }));
    const cb = await googleAntwoord(String(start.data.authUrl || 'https://x.invalid/?state=x'), { sub, email: eigenaar });
    const s1 = await snapshot(P);
    const priveId = s1.data.accounts?.[0]?.id || '';
    check('voorbereiding: persoonlijke Gmail gekoppeld (persoonlijk tabblad)', cb.data.ok === true && s1.data.accounts?.length === 1 && !!priveId, `${start.status} ${cb.body.slice(0, 120)}`);

    // ---- oorsprong van onboarding/start (geen lek): de server vult alleen de oorsprong van een EIGEN dienst in ----
    const lichaam = (extra: Record<string, unknown>) => ({ locale: 'uk', accountRole: 'additional', ...extra });
    const vreemdeOorsprong = await post(P, '/api/owner/mail/google-suite/onboarding/start', lichaam({ returnTo: 'https://kwaad.example/terug' }), { origin: 'https://kwaad.example', referer: 'https://kwaad.example/' });
    const vreemdLichaam = await post(P, '/api/owner/mail/google-suite/onboarding/start', lichaam({ sourceOrigin: 'https://kwaad.example', returnTo: 'https://kwaad.example/terug' }));
    const vreemdTerug = await post(P, '/api/owner/mail/google-suite/onboarding/start', lichaam({ sourceOrigin: `https://${MAIL}`, returnTo: 'https://kwaad.example/terug' }));
    const hintAanval = await post(P, '/api/owner/mail/google-suite/onboarding/start', lichaam({ sourceOrigin: `https://${MAIL}`, returnTo: `https://${MAIL}/accounts`, loginHint: 'iemand@example.test&prompt=none&redirect_uri=https://kwaad.example' }));
    const hintUrl = new URL(String(hintAanval.data.authUrl || 'https://x.invalid/'));
    check('(geen lek) onboarding/start: vreemde Origin zonder sourceOrigin, vreemde sourceOrigin of vreemde returnTo → nooit een authUrl (geen open redirect)',
      [vreemdeOorsprong, vreemdLichaam, vreemdTerug].every((r) => r.status >= 400 && !r.data.authUrl), [vreemdeOorsprong, vreemdLichaam, vreemdTerug].map((r) => `${r.status}:${r.data.error}`).join(' '));
    check('(geen lek) login_hint met «&prompt=none&redirect_uri=…» verandert de Google-URL niet (geweigerd of letterlijk gecodeerd)',
      hintUrl.searchParams.get('prompt') !== 'none' && hintUrl.searchParams.get('redirect_uri') !== 'https://kwaad.example' && !hintUrl.searchParams.getAll('redirect_uri').includes('https://kwaad.example'), hintUrl.search.slice(0, 160));

    // ---- IDOR (geen lek): een ander account kan deze mailbox niet loskoppelen ----
    const C = G.browser(); const cMail = `br-c-${T}@example.test`;
    await C.aanmelden(`sub-br-c-${T}`, cMail, { service: 'mail' });
    const cId = String((await pool.query("select id from app.records where tbl='users' and data->>'email'=$1", [cMail])).rows[0]?.id || '');
    opruimUsers.push(cId);
    await pool.query("update app.records set data = data || '{\"status\":\"approved\"}'::jsonb where tbl='users' and id=$1", [cId]);
    const idor = await post(C, `/api/owner/mail/google/accounts/${priveId}/disconnect`, { retainLocalData: false, confirmation: 'DELETE_MAIL_ACCOUNT_DATA' });
    check('(geen lek) IDOR: een ANDER account met de id van deze mailbox → 404, niets losgekoppeld, niets ingetrokken',
      idor.status === 404 && (await snapshot(P)).data.accounts?.some((a) => a.id === priveId) === true && ingetrokken.length === 0, `${idor.status} ${idor.body.slice(0, 100)}`);

    // ---- de technische ruimte van DEZELFDE mens (post op «власні дані») ----
    const Tb = G.browser();
    await Tb.aanmelden(sub, eigenaar, { service: 'mail', authTime: Math.floor(Date.now() / 1000) - 3600 });
    const { tabHash } = await import('../../backend/tech-profiel');
    const rs = await import('../../backend/ruimte-scheiding');
    const profielId = `tech-${randomBytes(6).toString('hex')}`;
    await pool.query(`INSERT INTO app.tech_profielen (user_id, profiel_id, rollen, max_minuten, toegekend_door) VALUES ($1,$2,ARRAY['eigenaar'],240,'test')
      ON CONFLICT (user_id) DO UPDATE SET rollen = EXCLUDED.rollen, ingetrokken_op = NULL`, [uid, profielId]);
    const pid = String((await pool.query('SELECT profiel_id FROM app.tech_profielen WHERE user_id=$1', [uid])).rows[0].profiel_id);
    await pool.query(`INSERT INTO app.tech_activaties (user_id, profiel_id, tab_hash, rollen, reden, eind_op) VALUES ($1,$2,$3,ARRAY['eigenaar'],'beveiligingsreview', now() + interval '60 minutes')`, [uid, pid, tabHash(Tb.tab)]);
    await rs.keuzeZetten(uid, 'per_dienst', uid);
    await rs.dienstZetten(uid, 'mail', 'verbind-eigen', { stapOpGedaan: true });
    const lade = await rs.gegevensLade({ userId: uid, tabContext: Tb.tab, dienst: 'mail' });
    check('voorbereiding: het tweede tabblad is TECHNISCH met post op «власні дані»', lade.ok === true && (lade as { lade: { ruimte: string } }).lade.ruimte === 'technisch', JSON.stringify(lade).slice(0, 160));
    // Dezelfde weg voor ELKE aanroep door de postpoort — ook een AI-verbinding met ruimte «technisch» (site-dispatch → zelfde routes).
    const mr = await import('../../backend/mail-ruimte');
    const { googleSuiteMailProviderSnapshot } = await import('../../backend/google-suite-inrichting');
    const viaTech = await mr.metLade({ userId: uid, ruimte: 'technisch' }, 'mail', () => googleSuiteMailProviderSnapshot(uid, eigenaar, sub));
    const viaPrive = await mr.metLade({ userId: uid, ruimte: 'prive' }, 'mail', () => googleSuiteMailProviderSnapshot(uid, eigenaar, sub));
    check('postpoort met lade «technisch» (tabblad of AI-verbinding): de Google-snapshot bevat de persoonlijke Gmail NIET',
      viaTech.accounts.length === 0 && !viaTech.inactiveAccounts.some((a) => a.id === priveId), JSON.stringify(viaTech.accounts.map((a) => a.email)));
    check('(geen valse weigering) postpoort met de persoonlijke lade («спільно» of persoonlijk tabblad): de Gmail is er gewoon', viaPrive.accounts.some((a) => a.id === priveId));
    const sT = await snapshot(Tb);
    check('technisch tabblad: de PERSOONLIJKE Gmail is niet zichtbaar (lijst, inactieve lijst)',
      sT.status === 200 && (sT.data.accounts?.length ?? -1) === 0 && !(sT.data.inactiveAccounts ?? []).some((a) => a.id === priveId), `${sT.status} ${JSON.stringify(sT.data.accounts?.map((a) => a.email))}`);
    const bootT = await post(Tb, '/api/owner/mail/bootstrap');
    check('technisch tabblad: ook de post-bootstrap noemt de persoonlijke Gmail niet', bootT.status === 200 && !(bootT.data.googleMail?.accounts ?? []).some((a: { id: string }) => a.id === priveId), `${bootT.status}`);
    const selT = await post(Tb, '/api/owner/mail/google-suite/account/select', { accountId: priveId });
    check('technisch tabblad: de persoonlijke mailbox kiezen als actieve Gmail → geweigerd', selT.status >= 400, `${selT.status}`);
    const voorRevoke = ingetrokken.length;
    const disT = await post(Tb, `/api/owner/mail/google/accounts/${priveId}/disconnect`, { retainLocalData: true });
    const naP = await snapshot(P);
    check('technisch tabblad: «Відключити» met de id van de PERSOONLIJKE mailbox → 404; de persoonlijke koppeling blijft, niets bij Google ingetrokken',
      disT.status === 404 && naP.data.accounts?.some((a) => a.id === priveId) === true && ingetrokken.length === voorRevoke, `${disT.status} ${disT.body.slice(0, 100)} | persoonlijk nog: ${naP.data.accounts?.length}`);

    // ================================================================ 7. sleutelkluis: elke uitlogweg sluit de DEK METEEN
    const kluisTest = async (route: string, label: string, alleenDitTabblad = false) => {
      const D = G.browser(); const dMail = `br-d-${randomBytes(3).toString('hex')}-${T}@example.test`;
      await D.aanmelden(`sub-${dMail}`, dMail, { service: 'hub' });
      const dId = String((await pool.query("select id from app.records where tbl='users' and data->>'email'=$1", [dMail])).rows[0]?.id || '');
      opruimUsers.push(dId);
      // Houders zoals de routes ze zetten (stapOpSessieId): elke sessie van dit account in deze browser — of, voor «вийти» (alleen
      // DIT tabblad), alleen de tabbladsessie van D.tab: de andere tabbladen van hetzelfde account blijven terecht aangemeld.
      const rijen = (await pool.query(`SELECT id, data->>'tabHash' AS tab FROM app.records WHERE tbl IN ('owner_tab_sessions_v1','owner_service_sessions_v1') AND data->>'userId' = $1 AND COALESCE(data->>'revokedAt','') IN ('','0')`, [dId])).rows as Array<{ id: string; tab: string | null }>;
      const ditTab = createHash('sha256').update(D.tab).digest('hex');
      const ids = (alleenDitTabblad ? rijen.filter((r) => r.tab === ditTab) : rijen).map((r) => String(r.id));
      const dLade = { userId: dId, ruimte: 'prive' as const };
      await sk.inschakelen(dLade, { soort: 'sessie', id: ids[0] });
      const dek = Buffer.from(sk.sleutelOpen(dLade)!);
      for (const id of ids.slice(1)) await sk.sleutelOpenen(dLade, dek, { soort: 'sessie', id });
      dek.fill(0);
      const voor = await sk.kluisStand(dLade);
      const uit = await D.verzoek('hub.tarasevych.com', route, D.ctxBody('hub'));
      const na = await sk.kluisStand(dLade);
      check(`sleutelkluis: ${label} → de DEK is METEEN uit het geheugen (niet pas na de luie controle)`, voor === 'open' && uit.status === 200 && na === 'gesloten', `voor=${voor} status=${uit.status} na=${na} sessies=${ids.length}`);
      sk.sleutelVergrendelenVoorGebruiker(dId);
      await pool.query('DELETE FROM app.sleutelkluis_omslag WHERE user_id = $1', [dId]).catch(() => undefined);
      await pool.query('DELETE FROM app.sleutelkluis WHERE user_id = $1', [dId]).catch(() => undefined);
      sk.standCacheLeeg(dLade);
    };
    await kluisTest('/api/owner/session/logout-account-browser', '«вийти з цього акаунта в усьому браузері»');
    await kluisTest('/api/owner/session/logout-browser-all', '«вийти з усіх акаунтів у цьому браузері»');
    await kluisTest('/api/owner/session/logout-current', '«вийти» uit DIT tabblad (bestaande haak, geen regressie)', true);
  } finally {
    globalThis.fetch = nepFetch;
    G.herstel();
    omgevingTerug();
    if (uid) {
      for (const sql of ['DELETE FROM app.tech_activaties WHERE user_id = $1', 'DELETE FROM app.tech_profielen WHERE user_id = $1', 'DELETE FROM app.ruimte_dienst_stand WHERE user_id = $1', 'DELETE FROM app.ruimte_keuze WHERE user_id = $1']) {
        await pool.query(sql, [uid]).catch(() => undefined);
      }
    }
    await pool.query(`DELETE FROM app.mcp_oauth_tokens WHERE user_id = $1`, [brUser]).catch(() => undefined);
    void opruimUsers;
  }
  return einde();
}
