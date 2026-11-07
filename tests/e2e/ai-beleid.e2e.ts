// E2E §13.12 «Доступ ШІ за вашим підписом» met een echte Chrome tegen de lokale build (opzet zoals toegang-context.e2e.ts).
// Eén plek: admin.*/ai (technisch profiel, sitebeheer); mcp.*/agents#beleid stuurt daarheen en heeft geen eigen tabblad meer.
// 1. Zonder keten: admin.*/ai toont «ще не встановлено» met de SSH-opdracht (beleid-start).
// 2. Root installeert genesis.signed.json (herstelsleutel, Ed25519) via beleid-start; de pagina toont versie 0, agents als tabs,
//    een lopende timer van Grok die bijna voorbij is («Скоро закінчиться»).
// 3. De eigenaar zet «Claude · Читати файли й стан ПК» op 2 uur (daarna питати) → wachtrij → «Перевірити й підписати» → venster
//    met precies de wijziging → passkey (virtuele authenticator met de root-sleutel) → root (goedkeur-hulp als nobody) schrijft
//    versie 1 → de timer loopt (Встановлено / Минуло / Залишилось telt af) en de server laat Claude toe; machine_exec blijft «ask».
// 4. Een gemanipuleerd voorstel (ander ontwerp dan de challenge) wordt door de browser zelf geweigerd: geen venster, niets getekend.
// 5. Op #ai zijn de oude schakelaars per hulpmiddel weg zodra het beleid actief is (geen tweede plek die ermee botst);
//    tekenen op mcp.* werkt terwijl root alleen admin/id als origin in zijn sleutelbestand heeft (extra origin alleen voor het AI-beleid).
// 6. Licht/donker, 360 px zonder horizontaal scrollen, axe (WCAG 2 A/AA) op het onderdeel, geen consolefouten.
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { generateKeyPairSync, randomBytes, sign } from 'node:crypto';
import { checker } from '../eenheid/hulp/nep-google';
import * as bk from '../../deploy/goedkeuring/ai-beleid-kern.mjs';
import * as kern from '../../deploy/goedkeuring/webauthn-kern.mjs';
import { beslissing, vergeetCache } from '../../backend/ai-beleid';
import { startE2eServer, chromeArgs } from './server';
import { techAan } from './hulp/tech';
import type { Policy } from '../../shared/ai-beleid/model';

const PW = process.env.PLAYWRIGHT_CORE || '/workspace/e2e-tools/node_modules/playwright-core';
const AXE = process.env.AXE_CORE || join(dirname(PW), 'axe-core', 'axe.min.js');
const TLS = process.env.E2E_TLS || '/workspace/e2e-tools/tls';
const UIT = process.env.E2E_SCREENSHOTS || '/workspace/audit-20261008';
const POORT = Number(process.env.E2E_POORT || 8443);
const CHROME = process.env.CHROME || '/usr/bin/google-chrome';
const ID = 'https://id.tarasevych.com', MCP = 'https://mcp.tarasevych.com', ADMIN = 'https://admin.tarasevych.com';
const HULP = resolve('deploy/goedkeuring/goedkeur-hulp.mjs');
// Verwacht op mcp: agents/activity zonder recente stap-op (403); niets anders.
const VERWACHT = [/^403 .*\/api\/owner\/agents\/activity$/];

export async function main(): Promise<number> {
  const { check, einde } = checker('e2e ai-beleid');
  const { chromium } = createRequire(import.meta.url)(PW) as typeof import('playwright-core');
  type Page = import('playwright-core').Page;
  const T = `${Date.now()}-${randomBytes(2).toString('hex')}`;
  const eigenaar = `e2e-aib-${T}@example.test`, sub = `sub-e2e-aib-${T}`;

  // ---- root-kant in een tijdelijke map; de hulp draait als nobody (als root negeert hij testpaden bewust)
  const basis = mkdtempSync(join(tmpdir(), 'e2e-ai-beleid-'));
  chmodSync(basis, 0o777);
  const d = (n: string) => { const p = join(basis, n); mkdirSync(p, { recursive: true }); chmodSync(p, 0o777); return p; };
  const dirs = { beleid: d('beleid'), inbox: d('inbox'), status: d('status'), staat: d('staat') };
  const sleutelsPad = join(basis, 'goedkeur-passkeys.json');
  const ENV = ['AI_BELEID_DIR', 'GOEDKEUR_INBOX', 'OPDRACHT_STATUS_DIR', 'GOEDKEUR_SLEUTELS'] as const;
  const vorige = Object.fromEntries(ENV.map((k) => [k, process.env[k]]));
  Object.assign(process.env, { AI_BELEID_DIR: dirs.beleid, GOEDKEUR_INBOX: dirs.inbox, OPDRACHT_STATUS_DIR: dirs.status, GOEDKEUR_SLEUTELS: sleutelsPad });
  const hulpEnv = { ...process.env, AI_BELEID_DIR: dirs.beleid, GOEDKEUR_INBOX: dirs.inbox, GOEDKEUR_STATUS_DIR: dirs.status, GOEDKEUR_STAAT: dirs.staat, GOEDKEUR_SLEUTELS: sleutelsPad, GOEDKEUR_RECHTEN: join(basis, 'rechten.json'), GOEDKEUR_GROEP: 'nogroup' };
  const alsNobody = typeof process.getuid === 'function' && process.getuid() === 0 ? { uid: 65534, gid: 65534 } : {};
  const hulp = (...args: string[]) => spawnSync(process.execPath, [HULP, ...args], { env: hulpEnv, encoding: 'utf8', ...alsNobody });
  // «path-unit» van root nabootsen: zolang de test loopt, elke 300 ms de inbox verwerken.
  let rootLoopt = true;
  const rootLus = (async () => {
    while (rootLoopt) {
      const nieuw = readdirSync(dirs.inbox).filter((n) => n.startsWith('ai-beleid-'));
      if (nieuw.length) { for (const f of readdirSync(dirs.inbox)) chmodSync(join(dirs.inbox, f), 0o644); hulp('verwerk'); }
      await new Promise((r) => setTimeout(r, 300));
    }
  })();

  const { G, stop } = await startE2eServer({ ownerEmail: eigenaar, poort: POORT, tls: TLS });
  mkdirSync(UIT, { recursive: true });
  const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: chromeArgs(POORT) });
  try {
    const tab = randomBytes(24).toString('hex');
    const b = G.browser();
    await b.aanmelden(sub, eigenaar, { service: 'mcp', tabContext: tab, intent: 'login', authTime: Math.floor(Date.now() / 1000) });
    // Passkey van de eigenaar: één P-256-sleutel in de virtuele authenticator én (publiek) in het root-bestand.
    const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
    const credId = randomBytes(32);
    const jwk = publicKey.export({ format: 'jwk' }) as { x: string; y: string };
    const sleutel = { alg: -7, jwk: { kty: 'EC', crv: 'P-256', x: jwk.x, y: jwk.y } };
    writeFileSync(sleutelsPad, JSON.stringify({ versie: 1, rpId: 'tarasevych.com', origins: [ADMIN, ID], sleutels: [{ credentialId: credId.toString('base64url'), ...sleutel, label: 'Телефон', vingerafdruk: kern.vingerafdruk(sleutel), toegevoegd: new Date().toISOString(), door: 'ssh' }] }));
    chmodSync(sleutelsPad, 0o644);

    const context = async (scheme: 'dark' | 'light', breedte = 1280) => {
      const ctx = await browser.newContext({ colorScheme: scheme, locale: 'uk-UA', viewport: { width: breedte, height: 900 }, timezoneId: 'Europe/Brussels', serviceWorkers: 'block' });
      await ctx.addCookies([...b.jar].flatMap(([name, value]) => [ID, MCP, ADMIN].map((url) => ({ name, value, url: `${url}/`, secure: true, httpOnly: true, sameSite: 'Lax' as const }))));
      await ctx.addInitScript((t) => { if (!sessionStorage.getItem('tsv-canonical-tab-v1')) sessionStorage.setItem('tsv-canonical-tab-v1', t); }, tab);
      const page = await ctx.newPage();
      const cdp = await ctx.newCDPSession(page);
      await cdp.send('WebAuthn.enable');
      const { authenticatorId } = await cdp.send('WebAuthn.addVirtualAuthenticator', { options: { protocol: 'ctap2', transport: 'internal', hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true } });
      await cdp.send('WebAuthn.addCredential', { authenticatorId, credential: { credentialId: credId.toString('base64'), isResidentCredential: false, rpId: 'tarasevych.com', privateKey: privateKey.export({ type: 'pkcs8', format: 'der' }).toString('base64'), signCount: 1 } });
      return { ctx, page };
    };
    const volg = (page: Page, lijst: string[]) => {
      page.on('console', (m) => { if (m.type() === 'error' && !/^Failed to load resource/.test(m.text())) lijst.push(`console: ${m.text()}`); });
      page.on('pageerror', (e) => lijst.push(`pageerror: ${e.message}`));
      page.on('response', async (q) => { if (/session\/bootstrap|ai-beleid/.test(q.url())) boot.push(`${q.status()} ${q.url().replace(/^https:\/\/[^/]+/, '')} ${(await q.text().catch(() => '')).slice(0, 120)}`); });
      page.on('response', (q) => { const k = `${q.status()} ${q.url()}`; if (q.status() >= 400 && !VERWACHT.some((v) => v.test(k))) lijst.push(`http ${k}`); });
    };
    const boot: string[] = [];
    const aib = (page: Page) => page.locator('section.aib');
    // Ondertekend AI-beleid is sitebeheer (audit 14.10): het woont op admin.*/ai in het technisch profiel; mcp/agents#beleid stuurt daarheen.
    const openAdmin = async (page: Page) => { await techAan(page, { url: ADMIN, tab, service: 'admin', reden: 'E2E ai-beleid' }); await page.goto(`${ADMIN}/ai?lang=uk`, { waitUntil: 'networkidle' }); await page.locator('[data-aib-staat]').waitFor({ timeout: 20000 }).catch(async (e) => { await page.screenshot({ path: `${UIT}/aib-debug.png` }); throw new Error(`${page.url()} ${(await page.locator('body').innerText()).slice(0, 120)} | ${boot.join(' ; ')}`); }); await page.waitForTimeout(300); };
    const axe = async (page: Page) => {
      if (!existsSync(AXE)) return ['axe-core ontbreekt'];
      // Via DevTools (zoals de console), niet als <script>: de CSP van de site (script-src 'self') blijft zo ongewijzigd.
      await page.evaluate(readFileSync(AXE, 'utf8'));
      return page.evaluate(async () => {
        const w = window as unknown as { axe: { run: (c: unknown, o: unknown) => Promise<{ violations: Array<{ id: string; nodes: Array<{ target: string[] }> }> }> } };
        const r = await w.axe.run({ include: [['section.aib']] }, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'] } });
        return r.violations.map((v) => `${v.id}: ${v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join(' | ')}`);
      });
    };

    // ---------------------------------------------------------------- 1. nog geen keten
    const fouten: string[] = [];
    const A = await context('dark');
    volg(A.page, fouten);
    await openAdmin(A.page);
    const staat0 = await A.page.locator('[data-aib-staat]').getAttribute('data-aib-staat');
    const ssh = await A.page.locator('.aib-ssh').innerText().catch(() => '');
    check('zonder keten: «ще не встановлено» + SSH-opdracht beleid-start', staat0 === 'niet-ingesteld' && /sudo mijn-ruimte-passkey beleid-start/.test(ssh), `${staat0} ${ssh}`);
    check('admin/ai: tabblad «Доступ ШІ» actief; mcp/agents heeft geen eigen tabblad meer', await A.page.locator('[role="tab"][aria-selected="true"]').filter({ hasText: 'Доступ ШІ' }).count() >= 1);
    await A.page.goto(`${MCP}/agents?lang=uk#beleid`, { waitUntil: 'networkidle' });
    check('mcp/agents#beleid stuurt door naar admin/ai', A.page.url().startsWith(`${ADMIN}/ai`), A.page.url());
    await A.page.screenshot({ path: `${UIT}/aib-0-niet-ingesteld.png`, fullPage: true });

    // ---------------------------------------------------------------- 2. genesis via root (herstelsleutel)
    const herstel = generateKeyPairSync('ed25519');
    const spki = herstel.publicKey.export({ type: 'spki', format: 'der' }).toString('base64url');
    const nu0 = Date.now();
    const agent = (name: string, caps: Record<string, unknown> = {}) => ({ name, enabled: true, defaultMode: { kind: 'ask' }, capabilities: caps });
    const genesis = { v: 1, seq: 0, prevHash: null, issuedAt: nu0 - 3 * 3_600_000, ownerKeys: [{ id: 'recovery-1', type: 'ed25519', publicKey: spki, label: 'Офлайн-ключ', addedAt: nu0 - 3 * 3_600_000 }], approvalSignature: 'risky',
      agents: { claude: agent('Claude', { 'device.exec': { kind: 'off' } }), grok: agent('Grok', { 'mail.read': { kind: 'timed', startedAt: nu0 - 2 * 3_600_000, expiresAt: nu0 + 4 * 60_000, after: 'off', label: '2 год' } }) } } as unknown as Policy;
    const genPad = join(basis, 'genesis.signed.json');
    writeFileSync(genPad, JSON.stringify({ policy: genesis, signature: { type: 'ed25519', keyId: 'recovery-1', signature: sign(null, bk.ed25519Bericht(genesis), herstel.privateKey).toString('base64url') } }));
    chmodSync(genPad, 0o644);
    const start = hulp('beleid-start', genPad, bk.sleutelVingerafdruk(spki).slice(0, 24));
    check('root: beleid-start installeert versie 0', start.status === 0, start.stderr.slice(0, 300));
    vergeetCache();
    await openAdmin(A.page);
    const sec = aib(A.page);
    check('geldig: versie 0, agents Claude en Grok als tabs', await sec.getAttribute('data-aib-staat') === 'geldig' && /Версія 0/.test(await sec.locator('.aib-stand').innerText())
      && await sec.getByRole('tab', { name: /Claude/ }).count() === 1 && await sec.getByRole('tab', { name: /Grok/ }).count() === 1);
    // Groepen staan ingeklapt tenzij ze een lopende timer hebben: klap «Пристрої» open om de mogelijkheden te zien.
    await sec.getByRole('button', { name: /^Пристрої/ }).and(sec.locator('.aiz-groep-toggle')).click();
    check('Claude: «Виконувати команди на ПК» вимкнено, решта як типово (питати)',
      /Вимкнено/.test(await sec.locator('[data-cap="device.exec"] .aib-status').innerText()) && /Питати щоразу/.test(await sec.locator('[data-cap="device.read"] .aib-status').innerText()));
    await sec.getByRole('tab', { name: /Grok/ }).click();
    const grokTimer = sec.locator('[data-cap="mail.read"] .aib-timer');
    check('Grok: lopende timer bijna voorbij → «Скоро закінчиться», telt af', await grokTimer.count() === 1 && /Скоро закінчиться/.test(await grokTimer.innerText()) && await grokTimer.evaluate((e) => e.classList.contains('is-bijna')));
    await A.page.screenshot({ path: `${UIT}/aib-1-grok-timer-donker.png`, fullPage: true });
    await sec.getByRole('tab', { name: /Claude/ }).click();

    // ---------------------------------------------------------------- 4. (eerst) gemanipuleerd voorstel → browser weigert
    // In de pagina zelf (een route.fetch() in Node zou buiten Chrome om gaan; het e2e-slot verbiedt dat terecht).
    const manipuleer = (aan: boolean) => A.page.evaluate((a) => {
      const w = window as unknown as { __echteFetch?: typeof fetch };
      if (!a) { if (w.__echteFetch) window.fetch = w.__echteFetch; return; }
      const echt = w.__echteFetch = w.__echteFetch || window.fetch.bind(window);
      window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
        const r = await echt(input, init);
        if (!String(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url).endsWith('/api/owner/ai-beleid/voorstel')) return r;
        const j = await r.clone().json();
        (j.data?.ontwerp ?? j.ontwerp).agents.claude.capabilities['device.exec'] = { kind: 'always' };
        return new Response(JSON.stringify(j), { status: r.status, headers: r.headers });
      };
    }, aan);
    await manipuleer(true);
    const rij = sec.locator('[data-cap="device.read"]');
    await rij.getByRole('button', { name: 'Змінити' }).click();
    const keuze = rij.getByRole('dialog', { name: 'Обрати строк' });
    await keuze.getByLabel('Питати щоразу').check();
    await keuze.getByRole('button', { name: '2 год' }).click();
    const wachtrij = sec.getByRole('region', { name: 'Зміни в черзі' });
    check('wachtrij: 1 wijziging, «ще нічого не діє»; rij toont «У черзі на підпис»', /1 змін\(и\) чекають підпису — ще нічого не діє/.test(await wachtrij.innerText()) && /У черзі на підпис/.test(await rij.innerText()));
    await wachtrij.getByRole('button', { name: 'Перевірити й підписати' }).click();
    await sec.locator('.aib-melding').waitFor({ timeout: 10000 });
    check('manipulatie: ander ontwerp dan de challenge → browser weigert, geen venster', /інший запит на підпис/.test(await sec.locator('.aib-melding').innerText()) && await A.page.locator('.aib-venster').count() === 0);
    await manipuleer(false);

    // ---------------------------------------------------------------- 3. tekenen met de passkey → root → versie 1
    await wachtrij.getByRole('button', { name: 'Перевірити й підписати' }).click();
    const venster = A.page.getByRole('dialog', { name: 'Підтвердіть зміну доступу ШІ' });
    await venster.waitFor({ timeout: 10000 });
    const diff = await venster.locator('.aib-diff').innerText();
    check('venster: precies de wijziging (Claude · Читати файли: як усе інше → 2 год), nieuwe versie 1', /Claude/.test(diff) && /Читати файли/.test(diff) && /як усе інше[\s\S]*→/.test(diff) && /версія 1/i.test(await venster.innerText()), diff);
    await A.page.screenshot({ path: `${UIT}/aib-2-venster-donker.png` });
    await venster.getByRole('button', { name: 'Підтвердити passkey' }).click();
    await sec.locator('.aib-melding[data-ok="true"]').waitFor({ timeout: 25000 }).catch(() => undefined);
    const melding = await sec.locator('.aib-melding').innerText().catch(() => '');
    check('passkey → root schreef versie 1 («Підписано… версію 1»)', /Підписано\. Сервер застосував версію 1/.test(melding), melding);
    await sec.locator('.aib-stand').filter({ hasText: 'Версія 1' }).waitFor({ timeout: 10000 }).catch(() => undefined);
    const timer = rij.locator('.aib-timer');
    const tekst1 = await timer.innerText().catch(() => '');
    const rest = async () => (await timer.locator('dd').nth(2).innerText()).split(' ')[0];
    const r1 = await rest(); await A.page.waitForTimeout(2200); const r2 = await rest();
    check('timer: Встановлено / Минуло / Залишилось, «Дозволено», telt af', /Встановлено/.test(tekst1) && /Минуло/.test(tekst1) && /Залишилось/.test(tekst1) && /Дозволено/.test(await rij.locator('.aib-status').innerText()) && r1 !== r2 && /^0?1:5\d:\d\d$/.test(r2), `${r1} → ${r2}`);
    vergeetCache();
    const bLees = await beslissing({ client: 'Claude' }, 'machine_read_file');
    const bExec = await beslissing({ client: 'Claude' }, 'machine_exec');
    check('server: Claude mag nu lezen (timer), uitvoeren blijft uit', bLees.mode === 'always' && bExec.mode === 'off', JSON.stringify([bLees.code, bExec.code]));
    await A.page.screenshot({ path: `${UIT}/aib-3-getekend-donker.png`, fullPage: true });
    const axeDonker = await axe(A.page);
    check('axe (donker): geen schendingen in «Доступ ШІ»', axeDonker.length === 0, axeDonker.join('\n'));

    // ---------------------------------------------------------------- 6. licht + 360 px
    const L = await context('light');
    volg(L.page, fouten);
    await openAdmin(L.page);
    const lichtThema = await L.page.evaluate(() => document.documentElement.className);
    await L.page.screenshot({ path: `${UIT}/aib-4-getekend-licht.png`, fullPage: true });
    const axeLicht = await axe(L.page);
    check('axe (licht): geen schendingen in «Доступ ШІ»', axeLicht.length === 0 && !/theme-dark/.test(lichtThema), `${lichtThema}\n${axeLicht.join('\n')}`);
    await L.ctx.close();
    const S = await context('light', 360);
    volg(S.page, fouten);
    await openAdmin(S.page);
    const breed = await S.page.evaluate(() => ({ s: document.documentElement.scrollWidth, w: window.innerWidth, sec: (document.querySelector('section.aib') as HTMLElement | null)?.scrollWidth ?? 0, secw: (document.querySelector('section.aib') as HTMLElement | null)?.clientWidth ?? 0 }));
    check('360 px: geen horizontaal scrollen (pagina en onderdeel)', breed.s <= breed.w + 1 && breed.sec <= breed.secw + 1, JSON.stringify(breed));
    await S.page.screenshot({ path: `${UIT}/aib-5-360-licht.png`, fullPage: true });
    await S.ctx.close();

    // ---------------------------------------------------------------- 5. #ai: geen tweede set schakelaars
    const M = await context('dark');
    volg(M.page, fouten);
    await M.page.goto(`${MCP}/agents?lang=uk#ai`, { waitUntil: 'networkidle' });
    await M.page.locator('[data-beleid-actief="1"]').waitFor({ timeout: 20000 }).catch(() => undefined);
    check('#ai: met actief beleid geen oude schakelaars per hulpmiddel, wel verwijzing naar «Доступ ШІ за підписом»',
      await M.page.locator('[data-beleid-actief="1"]').count() === 1 && await M.page.locator('#ag-ai-hulpmiddelen a[data-beleid-link="admin"]').count() === 1);
    await M.page.screenshot({ path: `${UIT}/aib-6-mcp-een-plek.png`, fullPage: true });

    check('geen consolefouten of onverwachte HTTP-fouten', fouten.length === 0, fouten.slice(0, 8).join('\n'));
    await A.ctx.close(); await M.ctx.close();
  } catch (e) {
    check('e2e liep zonder uitzondering', false, String((e as Error)?.stack || e).slice(0, 800));
  } finally {
    rootLoopt = false; await rootLus;
    await browser.close().catch(() => undefined);
    await stop();
    for (const k of ENV) { if (vorige[k] === undefined) delete process.env[k]; else process.env[k] = vorige[k]; }
  }
  return einde();
}
