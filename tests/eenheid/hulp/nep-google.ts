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
  const codes = new Map<string, { sub: string; email: string; nonce: string; authTime: number | null }>();
  const laatsteAuthUrls: string[] = [];
  const echteFetch = globalThis.fetch;
  globalThis.fetch = (async (input: unknown, init?: RequestInit) => {
    const url = String(input);
    if (url === 'https://oauth2.googleapis.com/token') {
      const p = new URLSearchParams(String(init?.body || ''));
      const c = codes.get(p.get('code') || '');
      if (!c || p.get('client_id') !== CLIENT) return new Response(JSON.stringify({ error: 'invalid_grant' }), { status: 400 });
      const kop = b64({ alg: 'RS256', kid }), nu = Math.floor(Date.now() / 1000);
      const inhoud = b64({ iss: 'https://accounts.google.com', aud: CLIENT, sub: c.sub, email: c.email, email_verified: true, name: c.email, iat: nu, exp: nu + 600, nonce: c.nonce, ...(c.authTime === null ? {} : { auth_time: c.authTime }) });
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
    const verzoek = async (host: string, path: string, body: unknown = {}, extra: { ip?: string; methode?: string; query?: Record<string, string> } = {}) => {
      const ip = extra.ip || '203.0.113.9';
      const headers: Record<string, string> = { host, origin: `https://${host}`, 'content-type': 'application/json', 'user-agent': 'eenheidstest', 'x-forwarded-for': ip };
      if (jar.size) headers.cookie = [...jar].map(([k, v]) => `${k}=${v}`).join('; ');
      const methode = extra.methode || 'POST';
      const r = await handler({ headers, body: methode === 'GET' ? '' : JSON.stringify(body), isBase64Encoded: false, rawPath: path, rawQueryString: '', queryStringParameters: extra.query || {}, requestContext: { http: { method: methode, path, sourceIp: ip, userAgent: 'eenheidstest' } } } as never) as { statusCode: number; headers: Record<string, string>; body: string };
      neemOp(r.headers);
      let data: Record<string, any> = {}; try { data = JSON.parse(r.body); } catch {}
      return { status: r.statusCode, data, body: r.body };
    };
    const tab = randomBytes(24).toString('hex');
    /** Aanmelden via de redirect-flow (zoals productie). intent 'step-up' vraagt opnieuw om het wachtwoord. */
    const aanmelden = async (sub: string, email: string, o: { intent?: 'login' | 'replace-tab' | 'step-up'; authTime?: number | null; remember?: boolean; service?: string; tabContext?: string } = {}) => {
      const service = o.service || 'hub', host = `${service === 'identity' ? 'id' : service}.tarasevych.com`;
      const start = await verzoek(host, '/api/owner/identity/transactions/create', { service, tabContext: o.tabContext || tab, flowMode: 'redirect', returnTo: `https://${host}/`, locale: 'nl', intent: o.intent || 'replace-tab', remember: o.remember ?? false });
      const authUrl = String(start.data.authUrl || 'https://x.invalid/'); laatsteAuthUrls.push(authUrl);
      const u = new URL(authUrl);
      const code = `code-${randomBytes(6).toString('hex')}`;
      codes.set(code, { sub, email, nonce: u.searchParams.get('nonce') || '', authTime: o.authTime === undefined ? Math.floor(Date.now() / 1000) : o.authTime });
      const cb = await verzoek('id.tarasevych.com', '/api/owner/auth/google/callback', { state: u.searchParams.get('state'), code });
      return { start, cb, authUrl: u };
    };
    const ctxBody = (service = 'hub', extra: Record<string, unknown> = {}) => ({ service, tabContext: tab, ...extra });
    return { jar, verzoek, aanmelden, tab, ctxBody };
  };
  const herstel = () => { globalThis.fetch = echteFetch; };
  return { handler, browser, herstel, laatsteAuthUrls };
}
