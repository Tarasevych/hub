// Extensie 0.6 — pop-up, zijpaneel en opties met een kaart per slot (contract 0.6 §5).
// De echte HTML + JS draaien hier in een eigen nep-DOM (geen jsdom in de repo) met een nep-`chrome`:
//  - bovenaan account (e-mail) + profiel van het actieve tabblad; kaart «Як користувач» altijd, «Технічний профіль» ALLEEN als de
//    achtergrond sloten.technisch meegeeft (gekoppeld of techRecht) — zonder dat staat er nergens een technisch woord of knop;
//  - per kaart de juiste staat, pictogram, aftellen, chips; «Відкликати» stuurt {op:'vergrendel', reden, ruimte} voor DAT slot;
//  - tech-modus verlaten (status-push met profielTab gebruiker) → meteen gebruikersweergave; geen prive-slot → «Додати доступ як користувач»;
//  - status-push werkt live (alleen van de eigen achtergrond, niet van een tabblad); de tijdlijn (per slot) toont nooit parameters;
//  - de opties vragen `debugger`/`nativeMessaging` BINNEN de klikhandler, vóór set-diag/set-native; ontkoppelen per slot;
//  - statische scan: geen innerHTML & co., geen externe of inline scripts/stijlen, geen inline handlers.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import vm from 'node:vm';
import { checker } from './hulp/nep-google';
import { STAAT_TEKST, BROWSER_CAPS, type ExtensieStaat } from '../../shared/extensie-ontgrendeling';

const W = process.cwd();
const EXT = join(W, 'extension');
const ID = 'ofpffonakgjioahgfejmiblfmbkobmmi';
const lees = (f: string) => readFileSync(join(EXT, f), 'utf8');

// ---------------------------------------------------------------- mini-DOM
const VOID = new Set(['meta', 'link', 'input', 'br', 'img', 'hr', 'source', 'wbr', 'area', 'base', 'col', 'embed', 'track']);
const ontcijfer = (s: string) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, '\u00a0').replace(/&amp;/g, '&');

class Tekst {
  nodeType = 3; parentNode: any = null;
  constructor(public data: string) {}
  get textContent() { return this.data; }
}
class El {
  nodeType = 1; parentNode: any = null; childNodes: any[] = []; attrs = new Map<string, string>(); luister = new Map<string, Array<(e: any) => unknown>>();
  checked = false; value = ''; style: Record<string, string> = {};
  constructor(public tagName: string, public doc: any) {}
  get localName() { return this.tagName; }
  get id() { return this.attrs.get('id') ?? ''; }
  get className() { return this.attrs.get('class') ?? ''; }
  set className(v: string) { this.attrs.set('class', String(v)); }
  get classList() {
    const el = this; const lijst = () => el.className.split(/\s+/).filter(Boolean);
    const add = (...c: string[]) => { el.className = [...new Set([...lijst(), ...c])].join(' '); };
    const remove = (...c: string[]) => { el.className = lijst().filter((x) => !c.includes(x)).join(' '); };
    return { contains: (c: string) => lijst().includes(c), add, remove, toggle: (c: string, f?: boolean) => { const aan = f === undefined ? !lijst().includes(c) : !!f; if (aan) add(c); else remove(c); return aan; } };
  }
  get hidden() { return this.attrs.has('hidden'); }
  set hidden(v: boolean) { if (v) this.attrs.set('hidden', ''); else this.attrs.delete('hidden'); }
  get disabled() { return this.attrs.has('disabled'); }
  set disabled(v: boolean) { if (v) this.attrs.set('disabled', ''); else this.attrs.delete('disabled'); }
  get href() { return this.attrs.get('href') ?? ''; }
  get dataset() { return new Proxy({}, { get: (_t, k) => this.attrs.get(`data-${String(k).replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`)}`) }); }
  getAttribute(n: string) { return this.attrs.has(n) ? this.attrs.get(n)! : null; }
  setAttribute(n: string, v: unknown) { this.attrs.set(n, String(v)); }
  removeAttribute(n: string) { this.attrs.delete(n); }
  hasAttribute(n: string) { return this.attrs.has(n); }
  toggleAttribute(n: string, f?: boolean) { const aan = f === undefined ? !this.attrs.has(n) : !!f; if (aan) this.attrs.set(n, ''); else this.attrs.delete(n); return aan; }
  get textContent(): string { return this.childNodes.map((c) => c.textContent).join(''); }
  set textContent(v: string) { for (const c of this.childNodes) c.parentNode = null; this.childNodes = []; if (v !== '' && v != null) this.append(String(v)); }
  get innerHTML() { return this.textContent; }
  set innerHTML(_v: string) { this.doc.innerHtmlPogingen += 1; throw new Error('innerHTML is verboden in de extensie-UI'); }
  set outerHTML(_v: string) { this.doc.innerHtmlPogingen += 1; throw new Error('outerHTML is verboden'); }
  insertAdjacentHTML() { this.doc.innerHtmlPogingen += 1; throw new Error('insertAdjacentHTML is verboden'); }
  get children() { return this.childNodes.filter((c) => c.nodeType === 1); }
  append(...n: any[]) {
    for (const x of n) {
      const k = typeof x === 'string' ? new Tekst(x) : x;
      if (k.parentNode) k.parentNode.childNodes = k.parentNode.childNodes.filter((c: any) => c !== k);
      k.parentNode = this; this.childNodes.push(k);
    }
  }
  appendChild(n: any) { this.append(n); return n; }
  replaceChildren(...n: any[]) { for (const c of this.childNodes) c.parentNode = null; this.childNodes = []; this.append(...n); }
  addEventListener(type: string, f: (e: any) => unknown) { const l = this.luister.get(type) ?? []; l.push(f); this.luister.set(type, l); }
  removeEventListener(type: string, f: (e: any) => unknown) { this.luister.set(type, (this.luister.get(type) ?? []).filter((x) => x !== f)); }
  dispatchEvent(ev: any) { ev.target ??= this; ev.currentTarget = this; for (const f of [...(this.luister.get(ev.type) ?? [])]) f.call(this, ev); return !ev.defaultPrevented; }
  /** Zoals een echte klik: uitgeschakeld = niets; checkbox wisselt vóór de handler; tijdens de handler loopt het «gebruikersgebaar». */
  click() {
    if (this.disabled) return;
    const vink = this.tagName === 'input' && (this.attrs.get('type') === 'checkbox');
    if (vink) this.checked = !this.checked;
    const ev = { type: 'click', defaultPrevented: false, preventDefault() { this.defaultPrevented = true; } } as any;
    this.doc.gebaar = true;
    try { this.dispatchEvent(ev); } finally { this.doc.gebaar = false; }
    if (vink && ev.defaultPrevented) this.checked = !this.checked;
    else if (vink) this.dispatchEvent({ type: 'change' });
  }
  focus() { this.doc.activeElement = this; }
  *afstammelingen(): Generator<El> { for (const c of this.children) { yield c; yield* c.afstammelingen(); } }
  matches(sel: string): boolean { return sel.split(',').some((s) => past(this, s.trim())); }
  querySelectorAll(sel: string) { return [...this.afstammelingen()].filter((e) => e.matches(sel)); }
  querySelector(sel: string) { return this.querySelectorAll(sel)[0] ?? null; }
}
function past(el: El, sel: string): boolean {
  const re = /(#[\w-]+)|(\.[\w-]+)|(\[[^\]]+\])|([a-z][\w-]*)/gi;
  let m: RegExpExecArray | null; let gelezen = '';
  while ((m = re.exec(sel))) {
    gelezen += m[0];
    if (m[1] && el.id !== m[1].slice(1)) return false;
    if (m[2] && !el.classList.contains(m[2].slice(1))) return false;
    if (m[3]) { const [, n, v] = /^\[([\w-]+)(?:="?([^"\]]*)"?)?\]$/.exec(m[3]) ?? []; if (!n || !el.attrs.has(n) || (v !== undefined && el.attrs.get(n) !== v)) return false; }
    if (m[4] && el.tagName !== m[4].toLowerCase()) return false;
  }
  if (gelezen !== sel) throw new Error(`nep-DOM: selector niet ondersteund: ${sel}`);
  return true;
}
function bouwDocument(html: string) {
  const doc: any = { gebaar: false, innerHtmlPogingen: 0, activeElement: null };
  const wortel = new El('#document', doc);
  const stapel: El[] = [wortel];
  const re = /<!--[\s\S]*?-->|<!doctype[^>]*>|<\/([a-zA-Z][\w-]*)\s*>|<([a-zA-Z][\w-]*)((?:\s+[^\s=/>]+(?:\s*=\s*"[^"]*")?)*)\s*(\/?)>|([^<]+)/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    const top = stapel[stapel.length - 1];
    if (m[1]) { const tag = m[1].toLowerCase(); const i = stapel.map((e) => e.tagName).lastIndexOf(tag); if (i > 0) stapel.length = i; continue; }
    if (m[2]) {
      const el = new El(m[2].toLowerCase(), doc);
      for (const a of m[3].matchAll(/([^\s=/>]+)(?:\s*=\s*"([^"]*)")?/g)) el.attrs.set(a[1], a[2] === undefined ? '' : ontcijfer(a[2]));
      if (el.tagName === 'input' && el.attrs.has('checked')) el.checked = true;
      top.append(el);
      if (!VOID.has(el.tagName) && !m[4]) stapel.push(el);
      continue;
    }
    if (m[5] !== undefined && m[0][0] !== '<') top.append(ontcijfer(m[5]));
  }
  const htmlEl = wortel.children.find((e) => e.tagName === 'html')!;
  Object.assign(doc, {
    documentElement: htmlEl, body: htmlEl.querySelector('body'), head: htmlEl.querySelector('head'),
    getElementById: (id: string) => wortel.querySelector(`#${id}`),
    querySelectorAll: (s: string) => wortel.querySelectorAll(s), querySelector: (s: string) => wortel.querySelector(s),
    createElement: (tag: string) => new El(String(tag).toLowerCase(), doc), createElementNS: (_ns: string, tag: string) => new El(String(tag), doc),
    createTextNode: (s: string) => new Tekst(String(s)),
  });
  return doc;
}
const zichtbaarTekst = (doc: any) => (doc.body as El).textContent;
const wacht = async (n = 6) => { for (let i = 0; i < n; i += 1) await new Promise((r) => setImmediate(r)); };

// ---------------------------------------------------------------- nep-chrome + pagina laden
type Stand = { status: any; log: unknown; toestaan: boolean; verleend: Set<string>; antwoord: Record<string, (m: any) => unknown> };
async function laad(pagina: 'popup' | 'sidepanel' | 'options', status: any, opt: { taal?: string; stand?: Partial<Stand> } = {}) {
  const doc = bouwDocument(lees(`${pagina}.html`));
  const stand: Stand = { status, log: [], toestaan: true, verleend: new Set(['debugger']), antwoord: {}, ...(opt.stand || {}) }; // 0.8.0: vast recht = verleend
  const berichten: any[] = []; const tabs: string[] = []; const rechten: any[] = []; const paneel: any[] = []; const luisteraars: any[] = []; const timers: Array<{ f: () => void; ms: number }> = [];
  let opties = 0;
  const kloon = (x: unknown) => (x === undefined ? undefined : JSON.parse(JSON.stringify(x)));
  const chrome = {
    runtime: {
      id: ID, getURL: (p: string) => `chrome-extension://${ID}/${p}`, getManifest: () => ({ version: '0.8.0', permissions: ['storage', 'alarms', 'scripting', 'activeTab', 'sidePanel', 'webRequest', 'debugger'], optional_permissions: ['nativeMessaging'] }), // UI-011: debugger vast
      openOptionsPage: async () => { opties += 1; },
      onMessage: { addListener: (f: any) => { luisteraars.push(f); } },
      sendMessage: async (m: any) => {
        berichten.push(kloon(m));
        if (stand.antwoord[m.op]) return kloon(stand.antwoord[m.op](m));
        if (m.op === 'status') return kloon(stand.status);
        if (m.op === 'vergrendel') { const sl = { ...stand.status.sloten }; sl[m.ruimte] = { ...sl[m.ruimte], staat: 'vergrendeld', ontgrendeling: null }; stand.status = { ...stand.status, sloten: sl }; return { ok: true, status: kloon(stand.status) }; }
        if (m.op === 'log') return kloon(stand.log);
        if (m.op === 'self-test') return { ok: false, version: '0.6.0', checks: [{ id: 'prive.paired', ok: true, detail: '' }, { id: 'prive.unlocked', ok: false, detail: 'locked' }] };
        if (m.op === 'set-diag' || m.op === 'set-native' || m.op === 'forget' || m.op === 'open-side-panel') return { ok: true };
        return { ok: false };
      },
    },
    tabs: { create: async (o: { url: string }) => { tabs.push(o.url); return { id: 9 }; } },
    windows: { getCurrent: async () => ({ id: 1 }) },
    sidePanel: { open: async (o: any) => { paneel.push({ ...o, gebaar: doc.gebaar }); } },
    permissions: {
      request: (p: any) => { rechten.push({ soort: 'request', p: kloon(p), gebaar: doc.gebaar, berichtenErvoor: berichten.map((b) => b.op) }); if (stand.toestaan) for (const x of p.permissions) stand.verleend.add(x); return Promise.resolve(stand.toestaan); },
      remove: async (p: any) => { rechten.push({ soort: 'remove', p: kloon(p), berichtenErvoor: berichten.map((b) => b.op) }); for (const x of p.permissions) stand.verleend.delete(x); return true; },
      contains: async (p: any) => p.permissions.every((x: string) => stand.verleend.has(x)),
    },
    storage: { local: { get: async () => ({ diagOptIn: stand.status?.diagOptIn === true }) } },
  };
  let gesloten = false;
  const ctx: any = {
    document: doc, chrome, navigator: { language: opt.taal ?? 'uk-UA' }, console,
    setInterval: (f: () => void, ms: number) => { timers.push({ f, ms }); return timers.length; }, clearInterval: () => undefined,
    setTimeout: (f: () => void, ms: number) => setTimeout(f, Math.min(ms, 5)), clearTimeout,
    close: () => { gesloten = true; },
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  const scripts = (doc.querySelectorAll('script') as El[]).map((s) => s.getAttribute('src'));
  for (const src of scripts) vm.runInContext(lees(String(src)), ctx, { filename: String(src) });
  await wacht();
  const $ = (id: string) => doc.getElementById(id) as El;
  const push = async (s: any, sender: any = { id: ID }) => { for (const f of luisteraars) f({ op: 'status-push', status: s }, sender, () => undefined); await wacht(); };
  const tik = async (ms: number) => { for (const t of timers.filter((x) => x.ms === ms)) t.f(); await wacht(); };
  return { doc, $, stand, berichten, tabs, rechten, paneel, push, tik, scripts, ctx, opties: () => opties, gesloten: () => gesloten };
}

const nu = Date.now();
const grant = (domeinen = ['mail.tarasevych.com', 'hub.tarasevych.com']) => ({ gid: 'g-1', exp: Date.now() + 42 * 60_000 + 5_000, caps: ['browser.read', 'browser.screenshot'], domeinen, lokaal: true });
const slot = (r: 'prive' | 'technisch', staat: ExtensieStaat) => ({
  ruimte: r, gekoppeld: staat !== 'niet-gekoppeld', verbonden: staat !== 'niet-gekoppeld', staat,
  ontgrendeling: staat === 'ontgrendeld' || staat === 'agent' ? grant(r === 'technisch' ? ['admin.tarasevych.com', 'mcp.tarasevych.com'] : undefined) : null,
  ai: { verbonden: staat === 'agent', agenten: staat === 'agent' ? [{ naam: r === 'prive' ? 'Claude' : 'Grok', laatst: nu }] : [] },
  agentId: staat === 'niet-gekoppeld' ? '' : `ag-${r}`, naam: staat === 'niet-gekoppeld' ? '' : 'Chrome thuis', fout: '',
});
const status = (o: { prive?: ExtensieStaat; technisch?: ExtensieStaat | null; profielTab?: string | null; techRecht?: boolean; lokaal?: any; account?: string } = {}) => ({
  versie: '0.6.0', profielTab: o.profielTab === undefined ? 'gebruiker' : o.profielTab, accountEmail: 'pavlo@test.invalid', techRecht: o.techRecht ?? !!o.technisch,
  account: o.account ?? 'ok', sloten: { prive: slot('prive', o.prive ?? 'vergrendeld'), technisch: o.technisch ? slot('technisch', o.technisch) : null },
  lokaal: o.lokaal ?? { toegestaan: false, verbonden: false, ruimte: null }, diagOptIn: false, nativeOptIn: false, debugging: false,
});
const STATEN = Object.keys(STAAT_TEKST) as ExtensieStaat[];
const PRIVE_TEKST: Record<ExtensieStaat, string> = { 'niet-gekoppeld': 'Не підключено', vergrendeld: STAAT_TEKST.vergrendeld[0], ontgrendeld: STAAT_TEKST.ontgrendeld[0], agent: STAAT_TEKST.agent[0] };
const pictVan = (k: El) => (k.querySelectorAll('[data-pict]') as El[]).map((p) => p.getAttribute('data-pict'));
/** Alles wat een gebruiker kan zien of horen: tekst, aria-labels, titels, alt, placeholders, data-nl (vertaling), href's en id's van knoppen. */
function zichtbaar(doc: any): string {
  const delen: string[] = [zichtbaarTekst(doc)];
  for (const el of [...(doc.body as El).afstammelingen()]) {
    for (const a of ['aria-label', 'title', 'alt', 'placeholder', 'data-nl', 'data-nl-aria', 'href']) { const v = el.getAttribute(a); if (v) delen.push(v); }
    if (el.tagName === 'button' || el.tagName === 'a') delen.push(`#${el.id}`);
  }
  return delen.join(' | ');
}
const TECH_RE = /технічн|technisch|passkey|адмін|admin|koppel=technisch|ontgrendelen=technisch|kaart-technisch|-technisch\b/i;

export async function main(): Promise<number> {
  const { check, einde } = checker('extensie-ui');
  const innerHtml: number[] = [];
  try {
    // ------------------------------------------------------------ 0.9.0 (EXT090-001): «Увійти» in de kop in plaats van «Обліковий запис: —»
    for (const pagina of ['popup', 'sidepanel', 'options'] as const) {
      const p = await laad(pagina, { ...status({ prive: 'niet-gekoppeld', profielTab: null }), accountEmail: '' });
      const knop = p.$('inloggen');
      check(`${pagina} zonder koppeling: geen «Обліковий запис: —» en geen «Активна вкладка не на tarasevych.com», wel «Не ввійшли» + knop «Увійти» met uitleg van de gevolgen`,
        !!knop && knop.textContent === 'Увійти' && /Не ввійшли/.test(p.$('account').textContent) && !/—/.test(p.$('account').textContent)
        && p.$('profiel-tab').hidden === true && /підключить це розширення/.test(knop.getAttribute('title') || '') && p.$('account').getAttribute('data-ingelogd') === '0',
        `${p.$('account')?.textContent} / ${p.$('profiel-tab')?.hidden}`);
      knop?.click(); await wacht();
      check(`${pagina}: «Увійти» opent de site, die na het inloggen deze extensie meteen koppelt (?koppel=prive#extensie)`, p.tabs.at(-1) === 'https://mcp.tarasevych.com/agents?koppel=prive#extensie', p.tabs.join());
    }
    {
      const p = await laad('popup', { ...status({ prive: 'vergrendeld' }), accountEmail: '' });
      check('gekoppeld maar e-mail nog niet geladen: geen knop, wel «підключено (пошта завантажується…)» en het profiel van het tabblad',
        !p.$('inloggen') && /підключено/.test(p.$('account').textContent) && p.$('profiel-tab').hidden === false && p.$('account').getAttribute('data-ingelogd') === '1', p.$('account').textContent);
      const nl = await laad('popup', { ...status({ prive: 'niet-gekoppeld', profielTab: null }), accountEmail: '' }, { taal: 'nl-NL' });
      check('nl: knop «Aanmelden» en «Niet aangemeld»', nl.$('inloggen')?.textContent === 'Aanmelden' && /Niet aangemeld/.test(nl.$('account').textContent));
    }
    // ------------------------------------------------------------ pop-up: kaart «Як користувач», elke staat, zonder techRecht
    for (const staat of STATEN) {
      const p = await laad('popup', status({ prive: staat }));
      innerHtml.push(p.doc.innerHtmlPogingen);
      const k = p.$('kaart-prive');
      const kan = staat === 'ontgrendeld' || staat === 'agent';
      check(`pop-up prive «${staat}»: tekst «${PRIVE_TEKST[staat]}», data-staat, één pictogram, titel «Як користувач»`,
        !!k && p.$('staat-prive').textContent === PRIVE_TEKST[staat] && k.getAttribute('data-staat') === staat && JSON.stringify(pictVan(k)) === JSON.stringify([staat]) && p.$('kop-prive').textContent === 'Як користувач',
        `${p.$('staat-prive')?.textContent} / ${k && pictVan(k)}`);
      check(`pop-up prive «${staat}»: GEEN technische kaart en nergens een technisch woord, knop of adres (techRecht false)`,
        !p.$('kaart-technisch') && !TECH_RE.test(zichtbaar(p.doc)), (zichtbaar(p.doc).match(TECH_RE) || [''])[0]);
      check(`pop-up «${staat}»: bovenaan account (e-mail) en profiel van het tabblad`, p.$('account').textContent === 'Обліковий запис: pavlo@test.invalid' && p.$('profiel-tab').textContent === 'Профіль вкладки: Користувач');
      check(`pop-up «${staat}»: eerste bericht is {op:'status'}`, p.berichten[0]?.op === 'status');
      if (staat === 'niet-gekoppeld') {
        check('pop-up prive niet gekoppeld: alleen «Додати доступ як користувач» (geen intrekken/ontgrendelen)', p.$('koppelen-prive')?.textContent === 'Додати доступ як користувач' && !p.$('intrekken-prive') && !p.$('ontgrendelen-prive'));
        p.$('koppelen-prive').click(); await wacht();
        check('… en die opent https://mcp.tarasevych.com/agents?koppel=prive#extensie', p.tabs.includes('https://mcp.tarasevych.com/agents?koppel=prive#extensie'), p.tabs.join());
      } else {
        check(`pop-up prive «${staat}»: «Відкликати доступ ШІ» ${kan ? 'actief' : 'uitgeschakeld met uitleg'}`, p.$('intrekken-prive').disabled === !kan
          && (kan ? /Одразу закриває/.test(p.$('intrekken-uitleg-prive').textContent) : /^Неактивно/.test(p.$('intrekken-uitleg-prive').textContent)), p.$('intrekken-uitleg-prive').textContent);
        if (!kan) { p.$('intrekken-prive').click(); await wacht(); check(`pop-up «${staat}»: klik op uitgeschakeld intrekken stuurt niets`, !p.berichten.some((b) => b.op === 'vergrendel')); }
      }
      if (staat === 'vergrendeld') {
        p.$('ontgrendelen-prive').click(); await wacht();
        check('prive vergrendeld: «Відкрити доступ на сайті» opent ?ontgrendelen=prive#extensie; geen rechten/aftellen', p.tabs.at(-1) === 'https://mcp.tarasevych.com/agents?ontgrendelen=prive#extensie' && !p.$('caps-prive') && p.$('resttijd-prive').hidden, p.tabs.join());
      }
      if (staat === 'ontgrendeld') {
        check('prive ontgrendeld: aftellen «Залишилось 42:0x · до …»', /^Залишилось 42:0[3-5] · до \d\d:\d\d$/.test(p.$('resttijd-prive').textContent) && !p.$('resttijd-prive').hidden, p.$('resttijd-prive').textContent);
        check('prive ontgrendeld: chips met rechten en domeinen', JSON.stringify((p.$('caps-prive').children as El[]).map((c) => c.textContent)) === JSON.stringify(['Читати сторінки', 'Знімки екрана'])
          && JSON.stringify((p.$('domeinen-prive').children as El[]).map((c) => c.textContent)) === JSON.stringify(['mail.tarasevych.com', 'hub.tarasevych.com']));
        p.$('intrekken-prive').click(); await wacht();
        check("prive intrekken stuurt {op:'vergrendel', reden:'popup', ruimte:'prive'} en toont meteen «Очікування підтвердження» + aria-live",
          JSON.stringify(p.berichten.find((b) => b.op === 'vergrendel')) === JSON.stringify({ op: 'vergrendel', reden: 'popup', ruimte: 'prive' }) && p.$('staat-prive').textContent === PRIVE_TEKST.vergrendeld && /відкликано/.test(p.$('aankondiging').textContent));
      }
      if (staat === 'agent') check('prive agent: actieve agent «Claude»', /Claude/.test(p.$('ai-agenten-prive')?.textContent || ''));
    }

    // ------------------------------------------------------------ geen techRecht: ook zijpaneel en opties, ook NL, ook als profielTab (onterecht) technisch is
    for (const pagina of ['popup', 'sidepanel', 'options'] as const) {
      for (const taal of ['uk-UA', 'nl-NL']) {
        const p = await laad(pagina, status({ prive: 'agent', profielTab: 'technisch', lokaal: { toegestaan: true, verbonden: true, ruimte: 'prive' } }), {
          taal, stand: { log: [{ at: nu, type: 'browser.snapshot', ok: true, bron: 'ws', ruimte: 'technisch' }, { at: nu - 1, type: 'browser.tabs', ok: true, bron: 'ws', ruimte: 'prive' }] },
        });
        await p.tik(5000);
        innerHtml.push(p.doc.innerHtmlPogingen);
        const tekst = zichtbaar(p.doc);
        check(`${pagina} (${taal}) zonder techRecht: geen enkel technisch element (tekst, knop, link, aria, vertaling)`, !p.$('kaart-technisch') && !TECH_RE.test(tekst) && !p.doc.querySelector('[data-ruimte="technisch"]'), (tekst.match(TECH_RE) || [''])[0]);
      }
    }

    // ------------------------------------------------------------ technisch: kaart bestaat met techRecht of gekoppeld slot
    {
      const a = await laad('popup', status({ prive: 'ontgrendeld', technisch: 'niet-gekoppeld', techRecht: true }));
      check('techRecht zonder technisch slot: kaart «Технічний профіль» met «Підключити технічний профіль»', !!a.$('kaart-technisch') && a.$('kop-technisch').textContent === 'Технічний профіль' && a.$('koppelen-technisch')?.textContent === 'Підключити технічний профіль');
      a.$('koppelen-technisch').click(); await wacht();
      check('… opent ?koppel=technisch#extensie', a.tabs.at(-1) === 'https://mcp.tarasevych.com/agents?koppel=technisch#extensie');
      const b = await laad('popup', status({ prive: 'ontgrendeld', technisch: 'ontgrendeld', profielTab: 'technisch' }));
      const volgorde = () => (b.$('sloten').children as El[]).map((k) => k.getAttribute('data-ruimte')).join();
      check('tabblad in tech-modus: technische kaart bovenaan, profiel «Технічний», tekst en chips van het technische slot', volgorde() === 'technisch,prive' && b.$('profiel-tab').textContent === 'Профіль вкладки: Технічний'
        && b.$('staat-technisch').textContent === STAAT_TEKST.ontgrendeld[0] && JSON.stringify((b.$('domeinen-technisch').children as El[]).map((c) => c.textContent)) === '["admin.tarasevych.com","mcp.tarasevych.com"]', volgorde());
      await b.push(status({ prive: 'ontgrendeld', technisch: 'ontgrendeld', profielTab: 'gebruiker' }));
      check('tech-modus verlaten (status-push profielTab gebruiker) → meteen gebruikersweergave: prive bovenaan, «Користувач», melding op de technische kaart',
        volgorde() === 'prive,technisch' && b.$('profiel-tab').textContent === 'Профіль вкладки: Користувач' && /не в технічному режимі/.test(b.$('kaart-technisch').textContent), volgorde());
      await b.push(status({ prive: 'niet-gekoppeld', technisch: 'ontgrendeld', profielTab: 'gebruiker' }));
      check('… zonder prive-slot: aanbod «Додати доступ як користувач»', b.$('koppelen-prive')?.textContent === 'Додати доступ як користувач' && volgorde() === 'prive,technisch');
      await b.push(status({ prive: 'vergrendeld', technisch: 'ontgrendeld', profielTab: 'technisch' }), { id: ID, tab: { id: 4, url: 'https://mcp.tarasevych.com/' } });
      await b.push(status({ prive: 'vergrendeld', technisch: 'ontgrendeld', profielTab: 'technisch' }), { id: 'andere-extensie' });
      check('status-push van een tabblad of andere extensie wordt genegeerd', volgorde() === 'prive,technisch' && !!b.$('koppelen-prive'));
      b.stand.status = status({ prive: 'vergrendeld', technisch: 'agent', profielTab: 'technisch' }); // wat de achtergrond nu zou antwoorden
      await b.push(b.stand.status);
      b.$('intrekken-technisch').click(); await wacht();
      check("technisch intrekken stuurt {op:'vergrendel', reden:'popup', ruimte:'technisch'}; prive ongemoeid", JSON.stringify(b.berichten.filter((x) => x.op === 'vergrendel').pop()) === JSON.stringify({ op: 'vergrendel', reden: 'popup', ruimte: 'technisch' })
        && b.$('staat-technisch').textContent === STAAT_TEKST.vergrendeld[0] && b.$('staat-prive').textContent === PRIVE_TEKST.vergrendeld);
      const c = await laad('popup', status({ prive: 'vergrendeld', technisch: 'vergrendeld', profielTab: 'technisch' }));
      c.$('ontgrendelen-technisch').click(); await wacht();
      check('technisch vergrendeld: «Розблокувати на сайті» → ?ontgrendelen=technisch#extensie', c.tabs.at(-1) === 'https://mcp.tarasevych.com/agents?ontgrendelen=technisch#extensie');
      const geen = await laad('popup', status({ prive: 'vergrendeld', profielTab: null }));
      check('actief tabblad niet op de site: profielregel zegt dat', /не на tarasevych\.com/.test(geen.$('profiel-tab').textContent));
      innerHtml.push(a.doc.innerHtmlPogingen, b.doc.innerHtmlPogingen, c.doc.innerHtmlPogingen);
    }

    // ------------------------------------------------------------ pop-up: knoppen, taal, aftellen, waarschuwingen
    {
      const p = await laad('popup', status());
      p.$('paneel').click(); await wacht();
      check('«Бічна панель»: sidePanel.open({windowId}) binnen het gebaar, daarna sluit de pop-up', p.paneel.length === 1 && p.paneel[0].windowId === 1 && p.paneel[0].gebaar === true && p.gesloten());
      p.$('opties').click(); await wacht();
      check('«Налаштування» opent de opties', p.opties() === 1);
      const nl = await laad('popup', status({ prive: 'ontgrendeld' }), { taal: 'nl-NL' });
      check('taal nl-*: Nederlandse teksten (staat, titel, knop, lang)', nl.$('staat-prive').textContent === STAAT_TEKST.ontgrendeld[1] && nl.$('kop-prive').textContent === 'Als gebruiker'
        && nl.$('intrekken-prive').textContent === 'AI-toegang intrekken' && nl.doc.documentElement.getAttribute('lang') === 'nl' && /^Nog 42:0/.test(nl.$('resttijd-prive').textContent));
      const kort = status({ prive: 'ontgrendeld' }); kort.sloten.prive.ontgrendeling!.exp = Date.now() + 300;
      const a = await laad('popup', kort);
      check('aftellen: < 5 min krijgt de klasse «bijna»', a.$('resttijd-prive').classList.contains('bijna'));
      await new Promise((r) => setTimeout(r, 350));
      const voor = a.berichten.filter((b) => b.op === 'status').length;
      a.stand.status = status({ prive: 'vergrendeld' });
      await a.tik(1000); await wacht();
      check('aftellen: bij exp meteen een nieuwe status gevraagd → vergrendeld', a.berichten.filter((b) => b.op === 'status').length === voor + 1 && a.$('staat-prive').textContent === PRIVE_TEKST.vergrendeld);
      const leeg = await laad('popup', null, { stand: { antwoord: { status: () => undefined } } });
      check('geen status van de achtergrond: melding, en de prive-kaart toont «Не підключено» (veilig)', !leeg.$('waarschuwing').hidden && /Не вдалося отримати стан/.test(leeg.$('waarschuwing').textContent) && leeg.$('staat-prive').textContent === PRIVE_TEKST['niet-gekoppeld']);
      const mis = await laad('popup', status({ prive: 'ontgrendeld', account: 'mismatch' }));
      check('ander account op de pagina: waarschuwing', /інший обліковий запис/.test(mis.$('waarschuwing').textContent) && !mis.$('waarschuwing').hidden);
      const lok = await laad('popup', status({ prive: 'ontgrendeld', technisch: 'ontgrendeld', lokaal: { toegestaan: true, verbonden: true, ruimte: 'technisch' } }));
      check('lokale agent: verbonden + bij welk slot', /Локальний агент: підключено \(лише читання\) \(технічний профіль\)/.test(lok.$('lokaal').textContent), lok.$('lokaal').textContent);
      innerHtml.push(p.doc.innerHtmlPogingen, nl.doc.innerHtmlPogingen, a.doc.innerHtmlPogingen);
    }

    // ------------------------------------------------------------ zijpaneel
    {
      const geheim = 'GEHEIM-PARAM-123';
      const log = [
        { at: nu - 5000, type: 'browser.snapshot', ok: true, bron: 'ws', ruimte: 'prive', params: { selector: geheim }, url: `https://mcp.tarasevych.com/?token=${geheim}` },
        { at: nu - 1000, type: 'browser.console', ok: false, bron: 'lokaal', ruimte: 'technisch', fout: 'EXTENSIE_VERGRENDELD', data: { tekst: geheim } },
      ];
      const z = await laad('sidepanel', status({ prive: 'ontgrendeld', technisch: 'vergrendeld', profielTab: 'gebruiker' }), { stand: { log } });
      check('zijpaneel: «Керування на сайті» (pictogram met tooltip/aria) → https://mcp.tarasevych.com/agents#toegang', z.$('beheer-link').getAttribute('aria-label') === 'Керування на сайті' && z.$('beheer-link').href === 'https://mcp.tarasevych.com/agents#toegang');
      check('zijpaneel: grote kaarten per slot', z.$('kaart-prive').classList.contains('groot') && z.$('kaart-technisch').classList.contains('groot'));
      const tp = z.$('tijdlijn-prive').children as El[]; const tt = z.$('tijdlijn-technisch').children as El[];
      check('zijpaneel: tijdlijn per slot — elke regel in het blok van zijn slot (tijd/type/ok/bron)', tp.length === 1 && tp[0].textContent.includes('browser.snapshot') && tp[0].textContent.includes('✓') && tp[0].textContent.includes('ШІ через сервер')
        && tt.length === 1 && tt[0].textContent.includes('browser.console') && tt[0].textContent.includes('Локальний агент') && tt[0].textContent.includes('EXTENSIE_VERGRENDELD'), [...tp, ...tt].map((i) => i.textContent).join(' | '));
      check('zijpaneel: nooit parameters, url-query of data van een opdracht in beeld', !zichtbaarTekst(z.doc).includes(geheim));
      const ziet = z.$('ziet').children as El[];
      // 0.7.0: zeven mogelijkheden, waarvan in het privéslot vijf kunnen bestaan (diepe diagnose en scripts zijn technisch).
      check('zijpaneel: «Що бачить ШІ» voor het slot van het tabblad (gebruiker → prive), de 5 privémogelijkheden, toegestane gemarkeerd', ziet.length === BROWSER_CAPS.length - 2 && /Як користувач/.test(z.$('ziet-voor').textContent)
        && ziet.filter((l) => l.getAttribute('data-aan') === 'ja').length === 2 && /Ніколи — паролі/.test(ziet[0].textContent));
      const logVoor = z.berichten.filter((b) => b.op === 'log').length;
      await z.push(status({ prive: 'agent', technisch: 'vergrendeld', profielTab: 'technisch' }));
      check('zijpaneel: status-push live (technische kaart bovenaan, «Що бачить ШІ» → technisch) en de tijdlijn wordt opnieuw gevraagd',
        (z.$('sloten').children as El[])[0].getAttribute('data-ruimte') === 'technisch' && /Технічний профіль/.test(z.$('ziet-voor').textContent) && z.berichten.filter((b) => b.op === 'log').length > logVoor);
      check('zijpaneel: aria-live voor statuswijziging', z.$('aankondiging').getAttribute('aria-live') === 'polite' && z.$('aankondiging').textContent.includes(STAAT_TEKST.agent[0]));
      z.$('test').click(); await wacht();
      check('zijpaneel: «Тест» toont de zelftest met slotnamen', (z.$('checks').children as El[]).length === 2 && /Є проблеми/.test(z.$('test-uitkomst').textContent) && /Як користувач: підключено/.test(z.$('checks').textContent));
      const z2 = await laad('sidepanel', status({ prive: 'vergrendeld' }), { stand: { log: { regels: [] } } });
      check('zijpaneel zonder technisch slot: één tijdlijnblok (prive), leeg met uitleg; niets «дозволено зараз»', !z2.$('tijdlijn-technisch') && !z2.$('tijdlijn-leeg-prive').hidden
        && (z2.$('ziet').children as El[]).every((l) => l.getAttribute('data-aan') === 'nee'));
      innerHtml.push(z.doc.innerHtmlPogingen, z2.doc.innerHtmlPogingen);
    }

    // ------------------------------------------------------------ opties
    {
      const o = await laad('options', status({ prive: 'ontgrendeld', technisch: 'ontgrendeld' }));
      check('opties: kaarten + intrekken actief', o.$('staat-prive').textContent === STAAT_TEKST.ontgrendeld[0] && !o.$('intrekken-prive').disabled && !o.$('intrekken-technisch').disabled);
      const rij = (r: string) => o.doc.querySelector(`[data-ruimte="${r}"]`) as El;
      check('opties: koppelingen per slot met «Відключити»', /Як користувач: підключено як «Chrome thuis»/.test(o.$('koppelingen').textContent) && /Технічний профіль: підключено/.test(o.$('koppelingen').textContent) && !!o.$('forget-prive') && !!o.$('forget-technisch') && !!rij('prive'));
      o.$('forget-technisch').click(); await wacht();
      check("opties: ontkoppelen per slot → {op:'forget', ruimte:'technisch'}", JSON.stringify(o.berichten.find((b) => b.op === 'forget')) === JSON.stringify({ op: 'forget', ruimte: 'technisch' }));
      // UI-011 (0.8.0): `debugger` staat vast in het manifest — de schakelaar vraagt GEEN Chrome-recht meer, alleen de toestemming (set-diag).
      const diag = o.$('diag');
      diag.click(); await wacht();
      check("opties 0.8.0: diagnose aan → GEEN permissions.request(debugger), wel {op:'set-diag', on:true}; schakelaar blijft aan met werkelijke stand",
        !o.rechten.some((x) => x.soort === 'request' && JSON.stringify(x.p) === '{"permissions":["debugger"]}') && JSON.stringify(o.berichten.find((b) => b.op === 'set-diag')) === '{"op":"set-diag","on":true}' && diag.checked && !!o.$('diag-status').getAttribute('data-werkelijk'), o.$('diag-status').textContent);
      diag.click(); await wacht();
      check('opties 0.8.0: diagnose uit → set-diag on:false, geen permissions.remove (vast recht)', JSON.stringify(o.berichten.filter((b) => b.op === 'set-diag').pop()) === '{"op":"set-diag","on":false}'
        && !o.rechten.some((x) => x.soort === 'remove') && !diag.checked);
      {
        const o2 = await laad('options', status({ prive: 'ontgrendeld', technisch: 'ontgrendeld' }), { stand: { verleend: new Set() } });
        o2.$('diag').click(); await wacht();
        check('opties 0.8.0: recht niet actief → schakelaar springt NIET stil terug: uit + reden + herstel (chrome://extensions)', !o2.$('diag').checked && /chrome:\/\/extensions/.test(o2.$('diag-hulp').textContent) && !o2.$('diag-hulp').hidden && o2.$('diag-status').textContent.length > 0);
      }
      const native = o.$('native');
      native.click();
      const nv = o.rechten.filter((x) => x.soort === 'request').find((x) => JSON.stringify(x.p) === '{"permissions":["nativeMessaging"]}');
      check('opties: lokale agent aan → permissions.request(nativeMessaging) binnen het gebaar, vóór set-native', JSON.stringify(nv?.p) === '{"permissions":["nativeMessaging"]}' && nv.gebaar === true && !nv.berichtenErvoor.includes('set-native'));
      await wacht();
      check("… daarna {op:'set-native', on:true}", JSON.stringify(o.berichten.find((b) => b.op === 'set-native')) === '{"op":"set-native","on":true}' && native.checked && /лише для читання/.test(o.$('native-status').textContent));
      native.click(); await wacht();
      check('opties: lokale agent uit → set-native on:false en permissions.remove(nativeMessaging)', JSON.stringify(o.berichten.filter((b) => b.op === 'set-native').pop()) === '{"op":"set-native","on":false}' && o.rechten.some((x) => x.soort === 'remove' && x.p.permissions[0] === 'nativeMessaging') && !native.checked);
      check('opties: sectie lokale agent met link naar #extension-lokaal en waarschuwing (alleen lezen, na het openen van de toegang met «локальний агент»)',
        o.$('kop-lokaal').textContent === 'Локальний ШІ-агент (Native Messaging)' && o.$('native-link').href === 'https://mcp.tarasevych.com/agents#extension-lokaal' && /лише ЧИТАТИ/.test(o.$('native-let-op').textContent) && /«локальний агент»/.test(o.$('native-let-op').textContent));
      o.$('intrekken-prive').click(); await wacht();
      check("opties: intrekken stuurt {op:'vergrendel', reden:'opties', ruimte:'prive'}", JSON.stringify(o.berichten.find((b) => b.op === 'vergrendel')) === JSON.stringify({ op: 'vergrendel', reden: 'opties', ruimte: 'prive' }));
      o.$('open-site').click(); o.$('self-test').click(); await wacht();
      check('opties: «Керування на сайті» → #toegang en zelftest met labels per slot', o.tabs.includes('https://mcp.tarasevych.com/agents#toegang') && (o.$('checks').children as El[]).some((l) => l.textContent.includes('Як користувач: Доступ відкрито')));
      const n = await laad('options', status(), { stand: { toestaan: false } });
      // UI-011: zonder technische kaart bestaat de diagnoseschakelaar niet meer in de opties (zoals in pop-up en zijpaneel).
      check('opties zonder technische kaart: geen diagnoseschakelaar', !n.$('diag'));
      n.$('native').click(); await wacht();
      check('opties: geen nativeMessaging-recht → geen set-native, schakelaar uit', !n.berichten.some((b) => b.op === 'set-native') && !n.$('native').checked);
      const nk = await laad('options', { ...status(), nativeOptIn: true }, { stand: { verleend: new Set(['nativeMessaging']) } });
      check('opties: nativeOptIn uit de status bepaalt de schakelaar (ook als vergrendeld)', nk.$('native').checked && /діє лише після відкриття доступу/.test(nk.$('lokaal').textContent), nk.$('lokaal').textContent);
      const zonder = await laad('options', status({ prive: 'niet-gekoppeld' }));
      check('opties zonder techRecht: alleen de prive-regel bij koppelingen', (zonder.$('koppelingen').children as El[]).length === 1 && /Як користувач: не підключено/.test(zonder.$('koppelingen').textContent));
      innerHtml.push(o.doc.innerHtmlPogingen, n.doc.innerHtmlPogingen, nk.doc.innerHtmlPogingen);

      check('ui.js: STAAT_TEKST gelijk aan shared/extensie-ontgrendeling.ts, BROWSER_CAPS idem', JSON.stringify(o.ctx.MR_UI.STAAT_TEKST) === JSON.stringify(STAAT_TEKST) && JSON.stringify(o.ctx.MR_UI.BROWSER_CAPS) === JSON.stringify(BROWSER_CAPS));
      check('ui.js: elke mogelijkheid heeft een naam en uitleg (uk + nl)', BROWSER_CAPS.every((c) => o.ctx.MR_UI.CAP_NAAM[c]?.length === 2 && o.ctx.MR_UI.CAP_UITLEG[c]?.length === 2));
      // 0.7.0 (zone E, 0111): termijn zonder vaste duur → soort + «найпізніше <datum>» i.p.v. een aftelling van 365 dagen; onbekend → gewoon aftellen.
      const rt = o.ctx.MR_UI.resttijdTekst as (exp: number, nu: number, einde?: unknown) => string;
      const nuT = Date.now();
      check('ui.js 0.7.1: «до закриття браузера» toont «найпізніше»; «без обмеження» noemt geen datum; duur telt af',
        /^(До закриття браузера|Tot de browser sluit) · (найпізніше|uiterlijk) /.test(rt(nuT + 300 * 86_400_000, nuT, 'browser'))
        && /^(Без обмеження — доки не відкличете|Onbeperkt — tot u intrekt)$/.test(rt(nuT + 300 * 86_400_000, nuT, 'handmatig'))
        && !/найпізніше|uiterlijk/.test(rt(nuT + 300 * 86_400_000, nuT, 'handmatig'))
        && /^(Залишилось|Nog) /.test(rt(nuT + 3_600_000, nuT, 'duur')) && /^(Залишилось|Nog) /.test(rt(nuT + 3_600_000, nuT, '__proto__')), rt(nuT + 300 * 86_400_000, nuT, 'browser'));
    }
    check('nep-DOM: nergens een innerHTML/outerHTML/insertAdjacentHTML-poging tijdens alle scenario\'s', innerHtml.every((x) => x === 0), innerHtml.join());

    // ------------------------------------------------------------ statische scan
    const JS = ['ui.js', 'popup.js', 'sidepanel.js', 'options.js'];
    const HTML = ['popup.html', 'sidepanel.html', 'options.html'];
    const CSS = ['ui.css', 'popup.css'];
    const verboden = JS.filter((f) => /\binnerHTML\b|\bouterHTML\b|insertAdjacentHTML|document\.write|\beval\s*\(|new\s+Function\b|setTimeout\(\s*['"`]/.test(lees(f)));
    check('scan: geen innerHTML/outerHTML/insertAdjacentHTML/document.write/eval in pop-up, zijpaneel, opties en ui.js', verboden.length === 0, verboden.join());
    const fouten: string[] = [];
    for (const f of HTML) {
      const h = lees(f);
      for (const m of h.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
        const src = /\bsrc="([^"]*)"/.exec(m[1])?.[1];
        if (!src) fouten.push(`${f}: inline script`);
        else if (/^(?:[a-z]+:|\/\/)/i.test(src) || !existsSync(join(EXT, src))) fouten.push(`${f}: script ${src}`);
        if (m[2].trim()) fouten.push(`${f}: script met inhoud`);
      }
      for (const m of h.matchAll(/<link\b([^>]*)>/gi)) {
        const href = /\bhref="([^"]*)"/.exec(m[1])?.[1] ?? '';
        if (/^(?:[a-z]+:|\/\/)/i.test(href) || !existsSync(join(EXT, href))) fouten.push(`${f}: link ${href}`);
      }
      if (/<style\b/i.test(h)) fouten.push(`${f}: inline <style>`);
      if (/\sstyle="/i.test(h)) fouten.push(`${f}: style-attribuut`);
      if (/\son[a-z]+\s*=/i.test(h)) fouten.push(`${f}: inline handler`);
      if (/<(?:iframe|object|embed|img)\b/i.test(h)) fouten.push(`${f}: externe inhoud`);
      if (/\b(Settings|Disconnect|Allow|Connected|Permissions|Open site)\b/.test(h.replace(/<[^>]+>/g, ' '))) fouten.push(`${f}: Engelse UI-tekst`);
      if (TECH_RE.test(h)) fouten.push(`${f}: technisch woord in de vaste HTML (${(h.match(TECH_RE) || [''])[0]})`);
    }
    for (const f of CSS) { const c = lees(f); if (/@import|url\s*\(|https?:/i.test(c)) fouten.push(`${f}: externe bron`); }
    check("scan: alleen eigen scripts/stijlen ('self'), geen inline scripts/stijlen/handlers, geen externe bronnen, geen Engelse UI-zinnen, geen technische woorden in vaste HTML", fouten.length === 0, fouten.join('; '));
    const ui = lees('ui.css');
    check('stijl: doelen ≥ 44 px, zichtbare focusring, donker thema, geen horizontaal scrollen, smal scherm', /button\{min-height:44px;min-width:44px/.test(ui) && /:focus-visible\{outline:3px solid/.test(ui) && /prefers-color-scheme:dark/.test(ui) && /label\.schakel\{[^}]*min-height:44px/.test(ui) && /overflow-x:hidden/.test(ui) && /max-width:360px/.test(ui));
    const opt = lees('options.js');
    // UI-011 (0.8.0): alleen nativeMessaging wordt nog gevraagd (synchroon in de klik); debugger is vast en wordt alleen gelezen.
    check('opties 0.8.0: permissions.request alleen in vraagRecht, alleen voor nativeMessaging en synchroon in de klikhandler; debugger nooit gevraagd',
      (opt.match(/chrome\.permissions\.request\(/g) || []).length === 1 && !/vraagRecht\('debugger'\)/.test(opt)
      && /addEventListener\('click', \(\) => \{\n\s+const want = native\.checked;\n\s+const toestemming = want \? vraagRecht\('nativeMessaging'\)/.test(opt));
  } catch (e) {
    check('onverwachte fout', false, String((e as Error)?.stack || e));
  }
  return einde();
}
