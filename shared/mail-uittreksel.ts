// Uittreksel van een brief voor de lijst (audit pошти 18.10.2026, opmerking van de eigenaar bij «Очистити генерацію прев'ю»).
//
// Wat het probleem was: de lijst toonde de ruwe snippet van Gmail (of het begin van de geïndexeerde tekst). Daarin staan
// alt-teksten van afbeeldingen («AWS logo Your AWS free plan…»), «View in browser», «Sent from my iPhone», geciteerde
// geschiedenis («On … wrote:», «>»), handtekeningen, juridische voetteksten, onzichtbare preheader-tekens en lange URL's.
// Dat is ruis, geen inhoud.
//
// Wat deze module doet (zuiver, zonder netwerk of opslag; dezelfde code op server en client):
//   - maakUittreksel(ruw)  → de eerste inhoudelijke zinnen, zonder ruis. IDEMPOTENT: nog eens toepassen verandert niets.
//   - knipOpWoord(t, max)  → afkappen op een woordgrens (nooit midden in een woord), met «…».
//   - voorbeeldProfiel(d)  → hoeveel er per dichtheid (minimum / normal / detailed / bulky) zichtbaar is.
// Werkt op platte tekst: zowel de (al ontsleutelde) Gmail-snippet als de platte tekst van het lichaam. Neemt nooit
// meer tekst op dan erin ging; bewaart niets.

export type Dichtheid = 'minimum' | 'normal' | 'detailed' | 'bulky';

/** Onzichtbare tekens die nieuwsbrieven als «preheader-opvulling» gebruiken. */
const ONZICHTBAAR = /[­͏؜ᅟᅠ឴឵᠎​-‏‪-‮⁠-⁤⁪-⁯ㅤ﻿ﾠ]/g;

/** \b in JavaScript kent alleen ASCII-letters (faalt rond «Відписатися»); dit maakt van \b een Unicode-woordgrens. */
const uni = (re: RegExp): RegExp => new RegExp(re.source.replace(/\\b/g, '(?:(?<=[\\p{L}\\p{N}])(?![\\p{L}\\p{N}])|(?<![\\p{L}\\p{N}])(?=[\\p{L}\\p{N}]))'), re.flags.includes('u') ? re.flags : `${re.flags}u`);

/** Regels die alleen dienst-ruis zijn (hele regel / zin). */
const DIENST: RegExp[] = [
  /^(?:view|open|read)\s+(?:this\s+)?(?:e-?mail|message|newsletter)?\s*(?:in|on)\s+(?:your|a|the)?\s*(?:web\s*)?browser\b.*$/i,
  /^view\s+(?:it\s+)?online\b.*$/i,
  /^(?:having\s+trouble|trouble|problems?)\s+(?:viewing|reading|seeing)\b.*$/i,
  /^(?:can'?t|cannot)\s+see\s+(?:this|the)\s+(?:e-?mail|images?)\b.*$/i,
  /^bekijk\s+(?:deze\s+)?(?:e-?mail|nieuwsbrief|mail)?\s*(?:in|online\s+in)?\s*(?:je|uw|de)?\s*(?:web)?browser\b.*$/i,
  /^bekijk\s+(?:deze\s+e-?mail\s+)?online\b.*$/i,
  /^(?:wordt|is)\s+deze\s+(?:e-?mail|mail|nieuwsbrief)\s+niet\s+(?:goed|correct)\s+(?:weergegeven|leesbaar)\b.*$/i,
  /^(?:переглянути|відкрити)\s+(?:цей\s+)?(?:лист\s+)?(?:у|в)\s+браузері\b.*$/i,
  /^(?:лист\s+)?(?:не\s+)?відображається\s+(?:некоректно|неправильно)\b.*$/i,
  /^(?:sent|send)\s+(?:from|via|with)\s+(?:my\s+)?(?:iphone|ipad|android|samsung|galaxy|mobile|phone|blackberry|huawei|xiaomi|pixel|outlook|mail\s+for\s+windows|yahoo\s+mail|gmail|proton\s*mail)\b.*$/i,
  /^get\s+outlook\s+for\s+(?:ios|android)\b.*$/i,
  /^download\s+outlook\s+for\s+(?:ios|android)\b.*$/i,
  /^(?:verzonden|verstuurd)\s+(?:vanaf|van|met|via)\s+(?:mijn\s+)?(?:iphone|ipad|android|samsung|galaxy|mobiel|telefoon|smartphone|outlook|mail\s+voor\s+windows|gmail)\b.*$/i,
  /^(?:надіслано|відправлено|отправлено)\s+(?:з|із|зі|с|со)\s+(?:мого\s+|моего\s+)?(?:iphone|ipad|android|samsung|galaxy|телефона|смартфона|outlook|gmail)\b.*$/i,
  /^(?:unsubscribe|manage\s+(?:your\s+)?(?:preferences|subscriptions?|e-?mail\s+settings)|update\s+(?:your\s+)?preferences|privacy\s+policy|terms\s+(?:of\s+use|and\s+conditions)|contact\s+us)\b.{0,120}$/i,
  /^(?:afmelden|uitschrijven|voorkeuren\s+(?:beheren|aanpassen)|privacybeleid|privacyverklaring|algemene\s+voorwaarden)\b.{0,120}$/i,
  /^(?:відписатися|відмовитися\s+від\s+розсилки|налаштування\s+розсилки|політика\s+конфіденційності)\b.{0,120}$/i,
  /^(?:©|\(c\)|copyright\b).{0,200}$/i,
  /^.{0,160}\b(?:all\s+rights\s+reserved|alle\s+rechten\s+voorbehouden|усі\s+права\s+захищено|все\s+права\s+защищены)\b.{0,80}$/i,
  /^(?:this|the)\s+(?:e-?mail|message)\s+was\s+sent\s+to\b.*$/i,
  /^you\s+(?:are\s+)?receiv(?:e|ing)\s+this\s+(?:e-?mail|message|newsletter)\b.*$/i,
  /^(?:deze|dit)\s+(?:e-?mail|bericht|mail)\s+(?:is|werd)\s+(?:verzonden|verstuurd|gestuurd)\s+(?:naar|aan)\b.*$/i,
  /^(?:u|je)\s+ontvangt\s+(?:deze|dit)\s+(?:e-?mail|bericht|nieuwsbrief|mail)\b.*$/i,
  /^(?:цей\s+)?лист\s+(?:було\s+)?надіслано\s+(?:на|для)\b.*$/i,
  /^(?:ви|вы)\s+отримуєте\s+цей\s+лист\b.*$/i,
  /^(?:please\s+)?do\s+not\s+reply\s+to\s+this\s+(?:e-?mail|message)\b.*$/i,
  /^(?:gelieve\s+)?niet\s+(?:te\s+)?(?:antwoorden|reageren)\s+op\s+(?:deze|dit)\s+(?:e-?mail|bericht)\b.*$/i,
  /^не\s+відповідайте\s+на\s+цей\s+лист\b.*$/i,
  /^(?:add\s+us\s+to\s+your\s+address\s+book|voeg\s+ons\s+toe\s+aan\s+je\s+adresboek)\b.*$/i,
].map(uni);

/** Begin van geciteerde geschiedenis — alles vanaf hier valt weg. */
const CITAAT_START: RegExp[] = [
  /(?:^|\s)On\s[^\n]{3,200}?\swrote:/i,
  /(?:^|\s)Op\s[^\n]{3,200}?\sschreef\s[^\n]{0,200}?:/i,
  /(?:^|\s)(?:Le|Am|El)\s[^\n]{3,200}?\s(?:a\s+écrit|schrieb|escribió)\s?:/i,
  /(?:^|\s)\d{1,2}[./ ][^\n]{2,80}?\d{2}:\d{2}[^\n]{0,160}?\s(?:пише|написав|написала|написал|wrote|schreef):/i,
  /-{2,}\s*(?:Original Message|Oorspronkelijk bericht|Origineel bericht|Оригінальне повідомлення|Исходное сообщение|Forwarded message|Doorgestuurd bericht|Переслане повідомлення)\s*-{2,}/i,
  /(?:^|\n)\s*(?:From|Van|Від|От):\s[^\n]{1,200}\n\s*(?:Sent|Verzonden|Date|Datum|Надіслано|Відправлено|Дата|Отправлено):/i,
  /(?:^|\n)_{8,}\s*(?:\n|$)/,
].map(uni);

/** Handtekening-scheiding: «-- » op een eigen regel (RFC 3676), of « -- » midden in een snippet. */
const HANDTEKENING = /(?:^|\n)--[ \t]?\r?\n|\s--\s(?=\S)/;

/** Alt-tekst van een logo/banner aan het begin («AWS logo Your …», «Logo», «[image: Kinetics]»). */
const ALT_BEGIN = /^(?:(?:[\p{Lu}\d][\p{L}\d&.'’+-]*\s+){0,4}(?:[Ll]ogo|LOGO|[Ll]ogotype|[Bb]anner|BANNER|[Лл]оготип|[Лл]ого)(?![\p{L}\d])[\s:–—-]*)+/u;
/** Alt-tekst vooraan weg — alleen als daarna een nieuwe zin begint («AWS logo Your AWS …»), niet bij «New logo for our team». */
const zonderAlt = (t: string): string => {
  const m = ALT_BEGIN.exec(t);
  if (!m) return t;
  const rest = t.slice(m[0].length).trim();
  if (!rest) return '';
  return /^[\p{Lu}\d«"“(]/u.test(rest) && rest.length >= 3 ? rest : t;
};
const ALT_MARKERS = /\[(?:image|afbeelding|bild|зображення|изображение|cid|logo|img)(?::[^\]]{0,200})?\]/gi;
const LANGE_URL = /<?\b(?:https?:\/\/|www\.)[^\s<>()]{1,2000}>?/gi;
const ALLEEN_TEKENS = /^[\s\p{P}\p{S}\d|•·]*$/u;

const isMenuRegel = (r: string) => {
  const delen = r.split(/\s*[|•·]\s*/).filter(Boolean);
  return delen.length >= 3 && delen.every((d) => d.split(/\s+/).length <= 3 && d.length <= 28);
};

/** Dienstzinnen die in een eenregelige snippet vooraan staan zonder punt («View in browser Your order …»). */
const DIENST_VOORAAN: RegExp[] = [
  /^(?:view|open)\s+(?:this\s+)?(?:e-?mail\s+)?(?:in\s+(?:your\s+)?browser|online)\s+/i,
  /^bekijk\s+(?:deze\s+e-?mail\s+)?(?:in\s+(?:je|uw|de)\s+browser|online)\s+/i,
  /^переглянути\s+(?:у|в)\s+браузері\s+/i,
  /^(?:having\s+trouble\s+viewing\s+this\s+e-?mail\?|is\s+deze\s+e-?mail\s+niet\s+goed\s+leesbaar\?)\s*(?:view\s+it\s+online|bekijk\s+online|klik\s+hier)?\.?\s+/i,
].map(uni);
/** …en achteraan («… Sent from my iPhone»). */
const DIENST_ACHTERAAN: RegExp[] = [
  /\s+(?:sent|send)\s+(?:from|via|with)\s+(?:my\s+)?(?:iphone|ipad|android|samsung|galaxy|mobile|phone|outlook)\b[^.]{0,40}$/i,
  /\s+get\s+outlook\s+for\s+(?:ios|android)\s*$/i,
  /\s+(?:verzonden|verstuurd)\s+(?:vanaf|van|met|via)\s+(?:mijn\s+)?(?:iphone|ipad|android|samsung|mobiel|telefoon|outlook)\b[^.]{0,40}$/i,
  /\s+(?:надіслано|відправлено)\s+(?:з|із|зі)\s+(?:мого\s+)?(?:iphone|ipad|android|samsung|телефона|outlook)\b[^.]{0,40}$/i,
].map(uni);

/** Platte tekst opschonen tot een lijst inhoudelijke regels (intern). */
function inhoudsRegels(ruw: string): string[] {
  let t = String(ruw ?? '').replace(/\r\n?/g, '\n').replace(ONZICHTBAAR, '').replace(/[   ]/g, ' ');
  t = t.replace(ALT_MARKERS, ' ');
  // Geciteerde geschiedenis en handtekening: alles vanaf de vroegste markering weg (maar nooit alles: er moet iets vóór staan).
  let snij = t.length;
  for (const re of [...CITAAT_START, HANDTEKENING]) {
    const m = re.exec(t);
    // Vóór de markering moet inhoud staan (bij een handtekening minstens een korte zin), anders blijft alles.
    const genoeg = re === HANDTEKENING ? 12 : 2;
    if (m && m.index > 0 && m.index < snij && t.slice(0, m.index).trim().length >= genoeg) snij = m.index;
  }
  t = t.slice(0, snij);
  const regels: string[] = [];
  for (let r of t.split('\n')) {
    r = r.replace(/^\s*>.*$/, '');
    r = r.replace(LANGE_URL, ' ').replace(/[ \t]+/g, ' ').trim();
    // Dienstzin vooraan in dezelfde regel («View in browser Your order …»): eerst weg, anders valt de hele regel weg.
    for (let n = 0; n < 3; n++) { const voor = r; for (const re of DIENST_VOORAAN) r = r.replace(re, ''); r = r.trim(); if (r === voor) break; }
    if (!r || ALLEEN_TEKENS.test(r) || isMenuRegel(r)) continue;
    // In één regel (Gmail-snippet) kunnen dienstzinnen voor of achter de inhoud staan: per zin toetsen.
    const zinnen = r.split(/(?<=[.!?…])\s+(?=[\p{Lu}\d«"“(])/u);
    const goed = zinnen.map((z) => z.trim()).filter((z) => z && !DIENST.some((re) => re.test(z)) && !ALLEEN_TEKENS.test(z));
    if (goed.length) regels.push(goed.join(' '));
  }
  // Alt-tekst van een logo vooraan (alleen helemaal aan het begin, en alleen als er daarna nog inhoud overblijft).
  while (regels.length) {
    const zonder = zonderAlt(regels[0]);
    if (zonder === regels[0]) break;
    if (zonder) { regels[0] = zonder; break; }
    regels.shift();
  }
  return regels;
}

/**
 * Inhoudelijk uittreksel: eerste zinnen zonder ruis, één regel tekst. Idempotent.
 * `max` (tekens) kapt op een woordgrens af; zonder max blijft alles wat inhoud is.
 */
export function maakUittreksel(ruw: string, max = 0): string {
  let t = inhoudsRegels(ruw).join(' ').replace(/\s+/g, ' ').trim();
  for (let i = 0; i < 3; i++) {
    const voor = t;
    for (const re of DIENST_VOORAAN) t = t.replace(re, '');
    for (const re of DIENST_ACHTERAAN) t = t.replace(re, '');
    t = zonderAlt(t).trim();
    if (t === voor) break;
  }
  return max > 0 ? knipOpWoord(t, max) : t;
}

/** Afkappen op een woordgrens met «…»; tekst die al past (ook met eigen «…») blijft ongewijzigd. */
export function knipOpWoord(tekst: string, max: number): string {
  const t = String(tekst ?? '').replace(/\s+/g, ' ').trim();
  if (max <= 0 || t.length <= max) return t;
  const ruimte = Math.max(1, max - 1);
  const stuk = t.slice(0, ruimte + 1);
  let snij = stuk.search(/\s\S*$/);
  // Eén reuzenwoord (URL, code): dan toch binnen het woord afkappen — beter dan niets tonen.
  if (snij < Math.max(4, Math.floor(ruimte * 0.4))) snij = ruimte;
  return `${t.slice(0, snij).replace(/[\s,;:–—-]+$/, '')}…`;
}

export type VoorbeeldProfiel = {
  /** Tekens tekst in het uittreksel van de rij. */
  tekens: number;
  /** Zichtbare regels van het uittreksel (CSS line-clamp). */
  regels: number;
  /** Grootte van de miniatuur van een afbeelding/bijlage in de rij. */
  miniatuur: 'klein' | 'middel' | 'groot';
  /** Bijlagen als lijst met type en naam. */
  bijlagenLijst: boolean;
  /** Eerste regels van de inhoud van een bijlage (alleen uit de lokale cache; niets wordt extra opgehaald). */
  bijlageInhoud: boolean;
};

/** Hoeveel inhoud per dichtheid: van minimum naar bulky neemt het toe (nooit af). */
export function voorbeeldProfiel(d: Dichtheid | string): VoorbeeldProfiel {
  switch (d) {
    case 'minimum': return { tekens: 120, regels: 1, miniatuur: 'klein', bijlagenLijst: false, bijlageInhoud: false };
    case 'detailed': return { tekens: 360, regels: 2, miniatuur: 'middel', bijlagenLijst: true, bijlageInhoud: false };
    case 'bulky': return { tekens: 700, regels: 3, miniatuur: 'groot', bijlagenLijst: true, bijlageInhoud: true };
    default: return { tekens: 220, regels: 1, miniatuur: 'middel', bijlagenLijst: true, bijlageInhoud: false };
  }
}

/** Uittreksel voor een rij in een gegeven dichtheid: eerst schoon, dan op woordgrens afgekapt. */
export const uittrekselVoor = (ruw: string, d: Dichtheid | string) => maakUittreksel(ruw, voorbeeldProfiel(d).tekens);
