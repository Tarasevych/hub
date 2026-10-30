// ZOEKKERN v2 — NORMALISATIE (Z1, 22.10.2026). Eén module voor server én browser; er is GEEN SQL-tweeling meer:
// app.zoek_norm (0093) brak bij datctype=C (lower() laat niet-ASCII staan, [[:alnum:]] gooit Cyrillisch weg: «Харків» →
// «arkiv»); 0100 verwijdert die functie en de genormaliseerde kolommen worden door Node geschreven.
//
// Volgorde in zoekNorm: NFC → kleine letters → Cyrillisch (uk/ru/bg) → Latijn → ł/ß/ø/æ/œ/đ/ı → NFKD zonder diacritica →
// alleen letters/cijfers/@._- → enkele spaties. BEWUST GEEN fonetische vouw (de oude kh→h, w→v, ij→y, j→y, y→i maakte
// «Jan de Wijk» tot «ian de vik»). Spellingsvarianten en surzhyk worden aan de VRAAGKANT opgevangen: varianten() maakt
// per token de alternatieven (y↔i, kh↔h, g↔h, ts↔c, …) die als OF-alternatieven in de tsquery gaan; typefouten vangt pg_trgm.
import { ZOEK_TALEN, type ZoekTaal } from './zoek-model';

/** Cyrillisch → Latijn. Eén zoekschema (geen paspoortschema) voor uk/ru/bg; uk «и»=y, «і»=i, ru «ы»=y, «и»=i. */
export const TRANSLIT: ReadonlyArray<readonly [string, string]> = Object.freeze([
  ['щ', 'shch'], ['ж', 'zh'], ['ч', 'ch'], ['ш', 'sh'], ['ц', 'ts'], ['ю', 'yu'], ['я', 'ya'], ['є', 'ye'], ['ї', 'yi'],
  ['х', 'kh'], ['а', 'a'], ['б', 'b'], ['в', 'v'], ['г', 'g'], ['ґ', 'g'], ['д', 'd'], ['е', 'e'], ['ё', 'e'], ['э', 'e'],
  ['з', 'z'], ['и', 'y'], ['ы', 'y'], ['і', 'i'], ['й', 'y'], ['к', 'k'], ['л', 'l'], ['м', 'm'], ['н', 'n'], ['о', 'o'],
  ['п', 'p'], ['р', 'r'], ['с', 's'], ['т', 't'], ['у', 'u'], ['ф', 'f'], ['ъ', ''], ['ь', ''], ['’', ''], ["'", ''], ['ʼ', ''],
  // Servisch/Macedonisch/Wit-Russisch komen zelden voor; wat ervan voorkomt, blijft leesbaar:
  ['ђ', 'dj'], ['ј', 'j'], ['љ', 'lj'], ['њ', 'nj'], ['ћ', 'c'], ['џ', 'dz'], ['ў', 'u'],
] as const);
/** Letters die NFKD niet ontleedt. */
export const LATIJN_EXTRA: ReadonlyArray<readonly [string, string]> = Object.freeze([
  ['ł', 'l'], ['ß', 'ss'], ['ø', 'o'], ['æ', 'ae'], ['œ', 'oe'], ['đ', 'd'], ['ı', 'i'], ['þ', 'th'], ['ð', 'd'],
] as const);
/** Bewaard voor oude importeurs: er wordt NIET meer gevouwen. */
export const VOUW: ReadonlyArray<readonly [string, string]> = Object.freeze([]);

const vervang = (s: string, paren: ReadonlyArray<readonly [string, string]>) => paren.reduce((t, [a, b]) => (a === b ? t : t.split(a).join(b)), s);
const CYRILLISCH = /[\u0400-\u04ff]/;

/** Volledige zoeknormalisatie (document én zoekvraag). Onafhankelijk van locale of database. */
export function zoekNorm(v: unknown, max = 200000): string {
  let s = String(v ?? '').replace(/\u0000/g, '').slice(0, max).normalize('NFC').toLocaleLowerCase('und');
  if (CYRILLISCH.test(s)) s = vervang(s, TRANSLIT);   // vóór NFKD: anders wordt «й/ї/ё» tot «и/і/е» ontleed
  s = vervang(s, LATIJN_EXTRA);
  s = s.normalize('NFKD').replace(/[\u0300-\u036f]/g, '');
  return s.replace(/[^\p{L}\p{N}@._-]+/gu, ' ').replace(/\s+/g, ' ').trim();
}

/** Woorden van een genormaliseerde tekst: ook @ . _ - zijn scheiders. */
export const zoekWoorden = (norm: string): string[] => norm.split(/[^\p{L}\p{N}]+/u).filter(Boolean);

/**
 * Stopwoorden (9 talen, klein en gesloten). Alleen uit de ZOEKVRAAG weggelaten en alleen als er andere tokens overblijven;
 * in documenten blijven ze staan (ts_rank telt ze nauwelijks mee).
 */
export const STOPWOORDEN: ReadonlySet<string> = new Set([
  // uk / ru / bg (genormaliseerd)
  'de', 'yak', 'shcho', 'tse', 'tsya', 'tsey', 'ta', 'i', 'y', 'u', 'v', 'na', 'z', 'iz', 'zi', 'do', 'po', 'za', 'dlya', 'pro', 'vid', 'pry', 'chy', 'abo', 'ale', 'ne', 'ni', 'moye', 'moya', 'miy', 'moyi', 'meni', 'ya', 'vy', 'ty', 'tut', 'tam',
  'khto', 'vse', 'vsi', 'use', 'usi', 'yakshcho', 'shchob', 'shche', 'odyn', 'odna', 'odnu', 'odne', 'mene', 'mozhna', 'treba', 'koly', 'kudy', 'yakyy', 'yaka', 'yake', 'bud', 'laska', 'svoyi', 'sviy', 'svoya',
  'kak', 'gde', 'chto', 'eto', 'etot', 'eta', 'ili', 'no', 'ot', 'dlya', 'pri', 'moy', 'moya', 'moe', 'mne', 'vy', 'kde', 'kakvo', 'tova', 'sas', 'ot', 'kam',
  'kto', 'esli', 'yeshche', 'eshche', 'mozhno', 'nuzhno', 'kogda', 'kuda', 'kakoy', 'kakaya', 'svoy', 'svoyu', 'odin', 'odnu', 'koy', 'ako', 'oshte', 'moya', 'moyat',
  // nl
  'de', 'het', 'een', 'en', 'of', 'van', 'in', 'op', 'te', 'is', 'hoe', 'waar', 'wat', 'mijn', 'ik', 'je', 'naar', 'met', 'voor', 'om', 'bij', 'dat', 'die', 'dit', 'kan', 'wil',
  'wie', 'heeft', 'nog', 'als', 'zijn', 'haar', 'hun', 'er', 'ook', 'wanneer', 'welke', 'moet', 'graag', 'anders',
  // en
  'the', 'a', 'an', 'and', 'or', 'of', 'in', 'on', 'to', 'is', 'how', 'where', 'what', 'my', 'i', 'you', 'for', 'with', 'at', 'by', 'this', 'that', 'can', 'do',
  'who', 'has', 'have', 'if', 'when', 'which', 'one', 'more', 'another', 'need', 'want', 'please', 'your', 'our',
  // de
  'der', 'die', 'das', 'ein', 'eine', 'und', 'oder', 'von', 'im', 'auf', 'zu', 'ist', 'wie', 'wo', 'was', 'mein', 'meine', 'ich', 'fur', 'mit', 'bei', 'den', 'dem',
  // fr
  'le', 'la', 'les', 'un', 'une', 'et', 'ou', 'du', 'des', 'dans', 'sur', 'est', 'comment', 'ou', 'quoi', 'mon', 'ma', 'mes', 'je', 'pour', 'avec', 'au', 'aux', 'ce', 'cette',
  // pl
  'jak', 'gdzie', 'co', 'to', 'jest', 'lub', 'oraz', 'moj', 'moja', 'moje', 'w', 'we', 'na', 'do', 'dla', 'o', 'ze', 'od', 'przy',
  // ro
  'cum', 'unde', 'ce', 'este', 'sau', 'si', 'un', 'o', 'al', 'a', 'din', 'pe', 'la', 'cu', 'pentru', 'meu', 'mea', 'mele', 'eu',
]);

/** Unieke zoektokens (≥2 tekens, max 12). Zonder stopwoorden, tenzij er dan niets overblijft. */
export function zoekTokens(v: unknown, max = 12): string[] {
  const alle = [...new Set(zoekWoorden(zoekNorm(v, 300)).filter(t => t.length >= 2))];
  const zonder = alle.filter(t => !STOPWOORDEN.has(t));
  return (zonder.length ? zonder : alle).slice(0, max);
}

/** Veilig voor to_tsquery: alleen [a-z0-9]; al het andere wordt een scheiding. */
export const tsToken = (t: string): string => t.replace(/[^a-z0-9]+/g, '');

// ------------------------------------------------------------------------------------------------ varianten (vraagkant)
/** Spellingsparen die in de praktijk door elkaar lopen (surzhyk uk↔ru, Latijnse transliteraties, bg «щ»=sht). */
const VARIANT_REGELS: ReadonlyArray<readonly [string, string, boolean]> = Object.freeze([
  // [van, naar, ookOmgekeerd]. Omgekeerd alleen waar dat een échte spelling is (e→ye of f→ph overal zou onzin maken).
  ['shch', 'sch', true], ['shch', 'sht', true], ['kh', 'h', true], ['ts', 'c', true], ['ye', 'e', false], ['yi', 'i', false], ['yu', 'iu', true], ['ya', 'ia', true], ['zh', 'j', true],
  ['y', 'i', true], ['g', 'h', true], ['w', 'v', true], ['ii', 'i', false], ['ij', 'y', true], ['ph', 'f', false], ['ck', 'k', false], ['x', 'ks', true], ['c', 'k', true],
]);
/**
 * Alternatieve spellingen van één genormaliseerd token (voor de ZOEKVRAAG, nooit voor het document). Elke regel in beide
 * richtingen, één regel per variant (geen combinaties), max `max`. 'kharkiv' → ['harkiv','kharkyv','kharkiw',…].
 */
export function varianten(token: string, max = 8): string[] {
  const uit = new Set<string>();
  const t = String(token || '');
  if (t.length < 3) return [];
  for (const [a, b, omgekeerd] of VARIANT_REGELS) {
    for (const [van, naar] of (omgekeerd ? [[a, b], [b, a]] : [[a, b]]) as ReadonlyArray<readonly [string, string]>) {
      if (!t.includes(van)) continue;
      const v = t.split(van).join(naar);
      if (v !== t && v.length >= 2) uit.add(v);
      // ook alleen de eerste voorkomens vervangen (Kyiv → Kiyv / Kyyiv: één letter tegelijk)
      const eerste = t.replace(van, naar);
      if (eerste !== t && eerste !== v && eerste.length >= 2) uit.add(eerste);
      if (uit.size >= max) return [...uit].slice(0, max);
    }
  }
  return [...uit].slice(0, max);
}

// ------------------------------------------------------------------------------------------------ lichte stam
/**
 * Lichte achtervoegselregels in LATIJNSE vorm voor talen zonder PostgreSQL-stemmer (uk, bg, pl) en als extra kanaal voor
 * ru. Gesloten lijst, langste eerst; alleen op woorden ≥ 5 tekens en alleen als er ≥ 3 tekens overblijven. GRENZEN: geen
 * stamwisseling (кінь/коня, друг/друзі), geen voorvoegsels, geen woordenboek, geen werkwoordsvervoeging buiten deze lijst.
 */
const STAM_SUFFIXEN: readonly string[] = Object.freeze([
  'ovanymy', 'ovanykh', 'ovanyy', 'ovanyi', 'uvannya', 'uvannia', 'ovannya', 'ennya', 'innya', 'annya', 'ennia', 'annia', 'uvaty', 'uvaly',
  'yamy', 'iamy', 'yakh', 'iakh', 'ymy', 'imy', 'ykh', 'ikh', 'amy', 'ami', 'akh', 'oyu', 'eyu', 'ovi', 'evi', 'ovy', 'evy', 'oho', 'eho', 'omu', 'emu',
  'iyu', 'iya', 'iye', 'iyi', 'yyu', 'yya', 'ami', 'ach', 'ech', 'ich', 'ych', 'owie', 'owi', 'ami', 'ego', 'emu', 'ych', 'ich', 'ymi', 'imi',
  'ty', 'ti', 'la', 'lo', 'ly', 'ov', 'ev', 'iv', 'yv', 'yi', 'ii', 'ya', 'ia', 'yu', 'iu', 'ye', 'ie', 'oy', 'ey', 'ut', 'at', 'yt', 'it', 'sia', 'sya',
  'a', 'y', 'i', 'u', 'o', 'e',
]);
export function lichteStam(token: string): string {
  const t = String(token || '');
  if (t.length < 4 || /\d/.test(t)) return t;
  for (const s of STAM_SUFFIXEN) if (t.length - s.length >= 3 && t.endsWith(s)) return t.slice(0, t.length - s.length);
  return t;
}
/** Lichte stam van een (meerwoordig) synoniem: per woord. */
export const lichteStamWoorden = (s: string): string => zoekWoorden(s).map(lichteStam).join(' ');

/** Aangrenzende omzettingen van letters («Калнедар» → «календар»): voor tokens ≥ 5 tekens, max 8. Typefout-kanaal. */
export function transposities(token: string, max = 8): string[] {
  const t = String(token || ''); if (t.length < 5 || t.length > 24) return [];
  const uit: string[] = [];
  for (let i = 0; i + 1 < t.length && uit.length < max; i++) { if (t[i] === t[i + 1]) continue; uit.push(t.slice(0, i) + t[i + 1] + t[i] + t.slice(i + 2)); }
  return uit;
}
/** Extra zoektokens uit samengestelde namen: «mijn-ruimte-backup.timer» → mijn, ruimte, backup, timer (delen die geen los woord al zijn). */
export function samengesteldeDelen(norm: string): string[] {
  const los = new Set(norm.split(' ').filter(Boolean));
  const uit = new Set<string>();
  for (const w of los) if (/[-._@]/.test(w)) for (const d of w.split(/[-._@]+/)) if (d.length >= 2 && !los.has(d)) uit.add(d);
  return [...uit];
}
/** Lichte stam-oude ondergrens was 5; sinds v1.2 is het 4 (мову/мови → mov, teми/тема → tem). */
/** Hele genormaliseerde tekst → lichte stammen (voor de kolom stam_norm en de stam-tsquery). */
export const lichteStamTekst = (norm: string, max = 100000): string => zoekWoorden(norm.slice(0, max)).map(lichteStam).join(' ');

// ------------------------------------------------------------------------------------------------ taal raden
const STOP_PER_TAAL: Readonly<Record<Exclude<ZoekTaal, 'uk' | 'ru' | 'bg'>, readonly string[]>> = Object.freeze({
  nl: ['de', 'het', 'een', 'en', 'van', 'ik', 'je', 'niet', 'met', 'voor', 'naar', 'ook', 'zijn', 'wordt', 'deze', 'bij', 'op'],
  en: ['the', 'and', 'you', 'that', 'with', 'this', 'for', 'are', 'from', 'your', 'have', 'not', 'will', 'can', 'was'],
  de: ['der', 'die', 'das', 'und', 'ist', 'nicht', 'mit', 'sich', 'auch', 'ich', 'sie', 'ein', 'eine', 'wird', 'bei', 'fur', 'zu'],
  fr: ['le', 'la', 'les', 'et', 'est', 'pas', 'vous', 'pour', 'une', 'des', 'dans', 'que', 'qui', 'sur', 'avec', 'nous'],
  pl: ['nie', 'jest', 'sie', 'tak', 'jak', 'ale', 'czy', 'tego', 'przez', 'jego', 'tym', 'oraz', 'dla', 'juz', 'tylko'],
  ro: ['si', 'este', 'sunt', 'pentru', 'care', 'din', 'sau', 'mai', 'nu', 'ca', 'cu', 'la', 'pe', 'dar', 'acest'],
});
/** Taal van een tekst raden: schrift + stopwoorden. '' = onbekend (te kort of gemengd). */
export function taalRaden(v: unknown): ZoekTaal | '' {
  const s = String(v ?? '').slice(0, 4000).toLocaleLowerCase('und');
  if (CYRILLISCH.test(s)) {
    if (/[іїєґ]/.test(s)) return 'uk';
    if (/[ыэ]/.test(s)) return 'ru';
    if (/ъ/.test(s)) return 'bg';
    // Geen onderscheidende letters: stopwoorden (bg «това/със/които/има», ru «это/что/или/для»).
    const w = new Set(s.split(/[^\u0400-\u04ff]+/).filter(Boolean));
    const bg = ['това', 'със', 'които', 'който', 'какво', 'тези', 'има', 'няма'].filter(x => w.has(x)).length;
    const ru = ['это', 'что', 'или', 'как', 'для', 'есть', 'нет', 'уже'].filter(x => w.has(x)).length;
    if (bg > ru) return 'bg';
    return /[\u0400-\u04ff]{3,}/.test(s) ? 'ru' : '';
  }
  const woorden = zoekWoorden(zoekNorm(s));
  if (woorden.length < 3) return '';
  let beste: ZoekTaal | '' = '', besteN = 0;
  for (const taal of Object.keys(STOP_PER_TAAL) as Array<keyof typeof STOP_PER_TAAL>) {
    const set = new Set(STOP_PER_TAAL[taal]);
    const n = woorden.filter(w => set.has(w)).length;
    if (n > besteN) { besteN = n; beste = taal; }
  }
  return besteN >= 2 ? beste : '';
}

export { ZOEK_TALEN };
