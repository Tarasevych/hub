// Testhulp (geen test zelf): nagebootste Google (eigen RSA-sleutel, fetch onderschept) + cookiejar + verzoeken
// rechtstreeks naar de handler. Zelfde aanpak als tabbladen.test.ts. Er gaat niets naar buiten.
import { createHmac, createSign, generateKeyPairSync, randomBytes } from 'node:crypto';

const b64 = (v: unknown) => Buffer.from(JSON.stringify(v)).toString('base64url');
export const CLIENT = '1234567890-eenheidstest.apps.googleusercontent.com';

export type Resultaat = { naam: string; ok: boolean };
export function checker(groep: string) {
  const resultaten: Resultaat[] = [];
  const check = (naam: string, ok: boolean, info = '') => { resultaten.push({ naam, ok }); console.log(`${ok ? 'OK  ' : 'FOUT'} ${naam}${info ? ` — ${info}` : ''}`); };
  const einde = () => { const mis = resultaten.filter(r => !r.ok).length; console.log(`\n${resultaten.length - mis}/${resultaten.length} geslaagd (${groep})`); return mis ? 1 : 0; };
  return { check, einde };
}

/** TOTP (RFC 6238, SHA1, 6 cijfers, 30 s) voor een base32-geheim. */
export function totpCode(secret: string, stap = Math.floor(Date.now() / 30000)): string {
  const A = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'; let bits = '';
  for (const c of secret.replace(/=+$/, '').toUpperCase()) bits += A.indexOf(c).toString(2).padStart(5, '0');
  const out: number[] = []; for (let i = 0; i + 8 <= bits.length; i += 8) out.push(parseInt(bits.slice(i, i + 8), 2));
  const b = Buffer.alloc(8); b.writeBigUInt64BE(BigInt(stap));
  const h = createHmac('sha1', Buffer.from(out)).update(b).digest(); const o = h[h.length - 1] & 15;
  return String(((h.readUInt32BE(o) & 0x7fffffff) % 1e6)).padStart(6, '0');
}

export type NepGoogle = Awaited<ReturnType<typeof nepGoogle>>;
/**
 * Zet env (client-id, eigenaar), onderschept fetch en laadt de handler. `authTime` per code: seconden sinds epoch
 * (standaard nu) of null (claim weglaten).
 */
export async function nepGoogle(opties: { ownerEmail: string }) {
  process.env.GOOGLE_OAUTH_CLIENT_ID = CLIENT; process.env.GOOGLE_OAUTH_CLIENT_SECRET = 'eenheidstest-geheim'; delete process.env.GOOGLE_SUITE_CLIENT_ID;
  process.env.OWNER_EMAIL = opties.ownerEmail;
  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const kid = `eenheid-${Date.now()}-${randomBytes(3).toString('hex')}`;
  const codes = new Map<string, { sub: string; email: string; nonce: string; authTime: number | null; iat?: number; picture?: string }>();
  const laatsteAuthUrls: string[] = [];
  const echteFetch = globalThis.fetch;
  globalThis.fetch = (async (input: unknown, init?: RequestInit) => {
    const url = String(input);
    if (url === 'https://oauth2.googleapis.com/token') {
      const p = new URLSearchParams(String(init?.body || ''));
      const c = codes.get(p.get('code') || '');
      if (!c || p.get('client_id') !== CLIENT) return new Response(JSON.stringify({ error: 'invalid_grant' }), { status: 400 });
      const kop = b64({ alg: 'RS256', kid }), nu = Math.floor(Date.now() / 1000);
      const inhoud = b64({ iss: 'https://accounts.google.com', aud: CLIENT, sub: c.sub, email: c.email, email_verified: true, name: c.email, iat: c.iat ?? nu, exp: nu + 600, nonce: c.nonce, ...(c.authTime === null ? {} : { auth_time: c.authTime }), ...(c.picture ? { picture: c.picture } : {}) });
      const handtekening = createSign('RSA-SHA256').update(`${kop}.${inhoud}`).sign(privateKey).toString('base64url');
      return new Response(JSON.stringify({ id_token: `${kop}.${inhoud}.${handtekening}`, access_token: 'eenheid' }), { status: 200 });
    }
    if (url === 'https://www.googleapis.com/oauth2/v1/certs') return new Response(JSON.stringify({ [kid]: publicKey.export({ type: 'spki', format: 'pem' }) }), { status: 200, headers: { 'cache-control': 'max-age=60' } });
    if (url.startsWith('https://openidconnect.googleapis.com/')) return new Response('{}', { status: 404 });
    return new Response('{}', { status: 599 });
  }) as typeof fetch;
  const { handler } = await import('../../../backend/index');
  await new Promise(r => setTimeout(r, 100));

  /** Eén browser: eigen cookiejar. */
  const browser = () => {
    const jar = new Map<string, string>();
    const neemOp = (headers: Record<string, string> = {}) => {
      const raw = Object.entries(headers).filter(([k]) => k.toLowerCase() === 'set-cookie').map(([, v]) => v).join(', ');
      for (const c of raw ? raw.split(/,\s*(?=[^;,\s]+=)/) : []) {
        const [paar] = c.split(';'); const i = paar.indexOf('='); const naam = paar.slice(0, i).trim(), waarde = paar.slice(i + 1).trim();
        if (/Max-Age=0\b/i.test(c) || !waarde) jar.delete(naam); else jar.set(naam, waarde);
      }
    };
    const verzoek = async (host: string, path: string, body: unknown = {}, extra: { ip?: string; methode?: string; query?: Record<string, string>; ua?: string; kop?: Record<string, string> } = {}) => {
      const ip = extra.ip || '203.0.113.9';
      const headers: Record<string, string> = { host, origin: `https://${host}`, 'content-type': 'application/json', 'user-agent': extra.ua || 'eenheidstest', 'x-forwarded-for': ip, ...(extra.kop || {}) };
      if (jar.size) headers.cookie = [...jar].map(([k, v]) => `${k}=${v}`).join('; ');
      const methode = extra.methode || 'POST';
      const r = await handler({ headers, body: methode === 'GET' ? '' : JSON.stringify(body), isBase64Encoded: false, rawPath: path, rawQueryString: '', queryStringParameters: extra.query || {}, requestContext: { http: { method: methode, path, sourceIp: ip, userAgent: 'eenheidstest' } } } as never) as { statusCode: number; headers: Record<string, string>; body: string };
      neemOp(r.headers);
      let data: Record<string, any> = {}; try { data = JSON.parse(r.body); } catch {}
      return { status: r.statusCode, data, body: r.body };
    };
    const tab = randomBytes(24).toString('hex');
    /** Aanmelden via de redirect-flow (zoals productie). intent 'step-up' vraagt opnieuw om het wachtwoord. */
    const aanmelden = async (sub: string, email: string, o: { intent?: 'login' | 'replace-tab' | 'step-up'; authTime?: number | null; iat?: number; remember?: boolean; service?: string; tabContext?: string; returnTo?: string; ip?: string; ua?: string; kop?: Record<string, string>; /** IDENTITEIT-015: claim «picture» у токені (за замовчуванням немає) */ picture?: string } = {}) => {
      const net = { ip: o.ip, ua: o.ua, kop: o.kop };
      const service = o.service || 'hub', host = `${service === 'identity' ? 'id' : service}.tarasevych.com`;
      const start = await verzoek(host, '/api/owner/identity/transactions/create', { service, tabContext: o.tabContext || tab, flowMode: 'redirect', returnTo: o.returnTo || `https://${host}/`, locale: 'nl', intent: o.intent || 'replace-tab', remember: o.remember ?? false }, net);
      const authUrl = String(start.data.authUrl || 'https://x.invalid/'); laatsteAuthUrls.push(authUrl);
      const u = new URL(authUrl);
      const code = `code-${randomBytes(6).toString('hex')}`;
      codes.set(code, { sub, email, nonce: u.searchParams.get('nonce') || '', authTime: o.authTime === undefined ? Math.floor(Date.now() / 1000) : o.authTime, ...(o.iat === undefined ? {} : { iat: o.iat }), ...(o.picture ? { picture: o.picture } : {}) });
      const cb = await verzoek('id.tarasevych.com', '/api/owner/auth/google/callback', { state: u.searchParams.get('state'), code }, net);
      return { start, cb, authUrl: u };
    };
    const ctxBody = (service = 'hub', extra: Record<string, unknown> = {}) => ({ service, tabContext: tab, ...extra });
    return { jar, verzoek, aanmelden, tab, ctxBody };
  };
  const herstel = () => { globalThis.fetch = echteFetch; };
  /** Voor e2e: een eenmalige Google-code voor een echte browser (de authUrl levert state en nonce). */
  const codeVoor = (sub: string, email: string, nonce: string, authTime: number | null = Math.floor(Date.now() / 1000), iat?: number) => {
    const code = `code-${randomBytes(6).toString('hex')}`; codes.set(code, { sub, email, nonce, authTime, ...(iat === undefined ? {} : { iat }) }); return code;
  };
  return { handler, browser, herstel, laatsteAuthUrls, codeVoor };
}

// ================================================================================================ nagebootste Google-API's
// 21.10.2026 (rechten «у розробці» → echt, tests/eenheid/dev-rechten-gebruiker-20261021.test.ts): Gmail verzenden, Drive maken /
// uploaden (multipart én hervatbaar) / delen, de Photos Picker (sessie, mediaItems, baseUrl) en het token-eindpunt. fetch wordt
// onderschept en KETENT naar de vorige fetch voor alles wat hier niet bij hoort; `herstel()` zet de vorige terug. Er gaat niets naar buiten.
export type NepApiVerzoek = { methode: string; url: string; pad: string; koppen: Record<string, string>; lichaam: Buffer };
export type NepDriveBestand = { id: string; name: string; mimeType: string; parents: string[]; trashed?: boolean; capabilities?: Record<string, boolean>; bytes?: Buffer; webViewLink?: string };
export function nepGoogleApi(opties: { scopes: string[] }) {
  const vorige = globalThis.fetch;
  const verzoeken: NepApiVerzoek[] = [];
  let scopes = [...opties.scopes];
  const verzonden: Array<{ raw: string; mime: string; threadId?: string }> = [];
  const concepten = new Map<string, string>();
  const berichten = new Map<string, Record<string, string>>();
  const bestanden = new Map<string, NepDriveBestand>();
  const wortel: NepDriveBestand = { id: 'root-id', name: 'Мій диск', mimeType: 'application/vnd.google-apps.folder', parents: [] };
  bestanden.set('root', wortel); bestanden.set('root-id', wortel);
  const rechten: Array<{ bestand: string; lichaam: Record<string, unknown>; melden: string | null; bericht: string | null }> = [];
  const sessies = new Map<string, { gekozen: boolean; items: Array<Record<string, unknown>> }>();
  const hervatbaar = new Map<string, { metadata: Record<string, unknown>; mime: string }>();
  let teller = 0;
  const id = (p: string) => `${p}${(++teller).toString(36)}${randomBytes(3).toString('hex')}`;
  const ant = (status: number, data: unknown, kop: Record<string, string> = {}) => new Response(status === 204 ? null : JSON.stringify(data ?? {}), { status, headers: { 'content-type': 'application/json', ...kop } });
  const bytesVan = (b: unknown): Buffer => (b == null ? Buffer.alloc(0) : typeof b === 'string' ? Buffer.from(b, 'utf8') : Buffer.isBuffer(b) ? b : b instanceof Uint8Array ? Buffer.from(b) : Buffer.from(String(b)));
  const publiek = (f: NepDriveBestand) => ({
    id: f.id, name: f.name, mimeType: f.mimeType, parents: f.parents, trashed: !!f.trashed,
    capabilities: f.capabilities ?? { canAddChildren: f.mimeType === 'application/vnd.google-apps.folder', canShare: true },
    webViewLink: f.webViewLink ?? `https://drive.google.com/file/d/${f.id}/view`, ...(f.bytes ? { size: String(f.bytes.length) } : {}),
  });
  const maak = (metadata: Record<string, unknown>, bytes?: Buffer, mime?: string) => {
    const f: NepDriveBestand = { id: id('bestand-'), name: String(metadata.name || 'naamloos'), mimeType: String(metadata.mimeType || mime || 'application/octet-stream'), parents: Array.isArray(metadata.parents) ? metadata.parents.map(String) : ['root-id'], ...(bytes ? { bytes } : {}) };
    bestanden.set(f.id, f); return f;
  };
  /** multipart/related: [metadata JSON][media]. */
  const ontleedMultipart = (body: Buffer, ct: string) => {
    const grens = /boundary=([^;]+)/.exec(ct)?.[1] || '';
    const delen = body.toString('latin1').split(`--${grens}`).slice(1, -1);
    const metaDeel = delen[0], metaStart = metaDeel.indexOf('\r\n\r\n');
    const meta = JSON.parse(Buffer.from(metaDeel.slice(metaStart + 4).replace(/\r\n$/, ''), 'latin1').toString('utf8'));
    const media = delen[1], kopEind = media.indexOf('\r\n\r\n');
    const mime = /Content-Type: ([^\r\n]+)/i.exec(media.slice(0, kopEind))?.[1] || '';
    return { meta, mime, bytes: Buffer.from(media.slice(kopEind + 4).replace(/\r\n$/, ''), 'latin1') };
  };
  globalThis.fetch = (async (input: unknown, init?: RequestInit) => {
    const url = String(input instanceof URL ? input.toString() : input);
    const methode = String(init?.method || 'GET').toUpperCase();
    const koppen = Object.fromEntries(Object.entries((init?.headers || {}) as Record<string, string>).map(([k, v]) => [k.toLowerCase(), String(v)]));
    const lichaam = bytesVan(init?.body);
    let u: URL;
    try { u = new URL(url); } catch { return vorige(input as never, init); }
    const pad = u.pathname;
    const eigen = url === 'https://oauth2.googleapis.com/token' || u.hostname === 'gmail.googleapis.com' || (u.hostname === 'www.googleapis.com' && /^\/(drive|upload\/drive)\/v3\//.test(pad))
      || u.hostname === 'photospicker.googleapis.com' || u.hostname === 'nep-photos.googleusercontent.com';
    if (!eigen) return vorige(input as never, init);
    verzoeken.push({ methode, url, pad, koppen, lichaam });
    const json = (): Record<string, any> => { try { return JSON.parse(lichaam.toString('utf8') || '{}'); } catch { return {}; } }; // eslint-disable-line @typescript-eslint/no-explicit-any
    if (url === 'https://oauth2.googleapis.com/token') return ant(200, { access_token: `nep-${randomBytes(4).toString('hex')}`, scope: scopes.join(' '), expires_in: 3600 });
    // ---------------------------------------------------------------- Gmail
    if (u.hostname === 'gmail.googleapis.com') {
      if (pad === '/gmail/v1/users/me/messages/send' && methode === 'POST') {
        const b = json(); const raw = Buffer.from(String(b.raw || ''), 'base64url').toString('utf8');
        verzonden.push({ raw: String(b.raw || ''), mime: raw, ...(b.threadId ? { threadId: String(b.threadId) } : {}) });
        return ant(200, { id: id('bericht-'), threadId: b.threadId || id('draad-'), labelIds: ['SENT'] });
      }
      const m = /^\/gmail\/v1\/users\/me\/messages\/([^/]+)$/.exec(pad);
      if (m && methode === 'GET') {
        const b = berichten.get(decodeURIComponent(m[1]));
        if (!b) return ant(404, { error: { code: 404 } });
        const { threadId, ...kop } = b;
        return ant(200, { id: m[1], threadId: threadId || 'draad-0', payload: { headers: Object.entries(kop).map(([name, value]) => ({ name, value })) } });
      }
      if (pad === '/gmail/v1/users/me/drafts' && methode === 'POST') { const d = id('concept-'); concepten.set(d, lichaam.toString('utf8')); return ant(200, { id: d }); }
      const d = /^\/gmail\/v1\/users\/me\/drafts\/([^/]+)$/.exec(pad);
      if (d && methode === 'PUT') { concepten.set(d[1], lichaam.toString('utf8')); return ant(200, { id: d[1] }); }
      if (d && methode === 'DELETE') { concepten.delete(d[1]); return ant(204, null); }
      return ant(404, { error: { code: 404 } });
    }
    // ---------------------------------------------------------------- Drive
    if (u.hostname === 'www.googleapis.com') {
      if (pad === '/upload/drive/v3/files' && methode === 'POST' && u.searchParams.get('uploadType') === 'multipart') {
        const { meta, mime, bytes } = ontleedMultipart(lichaam, koppen['content-type'] || '');
        return ant(200, publiek(maak(meta, bytes, mime)));
      }
      if (pad === '/upload/drive/v3/files' && methode === 'POST' && u.searchParams.get('uploadType') === 'resumable') {
        const sessie = id('upload-'); hervatbaar.set(sessie, { metadata: json(), mime: koppen['x-upload-content-type'] || '' });
        return new Response('', { status: 200, headers: { location: `https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&upload_id=${sessie}` } });
      }
      if (pad === '/upload/drive/v3/files' && methode === 'PUT') {
        const s = hervatbaar.get(u.searchParams.get('upload_id') || '');
        if (!s) return ant(404, { error: { code: 404 } });
        return ant(200, publiek(maak(s.metadata, lichaam, s.mime)));
      }
      if (pad === '/drive/v3/files' && methode === 'POST') return ant(200, publiek(maak(json())));
      const pm = /^\/drive\/v3\/files\/([^/]+)\/permissions$/.exec(pad);
      if (pm && methode === 'POST') {
        if (!bestanden.has(decodeURIComponent(pm[1]))) return ant(404, { error: { code: 404 } });
        rechten.push({ bestand: decodeURIComponent(pm[1]), lichaam: json(), melden: u.searchParams.get('sendNotificationEmail'), bericht: u.searchParams.get('emailMessage') });
        return ant(200, { id: id('recht-') });
      }
      const f = /^\/drive\/v3\/files\/([^/]+)$/.exec(pad);
      if (f && methode === 'GET') { const b = bestanden.get(decodeURIComponent(f[1])); return b ? ant(200, publiek(b)) : ant(404, { error: { code: 404 } }); }
      return ant(404, { error: { code: 404 } });
    }
    // ---------------------------------------------------------------- Photos Picker
    if (u.hostname === 'photospicker.googleapis.com') {
      if (pad === '/v1/sessions' && methode === 'POST') {
        const s = id('kies-'); sessies.set(s, { gekozen: false, items: [] });
        return ant(200, { id: s, pickerUri: `https://photos.google.com/picker/${s}`, expireTime: new Date(Date.now() + 30 * 60000).toISOString(), pollingConfig: { pollInterval: '3s', timeoutIn: '1800s' } });
      }
      const s = /^\/v1\/sessions\/([^/]+)$/.exec(pad);
      if (s && methode === 'GET') { const x = sessies.get(s[1]); return x ? ant(200, { id: s[1], mediaItemsSet: x.gekozen }) : ant(404, {}); }
      if (pad === '/v1/mediaItems' && methode === 'GET') { const x = sessies.get(u.searchParams.get('sessionId') || ''); return x ? ant(200, { mediaItems: x.items }) : ant(404, {}); }
      return ant(404, {});
    }
    // baseUrl van een gekozen foto (alleen met Authorization): een kleine PNG
    if (!koppen.authorization) return ant(401, {});
    return new Response(Buffer.from('89504e470d0a1a0a0000000d4948445200000001000000010806000000', 'hex'), { status: 200, headers: { 'content-type': 'image/png' } });
  }) as typeof fetch;
  /** De mens kiest in het venster van Google: zet de keuze van een sessie. */
  const kies = (sessieId: string, n = 2) => {
    const x = sessies.get(sessieId); if (!x) return false;
    x.gekozen = true;
    x.items = Array.from({ length: n }, (_, i) => ({ id: `media-${i}-${sessieId}`, type: 'PHOTO', createTime: '2026-10-01T10:00:00Z', mediaFile: { baseUrl: `https://nep-photos.googleusercontent.com/${sessieId}/${i}`, mimeType: 'image/png', filename: `foto-${i}.png`, mediaFileMetadata: { width: 1, height: 1 } } }));
    return true;
  };
  return {
    verzoeken, verzonden, concepten, berichten, bestanden, rechten, sessies, kies,
    zetScopes: (n: string[]) => { scopes = [...n]; },
    schoon: () => { verzoeken.length = 0; },
    herstel: () => { globalThis.fetch = vorige; },
  };
}
