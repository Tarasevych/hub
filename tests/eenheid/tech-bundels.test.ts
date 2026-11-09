// Technische bundels alleen voor een sessie met actief technisch profiel (verslag van de eigenaar 18.10.2026: «Технічні ассети лише
// для tech-сесії — не перевірено»). Eerst het oude gedrag nagebootst (beheerbundel in assets/, voor iedereen 200 en «immutable»),
// dan: indeling (shared/tech-bundels.ts), bouwcontrole (scripts/tech-bundels-controle.mjs), en de ECHTE server (server/start.ts →
// backend/index.ts) tegen de wegwerp-PG: zonder sessie 404, sessie zonder tech 404, actieve activering 200 met
// Cache-Control: private, no-store en Vary: Cookie; na beëindigen weer 404. Plus de service worker en de frontendaansluiting.
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import http from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { getPool } from '../../server/platform/pg';
import { TECH_ASSET_COOKIE, TECH_ASSET_PREFIX, bronPad, isTechChunk, isTechModule } from '../../shared/tech-bundels';
import { checker } from './hulp/nep-google';
// @ts-expect-error — .mjs zonder typen (bouwscript)
import { controleer, statischeTechImports } from '../../scripts/tech-bundels-controle.mjs';

const W = process.cwd();
const lees = (p: string) => readFileSync(join(W, p), 'utf8');
const sha = (v: string) => createHash('sha256').update(v).digest('hex');
const tab = () => randomBytes(24).toString('hex');
const HOST = 'admin.tarasevych.com', ID = 'id.tarasevych.com';

export async function main(): Promise<number> {
  const { check, einde } = checker('tech-bundels');

  // ---------------------------------------------------------------- indeling
  const R = '/srv/app';
  check('bronPad: absoluut, relatief, ?query, node_modules en virtuele modules', bronPad(`${R}/src/BeheerConsoleWeergave.tsx`, R) === 'src/BeheerConsoleWeergave.tsx'
    && bronPad('src/geheimen/X.tsx?used', '') === 'src/geheimen/X.tsx' && bronPad(`${R}/node_modules/react/index.js`, R) === '' && bronPad('\0vite/preload-helper', R) === '');
  const tech = ['src/BeheerConsoleWeergave.tsx', 'src/BeheerUitrolWeergave.tsx', 'src/beheer-console.css', 'src/uitrol/Stap.tsx', 'src/geheimen/Kluis.tsx', 'src/diagnostiek/hulp.ts',
    'src/overzicht/O.tsx', 'src/audit/A.tsx', 'src/terminal/Terminal.tsx', 'src/vlaggen/Vlaggen.tsx', 'src/ssh/SshCertificaat.tsx', 'src/guacamole/G.tsx', 'src/UitrolMeester.tsx', 'src/integraties/Integraties.tsx', 'src/integraties/Wizard.tsx'];
  const openbaar = ['src/tech/TechLaag.tsx', 'src/tech/tech-bundel.tsx', 'src/tech/TechPoort.tsx', 'src/MailFunctioneelWeergave.tsx', 'src/diagnose/Diagnose.tsx', 'src/ondersteuning/Ondersteuning.tsx',
    'src/agenten/X.tsx', 'src/AdministratieHulp.tsx', 'src/InstellingencentrumWeergave.tsx', 'src/instellingen/MijnDiensten.tsx', 'shared/tech-bundels.ts',
    // 20.10.2026: merkvormen zijn NIET technisch. Stonden in src/integraties/ en werden daardoor naar assets/tech/ geschreven;
    // een gewone gebruiker kreeg 403 en zag geen merklogo op «Акаунти» (klacht «немає поштових логотипів»).
    'src/merk/MerkLogo.tsx', 'src/merk/merk-logos.ts', 'src/merk/merk-register.ts', 'src/merk/Merk.tsx',
    // 09.11.2026 (PERF-001): integratiestrook op openbare pagina's, sinds lui laden in een eigen chunk.
    'src/integraties/IntegratieStrook.tsx', 'src/integraties/catalogus-vlag.ts', 'src/integraties/integraties.css'];
  check('isTechModule: alle beheerpaden technisch', tech.every((p) => isTechModule(`${R}/${p}`, R)), tech.filter((p) => !isTechModule(`${R}/${p}`, R)).join());
  check('isTechModule: band/poort/diagnoselaag/mail/instellingen NIET technisch (nodig vóór activering)', openbaar.every((p) => !isTechModule(`${R}/${p}`, R)), openbaar.filter((p) => isTechModule(`${R}/${p}`, R)).join());
  check('isTechModule: markering // @tech-asset voor nieuwe pagina\'s buiten de lijst', isTechModule(`${R}/src/nieuw/Pagina.tsx`, R, () => '  // @tech-asset\nimport x') && !isTechModule(`${R}/src/nieuw/Pagina.tsx`, R, () => 'import x'));
  check('isTechChunk: ingang nooit technisch', !isTechChunk({ isEntry: true, facadeModuleId: `${R}/src/BeheerConsoleWeergave.tsx` }, R));
  check('isTechChunk: lazy chunk van AdminConsoleView technisch, van MailFunctionalView niet', isTechChunk({ facadeModuleId: `${R}/src/BeheerConsoleWeergave.tsx`, moduleIds: [`${R}/src/BeheerConsoleWeergave.tsx`, `${R}/src/platform/client.ts`] }, R)
    && !isTechChunk({ facadeModuleId: `${R}/src/MailFunctioneelWeergave.tsx`, moduleIds: [`${R}/src/MailFunctioneelWeergave.tsx`] }, R));
  check('isTechChunk: gedeelde chunk (technisch + openbaar) blijft openbaar; alleen-technisch wordt technisch; alleen node_modules openbaar',
    !isTechChunk({ moduleIds: [`${R}/src/uitrol/a.ts`, `${R}/src/platform/b.ts`] }, R) && isTechChunk({ moduleIds: [`${R}/src/uitrol/a.ts`, `${R}/src/geheimen/b.ts`] }, R)
    && !isTechChunk({ moduleIds: [`${R}/node_modules/@xterm/xterm/x.js`] }, R));

  // ---------------------------------------------------------------- bouwcontrole
  check('statischeTechImports: from/import/export-from ja, import() nee', statischeTechImports('import{a as b}from"./tech/A-x1.js";import"./tech/B.js";export{c}from"./tech/C.js";const d=()=>import("./tech/D.js")').join() === './tech/A-x1.js,./tech/B.js,./tech/C.js');
  const maak = (bestanden: Record<string, string>) => { const d = mkdtempSync(join(tmpdir(), 'tadist-')); for (const [p, t] of Object.entries(bestanden)) { mkdirSync(join(d, p, '..'), { recursive: true }); writeFileSync(join(d, p), t); } return d; };
  const goed = maak({ 'index.html': '<script type="module" src="/assets/index-a.js"></script>', 'assets/index-a.js': 'const A=()=>import("./tech/AdminConsoleView-x.js")', 'assets/tech/AdminConsoleView-x.js': 'import{a}from"../index-a.js"' });
  const slecht = maak({ 'index.html': '<link rel="modulepreload" href="/assets/tech/AdminConsoleView-x.js">', 'assets/index-a.js': 'import{z}from"./tech/AdminConsoleView-x.js"', 'assets/tech/AdminConsoleView-x.js': '' });
  const leeg = maak({ 'index.html': '', 'assets/index-a.js': '' });
  try {
    const g = controleer(goed), s = controleer(slecht), l = controleer(leeg);
    check('controleer: dynamisch laden van technisch = in orde', g.fouten.length === 0 && g.technisch === 1, JSON.stringify(g));
    check('controleer: statische import door openbare bundel en modulepreload in index.html = FOUT', s.fouten.length === 2 && s.fouten.some((f: string) => f.includes('statisch')) && s.fouten.some((f: string) => f.includes('index.html')), JSON.stringify(s.fouten));
    check('controleer: geen enkele technische bundel = FOUT (configuratie stuk)', l.fouten.length === 1, JSON.stringify(l.fouten));
  } finally { for (const d of [goed, slecht, leeg]) rmSync(d, { recursive: true, force: true }); }
  check('package.json: «npm run build» voert de bouwcontrole uit direct na vite build', /vite build && node scripts\/tech-bundels-controle\.mjs dist/.test(lees('package.json')));
  const vc = lees('vite.config.ts');
  check('vite.config: chunkFileNames/assetFileNames via isTechChunk → assets/tech/', vc.includes('chunkFileNames: chunkNaam') && vc.includes('assetFileNames: assetNaam') && vc.includes("'assets/tech/[name]-[hash].js'"));

  // ---------------------------------------------------------------- service worker en frontend
  const sw = lees('public/service-worker.js');
  check('service worker: /assets/tech/ wordt nooit onderschept of gecachet', sw.includes("url.pathname.startsWith('/assets/tech/')") && sw.indexOf("startsWith('/assets/tech/')") < sw.indexOf('respondWith'));
  const usa = lees('src/VerenigdDienstApp.tsx'), laag = lees('src/tech/TechLaag.tsx');
  check('OUD gedrag weg: admin wordt niet meer vooraf geladen vóór activering (preloadCurrentView)', !/s==='admin'\)void import\('\.\/BeheerConsoleWeergave'\)/.test(usa));
  check('AdminConsoleView via lazyTech + TechBundelGrens (melding bij 404 i.p.v. witte pagina)', usa.includes("AdminConsoleView=lazyTech(()=>import('./BeheerConsoleWeergave'))") && usa.includes('<TechBundelGrens lang={lang}><AdminConsoleView'));
  check('Terminal/Vlaggen/SSH in TechLaag via lazyTech + TechBundelGrens', (laag.match(/lazyTech\(\(\) => import\('\.\.\/(terminal|vlaggen|ssh)\//g) || []).length === 3 && !/[^h]lazy\(\(\) => import\(/.test(laag) && (laag.match(/<TechBundelGrens>/g) || []).length >= 3);
  // Elke dynamische import van technische code vanuit openbare code moet via lazyTech (anders: 404 → witte pagina).
  const { readdirSync, statSync } = await import('node:fs');
  const alle: string[] = [];
  const loop = (d: string) => { for (const n of readdirSync(join(W, d))) { const p = `${d}/${n}`; if (statSync(join(W, p)).isDirectory()) loop(p); else if (/\.tsx?$/.test(n)) alle.push(p); } };
  loop('src');
  const kaal: string[] = [];
  for (const p of alle.filter((x) => !isTechModule(x, '', (r) => lees(r).slice(0, 200)))) {
    const t = lees(p);
    for (const m of t.matchAll(/(lazyTech\(|lazy\()?\s*\(\)\s*=>\s*import\(['"]([^'"]+)['"]\)/g)) {
      const doel = join(p, '..', m[2]).replace(/\\/g, '/');
      const kandidaten = [`${doel}.tsx`, `${doel}.ts`, doel];
      if (kandidaten.some((k) => isTechModule(k, '')) && m[1] !== 'lazyTech(') kaal.push(`${p} → ${m[2]}`);
    }
    for (const m of t.matchAll(/void import\(['"]([^'"]+)['"]\)/g)) { const doel = join(p, '..', m[1]); if ([`${doel}.tsx`, `${doel}.ts`].some((k) => isTechModule(k, ''))) kaal.push(`${p} → voorladen ${m[1]}`); }
  }
  check('openbare code laadt technische modules alleen via lazyTech (nooit vooraf, nooit kaal lazy)', kaal.length === 0, kaal.join('; '));

  // ---------------------------------------------------------------- echte server tegen PG
  const pool = getPool('systeem');
  const dist = mkdtempSync(join(tmpdir(), 'tadist-srv-'));
  mkdirSync(join(dist, 'assets', 'tech'), { recursive: true });
  writeFileSync(join(dist, 'index.html'), '<!doctype html><title>t</title>');
  writeFileSync(join(dist, 'assets', 'index-AbCdEf12.js'), 'console.log(1)');
  writeFileSync(join(dist, 'assets', 'tech', 'AdminConsoleView-AbCdEf12.js'), 'export const geheimeBeheercode = 1;');
  process.env.DIST_DIR = dist;
  const { createServer } = await import('../../server/start');
  const { handler } = await import('../../backend/index');
  const { ECOSYSTEM_COOKIE } = await import('../../backend/deployment-identiteit');
  const tp = await import('../../backend/tech-profiel');
  const ta = await import('../../backend/tech-bundels');
  const srv = createServer();
  await new Promise<void>((r) => srv.listen(0, '127.0.0.1', () => r()));
  const poort = (srv.address() as { port: number }).port;
  const haal = (pad: string, cookie = '') => new Promise<{ status: number; kop: http.IncomingHttpHeaders; body: string }>((ok, nee) => {
    const q = http.request({ host: '127.0.0.1', port: poort, path: pad, method: 'GET', headers: { host: HOST, ...(cookie ? { cookie } : {}) } }, (res) => { let b = ''; res.on('data', (c) => { b += c; }); res.on('end', () => ok({ status: res.statusCode || 0, kop: res.headers, body: b })); });
    q.on('error', nee); q.end();
  });

  const bestaand = (await pool.query(`SELECT id, data->>'email' AS email FROM app.records WHERE tbl='users' AND data->>'role'='owner' LIMIT 1`)).rows[0];
  const uid = bestaand ? String(bestaand.id) : randomUUID();
  if (bestaand) process.env.OWNER_EMAIL = String(bestaand.email);
  else await pool.query('INSERT INTO app.records (tbl,id,data) VALUES ($1,$2,$3)', ['users', uid, { email: process.env.OWNER_EMAIL || 'eigenaar@eenheid.test', role: 'owner', status: 'approved', name: 'Eigenaar' }]);
  const eig = { id: uid, email: String(process.env.OWNER_EMAIL), role: 'owner', status: 'approved' };
  const sessies: string[] = [];
  const sessie = async () => {
    const id = randomUUID(), token = randomBytes(32).toString('base64url'), now = Date.now();
    const epoch = Number((await pool.query(`SELECT (data->>'epoch')::int AS e FROM app.records WHERE tbl='owner_revocation_state_v1' AND data->>'userId'=$1 ORDER BY (data->>'epoch')::int DESC LIMIT 1`, [uid])).rows[0]?.e || 0);
    const rec = { tokenHash: sha(token), userId: uid, service: 'identity', sourceOrigin: `https://${ID}`, tabHash: sha('ecosystem'), grantId: '', createdAt: now - 1000, authenticatedAt: now - 1000, lastSeenAt: now, idleExpiresAt: now + 7 * 864e5, absoluteExpiresAt: now + 30 * 864e5, rotation: 0, version: 1, revocationEpoch: epoch, scope: 'ecosystem', authMethod: 'google', ip: '203.0.113.9', userAgent: 'eenheid' };
    await pool.query('INSERT INTO app.records (tbl,id,data) VALUES ($1,$2,$3)', ['owner_service_sessions_v1', id, rec]);
    sessies.push(id);
    return { id, createdAt: now - 1000, cookie: `${ECOSYSTEM_COOKIE}=${encodeURIComponent(`${id}.${token}`)}` };
  };
  const status = async (s: { cookie: string }, t: string, extraCookie = '') => {
    const pad = '/api/owner/tech/status';
    const evt = { headers: { host: ID, origin: `https://${ID}`, 'content-type': 'application/json', cookie: [s.cookie, extraCookie].filter(Boolean).join('; '), 'user-agent': 'eenheid' }, body: JSON.stringify({ service: 'identity', tabContext: t, sourceOrigin: `https://${ID}` }), isBase64Encoded: false, rawPath: pad, rawQueryString: '', queryStringParameters: {}, requestContext: { http: { method: 'POST', path: pad, sourceIp: '203.0.113.9', userAgent: 'eenheid' } } };
    const r = await handler(evt as never) as { statusCode: number; headers: Record<string, string> };
    const sc = String(r.headers?.['Set-Cookie'] || r.headers?.['set-cookie'] || '');
    return { status: r.statusCode, setCookie: sc, waarde: sc.startsWith(`${TECH_ASSET_COOKIE}=`) ? sc.split(';')[0] : '' };
  };
  const TECHPAD = `${TECH_ASSET_PREFIX}AdminConsoleView-AbCdEf12.js`;

  try {
    await tp.profielVan(eig);
    // Oud gedrag nagebootst: zonder poort zou /assets/… met «public, immutable» voor iedereen opgaan. Openbare bundels blijven zo.
    const pub = await haal('/assets/index-AbCdEf12.js');
    check('openbare bundel ongewijzigd: 200, public immutable (geen regressie)', pub.status === 200 && /immutable/.test(String(pub.kop['cache-control'])), `${pub.status} ${pub.kop['cache-control']}`);
    const zonder = await haal(TECHPAD);
    check('zonder sessie/cookie: 404 (niet 403), geen inhoud, no-store + Vary: Cookie', zonder.status === 404 && !zonder.body.includes('geheimeBeheercode') && zonder.kop['cache-control'] === 'private, no-store' && zonder.kop.vary === 'Cookie', `${zonder.status} ${zonder.kop['cache-control']} ${zonder.kop.vary}`);
    const nep = await haal(TECHPAD, `${TECH_ASSET_COOKIE}=${randomBytes(32).toString('base64url')}`);
    check('verzonnen sleutel: 404', nep.status === 404);
    check('ook een niet-bestaand bestand onder /assets/tech/ zonder cookie: 404 (bestaan blijft verborgen)', (await haal(`${TECH_ASSET_PREFIX}Bestaat-niet.js`)).status === 404);

    const s = await sessie(), tA = tab();
    const geenTech = await status(s, tA);
    check('sessie zonder actieve activering: status geeft GEEN toegangscookie', geenTech.status === 200 && !geenTech.waarde, `${geenTech.status} ${geenTech.setCookie}`);
    check('sessie zonder tech: /assets/tech/ 404 (alleen sessiecookie)', (await haal(TECHPAD, s.cookie)).status === 404);

    const act = await tp.activeren(eig, tA, 15, 'eenheidstest tech-assets', { id: s.id, createdAt: s.createdAt });
    const met = await status(s, tA);
    check('actieve activering: status zet de toegangscookie (HttpOnly, Secure, SameSite=Strict, Path=/ zodat de tech-routes hem zien)', !!met.waarde && /HttpOnly/.test(met.setCookie) && /Secure/.test(met.setCookie) && /SameSite=Strict/.test(met.setCookie) && met.setCookie.includes('Path=/;'), met.setCookie.replace(/=[A-Za-z0-9_-]{43}/, '=…'));
    const rij = (await pool.query('SELECT sleutel_hash, activatie_id FROM app.tech_asset_toegang WHERE user_id=$1 ORDER BY aangemaakt_op DESC LIMIT 1', [uid])).rows[0];
    check('database: alleen de SHA-256 van de sleutel, gekoppeld aan de activering', rij && rij.sleutel_hash === sha(met.waarde.split('=')[1]) && String(rij.activatie_id) === act.id && !JSON.stringify(rij).includes(met.waarde.split('=')[1]));
    const ok = await haal(TECHPAD, `${s.cookie}; ${met.waarde}`);
    check('met tech: 200, inhoud, Cache-Control private, no-store, Vary: Cookie, NIET immutable', ok.status === 200 && ok.body.includes('geheimeBeheercode') && ok.kop['cache-control'] === 'private, no-store' && ok.kop.vary === 'Cookie', `${ok.status} ${ok.kop['cache-control']} ${ok.kop.vary}`);
    const opnieuw = await status(s, tA, met.waarde);
    check('status opnieuw met geldige cookie: geen nieuwe sleutel (geen rij per ophaling)', !opnieuw.setCookie);
    const ander = await status(s, tab(), met.waarde);
    check('ander tabblad zonder activering: cookie blijft (zet het geactiveerde tabblad niet dicht)', !ander.setCookie);

    await tp.beeindigen(eig, tA);
    const na = await haal(TECHPAD, `${s.cookie}; ${met.waarde}`);
    check('na beëindigen: 404 (binnen de cachetermijn van 15 s alleen via cache; hier na cache leeg)', na.status === 404 || (ta._assetCacheLeeg(), (await haal(TECHPAD, `${s.cookie}; ${met.waarde}`)).status === 404));
    ta._assetCacheLeeg();
    check('na beëindigen zonder cache: zeker 404', (await haal(TECHPAD, `${s.cookie}; ${met.waarde}`)).status === 404);
    const wis = await status(s, tA, met.waarde);
    check('na beëindigen: status wist de cookie (Max-Age=0)', wis.setCookie.startsWith(`${TECH_ASSET_COOKIE}=;`) && /Max-Age=0/.test(wis.setCookie), wis.setCookie);

    // Verlopen activering: ook dicht.
    const tB = tab();
    await tp.activeren(eig, tB, 15, 'eenheidstest verlopen', { id: s.id, createdAt: s.createdAt });
    const b = await status(s, tB);
    await pool.query(`UPDATE app.tech_activaties SET begin_op = now() - interval '16 minutes', eind_op = now() - interval '1 second' WHERE user_id=$1 AND tab_hash IS NOT NULL AND beeindigd_op IS NULL`, [uid]);
    ta._assetCacheLeeg();
    check('verlopen activering: 404', (await haal(TECHPAD, `${s.cookie}; ${b.waarde}`)).status === 404);
    check('HEAD zonder cookie ook 404', await new Promise<number>((ok2) => { const q = http.request({ host: '127.0.0.1', port: poort, path: TECHPAD, method: 'HEAD', headers: { host: HOST } }, (res) => { res.resume(); ok2(res.statusCode || 0); }); q.end(); }) === 404);
  } finally {
    await new Promise<void>((r) => srv.close(() => r()));
    await pool.query('DELETE FROM app.tech_asset_toegang WHERE user_id=$1', [uid]).catch(() => undefined);
    await tp.beeindigenBijIntrekken(uid, 'handmatig').catch(() => undefined);
    for (const id of sessies) await pool.query("DELETE FROM app.records WHERE tbl='owner_service_sessions_v1' AND id=$1", [id]).catch(() => undefined);
    rmSync(dist, { recursive: true, force: true });
  }
  return einde();
}
