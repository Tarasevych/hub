import { adresVan } from './mail-afzenders'; // SEC-002 (g10c-toets-1)
// Bronnen bij AI-punten in een brief (pakket 3 «Adaptive Mail Canvas», 24.10.2026). Puur: geen DOM, geen netwerk — dezelfde regels
// in de browser (src/mail/WatNodigBlok.tsx, src/mail/BronBlad.tsx, src/mail/VergelijkTabel.tsx) en op de server
// (backend/ai-vertaling-routes.ts, modus 'acties').
//
// Макет (власник): «ШІ-блок «Що від вас потрібно?»: кожен пункт має чип джерела «лист 3 · §3» і, якщо є, термін; «Коротко» — теж
// із джерелами; підвал: «Кожен пункт знайдено дослівно в оригіналі (3 з 3)» і хто склав: модель або «простий розбір» без моделі»;
// аркуш «Звідки це?»: «Знайдено дослівно в оригіналі. Дату й термін звірено з текстом листа, а не з перекладом».
//
// Daarom:
//   - een brief wordt in alinea's verdeeld (§1, §2, …) op één manier, zodat chip, vergelijkingstabel en «Показати абзац у листі»
//     hetzelfde nummer bedoelen;
//   - een punt van het model telt alleen als zijn citaat LETTERLIJK in de originele alinea staat (spaties, aanhalingstekens en
//     streepjes gelijkgetrokken, hoofdletters niet van belang; «…» in het citaat = de stukken in volgorde in dezelfde alinea);
//     verkeerd genummerd maar wel gevonden = gevonden, met het juiste nummer;
//   - een termijn telt alleen als hij in die alinea van het ORIGINEEL staat (niet in een vertaling): eerst als geheel, anders elk
//     getal, elke maand en elke weekdag ervan;
//   - zonder model: «простий розбір» — vragen, verzoeken en termijnen als letterlijke zinnen uit de brief (dus altijd gevonden).
//     Niets wordt verzonnen: geen zin, dan geen punt.

/** Een alinea van een brief: brief = volgnummer in het gesprek (1 = oudste), nr = alinea in die brief (1, 2, …). */
export type BronAlinea = { brief: number; nr: number; tekst: string };
/** Waar een citaat staat: de alinea en de plaats van het citaat in de GENORMALISEERDE alinea. */
export type BronPlek = { brief: number; nr: number; van: number; tot: number };
export type PuntSoort = 'vraag' | 'verzoek' | 'termijn' | 'feit';
/** Een punt zoals het model (of het eenvoudige ontleden) het geeft. */
export type AiPunt = { id: string; tekst: string; citaat: string; brief?: number; alinea?: number; termijn?: string; soort?: PuntSoort };
export type TermijnStaat = 'in-bron' | 'niet-in-bron' | 'geen';
export type GecontroleerdPunt = AiPunt & {
  status: 'letterlijk' | 'niet-gevonden';
  bron: BronPlek | null;
  /** Het model gaf een ander alineanummer dan waar het citaat echt staat (het nummer is verbeterd). */
  verplaatst: boolean;
  termijnStaat: TermijnStaat;
};
export type Opbouw = 'model' | 'eenvoudig';

export const MIN_CITAAT = 8;

// ------------------------------------------------------------------ normaliseren

const ENKEL = /[‘’‚‛′`´]/g;
const DUBBEL = /[“”„‟″«»]/g;
const STREEP = /[‐-―−]/g;
const ONZICHTBAAR = /[​-‍⁠﻿­]/g;
const SPATIE = /[\s  -   　]+/g;

/** Gelijktrekken voor «letterlijk»: Unicode-vorm, aanhalingstekens, streepjes, beletselteken, onzichtbare tekens, spaties, kleine letters. */
export function normaliseer(s: string): string {
  return String(s ?? '').normalize('NFKC').replace(ONZICHTBAAR, '').replace(ENKEL, "'").replace(DUBBEL, '"').replace(STREEP, '-')
    .replace(/…/g, '...').replace(SPATIE, ' ').trim().toLocaleLowerCase();
}

/** Een citaat zonder de rand: aanhalingstekens, beletseltekens en leestekens aan begin en eind tellen niet. */
function citaatKern(s: string): string {
  return normaliseer(s).replace(/^[\s"'.,;:!?()[\]-]+|[\s"'.,;:!?()[\]-]+$/g, '').replace(/^\.\.\.|\.\.\.$/g, '').trim();
}

// ------------------------------------------------------------------ alinea's

/** Kop van een geciteerd vorig bericht («On … wrote:», «Op … schreef …:», «… пише:», «-----Original Message-----», …). */
const CITAATKOP = /^(?:on\b.{4,200}\bwrote:?|op\b.{4,200}\bschreef\b.{0,120}:?|am\b.{4,200}\bschrieb\b.{0,120}:?|le\b.{4,200}\ba écrit\s*:?|.{2,200}(?<![\p{L}\p{N}])(?:пише|написав|написала|писав|писала)\s*:|-{2,}\s*(?:original message|oorspronkelijk bericht|ursprüngliche nachricht|message d'origine|вихідне повідомлення|пересланий лист|forwarded message|doorgestuurd bericht)\s*-{2,})\s*$/iu;
/** «Van: … / Verzonden: …» (Outlook) — vanaf hier is het een geciteerd vorig bericht. */
const OUTLOOKKOP = /^(?:from|van|von|de|від|od)\s*:\s*\S/i;
const OUTLOOKVOLG = /^(?:sent|verzonden|gesendet|envoyé|надіслано|відправлено|wysłano|date|datum)\s*:/i;

/**
 * Verdeel de platte tekst van één brief in alinea's: tot het geciteerde vorige bericht (en zonder regels met «>»), gescheiden door
 * een lege regel, regels binnen een alinea samengevoegd. Handtekening («-- ») hoort er niet meer bij.
 */
export function alineasVan(tekst: string): string[] {
  const regels = String(tekst ?? '').replace(/\r\n?/g, '\n').split('\n');
  const eigen: string[] = [];
  for (let i = 0; i < regels.length; i++) {
    const r = regels[i];
    const kaal = r.trim();
    if (kaal === '--' || r === '-- ') break; // handtekening
    if (CITAATKOP.test(kaal)) break;
    if (OUTLOOKKOP.test(kaal) && regels.slice(i + 1, i + 4).some((v) => OUTLOOKVOLG.test(v.trim()))) break;
    if (/^\s*>/.test(r)) continue;
    eigen.push(r);
  }
  const uit: string[] = [];
  let huidig: string[] = [];
  const sluit = () => { const a = huidig.join(' ').replace(SPATIE, ' ').trim(); if (a) uit.push(a); huidig = []; };
  // Geen enkele lege regel (HTML-brief: de server maakt van </p> en <br> één regeleinde) = elke regel is een alinea.
  const zonderLeeg = !eigen.some((r) => !r.trim()) && eigen.filter((r) => r.trim()).length > 1;
  for (const r of eigen) { if (!r.trim()) sluit(); else { huidig.push(r.trim()); if (zonderLeeg) sluit(); } }
  sluit();
  return uit;
}

/** Alinea's van een heel gesprek: per brief (1 = oudste) en per alinea (1, 2, …). */
export function gespreksAlineas(brieven: ReadonlyArray<{ brief: number; tekst: string }>): BronAlinea[] {
  const uit: BronAlinea[] = [];
  for (const b of brieven) alineasVan(b.tekst).forEach((tekst, i) => uit.push({ brief: b.brief, nr: i + 1, tekst }));
  return uit;
}

/** «лист 3 · §2» / «bericht 3 · §2» — het label van de bronchip. */
export function bronLabel(lang: 'uk' | 'nl', plek: { brief: number; nr: number }): string {
  return `${lang === 'uk' ? 'лист' : 'bericht'} ${plek.brief} · §${plek.nr}`;
}

/** De alinea's van het gesprek als tekst voor het model: «[3.2] …» per regel (brief.alinea). */
export function alineasVoorModel(alineas: readonly BronAlinea[]): string {
  return alineas.map((a) => `[${a.brief}.${a.nr}] ${a.tekst}`).join('\n');
}

// ------------------------------------------------------------------ letterlijk zoeken

/** Zoek de stukken van een citaat (gescheiden door «…») in volgorde in één genormaliseerde alinea. */
function inAlinea(stukken: readonly string[], alinea: string): { van: number; tot: number } | null {
  let vanaf = 0, begin = -1;
  for (const stuk of stukken) {
    const i = alinea.indexOf(stuk, vanaf);
    if (i < 0) return null;
    if (begin < 0) begin = i;
    vanaf = i + stuk.length;
  }
  return begin < 0 ? null : { van: begin, tot: vanaf };
}

/**
 * Staat dit citaat letterlijk in het gesprek? Eerst in de alinea die het model noemde, dan overal. Te kort (minder dan 8 tekens of
 * één woord) telt nooit: «так» staat in elke brief.
 */
export function zoekCitaat(citaat: string, alineas: readonly BronAlinea[], voorkeur?: { brief?: number; nr?: number }): BronPlek | null {
  const kern = citaatKern(citaat);
  const stukken = kern.split(/\s*\.\.\.\s*/).map((s) => s.trim()).filter((s) => s.length >= 3);
  const lengte = stukken.join(' ').length;
  if (!stukken.length || lengte < MIN_CITAAT || stukken.join(' ').split(' ').length < 2) return null;
  const volgorde = voorkeur?.brief && voorkeur?.nr
    ? [...alineas.filter((a) => a.brief === voorkeur.brief && a.nr === voorkeur.nr), ...alineas.filter((a) => !(a.brief === voorkeur.brief && a.nr === voorkeur.nr))]
    : [...alineas];
  for (const a of volgorde) {
    const plek = inAlinea(stukken, normaliseer(a.tekst));
    if (plek) return { brief: a.brief, nr: a.nr, ...plek };
  }
  return null;
}

// ------------------------------------------------------------------ termijnen en datums

const MAANDEN: Record<string, number> = {
  // nl
  januari: 1, februari: 2, maart: 3, april: 4, mei: 5, juni: 6, juli: 7, augustus: 8, september: 9, oktober: 10, november: 11, december: 12,
  jan: 1, feb: 2, mrt: 3, apr: 4, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, okt: 10, nov: 11, dec: 12,
  // en
  january: 1, february: 2, march: 3, may: 5, june: 6, july: 7, august: 8, october: 10, mar: 3, oct: 10,
  // uk (родовий і називний)
  січня: 1, лютого: 2, березня: 3, квітня: 4, травня: 5, червня: 6, липня: 7, серпня: 8, вересня: 9, жовтня: 10, листопада: 11, грудня: 12,
  січень: 1, лютий: 2, березень: 3, квітень: 4, травень: 5, червень: 6, липень: 7, серпень: 8, вересень: 9, жовтень: 10, листопад: 11, грудень: 12,
  // de, fr, pl (de meest gebruikte vormen)
  januar: 1, februar: 2, märz: 3, mai: 5, dezember: 12, janvier: 1, février: 2, mars: 3, avril: 4, juin: 6, juillet: 7, août: 8,
  septembre: 9, octobre: 10, novembre: 11, décembre: 12, stycznia: 1, lutego: 2, marca: 3, kwietnia: 4, maja: 5, czerwca: 6, lipca: 7,
  sierpnia: 8, września: 9, października: 10, listopada: 11, grudnia: 12,
};
const WEEKDAGEN = ['maandag', 'dinsdag', 'woensdag', 'donderdag', 'vrijdag', 'zaterdag', 'zondag', 'monday', 'tuesday', 'wednesday',
  'thursday', 'friday', 'saturday', 'sunday', 'понеділок', 'понеділка', 'вівторок', 'вівторка', 'середа', 'середу', 'середи', 'четвер',
  'четверга', "п'ятниця", "п'ятницю", "п'ятниці", 'субота', 'суботу', 'суботи', 'неділя', 'неділю', 'неділі', 'montag', 'dienstag',
  'mittwoch', 'donnerstag', 'freitag', 'samstag', 'sonntag', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche',
  'poniedziałek', 'wtorek', 'środa', 'czwartek', 'piątek', 'sobota', 'niedziela'];
const MAAND_RE = Object.keys(MAANDEN).sort((a, b) => b.length - a.length).join('|');
const WEEKDAG_RE = [...WEEKDAGEN].sort((a, b) => b.length - a.length).join('|');

/** Een datum in een zin: «woensdag 28 oktober (2026)», «28 жовтня», «October 28», «28.10(.2026)», «28/10/2026», «2026-10-28». */
export const DATUM_RE = new RegExp(
  `(?:(?:${WEEKDAG_RE}),?\\s+)?(?:\\d{1,2}\\.?\\s+(?:${MAAND_RE})\\.?(?:\\s+\\d{4})?|(?:${MAAND_RE})\\.?\\s+\\d{1,2}(?:st|nd|rd|th)?(?:,?\\s+\\d{4})?|\\d{1,2}[./]\\d{1,2}(?:[./]\\d{2,4})?|\\d{4}-\\d{2}-\\d{2})`,
  'giu',
);
/** Een tijd: «om 10:00», «о 10:00», «at 10:00», «10u30», «10.30 uur», «10 uur». */
export const TIJD_RE = /(?:\b(?:om|о|об|at|um|à|o)\s+)?(\d{1,2})(?:[:.](\d{2})|u(\d{2})?)(?:\s*(?:uur|h|год\.?))?|\b(\d{1,2})\s+(?:uur|годин[иі]?)\b/giu;
/** «vóór / uiterlijk / до / не пізніше / by / before / bis / avant / do / przed» + datum = een termijn. */
const TERMIJN_VOOR = /(?<![\p{L}\p{N}])(?:vóór|voor|uiterlijk|ten laatste|tegen|до|не пізніше|не пізніш|by|before|no later than|until|bis|spätestens|avant|au plus tard|do|przed|najpóźniej)\s*$/iu;

/** De woorden van een termijn die in de bron moeten staan: getallen, maanden en weekdagen (genormaliseerd). */
export function termijnWoorden(termijn: string): string[] {
  const n = normaliseer(termijn);
  const uit = new Set<string>();
  for (const m of n.matchAll(/\d+/g)) uit.add(String(Number(m[0])));
  for (const w of n.split(/[^\p{L}']+/u)) if (w && (w in MAANDEN || WEEKDAGEN.includes(w))) uit.add(w);
  return [...uit];
}

/** Staat de termijn in deze ORIGINELE alinea? Als geheel, of anders elk getal/maand/weekdag ervan. */
export function termijnInBron(termijn: string, alinea: string): TermijnStaat {
  const t = citaatKern(termijn);
  if (!t) return 'geen';
  const a = normaliseer(alinea);
  if (a.includes(t)) return 'in-bron';
  const woorden = termijnWoorden(termijn);
  if (!woorden.length) return 'niet-in-bron';
  const getallen = new Set([...a.matchAll(/\d+/g)].map((m) => String(Number(m[0]))));
  const woordenA = new Set(a.split(/[^\p{L}']+/u));
  return woorden.every((w) => (/^\d+$/.test(w) ? getallen.has(w) : woordenA.has(w))) ? 'in-bron' : 'niet-in-bron';
}

/**
 * Een datum (en tijd) uit een termijn of zin, ten opzichte van `ref` (de ontvangstdatum): zonder jaar het jaar van `ref`, of het
 * volgende als de datum dan meer dan 30 dagen vóór `ref` zou liggen. dd.mm = dag.maand (Europees). Zonder tijd: hele dag.
 */
export function datumUit(tekst: string, ref: number): { start: number; heleDag: boolean } | null {
  const s = normaliseer(tekst);
  DATUM_RE.lastIndex = 0;
  const m = DATUM_RE.exec(s);
  if (!m) return null;
  const d = m[0];
  const refD = new Date(ref || Date.now());
  let jaar = NaN, maand = NaN, dag = NaN;
  let r: RegExpExecArray | null;
  if ((r = /(\d{4})-(\d{2})-(\d{2})/.exec(d))) { jaar = +r[1]; maand = +r[2]; dag = +r[3]; }
  else if ((r = /(\d{1,2})[./](\d{1,2})(?:[./](\d{2,4}))?/.exec(d))) { dag = +r[1]; maand = +r[2]; jaar = r[3] ? (r[3].length === 2 ? 2000 + +r[3] : +r[3]) : NaN; }
  else {
    const woorden = d.split(/[^\p{L}\d']+/u).filter(Boolean);
    for (const w of woorden) if (w in MAANDEN && Number.isNaN(maand)) maand = MAANDEN[w];
    const getallen = (d.match(/\d+/g) || []).map(Number);
    dag = getallen.find((g) => g >= 1 && g <= 31) ?? NaN;
    jaar = getallen.find((g) => g >= 1900) ?? NaN;
  }
  if (!(maand >= 1 && maand <= 12) || !(dag >= 1 && dag <= 31)) return null;
  let heleDag = true, uur = 0, minuut = 0;
  const na = s.slice((m.index || 0) + d.length, (m.index || 0) + d.length + 24);
  TIJD_RE.lastIndex = 0;
  const tijd = TIJD_RE.exec(na) || (() => { TIJD_RE.lastIndex = 0; return TIJD_RE.exec(s.slice(0, m.index || 0).slice(-16)); })();
  if (tijd) {
    const h = Number(tijd[1] ?? tijd[4]), mi = Number(tijd[2] ?? tijd[3] ?? 0);
    if (h >= 0 && h <= 23 && mi >= 0 && mi <= 59) { heleDag = false; uur = h; minuut = mi; }
  }
  if (Number.isNaN(jaar)) {
    jaar = refD.getFullYear();
    const kandidaat = new Date(jaar, maand - 1, dag).getTime();
    if (kandidaat < refD.getTime() - 30 * 864e5) jaar += 1;
  }
  const datum = new Date(jaar, maand - 1, dag, uur, minuut, 0, 0);
  if (datum.getMonth() !== maand - 1) return null; // 31 februari
  return { start: datum.getTime(), heleDag };
}

// ------------------------------------------------------------------ controleren

/**
 * Controleer de punten van het model tegen het ORIGINELE gesprek: letterlijk citaat (anders 'niet-gevonden', zonder bron) en een
 * termijn alleen als hij in de bronalinea staat (anders wordt hij weggelaten: `termijn` leeg, `termijnStaat` 'niet-in-bron').
 */
export function controleerPunten(punten: readonly AiPunt[], alineas: readonly BronAlinea[]): GecontroleerdPunt[] {
  return punten.map((p) => {
    const bron = zoekCitaat(p.citaat, alineas, { brief: p.brief, nr: p.alinea });
    const verplaatst = !!bron && !!p.brief && !!p.alinea && (bron.brief !== p.brief || bron.nr !== p.alinea);
    let termijnStaat: TermijnStaat = 'geen';
    let termijn = String(p.termijn || '').trim();
    if (termijn) {
      const alinea = bron ? alineas.find((a) => a.brief === bron.brief && a.nr === bron.nr)?.tekst || '' : '';
      termijnStaat = bron ? termijnInBron(termijn, alinea) : 'niet-in-bron';
      if (termijnStaat !== 'in-bron') termijn = '';
    }
    return { ...p, termijn, status: bron ? 'letterlijk' : 'niet-gevonden', bron, verplaatst, termijnStaat };
  });
}

/** «Кожен пункт знайдено дослівно в оригіналі (3 з 3)»: hoeveel punten letterlijk gevonden zijn. */
export function telGevonden(punten: readonly GecontroleerdPunt[]): { gevonden: number; totaal: number } {
  return { gevonden: punten.filter((p) => p.status === 'letterlijk').length, totaal: punten.length };
}

// ------------------------------------------------------------------ eenvoudig ontleden (zonder model)

/** Woordgrenzen die ook voor het Oekraïens en voor ę/ź gelden (\\b van JavaScript kent alleen A–Z, 0–9 en _). */
const WB = '(?<![\\p{L}\\p{N}_])', WE = '(?![\\p{L}\\p{N}_])';
/** Verzoeken in de talen van de post (de zin zelf wordt het punt; er wordt niets vertaald of herschreven). */
const VERZOEK = new RegExp([
  // nl
  `${WB}(?:kunt u|kan u|kun je|kan je|wilt u|wil je|zou u|zou je|gelieve|vergeet (?:niet|u niet)|dient u|moet u|u moet|breng|meebrengen|stuur|bezorg|bevestig|laat (?:me|mij|ons) (?:iets )?weten|neem contact)${WE}`,
  `${WB}graag${WE}(?! gedaan)`,
  // en
  `${WB}(?:please|kindly|could you|can you|would you|let me know|make sure|remember to|you need to|you must|you should|confirm|bring)${WE}`,
  // uk
  `${WB}(?:будь ласка|прошу|просимо|чи можете|чи могли б|потрібно|необхідно|треба|надішліть|підтвердіть|візьміть|не забудьте|повідомте|дайте знати)${WE}`,
  // de, fr, pl
  `${WB}(?:bitte|könnten sie|können sie|würden sie|senden sie|bestätigen sie|vergessen sie nicht)${WE}`,
  `${WB}(?:veuillez|merci de|pourriez-vous|pouvez-vous|n'oubliez pas|confirmez)${WE}`,
  `${WB}(?:proszę|prosimy|należy|potwierdź|prześlij)${WE}`,
].join('|'), 'iu');
const BIJLAGE = new RegExp(`${WB}(?:in bijlage|als bijlage|bijgevoegd|in de bijlage|attached|attachment|enclosed|у вкладенні|у додатку|додаю|im anhang|anbei|en pièce jointe|ci-joint|w załączniku)${WE}`, 'iu');
const BEDRAG = new RegExp(`(?:€|\\$|£|₴|${WB}(?:eur|usd|uah|gbp|грн)${WE}\\.?)\\s?\\d[\\d\\s.,]*|${WB}\\d[\\d\\s.,]*\\s?(?:€|(?:eur|euro|usd|uah|грн|євро|доларів|гривень|гривні)${WE})`, 'iu');
const GROET = new RegExp(`^(?:met vriendelijke groet(?:en)?|vriendelijke groeten|groeten|kind regards|best regards|regards|sincerely|з повагою|з найкращими побажаннями|mit freundlichen grüßen|cordialement|z poważaniem)${WE}`, 'iu');

/** Zinnen van een alinea (op . ! ? gevolgd door spatie; tijden als 10:00 blijven heel). */
export function zinnenVan(alinea: string): string[] {
  return String(alinea ?? '').split(/(?<=[.!?…])\s+(?=[\p{Lu}\p{N}"«„'(])/u).map((s) => s.trim()).filter(Boolean);
}

/** Een termijn in een zin: «vóór maandag 26 oktober», «до 26 жовтня», «by October 26» — het stuk zoals het er staat. */
export function termijnInZin(zin: string): string {
  DATUM_RE.lastIndex = 0;
  for (const m of zin.matchAll(DATUM_RE)) {
    const voor = zin.slice(0, m.index).match(/(\S+\s+){0,3}$/u)?.[0] || '';
    const v = TERMIJN_VOOR.exec(voor.replace(/\s+$/u, ''));
    // de punt van de zin hoort niet bij de termijn («до 28 жовтня.» → «до 28 жовтня»)
    if (v) return `${voor.slice(v.index).trim()} ${m[0].trim()}`.replace(/\s+/g, ' ').replace(/\.$/, '');
  }
  return '';
}

type EenvoudigeBrief = { brief: number; tekst: string };

/**
 * «Простий розбір» zonder model: vragen (zin eindigt op «?»), verzoeken en termijnen als PUNTEN; datums met tijd, bijlagen en
 * bedragen als «Коротко». Elk punt is een letterlijke zin uit de brief, met zijn bron — dus altijd «знайдено дослівно».
 * Hoogstens 5 punten en 3 feiten.
 */
export function eenvoudigeOntleding(brieven: readonly EenvoudigeBrief[]): { punten: GecontroleerdPunt[]; kort: GecontroleerdPunt[] } {
  const alineas = gespreksAlineas(brieven);
  const punten: GecontroleerdPunt[] = [], kort: GecontroleerdPunt[] = [];
  const gezien = new Set<string>();
  const maak = (a: BronAlinea, zin: string, soort: PuntSoort, termijn: string): GecontroleerdPunt | null => {
    const n = normaliseer(zin);
    if (gezien.has(n) || n.length < 12) return null;
    const plek = zoekCitaat(zin, [a]);
    if (!plek) return null;
    gezien.add(n);
    return { id: `e:${a.brief}.${a.nr}.${gezien.size}`, tekst: zin, citaat: zin, brief: a.brief, alinea: a.nr, termijn, soort, status: 'letterlijk', bron: plek, verplaatst: false, termijnStaat: termijn ? 'in-bron' : 'geen' };
  };
  for (const a of alineas) {
    if (GROET.test(a.tekst.trim())) continue;
    for (const zin of zinnenVan(a.tekst)) {
      const vraag = /\?["'»”)\s]*$/u.test(zin);
      const verzoek = VERZOEK.test(zin);
      const termijn = termijnInZin(zin);
      if ((vraag || verzoek || termijn) && punten.length < 5) {
        const p = maak(a, zin, vraag ? 'vraag' : verzoek ? 'verzoek' : 'termijn', termijn);
        if (p) { punten.push(p); continue; }
      }
      if (kort.length >= 3) continue;
      DATUM_RE.lastIndex = 0;
      const datum = DATUM_RE.test(zin);
      TIJD_RE.lastIndex = 0;
      const tijd = TIJD_RE.test(zin);
      if ((datum && tijd) || BIJLAGE.test(zin) || BEDRAG.test(zin)) {
        const f = maak(a, zin, 'feit', '');
        if (f) kort.push(f);
      }
    }
  }
  return { punten, kort };
}

// ------------------------------------------------------------------ «Потребує відповіді»

/* SEC-002 (g10c-toets-1): adres uit de LAATSTE hoekhaken (adresVan), niet de eerste «<…>» uit de weergavenaam */
const adres = (v: string) => adresVan(v).adres || (String(v || '').includes('<') ? '' : String(v || '').trim().toLocaleLowerCase());

/**
 * Wacht dit gesprek op een antwoord van mij? Ja als de laatste brief niet van mij is en er na mijn laatste brief een vraag of
 * verzoek staat (in `punten`, met `brief` = volgnummer). Geeft de reden (het eerste punt) terug, of null.
 */
export function antwoordNodig(
  gesprek: ReadonlyArray<{ from: string }>,
  mijnAdressen: readonly string[],
  punten: readonly GecontroleerdPunt[],
): GecontroleerdPunt | null {
  if (!gesprek.length) return null;
  const mijn = new Set(mijnAdressen.map(adres).filter(Boolean));
  const vanMij = (i: number) => mijn.has(adres(gesprek[i].from));
  if (vanMij(gesprek.length - 1)) return null;
  let laatsteVanMij = 0;
  gesprek.forEach((_, i) => { if (vanMij(i)) laatsteVanMij = i + 1; });
  return punten.find((p) => p.status === 'letterlijk' && (p.soort === 'vraag' || p.soort === 'verzoek') && (p.bron?.brief || 0) > laatsteVanMij) || null;
}

// ------------------------------------------------------------------ markeren (aanwijzen in de ORIGINELE tekst)

/** Genormaliseerde tekst met per teken de plaats in het origineel (voor het markeren van een citaat in de brief zelf). */
export function normaliseerMetKaart(s: string): { norm: string; kaart: number[] } {
  const bron = String(s ?? '');
  let norm = '';
  const kaart: number[] = [];
  let spatie = false;
  for (let i = 0; i < bron.length; ) {
    const cp = bron.codePointAt(i) ?? 0;
    const ch = String.fromCodePoint(cp);
    const breedte = ch.length;
    let uit = ch.normalize('NFKC');
    if (ONZICHTBAAR.test(uit)) { ONZICHTBAAR.lastIndex = 0; i += breedte; continue; }
    ONZICHTBAAR.lastIndex = 0;
    uit = uit.replace(ENKEL, "'").replace(DUBBEL, '"').replace(STREEP, '-').replace(/…/g, '...');
    if (/^[\s  -   　]+$/u.test(uit)) {
      if (!spatie && norm.length) { norm += ' '; kaart.push(i); spatie = true; }
      i += breedte;
      continue;
    }
    spatie = false;
    // per UTF-16-eenheid één plaats (indexOf telt eenheden: een emoji zijn er twee, «ﬁ» wordt «fi»)
    const klein = uit.toLocaleLowerCase();
    for (let k = 0; k < klein.length; k++) kaart.push(i);
    norm += klein;
    i += breedte;
  }
  while (norm.endsWith(' ')) { norm = norm.slice(0, -1); kaart.pop(); }
  return { norm, kaart };
}

/**
 * De ORIGINELE alinea in stukken, met de stukken van het citaat gemarkeerd (ook bij «…»: elk stuk apart). Niet gevonden = één
 * ongemarkeerd stuk.
 */
export function markeerCitaat(tekst: string, citaat: string): Array<{ tekst: string; mark: boolean }> {
  const bron = String(tekst ?? '');
  const { norm, kaart } = normaliseerMetKaart(bron);
  const stukken = citaatKern(citaat).split(/\s*\.\.\.\s*/).map((s) => s.trim()).filter((s) => s.length >= 3);
  const plekken: Array<[number, number]> = [];
  let vanaf = 0;
  for (const stuk of stukken) {
    const i = norm.indexOf(stuk, vanaf);
    if (i < 0) return [{ tekst: bron, mark: false }];
    const begin = kaart[i], eindTeken = kaart[i + stuk.length - 1];
    const eind = eindTeken + (bron.codePointAt(eindTeken)! > 0xffff ? 2 : 1);
    plekken.push([begin, eind]);
    vanaf = i + stuk.length;
  }
  if (!plekken.length) return [{ tekst: bron, mark: false }];
  const uit: Array<{ tekst: string; mark: boolean }> = [];
  let pos = 0;
  for (const [b, e] of plekken) {
    if (b > pos) uit.push({ tekst: bron.slice(pos, b), mark: false });
    uit.push({ tekst: bron.slice(b, e), mark: true });
    pos = e;
  }
  if (pos < bron.length) uit.push({ tekst: bron.slice(pos), mark: false });
  return uit;
}

/** Ruwe taal van een tekst (zelfde regels als de server, backend/ai-vertaling-routes.ts detectLanguageCode). */
export function taalVan(tekst: string): string {
  const sample = String(tekst || '').split('[ПРИХОВАНО_СЕКРЕТ]').join(' ').slice(0, 2000);
  if (/[іїєґІЇЄҐ]/.test(sample)) return 'uk';
  if (/[а-яА-Я]/.test(sample)) return 'uk';
  if (/\b(?:de|het|een|voor|met|niet|van|naar|bij|vriendelijke|groet|factuur|betaling)\b/i.test(sample)) return 'nl';
  if (/\b(?:der|die|das|und|für|mit|nicht|von|rechnung|vielen|dank)\b/i.test(sample)) return 'de';
  if (/\b(?:le|la|les|des|pour|avec|dans|bonjour|merci|facture)\b/i.test(sample)) return 'fr';
  if (/\b(?:czy|dla|jest|nie|tak|proszę|dziękuję|faktura)\b/i.test(sample)) return 'pl';
  return 'en';
}

// ------------------------------------------------------------------ juridisch dossier & anonimiseren (AutoClaw / GLM-5.3-flashX-Legal)

export type AnonimiseerTelling = {
  email: number;
  telefoon: number;
  rekening: number;
  code: number;
  totaal: number;
};

export type AnonimiseerResultaat = {
  tekst: string;
  telling: AnonimiseerTelling;
};

const LABELS_ANONIEM = {
  uk: {
    email: '[ПРИХОВАНО_ПОШТА]',
    telefoon: '[ПРИХОВАНО_ТЕЛЕФОН]',
    rekening: '[ПРИХОВАНО_РАХУНОК]',
    code: '[ПРИХОВАНО_КОД]',
  },
  nl: {
    email: '[VERBORGEN_E_MAIL]',
    telefoon: '[VERBORGEN_TELEFOON]',
    rekening: '[VERBORGEN_REKENING]',
    code: '[VERBORGEN_NUMMER]',
  },
} as const;

/**
 * Zнеособлення (anonimiseren) van gevoelige persoons- en betaalgegevens in contracten, brieven en bewijsstukken vóór overdracht of
 * publicatie (e-mail, IBAN-rekening, telefoonnummer, fiscaal/KvK/ЄДРПОУ/ІПН-nummer). Puur en deterministisch.
 */
export function anonimiseerTekst(tekst: string, lang: 'uk' | 'nl' = 'uk'): AnonimiseerResultaat {
  const lb = LABELS_ANONIEM[lang];
  const telling: AnonimiseerTelling = { email: 0, telefoon: 0, rekening: 0, code: 0, totaal: 0 };
  let uit = String(tekst ?? '');

  // 1. E-mailadressen
  uit = uit.replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g, () => {
    telling.email += 1;
    return lb.email;
  });

  // 2. IBAN-bankrekeningen (bv. NL91 ABNA 0417 1643 00 of UA21 3223 1300 0002 6007 2335 6600 1)
  uit = uit.replace(/\b[A-Z]{2}\d{2}(?:[\s-]?[A-Z0-9]{4}){3,7}(?:[\s-]?[A-Z0-9]{1,4})?\b/g, () => {
    telling.rekening += 1;
    return lb.rekening;
  });

  // 3. Fiscale / registratiecodes met sleutelwoord (ЄДРПОУ, ІПН, РНОКПП, KvK, BSN, BTW)
  uit = uit.replace(/(?<![\p{L}\p{N}])((?:ЄДРПОУ|ІПН|РНОКПП|KvK|BSN|BTW)(?:\s*[:№#-])?\s*)(\d{8,12})(?![\p{L}\p{N}])/giu, (_, voor: string) => {
    telling.code += 1;
    return `${voor}${lb.code}`;
  });

  // 4. Telefoonnummers (internationaal +380 / +31 of lokale notatie met minstens 9 cijfers)
  uit = uit.replace(/(?:\+\d{1,3}[\s.-]?\(?\d{2,3}\)?[\s.-]?\d{3}[\s.-]?\d{2}[\s.-]?\d{2,4}|\b0\d{1,2}[\s.-]\d{3,4}[\s.-]\d{2,4}\b)/g, () => {
    telling.telefoon += 1;
    return lb.telefoon;
  });

  telling.totaal = telling.email + telling.telefoon + telling.rekening + telling.code;
  return { tekst: uit, telling };
}

export type BewijsTijdlijnRij = {
  id: string;
  bronLabel: string;
  brief: number;
  nr: number;
  soort: PuntSoort;
  termijn: string;
  datumIso: string | null;
  citaat: string;
  status: 'letterlijk' | 'niet-gevonden';
};

export type BewijsIndex = {
  alineas: BronAlinea[];
  punten: GecontroleerdPunt[];
  kort: GecontroleerdPunt[];
  tijdlijn: BewijsTijdlijnRij[];
  anoniem: AnonimiseerResultaat;
  samenvatting: {
    totaalAlineas: number;
    totaalPunten: number;
    letterlijkGevonden: number;
    metTermijn: number;
    geanonimiseerd: number;
  };
  markdown: string;
};

/**
 * Bouwt een volledig juridisch bewijsregister en tijdlijn uit één of meer brieven/contractstukken:
 *   - verdeelt in genummerde alinea's (§1, §2, …);
 *   - extraheert en controleert verzoeken, vragen, termijnen en kernfeiten letterlijk tegen de brontekst;
 *   - ordent gevonden punten met datum/termijn chronologisch;
 *   - anonimiseert persoons- en rekeninggegevens voor veilige verwerking of indiening;
 *   - levert een tweetalig (`uk` / `nl`) Markdown-dossier klaar voor AutoClaw / GLM-5.3-flashX-Legal.
 */
export function bouwBewijsIndex(
  brieven: ReadonlyArray<{ brief: number; tekst: string }>,
  lang: 'uk' | 'nl' = 'uk',
  refMs: number = Date.now(),
): BewijsIndex {
  const alineas = gespreksAlineas(brieven);
  const { punten, kort } = eenvoudigeOntleding(brieven);
  const alle = [...punten, ...kort];
  const volledig = brieven.map((b) => b.tekst).join('\n\n');
  const anoniem = anonimiseerTekst(volledig, lang);

  const tijdlijnMetMs = alle.map((p) => {
    const plek = p.bron ?? { brief: p.brief ?? 1, nr: p.alinea ?? 1 };
    const d = datumUit(p.termijn || p.citaat, refMs);
    const datumIso = d ? new Date(d.start).toISOString().slice(0, 10) : null;
    return {
      ms: d ? d.start : Number.MAX_SAFE_INTEGER,
      rij: {
        id: p.id,
        bronLabel: bronLabel(lang, plek),
        brief: plek.brief,
        nr: plek.nr,
        soort: p.soort ?? 'feit',
        termijn: p.termijn ?? '',
        datumIso,
        citaat: anonimiseerTekst(p.citaat, lang).tekst,
        status: p.status,
      } satisfies BewijsTijdlijnRij,
    };
  });

  tijdlijnMetMs.sort((a, b) => a.ms - b.ms || a.rij.brief - b.rij.brief || a.rij.nr - b.rij.nr);
  const tijdlijn = tijdlijnMetMs.map((x) => x.rij);

  const letterlijkGevonden = alle.filter((p) => p.status === 'letterlijk').length;
  const metTermijn = tijdlijn.filter((r) => Boolean(r.termijn || r.datumIso)).length;

  const kop = lang === 'uk'
    ? '# Реєстр доказів і дослівна перевірка джерел (AutoClaw · GLM-5.3-flashX-Legal)'
    : '# Bewijsregister en letterlijke broncontrole (AutoClaw · GLM-5.3-flashX-Legal)';
  const metaRegel = lang === 'uk'
    ? `- Абзаців джерела: **${alineas.length}** · Дослівно підтверджено: **${letterlijkGevonden} із ${alle.length}** · Термінів/дат: **${metTermijn}** · Знеособлено чутливих реквізитів: **${anoniem.telling.totaal}**`
    : `- Bronalinea's: **${alineas.length}** · Letterlijk bevestigd: **${letterlijkGevonden} van ${alle.length}** · Termijnen/datums: **${metTermijn}** · Geanonimiseerde gegevens: **${anoniem.telling.totaal}**`;
  const tabelKop = lang === 'uk'
    ? '| Джерело | Вид | Термін / дата | Дослівна витримка (перевірено в оригіналі) |\n| --- | --- | --- | --- |'
    : '| Bron | Soort | Termijn / datum | Letterlijk citaat (gecontroleerd in het origineel) |\n| --- | --- | --- | --- |';
  const soortNaam: Record<PuntSoort, [string, string]> = {
    verzoek: ['зобов’язання / вимога', 'verzoek / verplichting'],
    vraag: ['питання', 'vraag'],
    termijn: ['граничний строк', 'termijn'],
    feit: ['ключовий факт / сума', 'kernfeit / bedrag'],
  };
  const rijenMd = tijdlijn.map((r) => {
    const s = soortNaam[r.soort][lang === 'uk' ? 0 : 1];
    const t = r.termijn || r.datumIso || '—';
    return `| ${r.bronLabel} | ${s} | ${t} | «${r.citaat.replace(/\|/g, '\\|')}» |`;
  });

  const markdown = [kop, '', metaRegel, '', tabelKop, ...rijenMd].join('\n');

  return {
    alineas,
    punten,
    kort,
    tijdlijn,
    anoniem,
    samenvatting: {
      totaalAlineas: alineas.length,
      totaalPunten: alle.length,
      letterlijkGevonden,
      metTermijn,
      geanonimiseerd: anoniem.telling.totaal,
    },
    markdown,
  };
}

