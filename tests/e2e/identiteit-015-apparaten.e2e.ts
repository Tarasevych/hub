// IDENTITEIT-015 (приймання, лінія D2 «пристрої й доступність»): вигляд «Макет» центру облікового запису (id.tarasevych.com) у
// справжньому Chromium. Прапорці identiteit-account-atelier і identiteit-account-maquette увімкнено на час перевірки (тестова база).
// Для 5 ширин (320×720, 380×800, 768×1024, 1280×860, 1440×900) × uk/nl × світла/темна — усі 20 поєднань, на кожному коротко:
//  1. Без горизонтальної прокрутки; активний пункт навігації видно (на вузькому екрані — після розгортання меню розділів);
//     заголовок, поле й кнопки картки досяжні (не перекриті) після розгортання «Відкрити налаштування».
//  2. Клавіатура: Tab-обхід до останньої кнопки сторінки («Повернутися вгору»), кожен фокус видимий (outline/box-shadow);
//     Esc закриває вікно (світлина профілю, розташування навігації, меню розділів) і фокус повертається на кнопку, що його відкрила.
//  3. Дотик (hasTouch; isMobile на телефоні): tap відкриває меню розділів і картку розділу.
//  4. Збільшений текст: font-size 200 % (телефон) або вдвічі менше вікно (≥ 768) — без горизонтальної прокрутки, обрізаного тексту
//     й перекриттів кнопок.
//  5. Зменшений рух (reducedMotion: 'reduce'): обчислені transition/animation усієї сторінки ≤ 10 мс.
// Знімки (≤ 8) — знімки-015/apparaten-*.png (jpeg 70), знеособлені (verberg). Лише вигадані адреси @example.test.
// Acceptatie «apparaten en toegankelijkheid» van de weergave «Ontwerp»: 20 combinaties breedte × taal × thema — geen horizontaal
// scrollen, actief menupunt zichtbaar, toetsenbord (Tab, zichtbare focus, Esc + focusherstel), aanraken, 200 % tekst, minder beweging.
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import type { Browser, BrowserContext, Page } from 'playwright-core';
import { checker } from '../eenheid/hulp/nep-google';
import { getPool } from '../../server/platform/pg';
import { startE2eServer, chromeArgs } from './server';
import { ID, PRISTROI, apparaat, horizontaal, persoon, sluit, verberg, volgFouten } from './hulp/sessie-015';

const PW = process.env.PLAYWRIGHT_CORE || '/workspace/e2e-tools/node_modules/playwright-core';
const TLS = process.env.E2E_TLS || '/workspace/e2e-tools/tls';
const POORT = Number(process.env.E2E_POORT || 8443);
const CHROME = process.env.CHROME || '/usr/bin/google-chrome';
const KNIP = 'tests/e2e/знімки-015';
const VERWACHT = [/\/api\/owner\/agents\/activity$/, /mail\.tarasevych\.com\/api\/owner\/mail\/(bootstrap|accounts\/list)$/];
const VLAGGEN = ['identiteit-account-atelier', 'identiteit-account-maquette'];
// Alleen voor het ontwikkelen: E2E_FILTER=telefoon-320 draait alleen die breedte(s).
const FILTER = process.env.E2E_FILTER || '';

/** Знімки, які зберігаємо (не більше 8): naam van de combinatie → bestandsnaam. */
const FOTO: Record<string, string> = {
  'telefoon-320/uk/light': 'apparaten-telefoon-320-uk-licht',
  'telefoon-380/nl/dark': 'apparaten-telefoon-380-nl-donker',
  'tablet-768/uk/dark': 'apparaten-tablet-768-uk-donker',
  'computer-1280/nl/light': 'apparaten-computer-1280-nl-licht',
  'computer-1440/uk/dark': 'apparaten-computer-1440-uk-donker',
};

export async function main(): Promise<number> {
  const { check, einde } = checker('e2e identiteit-015 apparaten');
  const { chromium } = createRequire(import.meta.url)(PW) as typeof import('playwright-core');
  const T = `${Date.now()}-${randomBytes(2).toString('hex')}`;
  const { G, stop } = await startE2eServer({ ownerEmail: `e2e-i15a-eig-${T}@example.test`, poort: POORT, tls: TLS });
  const pool = getPool();
  mkdirSync(KNIP, { recursive: true });
  const browser: Browser = await chromium.launch({ executablePath: CHROME, headless: true, args: chromeArgs(POORT) });
  const fouten: string[] = [];
  const emails: string[] = [];
  const vlagWas = (await pool.query('SELECT sleutel, aan, standaard FROM app.feature_flags WHERE sleutel = ANY($1)', [VLAGGEN])).rows as Array<{ sleutel: string; aan: boolean; standaard: boolean }>;
  let fotos = 0;
  const foto = async (page: Page, naam: string, extra = '') => {
    if (fotos >= 8) return;
    fotos++;
    await verberg(page);
    await page.screenshot({ path: `${KNIP}/${naam}${extra}.png`, type: 'jpeg', quality: 70, animations: 'disabled' } as never);
  };

  /** Видимість і неперекритість елемента: центр (і кути з відступом) — сам елемент або його нащадок. */
  const bereikbaar = (page: Page, sel: string) => page.evaluate((s) => {
    const el = Array.from(document.querySelectorAll<HTMLElement>(s)).find((e) => e.getClientRects().length > 0);
    if (!el) return { ok: false, reden: `немає ${s}` };
    el.scrollIntoView({ block: 'center', behavior: 'instant' as ScrollBehavior });
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) return { ok: false, reden: `нульовий розмір ${s}` };
    if (r.right > innerWidth + 1 || r.left < -1) return { ok: false, reden: `поза вікном ${s} ${Math.round(r.left)}..${Math.round(r.right)}` };
    const x = Math.min(Math.max(r.left + r.width / 2, 1), innerWidth - 2), y = Math.min(Math.max(r.top + Math.min(r.height / 2, 12), 1), innerHeight - 2);
    const top = document.elementFromPoint(x, y);
    const ok = !!top && (el === top || el.contains(top) || top.contains(el));
    return { ok, reden: ok ? '' : `${s} перекрито ${top?.tagName}.${String((top as HTMLElement | null)?.className || '').slice(0, 50)}` };
  }, sel);

  /** Обрізаний текст і перекриття кнопок у видимій частині «Макета». */
  const tekstStaat = (page: Page) => page.evaluate(() => {
    const zichtbaar = (e: Element) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < innerHeight; };
    const geknipt: string[] = [];
    const kand = Array.from(document.querySelectorAll<HTMLElement>('.mr-mq h1, .mr-mq h2, .mr-mq h3, .mr-mq button, .mr-mq label, .mr-mq .setting-section p, .mr-mq summary'))
      .filter((e) => zichtbaar(e) && (e.textContent || '').trim().length > 1 && !e.closest('[aria-hidden="true"], [hidden], .anchor-rail, .hero-orb'));
    for (const e of kand) {
      const s = getComputedStyle(e);
      if (s.textOverflow === 'ellipsis') continue; // свідомо скорочено з «…» (повний текст — у title/aria-label)
      const knipX = s.overflowX !== 'visible' && e.scrollWidth > e.clientWidth + 2;
      const knipY = s.overflowY !== 'visible' && e.scrollHeight > e.clientHeight + 2;
      if (knipX || knipY) geknipt.push(`${e.tagName.toLowerCase()}.${String(e.className).split(' ')[0]}「${(e.textContent || '').trim().slice(0, 24)}」${e.scrollWidth}/${e.clientWidth}×${e.scrollHeight}/${e.clientHeight}`);
    }
    // Перекриття: кнопки однієї картки/рядка не налягають одна на одну.
    const knoppen = Array.from(document.querySelectorAll<HTMLElement>('.mr-mq .setting-section button, .mr-mq .topbar button, .mr-mq .hero button')).filter((e) => zichtbaar(e) && !e.closest('[hidden], [aria-hidden="true"]'));
    const over: string[] = [];
    for (let i = 0; i < knoppen.length; i++) for (let j = i + 1; j < knoppen.length; j++) {
      const a = knoppen[i], b = knoppen[j];
      if (a.contains(b) || b.contains(a)) continue;
      const p = a.getBoundingClientRect(), q = b.getBoundingClientRect();
      const w = Math.min(p.right, q.right) - Math.max(p.left, q.left), h = Math.min(p.bottom, q.bottom) - Math.max(p.top, q.top);
      if (w > 2 && h > 2) over.push(`${(a.textContent || a.getAttribute('aria-label') || '').trim().slice(0, 18)} ✕ ${(b.textContent || b.getAttribute('aria-label') || '').trim().slice(0, 18)}`);
    }
    return { geknipt: geknipt.slice(0, 6), over: over.slice(0, 6), scroll: document.documentElement.scrollWidth - document.documentElement.clientWidth };
  });

  /** Рух довший за 10 мс (transition/animation) на всій сторінці. */
  const beweging = (page: Page) => page.evaluate(() => Array.from(document.querySelectorAll('*')).flatMap((e) => {
    if (!(e as HTMLElement).getClientRects || !(e as HTMLElement).getClientRects().length) return [];
    const s = getComputedStyle(e);
    const max = (v: string) => Math.max(0, ...v.split(',').map((x) => parseFloat(x) * (x.trim().endsWith('ms') ? 1 : 1000)));
    const tr = s.transitionProperty === 'none' ? 0 : max(s.transitionDuration), an = s.animationName !== 'none' ? max(s.animationDuration) : 0;
    const kl = (x: Element | null) => (x?.getAttribute('class') || '').split(' ')[0];
    return tr > 10 || an > 10 ? [`${e.tagName.toLowerCase()}.${kl(e)}<${e.parentElement?.tagName.toLowerCase()}.${kl(e.parentElement)}<${kl(e.parentElement?.parentElement || null)}:${tr}/${an}`] : [];
  }));

  /** Фокус видно: outline або box-shadow у :focus-visible (або власний стан фокуса). */
  const focusZichtbaar = (page: Page) => page.evaluate(() => {
    const e = document.activeElement as HTMLElement | null;
    if (!e || e === document.body) return { ok: false, el: 'body' };
    const s = getComputedStyle(e);
    const ring = (s.outlineStyle !== 'none' && parseFloat(s.outlineWidth) >= 1) || (s.boxShadow !== 'none' && s.boxShadow !== '');
    const r = e.getBoundingClientRect();
    const binnen = r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < innerHeight && r.right > 0 && r.left < innerWidth;
    return { ok: ring && binnen, el: `${e.tagName.toLowerCase()}.${String(e.className).split(' ')[0]}#${e.id}「${(e.textContent || e.getAttribute('aria-label') || '').trim().slice(0, 20)}」${ring ? '' : ' без кільця'}${binnen ? '' : ' поза вікном'}` };
  });

  try {
    const P = await persoon(G as never, 'i15a-eig', T); emails.push(P.email);
    await pool.query('UPDATE app.feature_flags SET aan = true, standaard = true WHERE sleutel = ANY($1)', [VLAGGEN]);
    check('підготовка: прапорці «Ателье» й «Макет» увімкнено, пробна особа є', (await pool.query('SELECT count(*)::int n FROM app.feature_flags WHERE sleutel = ANY($1) AND aan', [VLAGGEN])).rows[0].n === 2);

    for (const pr of PRISTROI.filter((x) => !FILTER || FILTER.split(',').includes(x.naam))) {
      for (const taal of ['uk', 'nl'] as const) {
        for (const thema of ['light', 'dark'] as const) {
          const naam = `${pr.naam}/${taal}/${thema}`;
          const smal = pr.width < 768;
          let ctx: BrowserContext | null = null;
          try {
            const a = await apparaat(browser, P, { taal, thema, width: pr.width, height: pr.height, touch: pr.touch });
            ctx = a.ctx; const page = a.page;
            volgFouten(page, fouten, VERWACHT);
            await page.goto(`${ID}/personalization?lang=${taal}`, { waitUntil: 'networkidle' });
            await page.locator('.mr-mq .setting-section').first().waitFor({ timeout: 20000 });
            await page.waitForTimeout(600);
            const taalOk = await page.evaluate((t) => document.querySelector('.mr-mq')?.getAttribute('lang') === t, taal);

            // ---------- 1. прокрутка, активний пункт, досяжність
            const scroll = await horizontaal(page);
            check(`${naam}: «Макет» (${taal}) без горизонтальної прокрутки`, taalOk && scroll <= 0, `scroll=${scroll} lang=${taalOk}`);
            // Перейти до розділу «Теми» через навігацію (як людина): на вузькому — розгорнути меню розділів.
            const toggle = page.locator('#adaptiveNavToggle');
            const toggleZichtbaar = await toggle.isVisible();
            if (toggleZichtbaar && (await toggle.getAttribute('aria-expanded')) !== 'true') { pr.touch ? await toggle.tap() : await toggle.click(); await page.waitForTimeout(450); }
            const themaKnop = page.locator('#anchorRail .anchor-link[data-jump="themes"]').first();
            const railOpen = await themaKnop.isVisible();
            check(`${naam}: навігацію розділів видно${toggleZichtbaar ? ' після розгортання меню (дотик/клік)' : ''}`, railOpen, `toggle=${toggleZichtbaar}`);
            if (railOpen) { pr.touch ? await themaKnop.tap() : await themaKnop.click(); }
            // плавна прокрутка до розділу триває — чекаємо, доки «Теми» стануть поточним розділом (до 5 с)
            await page.waitForFunction(() => document.querySelector('#anchorRail .anchor-link[aria-current="location"]')?.getAttribute('data-jump') === 'themes', null, { timeout: 5000 }).catch(() => undefined);
            await page.waitForTimeout(300);
            // Активний пункт: на ПК — у рейці; на вузькому — назва розділу на смузі над сторінкою (меню закривається після вибору).
            const actief = await page.evaluate(() => {
              const zicht = (e: Element | null) => { if (!e) return false; const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < innerHeight && r.left < innerWidth && r.right > 0 && getComputedStyle(e).visibility !== 'hidden'; };
              const rail = document.querySelector('#anchorRail .anchor-link[aria-current="location"]');
              const balk = document.querySelector('#mqSectieNaam');
              return { rail: zicht(rail) ? (rail as HTMLElement).dataset.jump : '', railCurrent: (rail as HTMLElement | null)?.dataset.jump || '', balk: zicht(balk) ? (balk?.textContent || '').trim() : '' };
            });
            const themaNaam = taal === 'nl' ? /Thema/i : /Тем/i;
            const adres = new URL(page.url()).pathname;
            check(`${naam}: «Теми» в навігації — адреса /themes, активний пункт «Теми» видно${smal ? ' (назва на смузі розділів)' : ''}`, adres === '/themes' && actief.railCurrent === 'themes' && (actief.rail === 'themes' || themaNaam.test(actief.balk)), JSON.stringify({ adres, ...actief }));
            // Картка «Теми» (елементи прямо на картці): заголовок, кольори, повзунок і перемикач досяжні.
            const doelen = ['#themes h2', '#themes .swatches [data-accent]', '#themes input[data-range-demo]', '.mr-mq .topbar .search-action'];
            const bereik = [];
            for (const d of doelen) bereik.push(await bereikbaar(page, d));
            // Картка «Спільний доступ»: «Відкрити налаштування» (дотиком/кліком) → заголовок панелі, перший елемент і кнопка закриття досяжні.
            const open = page.locator('#sharing .open-detail').first();
            await open.scrollIntoViewIfNeeded();
            pr.touch ? await open.tap() : await open.click();
            await page.waitForFunction(() => { const p = document.getElementById('inline-sharing'); return !!p && !p.hidden && p.querySelector('.drawer-controls-list > *'); }, null, { timeout: 5000 }).catch(() => undefined);
            await page.waitForTimeout(500);
            const uitgeklapt = (await open.getAttribute('aria-expanded')) === 'true';
            for (const d of ['#sharing h2', '#inline-sharing .inline-settings-header', '#inline-sharing .drawer-controls-list button, #inline-sharing .drawer-controls-list input', '#inline-sharing [data-close-inline]']) bereik.push(await bereikbaar(page, d));
            const mis = bereik.filter((b) => !b.ok).map((b) => b.reden);
            check(`${naam}: картки «Теми» й «Спільний доступ» (розгорнуто ${pr.touch ? 'дотиком' : 'кліком'}) — заголовки, поля й кнопки досяжні`, uitgeklapt && mis.length === 0, `${uitgeklapt} ${mis.join('; ')}`);
            const fNaam = FOTO[`${pr.naam}/${taal}/${thema}`];
            if (fNaam) { await page.locator('#themes').evaluate((e) => e.scrollIntoView({ block: 'start', behavior: 'instant' as ScrollBehavior })); await page.waitForTimeout(300); await foto(page, fNaam); }

            // ---------- 2. клавіатура: Esc + повернення фокуса
            await page.keyboard.press('Escape'); await page.waitForTimeout(200);
            await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior }));
            const escFout: string[] = [];
            // a) світлина профілю (справжній <dialog>) — кнопка-аватар у шапці
            const avatar = page.locator('.mr-mq .top-avatar[data-open-profile-photo]').first();
            if (await avatar.isVisible()) {
              await avatar.focus(); await page.keyboard.press('Enter'); await page.waitForTimeout(300);
              const open1 = await page.evaluate(() => (document.getElementById('profilePhotoDialog') as HTMLDialogElement).open);
              await page.keyboard.press('Escape'); await page.waitForTimeout(300);
              const na = await page.evaluate(() => ({ open: (document.getElementById('profilePhotoDialog') as HTMLDialogElement).open, terug: document.activeElement?.matches('.top-avatar[data-open-profile-photo]') }));
              if (!open1 || na.open || !na.terug) escFout.push(`світлина: відкрито=${open1} після Esc відкрито=${na.open} фокус=${na.terug}`);
            } else escFout.push('кнопки-аватара немає');
            // b) розташування навігації (popover) — кнопка на смузі розділів
            const positie = page.locator('#mqSectiePositie');
            if (await positie.isVisible()) {
              await positie.focus(); await page.keyboard.press('Enter'); await page.waitForTimeout(300);
              const open2 = await page.locator('#navSettings').isVisible();
              await page.keyboard.press('Escape'); await page.waitForTimeout(300);
              const na = await page.evaluate(() => ({ open: !(document.getElementById('navSettings') as HTMLElement).hidden, terug: document.activeElement?.id || document.activeElement?.tagName }));
              if (!open2 || na.open || na.terug !== 'mqSectiePositie') escFout.push(`розташування: відкрито=${open2} після Esc відкрито=${na.open} фокус=${na.terug}`);
            }
            // c) меню розділів на вузькому екрані
            if (await toggle.isVisible()) {
              await toggle.focus(); await page.keyboard.press('Enter'); await page.waitForTimeout(400);
              const open3 = (await toggle.getAttribute('aria-expanded')) === 'true';
              await page.keyboard.press('Escape'); await page.waitForTimeout(400);
              const na = await page.evaluate(() => ({ open: document.querySelector('#adaptiveNavToggle')?.getAttribute('aria-expanded') === 'true', terug: document.activeElement?.id }));
              if (!open3 || na.open || na.terug !== 'adaptiveNavToggle') escFout.push(`меню розділів: відкрито=${open3} після Esc відкрито=${na.open} фокус=${na.terug}`);
            }
            check(`${naam}: Esc закриває вікно (світлина, розташування${smal ? ', меню розділів' : ''}) і фокус повертається на кнопку`, escFout.length === 0, escFout.join('; '));

            // ---------- 2б. Tab-обхід до останньої кнопки сторінки, кожен фокус видимий
            await page.evaluate(() => { (document.activeElement as HTMLElement | null)?.blur(); window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior }); });
            await page.locator('.mr-mq .topbar').first().click({ position: { x: 2, y: 2 } }).catch(() => undefined);
            const zonderRing: string[] = [];
            let bereikt = false, stappen = 0;
            for (; stappen < 600 && !bereikt; stappen++) {
              await page.keyboard.press('Tab');
              let f = await focusZichtbaar(page);
              // браузер прокручує до елемента з фокусом (у вкладених смугах — плавно): даємо до 0,9 с, перш ніж вважати фокус невидимим
              for (let i = 0; i < 3 && !f.ok && f.el.endsWith('поза вікном'); i++) { await page.waitForTimeout(300); f = await focusZichtbaar(page); }
              if (!f.ok && zonderRing.length < 6) zonderRing.push(f.el);
              bereikt = await page.evaluate(() => !!document.activeElement?.matches('.mr-mq .site-footer .to-top'));
            }
            check(`${naam}: Tab доходить до останньої кнопки («${taal === 'nl' ? 'Terug naar boven' : 'Повернутися вгору'}»), кожен фокус видимий`, bereikt && zonderRing.length === 0, `кроків=${stappen} ${zonderRing.join(' | ')}`);

            // ---------- 4. збільшений текст: font-size 200 % (телефон) або вдвічі менше вікно
            if (smal) await page.evaluate(() => { document.documentElement.style.fontSize = '200%'; });
            else await page.setViewportSize({ width: Math.max(320, Math.round(pr.width / 2)), height: Math.round(pr.height / 2) });
            await page.waitForTimeout(500);
            await page.locator('#themes').evaluate((e) => e.scrollIntoView({ block: 'start', behavior: 'instant' as ScrollBehavior }));
            await page.waitForTimeout(300);
            const groot = await tekstStaat(page);
            await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior }));
            await page.waitForTimeout(200);
            const grootBoven = await tekstStaat(page);
            check(`${naam}: ${smal ? 'текст 200 %' : 'вдвічі менше вікно (200 %)'} — без прокрутки вбік, обрізаного тексту й перекриттів`,
              groot.scroll <= 0 && grootBoven.scroll <= 0 && !groot.geknipt.length && !groot.over.length && !grootBoven.geknipt.length && !grootBoven.over.length,
              JSON.stringify({ g: groot, b: grootBoven }));
            if (smal) await page.evaluate(() => { document.documentElement.style.fontSize = ''; });
            else await page.setViewportSize({ width: pr.width, height: pr.height });

            // ---------- 5. зменшений рух
            await page.emulateMedia({ reducedMotion: 'reduce' });
            await page.waitForTimeout(400);
            const rest = await beweging(page);
            check(`${naam}: reducedMotion 'reduce' — жодного переходу/анімації > 10 мс`, rest.length === 0, rest.slice(0, 8).join(' '));
          } catch (e) {
            check(`${naam}: неочікувана помилка`, false, String((e as Error)?.stack || e).slice(0, 800));
          } finally { if (ctx) await sluit(ctx); }
        }
      }
    }
  } catch (e) {
    check('неочікувана помилка', false, String((e as Error)?.stack || e).slice(0, 1500));
  } finally {
    await browser.close().catch(() => undefined);
    for (const v of vlagWas) await pool.query('UPDATE app.feature_flags SET aan = $2, standaard = $3 WHERE sleutel = $1', [v.sleutel, v.aan, v.standaard]).catch(() => undefined);
    const ids = (await pool.query("select id from app.records where tbl='users' and data->>'email' = any($1)", [emails]).catch(() => ({ rows: [] as Array<{ id: string }> }))).rows.map((x: { id: string }) => x.id);
    if (ids.length) await pool.query("delete from app.records where id = any($1) or data->>'accountId' = any($1) or data->>'recipientUserId' = any($1) or data->>'userId' = any($1) or data->>'ownerUserId' = any($1)", [ids]).catch((e: unknown) => console.error('[e2e] opruimen', e));
    await stop();
  }
  check('без помилок у консолі й HTTP', fouten.length === 0, fouten.slice(0, 8).join(' | '));
  return einde();
}
