// E2E «Відкат» (29.10.2026) in ISOLATIE: de echte wizard (stand hulp/terugdraai-stand) tegen een NEPSERVER in het geheugen die het
// contract van src/besluit/besluit-client.ts volgt; de passkey is een nep-navigator.credentials.get. Geen echte server, geen productie:
// eigen http-server op 127.0.0.1, elk verzoek naar een andere host wordt afgebroken en geteld (eis 0).
// Gebruik: node scripts/e2e-lokaal.mjs terugdraaien-ui     Schermafdrukken: E2E_SCREENSHOTS (standaard /workspace/release-terugdraaien/screens).
import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { existsSync, mkdirSync, mkdtempSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { build } from 'esbuild';
import { checker } from '../eenheid/hulp/nep-google';
import { chromeArgs } from './server';

const PW = process.env.PLAYWRIGHT_CORE || '/workspace/e2e-tools/node_modules/playwright-core';
const UIT = process.env.E2E_SCREENSHOTS || '/workspace/release-terugdraaien/screens';
const CHROME = process.env.CHROME || '/usr/bin/google-chrome';
type Page = import('playwright-core').Page;
type Scenario = 'klaar' | 'vast' | 'inbox' | 'herpakt';

const RELEASES = [
  { naam: '20261028-224316', commit: '9d157545528b', actief: true, vorige: false, bruikbaar: true, versie: '20261028-224316', auteur: 'Eigenaar Test', agent: 'grok', bronCommit: 'zonder-git:op basis 20261028-215049 plus herstel technische modules', samenvatting: 'Herstel: «Технічні модулі не завантажено» in de technische ruimte.' },
  { naam: '20261028-215049', commit: '4c46fba1', actief: false, vorige: true, bruikbaar: true, versie: '20261028-215049', auteur: 'Eigenaar Test', agent: 'grok', bronCommit: 'zonder-git:agenda v3 op basis 20261028-203043', samenvatting: 'Agenda v3: nieuwe agenda achter de vlag agenda-v3 (standaard uit).' },
  { naam: '20261028-203043', commit: '', actief: false, vorige: false, bruikbaar: true, versie: '20261028-203043', auteur: 'Eigenaar Test', agent: 'grok', bronCommit: 'a'.repeat(40), samenvatting: 'Mobiele technische balk met hamburgermenu.' },
  { naam: '20261028-194502', commit: '', actief: false, vorige: false, bruikbaar: true, versie: '20261028-194502', auteur: 'Eigenaar Test', agent: 'grok', bronCommit: '', samenvatting: 'Schakelaars van functies, ronde 5.' },
  { naam: '20261028-193136', commit: '', actief: false, vorige: false, bruikbaar: true, versie: '20261028-193136', auteur: '', agent: '', bronCommit: '', samenvatting: '' },
  { naam: '20261028-191200', commit: '', actief: false, vorige: false, bruikbaar: true, versie: '20261028-191200', auteur: 'Eigenaar Test', agent: 'grok', bronCommit: '', samenvatting: '' },
];

function nep(scenario: Scenario) {
  const s = { status: 0, aanroepen: [] as string[] };
  const t0 = Date.now();
  const besluit = (staat: string, extra: Record<string, unknown> = {}) => ({ id: '0b6f2f9e-1c55-4f7a-9b1e-2a4b0c9d7e11', soort: 'terugdraaien', inhoud: { van: '20261028-224316', naar: '20261028-215049' }, hash: 'f'.repeat(64), staat, code: staat === 'klaar' ? 'OK' : '', uitkomst: null, passkey: 'ab12cd34', door: 'pavlo', aangemaaktOp: new Date(t0).toISOString(), ondertekendOp: new Date(t0).toISOString(), afgerondOp: '', ...extra });
  const antwoord = (pad: string): [number, unknown] => {
    s.aanroepen.push(pad);
    if (pad === '/api/owner/besluit/overzicht') return [200, { inbox: scenario === 'inbox' ? { pad: '/srv/mijn-ruimte/besluit-inbox', schrijfbaar: false, code: 'INBOX_ALLEEN_LEZEN', detail: 'EROFS: /srv/mijn-ruimte/besluit-inbox' } : { pad: '/srv/mijn-ruimte/besluit-inbox', schrijfbaar: true, code: '', detail: '' }, stand: { bijgewerkt: new Date().toISOString(), rechtenLeesbaar: true, hosts: [], hostsUitOmgeving: [], rootBijgewerkt: '', schakelaars: { terugdraaienDirect: false, terugdraaienPasskey: true, externeHostsPasskey: true }, actief: '20261028-224316', vorige: '20261028-215049', releases: RELEASES }, passkeys: [{ kort: 'ab12cd34ef56', label: 'iPhone Pavlo' }], rpId: 'tarasevych.com', besluiten: [], limieten: { wachtMs: 12000, uitkomstMinuten: 15, maxHosts: 50 } }];
    if (pad === '/api/owner/besluit/starten') return [200, { id: '0b6f2f9e-1c55-4f7a-9b1e-2a4b0c9d7e11', soort: 'terugdraaien', inhoud: { van: '20261028-224316', naar: '20261028-215049' }, hash: 'f'.repeat(64), uitdagingId: 'u1', verloopt: Date.now() + 300000, publicKey: { challenge: 'AAAA', rpId: 'tarasevych.com', timeout: 60000, allowCredentials: [{ type: 'public-key', id: 'AAAA' }] }, stand: { actief: '20261028-224316', vorige: '20261028-215049', hosts: [] } }];
    if (pad === '/api/owner/besluit/ondertekenen') return [200, besluit('ondertekend')];
    if (pad === '/api/owner/besluit/status') {
      s.status++;
      const tijd = (n: number) => new Date(t0 + n * 1000).toISOString();
      if (scenario === 'vast') return [200, { besluit: besluit('ondertekend'), stand: { actief: '20261028-224316' }, verwerking: { inInbox: true, seconden: 20 + s.status * 25 }, gebeurtenissen: [] }];
      if (s.status < 2) return [200, { besluit: besluit('ondertekend'), stand: { actief: '20261028-224316' }, verwerking: { inInbox: true, seconden: 2 }, gebeurtenissen: [] }];
      if (s.status < 3) return [200, { besluit: besluit('ondertekend'), stand: { actief: '20261028-224316' }, verwerking: { inInbox: false, seconden: 5 }, gebeurtenissen: [{ tijd: tijd(4), code: 'BESLUIT_ONTVANGEN', niveau: 'info', uk: 'Root отримав рішення й перевіряє підпис passkey.', nl: 'Root ontving het besluit en controleert de passkey-handtekening.' }] }];
      return [200, { besluit: besluit('klaar', { uitkomst: { uk: 'Відкочено на 20261028-215049.', nl: 'Teruggedraaid naar 20261028-215049.', tijd: tijd(12), actief: '20261028-215049' } }), stand: { actief: '20261028-215049', vorige: '20261028-224316' }, verwerking: { inInbox: false, seconden: 12 },
        gebeurtenissen: [{ tijd: tijd(4), code: 'BESLUIT_ONTVANGEN', niveau: 'info', uk: 'Root отримав рішення й перевіряє підпис passkey.', nl: 'Root ontving het besluit en controleert de passkey-handtekening.' }, { tijd: tijd(11), code: 'TERUG_OK', niveau: 'info', uk: 'Повернуто на випуск 20261028-215049 за рішенням власника з підписом passkey.', nl: 'Teruggedraaid naar release 20261028-215049 op besluit van de eigenaar met passkey-handtekening.' }],
        nacontrole: { ok: true, stappen: [{ id: 'tech-bestanden-open', ok: true, detail: '' }] } }];
    }
    if (pad === '/api/owner/uitrol/run') return [200, { run: { id: 'ssh-20261029T100000000000Z-abcd1234', methode: 'ssh', versie: '20261028-224316', release: '20261028-224316', staat: 'klaar', stap: 'klaar', sub: '', pct: 100, code: 'SSH_OK', uk: 'Випуск 20261028-224316 встановлено з SSH, користувач pavlo.', nl: 'Release 20261028-224316 geïnstalleerd via SSH, gebruiker pavlo.', stappen: [], voorstelId: '', sha256: '7e28ccf8e02a7ce3b8bd29b9f9c98359e9dce2c8673b5983ee8c7479f95347be', bytes: 29884211, commit: 'zonder-git:op basis 20261028-215049 plus herstel technische modules', voorbereider: 'Eigenaar Test · grok', goedgekeurdDoor: 'ssh-root', wijzigingen: 'Herstel: «Технічні модулі не завантажено» in de technische ruimte.', wie: 'pavlo', adres: '', logRegels: 0, gestart: '2026-10-28T22:50:00Z', bijgewerkt: '2026-10-28T22:58:00Z', geeindigd: '2026-10-28T22:58:00Z', pakket: scenario === 'herpakt' ? { bewaard: true, sha256: 'd9bd3db4' + '0'.repeat(56), grootte: 8571289, geleverdSha256: '', herkomst: 'opnieuw-ingepakt' } : { bewaard: true, sha256: '7e28ccf8e02a7ce3b8bd29b9f9c98359e9dce2c8673b5983ee8c7479f95347be', grootte: 29884211, geleverdSha256: '7e28ccf8e02a7ce3b8bd29b9f9c98359e9dce2c8673b5983ee8c7479f95347be', herkomst: 'geleverd' } }, gebeurtenissen: [] }];
    if (pad === '/api/owner/uitrol/run/regels') return [200, { regels: [] }];
    return [404, { error: 'NIET_IN_STAND' }];
  };
  return { s, antwoord };
}

export async function main(): Promise<number> {
  const { check, einde } = checker('e2e terugdraaien-ui');
  const map = mkdtempSync(join(tmpdir(), 'trd-'));
  await build({ entryPoints: ['tests/e2e/hulp/terugdraai-stand/stand.tsx'], outdir: map, bundle: true, format: 'esm', splitting: true, target: 'es2022', jsx: 'automatic', loader: { '.svg': 'dataurl', '.png': 'dataurl', '.woff2': 'dataurl', '.woff': 'dataurl' }, define: { 'process.env.NODE_ENV': '"production"', 'import.meta.env.DEV': 'false', 'import.meta.env': '{}' }, logLevel: 'error' });
  const css = `:root{--veilig-boven:0px;--veilig-onder:0px;--veilig-links:0px;--veilig-rechts:0px}body{margin:0;font:15px system-ui,sans-serif}`;
  const html = `<!doctype html><html lang="uk"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>stand terugdraaien</title><style>${css}</style><link rel="stylesheet" href="/stand.css"><script src="/canonical-service.js"></script></head><body><script type="module" src="/stand.js"></script></body></html>`;
  const server = createServer((req, res) => {
    const p = (req.url || '/').split('?')[0];
    if (p === '/canonical-service.js') { res.writeHead(200, { 'content-type': 'text/javascript' }).end(existsSync('public/canonical-service.js') ? readFileSync('public/canonical-service.js') : ''); return; }
    const f = join(map, p.replace(/^\/+/, ''));
    if (p !== '/' && existsSync(f) && !p.endsWith('/')) { res.writeHead(200, { 'content-type': p.endsWith('.css') ? 'text/css' : 'text/javascript' }).end(readFileSync(f)); return; }
    res.writeHead(200, { 'content-type': 'text/html' }).end(html);
  });
  await new Promise<void>((ok) => server.listen(0, '127.0.0.1', ok));
  const poort = (server.address() as { port: number }).port;
  mkdirSync(UIT, { recursive: true });
  const { chromium } = createRequire(import.meta.url)(PW) as typeof import('playwright-core');
  const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: chromeArgs(1) });
  const geweigerd: string[] = [], fouten: string[] = [];
  const open = async (o: { scenario: Scenario; breedte: number; donker: boolean; weergave?: string }) => {
    const n = nep(o.scenario);
    const c = await browser.newContext({ viewport: { width: o.breedte, height: o.breedte < 500 ? 844 : 1000 }, colorScheme: o.donker ? 'dark' : 'light', hasTouch: o.breedte < 500, locale: 'uk-UA', timezoneId: 'Europe/Brussels' });
    const page = await c.newPage();
    // Nep-passkey: geeft een assertie-vorm terug (de nepserver controleert niets). Alleen in deze stand.
    await page.addInitScript(() => {
      const buf = (n: number) => new Uint8Array(n).fill(7).buffer;
      Object.defineProperty(navigator, 'credentials', { configurable: true, value: { get: async () => ({ rawId: buf(16), response: { clientDataJSON: buf(32), authenticatorData: buf(37), signature: buf(64) } }), create: async () => null } });
      if (!(window as any).PublicKeyCredential) (window as any).PublicKeyCredential = function () { /* stand */ };
    });
    await page.route('**/*', async (r) => {
      const u = new URL(r.request().url());
      if (u.hostname !== '127.0.0.1' || u.port !== String(poort)) { geweigerd.push(u.href); return r.abort(); }
      if (u.pathname.startsWith('/api/')) { const a = n.antwoord(u.pathname); return r.fulfill({ status: a[0], contentType: 'application/json', body: JSON.stringify(a[1]) }); }
      return r.continue();
    });
    page.on('pageerror', (e) => fouten.push(String(e)));
    await page.goto(`http://127.0.0.1:${poort}/?thema=${o.donker ? 'donker' : 'licht'}${o.weergave ? `&weergave=${o.weergave}` : ''}`);
    return { c, page, n };
  };
  const shot = (p: Page, naam: string) => p.screenshot({ path: join(UIT, `${naam}.png`), fullPage: true, animations: 'disabled' }).catch(() => undefined);
  const geenOverloop = (p: Page) => p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
  try {
    for (const breedte of [390, 1440]) for (const donker of [false, true]) {
      const naam = `${breedte}-${donker ? 'donker' : 'licht'}`;
      // 1–2: keuze en controle
      const { c, page, n } = await open({ scenario: 'klaar', breedte, donker });
      await page.waitForSelector('[data-besluit-meester=terugdraaien] .bsl-keuze', { timeout: 15000 }).catch(async (e) => { await shot(page, 'FOUT'); console.log('BODY', (await page.locator('body').innerText()).slice(0, 800), fouten, n.s.aanroepen); throw e; });
      check(`${naam}: vijf versies van de server, zonder de actieve`, (await page.locator('.bsl-keuze').count()) === 5);
      check(`${naam}: geen horizontale scroll`, await geenOverloop(page));
      await shot(page, `terugdraaien-1-kiezen-${naam}`);
      // bron «apparaat»
      await page.click('[data-bron=apparaat]');
      check(`${naam}: bron «з пристрою» toont de bestandskeuze`, await page.locator('.bsl-bestand input[type=file]').count() === 1);
      if (breedte === 1440 && !donker) await shot(page, `terugdraaien-1b-apparaat-${naam}`);
      await page.click('[data-bron=server]');
      // 3: voorbereiden; 4: passkey; 5: volgen tot «klaar»
      await page.click('[data-besluit-knop=voorbereiden]');
      await page.waitForSelector('[data-besluit-knop=ondertekenen]', { timeout: 10000 });
      if (breedte === 390 && !donker) await shot(page, `terugdraaien-3-voorbereid-${naam}`);
      await page.click('[data-besluit-knop=ondertekenen]');
      await page.waitForSelector('[data-nacontrole]', { timeout: 40000 });
      await page.waitForTimeout(300);
      const term = await page.locator('.bsl-terminal-bak').innerText();
      check(`${naam}: terminal toont site- en serverregels (TERUG_OK)`, term.includes('TERUG_OK') && term.includes('Підпис прийнято'), term.slice(0, 200));
      check(`${naam}: controle na terugdraaien zichtbaar`, await page.locator('[data-nacontrole=ok]').count() === 1);
      check(`${naam}: stappenbalk op 100 %`, (await page.locator('.bsl-balk').getAttribute('aria-valuenow')) === '100');
      check(`${naam}: alleen eigen nepserver aangesproken`, n.s.aanroepen.includes('/api/owner/besluit/ondertekenen'));
      await page.locator('[data-blok=installeren]').scrollIntoViewIfNeeded(); await page.waitForTimeout(200);
      await shot(page, `terugdraaien-5-klaar-${naam}`);
      await c.close();
      // dienst haalt het besluit niet op → melding met diagnosecommando's
      const v = await open({ scenario: 'vast', breedte, donker });
      await v.page.waitForSelector('[data-besluit-knop=voorbereiden]', { timeout: 15000 });
      await v.page.click('[data-besluit-knop=voorbereiden]');
      await v.page.waitForSelector('[data-besluit-knop=ondertekenen]');
      await v.page.click('[data-besluit-knop=ondertekenen]');
      await v.page.waitForSelector('.bsl-diagnose', { timeout: 30000 });
      const diag = await v.page.locator('.bsl-diagnose').innerText();
      check(`${naam}: na 60 s duidelijke melding met systemctl/journalctl`, diag.includes('systemctl status mijn-ruimte-besluit.path mijn-ruimte-besluit.service') && diag.includes('journalctl -u mijn-ruimte-besluit -n 100'));
      await v.page.locator('.bsl-diagnose').scrollIntoViewIfNeeded(); await v.page.waitForTimeout(200);
      await shot(v.page, `terugdraaien-6-niet-opgepakt-${naam}`);
      await v.c.close();
      // pakketgegevens van een SSH-installatie
      const r = await open({ scenario: 'klaar', breedte, donker, weergave: 'run' });
      await r.page.waitForSelector('.ut-detail', { timeout: 15000 });
      const tekst = await r.page.locator('.ut-detail').innerText();
      check(`${naam}: pakket toont wie, «SSH, root, без passkey», zonder-git, grootte en sha256`, tekst.includes('Eigenaar Test · grok') && tekst.includes('SSH, root, без passkey') && tekst.includes('op basis 20261028-215049') && tekst.includes('7e28ccf8') && /28[,.]5\s*MB|MB/.test(tekst) && !tekst.includes('правила 3'), tekst.slice(0, 300));
      const verschilKlaar = await r.page.locator('[data-sha-verschil]').count();
      await shot(r.page, `pakketgegevens-${naam}`);
      await r.c.close();
      check(`${naam}: geleverd = bewaard → twee sha256-regels, geen waarschuwing`, tekst.includes('sha256 доставленого архіву') && tekst.includes('sha256 збереженого файлу') && verschilKlaar === 0);
      // 29.10.2026: opnieuw ingepakt (oude pipefail-fout) → waarschuwing en uitleg
      const h = await open({ scenario: 'herpakt', breedte, donker, weergave: 'run' });
      await h.page.waitForSelector('.ut-detail', { timeout: 15000 });
      check(`${naam}: opnieuw ingepakt → waarschuwing + «geleverd onbekend»`, (await h.page.locator('[data-sha-verschil]').count()) === 1 && (await h.page.locator('[data-sha-geleverd=onbekend]').count()) === 1);
      check(`${naam}: run-detail zonder horizontale scroll`, await geenOverloop(h.page));
      await h.page.locator('[data-sha-verschil]').scrollIntoViewIfNeeded(); await h.page.waitForTimeout(200);
      await shot(h.page, `pakket-opnieuw-ingepakt-${naam}`);
      await h.c.close();
      // 29.10.2026: app mag niet in besluit-inbox schrijven → zichtbaar in stap 2, ondertekenen geblokkeerd
      const ib = await open({ scenario: 'inbox', breedte, donker });
      await ib.page.waitForSelector('[data-besluit-blok]', { timeout: 15000 });
      const blokTekst = await ib.page.locator('[data-besluit-blok]').innerText();
      check(`${naam}: inbox alleen-lezen → melding met oorzaak en pad`, blokTekst.includes('лише для читання') && blokTekst.includes('EROFS: /srv/mijn-ruimte/besluit-inbox'), blokTekst.slice(0, 160));
      check(`${naam}: inbox alleen-lezen → voorbereiden kan niet`, await ib.page.locator('[data-besluit-knop=voorbereiden]:not([disabled])').count() === 0);
      await ib.page.locator('[data-besluit-blok]').scrollIntoViewIfNeeded(); await ib.page.waitForTimeout(200);
      await shot(ib.page, `besluit-inbox-alleen-lezen-${naam}`);
      await ib.c.close();
    }
  } finally {
    await browser.close(); server.close();
  }
  check('geen verzoeken naar andere hosts', geweigerd.length === 0, geweigerd.slice(0, 3).join(', '));
  check('geen paginafouten', fouten.length === 0, fouten.slice(0, 3).join(' | '));
  return einde();
}
