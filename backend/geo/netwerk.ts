// ТИП МЕРЕЖІ ЗАПИТУ (PLAATS-TEKENS-001, 17.11.2026; емблема «Мережа» у сповіщенні про вхід). Відповідає на питання «звідки
// людина зайшла»: дім, мобільна мережа, супутник, VPN, Tor, iCloud Private Relay/WARP, датацентр. Повністю на власному сервері:
// відкриті списки (вихідні вузли Tor, діапазони Apple Private Relay, сервери Mullvad) лежать у MIJN_RUIMTE_GEO_MAP, їх оновлює
// адміністратор (scripts/asn-basis-bijwerken.mjs); правила за номером мережі — тут, у коді. Зворотне ім'я адреси (rDNS) питає
// системний резолвер сервера, з коротким тайм-аутом; без нього просто менше подробиць.
// NETWERKSOORT: thuis/mobiel/satelliet/vpn/tor/relay/datacenter, met zekerheid en bewijs in gewone woorden. Alles lokaal.
import { existsSync, readFileSync, statSync } from 'node:fs';
import { promises as dns } from 'node:dns';
import { isIP } from 'node:net';
import path from 'node:path';
import { gunzipSync } from 'node:zlib';
import { asnVanIp, geoMap, priveAdres, type AsnAntwoord } from './asn';
import { providerTeken } from '../../shared/provider-teken';

export type NetwerkSoort = 'thuis' | 'mobiel' | 'satelliet' | 'vpn' | 'tor' | 'relay' | 'datacenter' | 'werk' | 'onbekend';
export type Zekerheid = 'zeker' | 'bijna' | 'waarschijnlijk' | 'vermoeden';
export type Verbinding = 'glas' | 'kabel' | 'dsl' | null;
export type Tekst = { uk: string; nl: string };
export type NetwerkAntwoord = {
  soort: NetwerkSoort;
  /** Sleutel van het logo in het register (src/merk), of null. */
  dienst: string | null;
  dienstNaam: string | null;
  zekerheid: Zekerheid;
  bewijs: Tekst;
  verbinding: Verbinding;
  asn: number | null;
  /** Tijdzone van de browser past niet bij het land van het IP-adres (alleen een vermoeden). */
  tijdzoneVerschil?: boolean;
};
export type NetwerkHints = { tijdzone?: string | null; land?: string | null; rdns?: string | null };

// ------------------------------------------------------------------------------------------------ regels per netwerknummer
// Nummers en namen nagekeken in de iptoasn-basis (17.11.2026). Номери й назви звірено з базою iptoasn 17.11.2026.
type Regel = { soort: NetwerkSoort; dienst: string | null; naam: string; zekerheid: Zekerheid; uitleg?: Tekst };
const DC_VPN: Tekst = { uk: 'Такі мережі часто орендують VPN-сервіси.', nl: 'Zulke netwerken worden vaak door VPN-diensten gehuurd.' };
const r = (soort: NetwerkSoort, dienst: string | null, naam: string, zekerheid: Zekerheid, uitleg?: Tekst): Regel => ({ soort, dienst, naam, zekerheid, uitleg });
export const NETWERK_ASN: ReadonlyMap<number, Regel> = new Map<number, Regel>([
  // VPN met een eigen netwerk
  [62371, r('vpn', 'protonvpn', 'Proton VPN', 'bijna')], [209103, r('vpn', 'protonvpn', 'Proton VPN', 'bijna')],
  [39351, r('vpn', 'mullvad', 'Mullvad VPN', 'bijna')],
  [136787, r('vpn', 'nordvpn', 'NordVPN', 'bijna')], [141039, r('vpn', 'nordvpn', 'NordVPN', 'bijna')], [147049, r('vpn', 'nordvpn', 'NordVPN', 'bijna')],
  // Relay
  [13335, r('relay', 'cloudflare', 'Cloudflare WARP', 'waarschijnlijk')],
  [714, r('relay', 'icloud', 'iCloud Private Relay', 'waarschijnlijk')], [6185, r('relay', 'icloud', 'iCloud Private Relay', 'waarschijnlijk')],
  // Satelliet
  [14593, r('satelliet', 'starlink', 'Starlink', 'zeker')],
  // Datacenters / hosting («схоже на VPN»)
  [16509, r('datacenter', 'aws', 'Amazon Web Services', 'waarschijnlijk')], [14618, r('datacenter', 'aws', 'Amazon Web Services', 'waarschijnlijk')],
  [14061, r('datacenter', 'digitalocean', 'DigitalOcean', 'waarschijnlijk')],
  [24940, r('datacenter', 'hetzner', 'Hetzner', 'waarschijnlijk')], [213230, r('datacenter', 'hetzner', 'Hetzner', 'waarschijnlijk')], [212317, r('datacenter', 'hetzner', 'Hetzner', 'waarschijnlijk')],
  [16276, r('datacenter', 'ovh', 'OVHcloud', 'waarschijnlijk')],
  [9009, r('datacenter', 'm247', 'M247', 'waarschijnlijk', DC_VPN)],
  [60068, r('datacenter', 'datacamp', 'Datacamp (CDN77)', 'waarschijnlijk', DC_VPN)], [212238, r('datacenter', 'datacamp', 'Datacamp (CDN77)', 'waarschijnlijk', DC_VPN)],
  [396982, r('datacenter', 'google', 'Google Cloud', 'waarschijnlijk')], [15169, r('datacenter', 'google', 'Google', 'waarschijnlijk')], [8075, r('datacenter', 'microsoft', 'Microsoft Azure', 'waarschijnlijk')],
  [63949, r('datacenter', 'akamai', 'Akamai Linode', 'waarschijnlijk')], [20473, r('datacenter', 'vultr', 'Vultr', 'waarschijnlijk', DC_VPN)],
  [51167, r('datacenter', 'contabo', 'Contabo', 'waarschijnlijk')], [60781, r('datacenter', 'leaseweb', 'Leaseweb', 'waarschijnlijk', DC_VPN)],
  [12876, r('datacenter', 'scaleway', 'Scaleway', 'waarschijnlijk')], [202422, r('datacenter', 'gcore', 'G-Core Labs', 'waarschijnlijk', DC_VPN)],
  // Mobiele operatoren (eigen mobiel netwerk)
  [34058, r('mobiel', 'lifecell', 'lifecell', 'bijna')], [21497, r('mobiel', 'vodafone', 'Vodafone Україна', 'bijna')],
  [31615, r('mobiel', 'odido', 'Odido (mobiel)', 'bijna')], [47377, r('mobiel', 'orange', 'Orange Belgium', 'waarschijnlijk')],
  // Thuisnetwerken (vaste lijn)
  [5432, r('thuis', 'proximus', 'Proximus', 'waarschijnlijk')], [6848, r('thuis', 'telenet', 'Telenet', 'waarschijnlijk')],
  [12392, r('thuis', 'voo', 'VOO', 'waarschijnlijk')], [1136, r('thuis', 'kpn', 'KPN', 'waarschijnlijk')], [33915, r('thuis', 'ziggo', 'Ziggo', 'waarschijnlijk')],
  [50266, r('thuis', 'odido', 'Odido Thuis', 'waarschijnlijk')], [6849, r('thuis', 'ukrtelecom', 'Укртелеком', 'waarschijnlijk')],
  [15895, r('thuis', 'kyivstar', 'Київстар', 'vermoeden', { uk: 'Київстар дає і домашній інтернет, і мобільний; без імені адреси не розрізнити.', nl: 'Kyivstar levert zowel thuis- als mobiel internet; zonder adresnaam niet te onderscheiden.' })],
]);

// ------------------------------------------------------------------------------------------------ open lijsten (lokaal)
type Bereik = { begin: BigUint64Array; eind: BigUint64Array; n: number };
const getal = (ip: string): bigint | null => {
  const v = isIP(ip);
  if (v === 4) return BigInt(ip.split('.').reduce((n, d) => n * 256 + Number(d), 0));
  if (v === 6) {
    if (ip.includes('.')) return null;
    const [a, b = ''] = ip.toLowerCase().split('::');
    const k = a ? a.split(':') : []; const s = ip.includes('::') ? (b ? b.split(':') : []) : [];
    const d = ip.includes('::') ? [...k, ...Array(8 - k.length - s.length).fill('0'), ...s] : k;
    if (d.length !== 8) return null;
    // IPv6: alleen de bovenste 64 bits, en apart van IPv4 gehouden met bit 63 (geen IPv4-getal komt zo hoog).
    return (d.slice(0, 4).reduce((n, h) => (n << 16n) + BigInt(parseInt(h || '0', 16)), 0n)) | (1n << 63n);
  }
  return null;
};
function cidr(c: string): [bigint, bigint] | null {
  const [ip, lenS] = c.trim().split('/');
  const g = getal(ip); if (g === null) return null;
  const v6 = isIP(ip) === 6; const len = Number(lenS ?? (v6 ? 64 : 32));
  if (!Number.isInteger(len)) return null;
  if (!v6) { const host = 32n - BigInt(Math.min(32, len)); const b = (g >> host) << host; return [b, b + (1n << host) - 1n]; }
  const host = 64n - BigInt(Math.min(64, len)); const zonder = g & ~(1n << 63n); const b = (zonder >> host) << host;
  return [b | (1n << 63n), (b + (1n << host) - 1n) | (1n << 63n)];
}
export function maakBereik(paren: Array<[bigint, bigint]>): Bereik {
  paren.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  const begin = new BigUint64Array(paren.length), eind = new BigUint64Array(paren.length);
  let n = 0;
  for (const [b, e] of paren) {
    if (n && b <= eind[n - 1] + 1n) { if (e > eind[n - 1]) eind[n - 1] = e; continue; } // overlap samenvoegen
    begin[n] = b; eind[n] = e; n++;
  }
  return { begin: begin.slice(0, n), eind: eind.slice(0, n), n };
}
export function inBereik(r: Bereik | null, g: bigint): boolean {
  if (!r) return false;
  let lo = 0, hi = r.n - 1, f = -1;
  while (lo <= hi) { const m = (lo + hi) >> 1; if (r.begin[m] <= g) { f = m; lo = m + 1; } else hi = m - 1; }
  return f >= 0 && g <= r.eind[f];
}
/** Leest een lijst: één IP of CIDR per regel (tor), CSV met CIDR vooraan (Apple), of JSON van Mullvad. */
export function leesLijst(inhoud: string): Bereik {
  const paren: Array<[bigint, bigint]> = [];
  const t = inhoud.trim();
  if (t.startsWith('[')) {
    try {
      for (const x of JSON.parse(t) as Array<Record<string, unknown>>) for (const k of ['ipv4_addr_in', 'ipv6_addr_in']) { const c = typeof x[k] === 'string' ? cidr(String(x[k])) : null; if (c) paren.push(c); }
    } catch { /* kapotte lijst = leeg */ }
  } else {
    for (const regel of t.split('\n')) { const eerste = regel.split(',')[0].trim(); if (!eerste || eerste.startsWith('#')) continue; const c = cidr(eerste); if (c) paren.push(c); }
  }
  return maakBereik(paren);
}
const LIJSTEN = { tor: 'tor-exit.txt', apple: 'apple-relay.csv', mullvad: 'mullvad.json' } as const;
const lijstCache = new Map<string, { mtime: number; bereik: Bereik | null; datum: string }>();
function lijst(soort: keyof typeof LIJSTEN): { bereik: Bereik | null; datum: string } {
  const basis = path.join(geoMap(), LIJSTEN[soort]);
  const f = [basis, `${basis}.gz`].find((p) => existsSync(p));
  if (!f) return { bereik: null, datum: '' };
  try {
    const st = statSync(f); const oud = lijstCache.get(f);
    if (oud && oud.mtime === st.mtimeMs) return oud;
    const buf = readFileSync(f); const tekst = (f.endsWith('.gz') ? gunzipSync(buf) : buf).toString('utf8');
    const v = { mtime: st.mtimeMs, bereik: leesLijst(tekst), datum: st.mtime.toISOString().slice(0, 10) };
    lijstCache.set(f, v);
    return v;
  } catch { return { bereik: null, datum: '' }; }
}

// ------------------------------------------------------------------------------------------------ naam van het adres (rDNS)
const RDNS_MOBIEL = /(^|[.-])(mobile|mobiel|mob|lte|4g|5g|gprs|umts|wap|cellular|cust-mobile|ppp-mob)([.-]|\d|$)/i;
const RDNS_GLAS = /(^|[.-])(ftth|fttb|fttp|fttx|fiber|fibre|glasvezel|glas|gpon|xgs|opt(ic)?)([.-]|\d|$)/i;
const RDNS_KABEL = /(^|[.-])(cable|kabel|docsis|hfc|cm|cpe|catv|dyn\.telenet|ziggozakelijk|upc|voo)([.-]|\d|$)|\.(telenet|ziggo|chello|upc)\./i;
const RDNS_DSL = /(^|[.-])(dsl|adsl|vdsl|xdsl|sdsl|bras|pppoe|dialup|dial-up)([.-]|\d|$)/i;
const RDNS_VPN = /(^|[.-])(vpn|proxy|tor-?exit|exit-?node|relay)([.-]|\d|$)/i;
export function verbindingUitRdns(naam: string | null | undefined): { verbinding: Verbinding; mobiel: boolean; vpn: boolean } {
  const n = String(naam || '').toLowerCase();
  if (!n) return { verbinding: null, mobiel: false, vpn: false };
  return { verbinding: RDNS_GLAS.test(n) ? 'glas' : RDNS_DSL.test(n) ? 'dsl' : RDNS_KABEL.test(n) ? 'kabel' : null, mobiel: RDNS_MOBIEL.test(n), vpn: RDNS_VPN.test(n) };
}
export async function rdnsNaam(ip: string, ms = 800): Promise<string | null> {
  if (!isIP(ip) || priveAdres(ip)) return null;
  try {
    const namen = await Promise.race([dns.reverse(ip), new Promise<string[]>((_, weg) => setTimeout(() => weg(new Error('tijd')), ms))]);
    return namen[0] ? namen[0].slice(0, 200) : null;
  } catch { return null; }
}

// ------------------------------------------------------------------------------------------------ tijdzone ↔ land
// Klein, bewust: alleen zones waarvan het land eenduidig is. Onbekende zone = geen oordeel.
const TZ_LAND: Readonly<Record<string, string>> = {
  'Europe/Brussels': 'BE', 'Europe/Amsterdam': 'NL', 'Europe/Kyiv': 'UA', 'Europe/Kiev': 'UA', 'Europe/Uzhgorod': 'UA', 'Europe/Zaporozhye': 'UA',
  'Europe/Luxembourg': 'LU', 'Europe/Paris': 'FR', 'Europe/Berlin': 'DE', 'Europe/Warsaw': 'PL', 'Europe/London': 'GB', 'Europe/Dublin': 'IE',
  'Europe/Madrid': 'ES', 'Europe/Lisbon': 'PT', 'Europe/Rome': 'IT', 'Europe/Vienna': 'AT', 'Europe/Zurich': 'CH', 'Europe/Prague': 'CZ',
  'Europe/Bratislava': 'SK', 'Europe/Budapest': 'HU', 'Europe/Bucharest': 'RO', 'Europe/Chisinau': 'MD', 'Europe/Sofia': 'BG', 'Europe/Athens': 'GR',
  'Europe/Stockholm': 'SE', 'Europe/Oslo': 'NO', 'Europe/Copenhagen': 'DK', 'Europe/Helsinki': 'FI', 'Europe/Tallinn': 'EE', 'Europe/Riga': 'LV',
  'Europe/Vilnius': 'LT', 'Europe/Moscow': 'RU', 'Europe/Minsk': 'BY', 'Europe/Istanbul': 'TR', 'Asia/Tokyo': 'JP',
};
export function tijdzoneVerschilt(tijdzone: string | null | undefined, land: string | null | undefined): boolean {
  const l = TZ_LAND[String(tijdzone || '')];
  return !!(l && land && /^[A-Z]{2}$/.test(String(land)) && l !== land);
}

// ------------------------------------------------------------------------------------------------ de keuze
const T = (uk: string, nl: string): Tekst => ({ uk, nl });
/** Zuiver (zonder DNS): gebruikt `hints.rdns` als die er is. */
export function netwerkSoort(ipRuw: unknown, hints: NetwerkHints = {}): NetwerkAntwoord {
  let ip = String(ipRuw ?? '').trim();
  const m = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(ip); if (m) ip = m[1];
  const leeg = (bewijs: Tekst): NetwerkAntwoord => ({ soort: 'onbekend', dienst: null, dienstNaam: null, zekerheid: 'vermoeden', bewijs, verbinding: null, asn: null });
  if (!isIP(ip)) return leeg(T('Адресу не визначено.', 'Adres onbekend.'));
  if (priveAdres(ip)) return { ...leeg(T('Локальна адреса: вхід із вашої власної мережі.', 'Lokaal adres: aanmelding vanuit uw eigen netwerk.')), soort: 'werk', zekerheid: 'zeker' };
  const g = getal(ip)!;
  const net: AsnAntwoord | null = asnVanIp(ip);
  const rd = verbindingUitRdns(hints.rdns);
  const tz = tijdzoneVerschilt(hints.tijdzone, hints.land || net?.land);
  const met = (a: Omit<NetwerkAntwoord, 'asn' | 'verbinding'> & { verbinding?: Verbinding }): NetwerkAntwoord => ({
    verbinding: null, ...a, asn: net?.asn ?? null, ...(tz ? { tijdzoneVerschil: true } : {}),
  });

  const tor = lijst('tor');
  if (inBereik(tor.bereik, g)) return met({ soort: 'tor', dienst: 'tor', dienstNaam: 'Tor', zekerheid: 'zeker', bewijs: T(`Адреса є в списку вихідних вузлів Tor Project (${tor.datum}).`, `Het adres staat in de lijst van Tor-uitgangsknooppunten van het Tor Project (${tor.datum}).`) });
  const apple = lijst('apple');
  if (inBereik(apple.bereik, g)) return met({ soort: 'relay', dienst: 'icloud', dienstNaam: 'iCloud Private Relay', zekerheid: 'zeker', bewijs: T(`Адреса з опублікованих Apple діапазонів iCloud Private Relay (${apple.datum}).`, `Het adres valt in de door Apple gepubliceerde bereiken van iCloud Private Relay (${apple.datum}).`) });
  const mull = lijst('mullvad');
  if (inBereik(mull.bereik, g)) return met({ soort: 'vpn', dienst: 'mullvad', dienstNaam: 'Mullvad VPN', zekerheid: 'zeker', bewijs: T(`Адреса є в опублікованому списку серверів Mullvad (${mull.datum}).`, `Het adres staat in de gepubliceerde serverlijst van Mullvad (${mull.datum}).`) });

  const regel = net ? NETWERK_ASN.get(net.asn) : undefined;
  if (regel && regel.soort !== 'thuis') {
    const wie = `${regel.naam} (AS${net!.asn})`;
    const basis = regel.soort === 'vpn' ? T(`Мережа належить VPN-сервісу ${wie}.`, `Het netwerk is van de VPN-dienst ${wie}.`)
      : regel.soort === 'relay' ? T(`Мережа ${wie}: так виглядає ретранслятор, що приховує справжню адресу.`, `Netwerk ${wie}: zo ziet een doorgeefdienst eruit die het echte adres verbergt.`)
        : regel.soort === 'satelliet' ? T(`Мережа ${wie}: супутниковий інтернет.`, `Netwerk ${wie}: internet via satelliet.`)
          : regel.soort === 'mobiel' ? T(`Мережа мобільного оператора ${wie}.`, `Netwerk van mobiele operator ${wie}.`)
            : T(`Мережа хостингу ${wie}: звичайні люди звідси не заходять.`, `Hostingnetwerk ${wie}: gewone gebruikers komen niet van hier.`);
    const extra = regel.uitleg ? ` ${regel.uitleg.uk}` : '', extraNl = regel.uitleg ? ` ${regel.uitleg.nl}` : '';
    return met({ soort: regel.soort, dienst: regel.dienst, dienstNaam: regel.naam, zekerheid: regel.zekerheid, bewijs: T(basis.uk + extra, basis.nl + extraNl), verbinding: rd.verbinding });
  }
  if (rd.vpn) return met({ soort: 'vpn', dienst: null, dienstNaam: null, zekerheid: 'vermoeden', bewijs: T(`Ім'я адреси «${hints.rdns}» схоже на VPN чи проксі.`, `De adresnaam «${hints.rdns}» lijkt op een VPN of proxy.`), verbinding: rd.verbinding });
  if (rd.mobiel) return met({ soort: 'mobiel', dienst: providerTeken({ asn: net?.asn, naam: net?.asNaam })?.sleutel ?? null, dienstNaam: providerTeken({ asn: net?.asn, naam: net?.asNaam })?.naam ?? null, zekerheid: 'bijna', bewijs: T(`Ім'я адреси «${hints.rdns}» належить мобільній мережі.`, `De adresnaam «${hints.rdns}» hoort bij een mobiel netwerk.`) });
  if (regel || net) {
    const p = providerTeken({ asn: net?.asn, naam: net?.asNaam });
    const naam = regel?.naam || p?.naam || net!.asNaam;
    const zeker: Zekerheid = rd.verbinding ? 'bijna' : regel?.zekerheid || 'vermoeden';
    const lijn = rd.verbinding === 'glas' ? T(' Підключення: оптика.', ' Verbinding: glasvezel.') : rd.verbinding === 'kabel' ? T(' Підключення: кабель.', ' Verbinding: kabel.') : rd.verbinding === 'dsl' ? T(' Підключення: DSL (телефонна лінія).', ' Verbinding: DSL (telefoonlijn).') : T('', '');
    const tzT = tz ? T(' Часовий пояс браузера не збігається з країною адреси: можливо, VPN.', ' De tijdzone van de browser past niet bij het land van het adres: mogelijk een VPN.') : T('', '');
    return met({
      soort: regel ? 'thuis' : rd.verbinding ? 'thuis' : 'onbekend', dienst: regel?.dienst ?? p?.sleutel ?? null, dienstNaam: naam, zekerheid: zeker,
      bewijs: T(`Мережа ${naam} (AS${net!.asn}).${regel?.uitleg ? ` ${regel.uitleg.uk}` : ''}${lijn.uk}${tzT.uk}`, `Netwerk ${naam} (AS${net!.asn}).${regel?.uitleg ? ` ${regel.uitleg.nl}` : ''}${lijn.nl}${tzT.nl}`),
      verbinding: rd.verbinding,
    });
  }
  return met({ soort: tz ? 'vpn' : 'onbekend', dienst: null, dienstNaam: null, zekerheid: 'vermoeden', bewijs: tz ? T('Часовий пояс браузера не збігається з країною адреси: можливо, VPN.', 'De tijdzone van de browser past niet bij het land van het adres: mogelijk een VPN.') : T('Мережу не визначено: базу мереж ще не завантажено або адреса нова.', 'Netwerk onbekend: de netwerkbasis ontbreekt nog of het adres is nieuw.') });
}

/** Met de naam van het adres (rDNS) via de resolver van de server, max. ~0,8 s. */
export async function netwerkVanVerzoek(ip: unknown, hints: NetwerkHints = {}): Promise<NetwerkAntwoord> {
  const rdns = hints.rdns !== undefined ? hints.rdns : await rdnsNaam(String(ip ?? '').replace(/^::ffff:/i, ''));
  return netwerkSoort(ip, { ...hints, rdns });
}
