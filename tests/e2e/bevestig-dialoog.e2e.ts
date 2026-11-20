// IDENTITEIT-013 (фаза 2 «Макета»): спільний діалог підтвердження в справжньому Chromium.
// Для кожної комбінації: ширина 390 / 768 / 1280, мова uk / nl, тема світла / темна. Перевіряє: небезпечна дія (вимкнення чернеток)
// спершу відкриває діалог; діалог уміщається в екран без горизонтальної прокрутки; текст мовою сторінки; знак «!» і фокус на
// «Скасувати»; Esc закриває діалог і НІЧОГО не змінює (перемикач лишається ввімкненим); кнопки на телефоні на всю ширину.
// Насамкінець — справжнє підтвердження вимикає збереження чернеток. Знімки bevestig-*.png.
// Bevestigingsdialoog in een echte Chrome: 3 breedtes × 2 talen × 2 thema's; Esc annuleert zonder wijziging.
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { checker } from '../eenheid/hulp/nep-google';
import { getPool } from '../../server/platform/pg';
import { startE2eServer, chromeArgs } from './server';

const PW = process.env.PLAYWRIGHT_CORE || '/workspace/e2e-tools/node_modules/playwright-core';
const TLS = process.env.E2E_TLS || '/workspace/e2e-tools/tls';
const UIT = process.env.E2E_SCREENSHOTS || '/workspace/audit-20261008';
const POORT = Number(process.env.E2E_POORT || 8443);
const CHROME = process.env.CHROME || '/usr/bin/google-chrome';
const HOSTS = ['id', 'mcp', 'mail', 'hub', 'admin', 'cloud', 'ai'].map((h) => `https://${h}.tarasevych.com`);
const ID = 'https://id.tarasevych.com';
const BREEDTES = [390, 768, 1280];

export async function main(): Promise<number> {
  const { check, einde } = checker('e2e bevestig-dialoog');
  const { chromium } = createRequire(import.meta.url)(PW) as typeof import('playwright-core');
  const T = `${Date.now()}-${randomBytes(2).toString('hex')}`;
  const eigenaar = `e2e-bd-${T}@example.test`, sub = `sub-e2e-bd-${T}`;
  const { G, stop } = await startE2eServer({ ownerEmail: eigenaar, poort: POORT, tls: TLS });
  const pool = getPool();
  mkdirSync(UIT, { recursive: true });
  const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: chromeArgs(POORT) });
  const fouten: string[] = [];
  try {
    for (const taal of ['uk', 'nl'] as const) {
      for (const thema of ['light', 'dark'] as const) {
        const tab = randomBytes(24).toString('hex');
        const b = G.browser();
        await b.aanmelden(sub, eigenaar, { service: 'identity', tabContext: tab, intent: 'login' });
        // Чернетки ввімкнено на сервері, щоб діалог вимкнення мав що питати.
        const zijbalk = { versie: 1, modus: 'open', icoonStijl: 'kleur', dock: { positie: 'links', transparantie: 0, vergroting: false }, items: {}, kopieen: [], snelheid: { voortgang: true, overgangen: false, vooruitladen: false, prerender: false, concepten: true } };
        const opgeslagen = await b.verzoek('id.tarasevych.com', '/api/owner/ui/sidebar/save', b.ctxBody('identity', { sidebar: zijbalk }));
        if (opgeslagen.status !== 200) throw new Error(`sidebar/save ${opgeslagen.status}`);
        const ctx = await browser.newContext({ colorScheme: thema, locale: taal === 'uk' ? 'uk-UA' : 'nl-NL', viewport: { width: 1280, height: 800 }, timezoneId: 'Europe/Kyiv', serviceWorkers: 'block' });
        await ctx.addCookies([...b.jar].flatMap(([name, value]) => HOSTS.map((u) => ({ name, value, url: `${u}/`, secure: true, httpOnly: true, sameSite: 'Lax' as const }))));
        await ctx.addInitScript(([tb, v]) => { if (!sessionStorage.getItem('tsv-canonical-tab-v1')) sessionStorage.setItem('tsv-canonical-tab-v1', tb); localStorage.setItem('tsv-zijbalk-v2', v); }, [tab, JSON.stringify(zijbalk)] as const);
        const page = await ctx.newPage();
        page.on('pageerror', (e) => fouten.push(`pageerror: ${e.message}`));
        page.on('console', (m) => { if (m.type() === 'error' && !/^Failed to load resource/.test(m.text())) fouten.push(`console: ${m.text()}`); });
        page.on('response', (q) => { if (q.status() >= 400 && !/\/api\/owner\/agents\/activity$/.test(q.url())) fouten.push(`http ${q.status()} ${q.url()}`); });
        await page.goto(`${ID}/menu?lang=${taal}#menu-snelheid`, { waitUntil: 'networkidle' });
        const schakel = page.locator('#menu-snelheid [data-meld-schakel="concepten"]');
        await schakel.waitFor({ timeout: 20000 });
        await schakel.scrollIntoViewIfNeeded();
        const aan = () => schakel.locator('input').isChecked();
        check(`${taal}/${thema}: чернетки ввімкнено перед перевіркою`, await aan());
        // Одна збережена чернетка: без неї вимкнення нічого не стирає і тому відбувається без питання (так задумано).
        await page.evaluate(() => new Promise<void>((klaar, fout) => {
          const r = indexedDB.open('tsv-concepten', 1);
          r.onupgradeneeded = () => { const d = r.result; for (const n of ['sleutels', 'concepten']) if (!d.objectStoreNames.contains(n)) d.createObjectStore(n, { keyPath: 'id' }); };
          r.onerror = () => fout(r.error);
          r.onsuccess = () => { const t = r.result.transaction('concepten', 'readwrite'); t.objectStore('concepten').put({ id: 'id.tarasevych.com|e2e-proef', iv: new Uint8Array(12), data: new Uint8Array(4), at: Date.now() }); t.oncomplete = () => { r.result.close(); klaar(); }; t.onerror = () => fout(t.error); };
        }));
        for (const w of BREEDTES) {
          const tag = `${taal}/${thema}/${w}`;
          await page.setViewportSize({ width: w, height: w < 500 ? 780 : 820 });
          await page.waitForTimeout(250);
          await schakel.scrollIntoViewIfNeeded();
          await schakel.click();
          const dlg = page.locator('[data-bevestig="concepten-uit"]');
          await dlg.waitFor({ timeout: 5000 }).catch(() => undefined);
          check(`${tag}: клік спершу відкриває діалог, перемикач ще ввімкнено`, await dlg.count() === 1 && await aan());
          if (await dlg.count() !== 1) continue;
          const vak = await dlg.boundingBox();
          const scroll = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
          check(`${tag}: діалог уміщається в екран, без горизонтальної прокрутки`, !!vak && vak.x >= 0 && vak.x + vak.width <= w + 0.5 && scroll <= 0, JSON.stringify({ vak, scroll }));
          const titel = (await dlg.locator('.bevestig-dialoog-titel').innerText()).trim();
          check(`${tag}: заголовок мовою сторінки`, taal === 'uk' ? /Вимкнути збереження чернеток/.test(titel) : /Concepten bewaren uitzetten/.test(titel), titel);
          check(`${tag}: небезпечна кнопка зі знаком «!»`, await dlg.locator('.bevestig-dialoog-ja.is-gevaar .bevestig-dialoog-uitroep').count() === 1);
          const focus = await page.evaluate(() => document.activeElement?.className || '');
          check(`${tag}: фокус спершу на «Скасувати»`, /bevestig-dialoog-annuleer/.test(focus), focus);
          if (w === 390) {
            const [a, j] = await Promise.all([dlg.locator('.bevestig-dialoog-annuleer').boundingBox(), dlg.locator('.bevestig-dialoog-ja').boundingBox()]);
            check(`${tag}: на телефоні кнопки на всю ширину й не менше 44 px`, !!a && !!j && Math.abs(a.width - j.width) < 2 && a.height >= 44, JSON.stringify({ a, j }));
          }
          if (thema === 'dark') {
            const kleuren = await dlg.evaluate((el) => { const v = el.closest('[role="dialog"]') || el; return getComputedStyle(v).backgroundColor; });
            const rgb = (kleuren.match(/\d+/g) || []).slice(0, 3).map(Number);
            check(`${tag}: у темній темі тло діалогу темне`, rgb.length === 3 && rgb.reduce((x, y) => x + y, 0) / 3 < 110, kleuren);
          }
          await page.screenshot({ path: `${UIT}/bevestig-${taal}-${thema}-${w}.png` });
          await page.keyboard.press('Escape');
          await page.waitForTimeout(300);
          check(`${tag}: Esc закриває діалог і нічого не змінює`, await dlg.count() === 0 && await aan());
        }
        if (taal === 'uk' && thema === 'light') {
          // Справжнє підтвердження: людський клік вимикає чернетки.
          await schakel.click();
          const dlg = page.locator('[data-bevestig="concepten-uit"]');
          await dlg.waitFor({ timeout: 5000 });
          await dlg.locator('.bevestig-dialoog-ja').click();
          await page.waitForTimeout(500);
          check('підтвердження: діалог закрито, чернетки вимкнено', await dlg.count() === 0 && !(await aan()));
        }
        await ctx.close();
      }
    }
    check('без помилок у консолі й HTTP', fouten.length === 0, fouten.slice(0, 6).join(' | '));
  } finally {
    await browser.close().catch(() => undefined);
    // Прибирання лише за ТОЧНОЮ адресою цього запуску (ніколи за шаблоном).
    const ids = (await pool.query("select id from app.records where tbl='users' and data->>'email' = $1", [eigenaar]).catch(() => ({ rows: [] as Array<{ id: string }> }))).rows.map((x: { id: string }) => x.id);
    if (ids.length) await pool.query("delete from app.records where id = any($1) or data->>'accountId' = any($1) or data->>'recipientUserId' = any($1) or data->>'userId' = any($1) or data->>'ownerUserId' = any($1)", [ids]).catch((e: unknown) => console.error('[e2e] opruimen', e));
    await stop();
  }
  return einde();
}
