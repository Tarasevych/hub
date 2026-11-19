// TIJDELIJK (mobiel-traag), niet vastleggen: zoekt welk deel van de pagina de lay-out zo duur maakt.
import { createRequire } from 'node:module';
import { writeFileSync } from 'node:fs';
import { randomBytes, createHash } from 'node:crypto';
import { checker } from '../eenheid/hulp/nep-google';
import { getPool } from '../../server/platform/pg';
import * as store from '../../backend/connectors-opslag';
import { startE2eServer, chromeArgs } from './server';
const PW = process.env.PLAYWRIGHT_CORE!, TLS = process.env.E2E_TLS!, UIT = '/workspace/mobiel-traag', POORT = 8462;
const ID = 'https://id.tarasevych.com', MCP = 'https://mcp.tarasevych.com';
const sha = (s: string) => createHash('sha256').update(s).digest('hex');
export async function main(): Promise<number> {
  const { check, einde } = checker('mobiel-sonde');
  const { chromium } = createRequire(import.meta.url)(PW) as typeof import('playwright-core');
  const T = `${Date.now()}-${randomBytes(2).toString('hex')}`;
  const eigenaar = `sonde-${T}@example.test`, sub = `sub-sonde-${T}`;
  const { G, stop } = await startE2eServer({ ownerEmail: eigenaar, poort: POORT, tls: TLS });
  const pool = getPool();
  const browser = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', headless: true, args: chromeArgs(POORT) });
  const uit: Record<string, unknown> = {};
  try {
    const tab = randomBytes(24).toString('hex');
    const b = G.browser();
    await b.aanmelden(sub, eigenaar, { service: 'mcp', tabContext: tab, intent: 'login', authTime: Math.floor(Date.now() / 1000) });
    const uid = String((await pool.query("select id from app.records where tbl='users' and data->>'email'=$1", [eigenaar])).rows[0]?.id || '');
    for (let i = 0; i < 3; i++) await store.createAgent(uid, `ПК ${i}`, 'win32-x64', sha(`pc-${T}-${i}`), { roots: ['D:\\werk'] }, { autoApprove: ['list_dir'] }, { version: '1.4.0', pairingId: `pair${i}${T}`.replace(/[^A-Za-z0-9_-]/g, '') });
    for (const breedte of [390]) {
      const ctx = await browser.newContext({ viewport: { width: breedte, height: 844 }, deviceScaleFactor: breedte < 500 ? 3 : 1, isMobile: breedte < 500, hasTouch: breedte < 500, locale: 'uk-UA', serviceWorkers: 'block', ignoreHTTPSErrors: true, bypassCSP: true });
      await ctx.addCookies([...b.jar].flatMap(([name, value]) => [ID, MCP].map((url) => ({ name, value, url: `${url}/`, secure: true, httpOnly: true, sameSite: 'Lax' as const }))));
      await ctx.addInitScript((t) => { if (!sessionStorage.getItem('tsv-canonical-tab-v1')) sessionStorage.setItem('tsv-canonical-tab-v1', t); }, tab);
      const page = await ctx.newPage(); page.on('console', (m) => { if (m.text().startsWith('SONDE')) console.log(m.text()); });
      await page.goto(`${MCP}/agenten#connectors`, { waitUntil: 'networkidle', timeout: 120000 });
      await page.locator('#ag-sectie-connectors').waitFor({ timeout: 60000 });
      // alle secties openen door door te scrollen
      await page.evaluate(async () => { const w = document.querySelector('.canonical-workspace') as HTMLElement; for (let i = 0; i < 80; i++) { w.scrollTop += 600; await new Promise((r) => setTimeout(r, 60)); } w.scrollTop = 0; });
      await page.waitForTimeout(4000);
      const r = await page.evaluate(() => {
        const meet = (n = 1) => { const ts: number[] = []; for (let i = 0; i < n; i++) { document.body.style.paddingLeft = i % 2 ? '0px' : '0.5px'; const t = performance.now(); void document.body.offsetHeight; ts.push(performance.now() - t); } document.body.style.paddingLeft = ''; void document.body.offsetHeight; return Math.round(Math.min(...ts) * 10) / 10; };
        const naam = (el: Element) => `${el.tagName.toLowerCase()}${el.id ? '#' + el.id : ''}${el.classList.length ? '.' + [...el.classList].slice(0, 4).join('.') : ''}`;
        const basis = meet(2); console.log('SONDE basis', basis);
        const verberg = (el: HTMLElement) => { const o = el.style.display; el.style.setProperty('display', 'none', 'important'); const t = meet(); el.style.display = o; return t; };
        // gretig afdalen
        const pad: Array<{ el: string; besparing: number; kinderen: number }> = [];
        let knoop: HTMLElement = document.body;
        for (let d = 0; d < 40; d++) {
          const kids = [...knoop.children].filter((k) => getComputedStyle(k).display !== 'none') as HTMLElement[];
          if (!kids.length) break;
          let best: HTMLElement | null = null, bestT = Infinity;
          const ks = kids.length > 25 ? kids.slice(0, 25) : kids;
          for (const k of ks) { const t = verberg(k); if (t < bestT) { bestT = t; best = k; } }
          const besparing = Math.round(basis - bestT);
          if (!best || besparing < basis * 0.3) break;
          pad.push({ el: naam(best), besparing, kinderen: kids.length }); console.log('SONDE', d, naam(best), besparing, Math.round(basis));
          knoop = best;
        }
        const cs = getComputedStyle(knoop);
        const stijl = Object.fromEntries(['display', 'position', 'grid-template-columns', 'flex-wrap', 'width', 'min-width', 'container-type', 'text-wrap', 'overflow-wrap', 'word-break', 'hyphens', 'contain', 'zoom', 'aspect-ratio', 'field-sizing', 'line-clamp', '-webkit-line-clamp', 'white-space', 'font-family'].map((p) => [p, cs.getPropertyValue(p)]));
        const html = knoop.outerHTML.slice(0, 1500);
        // globale proeven met CSS-overschrijvingen
        const proef = (css: string) => { const s = document.createElement('style'); s.textContent = css; document.head.appendChild(s); const t = meet(); s.remove(); void document.body.offsetHeight; return t; };
        const proeven = {
          'hyphens:none': proef('*{hyphens:manual!important;-webkit-hyphens:manual!important}'),
          'overflow-wrap:normal': proef('*{overflow-wrap:normal!important;word-break:normal!important}'),
          'text-wrap:wrap': proef('*{text-wrap:wrap!important}'),
          'container-type:normal': proef('*{container-type:normal!important}'),
          'line-clamp:none': proef('*{-webkit-line-clamp:none!important;line-clamp:none!important}'),
          'field-sizing:fixed': proef('*{field-sizing:fixed!important}'),
          'font-family:sans-serif': proef('*{font-family:sans-serif!important}'),
          'zoom:normal': proef('*{zoom:normal!important}'),
          'grid->block': proef('*{display:block!important}'),
        };
        return { basis, pad, doel: naam(knoop), stijl, html, proeven, knopen: document.querySelectorAll('*').length, lang: document.documentElement.lang };
      });
      console.log(breedte, JSON.stringify(r));
      uit[String(breedte)] = r;
      await ctx.close();
    }
    check('sonde klaar', true);
    writeFileSync(`${UIT}/sonde.json`, JSON.stringify(uit, null, 2));
  } finally { await browser.close().catch(() => undefined); await stop(); }
  return einde();
}
