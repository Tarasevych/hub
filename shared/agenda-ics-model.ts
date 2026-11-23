// ICS-abonnement: de zuivere regels. Een echt .ics-bestand van een adres binnenhalen en in afspraken omzetten —
// daarmee werkt elke agenda die een link geeft (Fastmail, Proton-export, roosters, feestdagen, sport).
//
// Dit is NIET src/mail-agenda-contact.ts. Die ontleder maakt een VOORVERTONING van een bijlage: hij kapt af op
// 20 afspraken en zet tijden om in leesbare tekst («2026-10-07 14:00»). Voor een abonnement moeten de tijden
// machineleesbaar blijven (ISO met zone), moet UID/SEQUENCE/LAST-MODIFIED mee (anders kun je niet bijwerken) en
// mogen er veel meer afspraken in. Daarom een eigen, strengere ontleder — en de bijlagenvoorvertoning blijft zoals ze was.
//
// Grenzen (alles wat van buiten komt is onbetrouwbaar):
//   • alleen https — nooit http, file, data of een ander schema (ICS_SCHEMAS);
//   • hoogstens ICS_MAX_BYTES aan antwoord (de ophaler breekt af, hij leest niet eerst alles in);
//   • een harde time-out (ICS_TIMEOUT_MS) en geen omleidingen die wij niet zelf controleren;
//   • hoogstens ICS_MAX_GEBEURTENISSEN afspraken per abonnement;
//   • verversen volgens een schema met een ondergrens, zodat niemand per ongeluk elke seconde bij de aanbieder klopt.
export const ICS_SCHEMAS: readonly string[] = Object.freeze(['https:']);
export const ICS_MAX_BYTES = 4 * 1024 * 1024;
export const ICS_TIMEOUT_MS = 15000;
export const ICS_MAX_GEBEURTENISSEN = 2000;
/** Verversen: de gebruiker kiest, maar nooit vaker dan ICS_MIN_MINUTEN en nooit trager dan ICS_MAX_MINUTEN. */
export const ICS_MIN_MINUTEN = 15;
export const ICS_MAX_MINUTEN = 7 * 24 * 60;
export const ICS_STANDAARD_MINUTEN = 60;
export const ICS_INTERVAL_KEUZES: readonly number[] = Object.freeze([15, 30, 60, 180, 360, 720, 1440]);
/** Zo ver vooruit en achteruit houden we afspraken uit een abonnement bij. */
export const ICS_VENSTER_TERUG_DAGEN = 60;
export const ICS_VENSTER_VOORUIT_DAGEN = 400;

export type IcsAdresFout = 'ICS_ADRES_LEEG' | 'ICS_ADRES_ONGELDIG' | 'ICS_SCHEMA_NIET_TOEGESTAAN' | 'ICS_ADRES_MET_WACHTWOORD';
/** Het adres opschonen óf zeggen waarom het niet kan. webcal:// wordt https:// (dat bedoelt iedereen ermee). */
export function veiligIcsAdres(waarde: unknown): { adres: string; fout: IcsAdresFout | '' } {
  const ruw = String(waarde ?? '').trim().slice(0, 2000);
  if (!ruw) return { adres: '', fout: 'ICS_ADRES_LEEG' };
  const genormaliseerd = /^webcals?:\/\//i.test(ruw) ? ruw.replace(/^webcals?:\/\//i, 'https://') : ruw;
  let url: URL;
  try { url = new URL(genormaliseerd); } catch { return { adres: '', fout: 'ICS_ADRES_ONGELDIG' }; }
  if (!ICS_SCHEMAS.includes(url.protocol)) return { adres: '', fout: 'ICS_SCHEMA_NIET_TOEGESTAAN' };
  // Een adres met gebruikersnaam/wachtwoord hoort niet in een abonnement: dat zou een geheim in een URL zijn.
  if (url.username || url.password) return { adres: '', fout: 'ICS_ADRES_MET_WACHTWOORD' };
  url.hash = '';
  return { adres: url.toString(), fout: '' };
}
export const normaliseerIcsInterval = (waarde: unknown): number => {
  const n = Math.trunc(Number(waarde));
  return Number.isFinite(n) ? Math.min(ICS_MAX_MINUTEN, Math.max(ICS_MIN_MINUTEN, n)) : ICS_STANDAARD_MINUTEN;
};
/** Is dit abonnement nú aan de beurt? (`nu` meegeven houdt de functie zuiver en toetsbaar.) */
export const icsIsAanDeBeurt = (laatstOp: number, intervalMinuten: number, nu: number): boolean =>
  nu - Math.max(0, Number(laatstOp) || 0) >= normaliseerIcsInterval(intervalMinuten) * 60000;

// ---------------------------------------------------------------------------------------------- ontleden
const kort = (value: unknown, max: number) => String(value ?? '').replace(/\u0000/g, '').trim().slice(0, max);
/** RFC 5545 §3.1: regels die met spatie of tab beginnen, zetten de vorige voort. */
const ontvouw = (tekst: string) => tekst.replace(/\r\n|\r/g, '\n').replace(/\n[ \t]/g, '').split('\n');
const ontsnapAf = (value: string) => value.replace(/\\n/gi, '\n').replace(/\\([,;\\])/g, '$1');
type Regel = { naam: string; params: Record<string, string>; waarde: string };
function ontleedRegel(regel: string): Regel | null {
  const snede = regel.indexOf(':');
  if (snede < 1) return null;
  const kop = regel.slice(0, snede), stukken = kop.split(';');
  const params: Record<string, string> = {};
  for (const stuk of stukken.slice(1)) {
    const isGelijk = stuk.indexOf('=');
    if (isGelijk > 0) params[stuk.slice(0, isGelijk).toUpperCase()] = stuk.slice(isGelijk + 1).replace(/^"|"$/g, '');
  }
  return { naam: stukken[0].toUpperCase(), params, waarde: regel.slice(snede + 1) };
}

export type IcsMoment = { waarde: string; heleDag: boolean; tijdzone: string };
/**
 * 'YYYYMMDD' → hele dag; 'YYYYMMDDTHHMMSSZ' → ISO in UTC; 'YYYYMMDDTHHMMSS' met TZID → plaatselijke tijd + zone.
 * Zonder zone en zonder Z is het «floating time» (RFC 5545 §3.3.5): wij geven dat als plaatselijke tijd terug
 * en laten de zone leeg — de aanroeper beslist, wij verzinnen geen zone.
 */
export function ontleedIcsMoment(waarde: string, tzid = ''): IcsMoment | null {
  const ruw = kort(waarde, 40);
  const m = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?$/.exec(ruw);
  if (!m) return null;
  const datum = `${m[1]}-${m[2]}-${m[3]}`;
  if (!m[4]) return { waarde: datum, heleDag: true, tijdzone: '' };
  const tijd = `${m[4]}:${m[5]}:${m[6] || '00'}`;
  if (m[7]) return { waarde: `${datum}T${tijd}Z`, heleDag: false, tijdzone: 'UTC' };
  return { waarde: `${datum}T${tijd}`, heleDag: false, tijdzone: kort(tzid, 80) };
}

export type IcsGebeurtenis = {
  uid: string;
  reeks: number;
  titel: string;
  beschrijving: string;
  locatie: string;
  begin: string;
  einde: string;
  heleDag: boolean;
  tijdzone: string;
  status: string;
  rrule: string;
  gewijzigdOp: string;
  organisator: string;
  url: string;
};
export type IcsAgenda = { naam: string; tijdzone: string; gebeurtenissen: IcsGebeurtenis[]; afgekapt: boolean; vevents: number };

/** Een volledige .ics ontleden. Herhalingen worden NIET uitgerold: we bewaren de RRULE zoals ze is (eerlijk). */
export function ontleedIcs(tekst: unknown): IcsAgenda {
  const inhoud = String(tekst ?? '');
  const uit: IcsAgenda = { naam: '', tijdzone: '', gebeurtenissen: [], afgekapt: false, vevents: 0 };
  if (!/BEGIN:VCALENDAR/i.test(inhoud)) return uit;
  let huidig: IcsGebeurtenis | null = null;
  /** VTIMEZONE-blokken bevatten ook DTSTART/RRULE: die mogen nooit voor een afspraak doorgaan. */
  let inTijdzoneBlok = false;
  for (const ruw of ontvouw(inhoud)) {
    const regel = ontleedRegel(ruw.trim());
    if (!regel) continue;
    const blok = regel.waarde.trim().toUpperCase();
    if (regel.naam === 'BEGIN') {
      if (blok === 'VTIMEZONE') inTijdzoneBlok = true;
      else if (blok === 'VEVENT' && !inTijdzoneBlok) {
        uit.vevents += 1;
        huidig = { uid: '', reeks: 0, titel: '', beschrijving: '', locatie: '', begin: '', einde: '', heleDag: false, tijdzone: '', status: '', rrule: '', gewijzigdOp: '', organisator: '', url: '' };
      }
      continue;
    }
    if (regel.naam === 'END') {
      if (blok === 'VTIMEZONE') inTijdzoneBlok = false;
      else if (blok === 'VEVENT') {
        if (huidig && huidig.begin) {
          // Zonder einde duurt een afspraak volgens RFC 5545 §3.6.1 tot het begin (punt) of de hele dag.
          if (!huidig.einde) huidig.einde = huidig.begin;
          if (!huidig.uid) huidig.uid = `zonder-uid-${uit.gebeurtenissen.length + 1}`;
          uit.gebeurtenissen.push(huidig);
        }
        huidig = null;
        if (uit.gebeurtenissen.length >= ICS_MAX_GEBEURTENISSEN) { uit.afgekapt = true; break; }
      }
      continue;
    }
    if (inTijdzoneBlok) continue;
    if (!huidig) {
      if (regel.naam === 'X-WR-CALNAME') uit.naam = kort(ontsnapAf(regel.waarde), 200);
      else if (regel.naam === 'X-WR-TIMEZONE') uit.tijdzone = kort(regel.waarde, 80);
      continue;
    }
    switch (regel.naam) {
      case 'UID': huidig.uid = kort(regel.waarde, 500); break;
      case 'SEQUENCE': huidig.reeks = Math.max(0, Math.min(99999, Math.trunc(Number(regel.waarde)) || 0)); break;
      case 'SUMMARY': huidig.titel = kort(ontsnapAf(regel.waarde), 300); break;
      case 'DESCRIPTION': huidig.beschrijving = kort(ontsnapAf(regel.waarde), 4000); break;
      case 'LOCATION': huidig.locatie = kort(ontsnapAf(regel.waarde), 500); break;
      case 'STATUS': huidig.status = kort(regel.waarde, 40).toLowerCase(); break;
      case 'RRULE': huidig.rrule = `RRULE:${kort(regel.waarde, 500)}`; break;
      case 'LAST-MODIFIED': case 'DTSTAMP': {
        const moment = ontleedIcsMoment(regel.waarde, 'UTC');
        if (moment && (regel.naam === 'LAST-MODIFIED' || !huidig.gewijzigdOp)) huidig.gewijzigdOp = moment.waarde;
        break;
      }
      case 'ORGANIZER': huidig.organisator = kort(regel.waarde.replace(/^mailto:/i, ''), 320); break;
      case 'URL': huidig.url = /^https:\/\//i.test(regel.waarde.trim()) ? kort(regel.waarde, 1600) : ''; break;
      case 'DTSTART': {
        const moment = ontleedIcsMoment(regel.waarde, regel.params.TZID || uit.tijdzone);
        if (moment) { huidig.begin = moment.waarde; huidig.heleDag = moment.heleDag; huidig.tijdzone = moment.tijdzone; }
        break;
      }
      case 'DTEND': {
        const moment = ontleedIcsMoment(regel.waarde, regel.params.TZID || uit.tijdzone);
        // Hele dag: DTEND is EXCLUSIEF (RFC 5545 §3.8.2.2) — onze items hebben een inclusief einde.
        if (moment) huidig.einde = moment.heleDag ? vorigeIcsDag(moment.waarde) : moment.waarde;
        break;
      }
      default: break;
    }
  }
  if (uit.vevents > uit.gebeurtenissen.length) uit.afgekapt = uit.afgekapt || uit.gebeurtenissen.length >= ICS_MAX_GEBEURTENISSEN;
  return uit;
}

export function vorigeIcsDag(datum: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(datum)) return datum;
  const d = new Date(`${datum}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

export function volgendeIcsDag(datum: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(datum)) return datum;
  const d = new Date(`${datum}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

/** Buiten het venster houden we niets bij: een rooster van 1998 hoeft niet in de spiegel. */
export function binnenIcsVenster(gebeurtenis: Pick<IcsGebeurtenis, 'begin' | 'einde' | 'rrule'>, nu: number): boolean {
  if (gebeurtenis.rrule) return true; // een reeks kan tot in de toekomst doorlopen: altijd bewaren
  const einde = Date.parse(String(gebeurtenis.einde || gebeurtenis.begin || '').length === 10
    ? `${gebeurtenis.einde || gebeurtenis.begin}T23:59:59Z` : String(gebeurtenis.einde || gebeurtenis.begin));
  const begin = Date.parse(String(gebeurtenis.begin || '').length === 10 ? `${gebeurtenis.begin}T00:00:00Z` : String(gebeurtenis.begin));
  if (!Number.isFinite(begin)) return false;
  const vanaf = nu - ICS_VENSTER_TERUG_DAGEN * 86400000, tot = nu + ICS_VENSTER_VOORUIT_DAGEN * 86400000;
  return (Number.isFinite(einde) ? einde : begin) >= vanaf && begin <= tot;
}

// ---------------------------------------------------------------------------------------------- opbouwen (RFC 5545)
import { EPOST, rruleUitHerhaling, type AgendaVorm, type Deelnemer, type Herinnering } from './agenda-model';

/** RFC 5545 §3.3.11: tekstwaarden ontsnappen (\, ;, , en regeleinden). */
export function ontsnapIcsTekst(tekst: unknown): string {
  return String(tekst ?? '')
    .replace(/\u0000/g, '')
    .replace(/\r\n|\r/g, '\n')
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\n/g, '\\n');
}

const utf8BytesVanCodePunt = (cp: number): number => (cp <= 0x7f ? 1 : cp <= 0x7ff ? 2 : cp <= 0xffff ? 3 : 4);

/** RFC 5545 §3.1: regels vouwen op hoogstens 75 UTF-8-octetten zonder een meerbytes-teken middendoor te breken. */
export function vouwIcsRegel(regel: string): string {
  const schoon = String(regel ?? '').replace(/[\r\n]+/g, '');
  const delen: string[] = [];
  let huidig = '';
  let octetten = 0;
  let grens = 75;
  for (const teken of schoon) {
    const cp = teken.codePointAt(0) ?? 0;
    const maat = utf8BytesVanCodePunt(cp);
    if (octetten + maat > grens && huidig.length > 0) {
      delen.push(huidig);
      huidig = ` ${teken}`;
      octetten = 1 + maat;
      grens = 75;
    } else {
      huidig += teken;
      octetten += maat;
    }
  }
  if (huidig.length > 0 || delen.length === 0) delen.push(huidig);
  return delen.join('\r\n');
}

const naarUtcStempel = (isoOfMs?: unknown): string => {
  if (typeof isoOfMs === 'string' && /^\d{8}T\d{6}Z$/.test(isoOfMs.trim())) return isoOfMs.trim();
  const d = isoOfMs ? new Date(String(isoOfMs)) : new Date();
  const geldig = Number.isNaN(d.getTime()) ? new Date() : d;
  return geldig.toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
};

const icsTijdRegel = (naam: 'DTSTART' | 'DTEND', waarde: string, heleDag: boolean, tijdzone: string): string => {
  const ruw = kort(waarde, 60);
  if (heleDag || /^\d{4}-\d{2}-\d{2}$/.test(ruw)) {
    const dag = ruw.slice(0, 10);
    const doel = naam === 'DTEND' ? volgendeIcsDag(dag) : dag;
    return `${naam};VALUE=DATE:${doel.replace(/-/g, '')}`;
  }
  if (/Z$/i.test(ruw) || /[+-]\d{2}:\d{2}$/.test(ruw)) {
    const d = new Date(ruw);
    if (!Number.isNaN(d.getTime())) {
      return `${naam}:${d.toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z')}`;
    }
  }
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(ruw);
  if (m) {
    const stempel = `${m[1]}${m[2]}${m[3]}T${m[4]}${m[5]}${m[6] || '00'}`;
    const zone = kort(tijdzone, 80);
    if (!zone) return `${naam}:${stempel}`;
    if (zone.toUpperCase() === 'UTC') return `${naam}:${stempel}Z`;
    const veiligeZone = zone.replace(/[;:",\r\n]/g, '');
    return veiligeZone ? `${naam};TZID=${veiligeZone}:${stempel}` : `${naam}:${stempel}`;
  }
  return `${naam}:${naarUtcStempel(ruw)}`;
};

const PARTSTAT_VAN: Record<string, string> = {
  accepted: 'ACCEPTED',
  declined: 'DECLINED',
  tentative: 'TENTATIVE',
  needsAction: 'NEEDS-ACTION',
};

export type BouwIcsInvoer = {
  uid: string;
  vorm: AgendaVorm;
  dtstamp?: string;
  sequence?: number;
  organisatorEmail?: string;
  naam?: string;
};

type RuweIcsGebeurtenis = Record<string, unknown>;

function bouwEnkeleVevent(invoer: RuweIcsGebeurtenis): string[] {
  const heeftVorm = Boolean(invoer.vorm && typeof invoer.vorm === 'object');
  const bron = (heeftVorm ? (invoer.vorm as Record<string, unknown>) : invoer) as Record<string, unknown>;
  const uidRuw = kort(invoer.uid ?? bron.uid ?? bron.gebeurtenisId, 500).replace(/[\r\n]/g, '');
  const uid = uidRuw || `afspraak-${Date.now()}@tarasevych.com`;
  const titel = kort(bron.titel ?? bron.summary, 300);
  const beschrijving = kort(bron.beschrijving ?? bron.description, 4000);
  const locatie = kort(bron.locatie ?? bron.plaats ?? bron.location, 500);
  const begin = kort(bron.begin ?? bron.start, 60);
  const einde = kort(bron.einde ?? bron.eind ?? bron.end ?? begin, 60) || begin;
  const heleDag = Boolean(bron.heleDag) || (/^\d{4}-\d{2}-\d{2}$/.test(begin) && !begin.includes('T'));
  const tijdzone = kort(bron.tijdzone, 80);
  const reeksGetal = Number(invoer.sequence ?? invoer.reeks ?? bron.reeks ?? bron.sequence ?? 0);
  const reeks = Number.isFinite(reeksGetal) ? Math.max(0, Math.min(99999, Math.trunc(reeksGetal))) : 0;
  const dtstamp = naarUtcStempel(invoer.dtstamp ?? bron.gewijzigdOp ?? bron.dtstamp);
  const statusRuw = kort(bron.status, 40).toUpperCase();
  const status = statusRuw === 'CANCELLED' || statusRuw === 'TENTATIVE' ? statusRuw : 'CONFIRMED';

  let rrule = kort(bron.rrule, 500);
  if (!rrule && bron.herhaling && typeof bron.herhaling === 'object') {
    rrule = rruleUitHerhaling(bron.herhaling);
  }
  const rruleWaarde = rrule.replace(/^RRULE:/i, '').replace(/[\r\n]/g, '').trim();

  const organisator = kort(invoer.organisatorEmail ?? bron.organisator, 320).replace(/^mailto:/i, '');
  const url = kort(bron.url ?? bron.koppeling, 1600);

  const regels: string[] = [
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${dtstamp}`,
    `SEQUENCE:${reeks}`,
    icsTijdRegel('DTSTART', begin, heleDag, tijdzone),
    icsTijdRegel('DTEND', einde, heleDag, tijdzone),
    `SUMMARY:${ontsnapIcsTekst(titel)}`,
    `STATUS:${status}`,
  ];
  if (beschrijving) regels.push(`DESCRIPTION:${ontsnapIcsTekst(beschrijving)}`);
  if (locatie) regels.push(`LOCATION:${ontsnapIcsTekst(locatie)}`);
  if (rruleWaarde) regels.push(`RRULE:${rruleWaarde}`);
  if (organisator && EPOST.test(organisator.toLowerCase())) {
    regels.push(`ORGANIZER:mailto:${organisator.toLowerCase()}`);
  }
  if (/^https:\/\//i.test(url)) {
    regels.push(`URL:${url.replace(/[\r\n]/g, '')}`);
  }

  const deelnemers = Array.isArray(bron.deelnemers) ? (bron.deelnemers as Deelnemer[]) : [];
  for (const d of deelnemers.slice(0, 50)) {
    const email = kort(d?.email, 320).toLowerCase();
    if (!EPOST.test(email)) continue;
    const cn = kort(d?.naam, 200).replace(/[";:\r\n]/g, '');
    const partstat = PARTSTAT_VAN[String(d?.antwoord || '')] || 'NEEDS-ACTION';
    const role = d?.optioneel ? ';ROLE=OPT-PARTICIPANT' : ';ROLE=REQ-PARTICIPANT';
    regels.push(`ATTENDEE${cn ? `;CN="${cn}"` : ''};PARTSTAT=${partstat}${role}:mailto:${email}`);
  }

  const standaardHerinneringen = bron.standaardHerinneringen !== false;
  const herinneringen = !standaardHerinneringen && Array.isArray(bron.herinneringen) ? (bron.herinneringen as Herinnering[]) : [];
  for (const h of herinneringen.slice(0, 5)) {
    const min = Math.max(0, Math.min(40320, Math.trunc(Number(h?.minuten) || 0)));
    regels.push(
      'BEGIN:VALARM',
      'ACTION:DISPLAY',
      `DESCRIPTION:${ontsnapIcsTekst(titel || 'Afspraak')}`,
      `TRIGGER:-PT${min}M`,
      'END:VALARM',
    );
  }

  regels.push('END:VEVENT');
  return regels;
}

/**
 * Volledig iCalendar-bestand (RFC 5545) bouwen uit één afspraak (`{ uid, vorm }`, platte afspraak),
 * een lijst afspraken of `{ naam, gebeurtenissen }`. Altijd ontvouwbaar door `ontleedIcs()`.
 */
export function bouwIcsGebeurtenis(invoer: BouwIcsInvoer | Record<string, unknown> | ReadonlyArray<Record<string, unknown>>, kalenderNaam?: string): string {
  let lijst: RuweIcsGebeurtenis[] = [];
  let naam = kort(kalenderNaam, 200);
  let tijdzone = '';

  if (Array.isArray(invoer)) {
    lijst = invoer.filter((x): x is RuweIcsGebeurtenis => Boolean(x && typeof x === 'object'));
  } else if (invoer && typeof invoer === 'object') {
    const obj = invoer as Record<string, unknown>;
    if (Array.isArray(obj.gebeurtenissen)) {
      lijst = (obj.gebeurtenissen as unknown[]).filter((x): x is RuweIcsGebeurtenis => Boolean(x && typeof x === 'object'));
      if (!naam) naam = kort(obj.naam, 200);
      tijdzone = kort(obj.tijdzone, 80);
    } else {
      lijst = [obj];
      if (!naam) naam = kort(obj.naam, 200);
    }
  }

  const kop: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Mijn Ruimte//Agenda//NL',
    'CALSCALE:GREGORIAN',
  ];
  if (naam) kop.push(`X-WR-CALNAME:${ontsnapIcsTekst(naam)}`);
  if (tijdzone) kop.push(`X-WR-TIMEZONE:${tijdzone.replace(/[\r\n]/g, '')}`);

  for (const item of lijst.slice(0, ICS_MAX_GEBEURTENISSEN)) {
    kop.push(...bouwEnkeleVevent(item));
  }
  kop.push('END:VCALENDAR');
  return `${kop.map(vouwIcsRegel).join('\r\n')}\r\n`;
}
