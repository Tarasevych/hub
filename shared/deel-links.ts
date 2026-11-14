// IDENTITEIT-015 (крок «delen»): строк дії посилання-запрошення до простору — одна таблиця для сервера й інтерфейсу.
// Looptijd van een uitnodigingslink: 1, 7 of 30 dagen. De server aanvaardt alleen deze waarden (geen vrije invoer), de
// interface toont dezelfde keuzes. Zonder keuze (oude aanroepers) geldt 7 dagen — zoals vroeger de vaste INVITE_SECONDS.
// Zuiver en zonder imports: ook in de browser bruikbaar.

export const LINK_DAGEN = [1, 7, 30] as const;
export type LinkDagen = (typeof LINK_DAGEN)[number];
export const STANDAARD_LINK_DAGEN: LinkDagen = 7;
/** Bovengrens in seconden (30 dagen): de server kapt nooit iets langer af, hij weigert het. */
export const LINK_MAX_SECONDEN = 30 * 24 * 60 * 60;

/** Gevalideerde looptijd; null = ongeldige invoer (de server antwoordt dan 400 SHARE_LINK_DAYS_INVALID). Leeg = standaard. */
export function linkDagen(invoer: unknown): LinkDagen | null {
  if (invoer === undefined || invoer === null || invoer === '') return STANDAARD_LINK_DAGEN;
  const n = typeof invoer === 'number' ? invoer : typeof invoer === 'string' && /^\d{1,3}$/.test(invoer.trim()) ? Number(invoer.trim()) : NaN;
  return (LINK_DAGEN as readonly number[]).includes(n) ? (n as LinkDagen) : null;
}

/** «1 день / 7 днів / 30 днів» — «1 dag / 7 dagen / 30 dagen». */
export function dagenTekst(lang: 'uk' | 'nl', n: number): string {
  if (lang === 'nl') return n === 1 ? '1 dag' : `${n} dagen`;
  const m10 = n % 10, m100 = n % 100;
  const woord = m10 === 1 && m100 !== 11 ? 'день' : m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14) ? 'дні' : 'днів';
  return `${n} ${woord}`;
}

/** Datum en tijd van verlopen, in de taal van de mens (lokale tijdzone van de browser). Ongeldig → '—'. */
export function vervalTekst(lang: 'uk' | 'nl', moment: string | number | null | undefined): string {
  if (moment === null || moment === undefined || moment === '') return lang === 'uk' ? 'без строку' : 'zonder einddatum';
  const d = new Date(moment);
  if (Number.isNaN(d.getTime())) return '—';
  try { return d.toLocaleString(lang === 'uk' ? 'uk-UA' : 'nl-NL', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' }); }
  catch { return d.toISOString().slice(0, 16).replace('T', ' '); }
}
