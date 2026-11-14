// De globale zoekknop IN HET MENU op de post (24.10.2026, één update). Draaien: node scripts/eenheidstests.mjs zoek-in-menu-20261024
// Wens van de eigenaar: «кнопка пошуку по всьому сайту з відділу пошти замість того щоб бути поверх меню акаунтів пошти, буде
// відображено натомість в меню між фото профілю та кнопкою редагування меню».
//  A. bron (src/CanoniekOmlijsting.tsx): op de post (current==='mail') geen veld-knop in .canonical-account-anchor en geen ronde knop
//     (.zk-trigger-mobiel) in de bovenbalk, wél één ZoekGlobaal zonderKnop (palet + ⌘K, ook met de lade dicht); lade-kop in de volgorde
//     profielfoto → zoekknop → «Редагувати меню» → «Закрити»; de zijbalk-werkbalk krijgt zoek={zoekInMenu}; andere diensten ongewijzigd.
//  B. structuur (renderToStaticMarkup): ZoekMenuKnop in uk en nl, ZoekGlobaal zonderKnop rendert niets, ZijbalkWerkbalk breed/dock/
//     bewerken: zoekknop vlak vóór «Налаштувати меню» / «Завершити редагування», smal: direct onder de modusknop; zonder `zoek` niets.
//  C. CSS: lade-knop 44 px, «Редагувати меню» verliest margin-left:auto alleen als de zoekknop ervoor staat; geen hex.
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { checker } from './hulp/nep-google';

const lees = (f: string) => readFileSync(f, 'utf8');
const volgorde = (s: string, ...delen: string[]) => { let vanaf = -1; for (const d of delen) { const i = s.indexOf(d, vanaf + 1); if (i < 0 || i <= vanaf) return false; vanaf = i; } return true; };
const tel = (s: string, d: string) => s.split(d).length - 1;

// Zelfde nagebootste browser als zoek-ui-20261022 (canonical-service leest window.__TSV_CANONICAL_SERVICE__ bij het laden).
function nepBrowser(): () => void {
  const g = globalThis as Record<string, unknown>;
  const voor = new Map(['window', 'document', 'location', 'sessionStorage', 'localStorage', 'history', 'matchMedia', 'navigator', 'CSS'].map((k) => [k, Object.getOwnPropertyDescriptor(g, k)]));
  const opslag = () => { const m = new Map<string, string>(); return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { m.set(k, String(v)); }, removeItem: (k: string) => { m.delete(k); }, clear: () => m.clear(), key: () => null, length: 0 }; };
  const u = new URL('https://mail.tarasevych.com/postvak-in');
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
  const { check, einde } = checker('zoek in menu 20261024');

  // ================================================================ A. bron
  const chrome = lees('src/CanoniekOmlijsting.tsx');
  check('A post = zoekInMenu (alleen current===\'mail\')', chrome.includes("const zoekInMenu=current==='mail';"));
  const kop = chrome.slice(chrome.indexOf("<header className='canonical-topbar'>"), chrome.indexOf('<CanonicalNotificationCenter', chrome.indexOf("<header className='canonical-topbar'>")));
  // 25.10.2026: het anker is de ZONE «bovenbalk» (shared/plaatsing.ts): zoeken · foto · gniezda (bel rechts van de foto). Op de post blijft
  // daar geen zoekveld; op de telefoon staat de ronde zoekknop IN dezelfde zone (bewoner vooraan), alleen buiten de post.
  check('A bovenbalk computer: op de post geen veld-knop naast de profielfoto (anker = {account} + gniezda van de zone)', kop.includes("<div className='canonical-account-anchor' {...zoneBoven}>{!zoekInMenu&&<ZoekGlobaal lang={lang} dienst={current}/>}{account}<Gniezda zone='bovenbalk' ind={plaatsInd}/></div>"), kop);
  check('A bovenbalk telefoon: op de post geen ronde knop rechtsboven (die lag op het Gmail-avatar) — de ronde knop staat alleen buiten de post in de zone',
    kop.includes("{touchMode&&bovenTelefoon&&<div className='canonical-account-anchor plaats-boven-telefoon' {...zoneBoven}>{!zoekInMenu&&<ZoekGlobaal lang={lang} mobiel dienst={current}/>}") && chrome.includes('bovenTelefoon=!zoekInMenu||bovenN>0||plaatsS.sleep!==null'));
  check('A palet + ⌘K blijven op de post: één ZoekGlobaal zonderKnop direct in de bovenbalk (niet in de lade, die gaat dicht)', kop.includes('{zoekInMenu&&<ZoekGlobaal lang={lang} dienst={current} zonderKnop/>}') && tel(chrome, '<ZoekGlobaal ') === 3 && tel(chrome, 'zonderKnop/>') === 1);
  const lade = chrome.slice(chrome.indexOf("{drawer?<div className='canonical-drawer-header'>"), chrome.indexOf("data-sidebar-action='close-drawer'"));
  check('A lade-kop: profielfoto (· gniezda van de zone, bel) → zoekknop → «Редагувати меню», lade sluit vóór het palet', volgorde(lade, "className='canonical-drawer-account'>{account}</div><Gniezda zone='lade-kop' ind={plaatsInd}/></div>", "<ZoekMenuKnop lang={lang} className='zk-menu-knop zk-menu-knop-lade' voorOpenen={closeDrawer}/>", 'menu-lade-bewerken'), lade.slice(0, 400));
  const werkbalk = chrome.slice(chrome.indexOf('<ZijbalkWerkbalk '), chrome.indexOf('/>}', chrome.indexOf('<ZijbalkWerkbalk ')));
  check('A zijbalk-werkbalk (computer) krijgt zoek', werkbalk.includes(' zoek '), werkbalk.slice(0, 300));
  check('A import: ZoekMenuKnop uit ./search/ZoekGlobaal', chrome.includes("import ZoekGlobaal,{ZoekMenuKnop}from'./zoek/ZoekGlobaal';"));

  const zg = lees('src/zoek/ZoekGlobaal.tsx');
  check('A palet: focus terug naar de knop, en als die weg is (lade dicht) naar een zoekknop of de menuknop die de lade opent', zg.includes('focusTerug(vorigeFocus.current)') && zg.includes('[data-zoek-trigger], .canonical-menu-toggle[data-sidebar-action="open-drawer"]'));
  check('A ZoekMenuKnop opent hetzelfde palet (openZoekPalet → PALET_EVENT), niet een tweede instantie', /onClick=\{\(\) => \{ voorOpenen\?\.\(\); openZoekPalet\(\); \}\}/.test(zg) && tel(zg, 'useState(false)') === 1);

  // ================================================================ B. structuur
  const herstel = nepBrowser();
  const stil = console.error; console.error = () => {};
  try {
  const { default: ZoekGlobaal, ZoekMenuKnop } = await import('../../src/zoek/ZoekGlobaal');
  const ZijbalkWerkbalk = (await import('../../src/ZijbalkWerkbalk')).default;
  const uk = renderToStaticMarkup(createElement(ZoekMenuKnop, { lang: 'uk', className: 'zk-menu-knop zk-menu-knop-lade' }));
  check('B lade-knop uk: «Пошук у «Мій простір»», ⌘K/Ctrl+K in aria-keyshortcuts, opent een dialoog, data-zoek-trigger=menu, title (aanraakscherm: geen tooltiplaag)',
    uk.includes('aria-label="Пошук у «Мій простір»"') && uk.includes('aria-keyshortcuts="Control+K Meta+K"') && uk.includes('aria-haspopup="dialog"') && uk.includes('data-zoek-trigger="menu"') && uk.includes('title="Пошук у «Мій простір»"') && !uk.includes('data-tooltip=') && uk.includes('class="zk-menu-knop zk-menu-knop-lade"') && uk.includes('<svg'), uk);
  const nl = renderToStaticMarkup(createElement(ZoekMenuKnop, { lang: 'nl', className: 'zijbalk-werkbalk-zoek', sneltoets: true, tooltip: true, tooltipKant: 'right' }));
  check('B werkbalk-knop nl: «Zoeken in «Mijn Ruimte» (Ctrl K)» in de tooltiplaag van de zijbalk (data-tooltip + kant), geen title', nl.includes('aria-label="Zoeken in «Mijn Ruimte» (Ctrl K)"') && nl.includes('data-tooltip="Zoeken in «Mijn Ruimte» (Ctrl K)"') && nl.includes('data-tooltip-placement="right"') && !nl.includes('title='), nl);
  check('B ZoekGlobaal zonderKnop rendert geen knop (alleen het palet zodra het opengaat)', renderToStaticMarkup(createElement(ZoekGlobaal, { lang: 'uk', dienst: 'mail', zonderKnop: true })) === '');
  const veld = renderToStaticMarkup(createElement(ZoekGlobaal, { lang: 'uk', dienst: 'cloud' })), rond = renderToStaticMarkup(createElement(ZoekGlobaal, { lang: 'uk', dienst: 'cloud', mobiel: true }));
  check('B andere diensten ongewijzigd: veld-knop (computer) en ronde knop (telefoon)', veld.includes('class="zk-trigger"') && veld.includes('data-zoek-trigger="veld"') && rond.includes('class="zk-trigger-mobiel"') && rond.includes('data-zoek-trigger="mobiel"'));

  const wb = (extra: Record<string, unknown>) => renderToStaticMarkup(createElement(ZijbalkWerkbalk, { lang: 'uk', modus: 'open', breed: true, onModus: () => undefined, instellingenHref: '/instellingen/menu', onInstellingen: () => undefined, onBewerken: () => undefined, ...extra } as never));
  const breed = wb({ zoek: true });
  const pil = breed.slice(breed.indexOf('role="toolbar"'));
  check('B computer breed: eigen zoekknop direct vóór de pil met «Налаштувати меню», buiten role=toolbar «Режим бічної панелі»', volgorde(breed, 'zijbalk-werkbalk-titel', 'data-zoek-trigger="menu"', 'role="toolbar"', 'data-zijbalk-modus="open"', 'data-menu-venster-knop') && !pil.includes('data-zoek-trigger') && tel(breed, 'data-zoek-trigger=') === 1 && breed.includes('aria-label="Пошук у «Мій простір» (Ctrl K)"'), breed);
  const wbBron = lees('src/ZijbalkWerkbalk.tsx');
  check('B in-/uitklappen houdt HETZELFDE element (key=zoek, 2e kind in breed én smal) → focus komt na Escape terug', wbBron.includes("<ZoekMenuKnop key='zoek'") && wbBron.includes("{lang==='uk'?'Меню':'Menu'}</span>{zoekKnop}{balk}{vensterEl}") && /onClick=\{\(\)=>setOpen\(v=>!v\)\}><Huidig aria-hidden='true'\/><\/button>\n    \{zoekKnop\}/.test(wbBron) && wbBron.includes('N=modi.length+1'));
  const zonder = wb({});
  check('B zonder `zoek` (alle andere diensten): geen zoekknop, werkbalk als voorheen (3 modi + «Налаштувати меню»)', !zonder.includes('data-zoek-trigger') && tel(zonder, 'data-zijbalk-modus="') === 3 && zonder.includes('data-menu-venster-knop'));
  const smal = wb({ zoek: true, breed: false, modus: 'auto' });
  check('B computer smal: zoekknop zichtbaar direct onder de modusknop, niet in het paneeltje', volgorde(smal, 'zijbalk-modus-huidig', 'class="zijbalk-werkbalk-zoek smal"') && tel(smal, 'data-zoek-trigger=') === 1 && !smal.includes('data-zijbalk-paneel'), smal);
  const dok = wb({ zoek: true, dock: true });
  check('B dock (boven/onder): zoekknop vóór «Налаштувати меню», geen modusknoppen', volgorde(dok, 'data-zoek-trigger="menu"', 'data-menu-venster-knop') && !dok.includes('data-zijbalk-modus="'), dok);
  const bewerk = wb({ zoek: true, bewerken: true });
  check('B tijdens «Редагування меню»: zoekknop vóór «Завершити редагування»', volgorde(bewerk, 'data-zoek-trigger="menu"', 'data-menu-bewerken-knop'), bewerk);
  const nlBreed = wb({ zoek: true, lang: 'nl' });
  check('B nl: werkbalk-knop «Zoeken in «Mijn Ruimte» (Ctrl K)»', nlBreed.includes('aria-label="Zoeken in «Mijn Ruimte» (Ctrl K)"'));

  } finally { console.error = stil; herstel(); }

  // ================================================================ C. CSS
  const css = lees('src/zoek/zoek.css').replace(/\/\*[\s\S]*?\*\//g, ''), mv2 = lees('src/menu-v2.css');
  const regel = (bron: string, sel: string) => { const i = bron.indexOf(`${sel}{`); return i < 0 ? '' : bron.slice(i, bron.indexOf('}', i) + 1); };
  const laDe = regel(css, '.canonical-drawer-header .zk-menu-knop-lade');
  check('C lade-knop: 44×44 (tik-hoogte-mobiel), rond, schuift naar rechts (margin-left:auto) naast «Редагувати меню»', laDe.includes('width:var(--tik-hoogte-mobiel)') && laDe.includes('height:var(--tik-hoogte-mobiel)') && laDe.includes('border-radius:50%') && laDe.includes('margin:0 2px 0 auto') && laDe.includes('flex:none'), laDe);
  check('C «Редагувати меню»: margin 0 0 0 auto (geen geërfde onderrand 12 px meer → op één rij met foto en «Закрити»), direct na de zoekknop margin-left 0', regel(mv2, '.canonical-drawer-header .menu-lade-bewerken').includes('margin:0 0 0 auto') && regel(css, '.canonical-drawer-header .zk-menu-knop-lade+.menu-lade-bewerken') === '.canonical-drawer-header .zk-menu-knop-lade+.menu-lade-bewerken{margin-left:0}');
  check('C focus zichtbaar (var(--focus)) en hover uit de tokens (ook breed: hover ná de basisregel); 34 px / breed 36 px zoals de pil; geen hex', css.includes('.canonical-drawer-header .zk-menu-knop-lade:focus-visible{outline:2px solid var(--focus);outline-offset:2px}') && regel(css, '.zijbalk-werkbalk .zijbalk-werkbalk-zoek').includes('width:34px') && regel(css, '.zijbalk-werkbalk.breed .zijbalk-werkbalk-zoek').includes('height:36px') && css.indexOf('.zijbalk-werkbalk .zijbalk-werkbalk-zoek:hover') > css.indexOf('.zijbalk-werkbalk.breed .zijbalk-werkbalk-zoek{') && !/#[0-9a-f]{3,8}\b/i.test(css));

  return einde();
}
