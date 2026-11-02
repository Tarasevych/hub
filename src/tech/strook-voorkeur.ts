// Voorkeuren van de technische strook (zoekronde 02.11.2026): modus (uitgeklapt / ingeklapt / automatisch), grootte van de
// pictogrammen, tekst bij de knoppen, en welke knoppen in welke volgorde op de strook staan. Alleen op dit apparaat (localStorage
// met try/catch); zonder opslag geldt de standaard. Zuiver en zonder React, zodat het getest kan worden (tests/eenheid).
export type StrookModus = 'uitgeklapt' | 'ingeklapt' | 'auto';
export type StrookGrootte = 'klein' | 'middel' | 'groot';
export type StrookLabel = 'iconen' | 'beide' | 'tekst';
export type StrookVoorkeur = { modus: StrookModus; grootte: StrookGrootte; label: StrookLabel; knoppen: string[] };

export const STROOK_SLEUTEL = 'mr-tech-strook';
/** De oude losse schakelaar («ingeklapt» ja/nee): wordt eenmalig gelezen en daarna niet meer geschreven. */
export const STROOK_OUDE_INKLAP_SLEUTEL = 'mr-tech-band-ingeklapt';
export const STROOK_MAX_KNOPPEN = 18;

/** Alle knoppen die op de strook kunnen staan. Vaste knop «⋯» (lijst) en «instellingen» staan altijd op de strook en zijn niet kiesbaar. */
export const STROOK_KNOP_IDS: readonly string[] = [
  'meldingen', 'wissel', 'inklap', 'uit',
  'beheer', 'api', 'uitrol', 'ai-beleid', 'account', 'terminal', 'remote', 'ssh', 'vlaggen', 'ondersteuning', 'profielen', 'verlengen', 'toegang', 'band',
];

/** Standaard: precies de knoppen die er vroeger al stonden (meldingen, ruimte wisselen, in- en uitklappen, afmelden). */
export const STROOK_STANDAARD_KNOPPEN: readonly string[] = ['meldingen', 'wissel', 'inklap', 'uit'];

export const STROOK_STANDAARD: StrookVoorkeur = { modus: 'uitgeklapt', grootte: 'middel', label: 'beide', knoppen: [...STROOK_STANDAARD_KNOPPEN] };

/** Namen per knop (uk, nl). De namen van de ⋯-lijst zijn dezelfde als de knoppen zelf. */
export const STROOK_NAMEN: Readonly<Record<string, { uk: string; nl: string }>> = Object.freeze({
  meldingen: { uk: 'Технічні сповіщення', nl: 'Technische meldingen' },
  wissel: { uk: 'Перемикання простору', nl: 'Ruimte wisselen' },
  inklap: { uk: 'Згорнути або розгорнути', nl: 'In- of uitklappen' },
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
export const GROOTTE_NAMEN: Readonly<Record<StrookGrootte, { uk: string; nl: string }>> = Object.freeze({
  klein: { uk: 'Малі', nl: 'Klein' },
  middel: { uk: 'Середні', nl: 'Middel' },
  groot: { uk: 'Великі', nl: 'Groot' },
});
export const LABEL_NAMEN: Readonly<Record<StrookLabel, { uk: string; nl: string }>> = Object.freeze({
  iconen: { uk: 'Лише значки', nl: 'Alleen pictogrammen' },
  beide: { uk: 'Значки з текстом', nl: 'Pictogrammen met tekst' },
  tekst: { uk: 'Лише текст', nl: 'Alleen tekst' },
});

const MODI: readonly StrookModus[] = ['uitgeklapt', 'ingeklapt', 'auto'];
const GROOTTES: readonly StrookGrootte[] = ['klein', 'middel', 'groot'];
const LABELS: readonly StrookLabel[] = ['iconen', 'beide', 'tekst'];

/** Maakt van een willekeurige waarde (opslag, oude versie) een geldige voorkeur. Onbekende knoppen en waarden vallen weg. */
export function normaliseer(ruw: unknown, oudIngeklapt = false): StrookVoorkeur {
  const r = ruw && typeof ruw === 'object' ? (ruw as Record<string, unknown>) : {};
  const modus = MODI.includes(r.modus as StrookModus) ? (r.modus as StrookModus) : oudIngeklapt ? 'ingeklapt' : STROOK_STANDAARD.modus;
  const grootte = GROOTTES.includes(r.grootte as StrookGrootte) ? (r.grootte as StrookGrootte) : STROOK_STANDAARD.grootte;
  const label = LABELS.includes(r.label as StrookLabel) ? (r.label as StrookLabel) : STROOK_STANDAARD.label;
  const knoppen = Array.isArray(r.knoppen)
    ? [...new Set(r.knoppen.filter((id): id is string => typeof id === 'string' && STROOK_KNOP_IDS.includes(id)))].slice(0, STROOK_MAX_KNOPPEN)
    : [...STROOK_STANDAARD_KNOPPEN];
  return { modus, grootte, label, knoppen };
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

/** Zet een knop op de strook (aan: achteraan) of haalt hem eraf (uit). */
export function zetAan(v: StrookVoorkeur, id: string, aan: boolean): StrookVoorkeur {
  if (!STROOK_KNOP_IDS.includes(id)) return v;
  if (!aan) return { ...v, knoppen: v.knoppen.filter(x => x !== id) };
  if (v.knoppen.includes(id) || v.knoppen.length >= STROOK_MAX_KNOPPEN) return v;
  return { ...v, knoppen: [...v.knoppen, id] };
}

/** Volgende modus bij de snelknop in- en uitklappen: uitgeklapt ↔ ingeklapt; «automatisch» klapt in tot ingeklapt. */
export const volgendeModus = (m: StrookModus): StrookModus => (m === 'uitgeklapt' ? 'ingeklapt' : 'uitgeklapt');

/** Lijst voor het instellingenpaneel: eerst de zichtbare knoppen in hun volgorde, daarna de rest (uitgeschakeld). */
export function paneelLijst(v: StrookVoorkeur): Array<{ id: string; aan: boolean }> {
  return [...v.knoppen.map(id => ({ id, aan: true })), ...STROOK_KNOP_IDS.filter(id => !v.knoppen.includes(id)).map(id => ({ id, aan: false }))];
}
