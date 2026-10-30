// Mijn Ruimte-extensie 0.6.2 — ZICHTBARE MARKERING van een tabblad waarin een AI NU leest, kijkt of handelt.
//
// Opdracht eigenaar 20.10.2026: «Обведення має бути лише тоді, коли ШІ-агенти працюють з вікном … а там, де пишеться "Простір",
// має писати, які ШІ ЗАРАЗ читають цей екран, і колір обрамлення залежить від присвоєного кольору агенту. Якщо декілька ШІ —
// внизу логотип, назва ШІ та їх дія; кольорова обрамка поруч тих, які читають.»
//
// Wat er daarom veranderde t.o.v. 0.6.1:
//  - de rand stond ALTIJD om de pagina zolang het slot open was. Nu staat ze er alleen als er een LEVENDE LEZER is: een AI die
//    binnen MARKERING_STAART_MS (shared/markering-agenten.ts, één getal, één plek) een opdracht in dit tabblad uitvoerde. Daarna
//    gaat ze zacht uit. Wie beslist wanneer: bridge.js, met het model van markeringLezers();
//  - het opschrift zei «Mijn Ruimte · ШІ користувача». Nu zegt het WIE en WAT: «Claude · читає сторінку». Weet de extensie de
//    agent niet, dan staat er eerlijk «ШІ» zonder naam;
//  - één kleur per profiel → één kleur PER AGENT (uit het accentpalet van de site, door de eigenaar te wijzigen);
//  - meer lezers = meer randen, naast elkaar (elk 3 px naar binnen) + een strook onderaan met logo, naam en actie per AI.
//
// Regels (bewust, en niet te omzeilen door de pagina) — ongewijzigd t.o.v. 0.6.1:
//  - alles in een EIGEN shadow DOM (`mode: 'closed'`): geen stijl of selector van de site raakt het, en de site kan het niet
//    lezen of veranderen. De pagina blijft precies zoals ze was;
//  - `pointer-events: none` op de host en op alles erin: de markering onderschept nooit een klik, hover of selectie;
//  - `position: fixed` met `box-shadow: inset` als rand: geen layout-verschuiving, geen scrollbalk, geen reflow;
//  - de stijl gaat via een GECONSTRUEERD stylesheet (adoptedStyleSheets), niet via <style>: het Content-Security-Policy van de
//    pagina raakt het daardoor niet. Lukt dat niet, dan een <style> in de shadow root;
//  - `prefers-reduced-motion`: geen animatie en geen overgang, alleen aan of uit;
//  - `aria-hidden` en geen tekst in de toegankelijkheidsboom: schermlezers lezen de markering niet voor;
//  - `verberg()`/`toon()`: background.js zet de markering weg vlak vóór chrome.tabs.captureVisibleTab, zodat ze NIET op de
//    momentopname staat, en zet haar daarna terug (de actie «робить знімок» blijft dus wél te zien, alleen niet óp de foto);
//  - `verwijder()` haalt alles weg; bridge.js doet dat zodra het slot dicht gaat, de verbinding wegvalt of het profiel wisselt.
// De module bewaart niets over de gebruiker en praat met niemand: bridge.js bepaalt wat er te zien is.
import { MERK_AGENTEN, monogram } from './merk-agenten.js';
import { MARKERING_KLEUREN } from './shared.js';

const HOST_ID = 'mr-markering';
/** Alleen de zachte overgang van de markering zelf; de LEVENSDUUR van een lezer staat in shared/markering-agenten.ts. */
const DOOF_MS = 260;
/** Hoeveel px elke volgende rand naar binnen staat, zodat twee kleuren naast elkaar beide te zien zijn. */
const RAND_STAP = 3;
const SVG = 'http://www.w3.org/2000/svg';

let host = null;
let root = null;
let laag = null;   // <div class="laag"> waarin alles zit (één plek om zacht te doven)
let randen = null; // <div> met één .rand per lezer
let strook = null; // <div> met één .pil per lezer
let doofTimer = null;
let toonTimer = null;
let huidig = null; // { ruimte, sleutel }

const rustig = () => {
  try { return !!(typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches); } catch { return false; }
};
const donker = () => {
  try { return !!(typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: dark)').matches); } catch { return false; }
};
/** De kleur die bij de huidige pagina past: `licht` op een lichte pagina, `donker` op een donkere (beide uit ACCENT_KLEUREN). */
const kleurVan = (k) => (k && typeof k === 'object' ? (donker() ? k.donker || k.licht : k.licht || k.donker) : String(k || '#6b7280'));

const CSS = () => `
:host{all:initial}
*{box-sizing:border-box;pointer-events:none}
.laag{position:fixed;inset:0;pointer-events:none;z-index:2147483647;opacity:1;transition:opacity ${DOOF_MS}ms ease-out}
.laag[data-weg="ja"]{opacity:0}
.rand{position:fixed;pointer-events:none;border-radius:2px;box-shadow:inset 0 0 0 2px var(--k),inset 0 0 14px -4px var(--k)}
/* Technisch profiel: ook met dezelfde agentkleur altijd te onderscheiden van het gebruikersslot — een streepjesrand erbuiten. */
.tech{position:fixed;inset:0;pointer-events:none;border:2px dashed ${MARKERING_KLEUREN.technisch};border-radius:3px;opacity:.9}
.strook{position:fixed;left:10px;right:10px;bottom:8px;pointer-events:none;display:flex;flex-wrap:wrap;gap:4px;align-items:center;justify-content:flex-start}
.pil{display:flex;align-items:center;gap:5px;max-width:min(360px,46vw);padding:2px 8px 2px 3px;border-radius:999px;
  background:var(--k);color:var(--t);opacity:.92;font:600 11px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif;letter-spacing:.02em;
  box-shadow:0 1px 4px rgba(0,0,0,.28)}
.pil.tel{padding:2px 8px;font-weight:500}
.pil.merk-tech{border-left:3px dashed rgba(255,255,255,.75)}
.logo{flex:0 0 auto;width:16px;height:16px;border-radius:4px;overflow:hidden}
.mono{flex:0 0 auto;width:16px;height:16px;border-radius:4px;display:flex;align-items:center;justify-content:center;
  background:rgba(255,255,255,.22);font:700 8px/1 system-ui,sans-serif}
.tekst{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
@media (prefers-reduced-motion: reduce){.laag{transition:none}}
`;

function zetStijl() {
  try {
    const blad = new CSSStyleSheet();
    blad.replaceSync(CSS());
    root.adoptedStyleSheets = [blad];
    return;
  } catch { /* oude engine of geen constructable stylesheets */ }
  const s = document.createElement('style');
  s.textContent = CSS();
  root.prepend(s);
}

/** Shadow DOM aanmaken. Op document.documentElement, zodat een pagina die <body> vervangt de markering niet meesleurt. */
function bouw() {
  if (host && host.isConnected) return;
  host = document.createElement('div');
  host.id = HOST_ID;
  host.setAttribute('aria-hidden', 'true');
  for (const [k, v] of [['all', 'initial'], ['position', 'fixed'], ['inset', '0'], ['pointer-events', 'none'], ['z-index', '2147483647']]) {
    try { host.style.setProperty(k, v, 'important'); } catch { /* geen CSSOM */ }
  }
  root = host.attachShadow({ mode: 'closed' });
  laag = document.createElement('div');
  laag.className = 'laag';
  randen = document.createElement('div');
  strook = document.createElement('div');
  strook.className = 'strook';
  laag.append(randen, strook);
  root.append(laag);
  zetStijl();
  (document.documentElement || document.body).append(host);
}

/** Wit of (bijna) zwart op deze kleur, zodat de naam leesbaar blijft (zelfde maat als merkHelderheid in het merkregister). */
function tekstOp(hex) {
  const n = parseInt(String(hex || '').replace('#', ''), 16);
  if (!Number.isFinite(n)) return '#fff';
  const l = (0.2126 * ((n >> 16) & 255) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255)) / 255;
  return l > 0.62 ? '#111827' : '#fff';
}

/** Logo van het merkregister als 16 px tegel; onbekende agent → monogram van zijn naam (of «ШІ» → «ШІ»-letters). */
function logoVan(slug, naam) {
  const def = slug ? MERK_AGENTEN[slug] : null;
  if (!def) {
    const el = document.createElement('div');
    el.className = 'mono';
    el.textContent = monogram(naam || 'AI');
    return el;
  }
  const svg = document.createElementNS(SVG, 'svg');
  svg.setAttribute('class', 'logo');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  if (def.vlak) {
    const r = document.createElementNS(SVG, 'rect');
    r.setAttribute('width', '24'); r.setAttribute('height', '24'); r.setAttribute('rx', '5');
    r.setAttribute('fill', def.vlak);
    svg.append(r);
  }
  const p = document.createElementNS(SVG, 'path');
  p.setAttribute('d', def.d || '');
  p.setAttribute('fill', def.kleur || '#000');
  if (def.regel) p.setAttribute('fill-rule', def.regel);
  svg.append(p);
  return svg;
}

/** Sleutel van het model: zo bouwt een status-push die niets verandert ook niets opnieuw (geen flikkering). */
const sleutelVanModel = (ruimte, model) => `${ruimte}|${model.extra}|${model.lezers.map((l) => `${l.slug || l.naam || '?'}:${l.actie[0]}:${kleurVan(l.kleur)}`).join(',')}`;

/**
 * Markering tekenen of weghalen.
 * `staat` = null (weg) of { ruimte, model, nederlands } waarin `model` de uitkomst van markeringLezers() is.
 * Idempotent: hetzelfde model tekent niets opnieuw.
 */
export function zetMarkering(staat) {
  const model = staat && staat.model;
  const ruimte = staat && staat.ruimte === 'technisch' ? 'technisch' : 'prive';
  if (!model || !Array.isArray(model.lezers) || model.lezers.length === 0) { doof(); return false; }
  const sleutel = sleutelVanModel(ruimte, model);
  bouw();
  clearTimeout(doofTimer); doofTimer = null;
  if (laag) laag.setAttribute('data-weg', 'nee');
  if (huidig && huidig.sleutel === sleutel && host.isConnected) return true;
  huidig = { ruimte, sleutel, aantal: model.lezers.length, extra: model.extra };
  const nl = !!(staat && staat.nederlands);

  // 1. randen: één per lezer, elk RAND_STAP px verder naar binnen — de kleuren staan zo náást elkaar.
  randen.textContent = '';
  if (ruimte === 'technisch') {
    const t = document.createElement('div');
    t.className = 'tech';
    randen.append(t);
  }
  const basis = ruimte === 'technisch' ? RAND_STAP : 0;
  model.lezers.forEach((lezer, i) => {
    const d = document.createElement('div');
    d.className = 'rand';
    const in_ = basis + i * RAND_STAP;
    d.style.setProperty('inset', `${in_}px`);
    d.style.setProperty('--k', kleurVan(lezer.kleur));
    randen.append(d);
  });

  // 2. strook onderaan: logo + naam + actie per lezer, daarna «та ще N» en (technisch) het profiel.
  strook.textContent = '';
  for (const lezer of model.lezers) {
    const kleur = kleurVan(lezer.kleur);
    const pil = document.createElement('div');
    pil.className = `pil${ruimte === 'technisch' ? ' merk-tech' : ''}`;
    pil.style.setProperty('--k', kleur);
    pil.style.setProperty('--t', tekstOp(kleur));
    pil.append(logoVan(lezer.slug, lezer.naam));
    const t = document.createElement('div');
    t.className = 'tekst';
    t.textContent = `${lezer.naam || (nl ? 'AI' : 'ШІ')} · ${lezer.actie[nl ? 1 : 0]}`;
    pil.append(t);
    strook.append(pil);
  }
  const rest = [];
  if (model.extra > 0) rest.push(nl ? `en nog ${model.extra}` : `та ще ${model.extra}`);
  if (ruimte === 'technisch') rest.push(nl ? 'technisch profiel' : 'технічний профіль');
  for (const tekst of rest) {
    const pil = document.createElement('div');
    pil.className = 'pil tel';
    pil.style.setProperty('--k', '#1f2937');
    pil.style.setProperty('--t', '#fff');
    const t = document.createElement('div');
    t.className = 'tekst';
    t.textContent = tekst;
    pil.append(t);
    strook.append(pil);
  }
  return true;
}

/** Zacht uit: na DOOF_MS is alles weg. Bij prefers-reduced-motion meteen weg (geen overgang die iemand ziet bewegen). */
function doof() {
  if (!host || !host.isConnected) { verwijder(); return; }
  if (rustig()) { verwijder(); return; }
  if (!laag) { verwijder(); return; }
  if (laag.getAttribute('data-weg') === 'ja') return;
  laag.setAttribute('data-weg', 'ja');
  huidig = null;
  clearTimeout(doofTimer);
  doofTimer = setTimeout(() => { verwijder(); }, DOOF_MS + 40);
}

/**
 * Markering even wegzetten (background.js vlak vóór chrome.tabs.captureVisibleTab). Zonder tweede `toon()` komt ze na
 * `ms` zelf terug: zo blijft er nooit een onzichtbare markering achter als de momentopname mislukt.
 */
export function verberg(ms = 1500) {
  if (!host) return false;
  try { host.style.setProperty('display', 'none', 'important'); } catch { return false; }
  clearTimeout(toonTimer);
  toonTimer = setTimeout(() => { toon(); }, Math.min(5000, Math.max(200, Number(ms) || 1500)));
  return true;
}
export function toon() {
  clearTimeout(toonTimer); toonTimer = null;
  if (!host) return false;
  try { host.style.setProperty('display', 'block', 'important'); } catch { return false; }
  return true;
}

/** Alles weg: na intrekken, «Стоп», verlies van de verbinding of een profielwissel. */
export function verwijder() {
  clearTimeout(doofTimer); doofTimer = null;
  clearTimeout(toonTimer); toonTimer = null;
  huidig = null;
  if (host) { try { host.remove(); } catch { /* al weg */ } }
  host = null; root = null; laag = null; randen = null; strook = null;
}

/** Alleen voor de zelftest van de extensie en de eenheidstest: staat de markering nu aan, voor welke ruimte, en wie leest er? */
export const markeringStand = () => (huidig
  ? { ruimte: huidig.ruimte, sleutel: huidig.sleutel, aanwezig: !!(host && host.isConnected), lezers: huidig.aantal, extra: huidig.extra }
  : null);
