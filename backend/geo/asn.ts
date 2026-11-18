// БАЗА МЕРЕЖ (PLAATS-TEKENS-001, 17.11.2026): за IP-адресою — номер мережі (ASN), країна мережі й назва провайдера. Працює
// повністю на власному сервері (BYOS): читає файли iptoasn.com (ip2asn-v4.tsv.gz / ip2asn-v6.tsv.gz, суспільне надбання PDDL), які
// адміністратор кладе в MIJN_RUIMTE_GEO_MAP (типово /var/lib/mijn-ruimte/geo) скриптом scripts/asn-basis-bijwerken.mjs.
// Немає файлів — немає провайдера (null), нічого не ламається і нікуди не йде запит під час роботи сайту.
// NETWERKBASIS: IP → ASN + netwerknaam, volledig lokaal. Geen bestand = geen provider; nooit een verzoek naar buiten.
import { existsSync, readFileSync, statSync } from 'node:fs';
import { isIP } from 'node:net';
import path from 'node:path';
import { gunzipSync } from 'node:zlib';

export type AsnAntwoord = { asn: number; land: string; asNaam: string };

// Compact: begin/eind als BigUint64Array (IPv4 volledig, IPv6 alleen de bovenste 64 bits — netwerken zijn nooit kleiner dan /64),
// land als 2 letters in een Uint16Array, namen één keer. Zo kost de IPv4-tabel ~15 MB in plaats van ~300 MB met losse BigInts.
type Tabel = { begin: BigUint64Array; eind: BigUint64Array; asn: Uint32Array; land: Uint16Array; naamId: Uint32Array; namen: string[]; n: number };

export const geoMap = (): string => process.env.MIJN_RUIMTE_GEO_MAP || '/var/lib/mijn-ruimte/geo';

function ipNaarGetal(ip: string): bigint | null {
  const v = isIP(ip);
  if (v === 4) { const d = ip.split('.').map(Number); return BigInt(((d[0] << 24) >>> 0) + (d[1] << 16) + (d[2] << 8) + d[3]); }
  if (v === 6) {
    let [kop, staart = ''] = ip.toLowerCase().split('::');
    if (ip.includes('.')) return null; // IPv4-in-IPv6 (::ffff:1.2.3.4) wordt hieronder apart behandeld
    const a = kop ? kop.split(':') : []; const b = ip.includes('::') ? (staart ? staart.split(':') : []) : [];
    const delen = ip.includes('::') ? [...a, ...Array(8 - a.length - b.length).fill('0'), ...b] : a;
    if (delen.length !== 8) return null;
    return delen.slice(0, 4).reduce((n, h) => (n << 16n) + BigInt(parseInt(h || '0', 16)), 0n);
  }
  return null;
}

/** Leest één tsv(.gz)-bestand: begin, eind, asn, land, naam (gesorteerd op begin, zoals iptoasn levert). */
export function leesAsnTabel(inhoud: Buffer | string): Tabel {
  const tekst = typeof inhoud === 'string' ? inhoud : (inhoud[0] === 0x1f && inhoud[1] === 0x8b ? gunzipSync(inhoud) : inhoud).toString('utf8');
  let cap = 1024; let n = 0;
  let begin = new BigUint64Array(cap), eind = new BigUint64Array(cap), asnA = new Uint32Array(cap), land = new Uint16Array(cap), naamId = new Uint32Array(cap);
  const groei = () => {
    cap *= 2;
    const b2 = new BigUint64Array(cap); b2.set(begin); begin = b2; const e2 = new BigUint64Array(cap); e2.set(eind); eind = e2;
    const a2 = new Uint32Array(cap); a2.set(asnA); asnA = a2; const l2 = new Uint16Array(cap); l2.set(land); land = l2; const n2 = new Uint32Array(cap); n2.set(naamId); naamId = n2;
  };
  const namen: string[] = []; const naamIndex = new Map<string, number>();
  let pos = 0;
  while (pos < tekst.length) {
    let einde = tekst.indexOf('\n', pos); if (einde < 0) einde = tekst.length;
    const regel = tekst.slice(pos, einde); pos = einde + 1;
    if (!regel) continue;
    const [b, e, a, l, naam = ''] = regel.split('\t');
    const asn = Number(a);
    if (!asn) continue; // 0 = «Not routed»
    const bb = ipNaarGetal(b), ee = ipNaarGetal(e);
    if (bb === null || ee === null) continue;
    let id = naamIndex.get(naam);
    if (id === undefined) { id = namen.length; namen.push(naam); naamIndex.set(naam, id); }
    if (n === cap) groei();
    begin[n] = bb; eind[n] = ee; asnA[n] = asn; land[n] = /^[A-Z]{2}$/.test(l) ? (l.charCodeAt(0) << 8) | l.charCodeAt(1) : 0; naamId[n] = id; n++;
  }
  return { begin: begin.slice(0, n), eind: eind.slice(0, n), asn: asnA.slice(0, n), land: land.slice(0, n), naamId: naamId.slice(0, n), namen, n };
}

export function zoekInTabel(t: Tabel, ip: bigint): AsnAntwoord | null {
  let lo = 0, hi = t.n - 1, gevonden = -1;
  while (lo <= hi) { const m = (lo + hi) >> 1; if (t.begin[m] <= ip) { gevonden = m; lo = m + 1; } else hi = m - 1; }
  if (gevonden < 0 || ip > t.eind[gevonden]) return null;
  const l = t.land[gevonden];
  return { asn: t.asn[gevonden], land: l ? String.fromCharCode(l >> 8, l & 255) : '', asNaam: t.namen[t.naamId[gevonden]] };
}

const cache: Record<'v4' | 'v6', { mtime: number; tabel: Tabel | null }> = { v4: { mtime: -1, tabel: null }, v6: { mtime: -1, tabel: null } };
function tabelVoor(soort: 'v4' | 'v6'): Tabel | null {
  const map = geoMap();
  const f = [`ip2asn-${soort}.tsv.gz`, `ip2asn-${soort}.tsv`].map((n) => path.join(map, n)).find((p) => existsSync(p));
  if (!f) return null;
  try {
    const m = statSync(f).mtimeMs;
    if (cache[soort].mtime !== m) cache[soort] = { mtime: m, tabel: leesAsnTabel(readFileSync(f)) };
    return cache[soort].tabel;
  } catch { return null; }
}

/** Lokaal of privé (LAN, loopback, CGNAT …): daar is geen provider te zeggen. */
export function priveAdres(ip: string): boolean {
  return /^(10\.|127\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.|0\.)/.test(ip) || /^(::1$|f[cd]|fe80:)/i.test(ip);
}

export function asnVanIp(ipRuw: unknown): AsnAntwoord | null {
  let ip = String(ipRuw ?? '').trim();
  const m = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(ip); if (m) ip = m[1];
  if (!isIP(ip) || priveAdres(ip)) return null;
  const getal = ipNaarGetal(ip);
  if (getal === null) return null;
  const t = tabelVoor(isIP(ip) === 4 ? 'v4' : 'v6');
  return t ? zoekInTabel(t, getal) : null;
}
