// Melding van de eigenaar, 18.10.2026: «на сторінці налаштувань розширення активація не працює» en «Відкрити налаштування на сайті»
// leidde stil naar ai.tarasevych.com/verbindingen. Oorzaak 1: options_ui.open_in_tab = true → de opties draaien in een TABBLAD en
// sender.tab is gezet; background.js (ownPage) eiste «!sender.tab» en weigerde set-diag en self-test (schakelaar sprong terug).
// Oorzaak 2: mcpIngang stuurde mcp.*/agents altijd door (ook #extension). Eerst het oude gedrag nagebootst, dan het nieuwe bewezen:
// de echte background.js draait hier met een nep-chrome.
import { cpSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { checker } from './hulp/nep-google';
import { mcpIngang } from '../../shared/ai-agent-bord';
import { isExtensiePagina } from '../../src/extensie-welkom-opslag';

const W = process.cwd();
const ID = 'abcdefghijklmnopabcdefghijklmnop';
const BASIS = `chrome-extension://${ID}/`;

type Luisteraar = (m: unknown, s: unknown, r: (x: unknown) => void) => unknown;
function nepChrome(opslag: Record<string, unknown>, verleend = new Set<string>()) {
  const luister = { intern: [] as Luisteraar[], extern: [] as Luisteraar[] };
  const ev = (lijst?: Luisteraar[]) => ({ addListener: (f: Luisteraar) => { lijst?.push(f); } });
  const leeg = (): any => new Proxy(function () { /* nep */ }, { get: (_t, k) => (k === 'then' ? undefined : leeg()), apply: () => Promise.resolve({}) });
  const local = {
    get: async (k: string | string[]) => { const ks = Array.isArray(k) ? k : [k]; return Object.fromEntries(ks.filter((x) => x in opslag).map((x) => [x, opslag[x]])); },
    set: async (o: Record<string, unknown>) => { Object.assign(opslag, o); },
    remove: async (k: string | string[]) => { for (const x of Array.isArray(k) ? k : [k]) delete opslag[x]; },
  };
  const chrome = {
    runtime: { id: ID, getURL: (p: string) => `${BASIS}${p}`, getManifest: () => JSON.parse(readFileSync(join(W, 'extension/manifest.json'), 'utf8')),
      onMessage: ev(luister.intern), onMessageExternal: ev(luister.extern), onInstalled: ev(), onStartup: ev(), openOptionsPage: async () => undefined },
    storage: { local, session: { get: async () => ({}), set: async () => undefined } },
    alarms: { create: () => undefined, onAlarm: ev() },
    tabs: { query: async () => [], sendMessage: async () => undefined, create: async () => undefined, onRemoved: ev(), onUpdated: ev() },
    debugger: leeg(), action: leeg(), sidePanel: leeg(), scripting: leeg(), windows: leeg(),
    // 0.5: debugger/nativeMessaging zijn optionele rechten (de opties vragen ze aan in de klikhandler, zie extensie-ui.test.ts).
    permissions: { contains: async (p: { permissions: string[] }) => p.permissions.every((x) => verleend.has(x)), request: async () => false, remove: async () => true, onAdded: ev(), onRemoved: ev() },
  };
  return { chrome: new Proxy(chrome as Record<string, unknown>, { get: (t, k) => (k in t ? t[k as string] : leeg()) }), luister };
}
const vraag = (f: Luisteraar, m: unknown, s: unknown) => new Promise<any>((klaar) => { f(m, s, klaar); setTimeout(() => klaar('GEEN_ANTWOORD'), 1500); });

export async function main(): Promise<number> {
  const { check, einde } = checker('extensie-opties');
  const opslag: Record<string, unknown> = {};
  const verleend = new Set<string>();
  const { chrome, luister } = nepChrome(opslag, verleend);
  const g = globalThis as Record<string, unknown>;
  const oud = { chrome: g.chrome, fetch: g.fetch, WebSocket: g.WebSocket };
  g.chrome = chrome;
  g.fetch = async () => { throw new Error('geen netwerk in de eenheidstest'); };
  g.WebSocket = class { constructor() { throw new Error('geen netwerk'); } };
  try {
    const map = mkdtempSync(join(tmpdir(), 'mr-ext-'));
    cpSync(join(W, 'extension'), map, { recursive: true });
    await import(pathToFileURL(join(map, 'background.js')).href);
    const intern = luister.intern[0];
    check('background.js geladen met nep-chrome (onMessage + onMessageExternal)', typeof intern === 'function' && luister.extern.length === 1);

    // Afzender zoals Chrome hem geeft voor options.html in een tabblad (options_ui.open_in_tab = true).
    const optiesTab = { id: ID, url: `${BASIS}options.html`, origin: BASIS.slice(0, -1), tab: { id: 7, url: `${BASIS}options.html` } };
    const contentScript = { id: ID, url: 'https://mcp.tarasevych.com/agents', origin: 'https://mcp.tarasevych.com', tab: { id: 8, url: 'https://mcp.tarasevych.com/agents' } };
    const oudeEis = (s: any) => s.id === ID && !s.tab && String(s.url || '').startsWith(BASIS);
    check('OUD (nagebootst): de eis «!sender.tab» weigerde de opties in een tabblad', oudeEis(optiesTab) === false);
    const manifest = JSON.parse(readFileSync(join(W, 'extension/manifest.json'), 'utf8'));
    check('oorzaak: de opties openen in een tabblad (open_in_tab)', manifest.options_ui?.open_in_tab === true);

    const zonder = await vraag(intern, { op: 'set-diag', on: true }, optiesTab);
    check('0.5: set-diag aan zonder optioneel debuggerrecht → geweigerd (PERMISSION), niets opgeslagen', zonder?.ok === false && opslag.diagOptIn !== true, JSON.stringify(zonder));
    verleend.add('debugger'); // zoals na chrome.permissions.request in de klikhandler van de opties
    const aan = await vraag(intern, { op: 'set-diag', on: true }, optiesTab);
    check('NIEUW: «Діагностику дозволено» aanzetten vanuit de opties werkt (ok, opgeslagen)', aan?.ok === true && opslag.diagOptIn === true, JSON.stringify(aan));
    const uit = await vraag(intern, { op: 'set-diag', on: false }, optiesTab);
    check('… en weer uit', uit?.ok === true && opslag.diagOptIn === false);
    const test = await vraag(intern, { op: 'self-test' }, optiesTab);
    check('NIEUW: «Тест» vanuit de opties geeft een lijst controles', Array.isArray(test?.checks) && test.checks.length > 3, JSON.stringify(test).slice(0, 120));
    const via = await vraag(intern, { op: 'set-diag', on: true }, contentScript);
    check('een content script op de site mag set-diag NIET (blijft uit)', via?.ok === false && opslag.diagOptIn === false);
    const vreemd = await vraag(intern, { op: 'set-diag', on: true }, { ...optiesTab, id: 'andere-extensie' });
    check('andere extensie-id → geweigerd', vreemd?.ok === false && opslag.diagOptIn === false);
    const nep = await vraag(intern, { op: 'set-diag', on: true }, { ...optiesTab, origin: 'https://mcp.tarasevych.com' });
    check('verkeerde origin bij een extensie-adres → geweigerd', nep?.ok === false);

    const opt = readFileSync(join(W, 'extension/options.js'), 'utf8'), html = readFileSync(join(W, 'extension/options.html'), 'utf8');
    check('opties: mislukken wordt gemeld (diag-status), niet stil teruggesprongen', opt.includes("getElementById('diag-status')") && html.includes('id="diag-status"'));
    check('opties: zelftest zonder lijst breekt de pagina niet', opt.includes('!Array.isArray(r.checks)'));
    check("opties: «Керування на сайті» → https://mcp.tarasevych.com/agents#toegang (0.6: één hub)", opt.includes("'https://mcp.tarasevych.com/agents#toegang'"));
    check('versie 0.8.1 (standaardpakket zonder debugger; was 0.8.0)', manifest.version === '0.8.1');
    const ui = readFileSync(join(W, 'extension/ui.js'), 'utf8');
    const pop = readFileSync(join(W, 'extension/popup.html'), 'utf8') + readFileSync(join(W, 'extension/popup.js'), 'utf8');
    check('0.6: koppelen als gebruiker «Додати доступ як користувач» → agents?koppel=prive#extensie; geen vaste technische knop meer in de pop-up',
      ui.includes('Додати доступ як користувач') && ui.includes('/agents?koppel=prive#extensie') && !pop.includes('Увімкнути технічний профіль і підключити') && !pop.includes('Увійти й підключити'));

    // ---------------------------------------------------------------- site: geen stille omleiding meer (0.6: mcp.*/agents is de hub «Підключення ШІ»)
    // De inhoud van de hub (tabbladen, kaarten) is van de site-agent en heeft eigen tests; hier alleen wat de extensie nodig heeft:
    // de adressen waar de extensie naartoe stuurt (agents?koppel=…#extensie, #toegang, #extension) blijven op mcp.*/agents.
    check('agents (met of zonder technisch profiel, ook als extensiepagina) → blijft op de pagina (geen omleiding)',
      mcpIngang('agents', false) === null && mcpIngang('agents', true) === null && mcpIngang('agents', false, false, true) === null && mcpIngang('agents', true, false, true) === null);
    check('isExtensiePagina: #extension, #apparaten/extensie, ?extension=welcome|update', isExtensiePagina({ hash: '#extension', search: '' }) && isExtensiePagina({ hash: '#apparaten/extensie', search: '' }) && isExtensiePagina({ hash: '', search: '?extension=welcome' }) && isExtensiePagina({ hash: '', search: '?extension=update' }));
  } catch (e) {
    check('onverwachte fout', false, String((e as Error)?.stack || e));
  } finally {
    g.chrome = oud.chrome; g.fetch = oud.fetch; g.WebSocket = oud.WebSocket;
  }
  return einde();
}
