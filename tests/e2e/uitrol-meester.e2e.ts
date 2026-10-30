// E2E «Розгортання з телефона — усе на одній сторінці» (Admin → «Оновлення», UitrolMeester.tsx), echte Chrome tegen de lokale build.
// 1. Niets ingesteld: stap 1 en 2 «Треба зробити», stap 1 open met «Способи входу»-passkeys in de pagina zelf; stap 2 toont de
//    SSH-opdrachten (nano mcp-rechten.json + controle) met kopieerknoppen en de uitleg waarom dit niet vanaf de site kan.
// 2. Root-bestanden «klaar» (sleutel + schakelaar): stap 1–2 «Готово», kop «Усе готово».
// 3. Telefoonbreedte 360 px: wizard «Нове оновлення»: archief zonder UITROL-VERSIE → duidelijke melding, geen uploadknop.
// 4. Geldig archief (git archive + UITROL-VERSIE + BRON-COMMIT, > 512 KiB → meerdere stukken): de browser toont versie, commit en
//    dezelfde sha256 als Node; «Завантажити на сервер» → eigen voorbereider-recht (1 dag, in de lijst) → voorstel «чекає схвалення»
//    met identiek pakket op de server → «Схвалити й встановити» (virtuele passkey = root-sleutel) → pakket + .goedkeuring.json in de
//    goedkeur-inbox van root. Geen horizontaal scrollen, axe (WCAG 2 A/AA) op de wizard, licht en donker, geen consolefouten.
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { createHash, generateKeyPairSync, randomBytes } from 'node:crypto';
import { checker } from '../eenheid/hulp/nep-google';
import * as kern from '../../deploy/goedkeuring/webauthn-kern.mjs';
import { startE2eServer, chromeArgs } from './server';

const PW = process.env.PLAYWRIGHT_CORE || '/workspace/e2e-tools/node_modules/playwright-core';
const AXE = process.env.AXE_CORE || join(dirname(PW), 'axe-core', 'axe.min.js');
const TLS = process.env.E2E_TLS || '/workspace/e2e-tools/tls';
const UIT = process.env.E2E_SCREENSHOTS || '/workspace/audit-20261008';
const POORT = Number(process.env.E2E_POORT || 8443);
const CHROME = process.env.CHROME || '/usr/bin/google-chrome';
const ID = 'https://id.tarasevych.com', ADMIN = 'https://admin.tarasevych.com';
const VERWACHT = [/^403 .*\/api\/owner\/agents\/activity$/];

export async function main(): Promise<number> {
  const { check, einde } = checker('e2e uitrol-meester');
  const { chromium } = createRequire(import.meta.url)(PW) as typeof import('playwright-core');
  type Page = import('playwright-core').Page;
  const T = `${Date.now()}-${randomBytes(2).toString('hex')}`;
  const eigenaar = `e2e-um-${T}@example.test`, sub = `sub-e2e-um-${T}`;

  const basis = mkdtempSync(join(tmpdir(), 'e2e-uitrol-meester-'));
  const d = (n: string) => { const p = join(basis, n); mkdirSync(p, { recursive: true }); chmodSync(p, 0o777); return p; };
  const dirs = { voorstel: d('voorstellen'), inbox: d('inbox'), status: d('status') };
  const sleutelsPad = join(basis, 'goedkeur-passkeys.json'), rechtenPad = join(basis, 'mcp-rechten.json');
  const ENV = ['UITROL_VOORSTEL_DIR', 'GOEDKEUR_INBOX', 'OPDRACHT_STATUS_DIR', 'GOEDKEUR_SLEUTELS', 'MCP_RECHTEN_PAD'] as const;
  const vorige = Object.fromEntries(ENV.map((k) => [k, process.env[k]]));
  Object.assign(process.env, { UITROL_VOORSTEL_DIR: dirs.voorstel, GOEDKEUR_INBOX: dirs.inbox, OPDRACHT_STATUS_DIR: dirs.status, GOEDKEUR_SLEUTELS: sleutelsPad, MCP_RECHTEN_PAD: rechtenPad });
  writeFileSync(rechtenPad, JSON.stringify({ read: true, 'passkey-goedkeuring': false }));

  // Pakketten: hetzelfde als deploy/uitrol/maak-voorstelpakket.sh (git archive + virtuele bestanden), en een oud archief zonder versie.
  const nu = new Date(); const p2 = (n: number) => String(n).padStart(2, '0');
  const versie = `${nu.getFullYear()}${p2(nu.getMonth() + 1)}${p2(nu.getDate())}-${p2(nu.getHours())}${p2(nu.getMinutes())}${p2(nu.getSeconds())}`;
  const commit = spawnSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).stdout.trim();
  const goed = join(basis, `mijn-ruimte-${versie}.tar.gz`), oud = join(basis, 'mijn-ruimte-oud.tar.gz');
  const ga1 = spawnSync('git', ['archive', '--format=tar.gz', `--prefix=mijn-ruimte-${versie}/`, `--add-virtual-file=mijn-ruimte-${versie}/UITROL-VERSIE:${versie}`, `--add-virtual-file=mijn-ruimte-${versie}/BRON-COMMIT:${commit}`, `--add-virtual-file=mijn-ruimte-${versie}/AUTEUR:E2E Eigenaar`, `--add-virtual-file=mijn-ruimte-${versie}/AGENT:claude`, `--add-virtual-file=mijn-ruimte-${versie}/SAMENVATTING:Пошта: оформлення листів у Gmail (e2e-testpakket)`, '-o', goed, 'HEAD'], { encoding: 'utf8' });
  const ga2 = spawnSync('git', ['archive', '--format=tar.gz', '--prefix=hub-oud/', '-o', oud, 'HEAD'], { encoding: 'utf8' });
  check('testpakketten gemaakt (git archive)', ga1.status === 0 && ga2.status === 0, ga1.stderr + ga2.stderr);
  const shaGoed = createHash('sha256').update(readFileSync(goed)).digest('hex');
  const grootte = readFileSync(goed).length;

  const { G, stop } = await startE2eServer({ ownerEmail: eigenaar, poort: POORT, tls: TLS });
  mkdirSync(UIT, { recursive: true });
  const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: chromeArgs(POORT) });
  try {
    const tab = randomBytes(24).toString('hex');
    const b = G.browser();
    await b.aanmelden(sub, eigenaar, { service: 'admin', tabContext: tab, intent: 'login', authTime: Math.floor(Date.now() / 1000) });
    const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
    const credId = randomBytes(32);
    const jwk = publicKey.export({ format: 'jwk' }) as { x: string; y: string };
    const sleutel = { alg: -7, jwk: { kty: 'EC', crv: 'P-256', x: jwk.x, y: jwk.y } };

    const context = async (scheme: 'dark' | 'light', breedte = 1280) => {
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
      page.on('response', (q) => { const k = `${q.status()} ${q.url()}`; if (q.status() >= 400 && !VERWACHT.some((v) => v.test(k))) fouten.push(`http ${k}`); });
    };
    const wiz = (page: Page) => page.locator('[data-uitrol-meester]');
    // Nieuw dashboard: stappen 1–4 staan op het tabblad «Налаштування», stap 5 (archief) op «Огляд».
    const open = async (page: Page, tab?: 'instellen') => { await page.goto(`${ADMIN}/updates?lang=uk`, { waitUntil: 'networkidle' }); await page.locator('[data-admin-uitrol]').first().waitFor({ timeout: 20000 }); if (tab) await wiz(page).waitFor({ timeout: 20000 }); else await page.locator('[data-ut-wizard]').waitFor({ timeout: 20000 }); if (tab) { await page.getByRole('tab', { name: /Налаштування/ }).click(); await page.locator('[data-uitrol-meester="instellen"]').waitFor({ timeout: 10000 }); } await page.waitForTimeout(300); };
    const stand = (page: Page, s: string) => page.locator(`[data-meester-stap="${s}"]`).getAttribute('data-stand');
    const axe = async (page: Page) => {
      if (!existsSync(AXE)) return ['axe-core ontbreekt'];
      await page.evaluate(readFileSync(AXE, 'utf8'));
      return page.evaluate(async () => {
        const w = window as unknown as { axe: { run: (c: unknown, o: unknown) => Promise<{ violations: Array<{ id: string; nodes: Array<{ target: string[] }> }> }> } };
        const r = await w.axe.run({ include: [['[data-uitrol-meester]']] }, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa'] } });
        return r.violations.map((v) => `${v.id}: ${v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join(' | ')}`);
      });
    };

    // ---- 1. niets ingesteld
    const A = await context('light');
    volg(A.page);
    await open(A.page, 'instellen');
    check('niets ingesteld: stap 1 en 2 «Треба зробити», 3–4 optioneel', await stand(A.page, 'passkey') === 'todo' && await stand(A.page, 'server') === 'todo' && await stand(A.page, 'ai') === 'optie');
    check('stap 1 staat open met de passkeylijst op dezelfde pagina («Додати passkey»)', await A.page.locator('#meester-passkey').isVisible() && await A.page.locator('#meester-passkey').getByRole('button', { name: /Додати passkey/ }).count() >= 1,
      (await A.page.locator('#meester-passkey').innerText().catch(() => '')).slice(0, 300));
    const axe1 = await axe(A.page);
    check('axe (licht, stap 1 open): geen schendingen', axe1.length === 0, axe1.join('\n'));
    await A.page.screenshot({ path: `${UIT}/uitrol-meester-1-start.png`, fullPage: true });
    await A.page.locator('[data-meester-stap="server"] .uitrol-meester-kop').click();
    const serverTekst = await A.page.locator('#meester-server').innerText();
    check('stap 2: SSH-opdrachten met kopieerknop + waarom niet via de site', /sudo nano \/etc\/mijn-ruimte\/mcp-rechten\.json/.test(serverTekst) && /sudo mijn-ruimte-passkey lijst/.test(serverTekst) && /Чому через SSH/.test(serverTekst)
      && await A.page.locator('#meester-server').getByRole('button', { name: /Копіювати команду/ }).count() >= 2, serverTekst.slice(0, 400));
    check('één stap tegelijk open (stap 1 dicht na klik op stap 2)', !(await A.page.locator('#meester-passkey').isVisible()));
    await A.page.locator('[data-meester-stap="ai"] .uitrol-meester-kop').click();
    const aiOk = await A.page.locator('#meester-ai [data-aib-staat]').waitFor({ timeout: 15000 }).then(() => true).catch(() => false);
    check('stap 3: «Доступ ШІ» (dezelfde ondertekende weergave) laadt in de pagina zelf', aiOk, (await A.page.locator('#meester-ai').innerText().catch(() => '')).slice(0, 300));

    // ---- 2. root klaar
    writeFileSync(sleutelsPad, JSON.stringify({ versie: 1, rpId: 'tarasevych.com', origins: [ADMIN, ID], sleutels: [{ credentialId: credId.toString('base64url'), ...sleutel, label: 'Телефон', vingerafdruk: kern.vingerafdruk(sleutel), toegevoegd: new Date().toISOString(), door: 'ssh' }] }));
    writeFileSync(rechtenPad, JSON.stringify({ read: true, 'passkey-goedkeuring': true }));
    await open(A.page, 'instellen');
    check('root klaar: stap 1 en 2 «Готово», kop «Усе готово»', await stand(A.page, 'passkey') === 'ok' && await stand(A.page, 'server') === 'ok' && /Усе готово/.test(await wiz(A.page).locator('header').innerText()));
    await A.page.getByRole('tab', { name: /Огляд/ }).click();
    check('wizard «Нове оновлення» staat op «Огляд» (bestandsveld aanwezig, eerste stap actief)', await A.page.locator('[data-ut-wizard] [data-meester-bestand]').count() === 1 && await A.page.locator('[data-ut-wizard]').getAttribute('data-actief') === 'bestand');
    await A.ctx.close();

    // ---- 3./4. telefoon, donker
    const B = await context('dark', 360);
    volg(B.page);
    await open(B.page);
    await B.page.locator('[data-meester-bestand]').setInputFiles(oud);
    await B.page.locator('[data-meester-analyse]').waitFor({ timeout: 20000 });
    check('archief zonder UITROL-VERSIE: melding, geen uploadknop', /немає файлу UITROL-VERSIE/.test(await B.page.locator('[data-ut-wizard] .ut-probleem').innerText()) && await B.page.locator('[data-meester-uploaden]').count() === 0);
    await B.page.locator('.ut-bestand-x').click();
    await B.page.locator('[data-meester-bestand]').setInputFiles(goed);
    await B.page.waitForFunction((v) => (document.querySelector('[data-meester-analyse]') as HTMLElement | null)?.innerText.includes(v), versie, { timeout: 30000 });
    const analyse = await B.page.locator('[data-meester-analyse]').innerText();
    check('browser leest versie, commit en dezelfde sha256 als Node', analyse.includes(versie) && analyse.includes(commit.slice(0, 12)) && analyse.includes(shaGoed), analyse.slice(0, 500));
    check('360 px: geen horizontaal scrollen', await B.page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
    const axe2 = await axe(B.page);
    check('axe (donker, 360 px, analyse): geen schendingen', axe2.length === 0, axe2.join('\n'));
    await B.page.screenshot({ path: `${UIT}/uitrol-meester-2-analyse-telefoon.png`, fullPage: true });
    check('beschrijving komt uit SAMENVATTING in het archief (niet te typen)', /Пошта: оформлення листів у Gmail/.test(await B.page.locator('.ut-beschrijving').innerText()) && await B.page.locator('.uitrol-meester-wijzigingen textarea').count() === 0);
    await B.page.locator('[data-meester-uploaden]').click();
    await B.page.locator('[data-stap="goedkeuren"]').waitFor({ timeout: 60000 }).catch(async () => { await B.page.screenshot({ path: `${UIT}/uitrol-meester-debug.png`, fullPage: true }); });
    const opServer = readdirSync(dirs.voorstel).filter((n) => n.endsWith('.tar.gz'));
    const pakketOk = opServer.length === 1 && createHash('sha256').update(readFileSync(join(dirs.voorstel, opServer[0]))).digest('hex') === shaGoed;
    check(`upload in stukken (${Math.ceil(grootte / 524288)}): voorstel wacht op goedkeuring, identiek pakket op de server`, await B.page.locator('[data-stap="goedkeuren"]').count() === 1 && pakketOk, `${opServer.join(',')} | ${fouten.slice(0, 4).join(' ; ')}`);
    check('eigen voorbereider-recht staat zichtbaar in de lijst («Власник — з пристрою»)', /Власник — з пристрою/.test(await B.page.locator('[data-admin-uitrol]').innerText()));
    check('stap «Схвалення» toont de voorcontrole van de site en het eigen pakket staat niet dubbel in «Чекають схвалення»', await B.page.locator('[data-stap="goedkeuren"] .ut-vc-lijst > li').count() >= 6 && await B.page.locator('[data-ut-goedkeuring] .ut-pakket').count() === 0);
    await B.page.locator('[data-stap="goedkeuren"] [data-ut-hoofdactie]').click();
    await B.page.waitForFunction(() => /Схвалено/.test(document.querySelector('.ut-melding')?.textContent || ''), undefined, { timeout: 20000 }).catch(() => undefined);
    const inbox = readdirSync(dirs.inbox);
    check('«Схвалити й встановити» → pakket + .goedkeuring.json in de goedkeur-inbox van root', inbox.includes(`mijn-ruimte-${versie}.tar.gz`) && inbox.includes(`mijn-ruimte-${versie}.tar.gz.goedkeuring.json`) && inbox.includes('aanvraag'), inbox.join(','));
    await B.page.screenshot({ path: `${UIT}/uitrol-meester-3-goedgekeurd.png`, fullPage: true });
    check('geen onverwachte console-/HTTP-fouten', fouten.length === 0, fouten.slice(0, 6).join('\n'));
    await B.ctx.close();
  } catch (e) {
    check('e2e liep zonder uitzondering', false, String((e as Error)?.stack || e).slice(0, 800));
  } finally {
    await browser.close().catch(() => undefined);
    await stop();
    for (const k of ENV) { if (vorige[k] === undefined) delete process.env[k]; else process.env[k] = vorige[k]; }
  }
  return einde();
}
