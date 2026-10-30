// CalDAV (RFC 4791): de zuivere helft — de XML-lichamen die we versturen en het ontleden van het antwoord.
// De verbinding zelf staat in backend/agenda-caldav.ts (met backend/veilige-fetch.ts: alleen https, DNS-pinning,
// time-out en een grens op de grootte).
//
// WAT ER IN DEZE VERSIE WERKT: LEZEN.
//   1. PROPFIND Depth:0 op het basisadres  → <current-user-principal>
//   2. PROPFIND Depth:0 op de principal    → <calendar-home-set>
//   3. PROPFIND Depth:1 op de home-set     → de agenda's (displayname, resourcetype, getctag, kleur)
//   4. REPORT   Depth:1 op één agenda      → <calendar-query> met <calendar-data> binnen een tijdvenster
//      Het antwoord bevat echte .ics-blokken; die gaan door dezelfde ontleder als een ICS-abonnement
//      (shared/agenda-ics-model.ts → ontleedIcs), dus iCloud, Fastmail en Nextcloud geven dezelfde afspraken.
//
// WAT ER NIET WERKT: SCHRIJVEN. Dat is geen knop die niets doet — de kaart in de winkel zegt het, en hieronder
// staat precies wat er nog voor nodig is. Zo kan niemand denken dat het er al is.
export const AGENDA_CALDAV_SCHRIJVEN_ONTBREEKT: readonly (readonly [string, string])[] = Object.freeze([
  ['PUT з If-Match/If-None-Match для .ics-ресурсу (створення й зміна події) і DELETE з If-Match — разом із генерацією коректного VCALENDAR/VEVENT на нашому боці (зараз ми .ics тільки читаємо, не складаємо).',
   'PUT met If-Match/If-None-Match op de .ics-resource (aanmaken en wijzigen) en DELETE met If-Match — samen met het ZELF opbouwen van een geldige VCALENDAR/VEVENT (nu lezen we .ics alleen, we schrijven het niet).'],
  ['Синхронізація через sync-collection (RFC 6578) або getctag: без неї кожен запис вимагає повного перечитування календаря, і двостороння робота ламається на конфліктах.',
   'Synchronisatie via sync-collection (RFC 6578) of getctag: zonder dat vraagt elke schrijfactie een volledige herlezing van de agenda, en loopt tweewegwerk vast op conflicten.'],
  ['Планування зустрічей (scheduling, RFC 6638): outbox, ATTENDEE/ORGANIZER, PARTSTAT — без цього запрошення й RSVP через CalDAV не працюють.',
   'Vergaderplanning (scheduling, RFC 6638): outbox, ATTENDEE/ORGANIZER, PARTSTAT — zonder dat werken uitnodigingen en RSVP via CalDAV niet.'],
  ['Переспрямування під час запису: iCloud може переслати PUT на інший «pNN»-хост; наш безпечний клієнт свідомо не ходить за переспрямуваннями (для читання відомі хости Apple дозволено явно).',
   'Omleidingen bij schrijven: iCloud kan een PUT naar een andere «pNN»-host sturen; onze veilige cliënt volgt omleidingen bewust niet (voor lezen zijn de bekende hosts van Apple uitdrukkelijk toegestaan).'],
]);

export const CALDAV_TIMEOUT_MS = 20000;
export const CALDAV_MAX_BYTES = 8 * 1024 * 1024;
export const CALDAV_MAX_AGENDAS = 25;
export const CALDAV_MIN_MINUTEN = 15;
export const CALDAV_STANDAARD_MINUTEN = 60;
/** Bekende basisadressen; de gebruiker mag ook een eigen (Nextcloud-)adres intikken. */
export const CALDAV_AANBIEDERS: readonly { id: string; naam: string; basis: string; hint: readonly [string, string] }[] = Object.freeze([
  { id: 'icloud', naam: 'Apple iCloud', basis: 'https://caldav.icloud.com/', hint: ['Пароль застосунку з appleid.apple.com (не основний пароль).', 'Een app-wachtwoord van appleid.apple.com (niet uw hoofdwachtwoord).'] },
  { id: 'fastmail', naam: 'Fastmail', basis: 'https://caldav.fastmail.com/dav/', hint: ['Пароль застосунку з Fastmail → Settings → Password & Security.', 'Een app-wachtwoord uit Fastmail → Settings → Password & Security.'] },
  { id: 'nextcloud', naam: 'Nextcloud', basis: '', hint: ['Адреса вигляду https://cloud.example.org/remote.php/dav/ і пароль застосунку.', 'Een adres als https://cloud.example.org/remote.php/dav/ en een app-wachtwoord.'] },
]);

export type CaldavAdresFout = 'CALDAV_ADRES_LEEG' | 'CALDAV_ADRES_ONGELDIG' | 'CALDAV_SCHEMA_NIET_TOEGESTAAN' | 'CALDAV_ADRES_MET_WACHTWOORD';
export function veiligCaldavAdres(waarde: unknown): { adres: string; fout: CaldavAdresFout | '' } {
  const ruw = String(waarde ?? '').trim().slice(0, 2000);
  if (!ruw) return { adres: '', fout: 'CALDAV_ADRES_LEEG' };
  let url: URL;
  try { url = new URL(ruw); } catch { return { adres: '', fout: 'CALDAV_ADRES_ONGELDIG' }; }
  if (url.protocol !== 'https:') return { adres: '', fout: 'CALDAV_SCHEMA_NIET_TOEGESTAAN' };
  if (url.username || url.password) return { adres: '', fout: 'CALDAV_ADRES_MET_WACHTWOORD' };
  url.hash = '';
  url.search = '';
  return { adres: url.toString(), fout: '' };
}

/**
 * iCloud (21.10.2026, recht «Події з iCloud»): caldav.icloud.com geeft de principal, maar de agenda's (calendar-home-set) staan op een
 * partitiehost van Apple: https://p<NN>-caldav.icloud.com:443/<id>/calendars/. Dat is GEEN omleiding en geen vrije andere host: alleen
 * precies dat patroon, en alleen als het basisadres zelf iCloud is. Elke andere host blijft geweigerd (SSRF; de fetch pint DNS).
 */
const ICLOUD_HOST = /^(?:caldav|p\d{1,3}-caldav)\.icloud\.com$/i;
export const isIcloudHost = (host: string): boolean => ICLOUD_HOST.test(String(host || '').replace(/:443$/, ''));
/** Een href uit het antwoord naar een absoluut https-adres op DEZELFDE host (of, bij iCloud, een partitiehost van Apple). Een andere host weigeren we. */
export function caldavAbsoluut(basis: string, href: unknown): string {
  const ruw = String(href ?? '').trim();
  if (!ruw) return '';
  try {
    const url = new URL(ruw, basis);
    if (url.protocol !== 'https:') return '';
    const basisHost = new URL(basis).host;
    if (url.host !== basisHost && !(isIcloudHost(basisHost) && isIcloudHost(url.host))) return '';
    if (url.username || url.password) return '';
    url.hash = '';
    return url.toString();
  } catch { return ''; }
}

// ---------------------------------------------------------------------------------------------- de lichamen
const XML_KOP = '<?xml version="1.0" encoding="utf-8" ?>';
export const CALDAV_PRINCIPAL_LICHAAM = `${XML_KOP}<d:propfind xmlns:d="DAV:"><d:prop><d:current-user-principal/></d:prop></d:propfind>`;
export const CALDAV_HOME_LICHAAM = `${XML_KOP}<d:propfind xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav"><d:prop><c:calendar-home-set/></d:prop></d:propfind>`;
export const CALDAV_AGENDAS_LICHAAM = `${XML_KOP}<d:propfind xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav" xmlns:cs="http://calendarserver.org/ns/" xmlns:ic="http://apple.com/ns/ical/"><d:prop><d:resourcetype/><d:displayname/><cs:getctag/><d:sync-token/><ic:calendar-color/><c:supported-calendar-component-set/></d:prop></d:propfind>`;

/** 'YYYY-MM-DDTHH:MM:SSZ' → '20261020T000000Z' (de vorm die CalDAV in time-range wil). */
export const caldavStempel = (iso: string): string => String(iso || '').replace(/[-:]/g, '').replace(/\.\d+/, '');
/** <calendar-query> met een tijdvenster: nooit «geef alles», want dat is bij iCloud tienduizenden afspraken. */
export function caldavQueryLichaam(vanaf: string, tot: string): string {
  const start = caldavStempel(vanaf), eind = caldavStempel(tot);
  return `${XML_KOP}<c:calendar-query xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav"><d:prop><d:getetag/><c:calendar-data/></d:prop>`
    + `<c:filter><c:comp-filter name="VCALENDAR"><c:comp-filter name="VEVENT">`
    + `<c:time-range start="${start}" end="${eind}"/></c:comp-filter></c:comp-filter></c:filter></c:calendar-query>`;
}

// ---------------------------------------------------------------------------------------------- het antwoord
const naamZonderRuimte = (naam: string) => naam.replace(/^[^:]+:/, '').toLowerCase();
/** Alle waarden van een element, ongeacht de namespace-prefix die de server koos (d:, D:, ns0:, …). */
export function caldavWaarden(xml: unknown, element: string): string[] {
  const inhoud = String(xml ?? '');
  const doel = element.toLowerCase();
  const uit: string[] = [];
  const patroon = /<([A-Za-z0-9_.:-]+)([^>]*?)(\/)?>/g;
  let treffer: RegExpExecArray | null;
  while ((treffer = patroon.exec(inhoud))) {
    if (naamZonderRuimte(treffer[1]) !== doel) continue;
    if (treffer[3]) { uit.push(''); continue; }
    const sluit = inhoud.indexOf(`</${treffer[1]}>`, patroon.lastIndex);
    if (sluit < 0) continue;
    uit.push(inhoud.slice(patroon.lastIndex, sluit));
    if (uit.length >= 500) break;
  }
  return uit;
}
export const caldavEersteHref = (xml: unknown): string => {
  const hrefs = caldavWaarden(xml, 'href').map((h) => h.trim()).filter(Boolean);
  return hrefs[0] || '';
};
/** <d:response>-blokken: per resource de href en de ruwe eigenschappen. */
export function caldavResponses(xml: unknown): { href: string; inhoud: string }[] {
  return caldavWaarden(xml, 'response').map((inhoud) => ({ href: caldavEersteHref(inhoud).trim(), inhoud })).filter((r) => r.href);
}
/**
 * XML-tekst terug naar gewone tekst. Numerieke tekenverwijzingen MOETEN mee: een XML-ontleder normaliseert CR,
 * dus veel CalDAV-servers (iCloud onder andere) schrijven de regeleindes van een .ics als `&#13;`. Zonder dit
 * zou het .ics-blok één lange regel worden en zou er geen enkele afspraak uit komen.
 */
const ontsnapXmlAf = (value: string) => value
  .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
  .replace(/&#x([0-9a-f]{1,6});/gi, (_, hex: string) => String.fromCodePoint(Number.parseInt(hex, 16)))
  .replace(/&#(\d{1,7});/g, (_, dec: string) => String.fromCodePoint(Number(dec)))
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');

export type CaldavAgenda = { url: string; naam: string; ctag: string; syncToken: string; kleur: string; gebeurtenissen: boolean };
/** Uit een PROPFIND Depth:1 de agenda's halen. Alleen collecties die VEVENT ondersteunen; de rest is geen agenda. */
export function ontleedCaldavAgendas(xml: unknown, basis: string): CaldavAgenda[] {
  const uit: CaldavAgenda[] = [];
  for (const response of caldavResponses(xml)) {
    const url = caldavAbsoluut(basis, response.href);
    if (!url) continue;
    const typen = caldavWaarden(response.inhoud, 'resourcetype').join(' ');
    if (!/calendar/i.test(typen)) continue;
    const componenten = caldavWaarden(response.inhoud, 'supported-calendar-component-set').join(' ');
    // Zonder uitspraak over de componenten nemen we aan dat er afspraken in kunnen (dat doet iCloud zo).
    const gebeurtenissen = !componenten || /name="?VEVENT/i.test(componenten);
    if (!gebeurtenissen) continue;
    uit.push({
      url,
      naam: ontsnapXmlAf((caldavWaarden(response.inhoud, 'displayname')[0] || '').trim()).slice(0, 200),
      ctag: (caldavWaarden(response.inhoud, 'getctag')[0] || '').trim().slice(0, 300),
      syncToken: (caldavWaarden(response.inhoud, 'sync-token')[0] || '').trim().slice(0, 500),
      kleur: (caldavWaarden(response.inhoud, 'calendar-color')[0] || '').trim().slice(0, 40),
      gebeurtenissen: true,
    });
    if (uit.length >= CALDAV_MAX_AGENDAS) break;
  }
  return uit;
}

export type CaldavResource = { href: string; etag: string; ics: string };
/** Uit een REPORT-antwoord de .ics-blokken halen; het ontleden ervan doet shared/agenda-ics-model.ts. */
export function ontleedCaldavGegevens(xml: unknown): CaldavResource[] {
  const uit: CaldavResource[] = [];
  for (const response of caldavResponses(xml)) {
    const ics = ontsnapXmlAf((caldavWaarden(response.inhoud, 'calendar-data')[0] || '').trim());
    if (!/BEGIN:VCALENDAR/i.test(ics)) continue;
    uit.push({ href: response.href, etag: (caldavWaarden(response.inhoud, 'getetag')[0] || '').trim().slice(0, 300), ics });
    if (uit.length >= 2000) break;
  }
  return uit;
}
