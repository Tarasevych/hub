// Leesvenster van de Post — één kader voor volledig / rechts / onder / zwevend / telefoon (pakket 1 «Adaptive Mail Canvas», 24.10.2026).
// Draaien: node scripts/eenheidstests.mjs lees-venster-20261024
// Wens van de eigenaar: «один переглядач, який виглядає як професійна поштова програма на комп'ютері, залишається простим на телефоні
// та не втрачає можливостей під час зміни розміру вікна»; повний, розділений, плаваючий і мобільний режими «поводяться однаково».
//  A. src/mail/lees-modus.ts (puur): vorm per scherm/paneel/zweven, werkelijk paneel op de telefoon, breedteklasse van het venster,
//     rol, focus, Escape, «Назад», lijstpositie, schuifposities (LRU), toetsenbord van het zwevende venster, binnen het scherm met
//     randen (menu links/rechts, dock boven/onder, bovenbalk), vrije randen per menupositie, «priority+» van de kop; 2.5 (25.10.2026):
//     het zwevende venster ontwijkt de zones van de zwevende knoppen (bovenbalk, actiestapel) — ontwijk / binnenScherm met hindernissen.
//  B. structuur (renderToStaticMarkup): LeesVenster per vorm — data-lees-modus, rol/aria-modal, tabIndex −1, inline randen (rechts
//     NOOIT met een linkerrand); werkbalk in het kader: «Зменшити вікно» niet op de telefoon, greep alleen zwevend.
//  C. bron: GoogleMailWerkruimte gebruikt het kader (geen eigen achtergrond/rol/inline left meer), werkelijk paneel op de telefoon,
//     lijst alleen terug als de brief haar bedekte, randen volgen het menu; werkbalk: Escape via het kader, kop meet zelf, ⋮ «Швидкі дії»;
//     lezer-venster: grens 721, randen, toetsenbord, opnieuw binnen het scherm na resize.
//  D. CSS: geen nth-child(n+3)-verstoppen meer op ≤ 430 px, kop zonder schermbreedte, priority+-regels, «Зменшити вікно» ≤ 720 px weg,
//     ☰ alleen verborgen zolang de brief echt open is.
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { checker } from './hulp/nep-google';
import {
  BOVENBALK, GEEN_RANDEN, HINDERNIS_MARGE, LeesPosities, MIN_H, MIN_W, TELEFOON_TOT, binnenScherm, escSluit, focusBijOpenen, geschiedenisStap, kopVerborgen,
  leesBreedte, leesModus, leesRol, lijstPositieTerug, ontwijk, vensterToets, vrijeRanden, werkelijkPaneel, type LeesModus,
} from '../../src/mail/lees-modus';

const lees = (f: string) => readFileSync(f, 'utf8');
const zc = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, '');
const MODI: LeesModus[] = ['volledig', 'rechts', 'onder', 'zwevend', 'telefoon'];

// Zelfde nagebootste browser als zoek-in-menu-20261024 (MailSnelleInstellingen → canonical-service leest window bij het laden).
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

function metScherm<T>(breedte: number, zwevend: boolean, f: () => T): T {
  const g = globalThis as Record<string, unknown>;
  const voor = { innerWidth: Object.getOwnPropertyDescriptor(g, 'innerWidth'), innerHeight: Object.getOwnPropertyDescriptor(g, 'innerHeight'), localStorage: Object.getOwnPropertyDescriptor(g, 'localStorage') };
  const opslag = new Map<string, string>([['mail-reader-venster-v1', JSON.stringify({ zwevend, x: 400, y: 70, w: 760, h: 700 })]]);
  Object.defineProperty(g, 'innerWidth', { value: breedte, configurable: true, writable: true });
  Object.defineProperty(g, 'innerHeight', { value: 900, configurable: true, writable: true });
  Object.defineProperty(g, 'localStorage', { value: { getItem: (k: string) => opslag.get(k) ?? null, setItem: (k: string, v: string) => { opslag.set(k, String(v)); }, removeItem: (k: string) => { opslag.delete(k); } }, configurable: true, writable: true });
  try { return f(); } finally {
    for (const [k, d] of Object.entries(voor)) { if (d) Object.defineProperty(g, k, d); else delete g[k]; }
  }
}

const attr = (html: string, naam: string) => new RegExp(`<div[^>]*class="google-mail-reader-backdrop[^"]*"[^>]*\\b${naam}="([^"]*)"`).exec(html)?.[1] ?? null;
const artAttr = (html: string, naam: string) => new RegExp(`<article[^>]*\\b${naam}="([^"]*)"`).exec(html)?.[1] ?? null;
const stijl = (html: string) => /<div[^>]*class="google-mail-reader-backdrop[^"]*"[^>]*style="([^"]*)"/.exec(html)?.[1] ?? '';

export async function main(): Promise<number> {
  const { check, einde } = checker('lees-venster-20261024');

  // ------------------------------------------------------------------ A. puur
  check('A grens telefoon = 721 px: 360/720 → telefoon (ook met paneel/zwevend), 721 → computer',
    leesModus({ schermBreedte: 360, paneel: 'right', zwevend: true }) === 'telefoon' && leesModus({ schermBreedte: 720, paneel: 'below', zwevend: false }) === 'telefoon'
    && leesModus({ schermBreedte: 721, paneel: 'none', zwevend: false }) === 'volledig' && TELEFOON_TOT === 721);
  check('A computer: zwevend wint van het paneel; right → rechts, below → onder, onbekend → volledig',
    leesModus({ schermBreedte: 1280, paneel: 'right', zwevend: true }) === 'zwevend' && leesModus({ schermBreedte: 1280, paneel: 'right', zwevend: false }) === 'rechts'
    && leesModus({ schermBreedte: 1280, paneel: 'below', zwevend: false }) === 'onder' && leesModus({ schermBreedte: 1280, paneel: 'iets', zwevend: false }) === 'volledig');
  check('A werkelijk paneel: op de telefoon altijd none (vroeger gold «onder» ook op 390 px: de kop schoof 16 px naar beneden), anders de keuze',
    werkelijkPaneel(390, 'below') === 'none' && werkelijkPaneel(720, 'right') === 'none' && werkelijkPaneel(721, 'right') === 'right' && werkelijkPaneel(Infinity, 'below') === 'below' && werkelijkPaneel(1280, 'x') === 'none');
  check('A breedteklasse van het VENSTER: < 560 smal, < 1100 midden, anders breed (rechts 443 px op 852 → smal)',
    leesBreedte(443) === 'smal' && leesBreedte(559) === 'smal' && leesBreedte(560) === 'midden' && leesBreedte(1099) === 'midden' && leesBreedte(1100) === 'breed' && leesBreedte(NaN) === 'smal');
  const rollen = MODI.map((m) => `${m}:${leesRol(m).role}/${leesRol(m).modaal ? 'modaal' : '-'}`).join(' ');
  check('A rol: volledig/telefoon modaal dialoogvenster, zwevend niet-modaal dialoogvenster, rechts/onder een gebied', rollen === 'volledig:dialog/modaal rechts:region/- onder:region/- zwevend:dialog/- telefoon:dialog/modaal', rollen);
  check('A focus bij openen: naar de brief bij volledig/telefoon/zwevend; in de lijst laten bij rechts/onder', MODI.filter(focusBijOpenen).join() === 'volledig,zwevend,telefoon');
  const esc = (modus: LeesModus, geminimaliseerd: boolean, focusBinnen: boolean) => escSluit({ modus, geminimaliseerd, focusBinnen });
  check('A Escape: nooit geminimaliseerd; volledig/telefoon altijd; rechts/onder/zwevend alleen met de focus in de brief',
    MODI.every((m) => !esc(m, true, true)) && esc('volledig', false, false) && esc('telefoon', false, false)
    && (['rechts', 'onder', 'zwevend'] as LeesModus[]).every((m) => esc(m, false, true) && !esc(m, false, false)));
  check('A «Назад» = stap in de geschiedenis alleen waar de brief de lijst bedekt; lijstpositie terug ook alleen daar',
    MODI.filter(geschiedenisStap).join() === 'volledig,telefoon' && MODI.filter(lijstPositieTerug).join() === 'volledig,telefoon');
  const pos = new LeesPosities(3);
  pos.zet('a', 10.4); pos.zet('b', -5); pos.zet('c', 30); pos.zet('a', 11); pos.zet('d', 40); pos.zet('', 99);
  check('A schuifposities: afgerond, nooit negatief, LRU (max 3: b valt weg, a is opnieuw gebruikt), lege id genegeerd',
    pos.haal('a') === 11 && pos.haal('b') === 0 && pos.haal('c') === 30 && pos.haal('d') === 40 && pos.grootte === 3);
  const s0 = { x: 100, y: 100, w: 600, h: 500 };
  check('A toetsenbord zwevend: pijltje 16 px, Alt 2 px, Shift = grootte, andere toets → null',
    JSON.stringify(vensterToets(s0, { key: 'ArrowLeft' })) === JSON.stringify({ x: 84, y: 100, w: 600, h: 500 })
    && JSON.stringify(vensterToets(s0, { key: 'ArrowDown', altKey: true })) === JSON.stringify({ x: 100, y: 102, w: 600, h: 500 })
    && JSON.stringify(vensterToets(s0, { key: 'ArrowRight', shiftKey: true })) === JSON.stringify({ x: 100, y: 100, w: 616, h: 500 })
    && vensterToets(s0, { key: 'Enter' }) === null);
  const b1 = binnenScherm({ x: 0, y: 0, w: 760, h: 760 }, { w: 768, h: 1024 }, { links: 60, boven: BOVENBALK });
  check('A binnen het scherm: rechts van het menu (60 + 8), onder de bovenbalk (58 + 8), smaller als het moet (768 − 60 − 16 = 692)', JSON.stringify(b1) === JSON.stringify({ w: 692, h: 760, x: 68, y: 66 }), JSON.stringify(b1));
  const b2 = binnenScherm({ x: 5000, y: 5000, w: 300, h: 200 }, { w: 1280, h: 800 }, { rechts: 60, onder: 80 });
  check('A minimum 520×420 en tegen menu rechts / dock onder', JSON.stringify(b2) === JSON.stringify({ w: MIN_W, h: MIN_H, x: 1280 - 60 - MIN_W - 8, y: 800 - 80 - MIN_H - 8 }), JSON.stringify(b2));
  const b3 = binnenScherm({ x: 0, y: 0, w: 900, h: 900 }, { w: 721, h: 480 }, { links: 286, boven: BOVENBALK });
  check('A naast een uitgeklapt menu (721 − 286) en onder de bovenbalk op 480 px hoog: het menu gaat vóór het minimum — venster 419×406, niet over menu of balk',
    JSON.stringify(b3) === JSON.stringify({ w: 721 - 286 - 16, h: 480 - BOVENBALK - 16, x: 286 + 8, y: BOVENBALK + 8 }), JSON.stringify(b3));
  const b4 = binnenScherm({ x: 0, y: 0, w: 760, h: 760 }, { w: 852, h: 480 }, { links: 0, boven: 78 });
  check('A dock boven op 852×480 (vroeger zweefde het venster over het dock): onder het dock, 386 px hoog', b4.y === 86 && b4.h === 480 - 78 - 16 && b4.y + b4.h <= 480 - 8, JSON.stringify(b4));
  const b5 = binnenScherm({ x: 0, y: 0, w: 900, h: 900 }, { w: 400, h: 340 }, { links: 286, boven: 200 });
  check('A pas als zelfs 360×300 niet past, wijken de randen (net genoeg: 286 → 24) — nooit buiten het scherm', JSON.stringify(b5) === JSON.stringify({ w: 360, h: 300, x: 32, y: 32 }), JSON.stringify(b5));
  // 2.5 (25.10.2026): het zwevende venster wijkt voor de zones van de zwevende knoppen (bovenbalk, actiestapel) — kleinste verschuiving,
  // dan krimpen, nooit buiten het vrije deel; zonder hindernissen (geen browser: vensterHindernissen() = []) precies zoals hierboven
  const stapel = { left: 1212, top: 672, width: 48, height: 108 }, hogeZone = { left: 1144, top: 14, width: 120, height: 62 };
  const w0 = { x: 460, y: 64, w: 760, h: 710 }, rBoven = { links: 60, boven: BOVENBALK };
  const o1 = binnenScherm(w0, { w: 1280, h: 800 }, rBoven, [stapel]);
  check('A hindernis: venster over de actiestapel → 12 px naar links (rechterrand 4 px vóór de stapel), grootte blijft', JSON.stringify(o1) === JSON.stringify({ w: 760, h: 710, x: 448, y: 66 }), JSON.stringify(o1));
  const o2 = binnenScherm(w0, { w: 1280, h: 800 }, rBoven, [hogeZone]);
  check('A hindernis: een hogere bovenbalk (grotere letters, onderrand 76) → het venster eronder (y 80), niet 80 px opzij', JSON.stringify(o2) === JSON.stringify({ w: 760, h: 710, x: 460, y: 80 }), JSON.stringify(o2));
  const o3 = binnenScherm(w0, { w: 1280, h: 800 }, rBoven, [hogeZone, stapel]);
  check('A hindernis: bovenbalk én stapel → de goedkoopste stand die beide vrijlaat (links van de zone), binnen het scherm', JSON.stringify(o3) === JSON.stringify({ w: 760, h: 710, x: 380, y: 66 }), JSON.stringify(o3));
  const o4 = ontwijk({ x: 8, y: 8, w: 584, h: 484 }, { x0: 8, y0: 8, x1: 592, y1: 492 }, [{ left: 0, top: 0, width: 600, height: 500 }]);
  check('A hindernis: past nergens (hindernis over het hele vrije deel) → het venster blijft staan (het scherm gaat vóór)', JSON.stringify(o4) === JSON.stringify({ x: 8, y: 8, w: 584, h: 484 }), JSON.stringify(o4));
  const o5 = ontwijk({ x: 68, y: 66, w: 1204, h: 726 }, { x0: 68, y0: 66, x1: 1272, y1: 792 }, [stapel]);
  check('A hindernis: venster zo breed als het vrije deel → krimpen (rechterrand vóór de stapel) in plaats van eruit schuiven', o5.x === 68 && o5.x + o5.w === 1208 && o5.y === 66 && o5.h === 726, JSON.stringify(o5));
  check('A hindernis: zonder hindernissen en zonder browser verandert er niets (vensterHindernissen() = [])', JSON.stringify(binnenScherm(w0, { w: 1280, h: 800 }, rBoven)) === JSON.stringify(binnenScherm(w0, { w: 1280, h: 800 }, rBoven, [])) && HINDERNIS_MARGE === 4);
  const z = { left: 1220, right: 1280, top: 0, bottom: 800 }, sch = { w: 1280, h: 800 };
  check('A vrije randen per menupositie: links → links = rechterkant menu; rechts → rechts = breedte menu; dock boven/onder → boven/onder + 8; geen menu → niets',
    JSON.stringify(vrijeRanden({ dock: 'links', zijbalk: { left: 0, right: 60.004, top: 0, bottom: 800 }, scherm: sch })) === JSON.stringify({ links: 60, rechts: 0, boven: 0, onder: 0 })
    && vrijeRanden({ dock: 'rechts', zijbalk: z, scherm: sch }).rechts === 60 && vrijeRanden({ dock: 'rechts', zijbalk: z, scherm: sch }).links === 0
    && vrijeRanden({ dock: 'boven', zijbalk: { left: 300, right: 980, top: 8, bottom: 70 }, scherm: sch }).boven === 78
    && vrijeRanden({ dock: 'onder', zijbalk: { left: 300, right: 980, top: 728, bottom: 790 }, scherm: sch }).onder === 80
    && JSON.stringify(vrijeRanden({ dock: 'links', zijbalk: null, scherm: sch })) === JSON.stringify(GEEN_RANDEN));
  const vak = { links: 100, rechts: 300 };
  check('A kop «priority+»: tweede regel, half buiten het vak en zonder breedte (display:none) = in ⋮; alles op één regel = niets',
    kopVerborgen([{ id: 'a', top: 10, links: 110, rechts: 154 }, { id: 'b', top: 10, links: 158, rechts: 202 }, { id: 'c', top: 66, links: 110, rechts: 154 }, { id: 'd', top: 10, links: 280, rechts: 324 }, { id: 'e', top: 0, links: 0, rechts: 0 }], vak).join() === 'c,d,e'
    && kopVerborgen([{ id: 'a', top: 10, links: 110, rechts: 154 }, { id: 'b', top: 10.5, links: 158, rechts: 202 }], vak).length === 0
    && kopVerborgen([], vak).length === 0);

  // ------------------------------------------------------------------ B. structuur
  const herstel = nepBrowser();
  try {
  const { default: LeesVenster, randStijl } = await import('../../src/mail/LeesVenster');
  const { default: MailReaderToolbar } = await import('../../src/MailLezerWerkbalk');
  const { defaultMailReaderToolbarPreference } = await import('../../src/MailSnelleInstellingen');
const acties = ['archive', 'trash', 'read', 'star', 'spam', 'move'].map((id) => ({ id, label: `actie ${id}`, icon: null, onSelect: () => undefined })) as unknown as Parameters<typeof MailReaderToolbar>[0]['actions'];
  const balk = () => createElement(MailReaderToolbar, { lang: 'uk', actions: acties, preference: defaultMailReaderToolbarPreference, busy: false, saving: false, error: '', onChange: () => undefined, minimizeLabel: 'Згорнути лист', onMinimize: () => undefined, closeLabel: 'Закрити', onClose: () => undefined });
  const kader = (paneel: string, randen = { links: 60, rechts: 0, boven: 0, onder: 0 }, kind = createElement('header', null, balk())) =>
    renderToStaticMarkup(createElement(LeesVenster, { lang: 'uk', berichtId: 'm1', laden: false, paneel, geminimaliseerd: false, randen, onMinimaliseer: () => undefined, onSluit: () => undefined }, kind));
  const vol = metScherm(1280, false, () => kader('none')), re = metScherm(1280, false, () => kader('right')), on = metScherm(1280, false, () => kader('below'));
  const zw = metScherm(1280, true, () => kader('right')), tel = metScherm(390, true, () => kader('below'));
  const vormen = [vol, re, on, zw, tel].map((h) => attr(h, 'data-lees-modus')).join();
  check('B data-lees-modus: none → volledig, right → rechts, below → onder, zwevend wint, 390 px → telefoon (ook met zwevend/below)', vormen === 'volledig,rechts,onder,zwevend,telefoon', vormen);
  const rolHtml = [vol, re, on, zw, tel].map((h) => `${artAttr(h, 'role')}/${artAttr(h, 'aria-modal') ?? '-'}`).join();
  check('B rol op het <article>: dialog/true, region/-, region/-, dialog/- (zwevend niet-modaal), dialog/true', rolHtml === 'dialog/true,region/-,region/-,dialog/-,dialog/true', rolHtml);
  check('B het venster is focusbaar (tabIndex −1) en heet naar het onderwerp (aria-labelledby)', [vol, re, tel].every((h) => artAttr(h, 'tabindex') === '-1' && artAttr(h, 'aria-labelledby') === 'google-mail-subject'));
  check('B inline randen: volledig left 60px; rechts left:auto + right:0px (NOOIT de 60 px van het menu); onder left 60px; zwevend en telefoon niets',
    /^left:60px;?$/.test(stijl(vol)) && /left:auto;right:0px/.test(stijl(re)) && !/left:60px/.test(stijl(re)) && /^left:60px;?$/.test(stijl(on)) && stijl(zw) === '' && stijl(tel) === '', JSON.stringify([stijl(vol), stijl(re), stijl(on), stijl(zw), stijl(tel)]));
  const reDock = metScherm(1280, false, () => kader('right', { links: 0, rechts: 60, boven: 0, onder: 0 })), volBoven = metScherm(1280, false, () => kader('none', { links: 0, rechts: 0, boven: 78, onder: 0 }));
  check('B menu rechts: rechts-paneel stopt vóór het menu (right:60px); dock boven: volledig begint onder het dock (left 0, top 78px)', /right:60px/.test(stijl(reDock)) && /left:0px/.test(stijl(volBoven)) && /top:78px/.test(stijl(volBoven)), JSON.stringify([stijl(reDock), stijl(volBoven)]));
  check('B randStijl (ook voor de bijlage-werkbank): menu links alleen left; menu rechts right + left 0; niets → undefined',
    JSON.stringify(randStijl({ links: 60, rechts: 0, boven: 0, onder: 0 })) === '{"left":"60px"}' && JSON.stringify(randStijl({ links: 0, rechts: 60, boven: 0, onder: 0 })) === '{"left":"0px","right":"60px"}' && randStijl(GEEN_RANDEN) === undefined);
  check('B werkbalk in het kader: «Зменшити вікно» op de computer (aria-pressed false), NIET op de telefoon; greep alleen zwevend (met uitleg voor het toetsenbord)',
    /class="mail-reader-icon-action mail-reader-venster" aria-pressed="false"/.test(vol) && !/mail-reader-venster"/.test(tel) && !/mail-reader-venster-greep/.test(vol)
    && /class="mail-reader-venster-greep" tabindex="0" role="group" aria-label="Вікно листа\. Перетягніть, щоб пересунути\. Стрілки — пересунути, Shift\+стрілки — змінити розмір\."/.test(zw)
    && /mail-reader-venster" aria-pressed="true"/.test(zw));
  check('B kop: de standaardacties staan in de kop (data-reader-action-surface="header"), nog niets verborgen vóór de meting', /data-reader-action-id="archive" data-reader-action-surface="header"/.test(vol) && !/data-kop-verborgen/.test(vol));

  } finally { herstel(); }

  // ------------------------------------------------------------------ C. bron
  const ws = lees('src/GoogleMailWerkruimte.tsx'), wb = lees('src/MailLezerWerkbalk.tsx'), lv = lees('src/lezer-venster.ts'), kad = lees('src/mail/LeesVenster.tsx');
  check('C werkruimte: het leesvenster is <LeesVenster> (geen eigen achtergrond-div, geen rol per readingPane, geen inline left meer)',
    ws.includes("{detail&&<LeesVenster lang={lang} berichtId={detail.id} laden={detailLoading} paneel={runtimeViewPreferences.readingPane} geminimaliseerd={readerMinimized} randen={readerRanden} onMinimaliseer={minimizeReader} onSluit={closeReader} ") // pakket 2: daarna de sneltoetsen
    && ws.includes('</LeesVenster>}') && !ws.includes("className={`google-mail-reader-backdrop") && !ws.includes("aria-modal={runtimeViewPreferences.readingPane") && !ws.includes('readerSurfaceLeft'));
  check('C werkruimte: werkelijk paneel op de telefoon (none), randen volgen het menu (data-dock), bijlage-werkbank met dezelfde randen',
    ws.includes('data-reading-pane={werkelijkPaneel(mobileViewport?0:Infinity,runtimeViewPreferences.readingPane)}') && ws.includes("vrijeRanden({dock:root.getAttribute('data-dock')||'links'") && ws.includes("attributeFilter:['class','data-dock']") && ws.includes('style={randStijl(readerRanden)}'));
  check('C sluiten: de lijst springt alleen terug als de brief haar bedekte (volledig/telefoon); naast de lijst blijft ze staan',
    ws.includes('terugNaarPositie=lijstPositieTerug(huidigeLeesModus(runtimeViewPreferences.readingPane))') && ws.includes('if(terugNaarPositie)window.requestAnimationFrame(()=>{const host=scrollHost();if(host)host.scrollTop=returnScroll})'));
  check('C werkbalk: Escape via het kader vóór onClose, geen eigen pasToe/koppel meer, «Зменшити вікно» via het kader, alleen waar zweven kan',
    wb.includes('if(lvRef.current&&!lvRef.current.escMag(event))return;event.preventDefault();p.onClose()};') && !/pasToe|koppel\(|readerZwevend/.test(wb) && wb.includes('onClick={()=>lv?.wisselZwevend()}') && wb.includes('{(!lv||lv.kanZweven)&&<button'));
  check('C werkbalk «priority+»: meet de kop (ResizeObserver, kopVerborgen), verborgen acties krijgen data-kop-verborgen + tabIndex −1 en staan bovenaan ⋮ («Швидкі дії»)',
    wb.includes("ref={surface==='header'?kopRef:undefined}") && wb.includes('kopVerborgen(Array.from(vak.querySelectorAll') && wb.includes("data-kop-verborgen={item.surface==='header'&&kopVerborgenIds.includes(item.id)?'true':undefined}")
    && wb.includes("data-groep='kop' role='group' aria-label={t('Швидкі дії','Snelle acties')}") && wb.includes("actionControl({...item,surface:'overflow',display:'label'})"));
  check('C lezer-venster: grens TELEFOON_TOT (geen 760 meer), randen + bovenbalk, toetsenbord (verschuif), na resize opnieuw binnen het scherm, removeProperty i.p.v. regex',
    !/innerWidth\s*(>|<=)\s*760/.test(lv) && lv.includes('innerWidth >= TELEFOON_TOT') && lv.includes('Math.max(Number(r.boven) || 0, BOVENBALK)') && lv.includes('export function verschuif(') && lv.includes("window.addEventListener('resize', scherm)") && lv.includes("reader.style.removeProperty(k)"));
  check('C kader: één popstate-luisteraar met teller (history.back() van het sluiten sluit later niets), stap pas bij bedekken, focus terug op .mail-row-open-hit',
    kad.includes("window.addEventListener('popstate', () => { if (teNegeren > 0) { teNegeren -= 1; return; } abonnee?.(); });") && kad.includes('const nodig = geschiedenisStap(modus) && !p.geminimaliseerd;') && kad.includes('.mail-row-open-hit') && kad.includes('requestAnimationFrame(() => requestAnimationFrame(() => zetFocusTerug(id, opener, index)))'));

  const nav = lees('src/MailLezerZoekNavigator.tsx');
  check('C de schuivende inhoud is section:not(.mra) — de ШІ-balk is ook een <section>: zoeken in de brief sprong daardoor niet naar de treffer, en ook het automatisch schuiven bij het slepen van acties en het terugzetten raakten de balk',
    nav.includes("root.querySelector<HTMLElement>('.google-mail-reader>section:not(.mra)')") && !nav.includes("querySelector<HTMLElement>('.google-mail-reader>section')")
    && wb.includes("querySelector<HTMLElement>(':scope > section:not(.mra)')") && kad.includes("querySelector<HTMLElement>(':scope > section:not(.mra)')") && kad.includes("!t.classList.contains('mra')"));
  check('C schuifpositie per brief: terugzetten zonder scroll anchoring en opnieuw bij elke groei (max. 2 s), stoppen als de gebruiker of het gesprek zelf schuift',
    kad.includes("sc.style.overflowAnchor = 'none'") && kad.includes('const wekker = window.setTimeout(stop, 2000);') && kad.includes("for (const t of ['wheel', 'touchstart', 'keydown', 'pointerdown'] as const) sc.addEventListener(t, stop, { passive: true });") && kad.includes('if (Math.abs(y - sc.scrollTop) > Math.abs(y - laatst) + 2) { stop(); return; }'));

  // ------------------------------------------------------------------ D. CSS
  const mob = zc(lees('src/mobiel-ux.css')), wbCss = zc(lees('src/mail-lezer-werkbalk.css')), lvCss = zc(lees('src/mail/lees-venster.css')), rev = zc(lees('src/mail-ux-beoordeling-20261021.css')), qa = zc(lees('src/mail-qa-2026-10.css'));
  check('D ≤ 430 px: geen nth-child(n+3){display:none} en geen 96/54 px voor de kop meer; kop zonder schermbreedte (56vw, 100vw − 268px)',
    !mob.includes('nth-child(n+3)') && !/surface-header\{max-width:96px/.test(mob) && !wbCss.includes('max-width:54px') && !wbCss.includes('min(56vw,720px)') && !wbCss.includes('calc(100vw - 268px)') && wbCss.includes('.mail-reader-action-surface.surface-header{flex:1 1 auto}'));
  check('D priority+: één regel die afknipt (wrap, max-height 52px met 4 px ruimte voor de focusring), verborgen = visibility:hidden; alleen buiten het bewerken',
    lvCss.includes("html body .mail-reader-toolbar:not(.layout-editing)>.surface-header>.mail-reader-action-items{flex-wrap:wrap;justify-content:flex-end;align-content:flex-start;row-gap:12px;max-height:52px;margin:-4px;padding:4px;overflow:hidden!important}")
    && lvCss.includes("[data-kop-verborgen='true']{visibility:hidden}") && lvCss.includes('max-width:none!important'));
  check('D naast de lijst en zwevend geen reserve voor de bovenbalk in de kop (12 px i.p.v. 4.75rem)', lvCss.includes("html body .google-mail-reader-backdrop:is([data-lees-modus='rechts'],[data-lees-modus='onder'],[data-lees-modus='zwevend']) .google-mail-reader>header{padding-right:12px}"));
  check('D «Зменшити вікно» en de greep weg op ≤ 720 px (was ≤ 559 in mail-ux-beoordeling-20261021.css — daar weg)', lvCss.includes('@media (max-width:720px){\n  html body .google-mail-reader .mail-reader-venster{display:none!important}\n  html body .google-mail-reader .mail-reader-venster-greep{display:none!important}\n}') && !/\.mail-reader-venster \{ display:none/.test(rev));
  check('D ☰ en de menustrook alleen weg zolang de brief echt open is (niet geminimaliseerd)', qa.includes('html body:has(.google-mail-reader-backdrop:not(.reader-minimized)) .canonical-menu-toggle') && qa.includes('html body:has(.google-mail-reader-backdrop:not(.reader-minimized)) .canonical-chrome.sidebar-drawer-mode') && !qa.includes('html body:has(.google-mail-reader-backdrop) .canonical-menu-toggle'));
  check('D geen hex-kleuren in lees-venster.css (alleen tokens)', !/#[0-9a-fA-F]{3,8}\b/.test(lvCss));

  return einde();
}
