// Afdrukken (Ctrl+P) — INTEG-001 / TEMA print (03.11.2026). Eigenaar: «bij Ctrl+P wil ik de hele pagina op papier, niet alleen het zichtbare deel».
// Dit bestand toetst de statische kant zonder browser:
//  A. de oorzaak staat er nog (schil met vaste hoogte/vaste lagen) én src/afdruk.css heeft voor elk onderdeel een tegenregel;
//  B. de afdrukregels bevatten de nodige selectors, verbergen de schil, laten rijen-als-knop (/agenten) staan en bevatten zélf geen
//     afkapping (geen overflow hidden/auto, geen vaste hoogte, geen position fixed/sticky/absolute);
//  C. de beslisregels van src/platform/afdruk.ts (puur): schil/balk/scrollvenster/sticky/sr-only, knop met of zonder inhoud;
//  D. een server-rendering (react-dom/server) van een representatieve rij/tegel/actieknop, door dezelfde knopregel gehaald;
//  E. de bedrading: main.tsx installeert, geen <style>-tags of innerHTML (CSP style-src 'self'), herstelcodes blijven werken.
// De echte afdruk (Chrome printToPDF op de gebouwde CSS) doet scripts/afdruk-proef.mjs; die heeft een browser en een build nodig en staat
// daarom niet in deze reeks (zie het verslag: uitkomst en aantallen).
import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { checker } from './hulp/nep-google';
import { AFDRUK_ATTR, LUI_PLAATSHOUDERS, bereidAfdrukVoor, beslis, bijAfdrukVoorbereiding, installeerAfdruk, isInhoudsKnop, laadLuieInhoud, type Meting } from '../../src/platform/afdruk';

const lees = (p: string) => readFileSync(p, 'utf8');

// ── kleine CSS-lezer: regels binnen @media print ────────────────────────────────────────────────────────────────────────────────────
type Regel = { selectors: string[]; body: string };
const zonderCommentaar = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '');
function blok(css: string, kop: RegExp): string {
  const m = kop.exec(css);
  if (!m) return '';
  let i = css.indexOf('{', m.index), diepte = 0;
  const begin = i + 1;
  for (; i < css.length; i++) { if (css[i] === '{') diepte++; else if (css[i] === '}' && --diepte === 0) return css.slice(begin, i); }
  return '';
}
function splitsSelectors(lijst: string): string[] {
  const uit: string[] = []; let diepte = 0, huidig = '';
  for (const c of lijst) {
    if (c === '(' || c === '[') diepte++; if (c === ')' || c === ']') diepte--;
    if (c === ',' && diepte === 0) { uit.push(huidig.trim()); huidig = ''; } else huidig += c;
  }
  if (huidig.trim()) uit.push(huidig.trim());
  return uit;
}
function regels(binnen: string): Regel[] {
  const uit: Regel[] = []; const re = /([^{}]+)\{([^{}]*)\}/g; let m: RegExpExecArray | null;
  while ((m = re.exec(binnen))) uit.push({ selectors: splitsSelectors(m[1]), body: m[2] });
  return uit;
}
const heeftDecl = (r: Regel, eigenschap: string, waarde: RegExp) => new RegExp(`(^|;|\\s)${eigenschap}\\s*:\\s*(${waarde.source})\\s*!important`, 'i').test(r.body);

export async function main(): Promise<number> {
  const { check, einde } = checker('afdruk-20261103');
  const css = zonderCommentaar(lees('src/afdruk.css'));
  const print = regels(blok(css, /@media\s+print\s*\{/));
  const alleSelectors = new Set(print.flatMap((r) => r.selectors));
  const regelMet = (sel: string) => print.filter((r) => r.selectors.includes(sel));
  const verborgen = new Set(print.filter((r) => heeftDecl(r, 'display', /none/)).flatMap((r) => r.selectors));

  // ── A. de oorzaak (scherm) en de tegenregel (papier) ───────────────────────────────────────────────────────────────────────────
  const omlijsting = lees('src/canoniek-omlijsting.css');
  check('oorzaak 1: html/body/#root hebben op het scherm vaste hoogte met overflow:hidden', /html,body,#root\{[^}]*height:100%[^}]*overflow:hidden\}/.test(omlijsting));
  check('oorzaak 2: .canonical-workspace is een vast scrollvenster (position:fixed + overflow:auto)', /\.canonical-workspace\{[^}]*position:fixed;inset:0[^}]*overflow:auto/.test(omlijsting));
  check('oorzaak 3: .canonical-chrome is vast en afgeknipt (position:fixed + overflow:hidden)', /\.canonical-chrome\.theme-light\{[^}]*position:fixed;inset:0[^}]*overflow:hidden\}/.test(omlijsting));
  check('index.html bevat dezelfde vaste hoogte (boot-stijl) — print wint met !important', /html,body,#root\{width:100%;height:100%;min-height:100%;overflow:hidden\}/.test(lees('index.html')));
  for (const sel of ['html', 'body', '#root', '.canonical-chrome', '.canonical-workspace', '.canonical-content']) {
    const r = regelMet(sel);
    check(`tegenregel: ${sel} → hoogte vrij, geen max-hoogte, overflow zichtbaar (!important)`, r.some((x) => heeftDecl(x, 'height', /auto/) && heeftDecl(x, 'max-height', /none/) && heeftDecl(x, 'overflow', /visible/)));
  }
  for (const sel of ['.canonical-chrome', '.canonical-workspace', '#root']) check(`tegenregel: ${sel} niet meer vast (position:static !important)`, regelMet(sel).some((x) => heeftDecl(x, 'position', /static/)));
  check('@page heeft marges', /@page\s*\{[^}]*margin:/.test(css));

  // ── B. selectors, verbergen, geen eigen afkapping ──────────────────────────────────────────────────────────────────────────────
  for (const sel of ['.canonical-sidebar', '.canonical-topbar', '.canonical-drawer', '.canonical-notification-center', '.canonical-connection-banner', '.canonical-scroll-top', '.canonical-sidebar-scrim', '.plaats-actiestapel', '.tech-band', '#tech-laag', '#boot-shell', 'body::after', 'body::before', 'nav', "[role='navigation']", "[role='toolbar']", "[role='tablist']", "button[class*='knop']", "a[class*='knop']", ".afdruk-verberg", '[data-afdruk-verberg]', "[data-afdruk-auto~='verberg']", "[data-afdruk-auto~='knop']"]) {
    check(`schil/balken verborgen: ${sel}`, verborgen.has(sel));
  }
  check('open vensters en achterlagen vallen weg ([role=dialog], dialog, .modal-backdrop)', verborgen.has("[role='dialog']") && verborgen.has('dialog') && verborgen.has('.modal-backdrop'));
  check('REGRESSIE: gewone <button> en [role=button] worden NIET verborgen (een /agenten-rij is één knop met titel + status)', !verborgen.has('button') && !verborgen.has("[role='button']"));
  check('markeringen van afdruk.ts: ontgrendel en losmaken bestaan als regel', regelMet("[data-afdruk-auto~='ontgrendel']").some((x) => heeftDecl(x, 'overflow', /visible/) && heeftDecl(x, 'height', /auto/)) && regelMet("[data-afdruk-auto~='losmaken']").some((x) => heeftDecl(x, 'position', /static/)));
  check('hulpklassen voor nieuwe pagina\'s: .afdruk-ontgrendel, .afdruk-nieuwe-pagina, .afdruk-blok, .afdruk-alleen (scherm: weg)', alleSelectors.has('.afdruk-ontgrendel') && alleSelectors.has('.afdruk-nieuwe-pagina') && alleSelectors.has('.afdruk-blok') && /@media\s+screen\s*\{\s*\.afdruk-alleen\s*\{\s*display:\s*none\s*!important/.test(css));
  // Geen afkapping in de afdrukregels zelf.
  const slecht: string[] = [];
  for (const r of print) {
    const sel = r.selectors.join(', ').slice(0, 60);
    if (/(^|;|\s)position\s*:\s*(fixed|sticky|absolute)/i.test(r.body)) slecht.push(`${sel}: position`);
    if (/(^|;|\s)overflow(-x|-y)?\s*:\s*(hidden|auto|scroll|clip)/i.test(r.body)) slecht.push(`${sel}: overflow`);
    if (/(^|;|\s)(max-)?height\s*:\s*[\d.]+\s*(px|vh|dvh|svh|rem|em|%)/i.test(r.body)) slecht.push(`${sel}: vaste hoogte`);
    if (/100d?vh/.test(r.body)) slecht.push(`${sel}: 100vh`);
  }
  check('de afdrukregels bevatten zelf geen afkapping (geen overflow hidden/auto/scroll, geen vaste hoogte, geen fixed/sticky/absolute)', slecht.length === 0, slecht.join(' | '));
  const ontgrendel = print.filter((r) => /overflow\s*:\s*visible/.test(r.body));
  check('elke ontgrendelregel gebruikt !important (schermregels en inline stijl mogen niet winnen)', ontgrendel.length > 0 && ontgrendel.every((r) => /overflow\s*:\s*visible\s*!important/.test(r.body)));
  check('scrollvensters op klassenaam (terugval): [class*=scroll|lijst|tabel|paneel|inhoud] + pre + textarea zonder max-hoogte', ["[class*='scroll']", "[class*='lijst']", "[class*='tabel']", "[class*='paneel']", "[class*='inhoud']", 'pre', 'textarea'].every((s) => regelMet(s).some((x) => heeftDecl(x, 'max-height', /none/) && heeftDecl(x, 'overflow', /visible/))));
  check('donker thema: tokens worden op papier licht (--text, --bg, --panel, color-scheme) en gelden voor [class*=theme-] en .canonical-chrome', regelMet("[class*='theme-']").some((x) => heeftDecl(x, '--text', /#[0-9a-f]{3,8}/) && heeftDecl(x, '--bg', /#[0-9a-f]{3,8}/) && heeftDecl(x, '--panel', /#[0-9a-f]{3,8}/) && heeftDecl(x, 'color-scheme', /light/)) && regelMet('.canonical-chrome').some((x) => heeftDecl(x, '--text', /#[0-9a-f]{3,8}/)));
  check('kleurparen blijven kloppen: * { print-color-adjust: exact }', regelMet('*').some((x) => /print-color-adjust\s*:\s*exact/.test(x.body)));
  // Paginabreuk
  check('koppen blijven bij hun tekst (break-after: avoid h1–h6)', ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'].every((h) => regelMet(h).some((x) => /break-after\s*:\s*avoid/.test(x.body))));
  check('rijen/items/kaarten niet midden doorsnijden; tabel zelf mag over pagina\'s lopen', ['tr', 'li', "[class*='kaart']", '.afdruk-blok'].every((s) => regelMet(s).some((x) => /break-inside\s*:\s*avoid/.test(x.body))) && !regelMet('table').some((x) => /break-inside\s*:\s*avoid/.test(x.body)));
  check('tabelkop herhaalt zich op elke pagina (thead: table-header-group)', regelMet('thead').some((x) => /display\s*:\s*table-header-group/.test(x.body)));
  check('.afdruk-nieuwe-pagina begint op een nieuwe pagina', regelMet('.afdruk-nieuwe-pagina').some((x) => /break-before\s*:\s*page/.test(x.body)));
  check('lege plaatshouders van lui geladen secties kosten geen ruimte op papier', regelMet("[data-ag-lui='dicht']").some((x) => heeftDecl(x, 'min-height', /0/)) && regelMet("[data-afdruk-lui='dicht']").length > 0);
  // Herstelcodes
  const toegang = lees('src/toegangslaag.css');
  check('herstelcodes (body.herstel-afdruk): CSS van HerstelcodesSectie bestaat nog en afdruk.css laat al het andere écht wegvallen', /body\.herstel-afdruk \*\{visibility:hidden!important\}/.test(toegang) && /\.herstel-nieuw/.test(toegang) && /herstel-afdruk/.test(lees('src/HerstelcodesSectie.tsx')) && print.some((r) => r.selectors.some((s) => s.startsWith('body.herstel-afdruk :not(.herstel-nieuw)')) && heeftDecl(r, 'display', /none/)));

  // ── C. beslisregels (puur) ─────────────────────────────────────────────────────────────────────────────────────────────────────
  const m = (o: Partial<Meting>): Meting => ({ positie: 'static', overflowY: 'visible', scrollHoogte: 0, klantHoogte: 0, beeldFractie: 0, breedteFractie: 0, heeftInhoud: true, isOverlay: false, heeftKop: false, onzichtbaarHulp: false, ...o });
  const b = (o: Partial<Meting>) => { const r = beslis(m(o)); return `${r.ontgrendel ? 'O' : '-'}${r.losmaken ? 'L' : '-'}${r.verberg ? 'V' : '-'}`; };
  check('schil: vast + schermvullend + inhoud → vrijmaken (ontgrendel + losmaken), niet verbergen', b({ positie: 'fixed', beeldFractie: 1 }) === 'OL-');
  check('schermvullende achterlaag zonder inhoud → verbergen', b({ positie: 'fixed', beeldFractie: 1, heeftInhoud: false }) === '--V');
  check('schermvullend venster/overlay (alleen vensters erin) → verbergen', b({ positie: 'fixed', beeldFractie: 0.9, isOverlay: true }) === '--V');
  check('vaste balk/knop/melding (klein) → verbergen', b({ positie: 'fixed', beeldFractie: 0.05 }) === '--V' && b({ positie: 'fixed', beeldFractie: 0.49 }) === '--V');
  check('vaste paginakop met een kop erin (hele breedte, klein) → in de stroom, één keer; een hoekmelding met titel valt weg', b({ positie: 'fixed', beeldFractie: 0.05, breedteFractie: 1, heeftKop: true }) === 'OL-' && b({ positie: 'fixed', beeldFractie: 0.03, breedteFractie: 0.3, heeftKop: true }) === '--V');
  check('scrollvenster met meer inhoud dan zichtbaar → ontgrendelen (positie blijft)', b({ overflowY: 'auto', scrollHoogte: 900, klantHoogte: 400 }) === 'O--' && b({ overflowY: 'hidden', scrollHoogte: 500, klantHoogte: 120 }) === 'O--' && b({ overflowY: 'scroll', scrollHoogte: 402, klantHoogte: 400 }) === 'O--');
  check('afgekapte absolute container → ontgrendelen én losmaken', b({ positie: 'absolute', overflowY: 'hidden', scrollHoogte: 900, klantHoogte: 400 }) === 'OL-');
  check('scrollvenster zonder overschot, of overflow zichtbaar → niets doen', b({ overflowY: 'auto', scrollHoogte: 400, klantHoogte: 400 }) === '---' && b({ overflowY: 'auto', scrollHoogte: 401, klantHoogte: 400 }) === '---' /* 1 px afronding telt niet */ && b({ scrollHoogte: 900, klantHoogte: 400 }) === '---');
  check('sticky (bv. kop van een tabel) → losmaken, blijft zichtbaar', b({ positie: 'sticky' }) === '-L-');
  check('visueel verborgen hulptekst (sr-only: clip) blijft verborgen en wordt niet ontgrendeld', b({ onzichtbaarHulp: true, overflowY: 'hidden', scrollHoogte: 40, klantHoogte: 1 }) === '---' && b({ positie: 'fixed', onzichtbaarHulp: true, beeldFractie: 0 }) === '---');
  check('knop: korte actielabels en pictogrammen vallen weg', !isInhoudsKnop({ tekst: 'Видалити', tekstElementen: 1 }) && !isInhoudsKnop({ tekst: '✕', tekstElementen: 0 }) && !isInhoudsKnop({ tekst: '', tekstElementen: 0 }) && !isInhoudsKnop({ tekst: 'Токени 4', tekstElementen: 1 }));
  check('knop: titel + status (twee tekstdelen), een zin, of data-afdruk-toon blijft', isInhoudsKnop({ tekst: 'Claude actief', tekstElementen: 2 }) && isInhoudsKnop({ tekst: 'Dit is een hele zin met genoeg tekens erin', tekstElementen: 0 }) && isInhoudsKnop({ tekst: 'Ok', tekstElementen: 0, toon: true }));

  // ── D. server-rendering: dezelfde knopregel op echte React-uitvoer ────────────────────────────────────────────────────────────
  const e = createElement;
  const Rij = e('li', { className: 'ag-rij' }, e('div', { className: 'ag-rij-kop' },
    e('button', { type: 'button', className: 'ag-rij-toggle', 'aria-expanded': false }, e('span', { className: 'ag-rij-logo', 'aria-hidden': true }, e('svg', { viewBox: '0 0 1 1' }, e('path', { d: 'M0 0' }))), e('span', { className: 'ag-rij-tekst' }, e('span', { className: 'ag-rij-titel' }, e('b', null, 'Claude'), e('span', { className: 'ag-badge' }, 'активний')), e('small', { className: 'ag-rij-status' }, 'Підключено сьогодні'))),
    e('div', { className: 'ag-rij-acties' }, e('button', { type: 'button', className: 'ag-knop' }, e('svg', { viewBox: '0 0 1 1' }, e('path', { d: 'M0 0' })), 'Відкликати'), e('button', { type: 'button', 'aria-label': 'Sluiten' }, e('svg', { viewBox: '0 0 1 1' }, e('path', { d: 'M0 0' }))))));
  const Tegel = e('button', { type: 'button', className: 'ag-stat' }, e('span', { className: 'ag-stat-icoon' }), e('strong', null, '3'), e('span', null, 'ШІ підключено'));
  const html = renderToStaticMarkup(e('ul', null, Rij, e('li', null, Tegel)));
  const knoppen = [...html.matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/g)].map((k) => ({ attrs: k[1], binnen: k[2] }));
  // Tekstdelen binnen een knop: tekst direct in de knop telt als tekst (niet als element), tekst in kindelementen telt per element.
  const analyseer = (binnen: string) => {
    let diepte = 0, elementenMetTekst = 0, tekst = ''; const heeftEigen: boolean[] = [];
    for (const t of binnen.matchAll(/<(\/?)([a-z0-9]+)[^>]*?(\/?)>|([^<]+)/gi)) {
      if (t[4] !== undefined) { const s = t[4].trim(); if (s) { tekst += ` ${s}`; if (diepte > 0 && !heeftEigen[diepte]) { heeftEigen[diepte] = true; elementenMetTekst++; } } continue; }
      if (t[3] === '/' || /^(br|img|input|hr)$/i.test(t[2])) continue;
      if (t[1] === '/') { heeftEigen[diepte] = false; diepte--; } else { diepte++; heeftEigen[diepte] = false; }
    }
    return { tekst: tekst.trim(), tekstElementen: elementenMetTekst };
  };
  const uitslag = knoppen.map((k) => ({ klasse: /class="([^"]*)"/.exec(k.attrs)?.[1] ?? (k.attrs.includes('aria-label') ? 'icoon' : ''), blijft: isInhoudsKnop(analyseer(k.binnen)) }));
  const van = (klasse: string) => uitslag.find((u) => u.klasse === klasse);
  check('render: rij-knop met titel + badge + status (.ag-rij-toggle) blijft op papier', van('ag-rij-toggle')?.blijft === true, JSON.stringify(analyseer(knoppen[0]?.binnen ?? '')));
  check('render: statistiektegel-knop (cijfer + tekst) blijft op papier', van('ag-stat')?.blijft === true);
  check('render: actieknop met pictogram + label (.ag-knop) en icoonknop vallen weg', van('ag-knop')?.blijft === false && van('icoon')?.blijft === false);
  check('render: klassen "knop" worden daarnaast door de CSS zelf verborgen (zelfde uitkomst zonder JS)', verborgen.has("button[class*='knop']") && !verborgen.has("button[class*='toggle']"));

  // ── E. bedrading, CSP, kaal draaien in Node ────────────────────────────────────────────────────────────────────────────────────
  const main = lees('src/main.tsx'), ts = lees('src/platform/afdruk.ts');
  check('main.tsx importeert src/afdruk.css én installeert afdruk.ts bij het opstarten', /import '\.\/afdruk\.css'/.test(main) && /import \{ installeerAfdruk \} from '\.\/platform\/afdruk'/.test(main) && /^installeerAfdruk\(\);/m.test(main));
  check('CSP style-src \'self\': geen <style>-tag, geen createElement(\'style\'), geen innerHTML in afdruk.ts/afdruk.css', !/<style|createElement\(\s*['"]style|innerHTML|insertAdjacentHTML|\.cssText|insertRule/.test(ts + lees('src/afdruk.css')));
  check('afdruk.ts schrijft alleen het attribuut data-afdruk-auto (stijl komt uit de CSS) en luistert op beforeprint/afterprint', AFDRUK_ATTR === 'data-afdruk-auto' && /addEventListener\('beforeprint'/.test(ts) && /addEventListener\('afterprint'/.test(ts) && !/\.style\./.test(ts));
  check('nieuwe plaatshouders: data-afdruk-lui="dicht" en het huidige data-ag-lui="dicht" van /agenten', LUI_PLAATSHOUDERS.includes("[data-afdruk-lui='dicht']") && LUI_PLAATSHOUDERS.includes("[data-ag-lui='dicht']"));
  check('geen Engelse UI-tekst in afdruk.ts (geen zichtbare tekst)', !/(['"`])\s*(Print|Printing|Loading)\b/.test(ts));
  // Zonder DOM (Node): niets mag gooien
  let gegooid = '';
  try { const af = installeerAfdruk(); af(); const stop = bereidAfdrukVoor({ defaultView: null, body: null } as unknown as Document); stop(); await laadLuieInhoud({ querySelector: () => null } as unknown as Document); } catch (x) { gegooid = String(x); }
  check('zonder window/document: installeren, voorbereiden en lui laden gooien niet en doen niets', gegooid === '', gegooid);
  // Voorbereidingen: aanmelden, uitvoeren (met document dat een venster heeft is een browser nodig; hier alleen afmelden), afmelden
  let geroepen = 0; const afmelden = bijAfdrukVoorbereiding(() => { geroepen++; }); afmelden();
  bereidAfdrukVoor({ defaultView: null, body: null } as unknown as Document);
  check('bijAfdrukVoorbereiding geeft een afmelder en roept niet aan zonder document', geroepen === 0);
  // laadLuieInhoud: scrolt elke plaatshouder in beeld tot er geen meer zijn (nagebootst document)
  let resterend = 3, gescrold = 0;
  const nepDoc = { querySelector: () => (resterend > 0 ? { parentElement: null, scrollTop: 0, scrollIntoView: () => { gescrold++; resterend--; } } : null), defaultView: null } as unknown as Document;
  await laadLuieInhoud(nepDoc, 3000);
  check('laadLuieInhoud scrolt elke nog niet opgebouwde plaatshouder in beeld (3 van 3) en stopt daarna', gescrold === 3 && resterend === 0, `gescrold=${gescrold}`);

  return einde();
}
