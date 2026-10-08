// Software-"passkey" voor tests: maakt echte WebAuthn-registraties en -asserties (ES256 of Ed25519) zoals een telefoon,
// zodat server en root-hulp met echte handtekeningen getest worden. Alleen voor tests.
import { createHash, generateKeyPairSync, randomBytes, sign, type KeyObject } from 'node:crypto';

const b64u = (b: Buffer | string) => Buffer.from(b).toString('base64url');
const sha = (b: Buffer | string) => createHash('sha256').update(b).digest();

// Minimale CBOR-encoder (int, bytes, tekst, map) — genoeg voor COSE-sleutels en attestationObject.
function kop(major: number, n: number) {
  if (n < 24) return Buffer.from([(major << 5) | n]);
  if (n < 256) return Buffer.from([(major << 5) | 24, n]);
  if (n < 65536) { const b = Buffer.alloc(3); b[0] = (major << 5) | 25; b.writeUInt16BE(n, 1); return b; }
  const b = Buffer.alloc(5); b[0] = (major << 5) | 26; b.writeUInt32BE(n, 1); return b;
}
export function cbor(v: unknown): Buffer {
  if (typeof v === 'number') return v >= 0 ? kop(0, v) : kop(1, -1 - v);
  if (Buffer.isBuffer(v)) return Buffer.concat([kop(2, v.length), v]);
  if (typeof v === 'string') { const t = Buffer.from(v, 'utf8'); return Buffer.concat([kop(3, t.length), t]); }
  if (v instanceof Map) return Buffer.concat([kop(5, v.size), ...[...v].flatMap(([k, w]) => [cbor(k), cbor(w)])]);
  throw new Error('cbor: type');
}

export type NepPasskey = { credentialId: Buffer; prive: KeyObject; alg: number; cose: Buffer; teller: number };
export function nieuwePasskey(soort: 'es256' | 'ed25519' = 'es256', teller = 0): NepPasskey {
  if (soort === 'ed25519') {
    const { privateKey, publicKey } = generateKeyPairSync('ed25519');
    const jwk = publicKey.export({ format: 'jwk' }) as { x: string };
    return { credentialId: randomBytes(32), prive: privateKey, alg: -8, teller, cose: cbor(new Map<number, unknown>([[1, 1], [3, -8], [-1, 6], [-2, Buffer.from(jwk.x, 'base64url')]])) };
  }
  const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
  const jwk = publicKey.export({ format: 'jwk' }) as { x: string; y: string };
  return { credentialId: randomBytes(32), prive: privateKey, alg: -7, teller, cose: cbor(new Map<number, unknown>([[1, 2], [3, -7], [-1, 1], [-2, Buffer.from(jwk.x, 'base64url')], [-3, Buffer.from(jwk.y, 'base64url')]])) };
}

type Opties = { rpId?: string; origin?: string; uv?: boolean; up?: boolean; type?: string; crossOrigin?: boolean };
const teller4 = (n: number) => { const b = Buffer.alloc(4); b.writeUInt32BE(n >>> 0); return b; };

/** Als navigator.credentials.create (attestation "none"). */
export function registreer(pk: NepPasskey, challenge: string, o: Opties = {}) {
  const rpId = o.rpId ?? 'admin.tarasevych.com';
  const cdj = Buffer.from(JSON.stringify({ type: o.type ?? 'webauthn.create', challenge, origin: o.origin ?? `https://${rpId}`, crossOrigin: o.crossOrigin ?? false }));
  const vlaggen = (o.up === false ? 0 : 1) | (o.uv === false ? 0 : 4) | 0x40;
  const len = Buffer.alloc(2); len.writeUInt16BE(pk.credentialId.length);
  const authData = Buffer.concat([sha(rpId), Buffer.from([vlaggen]), teller4(pk.teller), Buffer.alloc(16), len, pk.credentialId, pk.cose]);
  const att = cbor(new Map<string, unknown>([['fmt', 'none'], ['attStmt', new Map()], ['authData', authData]]));
  return { credentialId: b64u(pk.credentialId), clientDataJSON: b64u(cdj), attestationObject: b64u(att) };
}

/** Als navigator.credentials.get; teller loopt op tenzij `teller` vast is gegeven. */
export function bevestig(pk: NepPasskey, challenge: string, o: Opties & { teller?: number; credentialId?: Buffer } = {}) {
  const rpId = o.rpId ?? 'admin.tarasevych.com';
  const cdj = Buffer.from(JSON.stringify({ type: o.type ?? 'webauthn.get', challenge, origin: o.origin ?? `https://${rpId}`, crossOrigin: o.crossOrigin ?? false }));
  const vlaggen = (o.up === false ? 0 : 1) | (o.uv === false ? 0 : 4);
  if (o.teller === undefined && pk.teller > 0) pk.teller += 1;
  const authData = Buffer.concat([sha(rpId), Buffer.from([vlaggen]), teller4(o.teller ?? pk.teller)]);
  const data = Buffer.concat([authData, sha(cdj)]);
  const signature = pk.alg === -8 ? sign(null, data, pk.prive) : sign('sha256', data, { key: pk.prive, dsaEncoding: 'der' });
  return { credentialId: b64u(o.credentialId ?? pk.credentialId), clientDataJSON: b64u(cdj), authenticatorData: b64u(authData), signature: b64u(signature) };
}
