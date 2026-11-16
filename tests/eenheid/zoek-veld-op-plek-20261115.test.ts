// ZOEK-002 (15.11.2026) — ПОЛЕ ПОШУКУ РОЗГОРТАЄТЬСЯ НА МІСЦІ. Draaien: node scripts/eenheidstests.mjs zoek-veld-op-plek-20261115
// Павло: «замість того щоб розгорталося існуюче, збільшуючись за потреби (як у Google), зверху накладається ще одне вікно пошуку».
//  A. rekenwerk: hoe breed het veld op zijn plek wordt (veldDoel) en naar welke kant een veld in een laag uit de knop groeit (groeiPlek);
//  B. bron: op de computer geen portaal maar het veld IN de groep rechtsboven (is-op-plek), knop weg zolang het veld open is, één veld;
//     de laag (telefoon, zoekknop in het menu, «Макет») groeit uit de knop en nooit onder de technische band; focus terug op de veldknop;
//  C. CSS: één kaart (veld boven zonder onderrand, lijst eronder zonder bovenrand, zelfde straal), hoogte = knophoogte, beweging uit bij
//     prefers-reduced-motion, geen nieuwe position:fixed, telefoonblok als laatste;
//  D. oude fout: Ctrl+K op de «Студія» van id opende naast het zoekveld ook de eigen keuzelijst (twee vensters, focus weg).
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { checker } from './hulp/nep-google';

const lees = (f: string) => readFileSync(f, 'utf8');

// Minimale browseromgeving voor het importeren van ZoekGlobaal (zelfde als zoek-in-menu-20261024).
function nepBrowser(): () => void {
  const g = globalThis as Record<string, unknown>;
  const voor = new Map(['window', 'document', 'location', 'sessionStorage', 'localStorage', 'history', 'matchMedia', 'navigator', 'CSS'].map((k) => [k, Object.getOwnPropertyDescriptor(g, k)]));
  const opslag = () => { const m = new Map<string, string>(); return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { m.set(k, String(v)); }, removeItem: (k: string) => { m.delete(k); }, clear: () => m.clear(), key: () => null, length: 0 }; };
  const u = new URL('https://hub.tarasevych.com/');
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
  const { check, einde } = checker('zoek-veld-op-plek-20261115');
  const herstel = nepBrowser();
  const { groeiPlek, veldDoel, default: ZoekGlobaal } = await import('../../src/zoek/ZoekGlobaal');

  // ================================================================ A. rekenwerk
  check('A ruim scherm (1440, menu links 316 px): het veld groeit van 274 tot 576 px (36rem)', veldDoel(274, 982, 332) === 576);
  check('A smal (1100 px, menu smal): 165 → 576 als er ruimte is', veldDoel(165, 803, 68) === 576);
  check('A weinig ruimte (dock bovenaan naast de groep): toch minstens 440 px om resultaten te lezen', veldDoel(274, 977, 976) === 440);
  check('A nooit buiten het beeld: de groep schuift niet verder dan 8 px van de linkerrand', veldDoel(274, 100, 400) === 274 + 92);
  check('A nooit smaller dan de knop zelf', veldDoel(600, 50, 400) === 600);
  const r = (left: number, width: number) => ({ left, right: left + width, width });
  const rechts = groeiPlek(r(338, 44), 390, 374);
  check('A telefoon: ronde knop rechtsboven → vast aan zijn rechterrand, groeit naar links tot de volle breedte (374)', rechts.kant === 'right' && rechts.x === 8 && rechts.van === 44 && rechts.naar === 374, JSON.stringify(rechts));
  const links = groeiPlek(r(10, 44), 390, 374);
  check('A knop links (zone verplaatst): vast aan zijn linkerrand, groeit naar rechts', links.kant === 'left' && links.x === 10 && links.naar === 372, JSON.stringify(links));
  const mq = groeiPlek(r(1076, 269), 1440, 576);
  check('A «Макет»-knop (1076+269): rechterrand blijft, groeit naar links tot 576', mq.kant === 'right' && mq.x === 1440 - 1345 && mq.naar === 576, JSON.stringify(mq));

  // ================================================================ B. bron
  const bron = lees('src/zoek/ZoekGlobaal.tsx'); const code = bron.replace(/\/\/.*$/gm, '');
  check('B computer: het veld staat IN het anker (is-op-plek, geen portaal) en de knop is weg zolang het open is', code.includes("{opPlek ? null : trigger}") && code.includes("className='zk-uitklap is-veld is-op-plek'") && /createPortal\([\s\S]*?is-laag/.test(code) && code.includes('open && pos && !plek ? createPortal('));
  check('B één veld: ZoekVeld één keer gedefinieerd (const veld) en in beide plekken hergebruikt', (code.match(/<ZoekVeld /g) || []).length === 1 && (code.match(/\{veld\}/g) || []).length === 2);
  check('B groeien: eerst knopbreedte, één frame later de doelbreedte (data-gegroeid), hoogte = knophoogte (--zk-h)', code.includes('requestAnimationFrame(() => requestAnimationFrame(() => setGegroeid(true)))') && code.includes("['--zk-h' as string]") && code.includes("data-gegroeid={gegroeid ? '1' : '0'}"));
  check('B laag nooit onder de technische band (#root) en een uit beeld gescrolde knop → bovenste rij', code.includes("document.getElementById('root')?.getBoundingClientRect().top") && code.includes('r.top >= bovenMin ? r.top : rij'));
  check('B focus terug: de veldknop van dit anker als de oude knop weg is (niet de eerste zoekknop van de pagina)', code.includes('vanVeld.current = !!(vorigeFocus.current && anker.current?.contains(vorigeFocus.current))') && code.includes("vanVeld.current ? anker.current?.querySelector<HTMLElement>('[data-zoek-trigger]')"));
  check('B «Перейти до пошуку»: tooltip zegt wat er gebeurt (filters, alle resultaten, Ctrl+Enter), uk + nl', bron.includes('там фільтри, сортування й усі знайдені') && bron.includes('daar staan filters, sortering en alles wat gevonden is'));
  const veld = renderToStaticMarkup(createElement(ZoekGlobaal, { lang: 'nl', dienst: 'hub' }));
  check('B dicht: alleen de veldknop (geen invoerveld, geen lijst) in het anker', veld.includes('class="zk-anker"') && veld.includes('data-zoek-trigger="veld"') && !veld.includes('<input') && !veld.includes('zk-uitklap'));

  herstel();

  // ================================================================ C. CSS
  const css = lees('src/zoek/zoek-uitklap-veld.css'); const kaal = css.replace(/\/\*[\s\S]*?\*\//g, '');
  check('C geladen ná zoek.css en zoek-maquette.css', /import '\.\/zoek-maquette\.css';\s*import '\.\/zoek-uitklap-veld\.css';/.test(bron));
  check('C één kaart: veld zonder onderrand en met afgeronde bovenhoeken, lijst zonder bovenrand met afgeronde onderhoeken', kaal.includes('border-radius:var(--zk-straal) var(--zk-straal) 0 0;border-bottom-color:transparent') && kaal.includes('border-top-width:0;border-radius:0 0 var(--zk-straal) var(--zk-straal)'));
  check('C één contour bij focus: veld en lijst samen dezelfde rand', kaal.includes(':focus-within>.zk-veld>:is(.zk-box,.zk-pop-kader){border-color:var(--zk-rand-actief)}'));
  check('C hoogte = knophoogte; op de plek geen vaste laag', kaal.includes('height:var(--zk-h)') && kaal.includes('.is-op-plek[data-zoek-palet]{position:relative') && !/position:\s*fixed/.test(kaal));
  check('C prefers-reduced-motion: geen overgang', /@media \(prefers-reduced-motion:reduce\)\{[^}]*transition:none\}/.test(kaal));
  check('C telefoonblok (@media max-width) is het laatste blok van het bestand; geen hex-kleuren', kaal.trim().endsWith('}') && kaal.lastIndexOf('@media (max-width:900px)') > kaal.lastIndexOf('prefers-reduced-motion') && !/#[0-9a-f]{3,8}\b/i.test(kaal));

  // ================================================================ D. oude fout op id
  const atelier = lees('src/identiteit/IdentiteitAtelier.tsx');
  check('D «Студія»: Ctrl+K opent de eigen keuzelijst alleen zonder het zoekveld van de site', atelier.includes("e.key.toLowerCase() === 'k' && !document.querySelector('[data-zoek-trigger]')"));

  return einde();
}
