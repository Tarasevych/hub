// IDENTITEIT-015 (лінія D3): знімки ключових станів 12 розділів центру облікового запису у вигляді «Макет» (справжній Chromium,
// справжній сервер і тестова база). Прапорці identiteit-account-atelier і identiteit-account-maquette увімкнено на час прогону.
// Пробна власниця (@example.test) з невеликими вигаданими даними: простір, 2 блоки, одне запрошення (посилання), один ключ доступу
// (віртуальний автентифікатор CDP) і коди відновлення. Для кожного розділу (порядок — src/identiteit/atelier-v49-gegevens.json):
// відкрити розділ, розгорнути «Чинні налаштування» (справжня панель) і зробити знімок — uk світла 380×800 і nl темна 1280×860;
// плюс 2 знімки карти «Майбутні налаштування». Перевірки: розділ відкрився, справжня панель видима, без горизонтальної
// прокрутки, без помилок консолі й HTTP. Знімки знеособлено (verberg) і збережено JPEG (якість 70) у tests/e2e/знімки-015/.
// Schermafdrukken van de 12 onderdelen van het accountcentrum in de weergave «Ontwerp», met de echte panelen open.
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { join } from 'node:path';
import type { Browser, BrowserContext, Page } from 'playwright-core';
import { checker } from '../eenheid/hulp/nep-google';
import { getPool } from '../../server/platform/pg';
import { startE2eServer, chromeArgs } from './server';
import { ID, apparaat, horizontaal, persoon, sluit, verberg, volgFouten, type Persoon } from './hulp/sessie-015';
import gegevens from '../../src/identiteit/atelier-v49-gegevens.json';

const PW = process.env.PLAYWRIGHT_CORE || '/workspace/e2e-tools/node_modules/playwright-core';
const TLS = process.env.E2E_TLS || '/workspace/e2e-tools/tls';
const POORT = Number(process.env.E2E_POORT || 8443);
const CHROME = process.env.CHROME || '/usr/bin/google-chrome';
// Знімки комітяться в сховище (відомість aanvulling-d3.json посилається на них).
const UIT = 'tests/e2e/знімки-015';
const VERWACHT = [/\/api\/owner\/agents\/activity$/, /mail\.tarasevych\.com\/api\/owner\/mail\/(bootstrap|accounts\/list)$/];
const VLAGGEN = ['identiteit-account-atelier', 'identiteit-account-maquette'];
const SECTIES = (gegevens as { secties: Array<{ id: string }> }).secties.map((s) => s.id);
/** Адреса сайту для розділу «Макета» (identities → /identity, як naarSite у IdentiteitMaquette.tsx). */
const pad = (id: string) => (id === 'identities' ? 'identity' : id);
const VARIANTEN = [
  { taal: 'uk' as const, thema: 'light' as const, width: 380, height: 800, touch: true, naam: 'uk-licht-380' },
  { taal: 'nl' as const, thema: 'dark' as const, width: 1280, height: 860, touch: false, naam: 'nl-donker-1280' },
];

export async function main(): Promise<number> {
  const { check, einde } = checker('e2e identiteit-015 schermen');
  const { chromium } = createRequire(import.meta.url)(PW) as typeof import('playwright-core');
  const T = `${Date.now()}-${randomBytes(2).toString('hex')}`;
  const eigenaarEmail = `e2e-i15s-eig-${T}@example.test`;
  const { G, stop } = await startE2eServer({ ownerEmail: eigenaarEmail, poort: POORT, tls: TLS });
  const pool = getPool();
  mkdirSync(UIT, { recursive: true });
  const browser: Browser = await chromium.launch({ executablePath: CHROME, headless: true, args: chromeArgs(POORT) });
  const fouten: string[] = [];
  const emails: string[] = [];
  const bestanden: Record<string, string[]> = {};
  const vlagWas = (await pool.query('SELECT sleutel, aan, standaard FROM app.feature_flags WHERE sleutel = ANY($1)', [VLAGGEN])).rows as Array<{ sleutel: string; aan: boolean; standaard: boolean }>;
  const zetVlaggen = (aan: boolean) => pool.query('UPDATE app.feature_flags SET aan = $2, standaard = $2 WHERE sleutel = ANY($1)', [VLAGGEN, aan]);
  const idVanEmail = async (email: string) => String((await pool.query("select id from app.records where tbl='users' and data->>'email'=$1 order by seq desc limit 1", [email])).rows[0]?.id || '');
  const hubApi = (p: Persoon, pd: string, extra: Record<string, unknown> = {}) => p.b.verzoek('hub.tarasevych.com', pd, p.b.ctxBody('hub', extra));
  const foto = async (page: Page, sectie: string, naam: string) => {
    await verberg(page);
    const pd = join(UIT, `${naam}.jpg`);
    await page.screenshot({ path: pd, type: 'jpeg', quality: 70, fullPage: false, animations: 'disabled' });
    (bestanden[sectie] ||= []).push(pd);
  };
  /** Google-вікно підтвердження особи (якщо сайт попросить) — підроблене: одразу назад із кодом. */
  const googleStub = async (ctx: BrowserContext, p: Persoon) => ctx.route('https://accounts.google.com/**', async (route) => {
    const u = new URL(route.request().url());
    const code = (G as unknown as { codeVoor: (s: string, e: string, n: string) => string }).codeVoor(p.sub, p.email, u.searchParams.get('nonce') || '');
    const terug = new URL(u.searchParams.get('redirect_uri') || `${ID}/`);
    terug.searchParams.set('state', u.searchParams.get('state') || ''); terug.searchParams.set('code', code);
    await route.fulfill({ status: 302, headers: { location: terug.href } });
  });
  /** Якщо з'явилося вікно «Підтвердіть доступ» — підтверджуємо через (підроблений) Google. */
  const bevestig = async (page: Page) => {
    const v = page.getByRole('dialog');
    if (!(await v.waitFor({ state: 'visible', timeout: 6000 }).then(() => true).catch(() => false))) return;
    const knop = v.getByRole('button', { name: /Google|passkey/ }).first();
    if (await knop.count()) await knop.click();
    await v.waitFor({ state: 'detached', timeout: 20000 }).catch(() => undefined);
    await page.waitForURL(/id\.tarasevych\.com\/methods/, { timeout: 20000 }).catch(() => undefined);
  };
  try {
    // ---------------------------------------------------------------- пробна власниця і дані
    const O = await persoon(G as never, 'i15s-eig', T); emails.push(O.email);
    const oId = await idVanEmail(O.email);
    await pool.query(`update app.records set data = data || $2::jsonb where tbl='users' and id=$1`, [oId, JSON.stringify({ status: 'approved', name: 'Власниця Проба' })]);
    await hubApi(O, '/api/workspace/load');
    const ws = String((await hubApi(O, '/api/workspace/load')).data.workspace?.id || '');
    const b1 = await hubApi(O, '/api/blocks/add', { workspaceId: ws, sourceType: 'internal', target: 'hub:notes', title: 'Нотатки проби' });
    const b2 = await hubApi(O, '/api/blocks/add', { workspaceId: ws, sourceType: 'external', title: 'Зовнішня сторінка проби', url: 'https://voorbeeld.example.test/' });
    const link = await hubApi(O, '/api/share/link', { workspaceId: ws, workspaceRole: 'viewer' });
    check('підготовка: власниця схвалена, простір, 2 блоки й одне запрошення', !!oId && !!ws && b1.status === 200 && b2.status === 200 && link.status === 200 && !!link.data.code, `${b1.status} ${JSON.stringify(b1.data)} ${b2.status} ${link.status}`);

    // Ключ доступу й коди відновлення — через справжню сторінку «Способи входу» (класичний вигляд, прапорці вимкнено).
    await zetVlaggen(false);
    {
      const { ctx, page } = await apparaat(browser, O, { taal: 'uk', width: 1280, height: 860 });
      volgFouten(page, fouten, VERWACHT);
      await googleStub(ctx, O);
      const cdp = await ctx.newCDPSession(page);
      await cdp.send('WebAuthn.enable');
      await cdp.send('WebAuthn.addVirtualAuthenticator', { options: { protocol: 'ctap2', transport: 'internal', hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true } });
      await page.goto(`${ID}/methods?lang=uk`, { waitUntil: 'networkidle' });
      await page.locator('[data-access-section="passkeys"]').waitFor({ timeout: 20000 });
      const hs = page.locator('[data-access-section="recovery"]');
      await hs.getByRole('button', { name: 'Створити коди' }).click();
      await page.waitForTimeout(800);
      await bevestig(page);
      const paneel = page.locator('[data-herstel-nieuw]');
      await paneel.waitFor({ timeout: 20000 }).catch(() => undefined);
      if (await paneel.count()) { await paneel.getByLabel('Я зберіг коди').check(); await paneel.getByRole('button', { name: 'Готово' }).click(); }
      await page.locator('[data-herstel-lijst]').waitFor({ timeout: 10000 }).catch(() => undefined);
      check('підготовка: коди відновлення створено (10 у переліку)', await page.locator('[data-herstel-lijst] li').count() === 10);
      const pk = page.locator('[data-access-section="passkeys"]');
      await pk.getByRole('button', { name: 'Додати passkey' }).click();
      await pk.locator('#passkey-naam').fill('Ноутбук проби');
      await pk.getByRole('button', { name: 'Продовжити' }).click();
      await page.waitForTimeout(800);
      await bevestig(page);
      await page.locator('[data-access-section="passkeys"] [data-passkey]').first().waitFor({ timeout: 20000 }).catch(() => undefined);
      check('підготовка: ключ доступу (віртуальний автентифікатор CDP) додано', await page.locator('[data-access-section="passkeys"] [data-passkey]').count() === 1);
      await sluit(ctx);
    }

    // ---------------------------------------------------------------- 12 розділів × 2 вигляди
    await zetVlaggen(true);
    for (const v of VARIANTEN) {
      const { ctx, page } = await apparaat(browser, O, { taal: v.taal, thema: v.thema, width: v.width, height: v.height, touch: v.touch });
      volgFouten(page, fouten, VERWACHT);
      await googleStub(ctx, O);
      for (const sectie of SECTIES) {
        const n = `${v.naam}/${sectie}`;
        const voor = fouten.length;
        await page.goto(`${ID}/${pad(sectie)}?lang=${v.taal}`, { waitUntil: 'networkidle' });
        await page.locator('.mr-mq').waitFor({ timeout: 20000 }).catch(() => undefined);
        await page.locator(`.mr-mq section[data-section="${sectie}"]`).waitFor({ timeout: 10000 }).catch(() => undefined);
        await page.waitForTimeout(500);
        check(`${n}: розділ відкрито у «Макеті»`, await page.locator(`.mr-mq section[data-section="${sectie}"]`).count() === 1);
        // Розділи з детальною панеллю: спершу «Відкрити налаштування» (як людина), потім блок «Чинні налаштування».
        const detail = page.locator(`.mr-mq .open-detail[data-for="${sectie}"]`).first();
        if (await detail.count() && (await detail.getAttribute('aria-expanded')) !== 'true') { await detail.scrollIntoViewIfNeeded(); await detail.click(); await page.waitForTimeout(600); }
        const blok = page.locator(`.mr-mq .mq-echt-blok[data-echt-blok="${sectie}"]`).first();
        await blok.waitFor({ state: 'attached', timeout: 10000 }).catch(() => undefined);
        if (await blok.count() && !(await blok.evaluate((d) => (d as HTMLDetailsElement).open))) {
          const kop = blok.locator('summary').first();
          await kop.scrollIntoViewIfNeeded(); await kop.click();
        }
        const houder = page.locator(`.mr-mq .mq-echt[data-echt="${sectie}"] > .mq-echt-houder`).first();
        await page.waitForFunction((s) => { const h = document.querySelector(`.mr-mq .mq-echt[data-echt="${s}"] > .mq-echt-houder`) as HTMLElement | null; return !!h && h.childElementCount > 0 && h.getBoundingClientRect().height > 40; }, sectie, { timeout: 15000 }).catch(() => undefined);
        await page.waitForLoadState('networkidle').catch(() => undefined);
        await page.waitForTimeout(700);
        const zicht = await houder.evaluate((h) => { const r = h.getBoundingClientRect(); return { kind: h.childElementCount, hoogte: Math.round(r.height), tekst: (h as HTMLElement).innerText.trim().length }; }).catch(() => ({ kind: 0, hoogte: 0, tekst: 0 }));
        check(`${n}: справжня панель у «Чинних налаштуваннях» змонтована й видима`, zicht.kind > 0 && zicht.hoogte > 40 && zicht.tekst > 20, JSON.stringify(zicht));
        const hz = await horizontaal(page);
        check(`${n}: без горизонтальної прокрутки`, hz <= 1, String(hz));
        // Знімок: заголовок блоку «Чинні налаштування» вгорі екрана, під ним — справжня панель.
        // Прокручується внутрішній контейнер (не вікно), тож відступ під липкою шапкою задаємо через scroll-margin-top.
        // Знімок має показати сам блок: точка в його заголовку справді належить блоку (не порожнє тло під час прокрутки).
        let zichtbaar = false;
        for (let poging = 0; poging < 4 && !zichtbaar; poging++) {
          await blok.evaluate((d, h) => { (d as HTMLElement).style.scrollMarginTop = `${h}px`; d.scrollIntoView({ block: 'start' }); }, v.width < 500 ? 36 : 0).catch(() => undefined);
          await page.waitForTimeout(500 + poging * 400);
          zichtbaar = await blok.evaluate((d) => { const k = d.querySelector('summary')!.getBoundingClientRect(); const e = document.elementFromPoint(k.left + k.width / 2, k.top + k.height / 2); return k.top >= 0 && k.bottom <= innerHeight && !!e && d.contains(e) && getComputedStyle(d).opacity !== '0'; }).catch(() => false);
        }
        check(`${n}: блок «Чинні налаштування» у видимій частині екрана на знімку`, zichtbaar);
        await foto(page, sectie, `schermen-${sectie}-${v.taal}-${v.thema === 'light' ? 'licht' : 'donker'}-${v.width}`);
        check(`${n}: без помилок консолі й HTTP`, fouten.length === voor, fouten.slice(voor, voor + 4).join(' | '));
      }
      // Карта «Майбутні налаштування»: перший розділ (за порядком), де вона ще є; групи розгорнуто.
      let kaartSectie = '';
      for (const s of SECTIES) {
        await page.goto(`${ID}/${pad(s)}?lang=${v.taal}`, { waitUntil: 'networkidle' });
        await page.locator(`.mr-mq section[data-section="${s}"]`).waitFor({ timeout: 15000 }).catch(() => undefined);
        const d = page.locator(`.mr-mq .open-detail[data-for="${s}"]`).first();
        if (await d.count() && (await d.getAttribute('aria-expanded')) !== 'true') { await d.click(); await page.waitForTimeout(500); }
        if (await page.locator(`.mr-mq details[data-future-section="${s}"]`).count()) { kaartSectie = s; break; }
      }
      const kaart = page.locator(`.mr-mq details[data-future-section="${kaartSectie}"]`).first();
      check(`${v.naam}: карта «Майбутні налаштування» є (розділ ${kaartSectie || '—'})`, !!kaartSectie && await kaart.count() === 1);
      if (await kaart.count()) {
        await kaart.evaluate((d, h) => { (d as HTMLDetailsElement).open = true; for (const g of d.querySelectorAll('details')) (g as HTMLDetailsElement).open = true; (d as HTMLElement).style.scrollMarginTop = `${h}px`; d.scrollIntoView({ block: 'start' }); }, v.width < 500 ? 36 : 0);
        await page.waitForTimeout(800);
        check(`${v.naam}: карта без горизонтальної прокрутки`, (await horizontaal(page)) <= 1);
        await foto(page, 'kaart', `schermen-kaart-${kaartSectie}-${v.taal}-${v.thema === 'light' ? 'licht' : 'donker'}-${v.width}`);
      }
      await sluit(ctx);
    }
    const aantal = Object.values(bestanden).flat().length;
    check('усього знімків: 24 розділів + 2 карти', aantal === 26, String(aantal));
    process.stdout.write(`ZNIMKY ${JSON.stringify(bestanden)}\n`);
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
  return einde();
}
