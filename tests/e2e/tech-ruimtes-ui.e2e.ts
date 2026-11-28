// E2E «Два простори» (vlag tech-ruimtes-v2) in ISOLATIE: echte TechLaag + wisselknop + vensters (stand hulp/ruimtes-stand) tegen een
// NEPSERVER in het geheugen die het contract van docs/ontwerp/TECH-RUIMTES-API.md volgt. Geen echte server, geen DB, geen productie:
// eigen http-server op 127.0.0.1; ELK verzoek naar een andere host wordt afgebroken en geteld (eis 0); chromeArgs() als overal.
// Gebruik: node scripts/e2e-lokaal.mjs tech-ruimtes-ui   (of los: zie deploy/RUNBOOK-TECH-RUIMTES-UI.md)
// Screenshots: ui-*.png in E2E_SCREENSHOTS (standaard /workspace/audit-technisch).
import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { mkdirSync, mkdtempSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { build } from 'esbuild';
import { checker } from '../eenheid/hulp/nep-google';
import { chromeArgs } from './server';

const innerWidthMin = (b: number) => (b <= 768 ? 44 : 40);
const PW = process.env.PLAYWRIGHT_CORE || '/workspace/e2e-tools/node_modules/playwright-core';
const UIT = process.env.E2E_SCREENSHOTS || '/workspace/audit-technisch';
const CHROME = process.env.CHROME || '/usr/bin/google-chrome';
type Page = import('playwright-core').Page;

/** Nepserver: één toestand per browsercontext. */
function nep(opties: { vlag: boolean; openMag: boolean; recht: boolean }) {
  const s = { vlag: opties.vlag, actief: 'prive' as 'prive' | 'technisch', pauze: false, sessie: null as null | { id: string; modus: string; eindTijd: number | null; gestartOp: number }, aanroepen: [] as string[], aiLaatst: null as any };
  const termijnen = () => [
    ...[15, 30, 60, 120, 240, 480].map((m) => ({ modus: 'tijd', minuten: m, label: { uk: '', nl: '' }, beschikbaar: m <= 60 || opties.openMag, ...(m > 60 && !opties.openMag ? { reden: { uk: 'роль «Адміністратор» дозволяє не більше 1 год.', nl: 'de rol «Beheerder» staat hoogstens 1 u toe.' } } : {}) })),
    { modus: 'tot-technisch-einde', label: { uk: '', nl: '' }, beschikbaar: opties.openMag, ...(opties.openMag ? {} : { reden: { uk: 'роль «Адміністратор» дозволяє не більше 1 год.', nl: 'de rol «Beheerder» staat hoogstens 1 u toe.' } }) },
    { modus: 'tot-site-uitloggen', label: { uk: '', nl: '' }, beschikbaar: opties.openMag, ...(opties.openMag ? {} : { reden: { uk: 'роль «Адміністратор» дозволяє не більше 1 год.', nl: 'de rol «Beheerder» staat hoogstens 1 u toe.' } }) },
  ];
  const iso = (x: number | null) => (x === null ? null : new Date(x).toISOString());
  const tech = () => !!s.sessie && s.actief === 'technisch' && !s.pauze;
  const status = () => ({ aan: s.vlag, actief: tech() ? 'technisch' : 'prive', technischToegestaan: opties.recht, pauze: s.pauze && !!s.sessie, sessie: s.sessie ? { ...s.sessie, eindTijd: iso(s.sessie.eindTijd), gestartOp: iso(s.sessie.gestartOp), grensTijd: iso(Date.now() + 864e5), rollen: ['eigenaar'], mogelijkheden: [], reden: 'stand' } : null, eigenaar: true, schaduw: false, nu: new Date().toISOString(), termijnen: termijnen(), maxMinuten: opties.openMag ? 480 : 60, rollen: [{ naam: 'Власник', maxMinuten: 480 }, ...(opties.openMag ? [] : [{ naam: 'Адміністратор', maxMinuten: 60 }])] });
  const techStatus = () => ({
    nu: Date.now(),
    profiel: opties.recht ? { userId: 'u1', profielId: 'tp-1', rollen: ['eigenaar'], maxMinuten: 480, maxNu: 480, band: { kleur: 'amber', patroon: 'strepen' }, laatstActief: null, ervenNieuweTabbladen: false } : null,
    activatie: s.sessie && tech() ? { id: s.sessie.id, profielId: 'tp-1', rollen: ['eigenaar'], mogelijkheden: [], reden: 'stand', begin: s.sessie.gestartOp, eind: s.sessie.eindTijd ?? Date.now() + 366 * 864e5, modus: s.sessie.modus === 'tijd' ? 'tijd' : s.sessie.modus === 'tot-site-uitloggen' ? 'tot-uitloggen' : 'tot-verlaten' } : null,
    catalogus: { rollen: [], kleuren: { amber: { bg: '#f5b400', fg: '#1a1200', naam: ['Бурштин', 'Amber'] } }, patronen: { strepen: ['Смуги', 'Strepen'] }, duren: [15, 30, 60] },
  });
  // Vorm exact zoals docs/ontwerp/TECH-RUIMTES-API.md (ISO-tijden, aparte lijsten).
  const toegang = () => ({ magBeheren: tech(),
    mensen: tech() ? [{ userId: 'u2', email: 'helper@example.org', naam: 'Helper', rollen: ['ondersteuning'], maxMinuten: 60, eigenaar: false, actiefTot: iso(Date.now() + 3600e3), ingetrokken: false }] : [],
    sessies: s.sessie ? [{ id: s.sessie.id, modus: s.sessie.modus, eindTijd: iso(s.sessie.eindTijd), grensTijd: iso(Date.now() + 864e5), gestartOp: iso(s.sessie.gestartOp), actief: !s.pauze, dezeSessie: true }] : [],
    ai: [{ verbindingId: 'ai-1', naam: 'Claude (MCP)', agent: 'claude', ruimtes: ['prive'], termijn: null, eindTijd: null, tokenTot: null, bron: 'mcp-oauth' }],
    extensie: [{ id: 'e1', agentId: 'Chrome · цей ПК', ruimte: 'prive', eindeSoort: 'tot-site-uitloggen', eindTijd: null, overleeftTabUitloggen: true }],
    codes: [{ id: 'c1', naam: 'Код для гостя', scopes: ['mail.lezen'], verlooptOp: iso(Date.now() + 7200e3) }],
    vlagTests: [{ sleutel: 'werkblad-v3', waarde: true, tot: iso(Date.now() + 5 * 3600e3) }],
    fouten: [] as string[] });
  const antwoord = (pad: string, body: any): unknown => {
    s.aanroepen.push(pad);
    if (pad.startsWith('/api/ofrep/v1/evaluate/flags/tech-ruimtes-v2')) return { key: 'tech-ruimtes-v2', value: s.vlag };
    if (pad.startsWith('/api/ofrep')) return { value: false };
    if (pad === '/api/owner/tech/status') return techStatus();
    const R = '/api/owner/hub/tech/ruimtes/';
    if (pad.startsWith(R)) {
      const op = pad.slice(R.length);
      if (op === 'status') return status();
      if (op === 'starten') { if (!body.reden || String(body.reden).trim().length < 3) throw new Error('REDEN_ONGELDIG'); s.sessie = { id: 'ts-1', modus: body.modus, eindTijd: body.modus === 'tijd' ? Date.now() + body.minuten * 60000 : null, gestartOp: Date.now() }; s.actief = 'technisch'; return status(); }
      if (op === 'wisselen') { if (body.naar === 'technisch' && !s.sessie) throw new Error('GEEN_TECH_SESSIE'); s.actief = body.naar; if (body.naar === 'technisch') s.pauze = false; return status(); }
      if (op === 'pauzeren') { if (!s.sessie) throw new Error('GEEN_TECH_SESSIE'); s.pauze = body.aan === true; return status(); }
      if (op === 'verlengen') { if (s.sessie) s.sessie.eindTijd = body.soort === 'bijtellen' ? (s.sessie.eindTijd ?? Date.now()) + body.minuten * 60000 : Date.now() + body.minuten * 60000; return status(); }
      if (op === 'beeindigen') { s.sessie = null; s.actief = 'prive'; s.pauze = false; return status(); }
      if (op === 'toegang') return toegang();
      if (op === 'ai-zetten') { if (!tech()) throw new Error('TECH_RUIMTE_VEREIST'); s.aiLaatst = body; return toegang(); }
    }
    return {};
  };
  return { s, antwoord };
}

export async function main(): Promise<number> {
  const { check, einde } = checker('e2e tech-ruimtes-ui');
  const map = mkdtempSync(join(tmpdir(), 'tr-ui-'));
  await build({ entryPoints: ['tests/e2e/hulp/ruimtes-stand/stand.tsx'], outdir: map, bundle: true, format: 'esm', splitting: true, target: 'es2022', jsx: 'automatic', loader: { '.svg': 'dataurl', '.png': 'dataurl', '.woff2': 'dataurl' }, define: { 'process.env.NODE_ENV': '"production"', 'import.meta.env.DEV': 'false', 'import.meta.env': '{}' }, logLevel: 'error' });
  const css = `:root{--veilig-boven:0px;--veilig-onder:0px;--veilig-links:0px;--veilig-rechts:0px}body{margin:0;font:15px system-ui,sans-serif;background:#f3f4f6;color:#1f2937}html.theme-dark body{background:#0b1016;color:#e5e7eb}.stand-kop{display:flex;flex-wrap:wrap;gap:10px;align-items:center;padding:10px 12px;border-bottom:1px solid #8885}.stand-kop button{min-height:40px;border-radius:8px;border:1px solid #8888;background:transparent;color:inherit;font:inherit;padding:0 10px}.stand-main{padding:12px}textarea{display:block;width:100%;box-sizing:border-box;margin-top:6px}`;
  const html = `<!doctype html><html lang="uk"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>stand ruimtes</title><style>${css}</style><link rel="stylesheet" href="/stand.css"><script src="/canonical-service.js"></script></head><body><script type="module" src="/stand.js"></script></body></html>`;
  const server = createServer((req, res) => {
    const p = (req.url || '/').split('?')[0];
    if (p === '/canonical-service.js') { res.writeHead(200, { 'content-type': 'text/javascript' }).end(readFileSync('public/canonical-service.js')); return; }
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
  const open = async (o: { vlag: boolean; openMag?: boolean; recht?: boolean; breedte?: number; donker?: boolean; nl?: boolean; strook?: Record<string, unknown> }) => {
    const n = nep({ vlag: o.vlag, openMag: o.openMag ?? false, recht: o.recht ?? true });
    const breedte = o.breedte ?? 1280;
    const c = await browser.newContext({ viewport: { width: breedte, height: breedte < 500 ? 844 : 900 }, colorScheme: o.donker ? 'dark' : 'light', hasTouch: breedte < 500, locale: o.nl ? 'nl-BE' : 'uk-UA', timezoneId: 'Europe/Brussels' });
    // Strookvoorkeur vooraf (standaard is nu «auto»: de band klapt zelf in); scenario 6 test het handmatig in- en uitklappen.
    if (o.strook) await c.addInitScript((v) => { try { localStorage.setItem('mr-tech-strook', v); } catch { /* geen opslag */ } }, JSON.stringify(o.strook));
    const page = await c.newPage();
    await page.route('**/*', async (r) => {
      const u = new URL(r.request().url());
      if (u.hostname !== '127.0.0.1' || u.port !== String(poort)) { geweigerd.push(u.href); return r.abort(); }
      if (u.pathname.startsWith('/api/')) {
        let body: any = {}; try { body = JSON.parse(r.request().postData() || '{}'); } catch { /* leeg */ }
        try { return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(n.antwoord(u.pathname, body)) }); }
        catch (e) { return r.fulfill({ status: 409, contentType: 'application/json', body: JSON.stringify({ error: String((e as Error).message) }) }); }
      }
      return r.continue();
    });
    page.on('pageerror', (e) => { fouten.push(String(e)); if (process.env.E2E_LOG) console.log('PAGEERROR', String(e)); });
    if (process.env.E2E_LOG) page.on('console', (m) => console.log('CONSOLE', m.type(), m.text()));
    await page.goto(`http://127.0.0.1:${poort}/${o.nl ? 'nl/' : ''}?thema=${o.donker ? 'donker' : 'licht'}`);
    await page.waitForSelector('[data-stand-kop]');
    await page.waitForTimeout(400);
    return { c, page, n };
  };
  const shot = (p: Page, naam: string) => p.screenshot({ path: join(UIT, `ui-${naam}.png`) }).catch(() => undefined);
  const standId = (p: Page) => p.evaluate(() => window.__standId);
  try {
    // ── 1. Vlag UIT: precies de oude weergave ──
    {
      const { c, page } = await open({ vlag: false });
      await page.waitForSelector('[data-stand="oud-tech"]');
      check('vlag uit: geen wisselknop', await page.locator('.rw').count() === 0);
      await page.click('[data-stand="oud-tech"]');
      await page.waitForSelector('[data-tech-venster="activeren"]');
      check('vlag uit: oud venster met <select data-tech-duur>', await page.locator('[data-tech-duur]').count() === 1 && await page.locator('[data-tech-venster="ruimte-start"]').count() === 0);
      const opties = await page.locator('[data-tech-duur] option').allTextContents();
      check('vlag uit: oude termijnen ongewijzigd (geen nieuwe woorden)', !opties.some((x) => x.includes('на сайті')), opties.join(' | '));
      await shot(page, 'vlag-uit-1280');
      await c.close();
    }
    // ── 2. Vlag AAN, licht, computer, rol met beperking ──
    {
      const { c, page, n } = await open({ vlag: true });
      await page.waitForSelector('.rw [role="switch"][aria-checked="false"]');
      // INTEG-001 (03.11.2026): één tumbler «Технічний простір» i.p.v. twee segmenten (wens van de eigenaar).
      check('tumbler: één schakelaar «Технічний простір», uit (gewone ruimte)', await page.locator('.rw [role="switch"]').count() === 1 && ((await page.textContent('.rw .rw-naam')) || '') === 'Технічний простір' && ((await page.textContent('.rw .rw-aanuit')) || '') === 'вимкнено');
      check('stand «не розпочато»', (await page.textContent('.rw-stand')) === 'не розпочато');
      const id0 = await standId(page);
      await page.fill('[data-stand="tekst"]', 'мій текст 42');
      await page.click('.rw [data-naar="technisch"]');
      await page.waitForSelector('[data-tech-venster="ruimte-start"]');
      await page.click('.rs-chip[data-minuten="60"]');
      const namen = await page.locator('.rs .rs-naam').allTextContents();
      check('startvenster: «На час (до HH:MM)» exact', namen.some((x) => /^На час \(до \d\d:\d\d\)$/.test(x)), namen.join(' | '));
      check('tijdkeuzes «15 хв|30 хв|1 год|2 год|4 год|8 год»', (await page.locator('.rs-chip').allTextContents()).join('|') === '15 хв|30 хв|1 год|2 год|4 год|8 год');
      check('startvenster: «До завершення технічного сеансу» exact', namen.includes('До завершення технічного сеансу'));
      check('startvenster: «До виходу з облікового запису на сайті» exact', namen.includes('До виходу з облікового запису на сайті'));
      const uit = page.locator('[data-termijn][data-beschikbaar="0"]');
      check(`niet beschikbare keuzes zichtbaar en uitgegrijsd (${await uit.count()})`, await uit.count() === 5 && await uit.first().locator('input').isDisabled());
      check('reden bij uitgegrijsde keuze', ((await page.locator('.rs-kaart[data-termijn="tot-site-uitloggen"] [data-termijn-reden]').textContent()) || '').includes('Недоступно: роль «Адміністратор» дозволяє не більше 1 год.'));
      check('één regel uitleg onder de gekozen tijd', ((await page.locator('[data-rs-tijd] .rs-uitleg').textContent()) || '').includes('Ваш вхід на сайт лишається'));
      check('reden bij uitgegrijsde tijden', ((await page.textContent('[data-termijn-reden="tijd"]')) || '') === 'Недоступно (2 год, 4 год, 8 год): роль «Адміністратор» дозволяє не більше 1 год.', (await page.textContent('[data-termijn-reden="tijd"]')) || '');
      await shot(page, 'start-licht-1280');
      check('zonder reden: knop uit met «Вкажіть причину»', await page.locator('[data-tech-knop="ruimte-start"]').isDisabled() && (await page.textContent('[data-tech-knop="ruimte-start"]')) === 'Вкажіть причину');
      await page.click('[data-rs-sjabloon]');
      const knop = (await page.textContent('[data-tech-knop="ruimte-start"]')) || '';
      check('knop zegt wat er gebeurt: «Підтвердити й увійти · На час (до …)»', /^Підтвердити й увійти · На час \(до \d\d:\d\d\)$/.test(knop), knop);
      await page.click('[data-tech-knop="ruimte-start"]');
      await page.waitForSelector('[data-rs-melding]');
      check('uitkomst getoond «Готово: технічний простір відкрито.»', (await page.textContent('[data-rs-melding]')) === 'Готово: технічний простір відкрито.');
      await page.waitForSelector('.tech-band', { timeout: 5000 });
      check('band verschijnt zonder herladen', await standId(page) === id0);
      check('getypte tekst blijft', await page.inputValue('[data-stand="tekst"]') === 'мій текст 42');
      check('band: wisselknop + «Вийти…» (geen «Вийти з технічного»)', await page.locator('.tech-band .rw').count() === 1 && await page.locator('[data-tech-knop="uitloggen"]').count() === 1 && await page.locator('[data-tech-knop="uit"]').count() === 0);
      check('kop: tumbler aan', await page.locator('.stand-kop [role="switch"][aria-checked="true"]').count() === 1);
      await page.waitForTimeout(800);
      await shot(page, 'technisch-licht-1280');
      // RUIMTE-WEERGAVE-001: wisselen naar de gewone ruimte = alleen de weergave van dit tabblad; GEEN pauze.
      check('knoppen «Пауза» en «Завершити» onder de tumbler', await page.locator('.stand-kop [data-ruimte-pauze-knop="aan"]').count() === 1 && await page.locator('.stand-kop [data-ruimte-einde-knop]').count() === 1);
      await page.click('.stand-kop [data-naar="prive"]');
      await page.waitForSelector('.stand-kop [data-ruimte-uitkomst]');
      check('uitkomst wissel «…Технічний сеанс і ШІ працюють далі.»', ((await page.textContent('.stand-kop [data-ruimte-uitkomst]')) || '').includes('працюють далі'), (await page.textContent('.stand-kop [data-ruimte-uitkomst]')) || '');
      await page.waitForFunction(() => !document.querySelector('.tech-band'), undefined, { timeout: 5000 }).catch(() => undefined);
      check('gewone weergave: band weg, geen herladen', await page.locator('.tech-band').count() === 0 && await standId(page) === id0);
      check('gewone weergave: stand «сеанс відкритий · ще …», niet «пауза»', /^сеанс відкритий · ще (1 год|60 хв|59 хв)/.test((await page.textContent('.stand-kop .rw-stand')) || ''), (await page.textContent('.stand-kop .rw-stand')) || '');
      check('wisselen: geen pauzeren-aanroep, geen nieuw startvenster/step-up', !n.s.aanroepen.some((x) => x.endsWith('/pauzeren')) && n.s.pauze === false && n.s.aanroepen.filter((x) => x.endsWith('/starten')).length === 1 && n.s.aanroepen.some((x) => x.endsWith('/wisselen')));
      await shot(page, 'weergave-prive-licht-1280');
      // Bewuste pauze met de eigen knop
      await page.click('.stand-kop [data-ruimte-pauze-knop="aan"]');
      await page.waitForSelector('.stand-kop [data-ruimte-pauze-knop="uit"]');
      check('«Пауза»: server krijgt pauzeren {aan:true}, stand «пауза · ще …», knop wordt «Продовжити»', n.s.pauze === true && /^пауза · ще (1 год|60 хв|59 хв)/.test((await page.textContent('.stand-kop .rw-stand')) || '') && ((await page.textContent('.stand-kop [data-ruimte-pauze-knop="uit"]')) || '').includes('Продовжити'), (await page.textContent('.stand-kop .rw-stand')) || '');
      check('«Пауза»: uitkomst noemt «усіх вкладках»', ((await page.textContent('.stand-kop [data-ruimte-uitkomst]')) || '').includes('усіх вкладках'));
      await shot(page, 'pauze-licht-1280');
      await page.click('.stand-kop [data-ruimte-pauze-knop="uit"]');
      await page.waitForSelector('.stand-kop [data-ruimte-pauze-knop="aan"]');
      check('«Продовжити»: pauze weg, tabblad blijft in de gewone weergave', n.s.pauze === false && await page.locator('.stand-kop [role="switch"][aria-checked="false"]').count() === 1);
      // «Завершити» vraagt eerst bevestiging
      await page.click('.stand-kop [data-ruimte-einde-knop]');
      check('«Завершити»: eerste klik = bevestiging, nog niets beëindigd', ((await page.textContent('.stand-kop [data-ruimte-einde-knop]')) || '').includes('Так, завершити') && !!n.s.sessie);
      await page.click('.stand-kop [data-naar="technisch"]');
      await page.waitForSelector('.stand-kop [role="switch"][aria-checked="true"]');
      check('wisselen trekt de bevestiging in (geen per-ongeluk beëindigen)', ((await page.textContent('.stand-kop [data-ruimte-einde-knop]')) || '') === 'Завершити');
      await page.click('.stand-kop [data-naar="prive"]');
      await page.waitForSelector('.stand-kop [role="switch"][aria-checked="false"]');
      // toetsenbord
      await page.focus('.stand-kop [role="switch"]');
      await page.keyboard.press('ArrowRight');
      await page.waitForSelector('.stand-kop [role="switch"][aria-checked="true"]');
      await page.waitForSelector('.stand-kop .rw-schakel:not([aria-busy])');
      check('toetsenbord →: tumbler aan, focus blijft op de tumbler', await page.evaluate(() => document.activeElement?.getAttribute('data-ruimte-schakel')) === 'technisch');
      await page.keyboard.press('ArrowLeft');
      await page.waitForSelector('.stand-kop [role="switch"][aria-checked="false"]');
      check('toetsenbord ←: tumbler uit (gewone ruimte)', true);
      check('één tab-stop: één schakelaar', await page.locator('.stand-kop .rw [role="switch"]').count() === 1);
      // Доступ і терміни
      await page.click('[data-stand="toegang"]');
      await page.waitForSelector('[data-tech-venster="toegang"]');
      const tabs = await page.locator('.rt-tabs [role=tab]').allTextContents();
      check('zes tabbladen exact', tabs.join('|') === 'Мій технічний доступ|Вхід і підтвердження|Доступ ШІ|Люди з технічним доступом|Коди доступу і гості|Перемикачі функцій', tabs.join('|'));
      // AI-TERMIJN-001 (#129) toont de aanmelding als «Вхід на сайт · ця вкладка» (was «Цей браузер»); de test liep daar sindsdien op vast.
      check('«Мій технічний доступ»: deze aanmelding uit sessies[] («ця вкладка», sessie werkt)', /ця вкладка/.test((await page.textContent('[data-rt-paneel="eigen"]')) || '') && ((await page.textContent('[data-rt-regel="sessie"] .rt-sessie-stand')) || '') === 'працює');
      check('«Мій технічний доступ»: termijn exact', /^На час \(до \d\d:\d\d\)$/.test((await page.textContent('[data-rt-termijn]')) || ''));
      await shot(page, 'toegang-eigen-licht-1280');
      await page.focus('.rt-tabs [aria-selected=true]');
      await page.keyboard.press('ArrowRight');
      check('tabs: → naar «Вхід і підтвердження»', await page.locator('.rt-tabs [aria-selected=true]').textContent() === 'Вхід і підтвердження');
      check('extensie-ontgrendeling in «Вхід і підтвердження» met «До виходу з облікового запису на сайті»', ((await page.textContent('[data-rt-regel="extensie"]')) || '').includes('До виходу з облікового запису на сайті'));
      await page.keyboard.press('ArrowRight');
      // AI-TERMIJN-001: kaart per AI (geen <select> meer). Buiten de technische weergave: knop uit + reden.
      await page.waitForSelector('[data-ait-kaart]');
      check('AI: kaart voor Claude (MCP)', ((await page.textContent('[data-ait-kaart]')) || '').includes('Claude (MCP)'));
      check('AI buiten technische weergave: knop uit + reden', await page.locator('[data-ait-wijzig]').first().isDisabled() && ((await page.textContent('[data-rt-ai-reden]')) || '').startsWith('Давати чи змінювати доступ ШІ можна лише в технічному просторі'), (await page.textContent('[data-rt-ai-reden]')) || '');
      await shot(page, 'toegang-ai-licht-1280');
      await page.keyboard.press('End');
      check('tabs: End → «Перемикачі функцій»', await page.locator('.rt-tabs [aria-selected=true]').textContent() === 'Перемикачі функцій');
      await page.click('.rt-tabs [data-rt-tab="eigen"]');
      await page.click('[data-rt-knop="uitloggen"]');
      await page.waitForSelector('[data-tech-venster="uitloggen"]');
      const keuzes = await page.locator('[data-uitlog-knop]').allTextContents();
      check('drie uitlogkeuzes exact', keuzes.join('|') === 'Вийти з технічного сеансу|Вийти з облікового запису на сайті|Вийти всюди', keuzes.join('|'));
      check('gevolg technisch: «Довгі дозволи розширення не змінюються»', ((await page.textContent('#ru-technisch')) || '').includes('Довгі дозволи розширення не змінюються'));
      check('gevolg site: «…знімаються»', ((await page.textContent('#ru-site')) || '').includes('знімаються'));
      check('regel «Закриття однієї вкладки не знімає…»', ((await page.textContent('[data-ru-vkladka]')) || '').startsWith('Закриття однієї вкладки не знімає'));
      await shot(page, 'uitloggen-licht-1280');
      await page.click('[data-uitlog-knop="technisch"]');
      await page.waitForSelector('[data-ru-melding]');
      check('technisch beëindigen: uitkomst + geen afmelding van de site', ((await page.textContent('[data-ru-melding]')) || '').startsWith('Готово: технічний сеанс завершено') && await page.evaluate(() => window.__uitgelogd) === 0);
      await page.click('[data-uitlog-knop="site"]');
      check('site afmelden vraagt eerst bevestiging', ((await page.textContent('[data-uitlog-knop="site"]')) || '').startsWith('Так,') && await page.evaluate(() => window.__uitgelogd) === 0);
      await page.click('[data-uitlog-knop="site"]');
      check('site afmelden na bevestiging → accountmenu-gebeurtenis', await page.evaluate(() => window.__uitgelogd) === 1);
      await c.close();
    }
    // ── 2b. RUIMTE-WEERGAVE-001 (16.11.2026): «Пауза / Продовжити / Завершити» op telefoon en computer, licht en donker ──
    for (const v of [{ breedte: 390, donker: false }, { breedte: 390, donker: true }, { breedte: 1280, donker: true }]) {
      const naam = `${v.breedte}-${v.donker ? 'donker' : 'licht'}`;
      const { c, page, n } = await open({ vlag: true, openMag: true, breedte: v.breedte, donker: v.donker });
      n.s.sessie = { id: 'ts-rw', modus: 'tot-site-uitloggen', eindTijd: null, gestartOp: Date.now() - 600_000 };
      n.s.actief = 'prive';
      await page.reload();
      await page.waitForSelector('.stand-kop [data-ruimte-pauze-knop="aan"]');
      await page.waitForTimeout(400);
      const binnen = await page.evaluate(() => [...document.querySelectorAll('.stand-kop [data-ruimte-acties] button')].every((b) => { const r = b.getBoundingClientRect(); return r.width > 0 && r.left >= 0 && r.right <= innerWidth; }));
      check(`rw ${naam}: «Пауза» en «Завершити» zichtbaar en binnen het scherm`, binnen);
      check(`rw ${naam}: stand «сеанс відкритий», band weg (gewone weergave)`, ((await page.textContent('.stand-kop .rw-stand')) || '').startsWith('сеанс відкритий') && await page.locator('.tech-band').count() === 0);
      await shot(page, `rw-weergave-prive-${naam}`);
      await page.click('.stand-kop [data-ruimte-pauze-knop="aan"]');
      await page.waitForSelector('.stand-kop [data-ruimte-pauze-knop="uit"]');
      await page.waitForTimeout(250);
      await shot(page, `rw-pauze-${naam}`);
      await page.click('.stand-kop [data-ruimte-pauze-knop="uit"]');
      await page.click('.stand-kop [data-ruimte-einde-knop]');
      await page.waitForTimeout(150);
      check(`rw ${naam}: «Так, завершити» vraagt bevestiging`, ((await page.textContent('.stand-kop [data-ruimte-einde-knop]')) || '').includes('Так, завершити'));
      await shot(page, `rw-einde-bevestig-${naam}`);
      await page.click('.stand-kop [data-ruimte-einde-knop]');
      await page.waitForFunction(() => !document.querySelector('.stand-kop [data-ruimte-acties]'), undefined, { timeout: 4000 }).catch(() => undefined);
      check(`rw ${naam}: na «Так, завершити» geen sessie en geen knoppen meer`, n.s.sessie === null && await page.locator('.stand-kop [data-ruimte-acties]').count() === 0);
      await c.close();
    }
    // ── 3. Vlag AAN, open termijnen toegestaan, lopende sessie: «Змінити термін» ──
    {
      const { c, page, n } = await open({ vlag: true, openMag: true });
      await page.click('.rw [data-naar="technisch"]');
      await page.waitForSelector('[data-tech-venster="ruimte-start"]');
      check('open termijnen beschikbaar als de rol het toelaat', await page.locator('[data-termijn][data-beschikbaar="0"]').count() === 0);
      await page.click('.rs-kaart[data-termijn="tot-site-uitloggen"]');
      await page.fill('[data-rs-reden]', 'test reden');
      check('knop «Підтвердити й увійти · До виходу з облікового запису на сайті»', (await page.textContent('[data-tech-knop="ruimte-start"]')) === 'Підтвердити й увійти · До виходу з облікового запису на сайті');
      await page.click('[data-tech-knop="ruimte-start"]');
      await page.waitForSelector('.tech-band');
      check('band: «до виходу з облікового запису на сайті»', ((await page.textContent('.tech-band-tijd')) || '').includes('до виходу з облікового запису на сайті'));
      await page.click('[data-stand="toegang"]');
      await page.waitForSelector('[data-tech-venster="toegang"]');
      await page.click('[data-rt-tab="ai"]');
      await page.waitForSelector('[data-ait-kaart]');
      await page.click('[data-ait-wijzig]');
      await page.click('[data-ait-termijn="tot-technisch-einde"]');
      await page.click('[data-ait-opslaan]');
      await page.waitForFunction(() => !!(window as any).__aiKlaar || /Збережено|Надано/.test(document.querySelector('[data-tech-venster="toegang"]')?.textContent || ''), undefined, { timeout: 5000 }).catch(() => undefined);
      check('AI zetten (technisch actief): juiste body naar ai-zetten', ['ai-1', 'agent:claude'].includes(String(n.s.aiLaatst?.verbindingId)) && JSON.stringify([n.s.aiLaatst?.ruimtes, n.s.aiLaatst?.termijn]) === JSON.stringify([['prive', 'technisch'], 'tot-technisch-einde']), JSON.stringify(n.s.aiLaatst));
      await page.click('[data-rt-tab="mensen"]');
      check('mensen-tab (magBeheren) toont helper', ((await page.textContent('[data-rt-paneel="mensen"]')) || '').includes('helper@example.org'));
      await shot(page, 'toegang-mensen-licht-1280');
      await page.keyboard.press('Escape');
      await page.locator('#tech-ruimte-toegang').waitFor({ state: 'detached', timeout: 3000 }).catch(async () => { await page.click('[data-tech-venster="toegang"] > .tech-knoppen button'); });
      // Smalle band (ingeklapt): eerst uitklappen, dan pas «Усі дії» — anders staat «Змінити термін» in een verborgen menu.
      if (!(await page.locator('[data-tech-knop="meer"]').isVisible()) && await page.locator('[data-tech-knop="inklappen"][aria-expanded="false"]').isVisible()) { await page.click('[data-tech-knop="inklappen"]'); await page.waitForTimeout(400); }
      if (await page.locator('[data-tech-knop="meer"]').isVisible()) await page.click('[data-tech-knop="meer"]');
      check('band-menu: «Змінити термін» i.p.v. «Подовжити» + «Доступ і терміни»', await page.locator('[data-tech-knop="verlengen"]', { hasText: 'Змінити термін' }).count() === 1 && await page.locator('[data-tech-knop="toegang"]').count() === 1);
      await page.locator('[data-tech-knop="verlengen"]:visible').first().click(); // band + menu kunnen beide de knop dragen: de zichtbare
      await page.waitForSelector('[data-rs-wijzig]');
      check('wijzigen: «Новий термін рахується від зараз.»', (await page.textContent('[data-rs-wijzig]')) === 'Новий термін рахується від зараз.');
      await c.close();
    }
    // ── 4. Geen recht: knop uitgegrijsd met reden ──
    {
      const { c, page } = await open({ vlag: true, recht: false });
      await page.waitForSelector('.rw');
      check('geen recht: tumbler aria-disabled + reden zichtbaar', await page.locator('.rw [role="switch"][aria-disabled="true"]').count() === 1 && ((await page.textContent('[data-ruimte-reden]')) || '').startsWith('Немає дозволу'));
      await c.close();
    }
    // ── 5. NL + donker + 390 px ──
    {
      const { c, page } = await open({ vlag: true, breedte: 390, donker: true, nl: true });
      await page.waitForSelector('.rw');
      check('NL: tumbler «Technische ruimte · uit»', (await page.locator('.stand-kop .rw .rw-naam').allTextContents()).join('|') === 'Technische ruimte' && ((await page.textContent('.stand-kop .rw .rw-aanuit')) || '') === 'uit');
      const over = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, w: innerWidth, rw: document.querySelector('.rw-schakel')!.getBoundingClientRect().right }));
      check('390 px: geen horizontale overloop', over.sw <= over.w && over.rw <= over.w + 0.5, JSON.stringify(over));
      await shot(page, 'kop-donker-390-nl');
      await page.click('.rw [data-naar="technisch"]');
      await page.waitForSelector('[data-tech-venster="ruimte-start"]');
      await page.click('.rs-chip[data-minuten="60"]');
      const namen = await page.locator('.rs .rs-naam').allTextContents();
      check('NL termijnen exact', namen.includes('Tot het einde van de technische sessie') && namen.includes('Tot afmelden van het account op de site') && namen.some((x) => /^Voor een tijd \(tot \d\d:\d\d\)$/.test(x)), namen.join(' | '));
      await shot(page, 'start-donker-390-nl');
      await c.close();
    }
    {
      const { c, page } = await open({ vlag: true, breedte: 390, donker: true });
      await page.click('.rw [data-naar="technisch"]');
      await page.waitForSelector('[data-tech-venster="ruimte-start"]');
      const past = await page.evaluate(() => { const v = document.querySelector('[data-tech-venster="ruimte-start"]')!.getBoundingClientRect(); return v.left >= -1 && v.right <= innerWidth + 1; });
      check('390 px donker: startvenster past in de breedte', past);
      await shot(page, 'start-donker-390');
      if (process.env.E2E_LOG) console.log('GEO', await page.evaluate(() => { const v = document.querySelector('.venster') as HTMLElement; const cs = getComputedStyle(v); const i = v.querySelector('.venster-inhoud') as HTMLElement; return JSON.stringify({ r: v.getBoundingClientRect(), style: v.getAttribute('style'), pos: cs.position, mh: cs.maxHeight, ih: i?.getBoundingClientRect(), iov: i ? getComputedStyle(i).overflow : '', vh: innerHeight }); }));
      await page.click('.rs-chip[data-minuten="30"]');
      await page.fill('[data-rs-reden]', 'telefoon');
      await page.click('[data-tech-knop="ruimte-start"]');
      await page.waitForSelector('.tech-band');
      await page.waitForTimeout(600);
      await shot(page, 'technisch-donker-390');
      await page.click('[data-stand="toegang"]').catch(() => undefined);
      await page.waitForSelector('[data-tech-venster="toegang"]');
      await shot(page, 'toegang-donker-390');
      await c.close();
    }
    {
      const { c, page } = await open({ vlag: true, donker: true });
      await page.waitForSelector('.rw');
      await shot(page, 'kop-donker-1280');
      await c.close();
    }
    // ── 6. Wissel 28.10: dok, sneltoets, inklappen, afbakening, geen lek van het leesvenster (390/768/1440, licht+donker) ──
    for (const breedte of [390, 768, 1440]) for (const donker of [false, true]) {
      const naam = `${breedte}-${donker ? 'donker' : 'licht'}`;
      const { c, page, n } = await open({ vlag: true, openMag: true, breedte, donker, strook: { modus: 'uitgeklapt', laatsteInklap: 'ingeklapt' } });
      await page.waitForSelector('[data-zijbalk-ruimtes="prive"]');
      check(`${naam}: ingeklapt menu — twee kleine ronde pictogrammen`, await page.evaluate(() => { const k = Array.from(document.querySelectorAll('.zr.is-smal .zr-knop')); return k.length === 2 && k.every((b) => { const r = b.getBoundingClientRect(); return Math.round(r.width) === 36 && getComputedStyle(b).borderRadius === '50%'; }); }));
      await page.click('[data-stand="menu-knop"]');
      await page.waitForSelector('.zr.is-breed');
      check(`${naam}: geen zwevende strook onderaan meer (oude RuimteDok)`, await page.locator('.rw-dok, [data-ruimte-dok]').count() === 0);
      const zr = await page.evaluate(() => { const r = document.querySelector('.zr')!.getBoundingClientRect(); const m = document.querySelector('[data-stand="zijmenu"]')!.getBoundingClientRect(); return { onderaan: Math.abs(r.bottom - m.bottom) < 2, sw: document.documentElement.scrollWidth, w: innerWidth, namen: Array.from(document.querySelectorAll('.zr-knop span')).map((x) => (x as HTMLElement).scrollWidth <= (x as HTMLElement).clientWidth + 0.5 && x.textContent) }; });
      check(`${naam}: wissel onderaan het zijmenu, volledige namen, geen horizontaal scrollen`, zr.onderaan && zr.sw <= zr.w && zr.namen.join('|') === 'Звичайний|Технічний', JSON.stringify(zr));
      const knop = await page.evaluate(() => Math.min(...Array.from(document.querySelectorAll('.zr-knop')).map((b) => b.getBoundingClientRect().height)));
      check(`${naam}: wisselknoppen ≥ ${innerWidthMin(breedte)} px hoog`, knop >= innerWidthMin(breedte), String(knop));
      await shot(page, `zijmenu-wissel-${naam}`);
      await page.click('.zr-knop[data-zijbalk-ruimte="technisch"]');
      await page.waitForSelector('[data-tech-venster="ruimte-start"]');
      await page.click('.rs-kaart[data-termijn="tot-site-uitloggen"]');
      await page.fill('[data-rs-reden]', 'перевірка');
      await page.click('[data-tech-knop="ruimte-start"]');
      await page.waitForSelector('.tech-band');
      await page.keyboard.press('Escape').catch(() => undefined);
      await page.waitForTimeout(300);
      if (await page.locator('[data-stand="zijmenu"][data-open="1"]').count()) await page.click('[data-stand="menu-knop"]');
      await page.waitForTimeout(300);
      await page.keyboard.press('Control+Alt+Digit1');
      await page.waitForFunction(() => document.documentElement.dataset.ruimte === 'prive', undefined, { timeout: 5000 }).catch(() => undefined);
      check(`${naam}: Ctrl+Alt+1 → gewone ruimte (geen herladen)`, await page.evaluate(() => document.documentElement.dataset.ruimte) === 'prive');
      await page.click('[data-stand="open-brief"]');
      await page.fill('[data-stand="antwoord"]', 'half getypt');
      const id0 = await standId(page);
      const starten0 = n.s.aanroepen.filter((x) => x.endsWith('/starten')).length;
      const t0 = Date.now();
      await page.keyboard.press('Control+Alt+Digit2');
      await page.waitForFunction(() => document.documentElement.dataset.ruimte === 'technisch', undefined, { timeout: 5000 }).catch(() => undefined);
      const duur = Date.now() - t0;
      check(`${naam}: Ctrl+Alt+2 → technisch, zonder startvenster/herladen (${duur} ms)`, await page.evaluate(() => document.documentElement.dataset.ruimte) === 'technisch' && await standId(page) === id0 && n.s.aanroepen.filter((x) => x.endsWith('/starten')).length === starten0 && await page.locator('[data-tech-venster="ruimte-start"]').count() === 0);
      check(`${naam}: LEK — persoonlijke brief NIET zichtbaar in technische ruimte`, await page.locator('[data-stand="brief"]').count() === 0 && await page.locator('[data-stand="leeg"]').count() === 1);
      await page.waitForSelector('.tech-band');
      await page.waitForTimeout(400);
      const af = await page.evaluate(() => ({ titel: document.title, kader: getComputedStyle(document.body, '::after').borderLeftWidth, label: getComputedStyle(document.querySelector('.zijbalk-werkbalk-titel')!, '::after').content, pict: document.documentElement.dataset.ruimtePictogram || '' }));
      check(`${naam}: afbakening — [ТЕХ] in titel, kader, label «ТЕХ», tabbladpictogram`, af.titel.startsWith('[ТЕХ] ') && af.kader === '3px' && af.label.includes('ТЕХ') && af.pict === 'technisch', JSON.stringify(af));
      const mobiel = breedte <= 768;
      if (mobiel) {
        const bh = await page.evaluate(() => { const b = document.querySelector('.tech-band')!; const zichtbaar = Array.from(b.querySelectorAll('button')).filter((x) => x.getBoundingClientRect().width > 0).map((x) => x.getAttribute('data-tech-knop')); return { h: Math.round(b.getBoundingClientRect().height), zichtbaar }; });
        check(`${naam}: telefoonband — dun, alleen label + menuknop`, bh.h <= 44 && bh.zichtbaar.join(',') === 'meer', JSON.stringify(bh));
        await shot(page, `wissel-technisch-${naam}`);
        await page.click('[data-tech-band] [data-tech-knop="meer"]');
        await page.waitForSelector('[data-tech-mobiel="wissel"] .rw');
        const binnen = await page.evaluate(() => ['[data-tech-mobiel="wissel"] [role="switch"]', '[data-tech-mobiel="inklappen"]', '[data-tech-mobiel="uitloggen"]', '[data-tech-mobiel="acties"] [data-tech-knop="meldingen"]'].map((q) => { const r = document.querySelector(q)?.getBoundingClientRect(); return !!r && r.width > 0 && r.height >= 40 && r.left >= 0 && r.right <= innerWidth + 0.5; }));
        check(`${naam}: menu — tumbler «Технічний простір» bovenaan, bel/«Згорнути»/«Вийти…» onderaan, binnen het scherm`, binnen.every(Boolean), JSON.stringify(binnen));
        await page.waitForTimeout(300);
        await shot(page, `band-menu-${naam}`);
        await page.click('[data-tech-mobiel="inklappen"]');
      } else {
        const binnen = await page.evaluate(() => ['[data-tech-knop="inklappen"]', '[data-tech-knop="uitloggen"]', '.tech-band .rw [role="switch"]'].map((q) => { const r = document.querySelector(q)?.getBoundingClientRect(); return !!r && r.width > 0 && r.left >= 0 && r.right <= innerWidth + 0.5; }));
        check(`${naam}: band — «Згорнути», «Вийти…» en wissel binnen het scherm`, binnen.every(Boolean), JSON.stringify(binnen));
        await shot(page, `wissel-technisch-${naam}`);
        await page.click('[data-tech-knop="inklappen"]');
      }
      await page.waitForSelector('.tech-band.is-ingeklapt');
      await page.waitForTimeout(300);
      const h = await page.evaluate(() => document.querySelector('.tech-band')!.getBoundingClientRect().height);
      // Strook-voorkeur (grootte «middel»): ingeklapt is nu 24 px (was 28).
      check(`${naam}: band ingeklapt (24 px), wissel blijft onderaan het zijmenu`, Math.round(h) === 24 && await page.locator('[data-zijbalk-ruimtes="technisch"]').count() === 1, String(h));
      check(`${naam}: inklappen onthouden op dit apparaat`, await page.evaluate(() => { try { return JSON.parse(localStorage.getItem('mr-tech-strook') || '{}').modus; } catch { return ''; } }) === 'ingeklapt');
      await shot(page, `wissel-ingeklapt-${naam}`);
      if (mobiel) { await page.click('[data-tech-band] [data-tech-knop="meer"]'); await page.click('[data-tech-mobiel="inklappen"]'); } else await page.click('[data-tech-knop="inklappen"]');
      await page.waitForSelector('.tech-band:not(.is-ingeklapt)');
      await page.click('.zr-knop[data-zijbalk-ruimte="prive"]');  // ingeklapt: rond pictogram
      await page.waitForFunction(() => document.documentElement.dataset.ruimte === 'prive', undefined, { timeout: 5000 }).catch(() => undefined);
      await page.waitForTimeout(300);
      check(`${naam}: terug in gewone ruimte — brief en getypt antwoord terug`, ((await page.textContent('[data-stand="brief"]').catch(() => '')) || '').includes('Особистий') && await page.inputValue('[data-stand="antwoord"]').catch(() => '') === 'half getypt');
      check(`${naam}: gewone ruimte — geen [ТЕХ], geen kader, pictogram hersteld`, await page.evaluate(() => !document.title.startsWith('[ТЕХ]') && !document.documentElement.dataset.ruimtePictogram && getComputedStyle(document.body, '::after').content === 'none'));
      await shot(page, `wissel-gewoon-${naam}`);
      await c.close();
    }
    {
      const { c, page } = await open({ vlag: true, recht: false });
      await page.waitForSelector('.rw');
      check('geen technisch recht: geen wissel in het zijmenu (gewone gebruikers zien niets nieuws)', await page.locator('.zr, .rw-dok').count() === 0);
      await page.keyboard.press('Control+Alt+Digit2');
      await page.waitForTimeout(300);
      check('geen recht: sneltoets wisselt niet', await page.evaluate(() => document.documentElement.dataset.ruimte !== 'technisch'));
      await c.close();
    }
    {
      const { c, page } = await open({ vlag: false });
      await page.waitForSelector('[data-stand="oud-tech"]');
      await page.keyboard.press('Control+Alt+Digit2');
      check('vlag uit: geen wissel in het zijmenu, sneltoets doet niets, geen data-ruimte', await page.locator('.zr, .rw-dok').count() === 0 && await page.evaluate(() => !document.documentElement.dataset.ruimte));
      await c.close();
    }
  } finally {

    await browser.close();
    server.close();
  }
  check(`0 verzoeken naar andere hosts (${geweigerd.length})`, geweigerd.length === 0, geweigerd.slice(0, 3).join(' '));
  check(`geen JS-fouten op de pagina (${fouten.length})`, fouten.length === 0, fouten.slice(0, 3).join(' | '));
  return einde();
}
