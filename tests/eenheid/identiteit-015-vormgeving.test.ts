// IDENTITEIT-015 (крок «vormgeving», етап 2.1 + демо-елементи «Макета», 14.11.2026):
//  • вибір вигляду центру облікового запису зберігається в ОБЛІКОВОМУ ЗАПИСІ (поле vormgeving), localStorage — лише кеш;
//  • щільність, рух, акцент і виразність ефектів — справжні налаштування всього сайту в тому самому записі вигляду
//    (shared/uiterlijk.ts → POST /api/owner/ui/weergave/save), нормалізація на сервері, старі записи без полів працюють;
//  • елементи «Макета» показують і змінюють справжні налаштування (мова, меню, вигляд), а там, де вимикача свідомо немає, —
//    «Приклад вигляду» з поясненням і переходом; «Активний профіль» має справжній тумблер простору.
// Поведінка — через справжні маршрути backend/index.ts проти одноразової бази й підробленого Google (tests/eenheid/hulp);
// клієнтська частина — справжні модулі src/ у нагробленому браузері (cookie + sessionStorage + localStorage). Лише вигадані дані.
// De keuze van de weergave en de nieuwe weergave-instellingen staan in het account; het ontwerp gebruikt de echte instellingen.
// Запуск: DATABASE_URL=<тестова база> node scripts/eenheidstests.mjs identiteit-015-vormgeving.test.ts
import { randomBytes } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { runInNewContext } from 'node:vm';
import { closePool, getPool } from '../../server/platform/pg';
import { checker, nepGoogle } from './hulp/nep-google';
import {
  metUiterlijkRuimte, normaliseerUiterlijkRuimte, normaliseerUiterlijkRuimtes, uiterlijkVoorRuimte,
  UITERLIJK_ACCENTEN, UITERLIJK_DICHTHEDEN, UITERLIJK_EFFECTEN_STANDAARD, UITERLIJK_VORMGEVINGEN,
} from '../../shared/uiterlijk';
import { contrast, kleurWaarden, PUUR, SECTIES } from '../../src/thema/paletten';
import { ACCENT_TONEN, pasWeergaveStijlToe } from '../../src/thema/weergave-stijl';

const ORIGIN = 'https://id.tarasevych.com';
type Opslag = { getItem(k: string): string | null; setItem(k: string, v: string): void; removeItem(k: string): void };
const opslag = (): Opslag => { const m = new Map<string, string>(); return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { m.set(k, String(v)); }, removeItem: (k: string) => { m.delete(k); }, clear: () => m.clear(), key: () => null, length: 0 } as unknown as Opslag; };

/** Нагроблений браузер: справжній горщик cookie, sessionStorage і localStorage, події вікна. Як у weergave-per-account-20261020. */
function nepBrowser() {
  const g = globalThis as Record<string, unknown>;
  const ls = opslag(), ss = opslag();
  const u = new URL(`${ORIGIN}/themes`);
  const potje = new Map<string, string>();
  const doelen = new EventTarget();
  g.location = { href: u.href, origin: u.origin, host: u.host, hostname: u.hostname, pathname: u.pathname, search: '', hash: '', protocol: u.protocol, assign: () => undefined, replace: () => undefined, reload: () => undefined };
  g.localStorage = ls; g.sessionStorage = ss;
  try { Object.defineProperty(g, 'navigator', { value: { language: 'uk-UA' }, configurable: true, writable: true }); } catch { /* al aanwezig */ }
  g.window = Object.assign(g, {
    name: '', innerWidth: 1280, innerHeight: 800, setTimeout, clearTimeout, setInterval, clearInterval,
    addEventListener: doelen.addEventListener.bind(doelen), removeEventListener: doelen.removeEventListener.bind(doelen), dispatchEvent: doelen.dispatchEvent.bind(doelen),
    matchMedia: () => ({ matches: false, addEventListener: () => undefined, removeEventListener: () => undefined }),
  });
  const wortel = { lang: 'uk', dataset: {} as Record<string, string>, stijl: new Map<string, string>(), style: { setProperty(k: string, v: string) { wortel.stijl.set(k, v); }, removeProperty(k: string) { wortel.stijl.delete(k); } }, classList: { contains: () => false, add: () => undefined, remove: () => undefined } };
  const doc: Record<string, unknown> = {
    hidden: false, title: '', addEventListener: () => undefined, removeEventListener: () => undefined, querySelector: () => null, querySelectorAll: () => [], getElementById: () => null,
    head: { appendChild: () => undefined }, createElement: () => ({ setAttribute: () => undefined, getAttribute: () => null, dataset: {}, getContext: () => null, style: {} }),
    documentElement: wortel, body: null,
  };
  Object.defineProperty(doc, 'cookie', {
    get: () => [...potje].map(([k, v]) => `${k}=${v}`).join('; '),
    set: (waarde: string) => { const paar = String(waarde).split('; ')[0], i = paar.indexOf('='); if (i > 0) potje.set(paar.slice(0, i), paar.slice(i + 1)); },
  });
  g.document = doc;
  g.fetch = async () => ({ ok: true, status: 200, statusText: 'OK', headers: new Headers(), text: async () => '{"ok":true}' }) as unknown as Response;
  runInNewContext(readFileSync('public/canonical-service.js', 'utf8'), { window: g, location: g.location, document: { ...doc, cookie: '', head: { appendChild: () => undefined }, createElement: () => ({ getContext: () => null, dataset: {} }) }, sessionStorage: ss, addEventListener: () => undefined, Date, Math, Number, String, Object, Array, JSON, URLSearchParams, URL });
  return { ls, wortel };
}

type Check = (naam: string, ok: boolean, detail?: string) => void;
/** Сторінка-проба: розмітка й двигун «Макета» з початковими налаштуваннями сайту; кожен виклик сайту записується в window.log. */
const PROEF = `
import { MAQUETTE_SJABLOON } from './src/identiteit/maquette/maquette-sjabloon';
import { startMaquette } from './src/identiteit/maquette/maquette-motor';
const w = window as any;
w.log = [];
const root = document.getElementById('wortel') as HTMLElement;
root.innerHTML = MAQUETTE_SJABLOON;
w.m = startMaquette(root, {
  lang: 'uk', licht: false, profiel: null,
  bijKies: () => undefined, bijOpenen: () => undefined, bijRender: () => undefined,
  bijDienst: (id: string) => w.log.push(['dienst', id]), bijAccountMenu: () => w.log.push(['accountmenu']),
  weergave: { dichtheid: 'compact', beweging: 'minder', accent: undefined, effecten: 70, icoonStijl: 'kleur', positie: 'rechts', modus: 'dicht' },
  bijWeergave: (p: unknown) => w.log.push(['weergave', p]), bijTaal: (l: string) => w.log.push(['taal', l]),
});
`;

async function inChrome(check: Check) {
  const PW = [process.env.PLAYWRIGHT_CORE, join(process.cwd(), 'node_modules', 'playwright-core'), '/opt/node-tools/node_modules/playwright-core']
    .filter((p): p is string => Boolean(p)).map((p) => join(p, 'index.mjs')).find((p) => existsSync(p)) || '';
  const CHROME = process.env.CHROME_PAD || '/usr/bin/google-chrome';
  if (!PW || !existsSync(CHROME)) { check('Chrome і playwright-core доступні (CHROME_PAD, PLAYWRIGHT_CORE)', false, `${PW} ${CHROME}`); return; }
  const map = mkdtempSync(join(tmpdir(), 'i015-vormgeving-'));
  try {
    const { build } = await import('esbuild');
    const uit = resolve(map, 'proef.js');
    await build({ stdin: { contents: PROEF, resolveDir: resolve('.'), loader: 'ts', sourcefile: 'i015v-proef.ts' }, outfile: uit, bundle: true, logLevel: 'error', platform: 'browser', format: 'iife', target: 'es2022' });
    const { chromium } = await import(pathToFileURL(PW).href) as { chromium: { launch: (o: unknown) => Promise<any> } };
    const browser = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox'] });
    try {
      const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
      const fouten: string[] = [];
      page.on('pageerror', (e: Error) => fouten.push(String(e?.message || e)));
      await page.route('**/*', async (r: any) => {
        const u = String(r.request().url());
        if (u === 'https://id.proef.invalid/') return r.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><html lang="uk"><head><meta charset="utf-8"></head><body><div class="canonical-workspace" style="height:900px;overflow:auto"><div id="wortel" class="mr-mq"></div></div><script src="/proef.js"></script></body></html>' });
        if (u === 'https://id.proef.invalid/proef.js') return r.fulfill({ status: 200, contentType: 'text/javascript', body: readFileSync(uit, 'utf8') });
        return r.abort();
      });
      await page.goto('https://id.proef.invalid/');
      await page.waitForSelector('[data-choice-group="personalization-1"]', { timeout: 15000 });
      const klik = (sel: string) => page.$eval(sel, (b: HTMLElement) => b.click());
      const log = () => page.evaluate(() => (window as any).log.splice(0));
      const begin = await page.evaluate(() => ({
        dicht: document.querySelector('[data-choice-group="personalization-1"].selected')?.textContent,
        stijl: document.querySelector('[data-choice-group="personalization-0"].selected')?.textContent,
        rust: document.querySelector('[data-toggle-demo="personalization-2"]')?.getAttribute('aria-pressed'),
        eff: (document.querySelector('[data-range-demo="themes-2"]') as HTMLInputElement)?.value,
        acc: [...document.querySelectorAll('.swatches [data-accent].selected')].length,
        rail: [...document.getElementById('wortel')!.classList].filter((k) => /^rail-(left|right|top|bottom|compact)$/.test(k)).join(' '),
        opties: [...document.querySelectorAll('[data-choice-group="personalization-1"]')].map((b) => b.textContent).join('/'),
      }));
      check('Chrome: елементи «Макета» показують налаштування облікового запису (компактна, кольорові піктограми, менше руху, 70 %, акцент палітри — жоден кружок, меню праворуч згорнуте)',
        begin.dicht === 'Компактна' && begin.stijl === 'Кольоровий' && begin.rust === 'false' && begin.eff === '70' && begin.acc === 0 && begin.rail === 'rail-right rail-compact' && begin.opties === 'Звичайна/Компактна/Простора', JSON.stringify(begin));
      check('Chrome: запуск із налаштувань сайту нічого не надсилає назад на сайт', (await log()).length === 0);
      await klik('[data-choice-group="personalization-1"][data-choice-index="2"]');
      await klik('[data-toggle-demo="personalization-2"]');
      await klik('[data-choice-group="personalization-0"][data-choice-index="0"]');
      await klik('.swatches [data-accent="pink"]');
      await page.$eval('[data-range-demo="themes-2"]', (i: HTMLInputElement) => { i.value = '30'; i.dispatchEvent(new Event('input', { bubbles: true })); });
      await klik('#heroNavSettings');
      await klik('#navSettings [data-pos="left"]');
      await klik('#heroNavSettings');
      await klik('#navSettings [data-rail-mode="auto"]');
      const dii = JSON.stringify(await log());
      check('Chrome: кожна дія людини — рівно один виклик справжнього налаштування сайту (щільність, рух, піктограми, акцент, ефекти, положення, режим)',
        dii === JSON.stringify([['weergave', { dichtheid: 'ruim' }], ['weergave', { beweging: 'systeem' }], ['weergave', { icoonStijl: 'klassiek' }], ['weergave', { accent: 'pink' }], ['weergave', { effecten: 30 }], ['weergave', { positie: 'links' }], ['weergave', { modus: 'auto' }]]), dii);
      await klik('[data-demo-lang="nl"]');
      await klik('[data-demo-lang="uk"]');
      await klik('.mq-demo-open[data-kaart-ga="widgets|dienst:hub"]');
      await klik('.mq-demo-open[data-kaart-ga="identities|accountmenu:"]');
      const overgangen = JSON.stringify(await log());
      check('Chrome: мовна кнопка → справжня зміна мови (поточна мова — без дії); «Відкрити простір» → hub; «Меню облікового запису» → меню сайту',
        overgangen === JSON.stringify([['taal', 'nl'], ['dienst', 'hub'], ['accountmenu']]), overgangen);
      // Давня вада: корінь із data-accent перехоплював кожне натискання (акцент повторно; вікно навігації не закривалося кліком поза ним).
      await klik('#heroNavSettings');
      const openVoor = await page.$eval('#navSettings', (e: HTMLElement) => !e.hidden);
      await page.evaluate(() => { const p = document.querySelector('.mq-echt[data-echt="ruimtewissel"]') as HTMLElement; p.innerHTML = '<button type="button" id="echteKnop">x</button>'; (document.getElementById('echteKnop') as HTMLElement).click(); });
      const naKlik = { log: await log(), open: await page.$eval('#navSettings', (e: HTMLElement) => !e.hidden) };
      check('давня вада: натискання в справжній панелі не «вибирає» акцент і закриває вікно навігації (корінь із data-accent — не кнопка)',
        openVoor && naKlik.log.length === 0 && naKlik.open === false, JSON.stringify({ openVoor, naKlik }));
      await page.evaluate(() => (window as any).m.zetWeergave({ dichtheid: 'normaal', beweging: 'systeem', effecten: 45, icoonStijl: 'kleur', positie: 'onder', modus: 'open', accent: 'amber' }));
      const na = await page.evaluate(() => ({
        dicht: document.querySelector('[data-choice-group="personalization-1"].selected')?.textContent,
        acc: [...document.querySelectorAll('.swatches [data-accent].selected')].map((b) => (b as HTMLElement).dataset.accent).join(),
        rail: [...document.getElementById('wortel')!.classList].filter((k) => /^rail-(left|right|top|bottom|compact)$/.test(k)).join(' '),
        rust: document.querySelector('[data-toggle-demo="personalization-2"]')?.getAttribute('aria-pressed'),
        eff: (document.querySelector('[data-range-demo="themes-2"]') as HTMLInputElement)?.value,
      }));
      check('Chrome: зміна на сайті (справжня панель, інший пристрій) оновлює макет без перемальовування й без луни назад',
        na.dicht === 'Звичайна' && na.acc === 'amber' && na.rail === 'rail-bottom' && na.rust === 'true' && na.eff === '45' && (await log()).length === 0, JSON.stringify(na));
      const kaarten = await page.$$eval('.mq-demo-eerlijk .mq-demo-open', (bs: HTMLElement[]) => bs.map((b) => b.dataset.kaartGa).join(' '));
      check('Chrome: чесні картки «Приклад вигляду» з переходами; тумблер простору — гніздо в картці «Активний профіль»; пояснення у вікні навігації',
        kaarten.includes('menu|#menu-modus') && kaarten.includes('widgets|dienst:hub') && kaarten.includes('identities|accountmenu:') && await page.$$eval('[data-echt="ruimtewissel"]', (x: unknown[]) => x.length) === 1
        && (await page.$eval('#mqPaginaNavNoot', (e: HTMLElement) => e.textContent || '')).startsWith('Положення й поведінка діють і на меню сайту'), kaarten);
      check('Chrome: без помилок сторінки', fouten.length === 0, fouten.join(' | '));
    } finally { await browser.close(); }
  } catch (e) {
    check('Chrome: неочікувана помилка', false, String((e as Error)?.stack || e).slice(0, 600));
  } finally { rmSync(map, { recursive: true, force: true }); }
}

export async function main(): Promise<number> {
  const { check, einde } = checker('identiteit-015-vormgeving');

  // ================================================================ (а) модель: нові поля, нормалізація, сумісність
  {
    const vol = normaliseerUiterlijkRuimte({ vormgeving: 'klassiek', dichtheid: 'compact', beweging: 'minder', accent: 'cyan', effecten: 80.4, palet: 'grifel' });
    check('модель: vormgeving, dichtheid, beweging, accent, effecten зберігаються (effecten округлено)',
      vol.vormgeving === 'klassiek' && vol.dichtheid === 'compact' && vol.beweging === 'minder' && vol.accent === 'cyan' && vol.effecten === 80 && vol.palet === 'grifel', JSON.stringify(vol));
    const fout = normaliseerUiterlijkRuimte({ vormgeving: 'oud', dichtheid: 'enorm', beweging: 'snel', accent: 'rood', effecten: 500 });
    const fout2 = normaliseerUiterlijkRuimte({ effecten: -1 }), fout3 = normaliseerUiterlijkRuimte({ effecten: 'veel' }), fout4 = normaliseerUiterlijkRuimte({ effecten: null });
    check('модель: невідомі значення й межі відкидаються (і порожнє/від\'ємне/текст для ефектів)',
      ['vormgeving', 'dichtheid', 'beweging', 'accent', 'effecten'].every((k) => !(k in fout)) && !('effecten' in fout2) && !('effecten' in fout3) && !('effecten' in fout4), JSON.stringify([fout, fout2, fout3, fout4]));
    const std = normaliseerUiterlijkRuimte({ dichtheid: 'normaal', beweging: 'systeem', effecten: UITERLIJK_EFFECTEN_STANDAARD });
    check('модель: типові значення (звичайна, як на пристрої, 45 %) не зберігаються — запис лишається порожнім', Object.keys(std).join(',') === 'versie', JSON.stringify(std));
    const oud = normaliseerUiterlijkRuimte({ modus: 'dark', palet: 'puur', geluid: false });
    check('сумісність: старий запис без нових полів читається як раніше', oud.modus === 'dark' && oud.palet === 'puur' && oud.geluid === false && !('vormgeving' in oud) && !('dichtheid' in oud));
    const twee = metUiterlijkRuimte({ versie: 2, gebruiker: { modus: 'light' }, technisch: { modus: 'dark', accent: 'amber' } }, 'gebruiker', { dichtheid: 'ruim' });
    check('модель: зміна однієї ruimte не чіпає іншої (технічний простір зберігає свій акцент)', twee.technisch.accent === 'amber' && twee.gebruiker.dichtheid === 'ruim' && !twee.gebruiker.modus && uiterlijkVoorRuimte(twee, 'technisch').modus === 'dark');
    check('модель: переліки збігаються з елементами «Макета» (3 вигляди, 3 щільності, 4 акценти)',
      UITERLIJK_VORMGEVINGEN.join() === 'maquette,studio,klassiek' && UITERLIJK_DICHTHEDEN.join() === 'compact,normaal,ruim' && UITERLIJK_ACCENTEN.join() === 'violet,cyan,pink,amber'
      && normaliseerUiterlijkRuimtes({ vormgeving: 'studio' }).gebruiker.vormgeving === 'studio');
  }

  // ================================================================ (б) акцент поверх палітри: CSS = таблиця, контраст достатній
  {
    const css = readFileSync('src/thema/weergave-stijl.css', 'utf8');
    const verschil: string[] = [];
    for (const id of UITERLIJK_ACCENTEN) for (const [toon, sel] of [['licht', 'theme-light,.theme-plum-light'], ['donker', 'theme-dark,.theme-plum-dark']] as const) {
      const t = ACCENT_TONEN[id][toon];
      const regel = `:root:root[data-accent="${id}"]:is(.${sel}), :root:root[data-accent="${id}"] :is(.${sel}) { --accent:${t.accent}; --accentText:${t.tekst}; --accent-soft:${t.zacht}; }`;
      if (!css.includes(regel)) verschil.push(`${id}/${toon}`);
    }
    check('акцент: правила weergave-stijl.css точно відповідають ACCENT_TONEN (обидві теми, усі 4 кольори)', verschil.length === 0, verschil.join(' '));
    // Тла всіх палітр: «Кольоровий» для кожного розділу, «Чистий», грифельний і фіолетовий (src/ontwerp/tokens.css).
    const tokens = readFileSync('src/ontwerp/tokens.css', 'utf8');
    const uitTokens = (sel: string) => { const m = new RegExp(`${sel.replace(/[.]/g, '\\.')} \\{([^}]*)\\}`).exec(tokens)?.[1] || ''; return ['--bg', '--panel', '--surface'].map((k) => new RegExp(`${k}:(#[0-9a-f]{3,6})`, 'i').exec(m)?.[1]).filter(Boolean) as string[]; };
    const licht = [...SECTIES.flatMap((s) => [kleurWaarden(s).licht.bg, kleurWaarden(s).licht.panel, kleurWaarden(s).licht.surface]), PUUR.licht.bg, PUUR.licht.surface, ...uitTokens(':root, .theme-light'), ...uitTokens('.theme-plum-light')];
    const donker = [...SECTIES.flatMap((s) => [kleurWaarden(s).donker.bg, kleurWaarden(s).donker.panel, kleurWaarden(s).donker.surface]), PUUR.donker.bg, PUUR.donker.surface, ...uitTokens('.theme-dark'), ...uitTokens('.theme-plum-dark')];
    const slecht: string[] = [];
    for (const id of UITERLIJK_ACCENTEN) {
      for (const [toon, tla] of [['licht', licht], ['donker', donker]] as const) {
        const t = ACCENT_TONEN[id][toon];
        if (contrast(t.accent, t.tekst) < 4.5) slecht.push(`${id}/${toon}: tekst ${contrast(t.accent, t.tekst).toFixed(2)}`);
        for (const bg of tla) if (contrast(t.accent, bg) < 3) slecht.push(`${id}/${toon} op ${bg}: ${contrast(t.accent, bg).toFixed(2)}`);
        if (contrast(toon === 'licht' ? '#17212b' : '#f3f6f8', t.zacht) < 4.5) slecht.push(`${id}/${toon}: tekst op zacht`);
      }
    }
    check(`акцент: текст на заливці ≥ 4,5:1, заливка на тлі КОЖНОЇ палітри (${licht.length}+${donker.length} тл) ≥ 3:1, текст на м'якій підкладці ≥ 4,5:1`, slecht.length === 0 && licht.length > 30 && donker.length > 30, slecht.join(' | '));
    check('акцент: специфічність вища за палітри й оболонку (:root:root + атрибут + клас теми)', /:root:root\[data-accent="violet"\]/.test(css) && !/prefers-color-scheme/.test(css));
    check('щільність: масштабує ритм --ruimte-1…6 (компактна менша, простора більша), розмір тексту й висоту дотику не чіпає',
      /data-dichtheid="compact"\] \{ --ruimte-1:3px;[^}]*--ruimte-6:24px; \}/.test(css) && /data-dichtheid="ruim"\] \{ --ruimte-1:5px;[^}]*--ruimte-6:40px; \}/.test(css) && !/--tekst-|--tik-hoogte/.test(css.replace(/\/\*[\s\S]*?\*\//g, '')));
    check('рух: «менше руху» вимикає анімації й переходи на всьому сайті поверх пристрою', /:root\[data-beweging="minder"\] \*[^{]*\{[^}]*animation-duration: \.01ms !important;[^}]*transition-duration: \.01ms !important;/.test(css));
    check('ефекти: --effect-sterkte керує сяйвом ілюстрацій «Макета» і «Студії» (0 % — без сяйва)', /--effect-sterkte: \.45;/.test(css) && /opacity: clamp\(0, calc\(var\(--effect-sterkte\) \* 2\.2\), 1\)/.test(css) && /\.mr-mq, \.mr-kunst/.test(css));
    const w = { dataset: {} as Record<string, string>, stijl: new Map<string, string>(), style: { setProperty(k: string, v: string) { w.stijl.set(k, v); }, removeProperty(k: string) { w.stijl.delete(k); } } };
    pasWeergaveStijlToe({ dichtheid: 'compact', beweging: 'minder', accent: 'pink', effecten: 10 }, w as never);
    const een = JSON.stringify(w.dataset) + w.stijl.get('--effect-sterkte');
    pasWeergaveStijlToe({ dichtheid: 'normaal', beweging: 'systeem', effecten: UITERLIJK_EFFECTEN_STANDAARD }, w as never);
    check('застосування: атрибути <html> ставляться й знімаються (типові значення — без атрибута, як раніше)',
      een === '{"dichtheid":"compact","beweging":"minder","accent":"pink"}0.1' && JSON.stringify(w.dataset) === '{}' && !w.stijl.has('--effect-sterkte'), een);
  }

  // ================================================================ (в) двигун «Макета»: справжні налаштування, чесні позначки
  {
    const motor = readFileSync('src/identiteit/maquette/maquette-motor.ts', 'utf8');
    const component = readFileSync('src/identiteit/maquette/IdentiteitMaquette.tsx', 'utf8');
    const sjabloon = readFileSync('src/identiteit/maquette/maquette-sjabloon.ts', 'utf8');
    const centrum = readFileSync('src/InstellingencentrumWeergave.tsx', 'utf8');
    check('мова: кнопки картки «Мови» викликають справжню зміну мови сайту (bijTaal → onLanguage → changeLanguage: cookie + обліковий запис)',
      motor.includes('if(target.dataset.demoLang){if(typeof opties.bijTaal==="function"){if(target.dataset.demoLang!==preferences.lang)opties.bijTaal(target.dataset.demoLang);}')
      && component.includes('bijTaal: (l: \'uk\' | \'nl\') => onTaalRef.current?.(l)') && centrum.includes('onTaal={p.onLanguage}')
      && /onLanguage=\{changeLanguage\}/.test(readFileSync('src/VerenigdDienstApp.tsx', 'utf8')) && /const changeLanguage=\(next:Lang\)=>\{chooseExplicitLanguage\(next\);setLang\(next\);if\(state==='authorized'&&user\?\.status==='approved'\)void api\.post\('\/api\/owner\/ui\/preferences\/save'/.test(readFileSync('src/VerenigdDienstApp.tsx', 'utf8')));
    check('макет → сайт: стиль піктограм, щільність, рух, ефекти, акцент, положення й режим меню йдуть у справжні налаштування',
      ['доСайту({icoonStijl:', 'доСайту({dichtheid:', 'доСайту({beweging:', 'доСайту({effecten:', 'доСайту({accent:', 'доСайту({positie:ПОЗ_САЙТ[position]})', 'доСайту({modus:РЕЖИМ_САЙТ[mode]})'].every((s) => motor.includes(s)));
    check('сайт → макет: початкові значення з облікового запису, зміни ззовні (справжня панель, інший пристрій) без луни назад',
      motor.includes('демоЗСайту(opties.weergave);') && motor.includes('zetWeergave(w) {') && /сайтГотовий=false;[\s\S]{0,400}finally\{сайтГотовий=true;\}/.test(motor)
      && motor.includes('function доСайту(patch){if(сайтГотовий&&') && component.includes('motor.current?.zetWeergave(weergaveRef.current)'));
    check('щільність у макеті — три рівні сайту (uk/nl); акцент позначено лише той, що справді діє',
      motor.includes('options:["Звичайна","Компактна","Простора"]}') && motor.includes('options:["Normaal","Compact","Ruim"]}') && motor.includes('class="\'+(обранийАкцент()===c?"selected":"")+\'"'));
    check('чесно: «Підсвічувати активний розділ», «Підказки при наведенні», віджети, позначка режиму — «Приклад вигляду» з поясненням і переходом',
      ['"menu-0":', '"menu-1":', '"widgets-0":', '"widgets-1":', '"identities-1":'].every((k) => motor.includes(k)) && motor.includes('"#menu-modus"],') && motor.includes('"dienst:hub"],') && motor.includes('"accountmenu:"],')
      && motor.includes('if(typeof ціль==="string"&&ціль.startsWith("dienst:")){opties.bijDienst(ціль.slice(7));return;}') && motor.includes('if(ціль==="accountmenu:"){opties.bijAccountMenu();return;}'));
    check('identities.профіль: «Активний профіль» — справжній тумблер простору в картці (гніздо ruimtewissel → ProfielRuimteKaart)',
      motor.includes('if(sectionId==="identities"&&i===0)return карткаПростору(control,i,sectionId);') && motor.includes('data-echt="ruimtewissel"') && component.includes("if (id === 'ruimtewissel') return createPortal(<ProfielRuimteKaart lang={lang} />, houder, id);"));
    const kaart = readFileSync('src/identiteit/ProfielRuimteKaart.tsx', 'utf8');
    check('identities.профіль: без перемикача просторів — точна передумова (технічний профіль → «Перемикачі функцій» → tech-ruimtes-v2); без права — пояснення RuimteWissel',
      kaart.includes('«Перемикачі функцій» → «Два простори одного акаунта (нова версія)» (tech-ruimtes-v2)') && kaart.includes('<RuimteWissel taal={lang} />') && readFileSync('src/tech/ruimtes/RuimteWissel.tsx', 'utf8').includes('Немає дозволу на технічний простір. Його дає власник сервера.'));
    check('вікно навігації: чесно сказано, що діє на меню сайту, а що лише на навігацію сторінки, і є перехід до справжніх налаштувань меню',
      sjabloon.includes('id=\\"mqPaginaNavNoot\\"') && sjabloon.includes('data-kaart-ga=\\"menu|#menu-modus\\"') && motor.includes('write("#mqPaginaNavNoot",'));
    check('справжні панелі: щільність і рух у «Персоналізації», акцент і ефекти в «Темах» (видно в «Макеті», «Студії» й класичному)',
      centrum.includes('<PersoonlijkeWeergave tr={tr}/>') && readFileSync('src/thema/ThemaInstellingen.tsx', 'utf8').includes('<AccentEnEffecten tr={tr} />'));
    check('вибір вигляду: підказка більше не обіцяє «лише на цьому пристрої»', readFileSync('src/identiteit/VormgevingKiezer.tsx', 'utf8').includes('Вибір зберігається в обліковому записі й діє на всіх ваших пристроях після входу.') && !readFileSync('src/identiteit/VormgevingKiezer.tsx', 'utf8').includes('Вибір зберігається на цьому пристрої.'));
  }

  // ================================================================ (г) клієнт: справжні модулі src/ у нагробленому браузері
  {
    const { ls, wortel } = nepBrowser();
    const sp = await import('../../src/gedeelde-voorkeuren');
    const vg = await import('../../src/identiteit/identiteit-vormgeving');
    sp.zetWeergaveAccount('u-0000015a');
    sp.writeSharedPreferences({ dichtheid: 'compact', beweging: 'minder', accent: 'amber', effecten: 70, vormgeving: 'klassiek', theme: 'dark' });
    const p = sp.readSharedPreferences(), srv = sp.uiterlijkVoorServer('gebruiker');
    check('клієнт: запис і читання нових полів у scope облікового запису; усе це йде на сервер',
      p.dichtheid === 'compact' && p.beweging === 'minder' && p.accent === 'amber' && p.effecten === 70 && p.vormgeving === 'klassiek' && p.theme === 'dark'
      && srv.dichtheid === 'compact' && srv.vormgeving === 'klassiek' && srv.accent === 'amber', JSON.stringify(srv));
    sp.writeSharedPreferences({ dichtheid: 'normaal', accent: undefined, effecten: UITERLIJK_EFFECTEN_STANDAARD });
    const q = sp.uiterlijkVoorServer('gebruiker');
    check('клієнт: повернення до типового прибирає поле (і з того, що йде на сервер); решта лишається', !('dichtheid' in q) && !('accent' in q) && !('effecten' in q) && q.beweging === 'minder' && q.modus === 'dark', JSON.stringify(q));
    // Вибір вигляду: обліковий запис важливіший за кеш пристрою; вибір пишеться в обидва; повторне натискання нічого не змінює.
    ls.setItem('identiteit-account-vormgeving', 'studio');
    check('вигляд: обліковий запис (klassiek) важливіший за кеш пристрою (studio)', vg.leesVormgeving() === 'klassiek');
    vg.bewaarVormgeving('maquette');
    const rev = sp.readSharedPreferences().revision;
    vg.bewaarVormgeving('maquette');
    check('вигляд: bewaarVormgeving пише в обліковий запис і в кеш; повторне натискання того самого — без нового запису',
      sp.readSharedPreferences().vormgeving === 'maquette' && ls.getItem('identiteit-account-vormgeving') === 'maquette' && sp.readSharedPreferences().revision === rev && sp.uiterlijkVoorServer('gebruiker').vormgeving === 'maquette');
    check('вигляд: без «Макета» (прапорець вимкнено) збережений «maquette» не нав\'язується — перший доступний', vg.leesVormgeving(['studio', 'klassiek']) === 'studio');
    // Інший обліковий запис у тому самому браузері не бачить чужого вибору в обліковому записі.
    sp.zetWeergaveAccount('u-0000015b');
    check('вигляд: інший обліковий запис у цьому браузері не успадковує вибору з облікового запису першого', sp.readSharedPreferences().vormgeving === undefined && sp.readSharedPreferences().accent === undefined);
    sp.zetWeergaveAccount('u-0000015a');
    // Макет → сайт: справжні функції запису (вигляд облікового запису + меню).
    const mq = await import('../../src/identiteit/maquette/IdentiteitMaquette');
    const zb = await import('../../src/zijbalk-voorkeuren');
    mq.weergaveNaarSite({ dichtheid: 'ruim', beweging: 'systeem', accent: 'violet', effecten: 20, icoonStijl: 'kleur', positie: 'rechts', modus: 'dicht' });
    const na = sp.readSharedPreferences(), z = zb.zijbalkVoorkeuren();
    check('макет → сайт: weergaveNaarSite змінює справжні налаштування облікового запису й меню (не локальні демо-значення)',
      na.dichtheid === 'ruim' && na.beweging === undefined && na.accent === 'violet' && na.effecten === 20 && z.icoonStijl === 'kleur' && z.dock.positie === 'rechts' && z.modus === 'dicht', JSON.stringify({ na, z: { i: z.icoonStijl, d: z.dock, m: z.modus } }));
    mq.weergaveNaarSite({ dichtheid: 'normaal', effecten: UITERLIJK_EFFECTEN_STANDAARD });
    check('макет → сайт: «Звичайна» і 45 % повертають типове (поля зникають), меню не чіпається', sp.readSharedPreferences().dichtheid === undefined && sp.readSharedPreferences().effecten === undefined && zb.zijbalkVoorkeuren().dock.positie === 'rechts');
    pasWeergaveStijlToe({ dichtheid: 'compact', accent: 'cyan' });
    check('застосування на справжньому document.documentElement', wortel.dataset.dichtheid === 'compact' && wortel.dataset.accent === 'cyan');
  }

  // ================================================================ (ґ) двигун «Макета» у справжньому Chrome (як identiteit-014-herstel-recensie)
  await inChrome(check);

  // ================================================================ (д) сервер: справжні маршрути, другий пристрій, інший обліковий запис
  const T = `${Date.now()}-${randomBytes(2).toString('hex')}`;
  const vorige = { owner: process.env.OWNER_EMAIL, id: process.env.GOOGLE_OAUTH_CLIENT_ID, secret: process.env.GOOGLE_OAUTH_CLIENT_SECRET };
  const G = await nepGoogle({ ownerEmail: `i015v-eig-${T}@example.test` });
  const pool = getPool();
  type Browser = ReturnType<typeof G.browser>;
  const idRij = async (email: string) => (await pool.query("select id from app.records where tbl='users' and data->>'email'=$1 order by seq desc limit 1", [email])).rows[0]?.id as string;
  const opslaan = (b: Browser, weergave: unknown, extra: Record<string, unknown> = {}) => b.verzoek('id.tarasevych.com', '/api/owner/ui/weergave/save', b.ctxBody('identity', { weergave, ...extra }));
  const lezen = (b: Browser) => b.verzoek('id.tarasevych.com', '/api/owner/ui/weergave', b.ctxBody('identity'));
  const voorkeuren = async (b: Browser) => (await b.verzoek('id.tarasevych.com', '/api/owner/ui/preferences', b.ctxBody('identity'))).data;
  const maak = async (naam: string, status = 'approved') => {
    const email = `i015v-${naam}-${T}@example.test`, b = G.browser(), sub = `i015v-${naam}-${T}`;
    await b.aanmelden(sub, email, { service: 'identity', intent: 'login' });
    const id = await idRij(email);
    await pool.query(`update app.records set data = data || $2::jsonb where tbl='users' and id=$1`, [id, JSON.stringify({ status })]);
    return { b, email, id, sub };
  };
  try {
    const A = await maak('a'), B = await maak('b');
    const keuze = { vormgeving: 'klassiek', dichtheid: 'compact', beweging: 'minder', accent: 'pink', effecten: 75, modus: 'light', palet: 'grifel' };
    const r1 = await opslaan(A.b, keuze);
    check('сервер: схвалений обліковий запис зберігає вигляд, щільність, рух, акцент і ефекти (200, нормалізовано)',
      r1.status === 200 && r1.data.ruimte === 'gebruiker' && r1.data.weergave?.vormgeving === 'klassiek' && r1.data.weergave?.dichtheid === 'compact' && r1.data.weergave?.beweging === 'minder' && r1.data.weergave?.accent === 'pink' && r1.data.weergave?.effecten === 75,
      `${r1.status} ${r1.body.slice(0, 300)}`);
    const r2 = await opslaan(A.b, keuze);
    check('сервер: повторне збереження того самого дає той самий стан (ідемпотентно)', r2.status === 200 && JSON.stringify(r2.data.weergave) === JSON.stringify(r1.data.weergave));
    // Другий пристрій: окремий набір cookie, той самий обліковий запис.
    const tweede = G.browser();
    await tweede.aanmelden(A.sub, A.email, { service: 'identity', intent: 'login' });
    const opTweede = await lezen(tweede), bootTweede = await voorkeuren(tweede);
    check('сервер: на ДРУГОМУ пристрої після входу — той самий вигляд центру й ті самі налаштування (маршрут і перше завантаження)',
      opTweede.status === 200 && opTweede.data.weergave?.vormgeving === 'klassiek' && opTweede.data.weergave?.accent === 'pink' && bootTweede.weergave?.vormgeving === 'klassiek' && bootTweede.weergave?.dichtheid === 'compact',
      `${opTweede.status} ${JSON.stringify(opTweede.data.weergave)} / ${JSON.stringify(bootTweede.weergave)}`);
    // Зміна з другого пристрою видна на першому (не останній локальний кеш, а обліковий запис).
    await opslaan(tweede, { ...keuze, vormgeving: 'maquette', dichtheid: 'ruim' });
    check('сервер: зміна на другому пристрої видна на першому («Класичний» → «Макет» веде до того самого запису)', (await lezen(A.b)).data.weergave?.vormgeving === 'maquette' && (await lezen(A.b)).data.weergave?.dichtheid === 'ruim');
    const bLees = await lezen(B.b);
    check('сервер: інший обліковий запис не бачить чужого вибору', bLees.status === 200 && !bLees.data.weergave?.vormgeving && !bLees.data.weergave?.accent, JSON.stringify(bLees.data.weergave));
    const onzin = await opslaan(B.b, { vormgeving: '<script>', dichtheid: 'x', accent: 'rood', effecten: 1e9, beweging: true });
    check('сервер: підроблені значення відкидаються сервером (запис порожній, без помилки)', onzin.status === 200 && ['vormgeving', 'dichtheid', 'accent', 'effecten', 'beweging'].every((k) => !(k in (onzin.data.weergave || {}))), JSON.stringify(onzin.data.weergave));
    const groot = await opslaan(B.b, { vormgeving: 'studio', ruis: 'x'.repeat(9000) });
    check('сервер: межа розміру лишається (413), нічого не збережено', groot.status === 413 && !(await lezen(B.b)).data.weergave?.vormgeving);
    // Старий запис у базі без нових полів (як до IDENTITEIT-015) — читається без помилок, решта зберігається.
    await pool.query(`update app.records set data = jsonb_set(data, '{weergave}', $2::jsonb) where tbl='owner_ui_preferences_v1' and data->>'userId'=$1`, [B.id, JSON.stringify({ modus: 'dark', palet: 'puur' })]);
    const oudLees = await lezen(B.b);
    check('сумісність: старий збережений запис (без ruimtes і нових полів) читається як gebruiker без помилок', oudLees.status === 200 && oudLees.data.weergave?.modus === 'dark' && oudLees.data.weergave?.palet === 'puur' && !oudLees.data.weergave?.vormgeving, `${oudLees.status} ${JSON.stringify(oudLees.data.weergave)}`);
    const C = await maak('c', 'pending');
    const wacht = await opslaan(C.b, { vormgeving: 'studio' });
    check('межа: не схвалений обліковий запис не зберігає вигляд (403, як і решта вигляду)', wacht.status === 403 && JSON.stringify(wacht.data).includes('OWNER_APPROVED_SESSION_REQUIRED'), `${wacht.status}`);
    const anoniem = G.browser();
    const zonder = await opslaan(anoniem, { vormgeving: 'studio' });
    check('межа: без входу — відмова', zonder.status === 401 || zonder.status === 403, `${zonder.status}`);
    const tech = await opslaan(A.b, { accent: 'violet' }, { ruimte: 'technisch' });
    check('межа: технічний простір без запущеного профілю — 403 TECH_PROFIEL_VEREIST (звичайний простір не змінено)', tech.status === 403 && JSON.stringify(tech.data).includes('TECH_PROFIEL_VEREIST') && (await lezen(A.b)).data.weergave?.accent === 'pink');
  } catch (e) {
    check('неочікувана помилка (маршрути)', false, String((e as Error)?.stack || e));
  } finally {
    G.herstel();
    const ids = (await pool.query("select id from app.records where tbl='users' and data->>'email' like $1", [`i015v-%-${T}@example.test`])).rows.map((r: { id: string }) => r.id);
    if (ids.length) await pool.query("delete from app.records where id = any($1) or data->>'userId' = any($1) or data->>'accountId' = any($1) or data->>'recipientUserId' = any($1) or data->>'ownerUserId' = any($1)", [ids]).catch(() => undefined);
    for (const [k, v] of Object.entries({ OWNER_EMAIL: vorige.owner, GOOGLE_OAUTH_CLIENT_ID: vorige.id, GOOGLE_OAUTH_CLIENT_SECRET: vorige.secret })) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
  }
  await closePool().catch(() => undefined);
  return einde();
}
