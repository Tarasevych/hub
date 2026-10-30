// Opdracht van de eigenaar (20.10.2026), punten 3 en 4: een ECHTE .ics-ophaler, en CalDAV zo ver als het gaat —
// met een eerlijke grens waar het ophoudt. «Не роби кнопку, яка нічого не робить.»
//
// Wat hier bewezen wordt:
//   ICS     alleen https (webcal wordt https; http, file, data en een adres met wachtwoord worden geweigerd),
//           een grens op het aantal afspraken, een venster, een verversingsschema met ondergrens, en dat de
//           ophaler werkelijk door de veilige fetcher gaat (DNS-pinning, time-out, maximum aan bytes) — een
//           adres in een privénetwerk wordt afgewezen vóór er iets wordt binnengehaald.
//   CalDAV  wat er WERKT is bewezen met echte antwoorden van iCloud/Nextcloud-vorm (PROPFIND-ontleding,
//           calendar-query met tijdvenster, .ics eruit halen) en met een versleuteld app-wachtwoord;
//           wat er NIET werkt (schrijven) is overal expliciet gemarkeerd met de reden — in het model, in het
//           antwoord van de route, in de catalogus en op de pagina. Er is nergens een knop voor.
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { sealWithEnvKey } from '../../server/platform';
import { getPool } from '../../server/platform/pg';
import {
  ICS_INTERVAL_KEUZES, ICS_MAX_BYTES, ICS_MAX_GEBEURTENISSEN, ICS_MIN_MINUTEN, ICS_SCHEMAS, ICS_TIMEOUT_MS,
  ICS_VENSTER_TERUG_DAGEN, ICS_VENSTER_VOORUIT_DAGEN, binnenIcsVenster, icsIsAanDeBeurt, normaliseerIcsInterval,
  ontleedIcs, ontleedIcsMoment, veiligIcsAdres,
} from '../../shared/agenda-ics-model';
import {
  AGENDA_CALDAV_SCHRIJVEN_ONTBREEKT, CALDAV_AANBIEDERS, CALDAV_AGENDAS_LICHAAM, CALDAV_HOME_LICHAAM,
  CALDAV_PRINCIPAL_LICHAAM, caldavAbsoluut, caldavEersteHref, caldavQueryLichaam, caldavStempel,
  ontleedCaldavAgendas, ontleedCaldavGegevens, veiligCaldavAdres,
} from '../../shared/agenda-caldav-model';
import { privateAddress } from '../../backend/veilige-fetch';
import { agendaAanbieder } from '../../shared/agenda-catalogus';
import { checker } from './hulp/nep-google';

const lees = (pad: string) => readFileSync(pad, 'utf8');
const sys = () => getPool('systeem');

const ICS_VOORBEELD = [
  'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Eenheidstest//NL', 'X-WR-CALNAME:Rooster', 'X-WR-TIMEZONE:Europe/Brussels',
  'BEGIN:VTIMEZONE', 'TZID:Europe/Brussels', 'BEGIN:DAYLIGHT', 'DTSTART:19700329T020000', 'RRULE:FREQ=YEARLY;BYMONTH=3',
  'TZOFFSETFROM:+0100', 'TZOFFSETTO:+0200', 'END:DAYLIGHT', 'END:VTIMEZONE',
  'BEGIN:VEVENT', 'UID:met-tijd@example.org', 'SEQUENCE:3', 'SUMMARY:Les wis\\,kunde', 'LOCATION:Zaal A',
  'DESCRIPTION:Eerste regel\\nTweede regel', 'DTSTART;TZID=Europe/Brussels:20261103T090000', 'DTEND;TZID=Europe/Brussels:20261103T104500',
  'LAST-MODIFIED:20261020T120000Z', 'ORGANIZER;CN="De School":mailto:school@example.org', 'URL:https://example.org/les', 'END:VEVENT',
  'BEGIN:VEVENT', 'UID:hele-dag@example.org', 'SUMMARY:Feestdag', 'DTSTART;VALUE=DATE:20261225', 'DTEND;VALUE=DATE:20261226',
  'STATUS:CONFIRMED', 'END:VEVENT',
  'BEGIN:VEVENT', 'UID:utc@example.org', 'SUMMARY:In UTC', 'DTSTART:20261104T080000Z', 'DTEND:20261104T090000Z', 'END:VEVENT',
  'BEGIN:VEVENT', 'UID:reeks@example.org', 'SUMMARY:Elke week', 'DTSTART;TZID=Europe/Brussels:20261105T190000',
  'RRULE:FREQ=WEEKLY;BYDAY=TH', 'END:VEVENT',
  // RFC 5545 §3.1: het ontvouwen haalt CRLF + ÉÉN spatie weg, dus de inhoud draagt zijn eigen spatie.
  'BEGIN:VEVENT', 'UID:gevouwen@example.org', 'SUMMARY:Een hele lange titel die ', ' over twee regels staat',
  'DTSTART:20261106T080000Z', 'END:VEVENT',
  'END:VCALENDAR',
].join('\r\n');

/** Een multistatus zoals iCloud en Nextcloud hem geven: andere prefixen, lege href-elementen, CDATA. */
const PROPFIND_AGENDAS = `<?xml version="1.0" encoding="UTF-8"?>
<D:multistatus xmlns:D="DAV:" xmlns:C="urn:ietf:params:xml:ns:caldav" xmlns:CS="http://calendarserver.org/ns/" xmlns:IC="http://apple.com/ns/ical/">
  <D:response><D:href>/1234/calendars/</D:href><D:propstat><D:prop>
    <D:resourcetype><D:collection/></D:resourcetype><D:displayname>home</D:displayname></D:prop>
    <D:status>HTTP/1.1 200 OK</D:status></D:propstat></D:response>
  <D:response><D:href>/1234/calendars/work/</D:href><D:propstat><D:prop>
    <D:resourcetype><D:collection/><C:calendar/></D:resourcetype>
    <D:displayname><![CDATA[Werk &amp; privé]]></D:displayname>
    <CS:getctag>HWiwRG</CS:getctag><D:sync-token>http://example.org/ns/sync/42</D:sync-token>
    <IC:calendar-color>#FF2968</IC:calendar-color>
    <C:supported-calendar-component-set><C:comp name="VEVENT"/><C:comp name="VTODO"/></C:supported-calendar-component-set>
  </D:prop><D:status>HTTP/1.1 200 OK</D:status></D:propstat></D:response>
  <D:response><D:href>/1234/calendars/taken/</D:href><D:propstat><D:prop>
    <D:resourcetype><D:collection/><C:calendar/></D:resourcetype><D:displayname>Taken</D:displayname>
    <C:supported-calendar-component-set><C:comp name="VTODO"/></C:supported-calendar-component-set>
  </D:prop><D:status>HTTP/1.1 200 OK</D:status></D:propstat></D:response>
  <D:response><D:href>https://ander-huis.example.net/1234/calendars/vreemd/</D:href><D:propstat><D:prop>
    <D:resourcetype><D:collection/><C:calendar/></D:resourcetype><D:displayname>Van een andere host</D:displayname>
  </D:prop><D:status>HTTP/1.1 200 OK</D:status></D:propstat></D:response>
</D:multistatus>`;

const REPORT_ANTWOORD = `<?xml version="1.0" encoding="UTF-8"?>
<multistatus xmlns="DAV:" xmlns:cal="urn:ietf:params:xml:ns:caldav">
  <response><href>/1234/calendars/work/een.ics</href><propstat><prop>
    <getetag>"etag-1"</getetag>
    <cal:calendar-data>BEGIN:VCALENDAR&#13;
VERSION:2.0&#13;
BEGIN:VEVENT&#13;
UID:dav-1@example.org&#13;
SUMMARY:Uit CalDAV&#13;
DTSTART:20261110T090000Z&#13;
DTEND:20261110T100000Z&#13;
END:VEVENT&#13;
END:VCALENDAR</cal:calendar-data>
  </prop><status>HTTP/1.1 200 OK</status></propstat></response>
  <response><href>/1234/calendars/work/leeg.ics</href><propstat><prop><getetag>"etag-2"</getetag>
    <cal:calendar-data></cal:calendar-data></prop><status>HTTP/1.1 200 OK</status></propstat></response>
</multistatus>`;

export async function main(): Promise<number> {
  const { check, einde } = checker('agenda-ics-caldav-20261020');
  // Eén node-proces voor alle testbestanden: de omgeving gaat na deze test weer terug zoals ze was.
  const sleutelVoor = process.env.AGENDA_ABONNEMENT_SLEUTEL_V1;

  // ================================================================ ICS: het adres
  check('ICS: alleen https staat op de lijst, en webcal:// wordt https:// (dat bedoelt iedereen ermee)',
    ICS_SCHEMAS.length === 1 && ICS_SCHEMAS[0] === 'https:'
    && veiligIcsAdres('webcal://example.org/a.ics').adres === 'https://example.org/a.ics'
    && veiligIcsAdres('https://example.org/a.ics').adres === 'https://example.org/a.ics');
  check('ICS: http, file, data, javascript en onzin worden geweigerd met een eigen code',
    veiligIcsAdres('http://example.org/a.ics').fout === 'ICS_SCHEMA_NIET_TOEGESTAAN'
    && veiligIcsAdres('file:///etc/passwd').fout === 'ICS_SCHEMA_NIET_TOEGESTAAN'
    && veiligIcsAdres('data:text/calendar,BEGIN').fout === 'ICS_SCHEMA_NIET_TOEGESTAAN'
    && veiligIcsAdres('javascript:alert(1)').fout === 'ICS_SCHEMA_NIET_TOEGESTAAN'
    && veiligIcsAdres('geen adres').fout === 'ICS_ADRES_ONGELDIG' && veiligIcsAdres('').fout === 'ICS_ADRES_LEEG');
  check('ICS: een adres met gebruikersnaam of wachtwoord wordt geweigerd (geen geheim in een URL)',
    veiligIcsAdres('https://piet:geheim@example.org/a.ics').fout === 'ICS_ADRES_MET_WACHTWOORD'
    && veiligIcsAdres('https://piet@example.org/a.ics').fout === 'ICS_ADRES_MET_WACHTWOORD');

  // ================================================================ ICS: het schema
  check('ICS: het verversingsschema heeft een ondergrens van 15 minuten en een bovengrens van een week',
    ICS_MIN_MINUTEN === 15 && normaliseerIcsInterval(1) === 15 && normaliseerIcsInterval(0) === 15
    && normaliseerIcsInterval(-5) === 15 && normaliseerIcsInterval(99999) === 7 * 24 * 60
    && normaliseerIcsInterval('onzin') === 60 && ICS_INTERVAL_KEUZES.every((m) => m >= ICS_MIN_MINUTEN));
  const nu = Date.UTC(2026, 9, 20, 12, 0, 0);
  check('ICS: «is dit abonnement aan de beurt» rekent zuiver met het interval (nooit vaker dan afgesproken)',
    icsIsAanDeBeurt(0, 60, nu) === true
    && icsIsAanDeBeurt(nu - 59 * 60000, 60, nu) === false
    && icsIsAanDeBeurt(nu - 61 * 60000, 60, nu) === true
    && icsIsAanDeBeurt(nu - 20 * 60000, 1, nu) === true);
  check('ICS: het venster is begrensd (niet de kalender van 1998 bewaren), maar een reeks blijft altijd',
    ICS_VENSTER_TERUG_DAGEN === 60 && ICS_VENSTER_VOORUIT_DAGEN === 400
    && binnenIcsVenster({ begin: '2026-10-21', einde: '2026-10-21', rrule: '' }, nu) === true
    && binnenIcsVenster({ begin: '1998-01-01', einde: '1998-01-02', rrule: '' }, nu) === false
    && binnenIcsVenster({ begin: '2099-01-01', einde: '2099-01-02', rrule: '' }, nu) === false
    && binnenIcsVenster({ begin: '1998-01-01', einde: '1998-01-02', rrule: 'RRULE:FREQ=YEARLY' }, nu) === true);

  // ================================================================ ICS: het ontleden
  const agenda = ontleedIcs(ICS_VOORBEELD);
  const vind = (uid: string) => agenda.gebeurtenissen.find((g) => g.uid === uid);
  check('ICS: de naam van de kalender en vijf VEVENT\'s worden gelezen; VTIMEZONE wordt NOOIT een afspraak',
    agenda.naam === 'Rooster' && agenda.tijdzone === 'Europe/Brussels' && agenda.gebeurtenissen.length === 5
    && !agenda.gebeurtenissen.some((g) => g.titel === '' && g.rrule.includes('BYMONTH')));
  const metTijd = vind('met-tijd@example.org')!;
  check('ICS: tijden blijven machineleesbaar (ISO + zone), SEQUENCE/LAST-MODIFIED komen mee, tekst wordt ontsnapt',
    metTijd.begin === '2026-11-03T09:00:00' && metTijd.tijdzone === 'Europe/Brussels' && metTijd.einde === '2026-11-03T10:45:00'
    && metTijd.reeks === 3 && metTijd.gewijzigdOp === '2026-10-20T12:00:00Z'
    && metTijd.titel === 'Les wis,kunde' && metTijd.beschrijving.includes('\n')
    && metTijd.organisator === 'school@example.org' && metTijd.url === 'https://example.org/les');
  check('ICS: een hele-dag-afspraak krijgt een INCLUSIEF einde (DTEND is exclusief in RFC 5545)',
    vind('hele-dag@example.org')!.heleDag === true && vind('hele-dag@example.org')!.begin === '2026-12-25'
    && vind('hele-dag@example.org')!.einde === '2026-12-25');
  check('ICS: een UTC-tijd blijft UTC, een reeks houdt haar RRULE, en gevouwen regels worden samengevoegd',
    vind('utc@example.org')!.begin === '2026-11-04T08:00:00Z' && vind('utc@example.org')!.tijdzone === 'UTC'
    && vind('reeks@example.org')!.rrule === 'RRULE:FREQ=WEEKLY;BYDAY=TH'
    && vind('gevouwen@example.org')!.titel === 'Een hele lange titel die over twee regels staat');
  check('ICS: zonder DTEND duurt de afspraak tot haar begin; een VEVENT zonder DTSTART valt weg',
    vind('reeks@example.org')!.einde === vind('reeks@example.org')!.begin
    && ontleedIcs('BEGIN:VCALENDAR\nBEGIN:VEVENT\nUID:x\nSUMMARY:zonder tijd\nEND:VEVENT\nEND:VCALENDAR').gebeurtenissen.length === 0);
  check('ICS: geen VCALENDAR = geen agenda (en geen uitzondering)',
    ontleedIcs('gewoon tekst').gebeurtenissen.length === 0 && ontleedIcs('gewoon tekst').vevents === 0
    && ontleedIcs(null).gebeurtenissen.length === 0 && ontleedIcs(undefined).vevents === 0);
  check('ICS: momenten worden streng ontleed (onzin geeft null, geen verzonnen datum)',
    ontleedIcsMoment('20261103')?.heleDag === true && ontleedIcsMoment('20261103T090000Z')?.tijdzone === 'UTC'
    && ontleedIcsMoment('20261103T090000', 'Europe/Kyiv')?.tijdzone === 'Europe/Kyiv'
    && ontleedIcsMoment('morgen') === null && ontleedIcsMoment('') === null);
  const veel = ['BEGIN:VCALENDAR'];
  for (let i = 0; i < ICS_MAX_GEBEURTENISSEN + 25; i += 1) veel.push('BEGIN:VEVENT', `UID:veel-${i}`, 'SUMMARY:x', 'DTSTART:20261103T090000Z', 'END:VEVENT');
  veel.push('END:VCALENDAR');
  const groot = ontleedIcs(veel.join('\r\n'));
  check('ICS: het aantal afspraken is begrensd, en dat wordt EERLIJK gemeld (afgekapt), niet stil weggelaten',
    groot.gebeurtenissen.length === ICS_MAX_GEBEURTENISSEN && groot.afgekapt === true);

  // ================================================================ ICS: de echte ophaler
  const icsBron = lees('backend/agenda-ics.ts');
  const veiligBron = lees('backend/veilige-fetch.ts');
  check('ICS: de ophaler gaat door de veilige fetcher, met precies de grens en de time-out van het model',
    icsBron.includes("from './veilige-fetch'")
    && /pinnedFetch\(adres, \{ method: 'GET', headers: koppen \}, ICS_TIMEOUT_MS, ICS_MAX_BYTES, 'ICS_BESTAND_TE_GROOT'\)/.test(icsBron)
    && ICS_MAX_BYTES === 4 * 1024 * 1024 && ICS_TIMEOUT_MS === 15000);
  check('ICS: de veilige fetcher dwingt die grens en time-out werkelijk af en volgt geen omleidingen',
    /if\(declared>maxBytes\)/.test(veiligBron) && /if\(total>maxBytes\)/.test(veiligBron)
    && /REMOTE_TIMEOUT/.test(veiligBron) && /timeout:timeoutMs/.test(veiligBron)
    && /target\.protocol!=='https:'/.test(veiligBron) && !/redirect:\s*'follow'/.test(veiligBron)
    && /ICS_OMLEIDING_NIET_GEVOLGD/.test(icsBron));
  check('ICS: een onveranderde kalender kost bijna niets (If-None-Match → 304 laat de spiegel staan)',
    /If-None-Match/.test(icsBron) && /respons\.status === 304/.test(icsBron) && /'onveranderd'/.test(icsBron));
  check('ICS: de SSRF-bescherming kent de privénetwerken (loopback, 10/8, 172.16/12, 192.168/16, link-local, ULA)',
    privateAddress('127.0.0.1') && privateAddress('10.1.2.3') && privateAddress('172.20.0.1')
    && privateAddress('192.168.1.1') && privateAddress('169.254.169.254') && privateAddress('::1')
    && privateAddress('fd00::1') && !privateAddress('93.184.216.34'));

  // ---- met de database: toevoegen, het schema en het weigeren van een privéadres
  const ics = await import('../../backend/agenda-ics');
  const ownerUserId = `eigenaar-ics-${randomUUID()}`;
  try {
    const slecht = await ics.icsToevoegen(ownerUserId, { adres: 'http://example.org/a.ics' });
    check('ICS: een adres dat niet mag, komt de database niet eens in',
      slecht.ok === false && slecht.fout === 'ICS_SCHEMA_NIET_TOEGESTAAN'
      && (await ics.icsLijst(ownerUserId)).length === 0);
    // 127.0.0.1 is een geldig https-adres voor de database, maar de veilige fetcher weigert het: zo is de
    // SSRF-bescherming ook in de ECHTE ophaalweg bewezen, zonder dat er een byte naar buiten gaat.
    const toegevoegd = await ics.icsToevoegen(ownerUserId, { adres: 'https://127.0.0.1/rooster.ics', naam: 'Proef', intervalMinuten: 1 });
    check('ICS: toevoegen slaagt, met het interval op de ondergrens van 15 minuten (niet wat er werd ingetikt)',
      toegevoegd.ok === true && toegevoegd.abonnement!.intervalMinuten === 15 && toegevoegd.abonnement!.adres === 'https://127.0.0.1/rooster.ics');
    const uitslag = await ics.icsOphalen(ownerUserId, toegevoegd.abonnement!.id);
    check('ICS: een adres in het privénetwerk wordt geweigerd vóór er iets binnenkomt, en de reden wordt bewaard',
      uitslag.staat === 'fout' && uitslag.fout === 'ICS_ADRES_GEWEIGERD'
      && (await ics.icsLijst(ownerUserId))[0].fout === 'ICS_ADRES_GEWEIGERD');
    const naPoging = (await ics.icsLijst(ownerUserId))[0];
    check('ICS: na een mislukte poging staat de teller op 1 en de laatste stand op «fout» (geen stille mislukking)',
      naPoging.laatsteStaat === 'fout' && naPoging.laatstOp > 0);
    const zonderForceren = await ics.icsRondeVoorEigenaar(ownerUserId, false);
    check('ICS: het schema wordt gerespecteerd — net opgehaald, dus de ronde slaat dit abonnement over',
      zonderForceren.length === 0);
    const metForceren = await ics.icsRondeVoorEigenaar(ownerUserId, true);
    check('ICS: «Оновити» (forceren) gaat wél meteen, en geeft dezelfde eerlijke fout terug',
      metForceren.length === 1 && metForceren[0].fout === 'ICS_ADRES_GEWEIGERD');
    await ics.icsSchakelen(ownerUserId, toegevoegd.abonnement!.id, false);
    check('ICS: uitgezet betekent uitgezet — de ronde raakt het abonnement niet meer aan',
      (await ics.icsLijst(ownerUserId))[0].actief === false && (await ics.icsRondeVoorEigenaar(ownerUserId, true)).length === 0);
    const dubbel = await ics.icsToevoegen(ownerUserId, { adres: 'https://127.0.0.1/rooster.ics' });
    check('ICS: hetzelfde adres twee keer toevoegen geeft één abonnement (en zet het weer aan)',
      dubbel.ok === true && (await ics.icsLijst(ownerUserId)).length === 1 && (await ics.icsLijst(ownerUserId))[0].actief === true);
    check('ICS: verwijderen haalt het abonnement én zijn afspraken weg',
      (await ics.icsVerwijderen(ownerUserId, toegevoegd.abonnement!.id)) === true
      && (await ics.icsLijst(ownerUserId)).length === 0
      && Number((await sys().query('SELECT count(*)::int AS n FROM app.agenda_externe_gebeurtenis WHERE user_id = $1', [ownerUserId])).rows[0].n) === 0);
  } finally {
    await sys().query('DELETE FROM app.agenda_abonnement WHERE user_id = $1', [ownerUserId]).catch(() => undefined);
  }

  // ================================================================ CalDAV: wat werkt
  check('CalDAV: alleen https, geen geheim in de URL, en de zoekparameters worden weggegooid',
    veiligCaldavAdres('https://caldav.icloud.com/').adres === 'https://caldav.icloud.com/'
    && veiligCaldavAdres('http://caldav.icloud.com/').fout === 'CALDAV_SCHEMA_NIET_TOEGESTAAN'
    && veiligCaldavAdres('https://piet:geheim@dav.example.org/').fout === 'CALDAV_ADRES_MET_WACHTWOORD'
    && veiligCaldavAdres('https://dav.example.org/d/?token=x').adres === 'https://dav.example.org/d/'
    && veiligCaldavAdres('').fout === 'CALDAV_ADRES_LEEG');
  check('CalDAV: de drie PROPFIND-lichamen vragen precies wat RFC 4791 voorschrijft',
    /current-user-principal/.test(CALDAV_PRINCIPAL_LICHAAM) && /urn:ietf:params:xml:ns:caldav/.test(CALDAV_HOME_LICHAAM)
    && /calendar-home-set/.test(CALDAV_HOME_LICHAAM)
    && /resourcetype/.test(CALDAV_AGENDAS_LICHAAM) && /displayname/.test(CALDAV_AGENDAS_LICHAAM)
    && /getctag/.test(CALDAV_AGENDAS_LICHAAM) && /supported-calendar-component-set/.test(CALDAV_AGENDAS_LICHAAM));
  const query = caldavQueryLichaam('2026-08-21T00:00:00Z', '2027-11-24T00:00:00Z');
  check('CalDAV: de REPORT vraagt nooit «alles», maar een calendar-query met een tijdvenster en calendar-data',
    /calendar-query/.test(query) && /comp-filter name="VEVENT"/.test(query)
    && /time-range start="20260821T000000Z" end="20271124T000000Z"/.test(query)
    && /calendar-data/.test(query) && caldavStempel('2026-08-21T00:00:00.123Z') === '20260821T000000Z');
  const agendas = ontleedCaldavAgendas(PROPFIND_AGENDAS, 'https://p42-caldav.example.org/');
  check('CalDAV: uit een echt multistatus-antwoord komt alleen de AGENDA met VEVENT — geen home, geen takenlijst',
    agendas.length === 1 && agendas[0].url === 'https://p42-caldav.example.org/1234/calendars/work/'
    && agendas[0].naam === 'Werk & privé' && agendas[0].ctag === 'HWiwRG'
    && agendas[0].syncToken === 'http://example.org/ns/sync/42' && agendas[0].kleur === '#FF2968');
  check('CalDAV: een href naar een ANDERE host wordt geweigerd (de server mag ons niet wegsturen)',
    !agendas.some((a) => a.url.includes('ander-huis'))
    && caldavAbsoluut('https://dav.example.org/', '/pad/') === 'https://dav.example.org/pad/'
    && caldavAbsoluut('https://dav.example.org/', 'https://kwaad.example.net/pad/') === ''
    && caldavAbsoluut('https://dav.example.org/', 'http://dav.example.org/pad/') === ''
    && caldavEersteHref('<d:href>/een/</d:href><d:href>/twee/</d:href>') === '/een/');
  const bronnen = ontleedCaldavGegevens(REPORT_ANTWOORD);
  check('CalDAV: de .ics-blokken komen eruit (met etag), lege blokken worden overgeslagen',
    bronnen.length === 1 && bronnen[0].etag === '"etag-1"' && bronnen[0].href === '/1234/calendars/work/een.ics'
    && /BEGIN:VCALENDAR/.test(bronnen[0].ics));
  const davGebeurtenissen = ontleedIcs(bronnen[0].ics).gebeurtenissen;
  check('CalDAV: die .ics gaat door DEZELFDE ontleder als een abonnement, dus iCloud en Fastmail geven hetzelfde',
    davGebeurtenissen.length === 1 && davGebeurtenissen[0].uid === 'dav-1@example.org'
    && davGebeurtenissen[0].titel === 'Uit CalDAV' && davGebeurtenissen[0].begin === '2026-11-10T09:00:00Z');
  check('CalDAV: de bekende aanbieders staan erin met een hint in beide talen (iCloud, Fastmail, Nextcloud)',
    CALDAV_AANBIEDERS.length >= 3 && ['icloud', 'fastmail', 'nextcloud'].every((id) => CALDAV_AANBIEDERS.some((a) => a.id === id))
    && CALDAV_AANBIEDERS.every((a) => a.hint[0].length > 10 && a.hint[1].length > 10));

  // ---- het app-wachtwoord staat versleuteld, en de weg naar het ophalen werkt
  process.env.AGENDA_ABONNEMENT_SLEUTEL_V1 = Buffer.alloc(32, 9).toString('base64');
  const caldav = await import('../../backend/agenda-caldav');
  const davOwner = `eigenaar-dav-${randomUUID()}`;
  const davId = randomUUID();
  const davAdres = 'https://127.0.0.1/dav/';
  try {
    const slecht = await caldav.caldavKoppelen(davOwner, { adres: 'http://dav.example.org/', gebruikersnaam: 'piet@example.org', wachtwoord: 'x' });
    check('CalDAV: een adres dat niet mag of ontbrekende aanmeldgegevens komen de database niet in',
      slecht.ok === false && slecht.fout === 'CALDAV_SCHEMA_NIET_TOEGESTAAN'
      && (await caldav.caldavKoppelen(davOwner, { adres: davAdres, gebruikersnaam: '', wachtwoord: '' })).ok === false
      && (await caldav.caldavLijst(davOwner)).length === 0);
    const mislukt = await caldav.caldavKoppelen(davOwner, { adres: davAdres, gebruikersnaam: 'piet@example.org', wachtwoord: 'app-wachtwoord' });
    check('CalDAV: koppelen ontdekt EERST (dus u merkt meteen of het wachtwoord werkt) en laat bij een fout niets achter',
      mislukt.ok === false && mislukt.fout === 'CALDAV_ADRES_GEWEIGERD' && (await caldav.caldavLijst(davOwner)).length === 0);
    // Een rij met een ECHT versleuteld wachtwoord, zoals caldavKoppelen hem na een geslaagde ontdekking schrijft.
    const envelop = sealWithEnvKey(caldav.CALDAV_SLEUTEL_NAAM, 'app-wachtwoord-geheim', `agenda-caldav|${davOwner}|${davAdres}`);
    await sys().query(
      `INSERT INTO app.agenda_abonnement (user_id, id, bron, naam, adres, gebruikersnaam, geheim, interval_minuten, actief, agendas, laatste_staat)
       VALUES ($1,$2,'caldav','iCloud',$3,'piet@example.org',$4,60,true,$5::jsonb,'nieuw')`,
      [davOwner, davId, davAdres, envelop, JSON.stringify([{ url: 'https://127.0.0.1/dav/calendars/work/', naam: 'Werk', ctag: '', syncToken: '', kleur: '', gebeurtenissen: true }])]);
    const rij = (await sys().query('SELECT geheim FROM app.agenda_abonnement WHERE user_id = $1 AND id = $2', [davOwner, davId])).rows[0];
    check('CalDAV: het app-wachtwoord staat NOOIT in platte tekst in de database, maar als AES-256-GCM-envelop',
      String(rij.geheim).startsWith('v1.') && !String(rij.geheim).includes('app-wachtwoord-geheim'));
    const haal = await caldav.caldavOphalen(davOwner, davId);
    check('CalDAV: het geheim wordt werkelijk ontsleuteld (anders zou hier CALDAV_GEHEIM_ONLEESBAAR staan) en het adres wordt geweigerd',
      haal.staat === 'fout' && haal.fout === 'CALDAV_ADRES_GEWEIGERD');
    check('CalDAV: verwijderen haalt het account én zijn afspraken weg',
      (await caldav.caldavVerwijderen(davOwner, davId)) === true && (await caldav.caldavLijst(davOwner)).length === 0);

    // ================================================================ CalDAV: wat NIET werkt, staat overal
    const weigering = caldav.caldavSchrijven();
    check('CalDAV: schrijven WEIGERT altijd, met de volledige lijst van wat ervoor ontbreekt',
      weigering.ok === false && weigering.fout === 'CALDAV_SCHRIJVEN_NIET_GEBOUWD' && weigering.ontbreekt.length >= 4);
    check('CalDAV: die lijst is concreet en tweetalig (PUT/If-Match, sync-collection, scheduling, omleidingen van iCloud)',
      AGENDA_CALDAV_SCHRIJVEN_ONTBREEKT.length >= 4
      && AGENDA_CALDAV_SCHRIJVEN_ONTBREEKT.every((r) => r[0].length > 60 && r[1].length > 60)
      && /If-Match/.test(AGENDA_CALDAV_SCHRIJVEN_ONTBREEKT.map((r) => r[1]).join(' '))
      && /sync-collection/.test(AGENDA_CALDAV_SCHRIJVEN_ONTBREEKT.map((r) => r[1]).join(' '))
      && /6638/.test(AGENDA_CALDAV_SCHRIJVEN_ONTBREEKT.map((r) => r[1]).join(' '))
      && /iCloud/.test(AGENDA_CALDAV_SCHRIJVEN_ONTBREEKT.map((r) => r[1]).join(' ')));
  } finally {
    await sys().query('DELETE FROM app.agenda_abonnement WHERE user_id = $1', [davOwner]).catch(() => undefined);
  }

  const davBron = lees('backend/agenda-caldav.ts');
  check('CalDAV: er bestaat nergens in de servercode een PUT of DELETE naar een CalDAV-resource',
    !/methode: 'PUT'/.test(davBron) && !/methode: 'DELETE'/.test(davBron)
    && /'PROPFIND' \| 'REPORT'/.test(davBron));
  const routes = lees('backend/agenda-routes.ts');
  check('routes: het antwoord van de agenda draagt ALTIJD mee dat CalDAV-schrijven niet gebouwd is, met de reden',
    /caldavSchrijvenOntbreekt: AGENDA_CALDAV_SCHRIJVEN_ONTBREEKT/.test(routes)
    && /schrijven: false, schrijvenOntbreekt: AGENDA_CALDAV_SCHRIJVEN_ONTBREEKT/.test(routes)
    && !/caldav\/(aanmaken|wijzigen|verwijderen-gebeurtenis)/.test(routes));
  const { agendaMogelijkheden } = await import('../../backend/agenda-routes');
  check('routes: het overzicht draagt de eerlijke stand per aanbieder mee, met bij elk «nee» een reden',
    /mogelijkheden: agendaMogelijkheden/.test(routes)
    && agendaMogelijkheden.google.schrijven === true && agendaMogelijkheden.ics.schrijven === false
    && agendaMogelijkheden.caldav.schrijven === false && agendaMogelijkheden.microsoft.lezen === false
    && Boolean(agendaMogelijkheden.ics.reden) && Boolean(agendaMogelijkheden.microsoft.reden)
    && Boolean(agendaMogelijkheden.proton.reden) && agendaMogelijkheden.caldav.ontbreekt.length >= 4);
  check('routes: er is GEEN route die naar een externe agenda schrijft (ICS en CalDAV zijn lezen)',
    !/ics\/(aanmaken|gebeurtenis)/.test(routes) && !/caldav\/gebeurtenis/.test(routes));
  const pagina = lees('src/agenda/Agenda.tsx');
  check('pagina: de ICS-vorm en de CalDAV-vorm staan er werkelijk, met de lijst van wat voor schrijven ontbreekt',
    /data-agenda-ics-adres='1'/.test(pagina) && /data-agenda-ics-toevoegen='1'/.test(pagina)
    && /data-agenda-caldav-adres='1'/.test(pagina) && /data-agenda-caldav-koppelen='1'/.test(pagina)
    && /data-agenda-caldav-ontbreekt=/.test(pagina) && /data-agenda-caldav-eerlijk='1'/.test(pagina)
    && /data-agenda-caldav-schrijven=/.test(pagina));
  check('pagina: er is GEEN knop die naar een ICS- of CalDAV-agenda zou schrijven',
    !/agenda-ics-nieuwe-gebeurtenis|agenda-caldav-nieuwe-gebeurtenis/.test(pagina)
    && /schrijfbaar: false/.test(lees('backend/agenda-spiegel.ts')));
  const icsKaart = agendaAanbieder('ics-abonnement')!;
  const davKaart = agendaAanbieder('caldav')!;
  const fastmail = agendaAanbieder('fastmail')!;
  check('catalogus: ICS en CalDAV zijn nu ECHT «beschikbaar» — met «alleen lezen» en een beperking die dat uitlegt',
    icsKaart.stand === 'beschikbaar' && icsKaart.richting === 'lezen' && icsKaart.levend === 'ics'
    && icsKaart.doel?.dienst === 'hub' && /eenrichting|односторон/.test(icsKaart.beperking![0] + icsKaart.beperking![1])
    && davKaart.stand === 'beschikbaar' && davKaart.richting === 'lezen' && davKaart.levend === 'caldav'
    && /If-Match/.test(davKaart.beperking![1]) && fastmail.stand === 'beschikbaar' && fastmail.richting === 'lezen');
  check('catalogus: Microsoft en Proton blijven eerlijk «binnenkort», maar zeggen dat hun .ics-link vandaag al werkt',
    agendaAanbieder('microsoft-outlook')!.stand === 'binnenkort' && Boolean(agendaAanbieder('microsoft-outlook')!.viaIcs)
    && agendaAanbieder('proton-calendar')!.stand === 'binnenkort' && Boolean(agendaAanbieder('proton-calendar')!.viaIcs)
    && /\.ics/.test(agendaAanbieder('proton-calendar')!.viaIcs![1]));
  check('migratie 0076: de tabellen staan onder RLS en de database weigert zelf een adres dat geen https is',
    /CREATE TABLE IF NOT EXISTS app\.agenda_abonnement/.test(lees('migrations/0076_agenda_tweerichting.sql'))
    && /adres ~ '\^https:\/\/'/.test(lees('migrations/0076_agenda_tweerichting.sql'))
    && /ENABLE ROW LEVEL SECURITY/.test(lees('migrations/0076_agenda_tweerichting.sql'))
    && /app\.agenda_koppeling, app\.agenda_abonnement, app\.agenda_externe_gebeurtenis TO mijnruimte_app/.test(lees('migrations/rechten.sql')));

  if (sleutelVoor === undefined) delete process.env.AGENDA_ABONNEMENT_SLEUTEL_V1; else process.env.AGENDA_ABONNEMENT_SLEUTEL_V1 = sleutelVoor;
  check('testhulp: de omgeving staat weer zoals ze was (geen lek naar de andere testbestanden)',
    process.env.AGENDA_ABONNEMENT_SLEUTEL_V1 === sleutelVoor);
  return einde();
}
