/**
 * Slimme donkere weergave voor HTML-mail (28.10.2026, «Мій простір», agent 3).
 *
 * Melding eigenaar: «Припини рендерити листи на білому тлі під час темної теми!» — in het donkere thema stond de brief op wit
 * papier, of zwarte tekst op een donkere achtergrond. Deze module zet een (al opgeschoonde) maildocument om:
 *  - witte en bijna-witte achtergronden (style, `bgcolor`, verlopen) → het donkere systeemoppervlak (lichte tinten → donkere tinten,
 *    met behoud van kleurtoon); merkkleuren (verzadigd, middelhelder — knoppen) blijven;
 *  - tekstkleur (ook koppelingen, `<font color>`, citaatbalken/randen) volgens WCAG-contrast: ≥ 4,5:1 (grote tekst ≥ 3:1), randen ≥ 3:1;
 *  - afbeeldingen blijven onaangeroerd, behalve een licht «plaatje» (achtergrondkleur, geen maat) achter mogelijk transparante logo's;
 *  - tekst op een achtergrondafbeelding krijgt alleen een schaduw (scrim) als de tekstkleur licht gemaakt moest worden;
 *  - nooit maten, marges, posities of lettergrootte: alleen kleuren → de opmaak blijft identiek (zie tests/eenheid/mail-donker-browser.test.ts).
 * Een brief die zelf een donker ontwerp heeft (`color-scheme: dark`, `@media (prefers-color-scheme: dark)`) blijft zijn eigen ontwerp.
 * Lineair in de grootte (één doorloop, geen getComputedStyle, geen opmaakberekening).
 */

export type Rgba = { r: number; g: number; b: number; a: number };
export type DonkerOpties = { oppervlak?: string; tekst?: string; koppeling?: string; logoPlaat?: string };
export type DonkerVerslag = { modus: 'aangepast' | 'eigen-donker'; achtergronden: number; teksten: number; randen: number; logos: number; ms: number };

const NAMEN: Record<string, string> = {
  white: '#ffffff', black: '#000000', snow: '#fffafa', ivory: '#fffff0', ghostwhite: '#f8f8ff', whitesmoke: '#f5f5f5', floralwhite: '#fffaf0',
  linen: '#faf0e6', seashell: '#fff5ee', mintcream: '#f5fffa', azure: '#f0ffff', aliceblue: '#f0f8ff', honeydew: '#f0fff0', lavenderblush: '#fff0f5',
  oldlace: '#fdf5e6', beige: '#f5f5dc', cornsilk: '#fff8dc', lightyellow: '#ffffe0', lemonchiffon: '#fffacd', papayawhip: '#ffefd5', mistyrose: '#ffe4e1',
  lavender: '#e6e6fa', gainsboro: '#dcdcdc', lightgray: '#d3d3d3', lightgrey: '#d3d3d3', silver: '#c0c0c0', darkgray: '#a9a9a9', darkgrey: '#a9a9a9',
  gray: '#808080', grey: '#808080', dimgray: '#696969', dimgrey: '#696969', red: '#ff0000', green: '#008000', blue: '#0000ff', navy: '#000080',
  maroon: '#800000', purple: '#800080', teal: '#008080', olive: '#808000', orange: '#ffa500', yellow: '#ffff00', lime: '#00ff00', aqua: '#00ffff',
  cyan: '#00ffff', fuchsia: '#ff00ff', magenta: '#ff00ff', darkblue: '#00008b', darkred: '#8b0000', darkgreen: '#006400', darkslategray: '#2f4f4f',
  darkslategrey: '#2f4f4f', slategray: '#708090', midnightblue: '#191970', lightblue: '#add8e6', lightgreen: '#90ee90', lightcyan: '#e0ffff',
  lightpink: '#ffb6c1', pink: '#ffc0cb', wheat: '#f5deb3', antiquewhite: '#faebd7', blanchedalmond: '#ffebcd', bisque: '#ffe4c4', royalblue: '#4169e1',
  steelblue: '#4682b4', dodgerblue: '#1e90ff', firebrick: '#b22222', crimson: '#dc143c', gold: '#ffd700', darkorange: '#ff8c00', tomato: '#ff6347',
};

const klem = (x: number, a = 0, b = 1) => Math.min(b, Math.max(a, x));

/** Leest #rgb, #rgba, #rrggbb, #rrggbbaa, rgb()/rgba() (komma of spatie, %), hsl()/hsla(), kleurnamen en `transparent`. */
export function leesKleur(invoer: string | null | undefined): Rgba | null {
  if (!invoer) return null;
  let s = String(invoer).trim().toLowerCase().replace(/\s*!important$/, '');
  if (!s) return null;
  if (s === 'transparent') return { r: 0, g: 0, b: 0, a: 0 };
  if (NAMEN[s]) s = NAMEN[s];
  if (/^[0-9a-f]{6}$/.test(s) || /^[0-9a-f]{3}$/.test(s)) s = '#' + s; // bgcolor="ffffff" (Outlook)
  if (s[0] === '#') {
    const h = s.slice(1);
    if (!/^[0-9a-f]+$/.test(h)) return null;
    if (h.length === 3 || h.length === 4) {
      const p = [...h].map((c) => parseInt(c + c, 16));
      return { r: p[0], g: p[1], b: p[2], a: h.length === 4 ? p[3] / 255 : 1 };
    }
    if (h.length === 6 || h.length === 8) {
      const p = [0, 2, 4, 6].map((i) => parseInt(h.slice(i, i + 2) || 'ff', 16));
      return { r: p[0], g: p[1], b: p[2], a: h.length === 8 ? p[3] / 255 : 1 };
    }
    return null;
  }
  const m = /^(rgba?|hsla?)\(\s*([^)]*)\)$/.exec(s);
  if (!m) return null;
  const delen = m[2].split(/\s*[,/]\s*|\s+/).filter(Boolean);
  if (delen.length < 3) return null;
  const alfa = delen[3] === undefined ? 1 : delen[3].endsWith('%') ? parseFloat(delen[3]) / 100 : parseFloat(delen[3]);
  if (m[1].startsWith('rgb')) {
    const c = delen.slice(0, 3).map((d) => (d.endsWith('%') ? (parseFloat(d) * 255) / 100 : parseFloat(d)));
    if (c.some((x) => !Number.isFinite(x))) return null;
    return { r: klem(c[0], 0, 255), g: klem(c[1], 0, 255), b: klem(c[2], 0, 255), a: klem(Number.isFinite(alfa) ? alfa : 1) };
  }
  const hue = parseFloat(delen[0]), sat = parseFloat(delen[1]) / 100, lic = parseFloat(delen[2]) / 100;
  if (![hue, sat, lic].every(Number.isFinite)) return null;
  return { ...uitHsl(hue, klem(sat), klem(lic)), a: klem(Number.isFinite(alfa) ? alfa : 1) };
}

export function naarTekst(k: Rgba): string {
  const r = Math.round(k.r), g = Math.round(k.g), b = Math.round(k.b);
  return k.a >= 0.999 ? '#' + [r, g, b].map((x) => x.toString(16).padStart(2, '0')).join('') : `rgba(${r}, ${g}, ${b}, ${+k.a.toFixed(3)})`;
}

const lin = (c: number) => { const x = c / 255; return x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; };
/** Relatieve luminantie (WCAG 2.x). */
export const luminantie = (k: Rgba) => 0.2126 * lin(k.r) + 0.7152 * lin(k.g) + 0.0722 * lin(k.b);
/** Contrastverhouding (WCAG 2.x), 1…21. */
export function contrast(a: Rgba, b: Rgba) { const x = luminantie(a), y = luminantie(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); }
/** `boven` (eventueel half doorzichtig) over een dekkende `onder`. */
export function meng(boven: Rgba, onder: Rgba): Rgba {
  const a = boven.a;
  return { r: boven.r * a + onder.r * (1 - a), g: boven.g * a + onder.g * (1 - a), b: boven.b * a + onder.b * (1 - a), a: 1 };
}

export function naarHsl(k: Rgba) {
  const r = k.r / 255, g = k.g / 255, b = k.b / 255, max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l };
  const d = max - min, s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return { h: h * 60, s, l };
}
export function uitHsl(h: number, s: number, l: number): Rgba {
  const hh = (((h % 360) + 360) % 360) / 360;
  if (s === 0) return { r: l * 255, g: l * 255, b: l * 255, a: 1 };
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
  const f = (t: number) => { t = (t + 1) % 1; return t < 1 / 6 ? p + (q - p) * 6 * t : t < 1 / 2 ? q : t < 2 / 3 ? p + (q - p) * (2 / 3 - t) * 6 : p; };
  return { r: f(hh + 1 / 3) * 255, g: f(hh) * 255, b: f(hh - 1 / 3) * 255, a: 1 };
}

/** Is dit een «lichte» achtergrond die in het donkere thema donker moet worden? (Merkkleuren — verzadigd en middelhelder — niet.) */
export function isLichteAchtergrond(k: Rgba): boolean {
  if (k.a < 0.05) return false;
  const lum = luminantie(k), { s, l } = naarHsl(k);
  if (lum < 0.4) return false;
  if (s > 0.55 && l < 0.82) return false; // fel geel/oranje/groen merkvlak (knop, banner): eigen kleur houden
  return true;
}

/** Lichte achtergrond → donkere tegenhanger met dezelfde kleurtoon; puur wit (en bijna-wit) → precies het systeemoppervlak. */
export function donkereAchtergrond(k: Rgba, oppervlak: Rgba): Rgba {
  const { h, s, l } = naarHsl(k);
  if (s < 0.12 && l >= 0.95) return { ...oppervlak, a: k.a };
  const opp = naarHsl(oppervlak);
  // l 1 → oppervlak; l 0.5 → iets lichter dan het oppervlak (onderscheid tussen vlakken blijft zichtbaar)
  const nieuwL = klem(opp.l + (1 - l) * 0.32, 0, 0.32);
  return { ...uitHsl(h, Math.min(s, 0.45) * (s < 0.12 ? 0 : 1), nieuwL), a: k.a };
}

/**
 * Kleinste lichtheidsverschuiving (zelfde tint) waarmee `voor` op `achter` minstens `doel`:1 haalt; anders wit of zwart.
 */
export function pasTekstAan(voor: Rgba, achter: Rgba, doel = 4.5, neutraal?: Rgba): Rgba {
  const v = voor.a < 1 ? meng(voor, achter) : voor;
  if (contrast(v, achter) >= doel) return voor;
  const { h, s, l } = naarHsl(v), lichter = luminantie(achter) < 0.18;
  // gewone donkere (grijze/zwarte) brieftekst → de tekstkleur van het thema, niet een net-genoeg grijs
  if (lichter && neutraal && s < 0.2 && l < 0.45 && contrast(neutraal, achter) >= doel) return neutraal;
  const grens = lichter ? 1 : 0;
  if (contrast(uitHsl(h, s, grens), achter) < doel) return lichter ? { r: 255, g: 255, b: 255, a: 1 } : { r: 0, g: 0, b: 0, a: 1 };
  let lo = l, hi = grens;
  // kleine marge (+0,15): na afronding naar #rrggbb blijft de verhouding boven het doel
  const marge = doel + 0.15;
  for (let i = 0; i < 18; i += 1) { const mid = (lo + hi) / 2; if (contrast(uitHsl(h, s, mid), achter) >= marge) hi = mid; else lo = mid; }
  const uit = leesKleur(naarTekst(uitHsl(h, s, hi)))!;
  return contrast(uit, achter) >= doel ? uit : lichter ? { r: 255, g: 255, b: 255, a: 1 } : { r: 0, g: 0, b: 0, a: 1 };
}

const KLEUR_IN_TEKST = /#[0-9a-f]{3,8}\b|(?:rgba?|hsla?)\([^)]*\)|\b(?:white|whitesmoke|snow|ivory|ghostwhite|floralwhite|linen|azure|aliceblue|honeydew|mintcream|beige|lavender|gainsboro|lightgr[ae]y|oldlace|seashell)\b/gi;
/** Vervangt lichte kleurstops in een verloop (`linear-gradient(#fff, #f0f4ff)`) door hun donkere tegenhanger. */
export function donkerVerloop(waarde: string, oppervlak: Rgba): string {
  return waarde.replace(KLEUR_IN_TEKST, (t) => { const k = leesKleur(t); return k && isLichteAchtergrond(k) ? naarTekst(donkereAchtergrond(k, oppervlak)) : t; });
}

/** Verklaart de brief zelf een donker ontwerp? (Dan laten we hem met rust.) Werkt op de ruwe HTML, vóór het opschonen. */
export function heeftEigenDonkerOntwerp(html: string): boolean {
  return /prefers-color-scheme\s*:\s*dark/i.test(html)
    || /color-scheme\s*:\s*(?:light\s+)?dark|color-scheme\s*:\s*only\s+dark/i.test(html)
    || /<meta[^>]+name\s*=\s*["']?(?:supported-)?color-scheme["']?[^>]*content\s*=\s*["'][^"']*dark/i.test(html);
}

type Regel = { selector: string; eigenschappen: [string, string, string][] };
/** Regels uit `@media (prefers-color-scheme: dark)` (vóór flattenStyles: dat haalt alleen gewone regels binnen). Browser-only. */
export function verzamelDonkereRegels(doc: Document): Regel[] {
  const uit: Regel[] = [];
  for (const st of Array.from(doc.querySelectorAll('style'))) {
    try {
      const blad = new CSSStyleSheet(); blad.replaceSync(st.textContent || '');
      for (const r of Array.from(blad.cssRules)) {
        if (!(r instanceof CSSMediaRule) || !/prefers-color-scheme\s*:\s*dark/i.test(r.conditionText || r.media.mediaText)) continue;
        for (const b of Array.from(r.cssRules)) if (b instanceof CSSStyleRule) uit.push({ selector: b.selectorText, eigenschappen: Array.from(b.style).map((p) => [p, b.style.getPropertyValue(p), b.style.getPropertyPriority(p)]) });
      }
    } catch { /* kapotte css: overslaan */ }
  }
  return uit;
}
/** Past de verzamelde donkere regels toe als inline stijl (zij winnen, zoals de media-query in een mailprogramma). */
export function pasDonkereRegelsToe(doc: Document, regels: Regel[]) {
  for (const r of regels) {
    let knopen: NodeListOf<HTMLElement>;
    try { knopen = doc.querySelectorAll<HTMLElement>(r.selector); } catch { continue; }
    knopen.forEach((el) => { for (const [p, w, prio] of r.eigenschappen) el.style.setProperty(p, w, prio); });
  }
}

const RAND = ['border-top-color', 'border-right-color', 'border-bottom-color', 'border-left-color'] as const;
const STANDAARD = { oppervlak: '#1e2026', tekst: '#e7e9ee', koppeling: '#8ab4f8', logoPlaat: '#f3f4f6' };
const isGroot = (el: HTMLElement) => {
  const fs = el.style.fontSize, px = /px$/.test(fs) ? parseFloat(fs) : /pt$/.test(fs) ? parseFloat(fs) * 4 / 3 : 0;
  const vet = /^(bold|[6-9]00)$/.test(el.style.fontWeight) || /^(B|STRONG)$/.test(el.tagName) || /^H[1-3]$/.test(el.tagName);
  return px >= 24 || (vet && px >= 18.66) || (/^H[12]$/.test(el.tagName) && !px);
};
/** Afbeeldingen die transparant kunnen zijn (png/gif/svg/webp of onbekend): kandidaat voor het lichte logoplaatje. */
export function magTransparantZijn(img: HTMLImageElement): boolean {
  const bron = (img.getAttribute('src') || img.dataset.mailResourceSrc || '').toLowerCase();
  if (/^data:image\/(jpeg|jpg)/.test(bron) || /\.(jpe?g)(\?|#|$)/.test(bron)) return false;
  return true;
}

/**
 * Zet een opgeschoond maildocument om naar de donkere weergave. Muteert `doc` (alleen kleuren). Browser-DOM vereist.
 * `eigenDonker` = de brief verklaart zelf een donker ontwerp → alleen het oppervlak zetten, niets omkleuren.
 */
export function maakMailDonker(doc: Document, opties: DonkerOpties = {}, eigenDonker = false): DonkerVerslag {
  const t0 = typeof performance !== 'undefined' ? performance.now() : Date.now();
  const o = { ...STANDAARD, ...Object.fromEntries(Object.entries(opties).filter(([, v]) => v)) } as typeof STANDAARD;
  const opp = leesKleur(o.oppervlak) || leesKleur(STANDAARD.oppervlak)!, tekst = leesKleur(o.tekst)!, koppeling = leesKleur(o.koppeling)!;
  const verslag: DonkerVerslag = { modus: eigenDonker ? 'eigen-donker' : 'aangepast', achtergronden: 0, teksten: 0, randen: 0, logos: 0, ms: 0 };
  const body = doc.body;
  if (!body) return verslag;
  doc.documentElement.style.colorScheme = 'dark';
  if (eigenDonker) {
    if (!leesKleur(body.style.backgroundColor) && !body.getAttribute('bgcolor')) body.style.backgroundColor = naarTekst(opp);
    if (!leesKleur(body.style.color)) body.style.color = naarTekst(tekst);
    verslag.ms = (typeof performance !== 'undefined' ? performance.now() : Date.now()) - t0;
    return verslag;
  }
  doc.documentElement.style.backgroundColor = naarTekst(opp);
  // stapel: [element, achtergrond (nieuw, dekkend), originele voorgrond, nieuwe voorgrond, heeft achtergrondafbeelding]
  type Kader = { bg: Rgba; fgOud: Rgba; fgNieuw: Rgba; beeld: boolean };
  const zwart: Rgba = { r: 0, g: 0, b: 0, a: 1 };
  const bezoek = (el: HTMLElement, ouder: Kader): Kader => {
    const st = el.style;
    let bg = ouder.bg, eigenBg = false;
    // 1. achtergrond: inline (incl. shorthand → longhand), dan bgcolor
    const attr = el.getAttribute('bgcolor'), stijlBg = leesKleur(st.backgroundColor), bgOud = stijlBg || leesKleur(attr);
    if (bgOud && bgOud.a > 0) {
      let nieuw = bgOud;
      if (isLichteAchtergrond(bgOud)) { nieuw = donkereAchtergrond(bgOud, opp); verslag.achtergronden += 1; }
      else if (bgOud.a < 1 && luminantie(bgOud) > 0.5) { nieuw = { ...donkereAchtergrond({ ...bgOud, a: 1 }, opp), a: bgOud.a }; verslag.achtergronden += 1; }
      if (nieuw !== bgOud) {
        if (stijlBg) st.setProperty('background-color', naarTekst(nieuw), st.getPropertyPriority('background-color'));
        if (attr !== null) el.setAttribute('bgcolor', naarTekst({ ...nieuw, a: 1 }));
        if (!stijlBg) st.backgroundColor = naarTekst(nieuw);
      }
      bg = meng(nieuw, ouder.bg); eigenBg = true;
    }
    const beeldWaarde = st.backgroundImage;
    if (beeldWaarde && /gradient\(/i.test(beeldWaarde)) {
      const nieuw = donkerVerloop(beeldWaarde, opp);
      if (nieuw !== beeldWaarde) { st.setProperty('background-image', nieuw, st.getPropertyPriority('background-image')); verslag.achtergronden += 1; }
      // effectieve achtergrond = gemiddelde van de stops (voor het tekstcontrast)
      const stops = (nieuw.match(KLEUR_IN_TEKST) || []).map(leesKleur).filter((k): k is Rgba => !!k);
      if (stops.length) { const g = stops.reduce((a, k) => ({ r: a.r + k.r / stops.length, g: a.g + k.g / stops.length, b: a.b + k.b / stops.length, a: 1 }), { r: 0, g: 0, b: 0, a: 1 }); bg = meng(g, ouder.bg); eigenBg = true; }
    }
    const beeld = ouder.beeld || !!el.dataset.mailBackgroundSrc;
    // 2. voorgrond
    const doel = isGroot(el) ? 3 : 4.5;
    const fontAttr = el.tagName === 'FONT' ? el.getAttribute('color') : null;
    const eigenFg = leesKleur(st.color) || leesKleur(fontAttr);
    let fgOud = ouder.fgOud, fgNieuw = ouder.fgNieuw;
    if (el.tagName === 'A' && el.hasAttribute('href') && !eigenFg) {
      const k = contrast(koppeling, bg) >= doel ? koppeling : pasTekstAan({ r: 0, g: 0, b: 238, a: 1 }, bg, doel);
      st.color = naarTekst(k); fgOud = { r: 0, g: 0, b: 238, a: 1 }; fgNieuw = k; verslag.teksten += 1;
    } else if (eigenFg) {
      fgOud = eigenFg; fgNieuw = pasTekstAan(eigenFg, bg, doel, tekst);
      if (fgNieuw !== eigenFg) {
        if (st.color) st.setProperty('color', naarTekst(fgNieuw), st.getPropertyPriority('color')); else st.color = naarTekst(fgNieuw);
        if (fontAttr !== null) el.setAttribute('color', naarTekst({ ...fgNieuw, a: 1 }));
        verslag.teksten += 1;
      }
    } else if (eigenBg || doel !== 4.5) {
      const vgl = fgNieuw.a < 1 ? meng(fgNieuw, bg) : fgNieuw;
      if (contrast(vgl, bg) < doel) { fgNieuw = pasTekstAan(fgOud, bg, doel, tekst); st.color = naarTekst(fgNieuw); verslag.teksten += 1; }
    }
    // 3. scrim: tekst over een achtergrondafbeelding die we licht moesten maken
    if (beeld && el.dataset.mailBackgroundSrc && luminantie(fgNieuw) > 0.5 && luminantie(fgOud) < 0.3) {
      st.textShadow = '0 0 2px rgba(0,0,0,.9), 0 0 6px rgba(0,0,0,.7)';
    }
    // 4. randen (citaatbalken, tabellijnen) ≥ 3:1 als ze donker op donker zijn
    for (const p of RAND) {
      const w = st.getPropertyValue(p), k = leesKleur(w);
      if (!k || k.a === 0) continue;
      const stijl = st.getPropertyValue(p.replace('-color', '-style'));
      if (stijl === 'none' || stijl === 'hidden') continue;
      const mk = meng(k, bg);
      let nieuw: Rgba | null = null;
      if (isLichteAchtergrond(k) && luminantie(k) > 0.6 && contrast(mk, bg) < 1.4) nieuw = donkereAchtergrond(k, opp); // witte scheidingslijn → donker
      else if (contrast(mk, bg) < 3 && luminantie(k) < luminantie(bg) + 0.05) nieuw = pasTekstAan(k, bg, 3);
      if (nieuw) { st.setProperty(p, naarTekst(nieuw), st.getPropertyPriority(p)); verslag.randen += 1; }
    }
    // 5. afbeeldingen: alleen een licht plaatje achter (mogelijk) transparante logo's — geen maat, geen filter
    if (el.tagName === 'IMG' && magTransparantZijn(el as HTMLImageElement) && luminantie(bg) < 0.2) {
      st.backgroundColor = o.logoPlaat; if (!st.borderRadius) st.borderRadius = '4px';
      el.dataset.mailDonkerLogo = 'plaat'; verslag.logos += 1;
    }
    return { bg, fgOud, fgNieuw, beeld };
  };
  // body zelf
  const wortel: Kader = { bg: opp, fgOud: zwart, fgNieuw: tekst, beeld: false };
  const bodyKader = bezoek(body, wortel);
  if (!leesKleur(body.style.backgroundColor)) body.style.backgroundColor = naarTekst(opp);
  if (!leesKleur(body.style.color)) { body.style.color = naarTekst(pasTekstAan(bodyKader.fgOud, bodyKader.bg, 4.5, tekst)); bodyKader.fgNieuw = leesKleur(body.style.color)!; }
  // iteratieve diepte-eerst doorloop (geen recursie: diep geneste nieuwsbrieftabellen)
  const stapel: [Element, Kader][] = [];
  for (let c = body.lastElementChild; c; c = c.previousElementSibling) stapel.push([c, bodyKader]);
  while (stapel.length) {
    const [el, ouder] = stapel.pop()!;
    if (!(el instanceof (doc.defaultView?.HTMLElement || HTMLElement)) && !(el as HTMLElement).style) continue;
    const k = bezoek(el as HTMLElement, ouder);
    for (let c = el.lastElementChild; c; c = c.previousElementSibling) stapel.push([c, k]);
  }
  verslag.ms = (typeof performance !== 'undefined' ? performance.now() : Date.now()) - t0;
  return verslag;
}
