// E2E «Agenda v3» (vlag agenda-v3) in ISOLATIE: de echte pagina (stand hulp/agenda-stand) tegen een NEPSERVER in het geheugen die het
// contract van src/agenda/agenda-client.ts volgt. Geen echte server, geen Google, geen productie: eigen http-server op 127.0.0.1;
// ELK verzoek naar een andere host wordt afgebroken en geteld (eis 0). Vaste klok: woensdag 28.10.2026 10:00 (Europe/Brussels).
// Gebruik: node scripts/e2e-lokaal.mjs agenda-v3-ui     Screenshots: E2E_SCREENSHOTS (standaard /workspace/release-agenda-v3/screens).
import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { mkdirSync, mkdtempSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { build } from 'esbuild';
import { checker } from '../eenheid/hulp/nep-google';
import { chromeArgs } from './server';

const PW = process.env.PLAYWRIGHT_CORE || '/workspace/e2e-tools/node_modules/playwright-core';
const UIT = process.env.E2E_SCREENSHOTS || '/workspace/release-agenda-v3/screens';
const CHROME = process.env.CHROME || '/usr/bin/google-chrome';
const NU = new Date('2026-10-28T10:00:00+01:00');
type Page = import('playwright-core').Page;
type Scenario = 'leeg' | 'google-lezen' | 'google-schrijven' | 'ics-caldav' | 'conflict' | 'syncfout' | 'technisch' | 'gesloten';

const kop = (id: string, naam: string, schrijfbaar: boolean, primair = false, kleur = '') => ({ id, naam, primair, rol: schrijfbaar ? 'owner' : 'reader', schrijfbaar, tijdzone: 'Europe/Brussels', kleur });
const it = (id: string, titel: string, begin: string, einde: string, o: Record<string, unknown> = {}) => ({
  id: `google:primary:${id}`, bron: 'google', agendaId: 'primary', agendaNaam: 'Особистий', titel, locatie: '', beschrijving: '', begin, einde, heleDag: false,
  etag: `"e-${id}"`, koppeling: '', schrijfbaar: true, deelnemers: [], herhaling: '', status: 'confirmed', ...o });

function googleItems(schrijfbaar: boolean) {
  const w = (d: string, u: string, du = 1) => { const b = `${d}T${u}:00+01:00`; const e = new Date(new Date(b).getTime() + du * 3600e3).toISOString(); return [b, e] as const; };
  const lijst = [
    it('a', 'Планерка команди', ...w('2026-10-28', '09:30'), { locatie: 'Zoom', herhaling: 'RRULE:FREQ=WEEKLY;BYDAY=WE' }),
    it('b', 'Обід з Олею', ...w('2026-10-28', '12:30'), { locatie: 'Кафе «Лісова»' }),
    it('c', 'Дзвінок з бухгалтером', ...w('2026-10-28', '13:00', 0.5)),
    it('d', 'Тренування', ...w('2026-10-29', '18:00', 1.5), { agendaId: 'sport', agendaNaam: 'Спорт', id: 'google:sport:d' }),
    it('e', 'Відпустка', '2026-11-02', '2026-11-04', { heleDag: true }),
    it('f', 'Стоматолог', ...w('2026-10-30', '08:15', 0.75)),
    it('g', 'Огляд проєкту', ...w('2026-10-27', '15:00', 2), { deelnemers: [{ email: 'olia@example.org', naam: 'Оля', antwoord: 'accepted' }] }),
    // DST: 25.10.2026 om 09:00 wintertijd
    it('dst', 'Сніданок після переведення годинника', '2026-10-25T09:00:00+01:00', '2026-10-25T10:00:00+01:00'),
    // Herhaling: wekelijks op woensdag (elke keer een eigen item, zoals de server ze geeft), ook over de zomertijdgrens heen
    ...['2026-10-14', '2026-10-21', '2026-11-04', '2026-11-11'].map((d) => it(`a_${d}`, 'Планерка команди', `${d}T09:30:00${d < '2026-10-25' ? '+02:00' : '+01:00'}`, `${d}T10:30:00${d < '2026-10-25' ? '+02:00' : '+01:00'}`, { herhaling: 'RRULE:FREQ=WEEKLY;BYDAY=WE' })),
  ];
  return lijst.map((x) => ({ ...x, schrijfbaar }));
}
const icsRij = { id: 'ics1', naam: 'Шкільні канікули', adres: 'https://example.org/school.ics', actief: true, intervalMinuten: 360, laatstOp: NU.getTime() - 3600e3, laatstKlaarOp: NU.getTime() - 3600e3, laatsteStaat: 'ok', fout: '', aantal: 2 };
const davRij = { ...icsRij, id: 'dav1', naam: 'iCloud', adres: 'https://caldav.icloud.com/', gebruikersnaam: 'eigenaar@example.test', agendas: [{ href: '/home/', naam: 'Дім', kleur: '#a23b72' }], schrijven: false, schrijvenOntbreekt: [['Запис у CalDAV ще не підтримується', 'Schrijven naar CalDAV kan nog niet']] };

function nep(scenario: Scenario, vlag: boolean) {
  const s = { aanroepen: [] as { pad: string; body: any }[], overzichtFout: false, syncFout: scenario === 'syncfout', netwerkfoutAanmaken: 0, conflictGeweest: false, icsToegevoegd: '' };
  const google = !['leeg', 'ics-caldav', 'gesloten'].includes(scenario);
  const schrijven = google && scenario !== 'google-lezen';
  const overzicht = () => ({
    observedAt: Date.now(),
    ruimte: scenario === 'technisch' ? { ok: true, ruimte: 'technisch', stand: 'eigen', gedeeld: false, dienst: 'agenda', naam: { uk: 'Технічний', nl: 'Technisch' }, uitleg: { uk: 'окремий календар для технічної роботи; особисті події тут не видно.', nl: 'aparte agenda voor technisch werk; persoonlijke afspraken zijn hier niet zichtbaar.' } }
      : scenario === 'gesloten' ? { ok: false, dienst: 'agenda', code: 'RUIMTE_DIENST_UIT', uitleg: { uk: 'Календар у технічному просторі вимкнено. Увімкніть його в «Доступ і терміни».', nl: 'De agenda staat in de technische ruimte uit. Zet hem aan in «Toegang en termijnen».' } }
      : { ok: true, ruimte: 'prive', stand: 'eigen', gedeeld: false, dienst: 'agenda', naam: { uk: 'Особистий', nl: 'Persoonlijk' }, uitleg: { uk: '', nl: '' } },
    toegang: { gekoppeld: google, lezen: google, schrijven, uitbreidingNodig: google && !schrijven, toevoegen: google && !schrijven ? ['https://www.googleapis.com/auth/calendar.events'] : [], scopes: google ? ['https://www.googleapis.com/auth/calendar.readonly'] : [], uitbreidingRoute: '/api/owner/agenda/toegang/uitbreiden' },
    agendas: google ? [kop('primary', 'Особистий', schrijven, true), kop('sport', 'Спорт', schrijven, false, '#2f6db3'), kop('feest', 'Свята в Україні', false, false, '#5b7f2a')] : [],
    standaardTijdzone: 'Europe/Brussels',
    items: scenario === 'gesloten' ? [] : [
      ...(google ? googleItems(schrijven) : []),
      ...(scenario === 'ics-caldav' ? [
        { ...it('i1', 'Осінні канікули', '2026-10-26', '2026-10-30', { heleDag: true }), id: 'ics:ics1:i1', bron: 'ics', agendaId: 'ics1', agendaNaam: 'Шкільні канікули', schrijfbaar: false, etag: '' },
        { ...it('d1', 'Батьківські збори', '2026-10-28T18:00:00+01:00', '2026-10-28T19:00:00+01:00'), id: 'caldav:dav1:d1', bron: 'caldav', agendaId: 'dav1', agendaNaam: 'iCloud · Дім', schrijfbaar: false, etag: '' },
      ] : []),
    ],
    begrensd: false,
    abonnementen: { ics: scenario === 'ics-caldav' ? [icsRij] : [], caldav: scenario === 'ics-caldav' ? [davRij] : [], grenzen: { icsSchemas: ['https', 'webcal'], icsMaxBytes: 5e6, icsTimeoutMs: 15000, icsMinMinuten: 15, icsIntervalKeuzes: [60, 360, 1440] } },
    caldavSchrijvenOntbreekt: [['Запис у CalDAV ще не підтримується', 'Schrijven naar CalDAV kan nog niet']],
    mogelijkheden: {},
  });
  const vorm = (id: string, titel: string, etag: string) => ({ agendaId: 'primary', gebeurtenisId: id, etag, titel, beschrijving: '', locatie: '', heleDag: false, begin: '2026-10-28T12:30', einde: '2026-10-28T13:30', tijdzone: 'Europe/Brussels', deelnemers: [], herhaling: { frequentie: 'geen', interval: 1, aantal: 0, tot: '', weekdagen: [] }, herinneringen: [], standaardHerinneringen: true });
  /** [status, body] of 'abort' (netwerkfout). */
  const antwoord = (pad: string, body: any): [number, unknown] | 'abort' => {
    s.aanroepen.push({ pad, body });
    if (pad === '/api/ofrep/v1/evaluate/flags/agenda-v3') return [200, { key: 'agenda-v3', value: vlag }];
    if (pad.startsWith('/api/ofrep')) return [200, { value: false }];
    if (pad === '/api/owner/agenda/overzicht') return s.overzichtFout ? [503, { error: 'AGENDA_TIJDELIJK_ONBEREIKBAAR' }] : [200, overzicht()];
    if (pad === '/api/owner/agenda/synchroniseren') { if (s.syncFout) { s.overzichtFout = true; return [502, { error: 'GOOGLE_SYNC_MISLUKT' }]; } return [200, { ok: true }]; }
    if (pad === '/api/owner/agenda/gebeurtenis') return [200, { ok: true, vorm: vorm(body.gebeurtenisId, 'Обід з Олею', '"e-b"') }];
    if (pad === '/api/owner/agenda/gebeurtenis/aanmaken') {
      if (s.netwerkfoutAanmaken > 0) { s.netwerkfoutAanmaken--; return 'abort'; }
      return [200, { ok: true, uitslag: 'ok', gebeurtenisId: 'nieuw1', agendaId: body.vorm?.agendaId, etag: '"n1"' }];
    }
    if (pad === '/api/owner/agenda/gebeurtenis/wijzigen') {
      if (scenario === 'conflict' && !body.negeerVersie) { s.conflictGeweest = true; return [200, { ok: false, uitslag: 'conflict', fout: 'AGENDA_CONFLICT', google: vorm(body.gebeurtenisId, 'Обід з Олею (перенесено)', '"e-b2"') }]; }
      return [200, { ok: true, uitslag: 'ok', etag: '"e-b3"' }];
    }
    if (pad.startsWith('/api/owner/agenda/gebeurtenis/')) return [200, { ok: true, uitslag: 'ok' }];
    // 29.10.2026 koppelvenster: in het scenario «leeg» antwoordt de nepserver zoals de echte bij een onvoltooide
    // Google-reeks (mail → drive → calendar), zodat de e2e de eerlijke terugval met de link kan zien.
    if (pad === '/api/owner/agenda/toegang/uitbreiden') return scenario === 'leeg' ? [409, { error: 'GOOGLE_SUITE_SEQUENCE_REQUIRED' }] : [200, { ok: false }];
    if (pad === '/api/owner/agenda/ics/toevoegen') { s.icsToegevoegd = String(body.adres || ''); return [200, { ok: true, abonnement: { ...icsRij, id: 'ics-nieuw', naam: String(body.naam || ''), adres: String(body.adres || '') }, haal: { staat: 'klaar', aantal: 0 } }]; }
    return [200, {}];
  };
  return { s, antwoord };
}

export async function main(): Promise<number> {
  const { check, einde } = checker('e2e agenda-v3-ui');
  const map = mkdtempSync(join(tmpdir(), 'agv3-'));
  await build({ entryPoints: ['tests/e2e/hulp/agenda-stand/stand.tsx'], outdir: map, bundle: true, format: 'esm', splitting: true, target: 'es2022', jsx: 'automatic', loader: { '.svg': 'dataurl', '.png': 'dataurl', '.woff2': 'dataurl', '.woff': 'dataurl' }, define: { 'process.env.NODE_ENV': '"production"', 'import.meta.env.DEV': 'false', 'import.meta.env': '{}' }, logLevel: 'error' });
  const css = `:root{--veilig-boven:0px;--veilig-onder:0px;--veilig-links:0px;--veilig-rechts:0px}body{margin:0;font:15px system-ui,sans-serif}.stand-main{padding:16px;max-width:1440px;box-sizing:border-box}@media (max-width:768px){.stand-main{padding:10px}}`;
  const html = `<!doctype html><html lang="uk"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>stand agenda</title><style>${css}</style><link rel="stylesheet" href="/stand.css"><script src="/canonical-service.js"></script></head><body><script type="module" src="/stand.js"></script></body></html>`;
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
  const open = async (o: { scenario: Scenario; vlag?: boolean; breedte?: number; donker?: boolean; nl?: boolean; zoek?: string }) => {
    const n = nep(o.scenario, o.vlag ?? true);
    const breedte = o.breedte ?? 1440;
    const c = await browser.newContext({ viewport: { width: breedte, height: breedte <= 768 ? (breedte < 500 ? 780 : 1024) : 900 }, colorScheme: o.donker ? 'dark' : 'light', hasTouch: breedte < 500, locale: o.nl ? 'nl-BE' : 'uk-UA', timezoneId: 'Europe/Brussels' });
    const page = await c.newPage();
    await page.clock.setFixedTime(NU);
    await page.route('**/*', async (r) => {
      const u = new URL(r.request().url());
      if (u.hostname !== '127.0.0.1' || u.port !== String(poort)) { geweigerd.push(u.href); return r.abort(); }
      if (u.pathname.startsWith('/api/')) {
        let body: any = {}; try { body = JSON.parse(r.request().postData() || '{}'); } catch { /* leeg */ }
        const a = n.antwoord(u.pathname, body);
        if (a === 'abort') return r.abort('failed');
        return r.fulfill({ status: a[0], contentType: 'application/json', body: JSON.stringify(a[1]) });
      }
      return r.continue();
    });
    page.on('pageerror', (e) => { fouten.push(`${o.scenario}: ${String(e)}`); if (process.env.E2E_LOG) console.log('PAGEERROR', String(e)); });
    if (process.env.E2E_LOG) page.on('console', (m) => console.log('CONSOLE', m.type(), m.text()));
    await page.goto(`http://127.0.0.1:${poort}/${o.nl ? 'nl/' : ''}agenda?thema=${o.donker ? 'donker' : 'licht'}${o.zoek ? `&${o.zoek}` : ''}`);
    await page.waitForSelector(o.vlag === false ? '.agenda-pagina, [data-agenda-pagina], main, section' : '[data-agenda-v3]', { timeout: 15000 });
    await page.waitForTimeout(350);
    return { c, page, n };
  };
  const shot = (p: Page, naam: string, vol = false) => p.screenshot({ path: join(UIT, `${naam}.png`), fullPage: vol, animations: 'disabled' }).catch(() => undefined);
  const zichtbaar = (p: Page, sel: string) => p.locator(sel).first().isVisible().catch(() => false);
  const geenOverloop = (p: Page) => p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
  const kleineDoelen = (p: Page) => p.evaluate(() => [...document.querySelectorAll<HTMLElement>('.agv button, .agv a, .agv input, .agv-laag button')].filter((e) => {
    const r = e.getBoundingClientRect(); if (!r.width || !r.height) return false;
    if (e.closest('.agv-raster-binnen, .agv-mini-rooster, .agv-maand-cel:not(.is-smal *), .agv-item.is-chip')) return false;
    if (e.matches('input[type=checkbox]')) return false;
    return r.height < 44;
  }).map((e) => `${e.className || e.tagName}:${Math.round(e.getBoundingClientRect().height)}`));
  try {
    // ── 1. Vlag UIT: precies de oude agenda, niets van v3 ──
    {
      const { c, page, n } = await open({ scenario: 'google-schrijven', vlag: false });
      await page.waitForTimeout(500);
      check('vlag uit: geen v3-pagina', await page.locator('[data-agenda-v3]').count() === 0);
      check('vlag uit: de oude agenda staat er (weergaveknoppen en «нова подія»)', await page.locator('[data-agenda-weergave]').count() >= 3 && await page.locator("[data-agenda-nieuw='1']").count() >= 1);
      check('vlag uit: de vlag is gevraagd via OFREP', n.s.aanroepen.some((a) => a.pad.endsWith('/flags/agenda-v3')));
      await shot(page, 'vlag-uit-oude-agenda-1440-licht');
      await c.close();
    }
    // ── 2. Lege toestand ──
    for (const donker of [false, true]) {
      const { c, page, n } = await open({ scenario: 'leeg', donker });
      check(`leeg${donker ? ' (donker)' : ''}: uitleg + koppelknop, niets als «gekoppeld» getoond`, await zichtbaar(page, "[data-agenda-niet-gekoppeld='1']") && await zichtbaar(page, "[data-agenda-v3-leeg-google='1']") && !(await page.locator('[data-agenda-item]').count()));
      await shot(page, `leeg-1440-${donker ? 'donker' : 'licht'}`);
      if (!donker) {
        // 29.10.2026: de hoofdknop opent het KOPPELVENSTER op de pagina zelf (geen sprong naar cloud.…/google meer).
        await page.locator("[data-agenda-v3-koppelen='1']").first().click();
        await page.waitForSelector('[data-agenda-koppelvenster]');
        check('koppelvenster: kaarten voor diensten én toestellen, met eerlijke standen', await page.locator('[data-agenda-kv-kaart]').count() >= 9
          && (await page.locator("[data-agenda-kv-kaart='samsung-calendar']").getAttribute('data-agenda-kv-stand')) === 'beschikbaar'
          && (await page.locator("[data-agenda-kv-kaart='huawei-calendar']").getAttribute('data-agenda-kv-stand')) === 'binnenkort');
        await page.locator("[data-agenda-kv-kaart='samsung-calendar']").click();
        check('koppelvenster: de Samsung-kaart is een brug via Google — knop + dezelfde-account-waarschuwing', await zichtbaar(page, '[data-agenda-kv-google-start]') && /той самий|САМИЙ/i.test(await page.locator('[data-agenda-kv-detail]').innerText()));
        await page.locator("[data-agenda-kv-kaart='huawei-calendar']").click();
        check('koppelvenster: Huawei zegt eerlijk waarom er geen koppeling is, zonder knop', await zichtbaar(page, '[data-agenda-kv-ontbreekt]') && !(await page.locator('[data-agenda-kv-detail] [data-agenda-kv-google-start]').count()));
        await page.locator("[data-agenda-kv-kaart='google-calendar']").click();
        await page.locator('[data-agenda-kv-google-start]').click();
        await page.waitForSelector('[data-agenda-kv-reeks]');
        check('koppelvenster: onvoltooide Google-reeks → eerlijke uitleg met een link in een NIEUW tabblad, geen navigatie weg', await zichtbaar(page, "[data-agenda-kv-reeks-link='1']") && page.url().includes('/agenda'));
        await page.locator("[data-agenda-kv-kaart='ics-abonnement']").click();
        await page.locator('[data-agenda-ics-adres]').fill('https://example.org/rooster.ics');
        await page.locator('[data-agenda-ics-toevoegen]').click();
        await page.waitForTimeout(400);
        check('koppelvenster: ICS toevoegen loopt via dezelfde route als de lade', n.s.icsToegevoegd === 'https://example.org/rooster.ics');
        await shot(page, 'koppelvenster-1440');
        await page.keyboard.press('Escape');
      }
      await c.close();
    }
    // ── 3. Google alleen lezen ──
    {
      const { c, page } = await open({ scenario: 'google-lezen' });
      check('lezen: afspraken staan in de maand', await page.locator('[data-agenda-maand] [data-agenda-item]').count() >= 5);
      check('lezen: pagina zegt schrijven=false', (await page.locator('[data-agenda-v3]').getAttribute('data-agenda-schrijven')) === 'false');
      await page.locator('.agv-zijbalk [data-agenda-nieuw]').click();
      await page.waitForSelector("[data-agenda-v3-bewerker='alleen-lezen']");
      check('lezen: «Нова подія» legt uit en biedt «Дозволити створення подій» (geen formulier)', await zichtbaar(page, "[data-agenda-v3-bewerker='alleen-lezen'] [data-agenda-uitbreiden='1']") && !(await page.locator('[data-agenda-v3-titel]').count()));
      await shot(page, 'google-lezen-nieuw-1440-licht');
      await page.keyboard.press('Escape');
      check('lezen: Esc sluit de laag', !(await page.locator('.agv-laag').count()));
      await page.click('[data-agenda-v3-verbindingen]');
      await page.waitForSelector('[data-agenda-uitbreiding-scope]', { state: 'attached' });
      check('lezen: de lade toont welke scope erbij komt', ((await page.locator('[data-agenda-uitbreiding-scope]').first().getAttribute('data-agenda-uitbreiding-scope')) || '').includes('calendar.events'));
      await shot(page, 'google-lezen-diensten-1440-licht');
      await c.close();
    }
    // ── 4. Google schrijven: maken, idempotentie bij netwerkfout, weergaven ──
    {
      const { c, page, n } = await open({ scenario: 'google-schrijven' });
      check('schrijven: vandaag gemarkeerd in de maand', await page.locator("[data-agenda-maand] [data-agenda-dag='2026-10-28'][data-agenda-dag-vandaag='1']").count() === 1);
      await page.locator('.agv-zijbalk [data-agenda-nieuw]').click();
      await page.waitForSelector('[data-agenda-v3-titel]');
      check('schrijven: focus staat in het titelveld', await page.evaluate(() => document.activeElement?.getAttribute('data-agenda-v3-titel') === '1'));
      await page.fill('[data-agenda-v3-titel]', 'Зустріч з нотаріусом');
      n.s.netwerkfoutAanmaken = 1;
      await page.click('[data-agenda-v3-bewaar]');
      await page.waitForSelector('[data-agenda-venster-fout]');
      check('schrijven: netwerkfout → foutmelding en knop «Повторити»', ((await page.textContent('[data-agenda-v3-bewaar]')) || '').includes('Повторити'));
      await shot(page, 'google-schrijven-netwerkfout-1440-licht');
      await page.click('[data-agenda-v3-bewaar]');
      await page.waitForSelector("[data-agenda-melding='1']");
      const aanmaak = n.s.aanroepen.filter((a) => a.pad.endsWith('/aanmaken'));
      check('idempotentie: de herhaalde poging draagt DEZELFDE sleutel', aanmaak.length === 2 && aanmaak[0].body.idempotentieSleutel && aanmaak[0].body.idempotentieSleutel === aanmaak[1].body.idempotentieSleutel, JSON.stringify(aanmaak.map((a) => a.body.idempotentieSleutel)));
      check('schrijven: na bewaren laag dicht en bevestiging', !(await page.locator('.agv-laag').count()) && await zichtbaar(page, "[data-agenda-melding='1']"));
      await page.click("[data-agenda-weergave='week']");
      await page.waitForSelector('[data-agenda-week]');
      check('week: adresregel bewaart weergave', page.url().includes('weergave=week'));
      check('week: blok 09:30 staat op 9,5 × 48 px', await page.evaluate(() => { const b = [...document.querySelectorAll<HTMLElement>("[data-agenda-week] [data-agenda-dag='2026-10-28'] [data-agenda-item]")].find((x) => x.textContent?.includes('Планерка')); return b ? Math.round(parseFloat(b.style.top)) : -1; }) === 456);
      check('week: overlappende afspraken staan naast elkaar', await page.evaluate(() => { const bl = [...document.querySelectorAll<HTMLElement>("[data-agenda-week] [data-agenda-dag='2026-10-28'] [data-agenda-item]")].filter((x) => /Обід|Дзвінок/.test(x.textContent || '')); return bl.length === 2 && bl[0].style.left !== bl[1].style.left; }));
      check('week: «nu»-lijn op vandaag', await page.locator("[data-agenda-dag='2026-10-28'] .agv-nu").count() === 1);
      await shot(page, 'google-schrijven-week-1440-licht');
      await page.keyboard.press('d');
      await page.waitForSelector('[data-agenda-dagraster]');
      check('toetsen: D = dag', page.url().includes('weergave=dag'));
      await page.keyboard.press('l');
      await page.waitForSelector("[data-agenda-lijst='1']");
      check('toetsen: L = lijst met groepen per dag', await page.locator('.agv-lijst-groep').count() >= 3);
      await page.keyboard.press('m');
      await page.waitForSelector('[data-agenda-maand]');
      await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
      await page.keyboard.press('ArrowRight');
      await page.waitForSelector("[data-agenda-maand='2026-11']");
      check('toetsen: → = volgende maand', true);
      await page.keyboard.press('t');
      await page.waitForSelector("[data-agenda-maand='2026-10']");
      check('toetsen: T = vandaag', page.url().includes('datum=2026-10-28'));
      // Zoeken en agenda verbergen
      await page.fill('[data-agenda-v3-zoek]', 'олею');
      await page.waitForTimeout(150);
      const gevonden = await page.locator("[data-agenda-lijst='1'] [data-agenda-item]").allTextContents();
      check('zoeken: toont de gevonden afspraken als lijst, ook zonder hoofdletters', gevonden.length === 1, gevonden.join(' | '));
      await page.fill('[data-agenda-v3-zoek]', '');
      const voor = await page.locator('[data-agenda-maand] [data-agenda-item]').count();
      await page.locator("[data-agenda-v3-kalender='google:sport'] input").click();
      check('agenda verbergen: «Спорт» weg uit de maand', await page.locator('[data-agenda-maand] [data-agenda-item]').count() === voor - 1);
      await page.locator("[data-agenda-v3-kalender='google:sport'] input").click();
      // Detail
      await page.locator('[data-agenda-maand] [data-agenda-item]', { hasText: 'Огляд проєкту' }).first().click();
      await page.waitForSelector('.agv-detail');
      check('detail: knoppen wijzigen en verwijderen (Google, schrijfbaar)', await zichtbaar(page, "[data-agenda-v3-wijzig='1']") && await zichtbaar(page, "[data-agenda-v3-wis='1']"));
      await shot(page, 'google-schrijven-detail-1440-licht');
      await page.click("[data-agenda-v3-wis='1']");
      check('detail: verwijderen vraagt eerst inline bevestiging', await zichtbaar(page, "[data-agenda-v3-wis-ja='1']"));
      await page.click("[data-agenda-v3-wis-ja='1']");
      await page.waitForTimeout(300);
      const wis = n.s.aanroepen.find((a) => a.pad.endsWith('/verwijderen'));
      check('detail: verwijderen stuurt etag en sleutel mee', Boolean(wis && wis.body.etag === '"e-g"' && wis.body.idempotentieSleutel));
      await c.close();
    }
    // ── 5. ICS / CalDAV alleen lezen ──
    {
      const { c, page } = await open({ scenario: 'ics-caldav' });
      check('ics/caldav: afspraken uit abonnementen staan erin', await page.locator("[data-agenda-item-bron='ics']").count() >= 1 && await page.locator("[data-agenda-item-bron='caldav']").count() >= 1);
      await page.locator("[data-agenda-item-bron='caldav']").first().click();
      await page.waitForSelector('[data-agenda-v3-alleen-lezen]');
      check('ics/caldav: detail zegt «лише читання» met uitleg, geen wijzigknop', !(await page.locator("[data-agenda-v3-wijzig='1']").count()) && ((await page.textContent('[data-agenda-v3-alleen-lezen]')) || '').length > 20);
      await shot(page, 'ics-caldav-detail-1440-licht');
      await page.keyboard.press('Escape');
      await page.click('[data-agenda-v3-verbindingen]');
      await page.waitForSelector('[data-agenda-ics]');
      check('lade: ICS- en CalDAV-rij met staat; CalDAV schrijven=false', await page.locator("[data-agenda-ics='ics1']").count() === 1 && (await page.locator("[data-agenda-caldav='dav1'] [data-agenda-caldav-schrijven]").first().getAttribute('data-agenda-caldav-schrijven')) === 'false');
      check('lade: iCloud-venster bereikbaar', await page.locator("[data-agenda-icloud-open='1']").count() === 1);
      await shot(page, 'ics-caldav-diensten-1440-licht');
      await c.close();
    }
    // ── 6. ETag-conflict ──
    {
      const { c, page, n } = await open({ scenario: 'conflict' });
      await page.locator('[data-agenda-maand] [data-agenda-item]', { hasText: 'Обід з Олею' }).first().click();
      await page.click("[data-agenda-v3-wijzig='1']");
      await page.waitForSelector('[data-agenda-v3-titel]');
      await page.fill('[data-agenda-v3-titel]', 'Обід з Олею і Петром');
      await page.click('[data-agenda-v3-bewaar]');
      await page.waitForSelector("[data-agenda-conflict='1']");
      check('conflict: beide versies naast elkaar', ((await page.textContent('[data-agenda-conflict-eigen]')) || '').includes('Петром') && ((await page.textContent('[data-agenda-conflict-google]')) || '').includes('перенесено'));
      await shot(page, 'conflict-1440-licht');
      await page.click("[data-agenda-conflict-overschrijven='1']");
      await page.waitForTimeout(300);
      const w = n.s.aanroepen.filter((a) => a.pad.endsWith('/wijzigen'));
      check('conflict: overschrijven is bewust (negeerVersie=true, nieuwe etag)', w.length === 2 && w[0].body.etag === '"e-b"' && w[1].body.negeerVersie === true && w[1].body.etag === '"e-b2"');
      await c.close();
    }
    // ── 7. Synchronisatiefout: agenda blijft staan ──
    {
      const { c, page } = await open({ scenario: 'syncfout' });
      const voor = await page.locator('[data-agenda-item]').count();
      await page.click('[data-agenda-v3-verbindingen]');
      await page.click("[data-agenda-sync='1']");
      await page.keyboard.press('Escape');
      await page.waitForSelector('[data-agenda-v3-fout]');
      const tekst = (await page.textContent('[data-agenda-v3-fout]')) || '';
      check('syncfout: afspraken blijven staan (nooit leeg door een fout)', voor > 0 && await page.locator('[data-agenda-item]').count() === voor);
      check('syncfout: tijd van de laatste geslaagde verversing + «Повторити»', /станом на/.test(tekst) && await zichtbaar(page, "[data-agenda-v3-opnieuw='1']"), tekst);
      await shot(page, 'syncfout-1440-licht');
      await c.close();
    }
    // ── 8. Technische ruimte ──
    {
      const { c, page } = await open({ scenario: 'technisch' });
      check('technisch: balk «Технічний простір»', await zichtbaar(page, "[data-agenda-ruimte='technisch']"));
      await shot(page, 'technisch-1440-licht');
      await c.close();
      const g = await open({ scenario: 'gesloten', donker: true });
      check('technisch gesloten: uitleg met code, geen werkbalk en geen afspraken', await zichtbaar(g.page, "[data-agenda-ruimte='gesloten']") && !(await g.page.locator('[data-agenda-weergave]').count()));
      await shot(g.page, 'technisch-gesloten-1440-donker');
      await g.c.close();
    }
    // ── 9. DST en herhaling ──
    {
      const { c, page } = await open({ scenario: 'google-schrijven', zoek: 'weergave=week&datum=2026-10-25' });
      const top = await page.evaluate(() => { const b = [...document.querySelectorAll<HTMLElement>("[data-agenda-dag='2026-10-25'] [data-agenda-item]")][0]; return b ? Math.round(parseFloat(b.style.top)) : -1; });
      check('DST 25.10: 09:00 staat op de 09:00-lijn (432 px)', top === 432, String(top));
      await shot(page, 'dst-week-1440-licht');
      await page.keyboard.press('m');
      await page.waitForSelector('[data-agenda-maand]');
      const woensdagen = await page.evaluate(() => ['2026-10-14', '2026-10-21', '2026-10-28', '2026-11-04'].map((d) => [...document.querySelectorAll(`[data-agenda-dag='${d}'] [data-agenda-item]`)].some((e) => e.textContent?.includes('Планерка'))));
      check('herhaling: elke woensdag «Планерка», ook na de wintertijd', woensdagen.every(Boolean), JSON.stringify(woensdagen));
      const tijden = await page.evaluate(() => ['2026-10-21', '2026-11-04'].map((d) => [...document.querySelectorAll(`[data-agenda-dag='${d}'] [data-agenda-item] .agv-item-tijd`)].map((e) => e.textContent).join()));
      check('herhaling: steeds om 09:30', tijden.every((t) => t.includes('09:30')), JSON.stringify(tijden));
      await c.close();
    }
    // ── 10. Breedtes × thema's ──
    for (const breedte of [320, 360, 390, 768, 1024, 1440]) {
      for (const donker of [false, true]) {
        const th = donker ? 'donker' : 'licht';
        const { c, page } = await open({ scenario: 'google-schrijven', breedte, donker });
        const smal = breedte <= 768;
        check(`${breedte} ${th}: geen horizontale overloop`, await geenOverloop(page));
        check(`${breedte} ${th}: ${smal ? 'dag + onderbalk' : 'maand + zijbalk'}`, smal ? (await page.locator('[data-agenda-dag] .agv-dagenbalk').count() === 1 && await zichtbaar(page, '.agv-onderbalk')) : (await zichtbaar(page, '.agv-zijbalk') && await page.locator('[data-agenda-maand]').count() === 1));
        if (smal) { const klein = await kleineDoelen(page); check(`${breedte} ${th}: tikdoelen ≥ 44 px`, klein.length === 0, klein.slice(0, 6).join(' ')); }
        await shot(page, `google-${smal ? 'dag' : 'maand'}-${breedte}-${th}`);
        if (smal) {
          await page.click("[data-agenda-weergave='maand']");
          await page.waitForSelector('[data-agenda-maand]');
          check(`${breedte} ${th}: maand op telefoon zonder overloop`, await geenOverloop(page));
          await shot(page, `google-maand-${breedte}-${th}`);
          await page.click('.agv-onderbalk [data-agenda-nieuw]');
          await page.waitForSelector('.agv-laag.is-blad');
          check(`${breedte} ${th}: nieuw = blad van onderen`, await zichtbaar(page, '[data-agenda-v3-titel]'));
          await shot(page, `google-nieuw-blad-${breedte}-${th}`);
          await page.keyboard.press('Escape');
        } else {
          await page.click("[data-agenda-weergave='week']");
          await page.waitForSelector('[data-agenda-week]');
          check(`${breedte} ${th}: week zonder overloop`, await geenOverloop(page));
          await shot(page, `google-week-${breedte}-${th}`);
        }
        await c.close();
      }
    }
    // ── 11. Nederlands ──
    {
      const { c, page } = await open({ scenario: 'google-schrijven', nl: true, breedte: 1024 });
      check('nl: titel «Agenda» en geen Oekraïense knoppen', ((await page.textContent('#agv-titel')) || '') === 'Agenda' && ((await page.textContent("[data-agenda-weergave='week']")) || '').trim() === 'Week');
      await shot(page, 'nl-maand-1024-licht');
      await c.close();
    }
    check('geen enkel verzoek buiten de lokale stand', geweigerd.length === 0, geweigerd.slice(0, 3).join(' '));
    check('geen JavaScript-fouten in de pagina', fouten.length === 0, fouten.slice(0, 3).join(' | '));
  } finally {
    await browser.close().catch(() => undefined);
    server.close();
  }
  return einde();
}
