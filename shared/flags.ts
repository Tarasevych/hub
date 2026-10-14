// Feature flags (architectuur 13.10.2026, etap F). Eigen tabel op de eigen server, antwoord in de vorm van OpenFeature (OFREP).
//
// Waarom zo (en niet anders):
//  - Een vlag zet een FUNCTIE aan of uit (wat iemand ziet of kan proberen), NOOIT een recht. Rechten blijven op de server: sessie,
//    rollen, technisch profiel, OPA. tests/eenheid/flags.test.ts controleert dat geen autorisatiemodule deze code importeert.
//    Alternatief «vlag = recht» afgewezen: dan wordt een UI-schakelaar een toegangsbron die niemand als zodanig controleert.
//  - Eigen tabel in plaats van een externe dienst (LaunchDarkly, Unleash Cloud): BYOS — niets verlaat de server.
//  - Antwoord in OFREP-vorm (key, value, reason, variant, metadata): een OpenFeature-provider voor OFREP werkt met
//    baseUrl = https://<host>/api, zonder eigen SDK.
//  - Procent-uitrol per gebruiker met een vaste emmer (FNV-1a van sleutel + gebruiker): dezelfde persoon ziet bij 30 % altijd
//    hetzelfde, en verhogen naar 40 % neemt niemand iets af die het al had.
//  - Testers (recht flags.test) zetten een vlag alleen VOOR ZICHZELF en alleen tot het einde van hun technisch profiel.
import type { HelpLagen } from './tech-rollen';

export const SLEUTEL_RE = /^[a-z][a-z0-9-]{2,40}$/;
export const MAX_GEBRUIKERS = 200;

export type Vlag = {
  sleutel: string; omschrijving: string;
  /** Hoofdschakelaar: uit = voor iedereen uit (behalve een tester die het voor zichzelf test). */
  aan: boolean;
  /** Waarde voor wie niet in de lijst of de procent-uitrol valt. */
  standaard: boolean;
  /** 0 = geen uitrol; 1..100 = dit deel van de gebruikers krijgt «aan». */
  percentage: number;
  /** Gebruikers (id) die de vlag altijd aan hebben. */
  gebruikers: string[];
};

export type Reden = 'STATIC' | 'TARGETING_MATCH' | 'SPLIT' | 'DISABLED' | 'ERROR';
export type Uitkomst = {
  key: string; value: boolean; variant: 'aan' | 'uit'; reason: Reden;
  errorCode?: 'FLAG_NOT_FOUND';
  metadata?: { test?: boolean };
};

/** Vaste emmer 0..99 per (sleutel, gebruiker): FNV-1a 32-bit. Zelfde invoer = zelfde emmer, in de browser en op de server. */
export function emmer(sleutel: string, userId: string): number {
  let h = 0x811c9dc5;
  const s = `${sleutel}:${userId}`;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h % 100;
}

const uit = (key: string, value: boolean, reason: Reden, extra: Partial<Uitkomst> = {}): Uitkomst =>
  ({ key, value, variant: value ? 'aan' : 'uit', reason, ...extra });

/**
 * Waarde van één vlag voor één gebruiker. Volgorde:
 *  1. vlag bestaat niet          → false, ERROR / FLAG_NOT_FOUND (code die naar een oude vlag vraagt blijft werken: «uit»);
 *  2. eigen test van de tester   → die waarde, TARGETING_MATCH, metadata.test (ook als de hoofdschakelaar uit staat);
 *  3. hoofdschakelaar uit        → false, DISABLED;
 *  4. gebruiker in de lijst      → true, TARGETING_MATCH;
 *  5. procent-uitrol > 0         → emmer < percentage, SPLIT;
 *  6. anders                     → standaard, STATIC.
 */
export function evalueer(key: string, vlag: Vlag | undefined, userId: string, test?: boolean | null): Uitkomst {
  if (!vlag) return uit(key, false, 'ERROR', { errorCode: 'FLAG_NOT_FOUND' });
  if (typeof test === 'boolean') return uit(key, test, 'TARGETING_MATCH', { metadata: { test: true } });
  if (!vlag.aan) return uit(key, false, 'DISABLED');
  if (vlag.gebruikers.includes(userId)) return uit(key, true, 'TARGETING_MATCH');
  if (vlag.percentage > 0) return uit(key, emmer(vlag.sleutel, userId) < vlag.percentage, 'SPLIT');
  return uit(key, vlag.standaard, 'STATIC');
}

/** Controle van invoer bij opslaan (server). Geeft een foutcode of null. */
export function vlagFout(v: Partial<Vlag>): string | null {
  if (typeof v.sleutel !== 'string' || !SLEUTEL_RE.test(v.sleutel)) return 'SLEUTEL_ONGELDIG';
  if (typeof v.omschrijving !== 'string' || v.omschrijving.length > 300) return 'OMSCHRIJVING_ONGELDIG';
  if (typeof v.aan !== 'boolean' || typeof v.standaard !== 'boolean') return 'WAARDE_ONGELDIG';
  if (!Number.isInteger(v.percentage) || (v.percentage as number) < 0 || (v.percentage as number) > 100) return 'PERCENTAGE_ONGELDIG';
  if (!Array.isArray(v.gebruikers) || v.gebruikers.length > MAX_GEBRUIKERS) return 'GEBRUIKERS_ONGELDIG';
  return null;
}

export const HELP_FLAGS: HelpLagen = {
  wat: ['Прапорці вмикають нову функцію поступово: для себе, для вибраних людей або для частки користувачів.',
    'Vlaggen zetten een nieuwe functie stap voor stap aan: voor uzelf, voor gekozen mensen of voor een deel van de gebruikers.'],
  gevolg: ['Прапорець змінює лише те, що людина бачить або може спробувати. Прав він не дає й не забирає.',
    'Een vlag verandert alleen wat iemand ziet of kan proberen. Rechten geeft of neemt hij niet.'],
  risico: ['Вимкнений прапорець вимикає функцію для всіх одразу. Тестувальник бачить свій тест лише до кінця свого технічного профілю.',
    'Een uitgezette vlag zet de functie voor iedereen meteen uit. Een tester ziet zijn test alleen tot het einde van zijn technisch profiel.'],
  dev: ['Таблиця app.feature_flags на вашому сервері; відповідь у форматі OpenFeature OFREP: POST /api/ofrep/v1/evaluate/flags[/<ключ>]. Частка — постійний «кошик» FNV-1a(ключ:користувач) % 100. Порядок: тест тестувальника → головний перемикач → список → частка → типове значення.',
    'Tabel app.feature_flags op uw server; antwoord in OpenFeature-OFREP-vorm: POST /api/ofrep/v1/evaluate/flags[/<sleutel>]. Deel = vaste emmer FNV-1a(sleutel:gebruiker) % 100. Volgorde: test van de tester → hoofdschakelaar → lijst → deel → standaard.'],
};
