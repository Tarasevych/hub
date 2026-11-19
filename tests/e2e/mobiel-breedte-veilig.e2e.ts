// E2E MOBIEL-BREEDTE-VEILIG v1 (vlag `mobiel-breedte-veilig-v1`, migratie 0302) in een echte Chrome, alleen lokaal.
// Per vlagstand (uit/aan) × thema (licht/donker) × taal (uk/nl) × maat (telefoon 412 px / computer 1280 px):
// /agenten#connectors, mail, account en «Розумний будинок». Controleert: het attribuut op <html> volgt de vlag; met de vlag aan
// op 412 px blijft de lay-outtijd van /agenten#connectors klein en het adres #connectors; geen horizontaal uitschuiven; geen
// paginafouten. Met de vlag UIT op 412 px is /agenten de oude, zware weergave: daar alleen een vroege schermafdruk (geen eis).
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import { randomBytes, createHash } from 'node:crypto';
import { checker } from '../eenheid/hulp/nep-google';
import { getPool } from '../../server/platform/pg';
import * as store from '../../backend/connectors-opslag';
import { startE2eServer, chromeArgs } from './server';

const PW = process.env.PLAYWRIGHT_CORE || '/workspace/e2e-tools/node_modules/playwright-core';
const TLS = process.env.E2E_TLS || '/workspace/e2e-tools/tls';
const UIT = process.env.E2E_SCREENSHOTS || 'rapporten/mobiel-breedte-veilig';
const POORT = Number(process.env.E2E_POORT || 8443);
const CHROME = process.env.CHROME || '/usr/bin/google-chrome';
const HOSTS = ['hub', 'id', 'ai', 'mail', 'cloud', 'admin', 'mcp', 'api', 'huis'].map((h) => `https://${h}.tarasevych.com`);
const MOBUA = 'Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36';
const sha = (s: string) => createHash('sha256').update(s).digest('hex');
const PAGINAS = [
  { naam: 'agenten', url: 'https://mcp.tarasevych.com/agenten', hash: '#connectors' },
  { naam: 'mail', url: 'https://mail.tarasevych.com/postvak-in', hash: '' },
  { naam: 'account', url: 'https://id.tarasevych.com/account', hash: '' },
  { naam: 'huis', url: 'https://huis.tarasevych.com/', hash: '' },
];
const binnen = <T>(p: Promise<T>, ms: number) => Promise.race([p.catch(() => null), new Promise<null>((r) => setTimeout(() => r(null), ms))]);

export async function main(): Promise<number> {
  const { check: kaal, einde } = checker('e2e mobiel-breedte-veilig');
  const check = (n: string, ok: boolean, info?: unknown) => kaal(n, ok, ok || info === undefined ? '' : JSON.stringify(info).slice(0, 300));
  const { chromium } = createRequire(import.meta.url)(PW) as typeof import('playwright-core');
  const T = `${Date.now()}-${randomBytes(2).toString('hex')}`;
  const eigenaar = `e2e-mbv-${T}@example.test`, sub = `sub-e2e-mbv-${T}`;
  const { G, stop } = await startE2eServer({ ownerEmail: eigenaar, poort: POORT, tls: TLS });
  const pool = getPool(), sys = getPool('systeem');
  mkdirSync(UIT, { recursive: true });
  const vooraf = (await sys.query("SELECT aan, gebruikers FROM app.feature_flags WHERE sleutel='mobiel-breedte-veilig-v1'")).rows[0];
  check('migratie 0302: vlag bestaat, standaard uit', vooraf && vooraf.aan === false, vooraf);
  try {
    const tab = randomBytes(24).toString('hex');
    const b = G.browser();
    await b.aanmelden(sub, eigenaar, { service: 'mcp', tabContext: tab, intent: 'login', authTime: Math.floor(Date.now() / 1000) });
    const uid = String((await pool.query("select id from app.records where tbl='users' and data->>'email'=$1", [eigenaar])).rows[0]?.id || '');
    for (let i = 0; i < 3; i++) await store.createAgent(uid, `ПК ${i}`, 'win32-x64', sha(`pc-${T}-${i}`), { roots: ['D:\\werk'] }, { autoApprove: ['list_dir'] }, { version: '1.4.0', pairingId: `pair${i}${T}`.replace(/[^A-Za-z0-9_-]/g, '') });
    for (const [i, naam] of ['Claude', 'ChatGPT', 'Grok', 'Gemini'].entries()) { const cid = `mbv-${naam}-${i}-${T}`; await sys.query('INSERT INTO app.mcp_oauth_clients (client_id, client_name, redirect_uris) VALUES ($1, $2, $3)', [cid, naam, ['https://claude.ai/api/mcp/auth_callback']]); await sys.query(`INSERT INTO app.mcp_oauth_tokens (user_id, client_id, client_name, scope, access_hash, refresh_hash, access_expires_at, refresh_expires_at, last_used_at) VALUES ($1, $2, $3, 'mcp', $4, $5, now() + interval '1 hour', now() + interval '30 days', now() - interval '2 hours')`, [uid, cid, naam, sha(`a-${T}-${i}`), sha(`r-${T}-${i}`)]); }
    for (const vlag of ['uit', 'aan'] as const) {
      await sys.query("UPDATE app.feature_flags SET aan=$1, gebruikers=$2 WHERE sleutel='mobiel-breedte-veilig-v1'", [vlag === 'aan', vlag === 'aan' ? [uid] : []]);
      for (const thema of ['licht', 'donker'] as const) for (const taal of ['uk', 'nl'] as const) for (const maat of ['telefoon', 'computer'] as const) {
        const tel = maat === 'telefoon';
        const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: chromeArgs(POORT) });
        try {
          const ctx = await browser.newContext({ viewport: tel ? { width: 412, height: 924 } : { width: 1280, height: 900 }, deviceScaleFactor: tel ? 2.625 : 1, isMobile: tel, hasTouch: tel, userAgent: tel ? MOBUA : undefined, colorScheme: thema === 'licht' ? 'light' : 'dark', locale: taal === 'uk' ? 'uk-UA' : 'nl-NL', serviceWorkers: 'block', ignoreHTTPSErrors: true });
          await ctx.addCookies([...b.jar].flatMap(([name, value]) => HOSTS.map((url) => ({ name, value, url: `${url}/`, secure: true, httpOnly: true, sameSite: 'Lax' as const }))));
          await ctx.addInitScript((t) => { if (location.protocol !== 'https:') return; try { if (!sessionStorage.getItem('tsv-canonical-tab-v1')) sessionStorage.setItem('tsv-canonical-tab-v1', t); } catch { /* */ } }, tab);
          await ctx.addInitScript((k) => { const zet = () => { for (const el of [document.documentElement, ...document.querySelectorAll('.canonical-chrome')]) { el.classList.remove('theme-dark', 'theme-light', 'theme-plum-dark', 'theme-plum-light'); el.classList.add(k); } }; document.addEventListener('DOMContentLoaded', zet); setInterval(zet, 300); }, thema === 'licht' ? 'theme-light' : 'theme-dark');
          for (const p of PAGINAS) {
            const naam = `${vlag}-${thema}-${taal}-${maat}-${p.naam}`;
            const page = await ctx.newPage();
            const fouten: string[] = [];
            page.on('pageerror', (e) => fouten.push(e.message.slice(0, 160)));
            const cdp = await ctx.newCDPSession(page);
            await cdp.send('Performance.enable');
            const zwaar = vlag === 'uit' && tel && p.naam === 'agenten';
            await binnen(page.goto(`${p.url}?lang=${taal}${p.hash}`, { waitUntil: 'domcontentloaded', timeout: 30000 }), 30000);
            await page.waitForTimeout(zwaar ? 2500 : 6000);
            await binnen(page.screenshot({ path: `${UIT}/${naam}.png` }), zwaar ? 20000 : 15000);
            if (zwaar) { check(`${naam}: oude weergave geopend (vroege schermafdruk, geen eis)`, true); await binnen(page.close(), 10000); continue; }
            const st = await binnen(page.evaluate(() => ({ attr: document.documentElement.hasAttribute('data-mobiel-breedte-veilig'), hash: location.hash, lang: document.documentElement.lang, sw: document.documentElement.scrollWidth, iw: innerWidth, root: Boolean(document.getElementById('root')?.children.length) })), 10000);
            const m = await binnen(cdp.send('Performance.getMetrics').then((x: any) => Object.fromEntries(x.metrics.map((y: any) => [y.name, y.value]))), 5000) as Record<string, number> | null;
            check(`${naam}: pagina getekend`, Boolean(st?.root), st);
            check(`${naam}: attribuut volgt de vlag (${vlag})`, st?.attr === (vlag === 'aan'), st);
            check(`${naam}: geen horizontaal uitschuiven`, Boolean(st) && st!.sw <= st!.iw + 1, st);
            check(`${naam}: geen paginafouten`, fouten.length === 0, fouten);
            if (p.naam === 'agenten' && vlag === 'aan') {
              check(`${naam}: adres blijft #connectors`, st?.hash === '#connectors', st?.hash);
              check(`${naam}: lay-outtijd < 0,3 s`, Boolean(m) && m!.LayoutDuration < 0.3, m?.LayoutDuration);
            }
            await binnen(page.close(), 10000);
          }
        } finally { await binnen(browser.close(), 15000); }
      }
    }
  } finally {
    await sys.query("UPDATE app.feature_flags SET aan=false, gebruikers='{}' WHERE sleutel='mobiel-breedte-veilig-v1'").catch(() => undefined);
    await stop();
  }
  return einde();
}
