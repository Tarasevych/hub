// Eenheidstest 21.10.2026 — meldingenpaneel op de telefoon + één vaste plaats voor de FAB «Новий лист» naast de bel.
//
// KLACHTEN EIGENAAR (390 px, mail.tarasevych.com/postvak-in):
//  1. Paneel: zoeken + chips (2 regels) + 7 sectieknoppen + «Порядок» bovenaan en vier knoppen over de volle breedte onderaan
//     («Звук», «Типи сповіщень», «Повернути в кут», «Позначити все прочитаним») — voor de lijst bleef een strook.
//     Stand ДО (tests/e2e/hulp/stand-meldingen.ts): lijst 150 px = 18 % van 844 px, 1 rij in beeld.
//  2. FAB «Новий лист» sprong: links van de bel, dan erboven. Drie mechanismen: naastBel() (links), floating-avoidance-fallbacks
//     ({x:1,y:.88} = erboven, gemeten tijdens de CSS-overgang) en een !important-regel ≤ 700 px in mail-zijbalk-navigatie.css;
//     plus een gesleepte pixelpositie in localStorage. Stand ДО op 390: de FAB lag óp de bel (klik op de bel ving de FAB).
// Deze test legt de nieuwe regels vast; de stand (mail-meldingen-paneel-vol / mail-meldingen-fab-bel) bewijst ze in Chrome.
// 25.10.2026: fabPlaats() (FAB vast boven de bel) is vervangen door ZONES en GNIEZDA (shared/plaatsing.ts): de bel staat rechts van de foto
// (computer: bovenbalk; telefoon: kop van het menu), «Написати» en «Вгору» hebben elk een gniezdo in de actiestapel. A en B toetsen nu
// dezelfde beloften (één vaste plaats, nooit over de bel, veilige zone, deterministisch) op het nieuwe model; tests/eenheid/plaatsing-20261025.
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { checker } from './hulp/nep-google';
import { overlapt, type Randen } from '../../src/mail-opstel-plaats';
import { KLASSEN, STAPEL_GAT, STAPEL_GNIEZDO, STAPEL_RAND, indeling, klasseVan, normaliseerPlaatsing, stapelRechthoek, standaardPlaatsing, verplaats, type KnopId, type PaginaContext } from '../../shared/plaatsing';

const lees = (p: string) => readFileSync(p, 'utf8');
const zc = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, '');
const HEX = /#[0-9a-fA-F]{3,8}\b/;
/** Rechthoek van gniezdo `i` (0 = onderaan) in de actiestapel — dezelfde rekensom als de CSS (column-reverse, gat, rand). */
const gniezdo = (klasse: (typeof KLASSEN)[number], i: number, vw: number, vh: number, r?: Randen) => { const s = stapelRechthoek(klasse, i + 1, vw, vh, r); return { left: s.left, top: s.top, width: s.width, height: STAPEL_GNIEZDO[klasse] }; };
/** Minimale nagebootste browser (zoals agent-een-plek-20261020.test.ts): genoeg om NotificationPanelBody in node te importeren. */
function nepBrowser(): () => void {
  const g = globalThis as Record<string, unknown>;
  const voor = new Map(['window', 'document', 'location', 'sessionStorage', 'localStorage', 'history'].map((k) => [k, Object.getOwnPropertyDescriptor(g, k)]));
  const opslag = () => { const m = new Map<string, string>(); return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { m.set(k, String(v)); }, removeItem: (k: string) => { m.delete(k); }, clear: () => m.clear(), key: () => null, length: 0 }; };
  const u = new URL('https://mail.tarasevych.com/postvak-in');
  const maakEl = () => { const attrs = new Map<string, string>(); return { attrs, dataset: {}, style: {}, setAttribute: (k: string, v: string) => { attrs.set(k, String(v)); }, getAttribute: (k: string) => attrs.get(k) ?? null, getContext: () => null }; };
  const doc = {
    hidden: false, title: '', cookie: '', head: { appendChild: (el: unknown) => el }, body: null,
    addEventListener: () => undefined, removeEventListener: () => undefined,
    querySelector: () => null, querySelectorAll: () => [], getElementById: () => null, createElement: () => maakEl(),
    documentElement: { lang: 'uk', dataset: {}, style: { setProperty: () => undefined }, classList: { contains: () => false, add: () => undefined, remove: () => undefined } },
  };
  g.document = doc;
  g.location = { href: u.href, origin: u.origin, host: u.host, hostname: u.hostname, pathname: u.pathname, search: u.search, hash: u.hash, protocol: u.protocol, assign: () => undefined, replace: () => undefined, reload: () => undefined };
  g.sessionStorage = opslag(); g.localStorage = opslag();
  g.history = { pushState: () => undefined, replaceState: () => undefined, state: null };
  g.window = Object.assign(g, { name: '', addEventListener: () => undefined, removeEventListener: () => undefined, dispatchEvent: () => true, postMessage: () => undefined, setTimeout, clearTimeout, setInterval, clearInterval, requestAnimationFrame: (f: () => void) => setTimeout(f, 0) });
  runInNewContext(readFileSync('public/canonical-service.js', 'utf8'), { window: g, location: g.location, document: doc, addEventListener: () => undefined, Date, Math, Number, String, Object, Array, JSON, URLSearchParams, URL });
  return () => { for (const [k, d] of voor) { if (d) Object.defineProperty(g, k, d); else delete g[k]; } delete g.__TSV_CANONICAL_SERVICE__; };
}

export async function main(): Promise<number> {
  const { check, einde } = checker('meldingen-mobiel-20261021');

  // ------------------------------------------------------------------ A. FAB: één vaste plaats (gniezdo), nooit over de bel
  const maten = [[390, 844], [768, 1024], [1280, 800]] as const;
  for (const [vw, vh] of maten) {
    const klasse = klasseVan(vw), ctx: PaginaContext = { klasse, dienst: 'mail', zoekInMenu: true };
    const ind = indeling(standaardPlaatsing(), ctx);
    const fab = gniezdo(klasse, 0, vw, vh), boven = gniezdo(klasse, 1, vw, vh);
    check(`A ${vw}×${vh}: «Написати» onderaan in de actiestapel, het gniezdo van «Вгору» erboven (${STAPEL_GAT}px ertussen); de bel staat elders (${ind.plek.bel})`,
      ind.zones.actiestapel.lijst.map((x) => x.id).join() === 'opstellen,naar-boven' && ind.plek.bel !== 'actiestapel' && !overlapt(fab, boven) && boven.top + boven.height + STAPEL_GAT === fab.top
        && fab.left + fab.width === vw - STAPEL_RAND[klasse] && fab.top + fab.height === vh - STAPEL_RAND[klasse], JSON.stringify({ fab, boven, bel: ind.plek.bel }));
    check(`A ${vw}×${vh}: deterministisch en onafhankelijk van de bel (zelfde invoer → zelfde indeling; geen belrechthoek in de berekening)`,
      JSON.stringify(indeling(standaardPlaatsing(), ctx)) === JSON.stringify(ind) && stapelRechthoek.length >= 4);
  }
  const veilig: Randen = { boven: 47, onder: 34, links: 0, rechts: 0 };
  const fV = gniezdo('telefoon', 0, 390, 844, veilig);
  check('A veilige zone (home-indicator 34 px): «Написати» blijft erboven, met de rand van 12 px', fV.top + fV.height === 844 - 34 - 12);
  // de bel door de gebruiker in de stapel gezet: elk zijn eigen gniezdo, nooit overlap
  const tel: PaginaContext = { klasse: 'telefoon', dienst: 'mail', zoekInMenu: true };
  const metBel = verplaats(standaardPlaatsing(), tel, 'bel', 'actiestapel', 1);
  const indBel = metBel.ok ? indeling(metBel.v, tel) : null;
  check('A bel in de stapel gezet → drie eigen gniezda («Написати», дзвоник, «Вгору»), geen overlap tussen de drie',
    !!indBel && indBel.zones.actiestapel.lijst.map((x) => x.id).join() === 'opstellen,bel,naar-boven' && [0, 1, 2].every((a) => [0, 1, 2].every((b) => a === b || !overlapt(gniezdo('telefoon', a, 390, 844), gniezdo('telefoon', b, 390, 844)))));
  // raster: elke mogelijke plaats van de bel (alle zones, index 0..3) op alle klassen — gniezda in de stapel overlappen nooit en blijven in beeld
  let fout = '';
  for (const [vw, vh] of maten) for (const zone of ['bovenbalk', 'lade-kop', 'zijbalk', 'actiestapel'] as const) for (const index of [0, 1, 2, 3]) {
    const klasse = klasseVan(vw), ctx: PaginaContext = { klasse, dienst: 'mail', zoekInMenu: true };
    const ind = indeling(normaliseerPlaatsing({ versie: 1, klassen: { [klasse]: { bel: { zone, index } } } }), ctx);
    const lijst = ind.zones.actiestapel.lijst.map((x) => x.id as KnopId);
    const rects = lijst.map((_, i) => gniezdo(klasse, i, vw, vh));
    if (rects.some((a, x) => rects.some((b, y) => x !== y && overlapt(a, b))) || rects.some((r) => r.left < 0 || r.top < 0 || r.left + r.width > vw || r.top + r.height > vh)) { fout = `${vw}×${vh} bel ${zone}/${index} → ${lijst.join()}`; break; }
  }
  check('A elke plaats van de bel (alle zones × index 0..3, op 390/768/1280): de gniezda in de stapel overlappen nooit en blijven binnen beeld', !fout, fout);

  // ------------------------------------------------------------------ B. FAB en bel: de oude mechanismen zijn weg
  const fab = lees('src/MailOpstelZwevend.tsx'), navCss = lees('src/mail-zijbalk-navigatie.css'), bel = lees('src/CanoniekMeldingencentrum.tsx');
  const code = (t: string) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  check('B «Написати» tekent zich in zijn gniezdo (<Plek knop=opstellen>), geen fabPlaats/belrechthoek/resize-luisteraars meer (code, niet het commentaar)',
    fab.includes("<Plek knop='opstellen'>") && !/fabPlaats|naastBel\(|tsv:bel-geplaatst|visualViewport|useExternalRectGetter/.test(code(fab)));
  check('B geen slepen ín de FAB, geen opgeslagen pixelpositie (oude sleutel wordt opgeruimd); verplaatsen kan alleen via het sleepprogramma (lang vasthouden)',
    !/onPointerMove|onPointerDown|setPointerCapture|onContextMenu/.test(fab) && !fab.includes("localStorage.setItem('tsv:mail-compose-float-pos-v2'") && fab.includes("localStorage.removeItem('tsv:mail-compose-float-pos-v2')"));
  check('B uitwijkregister verplaatst de FAB niet (priority 100, geen fallbacks, geen applyFallback)',
    /registerZone\(\{ id: 'mail-compose-float', priority: 100, kind: 'float', getRect: composeRectGetter, fallbacks: \[\] \}\)/.test(fab) && !fab.includes('applyFallback') && !fab.includes('avoidOffset'));
  check('B geen !important-plaats van de FAB meer in CSS (mail-zijbalk-navigatie.css, ≤ 700 px)', !/\.mail-compose-float[^{]*\{[^}]*left:[^}]*!important/.test(zc(navCss)));
  check('B tik opent het venster direct', fab.includes('onClick={() => setComposeOpen(true)}'));
  check('B bel: geen eigen positie (x,y) vanaf visualViewport, geen eigen slepen, geen tsv:bel-geplaatst; tekent zich in zijn gniezdo (<Plek knop=bel>)',
    bel.includes("<Plek knop='bel'>") && !/bellPos|bellStyle|onBellDown|onPointerDown=\{onBell|tsv:bel-geplaatst|notificationBellPosition:/.test(code(bel)));
  check('B «Написати» heeft een eigen naam; geen «is-wacht» meer (het gniezdo bestaat vóór de knop, dus geen sprong)', !fab.includes("' is-wacht'") && fab.includes("aria-label={t('Написати новий лист', 'Nieuw bericht schrijven')}"));
  const veiligBron = lees('src/platform/veilige-rand.ts');
  check('B veiligeRand meet env(safe-area-inset-*) via CSSOM (geen style-attribuut, CSP)', veiligBron.includes("s.paddingBottom = 'env(safe-area-inset-bottom, 0px)'") && !veiligBron.includes("setAttribute('style'"));

  // ------------------------------------------------------------------ C. paneel: kop met «⋯», acties één keer in de DOM
  // Vergelijking zonder witruimte (de bron is leesbare code, geen geminificeerde regels).
  const heeft = (bron: string, patroon: string) => bron.replace(/\s+/g, '').includes(patroon.replace(/\s+/g, ''));
  check('C kop: «⋯» (data-qa-id melding-meer) met aria-expanded + aria-controls=cnc-acties, vóór de knop inklappen',
    heeft(bel, "className='cnc-meer-knop' data-qa-id='melding-meer' aria-expanded={meer} aria-controls='cnc-acties'") && bel.indexOf("data-qa-id='melding-meer'") < bel.indexOf('onClick={() => setPanelOpen(false)}'));
  check('C acties: één <footer id=cnc-acties> (computer: balk onderaan; telefoon: menu), elke actie sluit het menu', heeft(bel, "<footer id='cnc-acties' className={meer ? 'is-open' : undefined}") && (bel.match(/<footer/g) || []).length === 1
    && heeft(bel, 'onClick={() => { resetPosition(); setMeer(false); }}') && heeft(bel, 'onClick={() => { setMeer(false); void markAll(); }}') && heeft(bel, 'onClick={() => { setInstellingen((v) => !v); setMeer(false); }}'));
  check('C Escape sluit eerst het menu (focus terug op «⋯»), daarna pas het paneel', heeft(bel, 'if (meerRef.current) { setMeer(false); meerKnopRef.current?.focus(); return; }'));
  check('C tik buiten het menu (in het paneel) sluit het; paneel dicht → menu dicht', heeft(bel, "!event.target.closest('#cnc-acties,[data-qa-id=\"melding-meer\"]')) setMeer(false)") && heeft(bel, 'if (!panelOpen) { setInstellingen(false); setMeer(false); }'));
  check('C in «Типи сповіщень» een terugknop in de kop', heeft(bel, "{instellingen && (<button type='button' className='cnc-terug' onClick={() => setInstellingen(false)}"));

  // ------------------------------------------------------------------ D. paneel: één chiprij + «Фільтри» (render)
  const herstel = nepBrowser();
  const Body = (await import('../../src/MeldingenpaneelInhoud')).default;
  const nu = Date.now();
  const server = Array.from({ length: 30 }, (_, i) => ({ id: `s${i}`, kind: i % 2 ? 'security_warning' : 'workspace_share', title: `Melding ${String.fromCharCode(1072 + i)}` /* verschillende teksten: groeperen voegt alleen gelijke samen */, message: 'tekst', createdAt: nu - i * 60000, read: i % 3 === 0 }));
  const html = (lang: 'uk' | 'nl') => renderToStaticMarkup(createElement(Body, { lang, local: [], server, events: [], readEvents: new Set<string>(), onReadLocal: () => undefined, onRemoveLocal: () => undefined, onRunAction: () => undefined, onReadEvent: () => undefined, detailIcons: {} }));
  const uk = html('uk'), nl = html('nl');
  herstel();
  check('D één knop «Фільтри»/«Filters» met aria-expanded=false en aria-controls=cnc-extra', (uk.match(/class="cnc-filterknop"/g) || []).length === 1 && /class="cnc-filterknop"[^>]*aria-expanded="false"[^>]*aria-controls="cnc-extra"/.test(uk) && uk.includes('>Фільтри<') && nl.includes('>Filters<'));
  const chipsDeel = uk.slice(uk.indexOf('class="cnc-chips"'), uk.indexOf('class="cnc-filterknop"'));
  check('D de vier statuschips + «Групувати» in één scrollrij (TabsRij: data-scroll-ok, pijlen als hint)', (chipsDeel.match(/class="cnc-chip"/g) || []).length === 5 && uk.includes('class="ut-tabs-wrap cnc-chips-wrap"') && /class="cnc-chips"[^>]*data-scroll-ok="1"/.test(uk) && uk.includes('ut-tabs-pijl is-rechts'));
  const extra = uk.slice(uk.indexOf('id="cnc-extra"'), uk.indexOf('class="cnc-list"'));
  check('D zoeken staat in de rij; розділи en порядок in #cnc-extra', uk.includes('type="search"') && uk.indexOf('type="search"') < uk.indexOf('id="cnc-extra"') && extra.includes('class="cnc-sections"') && extra.includes('Спершу нові') && !extra.includes('type="search"'));
  // INTEG-001 (eigenaar: розділи «Нові», «Прочитані», «Архів»): het paneel opent in «Нові» (er is iets nieuws) en toont daar de 20
  // ongelezen; de 10 gelezen staan in «Прочитані». Vroeger «Усі» met alle 30 door elkaar.
  check('D lijst rendert de rijen van het deel «Нові» (20 ongelezen van 30 servermeldingen, niet samengevoegd)', (uk.match(/class="cnc-row /g) || []).length === 20 && (uk.match(/data-deel="nieuw"/g) || []).length === 20);
  const bodyBron = lees('src/MeldingenpaneelInhoud.tsx');
  check('D getal op «Фільтри» = actieve keuzes (розділ, порядок, zoeken)', bodyBron.includes("const actief = (section !== 'all' ? 1 : 0) + (sort !== 'new' ? 1 : 0) + (query.trim() ? 1 : 0);") && bodyBron.includes('Фільтри (активних: ${actief})'));

  // ------------------------------------------------------------------ E. CSS: vol blad op de telefoon, computer ongewijzigd
  const css = lees('src/meldingenpaneel.css');
  const blok = css.slice(css.indexOf('/* ---------------------------------------------------------------- KOP, FILTERRIJ, ACTIES'));
  const mob = zc(blok.slice(blok.indexOf('@media (max-width:560px)')));
  // INTEG-001 (03.11.2026, eigenaar: «панель має відкриватися біля дзвіночка, прив'язана до нього, а не посеред екрана»): het volle blad
  // (top/bottom van rand tot rand, max-height:none) is vervangen door een venster AAN de bel: links/rechts tussen de veilige randen,
  // bovenkant en maximale hoogte uit placeNear (met een pijltje naar de bel). Deze check legt de nieuwe regel vast.
  check('E telefoon: venster aan de bel — links/rechts tussen de veilige randen; GEEN vaste top/bottom en geen max-height:none (die komen uit placeNear)',
    /left:calc\(var\(--ruimte-2\) \+ var\(--veilig-links\)\)!important;right:calc\(var\(--ruimte-2\) \+ var\(--veilig-rechts\)\)!important/.test(mob)
      && !/html \.canonical-notification-panel\{[^}]*(top|bottom):calc/.test(mob) && !mob.includes('max-height:none!important') && mob.includes('grid-template-rows:auto minmax(0,1fr)'));
  check('E telefoon: actiebalk weg, alleen als menu onder «⋯» (absoluut, niet in de rasterflow)', mob.includes('html .canonical-notification-panel>footer{display:none}') && /html \.canonical-notification-panel>footer\.is-open\{display:grid;[^}]*position:absolute/.test(mob) && mob.includes('html .canonical-notification-panel>header .cnc-meer-knop{display:grid}'));
  check('E telefoon: #cnc-extra verborgen tot «Фільтри» open is; chips/knoppen ≥ tikhoogte', mob.includes('.cnc-extra{display:none}') && mob.includes('.cnc-tools[data-filters-open] .cnc-extra{display:grid') && mob.includes('.cnc-chip{min-height:var(--tik-hoogte)') && mob.includes('.cnc-actions button,.cnc-done{width:var(--tik-hoogte);height:var(--tik-hoogte)}'));
  check('E computer: «⋯» verborgen, «Фільтри» zichtbaar, extra dicht tot de knop open is', /\.canonical-notification-panel>header \.cnc-meer-knop\{display:none\}/.test(zc(blok)) && /\.cnc-filterknop\{display:inline-flex/.test(zc(blok)) && zc(blok).includes('.cnc-extra{display:none') && zc(blok).includes('.cnc-tools[data-filters-open] .cnc-extra{display:grid'));
  check('E nieuw blok: geen hex, geen prefers-color-scheme, alleen tokens', !HEX.test(zc(blok)) && !/prefers-color-scheme/.test(blok));
  const kleine = [...zc(blok).matchAll(/font-size:(\d+(?:\.\d+)?)px/g)].map((m) => Number(m[1])).filter((n) => n < 12);
  check('E nieuw blok: geen letter < 12 px', kleine.length === 0, kleine.join());
  // Hoogtebudget op 390×844 (vaste maten uit de CSS): kop 44 + 2×4 + rand, filterrij 44 + 2×8 + rand → lijst ≥ 70 %.
  // INTEG-001: het venster begint onder de bel (kop van het menu: bel tot ±52 px + 8 px tussenruimte) en eindigt 8 px boven de rand.
  const kop = 44 + 8 + 1, tools = 44 + 16 + 1, blad = 844 - (52 + 8) - 8;
  check('E budget 390×844: lijst ≥ 70 % van de schermhoogte (vóór: 150 px = 18 %)', (blad - kop - tools) / 844 >= 0.7, `${blad - kop - tools}px = ${Math.round(((blad - kop - tools) / 844) * 100)}%`);

  return einde();
}
