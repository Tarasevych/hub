// Snelle voorvertoning van agenda- (.ics) en contactbijlagen (.vcf): alleen lezen, nooit uitvoeren, alles ingekort.
/** start/end: leesbaar («2026-10-07 14:00 UTC»); startRuw/eindeRuw: de waarde uit het bestand («20261007T140000Z», pakket 2: tijdlijn,
 *  kaart in de brief, «В Агенду»), tz: TZID van DTSTART als die er stond. */
export type MailEvent = { summary: string; start: string; end: string; location: string; organizer: string; description: string; startRuw?: string; eindeRuw?: string; tz?: string };
export type MailContact = { name: string; org: string; title: string; emails: string[]; phones: string[]; address: string };

const MAX_EVENTS = 20;
const clip = (value: string, max: number) => (value.length > max ? `${value.slice(0, max)}…` : value);
// RFC 5545/6350: regels die met spatie of tab beginnen zetten de vorige regel voort ("unfolding").
const unfold = (text: string) => text.replace(/\r\n|\r/g, '\n').replace(/\n[ \t]/g, '').split('\n');
const unescapeText = (value: string) => value.replace(/\\n/gi, ' ').replace(/\\([,;\\])/g, '$1');
// "DTSTART;TZID=Europe/Brussels:20261007T140000" -> { name: "DTSTART", params: "TZID=Europe/Brussels", value: "20261007T140000" }
const parseLine = (line: string) => {
  const cut = line.indexOf(':');
  if (cut < 1) return null;
  const head = line.slice(0, cut);
  const semi = head.indexOf(';');
  return { name: (semi < 0 ? head : head.slice(0, semi)).toUpperCase(), params: semi < 0 ? '' : head.slice(semi + 1), value: line.slice(cut + 1) };
};
/** 20261007T140000Z / 20261007 -> "2026-10-07 14:00" (UTC-teken blijft zichtbaar, tijdzones worden niet omgerekend). */
export function formatIcsDate(value: string): string {
  const m = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?$/.exec(value.trim());
  if (!m) return clip(value.trim(), 40);
  return m[4] ? `${m[1]}-${m[2]}-${m[3]} ${m[4]}:${m[5]}${m[7] ? ' UTC' : ''}` : `${m[1]}-${m[2]}-${m[3]}`;
}
const personOf = (params: string, value: string) => {
  const cn = /(?:^|;)CN=("([^"]*)"|[^;]*)/i.exec(params);
  const name = cn ? (cn[2] ?? cn[1]) : '';
  const mail = value.replace(/^mailto:/i, '').trim();
  return name && mail ? `${name} <${mail}>` : name || mail;
};

export function parseIcsEvents(text: string): MailEvent[] {
  const events: MailEvent[] = [];
  let current: MailEvent | null = null;
  for (const raw of unfold(text)) {
    const line = parseLine(raw.trim());
    if (!line) continue;
    if (line.name === 'BEGIN' && line.value.toUpperCase() === 'VEVENT') { current = { summary: '', start: '', end: '', location: '', organizer: '', description: '' }; continue; }
    if (line.name === 'END' && line.value.toUpperCase() === 'VEVENT') { if (current) events.push(current); current = null; if (events.length >= MAX_EVENTS) break; continue; }
    if (!current) continue;
    if (line.name === 'SUMMARY') current.summary = clip(unescapeText(line.value), 200);
    else if (line.name === 'DTSTART') { current.start = formatIcsDate(line.value); current.startRuw = line.value.trim().slice(0, 40); const tz = /(?:^|;)TZID=("[^"]*"|[^;]*)/i.exec(line.params); if (tz) current.tz = tz[1].replace(/"/g, '').slice(0, 80); }
    else if (line.name === 'DTEND') { current.end = formatIcsDate(line.value); current.eindeRuw = line.value.trim().slice(0, 40); }
    else if (line.name === 'LOCATION') current.location = clip(unescapeText(line.value), 200);
    else if (line.name === 'ORGANIZER') current.organizer = clip(personOf(line.params, line.value), 160);
    else if (line.name === 'DESCRIPTION') current.description = clip(unescapeText(line.value), 400);
  }
  return events;
}

export function parseVcard(text: string): MailContact | null {
  const card: MailContact = { name: '', org: '', title: '', emails: [], phones: [], address: '' };
  let inside = false; let found = false;
  for (const raw of unfold(text)) {
    const line = parseLine(raw.trim());
    if (!line) continue;
    if (line.name === 'BEGIN' && line.value.toUpperCase() === 'VCARD') { inside = true; continue; }
    if (line.name === 'END' && line.value.toUpperCase() === 'VCARD') { found = true; break; }
    if (!inside) continue;
    const v = unescapeText(line.value);
    if (line.name === 'FN') card.name = clip(v, 160);
    else if (line.name === 'N' && !card.name) card.name = clip(v.split(';').reverse().filter(Boolean).join(' ').trim(), 160);
    else if (line.name === 'ORG') card.org = clip(v.split(';').filter(Boolean).join(', '), 160);
    else if (line.name === 'TITLE') card.title = clip(v, 160);
    else if (line.name === 'EMAIL' && card.emails.length < 5) card.emails.push(clip(v.replace(/^mailto:/i, ''), 160));
    else if (line.name === 'TEL' && card.phones.length < 5) card.phones.push(clip(v.replace(/^tel:/i, ''), 60));
    else if (line.name === 'ADR' && !card.address) card.address = clip(v.split(';').filter(Boolean).join(', '), 240);
  }
  return found || inside ? card : null;
}
