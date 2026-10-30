// Testhulp (geen test zelf): één NAGEBOOTSTE OAuth-aanbieder op 127.0.0.1 die de drie contouren van
// backend/aanmeld-koppel.ts bedient — Microsoft-vormig (token + JWKS onder /common/…), Discord-vormig
// (token + /api/users/@me met Bearer) en Apple-vormig (/auth/token + /auth/keys, clientgeheim = ES256-JWT dat hier
// ECHT tegen de publieke sleutel wordt geverifieerd). De backend wijst hiernaartoe via AANMELD_<ID>_BASIS, dus de
// volledige stroom (code-inwisseling, PKCE S256, id_token-handtekening via JWKS, nonce) loopt zonder één extern
// verzoek. Elke aanroep wordt opgenomen; per code is te kiezen wat er «kapot» is (handtekening of nonce).
import { createHash, createPublicKey, generateKeyPairSync, randomBytes, sign as cryptoSign, verify as cryptoVerify } from 'node:crypto';
import { createServer, type Server } from 'node:http';

const b64url = (b: Buffer): string => b.toString('base64url');
const j64 = (v: unknown): string => b64url(Buffer.from(JSON.stringify(v)));

export type NepCode = {
  aanbieder: 'microsoft' | 'discord' | 'apple';
  sub: string;
  nonce?: string;                 // wat het id_token als nonce draagt (uit de start-URL van de backend)
  challenge?: string;             // code_challenge uit de start-URL; de inwisseling eist dan S256(code_verifier)
  username?: string; email?: string; tid?: string;
  kapot?: 'handtekening' | 'nonce'; // bewust defect id_token: vervalste handtekening of een andere nonce
};
export type NepAanroep = { methode: string; pad: string; velden: Record<string, string>; authorization: string };

/** ES256-clientgeheim van Apple controleren zoals Apple dat doet: vorm, aud en (met publieke sleutel) handtekening. */
function appleSecretControle(jwt: string, publiekPem?: string): boolean {
  const delen = String(jwt || '').split('.');
  if (delen.length !== 3) return false;
  try {
    const kop = JSON.parse(Buffer.from(delen[0], 'base64url').toString('utf8')) as Record<string, unknown>;
    const inhoud = JSON.parse(Buffer.from(delen[1], 'base64url').toString('utf8')) as Record<string, unknown>;
    if (kop.alg !== 'ES256' || inhoud.aud !== 'https://appleid.apple.com') return false;
    if (Number(inhoud.exp || 0) <= Math.floor(Date.now() / 1000)) return false;
    if (!publiekPem) return true;
    return cryptoVerify('sha256', Buffer.from(`${delen[0]}.${delen[1]}`), { key: createPublicKey(publiekPem), dsaEncoding: 'ieee-p1363' }, Buffer.from(delen[2], 'base64url'));
  } catch { return false; }
}

export async function nepAanbieder(o: {
  microsoft?: { clientId: string; clientSecret: string };
  discord?: { clientId: string; clientSecret: string };
  apple?: { clientId: string; publiekeSleutelPem?: string };
}) {
  // Eén RSA-sleutel voor de id_tokens (RS256, zoals Microsoft en Apple echt doen); unieke kid's per start.
  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const kidMs = `nep-ms-${randomBytes(3).toString('hex')}`;
  const kidApple = `nep-apple-${randomBytes(3).toString('hex')}`;
  const jwk = (kid: string) => ({ ...(publicKey.export({ format: 'jwk' }) as Record<string, unknown>), kid, alg: 'RS256', use: 'sig' });
  const TID = 'tenant-eenheid';
  const codes = new Map<string, NepCode>();
  const toegangen = new Map<string, NepCode>();
  const aanroepen: NepAanroep[] = [];
  let appleSecretGeldig: boolean | null = null;
  let url = '';

  const idToken = (kid: string, inhoud: Record<string, unknown>, kapot?: NepCode['kapot']): string => {
    const kop = j64({ alg: 'RS256', kid });
    const body = j64(inhoud);
    let handtekening = b64url(cryptoSign('sha256', Buffer.from(`${kop}.${body}`), privateKey));
    if (kapot === 'handtekening') handtekening = handtekening.slice(0, -4) + (handtekening.endsWith('AAAA') ? 'BBBB' : 'AAAA');
    return `${kop}.${body}.${handtekening}`;
  };

  const server: Server = createServer((req, res) => {
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', () => {
      const pad = (req.url || '/').split('?')[0];
      const velden = Object.fromEntries(new URLSearchParams(body)) as Record<string, string>;
      aanroepen.push({ methode: req.method || 'GET', pad, velden, authorization: String(req.headers.authorization || '') });
      const antwoord = (code: number, data: unknown) => { res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify(data)); };
      const nuS = Math.floor(Date.now() / 1000);
      // Gedeelde inwisseling: code bekend + juiste aanbieder + grant + clientcontrole + PKCE (S256 van de verifier).
      const wissel = (verwacht: NepCode['aanbieder'], clientOk: () => boolean, uit: (c: NepCode) => unknown) => {
        const c = codes.get(velden.code || '');
        if (!c || c.aanbieder !== verwacht || velden.grant_type !== 'authorization_code') return antwoord(400, { error: 'invalid_grant' });
        if (!clientOk()) return antwoord(401, { error: 'invalid_client' });
        if (c.challenge && b64url(createHash('sha256').update(String(velden.code_verifier || '')).digest()) !== c.challenge) return antwoord(400, { error: 'invalid_grant', error_description: 'PKCE' });
        codes.delete(velden.code || '');
        return antwoord(200, uit(c));
      };
      // ---- Authorize (e2e: de ECHTE browser navigeert hierheen) -------------------------------------------------
      // Het instemscherm van de aanbieder wordt gesimuleerd door meteen in te stemmen: 302 terug naar redirect_uri
      // met een eenmalige code die challenge+nonce uit de start-URL draagt — precies wat een echte aanbieder doet.
      const AUTORISEER: Record<string, NepCode['aanbieder']> = { '/common/oauth2/v2.0/authorize': 'microsoft', '/oauth2/authorize': 'discord', '/auth/authorize': 'apple' };
      if (AUTORISEER[pad] && req.method === 'GET') {
        const q = Object.fromEntries(new URL(req.url || '/', 'http://nep').searchParams) as Record<string, string>;
        const aanbieder = AUTORISEER[pad];
        const code = `code-${randomBytes(8).toString('hex')}`;
        codes.set(code, { aanbieder, sub: `${aanbieder}-e2e-sub`, email: `${aanbieder}-e2e@eenheid.test`, username: `${aanbieder}-eenheid`, nonce: q.nonce, challenge: q.code_challenge });
        res.writeHead(302, { location: `${q.redirect_uri}${q.redirect_uri?.includes('?') ? '&' : '?'}${new URLSearchParams({ code, state: q.state || '' })}` });
        return res.end();
      }
      // ---- Microsoft-vorm --------------------------------------------------------------------------------------
      if (pad === '/common/oauth2/v2.0/token' && req.method === 'POST') {
        return wissel('microsoft', () => !!o.microsoft && velden.client_id === o.microsoft.clientId && velden.client_secret === o.microsoft.clientSecret, (c) => ({
          token_type: 'Bearer',
          id_token: idToken(kidMs, { iss: `${url}/${c.tid || TID}/v2.0`, aud: o.microsoft!.clientId, sub: c.sub, tid: c.tid || TID, preferred_username: c.email || `${c.sub}@eenheid.test`, iat: nuS, exp: nuS + 600, nonce: c.kapot === 'nonce' ? 'nonce-heel-anders' : c.nonce }, c.kapot),
        }));
      }
      if (pad === '/common/discovery/v2.0/keys') return antwoord(200, { keys: [jwk(kidMs)] });
      // ---- Discord-vorm (geen id_token; identiteit via /users/@me met het zojuist gegeven token) ----------------
      if (pad === '/api/oauth2/token' && req.method === 'POST') {
        return wissel('discord', () => !!o.discord && velden.client_id === o.discord.clientId && velden.client_secret === o.discord.clientSecret, (c) => {
          const t = `nep-acc-${randomBytes(8).toString('hex')}`;
          toegangen.set(t, c);
          return { token_type: 'Bearer', access_token: t, scope: 'identify email' };
        });
      }
      if (pad === '/api/users/@me') {
        const c = toegangen.get(String(req.headers.authorization || '').replace(/^Bearer /, ''));
        return c ? antwoord(200, { id: c.sub, username: c.username || 'eenheid', email: c.email || null }) : antwoord(401, { message: '401: Unauthorized', code: 0 });
      }
      // ---- Apple-vorm (clientgeheim = ES256-JWT; hier echt geverifieerd) ----------------------------------------
      if (pad === '/auth/token' && req.method === 'POST') {
        return wissel('apple', () => {
          if (!o.apple || velden.client_id !== o.apple.clientId) return false;
          appleSecretGeldig = appleSecretControle(String(velden.client_secret || ''), o.apple.publiekeSleutelPem);
          return appleSecretGeldig;
        }, (c) => ({
          token_type: 'Bearer',
          id_token: idToken(kidApple, { iss: url, aud: o.apple!.clientId, sub: c.sub, iat: nuS, exp: nuS + 600, nonce: c.kapot === 'nonce' ? 'nonce-heel-anders' : c.nonce }, c.kapot),
        }));
      }
      if (pad === '/auth/keys') return antwoord(200, { keys: [jwk(kidApple)] });
      antwoord(404, { error: 'not_found' });
    });
  });

  await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
  url = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  return {
    url, aanroepen,
    /** Registreert een eenmalige code alsof de mens net bij de aanbieder instemde. */
    codeVoor: (c: NepCode): string => { const code = `code-${randomBytes(8).toString('hex')}`; codes.set(code, c); return code; },
    appleSecretGeldig: () => appleSecretGeldig,
    stop: () => new Promise<void>((r) => { server.closeAllConnections?.(); server.close(() => r()); }),
  };
}
