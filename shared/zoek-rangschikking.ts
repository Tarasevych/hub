// ZOEKKERN v2 — RANGSCHIKKING, «ВІДПОВІДНІСТЬ ЗАПИТУ» 0–100, UITLEG EN FRAGMENTEN (Z1, 22.10.2026).
//
// FORMULE (dezelfde constanten in SQL, backend/zoek-index.ts → scoreSql()):
//   score = dekking² · (1.0·rank_simple + 0.6·rank_stam)        rank_* = ts_rank({D,C,B,A} = {0.1,0.3,0.6,1.0}, …, 32) ∈ [0,1)
//         + 3.0·exacte_titel + 1.2·volledige_zin + 0.6·voorvoegsel + 0.5·titelwoorden
//         + 0.5·volledig       (alle woordgroepen aanwezig, bij ≥ 2 groepen: «alle woorden in de tekst» > «één synoniem in een knoptitel»)
//         + 0.8·titeldekking   (aandeel van de TITELWOORDEN dat door de vraag geraakt wordt: «Налаштування» = 1, «Закрити швидкі налаштування» = ⅓)
//         + 0.5·soortrang·dekking (bron pagina 1.0 > instelling 0.7 > hulp 0.5 > ui-onderdelen ≤ 0.4; alleen bij vragen ≤ 4 tokens — een korte vraag is een opdracht)
//         + 0.08·exp(−leeftijd / 90 dagen)                       (zwak: alleen een doorslag bij gelijke stand)
//         + 0.5·max(0, woordsimilariteit − 0.45)                 (typefout-kanaal: altijd meegeteld; rij ZONDER FTS-treffer leeft alleen hiervan en heet «vaag»)
//   dekking = aandeel OF-groepen van de vraag dat in zoek_vector staat; < ½ bij ≥ 2 groepen → rij valt af, TENZIJ de strikte
//   vraag niets gaf: dan wordt elke groep toegelaten (antwoord.verzwakt = true, uitleg 'gedeeltelijk').
// PERCENT: percent = round(100 · (score / max_score_in_deze_zoekopdracht)^0.75), minimaal 1. Monotoon in score, de beste
//   treffer is altijd 100, en de exponent < 1 spreidt de middenmoot zodat «82 %» en «31 %» iets zeggen. Nooit willekeurig:
//   dezelfde index + dezelfde vraag = dezelfde percentages.
import { lichteStam, transposities, varianten, zoekNorm, zoekWoorden } from './zoek-normalisatie';
import { isBekendSynoniem } from './zoek-synoniemen';
import { ACTIE_SOORTEN, SOORT_RANG, type ZoekFragment, type ZoekSynoniemGroep, type ZoekUitleg, type ZoekUitlegCode } from './zoek-model';

/** Veldgewichten voor ts_rank: {D, C, B, A} = tekst, omschrijving, trefwoorden, titel. */
export const VELD_GEWICHTEN = Object.freeze([0.1, 0.3, 0.6, 1.0] as const);
export const BONUS = Object.freeze({ stam: 0.6, exacteTitel: 3.0, volledigeZin: 1.2, voorvoegsel: 0.6, titelwoorden: 0.5, volledig: 0.5, titeldekking: 0.8, soortrang: 0.5, handeling: 0.5, vers: 0.08, vaag: 0.5, vaagDrempel: 0.45 });
export const VERSHEID_DAGEN = 90;
export const PERCENT_EXPONENT = 0.75;
export const MIN_DEKKING = 0.5;
/** Achterwaartse compatibiliteit met Etap A+B (global-search in het geheugen). */
export const GEWICHTEN = Object.freeze({ tekst: 0.4, trigram: 0.25, titel: 0.2, versheid: 0.15 });

export type ZoekSignalen = {
  dekking: number; rankSimple: number; rankStam: number; exacteTitel: boolean; volledigeZin: boolean; voorvoegsel: boolean;
  titelwoorden: boolean; handeling: boolean; versheid: number; vaag: number; ftsTreffer: boolean;
  /** Aandeel van de titelwoorden dat geraakt is (0–1) en de rang van de soort (SOORT_RANG; 0 voor documenten). */
  titeldekking?: number; soortrang?: number; gedeeltelijk?: boolean; groepen?: number;
  /** Door Node afgeleid uit het fragment: welke vraagwoorden via synoniem/vertaling/variant/stam raakten. */
  synoniem?: boolean; vertaling?: boolean; translit?: boolean; stam?: boolean; inTekst?: boolean; inOmschrijving?: boolean; inTrefwoord?: boolean;
};

export function scoreVanSignalen(s: ZoekSignalen): number {
  const d = Math.max(0, Math.min(1, s.dekking));
  let score = d * d * (s.rankSimple + BONUS.stam * s.rankStam);
  if (s.exacteTitel) score += BONUS.exacteTitel;
  if (s.volledigeZin) score += BONUS.volledigeZin;
  if (s.voorvoegsel) score += BONUS.voorvoegsel;
  if (s.titelwoorden) score += BONUS.titelwoorden;
  if (s.ftsTreffer) {
    if (d >= 1 && (s.groepen || 2) >= 2) score += BONUS.volledig;
    score += BONUS.titeldekking * Math.max(0, Math.min(1, s.titeldekking || 0));
    if (s.handeling) score += BONUS.soortrang * Math.max(0, Math.min(1, s.soortrang || 0)) * d;
  } else score = 0;   // zonder FTS-treffer telt alleen het typefout-kanaal
  score += BONUS.vers * Math.max(0, Math.min(1, s.versheid));
  score += BONUS.vaag * Math.max(0, s.vaag - BONUS.vaagDrempel);
  return score;
}

/** 0–100, monotoon, 100 voor de beste. `max` = hoogste score in deze zoekopdracht. */
export function percentVan(score: number, max: number): number {
  if (!(score > 0) || !(max > 0)) return score > 0 ? 100 : 0;
  return Math.max(1, Math.min(100, Math.round(100 * Math.pow(Math.min(1, score / max), PERCENT_EXPONENT))));
}

export const versheid = (bijgewerktOp: number, nu = Date.now()): number => {
  if (!bijgewerktOp || !Number.isFinite(bijgewerktOp)) return 0;
  return Math.exp(-Math.max(0, nu - bijgewerktOp) / (VERSHEID_DAGEN * 86400000));
};

// ------------------------------------------------------------------------------------------------ trigram (zoals pg_trgm)
export function trigrammen(s: string): Set<string> {
  const uit = new Set<string>();
  for (const w of zoekWoorden(zoekNorm(s))) { const p = `  ${w} `; for (let i = 0; i + 3 <= p.length; i++) uit.add(p.slice(i, i + 3)); }
  return uit;
}
export function trigramSimilariteit(a: string, b: string): number {
  const x = trigrammen(a), y = trigrammen(b); if (!x.size || !y.size) return 0;
  let gedeeld = 0; for (const t of x) if (y.has(t)) gedeeld++;
  return gedeeld / (x.size + y.size - gedeeld);
}
/** Benadering van pg_trgm word_similarity(a, b): beste similariteit van a tegen elk woord(paar) van b. */
export function woordSimilariteit(a: string, b: string): number {
  const woorden = zoekWoorden(zoekNorm(b)); if (!woorden.length) return 0;
  let best = trigramSimilariteit(a, b);
  for (let i = 0; i < woorden.length; i++) {
    best = Math.max(best, trigramSimilariteit(a, woorden[i]));
    if (i + 1 < woorden.length) best = Math.max(best, trigramSimilariteit(a, `${woorden[i]} ${woorden[i + 1]}`));
  }
  return best;
}

// ------------------------------------------------------------------------------------------------ uitleg
const UITLEG: Readonly<Record<ZoekUitlegCode, { uk: string; nl: string }>> = Object.freeze({
  exacte_titel: { uk: 'Назва точно збігається із запитом', nl: 'Titel is precies de zoekvraag' },
  volledige_zin: { uk: 'Повна фраза є в назві', nl: 'Volledige zin staat in de titel' },
  voorvoegsel: { uk: 'Назва починається із запиту', nl: 'Titel begint met de zoekvraag' },
  titelwoorden: { uk: 'Усі слова запиту є в назві', nl: 'Alle zoekwoorden staan in de titel' },
  tekst: { uk: 'Слова знайдено в тексті', nl: 'Woorden gevonden in de tekst' },
  omschrijving: { uk: 'Збіг в описі призначення', nl: 'Treffer in de omschrijving' },
  trefwoord: { uk: 'Збіг за ключовим словом джерела', nl: 'Treffer op een trefwoord van de bron' },
  synoniem: { uk: 'Знайдено за синонімом', nl: 'Gevonden via een synoniem' },
  vertaling: { uk: 'Знайдено за відповідником іншою мовою', nl: 'Gevonden via een vertaling' },
  translit: { uk: 'Збіг за транслітерацією/варіантом написання', nl: 'Treffer via transliteratie/spellingsvariant' },
  stam: { uk: 'Збіг за словоформою', nl: 'Treffer op een woordvorm' },
  vaag: { uk: 'Приблизний збіг (можлива помилка в написанні)', nl: 'Vage treffer (mogelijk een typefout)' },
  handeling: { uk: 'Це дія/сторінка сайту', nl: 'Dit is een handeling/pagina van de site' },
  vers: { uk: 'Нещодавно оновлено', nl: 'Recent bijgewerkt' },
  gedeeltelijk: { uk: 'Частковий збіг: лише частина слів запиту', nl: 'Gedeeltelijke treffer: slechts een deel van de zoekwoorden' },
});
export const uitlegTekst = (code: ZoekUitlegCode): ZoekUitleg => ({ code, ...UITLEG[code] });

export function uitlegVan(s: ZoekSignalen): ZoekUitleg[] {
  const codes: ZoekUitlegCode[] = [];
  if (s.exacteTitel) codes.push('exacte_titel');
  else if (s.volledigeZin) codes.push('volledige_zin');
  else if (s.voorvoegsel) codes.push('voorvoegsel');
  else if (s.titelwoorden) codes.push('titelwoorden');
  if (s.inTrefwoord) codes.push('trefwoord');
  if (s.inOmschrijving) codes.push('omschrijving');
  if (s.inTekst && !s.exacteTitel && !s.volledigeZin) codes.push('tekst');
  if (s.vertaling) codes.push('vertaling'); else if (s.synoniem) codes.push('synoniem');
  if (s.translit) codes.push('translit');
  if (s.stam && !s.exacteTitel) codes.push('stam');
  if (!s.ftsTreffer || (s.vaag >= BONUS.vaagDrempel && !s.exacteTitel && !s.volledigeZin && !s.voorvoegsel && s.dekking < 1)) codes.push('vaag');
  if (s.gedeeltelijk || (s.ftsTreffer && s.dekking < 1 && s.dekking < MIN_DEKKING)) codes.push('gedeeltelijk');
  if (s.handeling) codes.push('handeling');
  if (s.versheid > 0.7) codes.push('vers');
  if (!codes.length) codes.push(s.ftsTreffer ? 'tekst' : 'vaag');
  return codes.map(uitlegTekst);
}

// ------------------------------------------------------------------------------------------------ fragment met posities
export type VraagGroep = { token: string; leden: string[]; varianten: string[]; transposities: string[]; stam: string;
  /** Vooraf berekend (één keer per vraag, niet per woord van elk document): leden als Set, stammen van de eenwoordige leden → lid. */
  ledenSet?: Set<string>; ledenStam?: Map<string, string>; variantSet?: Set<string>; transSet?: Set<string> };
/** Vraaggroepen voor het markeren: literal token, synoniemen (zonder varianten), varianten, lichte stam. */
export const vraagGroepen = (tokens: readonly string[], groepen: readonly string[][]): VraagGroep[] =>
  tokens.map((token, i) => {
    const leden = (groepen[i] || [token]).filter(w => w !== token), vars = varianten(token), trans = transposities(token);
    const ledenStam = new Map<string, string>();
    for (const l of leden) if (!l.includes(' ') && l.length >= 4) { const st = lichteStam(l); if (!ledenStam.has(st)) ledenStam.set(st, l); }
    return { token, leden, varianten: vars, transposities: trans, stam: lichteStam(token), ledenSet: new Set(leden.filter(l => !l.includes(' '))), ledenStam, variantSet: new Set(vars), transSet: new Set(trans) };
  });

export type WoordTreffer = { van: number; tot: number; via: 'woord' | 'synoniem' | 'variant' | 'stam' | 'vaag'; groep: number; lid: string; cyrillisch: boolean };
const CYRILLISCH = /[\u0400-\u04ff]/;

/** Alle treffers van de vraaggroepen in één tekst (originele posities). */
export function woordTreffers(tekst: string, groepen: readonly VraagGroep[], vaag = true, max = 60): WoordTreffer[] {
  const uit: WoordTreffer[] = [];
  const re = /[\p{L}\p{N}]+(?:['’ʼ-][\p{L}\p{N}]+)*/gu;
  let m: RegExpExecArray | null;
  while ((m = re.exec(tekst)) && uit.length < max) {
    const w = zoekNorm(m[0]); if (w.length < 2) continue;
    const ws = lichteStam(w);
    for (let g = 0; g < groepen.length; g++) {
      const gr = groepen[g];
      let via: WoordTreffer['via'] | null = null, lid = gr.token;
      const ledenSet = gr.ledenSet || new Set(gr.leden.filter(l => !l.includes(' '))), ledenStam = gr.ledenStam, variantSet = gr.variantSet || new Set(gr.varianten), transSet = gr.transSet || new Set(gr.transposities);
      if (w === gr.token || w.startsWith(gr.token)) via = 'woord';
      else if (ledenSet.has(w)) { via = 'synoniem'; lid = w; }
      else if (variantSet.has(w) || gr.varianten.some(v => w.startsWith(v) && (lid = v))) { via = 'variant'; if (variantSet.has(w)) lid = w; }
      else if (ledenStam ? ledenStam.has(ws) : gr.leden.some(l => !l.includes(' ') && l.length >= 4 && lichteStam(l) === ws)) { via = 'synoniem'; lid = ledenStam?.get(ws) || ws; }   // woordvorm van een synoniem (скриньку ↔ скриньки)
      else if (gr.stam.length >= 3 && ws === gr.stam) via = 'stam';
      else if (transSet.has(w) || gr.transposities.some(v => w.startsWith(v) && (lid = v))) { via = 'vaag'; if (transSet.has(w)) lid = w; }
      else if (vaag && w.length >= 4 && gr.token.length >= 4 && Math.abs(w.length - gr.token.length) <= 2 && w[0] === gr.token[0] && trigramSimilariteit(w, gr.token) >= 0.5) via = 'vaag';   // goedkope voorselectie vóór de trigramvergelijking
      if (via) { uit.push({ van: m.index, tot: m.index + m[0].length, via, groep: g, lid, cyrillisch: CYRILLISCH.test(m[0]) }); break; }
    }
  }
  return uit;
}

/**
 * Fragment rond de eerste treffer met posities t.o.v. het fragment, plus wat de treffers zeggen (synoniem/vertaling/…).
 * Kiest de eerste bron (titel → omschrijving → tekst) waarin iets raakt; zonder treffer: het begin van de tekst.
 */
export function fragmentMetPosities(
  velden: { titel: string; omschrijving: string; tekst: string }, groepen: readonly VraagGroep[], vraagTaalCyrillisch: boolean, breedte = 320,
  extraGroepen: ReadonlyArray<ZoekSynoniemGroep> = [],
): { fragment: ZoekFragment; afgeleid: Pick<ZoekSignalen, 'synoniem' | 'vertaling' | 'translit' | 'stam' | 'inTekst' | 'inOmschrijving'> } {
  const afgeleid = { synoniem: false, vertaling: false, translit: false, stam: false, inTekst: false, inOmschrijving: false };
  const nota = (t: WoordTreffer[]) => {
    for (const x of t) {
      // Synoniem uit een ander schrift dan de vraag = vertaling (uk «пошта» → nl «e-mail»); zelfde schrift = synoniem.
      if (x.via === 'synoniem') { afgeleid.synoniem = true; if (x.cyrillisch !== vraagTaalCyrillisch && isBekendSynoniem(x.lid, extraGroepen)) afgeleid.vertaling = true; }
      if (x.via === 'variant') afgeleid.translit = true;
      if (x.via === 'stam') afgeleid.stam = true;
    }
  };
  const bronnen: Array<['titel' | 'omschrijving' | 'tekst', string]> = [['titel', velden.titel], ['omschrijving', velden.omschrijving], ['tekst', velden.tekst]];
  let gekozen: { bron: 'titel' | 'omschrijving' | 'tekst'; tekst: string; treffers: WoordTreffer[] } | null = null;
  for (const [bron, tekst] of bronnen) {
    if (!tekst) continue;
    const treffers = woordTreffers(tekst.slice(0, 3000), groepen);
    if (treffers.length) { nota(treffers); if (bron === 'tekst') afgeleid.inTekst = true; if (bron === 'omschrijving') afgeleid.inOmschrijving = true; if (!gekozen || bron !== 'titel') gekozen ??= { bron, tekst, treffers }; }
  }
  // Liever een fragment uit omschrijving/tekst dan de titel (die staat al op de kaart), tenzij alleen de titel raakt.
  if (gekozen?.bron === 'titel') {
    for (const [bron, tekst] of bronnen.slice(1)) { if (!tekst) continue; const t = woordTreffers(tekst.slice(0, 3000), groepen); if (t.length) { gekozen = { bron, tekst, treffers: t }; break; } }
  }
  if (!gekozen) {
    const basis = velden.omschrijving || velden.tekst || velden.titel || '';
    return { fragment: { tekst: basis.slice(0, breedte) + (basis.length > breedte ? '…' : ''), bron: velden.omschrijving ? 'omschrijving' : velden.tekst ? 'tekst' : 'titel', posities: [] }, afgeleid };
  }
  const eerste = gekozen.treffers[0].van;
  let start = Math.max(0, eerste - Math.floor(breedte / 3));
  if (start > 0) { const sp = gekozen.tekst.lastIndexOf(' ', start); if (sp > start - 40 && sp >= 0) start = sp + 1; }
  const eind = Math.min(gekozen.tekst.length, start + breedte);
  const prefix = start > 0 ? '…' : '';
  const stuk = gekozen.tekst.slice(start, eind);
  const posities = gekozen.treffers.filter(t => t.van >= start && t.tot <= eind).map(t => [t.van - start + prefix.length, t.tot - start + prefix.length] as [number, number]);
  return { fragment: { tekst: `${prefix}${stuk}${eind < gekozen.tekst.length ? '…' : ''}`, bron: gekozen.bron, posities }, afgeleid };
}

// ------------------------------------------------------------------------------------------------ geheugenpad (fallback)
export type Veld = [unknown, number];
/**
 * Signalen voor één rij in het geheugen (de «live»-terugval als de index voor deze lade leeg is, en de eenheidstests).
 * Benadert de SQL-kant: rank = gewogen aandeel van de velden waarin een groep raakt.
 */
export function signalenInGeheugen(input: {
  vraagNorm: string; groepen: readonly VraagGroep[]; titel: string; trefwoorden?: string; omschrijving?: string; tekst?: string; soort?: string; bijgewerktOp: number; nu?: number;
}): ZoekSignalen | null {
  const { groepen } = input; if (!groepen.length) return null;
  const velden: Array<[string, number]> = [[zoekNorm(input.tekst || ''), VELD_GEWICHTEN[0]], [zoekNorm(input.omschrijving || ''), VELD_GEWICHTEN[1]], [zoekNorm(input.trefwoorden || ''), VELD_GEWICHTEN[2]], [zoekNorm(input.titel), VELD_GEWICHTEN[3]]];
  const titel = velden[3][0];
  const raakt = (tekst: string, g: VraagGroep) => {
    if (!tekst) return false;
    const woorden = zoekWoorden(tekst);
    return woorden.some(w => w === g.token || w.startsWith(g.token) || g.leden.includes(w) || g.varianten.some(v => w === v || w.startsWith(v)) || (g.stam.length >= 3 && lichteStam(w) === g.stam));
  };
  let geraakt = 0, rank = 0, titelAlle = true, inTekst = false, inOmschrijving = false, inTrefwoord = false;
  for (const g of groepen) {
    let gw = 0; velden.forEach(([t, w], i) => { if (raakt(t, g)) { gw += w; if (i === 0) inTekst = true; if (i === 1) inOmschrijving = true; if (i === 2) inTrefwoord = true; } });
    if (gw > 0) geraakt++; else titelAlle = false;
    rank += gw / 2.0;
    if (!raakt(titel, g)) titelAlle = false;
  }
  const dekking = geraakt / groepen.length;
  const vaag = woordSimilariteit(input.vraagNorm, titel);
  if (!geraakt && vaag < BONUS.vaagDrempel) return null;
  if (groepen.length >= 2 && dekking < MIN_DEKKING && geraakt) return null;
  const titelWoorden = zoekWoorden(titel);
  const titelGeraakt = titelWoorden.filter(w => groepen.some(g => w === g.token || w.startsWith(g.token) || g.leden.includes(w) || g.varianten.some(v => w === v || w.startsWith(v)) || (g.stam.length >= 3 && lichteStam(w) === g.stam))).length;
  const s: ZoekSignalen = {
    titeldekking: titelWoorden.length ? titelGeraakt / titelWoorden.length : 0, soortrang: input.soort ? (SOORT_RANG[input.soort] || 0) : 0, groepen: groepen.length,
    dekking, rankSimple: Math.min(0.99, rank / groepen.length), rankStam: 0, exacteTitel: !!titel && titel === input.vraagNorm,
    volledigeZin: !!titel && titel !== input.vraagNorm && ` ${titel} `.includes(` ${input.vraagNorm} `), voorvoegsel: !!titel && titel !== input.vraagNorm && titel.startsWith(input.vraagNorm),
    titelwoorden: titelAlle && groepen.length > 0, handeling: !!input.soort && ACTIE_SOORTEN.has(input.soort as never) && groepen.length <= 4,
    versheid: versheid(input.bijgewerktOp, input.nu), vaag, ftsTreffer: geraakt > 0, inTekst, inOmschrijving, inTrefwoord,
  };
  return s;
}

/** Oude handtekening (Etap A+B) — 0–100 per rij zonder maximum-normalisatie; alleen nog voor oude aanroepers/tests. */
export function relevantie(input: { vraag: string; groepen: string[][]; titel: unknown; velden: Veld[]; bijgewerktOp: number; nu?: number }): number {
  const { groepen } = input; if (!groepen.length) return 0;
  const velden = input.velden.map(([v, w]) => [` ${zoekNorm(v)} `, w] as const), totaalGewicht = velden.reduce((s, [, w]) => s + w, 0) || 1;
  const titel = zoekNorm(input.titel), vraag = zoekNorm(input.vraag);
  const raak = (tekst: string, groep: string[]) => groep.some((t, i) => (i === 0 ? tekst.includes(t) : tekst.includes(` ${t}`)));
  let tekst = 0, titelGroepen = 0, ooit = false;
  for (const groep of groepen) {
    let g = 0; for (const [v, w] of velden) if (raak(v, groep)) g += w;
    if (g) ooit = true; tekst += Math.min(1, (2 * g) / totaalGewicht);
    if (raak(` ${titel} `, groep)) titelGroepen++;
  }
  if (!ooit) return 0;
  if (titel && titel === vraag) return 100;
  const s = GEWICHTEN.tekst * (tekst / groepen.length) + GEWICHTEN.trigram * trigramSimilariteit(titel, vraag) + GEWICHTEN.titel * (titelGroepen / groepen.length) + GEWICHTEN.versheid * versheid(input.bijgewerktOp, input.nu);
  return Math.max(1, Math.min(100, Math.round(100 * s)));
}
