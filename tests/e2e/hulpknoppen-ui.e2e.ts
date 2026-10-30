// E2E hulpknoppen «?» (29.10.2026) in ISOLATIE: de echte beheerpagina (toegang, sso) en het echte venster «SSH-сертифікати» tegen een
// nepserver in het geheugen. Meet per zichtbare (?) in lichte en donkere modus op 390 en 1440 px:
//   - knop is een vierkante cirkel van 22×22 px;
//   - inkt van het teken (pixels binnen de rand) ligt in het midden van de cirkel (afwijking ≤ 1 px), gemeten op de schermafbeelding
//     van de knop zelf (canvas in de pagina) — dus wat de eigenaar ziet, niet alleen de CSS;
//   - per kop hoogstens één (?): «Користувачі та запити доступу», «Система єдиного входу», SSH «Стан», «Керування», «Видати сертифікат».
// E2E_FASE=voor: alleen meten en schermafdrukken (de oude release), geen fouten. Schermafdrukken: E2E_SCREENSHOTS.
import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { build } from 'esbuild';
import { checker } from '../eenheid/hulp/nep-google';
import { chromeArgs } from './server';

const PW = process.env.PLAYWRIGHT_CORE || '/workspace/e2e-tools/node_modules/playwright-core';
const FASE = process.env.E2E_FASE === 'voor' ? 'voor' : 'na';
const UIT = process.env.E2E_SCREENSHOTS || `/workspace/release-hulpknoppen/screens/${FASE}`;
const CHROME = process.env.CHROME || '/usr/bin/google-chrome';
type Page = import('playwright-core').Page;

const NU = Date.parse('2026-10-29T10:00:00Z');
const ADMIN = {
  authority: { host: 'admin.tarasevych.com', role: 'super_admin', capabilities: ['users.manage', 'sso.manage', 'roles.manage', 'audit.read'] },
  summary: { users: 2, activeSessions: 3, rememberedDevices: 1, auditEvents: 10 },
  ssoPolicy: { enabled: true, primaryProvider: 'google', autoLinkPrimaryMail: true, allowAdditionalMailAccounts: false, mailboxAuthorization: 'required', domainWideDelegation: false, updatedAt: NU },
  users: [
    { id: 'u1', email: 'tarasevych.pavlo@gmail.com', name: 'Pavlo Tarasevych', status: 'approved', accessLevel: 'full', workspaceRole: 'owner', owner: true, adminRole: 'super_admin', entitlements: ['api-platform', 'plum-theme'], createdAt: NU, lastSeenAt: NU },
    { id: 'u2', email: 'olena@example.com', name: 'Олена', status: 'approved', accessLevel: 'full', workspaceRole: 'member', owner: false, adminRole: 'none', entitlements: [], createdAt: NU, lastSeenAt: NU },
  ],
  requests: [], directories: [], retiredAccounts: [], accountRecoveryDays: 30, audit: { items: [], integrity: { valid: true, entries: 0, roots: 0, bounded: true } }, limitations: [],
};
const SSH_STAND = { ca: true, sshdVertrouwt: true, krl: true, ingetrokken: 1, schakelaar: false, include: true, dropin: true, vinger: 'SHA256:stand', bijgewerkt: new Date(NU).toISOString() };
const antwoord = (pad: string): [number, unknown] => {
  if (pad === '/api/owner/admin/bootstrap') return [200, ADMIN];
  if (pad === '/api/ssh-ca/stand') return [200, { stand: SSH_STAND }];
  if (pad === '/api/ssh-ca/lijst') return [200, { certificaten: [] }];
  return [200, {}];
};

export async function main(): Promise<number> {
  const { check, einde } = checker(`e2e hulpknoppen-ui (${FASE})`);
  const streng = FASE === 'na';
  const toets = (naam: string, ok: boolean, detail = '') => (streng ? check(naam, ok, detail) : console.log(`${ok ? 'OK  ' : 'MEET'} ${naam}${detail ? ` — ${detail}` : ''}`));
  const map = mkdtempSync(join(tmpdir(), 'hk-'));
  await build({ entryPoints: ['tests/e2e/hulp/hulpknop-stand/stand.tsx'], outdir: map, bundle: true, format: 'esm', splitting: true, target: 'es2022', jsx: 'automatic', loader: { '.svg': 'dataurl', '.png': 'dataurl', '.woff2': 'dataurl', '.woff': 'dataurl', '.ttf': 'dataurl' }, define: { 'process.env.NODE_ENV': '"production"', 'import.meta.env.DEV': 'false', 'import.meta.env': '{}' }, logLevel: 'error' });
  const html = `<!doctype html><html lang="uk"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>stand hulpknoppen</title><style>body{margin:0}</style><link rel="stylesheet" href="/stand.css"><script src="/canonical-service.js"></script></head><body><script type="module" src="/stand.js"></script></body></html>`;
  const server = createServer((req, res) => {
    const p = (req.url || '/').split('?')[0];
    if (p === '/canonical-service.js') { res.writeHead(200, { 'content-type': 'text/javascript' }).end(existsSync('public/canonical-service.js') ? readFileSync('public/canonical-service.js') : ''); return; }
    const f = join(map, p.replace(/^\/+/, ''));
    if (p !== '/' && existsSync(f) && !p.endsWith('/')) { res.writeHead(200, { 'content-type': p.endsWith('.css') ? 'text/css' : 'text/javascript' }).end(readFileSync(f)); return; }
    res.writeHead(200, { 'content-type': 'text/html' }).end(html);
  });
  await new Promise<void>((ok) => server.listen(0, '127.0.0.1', ok));
  const poort = (server.address() as { port: number }).port;
  mkdirSync(UIT, { recursive: true });
  const { chromium } = createRequire(import.meta.url)(PW) as typeof import('playwright-core');
  const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: chromeArgs(poort) });
  const geweigerd: string[] = [], fouten: string[] = [];
  const metingen: Record<string, unknown> = {};
  const open = async (weergave: string, breedte: number, donker: boolean) => {
    const c = await browser.newContext({ viewport: { width: breedte, height: breedte < 500 ? 844 : 1000 }, deviceScaleFactor: 2, colorScheme: donker ? 'dark' : 'light', hasTouch: breedte < 500, isMobile: breedte < 500, locale: 'uk-UA', timezoneId: 'Europe/Brussels' });
    const page = await c.newPage();
    await page.route('**/*', async (r) => {
      const u = new URL(r.request().url());
      if (u.hostname !== 'admin.tarasevych.com') { geweigerd.push(u.href); return r.abort(); }
      if (u.pathname.startsWith('/api/')) { const a = antwoord(u.pathname); return r.fulfill({ status: a[0], contentType: 'application/json', body: JSON.stringify(a[1]) }); }
      return r.continue();
    });
    page.on('pageerror', (e) => fouten.push(`${weergave}: ${String(e)}`));
    await page.goto(`http://admin.tarasevych.com/toegang?thema=${donker ? 'donker' : 'licht'}&weergave=${weergave}`);
    await page.waitForSelector('.tech-vraag-knop, .info-tip-knop', { timeout: 15000 });
    await page.waitForTimeout(400);
    return { c, page };
  };
  /** Meet elke zichtbare (?): maat van de knop en het midden van de inkt van het teken t.o.v. het midden van de rand (in CSS-px). */
  const meet = async (page: Page) => {
    const knoppen = page.locator('.tech-vraag-knop:visible, .info-tip-knop:visible');
    const n = await knoppen.count();
    const uit: Array<{ w: number; h: number; dx: number; dy: number; rx: number; ry: number }> = [];
    for (let i = 0; i < n; i++) {
      const k = knoppen.nth(i);
      await k.scrollIntoViewIfNeeded().catch(() => undefined);
      const box = await k.boundingBox(); if (!box) continue;
      const rand = 6;
      const png = await page.screenshot({ clip: { x: box.x - rand, y: box.y - rand, width: box.width + 2 * rand, height: box.height + 2 * rand }, animations: 'disabled' });
      const r = await page.evaluate(async ({ b64, rand, w, h }) => {
        const img = new Image(); img.src = `data:image/png;base64,${b64}`; await img.decode();
        const cv = document.createElement('canvas'); cv.width = img.width; cv.height = img.height;
        const cx = cv.getContext('2d')!; cx.drawImage(img, 0, 0);
        const d = cx.getImageData(0, 0, cv.width, cv.height).data; const s = cv.width / (w + 2 * rand);
        const px = (x: number, y: number) => { const o = (y * cv.width + x) * 4; return [d[o], d[o + 1], d[o + 2]]; };
        const knopMx = (rand + w / 2) * s, knopMy = (rand + h / 2) * s;
        // Alleen inkt binnen de cirkel van de knop (+1 px): tekst of iconen ernaast tellen niet mee.
        const bg = px(1, 1); const inkt = (x: number, y: number) => { if (Math.hypot(x - knopMx, y - knopMy) > (Math.max(w, h) / 2 + 1) * s) return false; const p = px(x, y); return Math.abs(p[0] - bg[0]) + Math.abs(p[1] - bg[1]) + Math.abs(p[2] - bg[2]) > 90; };
        // Rand: alle inkt in het venster. Teken: inkt binnen 62 % van de straal rond het midden van de rand.
        let x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1;
        for (let y = 0; y < cv.height; y++) for (let x = 0; x < cv.width; x++) if (inkt(x, y)) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
        const mx = (x0 + x1) / 2, my = (y0 + y1) / 2, straal = Math.min(x1 - x0, y1 - y0) / 2;
        let g0 = 1e9, h0 = 1e9, g1 = -1, h1 = -1;
        for (let y = 0; y < cv.height; y++) for (let x = 0; x < cv.width; x++) if (Math.hypot(x - mx, y - my) < straal * 0.62 && inkt(x, y)) { g0 = Math.min(g0, x); h0 = Math.min(h0, y); g1 = Math.max(g1, x); h1 = Math.max(h1, y); }
        return { dx: ((g0 + g1) / 2 - mx) / s, dy: ((h0 + h1) / 2 - my) / s, rx: (mx - knopMx) / s, ry: (my - knopMy) / s };
      }, { b64: png.toString('base64'), rand, w: box.width, h: box.height });
      uit.push({ w: Math.round(box.width * 10) / 10, h: Math.round(box.height * 10) / 10, ...Object.fromEntries(Object.entries(r).map(([a, v]) => [a, Math.round((v as number) * 10) / 10])) as { dx: number; dy: number; rx: number; ry: number } });
    }
    return uit;
  };
  const perKop = (page: Page, kop: string) => page.evaluate((kop) => {
    const h = [...document.querySelectorAll('h2,h3,legend,summary')].find((e) => (e.textContent || '').includes(kop)); if (!h) return -1;
    const blok = h.closest('section,fieldset,details,.ssh-blok') || h.parentElement!;
    const sub = [...blok.querySelectorAll('section,fieldset,details')].filter((s) => s !== blok);
    return [...blok.querySelectorAll('.tech-vraag-knop,.info-tip-knop')].filter((k) => !sub.some((s) => s.contains(k) && !s.contains(h))).length;
  }, kop);
  try {
    for (const breedte of [390, 1440]) for (const donker of [false, true]) {
      const naam = `${breedte}-${donker ? 'donker' : 'licht'}`;
      for (const weergave of ['access', 'sso', 'ssh']) {
        const { c, page } = await open(weergave, breedte, donker);
        const m = await meet(page);
        metingen[`${weergave}-${naam}`] = m;
        toets(`${weergave} ${naam}: ${m.length} (?) gemeten`, m.length > 0);
        toets(`${weergave} ${naam}: elke (?) is een cirkel van 22×22`, m.every((x) => Math.abs(x.w - 22) <= 0.6 && Math.abs(x.h - 22) <= 0.6), JSON.stringify(m.map((x) => [x.w, x.h])));
        toets(`${weergave} ${naam}: teken in het midden van de rand (≤ 1 px)`, m.every((x) => Math.abs(x.dx) <= 1 && Math.abs(x.dy) <= 1), JSON.stringify(m.map((x) => [x.dx, x.dy])));
        toets(`${weergave} ${naam}: rand in het midden van de knop (≤ 1 px)`, m.every((x) => Math.abs(x.rx) <= 1 && Math.abs(x.ry) <= 1), JSON.stringify(m.map((x) => [x.rx, x.ry])));
        const koppen = weergave === 'access' ? ['Користувачі та запити доступу'] : weergave === 'sso' ? ['Система єдиного входу'] : ['Стан', 'Керування', 'Видати сертифікат'];
        for (const k of koppen) { const n = await perKop(page, k); toets(`${weergave} ${naam}: «${k}» heeft één (?)`, n === 1, `aantal=${n}`); }
        await page.evaluate(() => window.scrollTo(0, 0));
        await page.screenshot({ path: join(UIT, `${weergave}-${naam}.png`), fullPage: weergave !== 'ssh', animations: 'disabled' });
        // De samengevoegde uitleg open (tik/klik op de (?) bij de kop).
        const kop = weergave === 'ssh' ? 'Керування' : koppen[0];
        const knop = page.locator('h2,h3').filter({ hasText: kop }).locator('.tech-vraag-knop').first();
        if (await knop.count()) {
          await knop.scrollIntoViewIfNeeded(); await knop.click(); await page.waitForTimeout(250);
          const tekst = await page.locator('.tech-vraag-uitleg').first().innerText().catch(() => '');
          if (weergave === 'access') toets(`${naam}: één uitleg met status, роль en права`, /Стан акаунта/.test(tekst) && /Роль/.test(tekst) && /Права/.test(tekst), tekst.slice(0, 160));
          if (weergave === 'ssh') toets(`${naam}: één uitleg met Підготувати, перемикач і sshd`, /Підготувати/.test(tekst) && /Перемикач підпису/.test(tekst) && /Прибрати довіру sshd/.test(tekst), tekst.slice(0, 160));
          if (breedte === 390 || weergave !== 'sso') await page.screenshot({ path: join(UIT, `${weergave}-uitleg-${naam}.png`), animations: 'disabled' });
        }
        await c.close();
      }
    }
  } finally {
    await browser.close(); server.close();
    writeFileSync(join(UIT, 'metingen.json'), JSON.stringify(metingen, null, 1));
  }
  toets('geen verzoeken naar andere hosts', geweigerd.length === 0, geweigerd.slice(0, 3).join(', '));
  toets('geen paginafouten', fouten.length === 0, fouten.slice(0, 3).join(' | '));
  return streng ? einde() : (console.log('meting «voor» klaar'), 0);
}
