// SEC-002 (ai-mcp-14): het toestemmingsverzoek van de MCP-connector is gebonden aan de BROWSER die de autorisatie begon.
//
// Vroeger kon iedereen een autorisatie starten met zijn EIGEN PKCE-verifier (dus ook een aanvaller), de link /agents?consent=<id>
// naar een slachtoffer sturen («bevestig even Claude») en — als het slachtoffer «Дозволити» drukte — de code op een terugkeeradres
// ontvangen dat hij beheert (bijvoorbeeld via een open redirect bij een van de toegestane AI-domeinen). PKCE hielp niet: de verifier
// zat bij hem. Nu zet /oauth2/authorize in de browser die de autorisatie begint een cookie (alleen dit host, HttpOnly, Secure,
// SameSite=Lax, 10 minuten) met een willekeurig geheim; in app.mcp_oauth_auth staat alleen de SHA-256 ervan (migratie 0262). Het
// venster «Дозволити» (consent/info en consent) werkt alleen in een browser met datzelfde cookie — de link alleen is niets waard.
// Zelfde idee als de bindingscookie van het aanmelden op de site (backend/aanmeld-binding.ts).
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

export const BINDING_PREFIX = '__Host-mr_mcpb_';
export const BINDING_MAX_AGE_S = 10 * 60;
const WAARDE = /^[A-Za-z0-9_-]{43}$/;
const sha = (v: string) => createHash('sha256').update(v).digest('hex');

/** Cookienaam per verzoek (zodat twee gelijktijdige koppelingen in één browser elkaar niet overschrijven). */
export const bindingCookieNaam = (rid: string) => `${BINDING_PREFIX}${sha(`mcp-consent|${rid}`).slice(0, 16)}`;

/** Nieuwe binding voor verzoek `rid`: de hash voor de database en de Set-Cookie voor het antwoord van /oauth2/authorize. */
export function nieuweBinding(rid: string): { hash: string; setCookie: string } {
  const waarde = randomBytes(32).toString('base64url');
  return { hash: sha(waarde), setCookie: `${bindingCookieNaam(rid)}=${waarde}; Path=/; Max-Age=${BINDING_MAX_AGE_S}; HttpOnly; Secure; SameSite=Lax` };
}

/** De waarde van het bindingscookie voor `rid` uit een Cookie-kop ('' als het er niet is of geen geldige vorm heeft). */
export function bindingUitCookie(rid: string, cookieKop: unknown): string {
  const naam = bindingCookieNaam(rid);
  for (const deel of String(cookieKop || '').split(';')) {
    const i = deel.indexOf('=');
    if (i < 0 || deel.slice(0, i).trim() !== naam) continue;
    const w = deel.slice(i + 1).trim();
    return WAARDE.test(w) ? w : '';
  }
  return '';
}

/**
 * Hoort deze browser bij het verzoek? `opgeslagen` = binding_hash van het verzoek; NULL = verzoek van vóór de binding (leeft hoogstens
 * 10 minuten na de uitrol): dan geldt de oude regel. Tijdconstante vergelijking.
 */
export function bindingKlopt(rid: string, opgeslagen: string | null | undefined, cookieKop: unknown): boolean {
  if (!opgeslagen) return true;
  const w = bindingUitCookie(rid, cookieKop);
  if (!w) return false;
  const a = Buffer.from(sha(w)), b = Buffer.from(String(opgeslagen));
  return a.length === b.length && timingSafeEqual(a, b);
}
