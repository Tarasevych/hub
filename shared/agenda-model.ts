// Het ENE agendamodel van de site: dezelfde zuivere regels in de browser (src/agenda/Agenda.tsx) en op de
// server (backend/agenda-google.ts, backend/agenda-ics.ts, backend/agenda-caldav.ts). Geen React, geen DOM,
// geen Node — alleen functies zonder bijwerking, zodat de browser nooit iets voorstelt wat de server weigert.
//
// WAARHEIDSBRON BIJ EEN CONFLICT (de hele tweewegkoppeling hangt hieraan):
//   1. Google is de bron van waarheid voor elke afspraak die al in Google staat. Onze tabel
//      `google_suite_calendar_events_v1` is een SPIEGEL (cache), nooit het origineel.
//   2. Elke wijziging die wij versturen gaat met `If-Match: <etag>` van de versie die wij kenden. Geeft Google
//      412 terug, dan is de afspraak in Google veranderd nadat wij haar lazen: we overschrijven NIETS, we halen
//      de verse Google-versie op en geven die met code AGENDA_CONFLICT terug. De mens (of de AI met zijn
//      bevestiging) beslist wat er gebeurt — de server verzint geen samenvoeging.
//   3. Een afspraak die hier is gemaakt en Google nog niet heeft bereikt, is zolang LOKAAL van ons
//      (app.agenda_koppeling.waarheidsbron = 'lokaal'). Zodra de insert lukt, staat daar 'google'.
//   4. ICS-abonnementen en CalDAV zijn in deze versie LEZEN: hun bron is altijd de aanbieder; wij schrijven
//      daar niets terug (zie AGENDA_CALDAV_SCHRIJVEN_ONTBREEKT in shared/agenda-caldav-model.ts).
export const WAARHEIDSBRON = Object.freeze({
  google: 'google_is_bron_bij_conflict_etag_if_match',
  lokaal: 'lokaal_tot_de_eerste_geslaagde_insert',
  extern: 'ics_en_caldav_zijn_alleen_lezen',
} as const);

export type Taal = 'uk' | 'nl';
export type Tweetalig = readonly [string, string];
export const agendaTekst = (paar: Tweetalig, taal: Taal) => (taal === 'uk' ? paar[0] : paar[1]);

// ---------------------------------------------------------------------------------------------- weergaven
export type AgendaWeergave = 'maand' | 'week' | 'dag' | 'lijst';
export const WEERGAVEN: readonly AgendaWeergave[] = Object.freeze(['maand', 'week', 'dag', 'lijst'] as const);
export const WEERGAVE_LABEL: Record<AgendaWeergave, Tweetalig> = Object.freeze({
  maand: ['Місяць', 'Maand'], week: ['Тиждень', 'Week'], dag: ['День', 'Dag'], lijst: ['Порядок денний', 'Agenda'],
});
export const geldigeWeergave = (value: unknown): AgendaWeergave =>
  WEERGAVEN.includes(value as AgendaWeergave) ? (value as AgendaWeergave) : 'maand';

// ---------------------------------------------------------------------------------------------- grenzen
export const MAX_TITEL = 300;
export const MAX_BESCHRIJVING = 8000;
export const MAX_LOCATIE = 500;
export const MAX_DEELNEMERS = 50;
export const MAX_HERINNERINGEN = 5;
/** Google weigert meer dan 5 overrides en herinneringen verder dan 4 weken (40320 minuten) vooruit. */
export const MAX_HERINNERING_MINUTEN = 40320;

const kort = (value: unknown, max: number) => String(value ?? '').replace(/\u0000/g, '').trim().slice(0, max);
const geheel = (value: unknown, min: number, max: number, standaard: number) => {
  const n = Math.trunc(Number(value));
  return Number.isFinite(n) && n >= min && n <= max ? n : standaard;
};

// ---------------------------------------------------------------------------------------------- herhaling (RRULE)
export type Frequentie = 'geen' | 'dagelijks' | 'wekelijks' | 'maandelijks' | 'jaarlijks';
export type Weekdag = 'MO' | 'TU' | 'WE' | 'TH' | 'FR' | 'SA' | 'SU';
export const WEEKDAGEN: readonly Weekdag[] = Object.freeze(['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'] as const);
export const WEEKDAG_LABEL: Record<Weekdag, Tweetalig> = Object.freeze({
  MO: ['Пн', 'ma'], TU: ['Вт', 'di'], WE: ['Ср', 'wo'], TH: ['Чт', 'do'], FR: ['Пт', 'vr'], SA: ['Сб', 'za'], SU: ['Нд', 'zo'],
});
export const FREQUENTIES: readonly Frequentie[] = Object.freeze(['geen', 'dagelijks', 'wekelijks', 'maandelijks', 'jaarlijks'] as const);
export const FREQUENTIE_LABEL: Record<Frequentie, Tweetalig> = Object.freeze({
  geen: ['Не повторювати', 'Niet herhalen'], dagelijks: ['Щодня', 'Dagelijks'], wekelijks: ['Щотижня', 'Wekelijks'],
  maandelijks: ['Щомісяця', 'Maandelijks'], jaarlijks: ['Щороку', 'Jaarlijks'],
});
const FREQ_RRULE: Record<Exclude<Frequentie, 'geen'>, string> = { dagelijks: 'DAILY', wekelijks: 'WEEKLY', maandelijks: 'MONTHLY', jaarlijks: 'YEARLY' };

/** Basisherhaling: FREQ, INTERVAL, COUNT óf UNTIL, en BYDAY bij wekelijks. Genoeg voor «elke dinsdag, 10 keer». */
export type Herhaling = {
  frequentie: Frequentie;
  /** 1–999. */
  interval: number;
  /** 0 = geen einde door aantal. */
  aantal: number;
  /** '' of een ISO-datum (YYYY-MM-DD): het laatste moment waarop de reeks nog voorkomt. */
  tot: string;
  /** Alleen bij 'wekelijks'; leeg = de dag van de begindatum. */
  dagen: Weekdag[];
};
export const legeHerhaling = (): Herhaling => ({ frequentie: 'geen', interval: 1, aantal: 0, tot: '', dagen: [] });

export function normaliseerHerhaling(waarde: unknown): Herhaling {
  const bron = (waarde && typeof waarde === 'object' ? waarde : {}) as Record<string, unknown>;
  const frequentie = FREQUENTIES.includes(bron.frequentie as Frequentie) ? (bron.frequentie as Frequentie) : 'geen';
  if (frequentie === 'geen') return legeHerhaling();
  const dagen = Array.isArray(bron.dagen)
    ? [...new Set(bron.dagen.map((d) => String(d || '').toUpperCase()).filter((d): d is Weekdag => WEEKDAGEN.includes(d as Weekdag)))]
      .sort((a, b) => WEEKDAGEN.indexOf(a) - WEEKDAGEN.indexOf(b))
    : [];
  const aantal = geheel(bron.aantal, 0, 730, 0);
  const tot = /^\d{4}-\d{2}-\d{2}$/.test(String(bron.tot || '')) ? String(bron.tot) : '';
  // COUNT en UNTIL sluiten elkaar uit (RFC 5545 §3.3.10); aantal gaat voor, want dat is wat de gebruiker intikte.
  return { frequentie, interval: geheel(bron.interval, 1, 999, 1), aantal, tot: aantal ? '' : tot, dagen: frequentie === 'wekelijks' ? dagen : [] };
}

/** RRULE-regel zoals Google haar in `recurrence` verwacht, of '' bij 'geen'. */
export function rruleUitHerhaling(waarde: unknown): string {
  const h = normaliseerHerhaling(waarde);
  if (h.frequentie === 'geen') return '';
  const delen = [`FREQ=${FREQ_RRULE[h.frequentie]}`];
  if (h.interval > 1) delen.push(`INTERVAL=${h.interval}`);
  if (h.aantal > 0) delen.push(`COUNT=${h.aantal}`);
  else if (h.tot) delen.push(`UNTIL=${h.tot.replace(/-/g, '')}T235959Z`);
  if (h.frequentie === 'wekelijks' && h.dagen.length) delen.push(`BYDAY=${h.dagen.join(',')}`);
  return `RRULE:${delen.join(';')}`;
}

/** Terug uit een RRULE-regel. Onbekende onderdelen (BYSETPOS, BYMONTHDAY, …) worden genegeerd, niet verzonnen. */
export function herhalingUitRrule(regel: unknown): Herhaling {
  const ruw = kort(regel, 600).replace(/^RRULE:/i, '');
  if (!ruw) return legeHerhaling();
  const kaart = new Map<string, string>();
  for (const stuk of ruw.split(';')) { const [k, v] = stuk.split('='); if (k && v) kaart.set(k.trim().toUpperCase(), v.trim()); }
  const freq = (Object.entries(FREQ_RRULE).find(([, v]) => v === (kaart.get('FREQ') || '').toUpperCase()) || [])[0] as Frequentie | undefined;
  if (!freq) return legeHerhaling();
  const until = kaart.get('UNTIL') || '';
  const totMatch = /^(\d{4})(\d{2})(\d{2})/.exec(until);
  return normaliseerHerhaling({
    frequentie: freq,
    interval: kaart.get('INTERVAL') || 1,
    aantal: kaart.get('COUNT') || 0,
    tot: totMatch ? `${totMatch[1]}-${totMatch[2]}-${totMatch[3]}` : '',
    dagen: (kaart.get('BYDAY') || '').split(',').map((d) => d.replace(/^[-+]?\d+/, '')),
  });
}

/** Hoe de herhaling in gewone woorden heet (de kaart in het venster laat dit zien, zodat niemand RRULE hoeft te lezen). */
export function herhalingUitleg(h: Herhaling, taal: Taal): string {
  if (h.frequentie === 'geen') return agendaTekst(FREQUENTIE_LABEL.geen, taal);
  const basis = agendaTekst(FREQUENTIE_LABEL[h.frequentie], taal);
  const delen = [h.interval > 1 ? (taal === 'uk' ? `${basis.toLowerCase()} (кожні ${h.interval})` : `${basis.toLowerCase()} (elke ${h.interval})`) : basis];
  if (h.frequentie === 'wekelijks' && h.dagen.length) delen.push(h.dagen.map((d) => agendaTekst(WEEKDAG_LABEL[d], taal)).join(', '));
  if (h.aantal > 0) delen.push(taal === 'uk' ? `${h.aantal} раз(ів)` : `${h.aantal} keer`);
  else if (h.tot) delen.push(taal === 'uk' ? `до ${h.tot}` : `tot ${h.tot}`);
  return delen.join(' · ');
}

// ---------------------------------------------------------------------------------------------- herinneringen
export type HerinneringMethode = 'popup' | 'email';
export type Herinnering = { methode: HerinneringMethode; minuten: number };
export const HERINNERING_KEUZES: readonly number[] = Object.freeze([0, 5, 10, 15, 30, 60, 120, 1440, 2880, 10080]);
export const HERINNERING_METHODE_LABEL: Record<HerinneringMethode, Tweetalig> = Object.freeze({
  popup: ['Повідомлення', 'Melding'], email: ['Лист', 'E-mail'],
});
export function normaliseerHerinneringen(waarde: unknown): Herinnering[] {
  if (!Array.isArray(waarde)) return [];
  const uit: Herinnering[] = [];
  for (const item of waarde) {
    const rij = (item && typeof item === 'object' ? item : {}) as Record<string, unknown>;
    const methode: HerinneringMethode = rij.methode === 'email' ? 'email' : 'popup';
    const minuten = geheel(rij.minuten, 0, MAX_HERINNERING_MINUTEN, -1);
    if (minuten < 0) continue;
    if (uit.some((h) => h.methode === methode && h.minuten === minuten)) continue;
    uit.push({ methode, minuten });
    if (uit.length >= MAX_HERINNERINGEN) break;
  }
  return uit;
}
export function herinneringUitleg(minuten: number, taal: Taal): string {
  if (minuten === 0) return taal === 'uk' ? 'у момент початку' : 'op het moment zelf';
  if (minuten % 1440 === 0) return taal === 'uk' ? `за ${minuten / 1440} дн.` : `${minuten / 1440} dag(en) ervoor`;
  if (minuten % 60 === 0) return taal === 'uk' ? `за ${minuten / 60} год.` : `${minuten / 60} uur ervoor`;
  return taal === 'uk' ? `за ${minuten} хв.` : `${minuten} minuten ervoor`;
}

// ---------------------------------------------------------------------------------------------- deelnemers en RSVP
export type Antwoord = 'needsAction' | 'accepted' | 'tentative' | 'declined';
export const ANTWOORDEN: readonly Antwoord[] = Object.freeze(['needsAction', 'accepted', 'tentative', 'declined'] as const);
export const ANTWOORD_LABEL: Record<Antwoord, Tweetalig> = Object.freeze({
  needsAction: ['Без відповіді', 'Geen antwoord'], accepted: ['Буду', 'Ja'], tentative: ['Можливо', 'Misschien'], declined: ['Не буду', 'Nee'],
});
export const geldigAntwoord = (value: unknown): Antwoord => (ANTWOORDEN.includes(value as Antwoord) ? (value as Antwoord) : 'needsAction');
/** Bewust streng maar eenvoudig: één @, geen spaties, een punt in het domein. Google weigert de rest zelf ook. */
export const EPOST = /^[^\s@,;:<>"]{1,64}@[^\s@,;:<>".]{1,63}(\.[^\s@,;:<>".]{1,63})+$/;
export type Deelnemer = { email: string; naam: string; antwoord: Antwoord; optioneel: boolean; zelf: boolean; organisator: boolean };
export function normaliseerDeelnemers(waarde: unknown): Deelnemer[] {
  if (!Array.isArray(waarde)) return [];
  const uit: Deelnemer[] = [];
  for (const item of waarde) {
    const rij = (item && typeof item === 'object' ? item : { email: item }) as Record<string, unknown>;
    const email = kort(rij.email, 320).toLowerCase();
    if (!EPOST.test(email) || uit.some((d) => d.email === email)) continue;
    uit.push({
      email, naam: kort(rij.naam ?? rij.displayName, 300), antwoord: geldigAntwoord(rij.antwoord ?? rij.responseStatus),
      optioneel: Boolean(rij.optioneel ?? rij.optional), zelf: Boolean(rij.zelf ?? rij.self), organisator: Boolean(rij.organisator ?? rij.organizer),
    });
    if (uit.length >= MAX_DEELNEMERS) break;
  }
  return uit;
}

// ---------------------------------------------------------------------------------------------- tijdzones
/** Korte lijst voor de keuzelijst; `geldigeTijdzone` laat elke IANA-naam door die de omgeving kent. */
export const TIJDZONES: readonly string[] = Object.freeze([
  'Europe/Kiev', 'Europe/Kyiv', 'Europe/Brussels', 'Europe/Amsterdam', 'Europe/Berlin', 'Europe/London',
  'Europe/Lisbon', 'Europe/Warsaw', 'Europe/Madrid', 'Europe/Rome', 'Europe/Istanbul', 'UTC',
  'America/New_York', 'America/Chicago', 'America/Los_Angeles', 'Asia/Dubai', 'Asia/Jerusalem', 'Asia/Tokyo', 'Australia/Sydney',
]);
const TIJDZONE_VORM = /^(UTC|[A-Za-z][A-Za-z_+-]{1,20}(\/[A-Za-z0-9][A-Za-z0-9_+-]{1,30}){1,2})$/;
/** Een naam die de omgeving echt kent; anders de meegegeven terugval (standaard UTC). Nooit iets verzinnen. */
export function geldigeTijdzone(waarde: unknown, terugval = 'UTC'): string {
  const naam = kort(waarde, 80);
  if (!naam || !TIJDZONE_VORM.test(naam)) return terugval;
  try { new Intl.DateTimeFormat('en-GB', { timeZone: naam }); return naam; } catch { return terugval; }
}
export function huidigeTijdzone(terugval = 'UTC'): string {
  try { return geldigeTijdzone(new Intl.DateTimeFormat().resolvedOptions().timeZone, terugval); } catch { return terugval; }
}

// ---------------------------------------------------------------------------------------------- de afspraak zelf
export type AgendaVorm = {
  /** Google-agenda waarin de afspraak staat ('primary' = de hoofdagenda). */
  agendaId: string;
  /** Leeg bij een nieuwe afspraak. */
  gebeurtenisId: string;
  /** De versie die wij kenden; gaat als If-Match mee bij wijzigen en wissen. Leeg = nog geen versie gezien. */
  etag: string;
  titel: string;
  beschrijving: string;
  locatie: string;
  heleDag: boolean;
  /** heleDag: 'YYYY-MM-DD'. Anders een plaatselijke tijd 'YYYY-MM-DDTHH:MM' in `tijdzone`. */
  begin: string;
  einde: string;
  tijdzone: string;
  deelnemers: Deelnemer[];
  herhaling: Herhaling;
  herinneringen: Herinnering[];
  /** true = de standaardherinneringen van de agenda gebruiken (dan telt `herinneringen` niet). */
  standaardHerinneringen: boolean;
};
const DATUM = /^\d{4}-\d{2}-\d{2}$/;
const PLAATSELIJK = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;

export const legeVorm = (tijdzone = huidigeTijdzone()): AgendaVorm => ({
  agendaId: 'primary', gebeurtenisId: '', etag: '', titel: '', beschrijving: '', locatie: '',
  heleDag: false, begin: '', einde: '', tijdzone: geldigeTijdzone(tijdzone), deelnemers: [],
  herhaling: legeHerhaling(), herinneringen: [], standaardHerinneringen: true,
});

export function normaliseerVorm(waarde: unknown): AgendaVorm {
  const bron = (waarde && typeof waarde === 'object' ? waarde : {}) as Record<string, unknown>;
  const heleDag = Boolean(bron.heleDag);
  const vorm: AgendaVorm = {
    agendaId: kort(bron.agendaId, 500) || 'primary',
    gebeurtenisId: kort(bron.gebeurtenisId, 1024),
    etag: kort(bron.etag, 200),
    titel: kort(bron.titel, MAX_TITEL),
    beschrijving: kort(bron.beschrijving, MAX_BESCHRIJVING),
    locatie: kort(bron.locatie, MAX_LOCATIE),
    heleDag,
    begin: kort(bron.begin, 40),
    einde: kort(bron.einde, 40),
    tijdzone: geldigeTijdzone(bron.tijdzone),
    deelnemers: normaliseerDeelnemers(bron.deelnemers),
    herhaling: normaliseerHerhaling(bron.herhaling),
    herinneringen: normaliseerHerinneringen(bron.herinneringen),
    standaardHerinneringen: bron.standaardHerinneringen === undefined ? true : Boolean(bron.standaardHerinneringen),
  };
  if (vorm.standaardHerinneringen) vorm.herinneringen = [];
  return vorm;
}

/** Foutcodes (niet teksten): de browser en de server gebruiken dezelfde, de pagina vertaalt ze. */
export const VORM_FOUTEN = Object.freeze({
  titel: 'AGENDA_TITEL_VEREIST', begin: 'AGENDA_BEGIN_ONGELDIG', einde: 'AGENDA_EINDE_ONGELDIG',
  orde: 'AGENDA_EINDE_VOOR_BEGIN', tijdzone: 'AGENDA_TIJDZONE_ONGELDIG',
} as const);
export function vormFouten(waarde: unknown): string[] {
  const v = normaliseerVorm(waarde), fouten: string[] = [];
  if (!v.titel) fouten.push(VORM_FOUTEN.titel);
  const vorm = v.heleDag ? DATUM : PLAATSELIJK;
  if (!vorm.test(v.begin)) fouten.push(VORM_FOUTEN.begin);
  if (!vorm.test(v.einde)) fouten.push(VORM_FOUTEN.einde);
  if (vorm.test(v.begin) && vorm.test(v.einde)) {
    // Hele dag: Google's `end.date` is exclusief, dus einde mag gelijk zijn aan begin (één dag) maar niet eerder.
    if (v.heleDag ? v.einde < v.begin : v.einde <= v.begin) fouten.push(VORM_FOUTEN.orde);
  }
  if (!v.heleDag && geldigeTijdzone(v.tijdzone, '') === '') fouten.push(VORM_FOUTEN.tijdzone);
  return fouten;
}

/** Het lichaam dat naar Google gaat (events.insert / events.update). Alleen velden die wij werkelijk beheren. */
export function naarGoogleLichaam(waarde: unknown): Record<string, unknown> {
  const v = normaliseerVorm(waarde);
  const grens = (datum: string) => (v.heleDag
    ? { date: datum }
    : { dateTime: `${datum}:00`, timeZone: v.tijdzone });
  // Hele dag: Google wil een EXCLUSIEF einde (één dag = einde is de volgende dag).
  const eindDatum = v.heleDag ? volgendeDag(v.einde || v.begin) : v.einde;
  const lichaam: Record<string, unknown> = {
    summary: v.titel,
    description: v.beschrijving || undefined,
    location: v.locatie || undefined,
    start: grens(v.begin),
    end: grens(eindDatum),
  };
  if (v.deelnemers.length) {
    lichaam.attendees = v.deelnemers.map((d) => ({
      email: d.email, ...(d.naam ? { displayName: d.naam } : {}), ...(d.optioneel ? { optional: true } : {}),
      ...(d.antwoord !== 'needsAction' ? { responseStatus: d.antwoord } : {}),
    }));
  }
  const rrule = rruleUitHerhaling(v.herhaling);
  if (rrule) lichaam.recurrence = [rrule];
  lichaam.reminders = v.standaardHerinneringen
    ? { useDefault: true }
    : { useDefault: false, overrides: v.herinneringen.map((h) => ({ method: h.methode, minutes: h.minuten })) };
  return Object.fromEntries(Object.entries(lichaam).filter(([, value]) => value !== undefined));
}

/** 'YYYY-MM-DD' → de volgende dag. Zuiver, zonder tijdzone (hele-dag-afspraken hebben er geen). */
export function volgendeDag(datum: string): string {
  if (!DATUM.test(datum)) return datum;
  const d = new Date(`${datum}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}
export function vorigeDag(datum: string): string {
  if (!DATUM.test(datum)) return datum;
  const d = new Date(`${datum}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

export type GoogleGebeurtenis = Record<string, unknown>;
/** Uit een Google-afspraak terug naar de vorm van het venster. */
export function uitGoogleGebeurtenis(gebeurtenis: GoogleGebeurtenis, agendaId = 'primary'): AgendaVorm {
  const g = (gebeurtenis && typeof gebeurtenis === 'object' ? gebeurtenis : {}) as Record<string, unknown>;
  const start = (g.start || {}) as Record<string, unknown>, eind = (g.end || {}) as Record<string, unknown>;
  const heleDag = Boolean(start.date && !start.dateTime);
  const herinneringen = (g.reminders || {}) as Record<string, unknown>;
  const overrides = Array.isArray(herinneringen.overrides) ? herinneringen.overrides : [];
  return normaliseerVorm({
    agendaId: kort(g.organizerCalendarId ?? agendaId, 500) || 'primary',
    gebeurtenisId: kort(g.id, 1024),
    etag: kort(g.etag, 200),
    titel: kort(g.summary, MAX_TITEL),
    beschrijving: kort(g.description, MAX_BESCHRIJVING),
    locatie: kort(g.location, MAX_LOCATIE),
    heleDag,
    begin: heleDag ? kort(start.date, 20) : kort(start.dateTime, 40).slice(0, 16),
    einde: heleDag ? vorigeDag(kort(eind.date, 20)) : kort(eind.dateTime, 40).slice(0, 16),
    tijdzone: geldigeTijdzone(start.timeZone ?? eind.timeZone),
    deelnemers: Array.isArray(g.attendees) ? g.attendees.map((item) => {
      const rij = (item || {}) as Record<string, unknown>;
      return { email: rij.email, naam: rij.displayName, antwoord: rij.responseStatus, optioneel: rij.optional, zelf: rij.self, organisator: rij.organizer };
    }) : [],
    herhaling: herhalingUitRrule(Array.isArray(g.recurrence) ? g.recurrence.find((r) => /^RRULE:/i.test(String(r || ''))) : ''),
    herinneringen: overrides.map((item) => { const rij = (item || {}) as Record<string, unknown>; return { methode: rij.method, minuten: rij.minutes }; }),
    standaardHerinneringen: herinneringen.useDefault === undefined ? true : Boolean(herinneringen.useDefault),
  });
}

// ---------------------------------------------------------------------------------------------- idempotentie
/**
 * Een schrijfactie draagt altijd een sleutel van de aanroeper mee. Daarmee is dezelfde aanroep twee keer
 * versturen (netwerk hapert, de AI probeert opnieuw) ONSCHADELIJK:
 *   • bij aanmaken leiden we het Google-gebeurtenis-id uit de sleutel af (events.insert met eigen id). Google
 *     weigert een tweede insert met hetzelfde id (409) — dan geven wij de bestaande afspraak terug als «ok».
 *   • bij wijzigen/wissen staat de sleutel in app.agenda_koppeling: de tweede poging vindt de uitslag van de
 *     eerste en verstuurt niets.
 */
export const IDEMPOTENTIE_SLEUTEL = /^[A-Za-z0-9_-]{8,120}$/;
/** base32hex (RFC 2938 §3.1.2): alleen a–v en 0–9, 5–1024 tekens. sha256-hex past daar volledig in. */
export const GOOGLE_GEBEURTENIS_ID = /^[0-9a-v]{5,1024}$/;
/** `digestHex` = sha256 van (sleutel + eigenaar), door de aanroeper berekend (node:crypto op de server). */
export function gebeurtenisIdUitDigest(digestHex: unknown): string {
  const hex = kort(digestHex, 200).toLowerCase();
  if (!/^[0-9a-f]{32,128}$/.test(hex)) return '';
  const id = `mr${hex}`.slice(0, 1024);
  return GOOGLE_GEBEURTENIS_ID.test(id) ? id : '';
}

// ---------------------------------------------------------------------------------------------- conflicten
export type SchrijfUitslag = 'ok' | 'conflict' | 'weg' | 'bestaat' | 'geen-recht' | 'fout';
export const AGENDA_FOUT = Object.freeze({
  conflict: 'AGENDA_CONFLICT', weg: 'AGENDA_GEBEURTENIS_WEG', recht: 'AGENDA_SCHRIJFRECHT_ONTBREEKT',
  sleutel: 'AGENDA_IDEMPOTENTIE_SLEUTEL_ONGELDIG', agenda: 'AGENDA_ID_ONGELDIG', fout: 'AGENDA_SCHRIJVEN_MISLUKT',
} as const);
/** Wat een HTTP-antwoord van Google voor ons betekent. 412 = iemand anders was eerder; 404/410 = weg; 409 = bestaat al. */
export function schrijfUitslag(status: number): SchrijfUitslag {
  if (status >= 200 && status < 300) return 'ok';
  if (status === 412) return 'conflict';
  if (status === 404 || status === 410) return 'weg';
  if (status === 409) return 'bestaat';
  if (status === 401 || status === 403) return 'geen-recht';
  return 'fout';
}

// ---------------------------------------------------------------------------------------------- raster voor de pagina
const dagVan = (iso: string) => new Date(`${iso}T00:00:00Z`);
export const isoDag = (d: Date) => d.toISOString().slice(0, 10);
/** Maandag als eerste dag van de week (Oekraïne en Nederland doen dat beide). */
export function weekBegin(datum: string): string {
  const d = dagVan(datum);
  const verschuiving = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - verschuiving);
  return isoDag(d);
}
export function weekDagen(datum: string): string[] {
  const begin = dagVan(weekBegin(datum));
  return Array.from({ length: 7 }, (_, i) => { const d = new Date(begin); d.setUTCDate(d.getUTCDate() + i); return isoDag(d); });
}
/** Zes volle weken rond een maand: altijd 42 dagen, zodat het raster niet verspringt. */
export function maandRaster(jaar: number, maand: number): string[][] {
  const eerste = `${String(jaar).padStart(4, '0')}-${String(maand).padStart(2, '0')}-01`;
  const begin = dagVan(weekBegin(eerste));
  return Array.from({ length: 6 }, (_, w) => Array.from({ length: 7 }, (_, d) => {
    const dag = new Date(begin); dag.setUTCDate(dag.getUTCDate() + w * 7 + d); return isoDag(dag);
  }));
}
export function maandVerschuiven(jaar: number, maand: number, stap: number): { jaar: number; maand: number } {
  const totaal = jaar * 12 + (maand - 1) + stap;
  return { jaar: Math.floor(totaal / 12), maand: (totaal % 12) + 1 };
}

/** Eén afspraak zoals de pagina en de AI haar zien (de spiegel geeft precies dit). */
export type AgendaItem = {
  id: string;
  /** 'google' | 'ics' | 'caldav' — waar deze afspraak vandaan komt. */
  bron: 'google' | 'ics' | 'caldav';
  agendaId: string;
  agendaNaam: string;
  titel: string;
  locatie: string;
  beschrijving: string;
  /** ISO-moment (met zone) of 'YYYY-MM-DD' bij hele dag. */
  begin: string;
  einde: string;
  heleDag: boolean;
  etag: string;
  koppeling: string;
  schrijfbaar: boolean;
  deelnemers: Deelnemer[];
  herhaling: string;
  status: string;
};
/** Valt de afspraak op deze dag? Hele-dag-afspraken hebben een inclusief einde in onze items. */
export function opDag(item: Pick<AgendaItem, 'begin' | 'einde' | 'heleDag'>, dag: string): boolean {
  if (!DATUM.test(dag)) return false;
  const begin = String(item.begin || '').slice(0, 10);
  const einde = String(item.einde || item.begin || '').slice(0, 10);
  if (!begin) return false;
  return begin <= dag && dag <= (einde || begin);
}
export const sorteerItems = <T extends { begin: string }>(items: readonly T[]): T[] =>
  [...items].sort((a, b) => String(a.begin).localeCompare(String(b.begin)));
