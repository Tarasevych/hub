// E2E Hoofd3 op de ECHTE pagina admin → «Оновлення»: kopieerknop rechtsboven in «Що змінено» (390/1440, licht/donker, vlag
// uitrol-weergave-v2 aan én uit) en de concrete uitleg bij «Версія не новіша» (pakket = actieve versie). Alleen lokaal.
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { randomBytes } from 'node:crypto';
import { checker } from '../eenheid/hulp/nep-google';
import { getPool } from '../../server/platform/pg';
import { manifestVoor } from '../fixtures/uitrol/manifest-voorbeeld';
import { startE2eServer, chromeArgs } from './server';
import { techAan } from './hulp/tech';

const PW = process.env.PLAYWRIGHT_CORE || '/workspace/e2e-tools/node_modules/playwright-core';
const TLS = process.env.E2E_TLS || '/workspace/e2e-tools/tls';
const UIT = process.env.E2E_SCREENSHOTS || '/tmp/e2e-kopieerknop';
const POORT = Number(process.env.E2E_POORT || 8443);
const CHROME = process.env.CHROME || '/usr/bin/google-chrome';
const ID = 'https://id.tarasevych.com', ADMIN = 'https://admin.tarasevych.com';

export async function main(): Promise<number> {
  const { check, einde } = checker('e2e uitrol-kopieerknop');
  const { chromium } = createRequire(import.meta.url)(PW) as typeof import('playwright-core');
  type Page = import('playwright-core').Page;
  const T = `${Date.now()}-${randomBytes(2).toString('hex')}`;
  const eigenaar = `e2e-kk-${T}@example.test`, sub = `sub-e2e-kk-${T}`;
  const basis = mkdtempSync(join(tmpdir(), 'e2e-kopieerknop-'));
  const d = (n: string) => { const p = join(basis, n); mkdirSync(p, { recursive: true }); return p; };
  Object.assign(process.env, { UITROL_VOORSTEL_DIR: d('voorstellen'), GOEDKEUR_INBOX: d('inbox'), OPDRACHT_STATUS_DIR: d('status'), MCP_RECHTEN_PAD: join(basis, 'mcp-rechten.json') });
  writeFileSync(join(basis, 'mcp-rechten.json'), JSON.stringify({ read: true }));
  // «Nu actief» = UITROL-VERSIE naast dist (releaseInfo), zoals op de server.
  const actief = '20261029-220522', nieuwer = '20271030-080000';
  const versiePad = resolve(process.env.E2E_DIST || 'dist', '..', 'UITROL-VERSIE');
  const hadVersie = existsSync(versiePad);
  if (!hadVersie) writeFileSync(versiePad, actief + '\n');
  const commit = spawnSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).stdout.trim();
  const pakket = (versie: string) => {
    const P = `mijn-ruimte-${versie}`, pad = join(basis, `${P}.tar.gz`), mf = join(basis, 'UITROL-MANIFEST.json');
    writeFileSync(mf, manifestVoor(versie));
    const r = spawnSync('git', ['archive', '--format=tar.gz', `--prefix=${P}/`, `--add-virtual-file=${P}/UITROL-VERSIE:${versie}`, `--add-virtual-file=${P}/BRON-COMMIT:${commit}`, `--add-virtual-file=${P}/AUTEUR:Pavlo Tarasevych`, `--add-virtual-file=${P}/AGENT:grok`, `--add-virtual-file=${P}/SAMENVATTING:Зведений пакет (e2e kopieerknop)`, `--add-file=${mf}`, '-o', pad, 'HEAD'], { encoding: 'utf8' });
    check(`testpakket ${versie} gemaakt`, r.status === 0, r.stderr);
    return pad;
  };
  const pakOud = pakket(actief), pakNieuw = pakket(nieuwer);
  const sys = getPool('systeem');
  const vlag = (aan: boolean) => sys.query("UPDATE app.feature_flags SET aan=$1, standaard=$1 WHERE sleutel='uitrol-weergave-v2'", [aan]);
  const { G, stop } = await startE2eServer({ ownerEmail: eigenaar, poort: POORT, tls: TLS });
  mkdirSync(UIT, { recursive: true });
  const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: chromeArgs(POORT) });
  const fouten: string[] = [];
  try {
    const tab = randomBytes(24).toString('hex');
    const b = G.browser();
    await b.aanmelden(sub, eigenaar, { service: 'admin', tabContext: tab, intent: 'login', authTime: Math.floor(Date.now() / 1000) });
    const open = async (scheme: 'light' | 'dark', breedte: number, lang: 'uk' | 'nl', pad: string) => {
      const ctx = await browser.newContext({ colorScheme: scheme, locale: lang === 'uk' ? 'uk-UA' : 'nl-NL', viewport: { width: breedte, height: 900 }, timezoneId: 'Europe/Brussels', serviceWorkers: 'block', permissions: ['clipboard-read', 'clipboard-write'] });
      await ctx.addCookies([...b.jar].flatMap(([name, value]) => [ID, ADMIN].map((url) => ({ name, value, url: `${url}/`, secure: true, httpOnly: true, sameSite: 'Lax' as const }))));
      await ctx.addInitScript((a) => { if (!sessionStorage.getItem('tsv-canonical-tab-v1')) sessionStorage.setItem('tsv-canonical-tab-v1', a.t); if (!localStorage.getItem('tsv-ecosystem-presentation-v2')) localStorage.setItem('tsv-ecosystem-theme-v1', a.s); }, { t: tab, s: scheme });
      const page = await ctx.newPage();
      page.on('console', (m) => { if (m.type() === 'error' && !/^Failed to load resource/.test(m.text())) fouten.push(`console: ${m.text()}`); });
      page.on('pageerror', (e) => fouten.push(`pageerror: ${e.message}`));
      await techAan(page, { url: ADMIN, tab, service: 'admin', reden: 'E2E kopieerknop' });
      await page.goto(`${ADMIN}/updates?lang=${lang}`, { waitUntil: 'networkidle' });
      // Let op: het beheerscherm toont in deze testomgeving het palet «grifel» (donker) ook bij colorScheme light; zie rapport.
      await page.locator('[data-ut-wizard]').waitFor({ timeout: 20000 });
      await page.locator('[data-meester-bestand]').setInputFiles(pad);
      await page.locator('.ut-beschrijving').waitFor({ timeout: 30000 });
      return { ctx, page };
    };
    const meet = async (page: Page) => page.evaluate(() => {
      const blok = document.querySelector('.ut-beschrijving') as HTMLElement; const knop = blok.querySelector('.ut-blok-kopie-knop') as HTMLElement; const h4 = blok.querySelector('h4') as HTMLElement;
      const kb = knop.getBoundingClientRect(), bb = blok.getBoundingClientRect();
      const r = document.createRange(); r.selectNodeContents(h4); const tekstRects = [...r.getClientRects()];
      const overlap = tekstRects.some((t) => t.width > 0 && !(t.right <= kb.left || t.left >= kb.right || t.bottom <= kb.top || t.top >= kb.bottom));
      const vb = getComputedStyle(knop, '::before'); const klikB = kb.width - 2 * parseFloat(vb.left), klikH = kb.height - 2 * parseFloat(vb.top);
      return { cls: document.documentElement.className.slice(0, 120), bg: getComputedStyle(blok).backgroundColor, rechts: bb.right - kb.right, boven: kb.top - bb.top, w: kb.width, h: kb.height, klikB, klikH, overlap, label: knop.getAttribute('aria-label') };
    });
    for (const v2 of [false, true]) {
      await vlag(v2);
      for (const scheme of ['light', 'dark'] as const) for (const breedte of [390, 1440]) {
        const { ctx, page } = await open(scheme, breedte, 'uk', pakNieuw);
        const m = await meet(page);
        const naam = `kopieerknop-${v2 ? 'v2' : 'oud'}-${breedte}-${scheme === 'light' ? 'licht' : 'donker'}`;
        check(`${naam}: rechtsboven, klein (≤32px), klikvlak ≥44px, geen overlap met titel`, m.rechts <= 12 && m.boven <= 12 && m.w <= 32 && m.klikB >= 44 && m.klikH >= 44 && !m.overlap, JSON.stringify(m));
        await page.locator('.ut-beschrijving').screenshot({ path: `${UIT}/${naam}.png` });
        if (breedte === 390 && scheme === 'light') await page.screenshot({ path: `${UIT}/${naam}-pagina.png`, fullPage: false });
        if (scheme === 'light' && breedte === 1440) {
          await page.locator('.ut-blok-kopie-knop').click();
          await page.waitForFunction(() => /Скопійовано/.test(document.querySelector('.ut-blok-kopie-melding')?.textContent || ''), undefined, { timeout: 3000 }).catch(() => undefined);
          const melding = await page.locator('.ut-blok-kopie-melding').innerText().catch(() => '');
          const klembord = await page.evaluate(() => navigator.clipboard.readText()).catch((e) => `FOUT ${e}`);
          check(`${naam}: klik → «Скопійовано» + vinkje`, melding === 'Скопійовано' && await page.locator('.ut-blok-kopie-knop[data-staat=ok]').count() === 1, melding);
          check(`${naam}: klembord bevat de hele tekst van «Що змінено»`, klembord.includes('Що змінено') && klembord.split('\n').length >= 4, klembord.slice(0, 300));
          writeFileSync(`${UIT}/${naam}-klembord.txt`, klembord);
          await page.screenshot({ path: `${UIT}/${naam}-na-klik.png`, clip: await page.locator('.ut-beschrijving').boundingBox() || undefined });
          await page.waitForTimeout(2000);
          check(`${naam}: bevestiging verdwijnt na ~1,6 s`, await page.locator('.ut-blok-kopie-knop[data-staat=ok]').count() === 0);
        }
        await ctx.close();
      }
    }
    // nl + versieweigering met concrete oorzaak
    const nl = await open('light', 390, 'nl', pakNieuw);
    check('nl: aria-label «Tekst van het blok kopiëren»', (await meet(nl.page)).label === 'Tekst van het blok kopiëren');
    await nl.ctx.close();
    for (const lang of ['uk', 'nl'] as const) {
      const o = await open('light', 390, lang, pakOud);
      await o.page.locator('[data-ut-niet-nieuwer]').waitFor({ timeout: 15000 }).catch(() => undefined);
      const t = await o.page.locator('.ut-probleem').innerText().catch(() => '');
      check(`${lang}: weigering noemt pakketversie, actieve versie en bron`, t.includes(actief) && (lang === 'uk' ? /Зараз працює: 20261029-220522 \(джерело:/.test(t) : /Nu actief: 20261029-220522 \(bron:/.test(t)), t.slice(0, 500));
      await o.page.locator('.ut-probleem').screenshot({ path: `${UIT}/versieweigering-390-${lang}.png` });
      await o.ctx.close();
    }
    check('geen console-/paginafouten', fouten.length === 0, fouten.slice(0, 5).join('\n'));
  } finally {
    await browser.close(); await stop(); await vlag(false).catch(() => undefined);
    if (!hadVersie) rmSync(versiePad, { force: true });
  }
  return einde();
}
