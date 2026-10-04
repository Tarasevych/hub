// Regressietests audit-fix 3 (canonieke paden vóór rate limit en routering) en 7 (stap-op in de strikte bucket).
// Start de echte HTTP-server (server/start.ts createServer) op een vrije poort met een nep-dist-map.
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import http from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { closePool, getPool } from '../../server/platform/pg';
import { checker } from './hulp/nep-google';

type Antw = { status: number; body: string; type: string };
function verzoek(poort: number, methode: string, pad: string, ip: string, body = ''): Promise<Antw> {
  return new Promise((ok, fout) => {
    const r = http.request({ host: '127.0.0.1', port: poort, method: methode, path: pad, headers: { host: 'hub.tarasevych.com', origin: 'https://hub.tarasevych.com', 'content-type': 'application/json', 'cf-connecting-ip': ip, 'content-length': Buffer.byteLength(body) } }, (res) => {
      let data = ''; res.on('data', (c) => { data += c; }); res.on('end', () => ok({ status: res.statusCode || 0, body: data, type: String(res.headers['content-type'] || '') }));
    });
    r.on('error', fout); r.end(body);
  });
}

export async function main(): Promise<number> {
  const { check, einde } = checker('audit-pad');
  const dist = await mkdtemp(join(tmpdir(), 'mr-dist-'));
  await mkdir(join(dist, 'assets'), { recursive: true });
  await writeFile(join(dist, 'index.html'), '<!doctype html><title>spa</title>');
  await writeFile(join(dist, 'assets', 'app-123.js'), 'console.log(1)');
  const vorige = process.env.DIST_DIR; process.env.DIST_DIR = dist;
  const ipBasis = `198.18.${Math.floor(Math.random() * 200)}.`;
  let server: http.Server | null = null;
  try {
    const { createServer } = await import('../../server/start');
    server = createServer();
    await new Promise<void>((r) => server!.listen(0, '127.0.0.1', () => r()));
    const poort = (server.address() as { port: number }).port;
    const spa = await verzoek(poort, 'GET', '/inbox', `${ipBasis}1`);
    const wortel = await verzoek(poort, 'GET', '/', `${ipBasis}1`);
    const asset = await verzoek(poort, 'GET', '/assets/app-123.js', `${ipBasis}1`);
    const geenBestand = await verzoek(poort, 'GET', '/bestaat-niet.js', `${ipBasis}1`);
    check('statisch/SPA werkt nog: /, /inbox (fallback), /assets/*; onbekend bestand 404', spa.status === 200 && spa.type.includes('text/html') && wortel.status === 200 && asset.status === 200 && geenBestand.status === 404, `${spa.status} ${wortel.status} ${asset.status} ${geenBestand.status}`);
    const body = JSON.stringify({ email: `pad-${randomBytes(3).toString('hex')}@example.test`, password: 'x' });
    const varianten = await Promise.all(['/api/owner/access/password/login/', '/api//owner/access/password/login', '/api/owner/access//password/login'].map((p) => verzoek(poort, 'POST', p, `${ipBasis}2`, body)));
    check('niet-canonieke API-paden (afsluitende /, //) → 404 (geen routering, geen omzeiling van de strikte bucket)', varianten.every((v) => v.status === 404), varianten.map((v) => v.status).join(','));
    // Punt-segmenten normaliseert de URL-parser al vóór rate limit én routering: zelfde pad voor beide.
    const punten: number[] = [];
    for (let i = 0; i < 11; i++) punten.push((await verzoek(poort, 'POST', '/api/owner/access/./password/../password/login', `${ipBasis}6`, JSON.stringify({ email: `pad-${i}-${randomBytes(3).toString('hex')}@example.test`, password: 'x' }))).status);
    check('punt-segmenten worden consequent genormaliseerd: tellen mee in de strikte bucket (429 na 10)', punten.slice(0, 10).every((s) => s === 401) && punten[10] === 429, punten.join(','));
    const reeks: number[] = [];
    for (let i = 0; i < 12; i++) reeks.push((await verzoek(poort, 'POST', i % 2 ? '/api/owner/access/password/login/' : '/api/owner/access/password/login', `${ipBasis}3`, body)).status);
    const canoniek = reeks.filter((_, i) => i % 2 === 0);
    check('strikte wachtwoord-bucket telt alleen canonieke paden en blokkeert na 10/min; varianten blijven 404', reeks.filter((_, i) => i % 2 === 1).every((s) => s === 404) && canoniek.every((s) => s !== 404), reeks.join(','));
    const stap: number[] = [];
    for (let i = 0; i < 12; i++) stap.push((await verzoek(poort, 'POST', '/api/owner/access/stap-op', `${ipBasis}4`, '{}')).status);
    check('stap-op zit in de strikte MFA-bucket (429 na 10 per minuut per IP)', stap.slice(0, 10).every((s) => s !== 429) && stap.slice(10).every((s) => s === 429), stap.join(','));
    const nietApi = await verzoek(poort, 'GET', '//api/owner/session/bootstrap', `${ipBasis}5`);
    check('pad dat niet met /api/ begint (//api/...) bereikt de API niet', !nietApi.body.includes('signed_out') && !nietApi.type.includes('json'), `${nietApi.status} ${nietApi.type}`);
  } catch (e) {
    check('onverwachte fout', false, String((e as Error)?.stack || e));
  } finally {
    if (server) await new Promise((r) => server!.close(() => r(undefined)));
    if (vorige === undefined) delete process.env.DIST_DIR; else process.env.DIST_DIR = vorige;
    await rm(dist, { recursive: true, force: true });
    try { await getPool().query("delete from app.rate_limits where key like $1", [`%${ipBasis}%`]); } catch { /* tabelnaam kan afwijken */ }
  }
  await closePool();
  return einde();
}
