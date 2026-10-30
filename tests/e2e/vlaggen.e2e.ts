// E2E feature flags (etap F, 14.10.2026) in een echte Chrome: eigenaar → technisch profiel → «Прапорці» → nieuwe vlag (uit voor iedereen
// behalve de lijst) → eigen waarde «uit» → standen «Тільки для мене / Для частини / Для всіх» → особиста перевірка → архів → eigen waarde «aan» (ook via OFREP) → wijzigen naar 100 % → test weghalen →
// nog steeds «aan» via de uitrol → verwijderen in twee stappen → onbekend = uit (OFREP 404). Telefoon 390 px: knop in het «⋯»-menu,
// venster zonder horizontaal scrollen. Logboek en geen consolefouten.
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { checker } from '../eenheid/hulp/nep-google';
import { getPool } from '../../server/platform/pg';
import { startE2eServer, chromeArgs } from './server';

const PW = process.env.PLAYWRIGHT_CORE || '/workspace/e2e-tools/node_modules/playwright-core';
const TLS = process.env.E2E_TLS || '/workspace/e2e-tools/tls';
const THEMA = process.env.E2E_THEMA === 'licht' ? 'licht' : 'donker';
const UIT = process.env.E2E_SCREENSHOTS || '/workspace/release-vlaggen-2/screens';
const POORT = Number(process.env.E2E_POORT || 8443);
const CHROME = process.env.CHROME || '/usr/bin/google-chrome';
const ID = 'https://id.tarasevych.com', MCP = 'https://mcp.tarasevych.com';

export async function main(): Promise<number> {
  const { check, einde } = checker(`e2e flags (${THEMA})`);
  const { chromium } = createRequire(import.meta.url)(PW) as typeof import('playwright-core');
  const T = `${Date.now()}-${randomBytes(2).toString('hex')}`;
  const eigenaar = `e2e-vlag-${T}@example.test`, sub = `sub-e2e-vlag-${T}`;
  const sleutel = `e2e-${randomBytes(3).toString('hex')}`;
  const { G, stop } = await startE2eServer({ ownerEmail: eigenaar, poort: POORT, tls: TLS });
  const pool = getPool(), sys = getPool('systeem');
  mkdirSync(UIT, { recursive: true });
  const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: chromeArgs(POORT) });
  let uid = '';
  try {
    const tab = randomBytes(24).toString('hex');
    const b = G.browser();
    const r = await b.aanmelden(sub, eigenaar, { service: 'mcp', tabContext: tab, intent: 'login', authTime: Math.floor(Date.now() / 1000) });
    check('aanmelden', r.cb.data.sessionCreated === true);
    uid = String((await pool.query("select id from app.records where tbl='users' and data->>'email'=$1", [eigenaar])).rows[0]?.id || '');
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: THEMA === 'licht' ? 'light' : 'dark', locale: 'uk-UA', serviceWorkers: 'block' });
    await ctx.addCookies([...b.jar].flatMap(([name, value]) => [ID, MCP].map((url) => ({ name, value, url: `${url}/`, secure: true, httpOnly: true, sameSite: 'Lax' as const }))));
    await ctx.addInitScript((t) => { if (!sessionStorage.getItem('tsv-canonical-tab-v1')) sessionStorage.setItem('tsv-canonical-tab-v1', t); }, tab);
    // Thema vast zetten zoals de site het doet (klas op <html> en .canonical-chrome; src/ontwerp/tokens.css).
    await ctx.addInitScript((t) => { const zet = () => { for (const el of [document.documentElement, ...document.querySelectorAll('.canonical-chrome')]) { el.classList.remove('theme-dark', 'theme-light', 'theme-plum-dark', 'theme-plum-light'); el.classList.add(t); } }; document.addEventListener('DOMContentLoaded', zet); setInterval(zet, 300); }, THEMA === 'licht' ? 'theme-light' : 'theme-dark');
    const page = await ctx.newPage();
    const fouten: string[] = [];
    let verwacht403 = 0; // precies één bewuste weigering (zonder technisch profiel)
    page.on('console', (m) => { if (m.type() === 'error' && !/^Failed to load resource/.test(m.text())) fouten.push(`console: ${m.text()}`); });
    page.on('pageerror', (e) => fouten.push(`pageerror: ${e.message}`));
    page.on('response', (q) => { if (q.status() === 403 && verwacht403 > 0 && /\/api\/beheer\/flags$/.test(q.url())) { verwacht403--; return; } if (q.status() >= 400 && !/\/api\/owner\/agents\/activity$|\/downloads\/extension-version\.json$|\/api\/ofrep\//.test(q.url())) fouten.push(`http ${q.status()} ${q.url()}`); });
    const post = async (pad: string, extra: Record<string, unknown> = {}) => { for (let i = 0; ; i++) { try { return await postEen(pad, extra); } catch (e) { if (i >= 4 || !/context was destroyed|navigation|Failed to fetch/i.test(String(e))) throw e; await page.waitForLoadState('domcontentloaded').catch(() => undefined); await page.waitForTimeout(500); } } };
    const postEen = (pad: string, extra: Record<string, unknown> = {}) => page.evaluate(async ([p, t, e]) => {
      const res = await fetch(p as string, { method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ service: 'mcp', tabContext: t, sourceOrigin: location.origin, ...(e as object) }) });
      return { status: res.status, data: await res.json().catch(() => null) };
    }, [pad, tab, extra] as const);

    await page.goto(`${MCP}/`, { waitUntil: 'domcontentloaded' });
    await page.locator('.canonical-avatar-trigger').first().waitFor({ timeout: 20000 });
    verwacht403 = 1;
    check('zonder technisch profiel: beheerlijst geweigerd', (await post('/api/beheer/flags')).status === 403);
    check('technisch profiel aan', (await post('/api/owner/tech/activeren', { minuten: 30, reden: 'E2E vlaggen' })).status === 200);
    await page.reload({ waitUntil: 'domcontentloaded' });

    // ---------------------------------------------------------------- 1. nieuwe schakelaar (begint uit voor iedereen)
    await page.locator('[data-tech-band] [data-tech-knop="vlaggen"]').click({ timeout: 20000 });
    const v = page.locator('[data-vlaggen-venster]');
    await v.waitFor({ timeout: 10000 });
    check('geen meldingsbalk voor de eigenaar in een actief profiel', (await v.locator('[data-vlag-balk]').count()) === 0);
    await v.locator('[data-vlag-knop="nieuw"]').click();
    await v.locator('[data-vlag-veld="sleutel"]').fill(sleutel);
    await v.locator('[data-vlag-veld="omschrijving"]').fill('E2E: нова функція');
    await v.locator('[data-vlag-knop="opslaan"]').click();
    const rij = v.locator(`[data-vlag="${sleutel}"]`);
    await rij.waitFor({ timeout: 10000 });
    check('nieuwe rij: stand «uit», in «Активні»', await rij.getAttribute('data-vlag-stand') === 'uit');
    const eigen = async () => ((await post('/api/flags', { sleutels: [sleutel] })).data?.vlaggen?.[0] ?? {}) as { value?: boolean; reason?: string; metadata?: { test?: boolean } };
    check('/api/flags: uit, DISABLED', (await eigen()).value === false && (await eigen()).reason === 'DISABLED');
    check('elke rij: precies één tuimelschakelaar, bedienbaar; geen stippelranden', await v.locator('.vlag-rij').evaluateAll((els) => els.every((e) => e.querySelectorAll('.vlag-tuimel').length === 1 && !(e.querySelector('.vlag-tuimel') as HTMLButtonElement).disabled && getComputedStyle(e).borderStyle !== 'dashed')));
    check('in de lijst geen vijf standknoppen (die staan alleen in de lade)', (await v.locator('[data-vlag-stand-knop]').count()) === 0);
    await page.screenshot({ path: `${UIT}/${THEMA}-1440-1-lijst.png` });

    // ---------------------------------------------------------------- 2. lade: «Тільки я», dan «Частина» 25 %
    const lade = page.locator(`[data-vlag-lade="${sleutel}"]`);
    await rij.locator('[data-vlag-knop="openen"]').click();
    await lade.waitFor({ timeout: 5000 });
    const dubbel = await lade.evaluate((el) => { const t = [...el.querySelectorAll('button')].filter((b) => (b as HTMLElement).offsetParent).map((b) => (b.textContent || '').trim()).filter(Boolean); return t.filter((x, i) => t.indexOf(x) !== i); });
    check('lade: geen dubbele zichtbare knoppen; vijf standen in één segmentbalk', dubbel.length === 0 && (await lade.locator('[data-vlag-stand-knop]').count()) === 5, dubbel.join(','));
    await lade.locator('[data-vlag-stand-knop="mij"]').click();
    await lade.locator('[data-vlag-knop="stand-opslaan"]').click();
    await page.waitForFunction((s) => document.querySelector(`[data-vlag="${s}"]`)?.getAttribute('data-vlag-stand') === 'mij', sleutel, { timeout: 10000 }).catch(() => undefined);
    check('«Тільки я»: voor mij aan (lijst), melding «Збережено»', (await eigen()).value === true && (await eigen()).reason === 'TARGETING_MATCH' && await lade.locator('[data-vlag-melding="gelukt"]').isVisible());
    await lade.locator('[data-vlag-stand-knop="deel"]').click();
    await lade.locator('[data-vlag-veld="percentage"]').fill('25');
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${UIT}/${THEMA}-1440-2-lade.png` });
    await lade.locator('[data-vlag-knop="stand-opslaan"]').click();
    await page.waitForFunction((s) => document.querySelector(`[data-vlag="${s}"]`)?.getAttribute('data-vlag-stand') === 'deel', sleutel, { timeout: 10000 }).catch(() => undefined);
    check('«Частина»: pil toont 25 %', /25 %/.test(await rij.locator('[data-vlag-status]').textContent() || ''));
    await lade.locator('[data-vlag-knop="sluiten"]').click();

    // ---------------------------------------------------------------- 3. tuimelschakelaar = voor iedereen, met bevestiging in het venster
    await rij.locator('.vlag-tuimel').click();
    check('tuimel vraagt «Увімкнути для всіх?» in de site (geen native prompt)', await page.locator('[data-vlag-bevestig="alle"]').isVisible());
    await page.screenshot({ path: `${UIT}/${THEMA}-1440-3-vraag.png` });
    await page.locator('[data-vlag-knop="bevestigen"]').click();
    await v.locator('[data-vlag-tab="alle"]').click();
    await v.locator(`[data-vlag="${sleutel}"][data-vlag-stand="alle"]`).waitFor({ timeout: 10000 });
    check('«Для всіх»: in tabblad «Для всіх», waarde aan', (await eigen()).value === true && (await eigen()).metadata?.test !== true);

    // ---------------------------------------------------------------- 4. persoonlijke proef (ingeklapt in de lade), archief
    await rij.locator('[data-vlag-knop="openen"]').click();
    check('persoonlijke proef standaard ingeklapt', !(await lade.locator('details.vlag-eigen').evaluate((d) => (d as HTMLDetailsElement).open)));
    await lade.locator('details.vlag-eigen > summary').click();
    await lade.locator('[data-vlag-test="uit"]').click();
    await page.waitForFunction((s) => document.querySelector(`[data-vlag-lade="${s}"] [data-vlag-voor-mij]`)?.getAttribute('data-vlag-voor-mij') === 'uit', sleutel, { timeout: 10000 }).catch(() => undefined);
    check('persoonlijke proef «uit»: alleen voor mij uit (test)', (await eigen()).value === false && (await eigen()).metadata?.test === true);
    const of = await post(`/api/ofrep/v1/evaluate/flags/${sleutel}`);
    check('OFREP één vlag: 200, value false', of.status === 200 && of.data?.value === false && of.data?.key === sleutel, JSON.stringify(of));
    await lade.locator('[data-vlag-test="weg"]').click();
    await page.waitForFunction((s) => document.querySelector(`[data-vlag-lade="${s}"] [data-vlag-voor-mij]`)?.getAttribute('data-vlag-voor-mij') === 'aan', sleutel, { timeout: 10000 }).catch(() => undefined);
    check('«Без перевірки»: weer aan via de hoofdstand', (await eigen()).value === true && (await eigen()).metadata?.test !== true);
    await lade.locator('[data-vlag-knop="archief"]').click();
    await page.waitForFunction((s) => !!document.querySelector(`[data-vlag-lade="${s}"] [data-vlag-knop="uit-archief"]`), sleutel, { timeout: 10000 }).catch(() => undefined);
    await page.keyboard.press('Escape');
    check('Esc sluit alleen de lade, niet het venster', (await page.locator('[data-vlag-laag]').count()) === 0 && await v.isVisible());
    await v.locator('[data-vlag-tab="archief"]').click();
    await v.locator(`[data-vlag="${sleutel}"]`).waitFor({ timeout: 10000 });
    check('archief: rij in «Архів», nog steeds aan voor iedereen', (await eigen()).value === true);

    // ---------------------------------------------------------------- 5. telefoon 390 px
    await page.setViewportSize({ width: 390, height: 844 });
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.locator('[data-tech-band] [data-tech-knop="meer"]').click({ timeout: 20000 });
    await page.locator('[data-tech-band] [data-tech-knop="vlaggen"]').click();
    await page.locator('[data-vlaggen-venster]').waitFor({ timeout: 10000 });
    await page.locator('[data-vlaggen-venster] [data-vlag-hoe]').click();
    const breed = await page.evaluate(() => { const el = document.querySelector('[data-vlaggen-venster]') as HTMLElement; return el.scrollWidth <= el.clientWidth + 1 && document.documentElement.scrollWidth <= window.innerWidth + 1; });
    check('telefoon 390 px: via «⋯», geen horizontaal scrollen', breed);
    check('«Як це працює?» klapt ter plekke open (geen zwevend venster)', await page.locator('[data-vlag-hoe-tekst]').isVisible() && (await page.locator('[data-tech-vraag]').count()) === 0);
    const tuimelMaat = await page.locator('[data-vlaggen-venster] .vlag-tuimel').first().evaluate((e) => { const r = e.getBoundingClientRect(); return `${Math.round(r.width)}x${Math.round(r.height)}`; });
    check(`tuimelaar slank 44x24 (nu ${tuimelMaat})`, tuimelMaat === '44x24');
    const klein = await page.locator('[data-vlaggen-venster] .vlag-rij-hoofd, [data-vlaggen-venster] [role=tab]').evaluateAll((els) => els.filter((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height < 30; }).length);
    check('telefoon: tikdoelen niet te klein', klein === 0, String(klein));
    await page.screenshot({ path: `${UIT}/${THEMA}-390-1-lijst.png` });
    await page.locator('[data-vlag-tab="archief"]').click();
    const r2 = page.locator(`[data-vlag="${sleutel}"]`);
    await r2.locator('[data-vlag-knop="openen"]').click();
    await lade.waitFor({ timeout: 5000 });
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${UIT}/${THEMA}-390-2-lade.png` });

    // ---------------------------------------------------------------- 6. verwijderen: alleen in de lade, ingeklapt, twee stappen
    await lade.locator('[data-vlag-gevaar] > summary').click();
    await lade.locator('[data-vlag-knop="verwijderen"]').click();
    await lade.locator('[data-vlag-knop="zeker"]').scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${UIT}/${THEMA}-390-3-gevaar.png` });
    await lade.locator('[data-vlag-knop="zeker"]').click();
    await r2.waitFor({ state: 'detached', timeout: 10000 }).catch(() => undefined);
    await page.setViewportSize({ width: 1440, height: 900 });
    const weg = await post(`/api/ofrep/v1/evaluate/flags/${sleutel}`);
    check('na verwijderen: OFREP 404 FLAG_NOT_FOUND, value false', weg.status === 404 && weg.data?.errorCode === 'FLAG_NOT_FOUND' && weg.data?.value === false, JSON.stringify(weg));
    const acties = (await sys.query(`SELECT DISTINCT action FROM app.audit WHERE owner_id=$1 AND action LIKE 'owner.flags.%'`, [uid])).rows.map((x) => x.action).sort();
    check('logboek: gewijzigd, getest, verwijderd', ['owner.flags.getest', 'owner.flags.gewijzigd', 'owner.flags.stand', 'owner.flags.archief', 'owner.flags.verwijderd'].every((a) => acties.includes(a)), acties.join(','));
    check('geen consolefouten', fouten.length === 0, fouten.slice(0, 5).join(' | '));
  } catch (e) {
    check('onverwachte fout', false, String((e as Error)?.stack || e));
  } finally {
    await sys.query('DELETE FROM app.feature_flags WHERE sleutel=$1', [sleutel]).catch(() => undefined);
    if (uid) {
      await sys.query('DELETE FROM app.tech_activaties WHERE user_id=$1', [uid]).catch(() => undefined);
      await sys.query('DELETE FROM app.tech_profielen WHERE user_id=$1', [uid]).catch(() => undefined);
    }
    await browser.close().catch(() => undefined);
    await stop();
  }
  return einde();
}
