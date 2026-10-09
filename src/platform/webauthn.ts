// WebAuthn in de browser (zonder afhankelijkheden): opties van de server (base64url) omzetten naar ArrayBuffers en het
// antwoord terug naar base64url. Alle controles gebeuren op de server (en voor updates nog eens door root).
export type AssertieOpties = { challenge: string; rpId: string; timeout: number; userVerification?: string; allowCredentials: Array<{ type: string; id: string; transports?: string[] }> };
export type RegistratieOpties = {
  challenge: string; rp: { id: string; name: string }; user: { id: string; name: string; displayName: string };
  pubKeyCredParams: Array<{ type: string; alg: number }>; timeout: number; attestation?: string;
  authenticatorSelection?: Record<string, unknown>; excludeCredentials?: Array<{ type: string; id: string; transports?: string[] }>;
};

export const naarBuf = (s: string) => {
  const b = atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4));
  const u = new Uint8Array(b.length);
  for (let i = 0; i < b.length; i++) u[i] = b.charCodeAt(i);
  return u.buffer;
};
export const naarB64u = (buf: ArrayBuffer | null | undefined) => {
  if (!buf) return '';
  const u = new Uint8Array(buf);
  let s = '';
  for (let i = 0; i < u.length; i++) s += String.fromCharCode(u[i]);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};
export const kanPasskey = () => typeof window !== 'undefined' && !!window.PublicKeyCredential && !!navigator.credentials;

/** Foutcode van de API (error/reasonCode) of de naam van een DOMException (NotAllowedError, InvalidStateError…). */
export const foutCode = (caught: unknown) => {
  const v = caught as { response?: { data?: { error?: unknown; reasonCode?: unknown } }; message?: unknown; name?: unknown };
  const api = v?.response?.data?.error || v?.response?.data?.reasonCode;
  if (api) return String(api);
  if (typeof DOMException !== 'undefined' && caught instanceof DOMException) return String(caught.name);
  if (v?.name === 'NotAllowedError') return 'NotAllowedError';
  return String(v?.message || '');
};
const geweigerd = () => Object.assign(new Error('NotAllowedError'), { name: 'NotAllowedError' });
const sleutels = (lijst: Array<{ id: string; transports?: string[] }> = []) =>
  lijst.map((c) => ({ type: 'public-key' as const, id: naarBuf(c.id), ...(c.transports?.length ? { transports: c.transports as AuthenticatorTransport[] } : {}) }));

/** navigator.credentials.get → assertie in base64url. */
export async function passkeyBevestigen(pk: AssertieOpties) {
  const cred = await navigator.credentials.get({ publicKey: { challenge: naarBuf(pk.challenge), rpId: pk.rpId, timeout: pk.timeout, userVerification: 'required', allowCredentials: sleutels(pk.allowCredentials) } }) as PublicKeyCredential | null;
  if (!cred) throw geweigerd();
  const r = cred.response as AuthenticatorAssertionResponse;
  return { credentialId: naarB64u(cred.rawId), clientDataJSON: naarB64u(r.clientDataJSON), authenticatorData: naarB64u(r.authenticatorData), signature: naarB64u(r.signature) };
}

/** navigator.credentials.create → registratie in base64url (attestation 'none'; de server controleert rpId, origin, UV). */
export async function passkeyAanmaken(pk: RegistratieOpties) {
  const cred = await navigator.credentials.create({ publicKey: {
    ...pk, challenge: naarBuf(pk.challenge), user: { ...pk.user, id: naarBuf(pk.user.id) },
    pubKeyCredParams: pk.pubKeyCredParams.map((p) => ({ type: 'public-key' as const, alg: p.alg })),
    excludeCredentials: sleutels(pk.excludeCredentials),
  } as PublicKeyCredentialCreationOptions }) as PublicKeyCredential | null;
  if (!cred) throw geweigerd();
  const r = cred.response as AuthenticatorAttestationResponse;
  const transports = typeof r.getTransports === 'function' ? r.getTransports() : [];
  return { credentialId: naarB64u(cred.rawId), clientDataJSON: naarB64u(r.clientDataJSON), attestationObject: naarB64u(r.attestationObject), transports };
}
