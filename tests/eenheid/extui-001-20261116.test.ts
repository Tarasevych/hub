// EXTUI-001 (16.11.2026, рішення власника: «Сайти ШІ» — опція, типово «Вимкнено»; «передбачити правила на сервері в цьому ж»).
// Справжній extension/background.js з нep-chrome і нep-WebSocket (без мережі). Доводить:
//  - вкладку claude.ai розширення ЧИТАЄ лише коли: дозвіл Chrome є («Завжди»), host підписаний у prive-розблокуванні, команда — читання;
//  - без дозволу Chrome: вкладка ШІ невидима й не читається; без host у розблокуванні — теж;
//  - click / type / navigate на сайт ШІ — відмова (і в розширенні, і на сервері — aiSiteOpdrachtFout);
//  - на вкладку ШІ ніколи не йде tabs.sendMessage і не вставляється міст (лише одна ізольована функція scripting.executeScript);
//  - кожне читання — melding у центр сповіщень; ввімкнення/вимкнення дозволу — теж;
//  - технічний слот: claude.ai у підписі — відмова (DOMEINEN); списки AI_SITE_HOSTS / AI_SITE_TYPES у TS і JS однакові;
//  - manifest: AI-адреси лише в optional_host_permissions, host_permissions і content_scripts — лише tarasevych.com.
// Bewijst de leesgrens voor AI-sites in de echte extensie, de serverweigering en de ongewijzigde vaste rechten van het manifest.
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
const USER = 'user-ai';
const KP = randomBytes(32).toString('base64url');
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const rustig = async (n = 6) => { for (let i = 0; i < n; i += 1) await sleep(5); };
async function tot(fn: () => boolean, ms = 3000) { const eind = Date.now() + ms; while (Date.now() < eind) { if (fn()) return true; await sleep(10); } return false; }
type Luisteraar = (...a: any[]) => any;
type Tab = { id: number; url: string; active: boolean; windowId: number; title: string };

const teken = (g: TS.Ontgrendeling) => createHmac('sha256', Buffer.from(KP, 'base64url')).update(TS.ontgrendelTekst(g)).digest('hex');
const grant = (o: Partial<TS.Ontgrendeling> = {}): TS.Ontgrendeling => ({
  v: 2, gid: randomUUID(), agentId: 'agent-prive', userId: USER, ruimte: 'prive',
  caps: ['browser.read', 'browser.navigate', 'browser.interact'], domeinen: ['mail.tarasevych.com', 'mcp.tarasevych.com', 'claude.ai'],
  lokaal: false, iat: Date.now() - 1000, exp: Date.now() + 20 * 60_000, nonce: randomBytes(16).toString('base64url'), ...o,
});

class NepWS {
  static alle: NepWS[] = [];
  static OPEN = 1;
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

function nepOmgeving(tabs: Tab[]) {
  const L = { intern: [] as Luisteraar[], extern: [] as Luisteraar[], permAan: [] as Luisteraar[], permUit: [] as Luisteraar[] };
  const ev = (lijst?: Luisteraar[]) => ({ addListener: (f: Luisteraar) => { lijst?.push(f); }, removeListener: () => undefined });
  const leeg = (): any => new Proxy(function () { /* nep */ }, { get: (_t, k) => (k === 'then' ? undefined : leeg()), apply: () => Promise.resolve(undefined) });
  const opslag = (o: Record<string, any>) => ({
    get: async (k?: string | string[]) => { if (k === undefined) return { ...o }; const ks = Array.isArray(k) ? k : [k]; return Object.fromEntries(ks.filter((x) => x in o).map((x) => [x, structuredClone(o[x])])); },
    set: async (n: Record<string, any>) => { for (const [k, v] of Object.entries(n)) o[k] = structuredClone(v); },
    remove: async (k: string | string[]) => { for (const x of Array.isArray(k) ? k : [k]) delete o[x]; },
    setAccessLevel: async () => undefined,
  });
  const naarTab: Array<{ tabId: number; msg: any }> = [];
  const scripts: Array<{ tabId: number; files?: string[]; func?: boolean; world?: string; args?: any[] }> = [];
  const origins = new Set<string>();
  const updates: Array<{ id: number; o: any }> = [];
  let pagina = { title: 'Claude', koppen: ['Gesprek'], tekst: 'Hallo vanaf claude.ai', afgekapt: false };
  const chrome = {
    runtime: {
      id: ID, getURL: (p: string) => `${BASIS}${p}`, getManifest: () => JSON.parse(readFileSync(join(W, 'extension/manifest.json'), 'utf8')),
      onMessage: ev(L.intern), onMessageExternal: ev(L.extern), onInstalled: ev(), onStartup: ev(), openOptionsPage: async () => undefined,
      sendMessage: async () => undefined,
    },
    storage: { local: opslag({}), session: opslag({}), onChanged: ev() },
    alarms: { create: () => undefined, clear: async () => true, onAlarm: ev() },
    tabs: {
      // Chrome filtert zelf op `url`; de nep doet dat grof (patroon-host), zodat dubbele resultaten zichtbaar zouden worden.
      query: async (q: any = {}) => {
        const pats: string[] = q.url ? (Array.isArray(q.url) ? q.url : [q.url]) : [];
        const past = (u: string) => !pats.length || pats.some((p) => { const h = p.replace(/^https:\/\//, '').replace(/\/\*$/, ''); const host = new URL(u).hostname; return h.startsWith('*.') ? host.endsWith(h.slice(1)) : host === h; });
        return tabs.filter((t) => past(t.url)).map((t) => ({ ...t }));
      },
      get: async (id: number) => ({ ...tabs.find((t) => t.id === id)! }),
      sendMessage: async (tabId: number, msg: any) => {
        naarTab.push({ tabId, msg: structuredClone(msg) });
        if (msg.op === 'account?') return { ok: true, data: { claim: `${USER}:s`, profiel: 'gebruiker' } };
        if (msg.op === 'snapshot') return { ok: true, data: { url: tabs.find((t) => t.id === tabId)!.url, title: `tab-${tabId}` } };
        return { ok: true };
      },
      create: async (o: any) => ({ id: 99, ...o }),
      update: async (id: number, o: any) => { updates.push({ id, o }); return { ...tabs.find((x) => x.id === id)!, ...o }; },
      remove: async () => undefined, onRemoved: ev(), onUpdated: ev(), onActivated: ev(),
    },
    permissions: {
      contains: async (q: any) => (q.permissions || []).length === 0 && (q.origins || []).length > 0 && (q.origins || []).every((o: string) => origins.has(o)),
      onAdded: ev(L.permAan), onRemoved: ev(L.permUit),
    },
    scripting: {
      executeScript: async (o: any) => {
        scripts.push({ tabId: o.target.tabId, files: o.files, func: typeof o.func === 'function', world: o.world, args: o.args });
        return [{ result: o.func ? structuredClone(pagina) : undefined }];
      },
    },
    webRequest: { onBeforeRequest: ev(), onCompleted: ev(), onErrorOccurred: ev() },
    debugger: { attach: async () => undefined, detach: async () => undefined, sendCommand: async () => undefined, onDetach: ev(), onEvent: ev() },
    action: leeg(), sidePanel: leeg(), windows: leeg(),
  };
  return {
    chrome: new Proxy(chrome as Record<string, unknown>, { get: (t, k) => (k in t ? t[k as string] : leeg()) }),
    L, naarTab, scripts, origins, updates, zetPagina: (p: typeof pagina) => { pagina = p; },
  };
}

async function laadExtensie() {
  const map = mkdtempSync(join(tmpdir(), 'mr-extui001-'));
  cpSync(join(W, 'extension'), map, { recursive: true });
  writeFileSync(join(map, 'native.js'), `export function maakNative() { return { start() { return this.info(); }, stop() { return this.info(); }, info() { return { toegestaan: false, verbonden: false }; } }; }\n`);
  await import(pathToFileURL(join(map, 'background.js')).href);
}
const vraag = (f: Luisteraar, m: unknown, s: unknown) => new Promise<any>((klaar) => { f(m, s, klaar); setTimeout(() => klaar('GEEN_ANTWOORD'), 6000); });
const eigenPagina = { id: ID, url: `${BASIS}popup.html`, origin: BASIS.slice(0, -1) };
const MCP = { origin: 'https://mcp.tarasevych.com', url: 'https://mcp.tarasevych.com/agents' };
const cs = (tab: Tab) => ({ id: ID, url: tab.url, origin: new URL(tab.url).origin, tab: { id: tab.id, url: tab.url } });

export async function main(): Promise<number> {
  const { check, einde } = checker('extui-001-ai-sites');
  const g = globalThis as Record<string, any>;
  const oud = { chrome: g.chrome, fetch: g.fetch, WebSocket: g.WebSocket, indexedDB: g.indexedDB };
  g.fetch = async (url: string, init: any = {}) => {
    const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { 'Content-Type': 'application/json' } });
    const u = String(url);
    if (u.endsWith('/api/owner/agents/pair')) return json({ token: 'tok-prive', agentId: 'agent-prive', userId: USER, commandKey: KP, ruimte: 'prive' });
    if (u.endsWith('/api/owner/agents/ws-ticket')) return json({ ticket: `ticket-${String(init?.headers?.Authorization || '').replace('Bearer ', '')}` });
    if (u.endsWith('/api/owner/agents/self')) return json({ enabled: true, active: true, ruimte: 'prive', techRecht: false, email: 'ai@test.invalid' });
    if (u.includes('/downloads/')) return json({}, 404);
    return json({ ok: true });
  };
  g.WebSocket = NepWS;
  g.indexedDB = nepIndexedDB();
  try {
    // ---------------------------------------------------------------- 1. statisch: manifest + gelijke lijsten
    const manifest = JSON.parse(readFileSync(join(W, 'extension/manifest.json'), 'utf8'));
    const shared = await import(pathToFileURL(join(W, 'extension/shared.js')).href);
    const AI_ORIGINS = TS.AI_SITE_HOSTS.map((h) => `https://${h}/*`);
    check('manifest: AI-adressen alleen in optional_host_permissions (precies de vijf sites)', JSON.stringify(manifest.optional_host_permissions) === JSON.stringify(AI_ORIGINS), JSON.stringify(manifest.optional_host_permissions));
    const vast = JSON.stringify([manifest.host_permissions, manifest.content_scripts]);
    check('manifest: host_permissions en content_scripts noemen geen AI-site (alleen tarasevych.com)', !TS.AI_SITE_HOSTS.some((h) => vast.includes(h)) && (manifest.host_permissions as string[]).every((p) => /tarasevych\.com/.test(p)));
    // Швидкість на телефоні: сім вкладених сіток-обгорток сторінки «Агенти» мають явну колонку minmax(0,1fr) (інакше розкладка ~1,5 с).
    const cssPagina = readFileSync(join(W, 'src/agenten/agenten-pagina.css'), 'utf8');
    check('telefoon: de geneste rasters van de agentenpagina hebben een vaste kolom minmax(0,1fr) (geen meting van de inhoud per niveau)',
      /\.ag-pagina,\.ag-pagina \.ag-paneel,\.ag-pagina \.ag-secties,\.ag-pagina \.ag-sectie,\.ag-pagina \.ag-blok-inhoud,\.ag-pagina \.ag-tab\{grid-template-columns:minmax\(0,1fr\)\}/.test(cssPagina));
    const uiBron = readFileSync(join(W, 'src/BrowserExtensiePaneel.tsx'), 'utf8');
    check('telefoon: «Тест» is een korte knop mét uitleg (pictogram op smal scherm), «Стоп» houdt zijn uitleg',
      /test: <IconButton key='test' kort .*?title=\{local \? tr\('Тест: перевіряє/.test(uiBron) && readFileSync(join(W, 'src/mcp-ui.tsx'), 'utf8').includes("kort ? ' is-kort' : ''")
      && readFileSync(join(W, 'src/extensie/extensie-ontwerp.css'), 'utf8').includes('.hub-actions>.hub-btn.is-kort'));
    // Списки сторінок — рядки з логотипом, назвою й вмикачем (побажання власника 16.11): кожна адреса має свою назву й знак.
    const hsBron = readFileSync(join(W, 'src/extensie/HostSchakelaar.tsx'), 'utf8');
    const zonderLogo = [...TS.PRIVE_HOSTS, ...TS.ADMIN_HOSTS_TOEGESTAAN, ...TS.AI_SITE_HOSTS].filter((h) => !hsBron.includes(`'${h}': {`));
    const oudeVinkjes = ['src/extensie/ExtensiePrive.tsx', 'src/extensie/ExtensieOntgrendeling.tsx', 'src/extensie/BrowserEnAgenten.tsx'].filter((f) => /<code>\{h\}<\/code>/.test(readFileSync(join(W, f), 'utf8')));
    check('paginalijsten: elke adres heeft logo + naam in HostSchakelaar, schakelaar is role=switch, geen kale adreslijst meer',
      zonderLogo.length === 0 && oudeVinkjes.length === 0 && /type='checkbox' role='switch' className='hs-schakel'/.test(hsBron), JSON.stringify({ zonderLogo, oudeVinkjes }));
    check('AI_SITE_HOSTS en AI_SITE_TYPES: TS (server) = JS (extensie)', JSON.stringify(shared.AI_SITE_HOSTS) === JSON.stringify(TS.AI_SITE_HOSTS) && JSON.stringify(shared.AI_SITE_TYPES) === JSON.stringify(TS.AI_SITE_TYPES));
    // Телефон: сітка сайтів не ширша за свій блок, а телефонний шар стоїть останнім у файлі (інакше пізніші правила його перекривають).
    const cssOntgr = readFileSync(join(W, 'src/extensie/ExtensieOntgrendeling.css'), 'utf8');
    const cssOntwerp = readFileSync(join(W, 'src/extensie/extensie-ontwerp.css'), 'utf8');
    const laatsteLaag = cssOntwerp.slice(cssOntwerp.lastIndexOf('@media (max-width:560px)'));
    check('telefoon: rooster van sites past in zijn kader (min(210px,100%)) en de telefoonlaag is de laatste laag van het bestand',
      /\.eo-domeinen\{[^}]*minmax\(min\(210px,100%\),1fr\)[^}]*min-width:0/.test(cssOntgr) && !cssOntgr.includes('minmax(210px,1fr)')
      && laatsteLaag.includes('.eo-domeinen{padding-inline:8px}') && laatsteLaag.trimEnd().endsWith('}') && !/\n\.[a-z]/.test(laatsteLaag.replace(/\n {2}/g, ' ')));
    check('AI_SITE_TYPES bevat alleen leesopdrachten (cap browser.read)', TS.AI_SITE_TYPES.every((t) => shared.TYPE_CAPABILITY[t] === 'browser.read'));
    check('isAiSiteUrl: alleen https, exacte host, geen poort/inlog/subdomein', shared.isAiSiteUrl('https://claude.ai/chat/1') && !shared.isAiSiteUrl('http://claude.ai/') && !shared.isAiSiteUrl('https://claude.ai:8443/')
      && !shared.isAiSiteUrl('https://x@claude.ai/') && !shared.isAiSiteUrl('https://evil.claude.ai/') && !shared.isAiSiteUrl('https://claude.ai.evil.com/'));
    check('adresInRuimte: AI-site alleen prive en alleen als de host ondertekend is', shared.adresInRuimte('prive', 'https://claude.ai/x', ['claude.ai'])
      && !shared.adresInRuimte('prive', 'https://chatgpt.com/x', ['claude.ai']) && !shared.adresInRuimte('technisch', 'https://claude.ai/x', ['claude.ai']));
    const vP = await shared.verifyOntgrendeling(KP, (() => { const gr = grant(); return { grant: gr, sig: teken(gr) }; })().grant, '');
    void vP;
    const gT = { ...grant({ ruimte: 'technisch', agentId: 'agent-tech', domeinen: ['admin.tarasevych.com', 'claude.ai'] }) };
    const gPr = grant();
    const vT = await shared.verifyOntgrendeling(KP, gT, teken(gT), { agentId: 'agent-tech', userId: USER, ruimte: 'technisch' });
    const vOk = await shared.verifyOntgrendeling(KP, gPr, teken(gPr), { agentId: 'agent-prive', userId: USER, ruimte: 'prive' });
    check('verifyOntgrendeling: prive met claude.ai → geldig; technisch met claude.ai → DOMEINEN', vOk?.ok === true && vT?.ok === false && vT?.code === 'DOMEINEN', JSON.stringify({ vOk, vT }));

    // ---------------------------------------------------------------- 2. server: aiSiteOpdrachtFout + domeinen-standaard
    const B = await import('../../backend/extensie-ontgrendeling');
    check('server: navigate/click/type naar claude.ai → EXTENSIE_AI_SITE; snapshot/scroll/wait/tabs → toegestaan; eigen site → niets',
      /^EXTENSIE_AI_SITE/.test(B.aiSiteOpdrachtFout('browser.navigate', ['https://claude.ai/new']) || '') && /^EXTENSIE_AI_SITE/.test(B.aiSiteOpdrachtFout('browser.click', ['https://chatgpt.com/']) || '')
      && /^EXTENSIE_AI_SITE/.test(B.aiSiteOpdrachtFout('browser.type', ['https://gemini.google.com/app']) || '')
      && TS.AI_SITE_TYPES.every((t) => B.aiSiteOpdrachtFout(t, ['https://claude.ai/chat/1']) === null) && B.aiSiteOpdrachtFout('browser.navigate', ['https://mail.tarasevych.com/']) === null);
    const bron = readFileSync(join(W, 'backend/extensie-ontgrendeling.ts'), 'utf8');
    check('server: standaard (niets gekozen) alleen eigen diensten; prive-domeinen gefilterd met isPriveOfAiHost; weigering vóór EXTENSIE_HOST',
      /if \(v === undefined \|\| v === null\) return \[\.\.\.\(lijst \?\? ADMIN_HOSTS_STANDAARD\)\]/.test(bron) && /r\.domeinen\.filter\(isPriveOfAiHost\)/.test(bron)
      && bron.indexOf('aiSiteOpdrachtFout(type, urls)') < bron.indexOf('if (buiten.length)'));
    check('TS: AI-sites horen nooit bij PRIVE_HOSTS (standaard nooit aangevinkt)', !TS.AI_SITE_HOSTS.some((h) => (TS.PRIVE_HOSTS as readonly string[]).includes(h)));

    // ---------------------------------------------------------------- 3. echte background.js
    const tabs: Tab[] = [
      { id: 11, url: 'https://claude.ai/chat/abc?secret=1', active: true, windowId: 1, title: 'Claude' },
      { id: 12, url: 'https://mail.tarasevych.com/inbox', active: false, windowId: 1, title: 'Mail' },
      { id: 13, url: 'https://chatgpt.com/c/9', active: false, windowId: 1, title: 'ChatGPT' },
    ];
    const env = nepOmgeving(tabs);
    g.chrome = env.chrome;
    NepWS.alle = [];
    await laadExtensie();
    const intern = env.L.intern[0]; const extern = env.L.extern[0];
    const pp = await vraag(extern, { type: 'PAIR', code: 'PRIV2345', name: 'Chrome' }, MCP);
    check('PAIR → slot prive met WebSocket', pp.ok === true && await tot(() => NepWS.alle.length === 1));
    const ws = NepWS.alle[0];
    ws.ontvang({ t: 'ready' });
    await rustig(10);
    await vraag(intern, { op: 'account', claim: { userId: USER, sessionTag: 's' }, profiel: 'gebruiker' }, cs(tabs[1]));
    const caps = ['browser.read', 'browser.navigate', 'browser.interact'].map((c) => ({ capability: c, domains: [] }));
    ws.ontvang({ t: 'settings', epoch: 1, caps, blocked: false });
    const gr = grant();
    ws.ontvang({ t: 'ontgrendeling', grant: gr, sig: teken(gr) });
    await rustig(10);
    const st = await vraag(intern, { op: 'status' }, eigenPagina);
    check('prive-slot ontgrendeld met claude.ai in de ondertekende domeinen', st.sloten?.prive?.staat === 'ontgrendeld', JSON.stringify(st.sloten?.prive));

    let n = 0;
    const opdracht = async (type: string, params: any = {}) => {
      const id = `a-${++n}`; const exp = Date.now() + 60_000;
      ws.ontvang({ t: 'cmd', id, type, params, exp, sig: signCommand(KP, id, type, params, exp) });
      await tot(() => ws.sent.some((m) => m.t === 'result' && m.id === id), 8000);
      return ws.sent.find((m) => m.t === 'result' && m.id === id);
    };
    const naarAi = () => env.naarTab.filter((x) => x.tabId === 11 || x.tabId === 13);
    const meldingen = () => ws.sent.filter((m) => m.t === 'melding');

    // 3a. zonder recht van Chrome («Вимкнено», standaard)
    const lijst0 = await opdracht('browser.tabs');
    check('zonder recht van Chrome: browser.tabs toont GEEN AI-tabbladen (alleen de eigen site)', lijst0?.ok === true && lijst0.data.tabs.every((t: any) => !/claude|chatgpt/.test(t.url)) && lijst0.data.tabs.some((t: any) => t.id === 12), JSON.stringify(lijst0));
    const snap0 = await opdracht('browser.snapshot');
    check('zonder recht: snapshot leest de eigen site (via de brug), niet de actieve claude.ai-tab', snap0?.ok === true && !env.scripts.some((s) => s.tabId === 11) && /mail\.tarasevych/.test(JSON.stringify(snap0.data)), JSON.stringify(snap0));

    // 3b. «Завжди»: Chrome geeft het recht → melding + leesbaar
    for (const o of AI_ORIGINS) env.origins.add(o);
    const m0 = meldingen().length;
    env.L.permAan.forEach((f) => f({ origins: AI_ORIGINS, permissions: [] }));
    await rustig(6);
    check('recht aan → melding (waarschuwing) in het meldingencentrum', meldingen().length > m0 && meldingen().slice(m0).some((m) => m.ernst === 'waarschuwing'), JSON.stringify(meldingen().slice(m0)));
    const lijst1 = await opdracht('browser.tabs');
    const aiRij = lijst1?.data?.tabs?.find((t: any) => t.id === 11);
    check('met recht: browser.tabs toont claude.ai (aiSite, alleenLezen, zonder query) maar NIET chatgpt.com (niet ondertekend); geen dubbele rijen',
      !!aiRij && aiRij.aiSite === true && aiRij.alleenLezen === true && aiRij.url === 'https://claude.ai/chat/abc' && !lijst1.data.tabs.some((t: any) => t.id === 13)
      && new Set(lijst1.data.tabs.map((t: any) => t.id)).size === lijst1.data.tabs.length, JSON.stringify(lijst1));
    const m1 = meldingen().length;
    const snap1 = await opdracht('browser.snapshot');
    const sc = env.scripts.filter((s) => s.tabId === 11);
    check('met recht: snapshot leest claude.ai via één ISOLATED-functie (geen bestanden, geen brug)', snap1?.ok === true && snap1.data.aiSite === true && snap1.data.alleenLezen === true
      && snap1.data.tekst === 'Hallo vanaf claude.ai' && snap1.data.url === 'https://claude.ai/chat/abc' && sc.length === 1 && sc[0].func === true && sc[0].world === 'ISOLATED' && !sc[0].files, JSON.stringify({ snap1, sc }));
    check('… elke lezing → melding «ШІ прочитав сайт ШІ» met host', meldingen().slice(m1).some((m) => /ШІ прочитав сайт ШІ/.test(m.titel) && /claude\.ai/.test(m.titel)), JSON.stringify(meldingen().slice(m1)));
    const scroll = await opdracht('browser.scroll', { direction: 'down' });
    check('met recht: scroll op claude.ai → ISOLATED-functie met type browser.scroll', scroll?.ok === true && env.scripts.filter((s) => s.tabId === 11).at(-1)?.args?.[0] === 'browser.scroll', JSON.stringify(scroll));

    // 3c. schrijven / navigeren op een AI-site: nooit
    const scriptsVoor = env.scripts.filter((s) => s.tabId === 11).length;
    const naarMailVoor = env.naarTab.filter((x) => x.tabId === 12 && x.msg.op === 'click').length;
    const klik = await opdracht('browser.click', { uid: '1_1' });
    check('click terwijl claude.ai actief is → gaat naar de eigen site (tab 12), nooit naar claude.ai',
      env.scripts.filter((s) => s.tabId === 11).length === scriptsVoor && env.naarTab.filter((x) => x.tabId === 12 && x.msg.op === 'click').length === naarMailVoor + 1, JSON.stringify(klik));
    const nav = await opdracht('browser.navigate', { url: 'https://claude.ai/new' });
    check('navigate naar claude.ai → geweigerd (EXTENSIE_PARAMS/EXTENSIE_AI_SITE), geen tabs.update', nav?.ok === false && /EXTENSIE_(PARAMS|AI_SITE)/.test(nav.error) && !env.updates.some((u) => /claude/.test(String(u.o?.url))), JSON.stringify(nav));
    check('nooit tabs.sendMessage (ook geen markering) of brug op een AI-tabblad', naarAi().length === 0 && !env.scripts.some((s) => (s.tabId === 11 || s.tabId === 13) && s.files), JSON.stringify(naarAi()));

    // 3d. recht weer uit → melding + onleesbaar
    env.origins.clear();
    const m2 = meldingen().length;
    env.L.permUit.forEach((f) => f({ origins: AI_ORIGINS, permissions: [] }));
    await rustig(6);
    check('recht uit → melding (info) in het meldingencentrum', meldingen().slice(m2).some((m) => m.ernst === 'info'), JSON.stringify(meldingen().slice(m2)));
    const tel = env.scripts.filter((s) => s.tabId === 11).length;
    const snap2 = await opdracht('browser.snapshot');
    check('recht uit: claude.ai wordt niet meer gelezen (eigen site in de plaats)', snap2?.ok === true && env.scripts.filter((s) => s.tabId === 11).length === tel && !snap2.data.aiSite, JSON.stringify(snap2));

    // 3e. recht aan, maar host niet ondertekend → onzichtbaar
    for (const o of AI_ORIGINS) env.origins.add(o);
    const gZonder = grant({ domeinen: ['mail.tarasevych.com', 'mcp.tarasevych.com'] });
    ws.ontvang({ t: 'ontgrendeling', grant: gZonder, sig: teken(gZonder) });
    await rustig(10);
    const tel2 = env.scripts.filter((s) => s.tabId === 11).length;
    const snap3 = await opdracht('browser.snapshot');
    const lijst3 = await opdracht('browser.tabs');
    check('recht aan maar claude.ai niet aangevinkt bij het openen van de toegang → niet gelezen en niet in de lijst',
      snap3?.ok === true && !snap3.data.aiSite && env.scripts.filter((s) => s.tabId === 11).length === tel2 && !lijst3.data.tabs.some((t: any) => t.id === 11), JSON.stringify({ snap3, lijst3 }));
  } finally {
    g.chrome = oud.chrome; g.fetch = oud.fetch; g.WebSocket = oud.WebSocket; g.indexedDB = oud.indexedDB;
  }
  return einde();
}
