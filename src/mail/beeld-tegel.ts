// MAILBEELD-002 (16.11.2026). Павло: «що це за зображення, чому все так жахливо виглядає?» — у режимі «Питати» приховані зовнішні
// зображення стояли в листі як «зламана картинка» браузера з голим alt-текстом. Тут — охайна плитка на місці зображення.
//
// Een verborgen extern beeld (data-mail-resource-state='verborgen', src/MailBerichtTekst.tsx) krijgt een rustige tegel op zijn plaats:
// zachte afgeronde vorm, pictogram «beeld verborgen» en de alt-tekst klein. De tegel houdt de plaats van het beeld vrij
// (width/height-attributen of de breedte uit de stijl; anders een bescheiden maat), zodat de brief niet verspringt bij «Показати».
// Dezelfde tegel dient ook zolang een beeld geladen wordt («завантажується», pictogram «beeld») en voor een beeld dat niet te laden
// is («не завантажилось», pictogram «let op»: http-adres, relatief pad, cid zonder bijlage, fout van de server) — nooit meer het
// «kapotte beeld» van de browser. Plaatsen gaat voor de hele brief in één keer (zetBeeldTegels: lezen → schrijven → één keer meten).
//
// Waarom zo en niet anders:
//  - GEEN verzoek, nergens heen: de tegel is gewone DOM met inline stijl en een inline SVG; het <img> zelf krijgt géén src. (Een
//    src — ook een data:-plaatje — zou bovendien de «load» van de logotoets in de donkere weergave verbruiken, src/mail-donker/logo-toets.ts.)
//  - GEEN <style> in de brief: de site staat alleen stijl-attributen toe (CSP «style-src-elem 'self'»); een stijlblad in het
//    srcdoc-document zou daar stil wegvallen. Daarom een zusterelement met inline stijl, en niet een gestileerd <img> (de browser
//    tekent in een <img> zonder bron zijn eigen «kapot beeld», dat is niet weg te stijlen).
//  - Kleur uit de brief zelf: de inkt is de tekstkleur op die plek (licht papier → donkere inkt, «Темний вигляд» → lichte inkt),
//    het vlak is dezelfde inkt op 7 %. Zo past de tegel op elke achtergrond zonder vaste kleur.
//  - data-mail-translation-skip: de alt-tekst in de tegel wordt niet meevertaald en niet aangewezen als alinea.

import { leesMaatTekst } from './beeld-maten';

export type TegelMaat = {
  /** CSS-breedte die de tegel krijgt als de stijl van het beeld er geen heeft ('' = niets zetten) */
  breedte: string;
  /** vaste CSS-hoogte ('' = volgt de verhouding) */
  hoogte: string;
  /** aspect-ratio ('' = geen) */
  verhouding: string;
  minHoogte: string;
  maxHoogte: string;
  /** schatting in px voor als meten niet kan (beeld in een dichtgeklapt blok) */
  schatB: number;
  schatH: number;
  /**
   * MAILBEELD-003: de plaats als vaste breedte × hoogte in px (null = de tegel krijgt breedte/verhouding als CSS). Dan houdt een
   * onzichtbaar <svg> van die maat de plaats vast, en gedraagt de tegel zich in de opmaak precies als het beeld: een vervangen element
   * met «max-width:100%; height:auto» telt in een tabelkolom voor 0 mee als kleinste breedte en voor zijn eigen breedte als grootste.
   * Een gewone tegel van 600 px duwde een tabel op de telefoon breder dan het scherm (en dan werd de hele brief verkleind).
   */
  ruimte: { b: number; h: number; /** de breedte komt uit het width-attribuut van de brief (border-box: rand en binnenmarge zitten erin) */ uitBrief: boolean } | null;
};

const getal = (ruw: string | null | undefined) => { const m = /^\s*(\d+(?:\.\d+)?)\s*(?:px)?\s*$/i.exec(String(ruw ?? '')); return m ? Number(m[1]) : NaN; };
const procent = (ruw: string | null | undefined) => { const m = /^\s*(\d+(?:\.\d+)?)\s*%\s*$/.exec(String(ruw ?? '')); return m ? Number(m[1]) : NaN; };

/**
 * De maat van de tegel uit wat de brief zelf opgeeft. Puur (testbaar).
 *  - width én height als getal → dezelfde verhouding als het beeld (de plaats klopt exact);
 *  - alleen een breedte (attribuut of stijl) → 16:9, hooguit 168 px hoog. Bewust géén minimumhoogte: met een verhouding wordt die
 *    een minimumbréédte (56 px × verhouding), en die duwde de kolommen van een nieuwsbrief op de telefoon buiten het scherm;
 *  - alleen een hoogte → die hoogte, 2,5× zo breed (24–320 px);
 *  - niets bekend → met alt-tekst een tegel van 220 px (16:9; als blok 600 × 240 px die met de kolom meekrimpt), zonder alt een klein
 *    blokje van 40 × 40 px.
 * Met `echt` (de bewaarde maat van een al eens getoond beeld) gaat die boven alle schattingen: de verhouding van het beeld zelf.
 */
type MaatVraag = { breedteAttr?: string | null; hoogteAttr?: string | null; stijlBreedte?: string; alt?: string; echt?: { b: number; h: number } | null; blok?: boolean };
export function tegelMaat(k: MaatVraag): TegelMaat {
  const m = maatKern(k);
  const stijl = String(k.stijlBreedte ?? '').trim();
  const b = /px$/.test(m.breedte) && (stijl === '' || stijl === 'auto') ? Number.parseFloat(m.breedte) : NaN;
  if (!Number.isFinite(b) || b < 1) return { ...m, ruimte: null };
  const verh = /^(\d+(?:\.\d+)?) \/ (\d+(?:\.\d+)?)$/.exec(m.verhouding);
  let h = /px$/.test(m.hoogte) ? Number.parseFloat(m.hoogte) : verh ? b * Number(verh[2]) / Number(verh[1]) : NaN;
  if (/px$/.test(m.maxHoogte)) h = Math.min(h, Number.parseFloat(m.maxHoogte));
  if (!Number.isFinite(h) || h <= 0) return { ...m, ruimte: null };
  const uitBrief = Number.isFinite(getal(k.breedteAttr));
  return { ...m, ruimte: { b: Math.max(1, Math.round(b)), h: Math.max(1, Math.round(h)), uitBrief } };
}
function maatKern(k: MaatVraag): Omit<TegelMaat, 'ruimte'> {
  const wPx = getal(k.breedteAttr), wPct = procent(k.breedteAttr), hPx = getal(k.hoogteAttr);
  const stijl = String(k.stijlBreedte ?? '').trim(), stijlVast = stijl !== '' && stijl !== 'auto';
  const stijlPx = getal(stijl);
  const breedte = stijlVast ? '' : Number.isFinite(wPx) ? `${wPx}px` : Number.isFinite(wPct) ? `${wPct}%` : '';
  const breedBekend = stijlVast || breedte !== '';
  const schatBreed = Number.isFinite(stijlPx) ? stijlPx : stijlVast ? 320 : Number.isFinite(wPx) ? wPx : 320;
  // MAILBEELD-003: de echte maat van een beeld dat op dit apparaat al eens getoond werd (src/mail/beeld-maten.ts). Het leesvenster
  // tekent elk beeld met «height:auto; max-width:100%» (prepareHtml): de breedte komt uit de stijl of het attribuut, anders de eigen
  // breedte van het beeld, en de hoogte ALTIJD uit de eigen verhouding — ook als de brief een ander height-attribuut opgeeft. Met de
  // echte maat doet de tegel precies hetzelfde, dus «Показати» verschuift niets meer.
  const echt = k.echt && k.echt.b >= 1 && k.echt.h >= 1 ? k.echt : null;
  if (echt) {
    const eigen = breedBekend ? breedte : `${echt.b}px`;
    const schatB = breedBekend ? schatBreed : echt.b;
    return { breedte: eigen, hoogte: '', verhouding: `${echt.b} / ${echt.h}`, minHoogte: '', maxHoogte: '', schatB, schatH: Math.round(schatB * echt.h / echt.b) };
  }
  if (Number.isFinite(wPx) && Number.isFinite(hPx) && wPx > 0 && hPx > 0) {
    return { breedte, hoogte: '', verhouding: `${wPx} / ${hPx}`, minHoogte: '', maxHoogte: '', schatB: schatBreed, schatH: Math.round(schatBreed * hPx / wPx) };
  }
  if (Number.isFinite(hPx) && hPx > 0) {
    const b = Math.max(24, Math.min(320, Math.round(hPx * 2.5)));
    return { breedte: breedBekend ? breedte : `${b}px`, hoogte: `${hPx}px`, verhouding: '', minHoogte: '', maxHoogte: '', schatB: breedBekend ? schatBreed : b, schatH: hPx };
  }
  if (breedBekend) {
    return { breedte, hoogte: '', verhouding: '16 / 9', minHoogte: '', maxHoogte: '168px', schatB: schatBreed, schatH: Math.min(168, Math.round(schatBreed * 9 / 16)) };
  }
  // MAILBEELD-003: een blokbeeld zonder enige maat is in een nieuwsbrief bijna altijd een brede banner of een kolomfoto — 600 × 240
  // (5:2) die met de kolom meekrimpt (vaste ruimte, zie tegelMaat) houdt die plaats beter vast dan een klein tegeltje van 220 px
  if (String(k.alt ?? '').trim() && k.blok) return { breedte: '600px', hoogte: '', verhouding: '5 / 2', minHoogte: '', maxHoogte: '', schatB: 600, schatH: 240 };
  if (String(k.alt ?? '').trim()) return { breedte: '220px', hoogte: '', verhouding: '16 / 9', minHoogte: '', maxHoogte: '168px', schatB: 220, schatH: 124 };
  return { breedte: '40px', hoogte: '40px', verhouding: '', minHoogte: '', maxHoogte: '', schatB: 40, schatH: 40 };
}

export type TegelVorm = 'leeg' | 'pictogram' | 'rij' | 'volledig';
/**
 * Wat past er in de tegel: niets (volgpixel, afstandhouder), alleen het pictogram, pictogram en alt-tekst naast elkaar (laag en breed:
 * een logo — alleen bij een vaste breedte in px, anders zou de tekst een tabelkolom kunnen oprekken), of pictogram boven de alt-tekst
 * (zonder alt-tekst: boven de eigen melding, klein en in een hoge tegel over hooguit twee regels).
 * Puur (testbaar).
 */
export function tegelVorm(breedte: number, hoogte: number, alt: string, vasteBreedte = false): TegelVorm {
  if (breedte < 20 || hoogte < 20) return 'leeg';
  if (!alt.trim() || breedte < 96) return 'pictogram';
  if (hoogte < 52) return vasteBreedte && hoogte >= 24 && breedte >= 110 ? 'rij' : 'pictogram';
  return 'volledig';
}

/** «rgb(34, 34, 59)» / «rgba(…)» → [r, g, b]; onbekend → neutraal grijs dat op licht én donker zichtbaar is. Puur (testbaar). */
export function inktVan(kleur: string): [number, number, number] {
  const m = /rgba?\(\s*(\d+(?:\.\d+)?)[\s,]+(\d+(?:\.\d+)?)[\s,]+(\d+(?:\.\d+)?)/i.exec(String(kleur || ''));
  if (!m) return [127, 127, 127];
  return [Math.round(Number(m[1])), Math.round(Number(m[2])), Math.round(Number(m[3]))];
}

/** Wat de tegel vertelt: een verborgen beeld (standaard), een beeld dat nu geladen wordt, of een beeld dat niet te laden was. */
export type TegelSoort = 'verborgen' | 'laden' | 'mislukt';
export type TegelTekst = {
  /** naam voor de schermlezer (aria-label): «Зображення приховано: <alt>» */
  naam: (alt: string) => string;
  /** knopinfo: wat het betekent dat het beeld niet geladen is */
  uitleg: (alt: string) => string;
  /** de zichtbare regel in de tegel; zonder deze functie de alt-tekst */
  regel?: (alt: string) => string;
  /** een tweede, kleinere regel eronder (alleen als de tegel hoog genoeg is): «Зображення не завантажилось» onder de alt-tekst */
  onder?: (alt: string) => string;
  /** bepaalt het pictogram: «laden» = een gewoon beeld, «mislukt» = let op, anders «beeld verborgen» */
  soort?: TegelSoort;
};

type Bewaard = { tegel: HTMLElement; /** waar pictogram en tekst in staan: de tegel zelf, of (met ruimte) een laag erover */ inhoud: HTMLElement; display: string; prioriteit: string; tekst: TegelTekst; alt: string; maat: TegelMaat; inkt: [number, number, number]; gevuld: boolean };
const tegels = new WeakMap<HTMLElement, Bewaard>();
const SVG = 'http://www.w3.org/2000/svg';
type Vorm = Array<[string, Record<string, string>]>;
// lucide «image-off» (zelfde pictogram als de strook boven de brief)
const PICTOGRAM: Vorm = [
  ['line', { x1: '2', x2: '22', y1: '2', y2: '22' }],
  ['path', { d: 'M10.41 10.41a2 2 0 1 1-2.83-2.83' }],
  ['line', { x1: '13.5', x2: '6', y1: '13.5', y2: '21' }],
  ['line', { x1: '18', x2: '21', y1: '12', y2: '15' }],
  ['path', { d: 'M3.59 3.59A1.99 1.99 0 0 0 3 5v14a2 2 0 0 0 2 2h14c.55 0 1.052-.22 1.41-.59' }],
  ['path', { d: 'M21 15V5a2 2 0 0 0-2-2H9' }],
];
// lucide «image»: het beeld komt eraan (wordt geladen)
const PICTOGRAM_LADEN: Vorm = [
  ['rect', { width: '18', height: '18', x: '3', y: '3', rx: '2', ry: '2' }],
  ['circle', { cx: '9', cy: '9', r: '2' }],
  ['path', { d: 'm21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21' }],
];
// lucide «circle-alert»: dit beeld is niet te laden (anders dan «verborgen»: «Показати» helpt hier niet)
const PICTOGRAM_MISLUKT: Vorm = [
  ['circle', { cx: '12', cy: '12', r: '10' }],
  ['line', { x1: '12', x2: '12', y1: '8', y2: '12' }],
  ['line', { x1: '12', x2: '12.01', y1: '16', y2: '16' }],
];
const ZIJDEN = ['top', 'right', 'bottom', 'left'] as const;

/** De inhoud van één tegel: vorm, naam, knopinfo, pictogram en regel. Alleen schrijven; de maat is vooraf gemeten (b, h; 0 = onmeetbaar). */
function vulTegel(img: HTMLImageElement, bewaard: Bewaard, b: number, h: number): void {
  const { tegel, inhoud, tekst, alt, maat } = bewaard, st = tegel.style, ist = inhoud.style, doc = img.ownerDocument;
  const inkt = (a: number) => `rgba(${bewaard.inkt[0]}, ${bewaard.inkt[1]}, ${bewaard.inkt[2]}, ${a})`;
  const regelTekst = (tekst.regel ? tekst.regel(alt) : alt).trim();
  // zonder alt-tekst is de regel de eigen melding («Зображення не завантажилось»): die staat in de kleine letter van de tweede regel
  // en mag in een tegel die er hoog genoeg voor is over twee regels — in een tegel van 200 px brak hij anders af op «…завантажи…»
  const melding = !alt && regelTekst !== '';
  // wat past erin? Gemeten in de opmaak van de brief (offset*: zonder de schaal van «Розмір тексту»); onmeetbaar → de schatting
  const gemeten = b > 0 || h > 0, breed = gemeten ? b : maat.schatB, hoog = gemeten ? h : maat.schatH;
  let vorm = tegelVorm(breed, hoog, regelTekst, !!maat.ruimte || /px$/.test(st.width));
  // een melding die op één regel moet (lage tegel) en daar niet past, wordt niet afgekapt getoond: dan alleen het pictogram — de
  // volledige tekst staat in de naam en de knopinfo (11 px: ±6,4 px per teken; naast het pictogram 26 px minder plaats)
  if (melding && ((vorm === 'volledig' && hoog < 72) || vorm === 'rij') && breed < regelTekst.length * 6.4 + (vorm === 'rij' ? 46 : 24)) vorm = 'pictogram';
  tegel.dataset.mailBeeldTegel = vorm;
  if (bewaard.gevuld) inhoud.replaceChildren();
  bewaard.gevuld = true;
  if (vorm === 'leeg') {
    // volgpixel of afstandhouder: de plaats blijft, maar er is niets te zien en niets te melden (ook niet aan de schermlezer —
    // een nieuwsbrief met tientallen spacer.gif gaf anders tientallen keren «Зображення приховано»)
    st.backgroundColor = 'transparent'; st.border = '0'; st.boxShadow = 'none'; ist.padding = '0';
    tegel.setAttribute('aria-hidden', 'true');
    return;
  }
  tegel.setAttribute('role', 'img');
  tegel.setAttribute('aria-label', tekst.naam(alt));
  tegel.title = tekst.uitleg(alt);
  ist.padding = vorm === 'volledig' ? '8px 12px' : vorm === 'rij' ? '0 10px' : '0';
  ist.flexDirection = vorm === 'rij' ? 'row' : 'column';
  const zijde = Math.max(12, Math.min(20, hoog - 10, breed - 10));
  const svg = doc.createElementNS(SVG, 'svg');
  for (const [naam, waarde] of Object.entries({ viewBox: '0 0 24 24', width: String(zijde), height: String(zijde), fill: 'none', stroke: 'currentColor', 'stroke-width': '1.75', 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true' })) svg.setAttribute(naam, waarde);
  svg.style.flex = '0 0 auto'; svg.style.opacity = '0.85';
  for (const [soort, kenmerken] of tekst.soort === 'laden' ? PICTOGRAM_LADEN : tekst.soort === 'mislukt' ? PICTOGRAM_MISLUKT : PICTOGRAM) { const deel = doc.createElementNS(SVG, soort); for (const [naam, waarde] of Object.entries(kenmerken)) deel.setAttribute(naam, waarde); svg.appendChild(deel); }
  inhoud.appendChild(svg);
  if (vorm !== 'rij' && vorm !== 'volledig') return;
  const regel = doc.createElement('span');
  regel.textContent = regelTekst;
  // de regel in volle inkt (de tegel zelf is 70 % — genoeg voor het pictogram, te licht voor 12 px tekst bij grijze brieftekst)
  regel.style.color = inkt(1);
  if (vorm === 'rij') { regel.style.flex = '0 1 auto'; regel.style.minWidth = '0'; }
  // width:0 + min-width:100%: de regel vult de tegel, maar telt niet mee voor de kleinste breedte van een tabelcel — anders duwde
  // een lange alt-tekst de kolommen van een nieuwsbrief breder dan het scherm (op de telefoon werd de hele brief dan verkleind)
  else { regel.style.display = 'block'; regel.style.width = '0'; regel.style.minWidth = '100%'; }
  regel.style.overflow = 'hidden'; regel.style.textOverflow = 'ellipsis'; regel.style.whiteSpace = 'nowrap';
  if (melding) {
    regel.style.fontSize = '11px'; regel.style.fontWeight = '400';
    // twee regels van 11 px (2 × 14,3) + pictogram (20) + tussenruimte (6) + binnenmarge (16) = 71 px
    if (vorm === 'volledig' && hoog >= 72) { regel.style.whiteSpace = 'normal'; regel.style.display = '-webkit-box'; regel.style.setProperty('-webkit-box-orient', 'vertical'); regel.style.setProperty('-webkit-line-clamp', '2'); regel.style.setProperty('text-wrap', 'balance'); }
  }
  inhoud.appendChild(regel);
  // tweede regel (kleiner): alleen in de volle vorm en als er hoogte voor is
  const onderTekst = (tekst.onder ? tekst.onder(alt) : '').trim();
  if (vorm !== 'volledig' || !onderTekst || hoog < 84) return;
  const onder = doc.createElement('span');
  onder.textContent = onderTekst;
  onder.style.display = 'block'; onder.style.width = '0'; onder.style.minWidth = '100%'; onder.style.marginTop = '-3px';
  onder.style.color = inkt(1); onder.style.fontSize = '11px'; onder.style.fontWeight = '400';
  onder.style.overflow = 'hidden'; onder.style.textOverflow = 'ellipsis'; onder.style.whiteSpace = 'nowrap';
  inhoud.appendChild(onder);
}

/**
 * Zet voor elk beeld een tegel vóór het beeld en verbergt het beeld (zonder bron). Staat er al een tegel, dan krijgt die de nieuwe
 * tekst (verborgen → wordt geladen → niet geladen); dezelfde tekst nog eens = niets doen.
 * In drie gangen over de hele lijst — eerst alles lezen, dan alles schrijven, dan één keer meten en vullen — zodat de browser de
 * brief twee keer opmaakt in plaats van één keer per beeld (een nieuwsbrief met 1200 beelden kostte anders seconden).
 */
export function zetBeeldTegels(werk: ReadonlyArray<readonly [HTMLImageElement, TegelTekst]>): void {
  type Nieuw = { img: HTMLImageElement; tekst: TegelTekst; alt: string; stijl: string; blok: boolean; inkt: [number, number, number]; zweef: string; marges: string[]; lijn: string; los: boolean; rand: [number, number] };
  const nieuw: Nieuw[] = [], vullen: Array<[HTMLImageElement, Bewaard]> = [];
  // 1. lezen (geen enkele wijziging ertussen: één keer stijl berekenen)
  for (const [img, tekst] of werk) {
    const oud = tegels.get(img);
    if (oud?.tegel.isConnected) { if (oud.tekst !== tekst) { oud.tekst = tekst; vullen.push([img, oud]); } continue; }
    const venster = img.ownerDocument.defaultView;
    if (!venster || !img.parentElement) continue;
    const eigen = venster.getComputedStyle(img);
    // een beeld dat de brief zelf verbergt (display:none — vaak de volgpixel) krijgt geen tegel
    if (eigen.display === 'none') continue;
    nieuw.push({
      img, tekst, alt: (img.getAttribute('alt') || '').trim(), stijl: img.getAttribute('style') || '',
      blok: eigen.display === 'block' || eigen.display === 'flex' || eigen.display === 'grid' || eigen.display === 'table',
      // inkt = de gewone tekstkleur op die plek; in een koppeling die van eromheen (geen blauwe tegel om een logo met een link)
      inkt: inktVan(venster.getComputedStyle(img.closest('a')?.parentElement || img.parentElement).color),
      // align/hspace/vspace zijn presentatie-attributen: ze staan niet in de stijl, wel in de berekende stijl
      zweef: String(eigen.float || ''), marges: ZIJDEN.map((z) => String(eigen.getPropertyValue?.(`margin-${z}`) || '')), lijn: String(eigen.verticalAlign || ''),
      // MAILBEELD-003: zwevend of los gepositioneerd → de browser maakt er een blok van, maar het is geen banner (een logo naast tekst)
      los: (!!eigen.float && eigen.float !== 'none') || eigen.position === 'absolute' || eigen.position === 'fixed',
      // binnenmarge + rand van het beeld (horizontaal, verticaal): de vaste ruimte moet ze meetellen zoals het beeld zelf
      rand: [['left', 'right'], ['top', 'bottom']].map((zz) => zz.reduce((som, z) => som + (Number.parseFloat(String(eigen.getPropertyValue?.(`padding-${z}`) || '0')) || 0) + (Number.parseFloat(String(eigen.getPropertyValue?.(`border-${z}-width`) || '0')) || 0), 0)) as [number, number],
    });
  }
  // 2. schrijven: de tegels maken en plaatsen, de beelden verbergen
  for (const n of nieuw) {
    const { img, alt } = n, doc = img.ownerDocument;
    const maat = tegelMaat({ breedteAttr: img.getAttribute('width'), hoogteAttr: img.getAttribute('height'), stijlBreedte: img.style.width, alt, echt: leesMaatTekst(img.getAttribute('data-mail-beeld-maat')), blok: n.blok && !n.los });
    const inkt = (a: number) => `rgba(${n.inkt[0]}, ${n.inkt[1]}, ${n.inkt[2]}, ${a})`;
    const tegel = doc.createElement('span');
    // dezelfde plaats als het beeld: marge, zweven, breedte en afronding komen uit de stijl van het beeld zelf
    tegel.setAttribute('style', n.stijl);
    const st = tegel.style;
    if (n.zweef && n.zweef !== 'none' && !st.getPropertyValue('float')) st.setProperty('float', n.zweef);
    ZIJDEN.forEach((z, i) => { const m = n.marges[i]; if (m && m !== '0px' && !st.getPropertyValue(`margin-${z}`)) st.setProperty(`margin-${z}`, m); });
    // de laag met pictogram en tekst: de tegel zelf, of (met vaste ruimte) een laag die over de ruimte ligt en zelf niets meetelt
    let inhoud: HTMLElement = tegel;
    if (maat.ruimte) {
      // MAILBEELD-003: de plaats houdt een onzichtbaar <svg> van b × h vast — een vervangen element met max-width:100% en height:auto,
      // precies zoals het beeld zelf getekend wordt. De tegel krimpt eromheen (inline-block, of als blok «fit-content»).
      st.setProperty('display', n.blok ? 'block' : 'inline-block', 'important');
      st.position = 'relative'; st.boxSizing = 'border-box'; st.overflow = 'hidden'; st.minWidth = '0';
      if (!st.maxWidth) st.maxWidth = '100%';
      st.width = n.blok ? 'fit-content' : 'auto'; st.height = 'auto'; st.aspectRatio = 'auto'; st.minHeight = '0'; st.maxHeight = 'none';
      // de plaats van het hele beeld, binnenmarge en rand inbegrepen (de tegel zelf heeft geen binnenmarge en geen rand): met een
      // width-attribuut is dat precies die breedte (border-box, prepareHtml), anders de eigen maat plus binnenmarge en rand
      let rb = maat.ruimte.b, rh = maat.ruimte.h;
      const [rx, ry] = n.rand;
      if (rx > 0 || ry > 0) {
        if (maat.ruimte.uitBrief) rh = Math.max(1, Math.round(Math.max(1, rb - rx) * maat.ruimte.h / maat.ruimte.b + ry));
        else { rb = Math.round(rb + rx); rh = Math.round(rh + ry); }
      }
      st.padding = '0';
      const ruimte = doc.createElementNS(SVG, 'svg');
      for (const [naam, waarde] of Object.entries({ width: String(rb), height: String(rh), viewBox: `0 0 ${rb} ${rh}`, 'aria-hidden': 'true', focusable: 'false' })) ruimte.setAttribute(naam, waarde);
      ruimte.style.display = 'block'; ruimte.style.maxWidth = '100%'; ruimte.style.height = 'auto';
      ruimte.dataset.mailBeeldRuimte = '';
      tegel.appendChild(ruimte);
      inhoud = doc.createElement('span');
      const ist = inhoud.style;
      ist.position = 'absolute'; ist.top = '0'; ist.right = '0'; ist.bottom = '0'; ist.left = '0';
      ist.display = 'flex'; ist.flexDirection = 'column'; ist.alignItems = 'center'; ist.justifyContent = 'center'; ist.gap = '6px';
      ist.boxSizing = 'border-box'; ist.overflow = 'hidden'; ist.minWidth = '0';
      tegel.appendChild(inhoud);
    } else {
      st.setProperty('display', n.blok ? 'flex' : 'inline-flex', 'important');
      st.flexDirection = 'column'; st.alignItems = 'center'; st.justifyContent = 'center'; st.gap = '6px';
      st.boxSizing = 'border-box'; st.overflow = 'hidden'; st.minWidth = '0';
      if (!st.maxWidth) st.maxWidth = '100%';
      if (maat.breedte) st.width = maat.breedte;
      st.height = maat.hoogte || 'auto';
      st.aspectRatio = maat.verhouding || 'auto';
      st.minHeight = maat.minHoogte || '0'; st.maxHeight = maat.maxHoogte || 'none';
    }
    // zonder eigen uitlijning: de gewone tegel «bottom» (zijn basislijn is de tekstregel erin); met vaste ruimte de basislijn, zoals het
    // beeld zelf — een inline-block met alleen een blok-<svg> heeft zijn basislijn onderaan, net als een <img> (anders 5 px verschil)
    if (!n.blok && !st.verticalAlign) st.verticalAlign = n.lijn && n.lijn !== 'baseline' ? n.lijn : maat.ruimte ? 'baseline' : 'bottom';
    // eigen afronding van het beeld blijft (een avatar blijft rond); het logoplaatje van de donkere weergave (4 px) telt niet
    const straal = getal(st.borderRadius);
    if (!st.borderRadius || (Number.isFinite(straal) && straal < 8)) st.borderRadius = '12px';
    st.backgroundImage = 'none'; st.backgroundColor = inkt(0.07);
    // met vaste ruimte een rand ín de tegel (box-shadow): een echte rand maakte hem 2 px groter dan het beeld
    if (maat.ruimte) { st.border = '0'; st.boxShadow = `inset 0 0 0 1px ${inkt(0.14)}`; } else st.border = `1px solid ${inkt(0.14)}`;
    st.color = inkt(0.7);
    st.font = "500 12px/1.3 system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif";
    st.letterSpacing = 'normal'; st.textAlign = 'center'; st.textTransform = 'none'; st.textIndent = '0'; st.whiteSpace = 'nowrap';
    st.userSelect = 'none';
    tegel.dataset.mailBeeldTegel = '';
    tegel.dataset.mailTranslationSkip = 'true';
    img.before(tegel);
    const bewaard: Bewaard = { tegel, inhoud, display: img.style.getPropertyValue('display'), prioriteit: img.style.getPropertyPriority('display'), tekst: n.tekst, alt, maat, inkt: n.inkt, gevuld: false };
    tegels.set(img, bewaard);
    img.style.setProperty('display', 'none', 'important');
    vullen.push([img, bewaard]);
  }
  // 3. één keer meten, daarna alleen nog schrijven
  const maten = vullen.map(([, b]) => [b.tegel.offsetWidth, b.tegel.offsetHeight] as const);
  vullen.forEach(([img, b], i) => vulTegel(img, b, maten[i][0], maten[i][1]));
}

/** Eén beeld: zet de tegel vóór het beeld en verbergt het beeld (zonder bron). Twee keer roepen = één tegel. */
export function zetBeeldTegel(img: HTMLImageElement, tekst: TegelTekst): void {
  zetBeeldTegels([[img, tekst]]);
}

/** Haalt de tegel weg en zet het beeld terug zoals het stond (vóór het tonen van het echte beeld). Zonder tegel: niets. */
export function wisBeeldTegel(img: HTMLElement): void {
  const bewaard = tegels.get(img);
  if (!bewaard) return;
  bewaard.tegel.remove();
  if (bewaard.display) img.style.setProperty('display', bewaard.display, bewaard.prioriteit); else img.style.removeProperty('display');
  tegels.delete(img);
}
