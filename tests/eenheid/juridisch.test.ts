// Publieke juridische pagina's /privacy en /terms (Google OAuth-merkverificatie): echte HTTP-server
// (server/start.ts createServer), anoniem, echte tekst zonder JavaScript, app-CSP, geen noindex, exacte paden.
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import http from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { closePool } from '../../server/platform/pg';
import { PUBLIEKE_ROUTES } from '../../server/platform/auth-poort';
import { checker } from './hulp/nep-google';

type Antw = { status: number; body: string; headers: http.IncomingHttpHeaders };
function haal(poort: number, pad: string, host = 'hub.tarasevych.com', methode = 'GET'): Promise<Antw> {
  return new Promise((ok, fout) => {
    const r = http.request({ host: '127.0.0.1', port: poort, method: methode, path: pad, headers: { host, 'user-agent': 'Googlebot/2.1 (eenheidstest)', 'cf-connecting-ip': '198.18.7.7' } }, (res) => {
      let data = ''; res.on('data', (c) => { data += c; }); res.on('end', () => ok({ status: res.statusCode || 0, body: data, headers: res.headers }));
    });
    r.on('error', fout); r.end();
  });
}
const tekst = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

export async function main(): Promise<number> {
  const { check, einde } = checker('juridisch');
  const dist = await mkdtemp(join(tmpdir(), 'mr-dist-jur-'));
  await mkdir(join(dist, 'assets'), { recursive: true });
  await writeFile(join(dist, 'index.html'), '<!doctype html><meta name="robots" content="noindex"><title>spa</title><div id="root"></div>');
  await writeFile(join(dist, 'juridisch.css'), 'body{}');
  const vorige = process.env.DIST_DIR; process.env.DIST_DIR = dist;
  let server: http.Server | null = null;
  try {
    const { createServer } = await import('../../server/start');
    server = createServer();
    await new Promise<void>((r) => server!.listen(0, '127.0.0.1', () => r()));
    const poort = (server.address() as { port: number }).port;
    const p = await haal(poort, '/privacy'), t = await haal(poort, '/terms'), pId = await haal(poort, '/privacy', 'id.tarasevych.com');
    const pt = tekst(p.body), tt = tekst(t.body);
    check('anoniem 200 text/html op hub en id, zonder cookie of sessie',
      [p, t, pId].every((a) => a.status === 200 && String(a.headers['content-type']).startsWith('text/html') && !a.headers['set-cookie']), JSON.stringify([p.status, t.status, pId.status]));
    check('echte HTML zonder script en zonder noindex (geen meta robots, geen X-Robots-Tag); app-CSP met frame-ancestors none',
      [p, t].every((a) => !/<script/i.test(a.body) && !/noindex/i.test(a.body) && !a.headers['x-robots-tag'] && String(a.headers['content-security-policy'] || '').includes("frame-ancestors 'none'") && !String(a.headers['content-security-policy'] || '').includes("'unsafe-inline' 'self'")));
    const ukEerst = p.body.indexOf('id="uk"') > 0 && p.body.indexOf('id="uk"') < p.body.indexOf('id="nl"') && t.body.indexOf('id="uk"') < t.body.indexOf('id="nl"');
    check('talen: Oekraïens eerst, dan Nederlands, met ankers; geen Engelse versie', ukEerst && pt.includes('Політика конфіденційності') && pt.includes('Privacybeleid') && tt.includes('Умови користування') && tt.includes('Gebruiksvoorwaarden') && !/\bPrivacy Policy\b|\bTerms of Service\b/.test(pt + tt));
    check('privacy: verantwoordelijke + contact, Google-gegevens (sub/e-mail/naam/foto/auth_time), scopes, Limited Use + beleidslink, geen AI, Cloudflare, back-ups, 30 dagen, GBA/APD, cookies',
      ['Eigenaar Test', 'Eigenaar Test', 'eigenaar@example.test', 'sub', 'auth_time', 'openid', 'gmail.readonly', 'gmail.send', 'calendar.readonly', 'calendar.events', 'photospicker.mediaitems.readonly', 'Limited Use', 'api-services-user-data-policy', 'штучного інтелекту', 'AI-model', 'Cloudflare', 'age', '30 днів', '30 dagen', 'Gegevensbeschermingsautoriteit', 'cookie', '2026-10-04']
        .every((w) => p.body.includes(w)));
    check('terms: goedkeuring, aanvaardbaar gebruik, geen garantie, beëindiging, Belgisch recht', ['схвалення', 'Допустиме', '«як є»', 'Припинення', 'право Бельгії', 'goedkeuring', 'Aanvaardbaar gebruik', 'zoals hij is', 'Beëindiging', 'Belgisch recht'].every((w) => t.body.includes(w)));
    check('links naar elkaar en naar de start', p.body.includes('href="/terms"') && t.body.includes('href="/privacy"') && p.body.includes('href="/"') && t.body.includes('href="/"'));
    const head = await haal(poort, '/privacy', 'hub.tarasevych.com', 'HEAD'), post = await haal(poort, '/privacy', 'hub.tarasevych.com', 'POST');
    const prefix = await haal(poort, '/privacy/extra'), slash = await haal(poort, '/privacyx'), spa = await haal(poort, '/inbox');
    check('exact pad: HEAD 200 zonder body, POST 405, /privacy/extra en /privacyx niet de privacypagina; SPA elders ongewijzigd (noindex)',
      head.status === 200 && head.body === '' && post.status === 405 && !prefix.body.includes('Privacybeleid') && !slash.body.includes('Privacybeleid') && spa.body.includes('noindex'),
      JSON.stringify([head.status, post.status, prefix.status, slash.status, spa.status]));
    check('PUBLIEKE_ROUTES: exact GET /privacy en GET /terms, geen prefix-/wildcardvorm', 'GET /privacy' in PUBLIEKE_ROUTES && 'GET /terms' in PUBLIEKE_ROUTES && !Object.keys(PUBLIEKE_ROUTES).some((k) => /\/(privacy|terms)\/|\*/.test(k)));
    const robots = await readFile('public/robots.txt', 'utf8'), sw = await readFile('public/service-worker.js', 'utf8'), chrome = await readFile('src/CanonicalChrome.tsx', 'utf8');
    check('robots.txt staat alleen /privacy en /terms toe (rest Disallow); service worker laat ze ongemoeid; aanmeldscherm linkt ernaar',
      /^Allow: \/privacy\$$/m.test(robots) && /^Allow: \/terms\$$/m.test(robots) && /^Disallow: \/$/m.test(robots) && sw.includes("url.pathname==='/privacy'") && sw.includes("url.pathname==='/terms'") && chrome.includes("'/privacy'") && chrome.includes("'/terms'"));
  } catch (e) {
    check('onverwachte fout', false, String((e as Error)?.stack || e));
  } finally {
    await new Promise<void>((r) => server ? server.close(() => r()) : r());
    if (vorige === undefined) delete process.env.DIST_DIR; else process.env.DIST_DIR = vorige;
    await rm(dist, { recursive: true, force: true });
  }
  await closePool();
  return einde();
}
