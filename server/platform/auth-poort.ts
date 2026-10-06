// Centrale toegangspoort (beveiliging fase 2).
//
// 1) requireAuth({ service, status, perm }): middleware die een geldige sessie eist (via de sessiecontrole die
//    backend/index.ts registreert), optioneel status 'approved' en een recht uit backend/rbac.ts. Zet ctx.user.
// 2) PUBLIEKE_ROUTES: expliciete allowlist van routes die zonder sessie mogen slagen, met reden.
// 3) Vangnet in de router (poortNaVerzoek): een route buiten de allowlist die een verzoek ZONDER gecontroleerde
//    referentie toch met 2xx beantwoordt, is een vergeten controle. Audit-fix 8: "gecontroleerd" = in dit verzoek
//    heeft een sessiecontrole zetGebruiker()/sessieGeverifieerd() aangeroepen (of een API-token is geldig bevonden);
//    alleen een Cookie- of Authorization-kop meesturen telt niet meer.
//    Standaard wordt dat gemeld ([auth-poort] + app.rls_audit, actie 'anoniem-2xx'); met AUTH_POORT_AFDWINGEN=1
//    wordt het antwoord vervangen door 401. tests/eenheid/routes.test.ts faalt op elke zulke route.
import type { LambdaEvent, RouterContext, RouterMiddleware, RouterResponse } from './router';
import { error } from './router';
import { isSessieGeverifieerd, sessieGeverifieerd } from './context';

/** Routes die zonder sessie mogen slagen (patroon zoals in de routetabel) → reden. */
export const PUBLIEKE_ROUTES: Readonly<Record<string, string>> = {
  'GET /api/_healthcheck': 'gezondheidscontrole',
  // Exacte paden (geen prefix): server/start.ts stuurt alleen precies /privacy en /terms naar de router.
  'GET /privacy': 'privacybeleid (statische HTML, Google OAuth-merkverificatie)',
  'GET /terms': 'gebruiksvoorwaarden (statische HTML)',
  'GET /api/auth/methods': 'welke aanmeldmethoden bestaan (aanmeldscherm)',
  'GET /api/owner/system/manifest': 'release- en menumanifest voor de frontend, geen accountgegevens',
  'POST /api/owner/access/catalog': 'lijst aanmeldmethoden (aanmeldscherm)',
  'POST /api/owner/access/password/login': 'aanmelden met wachtwoord (referentie in de body)',
  'POST /api/owner/auth/password/login': 'aanmelden met wachtwoord (referentie in de body)',
  'GET /api/owner/auth/google/callback': 'OAuth-terugkeer van Google (state + bindingscookie)',
  'POST /api/owner/auth/google/callback': 'OAuth-terugkeer van Google (state + bindingscookie)',
  'POST /api/owner/google-suite/callback': 'OAuth-terugkeer Google Suite (state)',
  'POST /api/owner/identity/transactions/create': 'aanmeldtransactie starten (vóór de sessie)',
  'POST /api/owner/identity/transactions/status': 'aanmeldtransactie volgen (transactie-id + binding)',
  'POST /api/owner/identity/transactions/redeem': 'aanmeldtransactie inwisselen (binding)',
  'POST /api/owner/identity/transactions/attach': 'aanmeldtransactie koppelen (binding)',
  'POST /api/owner/identity/transactions/cancel': 'aanmeldtransactie annuleren (idempotent)',
  'POST /api/owner/identity/transactions/complete-remembered': 'onthouden account voltooien (binding)',
  'POST /api/owner/session/handoff/redeem': 'handoff-code inwisselen (code + bindingscookie)',
  'POST /api/owner/session/logout-current': 'afmelden is altijd toegestaan (idempotent)',
  'POST /api/owner/session/logout-browser-all': 'alles in deze browser afmelden (idempotent; zonder sessie: niets te doen)',
  'POST /api/owner/session/bootstrap': 'sessiestatus; zonder sessie alleen {state:signed_out}',
  'POST /api/owner/session/accounts': 'accountkiezer van deze browser; zonder sessie lege lijst',
  'POST /api/owner/browser/accounts': 'accountkiezer van deze browser; zonder sessie lege lijst',
  'POST /api/owner/agents/pair': 'agent wisselt een eenmalige koppelcode (10 min, gehasht, één gebruiker) in voor een eigen token',
  'POST /api/owner/mail/microsoft/webhook': 'Microsoft Graph-webhook (clientState-controle)',
  'POST /api/owner/mail/google/pubsub/push': 'Google Pub/Sub-push (OIDC-token in Authorization)',
  'POST /api/owner/access/webauthn/options': 'passkey-opties (uitgeschakeld: 503)',
  'POST /api/owner/access/webauthn/register': 'passkey registreren (uitgeschakeld: 503)',
};
export const isPubliek = (patroon: string): boolean => Object.prototype.hasOwnProperty.call(PUBLIEKE_ROUTES, patroon);

const kop = (event: LambdaEvent, naam: string): string => {
  const h = event?.headers || {};
  for (const [k, v] of Object.entries(h)) if (k.toLowerCase() === naam) return String(v ?? '');
  return '';
};
/** Stuurt het verzoek een cookie of Authorization mee? (alleen informatief; het vangnet kijkt naar isSessieGeverifieerd) */
export const heeftReferenties = (event: LambdaEvent): boolean => Boolean(kop(event, 'cookie').trim() || kop(event, 'authorization').trim());

export const poortAfdwingen = (): boolean => process.env.AUTH_POORT_AFDWINGEN === '1';
const gemeld = new Set<string>();
let melder: ((patroon: string) => void) | null = null;
/** Registreer waar meldingen heen gaan (rls-audit-tabel); los zodat router.ts geen DB nodig heeft. */
export function registreerPoortMelder(fn: (patroon: string) => void): void { melder = fn; }

/** Vangnet na de routeketen (zie kop). Geeft het (eventueel vervangen) antwoord terug. */
export function poortNaVerzoek(patroon: string, event: LambdaEvent, antwoord: RouterResponse): RouterResponse {
  if (antwoord.statusCode < 200 || antwoord.statusCode >= 300 || isPubliek(patroon) || isSessieGeverifieerd()) return antwoord;
  if (!gemeld.has(patroon)) {
    gemeld.add(patroon);
    console.warn(`[auth-poort] anoniem verzoek kreeg ${antwoord.statusCode}: ${patroon} (niet in PUBLIEKE_ROUTES)${poortAfdwingen() ? ' → 401' : ''}`);
  }
  try { melder?.(patroon); } catch { /* melden mag nooit het verzoek breken */ }
  return poortAfdwingen() ? error('AUTH_REQUIRED', 401) : antwoord;
}

// ---- requireAuth ----
export type PoortGebruiker = { id: string; email?: string; role?: string; status?: string; accessLevel?: string; entitlements?: unknown };
export type SessieControle = (event: LambdaEvent, body: unknown, service?: string) => Promise<{ user: PoortGebruiker; service?: string } | { errorCode: string; status?: number }>;
export type RechtControle = (user: PoortGebruiker, perm: string) => boolean;
let sessieControle: SessieControle | null = null;
let rechtControle: RechtControle | null = null;
/** backend/index.ts registreert hier zijn sessiecontrole (ownerRequireSession) en rbac `can`. */
export function registreerSessieControle(fn: SessieControle, recht?: RechtControle): void { sessieControle = fn; if (recht) rechtControle = recht; }

export type RequireAuthOpties = { service?: string; status?: 'approved'; perm?: string };
export function requireAuth(opties: RequireAuthOpties = {}): RouterMiddleware {
  return async (ctx: RouterContext) => {
    if (!sessieControle) return error('AUTH_NOT_CONFIGURED', 503);
    const body = opties.service && ctx.body && typeof ctx.body === 'object' && !(ctx.body as Record<string, unknown>).service
      ? { ...(ctx.body as Record<string, unknown>), service: opties.service } : ctx.body;
    const uitkomst = await sessieControle(ctx.event, body, opties.service);
    if ('errorCode' in uitkomst) return error(uitkomst.errorCode || 'AUTH_REQUIRED', uitkomst.status || 401);
    const user = uitkomst.user;
    if (opties.service && uitkomst.service && uitkomst.service !== opties.service) return error('AUTH_SERVICE_MISMATCH', 403);
    if (opties.status === 'approved' && user.status !== 'approved') return error('AUTH_APPROVAL_REQUIRED', 403);
    if (opties.perm && !(rechtControle?.(user, opties.perm) ?? false)) return error('AUTH_PERMISSION_REQUIRED', 403);
    sessieGeverifieerd();
    ctx.user = { userId: user.id, email: user.email, scope: uitkomst.service || opties.service || '' };
    (ctx as RouterContext & { auth?: unknown }).auth = uitkomst;
    return undefined;
  };
}
