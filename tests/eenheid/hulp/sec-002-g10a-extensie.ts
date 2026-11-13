// Testhulp (geen test zelf) voor tests/eenheid/sec-002-g10a-20261112.test.ts: de ECHTE extension/background.js met een nagebootste
// chrome-API (kader uit tests/eenheid/extensie-profielen.test.ts en het bewijs van de audit, poc-profiel.ts). Geen netwerk, geen database.
//   extensie-03  privé-slot ziet/verplaatst/sluit een TECHNISCH tabblad nadat het achtergrondproces het profiel kwijt is
//   extensie-04  een tabblad waarvan het profiel onbekend is, geldt niet langer als gebruikerstabblad
import { createHmac, randomBytes, randomUUID } from 'node:crypto';
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { signCommand } from '../../../backend/connectors-crypto';
import * as TS from '../../../shared/extensie-ontgrendeling';

type Check = (naam: string, ok: boolean, info?: string) => void;
type Luisteraar = (...a: any[]) => any;
type Tab = { id: number; url: string; active: boolean; windowId: number; title: string };
const ID = 'ofpffonakgjioahgfejmiblfmbkobmmi';
const USER = 'user-7';
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const rustig = async (n = 6) => { for (let i = 0; i < n; i += 1) await sleep(5); };
async function tot(fn: () => boolean, ms = 3000) { const eind = Date.now() + ms; while (Date.now() < eind) { if (fn()) return true; await sleep(10); } return false; }

class NepWS {
  static CONNECTING = 0; static OPEN = 1; static CLOSING = 2; static CLOSED = 3;
  static alle: NepWS[] = [];
  readyState = 0; sent: any[] = []; url: string;
  onopen: Luisteraar | null = null; onmessage: Luisteraar | null = null; onclose: Luisteraar | null = null; onerror: Luisteraar | null = null;
  constructor(url: string) { this.url = url; NepWS.alle.push(this); setTimeout(() => { this.readyState = 1; void this.onopen?.(); }, 0); }
  send(s: string) { this.sent.push(JSON.parse(s)); }
  close(code = 1000) { if (this.readyState === 3) return; this.readyState = 3; void this.onclose?.({ code }); }
  ontvang(m: unknown) { void this.onmessage?.({ data: JSON.stringify(m) }); }
}
function nepIndexedDB() {
  const dbs = new Map<string, Map<string, Map<string, unknown>>>();
  return {
    open(naam: string) {
      const r: any = {};
      setTimeout(() => {
        const nieuw = !dbs.has(naam);
        if (nieuw) dbs.set(naam, new Map());
        const stores = dbs.get(naam)!;
        r.result = {
          objectStoreNames: { contains: (n: string) => stores.has(n) },
          createObjectStore: (n: string) => { stores.set(n, new Map()); },
          transaction: (n: string) => {
            const m = stores.get(n)!; const tx: any = {};
            tx.objectStore = () => ({ get: (k: string) => ({ result: structuredClone(m.get(k)) }), put: (v: unknown, k: string) => { m.set(k, structuredClone(v)); return {}; }, delete: (k: string) => { m.delete(k); return {}; } });
            setTimeout(() => tx.oncomplete?.(), 0);
            return tx;
          },
        };
        if (nieuw) r.onupgradeneeded?.();
        r.onsuccess?.();
      }, 0);
      return r;
    },
  };
}

export async function extensieBlok(check: Check): Promise<void> {
  const W = process.cwd();
  const KP = randomBytes(32).toString('base64url');
  const teken = (key: string, g: TS.Ontgrendeling) => createHmac('sha256', Buffer.from(key, 'base64url')).update(TS.ontgrendelTekst(g)).digest('hex');
  const g = globalThis as Record<string, any>;
  const bewaard = { fetch: g.fetch, WebSocket: g.WebSocket, indexedDB: g.indexedDB, chrome: g.chrome };
  g.fetch = async (url: string) => {
    const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { 'Content-Type': 'application/json' } });
    const u = String(url);
    if (u.endsWith('/api/owner/agents/pair')) return json({ token: 'tok-prive-xxxxxxxxxxxxxxxx', agentId: 'agent-prive', userId: USER, commandKey: KP, ruimte: 'prive' });
    if (u.endsWith('/api/owner/agents/ws-ticket')) return json({ ticket: 'ticket-1' });
    if (u.endsWith('/api/owner/agents/self')) return json({ enabled: true, active: true, ruimte: 'prive', techRecht: true, email: 'u7@test.invalid' });
    if (u.includes('/downloads/')) return json({}, 404);
    return json({ ok: true });
  };
  g.WebSocket = NepWS;
  g.indexedDB = nepIndexedDB();
  const tabs: Tab[] = [
    { id: 6, url: 'https://mail.tarasevych.com/inbox', active: false, windowId: 1, title: 'Пошта' },
    { id: 7, url: 'https://mcp.tarasevych.com/agents', active: true, windowId: 1, title: 'ТЕХНІЧНА: керування сервером' },
  ];
  // Wat de brug van elk tabblad antwoordt op 'account?': profiel (of 'stil' = geen antwoord) en het account van de pagina.
  const profielen: Record<number, string> = { 6: 'gebruiker', 7: 'technisch' };
  const accounts: Record<number, string> = { 6: USER, 7: USER };
  const acties: string[] = [];
  const L = { intern: [] as Luisteraar[], extern: [] as Luisteraar[], tabUpd: [] as Luisteraar[] };
  const ev = (lijst?: Luisteraar[]) => ({ addListener: (f: Luisteraar) => { lijst?.push(f); }, removeListener: (f: Luisteraar) => { if (lijst) { const i = lijst.indexOf(f); if (i >= 0) lijst.splice(i, 1); } } });
  const leeg = (): any => new Proxy(function () { /* nep */ }, { get: (_t, k) => (k === 'then' ? undefined : leeg()), apply: () => Promise.resolve(undefined) });
  const opslag = (o: Record<string, any>) => ({
    get: async (k?: string | string[]) => { if (k === undefined) return { ...o }; const ks = Array.isArray(k) ? k : [k]; return Object.fromEntries(ks.filter((x) => x in o).map((x) => [x, structuredClone(o[x])])); },
    set: async (n: Record<string, any>) => { for (const [k, v] of Object.entries(n)) o[k] = structuredClone(v); },
    remove: async (k: string | string[]) => { for (const x of Array.isArray(k) ? k : [k]) delete o[x]; },
    setAccessLevel: async () => undefined,
  });
  const brug: Record<string, (m: any, tabId: number) => any> = {
    'account?': (_m, tabId) => { if (profielen[tabId] === 'stil') throw new Error('Could not establish connection. Receiving end does not exist.'); return { ok: true, data: { claim: `${accounts[tabId]}:s`, profiel: profielen[tabId] } }; },
    'brug?': (_m, tabId) => { if (profielen[tabId] === 'stil') throw new Error('Could not establish connection. Receiving end does not exist.'); return { ok: true, data: { versie: 'test' } }; },
    snapshot: (_m, tabId) => ({ ok: true, data: { url: tabs.find((t) => t.id === tabId)!.url, title: `tab-${tabId}` } }),
  };
  const chrome = {
    runtime: {
      id: ID, getURL: (p: string) => `chrome-extension://${ID}/${p}`, getManifest: () => JSON.parse(readFileSync(join(W, 'extension/manifest.json'), 'utf8')),
      onMessage: ev(L.intern), onMessageExternal: ev(L.extern), onInstalled: ev(), onStartup: ev(), openOptionsPage: async () => undefined,
      sendMessage: async () => undefined,
    },
    storage: { local: opslag({}), session: opslag({}), onChanged: ev() },
    alarms: { create: () => undefined, clear: async () => true, onAlarm: ev() },
    tabs: {
      query: async () => tabs.map((t) => ({ ...t })), get: async (id: number) => ({ ...tabs.find((t) => t.id === id)! }),
      sendMessage: async (tabId: number, msg: any) => { const h = brug[msg.op]; return h ? h(msg, tabId) : { ok: true }; },
      create: async (o: any) => { acties.push(`tabs.create(${JSON.stringify(o)})`); const t = { id: 99, active: true, windowId: 1, title: 'nieuw', ...o }; tabs.push(t); setTimeout(() => [...L.tabUpd].forEach((f) => f(99, { status: 'complete' }, { ...t })), 5); return t; },
      update: async (id: number, o: any) => { acties.push(`tabs.update(${id}, ${JSON.stringify(o)})`); const doel = tabs.find((x) => x.id === id)!; if (o.url) doel.url = o.url; setTimeout(() => [...L.tabUpd].forEach((f) => f(id, { status: 'complete' }, { ...doel })), 5); return { ...doel, ...o }; },
      remove: async (id: number) => { acties.push(`tabs.remove(${id})`); },
      onRemoved: ev(), onUpdated: ev(L.tabUpd), onActivated: ev(),
    },
    permissions: { contains: async () => false, onAdded: ev(), onRemoved: ev() },
    webRequest: { onBeforeRequest: ev(), onCompleted: ev(), onErrorOccurred: ev() },
    debugger: { attach: async () => undefined, detach: async () => undefined, sendCommand: async () => undefined, onDetach: ev(), onEvent: ev() },
    action: leeg(), sidePanel: leeg(), scripting: leeg(), windows: leeg(),
  };
  g.chrome = new Proxy(chrome as Record<string, unknown>, { get: (t, k) => (k in t ? t[k as string] : leeg()) });
  const vraag = (f: Luisteraar, m: unknown, s: unknown) => new Promise<any>((klaar) => { f(m, s, klaar); setTimeout(() => klaar('GEEN_ANTWOORD'), 6000); });
  const cs = (tab: Tab) => ({ id: ID, url: tab.url, origin: new URL(tab.url).origin, tab: { id: tab.id, url: tab.url } });
  const map = mkdtempSync(join(tmpdir(), 'sec002-g10a-ext-'));
  try {
    cpSync(join(W, 'extension'), map, { recursive: true });
    writeFileSync(join(map, 'native.js'), 'export function maakNative() { return { start() { return this.info(); }, stop() { return this.info(); }, info() { return { toegestaan: false, verbonden: false }; } }; }\n');
    await import(pathToFileURL(join(map, 'background.js')).href);
    const intern = L.intern[0]; const extern = L.extern[0];
    const pp = await vraag(extern, { type: 'PAIR', code: 'PRIV2345', name: 'Chrome' }, { origin: 'https://mcp.tarasevych.com', url: 'https://mcp.tarasevych.com/agents' });
    await tot(() => NepWS.alle.length === 1);
    const ws = NepWS.alle[0];
    ws.ontvang({ t: 'ready' });
    await rustig(10);
    ws.ontvang({ t: 'settings', epoch: 1, caps: ['browser.read', 'browser.navigate'].map((c) => ({ capability: c, domains: [] })), blocked: false });
    // De brug van elk tabblad meldt zijn profiel (zoals bridge.js bij het laden): 7 = technisch, 6 = gebruiker.
    for (const t of tabs) await vraag(intern, { op: 'account', claim: { userId: USER, sessionTag: 's' }, profiel: profielen[t.id] }, cs(t));
    const gr: TS.Ontgrendeling = { v: 2, gid: randomUUID(), agentId: 'agent-prive', userId: USER, ruimte: 'prive', caps: ['browser.read', 'browser.navigate'],
      domeinen: ['mail.tarasevych.com', 'mcp.tarasevych.com'], lokaal: false, iat: Date.now() - 1000, exp: Date.now() + 20 * 60_000, nonce: randomBytes(16).toString('base64url') };
    ws.ontvang({ t: 'ontgrendeling', grant: gr, sig: teken(KP, gr) });
    await rustig(10);
    let n = 0;
    const opdracht = async (type: string, params: any = {}) => {
      const id = `p-${++n}`; const exp = Date.now() + 60_000;
      ws.ontvang({ t: 'cmd', id, type, params, exp, sig: signCommand(KP, id, type, params, exp) });
      await tot(() => ws.sent.some((m) => m.t === 'result' && m.id === id), 8000);
      return ws.sent.find((m) => m.t === 'result' && m.id === id);
    };
    const adresGewijzigd = async (tab: Tab) => { for (const f of [...L.tabUpd]) f(tab.id, { url: tab.url }, { ...tab }); await rustig(6); };
    const ids = (r: any) => JSON.stringify((r?.data?.tabs ?? []).map((t: any) => t.id));
    check('extensie-03: opzet — privé-slot gekoppeld en ontgrendeld (mail + mcp)', pp?.ok === true && pp.ruimte === 'prive');

    const a = await opdracht('browser.tabs');
    check('extensie-03: A. met bekend profiel toont browser.tabs alleen het gebruikerstabblad (6), niet het technische (7)', ids(a) === '[6]', ids(a));
    // SPA-overgang in het technische tabblad: Chrome meldt tabs.onUpdated met info.url; de meta verandert niet, dus de brug meldt niets uit zichzelf.
    tabs[1].url = 'https://mcp.tarasevych.com/agents/journaal';
    await adresGewijzigd(tabs[1]);
    const b = await opdracht('browser.tabs');
    check('extensie-03: B. na een adreswijziging in het technische tabblad ziet het privé-slot het NOG STEEDS niet (was: titel en adres gelekt)', ids(b) === '[6]', ids(b));
    await adresGewijzigd(tabs[1]);
    acties.length = 0;
    const c = await opdracht('browser.navigate', { url: 'https://mcp.tarasevych.com/apps' });
    check('extensie-03: C. browser.navigate stuurt het ACTIEVE technische tabblad niet om (was: tabs.update(7))', !acties.some((x) => x.startsWith('tabs.update(7')) && c?.ok === true && c?.data?.pageId !== 7, JSON.stringify(acties));
    tabs[0].url = 'https://mail.tarasevych.com/inbox'; // het privétabblad terug naar de post voor de volgende stappen
    await adresGewijzigd(tabs[0]);
    tabs[0].active = true; tabs[1].active = false;
    await adresGewijzigd(tabs[1]);
    acties.length = 0;
    const d = await opdracht('browser.pages', { action: 'close', pageId: 7 });
    const d2 = await opdracht('browser.pages', { action: 'select', pageId: 7 });
    check('extensie-03: D. browser.pages close/select op het technische tabblad wordt geweigerd (was: tabs.remove(7))', d?.ok === false && d2?.ok === false && !acties.some((x) => x.includes('(7')), JSON.stringify([d?.error, d2?.error, acties]));

    // extensie-04: onbekend profiel (brug antwoordt niet, of de site heeft het profiel nog niet bevestigd) = geen gebruikerstabblad.
    profielen[7] = 'stil';
    await adresGewijzigd(tabs[1]);
    const e = await opdracht('browser.tabs');
    check('extensie-04: E. een tabblad waarvan de brug niet antwoordt (profiel onbekend) staat niet in de lijst van het privé-slot', ids(e) === '[6]', ids(e));
    tabs[0].active = false; tabs[1].active = true;
    acties.length = 0;
    const e2 = await opdracht('browser.navigate', { url: 'https://mcp.tarasevych.com/apps' });
    check('extensie-04: E2. …en wordt ook niet omgestuurd door browser.navigate', !acties.some((x) => x.startsWith('tabs.update(7')), JSON.stringify([e2?.ok, acties]));
    profielen[7] = 'onbekend';
    await adresGewijzigd(tabs[1]);
    const f1 = await opdracht('browser.snapshot');
    check('extensie-04: F. de site meldt «onbekend» (status nog niet geladen) voor het actieve tabblad → browser.snapshot leest het NIET (hoogstens een ander, zeker gebruikerstabblad)',
      f1?.ok === false || (f1?.ok === true && !String(f1?.data?.url || '').includes('/agents')), JSON.stringify(f1).slice(0, 200));
    tabs[0].url = 'https://mail.tarasevych.com/inbox'; tabs[0].active = true; tabs[1].active = false;
    profielen[6] = 'onbekend';
    await adresGewijzigd(tabs[0]);
    const f2 = await opdracht('browser.snapshot');
    check('extensie-04: F2. is er GEEN zeker gebruikerstabblad, dan weigert het privé-slot (was: «onbekend» telde als gebruiker)', f2?.ok === false, JSON.stringify(f2).slice(0, 200));
    // Geen regressie: zodra de site het profiel bevestigt, werkt lezen weer — ook als het achtergrondproces de stand kwijt was.
    profielen[6] = 'gebruiker';
    await adresGewijzigd(tabs[0]);
    const h = await opdracht('browser.snapshot');
    check('extensie-03/04: G. geen regressie — een bevestigd gebruikerstabblad wordt na een adreswijziging gewoon gelezen (profiel vers opgehaald)', h?.ok === true && String(h?.data?.url || '').startsWith('https://mail.tarasevych.com/'), JSON.stringify(h).slice(0, 200));
    // Ander account in een tabblad: niet in de lijst van dit slot.
    accounts[6] = 'iemand-anders';
    await adresGewijzigd(tabs[0]);
    const k = await opdracht('browser.tabs');
    check('extensie-03: H. een tabblad waarin een ANDER account is aangemeld staat niet in browser.tabs', !(k?.data?.tabs ?? []).some((t: any) => t.id === 6), ids(k));
    accounts[6] = USER;
    for (const w of NepWS.alle) { try { w.close(); } catch { /* al dicht */ } }
  } finally {
    Object.assign(g, bewaard);
    rmSync(map, { recursive: true, force: true });
  }
}
