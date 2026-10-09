// E2E menu v2, fase B1: vlotte overgangen. Voortgangsbalk in de kleur van het DOEL-onderdeel (binnen een onderdeel én naar een
// ander onderdeel), zachte overgang van het werkgebied (niet bij «minder beweging»), vooruitladen bij aanwijzen (Speculation Rules
// via header, CSP ongewijzigd), prerender alleen als het aan staat (app start pas na activering; sessie blijft geldig), service
// worker v10, versleutelde concepten (standaard uit; aan → versleuteld bewaard, hersteld met melding, «Відкинути», uit = gewist).
// Screenshots menu-30…
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { checker } from '../eenheid/hulp/nep-google';
import { getPool } from '../../server/platform/pg';
import { ACCENT_KLEUREN, DIENST_ACCENT } from '../../shared/menu-model';
import { startE2eServer, chromeArgs } from './server';

const PW = process.env.PLAYWRIGHT_CORE || '/workspace/e2e-tools/node_modules/playwright-core';
const TLS = process.env.E2E_TLS || '/workspace/e2e-tools/tls';
const UIT = process.env.E2E_SCREENSHOTS || '/workspace/audit-20261008';
const POORT = Number(process.env.E2E_POORT || 8443);
const CHROME = process.env.CHROME || '/usr/bin/google-chrome';
const HOSTS = ['id', 'mcp', 'mail', 'hub', 'admin', 'cloud', 'ai'].map((h) => `https://${h}.tarasevych.com`);
const ID = 'https://id.tarasevych.com';
const VERWACHT = [/^403 .*\/api\/owner\/agents\/activity$/];
const hex2rgb = (h: string) => `rgb(${parseInt(h.slice(1, 3), 16)}, ${parseInt(h.slice(3, 5), 16)}, ${parseInt(h.slice(5, 7), 16)})`;
const kleur = (d: 'identity' | 'mail' | 'hub', t: 'licht' | 'donker') => hex2rgb(ACCENT_KLEUREN[DIENST_ACCENT[d]][t].hoofd);

export async function main(): Promise<number> {
  const { check, einde } = checker('e2e menu-v2 snelheid');
  const { chromium } = createRequire(import.meta.url)(PW) as typeof import('playwright-core');
  type Page = import('playwright-core').Page;
  const T = `${Date.now()}-${randomBytes(2).toString('hex')}`;
  const eigenaar = `e2e-ms-${T}@example.test`, sub = `sub-e2e-ms-${T}`;
  const { G, stop } = await startE2eServer({ ownerEmail: eigenaar, poort: POORT, tls: TLS });
  const pool = getPool();
  mkdirSync(UIT, { recursive: true });
  const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: chromeArgs(POORT) });
  const fouten: string[] = [];
  try {
    const sessie = async (o: { scheme?: 'dark' | 'light'; modus?: 'open' | 'dicht'; url: string; snelheid?: Record<string, boolean>; minderBeweging?: boolean }) => {
      const tab = randomBytes(24).toString('hex');
      const b = G.browser();
      await b.aanmelden(sub, eigenaar, { service: 'identity', tabContext: tab, intent: 'login' });
      const ctx = await browser.newContext({ colorScheme: o.scheme || 'light', reducedMotion: o.minderBeweging ? 'reduce' : 'no-preference', locale: 'uk-UA', viewport: { width: 1280, height: 760 }, timezoneId: 'Europe/Kyiv', serviceWorkers: 'block' });
      await ctx.addCookies([...b.jar].flatMap(([name, value]) => HOSTS.map((u) => ({ name, value, url: `${u}/`, secure: true, httpOnly: true, sameSite: 'Lax' as const }))));
      const zijbalk = JSON.stringify({ versie: 1, modus: o.modus || 'open', icoonStijl: 'kleur', dock: { positie: 'links', transparantie: 0, vergroting: false }, items: {}, kopieen: [], snelheid: { voortgang: true, overgangen: true, vooruitladen: true, prerender: false, concepten: false, ...(o.snelheid || {}) } });
      // De servervoorkeur wint van de lokale cache: per situatie ook op de server zetten (anders lekt een vorige stap door).
      const opgeslagen = await b.verzoek('id.tarasevych.com', '/api/owner/ui/sidebar/save', b.ctxBody('identity', { sidebar: JSON.parse(zijbalk) }));
      if (opgeslagen.status !== 200) throw new Error(`sidebar/save ${opgeslagen.status}`);
      const log: string[] = [];
      await ctx.exposeFunction('__vgLog', (x: string) => { log.push(x); });
      await ctx.addInitScript(([tb, v]) => {
        if (!sessionStorage.getItem('tsv-canonical-tab-v1')) sessionStorage.setItem('tsv-canonical-tab-v1', tb);
        if (!localStorage.getItem('e2e-gezaaid')) { localStorage.setItem('tsv-zijbalk-v2', v); localStorage.setItem('e2e-gezaaid', '1'); }
        // meetpunten: view transitions tellen, voortgangsbalk-toestanden vastleggen
        const w = window as unknown as { __vt: number; __vg: string[] };
        w.__vt = 0; w.__vg = [];
        const d = document as Document & { startViewTransition?: (cb: () => void) => unknown };
        if (typeof d.startViewTransition === 'function') { const o2 = d.startViewTransition.bind(document); d.startViewTransition = (cb: () => void) => { w.__vt++; return o2(cb); }; }
        new MutationObserver(() => { const b2 = document.getElementById('tsv-voortgang'); if (b2) { const s = `${b2.dataset.staat}|${b2.dataset.dienst}|${getComputedStyle(b2.firstElementChild as Element).backgroundColor}`; if (w.__vg[w.__vg.length - 1] !== s) { w.__vg.push(s); (window as unknown as { __vgLog?: (x: string) => void }).__vgLog?.(`${location.host}|${s}`); } } }).observe(document, { subtree: true, childList: true, attributes: true, attributeFilter: ['data-staat'] });
      }, [tab, zijbalk] as const);
      const page = await ctx.newPage();
      page.on('console', (m) => { if (m.type() === 'error' && !/^Failed to load resource/.test(m.text())) fouten.push(`console: ${m.text()}`); });
      page.on('pageerror', (e) => fouten.push(`pageerror: ${e.message}`));
      page.on('response', (q) => { const k = `${q.status()} ${q.url()}`; if (q.status() >= 400 && !VERWACHT.some((v) => v.test(k))) fouten.push(`http ${k}`); });
      await page.goto(o.url, { waitUntil: 'networkidle' });
      await page.locator('.canonical-service-list').waitFor({ state: 'attached', timeout: 20000 });
      await page.waitForTimeout(600);
      return { ctx, page, log };
    };
    const vg = (page: Page) => page.evaluate(() => (window as unknown as { __vg: string[] }).__vg.slice());
    const vt = (page: Page) => page.evaluate(() => (window as unknown as { __vt: number }).__vt);
    const hoofdKnop = (page: Page, d: string) => page.locator(`[data-service-group="${d}"] button[data-vooruit], [data-service-group="${d}"] > button`).first();

    // ---------------------------------------------------------------- 0. headers
    // Via de browser (host-resolver → lokale server), NOOIT via Node-verzoeken (die zouden de echte site raken).
    const ctx0 = await browser.newContext({ serviceWorkers: 'block' });
    const p0 = await ctx0.newPage();
    await p0.goto(`${ID}/robots.txt`);
    const kop = await p0.evaluate(async () => {
      const r = await fetch('/menu', { cache: 'no-store' }), j = await fetch('/speculatie.json', { cache: 'no-store' }), w = await fetch('/service-worker.js', { cache: 'no-store' }), a = await fetch('/api/owner/bootstrap', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
      return { regels: r.headers.get('speculation-rules'), modus: r.headers.get('supports-loading-mode'), csp: r.headers.get('content-security-policy') || '', jsonType: j.headers.get('content-type') || '', jsonOk: j.ok, sw: await w.text(), apiRegels: a.headers.get('speculation-rules') };
    });
    check('HTML: Speculation-Rules-header en credentialed-prerender; CSP ongewijzigd (geen inline regels)', kop.regels === '"/speculatie.json"' && kop.modus === 'credentialed-prerender' && /script-src 'self' 'wasm-unsafe-eval';/.test(kop.csp) && !/inline-speculation-rules/.test(kop.csp), JSON.stringify({ r: kop.regels, m: kop.modus }));
    check('speculatie.json: application/speculationrules+json', kop.jsonOk && /application\/speculationrules\+json/.test(kop.jsonType), kop.jsonType);
    check('service worker in de build: v10 met ingangsbestanden', kop.sw.includes("VERSION='v10'") && kop.sw.includes('entryAssets'));
    check('API-antwoorden krijgen GEEN speculation-header', kop.apiRegels === null);
    await ctx0.close();

    // ---------------------------------------------------------------- 1. binnen een onderdeel: balk in de kleur van Налаштування + overgang
    const A = await sessie({ url: `${ID}/sessions?lang=uk` });
    await A.page.route('**/api/owner/**', async (route) => { await new Promise((r) => setTimeout(r, 700)); await route.continue(); });
    await A.page.locator('[data-service-group="identity"] .canonical-local-page-button', { hasText: 'Методи входу' }).first().click().catch(async () => { await A.page.locator('.canonical-local-page-button').nth(3).click(); });
    await A.page.waitForTimeout(450);
    await A.page.screenshot({ path: `${UIT}/menu-30-voortgang-binnen-onderdeel-licht.png` });
    await A.page.waitForFunction(() => document.getElementById('tsv-voortgang')?.dataset.staat === 'uit', undefined, { timeout: 15000 });
    const sA = await vg(A.page);
    check('binnen een onderdeel: balk zichtbaar («bezig»), daarna «klaar» → «uit»', sA.some((x) => x.startsWith('bezig|identity|')) && sA.some((x) => x.startsWith('klaar|')) && sA[sA.length - 1].startsWith('uit|'), JSON.stringify(sA));
    check('balk in de kleur van Налаштування (licht)', sA.some((x) => x === `bezig|identity|${kleur('identity', 'licht')}`), JSON.stringify(sA));
    check('zachte overgang (View Transition) bij paginawissel', (await vt(A.page)) >= 1, String(await vt(A.page)));
    await A.page.unroute('**/api/owner/**');

    // ---------------------------------------------------------------- 2. vooruitladen bij aanwijzen + naar ander onderdeel: balk in E-mailblauw
    await hoofdKnop(A.page, 'mail').hover(); await A.page.waitForTimeout(400);
    const link = await A.page.evaluate(() => Array.from(document.querySelectorAll<HTMLAnchorElement>('#tsv-vooruit a[data-tsv-vooruit]')).map((a) => `${a.dataset.tsvVooruit}|${a.href}`));
    check('aanwijzen Пошта: onzichtbare prefetch-link naar mail.tarasevych.com (geen prerender)', link.length === 1 && /^prefetch\|https:\/\/mail\.tarasevych\.com\//.test(link[0]), JSON.stringify(link));
    const zichtbaar = await A.page.evaluate(() => { const d = document.getElementById('tsv-vooruit')!; const r = d.getBoundingClientRect(); return r.width * r.height; });
    check('vooruit-container is onzichtbaar en buiten de tabvolgorde', zichtbaar === 0 && await A.page.evaluate(() => Array.from(document.querySelectorAll<HTMLElement>('#tsv-vooruit a')).every((a) => a.tabIndex === -1)));
    await A.page.waitForTimeout(1200);
    await hoofdKnop(A.page, 'mail').click();
    await A.page.waitForURL(/mail\.tarasevych\.com/, { timeout: 20000 });
    await A.page.locator('.canonical-service-list').waitFor({ state: 'attached', timeout: 20000 });
    const nav = await A.page.evaluate(() => { const e = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming & { deliveryType?: string; activationStart?: number }; return { delivery: e?.deliveryType ?? '?', activation: e?.activationStart ?? 0 }; });
    console.log('[e2e] mail-navigatie:', JSON.stringify(nav));
    check('vooruitgeladen: de mail-pagina kwam uit de prefetch (deliveryType navigational-prefetch)', nav.delivery === 'navigational-prefetch', JSON.stringify(nav));
    check('mail geopend en aangemeld (menu zichtbaar, geen aanmeldscherm)', await A.page.locator('[data-service-group="mail"]').count() > 0 && !(await A.page.locator('text=Увійдіть в обліковий запис').isVisible().catch(() => false)));
    await A.ctx.close();
    // naar ander onderdeel (zonder vooruitladen, trage mail-pagina): balk blijft lopen tot de pagina wisselt, in E-mailblauw
    const B = await sessie({ url: `${ID}/sessions?lang=uk`, snelheid: { vooruitladen: false } });
    await hoofdKnop(B.page, 'mail').click();
    await B.page.waitForURL(/mail\.tarasevych\.com/, { timeout: 20000 });
    await B.page.waitForTimeout(400);
    await B.page.screenshot({ path: `${UIT}/menu-31-na-wissel-naar-mail-licht.png` }).catch(() => undefined);
    // Vastgelegd via exposeFunction, dus ook de toestanden van vlak vóór het paginawissel (de oude pagina is dan weg).
    const sB = B.log.filter((x) => x.startsWith('id.tarasevych.com|')).map((x) => x.slice('id.tarasevych.com|'.length));
    check('naar ander onderdeel: balk in E-mailblauw, loopt door tot de pagina wisselt (geen «klaar» op de oude pagina)', sB.some((x) => x === `wacht|mail|${kleur('mail', 'licht')}` || x === `bezig|mail|${kleur('mail', 'licht')}`) && !sB.some((x) => x.startsWith('klaar')), JSON.stringify(sB.slice(-4)));
    check('vooruitladen uit: geen vooruit-links', await B.page.evaluate(() => document.querySelectorAll('#tsv-vooruit a').length) === 0);
    await B.ctx.close();

    // ---------------------------------------------------------------- 3. donker, smal: kleur volgt het thema; minder beweging → geen overgang
    const C = await sessie({ scheme: 'dark', modus: 'dicht', url: 'https://hub.tarasevych.com/?lang=uk', minderBeweging: true });
    await C.page.route('**/api/owner/**', async (route) => { await new Promise((r) => setTimeout(r, 700)); await route.continue(); });
    const hubSub = C.page.locator('.canonical-local-page-button').nth(1);
    await hubSub.click();
    await C.page.waitForTimeout(400);
    await C.page.screenshot({ path: `${UIT}/menu-32-voortgang-hub-donker-smal.png` });
    await C.page.waitForFunction(() => document.getElementById('tsv-voortgang')?.dataset.staat === 'uit', undefined, { timeout: 15000 }).catch(() => undefined);
    const sC = await vg(C.page);
    check('donker: balk in de donkere tint van Мій простір', sC.some((x) => x === `bezig|hub|${kleur('hub', 'donker')}`), JSON.stringify(sC));
    check('minder beweging: geen View Transition', (await vt(C.page)) === 0);
    await C.page.unroute('**/api/owner/**');
    await C.ctx.close();

    // ---------------------------------------------------------------- 4. instellingen: sectie «Швидкість…», experimenteel standaard uit
    const D = await sessie({ url: `${ID}/menu?lang=uk#menu-snelheid` });
    const sectie = D.page.locator('#menu-snelheid');
    await sectie.waitFor({ timeout: 15000 }); await D.page.waitForTimeout(500);
    const standen = await sectie.evaluate((e) => Object.fromEntries(Array.from(e.querySelectorAll<HTMLElement>('[data-meld-schakel]')).map((l) => [l.dataset.meldSchakel, (l.querySelector('input') as HTMLInputElement).checked])));
    check('instellingen: balk/overgangen/vooruitladen aan; prerender en concepten uit', standen.voortgang && standen.overgangen && standen.vooruitladen && !standen.prerender && !standen.concepten, JSON.stringify(standen));
    await D.page.screenshot({ path: `${UIT}/menu-33-instellingen-snelheid-licht.png` });
    await sectie.locator('[data-meld-schakel="voortgang"]').click(); await D.page.waitForTimeout(300);
    await D.page.route('**/api/owner/**', async (route) => { await new Promise((r) => setTimeout(r, 500)); await route.continue(); });
    await D.page.locator('.canonical-local-page-button').first().click(); await D.page.waitForTimeout(700);
    check('balk uit in de instellingen → geen balk', !(await vg(D.page)).some((x) => x.startsWith('bezig')));
    await D.page.unroute('**/api/owner/**');
    await D.ctx.close();

    // ---------------------------------------------------------------- 5. prerender (aan): link «prerender», app start pas bij activering, sessie geldig
    const E = await sessie({ url: `${ID}/sessions?lang=uk`, snelheid: { prerender: true } });
    await hoofdKnop(E.page, 'mail').hover(); await E.page.waitForTimeout(2500);
    const linkE = await E.page.evaluate(() => Array.from(document.querySelectorAll<HTMLAnchorElement>('#tsv-vooruit a[data-tsv-vooruit]')).map((a) => a.dataset.tsvVooruit));
    check('prerender aan: link met data-tsv-vooruit="prerender"', linkE.includes('prerender'), JSON.stringify(linkE));
    await hoofdKnop(E.page, 'mail').click();
    await E.page.waitForURL(/mail\.tarasevych\.com/, { timeout: 20000 });
    await E.page.locator('.canonical-service-list').waitFor({ state: 'attached', timeout: 20000 });
    await E.page.waitForTimeout(1500);
    const navE = await E.page.evaluate(() => { const e = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming & { activationStart?: number; deliveryType?: string }; return { activation: Math.round(e?.activationStart ?? 0), delivery: e?.deliveryType ?? '?' }; });
    console.log('[e2e] prerender-navigatie:', JSON.stringify(navE));
    check('na prerender/openen: E-mail aangemeld (menu, geen aanmeldscherm)', await E.page.locator('[data-service-group="mail"]').count() > 0 && !(await E.page.locator('text=Увійдіть в обліковий запис').isVisible().catch(() => false)), JSON.stringify(navE));
    await E.page.screenshot({ path: `${UIT}/menu-34-na-prerender-mail.png` });
    await E.ctx.close();

    // ---------------------------------------------------------------- 6. concepten: standaard uit → niets bewaard
    const tc = (page: Page) => page.locator('[data-access-section="toegangscodes"]');
    const nieuweCode = async (page: Page) => { await tc(page).getByRole('button', { name: 'Створити код доступу' }).click(); const veld = tc(page).locator('#toegangscode-notitie'); await veld.waitFor({ timeout: 8000 }); return veld; };
    const idb = (page: Page) => page.evaluate(async () => {
      if (!(await indexedDB.databases()).some((d) => d.name === 'tsv-concepten')) return { bestaat: false, rijen: [] as Array<{ id: string; tekst: string; ivLen: number }>, sleutels: [] as Array<{ extractable: boolean; algo: string; usages: string[] }> };
      const db = await new Promise<IDBDatabase>((ok, f) => { const r = indexedDB.open('tsv-concepten'); r.onsuccess = () => ok(r.result); r.onerror = () => f(r.error); });
      const alles = <T>(s: string) => new Promise<T[]>((ok, f) => { const r = db.transaction(s).objectStore(s).getAll(); r.onsuccess = () => ok(r.result as T[]); r.onerror = () => f(r.error); });
      const rijen = (await alles<{ id: string; data: ArrayBuffer; iv: Uint8Array }>('concepten')).map((r) => ({ id: r.id, tekst: new TextDecoder('utf-8', { fatal: false }).decode(r.data), ivLen: r.iv.length }));
      const sleutels = (await alles<{ key: CryptoKey }>('sleutels')).map((s) => ({ extractable: s.key.extractable, algo: (s.key.algorithm as { name: string }).name, usages: s.key.usages }));
      db.close();
      return { bestaat: true, rijen, sleutels };
    });
    const GEHEIM = `Чернетка ${T} — не для очей`;
    const F = await sessie({ url: `${ID}/methods?lang=uk` });
    await tc(F.page).waitFor({ timeout: 20000 });
    await (await nieuweCode(F.page)).fill(GEHEIM); await F.page.waitForTimeout(1200);
    const leeg = await idb(F.page);
    check('concepten uit (standaard): niets in IndexedDB', !leeg.bestaat || leeg.rijen.length === 0, JSON.stringify(leeg).slice(0, 160));
    await F.ctx.close();

    // ---------------------------------------------------------------- 7. concepten aan: versleuteld bewaard, hersteld met melding, «Відкинути», uit = gewist
    const H = await sessie({ url: `${ID}/methods?lang=uk`, snelheid: { concepten: true } });
    await tc(H.page).waitFor({ timeout: 20000 });
    await (await nieuweCode(H.page)).fill(GEHEIM); await H.page.waitForTimeout(1300);
    const vol = await idb(H.page);
    check('concepten aan: één rij, ciphertext bevat de tekst NIET, IV 12 bytes', vol.rijen.length === 1 && !vol.rijen[0].tekst.includes('Чернетка') && !vol.rijen[0].tekst.includes(T) && vol.rijen[0].ivLen === 12, JSON.stringify(vol.rijen.map((r) => ({ id: r.id.split('|').slice(1).join('|'), ivLen: r.ivLen }))));
    check('sleutel: AES-GCM, NIET exporteerbaar, alleen encrypt/decrypt', vol.sleutels.length === 1 && vol.sleutels[0].algo === 'AES-GCM' && vol.sleutels[0].extractable === false && vol.sleutels[0].usages.sort().join() === 'decrypt,encrypt', JSON.stringify(vol.sleutels));
    check('rij-id bevat geen e-mail of gebruikers-id (alleen afgeleide)', !vol.rijen[0].id.includes('@') && /^[0-9a-f]{32}\|id\.tarasevych\.com\|toegangscode-notitie$/.test(vol.rijen[0].id), vol.rijen[0].id);
    const ls = await H.page.evaluate(() => JSON.stringify({ ...localStorage }) + JSON.stringify({ ...sessionStorage }));
    check('tekst staat niet in localStorage/sessionStorage', !ls.includes(GEHEIM) && !ls.includes('Чернетка'));
    await H.page.reload({ waitUntil: 'networkidle' });
    await tc(H.page).waitFor({ timeout: 20000 });
    const veld2 = await nieuweCode(H.page);
    await H.page.waitForTimeout(800);
    check('na herladen: concept teruggezet in het veld', (await veld2.inputValue()) === GEHEIM, await veld2.inputValue());
    const toast = H.page.locator('.canonical-notification-toast');
    check('melding «Чернетку відновлено» met knop «Відкинути»', /Чернетку відновлено/.test(await toast.innerText().catch(() => '')) && await toast.getByRole('button', { name: 'Відкинути' }).count() === 1);
    await H.page.screenshot({ path: `${UIT}/menu-35-concept-hersteld.png` });
    await toast.getByRole('button', { name: 'Відкинути' }).click(); await H.page.waitForTimeout(800);
    check('«Відкинути»: veld leeg en concept weg', (await veld2.inputValue()) === '' && (await idb(H.page)).rijen.length === 0);
    await veld2.fill('opnieuw iets'); await H.page.waitForTimeout(1200);
    check('opnieuw typen: weer bewaard', (await idb(H.page)).rijen.length === 1);
    await H.page.goto(`${ID}/menu?lang=uk#menu-snelheid`, { waitUntil: 'networkidle' });
    await H.page.locator('#menu-snelheid [data-meld-schakel="concepten"]').click(); await H.page.waitForTimeout(800);
    const na = await idb(H.page);
    check('concepten uitzetten: alle concepten en sleutels gewist', na.rijen.length === 0 && na.sleutels.length === 0, JSON.stringify(na).slice(0, 120));
    await H.ctx.close();

    const relevant = fouten.filter((f) => !/ERR_ABORTED|net::ERR_FAILED/.test(f));
    check('geen consolefouten / onverwachte HTTP-fouten', relevant.length === 0, relevant.slice(0, 6).join(' | '));
  } finally {
    await browser.close().catch(() => undefined);
    // Opruimen op EXACT e-mailadres van deze run (nooit op patroon).
    const ids = (await pool.query("select id from app.records where tbl='users' and data->>'email' = $1", [eigenaar]).catch(() => ({ rows: [] as Array<{ id: string }> }))).rows.map((x: { id: string }) => x.id);
    if (ids.length) await pool.query("delete from app.records where id = any($1) or data->>'accountId' = any($1) or data->>'recipientUserId' = any($1) or data->>'userId' = any($1) or data->>'ownerUserId' = any($1)", [ids]).catch((e: unknown) => console.error('[e2e] opruimen', e));
    await stop();
  }
  return einde();
}
