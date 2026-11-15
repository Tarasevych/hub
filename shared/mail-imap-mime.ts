// MAIL-IMAP-LEZEN-001: zuivere ontleding van IMAP-FETCH-antwoorden en MIME (geen netwerk, geen DOM — de tests lezen dit bestand).
// De invoer is een latin1-tekenreeks (één teken = één byte), zodat literals {n} exact geteld worden; tekst wordt pas
// bij het decoderen met de juiste tekenset (utf-8, windows-1251, koi8-u/r, iso-8859-x …) omgezet.
// Uitvoer is ALLEEN platte tekst: HTML wordt teruggebracht tot tekst (geen tags, geen scripts, geen externe beelden).

export type ImapKop = {
  uid: number;
  volgnummer: number;
  van: string;
  vanAdres: string;
  aan: string;
  onderwerp: string;
  datum: number;
  gelezen: boolean;
  grootte: number;
  bijlage: boolean;
};
export type ImapBijlage = { naam: string; type: string; grootte: number };
export type ImapBericht = ImapKop & { tekst: string; bijlagen: ImapBijlage[]; wasHtml: boolean };

const latin1Bytes = (s: string): Uint8Array => { const u = new Uint8Array(s.length); for (let i = 0; i < s.length; i += 1) u[i] = s.charCodeAt(i) & 0xff; return u; };

/** Bytes → tekst in de opgegeven tekenset; onbekende tekenset → utf-8 (vervangtekens in plaats van een fout). */
export function decodeerTekenset(bytes: Uint8Array, tekenset: string): string {
  const cs = (tekenset || 'utf-8').trim().replace(/^"|"$/g, '').toLowerCase();
  const naam = cs === 'cp1251' ? 'windows-1251' : cs === 'koi8u' ? 'koi8-u' : cs === 'us-ascii' || cs === 'ascii' ? 'utf-8' : cs;
  try { return new TextDecoder(naam, { fatal: false }).decode(bytes); } catch { return new TextDecoder('utf-8').decode(bytes); }
}

export function qpNaarBytes(s: string, kop = false): Uint8Array {
  const tekst = (kop ? s.replace(/_/g, ' ') : s).replace(/=\r?\n/g, '');
  const uit: number[] = [];
  for (let i = 0; i < tekst.length; i += 1) {
    const c = tekst[i];
    if (c === '=' && /^[0-9A-Fa-f]{2}$/.test(tekst.slice(i + 1, i + 3))) { uit.push(parseInt(tekst.slice(i + 1, i + 3), 16)); i += 2; }
    else uit.push(tekst.charCodeAt(i) & 0xff);
  }
  return Uint8Array.from(uit);
}
export const base64NaarBytes = (s: string): Uint8Array => Uint8Array.from(Buffer.from(s.replace(/[^A-Za-z0-9+/=]/g, ''), 'base64'));

/** RFC 2047: =?charset?B|Q?…?= ; rest van de kop: als utf-8 (de meeste moderne diensten sturen ruwe utf-8). */
export function decodeerKop(ruw: string): string {
  const zonderVouw = ruw.replace(/\r?\n[ \t]+/g, ' ');
  const delen = zonderVouw.split(/(=\?[^?]+\?[BbQq]\?[^?]*\?=)/);
  let uit = '';
  for (let i = 0; i < delen.length; i += 1) {
    const d = delen[i];
    const m = d.match(/^=\?([^?*]+)(?:\*[^?]*)?\?([BbQq])\?([^?]*)\?=$/);
    if (m) uit += decodeerTekenset(m[2].toUpperCase() === 'B' ? base64NaarBytes(m[3]) : qpNaarBytes(m[3], true), m[1]);
    else if (!(/^\s+$/.test(d) && i > 0 && i < delen.length - 1)) uit += decodeerTekenset(latin1Bytes(d), 'utf-8'); // witruimte tussen twee woorden valt weg
  }
  return uit.replace(/\s+/g, ' ').trim();
}

/** Kopregels → kaart (kleine letters), gevouwen regels samengevoegd. */
export function koppen(blok: string): Record<string, string> {
  const uit: Record<string, string> = {};
  for (const regel of blok.replace(/\r?\n[ \t]+/g, ' ').split(/\r?\n/)) {
    const i = regel.indexOf(':');
    if (i <= 0) continue;
    const k = regel.slice(0, i).trim().toLowerCase();
    if (!(k in uit)) uit[k] = regel.slice(i + 1).trim();
  }
  return uit;
}

const parameter = (waarde: string, naam: string): string => {
  const m = waarde.match(new RegExp(`(?:^|;)\\s*${naam}\\*?=\\s*("([^"]*)"|[^;\\s]+)`, 'i'));
  if (!m) return '';
  const v = m[2] ?? m[1];
  const rfc2231 = v.match(/^([^']*)'[^']*'(.*)$/); // naam*=utf-8''%D0%...
  // %XX rechtstreeks naar bytes: decodeURIComponent gaf tekens (& 0xff verminkte ze) en gooide een fout bij windows-1251-bytes.
  return rfc2231 ? decodeerTekenset(latin1Bytes(rfc2231[2].replace(/%([0-9A-Fa-f]{2})/g, (_m, h: string) => String.fromCharCode(parseInt(h, 16)))), rfc2231[1] || 'utf-8') : decodeerKop(v);
};

/** "Naam <adres>" → [naam, adres] */
export function afzender(van: string): [string, string] {
  const m = van.match(/^\s*"?([^"<]*?)"?\s*<([^>]+)>/);
  if (m) return [m[1].trim() || m[2].trim(), m[2].trim().toLowerCase()];
  const a = van.trim();
  return [a, /@/.test(a) ? a.toLowerCase() : ''];
}

/** HTML → leesbare platte tekst. Geen enkele tag of attribuut overleeft; entiteiten worden opgelost. */
export function htmlNaarTekst(html: string): string {
  return html
    .replace(/<(script|style|head|title|template|svg)[\s\S]*?<\/\1\s*>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|tr|li|h[1-6]|table|blockquote|section)\s*>/gi, '\n')
    .replace(/<li[^>]*>/gi, '• ')
    .replace(/<a\s[^>]*href\s*=\s*["']?(https?:[^"'\s>]+)[^>]*>([\s\S]*?)<\/a>/gi, (_m, href: string, tekst: string) => {
      const t = tekst.replace(/<[^>]*>/g, '').trim();
      return t && !href.includes(t) ? `${t} (${href})` : href;
    })
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/gi, ' ').replace(/&lt;/gi, '<').replace(/&gt;/gi, '>').replace(/&quot;/gi, '"').replace(/&#39;|&apos;/gi, "'")
    .replace(/&#(\d+);/g, (_m, n: string) => { const c = Number(n); return c > 0 && c < 0x110000 ? String.fromCodePoint(c) : ''; })
    .replace(/&#x([0-9a-f]+);/gi, (_m, n: string) => { const c = parseInt(n, 16); return c > 0 && c < 0x110000 ? String.fromCodePoint(c) : ''; })
    .replace(/&amp;/gi, '&')
    .replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').replace(/[ \t]{2,}/g, ' ')
    .trim();
}

type Deel = { koppen: Record<string, string>; lichaam: string };
const splitsDeel = (bron: string): Deel => {
  const m = bron.match(/\r?\n\r?\n/);
  if (!m || m.index === undefined) return { koppen: koppen(bron), lichaam: '' };
  return { koppen: koppen(bron.slice(0, m.index)), lichaam: bron.slice(m.index + m[0].length) };
};
const decodeerLichaam = (d: Deel): Uint8Array => {
  const enc = (d.koppen['content-transfer-encoding'] || '').toLowerCase();
  return enc === 'base64' ? base64NaarBytes(d.lichaam) : enc === 'quoted-printable' ? qpNaarBytes(d.lichaam) : latin1Bytes(d.lichaam);
};

/** MIME-boom doorlopen: beste tekst (text/plain > text/html) en de bijlagen (naam, type, grootte). */
export function mimeTekst(bron: string, diepte = 0): { tekst: string; html: boolean; bijlagen: ImapBijlage[] } {
  const d = splitsDeel(bron);
  const ct = d.koppen['content-type'] || 'text/plain';
  const type = ct.split(';')[0].trim().toLowerCase();
  const disp = d.koppen['content-disposition'] || '';
  const naam = parameter(disp, 'filename') || parameter(ct, 'name');
  if (type.startsWith('multipart/') && diepte < 8) {
    const grens = parameter(ct, 'boundary');
    if (!grens) return { tekst: '', html: false, bijlagen: [] };
    const stukken = d.lichaam.split(new RegExp(`\\r?\\n?--${grens.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:--)?[ \\t]*\\r?\\n?`)).slice(1).filter((s) => s.trim() && !/^--\s*$/.test(s));
    const kinderen = stukken.map((s) => mimeTekst(s, diepte + 1));
    const bijlagen = kinderen.flatMap((k) => k.bijlagen);
    const plat = kinderen.find((k) => k.tekst && !k.html);
    const html = kinderen.find((k) => k.tekst && k.html);
    // multipart/alternative: platte tekst wint; anders (mixed/related): de eerste tekst die er is.
    const kies = type === 'multipart/alternative' ? (plat || html) : kinderen.find((k) => k.tekst);
    return { tekst: kies?.tekst || '', html: Boolean(kies?.html), bijlagen };
  }
  if (/^attachment/i.test(disp) || (naam && !type.startsWith('text/'))) {
    const bytes = decodeerLichaam(d).length;
    return { tekst: '', html: false, bijlagen: [{ naam: naam || type, type, grootte: bytes }] };
  }
  if (type === 'text/plain' || type === 'text/html') {
    const tekst = decodeerTekenset(decodeerLichaam(d), parameter(ct, 'charset') || 'utf-8');
    return type === 'text/html' ? { tekst: htmlNaarTekst(tekst), html: true, bijlagen: [] } : { tekst: tekst.replace(/\r\n/g, '\n').trim(), html: false, bijlagen: [] };
  }
  if (type === 'message/rfc822' && diepte < 8) return mimeTekst(d.lichaam, diepte + 1);
  return { tekst: '', html: false, bijlagen: [] };
}

type FetchItem = { volgnummer: number; uid: number; vlaggen: string; datum: string; grootte: number; literal: string };

/** Alle «* n FETCH (…)»-antwoorden met hun (eerste) literal. */
export function fetchItems(bron: string): FetchItem[] {
  const uit: FetchItem[] = [];
  const re = /\*\s+(\d+)\s+FETCH\s+\(/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(bron))) {
    const begin = m.index + m[0].length;
    const lit = /\{(\d+)\}\r\n/.exec(bron.slice(begin));
    let kop = bron.slice(begin, bron.indexOf('\r\n', begin) >= 0 ? bron.indexOf('\r\n', begin) : bron.length);
    let literal = '';
    let eind = begin + kop.length;
    if (lit && lit.index <= kop.length) {
      const start = begin + lit.index + lit[0].length;
      literal = bron.slice(start, start + Number(lit[1]));
      eind = start + Number(lit[1]);
      kop = bron.slice(begin, begin + lit.index) + bron.slice(eind, bron.indexOf('\r\n', eind) >= 0 ? bron.indexOf('\r\n', eind) : bron.length);
    }
    re.lastIndex = eind;
    uit.push({
      volgnummer: Number(m[1]),
      uid: Number(kop.match(/UID\s+(\d+)/i)?.[1] || 0),
      vlaggen: kop.match(/FLAGS\s+\(([^)]*)\)/i)?.[1] || '',
      datum: kop.match(/INTERNALDATE\s+"([^"]+)"/i)?.[1] || '',
      grootte: Number(kop.match(/RFC822\.SIZE\s+(\d+)/i)?.[1] || 0),
      literal,
    });
  }
  return uit;
}

const datumVan = (kopDatum: string, intern: string): number => {
  const a = Date.parse(kopDatum);
  if (Number.isFinite(a)) return a;
  const b = Date.parse(intern.replace(/^(\d{1,2})-(\w{3})-(\d{4})/, '$1 $2 $3'));
  return Number.isFinite(b) ? b : 0;
};

const kopVan = (f: FetchItem, k: Record<string, string>): ImapKop => {
  const [vanNaam, vanAdres] = afzender(decodeerKop(k.from || ''));
  return {
    uid: f.uid, volgnummer: f.volgnummer, van: vanNaam, vanAdres, aan: decodeerKop(k.to || ''), onderwerp: decodeerKop(k.subject || ''),
    datum: datumVan(k.date || '', f.datum), gelezen: /\\Seen/i.test(f.vlaggen), grootte: f.grootte,
    bijlage: /multipart\/(mixed|related)/i.test(k['content-type'] || ''),
  };
};

export function imapKopUitBron(bron: string): ImapKop[] {
  return fetchItems(bron).filter((f) => f.uid > 0).map((f) => kopVan(f, koppen(f.literal)));
}

export function imapBerichtUitBron(bron: string): ImapBericht | null {
  const f = fetchItems(bron).find((x) => x.uid > 0 && x.literal);
  if (!f) return null;
  const d = splitsDeel(f.literal);
  const inhoud = mimeTekst(f.literal);
  return { ...kopVan(f, d.koppen), bijlage: inhoud.bijlagen.length > 0, tekst: inhoud.tekst.slice(0, 200_000), bijlagen: inhoud.bijlagen.slice(0, 50), wasHtml: inhoud.html };
}
