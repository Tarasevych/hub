// IDENTITEIT-015 (приймання, група «thema»): справжній Chromium, вигадані особи (власниця сайту — їй дозволено фіолетову палітру;
// звичайний схвалений обліковий запис — без права, потім із правом plum-theme). Кожен «пристрій» — окремий контекст; «повторний вхід» —
// новий вхід тим самим обліковим записом (нові cookie, порожнє сховище).
//  A. Палітри kleur / grifel / puur у світлому й темному: обчислені кольори сторінки, меню, кнопок форми, повідомлення (спливне
//     сповіщення) і контраст тексту; очікування — з src/thema/paletten.ts і src/ontwerp/tokens.css. Після F5, нового пристрою й
//     повторного входу вибір той самий, сервер (POST /api/owner/ui/weergave) зберігає саме його.
//  B. Фіолетова палітра лише з правом: власниця бачить і застосовує; звичайний обліковий запис — ні картки, ні застосування (сервер
//     відкидає palet=violet); видали право plum-theme — з'явилася; забрали — сторінка повертається до «Грифельного».
//  C. Автоматична тема з page.clock і timezoneId; очікування обчислено через zonTijden (src/thema/kern.ts): мить сутінок ±1 хв у
//     Брюсселі та Києві (перемикання без перезавантаження), розклад через північ 22:00–06:00, сезонна зміна часу (29.03 і 25.10.2026 —
//     перемикання о 06:00 місцевого часу, а не на годину раніше/пізніше), полярний день і полярна ніч (Шпіцберген, місце з браузера).
//  D. «Призупинити до наступного перемикання»: стан на сервері й на другому пристрої, кінець паузи в мить перемикання, «Повернути
//     автоперемикання»; ручний вибір «Світлий»/«Темний» вимикає авто (і після мить перемикання тема не змінюється).
//  E. «Макет» (прапорці вигляду ввімкнено на час перевірки): акцент, виразність ефектів, щільність, менше руху змінено елементами
//     самого «Макета» на телефоні — після нового входу на комп'ютері (другий пристрій) усе те саме: <html>, обчислені змінні, ілюстрації.
// Знімки 015-thema-*.png (телефон 380×800 і комп'ютер 1280), знеособлені (verberg). Лише вигадані адреси @example.test.
// Acceptatie van de themagroep: paletten (licht/donker, berekende kleuren), violet alleen met recht, automatisch wisselen met een
// nagebootste klok (schemering, middernacht, zomertijd, poolgebied), pauze, handmatige keuze en de ontwerpinstellingen per account.
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import type { Browser, BrowserContext, Page } from 'playwright-core';
import { checker } from '../eenheid/hulp/nep-google';
import { getPool } from '../../server/platform/pg';
import { startE2eServer, chromeArgs } from './server';
import { ID, api, apparaat, horizontaal, openBlok, persoon, sluit, verberg, volgFouten, type Persoon } from './hulp/sessie-015';
import { kleurWaarden, PUUR, contrast } from '../../src/thema/paletten';
import { zonTijden } from '../../src/thema/kern';
import { ACCENT_TONEN } from '../../src/thema/weergave-stijl';

const PW = process.env.PLAYWRIGHT_CORE || '/workspace/e2e-tools/node_modules/playwright-core';
const TLS = process.env.E2E_TLS || '/workspace/e2e-tools/tls';
const UIT = process.env.E2E_SCREENSHOTS || '/workspace/audit-20261008';
const POORT = Number(process.env.E2E_POORT || 8443);
const CHROME = process.env.CHROME || '/usr/bin/google-chrome';
// Alleen voor het ontwikkelen: E2E_STAP=A,C draait alleen die delen.
const STAPPEN = (process.env.E2E_STAP || 'A,B,C,D,E').split(',');
const VERWACHT = [/\/api\/owner\/agents\/activity$/, /mail\.tarasevych\.com\/api\/owner\/mail\/(bootstrap|accounts\/list)$/];
const VLAGGEN = ['identiteit-account-atelier', 'identiteit-account-maquette'];

// Очікувані кольори: kleur (розділ «Налаштування» = identity) і puur — з paletten.ts; grifel і violet — з src/ontwerp/tokens.css.
type Kleuren = { bg: string; panel: string; text: string; accent: string };
const VERWACHTE: Record<'kleur' | 'grifel' | 'puur' | 'violet', { licht: Kleuren; donker: Kleuren }> = {
  kleur: { licht: kleurWaarden('identity').licht, donker: kleurWaarden('identity').donker },
  puur: { licht: PUUR.licht, donker: PUUR.donker },
  grifel: { licht: { bg: '#f7f8fa', panel: '#ffffff', text: '#17212b', accent: '#2f6f73' }, donker: { bg: '#14181d', panel: '#20262d', text: '#f3f6f8', accent: '#8dbab7' } },
  violet: { licht: { bg: '#f8f3f8', panel: '#fffafd', text: '#35243a', accent: '#6f355f' }, donker: { bg: '#21161f', panel: '#2d1e2a', text: '#faedf6', accent: '#d8a4c7' } },
};

/** rgb()/rgba()/color(srgb …) → [r,g,b,a] (0–255, a 0–1). */
function kleurVan(s: string): [number, number, number, number] {
  let m = /^rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?\)$/.exec(s.trim());
  if (m) return [Number(m[1]), Number(m[2]), Number(m[3]), m[4] === undefined ? 1 : Number(m[4])];
  m = /^color\(srgb ([\d.]+) ([\d.]+) ([\d.]+)(?: \/ ([\d.]+))?\)$/.exec(s.trim());
  if (m) return [Number(m[1]) * 255, Number(m[2]) * 255, Number(m[3]) * 255, m[4] === undefined ? 1 : Number(m[4])];
  if (/^#[0-9a-f]{6}$/i.test(s.trim())) { const v = s.trim().slice(1); return [parseInt(v.slice(0, 2), 16), parseInt(v.slice(2, 4), 16), parseInt(v.slice(4, 6), 16), 1]; }
  return [NaN, NaN, NaN, NaN];
}
const hexVan = (c: number[]) => `#${c.slice(0, 3).map((x) => Math.round(x).toString(16).padStart(2, '0')).join('')}`;
/** Напівпрозорий колір поверх тла. */
const over = (voor: string, tegen: string) => { const a = kleurVan(voor), b = kleurVan(tegen); return hexVan([0, 1, 2].map((i) => a[i] * a[3] + b[i] * (1 - a[3]))); };
const gelijk = (computed: string, hex: string) => { const a = kleurVan(computed), b = kleurVan(hex); return [0, 1, 2].every((i) => Math.abs(a[i] - b[i]) <= 1); };
const lum = (s: string) => { const [r, g, b] = kleurVan(s); return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255; };

/** Обчислене через process.env.TZ (зонТijden рахує місцеву календарну добу, як браузер із timezoneId). */
function metTz<T>(tz: string, f: () => T): T { const was = process.env.TZ; process.env.TZ = tz; try { return f(); } finally { if (was === undefined) delete process.env.TZ; else process.env.TZ = was; } }
const uurMin = (t: number, tz: string) => new Date(t).toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit', timeZone: tz });

export async function main(): Promise<number> {
  const { check, einde } = checker('e2e identiteit-015 thema');
  const { chromium } = createRequire(import.meta.url)(PW) as typeof import('playwright-core');
  const T = `${Date.now()}-${randomBytes(2).toString('hex')}`;
  const eigenaarEmail = `e2e-i15t-eig-${T}@example.test`;
  const { G, stop } = await startE2eServer({ ownerEmail: eigenaarEmail, poort: POORT, tls: TLS });
  const pool = getPool();
  mkdirSync(UIT, { recursive: true });
  const browser: Browser = await chromium.launch({ executablePath: CHROME, headless: true, args: chromeArgs(POORT) });
  const fouten: string[] = [];
  const emails: string[] = [];
  const vlagWas = (await pool.query('SELECT sleutel, aan, standaard FROM app.feature_flags WHERE sleutel = ANY($1)', [VLAGGEN])).rows as Array<{ sleutel: string; aan: boolean; standaard: boolean }>;
  const foto = async (page: Page, naam: string, vol = false) => { await verberg(page); await page.screenshot({ path: `${UIT}/015-thema-${naam}.png`, fullPage: vol }); };
  const idVanEmail = async (email: string) => String((await pool.query("select id from app.records where tbl='users' and data->>'email'=$1 order by seq desc limit 1", [email])).rows[0]?.id || '');
  type Pagina = { ctx: BrowserContext; page: Page };
  const open = async (o: Persoon, url: string, extra: Parameters<typeof apparaat>[2] = {}, voor?: (p: Page, c: BrowserContext) => Promise<void>): Promise<Pagina> => {
    const a = await apparaat(browser, o, { taal: 'uk', ...extra });
    volgFouten(a.page, fouten, VERWACHT);
    if (voor) await voor(a.page, a.ctx);
    await a.page.goto(url, { waitUntil: 'networkidle' });
    await a.page.locator('.canonical-chrome').waitFor({ state: 'attached', timeout: 20000 });
    await a.page.waitForTimeout(700);
    return a;
  };
  /** Повторний вхід тим самим обліковим записом: новий підроблений Google-вхід, нові cookie, нова вкладка. */
  const opnieuwAanmelden = async (p: Persoon): Promise<Persoon> => {
    const b = (G as unknown as { browser: () => Persoon['b'] }).browser(); const tab = randomBytes(24).toString('hex');
    await b.aanmelden(p.sub, p.email, { service: 'identity', tabContext: tab, intent: 'login' });
    return { ...p, b, tab };
  };
  const instellingen = async (page: Page) => { await openBlok(page, '[data-thema-instellingen]'); await page.waitForTimeout(300); };
  const htmlKlasse = (page: Page) => page.evaluate(() => document.documentElement.className);
  const donker = async (page: Page) => /theme-(plum-)?dark/.test(await htmlKlasse(page));
  const status = (page: Page) => page.locator('[data-thema-status]').innerText().catch(() => '');
  const serverWeergave = async (page: Page) => ((await api(page, '/api/owner/ui/weergave', { ruimte: 'gebruiker' })).data?.weergave || {}) as Record<string, any>;
  /** Обчислені кольори: сторінка, меню, кнопки форми, акцент. */
  const meet = (page: Page) => page.evaluate(() => {
    const cs = (s: string) => { const e = document.querySelector(s); return e ? getComputedStyle(e) : null; };
    const chrome = cs('.canonical-chrome')!, menu = cs('.canonical-sidebar'), knop = cs('[data-thema-modus="device"]'), actief = cs('.thema-modi button.active');
    const menuKnop = cs('.canonical-sidebar .canonical-local-page-button.active') || cs('.canonical-sidebar [aria-current="page"]');
    return {
      html: document.documentElement.className, pagina: chrome.backgroundColor, tekst: chrome.color, accent: chrome.getPropertyValue('--accent').trim(),
      menuTekst: menu?.color || '', menuKnopTekst: menuKnop?.color || '', knopBg: knop?.backgroundColor || '', knopTekst: knop?.color || '', actiefRand: actief?.borderTopColor || '',
    };
  });
  /** Спливне сповіщення (повідомлення) з поточними кольорами. */
  const melding = async (page: Page, tekst: string) => {
    await page.evaluate((t) => window.dispatchEvent(new CustomEvent('tsv:canonical-notice', { detail: { text: t, kind: 'info', source: 'identity' } })), tekst);
    const t = page.locator('.canonical-notification-toast', { hasText: tekst }).first();
    await t.waitFor({ timeout: 5000 }).catch(() => undefined);
    await page.waitForTimeout(400);
    const r = await t.evaluate((e) => { const c = getComputedStyle(e); return { bg: c.backgroundColor, tekst: c.color }; }).catch(() => ({ bg: '', tekst: '' }));
    return r;
  };
  const sluitMeldingen = (page: Page) => page.evaluate(() => document.querySelectorAll('.canonical-notification-toast button[aria-label]').forEach((b) => { if (/Закрити|Sluiten/.test(b.getAttribute('aria-label') || '')) (b as HTMLButtonElement).click(); })).catch(() => undefined);
  try {
    // ---------------------------------------------------------------- особи
    const O = await persoon(G as never, 'i15t-eig', T); emails.push(O.email);
    const B = await persoon(G as never, 'i15t-ander', T); emails.push(B.email);
    const oId = await idVanEmail(O.email), bId = await idVanEmail(B.email);
    await pool.query(`update app.records set data = data || $2::jsonb where tbl='users' and id=$1`, [bId, JSON.stringify({ status: 'approved', name: 'Інший Проба' })]);
    check('підготовка: власниця й другий схвалений обліковий запис є', !!oId && !!bId && oId !== bId);

    // ================================================================ A. палітри kleur / grifel / puur
    if (STAPPEN.includes('A')) {
      const { ctx, page } = await open(O, `${ID}/themes?lang=uk`, { width: 1280, height: 900 });
      await instellingen(page);
      check('A: типово «Кольоровий» + «Як на пристрої» (світлий пристрій → світла)', (await page.locator('[data-thema-palet="kleur"]').getAttribute('aria-checked')) === 'true' && (await page.locator('[data-thema-modus="device"]').getAttribute('aria-checked')) === 'true' && !(await donker(page)));
      const fouteKleuren: string[] = [];
      for (const palet of ['kleur', 'grifel', 'puur'] as const) {
        for (const modus of ['light', 'dark'] as const) {
          await page.locator(`[data-thema-palet="${palet}"]`).click();
          await page.locator(`[data-thema-modus="${modus}"]`).click();
          await page.waitForTimeout(900); // переходи кольорів (до .45 с) мають завершитися
          const v = VERWACHTE[palet][modus === 'dark' ? 'donker' : 'licht'];
          const m = await meet(page);
          const t = await melding(page, `Проба ${palet} ${modus}`);
          const naam = `${palet}/${modus}`;
          const toastBg = t.bg ? over(t.bg, m.pagina) : '';
          const fout = [
            !new RegExp(`palet-${palet}`).test(m.html) && `клас ${m.html}`,
            !new RegExp(`theme-${modus}`).test(m.html) && `режим ${m.html}`,
            !gelijk(m.pagina, v.bg) && `сторінка ${m.pagina}≠${v.bg}`,
            !gelijk(m.tekst, v.text) && `текст ${m.tekst}≠${v.text}`,
            m.accent.toLowerCase() !== v.accent.toLowerCase() && `акцент ${m.accent}≠${v.accent}`,
            !gelijk(m.menuTekst, v.text) && `меню ${m.menuTekst}`,
            (!m.menuKnopTekst || contrast(hexVan(kleurVan(m.menuKnopTekst)), v.bg) < 4.5) && `активний пункт меню ${m.menuKnopTekst}`,
            !gelijk(m.knopBg, v.panel) && `кнопка форми тло ${m.knopBg}≠${v.panel}`,
            (!m.knopTekst || contrast(hexVan(kleurVan(m.knopTekst)), hexVan(kleurVan(m.knopBg))) < 4.5) && `кнопка форми контраст`,
            !gelijk(m.actiefRand, v.accent) && `рамка вибраної кнопки ${m.actiefRand}≠${v.accent}`,
            (!t.bg || (modus === 'dark') !== (lum(toastBg) < 0.4) || contrast(hexVan(kleurVan(t.tekst)), toastBg) < 4.5) && `повідомлення ${t.bg}/${t.tekst}`,
          ].filter(Boolean);
          if (fout.length) fouteKleuren.push(`${naam}: ${fout.join('; ')}`);
          await sluitMeldingen(page);
          if (modus === 'dark' || palet === 'kleur') { await page.locator('#thema-kleur-kop').evaluate((e) => e.scrollIntoView({ block: 'center' })); await page.waitForTimeout(300); await foto(page, `palet-${palet}-${modus}-computer`); }
        }
      }
      check('A: 3 палітри × світла/темна — обчислені кольори сторінки, меню, кнопок форми, акценту й повідомлення як у палітрі, контраст ≥ 4,5:1', fouteKleuren.length === 0, fouteKleuren.join(' | '));
      // остаточний вибір: «Чистий» + «Темний»
      await page.locator('[data-thema-palet="puur"]').click(); await page.locator('[data-thema-modus="dark"]').click(); await page.waitForTimeout(900);
      const sw = await serverWeergave(page);
      check('A: сервер зберіг вибір в обліковому записі (palet=puur, modus=dark)', sw.palet === 'puur' && sw.modus === 'dark', JSON.stringify({ palet: sw.palet, modus: sw.modus }));
      await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(600);
      check('A: після F5 — «Чистий» + «Темний» (тло сторінки чисто чорне)', /palet-puur/.test(await htmlKlasse(page)) && gelijk((await meet(page)).pagina, '#000000'));
      await sluit(ctx);
      // повторний вхід (нові cookie, порожнє сховище) — інший пристрій: телефон 380
      const O2 = await opnieuwAanmelden(O);
      const t = await open(O2, `${ID}/themes?lang=uk`, { width: 380, height: 800, touch: true });
      await instellingen(t.page);
      const mt = await meet(t.page);
      check('A: після повторного входу (телефон, нове сховище) — той самий вибір «Чистий» + «Темний» і кольори', /palet-puur/.test(mt.html) && /theme-dark/.test(mt.html) && gelijk(mt.pagina, '#000000') && (await t.page.locator('[data-thema-palet="puur"]').getAttribute('aria-checked')) === 'true' && (await t.page.locator('[data-thema-modus="dark"]').getAttribute('aria-checked')) === 'true', mt.html);
      check('A: телефон 380 — без горизонтальної прокрутки', (await horizontaal(t.page)) <= 0, String(await horizontaal(t.page)));
      await t.page.locator('[data-thema-palet="puur"]').scrollIntoViewIfNeeded();
      await foto(t.page, 'palet-puur-dark-telefoon');
      // «Кольоровий» + «Світлий» на телефоні, щоб наступні частини починали з типового кольору
      await t.page.locator('[data-thema-palet="kleur"]').tap(); await t.page.locator('[data-thema-modus="light"]').tap(); await t.page.waitForTimeout(900);
      await foto(t.page, 'palet-kleur-light-telefoon');
      await sluit(t.ctx);
    }

    // ================================================================ B. фіолетова палітра лише з правом
    if (STAPPEN.includes('B')) {
      // власниця сайту
      {
        const { ctx, page } = await open(O, `${ID}/themes?lang=uk`, { width: 1280, height: 900 });
        await instellingen(page);
        check('B: власниця бачить картку «Фіолетовий»', (await page.locator('[data-thema-palet="violet"]').count()) === 1);
        const fout: string[] = [];
        for (const modus of ['light', 'dark'] as const) {
          await page.locator('[data-thema-palet="violet"]').click(); await page.locator(`[data-thema-modus="${modus}"]`).click(); await page.waitForTimeout(900);
          const v = VERWACHTE.violet[modus === 'dark' ? 'donker' : 'licht'], m = await meet(page);
          if (!/palet-violet/.test(m.html) || !new RegExp(`theme-plum-${modus}`).test(m.html) || !gelijk(m.pagina, v.bg) || !gelijk(m.tekst, v.text) || m.accent.toLowerCase() !== v.accent || !gelijk(m.knopBg, v.panel)) fout.push(`${modus}: ${JSON.stringify(m)}`);
          await foto(page, `palet-violet-${modus}-computer`);
        }
        check('B: власниця — «Фіолетовий» світлий і темний застосовано (обчислені кольори з tokens.css)', fout.length === 0, fout.join(' | '));
        const sw = await serverWeergave(page);
        check('B: власниця — сервер зберіг palet=violet', sw.palet === 'violet', String(sw.palet));
        await page.locator('[data-thema-palet="kleur"]').click(); await page.locator('[data-thema-modus="light"]').click(); await page.waitForTimeout(700);
        await sluit(ctx);
      }
      // звичайний обліковий запис без права
      {
        const { ctx, page } = await open(B, `${ID}/themes?lang=uk`, { width: 380, height: 800, touch: true });
        await instellingen(page);
        check('B: без права — картки «Фіолетовий» немає, є пояснення', (await page.locator('[data-thema-palet="violet"]').count()) === 0 && /Фіолетова тема не дозволена/.test(await page.locator('[data-thema-instellingen]').innerText()));
        await page.getByText('Фіолетова тема не дозволена').scrollIntoViewIfNeeded();
        await foto(page, 'violet-zonder-recht-telefoon');
        const r = await api(page, '/api/owner/ui/weergave/save', { ruimte: 'gebruiker', weergave: { versie: 1, palet: 'violet', modus: 'dark' } });
        const sw = await serverWeergave(page);
        check('B: без права — сервер не зберігає palet=violet (решту вибору зберігає)', r.status === 200 && sw.palet !== 'violet' && sw.modus === 'dark', JSON.stringify({ s: r.status, palet: sw.palet, modus: sw.modus, geweigerd: r.data?.paletGeweigerd }));
        await sluit(ctx);
      }
      // право plum-theme видано
      await pool.query(`update app.records set data = data || '{"entitlements":["plum-theme"]}'::jsonb where tbl='users' and id=$1`, [bId]);
      {
        const { ctx, page } = await open(B, `${ID}/themes?lang=uk`, { width: 1280, height: 900 });
        await instellingen(page);
        const zichtbaar = (await page.locator('[data-thema-palet="violet"]').count()) === 1;
        if (zichtbaar) { await page.locator('[data-thema-palet="violet"]').click(); await page.waitForTimeout(900); }
        const m = await meet(page), sw = await serverWeergave(page);
        check('B: з правом plum-theme — картка є, «Фіолетовий» темний застосовано й збережено', zichtbaar && /palet-violet/.test(m.html) && gelijk(m.pagina, VERWACHTE.violet.donker.bg) && sw.palet === 'violet', `${m.html} ${sw.palet}`);
        await sluit(ctx);
      }
      // право забрано: збережене violet не застосовується — «Грифельний»
      await pool.query(`update app.records set data = data || '{"entitlements":[]}'::jsonb where tbl='users' and id=$1`, [bId]);
      {
        const { ctx, page } = await open(B, `${ID}/themes?lang=uk`, { width: 1280, height: 900 });
        await instellingen(page);
        const m = await meet(page);
        check('B: право забрано — картки немає, сторінка «Грифельна» темна (збережене violet не діє)', (await page.locator('[data-thema-palet="violet"]').count()) === 0 && /palet-grifel/.test(m.html) && gelijk(m.pagina, VERWACHTE.grifel.donker.bg), m.html);
        await foto(page, 'violet-recht-ingetrokken-computer');
        await page.locator('[data-thema-palet="kleur"]').click(); await page.locator('[data-thema-modus="light"]').click(); await page.waitForTimeout(700);
        await sluit(ctx);
      }
    }

    // ================================================================ C. автоматична тема з page.clock
    if (STAPPEN.includes('C')) {
      /** Налаштувати авто на сервері через інтерфейс (звичайний час), далі кожен «пристрій» відкривається з керованим годинником. */
      const zetAutoUi = async (o: { soort: 'zon' | 'interval'; plaats?: string; van?: string; tot?: string }) => {
        const { ctx, page } = await open(O, `${ID}/themes?lang=uk`, { width: 1280, height: 900 });
        await instellingen(page);
        await page.locator('[data-thema-modus="auto"]').click();
        await page.locator('[data-thema-auto-instellingen]').waitFor();
        await page.locator('.thema-soort input').nth(o.soort === 'zon' ? 0 : 1).check();
        if (o.plaats) await page.locator('[data-thema-plaats]').selectOption(o.plaats);
        if (o.van) await page.locator('[data-thema-van]').fill(o.van);
        if (o.tot) await page.locator('[data-thema-tot]').fill(o.tot);
        await page.waitForTimeout(900);
        const sw = await serverWeergave(page);
        await sluit(ctx);
        return sw;
      };
      const metKlok = (tz: string, tijd: Date, extra: Parameters<typeof apparaat>[2] = {}) => open(O, `${ID}/themes?lang=uk`, { width: 1280, height: 900, tijdzone: tz, ...extra }, async (p) => { await p.clock.install({ time: tijd }); });
      /** Мить перемикання ±1 хв: відкрито за хвилину до, годинник іде далі (таймер сторінки), без перезавантаження. */
      const schakel = async (label: string, tz: string, moment: number, naDonker: boolean, shot?: string) => {
        const a = await metKlok(tz, new Date(moment - 60_000));
        await instellingen(a.page);
        const voor = await donker(a.page), stVoor = await status(a.page);
        await a.page.clock.runFor(120_000); await a.page.waitForTimeout(600);
        const na = await donker(a.page), stNa = await status(a.page);
        const verwachtUur = uurMin(moment, tz);
        check(`C: ${label} — за хвилину до ${verwachtUur} ${naDonker ? 'світла' : 'темна'}, через хвилину після — ${naDonker ? 'темна' : 'світла'} (без перезавантаження); статус називає ${verwachtUur}`,
          voor === !naDonker && na === naDonker && stVoor.includes(verwachtUur), `${voor}→${na} | ${stVoor} | ${stNa}`);
        if (shot) await foto(a.page, shot);
        await sluit(a.ctx);
      };
      // ---- Брюссель, сутінки 14.11.2026
      const swB = await zetAutoUi({ soort: 'zon', plaats: 'brussel' });
      check('C: «Коли надворі темно» + Брюссель збережено в обліковому записі', swB.modus === 'auto' && swB.auto?.soort === 'zon' && swB.auto?.lat === 50.8 && swB.auto?.lon === 4.4, JSON.stringify({ m: swB.modus, a: swB.auto }));
      const zB = metTz('Europe/Brussels', () => zonTijden(new Date(2026, 10, 14), 50.8, 4.4));
      if (typeof zB === 'object') {
        await schakel('Брюссель 14.11 сутінки ввечері', 'Europe/Brussels', zB.onder, true, 'auto-brussel-avond-computer');
        await schakel('Брюссель 14.11 світанок', 'Europe/Brussels', zB.op, false);
      } else check('C: Брюссель — zonTijden дає час', false, String(zB));
      // ---- Київ (часовий пояс Europe/Kyiv)
      await zetAutoUi({ soort: 'zon', plaats: 'kyiv' });
      const zK = metTz('Europe/Kyiv', () => zonTijden(new Date(2026, 10, 14), 50.5, 30.5));
      if (typeof zK === 'object') {
        await schakel('Київ 14.11 сутінки ввечері', 'Europe/Kyiv', zK.onder, true);
        await schakel('Київ 14.11 світанок', 'Europe/Kyiv', zK.op, false, 'auto-kyiv-ochtend-computer');
      } else check('C: Київ — zonTijden дає час', false, String(zK));
      // ---- сезонна зміна часу з сутінками (Брюссель 29.03.2026 — перший день літнього часу)
      await zetAutoUi({ soort: 'zon', plaats: 'brussel' });
      const zM = metTz('Europe/Brussels', () => zonTijden(new Date(2026, 2, 29), 50.8, 4.4));
      if (typeof zM === 'object') await schakel('Брюссель 29.03 (перший день літнього часу) світанок', 'Europe/Brussels', zM.op, false);
      const zO = metTz('Europe/Brussels', () => zonTijden(new Date(2026, 9, 25), 50.8, 4.4));
      if (typeof zO === 'object') await schakel('Брюссель 25.10 (перший день зимового часу) сутінки', 'Europe/Brussels', zO.onder, true);

      // ---- розклад через північ 22:00–06:00
      const swI = await zetAutoUi({ soort: 'interval', van: '22:00', tot: '06:00' });
      check('C: «За розкладом» 22:00–06:00 збережено', swI.auto?.soort === 'interval' && swI.auto?.van === '22:00' && swI.auto?.tot === '06:00', JSON.stringify(swI.auto));
      {
        const a = await metKlok('Europe/Brussels', new Date('2026-11-16T21:59:00+01:00'));
        await instellingen(a.page);
        const r: string[] = [];
        const stap = async (label: string, ms: number) => { await a.page.clock.runFor(ms); await a.page.waitForTimeout(400); r.push(`${label}:${(await donker(a.page)) ? 'D' : 'L'}`); };
        r.push(`21:59:${(await donker(a.page)) ? 'D' : 'L'}`);
        await stap('22:01', 120_000);
        const stNacht = await status(a.page);
        await foto(a.page, 'auto-schema-nacht-computer');
        await a.page.clock.fastForward('01:58:00'); await a.page.waitForTimeout(400); r.push(`23:59:${(await donker(a.page)) ? 'D' : 'L'}`);
        await stap('00:01', 120_000);
        await a.page.clock.fastForward('05:58:00'); await a.page.waitForTimeout(400); r.push(`05:59:${(await donker(a.page)) ? 'D' : 'L'}`);
        await stap('06:01', 120_000);
        check('C: розклад 22:00–06:00 через північ — 21:59 світла, 22:01/23:59/00:01/05:59 темна, 06:01 світла; статус уночі «наступне перемикання о 06:00»',
          r.join(' ') === '21:59:L 22:01:D 23:59:D 00:01:D 05:59:D 06:01:L' && /06:00/.test(stNacht), `${r.join(' ')} | ${stNacht}`);
        await sluit(a.ctx);
      }
      // ---- сезонна зміна часу з розкладом: ніч 28→29.03 (02:00→03:00) і 24→25.10 (03:00→02:00)
      for (const [label, start, kritiek] of [
        ['ніч 28→29.03.2026 (переведення на літній час)', '2026-03-28T21:59:00+01:00', '2026-03-29T06:00:00+02:00'],
        ['ніч 24→25.10.2026 (переведення на зимовий час)', '2026-10-24T21:59:00+02:00', '2026-10-25T06:00:00+01:00'],
      ] as const) {
        const a = await metKlok('Europe/Brussels', new Date(start));
        await instellingen(a.page);
        await a.page.clock.runFor(120_000); await a.page.waitForTimeout(300);
        const om22 = await donker(a.page);
        const kr = new Date(kritiek).getTime(), nu = await a.page.evaluate(() => Date.now());
        // до 05:59 місцевого часу (за справжньою тривалістю ночі: 7 год або 9 год)
        await a.page.clock.fastForward(kr - 60_000 - nu); await a.page.waitForTimeout(400);
        const om559 = await donker(a.page), uur559 = await a.page.evaluate(() => new Date().toTimeString().slice(0, 5));
        await a.page.clock.runFor(120_000); await a.page.waitForTimeout(400);
        const om601 = await donker(a.page), uur601 = await a.page.evaluate(() => new Date().toTimeString().slice(0, 5));
        check(`C: ${label} — 22:01 темна, ${uur559} темна, ${uur601} світла (перемикання о 06:00 місцевого часу)`, om22 && om559 && !om601 && uur559 === '05:59' && uur601 === '06:01', `${om22}/${om559}/${om601} ${uur559} ${uur601}`);
        await sluit(a.ctx);
      }

      // ---- полярний випадок: Шпіцберген (місце з браузера), полярний день і полярна ніч
      {
        const geo = async (_p: Page, c: BrowserContext) => { await c.grantPermissions(['geolocation'], { origin: ID }); await c.setGeolocation({ latitude: 78.22, longitude: 15.65 }); };
        const zomer = await open(O, `${ID}/themes?lang=uk`, { width: 380, height: 800, touch: true, tijdzone: 'Arctic/Longyearbyen' }, async (p, c) => { await geo(p, c); await p.clock.install({ time: new Date('2026-06-21T12:00:00+02:00') }); });
        await instellingen(zomer.page);
        await zomer.page.locator('[data-thema-modus="auto"]').tap();
        await zomer.page.locator('.thema-soort input').nth(0).check();
        await zomer.page.locator('[data-thema-locatie]').tap(); await zomer.page.waitForTimeout(1200);
        const swP = await serverWeergave(zomer.page);
        const verwZomer = metTz('Arctic/Longyearbyen', () => zonTijden(new Date(2026, 5, 21), 78.2, 15.7));
        const tekstZomer = await zomer.page.locator('[data-thema-zon]').innerText();
        const stZomer = await status(zomer.page);
        check('C: Шпіцберген — місце з браузера збережено приблизно (78.2, 15.7)', swP.auto?.lat === 78.2 && swP.auto?.lon === 15.7, JSON.stringify(swP.auto));
        check('C: Шпіцберген 21.06 (полярний день за zonTijden) — «біла ніч — світла весь день», тема світла', verwZomer === 'dag' && /біла ніч/.test(tekstZomer) && !(await donker(zomer.page)), `${verwZomer} | ${tekstZomer}`);
        // справжнє перемикання — перша доба, коли zonTijden уже не «біла ніч» (о 00:00 місцевого часу тоді вже темно)
        const eersteDag = (van: Date, soort: 'dag' | 'nacht') => metTz('Arctic/Longyearbyen', () => { for (let i = 1; i < 200; i++) { const d = new Date(van.getFullYear(), van.getMonth(), van.getDate() + i); const z = zonTijden(d, 78.2, 15.7); if (z !== soort) return { d, z }; } return null; });
        const pz = eersteDag(new Date(2026, 5, 21), 'dag');
        // дата місцевого часу Шпіцбергена (не часового поясу процесу)
        const datumUk = (d: Date) => d.toLocaleDateString('uk-UA', { day: '2-digit', month: '2-digit', timeZone: 'Arctic/Longyearbyen' });
        const verwZ = pz ? `наступне перемикання ${datumUk(pz.d)} о 00:00` : '?';
        check(`C: полярний день — статус не обіцяє перемикання о 00:00 (його не буде), а називає справжнє: «${verwZ}»`, stZomer.includes(verwZ), stZomer);
        await zomer.page.locator('[data-thema-status]').evaluate((e) => e.scrollIntoView({ block: 'start' }));
        await foto(zomer.page, 'auto-poolzomer-telefoon');
        await zomer.page.clock.fastForward('12:01:00'); await zomer.page.waitForTimeout(500);
        check('C: полярний день — після північ (00:01) тема так само світла', !(await donker(zomer.page)));
        await sluit(zomer.ctx);
        const winter = await open(O, `${ID}/themes?lang=uk`, { width: 380, height: 800, touch: true, tijdzone: 'Arctic/Longyearbyen' }, async (p) => { await p.clock.install({ time: new Date('2026-12-21T12:00:00+01:00') }); });
        await instellingen(winter.page);
        const verwWinter = metTz('Arctic/Longyearbyen', () => zonTijden(new Date(2026, 11, 21), 78.2, 15.7));
        const tekstWinter = await winter.page.locator('[data-thema-zon]').innerText(), stWinter = await status(winter.page);
        const pw = eersteDag(new Date(2026, 11, 21), 'nacht');
        const verwW = pw && typeof pw.z === 'object' ? `наступне перемикання ${datumUk(pw.d)} о ${uurMin(pw.z.op, 'Arctic/Longyearbyen')}` : '?';
        check(`C: Шпіцберген 21.12 (полярна ніч) — «полярна ніч — темна весь день», тема темна опівдні; статус — справжнє перемикання «${verwW}», не 00:00`, verwWinter === 'nacht' && /полярна ніч/.test(tekstWinter) && (await donker(winter.page)) && stWinter.includes(verwW), `${verwWinter} | ${tekstWinter} | ${stWinter}`);
        await winter.page.locator('[data-thema-status]').evaluate((e) => e.scrollIntoView({ block: 'start' }));
        await foto(winter.page, 'auto-poolnacht-telefoon');
        // забути місце — знову Брюссель
        await winter.page.locator('[data-thema-vergeet]').tap(); await winter.page.waitForTimeout(900);
        const swV = await serverWeergave(winter.page);
        check('C: «Забути місце» — координати прибрано з облікового запису', swV.auto && swV.auto.lat === undefined && swV.auto.lon === undefined, JSON.stringify(swV.auto));
        await sluit(winter.ctx);
      }
    }

    // ================================================================ D. пауза, повернення, ручний вибір
    if (STAPPEN.includes('D')) {
      const { ctx, page: p0 } = await open(O, `${ID}/themes?lang=uk`, { width: 1280, height: 900 });
      await instellingen(p0);
      await p0.locator('[data-thema-modus="auto"]').click(); await p0.locator('[data-thema-auto-instellingen]').waitFor();
      await p0.locator('.thema-soort input').nth(0).check(); await p0.locator('[data-thema-plaats]').selectOption('brussel'); await p0.waitForTimeout(900);
      await sluit(ctx);
      const z = metTz('Europe/Brussels', () => zonTijden(new Date(2026, 10, 16), 50.8, 4.4));
      if (typeof z !== 'object') { check('D: zonTijden дає час', false); } else {
        const middag = new Date('2026-11-16T12:00:00+01:00');
        const a = await open(O, `${ID}/themes?lang=uk`, { width: 1280, height: 900, tijdzone: 'Europe/Brussels' }, async (p) => { await p.clock.install({ time: middag }); });
        await instellingen(a.page);
        const voor = await donker(a.page);
        await a.page.locator('[data-thema-status] [data-thema-pauze]').click(); await a.page.waitForTimeout(900);
        const st = await status(a.page), sw = await serverWeergave(a.page);
        // Пауза (темна) триває до сутінок, а після сутінок темно й за розкладом — тож справжнє перемикання лише на світанку 17.11.
        const z17 = metTz('Europe/Brussels', () => zonTijden(new Date(2026, 10, 17), 50.8, 4.4));
        const ochtend = typeof z17 === 'object' ? uurMin(z17.op, 'Europe/Brussels') : '?';
        check(`D: опівдні світла; «Призупинити до наступного перемикання» → темна, «призупинено»; на сервері pauzeTot = сутінки ${uurMin(z.onder, 'Europe/Brussels')}; статус — справжнє перемикання (світанок ${ochtend}), не ${uurMin(z.onder, 'Europe/Brussels')}`,
          !voor && (await donker(a.page)) && /призупинено/.test(st) && st.includes(`наступне перемикання о ${ochtend}`) && sw.auto?.pauzeModus === 'dark' && Math.abs(Number(sw.auto?.pauzeTot) - z.onder) < 1000, `${st} | ${JSON.stringify(sw.auto)}`);
        await foto(a.page, 'pauze-computer');
        // другий пристрій (телефон, той самий час) бачить паузу
        const b2 = await open(O, `${ID}/themes?lang=uk`, { width: 380, height: 800, touch: true, tijdzone: 'Europe/Brussels' }, async (p) => { await p.clock.install({ time: new Date(middag.getTime() + 120_000) }); });
        await instellingen(b2.page);
        check('D: другий пристрій (телефон) — та сама пауза: темна, «Повернути автоперемикання»', (await donker(b2.page)) && /Повернути автоперемикання/.test(await b2.page.locator('[data-thema-pauze]').innerText()));
        await b2.page.locator('[data-thema-status]').scrollIntoViewIfNeeded();
        await foto(b2.page, 'pauze-tweede-apparaat-telefoon');
        await sluit(b2.ctx);
        // кінець паузи в мить сутінок: далі темна вже за розкладом, без «призупинено»
        const nu = await a.page.evaluate(() => Date.now());
        await a.page.clock.fastForward(z.onder + 60_000 - nu); await a.page.waitForTimeout(600);
        const stNa = await status(a.page);
        check('D: після сутінок пауза закінчилася сама — темна за розкладом, без «призупинено»', (await donker(a.page)) && !/призупинено/.test(stNa) && /Призупинити до наступного перемикання/.test(await a.page.locator('[data-thema-pauze]').innerText()), stNa);
        // пауза в темряві → світла; «Повернути автоперемикання» → знову темна
        await a.page.locator('[data-thema-pauze]').click(); await a.page.waitForTimeout(700);
        const pauzeLicht = !(await donker(a.page));
        await a.page.locator('[data-thema-pauze]').click(); await a.page.waitForTimeout(900);
        const sw2 = await serverWeergave(a.page);
        check('D: увечері пауза → світла; «Повернути автоперемикання» → знову темна, паузи на сервері немає', pauzeLicht && (await donker(a.page)) && !sw2.auto?.pauzeTot, JSON.stringify(sw2.auto));
        // ручний вибір вимикає авто
        await a.page.locator('[data-thema-modus="light"]').click(); await a.page.waitForTimeout(900);
        const sw3 = await serverWeergave(a.page);
        const verborgen = (await a.page.locator('[data-thema-auto-instellingen]').count()) === 0;
        const nu2 = await a.page.evaluate(() => Date.now());
        const morgenOp = metTz('Europe/Brussels', () => zonTijden(new Date(2026, 10, 17), 50.8, 4.4));
        const naarMiddernacht = new Date('2026-11-17T01:00:00+01:00').getTime() - nu2;
        await a.page.clock.fastForward(naarMiddernacht); await a.page.waitForTimeout(500);
        const nachtLicht = !(await donker(a.page));
        check('D: ручний «Світлий» вимикає авто — блок автоперемикання сховано, modus=light на сервері, о 01:00 уночі тема світла', verborgen && sw3.modus === 'light' && nachtLicht && typeof morgenOp === 'object', JSON.stringify({ m: sw3.modus, verborgen, nachtLicht }));
        await a.page.locator('[data-thema-modus="dark"]').click(); await a.page.waitForTimeout(700);
        if (typeof morgenOp === 'object') { const nu3 = await a.page.evaluate(() => Date.now()); await a.page.clock.fastForward(morgenOp.op + 3600_000 - nu3); await a.page.waitForTimeout(500); }
        check('D: ручний «Темний» — і після світанку тема темна (авто вимкнено)', await donker(a.page));
        // повернути авто: розклад (Брюссель) зберігся
        await a.page.locator('[data-thema-modus="auto"]').click(); await a.page.waitForTimeout(900);
        const sw4 = await serverWeergave(a.page);
        check('D: знову «Автоматично» — збережений розклад (Брюссель, сутінки) на місці, о 9-й ранку світла', sw4.modus === 'auto' && sw4.auto?.soort === 'zon' && sw4.auto?.lat === 50.8 && !(await donker(a.page)), JSON.stringify(sw4.auto));
        await a.page.locator('[data-thema-modus="device"]').click(); await a.page.waitForTimeout(700);
        await sluit(a.ctx);
      }
    }

    // ================================================================ E. «Макет»: акцент, ефекти, щільність, менше руху
    if (STAPPEN.includes('E')) {
      await pool.query('UPDATE app.feature_flags SET aan = true, standaard = true WHERE sleutel = ANY($1)', [VLAGGEN]);
      const stijl = (page: Page) => page.evaluate(() => {
        const h = document.documentElement, c = getComputedStyle(document.querySelector('.canonical-chrome')!), r = getComputedStyle(h);
        const mq = document.querySelector('.mr-mq'), halo = document.querySelector('.mr-mq .hero-orb');
        return { accent: h.dataset.accent || '', dichtheid: h.dataset.dichtheid || '', beweging: h.dataset.beweging || '', effect: r.getPropertyValue('--effect-sterkte').trim(), ruimte3: r.getPropertyValue('--ruimte-3').trim(),
          kleurAccent: c.getPropertyValue('--accent').trim(), overgang: getComputedStyle(document.querySelector('.canonical-sidebar') || h).transitionDuration,
          mq: !!mq, mqAccent: mq ? getComputedStyle(mq).getPropertyValue('--global').trim() : '', mqLicht: mq ? mq.classList.contains('light') : null, halo: halo ? getComputedStyle(halo).opacity : '',
          // елементи з рухом довшим за 10 мс (переходи; анімації — лише ті, що справді мають назву)
          beweegt: Array.from(document.querySelectorAll('*')).flatMap((e) => { const s = getComputedStyle(e); const max = (v: string) => Math.max(...v.split(',').map((x) => parseFloat(x) * (x.trim().endsWith('ms') ? 1 : 1000))); const tr = max(s.transitionDuration), an = s.animationName !== 'none' ? max(s.animationDuration) : 0; return tr > 10 || an > 10 ? [`${e.tagName.toLowerCase()}.${String(e.className).split(' ')[0]}:${tr}/${an}`] : []; }) };
      });
      // ---- пристрій 1: телефон, «Макет», розділ «Теми» — елементи самого «Макета»
      const t = await open(O, `${ID}/themes?lang=uk`, { width: 380, height: 800, touch: true });
      await t.page.locator('.mr-mq').waitFor({ timeout: 15000 });
      const voor = await stijl(t.page);
      check('E: «Макет» на телефоні відкрито; типові значення (без акценту, ефекти 45 % — куля вступу ≈ 0,45, звичайна щільність, рух є)', voor.mq && !voor.accent && !voor.dichtheid && !voor.beweging && Math.abs(Number(voor.halo) - 0.445) < 0.02 && voor.beweegt.length > 0, JSON.stringify({ ...voor, beweegt: voor.beweegt.length }));
      const swatch = t.page.locator('#themes .swatches [data-accent="cyan"]').first();
      await swatch.scrollIntoViewIfNeeded(); await swatch.tap(); await t.page.waitForTimeout(500);
      const bereik = t.page.locator('#themes input[data-range-demo="themes-2"]').first();
      await bereik.scrollIntoViewIfNeeded();
      await bereik.evaluate((el) => { const i = el as HTMLInputElement; i.value = '20'; i.dispatchEvent(new Event('input', { bubbles: true })); i.dispatchEvent(new Event('change', { bubbles: true })); });
      await t.page.waitForTimeout(500);
      await foto(t.page, 'maquette-accent-effect-telefoon');
      await t.page.goto(`${ID}/personalization?lang=uk`, { waitUntil: 'networkidle' }); await t.page.waitForTimeout(800);
      const compact = t.page.locator('#personalization [data-choice-group="personalization-1"][data-choice-index="1"]').first();
      await compact.scrollIntoViewIfNeeded(); await compact.tap(); await t.page.waitForTimeout(400);
      const rust = t.page.locator('#personalization [data-toggle-demo="personalization-2"]').first();
      await rust.scrollIntoViewIfNeeded(); await rust.tap(); await t.page.waitForTimeout(1200);
      const na1 = await stijl(t.page);
      const v = ACCENT_TONEN.cyan.licht.accent;
      check('E: пристрій 1 — акцент «Бірюзовий» (--accent сайту і --global ілюстрацій), ефекти 20 %, «Компактна», менше руху — застосовано одразу',
        na1.accent === 'cyan' && na1.kleurAccent.toLowerCase() === v && na1.mqAccent.toLowerCase() === '#5adad4' && na1.effect === '0.2' && na1.dichtheid === 'compact' && na1.ruimte3 === '9px' && na1.beweging === 'minder', JSON.stringify({ ...na1, beweegt: na1.beweegt.length }));
      check('E: телефон — виразність ефектів 20 % діє й на кулю вступу (≈ 0,2 × 2,2 × 0,45), не лише на комп\'ютері', Math.abs(Number(na1.halo) - 0.198) < 0.02, na1.halo);
      check('E: «менше руху» — на всій сторінці «Макета» жодного переходу чи анімації довших за 10 мс', na1.beweegt.length === 0, na1.beweegt.slice(0, 8).join(' '));
      await foto(t.page, 'maquette-dichtheid-beweging-telefoon');
      const sw = await serverWeergave(t.page);
      check('E: усе збережено в обліковому записі (сервер: accent, effecten, dichtheid, beweging)', sw.accent === 'cyan' && sw.effecten === 20 && sw.dichtheid === 'compact' && sw.beweging === 'minder', JSON.stringify({ a: sw.accent, e: sw.effecten, d: sw.dichtheid, b: sw.beweging }));
      await sluit(t.ctx);
      // ---- пристрій 2: новий вхід, комп'ютер 1280, темна тема
      const O2 = await opnieuwAanmelden(O);
      const c = await open(O2, `${ID}/themes?lang=uk`, { width: 1280, height: 900, thema: 'dark' });
      await c.page.locator('.mr-mq').waitFor({ timeout: 15000 });
      await c.page.waitForTimeout(800);
      const na2 = await stijl(c.page);
      const vD = ACCENT_TONEN.cyan.donker.accent;
      check('E: другий пристрій (новий вхід, комп\'ютер, темний пристрій) — той самий акцент (темний тон), ефекти, щільність і менше руху; ілюстрації темні з бірюзовим сяйвом',
        na2.accent === 'cyan' && na2.kleurAccent.toLowerCase() === vD && na2.mqAccent.toLowerCase() === '#5adad4' && na2.mqLicht === false && na2.effect === '0.2' && Math.abs(Number(na2.halo) - 0.44) < 0.02 && na2.dichtheid === 'compact' && na2.ruimte3 === '9px' && na2.beweging === 'minder' && na2.beweegt.length === 0, JSON.stringify({ ...na2, beweegt: na2.beweegt.slice(0, 5) }));
      const swatchSel = await c.page.locator('#themes .swatches [data-accent="cyan"]').first().getAttribute('aria-pressed');
      const bereikWaarde = await c.page.locator('#themes input[data-range-demo="themes-2"]').first().inputValue().catch(() => '');
      check('E: другий пристрій — елементи «Макета» показують збережене (бірюзовий вибрано, повзунок 20)', swatchSel === 'true' && bereikWaarde === '20', `${swatchSel} ${bereikWaarde}`);
      await foto(c.page, 'maquette-tweede-apparaat-computer');
      // світла тема: ілюстрації світлі
      await c.page.emulateMedia({ colorScheme: 'light' }); await c.page.waitForTimeout(900);
      const licht = await stijl(c.page);
      check('E: пристрій перейшов на світлу тему — «Макет» і ілюстрації світлі, акцент світлого тону', licht.mqLicht === true && licht.kleurAccent.toLowerCase() === v, JSON.stringify({ ...licht, beweegt: licht.beweegt.length }));
      // повернути типові значення справжніми налаштуваннями (той самий запис в обліковому записі)
      await openBlok(c.page, '[data-thema-accent=""]');
      await c.page.locator('[data-thema-accent=""]').first().click();
      await c.page.locator('[data-thema-effecten]').first().evaluate((el) => { const i = el as HTMLInputElement; const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!; set.call(i, '45'); i.dispatchEvent(new Event('input', { bubbles: true })); });
      await c.page.waitForTimeout(500);
      await sluit(c.ctx);
      const p = await open(O2, `${ID}/personalization?lang=uk`, { width: 1280, height: 900 });
      // «Чинні налаштування» картки «Персоналізація» монтуються після першого відкриття — відкриваємо, як людина (клік по заголовку)
      const echt = p.page.locator('.mq-echt-blok[data-echt-blok="personalization"]').first();
      if (await echt.count() && !(await echt.evaluate((d) => (d as HTMLDetailsElement).open))) { await echt.locator('summary').first().scrollIntoViewIfNeeded(); await echt.locator('summary').first().click(); }
      await openBlok(p.page, '[data-weergave-dichtheid="normaal"]');
      await p.page.locator('[data-weergave-dichtheid="normaal"]').first().click();
      await p.page.locator('[data-weergave-beweging]').first().check(); await p.page.waitForTimeout(900);
      const terug = await stijl(p.page), swT = await serverWeergave(p.page);
      check('E: типові значення повернуто — атрибутів на <html> немає, рух повернувся, на сервері полів немає', !terug.accent && !terug.dichtheid && !terug.beweging && !terug.effect.startsWith('0.2') && terug.beweegt.length > 0 && swT.accent === undefined && swT.dichtheid === undefined && swT.beweging === undefined && swT.effecten === undefined, JSON.stringify({ terug: { ...terug, beweegt: terug.beweegt.length }, a: swT.accent, d: swT.dichtheid, b: swT.beweging, e: swT.effecten }));
      await sluit(p.ctx);
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
