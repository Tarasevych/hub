// Mail zoeken v2 (UI-009): pure hulpfuncties zonder React, apart getest (tests/eenheid/mail-zoeken-v2-20261029.test.ts).
// Het criteriamodel (src/mail-zoek.ts) blijft ongewijzigd; hier alleen weergave- en invoerlogica.
import type { MailSearchCriteria } from '../mail-zoek';

export type LeesModus = 'alle' | 'unread' | 'read';
/** Eén exclusieve keuze. Zoekmotor (client én server) filtert alleen bij precies één leesstatus; beide = geen filter = «alle». */
export const leesModus = (c: Pick<MailSearchCriteria, 'readState' | 'readStates'>): LeesModus => {
  const s = new Set([...(c.readStates || []), ...(c.readState ? [c.readState] : [])]);
  return s.size === 1 ? ([...s][0] as LeesModus) : 'alle';
};
export const metLeesModus = (m: LeesModus): Pick<MailSearchCriteria, 'readState' | 'readStates'> =>
  ({ readState: '', readStates: m === 'alle' ? [] : [m] });

/** Gmail-operators voor aanvulling in het tekstveld. */
export const GMAIL_OPERATOREN = ['from:', 'to:', 'subject:', 'has:attachment', 'filename:', 'newer_than:', 'older_than:', 'after:', 'before:', 'label:', 'in:', 'is:unread', 'is:read', 'is:starred', 'larger:', 'smaller:'] as const;
/** Voorstellen voor het laatste woord in de invoer (alleen bij een begin van minstens 1 teken). */
export const operatorVoorstellen = (invoer: string): string[] => {
  const l = (invoer.split(/\s+/).pop() || '').toLowerCase();
  if (!l) return [];
  return GMAIL_OPERATOREN.filter((o) => o.startsWith(l) && o !== l).slice(0, 6);
};
export const vulOperatorAan = (invoer: string, operator: string) => {
  const delen = invoer.split(/(\s+)/); delen[delen.length - 1] = operator; return delen.join('') + (operator.endsWith(':') ? '' : ' ');
};

/** Splits tekst in stukken met/zonder treffer (hoofdletterongevoelig), voor markering zonder innerHTML. */
export const markeer = (tekst: string, term: string): Array<{ t: string; hit: boolean }> => {
  const q = term.trim().toLocaleLowerCase();
  if (!q) return [{ t: tekst, hit: false }];
  const uit: Array<{ t: string; hit: boolean }> = []; const lower = tekst.toLocaleLowerCase(); let i = 0;
  for (;;) { const j = lower.indexOf(q, i); if (j < 0) break; if (j > i) uit.push({ t: tekst.slice(i, j), hit: false }); uit.push({ t: tekst.slice(j, j + q.length), hit: true }); i = j + q.length; }
  if (i < tekst.length) uit.push({ t: tekst.slice(i), hit: false });
  return uit;
};

/** Grootte: geldig = positief eindig getal; anders een foutcode voor de UI. */
export const grootteFout = (modus: string, waarde: string): '' | 'leeg' | 'ongeldig' => {
  if (!modus) return '';
  if (!String(waarde).trim()) return 'leeg';
  const n = Number(String(waarde).replace(',', '.'));
  return Number.isFinite(n) && n > 0 ? '' : 'ongeldig';
};
export const normaliseerGrootte = (waarde: string) => String(waarde).replace(',', '.').trim();

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
export type Voorinstelling = { id: '7' | '30' | '180' | '365'; uk: string; nl: string; dagen: number };
export const VOORINSTELLINGEN: Voorinstelling[] = [
  { id: '7', uk: '7 днів', nl: '7 dagen', dagen: 7 }, { id: '30', uk: '30 днів', nl: '30 dagen', dagen: 30 },
  { id: '180', uk: 'Пів року', nl: 'Halfjaar', dagen: 180 }, { id: '365', uk: 'Рік', nl: 'Jaar', dagen: 365 },
];
/** Zelfde betekenis als de bestaande snelle periodes (mail-datum-periodes.ts: «tot vandaag», dagen inclusief vandaag). */
export const voorinstellingBereik = (dagen: number, nu = new Date()) => {
  const tot = new Date(nu.getFullYear(), nu.getMonth(), nu.getDate());
  const van = new Date(tot.getFullYear(), tot.getMonth(), tot.getDate() - (dagen - 1));
  return { from: iso(van), to: iso(tot) };
};

/** Leesbare samenvatting van de gevormde periode. */
export const periodeTekst = (c: Pick<MailSearchCriteria, 'datePreset' | 'dateFrom' | 'dateTo' | 'dateMonth' | 'dateYear'>, lang: 'uk' | 'nl') => {
  const t = (uk: string, nl: string) => (lang === 'uk' ? uk : nl), loc = lang === 'uk' ? 'uk-UA' : 'nl-BE';
  const d = (v: string) => (v ? new Date(`${v}T00:00:00`).toLocaleDateString(loc, { day: 'numeric', month: 'short', year: 'numeric' }) : '…');
  if (c.datePreset === 'custom' && (c.dateFrom || c.dateTo)) return `${d(c.dateFrom)} — ${d(c.dateTo)}`;
  if (c.dateMonth || c.dateYear) {
    const m = c.dateMonth ? new Date(2024, c.dateMonth - 1, 1).toLocaleDateString(loc, { month: 'long' }) : '';
    return [m, c.dateYear ? String(c.dateYear) : c.dateMonth ? t('будь-який рік', 'elk jaar') : ''].filter(Boolean).join(' ');
  }
  if (c.datePreset && c.datePreset !== 'all') return c.datePreset;
  return '';
};

/** Grensstatus van het archief als één eenduidige toestand (vervangt vier betekenissen van «Межі не підтверджені»). */
export type GrensStand = 'laden' | 'bevestigd' | 'fout' | 'leeg' | 'onbekend';
export const grensStand = (f: { providerYearsChecking?: boolean; providerRefreshError?: boolean; providerMinDate?: number; providerMaxDate?: number; providerYearsComplete?: boolean; providerCheckedAt?: number }): GrensStand => {
  const heeft = Boolean(f.providerMinDate && (f.providerMaxDate || 0) >= (f.providerMinDate || 0));
  if (heeft && f.providerYearsComplete) return 'bevestigd';
  if (f.providerYearsChecking) return 'laden';
  if (f.providerRefreshError) return 'fout';
  if (f.providerCheckedAt) return 'leeg';
  return 'onbekend';
};

/** Concept vergelijken met wat al uitgevoerd is (voor de markering «є незастосовані зміни»). */
export const zelfdeConcept = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
