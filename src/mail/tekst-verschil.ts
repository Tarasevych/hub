// Verschil tussen twee teksten voor «Порівняти версії» (pakket 3 «Adaptive Mail Canvas», 24.10.2026) — puur, zonder DOM.
// Blokken: alinea's (lege regel); lijstpunten en korte regels apart; zeer lange alinea's in zinnen. Vergelijken: LCS over de blokken
// (grote gaten eerst via unieke ankers, «patience diff»); weggevallen en nieuwe blokken naast elkaar die op elkaar lijken (≥ 50 %
// gedeelde woorden) worden één rij «gewijzigd» met een verschil per woord (LCS over woorden, leestekens blijven aan hun woord); een
// paar groeit met buurblokken die erbij horen (gesplitste of samengevoegde alinea). Dezelfde tekst die elders terugkomt: «verplaatst».
// Begrensd (blokken, cellen, woorden per paar): wat niet vergeleken is, meldt `afgekapt` — nooit een verzonnen «gelijk».
// Gebruikt door src/mail/VersieVergelijk.tsx en src/mail/bijlage-tekst.ts; getoetst in tests/eenheid/versie-vergelijk-20261024.test.ts.

export type VerschilWoord = {
  soort: 'gelijk' | 'weg' | 'nieuw'; tekst: string;
  /** Alleen bij 'gelijk': de oude schrijfwijze, als die typografisch afwijkt (andere aanhalingstekens of streepjes). */
  oud?: string;
};
export type VerschilRij = {
  soort: 'gelijk' | 'weg' | 'nieuw' | 'gewijzigd'; oud?: string; nieuw?: string; woorden?: VerschilWoord[];
  /** 'weg'/'nieuw' waarvan dezelfde tekst elders aan de andere kant staat: index van die rij (verplaatst, niet geschrapt). */
  verplaatst?: number;
};
export type VerschilTelling = { gelijk: number; weg: number; nieuw: number; gewijzigd: number };
export type VerschilUitkomst = { rijen: VerschilRij[]; telling: VerschilTelling; afgekapt: boolean };

/** Standaard hoogstens zoveel blokken per kant (een pdf van 60 pagina's heeft er zelden meer dan 2 500). */
export const MAX_BLOKKEN = 4000;
const ZEER_LANG = 1500; // tekens: zo'n alinea gaat in zinnen
const STUK_MIN = 300, STUK_MAX = 1200; // een «zin» zonder leestekens: stukken op een woordgrens die van de inhoud afhangt
const MAX_CELLEN = 2_250_000; // LCS over blokken in één gat (1500 × 1500); grotere gaten via ankers
const MAX_CELLEN_TOTAAL = 20_000_000; // LCS over blokken, alle gaten samen
const MAX_WOORDEN_PAAR = 4000; // oud + nieuw in één paar
const MAX_WOORD_CELLEN = 1_000_000; // LCS over woorden, per paar
const MAX_WOORD_CELLEN_TOTAAL = 40_000_000; // alle paren samen
const DREMPEL = 0.5; // gedeelde woorden / langste blok
const VENSTER = 12; // gretig koppelen in grote gaten
const SAMENVOEG_MIN = 200, SAMENVOEG_RUIMTE = 60, SAMENVOEG_REEKS = 48; // tekens, blokken in een gat, blokken in een reeks

// ------------------------------------------------------------------ tekst schoonmaken
const LIGATUREN: Record<string, string> = { '\uFB00': 'ff', '\uFB01': 'fi', '\uFB02': 'fl', '\uFB03': 'ffi', '\uFB04': 'ffl', '\uFB05': 'st', '\uFB06': 'st' };
function schoon(tekst: string): string {
  return String(tekst ?? '').normalize('NFC')
    .replace(/\r\n?|\u2028|\u0085/g, '\n').replace(/[\f\v\u2029]/g, '\n\n')
    .replace(/[\u00AD\u200B-\u200D\u2060\uFEFF]/g, '')
    .replace(/[\uFB00-\uFB06]/g, (c) => LIGATUREN[c] || c)
    .replace(/[\u0000-\u0008\u000E-\u001F\u007F]/g, ' ')
    .replace(/[\t\u00A0\u1680\u2000-\u200A\u202F\u205F\u3000]/g, ' ');
}
/** Vergelijkingssleutel: aanhalingstekens, streepjes en het weglatingsteken tellen als hun eenvoudige vorm. */
export function vergelijkSleutel(s: string): string {
  return s.replace(/[‘’‚‛′`´]/g, "'").replace(/[“”„‟″«»]/g, '"')
    .replace(/[‐-―−]/g, '-').replace(/…/g, '...');
}

/** Regels van één alinea samenvoegen: spaties, en afbreking aan het regeleinde («huur-» + «der» → «huurder», «Noord-» + «Holland»). */
export function regelsSamenvoegen(regels: string[]): string {
  let uit = '';
  for (const ruw of regels) {
    const r = ruw.replace(/\s+/g, ' ').trim();
    if (!r) continue;
    if (!uit) uit = r;
    else if (/\p{Ll}-$/u.test(uit) && /^\p{Ll}/u.test(r)) uit = uit.slice(0, -1) + r;
    else if (/\p{L}-$/u.test(uit) && /^\p{Lu}/u.test(r)) uit += r;
    else uit += ` ${r}`;
  }
  return uit;
}

// ------------------------------------------------------------------ blokken
// Afkortingen waarna een punt geen zin afsluit (nl, en, uk); één letter (initiaal) ook niet.
const AFKORTINGEN = new Set([
  'art', 'artt', 'nr', 'nrs', 'bv', 'vb', 'bijv', 'dhr', 'mevr', 'mw', 'mr', 'dr', 'drs', 'prof', 'ir', 'ing', 'st', 'blz', 'pp', 'vol', 'fig',
  'tel', 'fax', 'ca', 'resp', 'incl', 'excl', 'zgn', 'evt', 'enz', 'etc', 'vs', 'jl', 'eo', 'oa', 'ivm', 'tav', 'mbt', 'ie', 'eg', 'no', 'inc',
  'ltd', 'co', 'jr', 'sr', 'nv', 'bvba', 'ім', 'вул', 'просп', 'пл', 'смт', 'рр', 'ст', 'пп', 'тел', 'грн', 'коп', 'буд', 'кв', 'обл', 'проф',
  'доц', 'акад', 'див', 'напр', 'тис', 'млн', 'млрд', 'ін', 'ред', 'зб', 'вид', 'стор', 'рис', 'табл', 'розд', 'гл', 'ч', 'пров',
]);
/** Een lange alinea in zinnen: na . ! ? … (met afsluitende aanhalingstekens/haakjes) en een spatie, gevolgd door een hoofdletter,
 *  cijfer of openend aanhalingsteken — niet na een afkorting of initiaal. */
function zinnen(alinea: string): string[] {
  const uit: string[] = [];
  const re = /([.!?…]+)["'»”’)\]]*\s+/gu;
  let begin = 0, m: RegExpExecArray | null;
  while ((m = re.exec(alinea))) {
    const einde = m.index + m[0].length;
    if (!/^["'«„“([]?[\p{Lu}\p{N}]/u.test(alinea.slice(einde, einde + 2))) continue;
    if (m[1] === '.') {
      const woord = (/(\S+)$/.exec(alinea.slice(begin, m.index))?.[1] || '').replace(/^[("'«„“[]+/u, '');
      if (/^\p{L}$/u.test(woord) || AFKORTINGEN.has(woord.toLocaleLowerCase().replace(/\./g, ''))) continue;
    }
    uit.push(alinea.slice(begin, einde).trim());
    begin = einde;
  }
  uit.push(alinea.slice(begin).trim());
  return uit.filter(Boolean);
}
const fnv = (w: string) => { let h = 2166136261; for (let i = 0; i < w.length; i++) { h ^= w.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
/** Een «zin» zonder leestekens (tabel, code, één lange regel): knippen na een woord dat er zelf om vraagt (hash), zodat een
 *  invoeging vooraan niet alle grenzen verschuift; nooit langer dan STUK_MAX. */
function stukken(zin: string): string[] {
  if (zin.length <= ZEER_LANG) return [zin];
  const uit: string[] = [];
  let huidig: string[] = [], lengte = 0;
  const sluit = () => { if (huidig.length) uit.push(huidig.join(' ')); huidig = []; lengte = 0; };
  for (const woord of zin.split(' ')) {
    for (const w of woord.length > STUK_MAX ? woord.match(/[\s\S]{1,1200}/gu) || [] : [woord]) {
      huidig.push(w); lengte += w.length + 1;
      if (lengte >= STUK_MAX || (lengte >= STUK_MIN && fnv(w.toLocaleLowerCase()) % 16 === 0)) sluit();
    }
  }
  sluit();
  return uit;
}
// Een regel die een eigen blok begint (gewone tekst, geen PDF: daar zijn de alinea's al regels): opsommingsteken, kop, nummering.
const LIJST = /^(?:[-*•‣◦▪●○■□–—]\s|#{1,6}\s|\(?\d{1,3}(?:\.\d{1,3})*[.)]\s|\d{1,3}(?:\.\d{1,3})+\s|\(?\p{L}\)\s|§\s?\d)/u;

/** Vergelijkbare blokken uit geëxtraheerde tekst: alinea's (lege regel); binnen een alinea een nieuw blok bij een lijstteken en,
 *  bij korte regels (adres, tabel), elke regel apart; anders regels samengevoegd. Witruimte genormaliseerd, lege blokken weg;
 *  alinea's van meer dan 1500 tekens in zinnen. */
export function tekstBlokken(tekst: string): string[] {
  const uit: string[] = [];
  const voegToe = (blok: string) => {
    if (!blok) return;
    if (blok.length <= ZEER_LANG) { uit.push(blok); return; }
    for (const z of zinnen(blok)) for (const s of stukken(z)) uit.push(s);
  };
  for (const alinea of schoon(tekst).split(/\n\s*\n/)) {
    const regels = alinea.split('\n').map((r) => r.replace(/ {2,}/g, ' ').trim()).filter(Boolean);
    if (!regels.length) continue;
    // korte regels die niet doorlopen (adres, tabel): elke regel een blok; doorlopende tekst (volgende regel met een kleine letter,
    // of afgebroken met «-»/«,») blijft één alinea, ook in een smalle kolom
    let door = 0;
    for (let i = 1; i < regels.length; i++) if (/^\p{Ll}/u.test(regels[i]) || /[-,]$/.test(regels[i - 1])) door++;
    const kort = regels.length >= 3 && regels.reduce((n, r) => n + r.length, 0) / regels.length < 32 && door * 2 < regels.length - 1;
    let stuk: string[] = [];
    for (const r of regels) {
      if (stuk.length && (kort || LIJST.test(r))) { voegToe(regelsSamenvoegen(stuk)); stuk = []; }
      stuk.push(r);
    }
    voegToe(regelsSamenvoegen(stuk));
  }
  return uit;
}

// ------------------------------------------------------------------ gelijkenis (gedeelde woorden)
type Zak = { tel: Map<string, number>; totaal: number };
function zak(blok: string): Zak {
  const tel = new Map<string, number>();
  let totaal = 0;
  for (const w of blok.toLocaleLowerCase().split(/[^\p{L}\p{N}]+/u)) if (w) { tel.set(w, (tel.get(w) || 0) + 1); totaal++; }
  return { tel, totaal };
}
function gedeeld(a: Zak, b: Zak): number {
  const [klein, groot] = a.tel.size <= b.tel.size ? [a, b] : [b, a];
  let samen = 0;
  for (const [w, n] of klein.tel) { const m = groot.tel.get(w); if (m) samen += Math.min(n, m); }
  return samen;
}
const gelijkenis = (a: Zak, b: Zak) => (a.totaal && b.totaal ? gedeeld(a, b) / Math.max(a.totaal, b.totaal) : 0);
function plus(a: Zak, b: Zak): Zak {
  const tel = new Map(a.tel);
  for (const [w, n] of b.tel) tel.set(w, (tel.get(w) || 0) + n);
  return { tel, totaal: a.totaal + b.totaal };
}

// ------------------------------------------------------------------ LCS
type Op = { soort: 'gelijk' | 'weg' | 'nieuw'; a: number; b: number };
/** LCS over a[a0..a0+m) en b[b0..b0+n) (gehele getallen, m·n begrensd door de aanroeper): bewerkingen op volgorde in `ops`,
 *  binnen een gat eerst weg, dan nieuw. */
function lcs(a: number[], b: number[], a0: number, m: number, b0: number, n: number, ops: Op[]): void {
  const w = n + 1, L = new Uint16Array((m + 1) * w);
  for (let i = m - 1; i >= 0; i--) {
    const ai = a[a0 + i], r = i * w, r1 = r + w;
    for (let j = n - 1; j >= 0; j--) L[r + j] = ai === b[b0 + j] ? L[r1 + j + 1] + 1 : Math.max(L[r1 + j], L[r + j + 1]);
  }
  let i = 0, j = 0;
  while (i < m || j < n) {
    if (i < m && j < n && a[a0 + i] === b[b0 + j]) { ops.push({ soort: 'gelijk', a: a0 + i, b: b0 + j }); i++; j++; }
    else if (j >= n || (i < m && L[(i + 1) * w + j] >= L[i * w + j + 1])) { ops.push({ soort: 'weg', a: a0 + i, b: -1 }); i++; }
    else { ops.push({ soort: 'nieuw', a: -1, b: b0 + j }); j++; }
  }
}
/** Blokken uitlijnen in a[a0..a1) × b[b0..b1): gemeenschappelijk begin en einde; een klein gat met LCS; een groot gat via ankers
 *  (blokken die aan beide kanten precies één keer voorkomen, langste stijgende reeks — «patience diff») en dan per deelgat opnieuw.
 *  Geen anker in een groot gat: alles weg en nieuw — het koppelen op gelijkenis zoekt daarna de paren. */
function uitlijnen(a: number[], b: number[], a0: number, a1: number, b0: number, b1: number, ops: Op[], budget: { cellen: number }, diepte = 0): void {
  while (a0 < a1 && b0 < b1 && a[a0] === b[b0]) { ops.push({ soort: 'gelijk', a: a0, b: b0 }); a0++; b0++; }
  let s = 0;
  while (a1 - s > a0 && b1 - s > b0 && a[a1 - 1 - s] === b[b1 - 1 - s]) s++;
  const m = a1 - s - a0, n = b1 - s - b0;
  if (!m || !n || (m * n <= MAX_CELLEN && m * n <= budget.cellen)) {
    budget.cellen -= m * n;
    lcs(a, b, a0, m, b0, n, ops);
  } else {
    const ankers = diepte < 40 ? uniekeAnkers(a, b, a0, a0 + m, b0, b0 + n) : [];
    if (!ankers.length) {
      for (let i = a0; i < a0 + m; i++) ops.push({ soort: 'weg', a: i, b: -1 });
      for (let j = b0; j < b0 + n; j++) ops.push({ soort: 'nieuw', a: -1, b: j });
    } else {
      let x = a0, y = b0;
      for (const [i, j] of ankers) { uitlijnen(a, b, x, i, y, j, ops, budget, diepte + 1); ops.push({ soort: 'gelijk', a: i, b: j }); x = i + 1; y = j + 1; }
      uitlijnen(a, b, x, a0 + m, y, b0 + n, ops, budget, diepte + 1);
    }
  }
  for (let k = s; k > 0; k--) ops.push({ soort: 'gelijk', a: a1 - k, b: b1 - k });
}
/** Ankers: waarden die in beide stukken precies één keer voorkomen, de langste reeks die aan beide kanten stijgt. */
function uniekeAnkers(a: number[], b: number[], a0: number, a1: number, b0: number, b1: number): Array<[number, number]> {
  const telA = new Map<number, number>(), telB = new Map<number, number>(), posB = new Map<number, number>();
  for (let i = a0; i < a1; i++) telA.set(a[i], (telA.get(a[i]) || 0) + 1);
  for (let j = b0; j < b1; j++) { telB.set(b[j], (telB.get(b[j]) || 0) + 1); posB.set(b[j], j); }
  const kand: Array<[number, number]> = [];
  for (let i = a0; i < a1; i++) if (telA.get(a[i]) === 1 && telB.get(a[i]) === 1) kand.push([i, posB.get(a[i])!]);
  // langste stijgende deelrij op j (patience sorting met terugwijzers)
  const toppen: number[] = [], terug = new Int32Array(kand.length).fill(-1);
  for (let k = 0; k < kand.length; k++) {
    let lo = 0, hi = toppen.length;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (kand[toppen[mid]][1] < kand[k][1]) lo = mid + 1; else hi = mid; }
    if (lo > 0) terug[k] = toppen[lo - 1];
    toppen[lo] = k;
  }
  const uit: Array<[number, number]> = [];
  for (let k = toppen.length ? toppen[toppen.length - 1] : -1; k >= 0; k = terug[k]) uit.push(kand[k]);
  return uit.reverse();
}

// ------------------------------------------------------------------ woorden
type Regio = { gelijk: boolean; a: string[]; b: string[] };
type Budget = { cellen: number; afgekapt: boolean };
/** Verschil per woord tussen twee blokken: woorden met hun leestekens (gesplitst op spaties), vergeleken op de sleutel. Kleine
 *  gelijke stukjes tussen twee wijzigingen gaan in de wijziging op («x y z de u v» → één doorgehaald stuk), zodat het leesbaar blijft. */
export function woordVerschil(oud: string, nieuw: string, budget: Budget = { cellen: MAX_WOORD_CELLEN_TOTAAL, afgekapt: false }): VerschilWoord[] {
  const A = oud.split(' ').filter(Boolean), B = nieuw.split(' ').filter(Boolean);
  const ka = A.map(vergelijkSleutel), kb = B.map(vergelijkSleutel);
  let p = 0;
  while (p < A.length && p < B.length && ka[p] === kb[p]) p++;
  let s = 0;
  while (s < A.length - p && s < B.length - p && ka[A.length - 1 - s] === kb[B.length - 1 - s]) s++;
  const m = A.length - p - s, n = B.length - p - s;
  const regios: Regio[] = [];
  if (p) regios.push({ gelijk: true, a: A.slice(0, p), b: B.slice(0, p) });
  if (m || n) {
    const teGroot = m + n > MAX_WOORDEN_PAAR || m * n > MAX_WOORD_CELLEN || m * n > budget.cellen;
    if (!m || !n || teGroot) {
      if (m && n) budget.afgekapt = true;
      regios.push({ gelijk: false, a: A.slice(p, p + m), b: B.slice(p, p + n) });
    } else {
      budget.cellen -= m * n;
      const ids = new Map<string, number>(), id = (k: string) => { let v = ids.get(k); if (v === undefined) { v = ids.size; ids.set(k, v); } return v; };
      const ops: Op[] = [];
      lcs(ka.map(id), kb.map(id), p, m, p, n, ops);
      let huidig: Regio | null = null;
      for (const op of ops) {
        const gelijk = op.soort === 'gelijk';
        if (!huidig || huidig.gelijk !== gelijk) { huidig = { gelijk, a: [], b: [] }; regios.push(huidig); }
        if (op.a >= 0) huidig.a.push(A[op.a]);
        if (op.b >= 0) huidig.b.push(B[op.b]);
      }
    }
  }
  if (s) regios.push({ gelijk: true, a: A.slice(A.length - s), b: B.slice(B.length - s) });
  // opschonen: [wijziging] [≤ 2 gelijke woorden] [wijziging] → één wijziging als de wijzigingen samen groter zijn
  const schoner: Regio[] = [];
  for (const r of regios) {
    const g = schoner[schoner.length - 1], w = schoner[schoner.length - 2];
    if (!r.gelijk && g?.gelijk && w && !w.gelijk && g.b.length <= 2
      && Math.max(w.a.length, w.b.length) + Math.max(r.a.length, r.b.length) >= 2 * g.b.length + 1) {
      schoner.splice(-2, 2, { gelijk: false, a: [...w.a, ...g.a, ...r.a], b: [...w.b, ...g.b, ...r.b] });
      continue;
    }
    schoner.push(r);
  }
  const uit: VerschilWoord[] = [];
  for (const r of schoner) {
    if (r.gelijk) {
      const tekst = r.b.join(' '), oudTekst = r.a.join(' ');
      uit.push(oudTekst !== tekst ? { soort: 'gelijk', tekst, oud: oudTekst } : { soort: 'gelijk', tekst });
    } else {
      if (r.a.length) uit.push({ soort: 'weg', tekst: r.a.join(' ') });
      if (r.b.length) uit.push({ soort: 'nieuw', tekst: r.b.join(' ') });
    }
  }
  return uit;
}

// ------------------------------------------------------------------ gaten: koppelen en samenvoegen
type Paar = { d0: number; d1: number; i0: number; i1: number };
/** 1:1, op volgorde: in kleine gaten de beste som van gelijkenissen (gewogen LCS), in grote gaten gretig binnen een venster. */
function koppel(D: Zak[], I: Zak[]): Paar[] {
  const m = D.length, n = I.length, uit: Paar[] = [];
  if (!m || !n) return uit;
  if (m * n <= 900) {
    const sim = new Float64Array(m * n), w = n + 1, S = new Float64Array((m + 1) * w);
    for (let x = 0; x < m; x++) for (let y = 0; y < n; y++) sim[x * n + y] = gelijkenis(D[x], I[y]);
    for (let x = m - 1; x >= 0; x--) for (let y = n - 1; y >= 0; y--) {
      const s = sim[x * n + y];
      let best = Math.max(S[(x + 1) * w + y], S[x * w + y + 1]);
      if (s >= DREMPEL) best = Math.max(best, s + S[(x + 1) * w + y + 1]);
      S[x * w + y] = best;
    }
    let x = 0, y = 0;
    while (x < m && y < n) {
      const s = sim[x * n + y];
      if (s >= DREMPEL && Math.abs(S[x * w + y] - (s + S[(x + 1) * w + y + 1])) < 1e-9) { uit.push({ d0: x, d1: x + 1, i0: y, i1: y + 1 }); x++; y++; }
      else if (S[(x + 1) * w + y] >= S[x * w + y + 1]) x++;
      else y++;
    }
    return uit;
  }
  let y0 = 0;
  for (let x = 0; x < m && y0 < n; x++) {
    let best = -1, bestS = 0;
    for (let y = y0; y < Math.min(n, y0 + VENSTER); y++) { const s = gelijkenis(D[x], I[y]); if (s >= DREMPEL && s > bestS) { best = y; bestS = s; } }
    if (best >= 0) { uit.push({ d0: x, d1: x + 1, i0: best, i1: best + 1 }); y0 = best + 1; }
  }
  return uit;
}
/** Een lang blok tegenover een reeks blokken aan de andere kant die er samen op lijkt: dezelfde alinea, in de ene versie in zinnen
 *  gesplitst (ze werd langer dan 1500 tekens) of in twee alinea's. Alleen in kleine gaten tussen de gekoppelde paren. */
function samenvoegen(D: string[], I: string[], zD: Zak[], zI: Zak[], paren: Paar[]): Paar[] {
  const extra: Paar[] = [], stapel: Array<[number, number, number, number]> = [];
  let x = 0, y = 0;
  for (const p of paren) { stapel.push([x, p.d0, y, p.i0]); x = p.d1; y = p.i1; }
  stapel.push([x, D.length, y, I.length]);
  const reeks = (lang: string, zLang: Zak, kort: Zak[], teksten: string[], van: number, tot: number) => {
    let beste: { van: number; tot: number; s: number } | null = null;
    for (let a = van; a < tot; a++) {
      const tel = new Map<string, number>();
      let totaal = 0, lengte = 0;
      for (let b = a; b < Math.min(tot, a + SAMENVOEG_REEKS); b++) {
        lengte += teksten[b].length + 1;
        if (lengte > lang.length * 1.6) break;
        for (const [w, k] of kort[b].tel) tel.set(w, (tel.get(w) || 0) + k);
        totaal += kort[b].totaal;
        if (b === a) continue;
        const s = gelijkenis(zLang, { tel, totaal });
        if (s >= DREMPEL && (!beste || s > beste.s)) beste = { van: a, tot: b + 1, s };
      }
    }
    return beste;
  };
  while (stapel.length) {
    const [d0, d1, i0, i1] = stapel.pop()!;
    if (d1 <= d0 || i1 <= i0 || (d1 - d0) + (i1 - i0) > SAMENVOEG_RUIMTE || (d1 - d0) + (i1 - i0) < 3) continue;
    let beste: { paar: Paar; s: number } | null = null;
    for (let d = d0; d < d1; d++) if (D[d].length >= SAMENVOEG_MIN) {
      const r = reeks(D[d], zD[d], zI, I, i0, i1);
      if (r && (!beste || r.s > beste.s)) beste = { paar: { d0: d, d1: d + 1, i0: r.van, i1: r.tot }, s: r.s };
    }
    for (let i = i0; i < i1; i++) if (I[i].length >= SAMENVOEG_MIN) {
      const r = reeks(I[i], zI[i], zD, D, d0, d1);
      if (r && (!beste || r.s > beste.s)) beste = { paar: { d0: r.van, d1: r.tot, i0: i, i1: i + 1 }, s: r.s };
    }
    if (!beste) continue;
    extra.push(beste.paar);
    stapel.push([d0, beste.paar.d0, i0, beste.paar.i0], [beste.paar.d1, d1, beste.paar.i1, i1]);
  }
  return [...paren, ...extra].sort((a, b) => a.d0 - b.d0 || a.i0 - b.i0);
}
/** Een paar groeit met een vrij buurblok (ervoor of erna, aan een van beide kanten) zolang ≥ 60 % van de woorden van dat blok
 *  bij de tegenhanger hoort: een alinea die in twee is gesplitst, twee die samengingen, de laatste zinnen van een gesplitste alinea.
 *  Een echt nieuw blok ernaast deelt hooguit wat lidwoorden en blijft apart. */
function uitbreiden(zD: Zak[], zI: Zak[], paren: Paar[]): Paar[] {
  const som = (z: Zak[], van: number, tot: number) => { let s: Zak = { tel: new Map(), totaal: 0 }; for (let k = van; k < tot; k++) s = plus(s, z[k]); return s; };
  for (let k = 0; k < paren.length; k++) {
    const p = paren[k];
    const dMin = k ? paren[k - 1].d1 : 0, iMin = k ? paren[k - 1].i1 : 0;
    const dMax = k + 1 < paren.length ? paren[k + 1].d0 : zD.length, iMax = k + 1 < paren.length ? paren[k + 1].i0 : zI.length;
    let zd = som(zD, p.d0, p.d1), zi = som(zI, p.i0, p.i1), samen = gedeeld(zd, zi);
    for (let stap = 0; stap < 64; stap++) {
      const kand: Array<{ q: Paar; zd: Zak; zi: Zak; woorden: number }> = [];
      if (p.i1 < iMax) kand.push({ q: { ...p, i1: p.i1 + 1 }, zd, zi: plus(zi, zI[p.i1]), woorden: zI[p.i1].totaal });
      if (p.d1 < dMax) kand.push({ q: { ...p, d1: p.d1 + 1 }, zd: plus(zd, zD[p.d1]), zi, woorden: zD[p.d1].totaal });
      if (p.i0 > iMin) kand.push({ q: { ...p, i0: p.i0 - 1 }, zd, zi: plus(zi, zI[p.i0 - 1]), woorden: zI[p.i0 - 1].totaal });
      if (p.d0 > dMin) kand.push({ q: { ...p, d0: p.d0 - 1 }, zd: plus(zd, zD[p.d0 - 1]), zi, woorden: zD[p.d0 - 1].totaal });
      let beste = -1, besteWinst = 0.6, besteSamen = samen;
      for (let c = 0; c < kand.length; c++) {
        if (!kand[c].woorden) continue;
        const s = gedeeld(kand[c].zd, kand[c].zi), winst = (s - samen) / kand[c].woorden;
        if (winst >= besteWinst) { beste = c; besteWinst = winst; besteSamen = s; }
      }
      if (beste < 0) break;
      Object.assign(p, kand[beste].q); zd = kand[beste].zd; zi = kand[beste].zi; samen = besteSamen;
    }
  }
  return paren;
}
function paarRij(oud: string, nieuw: string, budget: Budget): VerschilRij {
  if (vergelijkSleutel(oud) === vergelijkSleutel(nieuw)) return { soort: 'gelijk', oud, nieuw };
  return { soort: 'gewijzigd', oud, nieuw, woorden: woordVerschil(oud, nieuw, budget) };
}
function gatRijen(D: string[], I: string[], rijen: VerschilRij[], budget: Budget) {
  const zD = D.map(zak), zI = I.map(zak);
  const paren = uitbreiden(zD, zI, samenvoegen(D, I, zD, zI, koppel(zD, zI)));
  let x = 0, y = 0;
  for (const p of paren) {
    for (; x < p.d0; x++) rijen.push({ soort: 'weg', oud: D[x] });
    for (; y < p.i0; y++) rijen.push({ soort: 'nieuw', nieuw: I[y] });
    rijen.push(paarRij(D.slice(p.d0, p.d1).join(' '), I.slice(p.i0, p.i1).join(' '), budget));
    x = p.d1; y = p.i1;
  }
  for (; x < D.length; x++) rijen.push({ soort: 'weg', oud: D[x] });
  for (; y < I.length; y++) rijen.push({ soort: 'nieuw', nieuw: I[y] });
}
/** Een weggevallen blok (≥ 3 woorden) dat elders als nieuw blok terugkomt: beide rijen verwijzen naar elkaar. */
function markeerVerplaatst(rijen: VerschilRij[]) {
  const weg = new Map<string, number[]>();
  rijen.forEach((r, i) => {
    if (r.soort !== 'weg' || !r.oud || r.oud.split(' ').length < 3) return;
    const k = vergelijkSleutel(r.oud), l = weg.get(k);
    if (l) l.push(i); else weg.set(k, [i]);
  });
  if (!weg.size) return;
  rijen.forEach((r, i) => {
    if (r.soort !== 'nieuw' || !r.nieuw) return;
    const j = weg.get(vergelijkSleutel(r.nieuw))?.shift();
    if (j === undefined) return;
    r.verplaatst = j; rijen[j].verplaatst = i;
  });
}

// ------------------------------------------------------------------ vergelijken
/** Vergelijkt twee teksten per blok, met woorden binnen gewijzigde blokken. `afgekapt`: een deel is niet vergeleken (meer dan
 *  `maxBlokken` blokken aan een kant, of een paar te groot voor een verschil per woord). Bij te veel blokken valt ook weg wat na de
 *  laatste zekere gelijke rij kwam: de rest is niet gelezen, een «weg»/«nieuw» daar zou verzonnen kunnen zijn. */
export function vergelijkTeksten(oud: string, nieuw: string, opties: { maxBlokken?: number } = {}): VerschilUitkomst {
  const max = Math.max(1, Math.floor(opties.maxBlokken ?? MAX_BLOKKEN));
  let A = tekstBlokken(oud), B = tekstBlokken(nieuw), afgekapt = false;
  if (A.length > max || B.length > max) { afgekapt = true; A = A.slice(0, max); B = B.slice(0, max); }
  const ids = new Map<string, number>(), id = (s: string) => { const k = vergelijkSleutel(s); let v = ids.get(k); if (v === undefined) { v = ids.size; ids.set(k, v); } return v; };
  const ia = A.map(id), ib = B.map(id);
  const ops: Op[] = [];
  uitlijnen(ia, ib, 0, ia.length, 0, ib.length, ops, { cellen: MAX_CELLEN_TOTAAL });
  if (afgekapt) { let k = ops.length; while (k > 0 && ops[k - 1].soort !== 'gelijk') k--; ops.length = k; }
  const budget: Budget = { cellen: MAX_WOORD_CELLEN_TOTAAL, afgekapt: false };
  const rijen: VerschilRij[] = [];
  let D: string[] = [], I: string[] = [];
  const spoel = () => { if (D.length || I.length) gatRijen(D, I, rijen, budget); D = []; I = []; };
  for (const op of ops) {
    if (op.soort === 'gelijk') { spoel(); rijen.push({ soort: 'gelijk', oud: A[op.a], nieuw: B[op.b] }); }
    else if (op.soort === 'weg') D.push(A[op.a]);
    else I.push(B[op.b]);
  }
  spoel();
  markeerVerplaatst(rijen);
  const telling: VerschilTelling = { gelijk: 0, weg: 0, nieuw: 0, gewijzigd: 0 };
  for (const r of rijen) telling[r.soort]++;
  return { rijen, telling, afgekapt: afgekapt || budget.afgekapt };
}
