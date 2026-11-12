// MCP-001 · R1 (12.11.2026): Client ID Metadata Documents (CIMD, SEP-991; MCP 2025-11-25 → SHOULD, 2026-07-28 — основний шлях
// замість застарілої динамічної реєстрації DCR). Клієнт ШІ називає себе HTTPS-адресою (`client_id = https://…/client.json`);
// ми завантажуємо цей документ і перевіряємо: `client_id` у документі ТОЧНО дорівнює адресі, є `client_name` і `redirect_uris`,
// адреси повернення — лише ті, що й для DCR (відомі ШІ-клієнти, loopback, схеми застосунків).
//
// Bescherming tegen SSRF (security best practices, MUST bij het ophalen van metadata):
//  - alleen https, poort 443, geen gebruikersnaam/wachtwoord, geen fragment, pad verplicht (niet «/»);
//  - DNS-opzoeking via een eigen `lookup`: ELK adres moet publiek zijn (geen loopback, privé, link-local, CGNAT, multicast,
//    ULA, gereserveerd). Omdat de controle in de verbinding zelf zit, kan DNS-rebinding tussen controle en verbinding niets;
//  - geen omleidingen volgen (3xx = weigeren), tijdslimiet 5 s, hoogstens 16 KB, alleen JSON.
// Uitzetten zonder nieuwe uitrol: MCP_CIMD=uit (dan blijft alleen DCR, zoals vóór R1).
import https from 'node:https';
import dns from 'node:dns';
import net from 'node:net';

export const cimdAan = (v: string | undefined = process.env.MCP_CIMD): boolean => String(v || '').trim().toLowerCase() !== 'uit';

const MAX_BYTES = 16 * 1024;
const TIMEOUT_MS = 5000;
const TTL_STANDAARD = 60 * 60 * 1000, TTL_MIN = 60 * 1000, TTL_MAX = 24 * 60 * 60 * 1000;

/** Is deze client_id een CIMD-adres (in plaats van een mcpc_…-id uit DCR)? */
export function isCimdClientId(id: unknown): id is string {
  const s = String(id ?? '');
  if (!s.startsWith('https://') || s.length > 512) return false;
  try {
    const u = new URL(s);
    return u.protocol === 'https:' && !u.username && !u.password && !u.hash && (u.port === '' || u.port === '443') && !!u.pathname && u.pathname !== '/';
  } catch { return false; }
}

// ---------------------------------------------------------------- IP-controle

const V4_GEBLOKKEERD: Array<[string, number]> = [
  ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8], ['169.254.0.0', 16], ['172.16.0.0', 12],
  ['192.0.0.0', 24], ['192.0.2.0', 24], ['192.88.99.0', 24], ['192.168.0.0', 16], ['198.18.0.0', 15], ['198.51.100.0', 24],
  ['203.0.113.0', 24], ['224.0.0.0', 4], ['240.0.0.0', 4],
];
const v4Getal = (ip: string) => ip.split('.').reduce((n, d) => (n << 8) + Number(d), 0) >>> 0;
const inV4 = (ip: string, [basis, bits]: [string, number]) => bits === 0 || (v4Getal(ip) >>> (32 - bits)) === (v4Getal(basis) >>> (32 - bits));

/** true = dit adres mag NIET bereikt worden (niet-publiek). Onbekende vormen tellen als geblokkeerd. */
export function isNietPubliekIp(ip: string): boolean {
  const v = net.isIP(ip);
  if (v === 4) return V4_GEBLOKKEERD.some((r) => inV4(ip, r));
  if (v !== 6) return true;
  const s = ip.toLowerCase();
  // IPv4 in IPv6 (::ffff:a.b.c.d en ::a.b.c.d): de IPv4-regels gelden
  const v4 = /^(?:::ffff:|::)(\d+\.\d+\.\d+\.\d+)$/.exec(s);
  if (v4) return isNietPubliekIp(v4[1]);
  if (s === '::' || s === '::1') return true;
  const eerste = parseInt(s.split(':')[0] || '0', 16);
  if ((eerste & 0xfe00) === 0xfc00) return true;   // fc00::/7 unique local
  if ((eerste & 0xffc0) === 0xfe80) return true;   // fe80::/10 link-local
  if ((eerste & 0xff00) === 0xff00) return true;   // ff00::/8 multicast
  if (s.startsWith('2001:db8:') || s.startsWith('64:ff9b:') || s.startsWith('100::')) return true; // documentatie, NAT64, discard
  return false;
}

type LookupCb = (err: NodeJS.ErrnoException | null, address: string | dns.LookupAddress[], family?: number) => void;
/** dns.lookup met controle: één niet-publiek adres in het antwoord → de hele verbinding weigeren. */
export function veiligeLookup(hostname: string, options: dns.LookupOptions, cb: LookupCb, opzoek: typeof dns.lookup = dns.lookup): void {
  opzoek(hostname, { ...options, all: true }, (err, adressen) => {
    if (err) return cb(err, '');
    const lijst = (adressen as unknown as dns.LookupAddress[]) ?? [];
    if (!lijst.length || lijst.some((a) => isNietPubliekIp(a.address))) {
      const e = new Error('CIMD_SSRF_GEBLOKKEERD') as NodeJS.ErrnoException; e.code = 'CIMD_SSRF_GEBLOKKEERD';
      return cb(e, '');
    }
    if (options.all) return cb(null, lijst);
    return cb(null, lijst[0].address, lijst[0].family);
  });
}

// ---------------------------------------------------------------- ophalen

export type CimdFout = 'CIMD_UIT' | 'CIMD_ADRES' | 'CIMD_SSRF_GEBLOKKEERD' | 'CIMD_NETWERK' | 'CIMD_STATUS' | 'CIMD_TE_GROOT' | 'CIMD_GEEN_JSON' | 'CIMD_ONGELDIG';
export class CimdFoutmelding extends Error { constructor(public code: CimdFout, detail = '') { super(`${code}${detail ? `: ${detail}` : ''}`); } }

export type Ophaler = (url: string) => Promise<{ status: number; contentType: string; body: string; cacheControl: string }>;

/** Echte ophaler: https.get met veiligeLookup, geen omleidingen, tijds- en groottelimiet. */
export const httpsOphaler: Ophaler = (url) => new Promise((resolve, reject) => {
  const req = https.get(url, {
    lookup: veiligeLookup as unknown as typeof dns.lookup, timeout: TIMEOUT_MS,
    headers: { Accept: 'application/json', 'User-Agent': 'mijn-ruimte-mcp/1 (client-metadata)' },
  }, (res) => {
    const status = res.statusCode ?? 0;
    if (status >= 300 && status < 400) { res.resume(); return reject(new CimdFoutmelding('CIMD_STATUS', `omleiding ${status} wordt niet gevolgd`)); }
    let n = 0; const delen: Buffer[] = [];
    res.on('data', (d: Buffer) => { n += d.length; if (n > MAX_BYTES) { req.destroy(new CimdFoutmelding('CIMD_TE_GROOT')); return; } delen.push(d); });
    res.on('end', () => resolve({ status, contentType: String(res.headers['content-type'] || ''), body: Buffer.concat(delen).toString('utf8'), cacheControl: String(res.headers['cache-control'] || '') }));
    res.on('error', reject);
  });
  req.on('timeout', () => req.destroy(new CimdFoutmelding('CIMD_NETWERK', 'tijdslimiet')));
  req.on('error', (e: NodeJS.ErrnoException) => reject(e instanceof CimdFoutmelding ? e : e.code === 'CIMD_SSRF_GEBLOKKEERD' ? new CimdFoutmelding('CIMD_SSRF_GEBLOKKEERD') : new CimdFoutmelding('CIMD_NETWERK', e.code || e.message)));
});

export type CimdKlant = { client_id: string; client_name: string; redirect_uris: string[] };
export type CimdRegels = {
  /** dezelfde controle als DCR (mcp-connector.redirectUriAllowed) */ redirectToegestaan: (uri: string) => boolean;
  /** dezelfde naamcontrole als DCR (SEC-001-10): null = goed, anders de foutreden */ naamFout: (naam: string, uris: string[]) => string | null;
};

/** Controleer een opgehaald document (zuiver). Gooit CimdFoutmelding('CIMD_ONGELDIG', reden). */
export function valideerCimd(doc: unknown, id: string, regels: CimdRegels): CimdKlant {
  const fout = (r: string) => { throw new CimdFoutmelding('CIMD_ONGELDIG', r); };
  if (!doc || typeof doc !== 'object' || Array.isArray(doc)) fout('geen JSON-object');
  const d = doc as Record<string, unknown>;
  if (d.client_id !== id) fout('client_id wijkt af van het adres van het document');
  const naam = typeof d.client_name === 'string' ? d.client_name.trim() : '';
  if (!naam) fout('client_name ontbreekt');
  const uris = d.redirect_uris;
  if (!Array.isArray(uris) || !uris.length || uris.length > 5 || !uris.every((u) => typeof u === 'string' && regels.redirectToegestaan(u))) fout('redirect_uris ontbreekt of bevat een niet-toegestaan adres');
  const methode = d.token_endpoint_auth_method;
  if (methode !== undefined && methode !== 'none') fout('alleen token_endpoint_auth_method "none" (publieke klant)');
  const nf = regels.naamFout(naam.slice(0, 80), uris as string[]);
  if (nf) fout(nf);
  return { client_id: id, client_name: naam.slice(0, 80), redirect_uris: uris as string[] };
}

/** Cache-Control: max-age → bewaartijd, begrensd op [1 min, 24 u]; no-store/no-cache → minimum. */
export function bewaarTijd(cacheControl: string): number {
  const cc = cacheControl.toLowerCase();
  if (/\bno-store\b|\bno-cache\b/.test(cc)) return TTL_MIN;
  const m = /\bmax-age=(\d+)/.exec(cc);
  if (!m) return TTL_STANDAARD;
  return Math.min(TTL_MAX, Math.max(TTL_MIN, Number(m[1]) * 1000));
}

const cache = new Map<string, { klant: CimdKlant; tot: number }>();
export const _legeCimdCache = () => cache.clear();

/** Haal en controleer het document (met cache). Gooit CimdFoutmelding. */
export async function cimdKlant(id: string, regels: CimdRegels, ophaler: Ophaler = httpsOphaler, nu = Date.now()): Promise<CimdKlant> {
  if (!cimdAan()) throw new CimdFoutmelding('CIMD_UIT');
  if (!isCimdClientId(id)) throw new CimdFoutmelding('CIMD_ADRES');
  const c = cache.get(id);
  if (c && c.tot > nu) return c.klant;
  const r = await ophaler(id);
  if (r.status !== 200) throw new CimdFoutmelding('CIMD_STATUS', String(r.status));
  if (!/^application\/([a-z.+-]*\+)?json\b/i.test(r.contentType.trim())) throw new CimdFoutmelding('CIMD_GEEN_JSON', r.contentType.slice(0, 60));
  if (Buffer.byteLength(r.body) > MAX_BYTES) throw new CimdFoutmelding('CIMD_TE_GROOT');
  let doc: unknown;
  try { doc = JSON.parse(r.body); } catch { throw new CimdFoutmelding('CIMD_GEEN_JSON', 'ongeldige JSON'); }
  const klant = valideerCimd(doc, id, regels);
  cache.set(id, { klant, tot: nu + bewaarTijd(r.cacheControl) });
  if (cache.size > 500) for (const [k, v] of cache) if (v.tot <= nu) cache.delete(k);
  return klant;
}
