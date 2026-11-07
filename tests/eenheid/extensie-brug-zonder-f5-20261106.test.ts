// EXT090-001 (06.11.2026, verzoek van de eigenaar): «Розширення активне на сторінці — не пройшло — Оновіть сторінку (F5)» weg.
// Oorzaak: Chrome plaatst content scripts alleen in pagina's die NA het laden van de extensie openen. Na installeren, bijwerken of
// herladen hadden open tarasevych.com-tabbladen dus geen brug: de site zag de extensie niet (sessie «weg») tot de gebruiker F5 deed.
// 0.9.0: het achtergrondproces plaatst collector.js (MAIN) en bridge.js (ISOLATED) zelf via chrome.scripting, alleen op eigen
// tabbladen en alleen als er geen levende brug is. De zelftest gebruikt dat ook; 'bridge' is geen voorwaarde meer.
// Daarnaast: de kop toont zonder koppeling geen oude e-mail (accountEmail leeg) en de status meldt de keuzes van de lokale AI.
// Geen netwerk, geen database: de echte background.js draait met een nep-chrome.
import { cpSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { checker } from './hulp/nep-google';

const EXT = join(process.cwd(), 'extension');
const ID = 'abcdefghijklmnopabcdefghijklmnop';
const BASIS = `chrome-extension://${ID}/`;
type Luisteraar = (m: unknown, s: unknown, r: (x: unknown) => void) => unknown;
type Tab = { id: number; url: string; discarded?: boolean };

function nepChrome(tabs: Tab[], opslag: Record<string, unknown>) {
  const luister = { intern: [] as Luisteraar[], installed: [] as Array<(d: unknown) => unknown>, opslag: [] as Array<(w: unknown, g: string) => unknown> };
  const ev = <T,>(lijst?: T[]) => ({ addListener: (f: T) => { lijst?.push(f); } });
  const leeg = (): any => new Proxy(function () { /* nep */ }, { get: (_t, k) => (k === 'then' ? undefined : leeg()), apply: () => Promise.resolve({}) });
  const metBrug = new Set<number>();          // tabbladen waar een levende brug draait
  const geplaatst: Array<{ tabId: number; files: string[]; world?: string }> = [];
  const berichten: Array<{ tabId: number; op: string }> = [];
  let weigerScripting = false;
  const local = {
    get: async (k: string | string[]) => { const ks = Array.isArray(k) ? k : [k]; return Object.fromEntries(ks.filter((x) => x in opslag).map((x) => [x, opslag[x]])); },
    set: async (o: Record<string, unknown>) => { Object.assign(opslag, o); },
    remove: async (k: string | string[]) => { for (const x of Array.isArray(k) ? k : [k]) delete opslag[x]; },
  };
  const chrome = {
    runtime: {
      id: ID, getURL: (p: string) => `${BASIS}${p}`, getManifest: () => JSON.parse(readFileSync(join(EXT, 'manifest.json'), 'utf8')),
      onMessage: ev(luister.intern), onMessageExternal: ev(), onInstalled: ev(luister.installed), onStartup: ev(),
      openOptionsPage: async () => undefined, sendMessage: async () => undefined,
    },
    storage: { local, session: { get: async () => ({}), set: async () => undefined, remove: async () => undefined, setAccessLevel: async () => undefined }, onChanged: ev(luister.opslag) },
    alarms: { create: () => undefined, clear: async () => undefined, onAlarm: ev() },
    tabs: {
      query: async (q: { url?: string; active?: boolean }) => (q && q.url ? tabs.filter((t) => /^https:\/\/([a-z0-9-]+\.)*tarasevych\.com\//.test(t.url)) : tabs.slice(0, 1)),
      get: async (id: number) => tabs.find((t) => t.id === id) ?? null,
      sendMessage: async (tabId: number, bericht: { op: string }) => {
        berichten.push({ tabId, op: bericht.op });
        // Zoals Chrome: zonder content script «Could not establish connection. Receiving end does not exist.»
        if (!metBrug.has(tabId)) throw new Error('Could not establish connection. Receiving end does not exist.');
        if (bericht.op === 'brug?') return { ok: true, data: { versie: '0.9.0' } };
        if (bericht.op === 'self_test') return { ok: true, data: { bridge: true, buffered: 0, markering: null, lezers: 0 } };
        if (bericht.op === 'account?') return { ok: true, data: { claim: '', profiel: 'gebruiker' } };
        return { ok: true };
      },
      create: async () => undefined, onRemoved: ev(), onUpdated: ev(), onActivated: ev(),
    },
    scripting: {
      executeScript: async (o: { target: { tabId: number }; files: string[]; world?: string }) => {
        if (weigerScripting) throw new Error('Cannot access contents of the page.');
        geplaatst.push({ tabId: o.target.tabId, files: o.files, world: o.world });
        if (o.files.includes('bridge.js')) metBrug.add(o.target.tabId);
        return [];
      },
    },
    permissions: { contains: async () => false, request: async () => false, remove: async () => true, onAdded: ev(), onRemoved: ev() },
    debugger: leeg(), sidePanel: leeg(), windows: leeg(), webRequest: leeg(), action: leeg(),
  };
  return {
    chrome: new Proxy(chrome as Record<string, unknown>, { get: (t, k) => (k in t ? t[k as string] : leeg()) }),
    luister, metBrug, geplaatst, berichten, weiger: (v: boolean) => { weigerScripting = v; },
  };
}
const vraag = (f: Luisteraar, m: unknown, s: unknown) => new Promise<any>((klaar) => { f(m, s, klaar); setTimeout(() => klaar('GEEN_ANTWOORD'), 4000); });
const rust = (ms = 50) => new Promise((r) => setTimeout(r, ms));
async function tot(f: () => boolean, ms = 3000) { const eind = Date.now() + ms; while (Date.now() < eind) { if (f()) return true; await rust(20); } return f(); }

export async function main(): Promise<number> {
  const { check, einde } = checker('extensie-brug-zonder-f5-20261106');
  // Drie open tabbladen van vóór de update: twee eigen (één met al een levende brug), één vreemde site.
  const tabs: Tab[] = [
    { id: 11, url: 'https://mcp.tarasevych.com/agents#extensie' },
    { id: 12, url: 'https://hub.tarasevych.com/' },
    { id: 13, url: 'https://example.com/' },
  ];
  const opslag: Record<string, unknown> = { lokaleAi: { aan: true, apis: { prompt: true, summarizer: false, writer: true, rewriter: true, translator: true, detector: true, proofreader: false } } };
  const nep = nepChrome(tabs, opslag);
  nep.metBrug.add(12);
  (globalThis as any).chrome = nep.chrome;
  (globalThis as any).WebSocket = class { static OPEN = 1; readyState = 0; close() { /* nep */ } send() { /* nep */ } addEventListener() { /* nep */ } };
  const map = mkdtempSync(join(tmpdir(), 'mr-ext-f5-'));
  cpSync(EXT, map, { recursive: true });
  await import(pathToFileURL(join(map, 'background.js')).href);
  const intern = nep.luister.intern[0];
  check('background.js geladen met nep-chrome', typeof intern === 'function' && nep.luister.installed.length === 1);

  // ---- 1. bij het opstarten van de service worker: de brug komt zelf op open eigen tabbladen, nergens anders, nooit dubbel ----
  const klaar = await tot(() => nep.metBrug.has(11));
  check('zonder F5: open tarasevych.com-tabblad zonder brug krijgt collector.js (MAIN) en bridge.js (ISOLATED) via chrome.scripting',
    klaar && nep.geplaatst.some((g) => g.tabId === 11 && g.files.join() === 'collector.js' && g.world === 'MAIN')
    && nep.geplaatst.some((g) => g.tabId === 11 && g.files.join() === 'bridge.js' && g.world === undefined), JSON.stringify(nep.geplaatst));
  check('tabblad met een levende brug krijgt NIETS extra (eerst ping «brug?», geen dubbele brug)',
    !nep.geplaatst.some((g) => g.tabId === 12) && nep.berichten.some((b) => b.tabId === 12 && b.op === 'brug?'));
  check('een vreemde site (example.com) wordt nooit aangeraakt', !nep.geplaatst.some((g) => g.tabId === 13) && !nep.berichten.some((b) => b.tabId === 13));

  // ---- 2. na installeren/bijwerken/herladen (onInstalled): opnieuw, voor tabbladen die intussen hun brug verloren ----
  nep.metBrug.delete(11); nep.metBrug.delete(12);
  const voor = nep.geplaatst.length;
  await nep.luister.installed[0]({ reason: 'update', previousVersion: '0.9.1' });
  check('onInstalled (update 0.9.1 → 0.9.2): beide eigen tabbladen krijgen de brug terug, zonder dat de gebruiker iets doet',
    await tot(() => nep.metBrug.has(11) && nep.metBrug.has(12)) && nep.geplaatst.slice(voor).filter((g) => g.files.includes('bridge.js')).length === 2, JSON.stringify(nep.geplaatst.slice(voor)));

  // ---- 3. zelftest (opties): ontbreekt de brug, dan plaatst de test hem eerst — «bridge» slaagt zonder F5 ----
  const optiesTab = { id: ID, url: `${BASIS}options.html`, origin: BASIS.slice(0, -1), tab: { id: 7, url: `${BASIS}options.html` } };
  nep.metBrug.delete(11);
  const zt = await vraag(intern, { op: 'self-test' }, optiesTab);
  const brug = Array.isArray(zt?.checks) ? zt.checks.find((c: any) => c.id === 'bridge') : null;
  check("zelftest: 'bridge' slaagt nadat de extensie zichzelf op het tabblad plaatste (vroeger: «Оновіть сторінку (F5)»)", !!brug && brug.ok === true && nep.metBrug.has(11), JSON.stringify(zt?.checks));
  nep.metBrug.delete(11); nep.weiger(true);
  const zt2 = await vraag(intern, { op: 'self-test' }, optiesTab);
  const brug2 = Array.isArray(zt2?.checks) ? zt2.checks.find((c: any) => c.id === 'bridge') : null;
  const verplicht = Array.isArray(zt2?.checks) ? zt2.checks.filter((c: any) => !c.ok && c.id === 'bridge') : [];
  check("zelftest: lukt plaatsen niet (Chrome weigert), dan staat 'bridge' op ✗ maar telt NIET als voorwaarde (informatief)",
    !!brug2 && brug2.ok === false && verplicht.length === 1 && !String(JSON.stringify(zt2)).includes('F5'), JSON.stringify(zt2));
  nep.weiger(false);

  // ---- 4. status voor eigen pagina's: geen oude e-mail zonder koppeling; keuzes van de lokale AI (geen tekst) ----
  const st = await vraag(intern, { op: 'status' }, optiesTab);
  check('status zonder koppeling: accountEmail leeg (de kop toont «Увійти», nooit een oude e-mail)', st && st.accountEmail === '' && st.sloten?.prive?.gekoppeld === false, JSON.stringify(st && { accountEmail: st.accountEmail }));
  check('status: lokaleAi = alleen hoofdschakelaar + ingeschakelde API-namen uit de opties (summarizer en proofreader uit) + «!» siteToegang (standaard uit)',
    JSON.stringify(st?.lokaleAi) === '{"aan":true,"apis":["prompt","writer","rewriter","translator","detector"],"siteToegang":false}', JSON.stringify(st?.lokaleAi));
  delete opslag.lokaleAi;
  const st2 = await vraag(intern, { op: 'status' }, optiesTab);
  check('status: nog nooit opgeslagen → standaard van lokale-ai.js (alles aan)', st2?.lokaleAi?.aan === true && st2.lokaleAi.apis.length === 7, JSON.stringify(st2?.lokaleAi));
  check('wijziging van de lokale AI in de opslag → de status wordt meteen opnieuw geduwd (luisteraar op storage.onChanged)', nep.luister.opslag.length >= 1);

  // ---- 5. teksten: nergens meer de F5-eis in de diagnose ----
  const opt = readFileSync(join(EXT, 'options.js'), 'utf8').split('\n').filter((r) => !r.trim().startsWith('//')).join('\n'); // zonder commentaar
  check('opties: herstelteksten van bridge en markering vragen geen F5/vernieuwen meer', !/F5/.test(opt) && /під’єднується до відкритих сторінок tarasevych\.com саме/.test(opt));
  return einde();
}
