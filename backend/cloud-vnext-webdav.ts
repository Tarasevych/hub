// Захищене підключення зовнішньої хмари WebDAV (Nextcloud та власний NAS, З-13) і керування
// правилами автоматизацій перенесення файлів у межах поточного простору користувача.
//
// ГАРАНТІЇ БЕЗПЕКИ:
//   • Лише зовнішні адреси https:// без вбудованих облікових даних, запитових параметрів чи якорів;
//   • Прив’язка DNS через pinnedFetch (backend/veilige-fetch.ts) проти підроблення серверних запитів
//     і повторного перев’язування DNS; жодних перенаправлень 3xx;
//   • Відсікання декларацій сутностей XML (<!DOCTYPE / <!ENTITY) та перевірка кожного <d:href> проти обходу тек;
//   • Шифрування пароля застосунку виключно через сховище ключів (verzegel/ontzegel із backend/sleutelkluis.ts)
//     з прив’язкою до користувача, простору та запису; пароль ніколи не повертається на клієнт і не пишеться в журнал;
//   • Ізоляція за (user_id, ruimte) під ENABLE + FORCE ROW LEVEL SECURITY у app.cloud_webdav_koppelingen.
// Beveiligde HTTPS-WebDAV-koppelingen (Nextcloud en NAS) en automatiseringsregels per gebruikersruimte.

import { randomUUID } from 'node:crypto';
import { isIP } from 'node:net';
import { db, error, json } from '../server/platform';
import { envSleutelBeschikbaar } from '../server/platform/beveiliging';
import { getPool } from '../server/platform/pg';
import { ipv6Groepen } from '../shared/extern-bureaublad';
import {
  cloudSoort,
  schoneNaam,
  veiligeMime,
  type CloudAutomatiseringRegel,
  type CloudAutomatiseringRichting,
  type CloudSoort,
  type CloudWebdavAanbieder,
  type CloudWebdavIngang,
  type CloudWebdavKoppeling,
} from '../shared/cloud-vnext-model';
import { OVERDRACHT_GRENZEN, type CloudTaakPunt } from '../shared/cloud-overdracht-model';
import { hoortBij, ladeFilter, ladeVelden, type Lade } from '../shared/ruimte-scheiding';
import { SLEUTEL_GESLOTEN_CODE, isServerEnvelop } from '../shared/sleutelkluis';
import { cloudSchrijfWeigering } from './cloud-schrijfrecht';
import { ladeOf } from './ruimte-cloud-agenda';
import {
  herversleutelEnvelop,
  isGeslotenFout,
  ontzegel,
  registreerHerversleutelaar,
  verzegel,
} from './sleutelkluis';
import { pinnedFetch, privateAddress } from './veilige-fetch';

const TABEL_WEBDAV = 'app.cloud_webdav_koppelingen';
const CLOUD_AUDIT = 'cloud_audit_v1';
const AUTOMATISERINGEN = 'cloud_automatiseringen_v1';
const TAKEN = 'cloud_taken_v1';
const CLOUD_ITEMS = 'cloud_items_v1';
const DRIVE_FILES = 'google_suite_drive_projection_v1';
const DAV_NS = 'DAV:';
const TOEGESTANE_POORTEN = new Set(['', '443', '5006', '8443']);
const WEBDAV_TIMEOUT_MS = 15_000;
const WEBDAV_XML_MAX_BYTES = 512 * 1024;
const WEBDAV_MEDIA_MAX_BYTES = 64 * 1024 * 1024;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const PROPFIND_LICHAAM =
  '<?xml version="1.0" encoding="utf-8"?>' +
  '<d:propfind xmlns:d="DAV:"><d:prop>' +
  '<d:resourcetype/><d:getetag/><d:getcontentlength/><d:getcontenttype/><d:displayname/>' +
  '</d:prop></d:propfind>';

type Gebruiker = { id: string; email?: string; role?: string; status?: string; accessLevel?: string };
type SessieAuth = { user: Gebruiker; service: string };

const str = (v: unknown): string => (typeof v === 'string' ? v : '');
const sys = () => getPool('systeem');

const webdavServerSleutel = (): string =>
  envSleutelBeschikbaar('AGENDA_ABONNEMENT_SLEUTEL_V1')
    ? 'AGENDA_ABONNEMENT_SLEUTEL_V1'
    : envSleutelBeschikbaar('CLOUD_OAUTH_TOKEN_ENCRYPTION_KEY_V1')
      ? 'CLOUD_OAUTH_TOKEN_ENCRYPTION_KEY_V1'
      : 'TOTP_ENCRYPTION_KEY_V1';

export const webdavAad = (userId: string, ruimte: 'prive' | 'technisch', id: string): string =>
  `cloud-webdav|${ruimte}|${userId}|${id}`;

registreerHerversleutelaar(TABEL_WEBDAV, async (lade, dek) => {
  const rijen = await sys().query<{ id: string; geheim_envelop: string }>(
    `SELECT id::text AS id, geheim_envelop FROM ${TABEL_WEBDAV} WHERE user_id = $1 AND ruimte = $2`,
    [lade.userId, lade.ruimte],
  );
  let gevonden = 0;
  let herversleuteld = 0;
  const sleutelNaam = webdavServerSleutel();
  for (const rij of rijen.rows) {
    if (!isServerEnvelop(rij.geheim_envelop)) continue;
    gevonden += 1;
    const nieuw = herversleutelEnvelop(
      dek,
      rij.geheim_envelop,
      webdavAad(lade.userId, lade.ruimte, rij.id),
      sleutelNaam,
    );
    await sys().query(
      `UPDATE ${TABEL_WEBDAV} SET geheim_envelop = $1, updated_at = now() WHERE id = $2::uuid AND user_id = $3 AND ruimte = $4`,
      [nieuw, rij.id, lade.userId, lade.ruimte],
    );
    herversleuteld += 1;
  }
  return { gevonden, herversleuteld };
});

type DavKnoop = { local: string; ns: string; text: string; children: DavKnoop[] };

function decodeerXmlEntiteiten(waarde: string): string {
  let uit = '';
  for (let i = 0; i < waarde.length; i += 1) {
    if (waarde[i] !== '&') {
      uit += waarde[i];
      continue;
    }
    const eind = waarde.indexOf(';', i + 1);
    if (eind < 0 || eind - i > 14) throw new Error('XML_ENTITEIT_ONGELDIG');
    const ruw = waarde.slice(i + 1, eind);
    let teken = '';
    if (ruw === 'amp') teken = '&';
    else if (ruw === 'lt') teken = '<';
    else if (ruw === 'gt') teken = '>';
    else if (ruw === 'quot') teken = '"';
    else if (ruw === 'apos') teken = "'";
    else if (/^#(?:x[0-9A-Fa-f]+|[0-9]+)$/.test(ruw)) {
      const hex = ruw.startsWith('#x');
      const code = parseInt(ruw.slice(hex ? 2 : 1), hex ? 16 : 10);
      if (
        !Number.isSafeInteger(code) ||
        code === 0 ||
        code > 0x10ffff ||
        (code >= 0xd800 && code <= 0xdfff) ||
        (code < 32 && code !== 9 && code !== 10 && code !== 13)
      ) {
        throw new Error('XML_ENTITEIT_ONGELDIG');
      }
      teken = String.fromCodePoint(code);
    } else {
      throw new Error('XML_ENTITEIT_ONGELDIG');
    }
    uit += teken;
    i = eind;
  }
  if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f\uFFFE\uFFFF]/u.test(uit)) {
    throw new Error('XML_CONTROLETEKEN');
  }
  return uit;
}

const isXmlNaam = (v: string): boolean => /^[A-Za-z_][\w.-]*(?::[A-Za-z_][\w.-]*)?$/.test(v);

function ontleedDavXml(brontekst: string): DavKnoop {
  let xml = brontekst;
  if (!xml || Buffer.byteLength(xml, 'utf8') > WEBDAV_XML_MAX_BYTES) throw new Error('XML_TE_GROOT');
  if (xml.charCodeAt(0) === 0xfeff) xml = xml.slice(1);
  let i = 0;
  let wortel: DavKnoop | null = null;
  let aantal = 0;
  const stapel: Array<{ knoop: DavKnoop; ns: Record<string, string>; volledig: string }> = [];
  if (xml.startsWith('<?xml')) {
    const eind = xml.indexOf('?>');
    if (eind < 5 || eind > 220) throw new Error('XML_KOP_ONGELDIG');
    i = eind + 2;
  }
  while (i < xml.length) {
    if (xml[i] !== '<') {
      const volgende = xml.indexOf('<', i);
      const eind = volgende < 0 ? xml.length : volgende;
      const stuk = decodeerXmlEntiteiten(xml.slice(i, eind));
      if (stapel.length) {
        const huidig = stapel[stapel.length - 1].knoop;
        huidig.text += stuk;
        if (huidig.text.length > 32768) throw new Error('XML_TEKST_TE_LANG');
      } else if (stuk.trim()) {
        throw new Error('XML_BUITEN_WORTEL');
      }
      i = eind;
      continue;
    }
    if (xml.startsWith('<!', i) || xml.startsWith('<?', i)) throw new Error('XML_DECLARATIE_VERBODEN');
    if (xml.startsWith('</', i)) {
      const eind = xml.indexOf('>', i + 2);
      if (eind < 0) throw new Error('XML_SLUITTAG_ONGELDIG');
      const volledig = xml.slice(i + 2, eind).trim();
      if (!isXmlNaam(volledig) || !stapel.length || stapel[stapel.length - 1].volledig !== volledig) {
        throw new Error('XML_SLUITTAG_MISMATCH');
      }
      stapel.pop();
      i = eind + 1;
      continue;
    }
    let eind = i + 1;
    let aanhaling = '';
    while (eind < xml.length) {
      const c = xml[eind];
      if (aanhaling) {
        if (c === aanhaling) aanhaling = '';
      } else if (c === '"' || c === "'") {
        aanhaling = c;
      } else if (c === '>') {
        break;
      }
      eind += 1;
    }
    if (eind === xml.length || eind - i > 8192 || aanhaling) throw new Error('XML_TAG_ONGELDIG');
    let tag = xml.slice(i + 1, eind).trim();
    let zelfSluitend = false;
    if (tag.endsWith('/')) {
      tag = tag.slice(0, -1).trimEnd();
      zelfSluitend = true;
    }
    const hoofdMatch = /^([^\s]+)(?:\s|$)/.exec(tag);
    const volledig = hoofdMatch ? hoofdMatch[1] : '';
    if (!isXmlNaam(volledig)) throw new Error('XML_NAAM_ONGELDIG');
    const ns: Record<string, string> = { ...(stapel.length ? stapel[stapel.length - 1].ns : {}) };
    let pos = volledig.length;
    while (pos < tag.length) {
      while (/\s/.test(tag[pos] || '')) pos += 1;
      if (pos >= tag.length) break;
      const attrMatch = /^([A-Za-z_][\w.:-]*)/.exec(tag.slice(pos));
      if (!attrMatch || !isXmlNaam(attrMatch[1])) throw new Error('XML_ATTRIBUUT_ONGELDIG');
      const attr = attrMatch[1];
      pos += attr.length;
      while (/\s/.test(tag[pos] || '')) pos += 1;
      if (tag[pos] !== '=') throw new Error('XML_ATTRIBUUT_ONGELDIG');
      pos += 1;
      while (/\s/.test(tag[pos] || '')) pos += 1;
      const q = tag[pos];
      if (q !== '"' && q !== "'") throw new Error('XML_ATTRIBUUT_ONGELDIG');
      pos += 1;
      const sluitQ = tag.indexOf(q, pos);
      if (sluitQ < 0) throw new Error('XML_ATTRIBUUT_ONGELDIG');
      const waarde = decodeerXmlEntiteiten(tag.slice(pos, sluitQ));
      pos = sluitQ + 1;
      if (attr === 'xmlns') ns[''] = waarde;
      else if (attr.startsWith('xmlns:')) ns[attr.slice(6)] = waarde;
    }
    const delen = volledig.split(':');
    const voorvoegsel = delen.length === 2 ? delen[0] : '';
    if (voorvoegsel && !Object.prototype.hasOwnProperty.call(ns, voorvoegsel)) {
      throw new Error('XML_ONGEBONDEN_PREFIX');
    }
    const local = delen[delen.length - 1] || volledig;
    const knoop: DavKnoop = { local, ns: ns[voorvoegsel] || '', text: '', children: [] };
    aantal += 1;
    if (aantal > 3000 || stapel.length >= 24) throw new Error('XML_COMPLEXITEIT');
    if (stapel.length) stapel[stapel.length - 1].knoop.children.push(knoop);
    else if (wortel) throw new Error('XML_MEERDERE_WORTELS');
    else wortel = knoop;
    if (!zelfSluitend) stapel.push({ knoop, ns, volledig });
    i = eind + 1;
  }
  if (stapel.length || !wortel) throw new Error('XML_NIET_GESLOTEN');
  return wortel;
}

const children = (knoop: DavKnoop, local: string, ns: string): DavKnoop[] =>
  knoop.children.filter((x) => x.local === local && x.ns === ns);
const childText = (knoop: DavKnoop, local: string, ns: string): string =>
  children(knoop, local, ns)[0]?.text.trim() || '';

const encodeSegment = (s: string): string =>
  encodeURIComponent(s).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);

export type VeiligWebdavAdresUitkomst =
  | { ok: true; origin: string; padVoorvoegsel: string; volledigAdres: string }
  | { ok: false; fout: string };

/**
 * Чиста сувора перевірка адреси зовнішнього сховища WebDAV:
 * дозволяє лише зовнішній https:// без паролів, запитів, якорів, локальних чи приватних IPv4/IPv6 адрес.
 */
export function veiligWebdavAdres(
  ruwAdres: unknown,
  aanbieder: CloudWebdavAanbieder = 'nextcloud',
  gebruikersnaam = '',
): VeiligWebdavAdresUitkomst {
  const ruw = str(ruwAdres).trim();
  if (!ruw) return { ok: false, fout: 'WEBDAV_ADRES_LEEG' };
  if (ruw.length > 1000 || /[\u0000-\u001f\u007f\s]/.test(ruw)) {
    return { ok: false, fout: 'WEBDAV_ADRES_ONGELDIG' };
  }
  let u: URL;
  try {
    u = new URL(ruw);
  } catch {
    return { ok: false, fout: 'WEBDAV_ADRES_ONGELDIG' };
  }
  if (u.protocol !== 'https:') return { ok: false, fout: 'WEBDAV_SCHEMA_NIET_TOEGESTAAN' };
  if (u.username || u.password) return { ok: false, fout: 'WEBDAV_ADRES_MET_GEHEIM' };
  if (u.search || u.hash) return { ok: false, fout: 'WEBDAV_ADRES_MET_PARAMETERS' };
  if (!TOEGESTANE_POORTEN.has(u.port)) return { ok: false, fout: 'WEBDAV_POORT_NIET_TOEGESTAAN' };

  const host = u.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (
    !host ||
    host === 'localhost' ||
    host.endsWith('.localhost') ||
    host.endsWith('.local') ||
    host.endsWith('.internal') ||
    host.endsWith('.arpa') ||
    (!host.includes('.') && !host.includes(':'))
  ) {
    return { ok: false, fout: 'WEBDAV_ADRES_INTERN_GEWEIGERD' };
  }
  // Відсікаємо нестандартні числові представлення IPv4 (десяткове ціле, вісімкові/шістнадцяткові октети)
  if (/^\d+$/.test(host) || /^0x/i.test(host) || /(?:^|\.)0\d/.test(host)) {
    return { ok: false, fout: 'SSRF_ADRES_GEWEIGERD' };
  }
  if ((isIP(host) !== 0 || ipv6Groepen(host) !== null) && privateAddress(host)) {
    return { ok: false, fout: 'SSRF_ADRES_GEWEIGERD' };
  }

  const ruwPad = u.pathname || '/';
  if (/[\\\r\n\0]/.test(ruwPad) || /%(?:2e|2f|5c|00)/i.test(ruwPad)) {
    return { ok: false, fout: 'WEBDAV_PAD_ONGELDIG' };
  }
  let delen: string[];
  try {
    delen = ruwPad.split('/').filter(Boolean).map(decodeURIComponent);
  } catch {
    return { ok: false, fout: 'WEBDAV_PAD_ONGELDIG' };
  }
  if (delen.length > 24 || delen.some((seg) => seg === '.' || seg === '..' || /[\\/\0]/.test(seg))) {
    return { ok: false, fout: 'WEBDAV_PAD_ONGELDIG' };
  }

  let padVoorvoegsel = delen.length ? `/${delen.map(encodeSegment).join('/')}/` : '/';
  const schoneGebruiker = gebruikersnaam.trim();
  if (
    aanbieder === 'nextcloud' &&
    padVoorvoegsel === '/' &&
    schoneGebruiker &&
    /^[^/\r\n\0\\]{1,150}$/.test(schoneGebruiker) &&
    schoneGebruiker !== '.' &&
    schoneGebruiker !== '..'
  ) {
    padVoorvoegsel = `/remote.php/dav/files/${encodeSegment(schoneGebruiker)}/`;
  }
  if (padVoorvoegsel.length > 500) return { ok: false, fout: 'WEBDAV_PAD_ONGELDIG' };
  return {
    ok: true,
    origin: u.origin,
    padVoorvoegsel,
    volledigAdres: `${u.origin}${padVoorvoegsel}`,
  };
}

function normaliseerRelatiefPad(ruwPad: unknown): { ok: true; segmenten: string[] } | { ok: false; fout: string } {
  const p = str(ruwPad).trim();
  if (!p || p === '/' || p === 'root') return { ok: true, segmenten: [] };
  if (p.length > 600 || /[?#\\\r\n\0]/.test(p) || /%(?:2e|2f|5c|00)/i.test(p)) {
    return { ok: false, fout: 'WEBDAV_PAD_ONGELDIG' };
  }
  let delen: string[];
  try {
    delen = p.split('/').filter(Boolean).map(decodeURIComponent);
  } catch {
    return { ok: false, fout: 'WEBDAV_PAD_ONGELDIG' };
  }
  if (delen.length > 32 || delen.some((seg) => seg === '.' || seg === '..' || /[\\/\0]/.test(seg))) {
    return { ok: false, fout: 'WEBDAV_PAD_ONGELDIG' };
  }
  return { ok: true, segmenten: delen };
}

type WebdavNetwerkFn = (
  url: string,
  init: { method?: string; headers?: Record<string, string>; body?: string },
  timeoutMs: number,
  maxBytes: number,
  tooLargeCode: string,
) => Promise<Response>;

let webdavNetwerk: WebdavNetwerkFn = pinnedFetch;

export const webdavProef = {
  zetNetwerk: (fn: WebdavNetwerkFn | null) => {
    webdavNetwerk = fn ?? pinnedFetch;
  },
};

function basisAuthKop(gebruikersnaam: string, wachtwoord: string): string {
  return `Basic ${Buffer.from(`${gebruikersnaam}:${wachtwoord}`, 'utf8').toString('base64')}`;
}

/**
 * Безпечний виклик PROPFIND із прив’язкою IP-адреси, відмовою від перенаправлень 3xx,
 * захистом від зовнішніх сутностей XML та перевіркою шляхів відповідей.
 */
export async function webdavPropfind(opties: {
  origin: string;
  padVoorvoegsel: string;
  relatiefPad?: string;
  gebruikersnaam: string;
  wachtwoord: string;
}): Promise<{ ok: true; ingangen: CloudWebdavIngang[] } | { ok: false; fout: string; status: number }> {
  const basisControle = veiligWebdavAdres(`${opties.origin}${opties.padVoorvoegsel}`, 'nas-webdav');
  if (!basisControle.ok) return { ok: false, fout: basisControle.fout, status: 400 };
  const rel = normaliseerRelatiefPad(opties.relatiefPad ?? '/');
  if (!rel.ok) return { ok: false, fout: rel.fout, status: 400 };

  const doelPad =
    basisControle.padVoorvoegsel +
    (rel.segmenten.length ? `${rel.segmenten.map(encodeSegment).join('/')}/` : '');
  const url = `${basisControle.origin}${doelPad}`;

  let resp: Response;
  try {
    resp = await webdavNetwerk(
      url,
      {
        method: 'PROPFIND',
        headers: {
          Authorization: basisAuthKop(opties.gebruikersnaam, opties.wachtwoord),
          Depth: '1',
          'Content-Type': 'application/xml; charset=utf-8',
        },
        body: PROPFIND_LICHAAM,
      },
      WEBDAV_TIMEOUT_MS,
      WEBDAV_XML_MAX_BYTES,
      'WEBDAV_ANTWOORD_TE_GROOT',
    );
  } catch (err) {
    const code = String((err as Error)?.message || '');
    if (code === 'SSRF_ADRES_GEWEIGERD') return { ok: false, fout: 'SSRF_ADRES_GEWEIGERD', status: 403 };
    if (code === 'WEBDAV_ANTWOORD_TE_GROOT') return { ok: false, fout: 'WEBDAV_ANTWOORD_TE_GROOT', status: 502 };
    if (code === 'REMOTE_TIMEOUT') return { ok: false, fout: 'WEBDAV_TIJDSLIMIET', status: 504 };
    return { ok: false, fout: 'WEBDAV_NIET_BEREIKBAAR', status: 502 };
  }

  if (resp.status >= 300 && resp.status < 400) {
    return { ok: false, fout: 'WEBDAV_OMLEIDING_GEWEIGERD', status: 502 };
  }
  if (resp.status === 401 || resp.status === 403) {
    return { ok: false, fout: 'WEBDAV_TOEGANG_GEWEIGERD', status: 403 };
  }
  if (resp.status === 404) {
    return { ok: false, fout: 'WEBDAV_PAD_NIET_GEVONDEN', status: 404 };
  }
  if (resp.status !== 200 && resp.status !== 207) {
    return { ok: false, fout: 'WEBDAV_STATUS_ONGELDIG', status: 502 };
  }

  const xmlTekst = await resp.text();
  if (/<!DOCTYPE|<!ENTITY/i.test(xmlTekst)) {
    return { ok: false, fout: 'WEBDAV_XML_ENTITEIT_GEWEIGERD', status: 502 };
  }

  let wortel: DavKnoop;
  try {
    wortel = ontleedDavXml(xmlTekst);
  } catch {
    return { ok: false, fout: 'WEBDAV_XML_ONGELDIG', status: 502 };
  }
  if (wortel.local !== 'multistatus' || wortel.ns !== DAV_NS) {
    return { ok: false, fout: 'WEBDAV_XML_WORTEL_ONGELDIG', status: 502 };
  }

  const antwoorden = children(wortel, 'response', DAV_NS);
  if (antwoorden.length > 250) {
    return { ok: false, fout: 'WEBDAV_TE_VEEL_ITEMS', status: 502 };
  }

  let basisDelen: string[];
  try {
    basisDelen = basisControle.padVoorvoegsel.split('/').filter(Boolean).map(decodeURIComponent);
  } catch {
    return { ok: false, fout: 'WEBDAV_PAD_ONGELDIG', status: 400 };
  }
  const verwachtVoorvoegsel = [...basisDelen, ...rel.segmenten];
  const ingangen: CloudWebdavIngang[] = [];

  for (const knoop of antwoorden) {
    const href = childText(knoop, 'href', DAV_NS);
    let uri: URL;
    try {
      uri = new URL(href, basisControle.origin);
    } catch {
      return { ok: false, fout: 'WEBDAV_HREF_ONGELDIG', status: 502 };
    }
    if (
      uri.origin !== basisControle.origin ||
      uri.username ||
      uri.password ||
      uri.search ||
      uri.hash ||
      /%(?:2e|2f|5c|00)/i.test(uri.pathname)
    ) {
      return { ok: false, fout: 'WEBDAV_HREF_ONBETROUWBAAR', status: 502 };
    }
    let padDelen: string[];
    try {
      padDelen = uri.pathname.split('/').filter(Boolean).map(decodeURIComponent);
    } catch {
      return { ok: false, fout: 'WEBDAV_HREF_ONGELDIG', status: 502 };
    }
    if (padDelen.some((seg) => seg === '.' || seg === '..' || /[\\/\0]/.test(seg))) {
      return { ok: false, fout: 'WEBDAV_PAD_DOORBRAAK_GEWEIGERD', status: 502 };
    }
    if (
      padDelen.length < verwachtVoorvoegsel.length ||
      padDelen.length > verwachtVoorvoegsel.length + 1 ||
      !verwachtVoorvoegsel.every((seg, i) => padDelen[i] === seg)
    ) {
      return { ok: false, fout: 'WEBDAV_PAD_BUITEN_BEREIK', status: 502 };
    }
    if (padDelen.length === verwachtVoorvoegsel.length) continue;

    const propstats = children(knoop, 'propstat', DAV_NS).filter((p) =>
      /\b2\d\d\b/.test(childText(p, 'status', DAV_NS)),
    );
    if (!propstats.length) continue;
    const prop = children(propstats[0], 'prop', DAV_NS)[0];
    if (!prop) continue;

    const rt = children(prop, 'resourcetype', DAV_NS)[0];
    const isMap = Boolean(rt && children(rt, 'collection', DAV_NS).length > 0);
    const lengteRuw = childText(prop, 'getcontentlength', DAV_NS);
    const bytes = isMap ? null : /^\d+$/.test(lengteRuw) ? Number(lengteRuw) : 0;
    const naam = padDelen[padDelen.length - 1] || '';
    if (!naam || naam.length > 300) continue;
    const relatiefVanBasis = padDelen.slice(basisDelen.length);
    ingangen.push({
      pad: `/${relatiefVanBasis.join('/')}${isMap ? '/' : ''}`,
      naam,
      map: isMap,
      bytes: bytes !== null && Number.isSafeInteger(bytes) ? bytes : 0,
      mime: isMap ? 'inode/directory' : veiligeMime(childText(prop, 'getcontenttype', DAV_NS) || 'application/octet-stream'),
      revisie: childText(prop, 'getetag', DAV_NS).slice(0, 160),
    });
  }

  ingangen.sort((a, b) => (a.map === b.map ? a.naam.localeCompare(b.naam, 'uk') : a.map ? -1 : 1));
  return { ok: true, ingangen: ingangen.slice(0, 200) };
}

type RijWebdav = {
  id: string;
  user_id: string;
  ruimte: 'prive' | 'technisch';
  aanbieder: CloudWebdavAanbieder;
  naam: string;
  origin: string;
  pad_voorvoegsel: string;
  gebruikersnaam: string;
  geheim_envelop: string;
  status: 'connected' | 'reauth_required' | 'revoked';
  laatst_gecontroleerd_op: Date | string | null;
  updated_at: Date | string;
};

const naarKoppelingZicht = (r: RijWebdav): CloudWebdavKoppeling => ({
  id: String(r.id),
  aanbieder: r.aanbieder === 'nas-webdav' ? 'nas-webdav' : 'nextcloud',
  naam: String(r.naam),
  origin: String(r.origin),
  padVoorvoegsel: String(r.pad_voorvoegsel || '/'),
  gebruikersnaam: String(r.gebruikersnaam),
  status: r.status === 'reauth_required' || r.status === 'revoked' ? r.status : 'connected',
  laatstGecontroleerdOp: r.laatst_gecontroleerd_op ? new Date(r.laatst_gecontroleerd_op).toISOString() : null,
  bijgewerktOp: new Date(r.updated_at).toISOString(),
});

async function schrijfCloudAudit(
  lade: Lade,
  action: string,
  entityId: string,
  details: Record<string, string | number | boolean>,
): Promise<void> {
  try {
    await db.add(CLOUD_AUDIT, [
      {
        ...ladeVelden(lade),
        action,
        entityType: 'webdav',
        entityId: String(entityId).slice(0, 160),
        result: 'ok',
        details,
        createdAt: Date.now(),
      },
    ]);
  } catch {
    /* збій запису аудиту не розкриває внутрішніх деталей */
  }
}

export async function webdavOverzichtDeel(ownerUserId: string): Promise<{ koppelingen: CloudWebdavKoppeling[] }> {
  try {
    const lade = ladeOf(ownerUserId);
    const r = await sys().query<RijWebdav>(
      `SELECT id::text AS id, user_id, ruimte, aanbieder, naam, origin, pad_voorvoegsel, gebruikersnaam, status, laatst_gecontroleerd_op, updated_at
       FROM ${TABEL_WEBDAV}
       WHERE user_id = $1 AND ruimte = $2 AND status <> 'revoked'
       ORDER BY updated_at DESC`,
      [lade.userId, lade.ruimte],
    );
    return { koppelingen: r.rows.map(naarKoppelingZicht) };
  } catch {
    return { koppelingen: [] };
  }
}

/** Для служби «Фото»: список медіафайлів із підключеного WebDAV поточної полиці користувача. */
export async function webdavMediaLijstVoorLade(
  lade: Lade,
  aanbieder: CloudWebdavAanbieder,
): Promise<{ gekoppeld: boolean; bestanden: Array<{ koppelingId: string; pad: string; naam: string; bytes: number; mime: string }> }> {
  const rijen = await sys()
    .query<RijWebdav>(
      `SELECT id::text AS id, user_id, ruimte, aanbieder, naam, origin, pad_voorvoegsel, gebruikersnaam, geheim_envelop, status, laatst_gecontroleerd_op, updated_at
       FROM ${TABEL_WEBDAV}
       WHERE user_id = $1 AND ruimte = $2 AND aanbieder = $3 AND status = 'connected'
       ORDER BY updated_at DESC`,
      [lade.userId, lade.ruimte, aanbieder],
    )
    .catch(() => ({ rows: [] as RijWebdav[] }));
  if (!rijen.rows.length) return { gekoppeld: false, bestanden: [] };

  const bestanden: Array<{ koppelingId: string; pad: string; naam: string; bytes: number; mime: string }> = [];
  for (const rij of rijen.rows) {
    const wachtwoord = await ontzegel(
      lade,
      TABEL_WEBDAV,
      rij.geheim_envelop,
      webdavAad(lade.userId, lade.ruimte, rij.id),
      webdavServerSleutel(),
    );
    const res = await webdavPropfind({
      origin: rij.origin,
      padVoorvoegsel: rij.pad_voorvoegsel,
      relatiefPad: '/',
      gebruikersnaam: rij.gebruikersnaam,
      wachtwoord,
    });
    if (!res.ok) continue;
    for (const item of res.ingangen) {
      if (item.map) continue;
      bestanden.push({
        koppelingId: rij.id,
        pad: item.pad,
        naam: item.naam,
        bytes: item.bytes ?? 0,
        mime: item.mime,
      });
    }
  }
  return { gekoppeld: true, bestanden };
}

/** Для служби «Фото»: безпечне завантаження байтів одного файла з підключеного WebDAV у межах простору користувача. */
export async function webdavLeesBestandBytes(
  lade: Lade,
  koppelingId: string,
  relatiefPad: string,
  maxBytes = WEBDAV_MEDIA_MAX_BYTES,
): Promise<Buffer> {
  if (!UUID_RE.test(koppelingId)) throw new Error('BRON_NIET_BESCHIKBAAR');
  const rel = normaliseerRelatiefPad(relatiefPad);
  if (!rel.ok || !rel.segmenten.length) throw new Error('BRON_NIET_BESCHIKBAAR');

  const r = await sys().query<RijWebdav>(
    `SELECT id::text AS id, user_id, ruimte, aanbieder, naam, origin, pad_voorvoegsel, gebruikersnaam, geheim_envelop, status, laatst_gecontroleerd_op, updated_at
     FROM ${TABEL_WEBDAV}
     WHERE id = $1::uuid AND user_id = $2 AND ruimte = $3 AND status = 'connected'`,
    [koppelingId, lade.userId, lade.ruimte],
  );
  const rij = r.rows[0];
  if (!rij) throw new Error('BRON_NIET_BESCHIKBAAR');
  const basis = veiligWebdavAdres(`${rij.origin}${rij.pad_voorvoegsel}`, rij.aanbieder);
  if (!basis.ok) throw new Error('BRON_NIET_BESCHIKBAAR');

  const wachtwoord = await ontzegel(
    lade,
    TABEL_WEBDAV,
    rij.geheim_envelop,
    webdavAad(lade.userId, lade.ruimte, rij.id),
    webdavServerSleutel(),
  );
  const url = `${basis.origin}${basis.padVoorvoegsel}${rel.segmenten.map(encodeSegment).join('/')}`;
  const resp = await webdavNetwerk(
    url,
    {
      method: 'GET',
      headers: { Authorization: basisAuthKop(rij.gebruikersnaam, wachtwoord) },
    },
    WEBDAV_TIMEOUT_MS,
    Math.min(maxBytes, WEBDAV_MEDIA_MAX_BYTES),
    'TE_GROOT_VOOR_WEERGAVE',
  );
  if (resp.status >= 300 && resp.status < 400) throw new Error('WEBDAV_OMLEIDING_GEWEIGERD');
  if (resp.status !== 200) throw new Error('BRON_NIET_BESCHIKBAAR');
  const buf = Buffer.from(await resp.arrayBuffer());
  if (buf.length > maxBytes) throw new Error('TE_GROOT_VOOR_WEERGAVE');
  return buf;
}

function normaliseerAanbieder(ruw: unknown): CloudWebdavAanbieder | null {
  const s = str(ruw).trim().toLowerCase();
  if (s === 'nextcloud') return 'nextcloud';
  if (s === 'nas-webdav' || s === 'nas') return 'nas-webdav';
  return null;
}

export async function afhandelenCloudWebdav(body: unknown, auth: SessieAuth): Promise<ReturnType<typeof json>> {
  const d = body && typeof body === 'object' && !Array.isArray(body) ? (body as Record<string, unknown>) : {};
  const lade = ladeOf(auth.user.id);
  const heeftAdres = Boolean(str(d.adres || d.url || d.serverUrl).trim());
  const actie = str(d.actie).trim() || (heeftAdres ? 'koppelen' : 'lijst');

  if (actie === 'lijst') {
    return json(await webdavOverzichtDeel(auth.user.id));
  }

  if (actie === 'testen' || actie === 'koppelen') {
    if (actie === 'koppelen') {
      const geweigerd = await cloudSchrijfWeigering(auth.user, 'POST /api/owner/cloud/vnext/webdav');
      if (geweigerd) return geweigerd;
    }

    // Якщо передано ідентифікатор наявного підключення без нового пароля — перевіряємо збережене підключення
    const bestaandId = str(d.id).trim();
    if (actie === 'testen' && bestaandId && UUID_RE.test(bestaandId) && !heeftAdres) {
      const r = await sys().query<RijWebdav>(
        `SELECT id::text AS id, user_id, ruimte, aanbieder, naam, origin, pad_voorvoegsel, gebruikersnaam, geheim_envelop, status, laatst_gecontroleerd_op, updated_at
         FROM ${TABEL_WEBDAV}
         WHERE id = $1::uuid AND user_id = $2 AND ruimte = $3 AND status <> 'revoked'`,
        [bestaandId, lade.userId, lade.ruimte],
      );
      const rij = r.rows[0];
      if (!rij) return error('WEBDAV_KOPPELING_ONBEKEND', 404);
      let ww: string;
      try {
        ww = await ontzegel(
          lade,
          TABEL_WEBDAV,
          rij.geheim_envelop,
          webdavAad(lade.userId, lade.ruimte, rij.id),
          webdavServerSleutel(),
        );
      } catch (e) {
        if (isGeslotenFout(e)) return error(SLEUTEL_GESLOTEN_CODE, 423);
        return error('WEBDAV_GEHEIM_ONLEESBAAR', 503);
      }
      const proef = await webdavPropfind({
        origin: rij.origin,
        padVoorvoegsel: rij.pad_voorvoegsel,
        relatiefPad: '/',
        gebruikersnaam: rij.gebruikersnaam,
        wachtwoord: ww,
      });
      if (!proef.ok) return error(proef.fout, proef.status);
      await sys().query(
        `UPDATE ${TABEL_WEBDAV} SET status = 'connected', laatst_gecontroleerd_op = now(), updated_at = now()
         WHERE id = $1::uuid AND user_id = $2 AND ruimte = $3`,
        [rij.id, lade.userId, lade.ruimte],
      );
      return json({ ok: true, aantalIngangen: proef.ingangen.length });
    }

    const aanbieder = normaliseerAanbieder(d.aanbieder ?? d.provider) ?? 'nextcloud';
    const gebruikersnaam = str(d.gebruikersnaam ?? d.gebruiker ?? d.username).trim();
    const wachtwoord = str(d.wachtwoord ?? d.password);
    const ruwAdres = d.adres ?? d.url ?? d.serverUrl;

    const adresKeuring = veiligWebdavAdres(ruwAdres, aanbieder, gebruikersnaam);
    if (!adresKeuring.ok) {
      const code = adresKeuring.fout === 'SSRF_ADRES_GEWEIGERD' ? 403 : 400;
      return error(adresKeuring.fout, code);
    }
    if (
      !gebruikersnaam ||
      gebruikersnaam.length > 150 ||
      /[\r\n\0\\/]/.test(gebruikersnaam) ||
      gebruikersnaam === '.' ||
      gebruikersnaam === '..'
    ) {
      return error('WEBDAV_GEBRUIKER_ONGELDIG', 400);
    }
    if (!wachtwoord || wachtwoord.length < 4 || wachtwoord.length > 512 || /[\r\n\0]/.test(wachtwoord)) {
      return error('WEBDAV_WACHTWOORD_ONGELDIG', 400);
    }

    const naam =
      schoneNaam(d.naam || (aanbieder === 'nextcloud' ? `Nextcloud (${gebruikersnaam})` : `NAS (${gebruikersnaam})`)).slice(
        0,
        120,
      ) || (aanbieder === 'nextcloud' ? 'Nextcloud' : 'NAS WebDAV');

    const proef = await webdavPropfind({
      origin: adresKeuring.origin,
      padVoorvoegsel: adresKeuring.padVoorvoegsel,
      relatiefPad: '/',
      gebruikersnaam,
      wachtwoord,
    });
    if (!proef.ok) return error(proef.fout, proef.status);
    if (actie === 'testen') {
      return json({
        ok: true,
        origin: adresKeuring.origin,
        padVoorvoegsel: adresKeuring.padVoorvoegsel,
        aantalIngangen: proef.ingangen.length,
      });
    }

    const bestaandRij = await sys().query<{ id: string }>(
      `SELECT id::text AS id FROM ${TABEL_WEBDAV}
       WHERE user_id = $1 AND ruimte = $2 AND aanbieder = $3 AND origin = $4 AND gebruikersnaam = $5`,
      [lade.userId, lade.ruimte, aanbieder, adresKeuring.origin, gebruikersnaam],
    );
    const id = bestaandRij.rows[0]?.id || randomUUID();
    let envelop: string;
    try {
      envelop = await verzegel(
        lade,
        TABEL_WEBDAV,
        wachtwoord,
        webdavAad(lade.userId, lade.ruimte, id),
        webdavServerSleutel(),
      );
    } catch (e) {
      if (isGeslotenFout(e)) return error(SLEUTEL_GESLOTEN_CODE, 423);
      return error('WEBDAV_SLEUTEL_ONTBREEKT', 503);
    }

    const opgeslagen = await sys().query<RijWebdav>(
      `INSERT INTO ${TABEL_WEBDAV}
        (id, user_id, ruimte, aanbieder, naam, origin, pad_voorvoegsel, gebruikersnaam, geheim_envelop, status, laatst_gecontroleerd_op, updated_at)
       VALUES ($1::uuid, $2, $3, $4, $5, $6, $7, $8, $9, 'connected', now(), now())
       ON CONFLICT (user_id, ruimte, aanbieder, origin, gebruikersnaam)
       DO UPDATE SET
         naam = EXCLUDED.naam,
         pad_voorvoegsel = EXCLUDED.pad_voorvoegsel,
         geheim_envelop = EXCLUDED.geheim_envelop,
         status = 'connected',
         laatst_gecontroleerd_op = now(),
         updated_at = now()
       RETURNING id::text AS id, user_id, ruimte, aanbieder, naam, origin, pad_voorvoegsel, gebruikersnaam, status, laatst_gecontroleerd_op, updated_at`,
      [id, lade.userId, lade.ruimte, aanbieder, naam, adresKeuring.origin, adresKeuring.padVoorvoegsel, gebruikersnaam, envelop],
    );
    await schrijfCloudAudit(lade, 'cloud.webdav.gekoppeld', id, {
      aanbieder,
      origin: adresKeuring.origin,
    });
    return json({ ok: true, koppeling: naarKoppelingZicht(opgeslagen.rows[0]) });
  }

  if (actie === 'mappen') {
    const id = str(d.id).trim();
    if (!UUID_RE.test(id)) return error('WEBDAV_KOPPELING_ONBEKEND', 404);
    const r = await sys().query<RijWebdav>(
      `SELECT id::text AS id, user_id, ruimte, aanbieder, naam, origin, pad_voorvoegsel, gebruikersnaam, geheim_envelop, status, laatst_gecontroleerd_op, updated_at
       FROM ${TABEL_WEBDAV}
       WHERE id = $1::uuid AND user_id = $2 AND ruimte = $3 AND status = 'connected'`,
      [id, lade.userId, lade.ruimte],
    );
    const rij = r.rows[0];
    if (!rij) return error('WEBDAV_KOPPELING_ONBEKEND', 404);
    let ww: string;
    try {
      ww = await ontzegel(
        lade,
        TABEL_WEBDAV,
        rij.geheim_envelop,
        webdavAad(lade.userId, lade.ruimte, rij.id),
        webdavServerSleutel(),
      );
    } catch (e) {
      if (isGeslotenFout(e)) return error(SLEUTEL_GESLOTEN_CODE, 423);
      return error('WEBDAV_GEHEIM_ONLEESBAAR', 503);
    }
    const pad = str(d.pad || '/');
    const lijst = await webdavPropfind({
      origin: rij.origin,
      padVoorvoegsel: rij.pad_voorvoegsel,
      relatiefPad: pad,
      gebruikersnaam: rij.gebruikersnaam,
      wachtwoord: ww,
    });
    if (!lijst.ok) return error(lijst.fout, lijst.status);
    return json({
      koppeling: naarKoppelingZicht(rij),
      pad: pad.startsWith('/') ? pad : `/${pad}`,
      ingangen: lijst.ingangen,
    });
  }

  if (actie === 'ontkoppelen') {
    const geweigerd = await cloudSchrijfWeigering(auth.user, 'POST /api/owner/cloud/vnext/webdav');
    if (geweigerd) return geweigerd;
    const id = str(d.id).trim();
    if (!UUID_RE.test(id)) return error('WEBDAV_KOPPELING_ONBEKEND', 404);
    if (d.bevestig !== true && d.confirm !== true) {
      return error('WEBDAV_BEVESTIGING_VEREIST', 400);
    }
    const r = await sys().query<{ aanbieder: string; origin: string }>(
      `DELETE FROM ${TABEL_WEBDAV}
       WHERE id = $1::uuid AND user_id = $2 AND ruimte = $3
       RETURNING aanbieder, origin`,
      [id, lade.userId, lade.ruimte],
    );
    if (!r.rowCount) return error('WEBDAV_KOPPELING_ONBEKEND', 404);
    await schrijfCloudAudit(lade, 'cloud.webdav.ontkoppeld', id, {
      aanbieder: String(r.rows[0].aanbieder || ''),
      origin: String(r.rows[0].origin || ''),
    });
    return json({ ok: true, id });
  }

  return error('ACTIE_ONGELDIG', 400);
}

// ------------------------------------------------------------------------------- Правила автоматизацій перенесення файлів
type RegelRecord = {
  ownerUserId?: string;
  ruimte?: string;
  naam?: string;
  actief?: boolean;
  richting?: CloudAutomatiseringRichting;
  soortActie?: 'kopie' | 'verplaats';
  filterSoort?: CloudSoort | 'alle';
  bronMapId?: string | null;
  doelMapId?: string | null;
  driveAccountId?: string;
  laatstUitgevoerdOp?: string | null;
  laatstTakenAantal?: number;
  createdAt?: number;
  updatedAt?: number;
};

const SOORTEN_TOEGESTAAN = new Set<string>([
  'alle',
  'afbeelding',
  'video',
  'audio',
  'document',
  'werkblad',
  'presentatie',
  'pdf',
  'archief',
  'code',
  'tekst',
]);

function regelNaarBuiten(r: RegelRecord & { id: string }): CloudAutomatiseringRegel {
  return {
    id: r.id,
    naam: str(r.naam) || 'Правило перенесення',
    actief: r.actief !== false,
    richting: r.richting === 'drive-naar-eigen' ? 'drive-naar-eigen' : 'eigen-naar-drive',
    soortActie: r.soortActie === 'verplaats' ? 'verplaats' : 'kopie',
    filterSoort: SOORTEN_TOEGESTAAN.has(str(r.filterSoort)) ? (r.filterSoort as CloudSoort | 'alle') : 'alle',
    bronMapId: typeof r.bronMapId === 'string' && r.bronMapId ? r.bronMapId : null,
    doelMapId: typeof r.doelMapId === 'string' && r.doelMapId ? r.doelMapId : null,
    driveAccountId: str(r.driveAccountId),
    laatstUitgevoerdOp: typeof r.laatstUitgevoerdOp === 'string' ? r.laatstUitgevoerdOp : null,
    laatstTakenAantal: Number(r.laatstTakenAantal || 0),
    aangemaaktOp: new Date(Number(r.createdAt || Date.now())).toISOString(),
    bijgewerktOp: new Date(Number(r.updatedAt || r.createdAt || Date.now())).toISOString(),
  };
}

async function regelsVanLade(lade: Lade): Promise<Array<RegelRecord & { id: string }>> {
  const res = await db.list<RegelRecord>(AUTOMATISERINGEN, { filter: ladeFilter(lade), limit: 100 });
  return (res.items as Array<RegelRecord & { id: string }>)
    .filter((r) => hoortBij(r as Record<string, unknown>, lade))
    .sort((a, b) => Number(b.updatedAt || b.createdAt || 0) - Number(a.updatedAt || a.createdAt || 0));
}

export async function afhandelenCloudAutomatiseringen(
  body: unknown,
  auth: SessieAuth,
): Promise<ReturnType<typeof json>> {
  const d = body && typeof body === 'object' && !Array.isArray(body) ? (body as Record<string, unknown>) : {};
  const lade = ladeOf(auth.user.id);
  const actie = str(d.actie).trim() || 'lijst';

  if (actie === 'lijst') {
    const regels = await regelsVanLade(lade);
    return json({ regels: regels.map(regelNaarBuiten) });
  }

  const geweigerd = await cloudSchrijfWeigering(auth.user, 'POST /api/owner/cloud/vnext/automatiseringen');
  if (geweigerd) return geweigerd;

  if (actie === 'bewaar') {
    const naam = schoneNaam(d.naam).slice(0, 120);
    if (!naam) return error('NAAM_ONGELDIG', 400);
    const richting: CloudAutomatiseringRichting =
      d.richting === 'drive-naar-eigen' ? 'drive-naar-eigen' : 'eigen-naar-drive';
    const soortActie: 'kopie' | 'verplaats' = d.soortActie === 'verplaats' ? 'verplaats' : 'kopie';
    const filterSoort = SOORTEN_TOEGESTAAN.has(str(d.filterSoort))
      ? (str(d.filterSoort) as CloudSoort | 'alle')
      : 'alle';
    const driveAccountId = str(d.driveAccountId).trim().slice(0, 160);
    if (!driveAccountId) return error('DOEL_NIET_GEKOPPELD', 400);
    const bronMapId = str(d.bronMapId).trim().slice(0, 160) || null;
    const doelMapId = str(d.doelMapId).trim().slice(0, 160) || null;

    const bestaand = await regelsVanLade(lade);
    const idIn = str(d.id).trim();
    const nu = Date.now();
    if (idIn) {
      const gevonden = bestaand.find((x) => x.id === idIn);
      if (!gevonden) return error('REGEL_ONBEKEND', 404);
      const { id, ...rest } = gevonden;
      const bijgewerkt: RegelRecord = {
        ...rest,
        naam,
        actief: d.actief !== false,
        richting,
        soortActie,
        filterSoort,
        bronMapId,
        doelMapId,
        driveAccountId,
        updatedAt: nu,
      };
      await db.update(AUTOMATISERINGEN, [{ id, record: bijgewerkt as Record<string, unknown> }]);
      return json({ regel: regelNaarBuiten({ ...bijgewerkt, id }) });
    }
    if (bestaand.length >= 50) return error('LIMIET_BEREIKT', 400);
    const nieuw: RegelRecord = {
      ...ladeVelden(lade),
      naam,
      actief: d.actief !== false,
      richting,
      soortActie,
      filterSoort,
      bronMapId,
      doelMapId,
      driveAccountId,
      laatstUitgevoerdOp: null,
      laatstTakenAantal: 0,
      createdAt: nu,
      updatedAt: nu,
    };
    const [nieuwId] = await db.add(AUTOMATISERINGEN, [nieuw as Record<string, unknown>]);
    if (!nieuwId) return error('OPSLAAN_MISLUKT', 500);
    await schrijfCloudAudit(lade, 'cloud.automatisering.aangemaakt', nieuwId, { richting, soortActie });
    return json({ regel: regelNaarBuiten({ ...nieuw, id: nieuwId }) });
  }

  if (actie === 'schakel') {
    const id = str(d.id).trim();
    const gevonden = (await regelsVanLade(lade)).find((x) => x.id === id);
    if (!gevonden) return error('REGEL_ONBEKEND', 404);
    const { id: rid, ...rest } = gevonden;
    const actief = d.actief === true;
    const rec: RegelRecord = { ...rest, actief, updatedAt: Date.now() };
    await db.update(AUTOMATISERINGEN, [{ id: rid, record: rec as Record<string, unknown> }]);
    return json({ regel: regelNaarBuiten({ ...rec, id: rid }) });
  }

  if (actie === 'verwijder') {
    const id = str(d.id).trim();
    const gevonden = (await regelsVanLade(lade)).find((x) => x.id === id);
    if (!gevonden) return error('REGEL_ONBEKEND', 404);
    await db.delete(AUTOMATISERINGEN, [id]);
    await schrijfCloudAudit(lade, 'cloud.automatisering.verwijderd', id, {});
    return json({ ok: true, id });
  }

  if (actie === 'uitvoeren') {
    const id = str(d.id).trim();
    const gevonden = (await regelsVanLade(lade)).find((x) => x.id === id);
    if (!gevonden) return error('REGEL_ONBEKEND', 404);

    const nu = Date.now();
    const teMaken: Array<Record<string, unknown>> = [];
    const maxPerRun = 10;

    type EigenBestandRij = {
      ownerUserId?: string;
      ruimte?: string;
      verwijderdOp?: string | null;
      kind?: string;
      storagePath?: string;
      sizeBytes?: number;
      mapId?: string | null;
      mimeType?: string;
      originalName?: string;
      title?: string;
    };
    type DriveProjectieRij = {
      ownerUserId?: string;
      ruimte?: string;
      trashed?: boolean;
      accountId?: string;
      providerFileId?: string;
      mimeType?: string;
      size?: string | number;
      name?: string;
    };

    if (gevonden.richting === 'eigen-naar-drive') {
      const grens = OVERDRACHT_GRENZEN['google-drive'].uploadMaxBytes ?? 5 * 1024 * 1024;
      const itemsRes = await db.list<EigenBestandRij>(CLOUD_ITEMS, { filter: ladeFilter(lade), limit: 500 });
      const kandidaten = (itemsRes.items as Array<EigenBestandRij & { id: string }>).filter((it) => {
        if (!hoortBij(it, lade)) return false;
        if (it.verwijderdOp || it.kind === 'note' || it.kind === 'link' || !it.storagePath) return false;
        const grootte = Number(it.sizeBytes || 0);
        if (grootte <= 0 || grootte > grens) return false;
        if (gevonden.bronMapId && str(it.mapId) !== gevonden.bronMapId) return false;
        if (gevonden.filterSoort && gevonden.filterSoort !== 'alle') {
          const s = cloudSoort(str(it.mimeType), str(it.originalName || it.title));
          if (s !== gevonden.filterSoort) return false;
        }
        return true;
      });
      for (const it of kandidaten.slice(0, maxPerRun)) {
        const naam = schoneNaam(it.originalName || it.title) || 'bestand';
        const bron: CloudTaakPunt = { dienst: 'eigen', id: it.id, naam };
        const doel: CloudTaakPunt = {
          dienst: 'google-drive',
          account: str(gevonden.driveAccountId),
          mapId: str(gevonden.doelMapId || 'root'),
          naam,
        };
        teMaken.push({
          ...ladeVelden(lade),
          soort: gevonden.soortActie === 'verplaats' ? 'verplaats' : 'kopie',
          stand: 'wacht',
          bron,
          doel,
          naam,
          totaalBytes: Number(it.sizeBytes || 0),
          voortgangBytes: 0,
          createdAt: nu,
          updatedAt: nu,
        });
      }
    } else {
      const grens = OVERDRACHT_GRENZEN['google-drive'].downloadMaxBytes ?? 32 * 1024 * 1024;
      const projRes = await db.list<DriveProjectieRij>(DRIVE_FILES, { filter: ladeFilter(lade), limit: 500 });
      const kandidaten = (projRes.items as Array<DriveProjectieRij & { id: string }>).filter((it) => {
        if (!hoortBij(it, lade) || it.trashed) return false;
        if (gevonden.driveAccountId && str(it.accountId) !== gevonden.driveAccountId) return false;
        const mime = str(it.mimeType);
        if (mime === 'application/vnd.google-apps.folder' || mime.startsWith('application/vnd.google-apps.')) {
          return false;
        }
        const grootte = Number(it.size || 0);
        if (grootte <= 0 || grootte > grens) return false;
        if (gevonden.filterSoort && gevonden.filterSoort !== 'alle') {
          if (cloudSoort(mime, str(it.name)) !== gevonden.filterSoort) return false;
        }
        return true;
      });
      for (const it of kandidaten.slice(0, maxPerRun)) {
        const naam = schoneNaam(it.name) || 'bestand';
        const bron: CloudTaakPunt = {
          dienst: 'google-drive',
          account: str(gevonden.driveAccountId),
          id: str(it.providerFileId),
          naam,
        };
        const doel: CloudTaakPunt = {
          dienst: 'eigen',
          mapId: gevonden.doelMapId ?? null,
          naam,
        };
        teMaken.push({
          ...ladeVelden(lade),
          soort: gevonden.soortActie === 'verplaats' ? 'verplaats' : 'kopie',
          stand: 'wacht',
          bron,
          doel,
          naam,
          totaalBytes: Number(it.size || 0),
          voortgangBytes: 0,
          createdAt: nu,
          updatedAt: nu,
        });
      }
    }

    const aangemaaktIds = teMaken.length ? await db.add(TAKEN, teMaken) : [];
    const { id: rid, ...rest } = gevonden;
    const bijgewerkt: RegelRecord = {
      ...rest,
      laatstUitgevoerdOp: new Date(nu).toISOString(),
      laatstTakenAantal: aangemaaktIds.length,
      updatedAt: nu,
    };
    await db.update(AUTOMATISERINGEN, [{ id: rid, record: bijgewerkt as Record<string, unknown> }]);
    await schrijfCloudAudit(lade, 'cloud.automatisering.uitgevoerd', rid, {
      taken: aangemaaktIds.length,
    });
    return json({
      ok: true,
      aangemaakt: aangemaaktIds.length,
      regel: regelNaarBuiten({ ...bijgewerkt, id: rid }),
    });
  }

  return error('ACTIE_ONGELDIG', 400);
}
