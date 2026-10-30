// Uitgaande HTML van E-mail (versturen, concepten in Gmail, AI): veilig maken MET behoud van de opmaak.
//
// Waarom zo (incident 10.10, «Тест 1»): de editor bouwt e-mailveilige HTML zoals gangbaar in e-mail — tabellen
// (role="presentation") met INLINE stijlen (achtergrond, padding, rand, ronde hoeken) — maar deze filter liet vroeger alleen
// p/div/span/… en een paar tekststijlen door. Gevolg: kopblok, accentblok, knop en voettekst kwamen in Gmail (en daarna ook in de
// eigen leesweergave, die Gmail toont) als kale tekst aan. Nu: een strikte TOEGESTANE lijst van tags, attributen en CSS-
// eigenschappen met gecontroleerde waarden. Alles wat niet op de lijst staat valt weg: geen script/style/iframe/form, geen
// event-attributen (on…), geen url()/expression() in CSS, alleen http(s)/mailto-links en https- of data:image-afbeeldingen.
// Outlook-specifieke VML-blokken (<!--[if mso]>…<![endif]-->) worden in hun geheel verwijderd (anders verscheen de knoptekst dubbel).
import { decode } from 'html-entities';

const ALLOWED = new Set(['p', 'div', 'br', 'strong', 'b', 'em', 'i', 'u', 's', 'strike', 'code', 'span', 'a', 'blockquote', 'ul', 'ol', 'li',
  'h1', 'h2', 'h3', 'h4', 'pre', 'table', 'tbody', 'thead', 'tr', 'td', 'th', 'img', 'hr']);
const VOID = new Set(['br', 'img', 'hr']);

const KLEUR = /^(?:#[0-9a-f]{3}|#[0-9a-f]{6}|rgb\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*\)|transparent)$/i;
const MAAT = String.raw`(?:0|-?\d{1,4}(?:\.\d{1,3})?(?:px|em|%)?)`;
const MATEN = new RegExp(`^${MAAT}(?:\\s+${MAAT}){0,3}$`);
const EEN_MAAT = new RegExp(`^(?:${MAAT}|auto)$`);
const RAND = /^(?:0|none|\d{1,2}px\s+(?:solid|dashed|dotted)\s+(?:#[0-9a-f]{3}|#[0-9a-f]{6}|rgb\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*\)))$/i;
const FONT = /^(?:Arial|Georgia|Verdana|Tahoma|Trebuchet MS|Courier New|ui-monospace|Helvetica|sans-serif|serif|monospace)(?:,\s*(?:Arial|Georgia|Verdana|Tahoma|Trebuchet MS|Courier New|ui-monospace|Helvetica|sans-serif|serif|monospace))*$/i;

/** Toegestane CSS-eigenschap → controle van de waarde. `background` mag alleen een kleur zijn en wordt background-color. */
const STIJL: Record<string, (v: string) => boolean> = {
  'font-size': (v) => /^(?:[89]|[1-4]\d)px$/.test(v),
  'font-family': (v) => FONT.test(v),
  'font-weight': (v) => /^(?:400|500|600|700|800|normal|bold)$/.test(v),
  'font-style': (v) => /^(?:normal|italic)$/.test(v),
  'text-decoration': (v) => /^(?:none|underline|line-through|underline line-through|line-through underline)$/.test(v),
  'text-align': (v) => /^(?:left|center|right|justify)$/.test(v),
  color: (v) => KLEUR.test(v),
  'background-color': (v) => KLEUR.test(v),
  'line-height': (v) => /^(?:\d(?:\.\d{1,2})?|\d{1,3}px)$/.test(v),
  'vertical-align': (v) => /^(?:top|middle|bottom|baseline)$/.test(v),
  display: (v) => /^(?:block|inline-block|inline)$/.test(v),
  padding: (v) => MATEN.test(v), 'padding-top': (v) => EEN_MAAT.test(v), 'padding-right': (v) => EEN_MAAT.test(v), 'padding-bottom': (v) => EEN_MAAT.test(v), 'padding-left': (v) => EEN_MAAT.test(v),
  margin: (v) => MATEN.test(v) || /^0 auto$/.test(v), 'margin-top': (v) => EEN_MAAT.test(v), 'margin-right': (v) => EEN_MAAT.test(v), 'margin-bottom': (v) => EEN_MAAT.test(v), 'margin-left': (v) => EEN_MAAT.test(v),
  border: (v) => RAND.test(v), 'border-top': (v) => RAND.test(v), 'border-right': (v) => RAND.test(v), 'border-bottom': (v) => RAND.test(v), 'border-left': (v) => RAND.test(v),
  'border-radius': (v) => MATEN.test(v), 'border-collapse': (v) => /^(?:collapse|separate)$/.test(v),
  width: (v) => EEN_MAAT.test(v), 'max-width': (v) => EEN_MAAT.test(v), height: (v) => EEN_MAAT.test(v), 'min-height': (v) => EEN_MAAT.test(v),
  'box-sizing': (v) => /^(?:border-box|content-box)$/.test(v),
  'white-space': (v) => /^(?:pre|pre-wrap|pre-line|normal|nowrap)$/.test(v),
};

const escapeText = (value: string) => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const escapeAttr = (value: string) => escapeText(value).replace(/"/g, '&quot;');
const safeHref = (raw: string) => {
  const value = decode(raw, { level: 'html5', scope: 'attribute' }).trim();
  try { const url = new URL(value); return ['http:', 'https:', 'mailto:'].includes(url.protocol) ? value : ''; } catch { return ''; }
};
const safeSrc = (raw: string) => {
  const value = decode(raw, { level: 'html5', scope: 'attribute' }).trim();
  if (/^data:image\/(?:png|jpe?g|gif|webp);base64,[A-Za-z0-9+/=]+$/i.test(value) && value.length <= 2_000_000) return value;
  try { const url = new URL(value); return url.protocol === 'https:' && !url.username && !url.password ? value : ''; } catch { return ''; }
};

export const safeStyle = (raw: string) => {
  const rows: string[] = [];
  const bron = decode(raw, { level: 'html5', scope: 'attribute' });
  if (/url\s*\(|expression\s*\(|javascript:|@import|\\/i.test(bron)) return '';
  for (const part of bron.split(';')) {
    const separator = part.indexOf(':');
    if (separator < 1) continue;
    let name = part.slice(0, separator).trim().toLowerCase();
    const value = part.slice(separator + 1).trim().replace(/\s+/g, ' ');
    if (!value) continue;
    if (name === 'background') { if (!KLEUR.test(value)) continue; name = 'background-color'; }
    const controle = STIJL[name];
    if (!controle || !controle(value)) continue;
    rows.push(`${name}:${value}`);
  }
  return rows.join(';');
};

/** Toegestane attributen per tag (naast style). */
const ATTR: Record<string, Record<string, (v: string) => string>> = {
  a: { href: safeHref },
  img: { src: safeSrc, alt: (v) => v.slice(0, 300), width: (v) => (/^\d{1,4}%?$/.test(v) ? v : ''), height: (v) => (/^\d{1,4}$/.test(v) ? v : '') },
  table: { role: (v) => (v === 'presentation' ? v : ''), width: (v) => (/^\d{1,4}%?$/.test(v) ? v : ''), cellpadding: (v) => (/^\d{1,2}$/.test(v) ? v : ''), cellspacing: (v) => (/^\d{1,2}$/.test(v) ? v : ''), border: (v) => (/^\d$/.test(v) ? v : ''), align: (v) => (/^(?:left|center|right)$/.test(v) ? v : '') },
  td: { width: (v) => (/^\d{1,4}%?$/.test(v) ? v : ''), align: (v) => (/^(?:left|center|right)$/.test(v) ? v : ''), valign: (v) => (/^(?:top|middle|bottom)$/.test(v) ? v : ''), colspan: (v) => (/^\d{1,2}$/.test(v) ? v : ''), rowspan: (v) => (/^\d{1,2}$/.test(v) ? v : '') },
  th: { width: (v) => (/^\d{1,4}%?$/.test(v) ? v : ''), align: (v) => (/^(?:left|center|right)$/.test(v) ? v : ''), valign: (v) => (/^(?:top|middle|bottom)$/.test(v) ? v : '') },
  ol: { start: (v) => (/^\d{1,4}$/.test(v) ? v : '') },
};
/** Markeringen waarmee de eigen editor een blok bij het heropenen van een concept herkent (geen inhoud, alleen vorm). */
const DATA = /^data-(?:mail-block|kind|bg|fg|url|text|align|count|height|padding)$/;
const dataWaarde = (v: string) => (/^[^\u0000-\u001f<>]{0,500}$/.test(v) ? v : ''); // wordt bij het uitschrijven ge-escaped

const attrs = (raw: string, tag: string) => {
  const values: string[] = [];
  for (const match of raw.matchAll(/([A-Za-z][A-Za-z0-9:-]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g)) {
    const name = match[1].toLowerCase(), value = match[2] ?? match[3] ?? match[4] ?? '';
    if (name === 'style') { const style = safeStyle(value); if (style) values.push(`style="${escapeAttr(style)}"`); continue; }
    if (DATA.test(name)) { const v = dataWaarde(decode(value, { level: 'html5', scope: 'attribute' })); if (v || name === 'data-mail-block') values.push(`${name}="${escapeAttr(v)}"`); continue; }
    const controle = ATTR[tag]?.[name];
    if (!controle) continue;
    const v = controle(value);
    if (v) values.push(`${name}="${escapeAttr(v)}"`);
  }
  return values.length ? ` ${values.join(' ')}` : '';
};

export const normalizeOutboundMailHtml = (value: unknown, max = 250000) => {
  const source = String(value || '').replace(/\u0000/g, '').replace(/​/g, '')
    .replace(/<!--\[if mso\]>[\s\S]*?<!\[endif\]-->/gi, '')
    .replace(/<(script|style|template|iframe|object|svg|math)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, '')
    .slice(0, max);
  const tokens = source.match(/<[^>]*>|[^<]+/g) || [];
  let output = '';
  for (const token of tokens) {
    if (!token.startsWith('<')) { output += escapeText(decode(token, { level: 'html5', scope: 'body' })); continue; }
    if (/^<!/.test(token)) continue; // commentaar, doctype, conditionele opmerkingen
    const closing = /^<\s*\//.test(token), match = /^<\s*\/?\s*([A-Za-z0-9]+)/.exec(token), tag = String(match?.[1] || '').toLowerCase();
    if (!ALLOWED.has(tag)) continue;
    if (closing) { if (!VOID.has(tag)) output += `</${tag}>`; continue; }
    if (tag === 'img') { const a = attrs(token, tag); if (/\ssrc="/.test(a)) output += `<img${a}>`; continue; }
    output += `<${tag}${attrs(token, tag)}>`;
  }
  const plain = mailHtmlToPlainText(output);
  return plain.trim() || /<img\s/.test(output) ? output : '';
};

export const mailHtmlToPlainText = (html: string, max = 100000) => decode(String(html || '')
  .replace(/<br\s*\/?\s*>/gi, '\n')
  .replace(/<\/(?:p|div|blockquote|li|h1|h2|h3|h4|tr|table)>/gi, '\n')
  .replace(/<\/t[dh]>/gi, '\t')
  .replace(/<li(?:\s[^>]*)?>/gi, '• ')
  .replace(/<[^>]+>/g, ''), { level: 'html5', scope: 'body' })
  .replace(/​/g, '').replace(/ /g, ' ').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim().slice(0, max);
