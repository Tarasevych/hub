// E2E UI-010 fase 2 (vlag uitrol-weergave-v2) op de ECHTE pagina admin → «Оновлення» (globale stijlen, echte server, echte Chrome).
// Upload van een pakket met UITROL-MANIFEST.json via de wizard → goedkeuren → (nagebootste) run met eigen scriptregels + twee mislukte
// pogingen van een nieuwere versie. Daarna: vlag aan → compacte toegang, één regel «problemen» op Огляд, gegroepeerde geschiedenis met
// betrokkenen/herstel, Журнал met wie/methode en Oekraïense terminalregels; taal wisselen zonder herladen; vlag uit → oude weergave.
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { chmodSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { generateKeyPairSync, randomBytes } from 'node:crypto';
import { checker } from '../eenheid/hulp/nep-google';
import * as kern from '../../deploy/goedkeuring/webauthn-kern.mjs';
import { getPool } from '../../server/platform/pg';
import { manifestVoor } from '../fixtures/uitrol/manifest-voorbeeld';
import { startE2eServer, chromeArgs } from './server';
import { techAan } from './hulp/tech';

const PW = process.env.PLAYWRIGHT_CORE || '/workspace/e2e-tools/node_modules/playwright-core';
const TLS = process.env.E2E_TLS || '/workspace/e2e-tools/tls';
const UIT = process.env.E2E_SCREENSHOTS || '/tmp/e2e-uitrol-v2';
const POORT = Number(process.env.E2E_POORT || 8443);
const CHROME = process.env.CHROME || '/usr/bin/google-chrome';
const ID = 'https://id.tarasevych.com', ADMIN = 'https://admin.tarasevych.com';

export async function main(): Promise<number> {
  const { check, einde } = checker('e2e uitrol-weergave-v2');
  const { chromium } = createRequire(import.meta.url)(PW) as typeof import('playwright-core');
  type Page = import('playwright-core').Page;
  const T = `${Date.now()}-${randomBytes(2).toString('hex')}`;
  const eigenaar = `e2e-v2-${T}@example.test`, sub = `sub-e2e-v2-${T}`;
  const basis = mkdtempSync(join(tmpdir(), 'e2e-uitrol-v2-'));
  const d = (n: string) => { const p = join(basis, n); mkdirSync(p, { recursive: true }); chmodSync(p, 0o777); return p; };
  const dirs = { voorstel: d('voorstellen'), inbox: d('inbox'), status: d('status') };
  const sleutelsPad = join(basis, 'goedkeur-passkeys.json'), rechtenPad = join(basis, 'mcp-rechten.json');
  const ENV = ['UITROL_VOORSTEL_DIR', 'GOEDKEUR_INBOX', 'OPDRACHT_STATUS_DIR', 'GOEDKEUR_SLEUTELS', 'MCP_RECHTEN_PAD'] as const;
  const vorige = Object.fromEntries(ENV.map((k) => [k, process.env[k]]));
  Object.assign(process.env, { UITROL_VOORSTEL_DIR: dirs.voorstel, GOEDKEUR_INBOX: dirs.inbox, OPDRACHT_STATUS_DIR: dirs.status, GOEDKEUR_SLEUTELS: sleutelsPad, MCP_RECHTEN_PAD: rechtenPad });
  writeFileSync(rechtenPad, JSON.stringify({ read: true, 'passkey-goedkeuring': true }));

  const nu = new Date(); const p2 = (n: number) => String(n).padStart(2, '0');
  const versie = `${nu.getFullYear()}${p2(nu.getMonth() + 1)}${p2(nu.getDate())}-${p2(nu.getHours())}${p2(nu.getMinutes())}${p2(nu.getSeconds())}`;
  const nieuwer = `${nu.getFullYear() + 1}0101-000000`;
  const commit = spawnSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).stdout.trim();
  const pad = join(basis, `mijn-ruimte-${versie}.tar.gz`);
  const P = `mijn-ruimte-${versie}`;
  const mf = join(basis, 'UITROL-MANIFEST.json'); writeFileSync(mf, manifestVoor(versie));
  const ga = spawnSync('git', ['archive', '--format=tar.gz', `--prefix=${P}/`, `--add-virtual-file=${P}/UITROL-VERSIE:${versie}`, `--add-virtual-file=${P}/BRON-COMMIT:${commit}`, `--add-virtual-file=${P}/AUTEUR:Eigenaar Test`, `--add-virtual-file=${P}/AGENT:grok`, `--add-virtual-file=${P}/SAMENVATTING:Хмара нового покоління (e2e)`, `--add-file=${mf}`, '-o', pad, 'HEAD'], { encoding: 'utf8' });
  // --add-file zet het bestand onder de prefix met zijn basisnaam
  check('testpakket met manifest gemaakt', ga.status === 0, ga.stderr);

  const sys = getPool('systeem');
  const vlag = (aan: boolean) => sys.query("UPDATE app.feature_flags SET aan=$1, standaard=$1 WHERE sleutel='uitrol-weergave-v2'", [aan]);
  const { G, stop } = await startE2eServer({ ownerEmail: eigenaar, poort: POORT, tls: TLS });
  mkdirSync(UIT, { recursive: true });
  const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: chromeArgs(POORT) });
  const runId = `e2e-v2-${T}`;
  try {
    await vlag(false);
    const tab = randomBytes(24).toString('hex');
    const b = G.browser();
    await b.aanmelden(sub, eigenaar, { service: 'admin', tabContext: tab, intent: 'login', authTime: Math.floor(Date.now() / 1000) });
    const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
    const credId = randomBytes(32);
    const jwk = publicKey.export({ format: 'jwk' }) as { x: string; y: string };
    const sleutel = { alg: -7, jwk: { kty: 'EC', crv: 'P-256', x: jwk.x, y: jwk.y } };
    writeFileSync(sleutelsPad, JSON.stringify({ versie: 1, rpId: 'tarasevych.com', origins: [ADMIN, ID], sleutels: [{ credentialId: credId.toString('base64url'), ...sleutel, label: 'Телефон', vingerafdruk: kern.vingerafdruk(sleutel), toegevoegd: new Date().toISOString(), door: 'ssh' }] }));
    const context = async (scheme: 'dark' | 'light', breedte = 1440) => {
      const ctx = await browser.newContext({ colorScheme: scheme, locale: 'uk-UA', viewport: { width: breedte, height: 900 }, timezoneId: 'Europe/Brussels', serviceWorkers: 'block' });
      await ctx.addCookies([...b.jar].flatMap(([name, value]) => [ID, ADMIN].map((url) => ({ name, value, url: `${url}/`, secure: true, httpOnly: true, sameSite: 'Lax' as const }))));
      await ctx.addInitScript((t) => { if (!sessionStorage.getItem('tsv-canonical-tab-v1')) sessionStorage.setItem('tsv-canonical-tab-v1', t); }, tab);
      const page = await ctx.newPage();
      const cdp = await ctx.newCDPSession(page);
      await cdp.send('WebAuthn.enable');
      const { authenticatorId } = await cdp.send('WebAuthn.addVirtualAuthenticator', { options: { protocol: 'ctap2', transport: 'internal', hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true } });
      await cdp.send('WebAuthn.addCredential', { authenticatorId, credential: { credentialId: credId.toString('base64'), isResidentCredential: false, rpId: 'tarasevych.com', privateKey: privateKey.export({ type: 'pkcs8', format: 'der' }).toString('base64'), signCount: 1 } });
      return { ctx, page };
    };
    const fouten: string[] = [];
    const volg = (page: Page) => {
      page.on('console', (m) => { if (m.type() === 'error' && !/^Failed to load resource/.test(m.text())) fouten.push(`console: ${m.text()}`); });
      page.on('pageerror', (e) => fouten.push(`pageerror: ${e.message}`));
    };
    const open = async (page: Page) => { await techAan(page, { url: ADMIN, tab, service: 'admin', reden: 'E2E uitrol-v2' }); await page.goto(`${ADMIN}/updates?lang=uk`, { waitUntil: 'networkidle' }); await page.locator('[data-admin-uitrol]').first().waitFor({ timeout: 20000 }).catch(async (e) => { await page.screenshot({ path: `${UIT}/debug-open.png`, fullPage: true }); writeFileSync(`${UIT}/debug-open.txt`, page.url() + '\n' + await page.locator('body').innerText()); throw e; }); };
    const tabNaar = (page: Page, id: string) => page.locator(`#ut-tab-${id}`).click();

    // ---- 1. upload + goedkeuren (vlag uit)
    const A = await context('light');
    volg(A.page);
    await open(A.page);
    await A.page.locator('[data-ut-wizard]').waitFor({ timeout: 20000 });
    await A.page.locator('[data-meester-bestand]').setInputFiles(pad);
    await A.page.waitForFunction((v) => (document.querySelector('[data-meester-analyse]') as HTMLElement | null)?.innerText.includes(v), versie, { timeout: 30000 });
    await A.page.locator('[data-meester-uploaden]').click();
    await A.page.locator('[data-stap="goedkeuren"]').waitFor({ timeout: 60000 });
    await A.page.locator('[data-stap="goedkeuren"] [data-ut-hoofdactie]').click();
    await A.page.waitForFunction(() => /Схвалено/.test(document.querySelector('.ut-melding')?.textContent || ''), undefined, { timeout: 20000 }).catch(() => undefined);
    const vs = await sys.query("SELECT id, voorbereider_label AS voorbereider, beslist_door, pakket_meta FROM app.uitrol_voorstellen WHERE versie=$1", [versie]);
    const v0 = vs.rows[0] as { id: string; voorbereider: string; beslist_door: string; pakket_meta: { manifest?: { deelnemers?: unknown[] } } } | undefined;
    check('voorstel opgeslagen met manifest in pakket_meta (deelnemers blijven bij het voorstel)', !!v0 && (v0.pakket_meta?.manifest?.deelnemers?.length || 0) === 3, JSON.stringify(v0 || {}).slice(0, 300));
    check('voorbereider en beslisser vastgelegd', !!v0?.voorbereider && !!v0?.beslist_door, `${v0?.voorbereider} / ${v0?.beslist_door}`);
    await A.ctx.close();

    // ---- 2. run met eigen scriptregels + mislukte pogingen (zoals root/browser ze schrijven)
    const regels = ['[installeer] stap: migraties (80%) databasemigraties', '[installeer] migraties uitvoeren…', '[installeer] LET OP: iets onbekends in /etc/x', 'npm WARN deprecated foo@1.0', '[installeer] klaar'];
    await sys.query(`INSERT INTO app.uitrol_runs (id, methode, versie, release, staat, stap, pct, voorstel_id, voorbereider, goedgekeurd_door, log_regels, geeindigd_op) VALUES ($1,'passkey',$2,$2,'klaar','klaar',100,$3,$4,$5,$6,now())`, [runId, versie, v0?.id || null, v0?.voorbereider || '', v0?.beslist_door || '', regels.length]);
    for (const [i, t] of regels.entries()) await sys.query('INSERT INTO app.uitrol_run_regels (run_id, nr, niveau, tekst) VALUES ($1,$2,$3,$4)', [runId, i, /LET OP|WARN/.test(t) ? 'warn' : 'info', t]);
    const { pogingBewaren } = await import('../../backend/uitrol-pogingen');
    for (const n of [1, 2]) await pogingBewaren({ versie: nieuwer, etappe: 'lezen', code: 'BESTAND_LEZEN|NotReadableError', bytes: 1000, verstuurd: 0, procent: 100, poging: n, bestand: `mijn-ruimte-${nieuwer}.tar.gz`, gemeldDoor: 'browser' } as never);

    // ---- 3. vlag aan, echte pagina, licht 1440
    await vlag(true);
    const B = await context('light');
    volg(B.page);
    await open(B.page);
    await B.page.locator('[data-ut-toegang]').waitFor({ timeout: 20000 }).catch(() => undefined);
    check('vlag aan: blok «Хто має доступ до підготовки» compact aanwezig', await B.page.locator('[data-ut-toegang]').count() === 1, (await B.page.locator('[data-admin-uitrol]').first().innerText()).slice(0, 400));
    const rijH = await B.page.locator('.ut-toegang-rij').evaluateAll((els) => els.map((e) => (e as HTMLElement).getBoundingClientRect().height));
    check('toegangsrijen compact (≥44 en ≤64 px hoog)', rijH.length > 0 && rijH.every((h) => h >= 44 && h <= 64), JSON.stringify(rijH));
    const pr = B.page.locator('[data-ut-problemen]');
    check('Огляд: één regel met recente problemen, geen volledige lijst «Обірвані спроби»', await pr.count() === 1 && await B.page.locator('#ut-paneel-overzicht .ut-pogingen').count() === 0, (await pr.innerText().catch(() => '')).slice(0, 200));
    for (const [br, sch] of [[1440, 'light'], [768, 'light'], [390, 'light']] as const) { await B.page.setViewportSize({ width: br, height: 900 }); await B.page.screenshot({ path: `${UIT}/v2-overzicht-${br}-${sch}.png`, fullPage: true }); }
    await B.page.setViewportSize({ width: 1440, height: 900 });
    await pr.locator('.ut-knop').click();
    await B.page.locator('#ut-paneel-historie').waitFor({ timeout: 10000 }).catch(() => undefined);
    const herstel = await B.page.locator('[data-ut-herstel]').first().getAttribute('data-ut-herstel').catch(() => null);
    check('«В історії» opent de poging in Історія met contextuele knop «Вибрати архів знову»', herstel === 'archief-kiezen', String(herstel));
    check('geen «Спробувати знову» bij een v2-poging', await B.page.locator('[data-tl-opnieuw]').count() === 0);
    check('pogingen van dezelfde versie gegroepeerd (audit compleet: beide in de groep)', await B.page.locator('.ut-tl-groep').count() >= 1 && await B.page.locator('.ut-tl-groep [data-soort="poging"]').count() === 2);
    // run-regel openen → betrokkenen
    await B.page.locator(`[data-tl-id] .ut-tl-rij`).filter({ hasText: versie }).first().click();
    const betr = await B.page.locator('[data-ut-betrokkenen]').first().innerText().catch(() => '');
    check('Історія: methode, wie завантажив, wie схвалив en deelnemers uit het manifest', /Eigenaar Test/.test(betr) && /claude/i.test(betr) && betr.includes(v0?.voorbereider || '§'), betr.slice(0, 400));
    for (const [br, sch] of [[1440, 'light'], [768, 'light'], [390, 'light']] as const) { await B.page.setViewportSize({ width: br, height: 900 }); await B.page.screenshot({ path: `${UIT}/v2-historie-${br}-${sch}.png`, fullPage: true }); }
    await B.page.setViewportSize({ width: 1440, height: 900 });

    // ---- 4. Журнал: wie/methode + terminal uk, origineel, taal wisselen zonder herladen
    await tabNaar(B.page, 'log');
    await B.page.evaluate(() => { (window as unknown as { __zelfde?: number }).__zelfde = 42; });
    const kies = B.page.locator('#ut-paneel-log select').first();
    if (await kies.count()) await kies.selectOption({ value: runId }).catch(() => undefined);
    await B.page.locator('.ut-log-wie').waitFor({ timeout: 10000 }).catch(() => undefined);
    const wie = await B.page.locator('.ut-log-wie').innerText().catch(() => '');
    check('Журнал: regel met methode, uploader en goedkeurder', wie.length > 0 && wie.includes(v0?.voorbereider || '§'), wie.slice(0, 300));
    const term = () => B.page.locator('.ut-terminal').first().innerText().catch(() => '');
    await B.page.waitForFunction(() => /міграц/.test(document.querySelector('.ut-terminal')?.textContent || ''), undefined, { timeout: 10000 }).catch(() => undefined);
    const tUk = await term();
    check('terminal uk: eigen meldingen vertaald, derden letterlijk', /виконання міграцій/.test(tUk) && /УВАГА: iets onbekends in \/etc\/x/.test(tUk) && /npm WARN deprecated foo@1\.0/.test(tUk), tUk.slice(0, 500));
    await B.page.locator('[data-ut-origineel]').check();
    check('«оригінал» toont de regels precies zoals de server ze schreef', /migraties uitvoeren…/.test(await term()));
    await B.page.locator('[data-ut-origineel]').uncheck();
    await B.page.screenshot({ path: `${UIT}/v2-journaal-1440-light.png`, fullPage: true });
    // taal → NL via het accountmenu
    await B.page.locator('.canonical-avatar-trigger').first().click({ timeout: 8000 }).catch((e) => fouten.push(`accountmenu: ${(e as Error).message.slice(0, 120)}`));
    await B.page.locator('.language-switch button').filter({ hasText: 'NL' }).first().click({ timeout: 8000 }).catch((e) => fouten.push(`taalknop: ${(e as Error).message.slice(0, 120)}`));
    await B.page.keyboard.press('Escape').catch(() => undefined);
    await B.page.waitForFunction(() => /Logboek/.test(document.querySelector('#ut-tab-log')?.textContent || ''), undefined, { timeout: 8000 }).catch(() => undefined);
    const tNl = await term();
    check('taalwissel uk→nl zonder herladen: tabblad «Logboek», terminal weer origineel Nederlands, zelfde pagina-instantie',
      /Logboek/.test(await B.page.locator('#ut-tab-log').innerText()) && /migraties uitvoeren…/.test(tNl) && await B.page.evaluate(() => (window as unknown as { __zelfde?: number }).__zelfde) === 42, tNl.slice(0, 300));
    await B.page.screenshot({ path: `${UIT}/v2-journaal-1440-light-nl.png`, fullPage: true });
    await B.ctx.close();

    // ---- 5. donker 390/768/1440
    const C = await context('dark', 390);
    volg(C.page);
    await open(C.page);
    await C.page.locator('[data-ut-toegang]').waitFor({ timeout: 20000 }).catch(() => undefined);
    for (const br of [390, 768, 1440]) {
      await C.page.setViewportSize({ width: br, height: 900 });
      check(`donker ${br}px: geen horizontaal scrollen`, await C.page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
      await C.page.screenshot({ path: `${UIT}/v2-overzicht-${br}-dark.png`, fullPage: true });
    }
    await tabNaar(C.page, 'historie');
    for (const br of [390, 768, 1440]) { await C.page.setViewportSize({ width: br, height: 900 }); await C.page.screenshot({ path: `${UIT}/v2-historie-${br}-dark.png`, fullPage: true }); }
    const klein = await C.page.locator('#ut-paneel-historie button:visible, [data-ut-problemen] button:visible, .ut-toegang button:visible').evaluateAll((els) => els.map((e) => { const r = (e as HTMLElement).getBoundingClientRect(); return { h: r.height, t: (e as HTMLElement).innerText.slice(0, 30) }; }).filter((x) => x.h > 0 && x.h < 44));
    check('knoppen in de nieuwe blokken ≥44 px', klein.length === 0, JSON.stringify(klein.slice(0, 6)));
    await C.ctx.close();

    // ---- 6. vlag uit → oude weergave
    await vlag(false);
    const D = await context('light');
    await open(D.page);
    await D.page.waitForTimeout(1500);
    check('vlag uit: oude weergave (geen compact toegangsblok, geen probleemregel)', await D.page.locator('[data-ut-toegang]').count() === 0 && await D.page.locator('[data-ut-problemen]').count() === 0);
    await D.page.screenshot({ path: `${UIT}/v1-overzicht-1440-light.png`, fullPage: true });
    await D.ctx.close();
    check('geen console-/paginafouten', fouten.length === 0, fouten.slice(0, 6).join('\n'));
  } catch (e) {
    check('e2e liep zonder uitzondering', false, String((e as Error)?.stack || e).slice(0, 800));
  } finally {
    await vlag(false).catch(() => undefined);
    await browser.close().catch(() => undefined);
    await stop();
    for (const k of ENV) { if (vorige[k] === undefined) delete process.env[k]; else process.env[k] = vorige[k]; }
  }
  return einde();
}
