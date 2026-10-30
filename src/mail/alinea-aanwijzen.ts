// «Показати абзац у листі» (pakket 3 «Adaptive Mail Canvas», 24.10.2026): het citaat van een AI-punt in de getoonde brief zelf
// aanwijzen — in het iframe van een HTML-brief of in de platte tekst. De tekstknopen blijven onaangeroerd (de vertaling verwijst ernaar):
// het blok rond het citaat krijgt tijdelijk een omlijning, en waar de browser het kan (CSS Custom Highlight API) wordt precies het citaat
// gemarkeerd. Zoeken gebeurt op dezelfde genormaliseerde tekst als de controle (shared/ai-bronnen.ts).
import { normaliseer, normaliseerMetKaart } from '../../shared/ai-bronnen';

const BLOK = 'p,li,td,th,blockquote,h1,h2,h3,h4,h5,h6,dd,dt,pre,div,section,article';
const LICHT = 'data-mail-bron-licht';
const NAAM = 'mail-bron';
const timers = new WeakMap<Document, number>();

type Stuk = { node: Text; van: number };

function tekstKnopen(root: Node): Stuk[] {
  const doc = root.ownerDocument || (root as Document);
  const walker = doc.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode: (n) => {
      const p = (n as Text).parentElement;
      if (!p || p.closest('script,style,noscript,[data-mail-translation-skip]')) return NodeFilter.FILTER_REJECT;
      return NodeFilter.FILTER_ACCEPT;
    },
  });
  const uit: Stuk[] = [];
  let pos = 0;
  for (let n = walker.nextNode(); n; n = walker.nextNode()) { uit.push({ node: n as Text, van: pos }); pos += (n as Text).data.length; }
  return uit;
}

/** Waar staat dit citaat in de tekst van `root`? Begin- en eindknoop met plaats, of null. */
export function zoekInDom(root: Node, citaat: string): { start: { node: Text; offset: number }; eind: { node: Text; offset: number } } | null {
  const stukken = tekstKnopen(root);
  if (!stukken.length) return null;
  const ruw = stukken.map((s) => s.node.data).join('');
  const { norm, kaart } = normaliseerMetKaart(ruw);
  const kern = normaliseer(citaat).replace(/^[\s"'.,;:!?()[\]-]+|[\s"'.,;:!?()[\]-]+$/g, '');
  const delen = kern.split(/\s*\.\.\.\s*/).map((d) => d.trim()).filter((d) => d.length >= 3);
  if (!delen.length) return null;
  let vanaf = 0, begin = -1, eind = -1;
  for (const d of delen) {
    const i = norm.indexOf(d, vanaf);
    if (i < 0) return null;
    if (begin < 0) begin = i;
    eind = i + d.length;
    vanaf = eind;
  }
  const plek = (ruwIndex: number) => {
    let s = stukken[0];
    for (const k of stukken) { if (k.van <= ruwIndex) s = k; else break; }
    return { node: s.node, offset: Math.min(s.node.data.length, ruwIndex - s.van) };
  };
  const ruwBegin = kaart[begin], ruwEind = kaart[eind - 1] + 1;
  return { start: plek(ruwBegin), eind: plek(ruwEind) };
}

/**
 * Wijs het citaat aan: scrol het blok in beeld en licht het ~4 s op. `kleur` = de waarschuwingskleur van de site (tokens bestaan niet
 * in het iframe). Geeft false als het citaat niet gevonden is (dan gebeurt er niets).
 */
export function wijsCitaatAan(root: Document | HTMLElement, citaat: string, kleur: string): boolean {
  // nodeType i.p.v. instanceof: het document van het iframe komt uit een ander venster (instanceof Document is daar altijd false)
  const isDoc = (root as Node).nodeType === 9;
  const doc = isDoc ? (root as Document) : root.ownerDocument;
  const zoekRoot = isDoc ? (root as Document).body : root;
  if (!doc || !zoekRoot) return false;
  const gevonden = zoekInDom(zoekRoot, citaat);
  if (!gevonden) return false;
  const blok = (gevonden.start.node.parentElement?.closest(BLOK) as HTMLElement | null) || gevonden.start.node.parentElement;
  if (!blok) return false;
  for (const oud of doc.querySelectorAll(`[${LICHT}]`)) { (oud as HTMLElement).style.removeProperty('outline'); (oud as HTMLElement).style.removeProperty('outline-offset'); oud.removeAttribute(LICHT); }
  blok.setAttribute(LICHT, 'ja');
  blok.style.setProperty('outline', `3px solid ${kleur}`);
  blok.style.setProperty('outline-offset', '3px');
  const win = doc.defaultView as (Window & typeof globalThis) | null;
  try {
    const H = (win as unknown as { Highlight?: new (...r: Range[]) => unknown })?.Highlight;
    const reg = (win?.CSS as unknown as { highlights?: Map<string, unknown> } | undefined)?.highlights;
    if (H && reg) {
      const range = doc.createRange();
      range.setStart(gevonden.start.node, gevonden.start.offset);
      range.setEnd(gevonden.eind.node, gevonden.eind.offset);
      reg.set(NAAM, new H(range));
      // De kleur van de markering: een opgebouwd stijlblad (adoptedStyleSheets) — een <style> in het iframe weigert de CSP van de brief
      // («style-src-elem 'self'»), en dan zou de markering onzichtbaar zijn.
      const S = (win as unknown as { CSSStyleSheet?: { new (): CSSStyleSheet } })?.CSSStyleSheet;
      const eigen = doc as Document & { adoptedStyleSheets?: CSSStyleSheet[]; __mailBronStijl?: CSSStyleSheet };
      if (S && Array.isArray(eigen.adoptedStyleSheets)) {
        const blad = eigen.__mailBronStijl || new S();
        (blad as CSSStyleSheet & { replaceSync: (t: string) => void }).replaceSync(`::highlight(${NAAM}){background-color:color-mix(in srgb, ${kleur} 38%, transparent);color:inherit}`);
        if (!eigen.__mailBronStijl) { eigen.__mailBronStijl = blad; eigen.adoptedStyleSheets = [...eigen.adoptedStyleSheets, blad]; }
      }
    }
  } catch { /* geen Custom Highlight API: de omlijning volstaat */ }
  try { blok.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch { blok.scrollIntoView(); }
  const vorige = timers.get(doc);
  if (vorige) win?.clearTimeout(vorige);
  timers.set(doc, (win || window).setTimeout(() => {
    blok.style.removeProperty('outline'); blok.style.removeProperty('outline-offset'); blok.removeAttribute(LICHT);
    try { (win?.CSS as unknown as { highlights?: Map<string, unknown> } | undefined)?.highlights?.delete(NAAM); } catch { /* */ }
  }, 4000));
  return true;
}

/** Het verzoek «wijs dit citaat aan in brief X» (MailGesprekInhoud → de brieftekst van die brief). */
export const TOON_ALINEA = 'mail:toon-alinea';
export type ToonAlinea = { berichtId: string; citaat: string };
