// IDENTITEIT-015 (приймання, група «vormgeving», лінія D1 — звірка з v49): вигляд «Макет» центру облікового запису в справжньому
// Chromium, вигадана особа (власниця сайту), прапорці identiteit-account-atelier і identiteit-account-maquette увімкнено на час перевірки.
// Кожен «пристрій» — окремий контекст із тими самими cookie.
//  A. Шлях людини: hub → меню облікового запису → «Керування обліковим записом» → «Вигляд сторінки» → «Макет»; вибір вигляду
//     зберігається в обліковому записі (сервер) — другий контекст тієї самої особи бачить його; і назад («Класичний» з «Макета»).
//  B. Відповідність погодженому оформленню v49 (1280 і 380×800, uk/nl, світла/темна): чотири групи й порядок дванадцяти розділів
//     (src/identiteit/atelier-v49-gegevens.json), заголовки й написи на ілюстраціях мовою сторінки; радіуси великих карток і вступної
//     та відступи в обох темах — обчислені стилі проти оригінальних стилів архіву v49 (docs/ontwerp/identiteit-account/maquette-bron/
//     styles.css, контрольна сума з ПЕРЕНЕСЕННЯ-ВЕРСІЇ-49.uk.md) за тієї самої ширини, і значення з `git show 5846625a^:…atelier-v49-bron.css`;
//     три режими меню (auto/open/dicht) × чотири положення (links/rechts/boven/onder) з піктограмами в згорнутому й розгорнутому меню,
//     вікно «Налаштування навігації» (вміщається в екран, фокус повертається), пошук розділу, перехід зі смуги розділів, перегляд
//     вигляду на сторінці (кольорові піктограми змінюють сторінку одразу).
// Матриця пристроїв, клавіатура/дотик/масштаб/рух і знімки 12 розділів — лінії D2 (identiteit-015-apparaten) і D3 (identiteit-015-schermen).
// Звіт: docs/ontwerp/identiteit-account/ЗВІРКА-V49-ВИГЛЯД.uk.md. Лише вигадані адреси @example.test.
// Acceptatie van de weergave «Ontwerp» tegen het goedgekeurde ontwerp v49: pad van de mens, opslag van de keuze, indeling, maten, menu.
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createHash, randomBytes } from 'node:crypto';
import type { Browser, BrowserContext, Page } from 'playwright-core';
import { checker } from '../eenheid/hulp/nep-google';
import { getPool } from '../../server/platform/pg';
import { startE2eServer, chromeArgs } from './server';
import { HUB, ID, api, apparaat, persoon, sluit, volgFouten, type Persoon } from './hulp/sessie-015';

const PW = process.env.PLAYWRIGHT_CORE || '/workspace/e2e-tools/node_modules/playwright-core';
const TLS = process.env.E2E_TLS || '/workspace/e2e-tools/tls';
const POORT = Number(process.env.E2E_POORT || 8443);
const CHROME = process.env.CHROME || '/usr/bin/google-chrome';
// Alleen voor het ontwikkelen: E2E_STAP=A,C draait alleen die delen.
const STAPPEN = (process.env.E2E_STAP || 'A,B').split(',');
const VERWACHT = [/\/api\/owner\/agents\/activity$/, /mail\.tarasevych\.com\/api\/owner\/mail\/(bootstrap|accounts\/list)$/];
const VLAGGEN = ['identiteit-account-atelier', 'identiteit-account-maquette'];

type Taal = 'uk' | 'nl';
type V49Sectie = { id: string; group: string; number: string; uk: { name: string; title: string }; nl: { name: string; title: string }; art: Record<Taal, string> };
const V49 = JSON.parse(readFileSync('src/identiteit/atelier-v49-gegevens.json', 'utf8')) as { secties: V49Sectie[] };
const GROEPEN = ['personal', 'social', 'account', 'security'] as const;
const ORDE = V49.secties.map((s) => s.id);

/** Погоджений зразок v49: оригінальні стилі архіву «випуск-розгортання-20261107-49» (docs/ontwerp/identiteit-account/maquette-bron/styles.css;
 *  контрольна сума — у ПЕРЕНЕСЕННЯ-ВЕРСІЇ-49.uk.md). Саме з ними порівнюємо обчислені стилі за тієї самої ширини. */
const V49_STIJL = readFileSync('docs/ontwerp/identiteit-account/maquette-bron/styles.css', 'utf8');
const V49_STIJL_SHA = '16f17b59024e683f9628ca57bedda3bdb9b820b0de0be300112aa2259ddadf14';
/** Той самий зразок у перенесенні IDENTITEIT-004 (atelier-v49-bron.css з історії, до 5846625a). Без повної історії git — null. */
function v49Css(): string | null {
  try { return execFileSync('git', ['show', '5846625a^:src/identiteit/atelier-v49-bron.css'], { encoding: 'utf8', maxBuffer: 8 << 20, stdio: ['ignore', 'pipe', 'ignore'] }); } catch { return null; }
}
// atelier-v49-bron.css: :root --radius:27px (рядок 1), .hero border-radius:30px (рядок 60); @media(max-width:730px) .hero 23px, .setting-section 22px.
const V49_RADIUS = { breed: { sectie: '27px', hero: '30px' }, smal: { sectie: '22px', hero: '23px' } };

/** Текст ілюстрації v49 без розмітки (написи на картинках). */
const artTekst = (html: string) => html.replace(/Користувач/g, ' ').replace(/<svg[\s\S]*?<\/svg>/g, ' ').replace(/<[^>]+>/g, ' ').replace(/&[a-z]+;/g, ' ').replace(/\s+/g, ' ').trim();
const KYRYLYTSIA = /[\u0400-\u04FF]/;

export async function main(): Promise<number> {
  const { check, einde } = checker('e2e identiteit-015 vormgeving');
  const { chromium } = createRequire(import.meta.url)(PW) as typeof import('playwright-core');
  const T = `${Date.now()}-${randomBytes(2).toString('hex')}`;
  const eigenaarEmail = `e2e-i15v-eig-${T}@example.test`;
  const { G, stop } = await startE2eServer({ ownerEmail: eigenaarEmail, poort: POORT, tls: TLS });
  const pool = getPool();
  const browser: Browser = await chromium.launch({ executablePath: CHROME, headless: true, args: chromeArgs(POORT) });
  const fouten: string[] = [];
  const emails: string[] = [];
  const bron = v49Css();
  const vlagWas = (await pool.query('SELECT sleutel, aan, standaard FROM app.feature_flags WHERE sleutel = ANY($1)', [VLAGGEN])).rows as Array<{ sleutel: string; aan: boolean; standaard: boolean }>;
  type Pagina = { ctx: BrowserContext; page: Page };
  const open = async (o: Persoon, url: string, extra: Parameters<typeof apparaat>[2] = {}): Promise<Pagina> => {
    const a = await apparaat(browser, o, { taal: 'uk', ...extra });
    volgFouten(a.page, fouten, VERWACHT);
    await a.page.goto(url, { waitUntil: 'networkidle' });
    await a.page.locator('.canonical-chrome').waitFor({ state: 'attached', timeout: 20000 }).catch(async (e) => {
      throw new Error(`${String(e).slice(0, 120)} | url ${a.page.url()} | ${(await a.page.evaluate(() => document.body?.innerText || '').catch(() => '')).slice(0, 300)}`);
    });
    await a.page.waitForTimeout(600);
    return a;
  };
  const openMq = async (o: Persoon, pad: string, taal: Taal, extra: Parameters<typeof apparaat>[2] = {}) => {
    const a = await open(o, `${ID}/${pad}?lang=${taal}`, { taal, ...extra });
    await a.page.locator('.mr-mq #group-security .setting-section').first().waitFor({ timeout: 20000 });
    await a.page.waitForTimeout(500);
    return a;
  };
  const serverWeergave = async (page: Page) => ((await api(page, '/api/owner/ui/weergave', { ruimte: 'gebruiker' })).data?.weergave || {}) as Record<string, any>;
  const zetVormgevingServer = (page: Page, v: string) => api(page, '/api/owner/ui/weergave/save', { ruimte: 'gebruiker', weergave: { versie: 1, vormgeving: v } });
  /** Сам вигляд: чи відкрито «Макет», «Студію» чи класичну сторінку. */
  const welkeVormgeving = (page: Page) => page.evaluate(() => document.querySelector('.mr-mq') ? 'maquette' : document.querySelector('.ia-at, [data-vormgeving-atelier], .ia-atelier') ? 'studio' : document.querySelector('.ia-account') ? 'klassiek' : '?');
  /** Розміри й відступи карток (обчислені стилі), класи кореня «Макета». */
  const maten = (page: Page) => page.evaluate(() => {
    const r = document.querySelector('.mr-mq') as HTMLElement;
    const cs = (s: string) => { const e = r.querySelector(s); return e ? getComputedStyle(e) : null; };
    const sec = cs('.setting-section'), hero = cs('#intro.hero'), main = cs('.setting-main'), copy = cs('.hero-copy');
    return {
      klassen: Array.from(r.classList), licht: r.classList.contains('light'), breedte: r.clientWidth,
      sectie: sec?.borderTopLeftRadius || '', hero: hero?.borderTopLeftRadius || '',
      mainPad: main ? `${main.paddingTop} ${main.paddingRight} ${main.paddingBottom} ${main.paddingLeft}` : '',
      heroPad: copy ? `${copy.paddingTop} ${copy.paddingRight} ${copy.paddingBottom} ${copy.paddingLeft}` : '',
    };
  });
  /** Ширина, з якою v49 застосував би ті самі правила @media: з класів bp-max-N / bp-min-N кореня. */
  const probeBreedte = (klassen: string[]) => {
    const max = klassen.filter((k) => k.startsWith('bp-max-')).map((k) => Number(k.slice(7)));
    const min = klassen.filter((k) => k.startsWith('bp-min-')).map((k) => Number(k.slice(7)));
    const boven = max.length ? Math.min(...max) : Infinity, onder = min.length ? Math.max(...min) : 0;
    return boven === Infinity ? Math.max(onder + 100, 1440) : boven === onder ? boven : Math.round((onder + boven) / 2) || 320;
  };
  /** Ті самі елементи в оформленні v49 (CSS із історії) за тієї самої ширини й тих самих класів положення меню. */
  const v49Maten = async (klassen: string[], breedte?: number) => {
    const w = breedte || probeBreedte(klassen);
    const ctx = await browser.newContext({ viewport: { width: w, height: 900 } });
    const p = await ctx.newPage();
    const kl = klassen.filter((k) => /^rail-|^light$/.test(k)).join(' ');
    await p.setContent(`<!doctype html><html><head><style>${V49_STIJL}</style></head><body class="${kl}"><div class="app-shell"><main class="main-content"><div class="page-wrap"><section id="intro" class="hero"><div class="hero-copy"></div></section><div class="section-list"><section class="setting-section"><div class="section-card"><div class="setting-main"></div></div></section></div></div></main></div></body></html>`);
    const m = await p.evaluate(() => {
      const cs = (s: string) => getComputedStyle(document.querySelector(s)!);
      const main = cs('.setting-main'), copy = cs('.hero-copy');
      return { sectie: cs('.setting-section').borderTopLeftRadius, hero: cs('.hero').borderTopLeftRadius, mainPad: `${main.paddingTop} ${main.paddingRight} ${main.paddingBottom} ${main.paddingLeft}`, heroPad: `${copy.paddingTop} ${copy.paddingRight} ${copy.paddingBottom} ${copy.paddingLeft}` };
    });
    await ctx.close();
    return { w, ...m };
  };
  /** Порядок розділів у групах і заголовки мовою сторінки. */
  const indeling = (page: Page) => page.evaluate((groepen) => {
    const r = document.querySelector('.mr-mq')!;
    return {
      groepen: groepen.map((g) => ({ g, ids: Array.from(r.querySelectorAll(`#group-${g} > .setting-section`)).map((s) => s.id) })),
      alle: Array.from(r.querySelectorAll('.setting-section')).map((s) => s.id),
      koppen: Object.fromEntries(Array.from(r.querySelectorAll('.setting-section')).map((s) => [s.id, (s.querySelector('.setting-main h2')?.textContent || '').trim()])),
      nummers: Object.fromEntries(Array.from(r.querySelectorAll('.setting-section')).map((s) => [s.id, (s.querySelector('.setting-index')?.textContent || '').trim()])),
      art: Object.fromEntries(Array.from(r.querySelectorAll('.setting-section')).map((s) => [s.id, ((s.querySelector('.art') as HTMLElement | null)?.textContent || '').replace(/\s+/g, ' ').trim()])),
      htmlLang: document.documentElement.lang, mqLang: r.getAttribute('lang'),
    };
  }, [...GROEPEN]);
  /** Натискання як людина; якщо елемента не видно — опис стану замість вічного очікування. */
  const druk = async (page: Page, sel: string) => {
    const l = page.locator(sel).first();
    try { await l.click({ timeout: 4000 }); return ''; } catch {
      return `${sel}: ${JSON.stringify(await l.evaluate((e) => { const r = e.getBoundingClientRect(); const p = document.querySelector('.mr-mq #navSettings') as HTMLElement; const pr = p.getBoundingClientRect(); const raak = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return { r: [r.left, r.top, r.width, r.height].map(Math.round), pop: [pr.left, pr.top, pr.width, pr.height].map(Math.round), hidden: p.hidden, raak: raak ? raak.tagName + '#' + raak.id + '.' + String((raak as HTMLElement).className).slice(0, 40) : '', kl: document.querySelector('.mr-mq')!.className.replace(/bp-\S+/g, '') }; }).catch((e) => String(e).slice(0, 200)))}`;
    }
  };
  /** Канонічна адреса розділу: /<нідерландський slug> (public/canonical-service.js → tabSlug). */
  const padVan = (page: Page, id: string) => page.evaluate((i) => '/' + (window as unknown as { __TSV_CANONICAL_SERVICE__: { tabSlug: (x: string) => string } }).__TSV_CANONICAL_SERVICE__.tabSlug(i), id);
  const navInstellingen = async (page: Page) => {
    if (await page.locator('.mr-mq #navSettings').isVisible()) return;
    const knop = page.locator('.mr-mq #mqSectiePositie');
    if (await knop.isVisible()) await knop.click(); else await page.locator('.mr-mq #railConfig').click();
    await page.locator('.mr-mq #navSettings').waitFor({ state: 'visible', timeout: 5000 });
  };
  const railStand = (page: Page) => page.evaluate(() => {
    const r = document.querySelector('.mr-mq') as HTMLElement, rail = r.querySelector('#anchorRail') as HTMLElement;
    const b = rail.getBoundingClientRect(), w = r.getBoundingClientRect();
    const links = Array.from(rail.querySelectorAll<HTMLElement>('#railItems .anchor-link, #railItems .nav-group-toggle')).filter((x) => x.getBoundingClientRect().width > 0);
    const iconen = links.map((x) => { const i = x.querySelector('.anchor-icon svg'); const ir = i?.getBoundingClientRect(); return !!ir && ir.width >= 10 && ir.height >= 10 && getComputedStyle(i!).visibility !== 'hidden'; });
    const namen = links.map((x) => { const n = x.querySelector('.anchor-name, .nav-group-name') as HTMLElement | null; if (!n) return false; const nr = n.getBoundingClientRect(); const s = getComputedStyle(n); return nr.width > 4 && s.visibility !== 'hidden' && s.display !== 'none' && Number(s.opacity) > 0.2; });
    return { compact: r.classList.contains('rail-compact'), positie: ['left', 'right', 'top', 'bottom'].find((p) => r.classList.contains(`rail-${p}`)) || '', rail: { l: b.left, r: b.right, t: b.top, b: b.bottom, w: b.width, h: b.height }, werk: { l: w.left, r: w.right }, vw: innerWidth, vh: innerHeight, links: links.length, iconen: iconen.filter(Boolean).length, namen: namen.filter(Boolean).length };
  });

  try {
    await pool.query('UPDATE app.feature_flags SET aan = true, standaard = true WHERE sleutel = ANY($1)', [VLAGGEN]);
    const O = await persoon(G as never, 'i15v-eig', T); emails.push(O.email);
    check('підготовка: власниця сайту увійшла, прапорці «Студія» і «Макет» увімкнено', !!O.email);

    // ================================================================ A. шлях людини й вибір вигляду в обліковому записі
    if (STAPPEN.includes('A')) {
      // Вихідна точка: обліковий запис має «Класичний» (щоб перехід до «Макета» був справжнім вибором людини)
      {
        const p = await open(O, `${ID}/personalization?lang=uk`, { width: 1280 });
        const z0 = await zetVormgevingServer(p.page, 'klassiek');
        check('A: підготовка — у записі вигляд «Класичний»', z0.status === 200 && (await serverWeergave(p.page)).vormgeving === 'klassiek', String(z0.status));
        await sluit(p.ctx);
      }
      const a = await open(O, `${HUB}/?lang=uk`, { width: 1280, height: 860 });
      await a.page.locator('.canonical-avatar-trigger').first().click();
      const beheer = a.page.getByRole('button', { name: 'Керування обліковим записом' }).first();
      await beheer.waitFor({ timeout: 8000 });
      await beheer.click();
      await a.page.waitForURL((u) => u.hostname === 'id.tarasevych.com', { timeout: 15000 });
      await a.page.locator('.ia-account [role="radiogroup"], .mr-mq').first().waitFor({ timeout: 20000 }).catch(() => undefined);
      const kiezer = a.page.locator('.ia-account > .ia-vormgeving').first();
      const label = (await kiezer.locator('.ia-vormgeving-label').innerText().catch(() => '')).trim();
      check('A: hub → меню облікового запису → «Керування обліковим записом» відкриває центр облікового запису (id) у класичному вигляді з перемикачем «Вигляд сторінки»',
        new URL(a.page.url()).hostname === 'id.tarasevych.com' && (await welkeVormgeving(a.page)) === 'klassiek' && label === 'Вигляд сторінки', `${a.page.url()} ${label}`);
      const mqKnop = kiezer.locator('[data-vormgeving="maquette"]');
      const tip = (await mqKnop.getAttribute('title')) || '';
      check('A: підказка «Макета» пояснює наслідок (що змінюється й що вибір в обліковому записі на всіх пристроях)', /лише подання/.test(tip) && /обліковому записі/.test(tip) && /всіх ваших пристроях/.test(tip), tip);
      await mqKnop.click();
      await a.page.locator('.mr-mq #group-security .setting-section').first().waitFor({ timeout: 15000 });
      await a.page.waitForTimeout(900);
      const sw = await serverWeergave(a.page);
      check('A: «Вигляд сторінки» → «Макет» — відкрився «Макет», сервер зберіг vormgeving=maquette', (await welkeVormgeving(a.page)) === 'maquette' && sw.vormgeving === 'maquette', String(sw.vormgeving));
      // другий контекст тієї самої особи (інший пристрій: телефон)
      const b = await openMq(O, 'personalization', 'uk', { width: 380, height: 800, touch: true });
      check('A: другий пристрій тієї самої особи відкриває «Макет» (вибір з облікового запису)', (await welkeVormgeving(b.page)) === 'maquette');
      // назад: «Класичний» з «Макета» (блок «Вигляд сторінки» внизу сторінки) — і другий пристрій після F5
      const voet = a.page.locator('.mr-mq [data-echt="vormgeving-voet"] [data-vormgeving="klassiek"]');
      await voet.scrollIntoViewIfNeeded(); await voet.click();
      await a.page.locator('.ia-account').first().waitFor({ timeout: 10000 });
      await a.page.waitForTimeout(900);
      await b.page.reload({ waitUntil: 'networkidle' }); await b.page.waitForTimeout(900);
      check('A: «Класичний» з «Макета» → сервер vormgeving=klassiek, другий пристрій після F5 — класичний вигляд', (await serverWeergave(a.page)).vormgeving === 'klassiek' && (await welkeVormgeving(b.page)) === 'klassiek', await welkeVormgeving(b.page));
      // телефон: повний перемикач «Вигляд сторінки» над заголовком (компактний у смузі розділів на вузькому екрані схований задумано) → «Макет»
      check('A: телефон — повний «Вигляд сторінки» стоїть над заголовком (розділи — у підсмузі меню якорів)', (await b.page.locator('.ia-account .mq-anker-onderbalk').first().isVisible()) && (await b.page.locator('.ia-account > .ia-vormgeving').first().isVisible()));
      await b.page.locator('.ia-account > .ia-vormgeving [data-vormgeving="maquette"]').first().tap();
      await b.page.locator('.mr-mq #group-security .setting-section').first().waitFor({ timeout: 15000 });
      await b.page.waitForTimeout(900);
      check('A: телефон — «Вигляд сторінки» → «Макет» дотиком; сервер vormgeving=maquette', (await welkeVormgeving(b.page)) === 'maquette' && (await serverWeergave(b.page)).vormgeving === 'maquette');
      await sluit(a.ctx, b.ctx);
    } else {
      const a = await open(O, `${ID}/personalization?lang=uk`, { width: 1280 });
      await zetVormgevingServer(a.page, 'maquette');
      await sluit(a.ctx);
    }

    // ================================================================ B. відповідність оформленню v49
    if (STAPPEN.includes('B')) {
      check('B: зразок v49 — оригінальні стилі архіву (контрольна сума 16f17b59… як у ПЕРЕНЕСЕННЯ-ВЕРСІЇ-49.uk.md)', createHash('sha256').update(V49_STIJL).digest('hex') === V49_STIJL_SHA);
      if (bron) {
        const smal = /@media\(max-width:730px\)\{([\s\S]*?)\n\}/.exec(bron)?.[1] || '';
        const r = { radius: /^\.ia-at-v49\{[^}]*--radius:(\d+px)/.exec(bron)?.[1], hero: /\.ia-at-v49 \.hero\{min-height:485px;border-radius:(\d+px)/.exec(bron)?.[1], smalHero: /\.ia-at-v49 \.hero\{min-height:460px;border-radius:(\d+px)/.exec(smal)?.[1], smalSectie: /\.ia-at-v49 \.setting-section\{border-radius:(\d+px)/.exec(smal)?.[1] };
        check(`B: git show 5846625a^:src/identiteit/atelier-v49-bron.css — великі картки ${r.radius}, вступна ${r.hero}; ≤730 px — ${r.smalSectie} / ${r.smalHero} (ті самі значення, що й в оригіналі)`, r.radius === V49_RADIUS.breed.sectie && r.hero === V49_RADIUS.breed.hero && r.smalSectie === V49_RADIUS.smal.sectie && r.smalHero === V49_RADIUS.smal.hero, JSON.stringify(r));
      } else check('B: atelier-v49-bron.css з історії недоступний (неповна історія git) — звірка лише з оригінальними стилями архіву', true);
      for (const [taal, thema, w, h, touch] of [['uk', 'light', 1280, 900, false], ['nl', 'dark', 1280, 900, false], ['uk', 'dark', 380, 800, true], ['nl', 'light', 380, 800, true]] as const) {
        const { ctx, page } = await openMq(O, 'personalization', taal, { width: w, height: h, touch, thema });
        const ind = await indeling(page);
        const verwachtGroepen = GROEPEN.map((g) => ({ g, ids: V49.secties.filter((s) => s.group === g).map((s) => s.id) }));
        check(`B ${taal} ${w} ${thema === 'light' ? 'світла' : 'темна'}: чотири групи v49 у тому самому складі й порядку (${verwachtGroepen.map((g) => g.ids.length).join('+')})`, JSON.stringify(ind.groepen) === JSON.stringify(verwachtGroepen), JSON.stringify(ind.groepen));
        check(`B ${taal} ${w} ${thema === 'light' ? 'світла' : 'темна'}: порядок дванадцяти розділів як у atelier-v49-gegevens.json, номери «01 / 12»…«12 / 12»`, JSON.stringify(ind.alle) === JSON.stringify(ORDE) && V49.secties.every((s) => ind.nummers[s.id] === `${s.number} / 12`), ind.alle.join(','));
        const kopFout = V49.secties.filter((s) => ind.koppen[s.id] !== s[taal].title).map((s) => `${s.id}: «${ind.koppen[s.id]}» ≠ «${s[taal].title}»`);
        check(`B ${taal} ${w} ${thema === 'light' ? 'світла' : 'темна'}: заголовки карток — тексти v49 мовою сторінки`, kopFout.length === 0 && ind.htmlLang === taal && ind.mqLang === taal, kopFout.join(' | '));
        const artFout = V49.secties.filter((s) => {
          const v = artTekst(s.art[taal]), d = ind.art[s.id] || '';
          return taal === 'nl' ? KYRYLYTSIA.test(d) || (v && !v.split(' ').filter((w) => /\p{L}{4,}/u.test(w)).every((w) => d.includes(w))) : (v && !v.split(' ').filter((w) => /\p{L}{4,}/u.test(w)).every((w) => d.includes(w)));
        }).map((s) => `${s.id}: «${ind.art[s.id]}» / v49 «${artTekst(s.art[taal])}»`);
        check(`B ${taal} ${w} ${thema === 'light' ? 'світла' : 'темна'}: написи на ілюстраціях — мовою сторінки (слова з ілюстрацій v49 ${taal}${taal === 'nl' ? ', без кирилиці' : ''})`, artFout.length === 0, artFout.slice(0, 4).join(' | '));
        await sluit(ctx);
      }
      // радіуси й відступи в обох темах, 1280 і телефон 380
      for (const [w, h, touch] of [[1280, 900, false], [380, 800, true]] as const) {
        const per: Record<string, Awaited<ReturnType<typeof maten>>> = {};
        for (const thema of ['light', 'dark'] as const) {
          const { ctx, page } = await openMq(O, 'personalization', 'uk', { width: w, height: h, touch, thema });
          per[thema] = await maten(page);
          await sluit(ctx);
        }
        const v = await v49Maten(per.light.klassen, per.light.breedte);
        check(`B ${w}: радіуси — великі картки ${per.dark.sectie}, вступна ${per.dark.hero}; v49 за тієї самої ширини (${v.w}) — ${v.sectie} / ${v.hero}`, per.dark.sectie === v.sectie && per.dark.hero === v.hero && per.light.sectie === v.sectie && per.light.hero === v.hero, JSON.stringify({ l: [per.light.sectie, per.light.hero], d: [per.dark.sectie, per.dark.hero] }));
        check(`B ${w}: світла й темна тема — ті самі відступи карток (${per.dark.mainPad}) і вступу (${per.dark.heroPad}), як у v49`, per.light.licht && !per.dark.licht && per.light.mainPad === per.dark.mainPad && per.light.heroPad === per.dark.heroPad && per.dark.mainPad === v.mainPad && per.dark.heroPad === v.heroPad, JSON.stringify({ licht: [per.light.mainPad, per.light.heroPad], donker: [per.dark.mainPad, per.dark.heroPad], v49: [v.mainPad, v.heroPad] }));
      }
      // доказ виправлення: системне «зменшити рух» (reducedMotion) зупиняє переходи «Макета», як правило v49 @media(prefers-reduced-motion)
      {
        const { ctx, page } = await openMq(O, 'personalization', 'uk', { width: 1280, height: 900, reducedMotion: true });
        const r = await page.evaluate(() => {
          const lang: string[] = [];
          for (const e of Array.from(document.querySelectorAll('.mr-mq *'))) {
            if (e.closest('.mq-echt')) continue; // справжні панелі сайту мають власні правила руху
            const st = getComputedStyle(e);
            const max = (v: string) => Math.max(...v.split(',').map((x) => parseFloat(x) * (x.trim().endsWith('ms') ? 1 : 1000)));
            const tr = max(st.transitionDuration), an = st.animationName !== 'none' ? max(st.animationDuration) : 0;
            if (tr > 10 || an > 10) lang.push(`${e.tagName.toLowerCase()}.${String((e as HTMLElement).className).split(' ')[0]}:${tr}/${an}`);
          }
          return { aantal: lang.length, lang: lang.slice(0, 6), zichtbaar: Array.from(document.querySelectorAll<HTMLElement>('.mr-mq .setting-section')).every((x) => getComputedStyle(x).opacity === '1') };
        });
        check('B: системне «зменшити рух» (reducedMotion) — у «Макеті» жодного переходу чи анімації довших за 10 мс, картки видно одразу (як у v49)', r.aantal === 0 && r.zichtbaar, JSON.stringify(r));
        await sluit(ctx);
      }
      // меню: три режими × чотири положення, піктограми в згорнутому й розгорнутому
      {
        // вікно «Налаштування навігації» на 1280×900: уміщається в екран, нижні кнопки досяжні (прокрутка всередині вікна)
        {
          const k = await openMq(O, 'menu', 'uk', { width: 1280, height: 900 });
          await navInstellingen(k.page);
          const r = await k.page.evaluate(() => {
            const p = document.querySelector('.mr-mq #navSettings') as HTMLElement, pr = p.getBoundingClientRect();
            const knoppen = Array.from(p.querySelectorAll<HTMLElement>('button')).filter((b) => b.getBoundingClientRect().width > 0);
            const onbereikbaar = knoppen.filter((b) => { b.scrollIntoView({ block: 'nearest', behavior: 'instant' as ScrollBehavior }); const r = b.getBoundingClientRect(); const raak = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return !(raak && (raak === b || b.contains(raak))); }).map((b) => (b.textContent || b.getAttribute('aria-label') || '').trim().slice(0, 30));
            return { boven: Math.round(pr.top), onder: Math.round(pr.bottom), vh: innerHeight, knoppen: knoppen.length, onbereikbaar };
          });
          check(`B: вікно «Налаштування навігації» (1280×900) уміщається в екран (${r.boven}–${r.onder} з ${r.vh}), усі ${r.knoppen} кнопок досяжні, зокрема «Налаштування меню сайту» й «Вигляд сторінки»`, r.onder <= r.vh && r.boven >= 0 && r.onbereikbaar.length === 0 && r.knoppen >= 12, JSON.stringify(r));
          await sluit(k.ctx);
        }
        // режими й положення — на 1440: на вужчому екрані з розгорнутим меню сайту сторінка переходить у висувне меню (постійні режими
        // там свідомо недоступні, вікно пояснює це)
        const { ctx, page } = await openMq(O, 'menu', 'uk', { width: 1440, height: 900 });
        const fout: string[] = [];
        const zijbalk = async () => ((await api(page, '/api/owner/ui/sidebar', {})).data || {}) as Record<string, any>;
        const posSite: Record<string, string> = { left: 'links', right: 'rechts', top: 'boven', bottom: 'onder' };
        const modusSite: Record<string, string> = { expanded: 'open', collapsed: 'dicht', auto: 'auto' };
        for (const pos of ['left', 'right', 'top', 'bottom'] as const) {
          await navInstellingen(page);
          const dp = await druk(page, `.mr-mq #dockPicker [data-pos="${pos}"]`);
          if (dp) { fout.push(dp); continue; }
          await page.waitForTimeout(500);
          for (const modus of ['expanded', 'collapsed', 'auto'] as const) {
            await navInstellingen(page);
            const mk = page.locator(`.mr-mq [data-rail-mode="${modus}"]`);
            const mf = (await mk.isVisible()) ? await druk(page, `.mr-mq [data-rail-mode="${modus}"]`) : 'onzichtbaar';
            if (mf && mf !== 'onzichtbaar') { fout.push(mf); await page.keyboard.press('Escape'); continue; }
            if (mf) { fout.push(`${pos}/${modus}: кнопки режиму не видно — ${JSON.stringify(await page.evaluate(() => ({ kl: document.querySelector('.mr-mq')!.className.replace(/bp-\S+/g, ''), b: document.querySelector('.mr-mq')!.clientWidth, uitleg: document.querySelector('.mr-mq #adaptiveModeDescription')?.textContent })))}`); await page.keyboard.press('Escape'); continue; }
            await page.mouse.move(720, 450); // вказівник посередині сторінки, не над меню
            await page.keyboard.press('Escape');
            await page.waitForTimeout(700);
            const s = await railStand(page);
            // край робочої області «Макета» (поруч може стояти справжнє меню сайту)
            const randOk = pos === 'left' ? s.rail.l - s.werk.l < 120 && s.rail.h > 200 : pos === 'right' ? s.werk.r - s.rail.r < 120 && s.rail.h > 200 : pos === 'top' ? s.rail.t < s.vh / 3 && s.rail.w > s.rail.h * 3 : s.rail.b > s.vh - 140 && s.rail.w > s.rail.h * 3;
            const verticaal = pos === 'left' || pos === 'right';
            const verwachtCompact = modus !== 'expanded';
            const naamOk = !verticaal ? true : verwachtCompact ? s.namen === 0 : s.namen === s.links;
            if (s.positie !== pos || !randOk || (verticaal && s.compact !== verwachtCompact) || s.links < 5 || s.iconen !== s.links || !naamOk) fout.push(`${pos}/${modus}: ${JSON.stringify(s)}`);
            if (verticaal && modus === 'auto') {
              // автоматично: наведення на меню розгортає, відведення — згортає
              await page.mouse.move(pos === 'left' ? s.rail.l + 20 : s.rail.r - 20, s.rail.t + s.rail.h / 2);
              await page.waitForTimeout(700);
              const hover = await railStand(page);
              await page.mouse.move(720, 450); await page.waitForTimeout(900);
              const weg = await railStand(page);
              if (hover.compact || hover.namen !== hover.links || !weg.compact) fout.push(`${pos}/auto наведення: ${hover.compact}/${hover.namen}/${hover.links} → ${weg.compact}`);
            }
            const zb = await zijbalk();
            const zm = zb.sidebar?.modus ?? zb.voorkeuren?.modus ?? zb.modus, zp = zb.sidebar?.dock?.positie ?? zb.voorkeuren?.dock?.positie ?? zb.dock?.positie;
            if ((zm !== undefined && zm !== modusSite[modus]) || (zp !== undefined && zp !== posSite[pos])) fout.push(`${pos}/${modus}: сервер ${zm}/${zp}`);
          }
        }
        check('B: меню — 3 режими (завжди розгорнуте / завжди згорнуте / автоматично) × 4 положення (ліворуч / праворуч / зверху / знизу): місце на екрані, згортання, піктограми в кожному пункті (і назви лише в розгорнутому)', fout.length === 0, fout.slice(0, 4).join(' | '));
        const zb = await zijbalk();
        // вікно навігації з клавіатури: Esc і «×» закривають, фокус повертається на кнопку ⚙, що його відкрила
        await page.mouse.move(760, 450); await page.waitForTimeout(400);
        const cfg = page.locator('.mr-mq #railConfig');
        await cfg.focus(); await page.keyboard.press('Enter');
        await page.locator('.mr-mq #navSettings').waitFor({ state: 'visible', timeout: 5000 });
        await page.keyboard.press('Escape'); await page.waitForTimeout(400);
        const naEsc = await page.evaluate(() => document.activeElement?.id || document.activeElement?.tagName || '');
        await cfg.focus(); await page.keyboard.press('Enter');
        await page.locator('.mr-mq #closeNavSettings').waitFor({ state: 'visible', timeout: 5000 });
        await page.keyboard.press('Tab'); await page.keyboard.press('Shift+Tab'); // фокус усередині вікна
        await page.locator('.mr-mq #closeNavSettings').focus(); await page.keyboard.press('Enter'); await page.waitForTimeout(400);
        const naKruis = await page.evaluate(() => document.activeElement?.id || document.activeElement?.tagName || '');
        await cfg.focus(); await page.keyboard.press('Enter');
        await page.locator('.mr-mq #dockPicker [data-pos="left"]').focus(); await page.keyboard.press('Enter'); await page.waitForTimeout(500);
        const naPositie = await page.evaluate(() => document.activeElement?.id || document.activeElement?.tagName || '');
        check('B: вікно «Налаштування навігації» з клавіатури — Esc, «×» і вибір положення закривають його, фокус повертається на кнопку ⚙', naEsc === 'railConfig' && naKruis === 'railConfig' && naPositie === 'railConfig' && !(await page.locator('.mr-mq #navSettings').isVisible()), `${naEsc} / ${naKruis} / ${naPositie}`);
        check('B: режим і положення меню збережено як налаштування меню сайту (open/dicht/auto, links/rechts/boven/onder)', JSON.stringify(zb).includes('"onder"') && JSON.stringify(zb).includes('"auto"'), JSON.stringify(zb).slice(0, 300));
        // повернути типові: ліворуч, завжди розгорнуте
        await navInstellingen(page); await page.locator('.mr-mq #dockPicker [data-pos="left"]').click(); await page.waitForTimeout(300);
        await navInstellingen(page); await page.locator('.mr-mq [data-rail-mode="expanded"]').click(); await page.keyboard.press('Escape'); await page.waitForTimeout(600);
        // пошук розділу: кнопка «Пошук» → «Безпека» → перехід до картки й адреса /security; Esc повертає фокус
        await page.locator('.mr-mq #openSearch').click();
        const veld = page.locator('[data-zoek-palet="open"] input').first();
        await veld.waitFor({ timeout: 5000 });
        await veld.fill('Безпека');
        const rij = page.locator('[data-zoek-palet="open"] [role="option"]', { hasText: 'Безпека' }).first();
        await rij.waitFor({ timeout: 5000 });
        await rij.click();
        await page.waitForTimeout(1500);
        const zicht = await page.evaluate(() => { const s = document.querySelector('.mr-mq #security')!.getBoundingClientRect(); return s.top < innerHeight * 0.5 && s.bottom > 0; });
        const actief = await page.locator('.mr-mq #railItems .anchor-link[data-jump="security"]').getAttribute('aria-current');
        check('B: пошук розділу — «Безпека» знайдено, вибір веде до картки «Безпека» (у полі зору), адреса /beveiliging (канонічний slug, як у меню), пункт меню позначено aria-current', new URL(page.url()).pathname === (await padVan(page, 'security')) && zicht && actief === 'location', `${page.url()} ${zicht} ${actief}`);
        await page.locator('.mr-mq #openSearch').click();
        await veld.waitFor({ timeout: 5000 });
        await page.keyboard.press('Escape'); await page.waitForTimeout(400);
        check('B: пошук — Esc закриває вікно, фокус повертається на кнопку пошуку', (await page.locator('[data-zoek-palet="open"]').count()) === 0 && (await page.evaluate(() => document.activeElement?.id)) === 'openSearch');
        // смуга розділів (рядки відомості personalization.переходи.*): кожен пункт — картка у полі зору, канонічна адреса, пункт позначено
        const smugaFout: string[] = [];
        for (const id of ['menu', 'themes', 'languages', 'widgets', 'sharing', 'identities']) {
          const groep = V49.secties.find((x) => x.id === id)!.group;
          const link = page.locator(`.mr-mq #railItems .anchor-link[data-jump="${id}"]`);
          if (!(await link.isVisible())) await page.locator(`.mr-mq #railItems .nav-group-toggle[data-nav-group-toggle="${groep}"]`).click();
          await link.click(); await page.waitForTimeout(1300);
          const inBeeld = await page.evaluate((x) => { const r = document.querySelector(`.mr-mq #${x}`)!.getBoundingClientRect(); return r.top < innerHeight * 0.5 && r.bottom > 0; }, id);
          const pad = new URL(page.url()).pathname, verwachtPad = await padVan(page, id === 'identities' ? 'identity' : id), huidig = await link.getAttribute('aria-current');
          if (!inBeeld || pad !== verwachtPad || huidig !== 'location') smugaFout.push(`${id}: ${pad}≠${verwachtPad} inBeeld=${inBeeld} aria-current=${huidig}`);
        }
        check('B: смуга розділів — «Меню», «Теми», «Мови», «Віджети», «Спільний доступ», «Ідентичності»: картка в полі зору, канонічна адреса (/menu, /themas, /talen, /blokken, /delen, /identiteit), пункт позначено aria-current', smugaFout.length === 0, smugaFout.join(' | '));
        // перегляд вигляду на сторінці: «Кольорові піктограми» на картці «Персоналізація» змінюють сторінку одразу, «Класичні» — повертають
        await page.locator('.mr-mq #railItems .anchor-link[data-jump="personalization"]').click(); await page.waitForTimeout(900);
        const keuze = page.locator('.mr-mq #personalization [data-choice-group="personalization-0"]');
        const kleur = keuze.nth(1);
        await kleur.scrollIntoViewIfNeeded();
        const iconVoor = await page.evaluate(() => getComputedStyle(document.querySelector('.mr-mq #railItems .anchor-icon')!).color + '|' + getComputedStyle(document.querySelector('.mr-mq #railItems .anchor-icon')!).backgroundColor);
        await kleur.click(); await page.waitForTimeout(700);
        const na = await page.evaluate(() => ({ klasse: document.querySelector('.mr-mq')!.classList.contains('demo-colorful-icons'), icon: getComputedStyle(document.querySelector('.mr-mq #railItems .anchor-icon')!).color + '|' + getComputedStyle(document.querySelector('.mr-mq #railItems .anchor-icon')!).backgroundColor }));
        await page.waitForTimeout(600);
        const zb2 = await zijbalk();
        check('B: перегляд вигляду на сторінці — «Кольорові піктограми» одразу змінюють піктограми меню сторінки й зберігаються як стиль піктограм меню сайту', na.klasse && na.icon !== iconVoor && JSON.stringify(zb2).includes('"icoonStijl":"kleur"'), `${iconVoor} → ${na.icon} ${JSON.stringify(zb2).slice(0, 200)}`);
        await keuze.nth(0).click(); await page.waitForTimeout(700);
        check('B: «Класичні» повертають попередній вигляд піктограм', !(await page.evaluate(() => document.querySelector('.mr-mq')!.classList.contains('demo-colorful-icons'))));
        await sluit(ctx);
      }
    }

  } catch (e) {
    check('неочікувана помилка', false, String((e as Error)?.stack || e).slice(0, 1500));
  } finally {
    await browser.close().catch(() => undefined);
    for (const v of vlagWas) await pool.query('UPDATE app.feature_flags SET aan = $2, standaard = $3 WHERE sleutel = $1', [v.sleutel, v.aan, v.standaard]).catch(() => undefined);
    const ids = (await pool.query("select id from app.records where tbl='users' and data->>'email' = any($1)", [emails]).catch(() => ({ rows: [] as Array<{ id: string }> }))).rows.map((x: { id: string }) => x.id);
    if (ids.length) {
      await pool.query("delete from app.records where tbl='site_notifications' and data->>'recipientUserId' = any($1)", [ids]).catch(() => undefined);
      await pool.query("delete from app.records where id = any($1) or data->>'accountId' = any($1) or data->>'recipientUserId' = any($1) or data->>'userId' = any($1) or data->>'ownerUserId' = any($1)", [ids]).catch((e: unknown) => console.error('[e2e] opruimen', e));
    }
    await stop();
  }
  check('без помилок у консолі й HTTP', fouten.length === 0, fouten.slice(0, 8).join(' | '));
  return einde();
}
