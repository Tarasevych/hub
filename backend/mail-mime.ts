// Bouwt een RFC 5322-bericht (multipart/alternative: platte tekst + HTML) voor de Gmail API (users.messages.send / users.drafts.*, veld `raw`).
// Geen afhankelijkheden. Onderwerp en weergavenamen worden RFC 2047-gecodeerd, regels worden afgekapt op 76 tekens (base64) en kopteksten
// kunnen nooit extra regels bevatten (header-injectie).
import { randomBytes } from 'node:crypto';

export type MimeInput = {
  from?: string; to: string[]; cc?: string[]; bcc?: string[]; subject: string; html: string; plainText: string;
  inReplyTo?: string; references?: string;
};

const CRLF = '\r\n';
/** Haalt regeleinden en stuurtekens uit een koptekstwaarde: een koptekst mag nooit door gebruikersinvoer extra regels krijgen. */
export const headerSafe = (value: string, max = 998): string => String(value ?? '').replace(/[\u0000-\u001f\u007f\u2028\u2029]+/g, ' ').trim().slice(0, max);
const isAscii = (value: string) => /^[\x20-\x7e]*$/.test(value);
const b64 = (buf: Buffer) => buf.toString('base64');
const fold = (base64: string) => (base64.match(/.{1,76}/g) ?? []).join(CRLF);

/** RFC 2047 "encoded-word" voor niet-ASCII tekst; lange waarden worden in meerdere woorden gesplitst (max 75 tekens per woord). */
export function encodeWord(value: string): string {
  const text = headerSafe(value);
  if (isAscii(text)) return text;
  const words: string[] = [];
  let current = '';
  for (const ch of text) {
    if (Buffer.byteLength(current + ch) > 30) { words.push(current); current = ''; }
    current += ch;
  }
  if (current) words.push(current);
  return words.map((w) => `=?UTF-8?B?${b64(Buffer.from(w, 'utf8'))}?=`).join(' ');
}

/** "Naam <adres>" -> gecodeerde weergavenaam + adres; een kaal adres blijft ongewijzigd. Ongeldige adressen geven null. */
export function formatAddress(raw: string): string | null {
  const text = headerSafe(raw, 320);
  const match = text.match(/^(?:"?([^"<]*?)"?\s*)?<([^<>\s@]+@[^<>\s@]+\.[^<>\s@]+)>$/) ?? text.match(/^()([^<>\s@",;]+@[^<>\s@",;]+\.[^<>\s@",;]+)$/);
  if (!match) return null;
  const name = (match[1] ?? '').trim();
  const address = match[2];
  if (!name) return address;
  const encoded = isAscii(name) ? `"${name.replace(/(["\\])/g, '\\$1')}"` : encodeWord(name);
  return `${encoded} <${address}>`;
}

/** Splitst een invoerveld ("a@x.nl, b@y.nl; c@z.nl") in geldige adressen; ongeldige delen worden teruggegeven zodat de aanroeper kan weigeren. */
export function parseAddressList(input: string): { valid: string[]; invalid: string[] } {
  const valid: string[] = [];
  const invalid: string[] = [];
  const parts: string[] = [];
  let depth = 0; let quoted = false; let buf = '';
  for (const ch of String(input ?? '')) {
    if (ch === '"') quoted = !quoted;
    if (!quoted && ch === '<') depth++;
    if (!quoted && ch === '>') depth = Math.max(0, depth - 1);
    if ((ch === ',' || ch === ';' || ch === '\n') && depth === 0 && !quoted) { parts.push(buf); buf = ''; } else buf += ch;
  }
  parts.push(buf);
  for (const part of parts.map((p) => p.trim()).filter(Boolean)) {
    const formatted = formatAddress(part);
    if (formatted) valid.push(formatted); else invalid.push(part.slice(0, 80));
  }
  return { valid, invalid };
}

const encodedBody = (text: string) => fold(b64(Buffer.from(text.replace(/\r?\n/g, CRLF), 'utf8')));

export function buildMime(input: MimeInput): string {
  const boundary = `mr_${randomBytes(12).toString('hex')}`;
  const headers: string[] = [];
  if (input.from) headers.push(`From: ${input.from}`);
  if (input.to.length) headers.push(`To: ${input.to.join(', ')}`);
  if (input.cc?.length) headers.push(`Cc: ${input.cc.join(', ')}`);
  if (input.bcc?.length) headers.push(`Bcc: ${input.bcc.join(', ')}`);
  headers.push(`Subject: ${encodeWord(input.subject || '')}`);
  headers.push(`Date: ${new Date().toUTCString()}`);
  headers.push(`Message-ID: <${randomBytes(12).toString('hex')}@mail.tarasevych.com>`);
  if (input.inReplyTo) headers.push(`In-Reply-To: ${headerSafe(input.inReplyTo, 300)}`);
  if (input.references) headers.push(`References: ${headerSafe(input.references, 2000)}`);
  headers.push('MIME-Version: 1.0');
  headers.push(`Content-Type: multipart/alternative; boundary="${boundary}"`);
  const plain = input.plainText || '';
  const html = input.html || `<div>${plain.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/\n/g, '<br>')}</div>`;
  const body = [
    `--${boundary}`, 'Content-Type: text/plain; charset="UTF-8"', 'Content-Transfer-Encoding: base64', '', encodedBody(plain), '',
    `--${boundary}`, 'Content-Type: text/html; charset="UTF-8"', 'Content-Transfer-Encoding: base64', '', encodedBody(html), '',
    `--${boundary}--`, '',
  ].join(CRLF);
  return headers.join(CRLF) + CRLF + CRLF + body;
}

/** Gmail verwacht `raw` als base64url zonder padding. */
export const toGmailRaw = (mime: string): string => Buffer.from(mime, 'utf8').toString('base64url');
