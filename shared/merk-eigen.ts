// EIGEN LOGO'S VAN DE BEHEERDER (BYOS, 21.10.2026) — de zuivere regels (geen fs, geen netwerk; de tests lezen dit bestand).
//
// Waarom: de regel van de eigenaar is «не малювати й не вигадувати чужі логотипи кодом». Voor merken zonder vorm met echte
// herkomst toont de site een neutrale plaat (src/merk/merk-tabel.ts). Wie op ZIJN server het officiële logo wil, legt het bestand
// dat hij zelf van de merkpagina van de dienst haalde in de map `MERK_EIGEN_MAP` (standaard /srv/mijn-ruimte/merk-eigen) of laadt
// het op via admin → Інтеграції (passkey). Dit bestand beslist wat er mag:
//   • naam  = <sleutel>.svg of <sleutel>.png, sleutel zoals het merkregister hem kent (kleine letters, cijfers, . + -);
//   • PNG   = echte PNG-handtekening, ≤ 200 KB;
//   • SVG   = ≤ 200 KB, en ONTSMET: proloog, commentaar, <metadata> en editor-naamruimten (inkscape/sodipodi/…) gaan eruit; alles
//             wat code of iets van buiten kan laden wordt GEWEIGERD met een reden (script, foreignObject, iframe, image, a,
//             animatie, on…-attributen, javascript:, href/url() naar iets anders dan #…, @import, DOCTYPE/ENTITY). Liever een
//             duidelijke weigering dan een «schoongemaakt» bestand dat er anders uitziet dan de beheerder dacht.
// De browser krijgt het bestand als data-URI in een <img>: daar voert een SVG sowieso nooit script uit — de ontsmetting is de
// tweede muur, niet de enige.

export const MERK_EIGEN_MAX_BYTES = 200 * 1024;
export const MERK_EIGEN_MAX_AANTAL = 64;
export const MERK_EIGEN_STANDAARD_MAP = '/srv/mijn-ruimte/merk-eigen';
export const MERK_EIGEN_SLEUTEL = /^[a-z0-9][a-z0-9.+-]{0,40}$/;

export type MerkEigenSoort = 'svg' | 'png';
export type MerkEigenUitslag = { ok: true; soort: MerkEigenSoort; inhoud: Buffer } | { ok: false; reden: string };

/** <sleutel>.svg|png → { sleutel, soort } of null. */
export function merkEigenBestandsnaam(naam: string): { sleutel: string; soort: MerkEigenSoort } | null {
  const m = /^([a-z0-9][a-z0-9.+-]{0,40})\.(svg|png)$/.exec(String(naam || ''));
  return m ? { sleutel: m[1], soort: m[2] as MerkEigenSoort } : null;
}

// 22.10.2026: GEEN `Buffer` op moduleniveau — dit bestand wordt ook door de browser geladen (src/integraties/MerkEigenBeheer.tsx,
// in de technische bundel van admin.*). `Buffer.from(…)` hier gooide bij het laden «Buffer is not defined», en daarmee bleef ÉLKE
// beheerpagina (admin.*/updates, /overzicht, …) wit. Een gewone bytereeks, vergeleken per byte, werkt op server én in de browser.
const PNG_HANDTEKENING: readonly number[] = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const beginMet = (b: Uint8Array, kop: readonly number[]) => b.length >= kop.length && kop.every((x, i) => b[i] === x);

const TOEGESTAAN = new Set([
  'svg', 'g', 'path', 'rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon', 'defs', 'lineargradient', 'radialgradient',
  'stop', 'clippath', 'mask', 'title', 'desc', 'use', 'symbol', 'text', 'tspan', 'style', 'pattern', 'filter', 'fegaussianblur',
  'feoffset', 'feblend', 'fecolormatrix', 'feflood', 'fecomposite', 'femerge', 'femergenode',
]);
const VERBODEN_ELEMENT = /^(script|foreignobject|iframe|object|embed|image|a|animate|animatemotion|animatetransform|set|handler|listener|audio|video|canvas|html|body|link|meta)$/;
const EDITOR_NS = /^(inkscape|sodipodi|sketch|serif|dc|cc|rdf|i|x|graph|figma)$/;

// BEVEILIGINGSREVIEW 21.10.2026: de controles hieronder keken naar de RUWE tekst, terwijl de browser eerst de XML-entiteiten
// (&#117; = «u») en daarna de CSS-ontsnappingen (\75 = «u») oplost. `fill="&#117;rl(https://…)"`, `<style>&#64;import "…"</style>`,
// `u\72l(…)` en `image-set("…")` kwamen zo «schoon» door. Nu wordt elke waarde eerst gelezen ZOALS DE BROWSER HAAR LEEST en pas dan
// gecontroleerd. (In <img> laadt een SVG toch niets van buiten — dit is de tweede muur, en die moet ook echt dicht zijn.)
const XML_VAST: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
/** XML-entiteiten oplossen zoals de XML-parser dat doet (één keer: `&amp;#117;` blijft letterlijk «&#117;»). */
export function xmlEntiteitenOplossen(v: string): string {
  return v.replace(/&(#x[0-9a-f]+|#[0-9]+|[a-z]+);/gi, (heel, e: string) => {
    const l = e.toLowerCase();
    if (l[0] !== '#') return XML_VAST[l] ?? heel;
    const n = l[1] === 'x' ? parseInt(l.slice(2), 16) : parseInt(l.slice(1), 10);
    return Number.isFinite(n) && n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : '�';
  });
}
/** CSS-ontsnappingen oplossen (CSS Syntax §4.3.7): `\75 ` / `\000075` → «u», `\x` → «x», `\`+regeleinde → weg. */
export function cssOntsnappingenOplossen(v: string): string {
  return v.replace(/\\(?:([0-9a-fA-F]{1,6})(?:\r\n|[ \t\r\n\f])?|(\r\n|[\r\n\f])|([\s\S]))/g, (_h, hex: string | undefined, nl: string | undefined, teken: string | undefined) => {
    if (hex) { const n = parseInt(hex, 16); return n > 0 && n <= 0x10ffff && !(n >= 0xd800 && n <= 0xdfff) ? String.fromCodePoint(n) : '�'; }
    if (nl) return '';
    return teken ?? '';
  });
}
/** Laadt deze CSS (stijlblok, style- of presentatie-attribuut) iets van buiten of voert ze iets uit? Gelezen zoals de browser haar leest. */
export function cssLaadtIets(ruw: string): boolean {
  // Een commentaar zonder einde blijft staan (en wordt dus gewoon meegecontroleerd): liever te streng dan iets overslaan.
  const css = knipBlokken(cssOntsnappingenOplossen(xmlEntiteitenOplossen(ruw)), /\/\*/g, /\*\//g, ' ', true) ?? '';
  // Een CSS-functie is «naam(» zonder spatie ertussen; image-set/image/cross-fade/element/src/paint kunnen zonder url() laden.
  // SEC-002 (12.11.2026): `url\s*\(\s*(?!['"]?\s*#)` liep bij «url(» + veel spaties + «#» kwadratisch terug; de vooruitblik
  // hieronder leest de witruimte één keer (zelfde uitkomst: alleen een verwijzing die met # begint is binnen het bestand).
  return /@import|expression\s*\(|behavior\s*:|-moz-binding|(?:^|[^a-z0-9_-])(?:-webkit-)?image-set\(|(?:^|[^a-z0-9_-])(?:image|cross-fade|element|src|paint)\(/i.test(css)
    || /url\s*\((?!\s*(?:['"]\s*)?#)/i.test(css);
}

// SEC-002 / integraties-01 (12.11.2026): een logo van het domein van een AFZENDER is een bestand van een vreemde. De oude
// uitdrukkingen (`<!--[\s\S]*?-->`, `<metadata…>`, en een tag-uitdrukking waarin een attribuutnaam «<» mocht bevatten) begonnen
// bij elke «<!--» / «<g » opnieuw tot het einde van het bestand te lezen: 200 KB «<g <g <g …» hield de hele server bijna een
// minuut vast (één draad: geen enkel verzoek van geen enkele gebruiker werd nog bediend). Alles hieronder leest het bestand in
// één doorloop.
/**
 * Knipt elk blok «begin … einde» uit de tekst in ÉÉN doorloop (lineair; `begin` en `einde` moeten de vlag g hebben). Een begin
 * zonder einde: null (de aanroeper weigert het bestand) of, met `restLaten`, de rest blijft ongewijzigd staan.
 */
function knipBlokken(s: string, begin: RegExp, einde: RegExp, vervang = '', restLaten = false): string | null {
  let uit = '';
  let pos = 0;
  for (;;) {
    begin.lastIndex = pos;
    const b = begin.exec(s);
    if (!b) return pos ? uit + s.slice(pos) : s;
    einde.lastIndex = b.index + b[0].length;
    const e = einde.exec(s);
    if (!e) return restLaten ? uit + s.slice(pos) : null;
    uit += s.slice(pos, b.index) + vervang;
    pos = e.index + e[0].length;
  }
}

/** Ontsmet een SVG of weiger hem met een reden. Puur tekstueel en streng: alleen bekende elementen en veilige attributen. */
export function ontsmetSvg(ruw: Buffer | string): MerkEigenUitslag {
  const buf = Buffer.isBuffer(ruw) ? ruw : Buffer.from(String(ruw), 'utf8');
  if (buf.length > MERK_EIGEN_MAX_BYTES) return { ok: false, reden: 'TE_GROOT' };
  let s = buf.toString('utf8');
  if (s.includes('\u0000')) return { ok: false, reden: 'BINAIR' };
  s = s.replace(/^﻿/, '');
  if (/<!DOCTYPE|<!ENTITY|<!\[CDATA\[/i.test(s)) return { ok: false, reden: 'DOCTYPE_OF_ENTITY' };
  if (/<\?xml-stylesheet/i.test(s)) return { ok: false, reden: 'EXTERNE_STIJL' };
  // Commentaar, <metadata> en <sodipodi:namedview> eruit, elk in één doorloop; een blok zonder einde is geen leesbare SVG.
  let geknipt: string | null = s.replace(/<\?xml[^?]*\?>/gi, '');
  for (const [begin, einde] of [
    [/<!--/g, /-->/g],
    [/<metadata\b/gi, /<\/metadata\s*>/gi],
    [/<sodipodi:namedview\b/gi, /\/>|<\/sodipodi:namedview\s*>/gi],
  ] as const) {
    geknipt = knipBlokken(geknipt, begin, einde);
    if (geknipt === null) return { ok: false, reden: 'ONLEESBARE_OPMAAK' };
  }
  s = geknipt.trim();
  if (!/^<svg[\s>]/i.test(s) || !/<\/svg\s*>$/i.test(s)) return { ok: false, reden: 'GEEN_SVG' };
  if (/javascript:|vbscript:|data:text\/html/i.test(s) || /javascript:|vbscript:|data:text\/html/i.test(xmlEntiteitenOplossen(s))) return { ok: false, reden: 'SCRIPT_URL' };

  let uit = '';
  let pos = 0;
  let inStijl = false;
  // Geen «<» in een attribuutnaam of -waarde (in XML is een ruwe «<» in een waarde toch al ongeldig): zo leest één poging nooit
  // verder dan tot de volgende «<», en is het hele bestand één doorloop in plaats van één doorloop PER «<».
  const tag = /<(\/?)([A-Za-z][\w:.-]*)((?:\s+[^\s=/<>]+(?:\s*=\s*(?:"[^"<]*"|'[^'<]*'))?)*)\s*(\/?)>/g;
  let m: RegExpExecArray | null;
  while ((m = tag.exec(s))) {
    const tussen = s.slice(pos, m.index);
    if (tussen.includes('<')) return { ok: false, reden: 'ONLEESBARE_OPMAAK' };
    if (inStijl && cssLaadtIets(tussen)) return { ok: false, reden: 'STIJL_LAADT_IETS' };
    uit += tussen;
    pos = tag.lastIndex;
    const [, sluit, ruweNaam, attrs, zelf] = m;
    const delen = ruweNaam.toLowerCase().split(':');
    const ns = delen.length > 1 ? delen[0] : '';
    const naam = delen[delen.length - 1];
    if (ns && EDITOR_NS.test(ns)) continue; // editor-element zonder betekenis voor de weergave
    if (VERBODEN_ELEMENT.test(naam)) return { ok: false, reden: `ELEMENT_${naam.toUpperCase()}` };
    if (!TOEGESTAAN.has(naam)) return { ok: false, reden: `ELEMENT_ONBEKEND_${naam.toUpperCase().slice(0, 30)}` };
    if (naam === 'style') inStijl = !sluit && !zelf;
    if (sluit) { uit += `</${ruweNaam}>`; continue; }
    let schoon = '';
    const attr = /([^\s=/<>]+)(?:\s*=\s*(?:"([^"<]*)"|'([^'<]*)'))?/g;
    let a: RegExpExecArray | null;
    while ((a = attr.exec(attrs))) {
      const an = a[1].toLowerCase();
      const waarde = a[2] ?? a[3] ?? '';
      const ans = an.includes(':') ? an.split(':')[0] : '';
      if (ans && EDITOR_NS.test(ans)) continue;
      if (an.startsWith('xmlns:') && EDITOR_NS.test(an.slice(6))) continue;
      if (/^on/.test(an.replace(/^.*:/, ''))) return { ok: false, reden: 'ON_ATTRIBUUT' };
      if (/(^|:)href$/.test(an) && !/^#[\w.-]+$/.test(waarde.trim())) return { ok: false, reden: 'EXTERNE_VERWIJZING' };
      // Elk attribuut (ook fill/filter/mask/clip-path, die als CSS gelezen worden) NA het oplossen van entiteiten en ontsnappingen.
      if (cssLaadtIets(waarde)) return { ok: false, reden: an === 'style' ? 'STIJL_LAADT_IETS' : 'EXTERNE_URL' };
      schoon += ` ${a[1]}="${waarde.replace(/"/g, '&quot;')}"`;
    }
    uit += `<${ruweNaam}${schoon}${zelf ? '/' : ''}>`;
  }
  const rest = s.slice(pos);
  if (rest.trim()) return { ok: false, reden: 'ONLEESBARE_OPMAAK' };
  if (!/viewBox=|width=/i.test(uit.slice(0, 2000))) return { ok: false, reden: 'GEEN_AFMETING' };
  return { ok: true, soort: 'svg', inhoud: Buffer.from(uit, 'utf8') };
}

/** Controleer een bestand van een gegeven soort. */
export function controleerMerkEigen(soort: MerkEigenSoort, inhoud: Buffer): MerkEigenUitslag {
  if (soort === 'png') {
    if (inhoud.length > MERK_EIGEN_MAX_BYTES) return { ok: false, reden: 'TE_GROOT' };
    if (inhoud.length < 33 || !beginMet(inhoud, PNG_HANDTEKENING) || inhoud.subarray(12, 16).toString('latin1') !== 'IHDR') return { ok: false, reden: 'GEEN_PNG' };
    return { ok: true, soort: 'png', inhoud };
  }
  return ontsmetSvg(inhoud);
}

export const merkEigenDataUri = (soort: MerkEigenSoort, inhoud: Buffer) =>
  `data:${soort === 'svg' ? 'image/svg+xml' : 'image/png'};base64,${inhoud.toString('base64')}`;

/** Mensentekst bij een weigering (admin → Інтеграції). */
export function merkEigenRedenTekst(reden: string, taal: 'uk' | 'nl'): string {
  const uk = taal !== 'nl';
  if (reden === 'TE_GROOT') return uk ? 'Файл більший за 200 КБ.' : 'Het bestand is groter dan 200 KB.';
  if (reden === 'TE_VEEL') return uk ? `Власних логотипів уже ${MERK_EIGEN_MAX_AANTAL} — видаліть непотрібний, щоб додати новий.` : `Er zijn al ${MERK_EIGEN_MAX_AANTAL} eigen logo's — wis er een om een nieuw toe te voegen.`;
  if (reden === 'GEEN_PNG') return uk ? 'Це не PNG-файл.' : 'Dit is geen PNG-bestand.';
  if (reden === 'GEEN_SVG') return uk ? 'Це не SVG-файл.' : 'Dit is geen SVG-bestand.';
  if (reden.startsWith('ELEMENT_')) return uk ? `SVG містить заборонений або невідомий елемент (${reden.slice(8).toLowerCase()}).` : `De SVG bevat een verboden of onbekend element (${reden.slice(8).toLowerCase()}).`;
  if (reden === 'EXTERNE_VERWIJZING' || reden === 'EXTERNE_URL' || reden === 'EXTERNE_STIJL' || reden === 'STIJL_LAADT_IETS') return uk ? 'SVG посилається на щось зовні — такий файл не приймається.' : 'De SVG verwijst naar iets buiten het bestand — zo\'n bestand wordt niet aanvaard.';
  if (reden === 'ON_ATTRIBUUT' || reden === 'SCRIPT_URL') return uk ? 'SVG містить код (обробники подій або javascript:).' : 'De SVG bevat code (event-handlers of javascript:).';
  return uk ? `Файл не прийнято (${reden}).` : `Het bestand is niet aanvaard (${reden}).`;
}
