// Extensie 0.5 → 0.6: standaard VERGRENDELD; alleen een door de server ondertekende ontgrendeling (v2, met ruimte) opent haar.
// De echte extension/background.js draait hier met een nep-chrome en een nep-WebSocket (geen netwerk, geen database).
// 0.6: de enkele 0.5-koppeling (platte sleutels) migreert bij het laden naar het slot dat /self.ruimte noemt — hier 'technisch' —
// en alle 0.5-scenario's lopen daarna op dat technische slot, met tabbladen die hun profiel melden (admin = technisch, mail = gebruiker).
// Twee sloten naast elkaar: tests/eenheid/extensie-profielen.test.ts.
// native.js wordt in de TIJDELIJKE kopie vervangen door een kleine vangst-module, zodat de lokale route (voerUit, bron 'lokaal')
// testbaar is; de echte native.js (agent F) blijft in extension/ ongewijzigd.
import { createHmac, randomBytes, randomUUID } from 'node:crypto';
import { cpSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { checker } from './hulp/nep-google';
import { signCommand } from '../../backend/connectors-crypto';
import * as TS from '../../shared/extensie-ontgrendeling';
// @ts-expect-error gewone JavaScript-module zonder typen (wordt door de extensie zelf geladen)
import * as JS from '../../extension/shared.js';

const W = process.cwd();
const ID = 'ofpffonakgjioahgfejmiblfmbkobmmi';
const BASIS = `chrome-extension://${ID}/`;
const AGENT = 'agent-0a1b2c3d';
const USER = 'user-42';
const VERGRENDELD = 'EXTENSIE_VERGRENDELD: het beheerdersaccount moet de extensie eerst op de site ontgrendelen met een passkey (mcp.tarasevych.com → Підключення ШІ → Розширення браузера → Технічний профіль)';
const R = 'technisch';
const SK = { ontgr: 'ontgrendeling_technisch', intrek: 'intrekking_technisch', alarm: 'ontgrendeling-einde-technisch', local: 'slot_technisch' };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const rustig = async (n = 4) => { for (let i = 0; i < n; i += 1) await sleep(5); };
async function tot(fn: () => boolean, ms = 3000) { const eind = Date.now() + ms; while (Date.now() < eind) { if (fn()) return true; await sleep(10); } return false; }

type Luisteraar = (...a: any[]) => any;
type Tab = { id: number; url: string; active: boolean; lastFocusedWindow?: boolean; windowId: number; title: string };

/** Ondertekenen zoals de server: HMAC-SHA256(commandKey, ontgrendelTekst(g)), hex. */
const teken = (key: string, g: TS.Ontgrendeling) => createHmac('sha256', Buffer.from(key, 'base64url')).update(TS.ontgrendelTekst(g)).digest('hex');
const maakGrant = (o: Partial<TS.Ontgrendeling> = {}): TS.Ontgrendeling => {
  const nu = Date.now();
  return { v: 2, gid: randomUUID(), agentId: AGENT, userId: USER, ruimte: R, caps: ['browser.read'], domeinen: ['admin.tarasevych.com'], lokaal: false, iat: nu - 1000, exp: nu + 30 * 60_000, nonce: randomBytes(16).toString('base64url'), ...o } as TS.Ontgrendeling;
};

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

function nepOmgeving(local: Record<string, any>, session: Record<string, any>, tabs: Tab[]) {
  const L = { intern: [] as Luisteraar[], extern: [] as Luisteraar[], alarm: [] as Luisteraar[], tabUpd: [] as Luisteraar[], tabWeg: [] as Luisteraar[],
    netBegin: [] as Luisteraar[], netKlaar: [] as Luisteraar[], netFout: [] as Luisteraar[] };
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
  const alarmen: Record<string, any> = {};
  const permissies = new Set<string>();
  const profielen: Record<number, string> = { 5: 'technisch', 6: 'gebruiker' };
  const bridge: Record<string, (m: any, tabId: number) => any> = {
    'account?': (_m, tabId) => ({ ok: true, data: { claim: `${USER}:t`, profiel: profielen[tabId] ?? 'gebruiker' } }),
    snapshot: () => ({ ok: true, data: { url: 'https://admin.tarasevych.com/x', title: 'Admin' } }),
    network: () => ({ ok: true, data: { diagnostics: true, requests: [{ method: 'GET', url: 'https://admin.tarasevych.com/pagina-meldt', status: 200, at: 1 }] } }),
    console: () => ({ ok: true, data: { diagnostics: true, messages: [] } }),
    audit: (m) => ({ ok: true, data: { url: 'https://admin.tarasevych.com/x', soort: m.soort ?? 'alles' } }),
    type: (m) => ({ ok: true, data: { typed: m.name, length: String(m.text).length } }),
    self_test: () => ({ ok: true, data: { buffered: 0 } }),
  };
  const chrome = {
    runtime: {
      id: ID, getURL: (p: string) => `${BASIS}${p}`, getManifest: () => JSON.parse(readFileSync(join(W, 'extension/manifest.json'), 'utf8')),
      onMessage: ev(L.intern), onMessageExternal: ev(L.extern), onInstalled: ev(), onStartup: ev(), openOptionsPage: async () => undefined,
      sendMessage: async (m: any) => { pushes.push(structuredClone(m)); return undefined; },
    },
    storage: { local: opslag(local), session: opslag(session), onChanged: ev() },
    alarms: { create: (n: string, o: any) => { alarmen[n] = o; }, clear: async (n: string) => { const had = n in alarmen; delete alarmen[n]; return had; }, onAlarm: ev(L.alarm) },
    tabs: {
      query: async () => tabs.map((t) => ({ ...t })), get: async (id: number) => ({ ...tabs.find((t) => t.id === id)!, ...((globalThis as any).__mrOmleiding?.url ? { url: (globalThis as any).__mrOmleiding.url, title: 'Mail' } : {}) }),
      sendMessage: async (tabId: number, msg: any) => { naarTab.push({ tabId, msg: structuredClone(msg) }); const h = bridge[msg.op]; return h ? h(msg, tabId) : { ok: true }; },
      create: async (o: any) => ({ id: 99, ...o }), update: async (id: number, o: any) => { const t = { ...tabs.find((x) => x.id === id)!, ...o }; setTimeout(() => [...L.tabUpd].forEach((f) => f(id, { status: 'complete' }, t)), 5); return t; }, remove: async () => undefined,
      reload: async () => undefined, goBack: async () => undefined, goForward: async () => undefined, captureVisibleTab: async () => 'data:image/jpeg;base64,QUJD',
      onRemoved: ev(L.tabWeg), onUpdated: ev(L.tabUpd),
    },
    permissions: { contains: async (q: any) => (q.permissions || []).every((p: string) => permissies.has(p)), onAdded: ev(), onRemoved: ev() },
    webRequest: { onBeforeRequest: ev(L.netBegin), onCompleted: ev(L.netKlaar), onErrorOccurred: ev(L.netFout) },
    debugger: { attach: async () => undefined, detach: async () => undefined, sendCommand: async () => undefined, onDetach: ev(), onEvent: ev() },
    action: leeg(), sidePanel: leeg(), scripting: leeg(), windows: leeg(),
  };
  return { chrome: new Proxy(chrome as Record<string, unknown>, { get: (t, k) => (k in t ? t[k as string] : leeg()) }), L, naarTab, pushes, alarmen, permissies, bridge, profielen };
}

/** Kleinste IndexedDB die background.js gebruikt (open, objectStore get/put/delete, oncomplete). */
function nepIndexedDB() {
  const dbs = new Map<string, Map<string, Map<string, unknown>>>();
  return {
    waarde: (db: string, st: string, k: string) => dbs.get(db)?.get(st)?.get(k),
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

/** Laad een verse kopie van de extensie (eigen module-instantie) met de vangst-native.js. */
async function laadExtensie() {
  const map = mkdtempSync(join(tmpdir(), 'mr-ext06-'));
  cpSync(join(W, 'extension'), map, { recursive: true });
  writeFileSync(join(map, 'native.js'), `export function maakNative(deps) { globalThis.__mrNative = deps; globalThis.__mrNativeStarts = 0;
    return { start() { globalThis.__mrNativeStarts += 1; return this.info(); }, stop() { return this.info(); }, info() { return { toegestaan: false, verbonden: false }; } }; }\n`);
  await import(pathToFileURL(join(map, 'background.js')).href);
}

export async function main(): Promise<number> {
  const { check, einde } = checker('extensie-vergrendeling');
  const g = globalThis as Record<string, any>;
  const oud = { chrome: g.chrome, fetch: g.fetch, WebSocket: g.WebSocket };
  const key = randomBytes(32).toString('base64url');
  const fetches: Array<{ url: string; init: any }> = [];
  g.fetch = async (url: string, init: any = {}) => {
    fetches.push({ url: String(url), init });
    const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { 'Content-Type': 'application/json' } });
    if (offline && !String(url).endsWith('/api/owner/agents/ws-ticket')) throw new Error('offline');
    if (String(url).endsWith('/api/owner/agents/pair')) return json({ token: 'nieuw-token', agentId: 'agent-nieuw', userId: USER, commandKey: 'nieuwe-sleutel', ruimte: 'technisch' });
    if (String(url).endsWith('/api/owner/agents/ws-ticket')) return json({ ticket: 'eenmalig-ticket' });
    if (String(url).endsWith('/api/owner/agents/self')) return json({ enabled: true, active: true, ruimte: 'technisch', techRecht: true, email: 'pavlo@test.invalid' });
    if (String(url).includes('/downloads/')) return json({}, 404);
    return json({ ok: true });
  };
  g.WebSocket = NepWS;
  const idb = nepIndexedDB();
  g.indexedDB = idb;
  let offline = false;
  const omleiding = { url: '' };
  g.__mrOmleiding = omleiding;
  try {
    // ------------------------------------------------------------ gedeelde regels: TS en JS gelijk
    check('constanten in extension/shared.js = shared/extensie-ontgrendeling.ts (caps, lokaal, hosts, max minuten, klokspeling)',
      JSON.stringify(JS.BROWSER_CAPS) === JSON.stringify(TS.BROWSER_CAPS) && JSON.stringify(JS.LOKAAL_CAPS) === JSON.stringify(TS.LOKAAL_CAPS)
      && JSON.stringify(JS.ADMIN_HOSTS_TOEGESTAAN) === JSON.stringify(TS.ADMIN_HOSTS_TOEGESTAAN) && JS.MAX_MINUTEN === TS.MAX_MINUTEN && JS.KLOK_SPELING_MS === TS.KLOK_SPELING_MS);
    const vector = maakGrant({ caps: ['browser.screenshot', 'browser.read', 'browser.debug'], domeinen: ['mcp.tarasevych.com', 'admin.tarasevych.com'], lokaal: true });
    check('ontgrendelTekst v2: JS = TS (eerste regel mr-ontgrendeling-v2, ruimte op regel 5, lijsten gesorteerd, lokaal 1/0)', JS.ontgrendelTekst(vector) === TS.ontgrendelTekst(vector)
      && JS.ontgrendelTekst(vector).split('\n')[0] === 'mr-ontgrendeling-v2' && JS.ontgrendelTekst(vector).split('\n')[4] === 'technisch'
      && JS.ontgrendelTekst(vector).split('\n')[5] === 'browser.debug,browser.read,browser.screenshot' && JS.ontgrendelTekst(vector).split('\n')[7] === '1');
    check('PRIVE_HOSTS: JS = TS, nooit admin.* of api.*', JSON.stringify(JS.PRIVE_HOSTS) === JSON.stringify(TS.PRIVE_HOSTS) && !JS.PRIVE_HOSTS.includes('admin.tarasevych.com') && !JS.PRIVE_HOSTS.includes('api.tarasevych.com'));
    check('maximale duur per ruimte: JS = TS (technisch 480 min, prive 30 dagen)', JS.maxMinutenVoorRuimte('technisch') * 60_000 === TS.MAX_DUUR_MS.technisch && JS.maxMinutenVoorRuimte('prive') * 60_000 === TS.MAX_DUUR_MS.prive);
    check("browser.audit: in ALLOWED_COMMANDS en TYPE_CAPABILITY → 'browser.read'", JS.ALLOWED_COMMANDS.includes('browser.audit') && JS.TYPE_CAPABILITY['browser.audit'] === 'browser.read');
    check('hostToegestaan: exacte host, geen subdomein of vreemde host, leeg = nee',
      JS.hostToegestaan('https://admin.tarasevych.com/x?y=1', ['admin.tarasevych.com']) && !JS.hostToegestaan('https://x.admin.tarasevych.com/', ['admin.tarasevych.com'])
      && !JS.hostToegestaan('https://mail.tarasevych.com/', ['admin.tarasevych.com']) && !JS.hostToegestaan('https://admin.tarasevych.com.evil.com/', ['admin.tarasevych.com'])
      && !JS.hostToegestaan('http://admin.tarasevych.com/', ['admin.tarasevych.com']) && !JS.hostToegestaan('https://admin.tarasevych.com/', []) && !JS.hostToegestaan('javascript:alert(1)', ['admin.tarasevych.com']));

    const eigen = { agentId: AGENT, userId: USER, ruimte: R };
    const v = async (gr: any, sig?: string, k = key) => (await JS.verifyOntgrendeling(k, gr, sig ?? teken(key, gr), eigen)) as { ok: boolean; code?: string };
    const goedV = await v(maakGrant());
    const ander = randomBytes(32).toString('base64url');
    const gevallen: Array<[string, Promise<{ ok: boolean; code?: string }>, string]> = [
      ['vervalste handtekening (andere sleutel)', (async () => { const gr = maakGrant(); return JS.verifyOntgrendeling(key, gr, teken(ander, gr), eigen); })(), 'HANDTEKENING'],
      ['handtekening van een ander object (caps achteraf uitgebreid)', (async () => { const gr = maakGrant(); const sig = teken(key, gr); return JS.verifyOntgrendeling(key, { ...gr, caps: ['browser.read', 'browser.interact'] }, sig, eigen); })(), 'HANDTEKENING'],
      ['handtekening geen hex', v(maakGrant(), 'x'.repeat(64)), 'HANDTEKENING'],
      ['ander agentId', v(maakGrant({ agentId: 'agent-ander' })), 'AGENT'],
      ['ander userId', v(maakGrant({ userId: 'user-ander' })), 'GEBRUIKER'],
      ['verlopen', v(maakGrant({ iat: Date.now() - 3_600_000, exp: Date.now() - 1 })), 'VERLOPEN'],
      // 0.7.0: de termijn is een keuze van de eigenaar tot 366 dagen (shared/extensie-matrix.ts); daarboven blijft TE_LANG.
      ['te lang (> 366 dagen)', v(maakGrant({ iat: Date.now() - 1000, exp: Date.now() - 1000 + 367 * 86_400_000 })), 'TE_LANG'],
      ['iat ver in de toekomst (> 60 s klokspeling)', v(maakGrant({ iat: Date.now() + 120_000, exp: Date.now() + 600_000 })), 'TOEKOMST'],
      ['onbekende cap', v(maakGrant({ caps: ['browser.read', 'browser.root' as any] })), 'CAPS'],
      ['domein buiten ADMIN_HOSTS_TOEGESTAAN', v(maakGrant({ domeinen: ['evil.com'] })), 'DOMEINEN'],
      ['kale tarasevych.com is geen beheerhost', v(maakGrant({ domeinen: ['tarasevych.com'] })), 'DOMEINEN'],
      ['domeinen leeg', v(maakGrant({ domeinen: [] })), 'VORM'],
      ['versie 1 (0.5-formaat, nooit live)', v({ ...maakGrant(), v: 1 } as any), 'VERSIE'],
      ['ruimte ≠ slot (prive-grant naar het technische slot)', v(maakGrant({ ruimte: 'prive', domeinen: ['mail.tarasevych.com'] })), 'RUIMTE'],
      ['onbekende ruimte', v(maakGrant({ ruimte: 'alles' as any })), 'VORM'],
      ['komma in gid (zou de canonieke tekst kunnen verschuiven)', v(maakGrant({ gid: 'abc,defgh' })), 'VORM'],
      ['geen sleutel', JS.verifyOntgrendeling('', maakGrant(), 'a'.repeat(64), eigen), 'GEEN_SLEUTEL'],
    ];
    check('verifyOntgrendeling: geldige ontgrendeling → ok', goedV.ok === true, JSON.stringify(goedV));
    for (const [naam, p, code] of gevallen) { const r = await p; check(`verifyOntgrendeling weigert: ${naam} → ${code}`, r.ok === false && r.code === code, JSON.stringify(r)); }
    check('klokspeling: iat 30 s in de toekomst mag nog', (await v(maakGrant({ iat: Date.now() + 30_000, exp: Date.now() + 600_000 }))).ok === true);

    {
      const gp = maakGrant({ ruimte: 'prive', domeinen: ['admin.tarasevych.com'] });
      const rp = await JS.verifyOntgrendeling(key, gp, teken(key, gp), { ...eigen, ruimte: 'prive' });
      const gl = maakGrant({ ruimte: 'prive', domeinen: ['mail.tarasevych.com'], iat: Date.now() - 1000, exp: Date.now() + 29 * 86_400_000 });
      const rl = await JS.verifyOntgrendeling(key, gl, teken(key, gl), { ...eigen, ruimte: 'prive' });
      const gt = maakGrant({ iat: Date.now() - 1000, exp: Date.now() + 9 * 3_600_000 });
      const gl2 = maakGrant({ iat: Date.now() - 1000, exp: Date.now() + 400 * 86_400_000 });
      check('verifyOntgrendeling per ruimte: prive met admin.* → DOMEINEN; prive 29 dagen mag; technisch 9 uur mag (0.7.0); 400 dagen → TE_LANG',
        rp.ok === false && rp.code === 'DOMEINEN' && rl.ok === true && (await v(gt)).ok === true && (await v(gl2)).code === 'TE_LANG', JSON.stringify([rp, rl]));
    }

    // ------------------------------------------------------------ achtergrondproces met nep-chrome (0.5-opslag → migratie naar slot technisch)
    const local: Record<string, any> = { agentToken: 'agent-token-geheim', tokenExpiresAt: Date.now() + 86_400_000, agentId: AGENT, userId: USER, server: 'https://mcp.tarasevych.com', name: 'Chrome test', commandKey: key };
    const session: Record<string, any> = {};
    const tabs: Tab[] = [
      { id: 5, url: 'https://admin.tarasevych.com/x', active: true, lastFocusedWindow: true, windowId: 1, title: 'Admin' },
      { id: 6, url: 'https://mail.tarasevych.com/', active: false, windowId: 1, title: 'Mail' },
    ];
    const env = nepOmgeving(local, session, tabs);
    g.chrome = env.chrome;
    NepWS.alle = [];
    await laadExtensie();
    const intern = env.L.intern[0];
    const extern = env.L.extern[0];
    check('background.js geladen met nep-chrome (onMessage, onMessageExternal, webRequest-luisteraars)', typeof intern === 'function' && typeof extern === 'function' && env.L.netKlaar.length === 1 && env.L.netFout.length === 1);
    check('verbinding: ticket in het eerste bericht (geen token in de URL)', await tot(() => NepWS.alle.length === 1 && NepWS.alle[0].sent.some((m) => m.t === 'auth' && m.ticket === 'eenmalig-ticket')) && !NepWS.alle[0].url.includes('agent-token'));
    const ws = NepWS.alle[0];
    ws.ontvang({ t: 'ready', agentId: AGENT, epoch: 1 });
    ws.ontvang({ t: 'settings', epoch: 1, caps: ['browser.read', 'browser.navigate', 'browser.interact', 'browser.screenshot', 'browser.console', 'browser.debug'].map((c) => ({ capability: c, domains: [] })), blocked: false });
    await rustig();
    const eigenPagina = { id: ID, url: `${BASIS}options.html`, origin: BASIS.slice(0, -1), tab: { id: 70, url: `${BASIS}options.html` } };
    const contentScript = (tab: Tab) => ({ id: ID, url: tab.url, origin: new URL(tab.url).origin, tab: { id: tab.id, url: tab.url } });
    const vraag = (f: Luisteraar, m: unknown, s: unknown) => new Promise<any>((klaar) => { f(m, s, klaar); setTimeout(() => klaar('GEEN_ANTWOORD'), 3000); });
    await vraag(intern, { op: 'account', claim: { userId: USER, sessionTag: 't' }, profiel: 'technisch' }, contentScript(tabs[0]));
    await vraag(intern, { op: 'account', claim: { userId: USER, sessionTag: 't' }, profiel: 'gebruiker' }, contentScript(tabs[1]));
    check('migratie 0.5 → 0.6: platte sleutels weg, slot technisch (volgens /self.ruimte) met agentId/userId; geheimen onder technisch:* in IndexedDB',
      !('agentId' in local) && !('agentToken' in local) && local[SK.local]?.agentId === AGENT && local[SK.local]?.userId === USER && !local.slot_prive
      && idb.waarde('mr-geheim', 'kv', 'technisch:agentToken') === 'agent-token-geheim' && idb.waarde('mr-geheim', 'kv', 'agentToken') === undefined, JSON.stringify(local));
    const laatsteStatus = () => [...ws.sent].reverse().find((m) => m.t === 'status');
    check("na 'ready': {t:'status', ruimte:'technisch', staat:'vergrendeld', gid:null} naar de server", await tot(() => laatsteStatus()?.staat === 'vergrendeld') && laatsteStatus()?.gid === null && laatsteStatus()?.version === '0.9.3' && laatsteStatus()?.ruimte === R, JSON.stringify(laatsteStatus()));

    let n = 0;
    const opdracht = async (type: string, params: any = {}, o: { sig?: string; scope?: any } = {}) => {
      const id = `cmd-${++n}`;
      const exp = Date.now() + 60_000;
      ws.ontvang({ t: 'cmd', id, type, params, exp, sig: o.sig ?? signCommand(key, id, type, params, exp), ...(o.scope ? { scope: o.scope } : {}) });
      await tot(() => ws.sent.some((m) => m.t === 'result' && m.id === id), 5000);
      return ws.sent.find((m) => m.t === 'result' && m.id === id);
    };
    const tabOps = () => env.naarTab.map((x) => x.msg.op);

    // ---- zonder ontgrendeling: alles geweigerd, niets verzameld
    const voor = env.naarTab.length;
    const r1 = await opdracht('browser.snapshot');
    check('vergrendeld: browser.snapshot met geldige HMAC wordt geweigerd met EXTENSIE_VERGRENDELD (exacte uitleg)', r1?.ok === false && r1.error === VERGRENDELD, JSON.stringify(r1));
    check('vergrendeld: de brug krijgt geen opdracht', !env.naarTab.slice(voor).some((x) => x.msg.op === 'snapshot'));
    const r1b = await opdracht('browser.tabs');
    check('vergrendeld: ook browser.tabs (zonder tabblad) geweigerd', r1b?.ok === false && /^EXTENSIE_VERGRENDELD/.test(r1b.error));
    const st0 = await vraag(intern, { op: 'status' }, contentScript(tabs[0]));
    check("status (content script): publiek, staat 'vergrendeld', geen geheimen", st0.staat === 'vergrendeld' && st0.exp === null && st0.gekoppeld === true && !('ontgrendeling' in st0)
      && !JSON.stringify(st0).includes(key) && !JSON.stringify(st0).includes('agent-token-geheim'), JSON.stringify(st0).slice(0, 160));
    const modusVraag = await vraag(intern, { op: 'diag-modus?' }, contentScript(tabs[0]));
    check("diag-modus? vergrendeld → aan:false", modusVraag.ok === true && modusVraag.aan === false);
    const spill0 = await vraag(intern, { op: 'diag-spill', ruimte: R, url: tabs[0].url, entries: [{ kind: 'console' }] }, contentScript(tabs[0]));
    check('diag-spill (archief) vergrendeld → geweigerd, geen upload', spill0.ok === false && !fetches.some((f) => f.url.includes('/diagnostics/archive')));
    for (const f of env.L.netBegin) f({ requestId: 'r0', tabId: 5, timeStamp: 1, url: 'https://admin.tarasevych.com/api/a?token=x', method: 'GET', type: 'xmlhttprequest' });
    for (const f of env.L.netKlaar) f({ requestId: 'r0', tabId: 5, timeStamp: 9, url: 'https://admin.tarasevych.com/api/a?token=x', method: 'GET', type: 'xmlhttprequest', statusCode: 200, fromCache: false });

    // ---- ongeldige ontgrendelingen via de WebSocket: blijft vergrendeld
    for (const [naam, gr, sig] of [
      ['vervalst', maakGrant(), undefined as string | undefined], ['ander agentId', maakGrant({ agentId: 'agent-x' }), undefined], ['ander userId', maakGrant({ userId: 'u-x' }), undefined],
      ['verlopen', maakGrant({ iat: Date.now() - 9_000_000, exp: Date.now() - 5 }), undefined], ['te lang', maakGrant({ exp: Date.now() + 400 * 86_400_000 }), undefined],
      ['onbekende cap', maakGrant({ caps: ['browser.alles' as any] }), undefined], ['vreemde host', maakGrant({ domeinen: ['example.com'] }), undefined],
    ] as Array<[string, TS.Ontgrendeling, string | undefined]>) {
      ws.ontvang({ t: 'ontgrendeling', grant: gr, sig: sig ?? (naam === 'vervalst' ? teken(ander, gr) : teken(key, gr)) });
      await rustig();
      check(`WS-ontgrendeling geweigerd (${naam}): blijft vergrendeld, niets in storage.session`, !session[SK.ontgr] && laatsteStatus()?.staat === 'vergrendeld');
    }

    // ---- geldige ontgrendeling
    // 0.7.0: console/netwerk hangen aan de eigen cap 'browser.console' (tot 0.6.2 onder browser.read).
    const grant = maakGrant({ caps: ['browser.read', 'browser.console'], domeinen: ['admin.tarasevych.com'] });
    const pushesVoor = env.pushes.length;
    const tabVoor = env.naarTab.length;
    ws.ontvang({ t: 'ontgrendeling', grant: { ...grant, rollen: ['beheerder'] }, sig: teken(key, grant) });
    check("geldige ontgrendeling: staat 'ontgrendeld' naar de server met gid en exp", await tot(() => laatsteStatus()?.staat === 'ontgrendeld') && laatsteStatus()?.gid === grant.gid && laatsteStatus()?.exp === grant.exp && laatsteStatus()?.lokaal === false);
    check("bewaard in chrome.storage.session 'ontgrendeling_technisch' = {grant, sig} (alleen ondertekende velden)", session[SK.ontgr]?.grant?.gid === grant.gid && session[SK.ontgr]?.sig === teken(key, grant) && !('rollen' in session[SK.ontgr].grant) && !('ontgrendeling' in local) && !session.ontgrendeling_prive);
    check(`alarm 'ontgrendeling-einde-technisch' op exp`, env.alarmen[SK.alarm]?.when === grant.exp);
    check("status-push naar eigen pagina's (ExtStatus met sloten.technisch.ontgrendeling)", env.pushes.slice(pushesVoor).some((p) => p.op === 'status-push' && p.status?.sloten?.technisch?.staat === 'ontgrendeld' && p.status.sloten.technisch.ontgrendeling?.gid === grant.gid));
    const naTab = env.naarTab.slice(tabVoor);
    check("tabbladen: {op:'diag-modus', aan:true} alleen voor een host in domeinen; publiek zonder geheimen",
      naTab.some((x) => x.tabId === 5 && x.msg.op === 'diag-modus' && x.msg.aan === true) && naTab.some((x) => x.tabId === 6 && x.msg.op === 'diag-modus' && x.msg.aan === false)
      && naTab.some((x) => x.tabId === 5 && x.msg.op === 'diag-modus' && x.msg.ruimte === R)
      && naTab.some((x) => x.tabId === 5 && x.msg.op === 'status-push' && x.msg.status.technisch?.staat === 'ontgrendeld' && x.msg.status.staat === 'ontgrendeld' && x.msg.status.profielTab === 'technisch' && Array.isArray(x.msg.status.technisch.domeinen))
      && !JSON.stringify(naTab).includes(key) && !JSON.stringify(naTab).includes('agent-token-geheim') && !JSON.stringify(naTab).includes(teken(key, grant)));
    check('diag-modus?: tab 5 (admin) aan, tab 6 (mail) uit', (await vraag(intern, { op: 'diag-modus?' }, contentScript(tabs[0]))).aan === true && (await vraag(intern, { op: 'diag-modus?' }, contentScript(tabs[1]))).aan === false);

    const r2 = await opdracht('browser.snapshot');
    check('ontgrendeld: browser.snapshot wordt uitgevoerd', r2?.ok === true && r2.data?.title === 'Admin', JSON.stringify(r2));
    const r3 = await opdracht('browser.tabs');
    check('browser.tabs toont alleen tabbladen binnen de domeinen van de ontgrendeling', r3?.ok === true && r3.data.tabs.length === 1 && r3.data.tabs[0].id === 5, JSON.stringify(r3?.data));
    const r4 = await opdracht('browser.type', { name: 'Zoeken', text: 'GEHEIM-TYPTEKST' });
    check('cap ontbreekt in de ontgrendeling (interact) → EXTENSIE_CAP, ook al staat hij in de server-settings', r4?.ok === false && /^EXTENSIE_CAP/.test(r4.error), JSON.stringify(r4));
    const r5 = await opdracht('browser.snapshot', {}, { sig: 'a'.repeat(64) });
    check('ongeldige HMAC blijft geweigerd (ook ontgrendeld)', r5?.ok === false && /signature/.test(r5.error));
    const r6 = await opdracht('browser.wait', { text: 'x', __proto__: { evil: 1 } });
    const r6b = await opdracht('browser.wait', JSON.parse('{"text":"x","__proto__":{"isAdmin":true}}'));
    check('valideerOpdracht in de route: onbekende sleutel / __proto__ → EXTENSIE_PARAMS', r6b?.ok === false && /^EXTENSIE_PARAMS/.test(r6b.error) && (r6?.ok === true || /^EXTENSIE_PARAMS/.test(r6?.error)), JSON.stringify([r6, r6b]));
    const r7 = await opdracht('browser.audit', { soort: 'beveiliging' });
    check("browser.audit (cap browser.read) → op 'audit' naar de brug", r7?.ok === true && r7.data?.soort === 'beveiliging' && tabOps().includes('audit'));
    const r8 = await opdracht('browser.audit', { soort: 'cookies' });
    check('browser.audit met onbekende soort → geweigerd', r8?.ok === false && /^EXTENSIE_PARAMS/.test(r8.error));

    // ---- netwerk via chrome.webRequest: alleen ontgrendeld en host ∈ domeinen
    for (const f of env.L.netBegin) { f({ requestId: 'r1', tabId: 5, timeStamp: 100, url: 'https://admin.tarasevych.com/api/b?token=geheim', method: 'POST', type: 'xmlhttprequest' }); f({ requestId: 'r2', tabId: 6, timeStamp: 100, url: 'https://mail.tarasevych.com/api/c', method: 'GET', type: 'fetch' }); }
    for (const f of env.L.netKlaar) { f({ requestId: 'r1', tabId: 5, timeStamp: 150, url: 'https://admin.tarasevych.com/api/b?token=geheim', method: 'POST', type: 'xmlhttprequest', statusCode: 500, fromCache: false }); f({ requestId: 'r2', tabId: 6, timeStamp: 120, url: 'https://mail.tarasevych.com/api/c', method: 'GET', type: 'fetch', statusCode: 200 }); }
    for (const f of env.L.netFout) f({ requestId: 'r3', tabId: 5, timeStamp: 160, url: 'https://admin.tarasevych.com/x.js', method: 'GET', type: 'script', error: 'net::ERR_FAILED' });
    await rustig();
    const r9 = await opdracht('browser.network', {});
    const bron = (b: string) => (r9?.data?.requests || []).filter((x: any) => x.bron === b);
    check("browser.network: verzoeken van chrome.webRequest (bron 'browser') + wat de brug meldt (bron 'pagina')",
      r9?.ok === true && bron('browser').length === 2 && bron('pagina').length === 1 && bron('browser').some((x: any) => x.status === 500 && x.ms === 50 && x.method === 'POST'), JSON.stringify(r9?.data).slice(0, 300));
    check('netwerk: niets van vóór de ontgrendeling, niets van een tabblad buiten de domeinen, geen querystrings',
      !JSON.stringify(r9?.data).includes('/api/a') && !JSON.stringify(r9?.data).includes('mail.tarasevych.com') && !JSON.stringify(r9?.data).includes('geheim'));
    const r10 = await opdracht('browser.network', { failed_only: true });
    check('browser.network failed_only: alleen fouten (500 en ERR_FAILED)', r10?.ok === true && r10.data.requests.filter((x: any) => x.bron === 'browser').length === 2);
    const spill1 = await vraag(intern, { op: 'diag-spill', ruimte: R, url: tabs[0].url, entries: [{ kind: 'console' }] }, contentScript(tabs[0]));
    const spill2 = await vraag(intern, { op: 'diag-spill', ruimte: R, url: tabs[1].url, entries: [{ kind: 'console' }] }, contentScript(tabs[1]));
    check('diag-spill: ontgrendeld en host in domeinen → archief; andere host → geweigerd', spill1.ok === true && spill2.ok === false && await tot(() => fetches.some((f) => f.url.endsWith('/diagnostics/archive'))));

    // ---- host buiten de domeinen
    const grant2 = maakGrant({ caps: ['browser.read', 'browser.navigate', 'browser.console'], domeinen: ['admin.tarasevych.com'] });
    ws.ontvang({ t: 'ontgrendeling', grant: grant2, sig: teken(key, grant2) });
    await tot(() => laatsteStatus()?.gid === grant2.gid);
    const r11 = await opdracht('browser.navigate', { url: 'https://mail.tarasevych.com/' });
    check('navigeren naar een eigen host buiten de domeinen van de ontgrendeling → EXTENSIE_DOMEIN', r11?.ok === false && /^EXTENSIE_DOMEIN/.test(r11.error), JSON.stringify(r11));
    const r12 = await opdracht('browser.navigate', { url: 'javascript:alert(1)' });
    check('navigeren naar javascript: → geweigerd door de validatie', r12?.ok === false && /^EXTENSIE_PARAMS: URL/.test(r12.error), JSON.stringify(r12));
    const r12b = await opdracht('browser.navigate', { url: 'https://admin.tarasevych.com/agents' });
    check('navigeren binnen de domeinen → uitgevoerd', r12b?.ok === true, JSON.stringify(r12b));
    const r12c = await opdracht('browser.snapshot', {}, { scope: { capability: 'browser.read', domains: ['mail.tarasevych.com'] } });
    check('scope van de server (domains) kan alleen verder beperken: admin valt erbuiten → geen tabblad', r12c?.ok === false && /No Mijn Ruimte tab/.test(r12c.error), JSON.stringify(r12c));
    check('nieuwe ontgrendeling (andere gid) leegt de netwerkbuffers', (await opdracht('browser.network', {}))?.data?.requests.filter((x: any) => x.bron === 'browser').length === 0);

    // ---- lokale agent (Native Messaging): geen HMAC, wel grant.lokaal en alleen LOKAAL_CAPS
    const N = g.__mrNative;
    check('native.js: maakNative kreeg status/voerUit/opWijziging', !!N && typeof N.voerUit === 'function' && typeof N.status === 'function');
    let lokaalFout = ''; try { await N.voerUit('browser.snapshot', {}, 'lokaal'); } catch (e) { lokaalFout = (e as Error).message; }
    check('lokaal zonder grant.lokaal → geweigerd (geen slot met «локальний агент»)', /^EXTENSIE_(LOKAAL|VERGRENDELD)/.test(lokaalFout), lokaalFout);
    const grantL = maakGrant({ caps: ['browser.read', 'browser.interact'], domeinen: ['admin.tarasevych.com'], lokaal: true });
    ws.ontvang({ t: 'ontgrendeling', grant: grantL, sig: teken(key, grantL) });
    await tot(() => laatsteStatus()?.gid === grantL.gid);
    const lokaalOk = await N.voerUit('browser.snapshot', {}, 'ws').catch((e: Error) => ({ fout: e.message }));
    check("lokaal met grant.lokaal: lezen mag (bron is altijd 'lokaal', wat native.js ook meegeeft)", lokaalOk?.title === 'Admin', JSON.stringify(lokaalOk));
    lokaalFout = ''; try { await N.voerUit('browser.type', { name: 'Zoeken', text: 'x' }, 'lokaal'); } catch (e) { lokaalFout = (e as Error).message; }
    check('lokaal: handelen (interact) nooit, ook al staat het in de ontgrendeling', /^EXTENSIE_LOKAAL/.test(lokaalFout), lokaalFout);
    const sn1 = await vraag(intern, { op: 'set-native', on: true }, eigenPagina);
    env.permissies.add('nativeMessaging');
    const sn2 = await vraag(intern, { op: 'set-native', on: true }, eigenPagina);
    check("set-native: zonder optionele permissie 'nativeMessaging' geweigerd; met permissie + grant.lokaal → native.start()",
      sn1.ok === false && sn2.ok === true && local.nativeOptIn === true && await tot(() => g.__mrNativeStarts > 0), JSON.stringify([sn1, sn2, g.__mrNativeStarts]));
    const stN = await N.status();
    check('native status(): slot van de lokale agent (technisch) met ontgrendeling {exp, caps, lokaal}, zonder sleutel', stN?.ruimte === R && stN?.ontgrendeling?.lokaal === true && stN.ontgrendeling.exp === grantL.exp && !JSON.stringify(stN).includes(key));

    // ---- AI-status en levensteken
    ws.ontvang({ t: 'agent-status', verbonden: true, agenten: [{ naam: 'Claude\u0007', laatst: Date.now() }] });
    check("agent-status verbonden → staat 'agent'", await tot(() => laatsteStatus()?.staat === 'agent'));
    ws.ontvang({ t: 'ping' });
    await rustig();
    const pong = [...ws.sent].reverse().find((m) => m.t === 'pong');
    check('pong bevat staat, gid, exp en lokaalVerbonden', pong?.staat === 'agent' && pong.gid === grantL.gid && pong.exp === grantL.exp && pong.lokaalVerbonden === false, JSON.stringify(pong));
    const ping = await vraag(extern, { type: 'PING' }, { origin: 'https://mcp.tarasevych.com', url: 'https://mcp.tarasevych.com/agents' });
    const sstat = await vraag(extern, { type: 'STATUS' }, { origin: 'https://admin.tarasevych.com', url: 'https://admin.tarasevych.com/' });
    const vreemdExt = await vraag(extern, { type: 'STATUS' }, { origin: 'https://evil.com', url: 'https://evil.com/' });
    check('externe PING en STATUS: publieke velden, geen sleutels/tokens/handtekening; vreemde oorsprong geweigerd',
      ping.ok && ping.technisch?.staat === 'agent' && ping.technisch.exp === grantL.exp && JSON.stringify(ping.technisch.caps) === JSON.stringify(grantL.caps) && ping.technisch.aiVerbonden === true && ping.version === '0.9.3'
      && ping.prive?.gekoppeld === false && ping.prive.staat === 'niet-gekoppeld'
      && sstat.ok && sstat.technisch?.staat === 'agent' && JSON.stringify(sstat.technisch.domeinen) === '["admin.tarasevych.com"]' && vreemdExt.ok === false
      && ![ping, sstat].some((x) => JSON.stringify(x).includes(key) || JSON.stringify(x).includes('agent-token-geheim') || JSON.stringify(x).includes(teken(key, grantL))), JSON.stringify(ping).slice(0, 200));
    const st1 = await vraag(intern, { op: 'status' }, eigenPagina);
    check('ExtStatus: sloten.technisch.ai.agenten zonder control-tekens; techRecht en e-mail uit /self', st1.sloten?.technisch?.ai?.verbonden === true && st1.sloten.technisch.ai.agenten[0]?.naam === 'Claude' && st1.techRecht === true && st1.accountEmail === 'pavlo@test.invalid');

    // ---- opdrachtlog (30 regels, zonder parameters)
    const log = await vraag(intern, { op: 'log' }, eigenPagina);
    check('log (eigen pagina): regels met type/ok/bron/fout, geen parameterinhoud', log.ok === true && log.regels.length > 5 && log.regels.length <= 30
      && log.regels.every((x: any) => typeof x.type === 'string' && typeof x.ok === 'boolean' && (x.bron === 'ws' || x.bron === 'lokaal') && x.ruimte === R)
      && log.regels.some((x: any) => x.bron === 'lokaal') && log.regels.some((x: any) => x.fout === 'EXTENSIE_VERGRENDELD') && !JSON.stringify(log).includes('GEHEIM-TYPTEKST') && !JSON.stringify(log).includes('mail.tarasevych.com'), JSON.stringify(log.regels.slice(-3)));
    check('log: niet voor content scripts', (await vraag(intern, { op: 'log' }, contentScript(tabs[0]))).ok === false);
    for (let i = 0; i < 35; i += 1) await opdracht('browser.self_test');
    check('log: hoogstens 30 regels', (await vraag(intern, { op: 'log' }, eigenPagina)).regels.length === 30);

    // ---- debugger is optioneel: set-diag alleen met de permissie
    const sd1 = await vraag(intern, { op: 'set-diag', on: true }, eigenPagina);
    env.permissies.add('debugger');
    const sd2 = await vraag(intern, { op: 'set-diag', on: true }, eigenPagina);
    check("set-diag on=true: zonder optionele permissie 'debugger' geweigerd, met permissie ok", sd1.ok === false && sd2.ok === true && local.diagOptIn === true, JSON.stringify([sd1, sd2]));

    // ---- vergrendelen door de server
    ws.ontvang({ t: 'vergrendel', gid: 'een-andere-gid', reden: 'site' });
    await rustig();
    check('vergrendel met een andere gid → blijft open', laatsteStatus()?.staat === 'agent' && !!session[SK.ontgr]);
    const tabVoor2 = env.naarTab.length;
    ws.ontvang({ t: 'vergrendel', gid: grantL.gid, reden: 'site' });
    check("vergrendel met de eigen gid → vergrendeld; storage.session leeg, alarm weg, diag-clear + diag-modus uit naar de tabbladen",
      await tot(() => laatsteStatus()?.staat === 'vergrendeld') && !session[SK.ontgr] && !env.alarmen[SK.alarm]
      && env.naarTab.slice(tabVoor2).some((x) => x.msg.op === 'diag-clear' && x.msg.ruimte === R) && env.naarTab.slice(tabVoor2).some((x) => x.tabId === 5 && x.msg.op === 'diag-modus' && x.msg.aan === false));
    const r13 = await opdracht('browser.snapshot');
    check('na vergrendelen: opnieuw EXTENSIE_VERGRENDELD', r13?.ok === false && r13.error === VERGRENDELD);

    // vergrendel zonder gid = altijd
    const grant3 = maakGrant();
    ws.ontvang({ t: 'ontgrendeling', grant: grant3, sig: teken(key, grant3) });
    await tot(() => laatsteStatus()?.gid === grant3.gid);
    ws.ontvang({ t: 'vergrendel', reden: 'tech-einde' });
    check('vergrendel zonder gid → altijd vergrendeld', await tot(() => laatsteStatus()?.staat === 'vergrendeld'));
    // noodstop
    const grant4 = maakGrant();
    ws.ontvang({ t: 'ontgrendeling', grant: grant4, sig: teken(key, grant4) });
    await tot(() => laatsteStatus()?.gid === grant4.gid);
    ws.ontvang({ t: 'stop' });
    check("'stop' (noodstop) vergrendelt ook", await tot(() => laatsteStatus()?.staat === 'vergrendeld') && !session[SK.ontgr]);
    ws.ontvang({ t: 'settings', epoch: 2, caps: ['browser.read', 'browser.navigate', 'browser.interact', 'browser.screenshot', 'browser.console', 'browser.debug'].map((c) => ({ capability: c, domains: [] })), blocked: false });

    // ---- lokaal intrekken (popup/zijpaneel/opties): via WS, en zonder WS via HTTP-terugval
    const grant5 = maakGrant();
    ws.ontvang({ t: 'ontgrendeling', grant: grant5, sig: teken(key, grant5) });
    await tot(() => laatsteStatus()?.gid === grant5.gid);
    const doorSite = await vraag(intern, { op: 'vergrendel', reden: 'opties', ruimte: R }, contentScript(tabs[0]));
    check('vergrendel vanaf een content script (site) → geweigerd, blijft open', doorSite.ok === false && laatsteStatus()?.staat !== 'vergrendeld' && !!session[SK.ontgr]);
    const doorOpties = await vraag(intern, { op: 'vergrendel', reden: 'opties', ruimte: R }, eigenPagina);
    check("vergrendel vanuit de opties → vergrendeld en {t:'vergrendel-verzoek', gid, reden:'opties'} naar de server",
      doorOpties.ok === true && doorOpties.staat === 'vergrendeld' && ws.sent.some((m) => m.t === 'vergrendel-verzoek' && m.gid === grant5.gid && m.reden === 'opties'));
    const grant6 = maakGrant();
    ws.ontvang({ t: 'ontgrendeling', grant: grant6, sig: teken(key, grant6) });
    await tot(() => laatsteStatus()?.gid === grant6.gid);
    ws.close(1006);
    await rustig();
    const doorPaneel = await vraag(intern, { op: 'vergrendel', reden: 'zijpaneel', ruimte: R }, { ...eigenPagina, url: `${BASIS}sidepanel.html`, tab: undefined });
    const http = fetches.find((f) => f.url.endsWith('/api/owner/agents/ontgrendeling/intrekken-extensie') && JSON.parse(f.init.body).gid === grant6.gid);
    check('zonder WebSocket: HTTP-terugval POST …/ontgrendeling/intrekken-extensie met Bearer-token en {gid, reden}',
      doorPaneel.ok === true && !!http && http.init.method === 'POST' && http.init.headers.Authorization === 'Bearer agent-token-geheim' && JSON.parse(http.init.body).gid === grant6.gid && JSON.parse(http.init.body).reden === 'zijpaneel');

    // ---- einde van de duur: alarm/timer vergrendelt
    const extStatusVol = async () => vraag(intern, { op: 'status' }, eigenPagina);
    const extStatus = async () => { const x = await extStatusVol(); return { ...x.sloten.technisch, nativeOptIn: x.nativeOptIn }; };
    env.L.alarm.forEach((f) => f({ name: 'keepalive' })); // verbindt opnieuw
    check('opnieuw verbonden na keepalive', await tot(() => NepWS.alle.length === 2 && NepWS.alle[1].readyState === 1));
    let ws2 = NepWS.alle[1];
    ws2.ontvang({ t: 'ready', agentId: AGENT, epoch: 2 });
    await rustig();
    const kort = maakGrant({ exp: Date.now() + 400 });
    ws2.ontvang({ t: 'ontgrendeling', grant: kort, sig: teken(key, kort) });
    check('korte ontgrendeling: eerst open', (await tot(() => session[SK.ontgr]?.grant?.gid === kort.gid)) && (await extStatus()).staat !== 'vergrendeld');
    await sleep(600);
    const naEinde = await extStatus();
    check('na exp: vanzelf vergrendeld (timer/alarm), storage.session leeg', naEinde.staat === 'vergrendeld' && !session[SK.ontgr], naEinde.staat);

    // ---- storage.session: na het wekken van de service worker opnieuw gecontroleerd
    const grant7 = maakGrant({ caps: ['browser.read', 'browser.screenshot'] });
    const sessie2: Record<string, any> = { [SK.ontgr]: { grant: grant7, sig: teken(key, grant7) } };
    const env2 = nepOmgeving({ ...local }, sessie2, tabs);
    g.chrome = env2.chrome;
    await laadExtensie();
    const st2 = (await vraag(env2.L.intern[0], { op: 'status' }, eigenPagina)).sloten.technisch;
    check('wekken: geldige ontgrendeling uit storage.session wordt hersteld (opnieuw gecontroleerd)', st2.staat === 'ontgrendeld' && st2.ontgrendeling?.gid === grant7.gid && JSON.stringify(st2.ontgrendeling.caps) === JSON.stringify(grant7.caps), JSON.stringify(st2).slice(0, 200));
    const grant8 = maakGrant();
    const sessie3: Record<string, any> = { [SK.ontgr]: { grant: { ...grant8, caps: ['browser.read', 'browser.debug'] }, sig: teken(key, grant8) } };
    const env3 = nepOmgeving({ ...local }, sessie3, tabs);
    g.chrome = env3.chrome;
    await laadExtensie();
    const st3 = (await vraag(env3.L.intern[0], { op: 'status' }, eigenPagina)).sloten.technisch;
    check('wekken: gewijzigde ontgrendeling in storage.session (caps uitgebreid) → verworpen en gewist', st3.staat === 'vergrendeld' && !sessie3[SK.ontgr]);

    // ================================================================ review 18.10.2026 (securityreview, punten 1–8)
    g.chrome = env.chrome;
    const nieuwWS = async () => {
      const n0 = NepWS.alle.length;
      env.L.alarm.forEach((f) => f({ name: 'keepalive' }));
      await tot(() => NepWS.alle.length > n0 && NepWS.alle[NepWS.alle.length - 1].readyState === 1);
      const s = NepWS.alle[NepWS.alle.length - 1];
      await tot(() => s.sent.some((m) => m.t === 'auth'));
      return s;
    };
    const opdrachtOp = async (sock: NepWS, type: string, params: any = {}) => {
      const id = `rv-${++n}`; const exp = Date.now() + 60_000;
      sock.ontvang({ t: 'cmd', id, type, params, exp, sig: signCommand(key, id, type, params, exp) });
      await tot(() => sock.sent.some((m) => m.t === 'result' && m.id === id), 8000);
      return sock.sent.find((m) => m.t === 'result' && m.id === id);
    };
    const ontgrendel = async (sock: NepWS, gr: TS.Ontgrendeling) => { sock.ontvang({ t: 'ontgrendeling', grant: gr, sig: teken(key, gr) }); await rustig(); };
    const staat = async () => (await extStatus()).staat;
    let wsR = ws2;

    // 1 (HOOG): na 'ready' afstemmen met de server
    const gA = maakGrant(); await ontgrendel(wsR, gA);
    wsR.close(1006); wsR = await nieuwWS(); wsR.ontvang({ t: 'ready', agentId: AGENT, epoch: 3 }); await rustig();
    wsR.ontvang({ t: 'vergrendel', reden: 'ingetrokken' }); // server: geen actieve rij (zonder gid)
    await rustig();
    check('1: na ready + {t:vergrendel} zonder gid → altijd gewist', (await staat()) === 'vergrendeld' && !session[SK.ontgr]);
    const gB = maakGrant(); await ontgrendel(wsR, gB);
    wsR.close(1006); wsR = await nieuwWS(); wsR.ontvang({ t: 'ready', agentId: AGENT, epoch: 4 });
    await rustig();
    const tijdens = await vraag(intern, { op: 'diag-modus?' }, contentScript(tabs[0]));
    check('1: tijdens de afstemming na ready telt de grant niet (diag-modus uit, staat niet open, gid niet gemeld)',
      tijdens.aan === false && (await staat()) === 'vergrendeld' && wsR.sent.filter((m) => m.t === 'status').pop()?.gid === null);
    const t0 = Date.now();
    const rB = await opdrachtOp(wsR, 'browser.snapshot');
    check('1: na ready zonder bevestiging (geen {t:ontgrendeling} met dezelfde gid binnen 5 s) → gewist; een opdracht in die tijd wacht en wordt geweigerd',
      rB?.ok === false && rB.error === VERGRENDELD && Date.now() - t0 >= 4500 && (await staat()) === 'vergrendeld' && !session[SK.ontgr], `${Date.now() - t0} ms ${JSON.stringify(rB)}`);
    const gC = maakGrant(); await ontgrendel(wsR, gC);
    wsR.close(1006); wsR = await nieuwWS(); wsR.ontvang({ t: 'ready', agentId: AGENT, epoch: 5 });
    await ontgrendel(wsR, gC); // server bevestigt dezelfde gid
    const rC = await opdrachtOp(wsR, 'browser.snapshot');
    await sleep(5300);
    check('1: na ready mét bevestiging (zelfde gid) → blijft open en opdrachten werken', rC?.ok === true && (await staat()) !== 'vergrendeld' && session[SK.ontgr]?.grant?.gid === gC.gid, JSON.stringify(rC));

    // 2 (MIDDEL): ingetrokken gids nooit meer, geen downgrade, wachtrij voor lokaal intrekken
    wsR.ontvang({ t: 'vergrendel', gid: gC.gid, reden: 'site' }); await rustig();
    await ontgrendel(wsR, gC);
    const stC = await extStatus();
    check('2: een ingetrokken gid wordt nooit opnieuw aanvaard (ook niet als de server hem opnieuw stuurt); bewaard in storage.session',
      stC.staat === 'vergrendeld' && /INGETROKKEN/.test(stC.fout) && Array.isArray(session[SK.intrek]?.ingetrokken) && session[SK.intrek].ingetrokken.includes(gC.gid), stC.fout);
    const gX = maakGrant();
    wsR.ontvang({ t: 'vergrendel', gid: gX.gid, reden: 'site' }); await rustig(); // intrekking komt vóór de grant (geen grant in bezit)
    await ontgrendel(wsR, gX);
    check('2: vergrendel(gid) zonder grant in bezit → die gid later toch geweigerd', (await staat()) === 'vergrendeld' && session[SK.intrek].ingetrokken.includes(gX.gid));
    const gD = maakGrant(); await ontgrendel(wsR, gD);
    const gE = maakGrant({ iat: gD.iat - 5000 }); await ontgrendel(wsR, gE);
    const stE = await extStatus();
    check('2: geen downgrade: een geldige grant met oudere iat dan de laatst aanvaarde → geweigerd (OUDER), de nieuwere blijft', stE.ontgrendeling?.gid === gD.gid && /OUDER/.test(stE.fout), stE.fout);
    const gF = maakGrant(); await ontgrendel(wsR, gF);
    wsR.close(1006); await rustig();
    offline = true;
    const vp = await vraag(intern, { op: 'vergrendel', reden: 'popup', ruimte: R }, { ...eigenPagina, url: `${BASIS}popup.html`, tab: undefined });
    offline = false;
    check('2: lokaal intrekken zonder WS en zonder netwerk → vergrendeld en in de wachtrij (storage.session)', vp.ok === true && vp.staat === 'vergrendeld' && session[SK.intrek]?.wachtrij?.some((w: any) => w.gid === gF.gid && w.reden === 'popup'));
    wsR = await nieuwWS(); wsR.ontvang({ t: 'ready', agentId: AGENT, epoch: 6 });
    check('2: bij de volgende ready gaat het verzoek opnieuw naar de server', await tot(() => wsR.sent.some((m) => m.t === 'vergrendel-verzoek' && m.gid === gF.gid && m.reden === 'popup')));
    await ontgrendel(wsR, gF); // server (rij nog actief) duwt dezelfde grant opnieuw
    check('2: … en de server kan die grant niet terugzetten (tegen de wil van de gebruiker)', (await staat()) === 'vergrendeld' && !session[SK.ontgr]);
    check('2: wachtrij blijft tot de server bevestigt', session[SK.intrek].wachtrij.some((w: any) => w.gid === gF.gid));
    wsR.ontvang({ t: 'vergrendel', gid: gF.gid, reden: 'popup', ingetrokken: true }); await rustig();
    check("2: {t:'vergrendel', gid, ingetrokken:true} bevestigt → uit de wachtrij", !session[SK.intrek].wachtrij.some((w: any) => w.gid === gF.gid));

    // 3 (MIDDEL): geheimen niet in storage.local
    check('3: agentToken en commandKey staan niet (meer) in chrome.storage.local, wel in IndexedDB van de extensie (verhuisd bij het laden)',
      !('agentToken' in local) && !('commandKey' in local) && idb.waarde('mr-geheim', 'kv', 'technisch:agentToken') === 'agent-token-geheim' && idb.waarde('mr-geheim', 'kv', 'technisch:commandKey') === key && local[SK.local]?.agentId === AGENT
      && JSON.stringify(local).indexOf('agent-token-geheim') === -1);

    // 5 (LAAG): eindhost na navigeren, zelftest en externe berichten
    const gN = maakGrant({ caps: ['browser.read', 'browser.navigate'] }); await ontgrendel(wsR, gN);
    omleiding.url = 'https://mail.tarasevych.com/inbox/geheim-pad';
    const rN = await opdrachtOp(wsR, 'browser.navigate', { url: 'https://admin.tarasevych.com/agents' });
    omleiding.url = '';
    check('5: navigeren dat buiten de domeinen eindigt (omleiding) → EXTENSIE_DOMEIN zonder titel of pad', rN?.ok === false && /^EXTENSIE_DOMEIN/.test(rN.error) && !/mail|geheim|Admin/.test(rN.error), JSON.stringify(rN));
    const zHub = await vraag(extern, { type: 'SELF_TEST' }, { origin: 'https://hub.tarasevych.com', url: 'https://hub.tarasevych.com/' });
    const uHub = await vraag(extern, { type: 'UPDATE_CHECK' }, { origin: 'https://cloud.tarasevych.com', url: 'https://cloud.tarasevych.com/' });
    const zAdmin = await vraag(extern, { type: 'SELF_TEST' }, { origin: 'https://admin.tarasevych.com', url: 'https://admin.tarasevych.com/' });
    check('5: externe SELF_TEST/UPDATE_CHECK alleen vanaf mcp.* en admin.*', zHub.ok === false && zHub.reason === 'WRONG_HOST' && uHub.ok === false && uHub.reason === 'WRONG_HOST' && zAdmin.ok === true && Array.isArray(zAdmin.checks));
    wsR.ontvang({ t: 'vergrendel', reden: 'site' }); await rustig();
    const zt = await vraag(intern, { op: 'self-test' }, eigenPagina);
    check('5: zelftest vergrendeld → site_tab zonder adres', zt.checks.find((c: any) => c.id === 'site_tab')?.detail === '', JSON.stringify(zt.checks.find((c: any) => c.id === 'site_tab')));

    // 7 (LAAG): status voor content scripts uit de cache, publiek
    await sleep(10);
    const selfVoor = fetches.filter((f) => f.url.endsWith('/api/owner/agents/self')).length;
    const cs = [await vraag(intern, { op: 'status' }, contentScript(tabs[0])), await vraag(intern, { op: 'status' }, contentScript(tabs[0])), await vraag(intern, { op: 'status' }, contentScript(tabs[1]))];
    const selfNa = fetches.filter((f) => f.url.endsWith('/api/owner/agents/self')).length;
    check('7: status voor content scripts: publieke velden (+ paired/enabled/active), /self hoogstens 1× per 30 s',
      selfNa - selfVoor <= 1 && cs.every((x) => x.technisch?.staat === 'vergrendeld' && x.paired === true && !('ontgrendeling' in x) && !('fout' in x) && !('naam' in x) && !('diagOptIn' in x)), `${selfNa - selfVoor} ${JSON.stringify(cs[0])}`);

    // 8: nativeOptIn in ExtStatus
    check('8: ExtStatus.nativeOptIn', (await extStatus()).nativeOptIn === true);

    // 4 (LAAG): klok — geldig tot min(exp, ontvangenOp + (exp − iat)); als laatste (iat in de toekomst verhoogt laatsteIat)
    const gK = maakGrant({ iat: Date.now() + 50_000, exp: Date.now() + 50_400 }); // serverklok 50 s voor; duur 400 ms
    await ontgrendel(wsR, gK);
    const stK = await extStatus();
    check('4: browserklok achter: einde = ontvangenOp + (exp − iat), niet exp', stK.staat !== 'vergrendeld' && stK.ontgrendeling.exp < gK.exp - 40_000 && typeof session[SK.ontgr]?.ontvangenOp === 'number', JSON.stringify(stK.ontgrendeling));
    await sleep(700);
    check('4: … en na die duur vergrendeld, ook al ligt exp nog in de toekomst', (await staat()) === 'vergrendeld' && gK.exp > Date.now());
    ws2 = wsR;

    // ---- ontkoppelen
    g.chrome = env.chrome;
    const grant9 = maakGrant();
    ws2.ontvang({ t: 'ontgrendeling', grant: grant9, sig: teken(key, grant9) });
    await tot(() => !!session[SK.ontgr]);
    const weg = await vraag(intern, { op: 'forget' }, eigenPagina);
    const st4 = await extStatus();
    check("forget: ontgrendeling weg, staat 'niet-gekoppeld', token weg (ook uit IndexedDB)", weg.ok === true && !session[SK.ontgr] && st4.staat === 'niet-gekoppeld' && !local[SK.local]
      && idb.waarde('mr-geheim', 'kv', 'technisch:agentToken') === undefined && idb.waarde('mr-geheim', 'kv', 'technisch:commandKey') === undefined);
    const paar = await vraag(extern, { type: 'PAIR', code: 'ABCD2345', name: 'Chrome' }, { origin: 'https://mcp.tarasevych.com', url: 'https://mcp.tarasevych.com/agents' });
    check('3: koppelen schrijft agentToken/commandKey alleen naar IndexedDB, niet naar storage.local',
      paar.ok === true && paar.ruimte === R && !JSON.stringify(local).includes('nieuw-token') && idb.waarde('mr-geheim', 'kv', 'technisch:agentToken') === 'nieuw-token' && idb.waarde('mr-geheim', 'kv', 'technisch:commandKey') === 'nieuwe-sleutel' && local[SK.local]?.agentId === 'agent-nieuw', JSON.stringify(paar));
    await tot(() => NepWS.alle.every((x) => x.readyState === 3 || x.sent.some((m) => m.t === 'auth'))); // geen onopen meer na het opruimen
    await rustig();
    for (const s of NepWS.alle) s.close(1000);
    await rustig();
  } catch (e) {
    check('onverwachte fout', false, String((e as Error)?.stack || e));
  } finally {
    g.chrome = oud.chrome; g.fetch = oud.fetch; g.WebSocket = oud.WebSocket; delete g.indexedDB; delete g.__mrOmleiding;
  }
  return einde();
}
