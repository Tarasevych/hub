// E2E vensterbeheer — het incident van 9.10 nagespeeld met een echte Chrome:
// Claude vraagt toegang (OAuth) → op mcp.*/agents het venster «Доступ для Claude» → «Дозволити» → de server vraagt een verse
// bevestiging (aanmelding > 5 min oud) → het venster «Підтвердіть доступ» MOET boven het toestemmingsvenster staan (echt
// zichtbaar en klikbaar, het toestemmingsvenster is inert), het dok toont beide vensters en «чекає підтвердження».
// Daarna: minimaliseren → dok → terug, slepen, grootte wijzigen, toetsenbord; passkey op mcp.* (vroeger SERVICE_NOT_ALLOWED)
// → toestemming gaat door → terug naar claude.ai met een code. Licht thema + axe op beide vensters, geen consolefouten.
import { createRequire } from 'node:module';
import { mkdirSync, readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { createHash, generateKeyPairSync, randomBytes } from 'node:crypto';
import { checker } from '../eenheid/hulp/nep-google';
import { getPool } from '../../server/platform/pg';
import * as kern from '../../deploy/goedkeuring/webauthn-kern.mjs';
import { startE2eServer, chromeArgs } from './server';

const PW = process.env.PLAYWRIGHT_CORE || '/workspace/e2e-tools/node_modules/playwright-core';
const AXE = process.env.AXE_CORE || join(dirname(PW), 'axe-core', 'axe.min.js');
const TLS = process.env.E2E_TLS || '/workspace/e2e-tools/tls';
const UIT = process.env.E2E_SCREENSHOTS || '/workspace/audit-20261008';
const POORT = Number(process.env.E2E_POORT || 8443);
const CHROME = process.env.CHROME || '/usr/bin/google-chrome';
const ID = 'https://id.tarasevych.com', MCP = 'https://mcp.tarasevych.com';
const CB = 'https://claude.ai/api/mcp/auth_callback';
// Verwacht: extension-version.json ontbreekt in een lokale build zonder extensie; de 403 STEP_UP_REQUIRED op de toestemming (daarop opent het bevestigingsvenster) en agents/activity zonder step-up.
const VERWACHT = [/^404 .*\/downloads\/extension-version\.json$/, /^403 .*\/api\/owner\/mcp-connector\/consent$/, /^403 .*\/api\/owner\/agents\/activity$/];

export async function main(): Promise<number> {
  const { check, einde } = checker('e2e vensters');
  const { chromium } = createRequire(import.meta.url)(PW) as typeof import('playwright-core');
  type Page = import('playwright-core').Page;
  const T = `${Date.now()}-${randomBytes(2).toString('hex')}`;
  const eigenaar = `e2e-vs-${T}@example.test`, sub = `sub-e2e-vs-${T}`;
  const { G, stop } = await startE2eServer({ ownerEmail: eigenaar, poort: POORT, tls: TLS });
  const pool = getPool(), sys = getPool('systeem');
  mkdirSync(UIT, { recursive: true });
  const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: chromeArgs(POORT) });
  let uid = '';
  try {
    const tab = randomBytes(24).toString('hex');
    const b = G.browser();
    // Aanmelding van een uur geleden: toegang geven aan een AI vraagt dan een verse bevestiging.
    await b.aanmelden(sub, eigenaar, { service: 'mcp', tabContext: tab, intent: 'login', authTime: Math.floor(Date.now() / 1000) - 3600 });
    uid = String((await pool.query("select id from app.records where tbl='users' and data->>'email'=$1", [eigenaar])).rows[0]?.id || '');
    // Passkey van de eigenaar: in de database (publiek) en in de virtuele authenticator (privé).
    const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
    const jwk = publicKey.export({ format: 'jwk' }) as { x: string; y: string };
    const sleutel = { alg: -7, jwk: { kty: 'EC', crv: 'P-256', x: jwk.x, y: jwk.y } };
    const credId = randomBytes(32);
    await sys.query(`INSERT INTO app.passkeys (user_id, credential_id, alg, jwk, vingerafdruk, naam, sign_count) VALUES ($1, $2, -7, $3::jsonb, $4, 'Телефон', 1)`,
      [uid, credId.toString('base64url'), JSON.stringify(sleutel.jwk), kern.vingerafdruk(sleutel)]);

    const ctx = await browser.newContext({ colorScheme: 'light', locale: 'uk-UA', viewport: { width: 1280, height: 900 }, timezoneId: 'Europe/Brussels', serviceWorkers: 'block' });
    await ctx.addCookies([...b.jar].flatMap(([name, value]) => [ID, MCP].map((url) => ({ name, value, url: `${url}/`, secure: true, httpOnly: true, sameSite: 'Lax' as const }))));
    await ctx.addInitScript((t) => { if (!sessionStorage.getItem('tsv-canonical-tab-v1')) sessionStorage.setItem('tsv-canonical-tab-v1', t); }, tab);
    let terugNaarClaude = '';
    await ctx.route('https://claude.ai/**', async (route) => { terugNaarClaude = route.request().url(); await route.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><title>claude</title>ok' }); });
    const page = await ctx.newPage();
    const cdp = await ctx.newCDPSession(page);
    await cdp.send('WebAuthn.enable');
    const { authenticatorId } = await cdp.send('WebAuthn.addVirtualAuthenticator', { options: { protocol: 'ctap2', transport: 'internal', hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true } });
    await cdp.send('WebAuthn.addCredential', { authenticatorId, credential: { credentialId: credId.toString('base64'), isResidentCredential: false, rpId: 'tarasevych.com', privateKey: privateKey.export({ type: 'pkcs8', format: 'der' }).toString('base64'), signCount: 1 } });
    const fouten: string[] = [];
    page.on('console', (m) => { if (m.type() === 'error' && !/^Failed to load resource/.test(m.text())) fouten.push(`console: ${m.text()}`); });
    page.on('pageerror', (e) => fouten.push(`pageerror: ${e.message}`));
    page.on('response', (q) => { const k = `${q.status()} ${q.url()}`; if (q.status() >= 400 && !VERWACHT.some((v) => v.test(k))) fouten.push(`http ${k}`); });

    // ---------------------------------------------------------------- Claude start de koppeling
    await page.goto(`${MCP}/agents?lang=uk`, { waitUntil: 'domcontentloaded' }).catch((e) => { throw new Error(`agents: ${page.url()} ${e.message.slice(0, 120)}`); });
    const reg = await page.evaluate(async (cb) => { const r = await fetch('/oauth2/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ client_name: 'Claude', redirect_uris: [cb] }) }); return r.json(); }, CB);
    const verifier = randomBytes(40).toString('base64url');
    const challenge = createHash('sha256').update(verifier).digest('base64url');
    const q = new URLSearchParams({ response_type: 'code', client_id: String(reg.client_id), redirect_uri: CB, code_challenge: challenge, code_challenge_method: 'S256', state: 'st-e2e', resource: `${MCP}/mcp` });
    await page.goto(`${MCP}/oauth2/authorize?${q}`, { waitUntil: 'domcontentloaded' }).catch((e) => { throw new Error(`authorize: ${page.url()} ${e.message.slice(0, 120)}`); });
    const toestemming = page.locator('[data-venster="mcp-toestemming"]');
    await toestemming.waitFor({ timeout: 20000 });
    check('toestemmingsvenster «Доступ для Claude» in het vensterbeheer (titelbalk met згорнути/розгорнути)', await toestemming.locator('[data-venster-knop="min"]').count() === 1 && await toestemming.locator('[data-venster-knop="max"]').count() === 1);
    await page.screenshot({ path: `${UIT}/vensters-1-toestemming.png` });

    // ---------------------------------------------------------------- «Дозволити» → bevestigen MOET bovenaan staan
    await toestemming.getByRole('button', { name: 'Дозволити' }).click();
    const bevestig = page.locator('[data-venster="bevestig-toegang"]');
    await bevestig.waitFor({ state: 'visible', timeout: 15000 });
    await page.waitForTimeout(300);
    const laag = await page.evaluate(() => {
      const a = document.querySelector<HTMLElement>('[data-venster="bevestig-toegang"]')!, c = document.querySelector<HTMLElement>('[data-venster="mcp-toestemming"]')!;
      const r = a.getBoundingClientRect();
      const midden = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return { za: Number(getComputedStyle(a).zIndex), zc: Number(getComputedStyle(c).zIndex), zichtbaar: !!midden && a.contains(midden), inert: c.inert, boven: a.dataset.bovenaan };
    });
    check('«Підтвердіть доступ» staat BOVEN het toestemmingsvenster: hoger in de laag, echt zichtbaar in het midden, toestemming inert',
      laag.za > laag.zc && laag.zichtbaar && laag.inert === true && laag.boven === '1', JSON.stringify(laag));
    const dok = page.locator('nav.venster-dok');
    // 21.10.2026: het bovenste open venster staat niet nog eens in het dok (alleen als kopje «Зараз відкрите»); de lijst is een menu.
    check('dok: menu standaard dicht; alleen het ANDERE venster, toestemming «чекає підтвердження»; bovenste als «Зараз відкрите»',
      await dok.locator('.venster-dok-kop').getAttribute('aria-expanded') === 'false' && await dok.locator('[data-dok-venster]').count() === 1
      && /чекає підтвердження/.test(await dok.locator('[data-dok-venster="mcp-toestemming"]').textContent() || '') && /Зараз відкрите/.test(await dok.locator('.venster-dok-nu').textContent() || ''));
    await page.screenshot({ path: `${UIT}/vensters-2-bevestigen-boven.png` });

    // ---------------------------------------------------------------- minimaliseren, terughalen, slepen, grootte, toetsenbord
    await bevestig.locator('[data-venster-knop="min"]').click();
    const nakleinVerborgen = await bevestig.isHidden();
    check('minimaliseren: venster weg, dok-item «Показати»/waarschuwing blijft', nakleinVerborgen && await dok.locator('[data-dok-venster="bevestig-toegang"]').count() === 1);
    await dok.locator('.venster-dok-kop').click(); // menu openen (alleen op een tik)
    await dok.locator('[data-dok-venster="bevestig-toegang"]').click();
    await bevestig.waitFor({ state: 'visible' });
    check('terughalen via het dok: weer bovenaan', await bevestig.getAttribute('data-bovenaan') === '1');
    const voor = await bevestig.boundingBox();
    const kop = bevestig.locator('.venster-kop');
    const kb = (await kop.boundingBox())!;
    await page.mouse.move(kb.x + 60, kb.y + kb.height / 2); await page.mouse.down(); await page.mouse.move(kb.x - 140, kb.y + 60, { steps: 6 }); await page.mouse.up();
    const na = await bevestig.boundingBox();
    check('slepen aan de titelbalk verplaatst het venster', !!voor && !!na && Math.abs(na.x - (voor.x - 200)) < 4 && Math.abs(na.y - (voor.y + 60 - kb.height / 2 + kb.height / 2)) < 70, JSON.stringify([voor, na]));
    const greep = (await bevestig.locator('.venster-grootte').boundingBox())!;
    await page.mouse.move(greep.x + 9, greep.y + 9); await page.mouse.down(); await page.mouse.move(greep.x + 129, greep.y + 49, { steps: 6 }); await page.mouse.up();
    const groter = await bevestig.boundingBox();
    check('grootte wijzigen met de hoek: 120 px breder', !!groter && !!na && Math.abs(groter.width - (na.width + 120)) < 4, JSON.stringify([na?.width, groter?.width]));
    await bevestig.locator('.venster-greep').focus();
    const x0 = (await bevestig.boundingBox())!.x;
    await page.keyboard.press('ArrowRight'); await page.keyboard.press('ArrowRight');
    check('toetsenbord: pijltjes verplaatsen (2 × 16 px)', Math.abs((await bevestig.boundingBox())!.x - (x0 + 32)) < 2);
    const axeB = await axe(page, '[data-venster="bevestig-toegang"]');
    check('axe: bevestigingsvenster zonder schendingen', axeB.length === 0, axeB.join('\n'));

    // ---------------------------------------------------------------- passkey op mcp.* → toestemming gaat door → terug naar Claude
    await bevestig.getByRole('button', { name: 'Використати passkey' }).click();
    await page.waitForURL(/claude\.ai/, { timeout: 20000 }).catch(() => undefined);
    const u = terugNaarClaude ? new URL(terugNaarClaude) : null;
    check('passkey op mcp.* werkt (geen SERVICE_NOT_ALLOWED) en Claude krijgt de code terug (state klopt)', !!u && u.pathname === '/api/mcp/auth_callback' && !!u.searchParams.get('code') && u.searchParams.get('state') === 'st-e2e', terugNaarClaude || page.url());
    check('geen consolefouten of onverwachte HTTP-fouten', fouten.length === 0, fouten.slice(0, 8).join('\n'));
    await ctx.close();
  } catch (e) {
    check('e2e liep zonder uitzondering', false, String((e as Error)?.stack || e).slice(0, 800));
  } finally {
    if (uid) await sys.query('DELETE FROM app.passkeys WHERE user_id = $1', [uid]).catch(() => undefined);
    await browser.close().catch(() => undefined);
    await stop();
  }
  return einde();

  async function axe(page: Page, sel: string) {
    if (!existsSync(AXE)) return ['axe-core ontbreekt'];
    await page.evaluate(readFileSync(AXE, 'utf8'));
    return page.evaluate(async (s) => {
      const w = window as unknown as { axe: { run: (c: unknown, o: unknown) => Promise<{ violations: Array<{ id: string; nodes: Array<{ target: string[] }> }> }> } };
      const r = await w.axe.run({ include: [[s]] }, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa'] } });
      return r.violations.map((v) => `${v.id}: ${v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join(' | ')}`);
    }, sel);
  }
}
