// Browserbinding voor OAuth-koppelstromen (Google Suite extra mailboxen/Drive en vNext externe aanmeldmethoden),
// tegen account-linking-CSRF en grant-hijacking over browsers heen.
//
// Bij het starten van de koppelstroom zet de server per eenmalige state een eigen HttpOnly-cookie
// `__Secure-tsv_<voorvoegsel>_binding_<16 hex van stateHash>` (Domain=.tarasevych.com, SameSite=Lax, Max-Age=900).
// In de state-rij wordt alleen SHA-256("tsv-koppel-binding-v1|voorvoegsel|stateHash|ownerUserId|waarde") bewaard.
// De publieke callback accepteert de state uitsluitend als dezelfde browser deze cookie meestuurt (tijdconstant)
// en wist de cookie direct bij afronding.
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { COOKIE_SCOPE } from './deployment-identity';
import { metBindingCookie } from './overdracht-binding';

export { metBindingCookie };

const MAX_AGE_S = 15 * 60;
const FORMAAT = /^[A-Za-z0-9_-]{43}$/;
const HASH = /^[a-f0-9]{64}$/;
const VOORVOEGSEL = /^[a-z][a-z0-9]{1,15}$/;

const sha = (value: string): string => createHash('sha256').update(value).digest('hex');
const bindingVan = (voorvoegsel: string, stateHash: string, ownerUserId: string, waarde: string): string =>
  sha(`tsv-koppel-binding-v1|${voorvoegsel}|${stateHash}|${ownerUserId}|${waarde}`);

export function koppelBindingCookieNaam(voorvoegsel: string, stateHash: unknown): string {
  const h = String(stateHash || '');
  if (!VOORVOEGSEL.test(voorvoegsel) || !HASH.test(h)) throw new Error('KOPPEL_BINDING_ONGELDIG');
  return `__Secure-tsv_${voorvoegsel}_binding_${h.slice(0, 16)}`;
}

function cookieWaarde(event: Record<string, unknown> | null | undefined, naam: string): string {
  const headers = ((event && typeof event === 'object' ? event.headers : null) || {}) as Record<string, unknown>;
  const raw = String(headers.cookie || headers.Cookie || '');
  for (const part of raw.split(';')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    if (part.slice(0, i).trim() === naam) {
      const waarde = part.slice(i + 1).trim();
      return FORMAAT.test(waarde) ? waarde : '';
    }
  }
  return '';
}

const zetCookie = (naam: string, waarde: string, maxAge: number): string =>
  `${naam}=${waarde}; ${COOKIE_SCOPE}; Max-Age=${maxAge}; HttpOnly; Secure; SameSite=Lax`;

export function koppelBindingVoorAanmaken(voorvoegsel: string, stateHash: string, ownerUserId: string): {
  bindingHash: string;
  setCookie: string;
  cookieNaam: string;
} {
  const cookieNaam = koppelBindingCookieNaam(voorvoegsel, stateHash);
  if (!ownerUserId) throw new Error('KOPPEL_BINDING_GEBRUIKER_ONTBREEKT');
  const waarde = randomBytes(32).toString('base64url');
  return {
    bindingHash: bindingVan(voorvoegsel, stateHash, ownerUserId, waarde),
    setCookie: zetCookie(cookieNaam, waarde, MAX_AGE_S),
    cookieNaam,
  };
}

export function koppelBindingKlopt(
  event: Record<string, unknown> | null | undefined,
  voorvoegsel: string,
  stateHash: unknown,
  ownerUserId: unknown,
  verwachtHash: unknown,
): boolean {
  const h = String(stateHash || '');
  const uid = String(ownerUserId || '');
  const verwacht = String(verwachtHash || '');
  if (!VOORVOEGSEL.test(voorvoegsel) || !HASH.test(h) || !uid || !HASH.test(verwacht)) return false;
  const waarde = cookieWaarde(event, koppelBindingCookieNaam(voorvoegsel, h));
  if (!waarde) return false;
  const a = Buffer.from(bindingVan(voorvoegsel, h, uid, waarde), 'utf8');
  const b = Buffer.from(verwacht, 'utf8');
  return a.length === b.length && timingSafeEqual(a, b);
}

export function koppelBindingWissen(voorvoegsel: string, stateHash: unknown): string {
  return zetCookie(koppelBindingCookieNaam(voorvoegsel, stateHash), '', 0);
}
