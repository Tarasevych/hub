// Extensie 0.6: twee sloten (prive / technisch) in één extensie, profiel per tabblad (<meta name="mjn-profiel">), migratie 0.5 → 0.6.
// De echte extension/background.js draait met een nep-chrome, nep-WebSockets en nep-IndexedDB (geen netwerk, geen database).
// Bewijst (contract 0.6 §1, §2, §5):
//  - per slot eigen geheimen (IndexedDB prive:* / technisch:*), eigen WebSocket (eigen ticket), eigen ontgrendeling (storage.session);
//  - PAIR koppelt in het slot dat de server teruggeeft; een tweede PAIR met de andere ruimte laat het eerste slot staan;
//  - v1 geweigerd; grant met verkeerde ruimte geweigerd; grant van het ene slot over de WS van het andere geweigerd;
//  - technisch alleen op tabbladen met profiel technisch (ook vers gecontroleerd vlak voor de uitvoering); prive nooit op admin.* en
//    nooit op een technisch tabblad; profielwissel live (zonder herladen) → meteen andere regels, buffers van het oude slot weg;
//  - netwerkbuffers per slot gescheiden; lokale agent bij het slot met `lokaal` (beide → technisch);
//  - zonder techRecht en zonder technisch slot: sloten.technisch = null en publiek.technisch = null;
//  - migratie: de enkele 0.5-koppeling gaat naar het slot volgens /self.ruimte (offline: prive, later rechtgezet), v1-ontgrendeling weg.
import { createHmac, randomBytes, randomUUID } from 'node:crypto';
import { cpSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { checker } from './hulp/nep-google';
import { signCommand } from '../../backend/connectors-crypto';
import * as TS from '../../shared/extensie-ontgrendeling';

const W = process.cwd();
const ID = 'ofpffonakgjioahgfejmiblfmbkobmmi';
const BASIS = `chrome-extension://${ID}/`;
const USER = 'user-7';
const KP = randomBytes(32).toString('base64url');
const KT = randomBytes(32).toString('base64url');
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const rustig = async (n = 4) => { for (let i = 0; i < n; i += 1) await sleep(5); };
async function tot(fn: () => boolean, ms = 3000) { const eind = Date.now() + ms; while (Date.now() < eind) { if (fn()) return true; await sleep(10); } return false; }

type Luisteraar = (...a: any[]) => any;
type Tab = { id: number; url: string; active: boolean; windowId: number; title: string };

const teken = (key: string, g: TS.Ontgrendeling) => createHmac('sha256', Buffer.from(key, 'base64url')).update(TS.ontgrendelTekst(g)).digest('hex');
/** v1-tekst zoals 0.5 hem ondertekende (zonder ruimte). */
const tekenV1 = (key: string, g: any) => {
  const lijst = (a: string[]) => [...a].sort().join(',');
  const tekst = ['mr-ontgrendeling-v1', g.gid, g.agentId, g.userId, lijst(g.caps), lijst(g.domeinen), g.lokaal ? '1' : '0', String(g.iat), String(g.exp), g.nonce].join('\n');
  return createHmac('sha256', Buffer.from(key, 'base64url')).update(tekst).digest('hex');
};
const grant = (ruimte: 'prive' | 'technisch', o: Partial<TS.Ontgrendeling> = {}): TS.Ontgrendeling => ({
  v: 2, gid: randomUUID(), agentId: ruimte === 'prive' ? 'agent-prive' : 'agent-tech', userId: USER, ruimte,
  caps: ['browser.read', 'browser.navigate'], domeinen: ruimte === 'prive' ? ['mail.tarasevych.com', 'mcp.tarasevych.com', 'hub.tarasevych.com'] : ['admin.tarasevych.com', 'mcp.tarasevych.com'],
  lokaal: false, iat: Date.now() - 1000, exp: Date.now() + 20 * 60_000, nonce: randomBytes(16).toString('base64url'), ...o,
});

class NepWS {
  static CONNECTING = 0; static OPEN = 1; static CLOSING = 2; static CLOSED = 3;
  static alle: NepWS[] = [];
  readyState = 0; sent: any[] = []; url: string;
  onopen: Luisteraar | null = null; onmessage: Luisteraar | null = null; onclose: Luisteraar | null = null; onerror: Luisteraar | null = null;
  constructor(url: string) { this.url = url; NepWS.alle.push(this); setTimeout(() => { this.readyState = 1; void this.onopen?.(); }, 0); }
  send(s: string) { this.sent.push(JSON.parse(s)); }
  close(code = 1000) { if (this.readyState === 3) return; this.readyState = 3; void this.onclose?.({ code }); }
  ontvang(m: unknown) { void this.onmessage?.({ data: JSON.stringify(m) }); }
  get ticket() { return this.sent.find((m) => m.t === 'auth')?.ticket; }
}

function nepIndexedDB(begin: Record<string, unknown> = {}) {
  const dbs = new Map<string, Map<string, Map<string, unknown>>>();
  if (Object.keys(begin).length) dbs.set('mr-geheim', new Map([['kv', new Map(Object.entries(begin))]]));
  return {
    waarde: (db: string, st: string, k: string) => dbs.get(db)?.get(st)?.get(k),
    sleutels: () => [...(dbs.get('mr-geheim')?.get('kv')?.keys() ?? [])],
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

function nepOmgeving(local: Record<string, any>, session: Record<string, any>, tabs: Tab[]) {
  const L = { intern: [] as Luisteraar[], extern: [] as Luisteraar[], alarm: [] as Luisteraar[], tabUpd: [] as Luisteraar[], netBegin: [] as Luisteraar[], netKlaar: [] as Luisteraar[], netFout: [] as Luisteraar[] };
  const ev = (lijst?: Luisteraar[]) => ({ addListener: (f: Luisteraar) => { lijst?.push(f); }, removeListener: (f: Luisteraar) => { if (lijst) { const i = lijst.indexOf(f); if (i >= 0) lijst.splice(i, 1); } } });
  const leeg = (): any => new Proxy(function () { /* nep */ }, { get: (_t, k) => (k === 'then' ? undefined : leeg()), apply: () => Promise.resolve(undefined) });
  const opslag = (o: Record<string, any>) => ({
    get: async (k?: string | string[]) => { if (k === undefined) return { ...o }; const ks = Array.isArray(k) ? k : [k]; return Object.fromEntries(ks.filter((x) => x in o).map((x) => [x, structuredClone(o[x])])); },
    set: async (n: Record<string, any>) => { for (const [k, v] of Object.entries(n)) o[k] = structuredClone(v); },
    remove: async (k: string | string[]) => { for (const x of Array.isArray(k) ? k : [k]) delete o[x]; },
    setAccessLevel: async () => undefined,
  });
  const naarTab: Array<{ tabId: number; msg: any }> = [];
  const pushes: any[] = [];
  const permissies = new Set<string>();
  const profielen: Record<number, string> = {};
  const bridge: Record<string, (m: any, tabId: number) => any> = {
    'account?': (_m, tabId) => ({ ok: true, data: { claim: `${USER}:s`, profiel: profielen[tabId] ?? 'gebruiker' } }),
    snapshot: (_m, tabId) => ({ ok: true, data: { url: tabs.find((t) => t.id === tabId)!.url, title: `tab-${tabId}` } }),
    network: () => ({ ok: true, data: { diagnostics: true, requests: [] } }),
  };
  const chrome = {
    runtime: {
      id: ID, getURL: (p: string) => `${BASIS}${p}`, getManifest: () => JSON.parse(readFileSync(join(W, 'extension/manifest.json'), 'utf8')),
      onMessage: ev(L.intern), onMessageExternal: ev(L.extern), onInstalled: ev(), onStartup: ev(), openOptionsPage: async () => undefined,
      sendMessage: async (m: any) => { pushes.push(structuredClone(m)); return undefined; },
    },
    storage: { local: opslag(local), session: opslag(session), onChanged: ev() },
    alarms: { create: () => undefined, clear: async () => true, onAlarm: ev(L.alarm) },
    tabs: {
      query: async () => tabs.map((t) => ({ ...t })), get: async (id: number) => ({ ...tabs.find((t) => t.id === id)! }),
      sendMessage: async (tabId: number, msg: any) => { naarTab.push({ tabId, msg: structuredClone(msg) }); const h = bridge[msg.op]; return h ? h(msg, tabId) : { ok: true }; },
      create: async (o: any) => ({ id: 99, ...o }), update: async (id: number, o: any) => { const t = { ...tabs.find((x) => x.id === id)!, ...o }; setTimeout(() => [...L.tabUpd].forEach((f) => f(id, { status: 'complete' }, t)), 5); return t; },
      remove: async () => undefined, onRemoved: ev(), onUpdated: ev(L.tabUpd), onActivated: ev(),
    },
    permissions: { contains: async (q: any) => (q.permissions || []).every((p: string) => permissies.has(p)), onAdded: ev(), onRemoved: ev() },
    webRequest: { onBeforeRequest: ev(L.netBegin), onCompleted: ev(L.netKlaar), onErrorOccurred: ev(L.netFout) },
    debugger: { attach: async () => undefined, detach: async () => undefined, sendCommand: async () => undefined, onDetach: ev(), onEvent: ev() },
    action: leeg(), sidePanel: leeg(), scripting: leeg(), windows: leeg(),
  };
  return { chrome: new Proxy(chrome as Record<string, unknown>, { get: (t, k) => (k in t ? t[k as string] : leeg()) }), L, naarTab, pushes, permissies, profielen };
}

async function laadExtensie() {
  const map = mkdtempSync(join(tmpdir(), 'mr-ext06p-'));
  cpSync(join(W, 'extension'), map, { recursive: true });
  writeFileSync(join(map, 'native.js'), `export function maakNative(deps) { globalThis.__mrNative06 = deps;
    return { start() { return this.info(); }, stop() { return this.info(); }, info() { return { toegestaan: false, verbonden: false }; } }; }\n`);
  await import(pathToFileURL(join(map, 'background.js')).href);
}
const vraag = (f: Luisteraar, m: unknown, s: unknown) => new Promise<any>((klaar) => { f(m, s, klaar); setTimeout(() => klaar('GEEN_ANTWOORD'), 6000); });
const eigenPagina = { id: ID, url: `${BASIS}popup.html`, origin: BASIS.slice(0, -1) };
const cs = (tab: Tab) => ({ id: ID, url: tab.url, origin: new URL(tab.url).origin, tab: { id: tab.id, url: tab.url } });
const MCP = { origin: 'https://mcp.tarasevych.com', url: 'https://mcp.tarasevych.com/agents' };

export async function main(): Promise<number> {
  const { check, einde } = checker('extensie-profielen');
  const g = globalThis as Record<string, any>;
  const oud = { chrome: g.chrome, fetch: g.fetch, WebSocket: g.WebSocket, indexedDB: g.indexedDB };
  let techRecht = false;
  let selfModus: 'normaal' | 'offline' | '401' | 'technisch' = 'normaal';
  const fetches: Array<{ url: string; init: any }> = [];
  const pairBodies: any[] = [];
  g.fetch = async (url: string, init: any = {}) => {
    fetches.push({ url: String(url), init });
    const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { 'Content-Type': 'application/json' } });
    const auth = String(init?.headers?.Authorization || '');
    const u = String(url);
    if (u.endsWith('/api/owner/agents/pair')) {
      const b = JSON.parse(init.body); pairBodies.push(b);
      if (b.code === 'PRIV2345') return json({ token: 'tok-prive', agentId: 'agent-prive', userId: USER, commandKey: KP, ruimte: 'prive' });
      if (b.code === 'TECH2345') return json({ token: 'tok-tech', agentId: 'agent-tech', userId: USER, commandKey: KT, ruimte: 'technisch' });
      return json({ error: 'CODE_INVALID' }, 400);
    }
    if (u.endsWith('/api/owner/agents/ws-ticket')) return json({ ticket: `ticket-${auth.replace('Bearer ', '')}` });
    if (u.endsWith('/api/owner/agents/self')) {
      if (selfModus === 'offline') throw new Error('offline');
      if (selfModus === '401') return json({}, 401);
      if (auth === 'Bearer tok-tech') return json({ enabled: true, active: true, ruimte: 'technisch', techRecht: true, email: 'u7@test.invalid' });
      if (auth === 'Bearer oud-token') return json({ enabled: true, active: true, ruimte: selfModus === 'technisch' ? 'technisch' : 'prive', techRecht, email: 'u7@test.invalid' });
      return json({ enabled: true, active: true, ruimte: 'prive', techRecht, email: 'u7@test.invalid' });
    }
    if (u.includes('/downloads/')) return json({}, 404);
    return json({ ok: true });
  };
  g.WebSocket = NepWS;
  try {
    // ================================================================ A. twee sloten in één extensie
    const idb = nepIndexedDB();
    g.indexedDB = idb;
    const local: Record<string, any> = {};
    const session: Record<string, any> = {};
    const tabs: Tab[] = [
      { id: 5, url: 'https://admin.tarasevych.com/beheer', active: true, windowId: 1, title: 'Admin' },
      { id: 6, url: 'https://mail.tarasevych.com/inbox', active: false, windowId: 1, title: 'Mail' },
      { id: 7, url: 'https://mcp.tarasevych.com/agents', active: false, windowId: 1, title: 'MCP' },
      { id: 8, url: 'https://hub.tarasevych.com/', active: false, windowId: 1, title: 'Hub' },
    ];
    const env = nepOmgeving(local, session, tabs);
    Object.assign(env.profielen, { 5: 'technisch', 6: 'gebruiker', 7: 'technisch', 8: 'gebruiker' });
    g.chrome = env.chrome;
    NepWS.alle = [];
    await laadExtensie();
    const intern = env.L.intern[0]; const extern = env.L.extern[0];
    const status = async () => vraag(intern, { op: 'status' }, eigenPagina);
    const s0 = await status();
    check('leeg: prive-slot niet gekoppeld, geen technische kaart (geen techRecht), geen WebSocket', s0.sloten?.prive?.gekoppeld === false && s0.sloten.technisch === null && NepWS.alle.length === 0, JSON.stringify(s0.sloten));

    const pp = await vraag(extern, { type: 'PAIR', code: 'PRIV2345', name: 'Chrome' }, MCP);
    check('PAIR (code met ruimte prive) → slot prive; WS met ticket van het prive-token', pp.ok === true && pp.ruimte === 'prive' && await tot(() => NepWS.alle.length === 1 && NepWS.alle[0].ticket === 'ticket-tok-prive'), JSON.stringify(pp));
    const wsP = NepWS.alle[0];
    wsP.ontvang({ t: 'ready' });
    await tot(() => fetches.some((f) => f.url.endsWith('/self')));
    await rustig(6);
    const s1 = await status();
    check('zonder techRecht (/self.techRecht=false): sloten.technisch = null; prive gekoppeld; e-mail uit /self', s1.sloten.prive.gekoppeld === true && s1.sloten.technisch === null && s1.techRecht === false && s1.accountEmail === 'u7@test.invalid');
    for (const t of tabs) await vraag(intern, { op: 'account', claim: { userId: USER, sessionTag: 's' }, profiel: env.profielen[t.id] }, cs(t));
    const pushTab = (id: number) => [...env.naarTab].reverse().find((x) => x.tabId === id && x.msg.op === 'status-push')?.msg.status;
    check('publiek zonder techRecht: technisch = null in de status naar elk tabblad (ook een tabblad met profiel technisch)', [5, 6, 7, 8].every((id) => pushTab(id) && pushTab(id).technisch === null && pushTab(id).prive?.gekoppeld === true), JSON.stringify(pushTab(5)));

    techRecht = true;
    const pt = await vraag(extern, { type: 'PAIR', code: 'TECH2345', name: 'Chrome' }, MCP);
    check('tweede PAIR (ruimte technisch) → slot technisch; eigen WS met eigen ticket', pt.ok === true && pt.ruimte === 'technisch' && await tot(() => NepWS.alle.length === 2 && NepWS.alle[1].ticket === 'ticket-tok-tech'));
    const wsT = NepWS.alle[1];
    check('… het prive-slot blijft staan: eigen geheimen per slot in IndexedDB, eigen agentId per slot in storage.local, geen geheim in storage.local',
      idb.waarde('mr-geheim', 'kv', 'prive:agentToken') === 'tok-prive' && idb.waarde('mr-geheim', 'kv', 'prive:commandKey') === KP
      && idb.waarde('mr-geheim', 'kv', 'technisch:agentToken') === 'tok-tech' && idb.waarde('mr-geheim', 'kv', 'technisch:commandKey') === KT
      && local.slot_prive?.agentId === 'agent-prive' && local.slot_technisch?.agentId === 'agent-tech' && !JSON.stringify(local).includes('tok-') && !JSON.stringify(local).includes(KP) && wsP.readyState === 1,
      JSON.stringify(local));
    check('pair-body: zelfde pairingId voor beide sloten, platform browser, versie 0.9.2, capabilities.ontgrendeling = 2', pairBodies.length === 2 && pairBodies[0].pairingId === pairBodies[1].pairingId && pairBodies[1].version === '0.9.2' && pairBodies[1].capabilities.ontgrendeling === 2 && pairBodies[1].sloten?.prive === true);
    check("auth per slot: capabilities.ruimte in het eerste bericht", wsP.sent[0].capabilities.ruimte === 'prive' && wsT.sent[0].capabilities.ruimte === 'technisch');
    wsT.ontvang({ t: 'ready' });
    const caps = ['browser.read', 'browser.navigate', 'browser.interact', 'browser.screenshot', 'browser.debug'].map((c) => ({ capability: c, domains: [] }));
    wsP.ontvang({ t: 'settings', epoch: 1, caps, blocked: false });
    wsT.ontvang({ t: 'settings', epoch: 1, caps, blocked: false });
    await rustig(6);
    const st = (ws: NepWS) => [...ws.sent].reverse().find((m) => m.t === 'status');
    check("{t:'status'} per slot met eigen ruimte", await tot(() => st(wsP)?.ruimte === 'prive' && st(wsT)?.ruimte === 'technisch' && st(wsP)?.staat === 'vergrendeld' && st(wsT)?.staat === 'vergrendeld'));

    let n = 0;
    const opdracht = async (ws: NepWS, key: string, type: string, params: any = {}) => {
      const id = `p-${++n}`; const exp = Date.now() + 60_000;
      ws.ontvang({ t: 'cmd', id, type, params, exp, sig: signCommand(key, id, type, params, exp) });
      await tot(() => ws.sent.some((m) => m.t === 'result' && m.id === id), 8000);
      return ws.sent.find((m) => m.t === 'result' && m.id === id);
    };
    const ontgrendel = async (ws: NepWS, gr: any, sig: string) => { ws.ontvang({ t: 'ontgrendeling', grant: gr, sig }); await rustig(6); };

    // ---- ontgrendeling per slot
    const v1 = { ...grant('prive'), v: 1 } as any; delete v1.ruimte;
    await ontgrendel(wsP, v1, tekenV1(KP, v1));
    check('v1-ontgrendeling (0.5-formaat) → geweigerd (VERSIE), slot blijft vergrendeld', (await status()).sloten.prive.staat === 'vergrendeld' && /VERSIE/.test((await status()).sloten.prive.fout));
    const gTviaP = grant('technisch');
    await ontgrendel(wsP, gTviaP, teken(KT, gTviaP));
    check('technische grant over de WS van het prive-slot → geweigerd (sleutel van het prive-slot)', (await status()).sloten.prive.staat === 'vergrendeld' && (await status()).sloten.technisch.staat === 'vergrendeld');
    const gVerkeerd = grant('technisch', { agentId: 'agent-prive' });
    await ontgrendel(wsP, gVerkeerd, teken(KP, gVerkeerd));
    check('grant met ruimte technisch, juist ondertekend voor het prive-agent → geweigerd (RUIMTE)', (await status()).sloten.prive.staat === 'vergrendeld' && /RUIMTE/.test((await status()).sloten.prive.fout), (await status()).sloten.prive.fout);
    const gAdmin = grant('prive', { domeinen: ['admin.tarasevych.com', 'mail.tarasevych.com'] });
    await ontgrendel(wsP, gAdmin, teken(KP, gAdmin));
    check('prive-grant met admin.* → geweigerd (DOMEINEN)', (await status()).sloten.prive.staat === 'vergrendeld' && /DOMEINEN/.test((await status()).sloten.prive.fout));
    const gP = grant('prive');
    await ontgrendel(wsP, gP, teken(KP, gP));
    const s2 = await status();
    check('geldige prive-grant → alleen het prive-slot open; storage.session per slot', s2.sloten.prive.staat === 'ontgrendeld' && s2.sloten.technisch.staat === 'vergrendeld'
      && session.ontgrendeling_prive?.grant?.gid === gP.gid && !session.ontgrendeling_technisch && st(wsP)?.gid === gP.gid && st(wsT)?.gid === null);

    // ---- opdrachten
    const rT0 = await opdracht(wsT, KT, 'browser.snapshot');
    check('technische opdracht terwijl alleen prive open is → EXTENSIE_VERGRENDELD (technische uitleg)', rT0?.ok === false && /^EXTENSIE_VERGRENDELD.*Технічний профіль/.test(rT0.error), JSON.stringify(rT0));
    const rTk = await opdracht(wsT, KP, 'browser.snapshot');
    check('opdracht op de technische WS ondertekend met de prive-sleutel → handtekening ongeldig', rTk?.ok === false && /signature/.test(rTk.error));
    const voor = env.naarTab.length;
    const rP1 = await opdracht(wsP, KP, 'browser.snapshot');
    const snapNaar = env.naarTab.slice(voor).find((x) => x.msg.op === 'snapshot');
    check('prive snapshot (actief tabblad = admin): raakt admin niet, kiest een eigen dienst (mail); de brug krijgt ruimte prive', rP1?.ok === true && rP1.data.url.startsWith('https://mail.') && snapNaar?.tabId === 6 && snapNaar.msg.ruimte === 'prive', JSON.stringify(rP1));
    const rP2 = await opdracht(wsP, KP, 'browser.navigate', { url: 'https://admin.tarasevych.com/beheer' });
    check('prive-opdracht naar admin.* → EXTENSIE_DOMEIN', rP2?.ok === false && /^EXTENSIE_DOMEIN/.test(rP2.error), JSON.stringify(rP2));
    const rP3 = await opdracht(wsP, KP, 'browser.tabs');
    check('prive browser.tabs: alleen eigen diensten met profiel gebruiker (mail, hub) — niet admin, niet de technische mcp-tab', JSON.stringify(rP3?.data?.tabs.map((t: any) => t.id)) === '[6,8]', JSON.stringify(rP3?.data));

    const gT = grant('technisch', { caps: ['browser.read'] });
    await ontgrendel(wsT, gT, teken(KT, gT));
    const voorT = env.naarTab.length;
    const rT1 = await opdracht(wsT, KT, 'browser.snapshot');
    const snapT = env.naarTab.slice(voorT).find((x) => x.msg.op === 'snapshot');
    check('technisch open: snapshot op het technische admin-tabblad; brug krijgt ruimte technisch', rT1?.ok === true && rT1.data.url.startsWith('https://admin.') && snapT?.msg.ruimte === 'technisch', JSON.stringify(rT1));
    const rT2 = await opdracht(wsT, KT, 'browser.tabs');
    check('technisch browser.tabs: alleen technische tabbladen binnen de domeinen (admin, mcp)', JSON.stringify(rT2?.data?.tabs.map((t: any) => t.id)) === '[5,7]', JSON.stringify(rT2?.data));
    check('beide open: elk slot zijn eigen grant in storage.session', session.ontgrendeling_prive?.grant?.gid === gP.gid && session.ontgrendeling_technisch?.grant?.gid === gT.gid);

    // ---- profielwissel (tech-modus verlaten zonder herladen)
    env.profielen[5] = 'gebruiker'; env.profielen[7] = 'gebruiker'; // de pagina zette <meta name="mjn-profiel" content="gebruiker">; melding nog niet binnen
    const rT3 = await opdracht(wsT, KT, 'browser.snapshot');
    check('technische opdracht op een tabblad dat net de tech-modus verliet (vers gevraagd aan de brug) → EXTENSIE_PROFIEL', rT3?.ok === false && /^EXTENSIE_PROFIEL/.test(rT3.error), JSON.stringify(rT3));
    const tabVoor = env.naarTab.length;
    await vraag(intern, { op: 'account', claim: { userId: USER, sessionTag: 's' }, profiel: 'gebruiker' }, cs(tabs[2]));
    await rustig(8);
    const naWissel = env.naarTab.slice(tabVoor);
    check('profielwissel live: status-push naar dat tabblad met profielTab gebruiker; diag-modus van tab 7 wisselt naar ruimte prive',
      naWissel.some((x) => x.tabId === 7 && x.msg.op === 'status-push' && x.msg.status.profielTab === 'gebruiker' && x.msg.status.staat === 'ontgrendeld' && x.msg.status.technisch?.staat === 'ontgrendeld')
      && naWissel.some((x) => x.tabId === 7 && x.msg.op === 'diag-modus' && x.msg.ruimte === 'prive'), JSON.stringify(naWissel.filter((x) => x.tabId === 7).map((x) => x.msg)).slice(0, 300));
    const rT4 = await opdracht(wsT, KT, 'browser.snapshot');
    check('… daarna vindt het technische slot geen tabblad meer (geen enkel tabblad in tech-modus)', rT4?.ok === false && /No Mijn Ruimte tab/.test(rT4.error), JSON.stringify(rT4));
    tabs[0].active = false; tabs[2].active = true;
    const rP4 = await opdracht(wsP, KP, 'browser.snapshot');
    check('… en het prive-slot mag het mcp-tabblad nu wel (profiel gebruiker, host in de prive-grant)', rP4?.ok === true && rP4.data.url.startsWith('https://mcp.'), JSON.stringify(rP4));

    // ---- netwerkbuffers per slot gescheiden (tab 7 wisselt heen en terug)
    env.profielen[7] = 'technisch';
    await vraag(intern, { op: 'account', claim: { userId: USER, sessionTag: 's' }, profiel: 'technisch' }, cs(tabs[2]));
    const net = (id: string, pad: string) => { for (const f of env.L.netBegin) f({ requestId: id, tabId: 7, timeStamp: 1, url: `https://mcp.tarasevych.com${pad}`, method: 'GET', type: 'xmlhttprequest' }); for (const f of env.L.netKlaar) f({ requestId: id, tabId: 7, timeStamp: 5, url: `https://mcp.tarasevych.com${pad}`, method: 'GET', type: 'xmlhttprequest', statusCode: 200 }); };
    net('t1', '/api/technisch-geheim'); await rustig(6);
    const rTn = await opdracht(wsT, KT, 'browser.network');
    check('technisch tabblad: verzoek in de buffer van het technische slot', rTn?.ok === true && JSON.stringify(rTn.data).includes('technisch-geheim'), JSON.stringify(rTn?.data).slice(0, 200));
    env.profielen[7] = 'gebruiker';
    await vraag(intern, { op: 'account', claim: { userId: USER, sessionTag: 's' }, profiel: 'gebruiker' }, cs(tabs[2]));
    net('p1', '/api/prive-pad'); await rustig(6);
    const rPn = await opdracht(wsP, KP, 'browser.network');
    check('na de wissel: het prive-slot ziet NIETS van wat onder technisch verzameld is, wel zijn eigen verzoek', rPn?.ok === true && !JSON.stringify(rPn.data).includes('technisch-geheim') && JSON.stringify(rPn.data).includes('prive-pad'), JSON.stringify(rPn?.data).slice(0, 200));
    const netOp = env.naarTab.filter((x) => x.msg.op === 'network').pop();
    check('… en vraagt de brug alleen de buffer van het prive-slot (ruimte in het verzoek)', netOp?.msg.ruimte === 'prive');
    env.profielen[7] = 'technisch';
    await vraag(intern, { op: 'account', claim: { userId: USER, sessionTag: 's' }, profiel: 'technisch' }, cs(tabs[2]));
    await rustig(4);
    const rTn2 = await opdracht(wsT, KT, 'browser.network');
    check('terug in tech-modus: de technische buffer is leeg geweest (geen oude technische regels) en bevat niets van prive', rTn2?.ok === true && !JSON.stringify(rTn2.data).includes('prive-pad') && !JSON.stringify(rTn2.data).includes('technisch-geheim'), JSON.stringify(rTn2?.data).slice(0, 200));
    const dm = await vraag(intern, { op: 'diag-modus?' }, cs(tabs[2]));
    const spillFout = await vraag(intern, { op: 'diag-spill', ruimte: 'prive', url: tabs[2].url, entries: [{ kind: 'console' }] }, cs(tabs[2]));
    check('diag-modus? per tabblad geeft het verzamelende slot; archief alleen voor dat slot', dm.aan === true && dm.ruimte === 'technisch' && spillFout.ok === false);

    // ---- publiek: per slot, nooit sleutels
    const ping = await vraag(extern, { type: 'PING' }, { ...MCP, tab: { id: 7, url: tabs[2].url } });
    const alles = JSON.stringify([ping, env.naarTab.map((x) => x.msg), env.pushes]);
    check('PING: per slot (prive/technisch) + profielTab van het tabblad van de afzender; nergens sleutels of tokens',
      ping.ok === true && ping.profielTab === 'technisch' && ping.prive?.staat === 'ontgrendeld' && ping.technisch?.staat === 'ontgrendeld' && ping.staat === 'ontgrendeld'
      && JSON.stringify(ping.technisch.caps) === '["browser.read"]' && ![KP, KT, 'tok-prive', 'tok-tech', teken(KP, gP)].some((x) => alles.includes(x)), JSON.stringify(ping).slice(0, 300));

    // ---- intrekken per slot
    const pv = await vraag(intern, { op: 'vergrendel', reden: 'popup', ruimte: 'prive' }, eigenPagina);
    check("vergrendel {ruimte:'prive'} vanuit de pop-up → alleen prive dicht; verzoek alleen over de prive-WS",
      pv.ok === true && pv.status.sloten.prive.staat === 'vergrendeld' && pv.status.sloten.technisch.staat === 'ontgrendeld'
      && wsP.sent.some((m) => m.t === 'vergrendel-verzoek' && m.gid === gP.gid) && !wsT.sent.some((m) => m.t === 'vergrendel-verzoek'));

    // ---- lokale agent: slot met lokaal; beide → technisch
    const N = g.__mrNative06;
    const gPl = grant('prive', { lokaal: true });
    await ontgrendel(wsP, gPl, teken(KP, gPl));
    const n1 = await N.status();
    const gTl = grant('technisch', { lokaal: true });
    await ontgrendel(wsT, gTl, teken(KT, gTl));
    const n2 = await N.status();
    check('lokale agent: alleen prive met lokaal → slot prive; beide met lokaal → slot technisch', n1.ruimte === 'prive' && n1.ontgrendeling?.gid === gPl.gid && n2.ruimte === 'technisch' && n2.ontgrendeling?.gid === gTl.gid, JSON.stringify([n1.ruimte, n2.ruimte]));

    // ---- noodstop van één server raakt het andere slot niet
    wsT.ontvang({ t: 'stop' }); await rustig(6);
    const s3 = await status();
    check("'stop' van de technische server → alleen technisch vergrendeld", s3.sloten.technisch.staat === 'vergrendeld' && s3.sloten.prive.staat === 'ontgrendeld');
    const fp = await vraag(intern, { op: 'forget', ruimte: 'technisch' }, eigenPagina);
    check("forget {ruimte:'technisch'} → alleen het technische slot weg (IndexedDB en storage.local), prive blijft",
      fp.ok === true && idb.waarde('mr-geheim', 'kv', 'technisch:agentToken') === undefined && idb.waarde('mr-geheim', 'kv', 'prive:agentToken') === 'tok-prive' && !local.slot_technisch && !!local.slot_prive && wsT.readyState === 3 && wsP.readyState === 1);
    for (const s of NepWS.alle) s.close(1000);
    await rustig();

    // ================================================================ B. migratie 0.5 → 0.6
    const migreer = async (o: { idb?: Record<string, unknown>; local: Record<string, any>; session?: Record<string, any>; modus: typeof selfModus }) => {
      selfModus = o.modus;
      const db = nepIndexedDB(o.idb ?? {});
      g.indexedDB = db;
      const l = { ...o.local }; const se = { ...(o.session ?? {}) };
      const e = nepOmgeving(l, se, tabs);
      g.chrome = e.chrome;
      NepWS.alle = [];
      await laadExtensie();
      const s = await vraag(e.L.intern[0], { op: 'status' }, eigenPagina);
      return { db, l, se, e, s };
    };
    const oudLocal = { tokenExpiresAt: Date.now() + 86_400_000, agentId: 'agent-oud', userId: USER, server: 'https://mcp.tarasevych.com', name: 'Chrome oud', diagOptIn: true, pairingId: 'ext-vast' };
    const oudV1 = { grant: { v: 1, gid: randomUUID() }, sig: 'a'.repeat(64) };
    techRecht = false;
    const m1 = await migreer({ idb: { agentToken: 'oud-token', commandKey: KP }, local: oudLocal, session: { ontgrendeling: oudV1, ingetrokken: ['x'], wachtrij: [] }, modus: 'normaal' });
    check('migratie (0.5, /self.ruimte = prive): slot prive met agentId/naam, geheimen onder prive:*, platte sleutels en v1-ontgrendeling weg, pairingId/diagOptIn blijven',
      m1.s.sloten.prive.gekoppeld === true && m1.s.sloten.prive.agentId === 'agent-oud' && m1.l.slot_prive?.name === 'Chrome oud' && !('agentId' in m1.l) && !('tokenExpiresAt' in m1.l)
      && m1.db.waarde('mr-geheim', 'kv', 'prive:agentToken') === 'oud-token' && m1.db.waarde('mr-geheim', 'kv', 'agentToken') === undefined && !('ontgrendeling' in m1.se) && !('ingetrokken' in m1.se)
      && m1.l.pairingId === 'ext-vast' && m1.l.diagOptIn === true && m1.s.sloten.technisch === null, JSON.stringify([m1.l, m1.db.sleutels()]));
    check('migratie: daarna één WS met het oude token (ticket)', await tot(() => NepWS.alle.length === 1 && NepWS.alle[0].ticket === 'ticket-oud-token'));
    for (const s of NepWS.alle) s.close(1000);
    const m2 = await migreer({ idb: { agentToken: 'oud-token', commandKey: KT }, local: oudLocal, modus: 'technisch' });
    check('migratie (/self.ruimte = technisch): slot technisch, prive leeg', m2.s.sloten.technisch?.gekoppeld === true && m2.s.sloten.technisch.agentId === 'agent-oud' && m2.s.sloten.prive.gekoppeld === false && m2.db.waarde('mr-geheim', 'kv', 'technisch:agentToken') === 'oud-token');
    for (const s of NepWS.alle) s.close(1000);
    const m3 = await migreer({ local: { ...oudLocal, agentToken: 'oud-token', commandKey: KT }, modus: 'offline' });
    check('migratie 0.4 (geheimen nog in storage.local) en /self offline → slot prive (contract: anders prive), niets meer in storage.local',
      m3.s.sloten.prive.gekoppeld === true && !('agentToken' in m3.l) && !('commandKey' in m3.l) && m3.db.waarde('mr-geheim', 'kv', 'prive:agentToken') === 'oud-token', JSON.stringify(m3.l));
    selfModus = 'technisch';
    await tot(() => NepWS.alle.length === 1);
    NepWS.alle[0].ontvang({ t: 'ready' });
    const rechtgezet = await tot(() => !!m3.l.slot_technisch && !m3.l.slot_prive && m3.db.waarde('mr-geheim', 'kv', 'technisch:agentToken') === 'oud-token' && m3.db.waarde('mr-geheim', 'kv', 'prive:agentToken') === undefined, 4000);
    check('… later zegt /self dat de koppeling technisch is → verhuisd naar het technische slot (prive weer leeg)', rechtgezet, JSON.stringify(m3.l));
    for (const s of NepWS.alle) s.close(1000);
    const m4 = await migreer({ idb: { agentToken: 'oud-token', commandKey: KP }, local: oudLocal, modus: '401' });
    check('migratie met een ingetrokken token (/self 401) → niets meegenomen, alles opgeruimd', m4.s.sloten.prive.gekoppeld === false && !m4.l.slot_prive && !m4.l.slot_technisch && m4.db.waarde('mr-geheim', 'kv', 'agentToken') === undefined && !('agentId' in m4.l));
    await rustig();
    for (const s of NepWS.alle) s.close(1000);
    await rustig();
  } catch (e) {
    check('onverwachte fout', false, String((e as Error)?.stack || e));
  } finally {
    g.chrome = oud.chrome; g.fetch = oud.fetch; g.WebSocket = oud.WebSocket; if (oud.indexedDB === undefined) delete g.indexedDB; else g.indexedDB = oud.indexedDB;
  }
  return einde();
}
