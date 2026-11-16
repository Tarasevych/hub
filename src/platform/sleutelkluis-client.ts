// Sleutelkluis in de browser (zonder afhankelijkheden): de PRF-extensie van WebAuthn, HKDF → KEK, en het omslaan/openen van
// de gegevenssleutel (DEK) met WebCrypto. De server ziet de PRF-uitkomst en de KEK NOOIT; hij krijgt alleen de omslag
// ('omslag1.…') bij het koppelen en de geopende DEK (hex, over TLS) bij het ontgrendelen — zie backend/sleutelkluis.ts.
// Vorm en teksten komen uit shared/sleutelkluis.ts, zodat server, browser en test exact hetzelfde rekenen.
import { KEK_INFO, OMSLAG } from '../../shared/sleutelkluis';
import { naarB64u, naarBuf, type AssertieOpties } from './webauthn';

export type PrfAssertieOpties = AssertieOpties & { extensions?: { prf?: { evalByCredential?: Record<string, { first: string; second?: string }>; eval?: { first: string } } } };
const enc = new TextEncoder();
const hex = (b: ArrayBuffer) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, '0')).join('');
const uitHex = (h: string) => new Uint8Array((h.match(/.{2}/g) || []).map((x) => parseInt(x, 16)));

/** Kan deze browser de PRF-extensie? (Chrome/Edge 116+, Safari 18+, Firefox 135+.) Alleen een hint; de echte proef is het antwoord. */
export const kanPrf = () => typeof window !== 'undefined' && !!window.PublicKeyCredential && !!window.crypto?.subtle;

/** KEK uit de PRF-uitkomst: HKDF-SHA256, lege salt, info KEK_INFO — identiek aan kekUitPrf op de server (voor tests). */
export async function kekUitPrf(prf: ArrayBuffer): Promise<CryptoKey> {
  const basis = await crypto.subtle.importKey('raw', prf, 'HKDF', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'HKDF', hash: 'SHA-256', salt: new Uint8Array(0), info: enc.encode(KEK_INFO) }, basis, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}
/** De DEK (hex) omslaan: 'omslag1.<iv>.<ct>.<tag>', AAD van de server. */
export async function omslaan(kek: CryptoKey, dekHex: string, aad: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const uit = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: enc.encode(aad), tagLength: 128 }, kek, uitHex(dekHex)));
  const ct = uit.slice(0, uit.length - 16), tag = uit.slice(uit.length - 16);
  return [OMSLAG, naarB64u(iv.buffer), naarB64u(ct.buffer), naarB64u(tag.buffer)].join('.');
}
/** Een omslag openen → DEK (hex). Gooit bij een verkeerde KEK of AAD. */
export async function omslagOpenen(kek: CryptoKey, envelop: string, aad: string): Promise<string> {
  const [v, iv, ct, tag] = envelop.split('.');
  if (v !== OMSLAG || !iv || !ct || !tag) throw new Error('OMSLAG_ONGELDIG');
  const data = new Uint8Array([...new Uint8Array(naarBuf(ct)), ...new Uint8Array(naarBuf(tag))]);
  return hex(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: naarBuf(iv), additionalData: enc.encode(aad), tagLength: 128 }, kek, data));
}

/** prf2: de PRF met het tweede zout (KLUIS-AANMELDEN: het aanmeldzout), als de server dat vroeg en de passkey het kan. */
export type PrfAssertie = { credentialId: string; clientDataJSON: string; authenticatorData: string; signature: string; prf: ArrayBuffer | null; prf2?: ArrayBuffer | null };
const alsBuf = (v: unknown): ArrayBuffer | null => {
  if (!v) return null;
  if (v instanceof ArrayBuffer) return v;
  const b = v as ArrayBufferView;
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
};
/** navigator.credentials.get MET de PRF-extensie. `prf` is null als de passkey/browser het niet kan — dan de herstelcode. */
export async function passkeyMetPrf(pk: PrfAssertieOpties, signal?: AbortSignal): Promise<PrfAssertie> {
  const eval_ = pk.extensions?.prf?.evalByCredential || {};
  const evalByCredential: Record<string, { first: ArrayBuffer; second?: ArrayBuffer }> = {};
  for (const [id, v] of Object.entries(eval_)) evalByCredential[id] = { first: naarBuf(v.first), ...(v.second ? { second: naarBuf(v.second) } : {}) };
  const cred = await navigator.credentials.get({ ...(signal ? { signal } : {}), publicKey: {
    challenge: naarBuf(pk.challenge), rpId: pk.rpId, timeout: pk.timeout, userVerification: 'required',
    allowCredentials: pk.allowCredentials.map((c) => ({ type: 'public-key' as const, id: naarBuf(c.id), ...(c.transports?.length ? { transports: c.transports as AuthenticatorTransport[] } : {}) })),
    extensions: { prf: { evalByCredential } } as AuthenticationExtensionsClientInputs,
  } }) as PublicKeyCredential | null;
  if (!cred) throw Object.assign(new Error('NotAllowedError'), { name: 'NotAllowedError' });
  const r = cred.response as AuthenticatorAssertionResponse;
  const ext = (cred.getClientExtensionResults() as { prf?: { results?: { first?: ArrayBuffer | BufferSource; second?: ArrayBuffer | BufferSource } } }).prf;
  return { credentialId: naarB64u(cred.rawId), clientDataJSON: naarB64u(r.clientDataJSON), authenticatorData: naarB64u(r.authenticatorData), signature: naarB64u(r.signature), prf: alsBuf(ext?.results?.first), prf2: alsBuf(ext?.results?.second) };
}

/**
 * KLUIS-AANMELDEN: de AANMELDING met een passkey (geen allowCredentials: de browser biedt zelf de passkeys van deze site aan),
 * met PRF op het vaste aanmeldzout (`eval`). `prf` blijft in de browser: daarmee opent hij straks de omslag die de server na de
 * geslaagde aanmelding terugstuurt. null = deze passkey/browser kan geen PRF → de aanmelding werkt gewoon, ontsleutelen via de kaart.
 */
export async function passkeyAanmeldenMetPrf(pk: PrfAssertieOpties, signal?: AbortSignal): Promise<PrfAssertie> {
  const zout = pk.extensions?.prf?.eval?.first;
  const cred = await navigator.credentials.get({ ...(signal ? { signal } : {}), publicKey: {
    challenge: naarBuf(pk.challenge), rpId: pk.rpId, timeout: pk.timeout, userVerification: 'required',
    allowCredentials: (pk.allowCredentials || []).map((c) => ({ type: 'public-key' as const, id: naarBuf(c.id), ...(c.transports?.length ? { transports: c.transports as AuthenticatorTransport[] } : {}) })),
    ...(zout ? { extensions: { prf: { eval: { first: naarBuf(zout) } } } as AuthenticationExtensionsClientInputs } : {}),
  } }) as PublicKeyCredential | null;
  if (!cred) throw Object.assign(new Error('NotAllowedError'), { name: 'NotAllowedError' });
  const r = cred.response as AuthenticatorAssertionResponse;
  const ext = (cred.getClientExtensionResults() as { prf?: { results?: { first?: ArrayBuffer | BufferSource } } }).prf;
  return { credentialId: naarB64u(cred.rawId), clientDataJSON: naarB64u(r.clientDataJSON), authenticatorData: naarB64u(r.authenticatorData), signature: naarB64u(r.signature), prf: alsBuf(ext?.results?.first) };
}

/** KLUIS-AANMELDEN: de DEK ook omslaan onder de aanmeld-PRF (als de passkey die gaf). Leeg als dat niet kan — nooit een fout. */
export async function aanmeldOmslag(prf2: ArrayBuffer | null | undefined, dekHex: string, aad: string | undefined): Promise<string> {
  if (!prf2 || !aad || !/^[0-9a-f]{64}$/i.test(dekHex)) return '';
  try {
    const kek = await kekUitPrf(prf2);
    const envelop = await omslaan(kek, dekHex, aad);
    return (await omslagOpenen(kek, envelop, aad)) === dekHex.toLowerCase() ? envelop : ''; // zelfproef
  } catch { return ''; }
}
