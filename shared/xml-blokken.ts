// SEC-002 (integraties-11): lineaire ontleding van XML-antwoorden van een EXTERNE dienst (WebDAV 207, S3 ListBucketResult).
//
// Waarom: `tekst.match(/<response\b[\s\S]*?<\/response>/gi)` is kwadratisch zodra de afsluitende tag ontbreekt — voor elke
// openingstag loopt de zoekmachine tot het einde van de tekst. Een dienst van een derde (of een overgenomen Nextcloud/MinIO)
// zette zo met één antwoord van 2 MB de hoofdthread — en daarmee de hele site — ongeveer een minuut stil.
// Hier: één doorloop met indexOf. Ontbreekt de afsluitende tag, dan stopt het zoeken (verderop kan er ook geen meer staan).
// Geen XML-parser: precies wat de adapters nodig hebben (blokken met een bekende naam, eerste tekstinhoud van een element).

const NAAMTEKEN = /[a-z0-9_.-]/;
const MAX_PREFIX = 64;
const isNaamteken = (t: string | undefined) => t !== undefined && NAAMTEKEN.test(t);

/** Staat op `i` (de plek van de naam, tekst in kleine letters) een openingstag `<naam` of `<prefix:naam`? Plek van '<' of -1. */
function openingVoor(klein: string, i: number): number {
  let j = i - 1;
  if (klein[j] === ':') { // namespace-prefix: terug tot '<', hoogstens MAX_PREFIX tekens
    j -= 1;
    const grens = Math.max(0, j - MAX_PREFIX);
    const start = j;
    while (j >= grens && isNaamteken(klein[j])) j -= 1;
    if (j === start) return -1; // lege prefix («<:naam»)
  }
  return j >= 0 && klein[j] === '<' ? j : -1;
}

/** Volgende openingstag `<[prefix:]naam` vanaf `van`; geeft { begin: plek van '<', na: plek na de naam } of null. */
function volgendeOpening(klein: string, naam: string, van: number): { begin: number; na: number } | null {
  for (let i = klein.indexOf(naam, van); i !== -1; i = klein.indexOf(naam, i + 1)) {
    const na = i + naam.length;
    if (isNaamteken(klein[na])) continue; // langere naam (bv. «responsedescription»)
    const begin = openingVoor(klein, i);
    if (begin !== -1 && begin >= van) return { begin, na };
  }
  return null;
}
/** Volgende sluittag `</[prefix:]naam>` vanaf `van`; geeft { begin: plek van '<', einde: plek na '>' } of null. */
function volgendeSluiting(klein: string, naam: string, van: number): { begin: number; einde: number } | null {
  for (let j = klein.indexOf('</', van); j !== -1; j = klein.indexOf('</', j + 2)) {
    let k = j + 2;
    const grens = Math.min(klein.length, k + MAX_PREFIX);
    let p = k;
    while (p < grens && isNaamteken(klein[p])) p += 1;
    if (klein[p] === ':' && p > k) k = p + 1; // prefix overslaan
    if (!klein.startsWith(naam, k)) continue;
    let e = k + naam.length;
    while (klein[e] === ' ' || klein[e] === '\t' || klein[e] === '\n' || klein[e] === '\r') e += 1;
    if (klein[e] === '>') return { begin: j, einde: e + 1 };
  }
  return null;
}

/**
 * Alle blokken `<[prefix:]naam …>…</[prefix:]naam>` (hoofdletterongevoelig, niet genest), in volgorde, hoogstens `max`.
 * Lineair in de lengte van `xml`; een blok zonder afsluitende tag beëindigt de zoektocht.
 */
export function xmlBlokken(xml: string, naam: string, max = 2000): string[] {
  const uit: string[] = [];
  const tekst = String(xml || ''), n = String(naam || '').toLowerCase();
  if (!tekst || !n) return uit;
  const klein = tekst.toLowerCase();
  let pos = 0;
  while (uit.length < max) {
    const open = volgendeOpening(klein, n, pos);
    if (!open) break;
    const sluit = volgendeSluiting(klein, n, open.na);
    if (!sluit) break;
    uit.push(tekst.slice(open.begin, sluit.einde));
    pos = sluit.einde;
  }
  return uit;
}

/**
 * De tekstinhoud van het EERSTE element `<[prefix:]naam …>…</[prefix:]naam>` in `xml` ('' als het ontbreekt of niet sluit).
 * Lineair; een zelfsluitende tag (`<naam/>`) geeft ''.
 */
export function xmlInhoud(xml: string, naam: string): string {
  const tekst = String(xml || ''), n = String(naam || '').toLowerCase();
  if (!tekst || !n) return '';
  const klein = tekst.toLowerCase();
  const open = volgendeOpening(klein, n, 0);
  if (!open) return '';
  const dicht = klein.indexOf('>', open.na);
  if (dicht === -1 || klein[dicht - 1] === '/') return '';
  const sluit = volgendeSluiting(klein, n, dicht + 1);
  return sluit ? tekst.slice(dicht + 1, sluit.begin) : '';
}
