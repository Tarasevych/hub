// IDENTITEIT-014 (фаза 3 «Макета»): нові справжні блоки в справжньому Chromium, на телефоні (390) і на десктопі (1280),
// українською та нідерландською, у світлій і темній темі. Перевіряє: блок існує на своїй сторінці, видимий, без горизонтальної
// прокрутки, без англійських слів у видимому тексті блоку, без помилок у консолі. Додатково — справжня поведінка:
// вивантаження даних дає файл JSON без секретів; форма «Задати пароль» з'являється, коли пароля немає; «Хто має доступ» показує
// власника. Знімки ident14-*.png.
// Nieuwe blokken van fase 3 in een echte Chrome: zichtbaar, geen horizontale scroll, geen Engels, geen consolefouten.
import { createRequire } from 'node:module';
import { mkdirSync, readFileSync } from 'node:fs';
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
// Сторінка → якір блоку фази 3.
const BLOKKEN: Array<[string, string]> = [
  ['menu', 'menu-meldingtypen'],
  ['sharing', 'delen-uitnodigen'],
  ['sharing', 'delen-leden'],
  ['account', 'gegevensuitvoer'],
  ['methods', 'aanmeldmethoden-wachtwoord'],
  ['recovery', 'herstel-overzicht'],
  ['recovery', 'herstel-scenarios'],
  ['recovery', 'herstel-sleutelverlies'],
];
// Англійські слова, яких не має бути у видимому тексті інтерфейсу (технічні назви на кшталт Google/Telegram/JSON дозволені).
// «export» не перевіряємо: це й нідерландське слово.
const ENGELS = /\b(the|and|your|please|delete|share|members?|invite|download|settings|password|recovery|enabled|disabled)\b/i;

export async function main(): Promise<number> {
  const { check, einde } = checker('e2e identiteit-014 blokken');
  const { chromium } = createRequire(import.meta.url)(PW) as typeof import('playwright-core');
  const T = `${Date.now()}-${randomBytes(2).toString('hex')}`;
  const eigenaar = `e2e-i14-${T}@example.test`, sub = `sub-e2e-i14-${T}`;
  const { G, stop } = await startE2eServer({ ownerEmail: eigenaar, poort: POORT, tls: TLS });
  const pool = getPool();
  mkdirSync(UIT, { recursive: true });
  const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: chromeArgs(POORT) });
  const fouten: string[] = [];
  try {
    for (const [taal, thema] of [['uk', 'light'], ['nl', 'dark']] as const) {
      const tab = randomBytes(24).toString('hex');
      const b = G.browser();
      await b.aanmelden(sub, eigenaar, { service: 'identity', tabContext: tab, intent: 'login' });
      const ctx = await browser.newContext({ colorScheme: thema, locale: taal === 'uk' ? 'uk-UA' : 'nl-NL', viewport: { width: 1280, height: 860 }, timezoneId: 'Europe/Kyiv', serviceWorkers: 'block', acceptDownloads: true });
      await ctx.addCookies([...b.jar].flatMap(([name, value]) => HOSTS.map((u) => ({ name, value, url: `${u}/`, secure: true, httpOnly: true, sameSite: 'Lax' as const }))));
      await ctx.addInitScript((tb) => { if (!sessionStorage.getItem('tsv-canonical-tab-v1')) sessionStorage.setItem('tsv-canonical-tab-v1', tb); }, tab);
      const page = await ctx.newPage();
      page.on('pageerror', (e) => fouten.push(`pageerror: ${e.message}`));
      page.on('console', (m) => { if (m.type() === 'error' && !/^Failed to load resource/.test(m.text())) fouten.push(`console: ${m.text()}`); });
      page.on('response', async (q) => { if (q.status() >= 400 && !/\/api\/owner\/agents\/activity$/.test(q.url())) { const c = await q.json().then((j: { error?: string }) => j?.error || '').catch(() => ''); fouten.push(`http ${q.status()} ${q.url()} ${c}`); } });
      // Кожну сторінку відкриваємо один раз і перевіряємо обидві ширини без перезавантаження: сервер обмежує частоту запитів
      // (429 RATE_LIMITED), а часті перезавантаження в тесті — не те, що робить людина.
      let vorige = '';
      for (const [pagina, anker] of BLOKKEN) for (const breedte of [1280, 390]) {
        await page.setViewportSize({ width: breedte, height: breedte < 500 ? 820 : 860 });
        {
          const tag = `${taal}/${thema}/${breedte}/${anker}`;
          if (pagina !== vorige) { await page.waitForTimeout(1500); await page.goto(`${ID}/${pagina}?lang=${taal}`, { waitUntil: 'networkidle' }); await page.waitForTimeout(700); vorige = pagina; }
          const blok = page.locator(`[id="${anker}"]`);
          await blok.first().waitFor({ state: 'attached', timeout: 15000 }).catch(() => undefined);
          const n = await blok.count();
          check(`${tag}: блок існує рівно один раз`, n === 1, String(n));
          if (n !== 1) continue;
          // Згорнуті блоки розгортаємо, як це зробила б людина (або перехід із карти).
          await blok.evaluate((el) => { let d: Element | null = el; while (d) { if (d instanceof HTMLDetailsElement) d.open = true; d = d.parentElement; } });
          await blok.scrollIntoViewIfNeeded();
          await page.waitForTimeout(250);
          check(`${tag}: видимий`, await blok.isVisible());
          const scroll = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
          check(`${tag}: без горизонтальної прокрутки`, scroll <= 0, String(scroll));
          const tekst = (await blok.innerText()).replace(/https?:\S+/g, '');
          const eng = tekst.match(ENGELS);
          check(`${tag}: без англійських слів у тексті`, !eng, eng ? `«${eng[0]}» у: ${tekst.slice(Math.max(0, (eng.index || 0) - 40), (eng.index || 0) + 40)}` : '');
          if (breedte === 390 || anker === 'herstel-overzicht' || anker === 'delen-leden') await blok.screenshot({ path: `${UIT}/ident14-${anker}-${taal}-${thema}-${breedte}.png` }).catch(() => undefined);
        }
      }
      await page.setViewportSize({ width: 1280, height: 860 });
      await page.waitForTimeout(3000);
      // Справжня поведінка 1: «Хто має доступ» показує власника простору.
      await page.goto(`${ID}/sharing?lang=${taal}`, { waitUntil: 'networkidle' }); await page.waitForTimeout(800);
      const leden = page.locator('#delen-leden');
      await leden.evaluate((el) => { let d: Element | null = el; while (d) { if (d instanceof HTMLDetailsElement) d.open = true; d = d.parentElement; } }).catch(() => undefined);
      // Без інших учасників список чесно каже, що доступ є лише у вас.
      check(`${taal}: «Хто має доступ» без учасників — чесний порожній стан`, /крім вас|dan u heeft toegang|Власник|Eigenaar/i.test(await leden.innerText().catch(() => '')), (await leden.innerText().catch(() => '')).slice(0, 160));
      // Справжня поведінка 2: пароля немає → форма «Задати пароль».
      await page.waitForTimeout(1500); await page.goto(`${ID}/methods?lang=${taal}`, { waitUntil: 'networkidle' }); await page.waitForTimeout(800);
      const ww = page.locator('#aanmeldmethoden-wachtwoord');
      // Як людина: спершу «Задати пароль», тоді з'являється форма.
      await ww.getByRole('button', { name: /Задати пароль|Wachtwoord instellen/ }).first().click().catch(() => undefined);
      await page.waitForTimeout(400);
      await ww.screenshot({ path: `${UIT}/ident14-wachtwoord-formulier-${taal}.png` }).catch(() => undefined);
      // Межу тримає сам компонент (GeheimInvoer обрізає зайве), тому перевіряємо поведінку: 1100 символів → лишається 1024.
      const veld = ww.locator('input').first();
      await veld.fill('x'.repeat(1100)).catch(() => undefined);
      const lengte = (await veld.inputValue().catch(() => '')).length;
      check(`${taal}: без пароля — форма нового пароля, довжина обрізається до 1024`, lengte === 1024, String(lengte));
      // Справжня поведінка 3: вивантаження даних дає файл JSON без секретів (step-up пройдено свіжим входом).
      if (taal === 'uk') {
        await page.goto(`${ID}/account?lang=${taal}`, { waitUntil: 'networkidle' }); await page.waitForTimeout(800);
        const uv = page.locator('#gegevensuitvoer');
        await uv.evaluate((el) => { let d: Element | null = el; while (d) { if (d instanceof HTMLDetailsElement) d.open = true; d = d.parentElement; } });
        const knop = uv.locator('button').filter({ hasText: /Вивантажити|Завантажити|Отримати/ }).first();
        const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 20000 }).catch(() => null), knop.click().catch(() => undefined)]);
        let inhoud = '';
        if (dl) { const pad = await dl.path().catch(() => null); if (pad) inhoud = readFileSync(pad, 'utf8'); }
        let json: { formaat?: string; format?: string } | null = null; try { json = JSON.parse(inhoud); } catch { json = null; }
        check('вивантаження: справжній файл JSON із даними облікового запису', !!dl && !!json && inhoud.includes(eigenaar), dl ? dl.suggestedFilename() : 'немає завантаження');
        check('вивантаження: без секретів (ключі TOTP, хеші, токени сесій)', !!inhoud && !/totpSecret|secretEnc|passwordHash|"token"\s*:|recoveryHash/i.test(inhoud));
        await uv.screenshot({ path: `${UIT}/ident14-gegevensuitvoer-na.png` }).catch(() => undefined);
      }
      await ctx.close();
    }
    const echt = fouten.filter((f) => !/ERR_ABORTED|net::ERR_FAILED/.test(f));
    check('без помилок у консолі й HTTP', echt.length === 0, echt.slice(0, 8).join(' | '));
  } finally {
    await browser.close().catch(() => undefined);
    // Прибирання лише за ТОЧНОЮ адресою цього запуску.
    const ids = (await pool.query("select id from app.records where tbl='users' and data->>'email' = $1", [eigenaar]).catch(() => ({ rows: [] as Array<{ id: string }> }))).rows.map((x: { id: string }) => x.id);
    if (ids.length) await pool.query("delete from app.records where id = any($1) or data->>'accountId' = any($1) or data->>'recipientUserId' = any($1) or data->>'userId' = any($1) or data->>'ownerUserId' = any($1)", [ids]).catch((e: unknown) => console.error('[e2e] opruimen', e));
    await stop();
  }
  return einde();
}
