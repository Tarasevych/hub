// Leesvenster van de Post: één venster, vijf vormen (pakket 1 «Adaptive Mail Canvas», 24.10.2026).
// Wens van de eigenaar: «один переглядач, який виглядає як професійна поштова програма на комп'ютері, залишається простим на
// телефоні та не втрачає можливостей під час зміни розміру вікна»; повний, розділений, плаваючий і мобільний режими «поводяться однаково».
// Puur (geen DOM): src/mail/LeesVenster.tsx, src/lezer-venster.ts en src/MailLezerWerkbalk.tsx gebruiken het,
// tests/eenheid/lees-venster-20261024.test.ts toetst het. Eén uitzondering (25.10.2026, 2.5): binnenScherm vraagt — als de aanroeper
// geen hindernissen meegeeft — de laag van de zwevende knoppen naar haar zones (vensterHindernissen; zonder browser: geen).
import { vensterHindernissen, type Hindernis } from '../plaatsing/plaatsing-staat';
//
// Vroeger lagen de grenzen door elkaar (559/560, 700/701, 720/721 en 760 px): tussen 721 en 760 px deed «Зменшити вікно» niets, en de
// kop van de brief rekende met de breedte van het SCHERM (56vw, 100vw − 268 px) terwijl de brief rechts maar 52vw breed is — de knoppen
// schoven over elkaar. Nu: één grens voor de telefoon, en alles wat in het venster zit, rekent met de breedte van het venster zelf.

export type LeesModus = 'volledig' | 'rechts' | 'onder' | 'zwevend' | 'telefoon';
export type LeesBreedte = 'smal' | 'midden' | 'breed';
export type LeesPaneel = 'none' | 'right' | 'below';

/** Onder deze schermbreedte (CSS-px) is het een telefoon: het venster vult het scherm. Zelfde grens als `(max-width:720px)` in de CSS
 *  en `mobileViewport` in GoogleMailWerkruimte. */
export const TELEFOON_TOT = 721;
/** Breedteklassen van het venster zelf: < 560 smal (telefoonopmaak), < 1100 midden, anders breed (ruimte voor context ernaast). */
export const SMAL_TOT = 560;
export const MIDDEN_TOT = 1100;

export function leesModus(o: { schermBreedte: number; paneel: LeesPaneel | string; zwevend: boolean }): LeesModus {
  if (!(o.schermBreedte >= TELEFOON_TOT)) return 'telefoon';
  if (o.zwevend) return 'zwevend';
  return o.paneel === 'right' ? 'rechts' : o.paneel === 'below' ? 'onder' : 'volledig';
}

/** Het paneel dat echt geldt: op de telefoon is er geen plaats naast of onder de lijst — daar is de brief altijd «volledig». */
export const werkelijkPaneel = (schermBreedte: number, paneel: LeesPaneel | string): LeesPaneel =>
  !(schermBreedte >= TELEFOON_TOT) ? 'none' : paneel === 'right' || paneel === 'below' ? paneel : 'none';

export function leesBreedte(px: number): LeesBreedte {
  if (!(px >= SMAL_TOT)) return 'smal';
  return px < MIDDEN_TOT ? 'midden' : 'breed';
}

/** «Volledig» en «telefoon» bedekken de lijst: een modaal dialoogvenster. «Zwevend» is een niet-modaal dialoogvenster (de lijst
 *  eronder blijft bruikbaar), «rechts» en «onder» zijn een gewoon gebied van de pagina naast de lijst. */
export function leesRol(m: LeesModus): { role: 'dialog' | 'region'; modaal: boolean } {
  if (m === 'rechts' || m === 'onder') return { role: 'region', modaal: false };
  return { role: 'dialog', modaal: m !== 'zwevend' };
}

/** Gaat de focus bij het openen naar het venster? Ja als het venster de lijst bedekt of erboven zweeft; in de gesplitste vormen
 *  blijft de focus in de lijst (de lijst staat er nog, met het toetsenbord loop je verder door de brieven). */
export const focusBijOpenen = (m: LeesModus) => m === 'volledig' || m === 'telefoon' || m === 'zwevend';

/** Sluit Escape het venster? Nooit als het geminimaliseerd is (dan is het onzichtbaar en zou de concepttekst verloren gaan); in de
 *  gesplitste vormen en zwevend alleen met de focus in het venster (Escape in de lijst mag de brief niet stilletjes dichtdoen). */
export function escSluit(o: { modus: LeesModus; geminimaliseerd: boolean; focusBinnen: boolean }): boolean {
  if (o.geminimaliseerd) return false;
  if (o.modus === 'volledig' || o.modus === 'telefoon') return true;
  return o.focusBinnen;
}

/** «Назад» op de telefoon (en in de browser): het openen van een brief zet één stap in de geschiedenis; terug sluit de brief en
 *  laat de lijst op dezelfde plek. Alleen waar de brief de lijst bedekt (telefoon, «volledig»); naast de lijst is «terug» de vorige pagina. */
export const geschiedenisStap = (m: LeesModus) => m === 'telefoon' || m === 'volledig';
export const GESCHIEDENIS_SLEUTEL = 'mrLezer';

/** De lijst krijgt haar schuifpositie van vóór het openen terug alleen als de brief haar bedekte; in de gesplitste vormen staat de lijst
 *  er de hele tijd (je kunt erin schuiven terwijl de brief open is) en mag ze bij het sluiten niet terugspringen. */
export const lijstPositieTerug = (m: LeesModus) => m === 'volledig' || m === 'telefoon';

/** Schuifpositie per brief: terugkomen op dezelfde brief (vorige/volgende, minimaliseren, opnieuw openen) brengt je terug waar je was. */
export class LeesPosities {
  private kaart = new Map<string, number>();
  constructor(private max = 50) {}
  zet(id: string, y: number) {
    if (!id) return;
    this.kaart.delete(id);
    this.kaart.set(id, Math.max(0, Math.round(Number(y) || 0)));
    while (this.kaart.size > this.max) this.kaart.delete(this.kaart.keys().next().value as string);
  }
  haal(id: string): number { return this.kaart.get(id) ?? 0; }
  get grootte() { return this.kaart.size; }
}

/** Zwevend venster met het toetsenbord (zelfde afspraak als src/platform/vensters.tsx): met de focus op de greep verplaatsen de
 *  pijltjes 16 px (Alt: 2 px), Shift+pijltjes veranderen de grootte. Geeft de nieuwe stand of null (geen venstertoets). */
export type VensterStand = { x: number; y: number; w: number; h: number };
export function vensterToets(s: VensterStand, toets: { key: string; shiftKey?: boolean; altKey?: boolean }): VensterStand | null {
  const stap = toets.altKey ? 2 : 16;
  const d = ({ ArrowLeft: [-stap, 0], ArrowRight: [stap, 0], ArrowUp: [0, -stap], ArrowDown: [0, stap] } as Record<string, [number, number]>)[toets.key];
  if (!d) return null;
  return toets.shiftKey ? { ...s, w: s.w + d[0], h: s.h + d[1] } : { ...s, x: s.x + d[0], y: s.y + d[1] };
}

/** Wat de site rond de post inneemt en het leesvenster dus vrij moet laten (CSS-px vanaf elke rand van het scherm). */
export type Randen = { links: number; rechts: number; boven: number; onder: number };
export const GEEN_RANDEN: Randen = { links: 0, rechts: 0, boven: 0, onder: 0 };
/** Hoogte van de bovenbalk van de site (avatar, meldingen): «rechts» begint eronder (mail-snelle-instellingen.css: top 58px) en het
 *  zwevende venster mag er niet onder schuiven — de balk ligt boven de post en zou de knoppen van het venster bedekken. */
export const BOVENBALK = 58;

/** Vrije ruimte naast het menu van de site, voor het leesvenster en de bijlage-werkbank. Het menu kan links staan (gewoon), rechts
 *  («menu rechts») of als zwevend dock boven/onder (menu-v2.css). Vroeger telde alleen «rechterkant van de zijbalk = linkerrand van de
 *  brief»: met het menu rechts begon de brief dan bij de rechterrand van het scherm (onzichtbaar), met een dock in het midden. */
export function vrijeRanden(o: { dock: string; zijbalk: { left: number; right: number; top: number; bottom: number } | null; scherm: { w: number; h: number } }): Randen {
  if (!o.zijbalk) return { ...GEEN_RANDEN };
  const px = (n: number) => Math.max(0, Math.round(n * 100) / 100);
  if (o.dock === 'rechts') return { ...GEEN_RANDEN, rechts: px(o.scherm.w - o.zijbalk.left) };
  if (o.dock === 'boven') return { ...GEEN_RANDEN, boven: px(o.zijbalk.bottom + RAND) };
  if (o.dock === 'onder') return { ...GEEN_RANDEN, onder: px(o.scherm.h - o.zijbalk.top + RAND) };
  return { ...GEEN_RANDEN, links: px(o.zijbalk.right) };
}

/** Het zwevende venster binnen het vrije deel van het scherm houden (naast menu/dock, onder de bovenbalk), ook na het verkleinen van
 *  het browservenster. Gewoon minimum 520×420 (QA 12.10 №5: kleiner gaf een onbruikbare kop) — maar het menu en het dock gaan vóór:
 *  past dat minimum er niet naast, dan wordt het venster kleiner (tot 360×300, de kop schuift dan zelf acties naar ⋮). Pas als ook
 *  dat niet past, wijken de randen (het venster mag dan over het menu), nooit het scherm.
 *  25.10.2026 (2.5): daarna wijkt het venster voor de HINDERNISSEN — de zones van de zwevende knoppen die boven elk venster van de post
 *  liggen (bovenbalk, actiestapel; standaard gemeten door de laag: src/plaatsing/plaatsing-staat.ts → vensterHindernissen). Zo komt
 *  geen knop van het venster onder de bel, de foto, «Написати» of «Вгору», waar de gebruiker die ook zette. */
export const MIN_W = 520, MIN_H = 420, RAND = 8, KLEINST_W = 360, KLEINST_H = 300;
export function binnenScherm(s: VensterStand, scherm: { w: number; h: number }, r: Partial<Randen> = {}, hindernissen: Hindernis[] = vensterHindernissen()): VensterStand {
  const krimp = (a: number, b: number, ruimte: number) => { const over = a + b - Math.max(0, ruimte); if (over <= 0) return [a, b]; const a2 = Math.max(0, a - over); return [a2, Math.max(0, b - (over - (a - a2)))]; };
  const [links, rechts] = krimp(Math.max(0, Number(r.links) || 0), Math.max(0, Number(r.rechts) || 0), scherm.w - KLEINST_W - 2 * RAND);
  const [boven, onder] = krimp(Math.max(0, Number(r.boven) || 0), Math.max(0, Number(r.onder) || 0), scherm.h - KLEINST_H - 2 * RAND);
  const vrijW = scherm.w - links - rechts - 2 * RAND, vrijH = scherm.h - boven - onder - 2 * RAND;
  const w = Math.max(1, Math.min(vrijW, Math.max(MIN_W, s.w)));
  const h = Math.max(1, Math.min(vrijH, Math.max(MIN_H, s.h)));
  const v = { w, h, x: Math.max(links + RAND, Math.min(s.x, scherm.w - rechts - w - RAND)), y: Math.max(boven + RAND, Math.min(s.y, scherm.h - onder - h - RAND)) };
  return hindernissen.length ? ontwijk(v, { x0: links + RAND, y0: boven + RAND, x1: scherm.w - rechts - RAND, y1: scherm.h - onder - RAND }, hindernissen) : v;
}

export type { Hindernis };
/** Lucht tussen het venster en een hindernis (zelfde marge als het vensterdok om de bel en de stapel). */
export const HINDERNIS_MARGE = 4;
/** Het venster `v` weg van de hindernissen, binnen het vrije vak: de goedkoopste stand die niets raakt — verschuiven (links, rechts,
 *  boven of onder een hindernis) gaat vóór krimpen (rechterrand vóór de hindernis, onderrand erboven of bovenrand eronder, nooit kleiner
 *  dan 360×300); raakt één stap een tweede hindernis, dan nog één stap vanaf daar (bovenbalk én stapel). Past niets, dan blijft het venster
 *  staan: het scherm gaat vóór. Zuiver (getest). */
export function ontwijk(v: VensterStand, vrij: { x0: number; y0: number; x1: number; y1: number }, hindernissen: Hindernis[], marge = HINDERNIS_MARGE): VensterStand {
  const hs = hindernissen.filter((h) => h.width > 0 && h.height > 0);
  const raaktH = (c: VensterStand, h: Hindernis) => c.x < h.left + h.width + marge && c.x + c.w + marge > h.left && c.y < h.top + h.height + marge && c.y + c.h + marge > h.top;
  const binnen = (c: VensterStand) => c.w >= 1 && c.h >= 1 && c.x >= vrij.x0 - 0.5 && c.y >= vrij.y0 - 0.5 && c.x + c.w <= vrij.x1 + 0.5 && c.y + c.h <= vrij.y1 + 0.5;
  const vrijVan = (c: VensterStand) => binnen(c) && !hs.some((h) => raaktH(c, h));
  if (!hs.some((h) => raaktH(v, h))) return v;
  const stappen = (c: VensterStand): VensterStand[] => hs.filter((h) => raaktH(c, h)).flatMap((h) => {
    const l = Math.floor(h.left - marge), r = Math.ceil(h.left + h.width + marge), t = Math.floor(h.top - marge), b = Math.ceil(h.top + h.height + marge);
    const uit: VensterStand[] = [{ ...c, x: l - c.w }, { ...c, x: r }, { ...c, y: t - c.h }, { ...c, y: b }];
    if (l - c.x >= KLEINST_W) uit.push({ ...c, w: l - c.x });
    if (c.x + c.w - r >= KLEINST_W) uit.push({ ...c, x: r, w: c.x + c.w - r });
    if (t - c.y >= KLEINST_H) uit.push({ ...c, h: t - c.y });
    if (c.y + c.h - b >= KLEINST_H) uit.push({ ...c, y: b, h: c.y + c.h - b });
    return uit;
  });
  const kosten = (c: VensterStand) => Math.abs(c.x - v.x) + Math.abs(c.y - v.y) + 2 * (Math.abs(c.w - v.w) + Math.abs(c.h - v.h));
  const eerste = stappen(v);
  let goed = eerste.filter(vrijVan);
  if (!goed.length) goed = eerste.filter(binnen).flatMap(stappen).filter(vrijVan);
  return goed.sort((a, b) => kosten(a) - kosten(b))[0] || v;
}

/** Kop van de brief («priority+»): de acties staan op één regel in hun volgorde; wat niet past, schuift naar een tweede regel die
 *  niet te zien is. Deze functie zegt welke dat zijn — die toont ⋮ bovenaan. Een actie die maar half past, telt als niet passend. */
export function kopVerborgen(items: Array<{ id: string; top: number; links: number; rechts: number }>, vak: { links: number; rechts: number }): string[] {
  const zichtbaar = items.filter((i) => i.rechts - i.links >= 1); // zonder breedte (display:none) = niet in de kop
  if (!zichtbaar.length) return items.map((i) => i.id);
  const eerste = Math.min(...zichtbaar.map((i) => i.top));
  return items.filter((i) => i.rechts - i.links < 1 || i.top > eerste + 1 || i.links < vak.links - 1 || i.rechts > vak.rechts + 1).map((i) => i.id);
}

// ------------------------------------------------------------------ pakket 2: context en weergave
/** Contextpaneel: een kolom naast de brief in een breed venster (aan/uit onthouden), anders een blad op verzoek. */
export type ContextVorm = 'kolom' | 'blad' | 'uit';
export function contextVorm(breedte: LeesBreedte, kolomAan: boolean, bladOpen: boolean): ContextVorm {
  if (breedte === 'breed') return kolomAan ? 'kolom' : 'uit';
  return bladOpen ? 'blad' : 'uit';
}
/** Eigen stap in de geschiedenis voor het blad (boven die van de brief): «Назад» sluit eerst het blad, dan de brief. */
export const BLAD_SLEUTEL = 'mrLezerBlad';
/** Het blad krijgt alleen een eigen stap als de brief er zelf één heeft (telefoon, volledig) — anders zou «Назад» in de gesplitste
 *  vormen eerst het blad en daarna pas de vorige pagina doen, en klopt de volgorde van de stappen niet meer. */
export const bladStap = (m: LeesModus) => geschiedenisStap(m);

/** Sneltoetsen in de open brief (макет: R, A, F, E, J/K, F6, ?). */
export type Sneltoets = 'antwoord' | 'allen' | 'doorsturen' | 'archief' | 'volgende' | 'vorige' | 'wissel' | 'hulp';
const TOETS_LETTER: Record<string, Sneltoets> = { r: 'antwoord', a: 'allen', f: 'doorsturen', e: 'archief', j: 'volgende', k: 'vorige' };
const TOETS_CODE: Record<string, Sneltoets> = { KeyR: 'antwoord', KeyA: 'allen', KeyF: 'doorsturen', KeyE: 'archief', KeyJ: 'volgende', KeyK: 'vorige' };
/** Welke actie hoort bij deze toets? Nooit met Ctrl/Alt/Meta (die zijn van de browser en het systeem) en nooit tijdens het typen
 *  (F6 wel: dat typt niets). De letter telt (AZERTY: de toets met «A» is «A»); is de letter geen Latijnse (Oekraïense indeling: «к»),
 *  dan telt de plaats van de toets (KeyR), zodat R ook werkt zonder van indeling te wisselen. «?» is op elke indeling een andere toets. */
export function sneltoets(e: { key: string; code?: string; ctrlKey?: boolean; altKey?: boolean; metaKey?: boolean; shiftKey?: boolean; isComposing?: boolean; repeat?: boolean }, typen: boolean): Sneltoets | null {
  if (e.ctrlKey || e.altKey || e.metaKey || e.isComposing) return null;
  if (e.key === 'F6') return e.shiftKey ? null : 'wissel';
  if (typen || e.repeat) return null;
  if (e.key === '?') return 'hulp';
  if (e.shiftKey) return null;
  const k = String(e.key || '');
  if (k.length === 1 && /[a-z]/i.test(k)) return TOETS_LETTER[k.toLowerCase()] || null;
  if (k.length === 1 && /\p{L}/u.test(k)) return TOETS_CODE[String(e.code || '')] || null;
  return null;
}
/** Mogen sneltoetsen nu iets doen? Zelfde afspraak als Escape: nooit als de brief geminimaliseerd is; in «volledig» en op de
 *  telefoon altijd (de brief bedekt de lijst), naast de lijst en zwevend alleen met de focus in de brief — anders zou «E» in de
 *  lijst stilletjes de open brief archiveren. */
export const sneltoetsMag = (o: { modus: LeesModus; geminimaliseerd: boolean; focusBinnen: boolean }) => escSluit(o);

/** «Вигляд» van de brief, per apparaat: dichtheid (los van de vorm van het venster), tekstgrootte van de brieftekst en externe beelden
 *  (макет: «Вигляд: Щільність, Мова листа, Зовнішні зображення»; смуга безпеки «N зовнішні зображення приховано · Показати один раз»).
 *  beelden: 'vragen' = externe beelden pas na «Показати» (geen enkel verzoek naar buiten, ook niet via de eigen server: een pixel kan
 *  verraden dat de brief geopend is); 'altijd' = meteen, via de eigen server (zoals vóór pakket 2). */
export type LezerDichtheid = 'compact' | 'normaal' | 'ruim';
export type LezerBeelden = 'vragen' | 'altijd';
/** «Мова листа» (pakket 3): 'origineel' = de brief zoals hij kwam (standaard, er gaat niets weg); 'vertaling' = een brief in een andere
 *  taal dan de site wordt bij het openen vertaald door de privé-AI-agent — alleen als die er is, en de keuze zegt dat de tekst dan
 *  naar die agent gaat. «Оригінал» blijft in de brief altijd één klik verder (de vertaalstrook). */
export type LezerTaal = 'origineel' | 'vertaling';
export type LezerWeergave = { dichtheid: LezerDichtheid; tekst: number; beelden: LezerBeelden; taal: LezerTaal };
export const TEKST_STAPPEN = [0.9, 1, 1.15, 1.3] as const;
export const STANDAARD_WEERGAVE: LezerWeergave = { dichtheid: 'normaal', tekst: 1, beelden: 'vragen', taal: 'origineel' };
export function normaliseerWeergave(v: unknown): LezerWeergave {
  const o = (v && typeof v === 'object' ? v : {}) as Record<string, unknown>;
  const dichtheid = o.dichtheid === 'compact' || o.dichtheid === 'ruim' ? o.dichtheid : 'normaal';
  const t = Number(o.tekst);
  const tekst = (TEKST_STAPPEN as readonly number[]).includes(t) ? t : 1;
  const beelden: LezerBeelden = o.beelden === 'altijd' ? 'altijd' : 'vragen';
  const taal: LezerTaal = o.taal === 'vertaling' ? 'vertaling' : 'origineel';
  return { dichtheid, tekst, beelden, taal };
}
export const WEERGAVE_SLEUTEL = 'mail-lezer-weergave-v1';
export const CONTEXT_SLEUTEL = 'mail-lezer-context-v1';

