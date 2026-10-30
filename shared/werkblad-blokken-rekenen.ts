// Werkblad «Blokken» — rekenmachine (stroom B). PURE functies: geen DOM, geen netwerk, deterministisch.
// Contract: shared/werkblad-blokken.ts. Ontwerp: docs/ontwerp/WERKBLAD-BLOKKEN.md §2.
// 'auto' reproduceert exact de huidige CSS van «Швидкий доступ» (src/werkblad/werkblad.css:155-160, :233):
//   raster repeat(auto-fill,minmax(84px,1fr)), rijen minmax(68px,1fr), tussenruimte 8, icoon 36px kader / 20px tekening;
//   blokbreedte ≤ 380px → cellen 70px, rijen 54px, tussenruimte 6, icoon 28px / 16px tekening.
import type { ApparaatKlasse } from './werkblad-v3-types';
import {
  BLOKKEN_LIMIETEN, STANDAARD_INDELING,
  type Berekend, type Blok, type BlokIndeling, type Icoon, type Kader, type Knoop, type KnoopId, type Label, type Maat, type Onderdeel, type Uiterlijk,
} from './werkblad-blokken';

/** Huidige automatische waarden (één bron van waarheid voor tests en weergave). */
export const AUTO_WAARDEN = {
  celMin: 84, rijHoogte: 68, tussenruimte: 8, icoonPx: 36, tekeningPx: 20,
  smalGrens: 380, smalCelMin: 70, smalRijHoogte: 54, smalTussenruimte: 6, smalIcoonPx: 28, smalTekeningPx: 16,
  labelRuimte: 22, // ruimte onder het icoon voor de naam (6px + ~16px tekst)
} as const;

/** Extra opties die (nog) niet in het contract staan. Zie verslag: voorstel `BlokIndeling.overlapToestaan?: boolean`. */
export interface RekenOpties { overlapToestaan?: boolean }

const eindig = (n: unknown, terug = 0): number => (typeof n === 'number' && Number.isFinite(n) ? n : terug);
const klem = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));
const nietNeg = (n: number) => (n > 0 && Number.isFinite(n) ? n : 0);
const rond = (n: number) => Math.round(n * 100) / 100;

export const isSmal = (blokBreedte: number) => blokBreedte <= AUTO_WAARDEN.smalGrens;

// ------------------------------------------------------------------ icoon
/** 'auto'-icoongrootte zoals nu: 36 → 28 px onder 380 px blokbreedte. Vaste maat wint altijd. */
export function icoonPx(icoon: Icoon | undefined, blokBreedte: number): number {
  const g = icoon?.grootte;
  const { minIcoonPx: lo, maxIcoonPx: hi } = BLOKKEN_LIMIETEN;
  if (g?.soort === 'px') return klem(Math.round(eindig(g.waarde, AUTO_WAARDEN.icoonPx)), lo, hi);
  if (g?.soort === 'procent') return klem(Math.round((eindig(g.waarde, 10) / 100) * nietNeg(blokBreedte)), lo, hi);
  return isSmal(blokBreedte) ? AUTO_WAARDEN.smalIcoonPx : AUTO_WAARDEN.icoonPx;
}
/** Tekening binnen het icoonkader: 36→20, 28→16; vaste maten schalen mee (≈ 5/9). */
export function tekeningPx(kader: number): number {
  if (kader === AUTO_WAARDEN.icoonPx) return AUTO_WAARDEN.tekeningPx;
  if (kader === AUTO_WAARDEN.smalIcoonPx) return AUTO_WAARDEN.smalTekeningPx;
  return Math.max(8, Math.round(kader * 5 / 9));
}

// ------------------------------------------------------------------ overerving
/** Effectieve stijl van een onderdeel: eigen waarde > standaardOnderdeel van de ouder > standaard. */
export function effectieveStijl(o: Onderdeel, ouder: Blok | null): { icoon: Icoon; label: Label; uiterlijk: Uiterlijk } {
  const s = ouder?.standaardOnderdeel;
  const icoon: Icoon = { grootte: { soort: 'auto' }, stijl: 'kader', ...s?.icoon, ...o.icoon } as Icoon;
  if (o.icoon?.grootte === undefined && s?.icoon?.grootte) icoon.grootte = s.icoon.grootte;
  const label: Label = { tonen: 'auto', plaats: 'onder', grootte: 'normaal', ...s?.label, ...o.label } as Label;
  const uiterlijk: Uiterlijk = { ...s?.uiterlijk, ...o.uiterlijk };
  return { icoon, label, uiterlijk };
}

export const zichtbaarOp = (k: Knoop, apparaat: ApparaatKlasse) => k.apparaten?.[apparaat] !== 'verbergen';

function indelingVan(b: Blok): BlokIndeling { return { ...STANDAARD_INDELING, ...b.indeling }; }
function isAutoRaster(ind: BlokIndeling) {
  return ind.modus === 'raster' && (ind.rasterKolommen ?? 'auto') === 'auto' && (ind.rasterMinCel ?? 84) === AUTO_WAARDEN.celMin;
}
/** Kinderen in tekenvolgorde: zichtbaar, gesorteerd op volgorde (stabiel op id), eventueel omgekeerd. */
export function geordendeKinderen(b: Blok, apparaat: ApparaatKlasse): Knoop[] {
  const k = (b.kinderen || []).filter((c) => zichtbaarOp(c, apparaat))
    .slice(0, BLOKKEN_LIMIETEN.maxOnderdelenPerBlok)
    .sort((a, c) => eindig(a.volgorde) - eindig(c.volgorde) || (a.id < c.id ? -1 : a.id > c.id ? 1 : 0));
  return indelingVan(b).richting === 'omgekeerd' ? k.reverse() : k;
}

// ------------------------------------------------------------------ maten
/** Natuurlijke ('auto') maat van een tegel, zoals de huidige CSS. */
export function natuurlijkeTegel(o: Onderdeel, ouder: Blok | null, blokBreedte: number): { w: number; h: number } {
  const st = effectieveStijl(o, ouder);
  const ic = icoonPx(st.icoon, blokBreedte);
  const smal = isSmal(blokBreedte);
  const label = st.label.tonen !== 'nee';
  const opzij = label && (st.label.plaats === 'rechts' || st.label.plaats === 'links');
  const basisW = smal ? AUTO_WAARDEN.smalCelMin : AUTO_WAARDEN.celMin;
  const basisH = smal ? AUTO_WAARDEN.smalRijHoogte : AUTO_WAARDEN.rijHoogte;
  if (opzij) return { w: Math.max(basisW, ic + 16 + 96), h: Math.max(ic + 16, 44) };
  return { w: Math.max(basisW, ic + 16), h: Math.max(basisH, ic + 16 + (label ? AUTO_WAARDEN.labelRuimte : 0)) };
}

/** Maat → px. null = auto (natuurlijk) of deel (later verdeeld). */
export function maatPx(m: Maat | undefined, ouderBinnen: number): number | null {
  if (!m || m.soort === 'auto' || m.soort === 'deel') return null;
  if (m.soort === 'px') return klem(eindig(m.waarde), 0, BLOKKEN_LIMIETEN.maxPx);
  return nietNeg((klem(eindig(m.waarde), 0, 100) / 100) * nietNeg(ouderBinnen));
}
const deelVan = (m: Maat | undefined) => (m?.soort === 'deel' ? klem(eindig(m.waarde, 1), 0, 12) : 0);
function klemAs(k: Knoop, as: 'w' | 'h', v: number): number {
  const a = k.afmeting || ({} as Knoop['afmeting']);
  const min = as === 'w' ? a.minBreedte : a.minHoogte; const max = as === 'w' ? a.maxBreedte : a.maxHoogte;
  let r = v;
  if (typeof max === 'number' && Number.isFinite(max)) r = Math.min(r, Math.max(0, max));
  if (typeof min === 'number' && Number.isFinite(min)) r = Math.max(r, Math.max(0, min));
  return nietNeg(r);
}

/** Natuurlijke maat van een willekeurige knoop (blok: inhoud meten). */
export function natuurlijkeMaat(k: Knoop, ouder: Blok | null, beschikbaar: { w: number; h: number }, apparaat: ApparaatKlasse, diepte = 1): { w: number; h: number } {
  if (k.soort === 'onderdeel') return natuurlijkeTegel(k, ouder, beschikbaar.w);
  if (diepte > BLOKKEN_LIMIETEN.maxDiepte) return { w: 0, h: 0 };
  const ind = indelingVan(k); const p = klem(eindig(ind.binnenrand), 0, BLOKKEN_LIMIETEN.maxBinnenrand);
  const binnenW = nietNeg(beschikbaar.w - 2 * p);
  const r = legUit(k, { w: binnenW, h: 0 }, apparaat, diepte, {});
  let w = 0, h = 0;
  for (const c of r) { w = Math.max(w, c.kader.x + c.kader.w); h = Math.max(h, c.kader.y + c.kader.h); }
  return { w: w + 2 * p, h: h + 2 * p };
}

// ------------------------------------------------------------------ uitleg per modus
interface Plaatsing { knoop: Knoop; kader: Kader }

function legUit(b: Blok, binnen: { w: number; h: number }, apparaat: ApparaatKlasse, diepte: number, opt: RekenOpties): Plaatsing[] {
  const ind = indelingVan(b);
  const kinderen = geordendeKinderen(b, apparaat);
  if (!kinderen.length) return [];
  switch (ind.modus) {
    case 'vrij': return legVrij(b, kinderen, binnen, apparaat, diepte, opt.overlapToestaan ?? Boolean((ind as BlokIndeling & { overlapToestaan?: boolean }).overlapToestaan));
    case 'rij': return legFlex(b, kinderen, binnen, apparaat, diepte, 'rij', ind);
    case 'kolom': return legFlex(b, kinderen, binnen, apparaat, diepte, 'kolom', ind);
    default: return legRaster(b, kinderen, binnen, apparaat, diepte, ind);
  }
}

function legRaster(b: Blok, kinderen: Knoop[], binnen: { w: number; h: number }, apparaat: ApparaatKlasse, diepte: number, ind: BlokIndeling): Plaatsing[] {
  const W = nietNeg(binnen.w);
  const smal = isAutoRaster(ind) && isSmal(W);
  const gap = smal && ind.tussenruimte === STANDAARD_INDELING.tussenruimte ? AUTO_WAARDEN.smalTussenruimte : klem(eindig(ind.tussenruimte), 0, BLOKKEN_LIMIETEN.maxTussenruimte);
  const minCel = smal ? AUTO_WAARDEN.smalCelMin : Math.max(BLOKKEN_LIMIETEN.minPx, eindig(ind.rasterMinCel, AUTO_WAARDEN.celMin));
  const kol = typeof ind.rasterKolommen === 'number' && ind.rasterKolommen > 0
    ? Math.min(24, Math.floor(ind.rasterKolommen))
    : Math.max(1, Math.floor((W + gap) / (minCel + gap)));
  // auto-fill met minmax(min,1fr): kolommen nooit smaller dan min (overloop als het blok smaller is dan één cel).
  const celW = Math.max(typeof ind.rasterKolommen === 'number' ? 0 : minCel, nietNeg((W - gap * (kol - 1)) / kol));
  // Bezetting (CSS-grid «sparse» automatische plaatsing).
  const bezet: boolean[][] = [];
  const vrijOp = (r: number, c: number, sw: number, sh: number) => {
    if (c + sw > kol) return false;
    for (let i = r; i < r + sh; i++) for (let j = c; j < c + sw; j++) if (bezet[i]?.[j]) return false;
    return true;
  };
  let cr = 0, cc = 0; const cellen: Array<{ k: Knoop; r: number; c: number; sw: number; sh: number }> = [];
  for (const k of kinderen) {
    const sw = klem(Math.floor(eindig(k.rasterSpan?.kolommen, 1)), 1, kol);
    const sh = klem(Math.floor(eindig(k.rasterSpan?.rijen, 1)), 1, 12);
    let r = cr, c = cc;
    while (!vrijOp(r, c, sw, sh)) { c++; if (c + sw > kol) { c = 0; r++; } }
    for (let i = r; i < r + sh; i++) { bezet[i] = bezet[i] || []; for (let j = c; j < c + sw; j++) bezet[i][j] = true; }
    cellen.push({ k, r, c, sw, sh }); cr = r; cc = c + sw; if (cc >= kol) { cc = 0; cr++; }
  }
  const rijen = Math.max(1, bezet.length);
  const minRij = maatPx(ind.rasterRijHoogte, binnen.h) ?? (smal ? AUTO_WAARDEN.smalRijHoogte : AUTO_WAARDEN.rijHoogte);
  const vast = ind.rasterRijHoogte && ind.rasterRijHoogte.soort !== 'auto';
  // minmax(68px,1fr) + height:100% → rijen rekken mee als het blok hoger is.
  const rijH = vast ? minRij : Math.max(minRij, binnen.h > 0 ? nietNeg((binnen.h - gap * (rijen - 1)) / rijen) : 0);
  return cellen.map(({ k, r, c, sw, sh }) => {
    const celKader = { x: c * (celW + gap), y: r * (rijH + gap), w: celW * sw + gap * (sw - 1), h: rijH * sh + gap * (sh - 1) };
    return { knoop: k, kader: binnenCel(k, celKader, ind, b, apparaat, diepte) };
  });
}

/** Knoop binnen een cel: auto = celvullend (zoals nu), vaste maat → uitlijnen volgens dwars/hoofd. */
function binnenCel(k: Knoop, cel: Kader, ind: BlokIndeling, ouder: Blok, apparaat: ApparaatKlasse, diepte: number): Kader {
  const wv = maatPx(k.afmeting?.breedte, cel.w); const hv = maatPx(k.afmeting?.hoogte, cel.h);
  const w = klemAs(k, 'w', wv ?? cel.w); const h = klemAs(k, 'h', hv ?? cel.h);
  void ouder; void apparaat; void diepte;
  const lijn = (vrij: number, u: string) => (u === 'midden' ? vrij / 2 : u === 'eind' ? vrij : 0);
  return { x: cel.x + lijn(cel.w - w, ind.uitlijningHoofd), y: cel.y + lijn(cel.h - h, ind.uitlijningDwars), w, h };
}

function legFlex(b: Blok, kinderen: Knoop[], binnen: { w: number; h: number }, apparaat: ApparaatKlasse, diepte: number, as: 'rij' | 'kolom', ind: BlokIndeling): Plaatsing[] {
  const hoofd = as === 'rij' ? 'w' : 'h'; const dwars = as === 'rij' ? 'h' : 'w';
  const H = nietNeg(binnen[hoofd]); const D = nietNeg(binnen[dwars]);
  const gap = klem(eindig(ind.tussenruimte), 0, BLOKKEN_LIMIETEN.maxTussenruimte);
  const hoofdMaat = (k: Knoop) => (as === 'rij' ? k.afmeting?.breedte : k.afmeting?.hoogte);
  const dwarsMaat = (k: Knoop) => (as === 'rij' ? k.afmeting?.hoogte : k.afmeting?.breedte);
  const items = kinderen.map((k) => {
    const nat = natuurlijkeMaat(k, b, { w: as === 'rij' ? H : D, h: as === 'rij' ? D : H }, apparaat, diepte + 1);
    const vast = maatPx(hoofdMaat(k), H);
    const deel = deelVan(hoofdMaat(k));
    const basis = vast ?? (deel ? 0 : nat[hoofd]);
    return { k, nat, deel, basis: klemAs(k, hoofd, basis) };
  });
  // Regels (omloop): een item dat niet meer past begint een nieuwe regel (behalve als de regel leeg is).
  const regels: typeof items[] = [];
  let huidig: typeof items = [], som = 0;
  for (const it of items) {
    const nodig = (huidig.length ? gap : 0) + it.basis;
    if (ind.omloop && huidig.length && H > 0 && som + nodig > H + 0.01) { regels.push(huidig); huidig = []; som = 0; }
    som += (huidig.length ? gap : 0) + it.basis; huidig.push(it);
  }
  if (huidig.length) regels.push(huidig);
  const uit: Plaatsing[] = [];
  // Dwarsmaat per regel: hoogste natuurlijke/vaste dwarsmaat; één regel zonder omloop en D>0 → hele blok (rek).
  let dPos = 0;
  regels.forEach((regel) => {
    const gaps = gap * (regel.length - 1);
    const vast = regel.reduce((s, it) => s + it.basis, 0);
    let vrij = H > 0 ? H - gaps - vast : 0;
    const deelSom = regel.reduce((s, it) => s + it.deel, 0);
    const maten = regel.map((it) => it.basis);
    if (deelSom > 0 && vrij > 0) {
      // Verdeel vrije ruimte naar delen; respecteer min/max (iteratief bevriezen zoals flexbox).
      const open = new Set(regel.map((_, i) => i).filter((i) => regel[i].deel > 0));
      for (let ronde = 0; ronde < 8 && open.size && vrij > 0.01; ronde++) {
        const ds = [...open].reduce((s, i) => s + regel[i].deel, 0); let verdeeld = 0;
        for (const i of [...open]) {
          const doel = maten[i] + (vrij * regel[i].deel) / ds; const g = klemAs(regel[i].k, hoofd, doel);
          verdeeld += g - maten[i]; maten[i] = g; if (g !== doel) open.delete(i);
        }
        vrij -= verdeeld; if (Math.abs(verdeeld) < 0.01) break;
      }
      vrij = H - gaps - maten.reduce((s, m) => s + m, 0);
    }
    // Te weinig ruimte zonder omloop: automatische maten krimpen naar verhouding (zoals flex-shrink), niet kleiner dan
    // het tikvlak (44 px) of hun eigen minimum — anders schuift een geneste kolom in een rastercel over de buren.
    if (H > 0 && !ind.omloop) {
      const teVeel = maten.reduce((s, m) => s + m, 0) + gaps - H;
      const krimpbaar = regel.map((it, i) => (maatPx(hoofdMaat(it.k), H) === null && !it.deel ? i : -1)).filter((i) => i >= 0);
      const som = krimpbaar.reduce((s, i) => s + maten[i], 0);
      if (teVeel > 0.5 && som > 0) for (const i of krimpbaar) maten[i] = klemAs(regel[i].k, hoofd, Math.max(Math.min(44, maten[i]), maten[i] - (teVeel * maten[i]) / som));
      vrij = H - gaps - maten.reduce((s, m) => s + m, 0);
    }
    vrij = Math.max(0, vrij);
    // Geneste blokken opnieuw meten met hun echte hoofdmaat (een raster van 200px is hoger dan een van 600px).
    if (as === 'rij') regel.forEach((it, i) => { if (it.k.soort === 'blok') it.nat = natuurlijkeMaat(it.k, b, { w: maten[i], h: D }, apparaat, diepte + 1); });
    // Dwarsmaat van de regel: hoogste natuurlijke/vaste dwarsmaat; één regel en D>0 → blokmaat (rek), nooit erbuiten.
    const RD = regels.length === 1 && D > 0 ? D : Math.max(0, ...regel.map((it) => maatPx(dwarsMaat(it.k), D) ?? it.nat[dwars]));
    let start = 0, extra = 0;
    if (deelSom === 0 || vrij > 0.01) {
      if (ind.uitlijningHoofd === 'midden') start = vrij / 2;
      else if (ind.uitlijningHoofd === 'eind') start = vrij;
      else if (ind.uitlijningHoofd === 'verdeeld' && regel.length > 1) extra = vrij / (regel.length - 1);
      else if (ind.uitlijningHoofd === 'verdeeld') start = vrij / 2;
    }
    let pos = start;
    regel.forEach((it, i) => {
      const vd = maatPx(dwarsMaat(it.k), D);
      const rek = vd === null && ind.uitlijningDwars === 'rek';
      const dm = klemAs(it.k, dwars, rek ? RD : (vd ?? Math.min(it.nat[dwars], RD || it.nat[dwars])));
      const off = ind.uitlijningDwars === 'midden' ? (RD - dm) / 2 : ind.uitlijningDwars === 'eind' ? RD - dm : 0;
      const kader = as === 'rij' ? { x: pos, y: dPos + off, w: maten[i], h: dm } : { x: dPos + off, y: pos, w: dm, h: maten[i] };
      uit.push({ knoop: it.k, kader });
      pos += maten[i] + gap + extra;
    });
    dPos += RD + gap;
  });
  return uit;
}

const overlapt = (a: Kader, b: Kader) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

function legVrij(b: Blok, kinderen: Knoop[], binnen: { w: number; h: number }, apparaat: ApparaatKlasse, diepte: number, overlapToestaan: boolean): Plaatsing[] {
  const ind = indelingVan(b); const gap = klem(eindig(ind.tussenruimte), 0, BLOKKEN_LIMIETEN.maxTussenruimte);
  // Vaste volgorde: z, dan volgorde, dan id → deterministisch; lagere z wordt eerst geplaatst en blijft staan.
  const lijst = [...kinderen].sort((a, c) => eindig(a.positie?.z) - eindig(c.positie?.z) || eindig(a.volgorde) - eindig(c.volgorde) || (a.id < c.id ? -1 : 1));
  const geplaatst: Plaatsing[] = [];
  let volgendeY = 0;
  for (const k of lijst) {
    const nat = natuurlijkeMaat(k, b, binnen, apparaat, diepte + 1);
    const w = klemAs(k, 'w', maatPx(k.afmeting?.breedte, binnen.w) ?? (deelVan(k.afmeting?.breedte) ? binnen.w : nat.w));
    const h = klemAs(k, 'h', maatPx(k.afmeting?.hoogte, binnen.h) ?? (deelVan(k.afmeting?.hoogte) ? binnen.h : nat.h));
    let x = k.positie ? Math.max(0, eindig(k.positie.x)) : 0;
    let y = k.positie ? Math.max(0, eindig(k.positie.y)) : volgendeY;
    if (binnen.w > 0 && x + w > binnen.w) x = Math.max(0, binnen.w - w);
    let kader = { x, y, w, h };
    if (!overlapToestaan) {
      // Schuif omlaag tot er geen botsing meer is (eindig: elke stap passeert minstens één botser).
      for (let i = 0; i < 1000; i++) {
        const bots = geplaatst.find((p) => overlapt(kader, p.kader));
        if (!bots) break;
        kader = { ...kader, y: bots.kader.y + bots.kader.h + gap };
      }
    }
    geplaatst.push({ knoop: k, kader });
    volgendeY = Math.max(volgendeY, kader.y + kader.h + gap);
  }
  // Teruggeven in tekenvolgorde (zoals invoer), zodat de focusvolgorde los berekend kan worden.
  const pos = new Map(geplaatst.map((p) => [p.knoop.id, p]));
  return kinderen.map((k) => pos.get(k.id)!);
}

// ------------------------------------------------------------------ hoofdingang
function berekenIn(b: Blok, oorsprong: { x: number; y: number }, binnen: { w: number; h: number }, apparaat: ApparaatKlasse, diepte: number, opt: RekenOpties, uit: Berekend[]) {
  const plaatsingen = legUit(b, binnen, apparaat, diepte, opt);
  for (const { knoop, kader } of plaatsingen) {
    const abs: Kader = { x: rond(oorsprong.x + kader.x), y: rond(oorsprong.y + kader.y), w: rond(nietNeg(kader.w)), h: rond(nietNeg(kader.h)) };
    if (knoop.soort === 'onderdeel') {
      const st = effectieveStijl(knoop, b);
      const ip = Math.min(icoonPx(st.icoon, binnen.w), Math.max(BLOKKEN_LIMIETEN.minIcoonPx, Math.min(abs.w, abs.h)));
      const labelTonen = st.label.tonen === 'ja' ? true : st.label.tonen === 'nee' ? false
        : (st.label.plaats === 'rechts' || st.label.plaats === 'links' ? abs.w >= ip + 40 : abs.h >= ip + 18);
      uit.push({ id: knoop.id, kader: abs, icoonPx: ip, labelTonen, diepte: diepte + 1 });
    } else {
      uit.push({ id: knoop.id, kader: abs, icoonPx: 0, labelTonen: Boolean(knoop.titel), diepte: diepte + 1 });
      if (diepte + 1 >= BLOKKEN_LIMIETEN.maxDiepte) continue; // dieper wordt niet getekend
      const p = klem(eindig(indelingVan(knoop).binnenrand), 0, BLOKKEN_LIMIETEN.maxBinnenrand);
      berekenIn(knoop, { x: abs.x + p, y: abs.y + p }, { w: nietNeg(abs.w - 2 * p), h: nietNeg(abs.h - 2 * p) }, apparaat, diepte + 1, opt, uit);
    }
  }
}

/**
 * Rekenmachine: binnenmaat van het wortelblok → kaders van alle zichtbare knopen (absoluut t.o.v. de binnenkant van de wortel,
 * dus binnen de binnenrand). Wortel zelf zit niet in de uitkomst. Volgorde = boomvolgorde (ouder vóór kinderen).
 */
export function bereken(wortel: Blok, binnen: { w: number; h: number }, apparaat: ApparaatKlasse, opt: RekenOpties = {}): Berekend[] {
  const uit: Berekend[] = [];
  const p = klem(eindig(indelingVan(wortel).binnenrand), 0, BLOKKEN_LIMIETEN.maxBinnenrand);
  berekenIn(wortel, { x: p, y: p }, { w: nietNeg(eindig(binnen.w) - 2 * p), h: nietNeg(eindig(binnen.h) - 2 * p) }, apparaat, 0, opt, uit);
  return uit;
}

/** Benodigde hoogte van de inhoud (voor blokken die met hun inhoud meegroeien). */
export function inhoudHoogte(r: Berekend[], binnenrand = 0): number {
  return r.reduce((m, b) => Math.max(m, b.kader.y + b.kader.h), 0) + binnenrand;
}

/** Visuele leesvolgorde (boven→onder, links→rechts, rijtolerantie 8px) — voor focus en schermlezers. */
export function leesVolgorde(r: Berekend[]): KnoopId[] {
  return [...r].sort((a, b) => (Math.abs(a.kader.y - b.kader.y) > 8 ? a.kader.y - b.kader.y : a.kader.x - b.kader.x) || (a.id < b.id ? -1 : 1)).map((b) => b.id);
}

/** Doelzone voor slepen (stroom D): invoegpunt binnen een blok op aanwijzerpositie. */
export function doelIndex(wortel: Blok, r: Berekend[], blokId: KnoopId, punt: { x: number; y: number }, apparaat: ApparaatKlasse): { voor: KnoopId | null; index: number } {
  const zoek = (b: Blok): Blok | null => { if (b.id === blokId) return b; for (const c of b.kinderen || []) if (c.soort === 'blok') { const z = zoek(c); if (z) return z; } return null; };
  const blok = zoek(wortel); if (!blok) return { voor: null, index: 0 };
  const kids = geordendeKinderen(blok, apparaat); const kaders = new Map(r.map((b) => [b.id, b.kader]));
  const modus = indelingVan(blok).modus;
  for (let i = 0; i < kids.length; i++) {
    const k = kaders.get(kids[i].id); if (!k) continue;
    const midX = k.x + k.w / 2, midY = k.y + k.h / 2;
    const voor = modus === 'kolom' ? punt.y < midY : punt.y < k.y + k.h && (punt.y < k.y || punt.x < midX);
    if (voor) return { voor: kids[i].id, index: i };
  }
  return { voor: null, index: kids.length };
}

// ------------------------------------------------------------------ kleuren (veilig, geen vrije CSS)
const HEX = /^#[0-9a-fA-F]{6}$/; const TOKEN = /^token:[a-z0-9-]{1,40}$/;
export function kleurCss(k: string | undefined): string | undefined {
  if (!k || k === 'thema') return undefined;
  if (HEX.test(k)) return k.toLowerCase();
  if (TOKEN.test(k)) return `var(--${k.slice(6)})`;
  return undefined;
}
/** Relatieve luminantie (WCAG) van #rrggbb. */
export function luminantie(hex: string): number {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}
export function contrast(a: string, b: string): number { const [x, y] = [luminantie(a), luminantie(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); }
/** Tekstkleur op een eigen #rrggbb-achtergrond: gekozen kleur als contrast ≥ 4.5, anders zwart/wit (de beste). */
export function leesbareTekst(achtergrond: string | undefined, gewenst?: string): string | undefined {
  if (!achtergrond || !HEX.test(achtergrond)) return kleurCss(gewenst);
  if (gewenst && HEX.test(gewenst) && contrast(achtergrond, gewenst) >= 4.5) return gewenst.toLowerCase();
  return contrast(achtergrond, '#000000') >= contrast(achtergrond, '#ffffff') ? '#111111' : '#ffffff';
}
