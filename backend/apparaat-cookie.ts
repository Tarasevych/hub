// SEC-002 / integraties-04 + aanmelden-05 (12.11.2026) — WELKE BROWSER IS «BEKEND»?
//
// Vroeger was een apparaat «bekend» als het grove label «Browser/Systeem» uit de User-Agent (bijv. «Chrome/Windows») al eens
// bij het account was aangemeld (sha256(account + label) in app.bekende_apparaten). Dat label kiest de aanvaller zelf: met de
// User-Agent van het slachtoffer verdween (1) de eis «op een nieuw apparaat is Telegram niet genoeg, ook een toegangssleutel»
// bij aanmelden met Telegram, (2) de kaart «новий пристрій» in de bot en (3) de melding «Новий вхід на новому пристрої» na een
// aanmelding met Google. En «Це не я» blokkeerde dat label — dus ook de eigen browser van het slachtoffer.
//
// Nu: na een GESLAAGDE aanmelding krijgt de browser een eigen, willekeurige cookie `__Secure-tsv_apparaat` (32 bytes,
// HttpOnly, Secure, SameSite=Lax, Domain=.tarasevych.com, ~400 dagen). Alleen de sha256 van die waarde gaat de server in;
// «bekend» betekent: déze browser (met déze cookie) meldde zich al eens bij dit account aan. Zonder cookie is elke browser
// nieuw. Het label blijft alleen als tekst voor de mens.
import { createHash, randomBytes } from 'node:crypto';
import { COOKIE_SCOPE } from './deployment-identiteit';

export const APPARAAT_COOKIE = '__Secure-tsv_apparaat';
/** Zo lang onthoudt een browser dat hij «bekend» is (de grens van moderne browsers voor een cookie: 400 dagen). */
export const APPARAAT_COOKIE_MAX_AGE_S = 400 * 24 * 60 * 60;
const FORMAAT = /^[A-Za-z0-9_-]{43}$/;
const HASH = /^[a-f0-9]{64}$/;

type Verzoek = { headers?: Record<string, unknown> } | Record<string, unknown>;
type Apparaat = { waarde: string; hash: string; nieuw: boolean };
/** Per verzoek (het event-object van de router) dezelfde waarde: de melding na de aanmelding en de cookie in het antwoord
 *  moeten over DEZELFDE browsercookie gaan. */
const perVerzoek = new WeakMap<object, Apparaat>();

const sha = (v: string) => createHash('sha256').update(`tsv-apparaat-v1|${v}`).digest('hex');

/** De waarde van de apparaatcookie die deze browser meestuurt ('' als die ontbreekt of niet de juiste vorm heeft). */
export function apparaatCookieWaarde(event: Verzoek | null | undefined): string {
  const headers = ((event as { headers?: Record<string, unknown> } | null)?.headers || {}) as Record<string, unknown>;
  const ruw = String(headers.cookie || headers.Cookie || '');
  for (const deel of ruw.split(';')) {
    const i = deel.indexOf('=');
    if (i < 0 || deel.slice(0, i).trim() !== APPARAAT_COOKIE) continue;
    const waarde = deel.slice(i + 1).trim();
    if (FORMAAT.test(waarde)) return waarde;
  }
  return '';
}

/** Alleen lezen (bijv. bij het starten van een Telegram-aanmelding): de hash van de apparaatcookie, of '' (= nieuwe browser). */
export function apparaatCookieHash(event: Verzoek | null | undefined): string {
  const w = apparaatCookieWaarde(event);
  return w ? sha(w) : '';
}

/**
 * Bij een geslaagde aanmelding: de hash van de apparaatcookie van deze browser; heeft hij er nog geen, dan een NIEUWE waarde
 * (die `metApparaatCookie` in het antwoord zet). Binnen één verzoek altijd dezelfde uitkomst.
 */
export function apparaatVoorAanmelding(event: Verzoek): Apparaat {
  const sleutel = event as object;
  const al = perVerzoek.get(sleutel);
  if (al) return al;
  const bestaand = apparaatCookieWaarde(event);
  const waarde = bestaand || randomBytes(32).toString('base64url');
  const a = { waarde, hash: sha(waarde), nieuw: !bestaand };
  perVerzoek.set(sleutel, a);
  return a;
}

/** Is dit de vorm van een hash van een apparaatcookie (zoals apparaatCookieHash die geeft)? */
export const isApparaatHash = (v: unknown): v is string => typeof v === 'string' && HASH.test(v);

export const apparaatCookieKop = (waarde: string) => `${APPARAAT_COOKIE}=${waarde}; ${COOKIE_SCOPE}; Max-Age=${APPARAAT_COOKIE_MAX_AGE_S}; HttpOnly; Secure; SameSite=Lax`;

/** Voegt de apparaatcookie toe aan het antwoord als er in dit verzoek een aanmelding slaagde (apparaatVoorAanmelding werd
 *  gevraagd). Een bestaande cookie wordt ververst (looptijd opnieuw), een nieuwe gezet. Bestaande Set-Cookie blijft staan. */
export function metApparaatCookie<T>(event: Verzoek, antwoord: T): T {
  const a = perVerzoek.get(event as object);
  if (!a || !antwoord || typeof antwoord !== 'object') return antwoord;
  const r = antwoord as unknown as { statusCode?: number; headers?: Record<string, string> };
  if (Number(r.statusCode || 200) >= 400) return antwoord;
  const headers = { ...(r.headers || {}) };
  const bestaand = Object.keys(headers).find((k) => k.toLowerCase() === 'set-cookie');
  const kop = apparaatCookieKop(a.waarde);
  if (bestaand) headers[bestaand] = `${headers[bestaand]}, ${kop}`;
  else headers['Set-Cookie'] = kop;
  return { ...(antwoord as object), headers } as T;
}

/** Omhulsel om de hoofd-handler (backend/index.ts): na elk verzoek waarin een aanmelding slaagde, de apparaatcookie meegeven.
 *  Eigenschappen van de handler (zoals `patronen`) blijven behouden. */
export function apparaatCookieNaAanmelding<H extends (event: never) => Promise<unknown>>(handler: H): H {
  const omhuld = async (event: never) => metApparaatCookie(event as unknown as Verzoek, await handler(event));
  return Object.assign(omhuld, handler) as unknown as H;
}
