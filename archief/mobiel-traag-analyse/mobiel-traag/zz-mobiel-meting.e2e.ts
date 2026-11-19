// TIJDELIJK meetbestand (mobiel-traag), niet vastleggen. Meet /agenten#connectors met mobiele nabootsing.
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
import { randomBytes, createHash } from 'node:crypto';
import { checker } from '../eenheid/hulp/nep-google';
import { getPool } from '../../server/platform/pg';
import * as store from '../../backend/connectors-opslag';
import { auditToevoegen } from '../../server/platform/audit';
import { startE2eServer, chromeArgs } from './server';

const PW = process.env.PLAYWRIGHT_CORE!;
const TLS = process.env.E2E_TLS!;
const UIT = '/workspace/mobiel-traag';
const POORT = 8461;
const ID = 'https://id.tarasevych.com', MCP = 'https://mcp.tarasevych.com';
const sha = (s: string) => createHash('sha256').update(s).digest('hex');

const INIT = () => {
  const w = window as any;
  w.__m = { long: [] as Array<[number, number]>, rs: 0, ps: 0, scroll: 0, commits: 0, intervals: {} as Record<string, number>, frames: [] as number[], lcp: 0, cls: 0, kiesTijd: 0 };
  const m = w.__m;
  try { new PerformanceObserver((l) => { for (const e of l.getEntries()) m.long.push([Math.round(e.startTime), Math.round(e.duration)]); }).observe({ type: 'longtask', buffered: true }); } catch {}
  try { new PerformanceObserver((l) => { for (const e of l.getEntries()) m.lcp = Math.round(e.startTime); }).observe({ type: 'largest-contentful-paint', buffered: true }); } catch {}
  try { new PerformanceObserver((l) => { for (const e of l.getEntries() as any) if (!e.hadRecentInput) m.cls += e.value; }).observe({ type: 'layout-shift', buffered: true }); } catch {}
  const rs = history.replaceState.bind(history), ps = history.pushState.bind(history);
  history.replaceState = (...a: any[]) => { m.rs++; return (rs as any)(...a); };
  history.pushState = (...a: any[]) => { m.ps++; return (ps as any)(...a); };
  window.addEventListener('scroll', () => { m.scroll++; }, { capture: true, passive: true });
  const si = window.setInterval.bind(window);
  (window as any).setInterval = (f: any, ms?: number, ...r: any[]) => { const k = String(ms ?? 0); m.intervals[k] = (m.intervals[k] || 0) + 1; return si(f, ms, ...r); };
  // React-commits tellen via de devtools-haak.
  w.__REACT_DEVTOOLS_GLOBAL_HOOK__ = { renderers: new Map(), supportsFiber: true, inject: () => 1, onScheduleFiberRoot() {}, onCommitFiberRoot() { m.commits++; }, onCommitFiberUnmount() {}, onPostCommitFiberRoot() {}, checkDCE() {} };
  // Variant B: de scroll-luisteraar met capture op window (AgentenPagina «kies») negeren.
  if (sessionStorage.getItem('meet-zonder-kies') === '1') {
    const ae = window.addEventListener.bind(window);
    (window as any).addEventListener = (t: string, f: any, o: any) => { if (t === 'scroll' && o && typeof o === 'object' && o.capture && o.passive && String(f).includes('getBoundingClientRect')) return; return ae(t, f, o); };
  }
  if (sessionStorage.getItem('meet-zonder-effecten') === '1') {
    document.addEventListener('DOMContentLoaded', () => { const s = document.createElement('style'); s.textContent = '*,*::before,*::after{backdrop-filter:none!important;-webkit-backdrop-filter:none!important;filter:none!important;box-shadow:none!important;animation:none!important;transition:none!important}'; document.head.appendChild(s); });
  }
};

export async function main(): Promise<number> {
  const { check, einde } = checker('mobiel-meting');
  const { chromium } = createRequire(import.meta.url)(PW) as typeof import('playwright-core');
  const T = `${Date.now()}-${randomBytes(2).toString('hex')}`;
  const eigenaar = `meet-${T}@example.test`, sub = `sub-meet-${T}`;
  const { G, stop } = await startE2eServer({ ownerEmail: eigenaar, poort: POORT, tls: TLS });
  const pool = getPool(), sys = getPool('systeem');
  mkdirSync(`${UIT}/schermen`, { recursive: true });
  const browser = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', headless: true, args: chromeArgs(POORT) });
  const resultaat: Record<string, unknown> = {};
  try {
    const tab = randomBytes(24).toString('hex');
    const b = G.browser();
    await b.aanmelden(sub, eigenaar, { service: 'mcp', tabContext: tab, intent: 'login', authTime: Math.floor(Date.now() / 1000) });
    const uid = String((await pool.query("select id from app.records where tbl='users' and data->>'email'=$1", [eigenaar])).rows[0]?.id || '');
    check('eigenaar', !!uid);
    // ---- zaaien: een «bewoond» account ----
    for (let i = 0; i < 6; i++) await store.createAgent(uid, `ПК ${i}`, 'win32-x64', sha(`pc-${T}-${i}`), { roots: ['D:\\werk'] }, { autoApprove: ['list_dir'] }, { version: '1.4.0', pairingId: `pair${i}${T}`.replace(/[^A-Za-z0-9_-]/g, '') });
    for (let i = 0; i < 3; i++) await store.createAgent(uid, `Chrome ${i}`, 'browser', sha(`br-${T}-${i}`), {}, undefined, { version: '0.9.3' });
    for (const [i, naam] of ['Claude', 'ChatGPT', 'Grok', 'Gemini', 'Cursor', 'Claude'].entries()) {
      const cid = `meet-${naam}-${i}-${T}`;
      await sys.query('INSERT INTO app.mcp_oauth_clients (client_id, client_name, redirect_uris) VALUES ($1, $2, $3)', [cid, naam, ['https://claude.ai/api/mcp/auth_callback']]);
      await sys.query(`INSERT INTO app.mcp_oauth_tokens (user_id, client_id, client_name, scope, access_hash, refresh_hash, access_expires_at, refresh_expires_at, last_used_at)
        VALUES ($1, $2, $3, 'mcp', $4, $5, now() + interval '1 hour', now() + interval '30 days', now() - interval '2 hours')`, [uid, cid, naam, sha(`a-${T}-${i}`), sha(`r-${T}-${i}`)]);
    }
    for (let i = 0; i < 12; i++) await sys.query(`INSERT INTO app.mcp_console_tokens (user_id, name, prefix, token_hash, calls, last_seen_at) VALUES ($1, $2, $3, $4, 7, now() - interval '1 day')`, [uid, ['grok', 'claude', 'cursor', 'gemini'][i % 4], `mcpc_m${i}`, sha(`t-${T}-${i}`)]);
    for (let i = 0; i < 300; i++) await auditToevoegen({ ownerId: uid, action: i % 2 ? 'owner.mcp.grant.connected' : 'owner.agent.paired', type: 'beveiliging', result: 'success', details: { clientName: 'Claude', agent: 'claude', name: `ПК ${i % 6}`, platform: 'win32-x64' } });

    const meet = async (naam: string, opties: { zonderKies?: boolean; zonderEffecten?: boolean; minderBeweging?: boolean; throttle: boolean; trace?: boolean; idle?: number; profiel?: boolean }) => {
      const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, locale: 'uk-UA', colorScheme: 'light', serviceWorkers: 'block', ignoreHTTPSErrors: true, bypassCSP: !!opties.zonderEffecten, reducedMotion: opties.minderBeweging ? 'reduce' : 'no-preference',
        userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36' });
      await ctx.addCookies([...b.jar].flatMap(([name, value]) => [ID, MCP].map((url) => ({ name, value, url: `${url}/`, secure: true, httpOnly: true, sameSite: 'Lax' as const }))));
      await ctx.addInitScript((a) => { if (!sessionStorage.getItem('tsv-canonical-tab-v1')) sessionStorage.setItem('tsv-canonical-tab-v1', a.tab); sessionStorage.setItem('meet-zonder-kies', a.k ? '1' : '0'); sessionStorage.setItem('meet-zonder-effecten', a.e ? '1' : '0'); }, { tab, k: !!opties.zonderKies, e: !!opties.zonderEffecten });
      await ctx.addInitScript(INIT);
      const page = await ctx.newPage();
      const cdp = await ctx.newCDPSession(page);
      await cdp.send('Performance.enable');
      if (opties.throttle) {
        await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
        await cdp.send('Network.enable');
        await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 150, downloadThroughput: 1.6 * 1024 * 1024 / 8, uploadThroughput: 750 * 1024 / 8 });
      }
      const verzoeken: Array<{ url: string; t: number; type: string }> = [];
      const t0 = Date.now();
      page.on('request', (q) => verzoeken.push({ url: q.url().replace(/^https:\/\/[^/]+/, ''), t: Date.now() - t0, type: q.resourceType() }));
      const fouten: string[] = [];
      page.on('pageerror', (e) => fouten.push(e.message));
      await page.coverage.startJSCoverage({ resetOnNavigation: false, reportAnonymousScripts: false });
      if (opties.profiel) { await cdp.send('Profiler.enable'); await cdp.send('Profiler.setSamplingInterval', { interval: 500 }); await cdp.send('Profiler.start'); }
      const start = Date.now();
      await page.goto(`${MCP}/agenten#connectors`, { waitUntil: 'load', timeout: 180000 });
      const laadTijd = Date.now() - start;
      await page.locator('#ag-sectie-connectors').waitFor({ timeout: 120000 }).catch(() => undefined);
      const zichtbaarNa = Date.now() - start;
      await page.waitForLoadState('networkidle', { timeout: 120000 }).catch(() => undefined);
      await page.waitForTimeout(3000);
      const rustNa = Date.now() - start;
      if (opties.profiel) { const { profile } = await cdp.send('Profiler.stop') as any; writeFileSync(`${UIT}/profiel-${naam}.cpuprofile`, JSON.stringify(profile)); }
      const nav = await page.evaluate(() => { const n = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming; const fcp = performance.getEntriesByName('first-contentful-paint')[0]; return { ttfb: Math.round(n.responseStart), dcl: Math.round(n.domContentLoadedEventEnd), load: Math.round(n.loadEventEnd), fcp: Math.round(fcp?.startTime ?? 0) }; });
      const laadM = await page.evaluate(() => { const m = (window as any).__m; const tbt = m.long.reduce((s: number, [, d]: [number, number]) => s + Math.max(0, d - 50), 0); return { lcp: m.lcp, cls: +m.cls.toFixed(3), longtasks: m.long.length, langsteTaak: Math.max(0, ...m.long.map((x: number[]) => x[1])), tbt, commits: m.commits, intervals: m.intervals, replaceState: m.rs }; });
      const cov = await page.coverage.stopJSCoverage();
      let totaal = 0, gebruikt = 0; const perBestand: Array<{ url: string; kb: number; gebruiktPct: number }> = [];
      for (const c of cov) { if (!c.url.includes('/assets/') && !c.url.includes('canonical')) continue; const len = c.source?.length ?? 0; const kaart = new Uint8Array(len); const rs = c.functions.flatMap((f) => f.ranges).sort((a, b2) => (b2.endOffset - b2.startOffset) - (a.endOffset - a.startOffset)); for (const r of rs) kaart.fill(r.count > 0 ? 1 : 0, r.startOffset, r.endOffset); let u = 0; for (let i = 0; i < len; i++) u += kaart[i]; totaal += len; gebruikt += u; perBestand.push({ url: c.url.replace(/^.*\//, ''), kb: Math.round(len / 1024), gebruiktPct: len ? Math.round(100 * u / len) : 0 }); }
      perBestand.sort((a, b2) => b2.kb - a.kb);
      const dom = await page.evaluate(() => {
        let regels = 0; for (const s of [...document.styleSheets]) { try { regels += s.cssRules.length; } catch {} }
        const alle = [...document.querySelectorAll('*')] as HTMLElement[];
        let backdrop = 0, anim = 0, schaduw = 0, filt = 0, vast = 0, willChange = 0;
        for (const el of alle) { const cs = getComputedStyle(el); if (cs.backdropFilter && cs.backdropFilter !== 'none') backdrop++; if (cs.animationName && cs.animationName !== 'none') anim++; if (cs.boxShadow && cs.boxShadow !== 'none') schaduw++; if (cs.filter && cs.filter !== 'none') filt++; if (cs.position === 'fixed' || cs.position === 'sticky') vast++; if (cs.willChange && cs.willChange !== 'auto') willChange++; }
        const sc = (() => { const el = document.getElementById('ag-paneel'); for (let p = el?.parentElement; p; p = p.parentElement) { const y = getComputedStyle(p).overflowY; if ((y === 'auto' || y === 'scroll') && p.scrollHeight > p.clientHeight) return `${p.tagName.toLowerCase()}.${[...p.classList].join('.')}`; } return 'window'; })();
        const animNamen = [...new Set(alle.map((e) => getComputedStyle(e).animationName).filter((x) => x && x !== 'none'))];
        return { knopen: alle.length, cssRegels: regels, stylesheets: document.styleSheets.length, backdrop, anim, animNamen, schaduw, filt, vastOfKleverig: vast, willChange, scrollHouder: sc, hoogte: document.documentElement.scrollHeight, secties: document.querySelectorAll('[data-ag-sectie]').length, open: document.querySelectorAll('[data-ag-lui=open]').length };
      });
      await page.screenshot({ path: `${UIT}/schermen/${naam}-start.png` });
      const metrVoor = Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map((x: any) => [x.name, x.value]));
      // ---- scrollen: 6 vegen omlaag en 2 omhoog met echte aanraakgebaren ----
      await page.evaluate(() => { const m = (window as any).__m; m.long = []; m.commits = 0; m.rs = 0; m.scroll = 0; m.frames = []; let v = performance.now(); const lus = (t: number) => { m.frames.push(t - v); v = t; if (m.frames.length < 100000 && !m.stopFrames) requestAnimationFrame(lus); }; requestAnimationFrame(lus); });
      if (opties.trace) await browser.startTracing(page, { path: `${UIT}/trace-${naam}.json`, categories: ['devtools.timeline', 'disabled-by-default-devtools.timeline', 'blink.user_timing', 'v8.execute', 'toplevel'] });
      const s0 = Date.now();
      await page.evaluate(async () => { const w = document.querySelector('.canonical-workspace') as HTMLElement; const stap = (dy: number, n: number) => new Promise<void>((r) => { let i = 0; const f = () => { w.scrollTop += dy; if (++i < n) requestAnimationFrame(f); else r(); }; requestAnimationFrame(f); }); for (let k = 0; k < 4; k++) await stap(25, 120); await stap(-25, 120); });
      const scrollDuur = Date.now() - s0;
      if (opties.trace) await browser.stopTracing();
      await page.waitForTimeout(1500);
      const scrollM = await page.evaluate(() => { const m = (window as any).__m; m.stopFrames = true; const f = m.frames.slice(1) as number[]; const srt = [...f].sort((a, b) => a - b); const p = (q: number) => Math.round(srt[Math.floor(q * (srt.length - 1))] || 0); const tbt = m.long.reduce((s: number, [, d]: [number, number]) => s + Math.max(0, d - 50), 0);
        return { frames: f.length, mediaan: p(0.5), p95: p(0.95), max: Math.round(srt[srt.length - 1] || 0), traag33: f.filter((x) => x > 33.4).length, traag100: f.filter((x) => x > 100).length, longtasks: m.long.length, tbt, langsteTaak: Math.max(0, ...m.long.map((x: number[]) => x[1])), scrollEvents: m.scroll, replaceState: m.rs, commits: m.commits, hash: location.hash, scrollTop: (document.querySelector('.canonical-workspace') as HTMLElement)?.scrollTop, scrollHoogte: (document.querySelector('.canonical-workspace') as HTMLElement)?.scrollHeight, open: document.querySelectorAll('[data-ag-lui=open]').length }; });
      const metrNa = Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map((x: any) => [x.name, x.value]));
      const verschil = Object.fromEntries(['LayoutCount', 'RecalcStyleCount', 'LayoutDuration', 'RecalcStyleDuration', 'ScriptDuration', 'TaskDuration'].map((k) => [k, +(metrNa[k] - metrVoor[k]).toFixed(3)]));
      await page.screenshot({ path: `${UIT}/schermen/${naam}-na-scrollen.png` });
      // ---- stilstand: wat gebeurt er vanzelf (pollen, commits) ----
      let rust: unknown = null;
      if (opties.idle) {
        const n0 = verzoeken.length;
        await page.evaluate(() => { const m = (window as any).__m; m.commits = 0; m.long = []; });
        const r0 = Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map((x: any) => [x.name, x.value]));
        await page.waitForTimeout(opties.idle);
        const r1 = Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map((x: any) => [x.name, x.value]));
        const api = verzoeken.slice(n0).filter((v) => v.url.startsWith('/api/'));
        const perUrl: Record<string, number> = {}; for (const v of api) perUrl[v.url] = (perUrl[v.url] || 0) + 1;
        rust = { seconden: opties.idle / 1000, apiVerzoeken: api.length, perUrl, ...(await page.evaluate(() => { const m = (window as any).__m; return { commits: m.commits, longtasks: m.long.length, tbt: m.long.reduce((s: number, [, d]: [number, number]) => s + Math.max(0, d - 50), 0) }; })), scriptSec: +(r1.ScriptDuration - r0.ScriptDuration).toFixed(2), taakSec: +(r1.TaskDuration - r0.TaskDuration).toFixed(2), heapMB: +(r1.JSHeapUsedSize / 1048576).toFixed(1) };
      }
      const perType: Record<string, number> = {}; for (const v of verzoeken) perType[v.type] = (perType[v.type] || 0) + 1;
      const apiLaad: Record<string, number> = {}; for (const v of verzoeken.filter((x) => x.url.startsWith('/api/') && x.t < rustNa)) apiLaad[v.url] = (apiLaad[v.url] || 0) + 1;
      const r = { naam, opties, laadTijd, zichtbaarNa, rustNa, nav, laadM, verzoekenTotaal: verzoeken.filter((v) => v.t < rustNa).length, perType, apiLaad, js: { totaalKB: Math.round(totaal / 1024), gebruiktPct: totaal ? Math.round(100 * gebruikt / totaal) : 0, grootste: perBestand.slice(0, 12) }, dom, scrollDuur, scrollM, verschil, heapMB: +(metrNa.JSHeapUsedSize / 1048576).toFixed(1), knopenCdp: metrNa.Nodes, listeners: metrNa.JSEventListeners, rust, fouten: fouten.slice(0, 5) };
      console.log(JSON.stringify(r));
      resultaat[naam] = r;
      await ctx.close();
    };
    await meet('A1-gewoon-4x', { throttle: true, profiel: true, idle: 30000 });
    await meet('A2-gewoon-4x', { throttle: true, trace: true });
    await meet('B-zonder-scrollluisteraar-4x', { throttle: true, zonderKies: true });
    await meet('C-zonder-css-effecten-4x', { throttle: true, zonderEffecten: true, idle: 30000 });
    await meet('E-minder-beweging-4x', { throttle: true, minderBeweging: true, idle: 30000 });
    await meet('D-gewoon-zonder-vertraging', { throttle: false, profiel: true });
    writeFileSync(`${UIT}/meting2.json`, JSON.stringify(resultaat, null, 2));
  } finally {
    await browser.close().catch(() => undefined);
    await stop();
  }
  return einde();
}
