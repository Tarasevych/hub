// Voorkeuren van de technische strook (zoekronde 02.11.2026, herzien 03.11.2026): modus (uitgeklapt / ingeklapt / automatisch),
// grootte, vorm van de knoppen (alleen pictogrammen / pictogrammen met tekst / alleen tekst), en welke knoppen in welke volgorde op
// de strook staan. Alleen op dit apparaat (localStorage met try/catch); zonder opslag geldt de standaard. Zuiver en zonder React,
// zodat het getest kan worden (tests/eenheid/strook-voorkeur.test.ts).
//
// 03.11.2026 (eigenaar): «Смуга зараз постійно видна … має працювати за аналогією з меню сайту: згортатися в тонку смужку … і
// розгортатися, коли наводжу на верхню область вікна». Daarom:
//  • standaard «automatisch» (was «uitgeklapt»); een bewaarde keuze blijft gelden;
//  • de modusknop (▾ / 📌 / ▴) is een VASTE knop van de strook, net als «⋯» en de instellingen: hij moet er ook in de dunne strook
//    zijn en mag dus niet van de strook gehaald worden. De kiesbare knop «inklap» is daarom vervallen (een bewaarde lijst verliest hem
//    stil via normaliseer);
//  • `laatsteInklap`: welke ingeklapte modus «Згорнути» kiest (de laatst gebruikte; standaard automatisch).
export type StrookModus = 'uitgeklapt' | 'ingeklapt' | 'auto';
export type StrookGrootte = 'klein' | 'middel' | 'groot';
export type StrookLabel = 'iconen' | 'beide' | 'tekst';
export type InklapModus = Exclude<StrookModus, 'uitgeklapt'>;
export type StrookVoorkeur = { modus: StrookModus; grootte: StrookGrootte; label: StrookLabel; knoppen: string[]; laatsteInklap: InklapModus };

export const STROOK_SLEUTEL = 'mr-tech-strook';
/** De oude losse schakelaar («ingeklapt» ja/nee): wordt eenmalig gelezen en daarna niet meer geschreven. */
export const STROOK_OUDE_INKLAP_SLEUTEL = 'mr-tech-band-ingeklapt';
export const STROOK_MAX_KNOPPEN = 18;

/** Alle knoppen die op de strook kunnen staan. Vaste knoppen (modus, «⋯», instellingen) staan altijd op de strook en zijn niet kiesbaar. */
export const STROOK_KNOP_IDS: readonly string[] = [
  'meldingen', 'wissel', 'uit',
  'beheer', 'api', 'uitrol', 'ai-beleid', 'account', 'terminal', 'remote', 'ssh', 'vlaggen', 'ondersteuning', 'profielen', 'verlengen', 'toegang', 'band',
];

/** Standaard: de knoppen die er vroeger al stonden (meldingen, ruimte wisselen, afmelden); in- en uitklappen is nu de vaste modusknop. */
export const STROOK_STANDAARD_KNOPPEN: readonly string[] = ['meldingen', 'wissel', 'uit'];

export const STROOK_STANDAARD: StrookVoorkeur = { modus: 'auto', grootte: 'middel', label: 'beide', knoppen: [...STROOK_STANDAARD_KNOPPEN], laatsteInklap: 'auto' };

/** Namen per knop (uk, nl). De namen van de ⋯-lijst zijn dezelfde als de knoppen zelf. */
export const STROOK_NAMEN: Readonly<Record<string, { uk: string; nl: string }>> = Object.freeze({
  meldingen: { uk: 'Технічні сповіщення', nl: 'Technische meldingen' },
  wissel: { uk: 'Перемикання простору', nl: 'Ruimte wisselen' },
  uit: { uk: 'Вийти з технічного', nl: 'Technisch verlaten' },
  beheer: { uk: 'Адміністрування', nl: 'Beheer' },
  api: { uk: 'API', nl: 'API' },
  uitrol: { uk: 'Розгортання', nl: 'Uitrol' },
  'ai-beleid': { uk: 'Доступ ШІ', nl: 'AI-toegang' },
  account: { uk: 'Обліковий запис', nl: 'Account' },
  terminal: { uk: 'Термінал', nl: 'Terminal' },
  remote: { uk: 'Віддалений стіл', nl: 'Extern bureaublad' },
  ssh: { uk: 'SSH-сертифікати', nl: 'SSH-certificaten' },
  vlaggen: { uk: 'Перемикачі функцій', nl: 'Functieschakelaars' },
  ondersteuning: { uk: 'Підтримка', nl: 'Ondersteuning' },
  profielen: { uk: 'Профілі', nl: 'Profielen' },
  verlengen: { uk: 'Подовжити', nl: 'Verlengen' },
  toegang: { uk: 'Доступ і терміни', nl: 'Toegang en termijnen' },
  band: { uk: 'Колір смуги', nl: 'Kleur van de band' },
});

export const MODUS_NAMEN: Readonly<Record<StrookModus, { uk: string; nl: string }>> = Object.freeze({
  uitgeklapt: { uk: 'Розгорнуто', nl: 'Uitgeklapt' },
  ingeklapt: { uk: 'Згорнуто', nl: 'Ingeklapt' },
  auto: { uk: 'Автоматично', nl: 'Automatisch' },
});
/** Korte uitleg per modus (zelfde betekenis als de modi van het menu van de site). */
export const MODUS_UITLEG: Readonly<Record<StrookModus, { uk: string; nl: string }>> = Object.freeze({
  uitgeklapt: { uk: 'Смуга завжди повна', nl: 'De strook is altijd volledig' },
  ingeklapt: { uk: 'Тонка смужка; розгортається кнопкою ▾', nl: 'Dunne strook; uitklappen met de knop ▾' },
  auto: { uk: 'Тонка смужка; розгортається, коли наводите на верх вікна', nl: 'Dunne strook; klapt open als u naar de bovenrand wijst' },
});
export const GROOTTE_NAMEN: Readonly<Record<StrookGrootte, { uk: string; nl: string }>> = Object.freeze({
  klein: { uk: 'Малі', nl: 'Klein' },
  middel: { uk: 'Середні', nl: 'Middel' },
  groot: { uk: 'Великі', nl: 'Groot' },
});
/** Woorden van de eigenaar (03.11.2026): «лише піктограми / піктограми з написами / лише написи». */
export const LABEL_NAMEN: Readonly<Record<StrookLabel, { uk: string; nl: string }>> = Object.freeze({
  iconen: { uk: 'Лише піктограми', nl: 'Alleen pictogrammen' },
  beide: { uk: 'Піктограми з написами', nl: 'Pictogrammen met tekst' },
  tekst: { uk: 'Лише написи', nl: 'Alleen tekst' },
});

export const STROOK_MODI: readonly StrookModus[] = ['uitgeklapt', 'ingeklapt', 'auto'];
export const STROOK_GROOTTES: readonly StrookGrootte[] = ['klein', 'middel', 'groot'];
export const STROOK_LABELS: readonly StrookLabel[] = ['iconen', 'beide', 'tekst'];

/** Maakt van een willekeurige waarde (opslag, oude versie) een geldige voorkeur. Onbekende knoppen en waarden vallen weg. */
export function normaliseer(ruw: unknown, oudIngeklapt = false): StrookVoorkeur {
  const r = ruw && typeof ruw === 'object' ? (ruw as Record<string, unknown>) : {};
  const modus = STROOK_MODI.includes(r.modus as StrookModus) ? (r.modus as StrookModus) : oudIngeklapt ? 'ingeklapt' : STROOK_STANDAARD.modus;
  const grootte = STROOK_GROOTTES.includes(r.grootte as StrookGrootte) ? (r.grootte as StrookGrootte) : STROOK_STANDAARD.grootte;
  const label = STROOK_LABELS.includes(r.label as StrookLabel) ? (r.label as StrookLabel) : STROOK_STANDAARD.label;
  const knoppen = Array.isArray(r.knoppen)
    ? [...new Set(r.knoppen.filter((id): id is string => typeof id === 'string' && STROOK_KNOP_IDS.includes(id)))].slice(0, STROOK_MAX_KNOPPEN)
    : [...STROOK_STANDAARD_KNOPPEN];
  const laatsteInklap: InklapModus = r.laatsteInklap === 'ingeklapt' || r.laatsteInklap === 'auto' ? r.laatsteInklap : modus === 'ingeklapt' ? 'ingeklapt' : STROOK_STANDAARD.laatsteInklap;
  return { modus, grootte, label, knoppen, laatsteInklap };
}

type Opslag = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
const standaardOpslag = (): Opslag | null => {
  try { return typeof localStorage !== 'undefined' ? localStorage : null; } catch { return null; }
};

/** Leest de voorkeur; bestaat die nog niet, dan telt de oude «ingeklapt»-schakelaar mee. Geen opslag of kapotte JSON → standaard. */
export function leesVoorkeur(opslag: Pick<Storage, 'getItem'> | null = standaardOpslag()): StrookVoorkeur {
  if (!opslag) return normaliseer(null);
  try {
    const ruw = opslag.getItem(STROOK_SLEUTEL);
    if (ruw) return normaliseer(JSON.parse(ruw));
    return normaliseer(null, opslag.getItem(STROOK_OUDE_INKLAP_SLEUTEL) === '1');
  } catch {
    return normaliseer(null);
  }
}

/** Bewaart de voorkeur. Een geblokkeerde of volle opslag geeft geen fout; de keuze geldt dan tot het tabblad sluit. */
export function bewaarVoorkeur(v: StrookVoorkeur, opslag: Pick<Storage, 'setItem'> | null = standaardOpslag()): void {
  if (!opslag) return;
  try { opslag.setItem(STROOK_SLEUTEL, JSON.stringify(normaliseer(v))); } catch { /* geen opslag: niets bewaard */ }
}

/** Verplaatst een knop één plek naar links (-1) of rechts (+1) binnen de zichtbare knoppen. Buiten de rand: ongewijzigd. */
export function verplaats(v: StrookVoorkeur, id: string, richting: -1 | 1): StrookVoorkeur {
  const i = v.knoppen.indexOf(id);
  const j = i + richting;
  if (i < 0 || j < 0 || j >= v.knoppen.length) return v;
  const knoppen = [...v.knoppen];
  [knoppen[i], knoppen[j]] = [knoppen[j], knoppen[i]];
  return { ...v, knoppen };
}

/**
 * Zet een knop op een willekeurige plek (slepen, «На початок», «У кінець»): `plek` is de index in de lijst ZONDER de knop zelf
 * (0 = vooraan, lengte = achteraan; daarbuiten wordt begrensd). Staat de knop nog niet op de strook, dan komt hij erbij (tot het maximum).
 */
export function zetOp(v: StrookVoorkeur, id: string, plek: number): StrookVoorkeur {
  if (!STROOK_KNOP_IDS.includes(id)) return v;
  const zonder = v.knoppen.filter((x) => x !== id);
  if (zonder.length === v.knoppen.length && v.knoppen.length >= STROOK_MAX_KNOPPEN) return v;
  const p = Math.max(0, Math.min(Math.round(Number.isFinite(plek) ? plek : zonder.length), zonder.length));
  const knoppen = [...zonder.slice(0, p), id, ...zonder.slice(p)];
  return knoppen.join() === v.knoppen.join() ? v : { ...v, knoppen };
}

/**
 * Slepen: waar komt `sleep` terecht als hij op `doel` wordt losgelaten (`na` = in de tweede helft van het doel)? Geeft de `plek`
 * voor zetOp, of null als er niets verandert (zelfde knop, onbekend doel).
 */
export function dropPlek(knoppen: readonly string[], sleep: string, doel: string, na: boolean): number | null {
  if (sleep === doel) return null;
  const zonder = knoppen.filter((x) => x !== sleep);
  const j = zonder.indexOf(doel);
  if (j < 0) return null;
  return na ? j + 1 : j;
}

/** Zet een knop op de strook (aan: achteraan) of haalt hem eraf (uit). */
export function zetAan(v: StrookVoorkeur, id: string, aan: boolean): StrookVoorkeur {
  if (!STROOK_KNOP_IDS.includes(id)) return v;
  if (!aan) return { ...v, knoppen: v.knoppen.filter(x => x !== id) };
  if (v.knoppen.includes(id) || v.knoppen.length >= STROOK_MAX_KNOPPEN) return v;
  return { ...v, knoppen: [...v.knoppen, id] };
}

/** Zet de modus; een ingeklapte modus wordt ook onthouden als de modus van de knop «Згорнути». */
export const metModus = (v: StrookVoorkeur, m: StrookModus): StrookVoorkeur => ({ ...v, modus: m, laatsteInklap: m === 'uitgeklapt' ? v.laatsteInklap : m });

/**
 * Volgende modus bij de vaste modusknop: uitgeklapt → `terug` (de laatst gebruikte ingeklapte modus); ingeklapt of automatisch →
 * uitgeklapt (vastzetten, «Закріпити»).
 */
export const volgendeModus = (m: StrookModus, terug: InklapModus = 'ingeklapt'): StrookModus => (m === 'uitgeklapt' ? terug : 'uitgeklapt');

/** Lijst voor het instellingenpaneel: eerst de zichtbare knoppen in hun volgorde, daarna de rest (uitgeschakeld). */
export function paneelLijst(v: StrookVoorkeur): Array<{ id: string; aan: boolean }> {
  return [...v.knoppen.map(id => ({ id, aan: true })), ...STROOK_KNOP_IDS.filter(id => !v.knoppen.includes(id)).map(id => ({ id, aan: false }))];
}
