// UI-015B — id_token controle (OIDC) via JWKS en de ES256-client-secret voor Apple. Alleen node:crypto, geen extra pakket.
// Controles: alg uit een vaste lijst (nooit «none»/HS*), kid moet in de JWKS staan, handtekening, iss, aud, exp/iat/nbf
// (60 s speling), nonce (tijdconstante vergelijking). Elke afwijking = een vaste foutcode, nooit details van het token in logs.
import { createPrivateKey, createPublicKey, sign as cSign, timingSafeEqual, verify as cVerify, type JsonWebKey } from 'node:crypto';

export type Jwk = JsonWebKey & { kid?: string; alg?: string; use?: string };
export type HaalJson = (url: string) => Promise<unknown>;
const SPELING_S = 60;
const b64j = (s: string) => JSON.parse(Buffer.from(s, 'base64url').toString('utf8'));
export const gelijk = (a: string, b: string) => { const x = Buffer.from(String(a)), y = Buffer.from(String(b)); return x.length === y.length && timingSafeEqual(x, y); };

// JWKS-cache per URL (10 min), bij onbekende kid één keer opnieuw ophalen (sleutelrotatie).
const cache = new Map<string, { tot: number; keys: Jwk[] }>();
async function sleutels(url: string, haal: HaalJson, vernieuw = false): Promise<Jwk[]> {
  const c = cache.get(url);
  if (c && !vernieuw && c.tot > Date.now()) return c.keys;
  const r = (await haal(url)) as { keys?: Jwk[] };
  if (!r || !Array.isArray(r.keys)) throw new Error('EXTERN_JWKS_ONGELDIG');
  cache.set(url, { tot: Date.now() + 10 * 60 * 1000, keys: r.keys });
  return r.keys;
}
export const jwksCacheLegen = () => cache.clear();

export type IdTokenEisen = { jwksUrl: string; iss: string | ((claims: Record<string, unknown>) => boolean); aud: string; nonce?: string; algs?: string[]; nu?: number };
export async function idTokenControleren(token: string, eisen: IdTokenEisen, haal: HaalJson): Promise<Record<string, unknown>> {
  const delen = String(token || '').split('.');
  if (delen.length !== 3) throw new Error('EXTERN_ID_TOKEN_ONGELDIG');
  let kop: { alg?: string; kid?: string }, claims: Record<string, unknown>;
  try { kop = b64j(delen[0]); claims = b64j(delen[1]); } catch { throw new Error('EXTERN_ID_TOKEN_ONGELDIG'); }
  const algs = eisen.algs || ['RS256'];
  if (!kop.alg || !algs.includes(kop.alg)) throw new Error('EXTERN_ID_TOKEN_ALG');
  let jwk = (await sleutels(eisen.jwksUrl, haal)).find((k) => k.kid === kop.kid);
  if (!jwk) jwk = (await sleutels(eisen.jwksUrl, haal, true)).find((k) => k.kid === kop.kid);
  if (!jwk) throw new Error('EXTERN_ID_TOKEN_SLEUTEL_ONBEKEND');
  const sleutel = createPublicKey({ key: jwk, format: 'jwk' });
  const data = Buffer.from(`${delen[0]}.${delen[1]}`), sig = Buffer.from(delen[2], 'base64url');
  const ok = kop.alg === 'ES256' ? cVerify('sha256', data, { key: sleutel, dsaEncoding: 'ieee-p1363' }, sig) : cVerify('RSA-SHA256', data, sleutel, sig);
  if (!ok) throw new Error('EXTERN_ID_TOKEN_HANDTEKENING');
  const issOk = typeof eisen.iss === 'function' ? eisen.iss(claims) : claims.iss === eisen.iss;
  if (!issOk) throw new Error('EXTERN_ID_TOKEN_ISS');
  const aud = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  if (!aud.includes(eisen.aud)) throw new Error('EXTERN_ID_TOKEN_AUD');
  if (Array.isArray(claims.aud) && claims.aud.length > 1 && claims.azp !== eisen.aud) throw new Error('EXTERN_ID_TOKEN_AUD');
  const nu = Math.floor((eisen.nu ?? Date.now()) / 1000);
  if (typeof claims.exp !== 'number' || claims.exp + SPELING_S < nu) throw new Error('EXTERN_ID_TOKEN_VERLOPEN');
  if (typeof claims.iat === 'number' && claims.iat - SPELING_S > nu) throw new Error('EXTERN_ID_TOKEN_TOEKOMST');
  if (typeof claims.nbf === 'number' && claims.nbf - SPELING_S > nu) throw new Error('EXTERN_ID_TOKEN_TOEKOMST');
  if (eisen.nonce !== undefined && !gelijk(String(claims.nonce || ''), eisen.nonce)) throw new Error('EXTERN_NONCE_ONGELDIG');
  if (typeof claims.sub !== 'string' || !claims.sub || claims.sub.length > 255) throw new Error('EXTERN_ID_TOKEN_SUB');
  return claims;
}

/** Sign in with Apple: client_secret = ES256-JWT (iss=team-id, sub=services-id, aud=appleid, kid=key-id), 5 min geldig. */
export function appleClientSecret(o: { teamId: string; servicesId: string; keyId: string; privePem: string; nu?: number }): string {
  const nu = Math.floor((o.nu ?? Date.now()) / 1000);
  const enc = (v: unknown) => Buffer.from(JSON.stringify(v)).toString('base64url');
  const invoer = `${enc({ alg: 'ES256', kid: o.keyId, typ: 'JWT' })}.${enc({ iss: o.teamId, iat: nu, exp: nu + 300, aud: 'https://appleid.apple.com', sub: o.servicesId })}`;
  const sleutel = createPrivateKey(o.privePem.replace(/\\n/g, '\n'));
  return `${invoer}.${cSign('sha256', Buffer.from(invoer), { key: sleutel, dsaEncoding: 'ieee-p1363' }).toString('base64url')}`;
}
