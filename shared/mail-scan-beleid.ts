// Herhaalbeleid van «Перевірка всіх адрес» (punt 15, 19.10.2026).
//
// Melding van de eigenaar: een controle van ≈19 731 berichten stopte bij 5 050 met «Не вдалося (HTTP_502)»; het venster kwam
// steeds terug en moest ≈101 keer met de hand op «Продовжити» worden geklikt, zonder keuze «продовжити / пропустити» en zonder
// «запам'ятати мій вибір». 5 050 / 50 berichten per pagina = 101 pagina's: élke pagina vroeg één klik.
//
// Twee oorzaken, beide hier opgelost:
//  1. HTTP_502 is GEEN serverfout van de controle maar de code die src/platform/client.ts aan een antwoord zonder foutcode geeft
//     (`HTTP_${status}`): de aanvraag naar de eigen server zelf kreeg 502 van de reverse proxy. De browser toonde dat als
//     «Не вдалося (HTTP_502)» en deed niets meer. Nu herhaalt de browser zelf, met een groeiende pauze.
//  2. backend/mail-afzenders.ts herhaalde alleen GOOGLE_MAIL_RATE_LIMITED (≤ 3) en GOOGLE_MAIL_PROVIDER_UNAVAILABLE (≤ 2);
//     elke andere tijdelijke fout zette de mailbox meteen op «fout». Nu dezelfde ladder als hieronder.
//
// Puur (geen I/O, geen DOM): dezelfde code beslist in de browser en op de server, en wordt los getest in
// tests/eenheid/contacten-hervatten-20261019.test.ts.

/** Wat na een mislukte pagina gebeurt. Wordt per gebruiker bewaard («запам'ятати вибір»). */
export type ScanBeleid =
  /** Altijd zelf verdergaan, zonder iets te vragen (standaard). */
  | 'automatisch'
  /** Zelf verdergaan; wat na alle pogingen blijft mislukken, overslaan en met de volgende mailbox doorgaan. */
  | 'overslaan'
  /** Vragen: het venster toont «Продовжити» en wacht op de gebruiker (het oude gedrag). */
  | 'vragen';

export const SCAN_BELEIDEN: readonly ScanBeleid[] = ['automatisch', 'overslaan', 'vragen'];
export const STANDAARD_SCAN_BELEID: ScanBeleid = 'automatisch';

/** Tekst bij elk beleid: [uk, nl] titel en [uk, nl] uitleg. */
export const SCAN_BELEID_TEKST: Record<ScanBeleid, { titel: [string, string]; uitleg: [string, string] }> = {
  automatisch: {
    titel: ['Продовжувати автоматично', 'Automatisch verdergaan'],
    uitleg: ['Після помилки перевірка сама повторює спробу з наростаючою паузою. Нічого натискати не треба.',
      'Na een fout probeert de controle het zelf opnieuw, met een groeiende pauze. U hoeft niets te doen.'],
  },
  overslaan: {
    titel: ['Пропускати проблемні', 'Problematische overslaan'],
    uitleg: ['Так само автоматично, але скриньку, яка так і не відповіла, буде пропущено — решта скриньок перевіряється далі.',
      'Ook automatisch, maar een mailbox die blijft weigeren wordt overgeslagen — de andere mailboxen gaan door.'],
  },
  vragen: {
    titel: ['Питати щоразу', 'Elke keer vragen'],
    uitleg: ['Перевірка зупиняється й чекає, доки ви натиснете «Продовжити».',
      'De controle stopt en wacht tot u op «Verdergaan» klikt.'],
  },
};

export function normaliseerScanBeleid(raw: unknown, terugval: ScanBeleid = STANDAARD_SCAN_BELEID): ScanBeleid {
  const v = String(raw ?? '').trim().toLowerCase();
  return (SCAN_BELEIDEN as readonly string[]).includes(v) ? (v as ScanBeleid) : terugval;
}

/**
 * Tijdelijke fouten: de volgende poging kan slagen zonder dat iemand iets verandert.
 *  - `HTTP_408/425/429/500/502/503/504/509/521/522/523/524` — de eigen server of de proxy ertussen (client.ts: `HTTP_<status>`).
 *  - `GOOGLE_MAIL_RATE_LIMITED` / `GOOGLE_MAIL_PROVIDER_UNAVAILABLE` / `GOOGLE_MAIL_REQUEST_FAILED` — Gmail (429, 5xx, 403-quota).
 *  - `SCAN_MISLUKT` — onbekende fout van één pagina (netwerk, time-out).
 *  - `NETWORK_ERROR` / `FETCH_MISLUKT` — de browser kreeg helemaal geen antwoord.
 * NIET tijdelijk (herhalen helpt nooit, de gebruiker moet iets doen): REAUTH_REQUIRED, SCOPE_REQUIRED, ACCOUNT_NOT_CONNECTED.
 */
export const SCAN_TIJDELIJKE_FOUTEN: readonly string[] = [
  'HTTP_408', 'HTTP_425', 'HTTP_429', 'HTTP_500', 'HTTP_502', 'HTTP_503', 'HTTP_504', 'HTTP_509', 'HTTP_521', 'HTTP_522', 'HTTP_523', 'HTTP_524',
  'GOOGLE_MAIL_RATE_LIMITED', 'GOOGLE_MAIL_PROVIDER_UNAVAILABLE', 'GOOGLE_MAIL_REQUEST_FAILED',
  'SCAN_MISLUKT', 'NETWORK_ERROR', 'FETCH_MISLUKT',
];
const BLIJVEND = /REAUTH_REQUIRED|SCOPE_REQUIRED|ACCOUNT_NOT_CONNECTED|STEP_UP|HTTP_40[14]$|HTTP_403$/;

/** Of code `code` een nieuwe poging waard is. */
export function isTijdelijkeScanFout(code: unknown): boolean {
  const c = String(code ?? '').trim().toUpperCase();
  if (!c || BLIJVEND.test(c)) return false;
  if ((SCAN_TIJDELIJKE_FOUTEN as readonly string[]).includes(c)) return true;
  // Elke 429/5xx van de eigen server of de proxy, ook een status die hier niet apart staat.
  const m = /^HTTP_(\d{3})$/.exec(c);
  return !!m && (m[1] === '429' || Number(m[1]) >= 500);
}

export const SCAN_BACKOFF_BASIS_MS = 2_000;
export const SCAN_BACKOFF_MAX_MS = 120_000;
export const SCAN_MAX_POGINGEN = 12;

/**
 * Pauze vóór poging `poging` (1 = de eerste herhaling): 2 s, 4 s, 8 s, 16 s, 32 s, 64 s, daarna 120 s.
 * Som over 12 pogingen ≈ 11 min — genoeg voor een herstart van de server of een Gmail-quotum, en nooit een oneindige lus.
 */
export function scanBackoffMs(poging: number, basis = SCAN_BACKOFF_BASIS_MS, max = SCAN_BACKOFF_MAX_MS): number {
  const n = Math.max(1, Math.min(SCAN_MAX_POGINGEN, Math.floor(poging) || 1));
  return Math.min(max, basis * 2 ** (n - 1));
}

/** Of poging `poging` nog mag (1-gebaseerd). */
export const scanMagHerhalen = (poging: number, max = SCAN_MAX_POGINGEN) => Math.floor(poging) <= max;

export type ScanHerhaalPlan =
  | { soort: 'herhaal'; poging: number; wachtMs: number }
  | { soort: 'overslaan'; code: string }
  | { soort: 'vragen'; code: string };

/**
 * Eén beslissing na een mislukte pagina/aanvraag. `poging` is het nummer van de volgende poging (1 na de eerste fout).
 * Blijvende fouten gaan altijd naar de gebruiker; bij `vragen` ook de tijdelijke.
 */
export function scanHerhaalPlan(code: unknown, poging: number, beleid: ScanBeleid = STANDAARD_SCAN_BELEID, max = SCAN_MAX_POGINGEN): ScanHerhaalPlan {
  const c = String(code ?? '').trim().toUpperCase() || 'SCAN_MISLUKT';
  if (!isTijdelijkeScanFout(c)) return { soort: 'vragen', code: c };
  if (beleid === 'vragen') return { soort: 'vragen', code: c };
  if (scanMagHerhalen(poging, max)) return { soort: 'herhaal', poging: Math.max(1, Math.floor(poging) || 1), wachtMs: scanBackoffMs(poging) };
  return beleid === 'overslaan' ? { soort: 'overslaan', code: c } : { soort: 'vragen', code: c };
}

/** «Повторюю через N с, спроба X з Y» (uk) / «Opnieuw over N s, poging X van Y» (nl). */
export function scanHerhaalZin(lang: 'uk' | 'nl', secondenOver: number, poging: number, max = SCAN_MAX_POGINGEN): string {
  const s = Math.max(0, Math.ceil(secondenOver));
  return lang === 'uk'
    ? `Повторюю через ${s} с · спроба ${poging} з ${max}`
    : `Opnieuw over ${s} s · poging ${poging} van ${max}`;
}
