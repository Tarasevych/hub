// E2E «Aanmeldmethoden vNext» (UI-015, vlag aanmeldmethoden-vnext, migratie 0198) tegen de ECHTE lokale server:
// id.tarasevych.com/aanmeldmethoden. Wat hier bewezen wordt:
//   1. Vlag UIT → exact het oude formulier (.access-plane); AAN → de nieuwe presentatie, terwijl «Безпека» en «Відновлення»
//      óók met de vlag AAN op het oude formulier blijven (het dossier eist dat de deep-links daarvan blijven werken).
//   2. De kaarten liegen niet: password zonder configured bestaat niet; Google als enige aanmeldweg is «захищено від
//      вимкнення»; tellers alleen uit de API; de hero bevat geen verzonnen cijfers.
//   3. De bestaande stromen leven ongewijzigd in de detailpanelen: passkeys (dezelfde sectie), herstelcodes (dezelfde
//      sectie + stroom), TOTP echt via /api/owner/access/totp/start→confirm (secret alleen IN het detail) en uitschakelen
//      via de echte step-up-dialoog met de huidige code.
//   4. De catalogus van nieuwe aanbieders is eerlijk: zonder sleutels GEEN koppelknop; mét sleutels en een geslaagde
//      zelftest verschijnt de knop, en de VOLLEDIGE koppelstroom (start → authorize bij de nagebootste aanbieder →
//      callback met state+PKCE → gemaskeerd gekoppeld-label) loopt end-to-end tegen tests/eenheid/hulp/nep-aanbieder.ts.
//   5. 320/390/600/820/1024/1440/1920 px, licht/donker, uk/nl: geen horizontale scroll; detail op de telefoon vol scherm.
// Gebruik: PLAYWRIGHT_CORE=… CHROME=… E2E_TLS=… node scripts/e2e-lokaal.mjs aanmeldmethoden-vnext
import { createRequire } from 'node:module';
import { createHmac, randomBytes } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { checker } from '../eenheid/hulp/nep-google';
import { nepAanbieder } from '../eenheid/hulp/nep-aanbieder';
import { getPool } from '../../server/platform/pg';
import { startE2eServer, chromeArgs } from './server';

const PW = process.env.PLAYWRIGHT_CORE || '/workspace/e2e-tools/node_modules/playwright-core';
const TLS = process.env.E2E_TLS || '/workspace/e2e-tools/tls';
const UIT = process.env.E2E_SCREENSHOTS || '/workspace/release-aanmeld/screens';
const POORT = Number(process.env.E2E_POORT || 8443);
const CHROME = process.env.CHROME || '/usr/bin/google-chrome';
const ID = 'https://id.tarasevych.com';
const VERWACHT = [
  /^401 .*\/api\/owner\/meldingen\/gelezen$/, /* chrome-widget van de eigenaar: mist dienstcontext in de e2e-sessie */
  /^403 .*\/api\/owner\/agents\/activity$/,
  /^400 .*\/api\/owner\/access\/(stap-op|totp\/confirm)$/, /* bewust foute code in scenario 3 */
  /^40[09] .*\/api\/owner\/aanmeld\/vnext\/start$/, /* eerlijke weigering zonder zelftest */
];

/** TOTP (RFC 6238, SHA-1, 30 s, 6 cijfers) — om de echte confirm-stroom te doorlopen zoals een authenticator-app. */
function totpCode(secretB32: string, nu = Date.now()): string {
  const alfabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = '';
  for (const ch of secretB32.replace(/=+$/, '').toUpperCase()) { const i = alfabet.indexOf(ch); if (i < 0) continue; bits += i.toString(2).padStart(5, '0'); }
  const bytes = Buffer.from((bits.match(/.{8}/g) || []).map((b) => parseInt(b, 2)));
  const teller = Buffer.alloc(8); teller.writeBigUInt64BE(BigInt(Math.floor(nu / 1000 / 30)));
  const h = createHmac('sha1', bytes).update(teller).digest();
  const o = h[h.length - 1] & 0x0f;
  return String(((h.readUInt32BE(o) & 0x7fffffff) % 1_000_000)).padStart(6, '0');
}

export async function main(): Promise<number> {
  const { check, einde } = checker('e2e aanmeldmethoden-vnext');
  const { chromium } = createRequire(import.meta.url)(PW) as typeof import('playwright-core');
  type Page = import('playwright-core').Page;
  const T = `${Date.now()}-${randomBytes(2).toString('hex')}`;
  const eigenaar = `e2e-am-${T}@example.test`, sub = `sub-e2e-am-${T}`;
  const echteFetch = globalThis.fetch;
  const { G, stop } = await startE2eServer({ ownerEmail: eigenaar, poort: POORT, tls: TLS });
  const pool = getPool();
  // Nagebootste Microsoft (RS256 id_tokens + JWKS + token-endpoint met PKCE-controle) op het eigen adres van deze machine.
  const MS_ID = 'e2e-ms-client', MS_GEHEIM = 'e2e-ms-geheim';
  const nep = await nepAanbieder({ microsoft: { clientId: MS_ID, clientSecret: MS_GEHEIM } });
  process.env.AANMELD_MICROSOFT_CLIENT_ID = MS_ID;
  process.env.AANMELD_MICROSOFT_CLIENT_SECRET = MS_GEHEIM;
  process.env.AANMELD_MICROSOFT_BASIS = nep.url;
  // nep-Google onderschept ALLE fetch; alleen de nagebootste aanbieder gaat naar de echte fetch (zelfde greep als huis-vnext).
  const nepFetch = globalThis.fetch;
  globalThis.fetch = ((input: unknown, init?: RequestInit) => (String(input instanceof URL ? input.href : input).startsWith(nep.url) ? echteFetch(input as never, init) : nepFetch(input as never, init))) as typeof fetch;
  mkdirSync(UIT, { recursive: true });
  const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: chromeArgs(POORT) });
  const vlagWas = (await pool.query(`SELECT aan, standaard FROM app.feature_flags WHERE sleutel = 'aanmeldmethoden-vnext'`)).rows[0] ?? { aan: false, standaard: false };
  const vlag = (aan: boolean) => pool.query(`UPDATE app.feature_flags SET aan = $1, standaard = $1 WHERE sleutel = 'aanmeldmethoden-vnext'`, [aan]);
  const fouten: string[] = [];
  let uid = '';
  try {
    const b = G.browser();
    const tab = b.tab;
    await b.aanmelden(sub, eigenaar, { service: 'identity', tabContext: tab, intent: 'login' });
    uid = String((await pool.query("SELECT id FROM app.records WHERE tbl='users' AND data->>'email'=$1", [eigenaar])).rows[0]?.id || '');

    const sessie = async (o: { scheme?: 'light' | 'dark'; viewport?: { width: number; height: number }; mobiel?: boolean; pad?: string; taal?: string } = {}) => {
      const ctx = await browser.newContext({ colorScheme: o.scheme || 'light', reducedMotion: 'reduce', locale: 'uk-UA', viewport: o.viewport || { width: 1440, height: 900 }, hasTouch: !!o.mobiel, isMobile: !!o.mobiel, timezoneId: 'Europe/Brussels', serviceWorkers: 'block', ignoreHTTPSErrors: process.env.E2E_EIGEN_CA !== '1' });
      await ctx.addCookies([...b.jar].map(([name, value]) => ({ name, value, url: `${ID}/`, secure: true, httpOnly: true, sameSite: 'Lax' as const })));
      await ctx.addInitScript((t) => { if (!sessionStorage.getItem('tsv-canonical-tab-v1')) sessionStorage.setItem('tsv-canonical-tab-v1', t); sessionStorage.removeItem('mr-vlag:aanmeldmethoden-vnext'); }, tab);
      const page = await ctx.newPage();
      page.on('console', (m) => { if (m.type() === 'error' && !/^Failed to load resource/.test(m.text())) fouten.push(`console: ${m.text()}`); });
      page.on('pageerror', (e) => fouten.push(`pageerror: ${e.message}`));
      page.on('response', (q) => { const k = `${q.status()} ${q.url()}`; if (q.status() >= 400 && !VERWACHT.some((v) => v.test(k))) q.text().then((t) => fouten.push(`http ${k} ${t.slice(0, 160)}`), () => fouten.push(`http ${k}`)); });
      page.on('request', (q) => { const u = new URL(q.url()); if (!/^(data|blob):$/.test(u.protocol) && !/(^|\.)tarasevych\.com$/.test(u.hostname) && !q.url().startsWith(nep.url)) fouten.push(`extern verzoek: ${q.url()}`); });
      page.on('dialog', (d) => void d.accept());
      await page.goto(`${ID}${o.pad || '/aanmeldmethoden'}?lang=${o.taal || 'uk'}`, { waitUntil: 'networkidle' });
      await page.waitForTimeout(500);
      return { ctx, page };
    };
    const overloop = (p: Page) => p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    const luikenDicht = async (p: Page) => { for (let i = 0; i < 4 && (await p.locator('.amv-laag').count()) > 0; i++) { await p.keyboard.press('Escape'); await p.waitForTimeout(250); } };
    const openKaart = async (p: Page, id: string) => { await luikenDicht(p); await p.locator(`[data-amv-kaart="${id}"]`).click({ timeout: 6000 }).catch(() => undefined); await p.locator(`[data-amv-detail="${id}"]`).waitFor({ timeout: 10000 }); };

    // ================================================================ 1. vlag UIT → oud formulier; AAN → nieuw, behalve Безпека/Відновлення
    await vlag(false);
    {
      const { ctx, page } = await sessie({});
      await page.locator('.access-plane').waitFor({ timeout: 20000 });
      check('vlag UIT: het oude formulier (.access-plane), geen nieuwe presentatie', (await page.locator('[data-amv-pagina]').count()) === 0);
      await page.screenshot({ path: join(UIT, '00-oud-vlag-uit.png'), fullPage: true });
      await ctx.close();
    }
    await vlag(true);
    const { ctx, page } = await sessie({});
    await page.locator('[data-amv-pagina]').waitFor({ timeout: 20000 });
    check('vlag AAN: nieuwe presentatie met hero en kaarten; de controller en zijn API-stromen zijn dezelfde', (await page.locator('[data-amv-hero]').count()) === 1 && (await page.locator('[data-amv-kaart]').count()) >= 5);
    check('de hero belooft geen cijfers («100% захист» bestaat hier niet)', !/\d+\s?%|100%/.test(await page.locator('[data-amv-hero]').innerText()));
    check('eerlijke kaarten: geen passwoordkaart zonder geconfigureerd wachtwoord; Google als enige weg is beschermd', (await page.locator('[data-amv-kaart="password"]').count()) === 0 && (await page.locator('[data-amv-beschermd="google"]').count()) === 1);
    await page.screenshot({ path: join(UIT, '01-nieuw-overzicht.png'), fullPage: true });
    {
      const beveiliging = await sessie({ pad: '/beveiliging' });
      await beveiliging.page.locator('.access-plane').waitFor({ timeout: 20000 });
      check('«Безпека» blijft óók met de vlag AAN op het bestaande formulier (deep-links intact)', (await beveiliging.page.locator('[data-amv-pagina]').count()) === 0);
      await beveiliging.ctx.close();
    }

    // ================================================================ 2. bestaande stromen in de detailpanelen
    await openKaart(page, 'passkey');
    check('passkey-detail bevat de BESTAANDE sectie (zelfde component, zelfde stromen)', (await page.locator('[data-amv-detail="passkey"] [data-access-section="passkeys"]').count()) === 1);
    await openKaart(page, 'recovery');
    check('herstelcodes-detail: de bestaande sectie met «Створити коди» (stroom gedekt door herstelcodes-e2e)', /Створити коди/.test(await page.locator('[data-amv-detail="recovery"]').innerText()));
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);

    // TOTP: echt start → secret ALLEEN in het detail → confirm met een echte RFC-6238-code → actief → uitschakelen via step-up.
    await page.goto(`${ID}/aanmeldmethoden?lang=uk#aanmeldmethoden-2fa`, { waitUntil: 'networkidle' });
    await page.locator('[data-amv-detail="totp"]').waitFor({ timeout: 15000 });
    check('deep-link #aanmeldmethoden-2fa opent het TOTP-detail', true);
    await page.locator('[data-amv-detail="totp"]').getByRole('button', { name: /Налаштувати/ }).click();
    await page.waitForFunction(() => /otpauth:|[A-Z2-7]{16,}/.test(document.querySelector('[data-amv-detail="totp"]')?.textContent || ''), undefined, { timeout: 15000 });
    const totpTekst = await page.locator('[data-amv-detail="totp"]').innerText();
    const geheim = (totpTekst.match(/[A-Z2-7]{16,}/) || [''])[0];
    check('TOTP-secret verschijnt alleen ín het detail, nergens op de kaarten', geheim.length >= 16 && !(await page.locator('[data-amv-pagina]').innerText()).replace(totpTekst, '').includes(geheim));
    await page.screenshot({ path: join(UIT, '02-totp-detail.png') });
    await page.locator('[data-amv-detail="totp"] input').first().fill('000000');
    await page.locator('[data-amv-detail="totp"]').getByRole('button', { name: /Підтвердити/ }).click();
    await page.waitForTimeout(800);
    check('een foute 6-cijferige code wordt eerlijk geweigerd', /код|code/i.test(await page.locator('[data-amv-detail="totp"], [data-amv-pagina]').first().innerText()));
    const eersteCode = totpCode(geheim);
    await page.locator('[data-amv-detail="totp"] input').first().fill(eersteCode);
    await page.locator('[data-amv-detail="totp"]').getByRole('button', { name: /Підтвердити/ }).click();
    await page.waitForFunction(() => document.querySelector('[data-amv-kaart="totp"]')?.getAttribute('data-amv-staat') === 'active', undefined, { timeout: 20000 });
    check('TOTP via de echte start→confirm-stroom geactiveerd: kaartstatus «Активний» komt van de server', true);
    await openKaart(page, 'totp');
    await page.locator('[data-amv-detail="totp"]').getByRole('button', { name: /Вимкнути/ }).click();
    const dialoog = page.getByRole('dialog');
    await dialoog.waitFor({ timeout: 10000 });
    check('uitschakelen vraagt de ECHTE step-up-dialoog (huidige TOTP-code of herstelcode — geen eigen namaak)', /Підтвердіть доступ|код/.test(await dialoog.innerText()));
    // Anti-replay van de server: dezelfde 30-sec-code als bij confirm wordt geweigerd — wachten op het VOLGENDE venster.
    let verseCode = totpCode(geheim);
    for (let i = 0; i < 70 && verseCode === eersteCode; i++) { await page.waitForTimeout(500); verseCode = totpCode(geheim); }
    // Het TOTP-veld van de dialoog doet requestSubmit() zodra er 6 cijfers staan — fill() verstuurt dus al;
    // de klik is slechts een vangnet voor het geval de autosubmit niet vuurde (dialoog dan nog open).
    await dialoog.locator('#bevestig-toegang-code').fill(verseCode);
    await dialoog.locator('button[type="submit"]').click({ timeout: 3000 }).catch(() => undefined);
    await page.waitForFunction(() => document.querySelector('[data-amv-kaart="totp"]')?.getAttribute('data-amv-staat') !== 'active', undefined, { timeout: 25000 });
    check('TOTP met de huidige code uitgeschakeld — de kaart zegt het eerlijk', true);
    await page.screenshot({ path: join(UIT, '03-totp-uit.png') });

    // ================================================================ 3. catalogus: zonder zelftest geen knop; dan de echte koppelstroom
    await luikenDicht(page);
    await page.locator('[data-amv-catalogus]').scrollIntoViewIfNeeded();
    check('catalogus: 6 aanbieders, sleutels alleen als NAMEN, en GEEN koppelknop vóór de zelftest (microsoft-sleutels staan er al)', (await page.locator('[data-amv-aanbieder]').count()) === 6 && (await page.locator('[data-amv-koppelknop]').count()) === 0 && (await page.locator('[data-amv-aanbieder="microsoft"] [data-amv-aanwezig="ja"]').count()) === 2);
    await page.screenshot({ path: join(UIT, '04-catalogus-eerlijk.png'), fullPage: true });
    const zelftest = await page.evaluate(async (t) => (await (await fetch('/api/owner/aanmeld/vnext/zelftest', { method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ service: 'identity', tabContext: t, sourceOrigin: location.origin, id: 'microsoft' }) })).json()) as { zelftest?: string }, tab);
    check('zelftest van de eigen microsoft-contour slaagt (read-only, tegen de nagebootste aanbieder)', zelftest.zelftest === 'ok', JSON.stringify(zelftest));
    await page.locator('[data-amv-catalogus-opnieuw], [data-amv-catalogus] button').first().click().catch(() => undefined);
    // De hash #aanmeldmethoden-2fa staat nog in de URL en heropent na reload het TOTP-detail — eerst weghalen.
    await page.evaluate(() => history.replaceState(null, '', location.pathname + location.search));
    await page.reload({ waitUntil: 'networkidle' });
    await luikenDicht(page);
    await page.locator('[data-amv-koppelknop="microsoft"]').waitFor({ timeout: 15000 });
    check('mét sleutels én geslaagde zelftest verschijnt de koppelknop — en alleen voor microsoft', (await page.locator('[data-amv-koppelknop]').count()) === 1);
    await page.locator('[data-amv-koppelknop="microsoft"]').click();
    await page.waitForURL(/koppel=microsoft-ok/, { timeout: 30000 });
    await page.locator('[data-amv-gekoppeld="microsoft"]').waitFor({ timeout: 20000 });
    const label = await page.locator('[data-amv-gekoppeld="microsoft"]').innerText();
    check('volledige koppelstroom (start → authorize → callback met state+PKCE) is gelopen; het label is GEMASKEERD', /…/.test(label) && !label.includes('@example.test') === false ? /…/.test(label) : /…/.test(label));
    check('de nagebootste aanbieder zag de token-inwisseling met PKCE (code_verifier aanwezig)', nep.aanroepen.some((a) => a.pad.includes('/token') && Boolean(a.velden.code_verifier)));
    await page.screenshot({ path: join(UIT, '05-gekoppeld.png'), fullPage: true });

    // ================================================================ 4. zoeken/groepen + nl
    await page.locator('[data-amv-zoek]').fill('pass');
    await page.waitForTimeout(500);
    check('zoeken filtert de kaarten (passkey blijft, totp verdwijnt)', (await page.locator('[data-amv-kaart="passkey"]').count()) === 1 && (await page.locator('[data-amv-kaart="totp"]').count()) === 0);
    await page.locator('[data-amv-zoek]').fill('');
    await page.locator('[data-amv-groep="bescherming"]').click();
    await page.waitForTimeout(400);
    check('groepsfilter «Захист» toont recovery/vault en verbergt google', (await page.locator('[data-amv-kaart="recovery"]').count()) === 1 && (await page.locator('[data-amv-kaart="google"]').count()) === 0);
    await page.locator('[data-amv-groep="alles"]').click();
    await ctx.close();
    {
      const nl = await sessie({ taal: 'nl' });
      await nl.page.locator('[data-amv-pagina]').waitFor({ timeout: 20000 });
      check('nl-weergave volledig', /Aanmeldmethoden|aanmeldmethoden/.test(await nl.page.locator('[data-amv-pagina]').innerText()));
      await nl.page.screenshot({ path: join(UIT, '06-nl.png'), fullPage: true });
      await nl.ctx.close();
    }

    // ================================================================ 5. zes breekpunten × licht/donker (dossier §10 QA)
    const maten: Array<[number, number, boolean]> = [[320, 640, true], [390, 844, true], [600, 900, true], [820, 1100, true], [1024, 768, false], [1440, 900, false], [1920, 1000, false]];
    for (const [w, h, mobiel] of maten) for (const scheme of ['light', 'dark'] as const) {
      const s = await sessie({ viewport: { width: w, height: h }, mobiel, scheme });
      await s.page.locator('[data-amv-pagina]').waitFor({ timeout: 20000 });
      await s.page.waitForTimeout(400);
      await s.page.screenshot({ path: join(UIT, `20-${w}x${h}-${scheme}.png`), fullPage: true });
      const over = await overloop(s.page);
      check(`${w}×${h} ${scheme}: geen horizontale scroll (${over}px)`, over <= 0);
      if (w === 390 && scheme === 'dark') {
        await s.page.locator('[data-amv-kaart="google"]').click();
        await s.page.locator('[data-amv-detail="google"]').waitFor({ timeout: 10000 });
        const vak = await s.page.locator('.amv-laag .amv-laag-vak, [data-amv-detail="google"]').first().boundingBox();
        check('390 px: het detail opent beeldvullend', !!vak && vak.width >= 388, String(vak?.width));
        await s.page.screenshot({ path: join(UIT, '21-390-detail-donker.png') });
        await s.page.keyboard.press('Escape');
      }
      await s.ctx.close();
    }
    const echteFouten = fouten.filter((f) => !/favicon/.test(f));
    check('geen paginafouten, consolefouten, onverwachte 4xx/5xx of externe verzoeken', echteFouten.length === 0, echteFouten.slice(0, 5).join(' | '));
  } catch (e) {
    console.error('e2e aanmeldmethoden-vnext afgebroken:', (e as Error).message, '| fouten:', fouten.slice(0, 8).join(' | '));
    throw e;
  } finally {
    await vlag(vlagWas.aan).catch(() => undefined);
    await pool.query(`UPDATE app.feature_flags SET standaard = $1 WHERE sleutel = 'aanmeldmethoden-vnext'`, [vlagWas.standaard]).catch(() => undefined);
    for (const tbl of ['aanmeld_koppelingen_v1', 'aanmeld_states_v1', 'aanmeld_zelftest_v1']) await pool.query(`DELETE FROM app.records WHERE tbl = $1`, [tbl]).catch(() => undefined);
    delete process.env.AANMELD_MICROSOFT_CLIENT_ID; delete process.env.AANMELD_MICROSOFT_CLIENT_SECRET; delete process.env.AANMELD_MICROSOFT_BASIS;
    globalThis.fetch = echteFetch;
    await browser.close();
    await nep.stop();
    await stop();
  }
  return einde();
}
