// Extensie 0.5 → 0.6: bridge.js (ISOLATED) en collector.js (MAIN) samen in een minimale nep-DOM (geen jsdom in de repo).
// 0.6: de pagina draagt <meta name="mjn-profiel">; elke opdracht van het achtergrondproces draagt `ruimte`; de buffer hoort bij één slot;
// een profielwissel (meta wijzigt, zonder herladen) leegt de buffer, zet de verzamelaar uit en laat opdrachten van het oude slot weigeren.
// Bewijst: vergrendeld = niets gebufferd en de verzamelaar stuurt niets uit; verzamelmodus aan = wel; uit = buffer leeg en stil;
// audit en momentopname lezen nooit veldwaarden (getter op het wachtwoordveld telt elke lezing) en geven geen querystrings;
// de status naar de pagina bevat ALLEEN de publieke velden (ook als het achtergrondproces geheimen meestuurt);
// berichten van een andere oorsprong of een andere bron worden genegeerd. Geen netwerk, geen database.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { checker } from './hulp/nep-google';

const EXT = join(process.cwd(), 'extension');
const GEHEIM = 'Wachtwoord-GEHEIM-9f3a';
const GEHEIMQ = 'GEHEIMQ7731';
// 0.6.1: 'diagnostiek' (stand van het debuggerrecht, vier velden) hoort er nu bij — zie extensie-debugger-markering-20261019.test.ts.
// 0.9.0 (EXT090-001): 'lokaleAi' (alleen de keuzes voor de ingebouwde AI van Chrome: aan + API-namen) hoort er ook bij.
const PUBLIEK = ['versie', 'profielTab', 'account', 'prive', 'technisch', 'lokaalVerbonden', 'diagnostiek', 'gekoppeld', 'verbonden', 'staat', 'exp', 'caps', 'domeinen', 'aiVerbonden', 'agentId', 'lokaleAi'];
const SLOT = ['gekoppeld', 'verbonden', 'staat', 'exp', 'caps', 'domeinen', 'aiVerbonden', 'agentId'];
const DIAG = ['stand', 'optIn', 'actief', 'aanvraagbaar'];
const T = 'technisch';
const rust = (ms = 15) => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------- nep-DOM
/** Ondersteunt alleen wat bridge.js gebruikt: tag, '*', komma's, [attr], [attr=waarde], [attr="waarde"], [attr^=waarde]. */
function past(el: any, selector: string): boolean {
  return selector.split(',').some((deel) => {
    const m = /^([a-zA-Z0-9*]*)((?:\[[^\]]+\])*)$/.exec(deel.trim());
    if (!m) throw new Error(`nep-DOM: selector niet ondersteund: ${deel}`);
    if (m[1] && m[1] !== '*' && el.tagName !== m[1].toUpperCase()) return false;
    for (const a of m[2].match(/\[[^\]]+\]/g) ?? []) {
      const am = /^\[([a-zA-Z-]+)(?:(\^?=)"?([^"]*)"?)?\]$/.exec(a);
      if (!am) throw new Error(`nep-DOM: attribuutselector niet ondersteund: ${a}`);
      const v = el.getAttribute(am[1]);
      if (v === null) return false;
      if (am[2] === '=' && v !== am[3]) return false;
      if (am[2] === '^=' && !v.startsWith(am[3])) return false;
    }
    return true;
  });
}
class El extends EventTarget {
  tagName: string; attrs = new Map<string, string>(); children: El[] = []; parentElement: El | null = null; tekst = '';
  constructor(tag: string, attrs: Record<string, string> = {}, kinderen: Array<El | string> = []) {
    super();
    this.tagName = tag.toUpperCase();
    for (const [k, v] of Object.entries(attrs)) this.attrs.set(k, v);
    for (const k of kinderen) { if (typeof k === 'string') this.tekst += k; else { k.parentElement = this; this.children.push(k); } }
  }
  getAttribute(n: string) { return this.attrs.has(n) ? this.attrs.get(n)! : null; }
  hasAttribute(n: string) { return this.attrs.has(n); }
  getAttributeNames() { return [...this.attrs.keys()]; }
  get type() { return (this.getAttribute('type') || (this.tagName === 'INPUT' ? 'text' : '')).toLowerCase(); }
  get textContent(): string { return this.tekst + this.children.map((c) => c.textContent).join(''); }
  get innerText(): string { return ['INPUT', 'TEXTAREA', 'SELECT', 'SCRIPT', 'STYLE'].includes(this.tagName) ? '' : this.tekst + this.children.map((c) => c.innerText).join(' '); }
  get labels() { return this.tagName === 'INPUT' || this.tagName === 'TEXTAREA' || this.tagName === 'SELECT' ? [] : undefined; }
  get options() { return this.children.filter((c) => c.tagName === 'OPTION').map((o) => ({ label: o.textContent, textContent: o.textContent, value: o.getAttribute('value') ?? o.textContent })); }
  afstammelingen(): El[] { return this.children.flatMap((c) => [c, ...c.afstammelingen()]); }
  querySelectorAll(s: string) { return this.afstammelingen().filter((e) => past(e, s)); }
  querySelector(s: string) { return this.querySelectorAll(s)[0] ?? null; }
  closest(s: string) { let e: El | null = this; while (e) { if (past(e, s)) return e; e = e.parentElement; } return null; }
  getBoundingClientRect() { return { width: 10, height: 10 }; }
  scrollIntoView() { /* niets */ }
  click() { /* niets */ }
  focus() { /* niets */ }
}
const h = (tag: string, attrs: Record<string, string> = {}, ...kinderen: Array<El | string>) => new El(tag, attrs, kinderen);

class NepDocument extends EventTarget {
  documentElement: El; head: El; body: El; title = 'Beheer'; baseURI: string; activeElement: El | null = null;
  constructor(head: El, body: El, baseURI: string) { super(); this.head = head; this.body = body; this.documentElement = h('html', {}, head, body); this.baseURI = baseURI; }
  querySelectorAll(s: string) { return [this.documentElement, ...this.documentElement.afstammelingen()].filter((e) => past(e, s)); }
  querySelector(s: string) { return this.querySelectorAll(s)[0] ?? null; }
  getElementById(id: string) { return this.querySelectorAll('*').find((e) => e.getAttribute('id') === id) ?? null; }
}

export async function main(): Promise<number> {
  const { check, einde } = checker('extensie-verzamelaar');

  // ---- de pagina: beheerpagina met formulieren, externe scripts, iframes en geheime waarden op allerlei plekken ----
  const location = { origin: 'https://admin.tarasevych.com', hostname: 'admin.tarasevych.com', protocol: 'https:', pathname: '/beheer',
    search: `?tab=x&token=${GEHEIMQ}`, href: `https://admin.tarasevych.com/beheer?tab=x&token=${GEHEIMQ}` };
  let waardeGelezen = 0;
  const wachtwoord = h('input', { type: 'password', name: 'pw', placeholder: 'Wachtwoord', value: GEHEIM, 'data-x': GEHEIM });
  Object.defineProperty(wachtwoord, 'value', { get() { waardeGelezen += 1; return GEHEIM; }, set() { waardeGelezen += 1; } });
  const kaart = h('input', { type: 'text', autocomplete: 'cc-number', placeholder: 'Kaartnummer' });
  Object.defineProperty(kaart, 'value', { get() { waardeGelezen += 1; return '4111111111111111'; } });
  const gewoon = h('input', { type: 'text', placeholder: 'Naam', value: GEHEIM });
  Object.defineProperty(gewoon, 'value', { get() { waardeGelezen += 1; return GEHEIM; } });
  const vervalMaand = h('select', { autocomplete: 'cc-exp-month', 'aria-label': 'Vervalmaand' }, h('option', { value: '01' }, '01'), h('option', { value: '02' }, '02'));
  const extraScripts = Array.from({ length: 80 }, (_, i) => h('script', { src: `https://cdn${i}.example.org/x.js?k=${GEHEIMQ}` }));
  const profielMeta = h('meta', { name: 'mjn-profiel', content: 'technisch' });
  const head = h('head', {},
    h('meta', { name: 'mjn-account', content: 'u-1:sessie' }),
    profielMeta,
    h('script', { src: `https://cdn.example.org/lib.js?k=${GEHEIMQ}` }),
    h('script', { src: '/eigen.js', integrity: 'sha384-x' }),
    h('script', {}, `var t='${GEHEIM}';`),
    h('script', { type: 'application/json' }, `{"k":"${GEHEIM}"}`),
    h('link', { rel: 'stylesheet', href: `https://fonts.example.net/a.css?x=${GEHEIMQ}` }),
    ...extraScripts);
  const body = h('body', {},
    h('h1', {}, 'Beheer'),
    h('form', { action: `http://evil.example.com/steel?token=${GEHEIMQ}`, method: 'get', onsubmit: `steel('${GEHEIM}')` }, gewoon, wachtwoord, h('input', { type: 'hidden', name: 'csrf', value: GEHEIM }), h('button', { type: 'submit' }, 'Inloggen')),
    h('form', { method: 'post' }, kaart, vervalMaand),
    h('a', { href: `https://elders.example.com/p?ref=${GEHEIMQ}`, target: '_blank' }, 'Elders'),
    h('a', { href: 'https://hub.tarasevych.com/', target: '_blank' }, 'Hub'),
    h('div', { onclick: `alert('${GEHEIM}')` }, h('span', { onmouseover: 'x()' }, 'Tekst')),
    h('iframe', { src: `https://widget.example.com/w?sid=${GEHEIMQ}` }),
    h('iframe', { src: 'https://mcp.tarasevych.com/x', sandbox: '' }),
    h('img', { src: `http://oud.example.org/a.png?u=${GEHEIMQ}` }),
    h('textarea', { autocomplete: 'one-time-code', placeholder: 'Code' }, GEHEIM));
  const document = new NepDocument(head, body, location.href);

  // window: postMessage legt vast en levert asynchroon af als 'message' (bron = window, oorsprong = pagina)
  const window: any = new EventTarget();
  const posts: any[] = [];
  const lever = (data: any, origin: string, source: any) => {
    const ev: any = new Event('message');
    Object.defineProperties(ev, { data: { value: data }, origin: { value: origin }, source: { value: source } });
    window.dispatchEvent(ev);
  };
  window.postMessage = (data: any, origin: string) => { posts.push(structuredClone(data)); setTimeout(() => lever(data, origin === '*' ? location.origin : origin, window), 0); };
  window.fetch = async () => ({ status: 200 });
  window.innerHeight = 800; window.scrollY = 0;
  window.addEventListener('message', (e: any) => { if (e.data?.mrAi === 'list') window.postMessage({ mrAiReply: e.data.mrAiId, actions: [] }, location.origin); });

  // prestaties: navigatie + 30 resources (met querystrings) + één over http
  const resources = Array.from({ length: 30 }, (_, i) => ({ name: `https://cdn.example.org/r${i}.js?k=${GEHEIMQ}`, initiatorType: 'script', transferSize: (i + 1) * 1000, duration: 10 + i }));
  resources.push({ name: `http://oud.example.org/a.png?u=${GEHEIMQ}`, initiatorType: 'img', transferSize: 500, duration: 5 });
  const performance = {
    now: () => Date.now(),
    getEntriesByType: (t: string) => (t === 'navigation' ? [{ responseStart: 120.4, domContentLoadedEventEnd: 800.2, loadEventEnd: 1500.7 }] : t === 'resource' ? resources : []),
  };
  const waarnemers: any[] = [];
  class NepPerformanceObserver {
    cb: any; type = ''; los = false;
    constructor(cb: any) { this.cb = cb; }
    observe(o: any) { this.type = o.type; waarnemers.push(this); }
    disconnect() { this.los = true; }
  }
  const voer = (type: string, entries: any[]) => { for (const w of waarnemers) if (w.type === type && !w.los) w.cb({ getEntries: () => entries }); };
  const consoleUit: any[] = [];
  const nepConsole: any = Object.fromEntries(['error', 'warn', 'info', 'log', 'debug'].map((l) => [l, (...a: any[]) => { consoleUit.push([l, ...a]); }]));
  class NepXHR extends EventTarget {
    status = 0;
    open() { /* niets */ }
    send() { setTimeout(() => { this.status = 500; this.dispatchEvent(new Event('loadend')); }, 0); }
  }

  // DOM-gebeurtenissen tussen de werelden tellen
  const diagEvents: string[] = []; const modusEvents: string[] = [];
  document.addEventListener('mr-diag', (e: any) => diagEvents.push(String(e.detail)));
  document.addEventListener('mr-diag-modus', (e: any) => modusEvents.push(String(e.detail)));

  // ---- collector.js (MAIN, document_start) ----
  const collectorSrc = readFileSync(join(EXT, 'collector.js'), 'utf8');
  new Function('window', 'document', 'console', 'XMLHttpRequest', 'PerformanceObserver', 'performance', 'location', 'addEventListener', 'CustomEvent', collectorSrc)(
    window, document, nepConsole, NepXHR, NepPerformanceObserver, performance, location, window.addEventListener.bind(window), CustomEvent);

  // ---- chrome-nep: het achtergrondproces ----
  const naarBg: any[] = [];
  const luisteraars: any[] = [];
  const techSlot = { ruimte: 'technisch', gekoppeld: true, verbonden: true, staat: 'ontgrendeld', ontgrendeling: { gid: 'gid-GEHEIM-1', exp: 1_900_000_000_000, caps: ['browser.read', 'browser.alles'], domeinen: ['admin.tarasevych.com', 'evil.com/<x>'], lokaal: false },
    ai: { verbonden: true, agenten: [{ naam: 'Claude', laatst: 1 }] }, fout: 'interne fout met pad', agentId: 'agent-1', naam: 'Mijn pc', commandKey: 'SLEUTEL-GEHEIM', agentToken: 'TOKEN-GEHEIM' };
  const extStatus = { versie: '0.6.0', profielTab: 'technisch', accountEmail: 'geheim@mail', techRecht: true, account: 'ok',
    sloten: { prive: { ruimte: 'prive', gekoppeld: false, verbonden: false, staat: 'niet-gekoppeld', ontgrendeling: null, ai: { verbonden: false, agenten: [] }, agentId: '' }, technisch: techSlot },
    lokaal: { toegestaan: false, verbonden: false, ruimte: null }, diagOptIn: true, debugging: false, gekoppeld: true, verbonden: true };
  const chrome: any = {
    runtime: {
      id: 'ofpffonakgjioahgfejmiblfmbkobmmi',
      getURL: (p: string) => pathToFileURL(join(EXT, p)).href,
      getManifest: () => ({ version: '0.6.0' }),
      sendMessage: async (m: any) => { naarBg.push(m); if (m.op === 'diag-modus?') return { aan: false }; if (m.op === 'status') return structuredClone(extStatus); return { ok: true }; },
      onMessage: { addListener: (f: any) => luisteraars.push(f) },
    },
  };
  const naarBrug = (m: any, sender: any = { id: chrome.runtime.id }) => new Promise<any>((res) => { const r = luisteraars[0](m, sender, res); if (r !== true) res(undefined); });
  const vanPagina = (data: any, origin = location.origin, source: any = window) => lever(data, origin, source);

  // ---- bridge.js (ISOLATED, document_idle) ----
  const bridgeSrc = readFileSync(join(EXT, 'bridge.js'), 'utf8');
  const waarnemersMO: Array<() => void> = [];
  class NepMutationObserver { cb: () => void; constructor(cb: () => void) { this.cb = cb; waarnemersMO.push(cb); } observe() { /* niets */ } disconnect() { /* niets */ } }
  class NepKeyboardEvent extends Event { constructor(t: string, i: any) { super(t, i); } }
  const intervallen: any[] = [];
  new Function('chrome', 'window', 'document', 'location', 'MutationObserver', 'HTMLElement', 'getComputedStyle', 'localStorage', 'setInterval', 'addEventListener', 'performance', 'KeyboardEvent', 'MouseEvent', 'CustomEvent', bridgeSrc)(
    chrome, window, document, location, NepMutationObserver, El, () => ({ visibility: 'visible' }), { getItem: () => null },
    (f: any, ms: number) => { const t = setInterval(f, ms); (t as any).unref?.(); intervallen.push(t); return t; },
    window.addEventListener.bind(window), performance, NepKeyboardEvent, NepKeyboardEvent, CustomEvent);
  for (let i = 0; i < 100 && !luisteraars.length; i += 1) await rust(10);
  await rust(30);
  check('brug geladen: luistert naar het achtergrondproces en vroeg bij start de verzamelmodus op (diag-modus?)', luisteraars.length === 1 && naarBg.some((m) => m.op === 'diag-modus?'), JSON.stringify(naarBg.map((m) => m.op)));
  const acc0 = naarBg.find((m) => m.op === 'account');
  check("brug meldt bij laden {op:'account', claim, profiel:'technisch'} (uit <meta name=\"mjn-profiel\">)", acc0?.profiel === 'technisch' && acc0.claim?.userId === 'u-1', JSON.stringify(acc0));
  const zonderSlot = await naarBrug({ op: 'snapshot' });
  const verkeerd = await naarBrug({ op: 'snapshot', ruimte: 'prive' });
  check('opdracht zonder slot, of van het prive-slot op een technische pagina → EXTENSIE_PROFIEL (niets gelezen)', zonderSlot.ok === false && /^EXTENSIE_PROFIEL/.test(zonderSlot.error) && verkeerd.ok === false && /^EXTENSIE_PROFIEL/.test(verkeerd.error));
  const accV = await naarBrug({ op: 'account?' });
  check("account? geeft de ruwe claim + het profiel", accV.ok && accV.data.claim === 'u-1:sessie' && accV.data.profiel === 'technisch');

  // ---- 1. vergrendeld: niets ----
  check('vergrendeld: brug zette de verzamelaar expliciet uit, geen PerformanceObserver gestart', modusEvents.at(-1) === 'uit' && !modusEvents.includes('aan') && waarnemers.length === 0, modusEvents.join(','));
  nepConsole.error('fout-tijdens-vergrendeld');
  await window.fetch(`https://mcp.tarasevych.com/api/x?token=${GEHEIMQ}`);
  const xhr0: any = new NepXHR(); xhr0.open('GET', '/api/y'); xhr0.send(); await rust();
  check('vergrendeld: console/fetch/XHR werken voor de pagina gewoon door, maar de verzamelaar stuurt NIETS uit', diagEvents.length === 0 && consoleUit.some((c) => c[1] === 'fout-tijdens-vergrendeld'), String(diagEvents.length));
  document.dispatchEvent(new CustomEvent('mr-diag', { detail: JSON.stringify({ kind: 'console', level: 'error', text: 'vervalst door de pagina' }) }));
  document.dispatchEvent(new CustomEvent('mr-diag-modus', { detail: 'aan' })); // de pagina zet de verzamelaar zelf aan …
  nepConsole.warn('pagina-forceert');
  document.dispatchEvent(new CustomEvent('mr-diag-modus', { detail: 'uit' }));
  const c0 = await naarBrug({ op: 'console', ruimte: T }); const n0 = await naarBrug({ op: 'network', ruimte: T });
  check('vergrendeld: ook vervalste of door de pagina afgedwongen regels komen niet in de buffer van de brug', c0.ok && c0.data.messages.length === 0 && n0.data.requests.length === 0 && c0.data.diagnostics === false, JSON.stringify(c0.data));
  diagEvents.length = 0;

  // ---- 2. verzamelmodus aan ----
  const aanAntwoord = await naarBrug({ op: 'diag-modus', aan: true, ruimte: T });
  check('aan: brug bevestigt en stuurt mr-diag-modus "aan" naar de verzamelaar; PerformanceObserver voor LCP/CLS/longtask (buffered)',
    aanAntwoord.ok && aanAntwoord.data.aan === true && modusEvents.at(-1) === 'aan' && ['largest-contentful-paint', 'layout-shift', 'longtask'].every((t) => waarnemers.some((w) => w.type === t)), waarnemers.map((w) => w.type).join(','));
  nepConsole.error('Iets ging mis', { message: 'detail' });
  await window.fetch(`https://mcp.tarasevych.com/api/agents?token=${GEHEIMQ}`, { method: 'post' });
  const xhr1: any = new NepXHR(); xhr1.open('GET', `/api/z?sid=${GEHEIMQ}`); xhr1.send(); await rust();
  const c1 = await naarBrug({ op: 'console', ruimte: T }); const n1 = await naarBrug({ op: 'network', ruimte: T });
  check('aan: console-regel gebufferd met bron "pagina"', c1.data.messages.length === 1 && c1.data.messages[0].text === 'Iets ging mis detail' && c1.data.bron === 'pagina' && c1.data.messages[0].bron === 'pagina', JSON.stringify(c1.data));
  check('aan: verzoeken (fetch + XHR) gebufferd zonder querystring, bron "pagina"', n1.data.requests.length === 2 && n1.data.requests.every((r: any) => r.bron === 'pagina' && !String(r.url).includes('?'))
    && n1.data.requests[0].method === 'POST' && n1.data.requests[0].url === 'https://mcp.tarasevych.com/api/agents' && n1.data.requests[1].status === 500 && !JSON.stringify(n1.data).includes(GEHEIMQ), JSON.stringify(n1.data));
  const f1 = await naarBrug({ op: 'network', failed_only: true, ruimte: T });
  check('aan: failed_only geeft alleen het mislukte verzoek', f1.data.requests.length === 1 && f1.data.requests[0].status === 500);
  // prestaties via de verzamelaar
  voer('largest-contentful-paint', [{ startTime: 900 }, { startTime: 1234.4 }]);
  voer('layout-shift', [{ value: 0.05, startTime: 100, hadRecentInput: false }, { value: 0.02, startTime: 300, hadRecentInput: false }, { value: 0.5, startTime: 400, hadRecentInput: true }]);
  voer('longtask', [{ duration: 80 }, { duration: 120.4 }]);
  const a1 = await naarBrug({ op: 'audit', soort: 'prestaties', ruimte: T });
  const p1 = a1.data.prestaties;
  check('audit prestaties: LCP/CLS/longtasks van de verzamelaar (alleen getallen), navigatie-tijden, invoer-verschuiving telt niet',
    a1.ok && p1.lcp === 1234 && p1.cls === 0.07 && p1.longTasks.aantal === 2 && p1.longTasks.totaalMs === 200 && p1.navigatie.ttfb === 120 && p1.navigatie.domContentLoaded === 800 && p1.navigatie.load === 1501
    && !a1.data.beveiliging && !a1.data.dom, JSON.stringify(p1));
  check('audit prestaties: resources geteld, grootste begrensd op 10 en aflopend, adressen zonder querystring',
    p1.resources.aantal === 31 && p1.resources.grootste.length === 10 && p1.resources.grootste[0].bytes === 30000 && p1.resources.grootste[0].url === 'https://cdn.example.org/r29.js'
    && p1.resources.grootste.every((r: any) => !r.url.includes('?')) && p1.resources.bytes === 465000 + 500, JSON.stringify(p1.resources).slice(0, 300));

  // ---- 3. audit volledig: geen waarden, geen querystrings, begrensd ----
  waardeGelezen = 0;
  const a2 = await naarBrug({ op: 'audit', ruimte: T });
  const tekst = JSON.stringify(a2.data);
  const codes = new Set((a2.data.beveiliging?.bevindingen ?? []).map((b: any) => b.code));
  check('audit (alles): geen enkele veldwaarde, attribuutinhoud of geheime tekst in de uitvoer; .value van geen enkel veld gelezen',
    a2.ok && !tekst.includes(GEHEIM) && !tekst.includes('4111') && !tekst.includes('steel(') && !tekst.includes('alert') && waardeGelezen === 0, `gelezen=${waardeGelezen}`);
  check('audit (alles): geen querystrings (ook niet van de pagina zelf, formulieracties, scripts, links of resources)', !tekst.includes(GEHEIMQ) && !tekst.includes('?') && a2.data.url === 'https://admin.tarasevych.com/beheer');
  check('audit beveiliging: verwachte bevindingen gevonden',
    ['FORM_HTTP_ACTIE', 'FORM_ANDERE_HOST', 'FORM_GET_WACHTWOORD', 'SCRIPT_ZONDER_SRI_EXTERN', 'STYLESHEET_ZONDER_SRI_EXTERN', 'TARGET_BLANK_ZONDER_NOOPENER', 'INLINE_HANDLERS', 'IFRAME_ZONDER_SANDBOX_EXTERN', 'MIXED_CONTENT', 'WACHTWOORD_AUTOCOMPLETE', 'GEEN_CSP_META', 'INLINE_SCRIPTS'].every((c) => codes.has(c)),
    [...codes].join(','));
  const bev = a2.data.beveiliging.bevindingen;
  const handlers = bev.find((b: any) => b.code === 'INLINE_HANDLERS');
  const sri = bev.find((b: any) => b.code === 'SCRIPT_ZONDER_SRI_EXTERN');
  check('audit beveiliging: ≤ 50 bevindingen, één per code+ernst (81 externe scripts = één bevinding «5 hosts +76 · 81×»), hoog eerst; eigen site met target=_blank geen bevinding; inline handlers als namen (3 elementen)',
    bev.length <= 50 && bev[0].ernst === 'hoog' && bev.every((b: any) => ['info', 'laag', 'middel', 'hoog'].includes(b.ernst) && typeof b.detail === 'string' && b.detail.length <= 200)
    && bev.filter((b: any) => b.code === 'SCRIPT_ZONDER_SRI_EXTERN').length === 1 && /\+76 · 81×$/.test(sri.detail)
    && !bev.some((b: any) => b.code === 'TARGET_BLANK_ZONDER_NOOPENER' && b.detail.includes('tarasevych')) && /onsubmit/.test(handlers.detail) && /3×$/.test(handlers.detail), JSON.stringify([handlers, sri]));
  const dom = a2.data.dom;
  check('audit dom: formulieren zonder waarden (host, methode, aantal zichtbare velden, wachtwoord ja/nee), scripts inline + externe hosts (≤ 20), iframes hosts',
    dom.formulieren.length === 2 && JSON.stringify(dom.formulieren[0]) === JSON.stringify({ actieHost: 'evil.example.com', methode: 'get', velden: 2, wachtwoord: true })
    && JSON.stringify(dom.formulieren[1]) === JSON.stringify({ actieHost: 'admin.tarasevych.com', methode: 'post', velden: 2, wachtwoord: true })
    && dom.scripts.inline === 1 && dom.scripts.extern.length === 20 && dom.scripts.extern[0] === 'cdn.example.org'
    && JSON.stringify(dom.iframes) === JSON.stringify(['widget.example.com', 'mcp.tarasevych.com']) && dom.elementen > 100 && dom.diepte >= 4, JSON.stringify(dom).slice(0, 400));
  const a3 = await naarBrug({ op: 'audit', soort: 'dom', ruimte: T }); const a4 = await naarBrug({ op: 'audit', soort: 'onzin', ruimte: T });
  check('audit soort: alleen het gevraagde deel; onbekende soort = alles', a3.data.dom && !a3.data.prestaties && !a3.data.beveiliging && a4.data.soort === 'alles' && a4.data.prestaties && a4.data.beveiliging && a4.data.dom);

  // ---- momentopname en handelingen: wachtwoord-/betaalvelden nooit gelezen of ingevuld ----
  waardeGelezen = 0;
  const s1 = await naarBrug({ op: 'snapshot', ruimte: T });
  const st = JSON.stringify(s1.data);
  check('snapshot: werkt, gevoelige velden gemarkeerd, geen veldwaarden of standaardtekst van een eenmalige-codeveld; .value niet gelezen',
    s1.ok && s1.data.controls.some((c: any) => c.name === 'Wachtwoord' && c.sensitive) && s1.data.controls.some((c: any) => c.name === 'Code' && c.sensitive) && !st.includes(GEHEIM) && !st.includes(GEHEIMQ) && waardeGelezen === 0,
    `gelezen=${waardeGelezen} ${st.slice(0, 200)}`);
  const t1 = await naarBrug({ op: 'type', name: 'Wachtwoord', text: 'x', ruimte: T }); const t2 = await naarBrug({ op: 'type', name: 'Kaartnummer', text: '1', ruimte: T });
  const k1 = await naarBrug({ op: 'click', name: 'Wachtwoord', ruimte: T }); const v1 = await naarBrug({ op: 'select', name: 'Vervalmaand', option: '02', ruimte: T });
  const ff = await naarBrug({ op: 'fill_form', elements: [{ name: 'Wachtwoord', value: 'x' }], ruimte: T });
  check('handelingen: typen, klikken, kiezen en formulier invullen op wachtwoord-/betaalvelden geweigerd, zonder de waarde te lezen',
    !t1.ok && /password or payment/.test(t1.error) && !t2.ok && !k1.ok && !v1.ok && /password or payment/.test(v1.error) && ff.data.filled === 0 && waardeGelezen === 0, JSON.stringify([t1, v1]));

  // ---- 4. verzamelmodus uit ----
  const voorUit = diagEvents.length;
  await naarBrug({ op: 'diag-modus', aan: false, ruimte: null });
  const c2 = await naarBrug({ op: 'console', ruimte: T }); const n2 = await naarBrug({ op: 'network', ruimte: T });
  nepConsole.error('na-uit'); await window.fetch('https://mcp.tarasevych.com/api/na-uit'); await rust();
  const a5 = await naarBrug({ op: 'audit', soort: 'prestaties', ruimte: T });
  check('uit: buffer leeg, verzamelaar kreeg "uit", stuurt niets meer, PerformanceObservers los en prestatiecijfers weg',
    c2.data.messages.length === 0 && n2.data.requests.length === 0 && c2.data.diagnostics === false && modusEvents.at(-1) === 'uit' && diagEvents.length === voorUit
    && waarnemers.every((w) => w.los) && a5.data.prestaties.lcp === null && a5.data.prestaties.cls === null, JSON.stringify(a5.data.prestaties));
  await naarBrug({ op: 'diag-modus', aan: true, ruimte: T }); nepConsole.error('weer-aan');
  const wis = await naarBrug({ op: 'diag-clear' }); const c3 = await naarBrug({ op: 'console', ruimte: T });
  check('diag-clear blijft werken', wis.ok && wis.data.cleared && c3.data.messages.length === 0);
  // ---- 0.6: profielwissel live (tech-modus verlaten zonder herladen)
  nepConsole.error('nog-technisch'); await rust();
  const cT = await naarBrug({ op: 'console', ruimte: T });
  const cP = await naarBrug({ op: 'console', ruimte: 'prive' });
  check('buffer hoort bij één slot: technisch ziet zijn regel, een verzoek met ruimte prive krijgt niets (profiel technisch → geweigerd)', cT.data.messages.some((m: any) => m.text === 'nog-technisch') && cP.ok === false);
  const modusVoor = modusEvents.length;
  profielMeta.attrs.set('content', 'gebruiker');
  for (const cb of waarnemersMO) cb();
  await rust();
  const acc1 = naarBg.filter((m) => m.op === 'account').at(-1);
  check("profielwissel live: brug meldt {op:'account', profiel:'gebruiker'}, zet de verzamelaar meteen uit en leegt de buffer (nog vóór het achtergrondproces)",
    acc1?.profiel === 'gebruiker' && modusEvents.slice(modusVoor).includes('uit'), JSON.stringify(acc1));
  const tNa = await naarBrug({ op: 'snapshot', ruimte: T });
  const pNa = await naarBrug({ op: 'console', ruimte: 'prive' });
  check('na de wissel: technische opdracht → EXTENSIE_PROFIEL; prive mag, maar krijgt niets van wat onder technisch verzameld werd', tNa.ok === false && /^EXTENSIE_PROFIEL/.test(tNa.error) && pNa.ok === true && pNa.data.messages.length === 0, JSON.stringify([tNa, pNa]));
  const tModus = await naarBrug({ op: 'diag-modus', aan: true, ruimte: T });
  check('diag-modus voor technisch op een gebruikerspagina → de brug verzamelt niet (veilig, ook als het achtergrondproces zich vergist)', tModus.data.aan === false && tModus.data.ruimte === null);
  const pModus = await naarBrug({ op: 'diag-modus', aan: true, ruimte: 'prive' });
  nepConsole.error('nu-prive'); await rust();
  const pIn = await naarBrug({ op: 'console', ruimte: 'prive' });
  check('diag-modus prive op de gebruikerspagina → verzamelt voor prive (alleen nieuwe regels)', pModus.data.ruimte === 'prive' && pIn.data.messages.length === 1 && pIn.data.messages[0].text === 'nu-prive' && !JSON.stringify(pIn.data).includes('nog-technisch'));
  profielMeta.attrs.set('content', 'technisch');
  for (const cb of waarnemersMO) cb();
  await rust();
  const tTerug = await naarBrug({ op: 'console', ruimte: T });
  check('terug naar technisch: prive-buffer weg, technisch begint leeg', tTerug.ok === true && tTerug.data.messages.length === 0 && (await naarBrug({ op: 'console', ruimte: 'prive' })).ok === false);
  await naarBrug({ op: 'diag-modus', aan: true, ruimte: T });
  const vreemd = await naarBrug({ op: 'diag-modus', aan: false, ruimte: null }, { id: 'andere-extensie' });
  const c4 = await naarBrug({ op: 'self_test' });
  check('berichten van een andere extensie-id worden genegeerd (modus blijft aan)', vreemd === undefined && c4.data.diagnostics === true, JSON.stringify(c4));
  await naarBrug({ op: 'diag-modus', aan: false, ruimte: null });

  // ---- 5. status naar de pagina: alleen whitelist ----
  const statusPosts = () => posts.filter((p) => p.mrExt && p.type === 'status');
  const alleenPubliek = (p: any) => JSON.stringify(Object.keys(p).sort()) === JSON.stringify(['mrExt', 'type', ...PUBLIEK].sort())
    && JSON.stringify(Object.keys(p.prive || {}).sort()) === JSON.stringify([...SLOT].sort()) && (p.technisch === null || JSON.stringify(Object.keys(p.technisch).sort()) === JSON.stringify([...SLOT].sort()))
    && JSON.stringify(Object.keys(p.diagnostiek || {}).sort()) === JSON.stringify([...DIAG].sort());
  const begin = statusPosts();
  check('bij laden: één status-bericht met precies de publieke velden (uit ExtStatus: exp/caps/domeinen uit de ontgrendeling, ai/lokaal plat)',
    begin.length === 1 && alleenPubliek(begin[0]) && begin[0].technisch.exp === 1_900_000_000_000 && JSON.stringify(begin[0].technisch.caps) === '["browser.read"]' && JSON.stringify(begin[0].technisch.domeinen) === '["admin.tarasevych.com"]'
    && begin[0].technisch.aiVerbonden === true && begin[0].lokaalVerbonden === false && begin[0].technisch.staat === 'ontgrendeld' && begin[0].technisch.agentId === 'agent-1' && begin[0].prive.staat === 'niet-gekoppeld'
    && begin[0].profielTab === 'technisch' && begin[0].staat === 'ontgrendeld' && begin[0].agentId === 'agent-1' && !JSON.stringify(begin[0]).includes('geheim@mail'), JSON.stringify(begin));
  await naarBrug({ op: 'status-push', status: { versie: '0.6.0', profielTab: 'gebruiker', account: 'ok', lokaalVerbonden: true, commandKey: 'SLEUTEL-GEHEIM', agentToken: 'TOKEN-GEHEIM', __proto__x: 1,
    prive: { gekoppeld: true, verbonden: true, staat: 'agent', exp: 123, caps: ['browser.read', 'browser.debug', 'rm -rf'], domeinen: ['mcp.tarasevych.com'], aiVerbonden: true, agentId: 'agent-1', gid: 'gid-GEHEIM-2', commandKey: 'SLEUTEL-GEHEIM', ontgrendelingSig: 'f'.repeat(64) },
    technisch: null } });
  await rust();
  const push = statusPosts().at(-1);
  const alleTekst = JSON.stringify(posts);
  check('status-push: precies de publieke velden; sleutels, tokens, gid, sig en onbekende velden worden niet doorgegeven; ongeldige caps eruit',
    statusPosts().length === 2 && alleenPubliek(push) && push.prive.staat === 'agent' && push.prive.exp === 123 && JSON.stringify(push.prive.caps) === '["browser.read","browser.debug"]' && push.technisch === null && push.staat === 'agent'
    && !alleTekst.includes('SLEUTEL') && !alleTekst.includes('TOKEN-GEHEIM') && !alleTekst.includes('gid-GEHEIM') && !alleTekst.includes('fffff') && !alleTekst.includes('interne fout') && !alleTekst.includes('Mijn pc'), JSON.stringify(push));
  await naarBrug({ op: 'status-push', status: { staat: 'iets-anders', exp: 'morgen', caps: 'browser.read', gekoppeld: 'ja', account: { userId: 'x' } } });
  await rust();
  const raar = statusPosts().at(-1);
  check('status-push met verkeerde typen: veilige standaarden (niet-gekoppeld, exp null, lege lijsten, account unknown)',
    alleenPubliek(raar) && raar.prive.staat === 'niet-gekoppeld' && raar.prive.exp === null && raar.prive.caps.length === 0 && raar.prive.gekoppeld === false && raar.technisch === null && raar.account === 'unknown' && raar.versie === '0.6.0' && raar.profielTab === null, JSON.stringify(raar));

  const n = statusPosts().length;
  vanPagina({ mrExtStatus: true }); await rust(40);
  check('pagina vraagt {mrExtStatus:true} (zelfde oorsprong, bron window) → antwoord type "status" met alleen publieke velden', statusPosts().length === n + 1 && alleenPubliek(statusPosts().at(-1)));
  vanPagina({ mrExtStatus: true }, 'https://evil.example.com'); vanPagina({ mrExtStatus: true }, 'https://hub.tarasevych.com'); vanPagina({ mrExtStatus: true }, location.origin, { ander: 'venster' });
  const hellosVoor = posts.filter((p) => p.type === 'hello').length;
  vanPagina({ mrExtPing: true }, 'https://evil.example.com');
  await rust(40);
  check('berichten van een andere oorsprong (ook ander eigen subdomein) of uit een ander venster worden genegeerd', statusPosts().length === n + 1 && posts.filter((p) => p.type === 'hello').length === hellosVoor);
  vanPagina({ mrExtPing: true }); await rust(40);
  const hello = posts.filter((p) => p.type === 'hello').at(-1);
  check('mrExtPing: hello met de oude velden (paired/connected/agentId/account/extensionId/version) plus precies de publieke velden, geen geheimen',
    posts.filter((p) => p.type === 'hello').length === hellosVoor + 1 && hello.paired === true && hello.connected === true && hello.extensionId === chrome.runtime.id && hello.version === '0.6.0'
    && PUBLIEK.every((k) => k in hello) && Object.keys(hello).every((k) => ['mrExt', 'type', 'paired', 'connected', 'extensionId', 'version', ...PUBLIEK].includes(k)) && !JSON.stringify(hello).includes('GEHEIM'), JSON.stringify(hello));

  // ---- 6. 0.9.0 (EXT090-001): ingebouwde AI van Chrome, levensteken en verweesde brug ----
  await naarBrug({ op: 'status-push', status: { versie: '0.9.0', lokaleAi: { aan: true, apis: ['prompt', 'translator', 'rm -rf', 'prompt'], tekst: 'GEHEIME-INVOER', uitvoer: 'GEHEIME-UITVOER' } } });
  await rust();
  const lai = statusPosts().at(-1);
  check('lokaleAi: alleen {aan, apis} met bekende API-namen (ontdubbeld); invoer/uitvoer gaan nooit naar de pagina',
    alleenPubliek(lai) && JSON.stringify(lai.lokaleAi) === '{"aan":true,"apis":["prompt","translator"]}' && !JSON.stringify(posts).includes('GEHEIME-'), JSON.stringify(lai.lokaleAi));
  const lev = await naarBrug({ op: 'brug?' });
  check("op 'brug?' (zorgVoorBrug): levensteken zonder gegevens", lev?.ok === true && JSON.stringify(Object.keys(lev.data)) === '["versie"]', JSON.stringify(lev));
  const echtId = chrome.runtime.id;
  (chrome.runtime as any).id = undefined; // extensie bijgewerkt/herladen: deze brug is nu verweesd
  const hellosWees = posts.filter((p) => p.type === 'hello').length;
  vanPagina({ mrExtPing: true }); vanPagina({ mrExtStatus: true }); await rust(40);
  check('verweesde brug (chrome.runtime.id weg) antwoordt de pagina niet meer — geen «niet gekoppeld» naast de nieuwe brug',
    posts.filter((p) => p.type === 'hello').length === hellosWees);
  (chrome.runtime as any).id = echtId;

  for (const t of intervallen) clearInterval(t);
  return einde();
}
