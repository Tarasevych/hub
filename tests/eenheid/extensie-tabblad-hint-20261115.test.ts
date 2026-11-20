// 0.9.4 (15.11.2026, verzoek van de eigenaar): «Відкрита вкладка Mijn Ruimte — не пройшло — Відкрийте будь-яку сторінку
// tarasevych.com в активній вкладці» weg. Wat er mis was:
//   1. de diagnose staat zelf in de actieve tab (options.html), dus «actief tabblad» kon daar nooit kloppen — maar de achtergrond
//      zocht al in ALLE vensters (ownTabs). Wat echt faalde: na het wekken van de service worker of na een update waren open
//      tabbladen 'onbekend' (geen brug, geen profiel) en paste geen enkel tabblad — ook voor opdrachten van de AI;
//   2. de regel telde als ✗ terwijl er niets kapot is: de AI opent zelf een pagina (navigate) als er geen open staat;
//   3. de kop zei «Обліковий запис не підключено» omdat /self bewust geen e-mail teruggeeft (zie extensie-ui).
// Nu: zelftest haalt eerst de stand van de eigen tabbladen op (brug zo nodig plaatsen), site_tab is een hint (ⓘ), en de
// status meldt hoeveel site-tabbladen er op de achtergrond open staan (siteTabs). Geen netwerk, geen database: nep-chrome.
// 0.9.4: активна вкладка більше не умова; вкладки сайту шукаються у фоні.
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
      query: async (q: { url?: string; active?: boolean }) => (q && q.url ? tabs.filter((t) => /^https:\/\/([a-z0-9-]+\.)*tarasevych\.com\//.test(t.url)) : tabs.filter((t) => !/tarasevych\.com\//.test(t.url)).slice(0, 1)),
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
  const { check, einde } = checker('extensie-tabblad-hint-20261115');
  // De actieve tab is de optiespagina zelf (zoals op de schermafbeelding); er staat nog GEEN tarasevych.com-tabblad open.
  const tabs: Tab[] = [{ id: 7, url: `${BASIS}options.html#diagnose` }];
  const nep = nepChrome(tabs, {});
  (globalThis as any).chrome = nep.chrome;
  (globalThis as any).WebSocket = class { static OPEN = 1; readyState = 0; close() { /* nep */ } send() { /* nep */ } addEventListener() { /* nep */ } };
  const map = mkdtempSync(join(tmpdir(), 'mr-ext-hint-'));
  cpSync(EXT, map, { recursive: true });
  await import(pathToFileURL(join(map, 'background.js')).href);
  const intern = nep.luister.intern[0];
  const opties = { id: ID, url: `${BASIS}options.html`, origin: BASIS.slice(0, -1), tab: { id: 7, url: `${BASIS}options.html` } };
  await rust();

  // ---- 1. geen enkel site-tabblad: site_tab is een hint (ⓘ), geen ✗, en telt niet mee ----
  const z1 = await vraag(intern, { op: 'self-test' }, opties);
  const s1 = z1?.checks?.find((c: any) => c.id === 'site_tab');
  check('geen site-tabblad open: site_tab ok=false met hint=true en tabs=0 (de UI toont ⓘ, geen ✗)', !!s1 && s1.ok === false && s1.hint === true && s1.tabs === 0, JSON.stringify(s1));
  check('alleen site_tab krijgt hint (andere regels blijven gewone ✓/✗)', z1.checks.filter((c: any) => c.hint).every((c: any) => c.id === 'site_tab'), JSON.stringify(z1.checks));
  const st1 = await vraag(intern, { op: 'status' }, opties);
  check('status: siteTabs = 0, profielTab null (actieve tab = de optiespagina)', st1?.siteTabs === 0 && st1.profielTab === null, JSON.stringify({ siteTabs: st1?.siteTabs, profielTab: st1?.profielTab }));

  // ---- 2. site-tabblad op de ACHTERGROND (niet actief, van vóór de update: geen brug) → gevonden, brug geplaatst, profiel bekend ----
  tabs.push({ id: 21, url: 'https://hub.tarasevych.com/' }, { id: 22, url: 'https://mail.tarasevych.com/inbox' });
  const z2 = await vraag(intern, { op: 'self-test' }, opties);
  const s2 = z2?.checks?.find((c: any) => c.id === 'site_tab');
  check('achtergrond-tabbladen (actieve tab blijft de optiespagina): site_tab ✓, geen hint, tabs=2', !!s2 && s2.ok === true && !s2.hint && s2.tabs === 2, JSON.stringify(s2));
  check('tabbladen zonder brug krijgen die eerst (geen F5, geen klik op het tabblad)', nep.metBrug.has(21) && nep.metBrug.has(22), JSON.stringify(nep.geplaatst));
  const acc = nep.berichten.filter((b) => b.tabId === 21 && b.op === 'account?');
  check("claimVan: geen antwoord op 'account?' → brug plaatsen en opnieuw vragen (tabblad niet langer 'onbekend')", acc.length >= 2, JSON.stringify(nep.berichten.filter((b) => b.tabId === 21)));
  const prof = z2.checks.find((c: any) => c.id === 'profiel');
  check('profiel van het gevonden tabblad komt van de brug (gebruiker), niet «onbekend»', prof?.detail === 'gebruiker', JSON.stringify(prof));
  const st2 = await vraag(intern, { op: 'status' }, opties);
  check('status: siteTabs = 2 (kop: «Відкрито сторінок tarasevych.com: 2 (працюють у фоні)»)', st2?.siteTabs === 2, String(st2?.siteTabs));
  check('siteTabs gaat NIET naar de site (publieke status blijft het contract)', !/siteTabs/.test(readFileSync(join(EXT, 'background.js'), 'utf8').split('function publiek')[1].split('\n}\n')[0]));

  // ---- 3. vreemde sites blijven buiten beeld ----
  tabs.push({ id: 31, url: 'https://example.com/' });
  await vraag(intern, { op: 'self-test' }, opties);
  check('een vreemde site wordt nooit aangeraakt of meegeteld', !nep.geplaatst.some((g) => g.tabId === 31) && !nep.berichten.some((b) => b.tabId === 31));

  // ---- 4. teksten: nergens meer de eis «в активній вкладці» ----
  const opt = readFileSync(join(EXT, 'options.js'), 'utf8').split('\n').filter((r) => !r.trim().startsWith('//')).join('\n');
  check('opties: geen «в активній вкладці» / «in het actieve tabblad» meer als herstel', !/в активній вкладці|in het actieve tabblad\./.test(opt));
  check('opties: hint telt niet als «не виконано» (filter !c.hint) en krijgt ⓘ', /!c\.ok && !c\.hint/.test(opt) && /'ⓘ'/.test(opt));
  return einde();
}
