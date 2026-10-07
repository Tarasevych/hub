// Voorvertoning van .ics en .vcf: uitvouwen van regels, tijdzone-parameters, uitgeschakelde tekens, limieten.
import { formatIcsDate, parseIcsEvents, parseVcard } from '../../src/mail-calendar-contact';
import { checker } from './hulp/nep-google';

export async function main(): Promise<number> {
  const { check, einde } = checker('mail-ics-vcf');
  const ics = [
    'BEGIN:VCALENDAR', 'VERSION:2.0',
    'BEGIN:VEVENT', 'SUMMARY:Overleg\\, kwartaal', 'DTSTART;TZID=Europe/Brussels:20261007T140000', 'DTEND:20261007T150000Z', 'LOCATION:Zaal 3',
    'ORGANIZER;CN="Anna de Vries":mailto:anna@example.test', 'DESCRIPTION:Eerste regel\\nTweede regel die lang is en doorloopt', '  over twee regels', 'END:VEVENT',
    'BEGIN:VEVENT', 'SUMMARY:Hele dag', 'DTSTART;VALUE=DATE:20261010', 'END:VEVENT', 'END:VCALENDAR',
  ].join('\r\n');
  const ev = parseIcsEvents(ics);
  check('twee afspraken, tekens uitgeschakeld, datum en tijd leesbaar', ev.length === 2 && ev[0].summary === 'Overleg, kwartaal' && ev[0].start === '2026-10-07 14:00' && ev[0].end === '2026-10-07 15:00 UTC' && ev[1].start === '2026-10-10', JSON.stringify(ev[0]));
  check('organisator met naam en adres; omgevouwen beschrijving is aaneengesloten', ev[0].organizer === 'Anna de Vries <anna@example.test>' && ev[0].description.includes('doorloopt over twee regels') && !ev[0].description.includes('\\n'));
  check('buiten VEVENT en kapotte regels worden genegeerd; geen afspraken = lege lijst', parseIcsEvents('geen agenda').length === 0 && parseIcsEvents('SUMMARY:los\nBEGIN:VEVENT\nSUMMARY:x').length === 0);
  check('maximaal 20 afspraken', parseIcsEvents(Array.from({ length: 50 }, (_, i) => `BEGIN:VEVENT\nSUMMARY:e${i}\nEND:VEVENT`).join('\n')).length === 20);
  check('formatIcsDate: onbekende notatie blijft ingekort zichtbaar', formatIcsDate('morgen') === 'morgen' && formatIcsDate('x'.repeat(200)).length <= 41);
  const vcf = ['BEGIN:VCARD', 'VERSION:3.0', 'N:de Vries;Anna;;;', 'FN:Anna de Vries', 'ORG:Voorbeeld BV;Verkoop', 'TITLE:Manager', 'EMAIL;TYPE=work:anna@example.test', 'TEL;TYPE=cell:+32 470 00 00 00', 'ADR;TYPE=work:;;Straat 1;Gent;;9000;BE', 'END:VCARD'].join('\n');
  const c = parseVcard(vcf);
  check('contact: naam, organisatie, functie, e-mail, telefoon en adres', !!c && c.name === 'Anna de Vries' && c.org === 'Voorbeeld BV, Verkoop' && c.title === 'Manager' && c.emails[0] === 'anna@example.test' && c.phones[0] === '+32 470 00 00 00' && c.address.includes('Straat 1'), JSON.stringify(c));
  check('zonder FN wordt de naam uit N gehaald; geen vCard = null', parseVcard('BEGIN:VCARD\nN:Jansen;Piet\nEND:VCARD')?.name === 'Piet Jansen' && parseVcard('hallo') === null);
  return einde();
}
