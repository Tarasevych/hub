// E2E BUG-002 «Перевірка всіх адрес» springt zelf open en dicht. ISOLATIE: de echte melding (stand hulp/scan-melding-stand) tegen een
// NEPSERVER in het geheugen die het contract van backend/mail-afzenders.ts volgt (scan/auto, status, start, pauze, stop, beleid).
// Nagebootst: HTTP_502 van de proxy op status én start, een time-out (afgebroken verzoek), een run die de server na zijn eigen
// herhalingen als «fout» opgeeft, tabwissel, opnieuw mounten (sessie), het periodieke bijwerken (≥ 15 min) en pagina verversen.
// De gebruiker minimaliseert (computer) of klapt in (telefoon); de test telt hoe vaak het venster daarna ZELF terugkomt.
// Gebruik: node --experimental-strip-types scripts/lokaal-e2e/scan-melding.e2e.ts [uitvoermap]  (schrijft logboek-*.json + screens)
import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { build } from 'esbuild';

const PW = process.env.PLAYWRIGHT_CORE || '/workspace/e2e-tools/node_modules/playwright-core';
const CHROME = process.env.CHROME || '/usr/bin/google-chrome';
const UIT = process.argv[2] || process.env.E2E_SCREENSHOTS || '/workspace/wp-bug002/uitvoer/e2e';
const SNEL = process.env.SCAN_E2E_SNEL === '1';
type Page = import('playwright-core').Page;

function nepServer() {
  const s = { loopt: false, staat: 'nooit', fase: 'volledig', verwerkt: 0, fout: '', bijgewerktOp: new Date().toISOString(), eersteKlaarOp: null as string | null, oud: false, beleid: 'automatisch',
    statusN: 0, startN: 0, autoN: 0, inVlucht: 0, maxInVlucht: 0, startTerwijlLoopt: 0, verzoeken: [] as string[], runs: 0 };
  const stand = (extra: Record<string, unknown> = {}) => ({
    staat: s.loopt ? 'bezig' : s.staat, loopt: s.loopt, verwerkt: s.verwerkt, schatting: 1000, eersteKlaarOp: s.eersteKlaarOp, bijgewerktOp: s.bijgewerktOp, beleid: s.beleid, maxPogingen: 12,
    accounts: [{ accountId: 'a1', email: 'pavlo@example.org', staat: s.loopt ? 'bezig' : s.staat, fase: s.fase, verwerkt: s.verwerkt, schatting: 1000, fout: s.fout, eersteKlaarOp: s.eersteKlaarOp, bijgewerktOp: s.bijgewerktOp, poging: 0, wachtTot: null }],
    tellers: { contacten: 120, geverifieerd: 30, verdacht: 2, geschreven: 10, officieel: 3, dns: 40 }, ...extra });
  const begin = (fase: string) => { s.loopt = true; s.fase = fase; s.fout = ''; s.runs++; s.bijgewerktOp = new Date().toISOString(); if (fase === 'bijwerken') s.verwerkt = 0; };
  const stap = () => {
    if (!s.loopt) return;
    s.verwerkt += 50; s.bijgewerktOp = new Date().toISOString();
    if (s.fase === 'bijwerken' && s.verwerkt >= 100) { s.loopt = false; s.staat = 'klaar'; return; }
    if (s.verwerkt >= 700) { s.loopt = false; s.staat = 'klaar'; s.eersteKlaarOp = s.bijgewerktOp; return; }
    // de server geeft de run op na zijn eigen 12 pogingen (HTTP_502 van Gmail-proxy): elke 4e statusvraag
    if (s.statusN % 4 === 0) { s.loopt = false; s.staat = 'fout'; s.fout = 'HTTP_502'; }
  };
  return { s, async antwoord(pad: string): Promise<{ status: number; body?: unknown; afbreken?: boolean }> {
    s.verzoeken.push(`${Date.now()} ${pad}`);
    const naam = pad.replace('/api/owner/mail/contacten/', '');
    if (naam === 'scan/auto') {
      s.autoN++;
      if (s.loopt) return { status: 200, body: { scan: stand() } };
      if (s.staat === 'nooit' || (s.staat === 'klaar' && s.oud) || s.staat === 'fout') { s.oud = false; begin(s.staat === 'klaar' ? 'bijwerken' : s.fase); return { status: 200, body: { scan: stand({ automatisch: true }) } }; }
      return { status: 200, body: { scan: stand() } };
    }
    if (naam === 'scan/status') {
      s.statusN++;
      if (s.statusN % 7 === 0) return { status: 502, body: '<html>502 Bad Gateway</html>' };
      if (s.statusN % 11 === 0) return { status: 0, afbreken: true };
      stap(); return { status: 200, body: { scan: stand() } };
    }
    if (naam === 'scan/start') {
      s.startN++;
      if (s.loopt) { s.startTerwijlLoopt++; return { status: 200, body: { scan: stand() } }; }
      if (s.startN % 3 === 1) return { status: 502, body: '<html>502 Bad Gateway</html>' };
      begin(s.fase); return { status: 200, body: { scan: stand() } };
    }
    if (naam === 'scan/pauze' || naam === 'scan/stop') { s.loopt = false; s.staat = naam === 'scan/pauze' ? 'gepauzeerd' : 'gestopt'; return { status: 200, body: { scan: stand() } }; }
    if (naam === 'scan/beleid') return { status: 200, body: { beleid: s.beleid, scan: stand() } };
    return { status: 404, body: { error: 'NIET_GEVONDEN' } };
  } };
}

async function scenario(chromium: any, map: string, poort: number, naam: string, vp: { width: number; height: number }) {
  const nep = nepServer();
  const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: [`--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1`, '--no-proxy-server'] });
  const ctx = await browser.newContext({ viewport: vp, hasTouch: vp.width < 560, isMobile: vp.width < 560 });
  const page: Page = await ctx.newPage();
  const fouten: string[] = [];
  page.on('pageerror', (e) => { fouten.push(String(e)); console.error('PAGEERROR', String(e)); });
  await page.route('**/api/**', async (route) => {
    const pad = new URL(route.request().url()).pathname;
    nep.s.inVlucht++; nep.s.maxInVlucht = Math.max(nep.s.maxInVlucht, nep.s.inVlucht);
    await new Promise((r) => setTimeout(r, 120));
    const a = await nep.antwoord(pad);
    nep.s.inVlucht--;
    await page.evaluate(([p, st]) => (window as any).__noteer?.(`net ${p} → ${st}`), [pad.replace('/api/owner/mail/contacten/', ''), a.afbreken ? 'time-out' : String(a.status)]).catch(() => undefined);
    if (a.afbreken) return route.abort('timedout');
    return route.fulfill({ status: a.status, contentType: typeof a.body === 'string' ? 'text/html' : 'application/json', body: typeof a.body === 'string' ? a.body : JSON.stringify(a.body) });
  });
  const url = `http://127.0.0.1:${poort}/`;
  await page.goto(url);
  const breed = vp.width >= 560;
  const zelf = async (ev: string) => page.evaluate((e) => (window as any).__noteer(`GEBRUIKER ${e}`), ev);
  await page.waitForTimeout(1500);
  if (breed) { await page.locator('[data-venster-knop="min"]').first().click({ timeout: 4000 }).catch(() => undefined); await zelf('minimaliseert'); }
  else { // telefoon: begint ingeklapt; de gebruiker kiest «verbergen» niet maar laat ingeklapt → we klappen open en weer in
    await page.locator('.ctv-melding .ctv-melding-weg').first().click({ timeout: 4000 }).catch(() => undefined); await zelf('klapt open');
    await page.waitForTimeout(300);
    await page.locator('.ctv-melding .ctv-melding-weg').first().click({ timeout: 4000 }).catch(() => undefined); await zelf('klapt in'); }
  await page.waitForTimeout(SNEL ? 4000 : 9000);
  await zelf('wisselt naar «Контакти» en terug'); await page.evaluate(() => (window as any).__actief(false)); await page.waitForTimeout(800); await page.evaluate(() => (window as any).__actief(true));
  await page.waitForTimeout(3000);
  await zelf('(sessie opnieuw gecontroleerd → hermount)'); await page.evaluate(() => (window as any).__sessie(false)); await page.waitForTimeout(200); await page.evaluate(() => (window as any).__sessie(true));
  await page.waitForTimeout(SNEL ? 6000 : 12000);
  nep.s.oud = true; await zelf('(15 min later: hermount, periodiek bijwerken)'); await page.evaluate(() => (window as any).__hermount());
  await page.waitForTimeout(8000);
  const voorReload = await page.evaluate(() => (window as any).__overgangen);
  await page.screenshot({ path: join(UIT, `${naam}-voor-verversen.png`) });
  nep.s.oud = true;
  await page.reload(); await page.evaluate(() => (window as any).__noteer('GEBRUIKER ververst de pagina'));
  await page.waitForTimeout(6000);
  const naReload = await page.evaluate(() => (window as any).__overgangen);
  await page.screenshot({ path: join(UIT, `${naam}-na-verversen.png`) });
  await browser.close();
  const alles = [...voorReload, { t: -1, ev: '──── herladen ────' }, ...naReload];
  const zicht = (l: any[]) => l.filter((x) => x.ev.startsWith('zicht'));
  const naKeuze = (l: any[], open: RegExp) => { const i = l.findIndex((x) => /GEBRUIKER (minimaliseert|klapt in)/.test(x.ev)); return i < 0 ? [] : l.slice(i + 1).filter((x) => open.test(x.ev)); };
  const open = breed ? /→ venster:open$/ : /→ strook:open$/;
  const uitkomst = { naam, viewport: vp, zelfOpen: naKeuze(voorReload, open).length + zicht(naReload).filter((x) => open.test(x.ev)).length,
    zichtWissels: zicht(alles).length, verdwijnen: zicht(alles).filter((x) => /→ geen$/.test(x.ev)).length,
    startTerwijlLoopt: nep.s.startTerwijlLoopt, maxGelijktijdig: nep.s.maxInVlucht, autoAanroepen: nep.s.autoN, startAanroepen: nep.s.startN, statusAanroepen: nep.s.statusN, runs: nep.s.runs, eind: nep.s.staat, fouten };
  writeFileSync(join(UIT, `logboek-${naam}.json`), JSON.stringify({ uitkomst, overgangen: alles }, null, 1));
  return uitkomst;
}

async function main() {
  mkdirSync(UIT, { recursive: true });
  const map = mkdtempSync(join(tmpdir(), 'scan-stand-'));
  await build({ entryPoints: ['tests/e2e/hulp/scan-melding-stand/stand.tsx'], outdir: map, bundle: true, format: 'esm', target: 'es2022', jsx: 'automatic', loader: { '.svg': 'dataurl', '.png': 'dataurl', '.woff2': 'dataurl', '.woff': 'dataurl' }, define: { 'process.env.NODE_ENV': '"production"', 'import.meta.env.DEV': 'false', 'import.meta.env': '{}' }, logLevel: 'error' });
  const server = createServer((req, res) => {
    const p = (req.url || '/').split('?')[0];
    if (p === '/canonical-service.js') { res.writeHead(200, { 'content-type': 'text/javascript' }); res.end(readFileSync('public/canonical-service.js')); return; }
    if (p === '/stand.js' || p === '/stand.css') { const f = join(map, p.slice(1)); res.writeHead(200, { 'content-type': p.endsWith('.js') ? 'text/javascript' : 'text/css' }); res.end(existsSync(f) ? readFileSync(f) : ''); return; }
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    res.end('<!doctype html><html lang="uk"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/stand.css"><script src="/canonical-service.js"></script></head><body><script type="module" src="/stand.js"></script></body></html>');
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
  const poort = (server.address() as any).port;
  const { chromium } = createRequire(import.meta.url)(PW);
  const r = [await scenario(chromium, map, poort, 'computer-1440', { width: 1440, height: 900 }), await scenario(chromium, map, poort, 'telefoon-390', { width: 390, height: 844 })];
  server.close();
  console.log(JSON.stringify(r, null, 1));
  const strikt = process.env.SCAN_E2E_STRIKT === '1';
  const slecht = r.filter((x) => x.zelfOpen > 0 || x.startTerwijlLoopt > 0 || x.fouten.length);
  if (strikt && slecht.length) { console.error('MISLUKT:', slecht.map((x) => x.naam).join(', ')); process.exit(1); }
}
main().catch((e) => { console.error(e); process.exit(1); });
