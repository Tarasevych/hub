// Stand «knipsels» 20.10.2026: echte Chrome tegen de lokale build (dist/) — ELKE pagina van elke dienst, drie maten (390×844,
// 768×1024, 1280×800), licht + donker, uk (+ nl op 1280 licht). Per knipsel: axe-core (color-contrast), eigen geometrie
// (uitsteken buiten de viewport, overlappende knoppen/tekst, afgeknipte tekst, te kleine knoppen op de telefoon, letters < 12px),
// pseudo-logo's (monogram [data-merk="onbekend"], kapotte <img>), console- en netwerkfouten, en of het merk-logos-bundelstuk laadt.
// Uitvoer: $STAND_UIT/<pagina>-<maat>-<thema>.png + resultaten.json + defecten.md. Herhaalbaar: node tests/e2e/stand-knipsels-20261020.mjs [LABEL]
// Alleen lokaal: server in dit proces (tests/e2e/server.ts), Chrome met chromeArgs() (alles buiten *.tarasevych.com → ~NOTFOUND).
import { createRequire } from 'node:module';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createHash, randomBytes } from 'node:crypto';
import { checker } from '../eenheid/hulp/nep-google';
import { startE2eServer, chromeArgs } from './server';
import { techAan } from './hulp/tech';
import { getPool } from '../../server/platform/pg';
import * as c from '../../backend/mcp-connector';
import { SERVICE_HOSTS } from '../../backend/deployment-identiteit';
import { mailNep, mailNepUit, wachtOpLijst, meetLijst, meetMenu, meetPostvakken } from './hulp/stand-mail-nep';
import { paneelVol, fabBel } from './hulp/stand-meldingen'; // 21.10 агент A: панель сповіщень + FAB/дзвоник
import { plaatsingDok, plaatsingLagen, plaatsingNa, plaatsingNu } from './hulp/stand-plaatsing'; // 25.10: zwevende knoppen — scrollen, adresbalk, «Вгору», veeg op de bel, knijpzoom, pc → telefoon, herladen
import { mailAccountsNa, mailAccountsRoutes, type AccCtx } from './hulp/stand-mail-accounts'; // 21.10 агент D: «Поштові акаунти» з підключеними акаунтами
import { opstelStappen } from './hulp/stand-opstellen'; // 21.10 агент B: вікно «Новий лист» (меню, кнопки, шаблони, Cc/Bcc, відновлення)
import { toegankelijkStappen } from './hulp/stand-toegankelijk'; // 21.10 рецензент доступності: клавіатура + axe WCAG 2.2 AA (a11y-*)
import { dokStappen } from './hulp/stand-dok'; // 21.10 агент вікон: док згорнутих вікон vs вікно згоди v2 (venster-dok-*)
import { zoekStappen, zoekTechStappen } from './hulp/stand-zoek'; // 22.10 Z4: /zoek (begin, autodoploen+debounce, filters→server, niets, geschiedenis nieuw/weg, palet ⌘K hub+mail, axe)
import { zoekMenuMail, zoekMenuHub } from './hulp/stand-zoek-menu'; // 24.10 (één update): globale zoekknop op de post in het menu (lade tussen foto en «Редагувати меню»; zijbalk vóór «Налаштувати меню»)
import { lezerNep, lezerStap, lezerGeminimaliseerd, lezerDock, lezerContextStap } from './hulp/stand-lezer';
import { lezerAiNep, lezerAiStap } from './hulp/stand-lezer-ai'; // 24.10 pakket 3: ШІ in de brief met controle van de bronnen («Що від вас потрібно?», «Звідки це?», «Порівняти»), tweetalig lezen // 24.10 pakket 1 «Adaptive Mail Canvas»: één leesvenster in elke vorm (volledig/rechts/onder/zwevend/telefoon) — geometrie, focus, Escape, «Назад», ⋮
import { rookStappen } from './hulp/stand-rook-20261022'; // 22.10 зона A: «Діагностика» → картка «Рендеринг сторінок» + кнопка «Перевірити рендеринг»
import { besluitStappen } from './hulp/stand-besluit'; // 22.10 зона B: рішення власника з passkey (відкат-майстер, зовнішні хости) + одна стрічка історії
import { sferenStappen } from './hulp/stand-sferen-20261022'; // 22.10 зона C: сфери сповіщень — дзвоник лише особисті, смуга лише технічні (+ дії в технічному просторі)
import { terminalStappen } from './hulp/stand-terminal-20261022'; // 22.10 зона G: «Термінал» без пристрою (майстер) / сервер-пристрій (одразу підключено, підтвердження) / PowerShell-ПК
import { werkbladStappen } from './hulp/stand-werkblad'; // 22.10 зона F: робочий стіл hub/overzicht (werkblad-*: leeg, gevuld+LCP, instellen, catalogus, sleep, toetsenbord, telefoon, axe, tech)
import { browserStappen } from './hulp/stand-browser-20261022'; // 22.10 зона E: «Браузер і агенти» (матриця слот × можливість × агент, строк, «Дозволити все» з попередженням, перенаправлення зі старої вкладки)
import { blok1Stappen } from './hulp/stand-blok1'; // 25.10 blok 1 «швидкі виправлення»: stappen blok1-* van de vier teams (elk een eigen bestand)

const PW = process.env.PLAYWRIGHT_CORE || '/opt/node-tools/node_modules/playwright-core';
const TLS = process.env.E2E_TLS || 'rapporten/stand/tls';
const UIT = process.env.STAND_UIT || 'rapporten/stand/knipsels';
const POORT = Number(process.env.E2E_POORT || 8443);
const CHROME = process.env.CHROME || '/opt/pw-browsers/chromium';
const AXE = process.env.AXE_CORE || '/tmp/aipw/axe/node_modules/axe-core/axe.min.js';
const FILTER = process.env.STAND_FILTER || '';
const VANAF = process.env.STAND_VANAF || '';
const MATEN = (process.env.STAND_MATEN || '390x844,768x1024,1280x800').split(',').map((m) => { const [w, h] = m.split('x').map(Number); return { w, h }; });
const NL_OOK = process.env.STAND_NL !== '0';
const DONKER_OOK = process.env.STAND_DONKER !== '0';
const H = (s: keyof typeof SERVICE_HOSTS) => `https://${SERVICE_HOSTS[s]}`;
const MCP = H('mcp');
const CALLBACK = 'https://claude.ai/api/mcp/auth_callback';
const CALLBACK_GPT = 'https://chatgpt.com/connector_platform_oauth_redirect';

type Page = import('playwright-core').Page;
type Maat = { w: number; h: number };
type Thema = 'licht' | 'donker';
type Defect = { pagina: string; maat: string; thema: string; taal: string; element: string; type: string; waarde: string; knipsel: string };
type Stap = { naam: string; url: string | (() => Promise<string>); voor?: (page: Page) => Promise<void>; na?: (page: Page) => Promise<void>; alleen1280?: boolean; wachtOp?: string; fase?: 'prive' | 'tech' };

const slug = (s: string) => s.replace(/[^a-z0-9а-яіїє-]+/gi, '-').replace(/^-|-$/g, '');

export async function main(): Promise<number> {
  const { check, einde } = checker('stand knipsels 20261020');
  const { chromium } = createRequire(import.meta.url)(PW) as typeof import('playwright-core');
  const T = `${Date.now()}-${randomBytes(2).toString('hex')}`;
  const eigenaar = `stand-${T}@example.test`, sub = `sub-stand-${T}`;
  mkdirSync(UIT, { recursive: true });
  const log: string[] = [];
  const zeg = (s: string) => { console.log(s); log.push(s); };
  zeg(`dist: ${process.env.E2E_DIST || 'dist'} (index.html ${(() => { try { return statSync(join(process.env.E2E_DIST || 'dist', 'index.html')).mtime.toISOString(); } catch { return '?'; } })()})`);
  const { G, stop } = await startE2eServer({ ownerEmail: eigenaar, poort: POORT, tls: TLS });
  const pool = getPool('systeem');
  const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: chromeArgs(POORT) });
  const defecten: Defect[] = [];
  const knipsels: Array<{ pagina: string; maat: string; thema: string; taal: string; bestand: string; url: string; titel: string; htmlKlasse: string; axeIncompleet: number; axeTijd: number }> = [];
  const paginaFouten: Record<string, { console: string[]; netwerk: string[]; merkChunk: string[] }> = {};
  const clients: string[] = [];
  const axeBron = existsSync(AXE) ? readFileSync(AXE, 'utf8') : '';
  if (!axeBron) zeg(`!! axe-core niet gevonden op ${AXE}: contrast wordt niet gemeten`);
  try {
    const tab = randomBytes(24).toString('hex');
    const b = G.browser();
    const r = await b.aanmelden(sub, eigenaar, { service: 'identity', tabContext: tab, intent: 'login', authTime: Math.floor(Date.now() / 1000) });
    check('aanmelden als eigenaar (nep-Google, cookie-jar)', r.cb.data.sessionCreated === true, JSON.stringify(r.cb.data).slice(0, 200));
    const uid = String((await pool.query("select id from app.records where tbl='users' and data->>'email'=$1", [eigenaar])).rows[0]?.id || '');
    check('eigenaar bestaat in de database', !!uid);
    const ctx = await browser.newContext({ colorScheme: 'light', locale: 'uk-UA', viewport: { width: 1280, height: 800 }, timezoneId: 'Europe/Brussels', serviceWorkers: 'block', ignoreHTTPSErrors: true });
    await ctx.addCookies([...b.jar].flatMap(([name, value]) => Object.values(SERVICE_HOSTS).map((host) => ({ name, value, url: `https://${host}/`, secure: true, httpOnly: true, sameSite: 'Lax' as const }))));
    await ctx.addInitScript((t) => { if (!sessionStorage.getItem('tsv-canonical-tab-v1')) sessionStorage.setItem('tsv-canonical-tab-v1', t); }, tab);
    let terug = '';
    await ctx.route('https://claude.ai/**', (route) => { terug = route.request().url(); return route.fulfill({ status: 200, contentType: 'text/html', body: '<title>Claude</title><p>terug</p>' }); });
    await ctx.route('https://chatgpt.com/**', (route) => { terug = route.request().url(); return route.fulfill({ status: 200, contentType: 'text/html', body: '<title>ChatGPT</title><p>terug</p>' }); });
    const page = await ctx.newPage();
    let huidig = '';
    const fout = (soort: 'console' | 'netwerk' | 'merkChunk', s: string) => { if (!huidig) return; (paginaFouten[huidig] ??= { console: [], netwerk: [], merkChunk: [] })[soort].push(s); };
    page.on('console', (m) => { if ((m.type() === 'error' || m.type() === 'warning') && !/^Failed to load resource|Service Worker registration blocked/.test(m.text())) fout('console', `${m.type()}: ${m.text().slice(0, 300)}`); });
    page.on('pageerror', (e) => fout('console', `pageerror: ${e.message.slice(0, 300)}`));
    page.on('response', (q) => {
      const u = q.url(); if (/merk-logos|merk-tabel|MerkLogo/.test(u)) fout('merkChunk', `${q.status()} ${u}`);
      if (q.status() >= 400) { const k = huidig; q.text().catch(() => '').then((t) => { const vorige = huidig; huidig = k; fout('netwerk', `${q.status()} ${q.request().method()} ${u}${t ? ` ← ${t.replace(/\s+/g, ' ').slice(0, 160)}` : ''}`); huidig = vorige; }); }
    });
    page.on('requestfailed', (q) => { const f = q.failure()?.errorText || ''; if (!/ERR_ABORTED/.test(f)) fout('netwerk', `MISLUKT ${f} ${q.method()} ${q.url()}`); });

    // ---------------------------------------------------------------- toestemmingsvensters (consent) voorbereiden
    const consentUrl = async (agent: 'claude' | 'gpt' | null, naam: string) => {
      const cb = agent === 'gpt' ? CALLBACK_GPT : CALLBACK;
      const reg = JSON.parse((await c.registerClient(JSON.stringify({ client_name: naam, redirect_uris: [cb] }))).body);
      clients.push(reg.client_id);
      const verifier = randomBytes(32).toString('base64url');
      const a = await c.authorize({ response_type: 'code', client_id: reg.client_id, redirect_uri: cb, code_challenge: createHash('sha256').update(verifier).digest('base64url'), code_challenge_method: 'S256', state: 'stand', resource: agent ? `${MCP}/${agent}` : c.RESOURCE });
      const u = String(Object.entries(a.headers).find(([k]) => k.toLowerCase() === 'location')?.[1] || '');
      if (!u.startsWith(`${MCP}/agents?consent=`)) zeg(`!! consent-url voor ${naam}: ${a.statusCode} ${u || a.body?.slice(0, 200)}`);
      return u;
    };

    // ---------------------------------------------------------------- stappenlijst (alle tabs per dienst, Nederlandse slugs)
    const S = (naam: string, url: string, extra: Partial<Stap> = {}): Stap => ({ naam, url, ...extra });
    // Вимірювання всередині кроку: пише в лог і (якщо є порушення) як дефект «meting».
    const meting = (naam: string, p: Page, slecht: string, detail: string) => {
      const v = p.viewportSize(); const maat = v ? `${v.width}×${v.height}` : '?';
      zeg(`   meting ${naam} ${maat}: ${slecht || 'OK'} — ${detail.slice(0, 3000)}`);
      writeFileSync(join(UIT, `meting-${naam}-${v ? v.width : 0}.json`), detail);
      if (slecht) defecten.push({ pagina: naam, maat, thema: 'licht', taal: '-', element: '-', type: 'meting', waarde: slecht.slice(0, 600), knipsel: '' });
    };
    // Accountmenu: op de telefoon (≤700px) zit de avatar in de lade achter de menuknop.
    const accountMenu = async (p: Page) => {
      const av = p.locator('.canonical-avatar-trigger').first();
      if (!(await av.isVisible().catch(() => false))) { await p.locator('.canonical-menu-toggle').first().click({ timeout: 5000 }); await p.waitForTimeout(500); }
      await p.locator('.canonical-avatar-trigger').first().click({ timeout: 5000 }); await p.waitForTimeout(700);
    };
    const zijbalk = async (p: Page) => { await p.locator('.canonical-menu-toggle').first().click({ timeout: 5000 }); await p.waitForTimeout(600); };
    const accCtx: AccCtx = { uid: () => uid, eigenaar, sub, zeg, meting };
    const accNa = mailAccountsNa(accCtx);
    const stappen: Stap[] = [
      // hub
      S('hub-overzicht', `${H('hub')}/overzicht`), S('hub-recent', `${H('hub')}/recent`), S('hub-taken', `${H('hub')}/taken`), S('hub-agenda', `${H('hub')}/agenda`), S('hub-notities', `${H('hub')}/notities`),
      S('hub-blokken-start', `${H('hub')}/overzicht`, { na: async (p) => { const k = p.getByRole('button', { name: /Почати з пошти|Begin met/ }).first(); if (await k.count()) { await k.click({ timeout: 5000 }); await p.waitForTimeout(2500); } } }),
      S('hub-blokken-catalogus', `${H('hub')}/overzicht`, { na: async (p) => { const k = p.getByRole('button', { name: /каталог блоків|catalogus/i }).first(); if (await k.count()) { await k.click({ timeout: 5000 }); await p.waitForTimeout(1200); } else throw new Error('SKIP geen catalogusknop (blokken al geplaatst)'); } }),
      S('hub-accountmenu', `${H('hub')}/overzicht`, { na: accountMenu }),
      S('hub-zijbalk-menu', `${H('hub')}/overzicht`, { na: zijbalk }),
      S('mail-zijbalk-menu', `${H('mail')}/postvak-in`, { na: zijbalk }),
      // 21.10 (агент A): відкрита панель сповіщень з 36 сповіщеннями (висота списку ≥ 70% на телефоні) і FAB «Новий лист» + дзвоник
      // (не перетинаються, не стрибають після відкриття/закриття панелі, FAB ухиляється від перетягнутого дзвоника). Див. hulp/stand-meldingen.ts.
      S('mail-meldingen-paneel-vol', `${H('mail')}/postvak-in`, { na: paneelVol({ uid: () => uid, uit: UIT, zeg, meting }) }),
      S('mail-meldingen-fab-bel', `${H('mail')}/postvak-in`, { voor: mailNep, na: fabBel({ uid: () => uid, uit: UIT, zeg, meting }) }),
      S('plaatsing-nu', `${H('mail')}/postvak-in`, { voor: mailNep, na: plaatsingNu({ uit: UIT, zeg, meting }) }),
      // 25.10: acceptatie van zones en gniezda (shared/plaatsing.ts): standaard, scrollen, adresbalk, «Вгору», veeg, zoom, slepen, volle zone, toetsenbord, terug
      S('plaatsing-na', `${H('mail')}/postvak-in`, { voor: mailNep, na: plaatsingNa({ uit: UIT, zeg, meting }) }),
      S('plaatsing-dok', `${H('mail')}/postvak-in`, { voor: mailNep, na: plaatsingDok({ uit: UIT, zeg, meting }, `${H('identity')}/menu`, `${H('mail')}/postvak-in`) }),
      // 25.10: de nieuwe lagen (tellers tijdens het slepen, hint bij een volle zone, «Перемістити до…») in licht en donker, met axe
      S('plaatsing-lagen', `${H('mail')}/postvak-in`, { voor: mailNep, na: plaatsingLagen({ uit: UIT, zeg, meting, axe: axeBron, hubUrl: `${H('hub')}/overzicht` }) }),
      // 25.10 blok 1: knoppen in de rij, één bron van acties, ingeklapte brieven, de bel boven vensters, venster «Підтвердіть доступ»
      ...blok1Stappen({ H, uid: () => uid, uit: UIT, axe: axeBron, zeg, meting, consentUrl }),
      // 24.10.2026 (één update): globale zoekknop op de post IN HET MENU, niet boven het accountmenu van de post. Telefoon: lade tussen
      // profielfoto en «Редагувати меню», Gmail-avatar vrij; computer: werkbalk van de zijbalk, «Оновити пошту»/«Швидкі налаштування» vrij.
      S('mail-zoek-in-menu', `${H('mail')}/postvak-in`, { voor: mailNep, na: zoekMenuMail({ uit: UIT, zeg, meting }) }),
      S('hub-zoek-ongewijzigd', `${H('hub')}/overzicht`, { na: zoekMenuHub({ uit: UIT, zeg, meting }) }),
      // 24.10.2026 (pakket 1 «Adaptive Mail Canvas»): één leesvenster, vier vormen op de computer + de telefoon — de brief overlapt de
      // lijst niet, de kop blijft binnen het scherm, focus/Escape/«Назад» gedragen zich overal hetzelfde, geen kopactie verdwijnt (⋮).
      ...(['volledig', 'rechts', 'onder', 'zwevend'] as const).map((v) => S(`mail-lezer-${v}`, `${H('mail')}/postvak-in`, { voor: (p) => lezerNep(p, v), na: lezerStap({ uit: UIT, zeg, meting }, v) })),
      S('mail-lezer-geminimaliseerd', `${H('mail')}/postvak-in`, { voor: (p) => lezerNep(p, 'volledig'), na: lezerGeminimaliseerd({ uit: UIT, zeg, meting }) }),
      // 24.10 pakket 2: contextpaneel (kolom/blad), brieven, «Вигляд», sneltoetsen, telefoonbalk — en geen verzoek van de browser naar buiten
      ...(['volledig', 'rechts'] as const).map((v) => S(`mail-lezer-context-${v}`, `${H('mail')}/postvak-in`, { voor: (p) => lezerNep(p, v), na: lezerContextStap({ uit: UIT, zeg, meting }, v) })),
      // 24.10 pakket 3: «Що від вас потрібно?» (eenvoudig en met een nagebootste privé-agent, één punt verzonnen), «Звідки це?», «Показати
      // абзац у листі», vertaalstrook en «Порівняти», contextpaneel (punten, «Порівняти версії» met echte PDF's), antwoordregel — en axe
      ...(['volledig', 'rechts'] as const).map((v) => S(`mail-lezer-ai-${v}`, `${H('mail')}/postvak-in`, { voor: (p) => lezerAiNep(p, v), na: lezerAiStap({ uit: UIT, zeg, meting, axe: axeBron }, v) })),
      ...(['rechts', 'boven', 'onder'] as const).map((d) => S(`mail-lezer-dock-${d}`, `${H('mail')}/postvak-in`, { voor: (p) => lezerNep(p, 'volledig'), na: lezerDock({ uit: UIT, zeg, meting }, `${H('identity')}/menu`, `${H('mail')}/postvak-in`, d) })),
      // 21.10 (агент C): змодельована пошта (18 листів: непрочитані, довгі імена/адреси, мініатюри вкладень, 2 акаунти з фото) — список,
      // меню ⋮ першого листа (elementFromPoint у центрі кожного пункту = сам пункт) і «Поштові скриньки» (аватари: ширина = висота).
      S('mail-agc-lijst', `${H('mail')}/postvak-in`, { voor: mailNep, na: async (p) => { await wachtOpLijst(p); const m = await meetLijst(p); const slecht = [...m.filter((x) => x.puntOverMeer).map((_, i) => `punt-onder-meer#${i}`), ...m.filter((x) => x.veeg.some((v) => !v.binnen)).map((x) => `veegtekst-buiten: ${x.veeg.filter((v) => !v.binnen).map((v) => `${v.tekst} ${v.tekstBreed}>${v.knop}`).join(',')}`), ...m.filter((x) => x.adres && x.adres.zichtbaar > 0 && x.adres.zelfdeRegel && x.naam && x.naam.nodig > x.naam.zichtbaar + 1 && x.adres.zichtbaar > 40).map((x) => `naam-afgeknipt-bij-adres: ${x.naam!.tekst} ${x.naam!.zichtbaar}/${x.naam!.nodig}`)]; meting('mail-agc-lijst', p, [...new Set(slecht)].join('; '), JSON.stringify(m)); } }),
      S('mail-agc-lijst-minimum', `${H('mail')}/postvak-in`, { voor: (p) => mailNep(p, { dichtheid: 'minimum' }), na: async (p) => { await wachtOpLijst(p); const m = await meetLijst(p); const slecht = [...m.filter((x) => x.puntOverMeer).map((_, i) => `punt-onder-meer#${i}`), ...m.filter((x) => x.veeg.some((v) => !v.binnen)).map((x) => `veegtekst-buiten: ${x.veeg.filter((v) => !v.binnen).map((v) => `${v.tekst} ${v.tekstBreed}>${v.knop}`).join(',')}`), ...m.filter((x) => x.adres && x.adres.zichtbaar > 0 && x.adres.zelfdeRegel && x.naam && x.naam.nodig > x.naam.zichtbaar + 1 && x.adres.zichtbaar > 40).map((x) => `naam-afgeknipt-bij-adres: ${x.naam!.tekst} ${x.naam!.zichtbaar}/${x.naam!.nodig}`)]; meting('mail-agc-lijst-minimum', p, [...new Set(slecht)].join('; '), JSON.stringify(m)); } }),
      // 21.10.2026 (merk-bron): rijen MET rondje (dichtheid «bulky»): foto/logo van de afzender van de eigen server (app.merk_beeld) —
      // of de beginletters zonder sprong. Meet: elk rondje even groot, en geen enkel <img> van buiten de eigen oorsprong.
      S('mail-afzender-beelden', `${H('mail')}/postvak-in`, { voor: (p) => mailNep(p, { dichtheid: 'bulky' }), na: async (p) => { await wachtOpLijst(p); await p.waitForTimeout(900); const m = await p.evaluate(() => { const rond = [...document.querySelectorAll('.mail-row-avatar')].map((e) => { const r = e.getBoundingClientRect(); return { w: Math.round(r.width), h: Math.round(r.height), soort: (e as HTMLElement).dataset.afzenderFoto || '', img: !!e.querySelector('img') }; }); const extern = [...document.images].map((i) => i.currentSrc || i.src).filter((u) => !!u && !u.startsWith('data:') && !u.startsWith('blob:') && !u.startsWith(location.origin)); return { rond, extern }; }); const maten = new Set(m.rond.map((r) => `${r.w}x${r.h}`)); meting('mail-afzender-beelden', p, [maten.size > 1 ? `rondjes verschillend: ${[...maten].join(',')}` : '', m.extern.length ? `extern: ${m.extern.slice(0, 3).join(' ')}` : ''].filter(Boolean).join(' · '), JSON.stringify({ rondjes: m.rond.length, merk: m.rond.filter((r) => r.soort === 'merk').length, persoon: m.rond.filter((r) => r.soort === 'persoon').length, maten: [...maten], extern: m.extern })); } }),
      S('mail-agc-menu', `${H('mail')}/postvak-in`, { voor: mailNep, na: async (p) => { await wachtOpLijst(p); const m = await meetMenu(p); const slecht = 'fout' in m ? [String(m.fout)] : [...(m.binnen ? [] : ['menu-buiten-scherm']), ...m.items.filter((i) => !i.raak).map((i) => `niet-bovenaan: ${i.label} ← ${i.boven}`), ...m.items.filter((i) => i.tekstAf).map((i) => `tekst-afgeknipt: ${i.label}`), ...(new Set(m.items.filter((i) => !i.label.includes('Колір') && !i.label.includes('Kleur')).map((i) => i.h)).size > 1 ? ['ongelijke-hoogte'] : [])]; meting('mail-agc-menu', p, slecht.join('; '), JSON.stringify(m)); } }),
      S('mail-agc-postvakken', `${H('mail')}/postvak-in`, { voor: mailNep, na: async (p) => { await wachtOpLijst(p); const m = await meetPostvakken(p); const slecht = m.filter((x) => Math.abs(x.w - x.h) > 0.5).map((x) => `${x.el} ${x.w}×${x.h}`); meting('mail-agc-postvakken', p, slecht.join('; '), JSON.stringify(m)); } }),
      S('hub-zoeken', `${H('hub')}/overzicht`, { na: async (p) => { /* 22.10 (Z2): de zoekknop van Z4 draagt data-zoek-trigger (veld op desktop, mobiel op 390); `.first()` op aria-label pakte op 390 een verborgen knop. */ const k = p.locator('[data-zoek-trigger]:visible, .global-search-trigger:visible, [data-zoeken]:visible').first(); if (await k.count()) { await k.click({ timeout: 5000 }); await p.waitForTimeout(600); } else throw new Error('SKIP geen zoekknop op de hub'); } }),
      // identity (id)
      ...['personalisatie', 'menu', 'themas', 'talen', 'blokken', 'delen', 'identiteit', 'account', 'sessies', 'aanmeldmethoden', 'beveiliging', 'herstel'].map((t) => S(`id-${t}`, `${H('identity')}/${t}`)),
      S('id-accountmenu', `${H('identity')}/account`, { na: accountMenu }),
      // mail
      ...['postvak-in', 'met-ster', 'verzonden', 'concepten', 'archief', 'etiketten', 'accounts', 'prive', 'alles', 'spam', 'prullenbak', 'abonnementen', 'gepland', 'instellingen', 'contacten'].map((t) => S(`mail-${t}`, `${H('mail')}/${t}`)),
      // 21.10 (агент D): «Поштові акаунти» з ПІДКЛЮЧЕНИМИ акаунтами (2× Gmail, Outlook «потрібен повторний вхід», Ukr.net IMAP — справжні рядки в базі):
      // «Відключити» в кожному рядку, без окремої секції Microsoft; вікно Gmail для ДОДАТКОВОГО акаунта → nep-Google з prompt=…select_account; вікно Outlook.
      S('mail-accounts-gekoppeld', `${H('mail')}/accounts`, { voor: (p) => mailAccountsRoutes(p, accCtx), na: accNa.gekoppeld }),
      S('mail-gmail-additional', `${H('mail')}/accounts`, { voor: (p) => mailAccountsRoutes(p, accCtx), na: accNa.gmailExtra }),
      S('mail-outlook-venster', `${H('mail')}/accounts`, { voor: (p) => mailAccountsRoutes(p, accCtx), na: accNa.outlook }),
      // mail: koppelvenster per aanbieder (knop i op /accounts)
      ...[0, 1, 2, 3, 4, 5].map((i) => S(`mail-koppelvenster-${i}`, `${H('mail')}/accounts`, { na: async (p) => { const k = p.locator('[data-mail-provider-knop="ja"]').nth(i); if (!(await k.count())) throw new Error(`SKIP geen aanbieder #${i}`); const id = await k.getAttribute('data-mail-provider'); await k.click({ timeout: 5000 }); await p.waitForTimeout(900); zeg(`   mail-koppelvenster-${i} = ${id}`); } })),
      // mail: вікно «Новий лист» (агент B, 21.10): mail-opstellen-*
      ...opstelStappen({ mailUrl: `${H('mail')}/postvak-in`, uit: UIT, check, zeg }),
      // 21.10 (рецензент доступності): клавіатурні сценарії + axe (wcag2a/aa, 21a/aa, 22aa) для панелі сповіщень, FAB/дзвоника, «Новий лист», «⋮» рядка, скриньок, «Поштові акаунти»
      ...toegankelijkStappen({ mailUrl: `${H('mail')}/postvak-in`, accountsUrl: `${H('mail')}/accounts`, uid: () => uid, uit: UIT, axe: axeBron, acc: accCtx, zeg, meting }),
      // 21.10 (агент вікон): док згорнутих вікон не лежить над вікном згоди v2 (elementFromPoint кнопок), перетягування/збереження, меню доку
      ...dokStappen({ mailUrl: `${H('mail')}/postvak-in`, consentUrl: () => consentUrl('claude', 'Claude'), uit: UIT, zeg, meting, voorMail: mailNep }),
      // 22.10 (Z4): zoekpagina, palet en geschiedenis (zoek-*)
      ...zoekStappen({ hubUrl: H('hub'), mailUrl: `${H('mail')}/postvak-in`, uid: () => uid, uit: UIT, axe: axeBron, zeg, meting }),
      // 22.10 (зона F): werkblad-* (persoonlijke lade)
      ...werkbladStappen({ hubUrl: H('hub'), uid: () => uid, uit: UIT, axe: axeBron, zeg, meting }).filter((s) => s.fase !== 'tech'),
      // 22.10 (зона E): browser-* (mcp/agents#browser, privé-fase)
      ...browserStappen({ mcpUrl: MCP, uid: () => uid, zeg }).filter((s) => s.fase !== 'tech'),
      // cloud (privé)
      ...['overzicht', 'werkruimtes', 'vastleggen', 'postvak-in', 'zoeken', 'recent', 'agenda', 'fotos', 'accounts', 'google', 'onedrive', 'dropbox'].map((t) => S(`cloud-${t}`, `${H('cloud')}/${t}`)),
      S('cloud-zoekpaneel', `${H('cloud')}/overzicht`, { na: async (p) => { await p.locator('.global-search-trigger').first().click({ timeout: 5000 }); await p.waitForTimeout(600); } }),
      // ai
      ...['werkgebied', 'agenten', 'processen', 'werkstromen', 'verbindingen'].map((t) => S(`ai-${t}`, `${H('ai')}/${t}`)),
      // github, huis, api
      ...['overzicht', 'repositories', 'projecten', 'documentatie', 'onderzoek', 'accounts', 'activiteit'].map((t) => S(`github-${t}`, `${H('github')}/${t}`)),
      S('huis-overzicht', `${H('huis')}/overzicht`),
      ...['verbindingen', 'kluis', 'toegang', 'afstemming'].map((t) => S(`api-${t}`, `${H('api')}/${t}`)),
      // mcp
      ...['overzicht', 'dashboard', 'diensten', 'hulpmiddelen', 'bord', 'agenten', 'apps', 'zandbak', 'verkeer', 'verbinden', 'routekaart', 'downloaden', 'verbindingen'].map((t) => S(`mcp-${t}`, `${MCP}/${t}`)),
      ...['agent/claude', 'agent/gpt', 'connectors', 'ai', 'extern', 'extensie', 'apparaten', 'tokens', 'toegang', 'technisch', 'journaal'].map((t) => S(`mcp-agenten-${slug(t)}`, `${MCP}/agenten#${t}`)),
      // admin zonder technisch profiel (de poort), alleen 1280
      ...['overzicht', 'toegang', 'ai', 'contour', 'updates', 'apps', 'apparaten', 'sso', 'mappen', 'rollen', 'diagnostiek', 'audit'].map((t) => S(`admin-${t}-zonder-tech`, `${H('admin')}/${t}`, { alleen1280: true })),
      // ---- technisch profiel aan (fase tech)
      ...['overzicht', 'werkruimtes', 'vastleggen', 'postvak-in', 'zoeken', 'recent', 'agenda', 'fotos', 'accounts', 'google', 'onedrive', 'dropbox'].map((t) => S(`cloud-${t}-tech`, `${H('cloud')}/${t}`, { fase: 'tech' })),
      ...['overzicht', 'toegang', 'ai', 'contour', 'updates', 'apps', 'apparaten', 'sso', 'mappen', 'rollen', 'diagnostiek', 'audit'].map((t) => S(`admin-${t}`, `${H('admin')}/${t}`, { fase: 'tech' })),
      S('admin-accountmenu-tech', `${H('admin')}/overzicht`, { fase: 'tech', na: accountMenu }),
      S('mcp-agenten-technisch-tech', `${MCP}/agenten#technisch`, { fase: 'tech' }),
      S('mcp-agenten-agent-claude-tech', `${MCP}/agenten#agent/claude`, { fase: 'tech' }),
      S('hub-overzicht-tech', `${H('hub')}/overzicht`, { fase: 'tech' }),
      ...werkbladStappen({ hubUrl: H('hub'), uid: () => uid, uit: UIT, axe: axeBron, zeg, meting }).filter((s) => s.fase === 'tech'),
      // 22.10 (zone D): /zoek in het technisch profiel — strook «технічний простір» + venster «Індексація» (dok, maximaliseren, slepen, sluiten, axe)
      ...zoekTechStappen({ hubUrl: H('hub'), mailUrl: `${H('mail')}/postvak-in`, uid: () => uid, uit: UIT, axe: axeBron, zeg, meting }),
      // 22.10 (зона A): рендер-контроль у «Діагностиці» (admin-diagnostiek-rendering)
      ...rookStappen({ adminUrl: H('admin'), zeg }),
      // 22.10 (зона B): майстер відкату на mcp/dashboard, білий список хостів на mcp/agenten#extern (віртуальний passkey + root-скрипт у стенді), історія (besluit-*)
      ...besluitStappen({ mcpUrl: MCP, adminUrl: H('admin'), uid: () => uid, uit: UIT, zeg }),
      ...terminalStappen({ hubUrl: H('hub'), uid: () => uid, zeg }),
      // 22.10 (зона E): browser-agenten-tech (технічний слот при активному технічному профілі)
      ...browserStappen({ mcpUrl: MCP, uid: () => uid, zeg }).filter((s) => s.fase === 'tech'),
    ];
    // consent-vensters: v2 (KoppelWizard) voor claude en gpt, oud venster (McpConsentModal) voor /mcp; elk zonder én met technisch profiel
    const consentStappen = (fase: 'prive' | 'tech') => {
      const suffix = fase === 'tech' ? '-tech' : '';
      // Elke keer een vers verzoek: een autorisatieverzoek verloopt na enkele minuten.
      const uClaude = () => consentUrl('claude', 'Claude'), uGpt = () => consentUrl('gpt', 'ChatGPT'), uOud = () => consentUrl(null, 'Oude connector');
      const stapV2 = async (p: Page, stap: string) => {
        const w = p.locator('[data-v2-wizard]'); await w.waitFor({ timeout: 20000 });
        for (let i = 0; i < 4 && (await w.getAttribute('data-v2-stap')) !== stap; i++) {
          if ((await w.getAttribute('data-v2-stap')) === 'ruimte') { const k = w.locator('.v2-ruimte-kaart input').first(); if (await k.count()) await k.check().catch(() => undefined); }
          await w.getByRole('button', { name: /Далі|Volgende|Verder/ }).first().click({ timeout: 5000 }); await p.waitForTimeout(400);
        }
      };
      const lijst: Stap[] = [
        S(`consent-claude-v2-1-bevestigen${suffix}`, uClaude, { fase, wachtOp: '[data-v2-wizard]' }),
        S(`consent-claude-v2-2-account${suffix}`, uClaude, { fase, na: (p) => stapV2(p, 'account') }),
        S(`consent-claude-v2-3-ruimte${suffix}`, uClaude, { fase, na: (p) => stapV2(p, 'ruimte') }),
        S(`consent-claude-v2-4-rechten${suffix}`, uClaude, { fase, na: (p) => stapV2(p, 'rechten') }),
        S(`consent-gpt-v2-1-bevestigen${suffix}`, uGpt, { fase, wachtOp: '[data-v2-wizard]' }),
        S(`consent-gpt-v2-4-rechten${suffix}`, uGpt, { fase, na: (p) => stapV2(p, 'rechten') }),
        S(`consent-oud-mcp${suffix}`, uOud, { fase, wachtOp: '[data-mcp-consent-modal]' }),
      ];
      return lijst;
    };

    // ---------------------------------------------------------------- hulpfuncties
    const open = async (url: string, lang: 'uk' | 'nl') => {
      const u = new URL(url); u.searchParams.set('lang', lang);
      const hash = u.hash; u.hash = '';
      await page.goto(`${u.toString()}${hash}`, { waitUntil: 'domcontentloaded', timeout: 45000 });
      await page.waitForFunction(() => !!document.querySelector('.canonical-avatar-trigger, .canonical-service-list, [data-mcp-consent-modal], [data-v2-wizard], main, .mcp-estate, [data-tech-poort]'), null, { timeout: 15000 }).catch(() => undefined);
      await page.waitForLoadState('networkidle', { timeout: 4000 }).catch(() => undefined);
      await page.waitForTimeout(900);
    };
    const zetThema = async (thema: Thema) => { await page.emulateMedia({ colorScheme: thema === 'donker' ? 'dark' : 'light' }); await page.waitForTimeout(350); };
    const analyse = async (naam: string, maat: Maat, thema: Thema, taal: 'uk' | 'nl', url: string) => {
      const bestand = `${naam}-${maat.w}-${thema}${taal === 'nl' ? '-nl' : ''}.png`;
      const info = await page.evaluate(() => ({ titel: document.title, html: document.documentElement.className }));
      const g = await page.evaluate(geometrie, { mobiel: maat.w <= 500 });
      // De pagina scrolt in een binnenste container (fullPage ziet die niet): viewport tijdelijk zo hoog als de inhoud (max 4000).
      const extra = await page.evaluate(() => { let m = 0; for (const e of document.querySelectorAll('body, body *')) { const cs = getComputedStyle(e); const r = e.getBoundingClientRect(); if (/(auto|scroll)/.test(cs.overflowY) && e.scrollHeight > e.clientHeight + 2 && e.clientWidth > innerWidth * 0.4 && r.height > innerHeight * 0.5 && r.left < innerWidth && r.right > 0) m = Math.max(m, e.scrollHeight - e.clientHeight); } return Math.min(m, 4000 - innerHeight); });
      if (extra > 0) { await page.setViewportSize({ width: maat.w, height: maat.h + extra }); await page.waitForTimeout(250); }
      await page.screenshot({ path: join(UIT, bestand), fullPage: true, timeout: 30000 }).catch(async (e) => { zeg(`!! knipsel ${bestand}: ${String(e).slice(0, 120)}`); await page.screenshot({ path: join(UIT, bestand), fullPage: false }).catch(() => undefined); });
      if (extra > 0) { await page.setViewportSize({ width: maat.w, height: maat.h }); await page.waitForTimeout(150); }
      const d = (element: string, type: string, waarde: string) => defecten.push({ pagina: naam, maat: `${maat.w}×${maat.h}`, thema, taal, element, type, waarde, knipsel: bestand });
      if (g.scrollX) d('html', 'viewport-overloop', `scrollWidth ${g.scrollWidth} > clientWidth ${g.clientWidth}`);
      for (const x of g.uitsteek) d(x.sel, 'uitsteek', x.waarde);
      for (const x of g.horScroll) d(x.sel, 'horizontale-scroll', x.waarde);
      for (const x of g.overlap) d(x.sel, 'overlap', x.waarde);
      for (const x of g.afgeknipt) d(x.sel, x.type, x.waarde);
      for (const x of g.klein) d(x.sel, 'kleine-knop', x.waarde);
      for (const x of g.kleinLetter) d(x.sel, 'kleine-letter', x.waarde);
      for (const x of g.mono) d(x.sel, 'pseudo-logo', x.waarde);
      for (const x of g.kapot) d(x.sel, x.waarde.startsWith('logo-onzichtbaar') ? 'logo-onzichtbaar' : 'kapotte-afbeelding', x.waarde);
      let axeIncompleet = 0, axeTijd = 0;
      if (axeBron) {
        const t0 = Date.now();
        const heeftAxe = await page.evaluate(() => typeof (window as unknown as { axe?: unknown }).axe !== 'undefined');
        if (!heeftAxe) await page.evaluate(axeBron).catch((e) => zeg(`!! axe laden: ${String(e).slice(0, 100)}`));
        const ax = await page.evaluate(async () => {
          const w = window as unknown as { axe: { run: (c: unknown, o: unknown) => Promise<{ violations: Array<{ id: string; nodes: Array<{ target: string[]; any: Array<{ data: Record<string, unknown> }>; html: string }> }>; incomplete: Array<{ id: string; nodes: unknown[] }> }> } };
          const r = await w.axe.run(document, { runOnly: { type: 'rule', values: ['color-contrast'] }, resultTypes: ['violations', 'incomplete'] });
          return { v: r.violations.flatMap((v) => v.nodes.map((n) => { const dd = (n.any[0]?.data || {}) as Record<string, unknown>; return { sel: n.target.join(' '), html: n.html.slice(0, 120), ratio: dd.contrastRatio, nodig: dd.expectedContrastRatio, fg: dd.fgColor, bg: dd.bgColor, fs: dd.fontSize }; })), inc: r.incomplete.reduce((n, i) => n + i.nodes.length, 0) };
        }).catch((e) => { zeg(`!! axe run ${bestand}: ${String(e).slice(0, 120)}`); return { v: [] as Array<{ sel: string; html: string; ratio: unknown; nodig: unknown; fg: unknown; bg: unknown; fs: unknown }>, inc: 0 }; });
        axeIncompleet = ax.inc; axeTijd = Date.now() - t0;
        for (const x of ax.v) d(x.sel, 'contrast', `${x.ratio}:1 (nodig ${x.nodig}) tekst ${x.fg} op ${x.bg} ${x.fs} — ${x.html.replace(/\s+/g, ' ')}`);
      }
      knipsels.push({ pagina: naam, maat: `${maat.w}×${maat.h}`, thema, taal, bestand, url, titel: info.titel, htmlKlasse: info.html, axeIncompleet, axeTijd });
    };
    const doeStap = async (stap: Stap, maat: Maat, taal: 'uk' | 'nl', themas: Thema[]) => {
      huidig = `${stap.naam}|${maat.w}|${taal}`;
      await page.setViewportSize({ width: maat.w, height: maat.h });
      await zetThema('licht');
      try {
        if (stap.voor) await stap.voor(page);
        await open(typeof stap.url === 'function' ? await stap.url() : stap.url, taal);
        if (stap.wachtOp) await page.locator(stap.wachtOp).first().waitFor({ timeout: 20000 }).catch(() => zeg(`!! ${stap.naam}: ${stap.wachtOp} niet verschenen (${page.url()})`));
        if (stap.na) await stap.na(page);
      } catch (e) { if (/^SKIP/.test(String((e as Error).message))) { zeg(`-- ${stap.naam} ${maat.w} ${taal}: overgeslagen (${String((e as Error).message).slice(5, 120)})`); return; } zeg(`!! ${stap.naam} ${maat.w} ${taal}: ${String((e as Error).message || e).replace(/\x1b\[[0-9;]*m/g, "").slice(0, 900)}`); defecten.push({ pagina: stap.naam, maat: `${maat.w}×${maat.h}`, thema: '-', taal, element: '-', type: 'stap-mislukt', waarde: String((e as Error).message || e).slice(0, 200), knipsel: '' }); }
      for (const thema of themas) { await zetThema(thema); await analyse(stap.naam, maat, thema, taal, page.url()); }
      await page.keyboard.press('Escape').catch(() => undefined);
      if (stap.voor) await mailNepUit(page);
    };

    // ---------------------------------------------------------------- uitvoeren
    const alle = [...stappen];
    const privePlek = alle.findIndex((s) => s.fase === 'tech');
    // 22.10 (зона C): крок дзвоника БЕЗ технічного профілю має йти до фази tech; крок смуги — у фазі tech.
    const sferen = sferenStappen({ hubUrl: H('hub'), uid: () => uid, uit: UIT, zeg, meting });
    alle.splice(privePlek, 0, ...consentStappen('prive'), ...sferen.filter((s) => s.fase !== 'tech'));
    alle.push(...sferen.filter((s) => s.fase === 'tech'));
    alle.push(...consentStappen('tech'));
    const themas: Thema[] = DONKER_OOK ? ['licht', 'donker'] : ['licht'];
    let techAanGezet = false;
    let n = 0, begonnen = !VANAF;
    for (const stap of alle) {
      if (!begonnen) { if (stap.naam === VANAF) begonnen = true; else continue; }
      // 23.10: STAND_FILTER mag meerdere deelstrings bevatten, gescheiden door «|» (één stand voor alle stappen van een release).
      if (FILTER && !FILTER.split('|').some((f) => f && stap.naam.includes(f))) continue;
      if (stap.fase === 'tech' && !techAanGezet) {
        // Step-up: activeren mag alleen binnen 5 minuten na een echte aanmelding (backend/stap-op.ts) → opnieuw aanmelden (nep-Google) en cookies verversen.
        const su = await b.aanmelden(sub, eigenaar, { service: 'mcp', tabContext: tab, intent: 'step-up', authTime: Math.floor(Date.now() / 1000) });
        check('step-up-aanmelding vóór technisch profiel', su.cb.data.sessionCreated === true || su.cb.data.ok === true, JSON.stringify(su.cb.data).slice(0, 160));
        await ctx.addCookies([...b.jar].flatMap(([name, value]) => Object.values(SERVICE_HOSTS).map((host) => ({ name, value, url: `https://${host}/`, secure: true, httpOnly: true, sameSite: 'Lax' as const }))));
        const st = await techAan(page, { url: MCP, tab, service: 'mcp', minuten: 120, reden: 'Stand knipsels 20261020' });
        check('technisch profiel aan (120 min)', st === 200, String(st));
        techAanGezet = true;
      }
      const t0 = Date.now();
      const maten = stap.alleen1280 ? MATEN.filter((m) => m.w >= 1000) : MATEN;
      for (const maat of maten) await doeStap(stap, maat, 'uk', themas);
      if (NL_OOK && !stap.alleen1280) { const m = MATEN.find((x) => x.w >= 1000) || MATEN[MATEN.length - 1]; await doeStap(stap, m, 'nl', ['licht']); }
      n++;
      zeg(`[${n}/${alle.length}] ${stap.naam} — ${Date.now() - t0} ms, defecten tot nu: ${defecten.length}`);
      // Tussenstand op schijf: een afgebroken run verliest niets.
      writeFileSync(join(UIT, 'resultaten-tussenstand.json'), JSON.stringify({ gemaakt: new Date().toISOString(), uit: UIT, knipsels, defecten, paginaFouten, log }));
    }
    await ctx.close();
  } catch (e) {
    check('stand liep zonder uitzondering', false, String((e as Error)?.stack || e).slice(0, 1200));
  } finally {
    await browser.close().catch(() => undefined);
    for (const id of clients) await pool.query("DELETE FROM app.records WHERE tbl='mcp_clients' AND id=$1", [id]).catch(() => undefined);
    await stop();
  }
  // ---------------------------------------------------------------- verslag (bij STAND_FILTER/STAND_VANAF: samenvoegen met de vorige resultaten in dezelfde map)
  const vorigPad = join(UIT, 'resultaten.json');
  if ((FILTER || VANAF) && existsSync(vorigPad)) {
    try {
      const v = JSON.parse(readFileSync(vorigPad, 'utf8')) as { knipsels: typeof knipsels; defecten: Defect[]; paginaFouten: typeof paginaFouten; log?: string[] };
      const nieuw = new Set(knipsels.map((k) => k.pagina));
      knipsels.unshift(...v.knipsels.filter((k) => !nieuw.has(k.pagina)));
      defecten.unshift(...v.defecten.filter((d) => !nieuw.has(d.pagina)));
      for (const [k, w] of Object.entries(v.paginaFouten)) if (!nieuw.has(k.split('|')[0])) paginaFouten[k] = w;
      log.unshift(...(v.log || []).filter((r) => !/^verslag:/.test(r)));
      zeg(`samengevoegd met vorige resultaten (${v.knipsels.length} knipsels)`);
    } catch (e) { zeg(`!! samenvoegen mislukt: ${String(e).slice(0, 120)}`); }
  }
  const soorten = [...new Set(defecten.map((d) => d.type))].sort();
  const perType = Object.fromEntries(soorten.map((t) => [t, defecten.filter((d) => d.type === t).length]));
  const perPagina: Record<string, number> = {};
  for (const d of defecten) perPagina[d.pagina] = (perPagina[d.pagina] || 0) + 1;
  const netwerk = Object.entries(paginaFouten).flatMap(([k, v]) => v.netwerk.map((x) => ({ k, x })));
  const console_ = Object.entries(paginaFouten).flatMap(([k, v]) => v.console.map((x) => ({ k, x })));
  const distMap = process.env.E2E_DIST || 'dist';
  let distTijd = ''; try { distTijd = statSync(join(distMap, 'index.html')).mtime.toISOString(); } catch { /* geen dist */ }
  writeFileSync(join(UIT, 'resultaten.json'), JSON.stringify({ gemaakt: new Date().toISOString(), uit: UIT, dist: { map: distMap, indexHtmlTijd: distTijd }, knipsels, defecten, paginaFouten, perType, perPagina, log }, null, 1));
  const md: string[] = [];
  md.push(`# Дефекти стенду — ${UIT.split('/').pop()} (${new Date().toISOString()})`, '');
  md.push(`Сторінок/етапів: ${new Set(knipsels.map((k) => k.pagina)).size}; знімків: ${knipsels.length}; дефектів: ${defecten.length}.`, '');
  md.push('## За типом', '', '| тип | кількість |', '|---|---|', ...soorten.map((t) => `| ${t} | ${perType[t]} |`), '');
  md.push('## Найгірші сторінки (усі типи разом)', '', '| сторінка | дефектів |', '|---|---|', ...Object.entries(perPagina).sort((a, b) => b[1] - a[1]).slice(0, 40).map(([p, k]) => `| ${p} | ${k} |`), '');
  md.push('## Помилки консолі (унікальні, за сторінкою)', '');
  const uniekC = new Map<string, Set<string>>(); for (const { k, x } of console_) { if (!uniekC.has(x)) uniekC.set(x, new Set()); uniekC.get(x)!.add(k.split('|')[0]); }
  md.push('| повідомлення | сторінки |', '|---|---|', ...[...uniekC].map(([x, s]) => `| ${x.replace(/\|/g, '¦').slice(0, 200)} | ${[...s].slice(0, 8).join(', ')}${s.size > 8 ? ` (+${s.size - 8})` : ''} |`), '');
  md.push('## Мережеві помилки (4xx/5xx/невдалі, унікальні)', '');
  const uniekN = new Map<string, Set<string>>(); for (const { k, x } of netwerk) { const y = x.replace(/\?.*$/, ''); if (!uniekN.has(y)) uniekN.set(y, new Set()); uniekN.get(y)!.add(k.split('|')[0]); }
  md.push('| запит | сторінки |', '|---|---|', ...[...uniekN].map(([x, s]) => `| ${x.replace(/\|/g, '¦').slice(0, 200)} | ${[...s].slice(0, 8).join(', ')}${s.size > 8 ? ` (+${s.size - 8})` : ''} |`), '');
  const merk = Object.entries(paginaFouten).flatMap(([k, v]) => v.merkChunk.map((x) => `${k.split('|')[0]}: ${x}`));
  md.push('## Бандл логотипів (merk-logos / merk-tabel / MerkLogo)', '', merk.length ? merk.slice(0, 30).map((x) => `- ${x}`).join('\n') : '- жодного запиту до merk-logos/merk-tabel/MerkLogo не зафіксовано', '');
  md.push('## Усі дефекти', '', '| сторінка | розмір | тема | мова | елемент/селектор | тип | значення | знімок |', '|---|---|---|---|---|---|---|---|');
  for (const d of defecten) md.push(`| ${d.pagina} | ${d.maat} | ${d.thema} | ${d.taal} | \`${d.element.replace(/\|/g, '¦').slice(0, 120)}\` | ${d.type} | ${d.waarde.replace(/\|/g, '¦').replace(/\n/g, ' ').slice(0, 220)} | ${d.knipsel} |`);
  writeFileSync(join(UIT, 'defecten.md'), md.join('\n'));
  zeg(`verslag: ${join(UIT, 'defecten.md')} (${defecten.length} defecten, ${knipsels.length} knipsels)`);
  return einde();
}

// ---------------------------------------------------------------- in de pagina: geometrie, pseudo-logo's
function geometrie({ mobiel }: { mobiel: boolean }) {
  const vw = document.documentElement.clientWidth;
  const out = { scrollX: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1, scrollWidth: document.documentElement.scrollWidth, clientWidth: document.documentElement.clientWidth,
    uitsteek: [] as Array<{ sel: string; waarde: string }>, horScroll: [] as Array<{ sel: string; waarde: string }>, overlap: [] as Array<{ sel: string; waarde: string }>, afgeknipt: [] as Array<{ sel: string; type: string; waarde: string }>,
    klein: [] as Array<{ sel: string; waarde: string }>, kleinLetter: [] as Array<{ sel: string; waarde: string }>, mono: [] as Array<{ sel: string; waarde: string }>, kapot: [] as Array<{ sel: string; waarde: string }> };
  const sel = (el: Element) => {
    const parts: string[] = []; let e: Element | null = el; let diep = 0;
    while (e && e.nodeType === 1 && diep < 4) {
      let s = e.tagName.toLowerCase();
      if (e.id) { parts.unshift(`${s}#${e.id}`); break; }
      const da = [...e.attributes].find((a) => a.name.startsWith('data-') && a.value.length > 0 && a.value.length < 40 && !/^data-(accent|eigen-kleur)/.test(a.name));
      if (da) s += `[${da.name}="${da.value}"]`; else if (e.classList.length) s += `.${[...e.classList].slice(0, 2).join('.')}`;
      parts.unshift(s); e = e.parentElement; diep++;
    }
    return parts.join(' > ');
  };
  const tekst = (el: Element) => ((el as HTMLElement).innerText || el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 50);
  const zicht = (el: Element) => {
    // Inhoud van een gesloten <details> krijgt in Chrome wel een rect (content-visibility): niet zichtbaar, niet meten.
    const cv = (el as HTMLElement & { checkVisibility?: (o: Record<string, boolean>) => boolean }).checkVisibility;
    if (typeof cv === 'function' && !cv.call(el, { contentVisibilityAuto: true, visibilityProperty: true, opacityProperty: true })) return null;
    const dt = el.closest('details:not([open])'); if (dt && !(el.closest('summary') && dt.contains(el.closest('summary')))) return null;
    const r0 = el.getBoundingClientRect(); if (r0.width < 1 || r0.height < 1) return null;
    const cs = getComputedStyle(el); if (cs.visibility === 'hidden' || cs.display === 'none' || Number(cs.opacity) === 0 || cs.pointerEvents === 'none' && cs.opacity === '0') return null;
    // Weggeknipt door een voorouder met overflow (weggescrold in een lijst, buiten een venster): alleen het zichtbare deel telt.
    let left = r0.left, top = r0.top, right = r0.right, bottom = r0.bottom;
    let a = el.parentElement;
    while (a && a !== document.body) {
      const ac = getComputedStyle(a);
      if (ac.overflowX !== 'visible' || ac.overflowY !== 'visible') { const ar = a.getBoundingClientRect(); if (ac.overflowX !== 'visible') { left = Math.max(left, ar.left); right = Math.min(right, ar.right); } if (ac.overflowY !== 'visible') { top = Math.max(top, ar.top); bottom = Math.min(bottom, ar.bottom); } }
      a = a.parentElement;
    }
    if (right - left < 1 || bottom - top < 1) return null;
    return new DOMRect(left, top, right - left, bottom - top);
  };
  const inScroller = (el: Element) => { let e = el.parentElement; while (e && e !== document.body) { const cs = getComputedStyle(e); if (/(auto|scroll)/.test(cs.overflowX) && e.scrollWidth > e.clientWidth + 1) return true; e = e.parentElement; } return false; };
  const alle = [...document.querySelectorAll('body *')].filter((e) => !/^(script|style|svg|path|g|defs|lineargradient|stop|rect|circle|use|symbol)$/i.test(e.tagName));
  // 1) uitsteek buiten de viewport (horizontaal)
  let nU = 0;
  for (const el of alle) {
    const r = zicht(el); if (!r) continue;
    if ((r.right > vw + 2 || r.left < -2) && !inScroller(el)) {
      // alleen het buitenste element van een uitstekende keten melden
      if (el.parentElement && el.parentElement !== document.body) { const pr = el.parentElement.getBoundingClientRect(); if ((pr.right > vw + 2 || pr.left < -2) && pr.width >= 1) continue; }
      if (nU++ < 25) out.uitsteek.push({ sel: sel(el), waarde: `left ${Math.round(r.left)} right ${Math.round(r.right)} (viewport ${vw}) «${tekst(el)}»` });
    }
  }
  // 1b) horizontaal scrollende hoofdinhoud (≥ 60% van de breedte): op een telefoon moet men dan zijwaarts schuiven
  for (const el of alle) {
    const r = zicht(el); if (!r) continue;
    const cs = getComputedStyle(el);
    if (/(auto|scroll)/.test(cs.overflowX) && el.scrollWidth > el.clientWidth + 8 && el.clientWidth >= vw * 0.6 && !el.matches('table, pre, code, .mail-thread-content, [data-scroll-ok]') && out.horScroll.length < 10)
      out.horScroll.push({ sel: sel(el), waarde: `scrollWidth ${el.scrollWidth} > clientWidth ${el.clientWidth} (viewport ${vw}) «${tekst(el).slice(0, 40)}»` });
  }
  // 2) overlap: interactieve elementen onderling, en tekstblokken (bladeren) onderling
  const interactief = alle.filter((e) => e.matches('button, a[href], input:not([type=hidden]), select, textarea, [role=button], [role=tab], [role=menuitem], [role=switch], [role=checkbox], [role=radio], [role=link]'));
  const rects = (lijst: Element[]) => lijst.map((e) => ({ e, r: zicht(e) })).filter((x) => x.r) as Array<{ e: Element; r: DOMRect }>;
  const overlapt = (a: DOMRect, b: DOMRect) => Math.min(a.right, b.right) - Math.max(a.left, b.left) > 3 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 3;
  // Laag: dichtstbijzijnde voorouder (of zelf) die fixed/absolute/sticky staat of een dialoog is. Alleen binnen één laag telt overlap:
  // een venster boven de pagina, een zwevende knop of een sticky kop overlappen per ontwerp.
  const laagVan = (el: Element) => { let e: Element | null = el; while (e && e !== document.body) { const cs = getComputedStyle(e); if (/(fixed|absolute|sticky)/.test(cs.position) || e.matches('[role=dialog], [aria-modal=true], dialog')) return e; e = e.parentElement; } return document.body; };
  const verborgenLaag = (el: Element) => !!el.closest('[inert], [aria-hidden="true"]');
  const meld = (A0: Array<{ e: Element; r: DOMRect }>, soort: string, max: number) => {
    let n = 0;
    const A = A0.filter((x) => !verborgenLaag(x.e)).map((x) => ({ ...x, laag: laagVan(x.e) }));
    const L = [...A].sort((x, y) => x.r.top - y.r.top);
    for (let i = 0; i < L.length && n < max; i++) for (let j = i + 1; j < L.length; j++) {
      if (L[j].r.top >= L[i].r.bottom) break;
      const a = L[i], b = L[j];
      if (a.e.contains(b.e) || b.e.contains(a.e)) continue;
      if (a.laag !== b.laag) continue;
      if (!overlapt(a.r, b.r)) continue;
      // een gesloten/verborgen laag (modal-backdrop e.d.) overlapt alles: sla vaste lagen die het hele scherm beslaan over
      const groot = (r: DOMRect) => r.width >= vw * 0.9 && r.height >= innerHeight * 0.9;
      if (groot(a.r) || groot(b.r)) continue;
      const ox = Math.round(Math.min(a.r.right, b.r.right) - Math.max(a.r.left, b.r.left)), oy = Math.round(Math.min(a.r.bottom, b.r.bottom) - Math.max(a.r.top, b.r.top));
      out.overlap.push({ sel: `${sel(a.e)}  ⟂  ${sel(b.e)}`, waarde: `${soort}: ${ox}×${oy}px «${tekst(a.e)}» / «${tekst(b.e)}»` }); n++;
      if (n >= max) break;
    }
  };
  meld(rects(interactief), 'knoppen', 25);
  const bladeren = alle.filter((e) => e.childNodes.length && [...e.childNodes].some((n) => n.nodeType === 3 && (n.textContent || '').trim().length > 1) && !e.matches('button, a, input, select, textarea, option, [role=button]') && !e.closest('button, a[href], [role=button]'));
  meld(rects(bladeren), 'tekst', 25);
  // 3) afgeknipte tekst
  let nA = 0;
  for (const el of bladeren) {
    const r = zicht(el); if (!r) continue;
    const cs = getComputedStyle(el);
    // Alleen-voor-schermlezer-tekst (1×1 px, clip) is bewust onzichtbaar: geen defect.
    if (el.clientWidth <= 2 || el.clientHeight <= 2 || (cs.clip && cs.clip !== 'auto') || (cs.clipPath && cs.clipPath !== 'none')) continue;
    const hx = /(hidden|clip)/.test(cs.overflowX) && el.scrollWidth > el.clientWidth + 2, hy = /(hidden|clip)/.test(cs.overflowY) && el.scrollHeight > el.clientHeight + 2 && cs.webkitLineClamp === 'none';
    if ((hx || hy) && nA++ < 25) out.afgeknipt.push({ sel: sel(el), type: cs.textOverflow === 'ellipsis' && hx && !hy ? 'afgeknipt-ellipsis' : 'afgeknipt', waarde: `${hx ? `breedte ${el.scrollWidth}>${el.clientWidth}` : ''} ${hy ? `hoogte ${el.scrollHeight}>${el.clientHeight}` : ''} «${tekst(el)}»` });
  }
  // 4) kleine knoppen (telefoon): < 40 px hoog of (icoonknop) < 40 px breed
  if (mobiel) {
    let nK = 0;
    for (const el of interactief) {
      if (el.matches('a') && getComputedStyle(el).display === 'inline') continue;
      if (el.matches('input[type=checkbox], input[type=radio], [role=checkbox], [role=radio], [role=switch]')) continue;
      const r = zicht(el); if (!r) continue;
      if (r.height < 40 || (r.width < 40 && !tekst(el))) { if (nK++ < 40) out.klein.push({ sel: sel(el), waarde: `${Math.round(r.width)}×${Math.round(r.height)}px «${tekst(el)}»` }); }
    }
  }
  // 5) kleine letters (< 12 px) op zichtbare tekst
  let nL = 0;
  for (const el of bladeren) {
    const r = zicht(el); if (!r) continue;
    if (el.clientWidth <= 2 || el.clientHeight <= 2) continue;
    const fs = parseFloat(getComputedStyle(el).fontSize);
    if (fs < 12 && nL++ < 30) out.kleinLetter.push({ sel: sel(el), waarde: `${fs}px «${tekst(el)}»` });
  }
  // 6) pseudo-logo's: monogram voor onbekend merk; kapotte of lege afbeeldingen
  for (const el of document.querySelectorAll('[data-merk="onbekend"]')) { const r = zicht(el); if (!r) continue; if (out.mono.length < 30) out.mono.push({ sel: sel(el), waarde: `monogram «${tekst(el)}» ${Math.round(r.width)}×${Math.round(r.height)} bij «${tekst(el.parentElement || el)}»` }); }
  // 6b) logo onzichtbaar: merk-gliefje (eerste path) tegen zijn tegel of de achtergrond erachter met contrast < 1.6
  const parse = (c: string) => { const m = c.match(/rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?\)/); if (!m) { const h = c.match(/^#([0-9a-f]{6})$/i); return h ? [parseInt(h[1].slice(0, 2), 16), parseInt(h[1].slice(2, 4), 16), parseInt(h[1].slice(4, 6), 16), 1] : null; } return [+m[1], +m[2], +m[3], m[4] === undefined ? 1 : +m[4]]; };
  const lum = (c: number[]) => { const f = (v: number) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]); };
  const ratio = (a: number[], b: number[]) => { const x = lum(a) + 0.05, y = lum(b) + 0.05; return x > y ? x / y : y / x; };
  const achter = (el: Element) => { let e: Element | null = el; while (e) { const c = parse(getComputedStyle(e).backgroundColor); if (c && c[3] > 0.5) return c; e = e.parentElement; } return [255, 255, 255, 1]; };
  for (const svg of document.querySelectorAll('svg.merk')) {
    const r = zicht(svg); if (!r || out.kapot.length >= 30) continue;
    const pad = svg.querySelector('g path, path'); if (!pad) continue;
    const vul = parse(getComputedStyle(pad).fill); if (!vul || vul[3] === 0) continue; // verloop (url(#…)) of onbekend: overslaan
    const tegel = [...svg.querySelectorAll(':scope > rect')].map((x) => parse(getComputedStyle(x).fill)).find((c) => c && c[3] > 0.5);
    const bg = tegel || achter(svg);
    const q = ratio(vul, bg);
    if (q < 1.6) out.kapot.push({ sel: sel(svg), waarde: `logo-onzichtbaar ${svg.getAttribute('data-merk')}: gliefje rgb(${vul.slice(0, 3).join(',')}) op ${tegel ? 'tegel' : 'achtergrond'} rgb(${bg.slice(0, 3).join(',')}) = ${q.toFixed(2)}:1 bij «${tekst(svg.parentElement?.parentElement || svg).slice(0, 40)}»` });
  }
  for (const img of document.querySelectorAll('img')) { const r = zicht(img); if (!r) continue; const src = img.getAttribute('src') || ''; if (!src || (img.complete && img.naturalWidth === 0 && !src.startsWith('data:'))) { if (out.kapot.length < 20) out.kapot.push({ sel: sel(img), waarde: `src=«${src.slice(0, 80)}» alt=«${img.alt}» ${Math.round(r.width)}×${Math.round(r.height)}` }); } }
  return out;
}
