// UI-004 (29.10.2026) — «ШІ для вас» opende het MCP-centrum (mcp.*/agenten#ai) in plaats van het eigen werkgebied.
// Draaien: node scripts/eenheidstests.mjs ai-doorverwijzing-ui004
// Keten: CanonicalChrome → navigateMenu('ai') → navigate('ai','workspace',rememberLast=true) → rememberedTabForService('ai')
//   → lastPathForService('ai') = '/verbindingen' (onthouden bij één bezoek aan ai.*/verbindingen) → tab 'verbindingen'
//   → AIServiceView → NaarHub → location.replace(mcp.*/agents#ai). Ook railNavigationUrl (zijbalk/strook) volgde dat pad.
// Oplossing: doorverwijs-tabbladen (ai/verbindingen) worden nooit onthouden of hersteld (normalizePath in gedeelde-voorkeuren).
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { checker } from './hulp/nep-google';
const lees = (f: string) => readFileSync(f, 'utf8');
function nepBrowser(): () => void {
  const g = globalThis as Record<string, unknown>;
  const voor = new Map(['window', 'document', 'location', 'sessionStorage', 'localStorage', 'history', 'matchMedia', 'navigator', 'CSS'].map((k) => [k, Object.getOwnPropertyDescriptor(g, k)]));
  const opslag = () => { const m = new Map<string, string>(); return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { m.set(k, String(v)); }, removeItem: (k: string) => { m.delete(k); }, clear: () => m.clear(), key: () => null, length: 0 }; };
  const u = new URL('https://ai.tarasevych.com/');
  const maakEl = () => { const attrs = new Map<string, string>(); return { attrs, dataset: {}, style: {}, setAttribute: (k: string, v: string) => { attrs.set(k, String(v)); }, getAttribute: (k: string) => attrs.get(k) ?? null, getContext: () => null }; };
  const doc = { hidden: false, title: '', cookie: '', head: { appendChild: (el: unknown) => el }, body: null, addEventListener: () => undefined, removeEventListener: () => undefined, querySelector: () => null, querySelectorAll: () => [], getElementById: () => null, createElement: () => maakEl(),
    documentElement: { lang: 'uk', dataset: {}, style: { setProperty: () => undefined }, classList: { contains: () => false, add: () => undefined, remove: () => undefined } } };
  g.document = doc;
  g.location = { href: u.href, origin: u.origin, host: u.host, hostname: u.hostname, pathname: u.pathname, search: u.search, hash: u.hash, protocol: u.protocol, assign: () => undefined, replace: () => undefined, reload: () => undefined };
  g.sessionStorage = opslag(); g.localStorage = opslag();
  g.history = { pushState: () => undefined, replaceState: () => undefined, state: null };
  g.matchMedia = () => ({ matches: false, addEventListener: () => undefined, removeEventListener: () => undefined });
  Object.defineProperty(g, 'navigator', { value: { platform: 'Linux', userAgent: 'eenheid' }, configurable: true, writable: true });
  g.CSS = { escape: (s: string) => s };
  g.window = Object.assign(g, { name: '', addEventListener: () => undefined, removeEventListener: () => undefined, dispatchEvent: () => true, postMessage: () => undefined, setTimeout, clearTimeout, setInterval, clearInterval, requestAnimationFrame: (f: () => void) => setTimeout(f, 0) });
  runInNewContext(readFileSync('public/canonical-service.js', 'utf8'), { window: g, location: g.location, document: doc, addEventListener: () => undefined, Date, Math, Number, String, Object, Array, JSON, URLSearchParams, URL });
  return () => { for (const [k, d] of voor) { if (d) Object.defineProperty(g, k, d); else delete g[k]; } delete g.__TSV_CANONICAL_SERVICE__; };
}

export async function main(): Promise<number> {
  const { check, einde } = checker('ai-doorverwijzing UI-004');
  const herstel = nepBrowser();
  try {
    const vk = await import('../../src/gedeelde-voorkeuren');
    const nav = await import('../../src/canoniek-navigatie');
    check('isDoorverwijsTab(ai, verbindingen)', vk.isDoorverwijsTab('ai', 'verbindingen') && !vk.isDoorverwijsTab('ai', 'workspace') && !vk.isDoorverwijsTab('mcp', 'agents'));
    // 1. onthouden via de normale weg (writeLocalTab/rememberServicePath) slaat niets op
    vk.rememberServicePath('ai', '/verbindingen');
    check('rememberServicePath(ai,/verbindingen) bewaart niets', vk.lastPathForService('ai') === '', vk.lastPathForService('ai'));
    vk.rememberServicePath('ai', '/connections');
    check('ook de slug /connections wordt niet bewaard', vk.lastPathForService('ai') === '');
    check('hoofditem: rememberedTabForService(ai,workspace) = workspace', nav.rememberedTabForService('ai', 'workspace') === 'workspace');
    // 2. een oude waarde die al in cookie/server staat (van vóór deze fix) wordt genegeerd
    vk.writeSharedPreferences({ lastPathByService: { ai: '/verbindingen' } } as never);
    check('oude opgeslagen /verbindingen → lastPathForService leeg', vk.lastPathForService('ai') === '');
    check('oude opgeslagen waarde → hoofditem opent workspace', nav.rememberedTabForService('ai', 'workspace') === 'workspace');
    const rail = nav.railNavigationUrl('ai', '', 'uk');
    check('railNavigationUrl(ai) wijst naar ai.*, niet naar verbindingen/mcp', /ai\./.test(new URL(rail).host) && !/connections|verbindingen|agenten|mcp\./.test(rail), rail);
    // 3. echte tabbladen blijven onthouden (geen functie weg)
    vk.rememberServicePath('ai', '/agents');
    check('ai/agents wordt nog steeds onthouden en hersteld', nav.rememberedTabForService('ai', 'workspace') === 'agents');
    vk.rememberServicePath('mcp', '/agents');
    check('mcp/agents blijft onthouden', vk.lastPathForService('mcp') === '/agents');
    // 4. de expliciete weg naar het MCP-centrum werkt nog
    check('ai/verbindingen blijft een geldig adres (direct openen → hub)', nav.canonicalNavigationUrl('ai', 'verbindingen', 'uk').length > 0);
  } finally { herstel(); }
  const app = lees('src/VerenigdDienstApp.tsx');
  check('bron: navigateMenu gebruikt navigate(target, tab, true) (herstel laatste tab blijft bestaan)', app.includes('navigate(item.target as TargetService,item.tab||\'\',true)'));
  const ai = lees('src/AIDienstWeergave.tsx');
  check('bron: NaarHub alleen voor tab verbindingen', ai.includes("if (tab === 'verbindingen') return <NaarHub tr={tr} />;"));
  check('bron: MENU_CATALOG ai → workspace', /id:'ai'[^}]*tab:'workspace'|id: 'ai'[^}]*tab: 'workspace'/.test(lees('src/menu-voorkeuren.tsx')));
  return einde();
}
