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
import { schakelaarAan } from './schakelaars';
import { tel } from './antwoord-teller';

/** Routes die zonder sessie mogen slagen (patroon zoals in de routetabel) → reden. */
export const PUBLIEKE_ROUTES: Readonly<Record<string, string>> = {
  'GET /api/_healthcheck': 'gezondheidscontrole',
  'GET /api/version': 'welke release nu draait (versie, commit, auteur, agent, samenvatting) — openbaar voor transparantie',
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
  'POST /api/owner/google-suite/callback': 'OAuth-terugkeer Google Suite (state + browserbindingscookie)',
  'GET /api/aanmeld/koppel/:aanbieder/terug': 'OAuth-terugkeer externe aanmeldmethode (eenmalige state + browserbindingscookie)',
  // TELEGRAM-AANMELDEN v1 (achter vlag telegram-aanmelden-v1): zelfde lijst als TELEGRAM_PUBLIEKE_ROUTES in backend/telegram-aanmelden/routes.ts.
  'GET /api/aanmelden/telegram/config': 'Telegram-knop op het aanmeldscherm: zichtbaar ja/nee, botnaam, stand (geen geheimen)',
  'POST /api/aanmelden/telegram/start': 'Telegram-aanmelding starten (vóór de sessie; transactie + bindingscookie)',
  'POST /api/aanmelden/telegram/status': 'Telegram-aanmelding volgen (id + geheim van deze browser)',
  'POST /api/aanmelden/telegram/code': 'geheime code bij Telegram-aanmelding (id + geheim; tellers en pauzes)',
  'POST /api/aanmelden/telegram/voltooien': 'Telegram-aanmelding inwisselen (id + geheim + bindingscookie, eenmalig)',
  'GET /api/aanmelden/telegram/widget': 'mini-pagina met het officiële aanmeldvenster van Telegram (eigen smalle CSP)',
  'GET /api/aanmelden/telegram/widget-terug': 'terugkeer uit het aanmeldvenster van Telegram (HMAC-handtekening, 5 min, eenmalig)',
  'POST /api/telegram/webhook': 'terugroepadres voor Telegram (geheime kop X-Telegram-Bot-Api-Secret-Token)',
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
  // MCP-connector voor Claude: Claude (cloud van Anthropic) heeft geen sessie; elk eindpunt controleert zelf
  // (OAuth-client + PKCE + eenmalige code, of Bearer-token bij /rpc). Zie backend/mcp-connector.ts.
  'GET /api/mcp-connector/prm': 'OAuth protected resource metadata (RFC 9728), openbaar',
  'GET /api/mcp-connector/asm': 'OAuth authorization server metadata (RFC 8414), openbaar',
  'POST /api/mcp-connector/register': 'dynamische clientregistratie (RFC 7591); alleen de callback van Claude is toegestaan',
  'GET /api/mcp-connector/authorize': 'autorisatieverzoek van Claude; redirect naar het toestemmingsscherm, geeft zelf geen toegang',
  'POST /api/mcp-connector/token': 'tokenuitgifte: eenmalige code + PKCE-verifier, of roterend refresh-token',
  'POST /api/mcp-connector/revoke': 'token intrekken (RFC 7009); alleen met een bestaande client_id, antwoordt altijd 200',
  'POST /api/mcp-connector/rpc':'MCP-eindpunt: Bearer-token (OAuth) verplicht, anders 401 met WWW-Authenticate',
  'GET /api/mcp-connector/rpc': 'MCP-eindpunt: altijd 405 buiten SSE event-stream',
  'DELETE /api/mcp-connector/rpc': 'MCP-eindpunt: sessie/SSE-stroom sluiten (Bearer-token verplicht, anders 401)',
  'OPTIONS /api/mcp-connector/rpc': 'MCP-eindpunt: CORS-preflight (204, geen gegevens)',
  // Connector v2 (backend/connector-v2.ts): eigen adres per AI-agent; zelfde OAuth, token gebonden aan het pad.
  'POST /api/connector-v2/:agent/rpc': 'MCP-eindpunt per agent (v2): Bearer-token van DEZE agent verplicht, anders 401 met WWW-Authenticate',
  'GET /api/connector-v2/:agent/rpc': 'MCP-eindpunt per agent: altijd 405 buiten SSE event-stream',
  'DELETE /api/connector-v2/:agent/rpc': 'MCP-eindpunt per agent: sessie/SSE-stroom sluiten (Bearer-token verplicht, anders 401)',
  'OPTIONS /api/connector-v2/:agent/rpc': 'MCP-eindpunt per agent: CORS-preflight (204, geen gegevens)',
  'GET /api/connector-v2/:agent/prm': 'OAuth protected resource metadata per agent (RFC 9728), openbaar',
  'POST /api/mcp/deur/token-check': 'intern: alleen de MCP-deur op loopback met haar sleutel (mcp-state/intern.sleutel), anders 404; antwoordt alleen ok/id/naam van een agenttoken van de eigenaar',
  'POST /api/owner/agents/pair':'agent wisselt een eenmalige koppelcode (5 min, gehasht, één gebruiker) in voor een eigen token',
  'GET /api/owner/agents/self':'zelfde als POST: de browserextensie vraagt met haar eigen token (Authorization-header, leesactie) wat de gebruiker heeft aangezet',
  'POST /api/owner/agents/self':'browserextensie vraagt met haar eigen token (alleen hash-opzoeking) wat de gebruiker heeft aangezet; geen persoonsgegevens',
  'GET /api/owner/agents/ws-ticket':'agent ruilt zijn token (Authorization-header, hash-opzoeking) voor een eenmalig WebSocket-ticket van 60 s; geen persoonsgegevens',
  'POST /api/owner/agents/overdracht':'agent haalt met zijn eigen token (Authorization-header) eenmaal de inhoud van een ticket op dat voor hem gemaakt is (uitrol van een app, geheim van de eigenaar); geen sessie',
  'POST /api/owner/agents/ontgrendeling/intrekken-extensie':'browserextensie trekt met haar eigen token (Authorization-header, hash-opzoeking) haar eigen ontgrendeling in als de WebSocket dicht is; kan alleen vergrendelen, nooit iets openen',
  'POST /api/owner/agents/extensie/chat':'zijpaneel van de extensie 0.7.0: chat met alleen browserhulpmiddelen, met haar eigen agenttoken (Authorization-header, hash-opzoeking) en alleen zolang het slot een lopende ontgrendeling heeft; geen sessie (backend/extensie-zijpaneel.ts)',
  'POST /api/owner/agents/diagnostics/archive':'browserextensie levert met haar eigen token (Authorization-header) een diagnosebuffer aan; versleuteld per gebruiker opgeslagen, 90 dagen',
  'POST /api/owner/mail/microsoft/webhook': 'Microsoft Graph-webhook (clientState-controle)',
  'POST /api/owner/mail/google/pubsub/push': 'Google Pub/Sub-push (OIDC-token in Authorization)',
  // Toegangscodes voor anderen (§13.11): inwisselen heeft (nog) geen sessie; de code zelf is de referentie (alleen hash-opzoeking,
  // strikt per IP begrensd + blokkade). Uitloggen is idempotent. De overige /api/gast/*-routes eisen de gastcookie.
  'POST /api/gast/inwisselen': 'toegangscode inwisselen voor een beperkte gastsessie (code in de body, gehasht opgezocht)',
  'POST /api/gast/uitloggen': 'gastsessie beëindigen (idempotent; zonder sessie niets te doen)',
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

// 0066: AUTH_POORT_AFDWINGEN=1/0 forceert; anders de schakelaar van de eigenaar (/diagnostiek → «Захист», zonder herstart).
export const poortAfdwingen = (): boolean => schakelaarAan('auth-poort');
const gemeld = new Set<string>();
let melder: ((patroon: string) => void) | null = null;
/** Registreer waar meldingen heen gaan (rls-audit-tabel); los zodat router.ts geen DB nodig heeft. */
export function registreerPoortMelder(fn: (patroon: string) => void): void { melder = fn; }
/** Loopt de schaduw (meldingen naar app.rls_audit)? Voor de gereedheidscontrole. */
export const poortMelderActief = (): boolean => melder !== null;

/** Vangnet na de routeketen (zie kop). Geeft het (eventueel vervangen) antwoord terug. */
export function poortNaVerzoek(patroon: string, event: LambdaEvent, antwoord: RouterResponse): RouterResponse {
  if (antwoord.statusCode < 200 || antwoord.statusCode >= 300 || isPubliek(patroon) || isSessieGeverifieerd()) return antwoord;
  if (!gemeld.has(patroon)) {
    gemeld.add(patroon);
    console.warn(`[auth-poort] anoniem verzoek kreeg ${antwoord.statusCode}: ${patroon} (niet in PUBLIEKE_ROUTES)${poortAfdwingen() ? ' → 401' : ''}`);
  }
  try { melder?.(patroon); } catch { /* melden mag nooit het verzoek breken */ }
  if (!poortAfdwingen()) return antwoord;
  tel('poort401'); // zekering: piek in 401 van het vangnet na het aanzetten → automatisch uit
  return error('AUTH_REQUIRED', 401);
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
